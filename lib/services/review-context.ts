import { prisma } from '@/lib/db/prisma';

/**
 * Service for accessing review analysis context
 * This allows AI features to incorporate review insights
 */

export interface ReviewContext {
  recentReviews: {
    id: string;
    title: string;
    year?: string;
    reviewType: string;
    summary: string;
    themes: string[];
    strengths: string[];
    growthAreas: string[];
    achievements: string[];
  }[];
  allStrengths: string[];
  allGrowthAreas: string[];
  commonThemes: { theme: string; count: number }[];
}

/**
 * Get review analysis context for AI features
 * @param limit - Maximum number of recent reviews to include
 * @returns ReviewContext object with aggregated insights
 */
export async function getReviewContext(limit: number = 5): Promise<ReviewContext> {
  // Fetch recent analyses
  const analyses = await prisma.reviewAnalysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      year: true,
      reviewType: true,
      aiSummary: true,
      themes: true,
      strengths: true,
      growthAreas: true,
      achievements: true,
    },
  });

  // Parse JSON fields
  const parsedAnalyses = analyses.map((a) => ({
    id: a.id,
    title: a.title,
    year: a.year || undefined,
    reviewType: a.reviewType,
    summary: a.aiSummary,
    themes: JSON.parse(a.themes) as string[],
    strengths: JSON.parse(a.strengths) as string[],
    growthAreas: JSON.parse(a.growthAreas) as string[],
    achievements: JSON.parse(a.achievements) as string[],
  }));

  // Aggregate all strengths
  const allStrengths = parsedAnalyses.flatMap((a) => a.strengths);

  // Aggregate all growth areas
  const allGrowthAreas = parsedAnalyses.flatMap((a) => a.growthAreas);

  // Count theme frequency
  const themeCounts = new Map<string, number>();
  parsedAnalyses.forEach((a) => {
    a.themes.forEach((theme) => {
      const normalized = theme.toLowerCase();
      themeCounts.set(normalized, (themeCounts.get(normalized) || 0) + 1);
    });
  });

  // Sort themes by frequency
  const commonThemes = Array.from(themeCounts.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);

  return {
    recentReviews: parsedAnalyses,
    allStrengths,
    allGrowthAreas,
    commonThemes,
  };
}

/**
 * Format review context as a string for AI prompts
 * @param context - ReviewContext object
 * @returns Formatted string for AI consumption
 */
export function formatReviewContextForAI(context: ReviewContext): string {
  const parts: string[] = [];

  if (context.recentReviews.length > 0) {
    parts.push('## Recent Performance Reviews\n');
    context.recentReviews.forEach((review) => {
      parts.push(`### ${review.title} (${review.year || 'Undated'})`);
      parts.push(`**Type**: ${review.reviewType}`);
      parts.push(`**Summary**: ${review.summary}\n`);

      if (review.themes.length > 0) {
        parts.push(`**Themes**: ${review.themes.join(', ')}`);
      }

      if (review.strengths.length > 0) {
        parts.push(`**Strengths**:`);
        review.strengths.forEach((s) => parts.push(`- ${s}`));
      }

      if (review.growthAreas.length > 0) {
        parts.push(`**Growth Areas**:`);
        review.growthAreas.forEach((g) => parts.push(`- ${g}`));
      }

      parts.push(''); // Empty line between reviews
    });
  }

  if (context.commonThemes.length > 0) {
    parts.push('## Common Themes Across Reviews');
    context.commonThemes.slice(0, 5).forEach((t) => {
      parts.push(`- ${t.theme} (mentioned ${t.count}x)`);
    });
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Get review analysis for a specific year
 * @param year - Year or period (e.g., "2024" or "2024-mid")
 * @returns Review analysis for the specified year
 */
export async function getReviewByYear(year: string) {
  const analyses = await prisma.reviewAnalysis.findMany({
    where: { year },
    orderBy: { createdAt: 'desc' },
  });

  return analyses.map((a) => ({
    id: a.id,
    title: a.title,
    year: a.year,
    reviewType: a.reviewType,
    source: a.source,
    summary: a.aiSummary,
    themes: JSON.parse(a.themes),
    strengths: JSON.parse(a.strengths),
    growthAreas: JSON.parse(a.growthAreas),
    achievements: JSON.parse(a.achievements),
    confidenceScore: a.confidenceScore,
    createdAt: a.createdAt,
  }));
}

/**
 * Get strengths from all reviews for goal generation
 */
export async function getAllStrengths(): Promise<string[]> {
  const analyses = await prisma.reviewAnalysis.findMany({
    select: { strengths: true },
  });

  return analyses.flatMap((a) => JSON.parse(a.strengths) as string[]);
}

/**
 * Get growth areas from all reviews for goal generation
 */
export async function getAllGrowthAreas(): Promise<string[]> {
  const analyses = await prisma.reviewAnalysis.findMany({
    select: { growthAreas: true },
  });

  return analyses.flatMap((a) => JSON.parse(a.growthAreas) as string[]);
}

/**
 * Get company framework document (e.g., mission, values, strategic pillars)
 * This provides organizational context for AI analysis
 */
export async function getCompanyFramework(): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { key: 'company_framework' },
  });

  if (!config) {
    return null;
  }

  return JSON.parse(config.value);
}

/**
 * Save company framework document
 */
export async function saveCompanyFramework(content: string): Promise<void> {
  await prisma.config.upsert({
    where: { key: 'company_framework' },
    update: {
      value: JSON.stringify(content),
      description: 'Company mission, values, and strategic framework for AI context',
    },
    create: {
      key: 'company_framework',
      value: JSON.stringify(content),
      encrypted: false,
      description: 'Company mission, values, and strategic framework for AI context',
    },
  });
}

/**
 * Get user/developer context (personal career goals, aspirations, current role)
 * This provides personal context for AI analysis
 */
export async function getUserContext(): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { key: 'user_context' },
  });

  if (!config) {
    return null;
  }

  return JSON.parse(config.value);
}

/**
 * Save user/developer context
 */
export async function saveUserContext(content: string): Promise<void> {
  await prisma.config.upsert({
    where: { key: 'user_context' },
    update: {
      value: JSON.stringify(content),
      description: 'Personal career context and aspirations for AI personalization',
    },
    create: {
      key: 'user_context',
      value: JSON.stringify(content),
      encrypted: false,
      description: 'Personal career context and aspirations for AI personalization',
    },
  });
}

/**
 * Get full AI context including user context, company framework, and reviews
 * This provides comprehensive organizational and personal context for AI analysis
 */
export async function getFullAIContext(reviewLimit: number = 5): Promise<string> {
  const parts: string[] = [];

  // Add user context if available
  const userContext = await getUserContext();
  if (userContext) {
    parts.push('## Developer Context\n');
    parts.push(userContext);
    parts.push('\n---\n');
  }

  // Add company framework if available
  const framework = await getCompanyFramework();
  if (framework) {
    parts.push('## Company Framework\n');
    parts.push(framework);
    parts.push('\n---\n');
  }

  // Add review context
  const reviewContext = await getReviewContext(reviewLimit);
  const reviewContextStr = formatReviewContextForAI(reviewContext);
  if (reviewContextStr) {
    parts.push(reviewContextStr);
  }

  return parts.join('\n');
}
