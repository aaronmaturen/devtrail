import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../db/prisma';
import { getAnthropicApiKey, getConfiguredModelId } from '@/lib/ai/config';
import { getAIContext } from '@/lib/config/user-context';
import { endOfMonth, format, startOfMonth, isBefore } from 'date-fns';

/**
 * Worker for generating AI-powered monthly insights
 * Analyzes a month's activity and generates strengths, weaknesses, tags, and summary
 */

export interface MonthlyInsightJobConfig {
  month: string; // Format: "YYYY-MM"
  force?: boolean; // Force regeneration even if insight exists
}

interface MonthMetrics {
  totalPrs: number;
  totalChanges: number;
  additions: number;
  deletions: number;
  componentsCount: number;
  topComponents: Array<{ name: string; prCount: number; changes: number }>;
  categories: Record<string, number>; // category -> count
  prTitles: string[];
  latestPrDate: Date | null;
}

interface ParsedInsight {
  strengths: string[];
  weaknesses: string[];
  tags: string[];
  summary: string;
}

interface ActiveGoal {
  title: string;
  description: string;
  category: string;
  progressPercent: number;
  targetDate: Date;
  milestones: Array<{
    title: string;
    status: string;
  }>;
}

interface Criterion {
  id: number;
  areaOfConcentration: string;
  subarea: string;
  description: string;
}

interface ManagerFeedback {
  year: string | null;
  growthAreas: string[];
  strengths: string[];
}

interface DeveloperContext {
  userContext: string | null;
  companyFramework: string | null;
  activeGoals: ActiveGoal[];
  criteria: Criterion[];
  managerFeedback: ManagerFeedback | null;
}

/**
 * Fetch active goals with their milestones
 */
async function getActiveGoals(): Promise<ActiveGoal[]> {
  const goals = await prisma.goal.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      milestones: {
        select: {
          title: true,
          status: true,
        },
        orderBy: {
          targetDate: 'asc',
        },
      },
    },
    orderBy: {
      priority: 'asc', // HIGH first
    },
  });

  return goals.map((g) => ({
    title: g.title,
    description: g.description,
    category: g.category,
    progressPercent: g.progressPercent,
    targetDate: g.targetDate,
    milestones: g.milestones,
  }));
}

/**
 * Fetch advancement criteria from the database
 */
async function getAdvancementCriteria(): Promise<Criterion[]> {
  const criteria = await prisma.criterion.findMany({
    where: {
      prDetectable: true, // Only get criteria that can be detected from PR activity
    },
    orderBy: [
      { areaOfConcentration: 'asc' },
      { subarea: 'asc' },
    ],
    select: {
      id: true,
      areaOfConcentration: true,
      subarea: true,
      description: true,
    },
  });

  return criteria;
}

/**
 * Fetch the most recent manager review feedback
 */
async function getManagerFeedback(): Promise<ManagerFeedback | null> {
  const managerReview = await prisma.reviewAnalysis.findFirst({
    where: {
      reviewType: 'MANAGER',
    },
    orderBy: [
      { year: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      year: true,
      growthAreas: true,
      strengths: true,
    },
  });

  if (!managerReview) {
    return null;
  }

  // Parse JSON fields
  let growthAreas: string[] = [];
  let strengths: string[] = [];

  try {
    growthAreas = JSON.parse(managerReview.growthAreas);
  } catch {
    // If not valid JSON, treat as empty
  }

  try {
    strengths = JSON.parse(managerReview.strengths);
  } catch {
    // If not valid JSON, treat as empty
  }

  return {
    year: managerReview.year,
    growthAreas,
    strengths,
  };
}

/**
 * Fetch developer context including user context, company framework, active goals, criteria, and manager feedback
 */
async function getDeveloperContext(): Promise<DeveloperContext> {
  const [aiContext, activeGoals, criteria, managerFeedback] = await Promise.all([
    getAIContext(),
    getActiveGoals(),
    getAdvancementCriteria(),
    getManagerFeedback(),
  ]);

  return {
    userContext: aiContext.userContext,
    companyFramework: aiContext.companyFramework,
    activeGoals,
    criteria,
    managerFeedback,
  };
}

/**
 * Process a monthly insight generation job
 */
export async function processMonthlyInsightJob(jobId: string): Promise<void> {
  console.log(`[MonthlyInsight] Starting job ${jobId}`);

  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Job ${jobId} is not in PENDING state (current: ${job.status})`);
    }

    // Parse config
    const config: MonthlyInsightJobConfig = job.config ? JSON.parse(job.config) : {};

    if (!config.month || !/^\d{4}-\d{2}$/.test(config.month)) {
      throw new Error('Valid month in YYYY-MM format is required');
    }

    // Update job status to IN_PROGRESS
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        progress: 0,
        logs: JSON.stringify([{ timestamp: new Date().toISOString(), message: 'Starting monthly insight generation' }]),
      },
    });

    // Check for existing insight if not forcing
    if (!config.force) {
      const existing = await prisma.monthlyInsight.findUnique({
        where: { month: config.month },
      });

      if (existing && !shouldRegenerate(existing)) {
        await updateJobProgress(jobId, 100, 'Using existing cached insight');
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            completedAt: new Date(),
            result: JSON.stringify({
              cached: true,
              insightId: existing.id,
              month: existing.month,
            }),
          },
        });
        return;
      }
    }

    // Get API key
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey();
    } catch {
      throw new Error('Anthropic API key not configured. Please configure in settings.');
    }

    await updateJobProgress(jobId, 10, 'Initializing AI client');

    const anthropic = new Anthropic({ apiKey });
    const modelId = await getConfiguredModelId();

    await updateJobProgress(jobId, 20, 'Fetching month data and context');

    // Fetch month's metrics and developer context in parallel
    const [metrics, developerContext] = await Promise.all([
      getMonthMetrics(config.month),
      getDeveloperContext(),
    ]);

    if (metrics.totalPrs === 0) {
      // No data for this month - create empty insight
      const insight = await createEmptyInsight(config.month);
      await updateJobProgress(jobId, 100, 'No activity for this month');
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          result: JSON.stringify({
            insightId: insight.id,
            month: insight.month,
            noActivity: true,
          }),
        },
      });
      return;
    }

    await updateJobProgress(jobId, 40, 'Generating AI analysis');

    // Build and send AI prompt
    const prompt = buildInsightPrompt(config.month, metrics, developerContext);
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 2000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    await updateJobProgress(jobId, 70, 'Parsing AI response');

    // Parse the response
    const parsed = parseInsightResponse(responseText);

    await updateJobProgress(jobId, 85, 'Saving insight');

    // Determine if month is complete
    const monthDate = new Date(`${config.month}-01`);
    const monthEndDate = endOfMonth(monthDate);
    const isComplete = isBefore(monthEndDate, new Date());

    // Save or update the insight
    const [year, monthNum] = config.month.split('-').map(Number);

    const insight = await prisma.monthlyInsight.upsert({
      where: { month: config.month },
      create: {
        month: config.month,
        year,
        monthNum,
        totalPrs: metrics.totalPrs,
        totalChanges: metrics.totalChanges,
        componentsCount: metrics.componentsCount,
        categories: JSON.stringify(metrics.categories),
        strengths: JSON.stringify(parsed.strengths),
        weaknesses: JSON.stringify(parsed.weaknesses),
        tags: JSON.stringify(parsed.tags),
        summary: parsed.summary,
        generatedAt: new Date(),
        dataEndDate: metrics.latestPrDate || new Date(),
        isComplete,
      },
      update: {
        totalPrs: metrics.totalPrs,
        totalChanges: metrics.totalChanges,
        componentsCount: metrics.componentsCount,
        categories: JSON.stringify(metrics.categories),
        strengths: JSON.stringify(parsed.strengths),
        weaknesses: JSON.stringify(parsed.weaknesses),
        tags: JSON.stringify(parsed.tags),
        summary: parsed.summary,
        generatedAt: new Date(),
        dataEndDate: metrics.latestPrDate || new Date(),
        isComplete,
      },
    });

    await updateJobProgress(jobId, 100, 'Monthly insight generated successfully');

    // Mark job as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          insightId: insight.id,
          month: insight.month,
          isComplete,
          metrics: {
            totalPrs: metrics.totalPrs,
            totalChanges: metrics.totalChanges,
            componentsCount: metrics.componentsCount,
          },
        }),
      },
    });

    console.log(`[MonthlyInsight] Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[MonthlyInsight] Job ${jobId} failed:`, error);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

/**
 * Check if an existing insight should be regenerated
 * Regenerate if:
 * 1. Insight was generated before the end of the month (incomplete data)
 * 2. AND it's been more than 24 hours since generation (avoid thrashing)
 */
function shouldRegenerate(insight: { month: string; isComplete: boolean; generatedAt: Date }): boolean {
  const monthDate = new Date(`${insight.month}-01`);
  const monthEndDate = endOfMonth(monthDate);
  const now = new Date();

  // If already marked complete, no regeneration needed
  if (insight.isComplete) {
    return false;
  }

  // Check if generated before month ended (incomplete data)
  const generatedBeforeMonthEnd = isBefore(insight.generatedAt, monthEndDate);

  // Check if it's been more than 24 hours since generation
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const notGeneratedRecently = isBefore(insight.generatedAt, twentyFourHoursAgo);

  // Regenerate if generated before month end AND not within last 24 hours
  return generatedBeforeMonthEnd && notGeneratedRecently;
}

/**
 * Get metrics for a specific month
 */
async function getMonthMetrics(month: string): Promise<MonthMetrics> {
  const monthDate = new Date(`${month}-01`);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  // Fetch all evidence with PRs for this month
  const evidence = await prisma.evidence.findMany({
    where: {
      type: { in: ['PR_AUTHORED', 'PR_REVIEWED', 'GITHUB_PR'] },
      githubPrId: { not: null },
      occurredAt: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    include: {
      githubPr: true,
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });

  const metrics: MonthMetrics = {
    totalPrs: 0,
    totalChanges: 0,
    additions: 0,
    deletions: 0,
    componentsCount: 0,
    topComponents: [],
    categories: {},
    prTitles: [],
    latestPrDate: null,
  };

  const componentMap: Record<string, { prCount: number; changes: number }> = {};
  const seenPrs = new Set<string>();

  evidence.forEach((e) => {
    const pr = e.githubPr;
    if (!pr) return;

    // Dedupe PRs (might appear multiple times due to different evidence types)
    const prKey = `${pr.repo}/${pr.number}`;
    if (seenPrs.has(prKey)) return;
    seenPrs.add(prKey);

    metrics.totalPrs++;
    metrics.additions += pr.additions || 0;
    metrics.deletions += pr.deletions || 0;
    metrics.totalChanges += (pr.additions || 0) + (pr.deletions || 0);

    if (pr.title) {
      metrics.prTitles.push(pr.title);
    }

    // Track categories
    const category = e.category || 'other';
    metrics.categories[category] = (metrics.categories[category] || 0) + 1;

    // Track latest PR date
    const prDate = pr.mergedAt || pr.createdAt;
    if (prDate && (!metrics.latestPrDate || prDate > metrics.latestPrDate)) {
      metrics.latestPrDate = prDate;
    }

    // Extract components
    if (pr.components) {
      try {
        const parsed = typeof pr.components === 'string' ? JSON.parse(pr.components) : pr.components;
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            const name = typeof c === 'string' ? c : c.name;
            if (!name) return;
            if (!componentMap[name]) {
              componentMap[name] = { prCount: 0, changes: 0 };
            }
            componentMap[name].prCount++;
            componentMap[name].changes += (pr.additions || 0) + (pr.deletions || 0);
          });
        }
      } catch {
        // Ignore parsing errors
      }
    }
  });

  // Convert component map to sorted array
  metrics.topComponents = Object.entries(componentMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.prCount - a.prCount)
    .slice(0, 10);

  metrics.componentsCount = Object.keys(componentMap).length;

  return metrics;
}

/**
 * Build the AI prompt for insight generation
 */
function buildInsightPrompt(month: string, metrics: MonthMetrics, context: DeveloperContext): string {
  const monthDate = new Date(`${month}-01`);
  const monthName = format(monthDate, 'MMMM yyyy');

  const avgPrSize = metrics.totalPrs > 0 ? Math.round(metrics.totalChanges / metrics.totalPrs) : 0;

  // Build category breakdown
  const categoryBreakdown = Object.entries(metrics.categories)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${cat}: ${count} PRs (${Math.round((count / metrics.totalPrs) * 100)}%)`)
    .join('\n  ');

  // Build component list
  const componentList = metrics.topComponents
    .slice(0, 5)
    .map((c) => `${c.name}: ${c.prCount} PRs, ${c.changes.toLocaleString()} changes`)
    .join('\n  ');

  // Build PR titles sample
  const prTitlesSample = metrics.prTitles.slice(0, 10).map((t) => `- "${t}"`).join('\n');

  // Build developer context section
  let developerContextSection = '';
  if (context.userContext) {
    developerContextSection += `## Developer Profile
${context.userContext}

`;
  }

  // Build active goals section
  let goalsSection = '';
  if (context.activeGoals.length > 0) {
    const goalsList = context.activeGoals.map((g) => {
      const milestonesInfo = g.milestones.length > 0
        ? ` (Milestones: ${g.milestones.map((m) => `${m.title} [${m.status}]`).join(', ')})`
        : '';
      return `- **${g.title}** [${g.category}] - ${g.progressPercent}% complete, target: ${format(g.targetDate, 'MMM yyyy')}${milestonesInfo}
    ${g.description}`;
    }).join('\n');

    goalsSection = `## Active Career Goals
The developer is currently working toward these goals. Consider how this month's work contributes to or detracts from these objectives:

${goalsList}

`;
  }

  // Build advancement criteria section
  let criteriaSection = '';
  if (context.criteria.length > 0) {
    // Group criteria by area
    const grouped: Record<string, Array<{ subarea: string; description: string }>> = {};
    context.criteria.forEach((c) => {
      if (!grouped[c.areaOfConcentration]) {
        grouped[c.areaOfConcentration] = [];
      }
      grouped[c.areaOfConcentration].push({ subarea: c.subarea, description: c.description });
    });

    const criteriaList = Object.entries(grouped)
      .map(([area, items]) => {
        const itemsList = items.map((i) => `  - **${i.subarea}**: ${i.description}`).join('\n');
        return `### ${area}\n${itemsList}`;
      })
      .join('\n\n');

    criteriaSection = `## Advancement Criteria
These are the criteria the developer needs to demonstrate for career advancement. Evaluate how this month's work demonstrates (or could better demonstrate) these competencies:

${criteriaList}

`;
  }

  // Build manager feedback section (kept internal for context, not shown explicitly)
  let managerFeedbackSection = '';
  if (context.managerFeedback && context.managerFeedback.growthAreas.length > 0) {
    const yearLabel = context.managerFeedback.year ? ` (from ${context.managerFeedback.year} review)` : '';
    const growthAreasList = context.managerFeedback.growthAreas.map((g) => `- ${g}`).join('\n');

    managerFeedbackSection = `## Development Focus Areas${yearLabel}
These are priority development areas from recent feedback. When writing insights, naturally incorporate these themes without explicitly mentioning "manager feedback" or "growth areas" - just weave them into the analysis organically:

${growthAreasList}

`;
  }

  const hasCriteria = context.criteria.length > 0;
  const hasGoals = context.activeGoals.length > 0;
  const hasManagerFeedback = context.managerFeedback && context.managerFeedback.growthAreas.length > 0;

  return `You are analyzing a software developer's monthly activity to generate personalized insights for their performance tracking dashboard.

Write all output in first person perspective (e.g., "I focused on...", "My strengths this month...", "I made progress toward..."). The developer will be reading this about themselves. Do not use markdown formatting like bold (**text**) or italics in your output - just write plain sentences.

**AVOID these suggestions in areas for improvement:**
- Don't suggest reaching out to specific teams (security, platform, etc.) - I work with them through existing channels
- Don't suggest creating new initiatives (tech talks, lunch & learns, working groups, etc.)
- Don't suggest stakeholder communication - our PM handles that
- Don't suggest improving code review practices or getting more human review - you can't see Slack conversations where collaboration happens, and our team is already highly collaborative with thorough code reviews
- Don't suggest security-related improvements or security practices - security is handled appropriately and isn't a growth area
- Instead, focus on skills I can develop through my existing work and current team interactions

${developerContextSection}${managerFeedbackSection}${criteriaSection}${goalsSection}## Month: ${monthName}

## Metrics
- Total PRs: ${metrics.totalPrs}
- Total Code Changes: ${metrics.totalChanges.toLocaleString()} lines
  - Additions: ${metrics.additions.toLocaleString()}
  - Deletions: ${metrics.deletions.toLocaleString()}
- Average PR Size: ${avgPrSize} lines
- Components Worked On: ${metrics.componentsCount}

## Category Breakdown
  ${categoryBreakdown || 'No category data available'}

## Top Components
  ${componentList || 'No component data available'}

## Recent PR Titles
${prTitlesSample || 'No PR titles available'}

---

Based on this data${hasCriteria ? ' and the advancement criteria' : ''}${hasGoals ? ', and my active goals' : ''}, analyze the month and provide:

1. **Strengths** (2-4 bullet points): What went well this month?${hasCriteria ? ' Reference specific advancement criteria I demonstrated.' : ''} Consider productivity, focus areas, code quality indicators, and breadth/depth of work.${hasGoals ? ' Note progress toward my goals.' : ''}${hasManagerFeedback ? ' Naturally highlight accomplishments that align with my development focus areas.' : ''}

2. **Areas for Improvement** (1-3 bullet points): What could I focus on next?${hasCriteria ? ' Reference advancement criteria where I have room to grow.' : ''}${hasManagerFeedback ? ' Gently suggest opportunities related to my development focus areas - frame these as exciting growth opportunities, not deficiencies.' : ''} Be encouraging and forward-looking, not critical.${hasGoals ? ' If goals need attention, mention them supportively.' : ''}

3. **Tags** (3-5 tags): Categorize this month using tags from these categories:
   - Velocity: high-velocity, steady-pace, low-activity
   - Focus: feature-focused, bug-fixing, refactoring, maintenance, infrastructure
   - Scope: frontend-heavy, backend-heavy, full-stack, api-focused
   - Quality: well-reviewed, large-prs, small-focused-prs
   - Collaboration: team-player, solo-contributor, code-reviewer${hasGoals ? '\n   - Goals: goal-aligned, goal-progress, needs-goal-focus' : ''}${hasCriteria ? '\n   - Criteria: engineering-excellence, strong-delivery, communication-focused, high-influence, business-impact' : ''}

4. **Summary** (2-3 sentences): A narrative summary capturing the essence of this month's work. Keep it natural and conversational.${hasCriteria ? ' Weave in which competency areas shone through.' : ''}${hasGoals ? ' Connect to my broader career trajectory.' : ''}

Respond in JSON format (remember: first person perspective, natural tone):
{
  "strengths": ["I showed strong [skill/area] by...", "My work on X demonstrated...", ...],
  "weaknesses": ["Next month I'd like to explore...", "There's an opportunity to...", ...],
  "tags": ["tag1", "tag2", ...],
  "summary": "This month I focused on... [natural narrative about the work and growth]"
}`;
}

/**
 * Parse and validate the AI response
 */
function parseInsightResponse(responseText: string): ParsedInsight {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch =
      responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      responseText.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    const parsed = JSON.parse(jsonText);

    // Validate and normalize
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: any) => typeof s === 'string') : [];
    const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter((s: any) => typeof s === 'string') : [];
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((s: any) => typeof s === 'string') : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Analysis generated.';

    return { strengths, weaknesses, tags, summary };
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    // Return defaults on parse failure
    return {
      strengths: ['Analysis could not be completed'],
      weaknesses: [],
      tags: ['needs-review'],
      summary: 'Unable to generate detailed analysis. Please try regenerating.',
    };
  }
}

/**
 * Create an empty insight for months with no activity
 */
async function createEmptyInsight(month: string) {
  const [year, monthNum] = month.split('-').map(Number);
  const monthDate = new Date(`${month}-01`);
  const monthEndDate = endOfMonth(monthDate);
  const isComplete = isBefore(monthEndDate, new Date());

  return prisma.monthlyInsight.upsert({
    where: { month },
    create: {
      month,
      year,
      monthNum,
      totalPrs: 0,
      totalChanges: 0,
      componentsCount: 0,
      categories: JSON.stringify({}),
      strengths: JSON.stringify([]),
      weaknesses: JSON.stringify([]),
      tags: JSON.stringify(['no-activity']),
      summary: 'No pull request activity recorded for this month.',
      generatedAt: new Date(),
      dataEndDate: new Date(),
      isComplete,
    },
    update: {
      totalPrs: 0,
      totalChanges: 0,
      componentsCount: 0,
      categories: JSON.stringify({}),
      strengths: JSON.stringify([]),
      weaknesses: JSON.stringify([]),
      tags: JSON.stringify(['no-activity']),
      summary: 'No pull request activity recorded for this month.',
      generatedAt: new Date(),
      isComplete,
    },
  });
}

/**
 * Update job progress and logs
 */
async function updateJobProgress(jobId: string, progress: number, message: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const logs = job.logs ? JSON.parse(job.logs) : [];
  logs.push({ timestamp: new Date().toISOString(), message });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress,
      logs: JSON.stringify(logs),
      statusMessage: message,
      updatedAt: new Date(),
    },
  });
}

/**
 * Utility: Check if a month's insight is stale and should be regenerated
 * Export for use by API endpoints
 */
export function isInsightStale(insight: { month: string; isComplete: boolean; generatedAt: Date }): boolean {
  return shouldRegenerate(insight);
}
