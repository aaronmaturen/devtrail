/**
 * Fake Data Generator for DevTrail Marketing Screenshots
 * Replaces all database content with National Park themed technical data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// National Park Themed Data
// =============================================================================

const REPOS = [
  'trailhead/wayfinder',
  'summit/basecamp-ui',
  'ranger/backcountry-api',
  'wilderness/permit-service',
  'parklands/campsite-booking',
];

const COMPONENTS = [
  'TrailMap',
  'ElevationChart',
  'WildlifeTracker',
  'WeatherStation',
  'CampsiteCalendar',
  'PermitValidator',
  'TrailConditions',
  'ParkAlerts',
  'VisitorCounter',
  'BackcountryPlanner',
];

const PR_TITLES = [
  'feat: Add real-time trail condition updates',
  'fix: Resolve elevation calculation for switchbacks',
  'refactor: Optimize wildlife sighting aggregation',
  'feat: Implement campsite availability calendar',
  'fix: Correct permit validation for group sizes',
  'feat: Add interactive topographic map layer',
  'perf: Improve trail search response time by 40%',
  'feat: Implement weather forecast integration',
  'fix: Handle timezone edge cases for park hours',
  'refactor: Extract trail difficulty scoring logic',
  'feat: Add wilderness permit application flow',
  'fix: Resolve marker clustering at high zoom levels',
  'feat: Implement offline trail map caching',
  'docs: Update API documentation for trail endpoints',
  'feat: Add bear activity warning system',
  'fix: Correct distance calculations for loop trails',
  'feat: Implement ranger station locator',
  'perf: Reduce map tile loading latency',
  'feat: Add accessibility ratings for trails',
  'fix: Handle seasonal trail closures correctly',
];

const PR_BODIES = [
  'This PR adds real-time trail condition monitoring using WebSocket connections to ranger stations throughout the park network. Updates propagate within 30 seconds of field reports.\n\n## Changes\n- Added WebSocket handler for condition updates\n- Implemented condition severity classification\n- Added UI indicators for trail status\n\n## Testing\n- Tested with simulated ranger reports\n- Verified latency under 500ms',
  'Fixes an issue where elevation gain was being double-counted on switchback sections. The algorithm now correctly identifies when the trail doubles back and excludes redundant elevation changes.\n\n## Root Cause\nThe previous implementation used simple waypoint comparison which failed on hairpin turns.\n\n## Solution\nImplemented bearing-aware segment analysis.',
  'Major refactor of the wildlife tracking aggregation pipeline. Sightings are now processed in batches with configurable time windows, reducing database load by 60%.\n\n## Performance Impact\n- Query time reduced from 2.3s to 0.4s\n- Memory usage decreased by 45%',
  'Implements the campsite availability calendar with real-time booking integration. Users can now see available sites, filter by amenities, and reserve directly.\n\n## Features\n- Date range selection\n- Amenity filtering (water, fire pit, bear box)\n- Instant availability updates',
  'Resolves permit validation edge cases for groups larger than 12. The system now correctly enforces wilderness area capacity limits and suggests alternative dates.\n\n## Bug\nGroups of 13-15 were incorrectly approved for areas with 12-person limits.\n\n## Fix\nAdded strict capacity enforcement with helpful error messaging.',
];

const JIRA_SUMMARIES = [
  'Implement trail difficulty scoring algorithm',
  'Add multi-day backpacking trip planner',
  'Create wildlife identification guide',
  'Build campground reservation system',
  'Design park entrance fee calculator',
  'Implement trail closure notification system',
  'Add elevation profile visualization',
  'Create ranger station directory',
  'Build permit application workflow',
  'Implement emergency beacon integration',
  'Add trail mileage tracker',
  'Create photo spot recommendations',
  'Build sunrise/sunset calculator',
  'Implement water source locator',
  'Add trail intersection navigation',
];

const JIRA_DESCRIPTIONS = [
  'As a hiker, I want to see difficulty ratings for trails so I can choose routes appropriate for my skill level.\n\n**Acceptance Criteria:**\n- Display difficulty score (1-10)\n- Show elevation gain/loss\n- Indicate technical terrain sections\n- Include estimated completion time',
  'Create a comprehensive trip planning tool for multi-day backpacking adventures. Users should be able to plan campsites, water resupply points, and daily mileage.\n\n**Requirements:**\n- Drag-and-drop itinerary builder\n- Campsite availability integration\n- Resupply point mapping\n- Permit requirement alerts',
  'Build an interactive guide for identifying wildlife commonly found in park regions. Include photos, habitat information, and safety guidelines.\n\n**Features:**\n- Photo-based identification\n- Seasonal activity patterns\n- Safety distance recommendations\n- Sighting reporting integration',
];

const EVIDENCE_SUMMARIES = [
  'Led the implementation of the real-time trail condition monitoring system, enabling rangers to update hikers about hazards within seconds. This critical safety feature has been adopted across 12 park regions.',
  'Architected the wildlife tracking aggregation pipeline, reducing query latency by 85% and enabling real-time sighting maps. The system now processes over 10,000 daily observations.',
  'Designed and implemented the campsite reservation calendar with instant availability updates. The feature handles 500+ concurrent bookings during peak season.',
  'Refactored the permit validation system to correctly handle edge cases for large groups, preventing over-capacity situations in sensitive wilderness areas.',
  'Optimized the topographic map rendering pipeline, reducing tile load times by 60% and enabling smooth offline caching for backcountry use.',
  'Implemented the emergency beacon integration, connecting the app to park dispatch systems and reducing emergency response times by 40%.',
  'Created the trail difficulty scoring algorithm using elevation data, terrain analysis, and historical completion times. Now used by 50,000+ hikers monthly.',
  'Built the weather forecast integration pulling data from mountain weather stations, helping hikers plan safer trips with accurate summit forecasts.',
  'Designed the accessibility rating system for trails, making park information more inclusive and helping visitors with mobility considerations find suitable routes.',
  'Led code review efforts for the backcountry planning feature, ensuring robust error handling and data validation across the reservation flow.',
];

const SLACK_CHANNELS = [
  '#trail-alerts',
  '#ranger-station',
  '#backcountry-dev',
  '#campsite-booking',
  '#wildlife-monitoring',
  '#park-engineering',
  '#summit-team',
];

const SLACK_MESSAGES = [
  'Great catch on the elevation edge case! The switchback detection logic looks solid now.',
  'Just deployed the trail condition updates to production. All ranger stations are reporting successfully.',
  'The wildlife aggregation refactor reduced our DB costs by $400/month. Nice work!',
  'Heads up: deploying campsite calendar to staging in 30 mins. Please hold off on merges.',
  'Reviewed the permit validation PR - looks good! Just one small suggestion on error messages.',
  'The offline caching feature is getting great feedback from backcountry rangers. They love it!',
  'Quick reminder: planning meeting for the emergency beacon integration at 2pm.',
  'Huge kudos for fixing the timezone bug before peak season. That would have been a mess.',
];

const GOAL_TITLES = [
  'Lead Trail Condition Monitoring System Architecture',
  'Improve Backcountry API Performance',
  'Mentor Junior Engineers on Map Rendering',
  'Implement Comprehensive Testing for Permit Service',
  'Drive Wildlife Tracking Feature Adoption',
  'Establish Code Review Best Practices',
];

const GOAL_DESCRIPTIONS = [
  'Lead the architecture and implementation of the real-time trail condition monitoring system, coordinating with ranger stations across all park regions to enable instant hazard reporting.',
  'Optimize the backcountry API response times to under 200ms for 95th percentile requests, enabling smooth mobile experiences even in areas with poor connectivity.',
  'Mentor two junior engineers on the complexities of map tile rendering and caching strategies, helping them become independent contributors to the mapping infrastructure.',
  'Implement comprehensive integration testing for the wilderness permit service, achieving 90% code coverage and reducing production incidents by 50%.',
  'Drive adoption of the wildlife tracking feature across ranger programs, working with park naturalists to improve data quality and user engagement.',
  'Establish and document code review best practices for the trail engineering team, improving review turnaround time while maintaining quality standards.',
];

const MONTHLY_SUMMARIES = [
  'Strong month focused on trail safety infrastructure. Shipped real-time condition monitoring to 8 new park regions. Significant contributions to code review culture.',
  'Balanced feature development with technical debt reduction. The wildlife tracking refactor will pay dividends for seasons to come. Good mentorship engagement.',
  'High-impact month with the campsite calendar launch. Handled peak season traffic smoothly. Collaborated effectively with ranger station teams.',
  'Focused on reliability and performance. The API optimizations directly improved hiker experience in low-connectivity backcountry areas.',
];

const STRENGTHS = [
  'Excellent systems thinking - consistently considers full trail-to-summit impact',
  'Strong technical leadership on mapping infrastructure projects',
  'Effective cross-team collaboration with ranger station partners',
  'Proactive about documentation and knowledge sharing',
  'High-quality code reviews that elevate team standards',
];

const WEAKNESSES = [
  'Could delegate more to grow team capacity',
  'Sometimes over-engineers solutions for simple trail features',
  'Meeting notes could be more detailed for async team members',
];

// =============================================================================
// Helper Functions
// =============================================================================

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function randomDate(daysBack: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// =============================================================================
// Main Update Functions
// =============================================================================

async function updateGitHubPRs() {
  const prs = await prisma.gitHubPR.findMany();
  console.log(`Updating ${prs.length} GitHub PRs...`);

  for (const pr of prs) {
    const repo = randomItem(REPOS);
    const components = randomItems(COMPONENTS, randomInt(1, 4));

    await prisma.gitHubPR.update({
      where: { id: pr.id },
      data: {
        repo,
        title: randomItem(PR_TITLES),
        body: randomItem(PR_BODIES),
        url: `https://github.com/${repo}/pull/${pr.number}`,
        components: JSON.stringify(components),
        files: JSON.stringify(components.map(c => `src/components/${c}.tsx`)),
        reviewBody: pr.reviewBody ? 'Looks good! Nice work on the trail condition handling.' : null,
      },
    });
  }
}

async function updateJiraTickets() {
  const tickets = await prisma.jiraTicket.findMany();
  console.log(`Updating ${tickets.length} Jira tickets...`);

  const projects = ['TRAIL', 'PEAK', 'WILD', 'CAMP', 'RANGE'];
  const sprints = ['Summit Sprint 1', 'Summit Sprint 2', 'Trailhead Q4', 'Backcountry Release'];
  const epics = ['Trail Safety', 'Campsite Booking', 'Wildlife Monitoring', 'Park Navigation'];

  for (const ticket of tickets) {
    const project = randomItem(projects);
    const num = ticket.key.split('-')[1] || randomInt(100, 999);

    await prisma.jiraTicket.update({
      where: { id: ticket.id },
      data: {
        key: `${project}-${num}`,
        summary: randomItem(JIRA_SUMMARIES),
        description: randomItem(JIRA_DESCRIPTIONS),
        sprint: randomItem(sprints),
        epicKey: `${project}-${randomInt(1, 20)}`,
        epicSummary: randomItem(epics),
        commentSummary: 'Team discussed implementation approach. Agreed to prioritize mobile experience.',
      },
    });
  }
}

async function updateSlackMessages() {
  const messages = await prisma.slackMessage.findMany();
  console.log(`Updating ${messages.length} Slack messages...`);

  const authors = ['Sierra Walker', 'Canyon Rivers', 'Forest Grove', 'Ridge Summit', 'Aspen Trail'];

  for (const msg of messages) {
    await prisma.slackMessage.update({
      where: { id: msg.id },
      data: {
        channel: randomItem(SLACK_CHANNELS),
        author: randomItem(authors),
        content: randomItem(SLACK_MESSAGES),
      },
    });
  }
}

async function updateEvidence() {
  const evidence = await prisma.evidence.findMany();
  console.log(`Updating ${evidence.length} evidence entries...`);

  for (const ev of evidence) {
    await prisma.evidence.update({
      where: { id: ev.id },
      data: {
        summary: randomItem(EVIDENCE_SUMMARIES),
      },
    });
  }
}

async function updateGoals() {
  const goals = await prisma.goal.findMany();
  console.log(`Updating ${goals.length} goals...`);

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const titleIndex = i % GOAL_TITLES.length;

    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        title: GOAL_TITLES[titleIndex],
        description: GOAL_DESCRIPTIONS[titleIndex],
        specific: 'Deliver production-ready implementation with comprehensive documentation and team training.',
        measurable: 'Track adoption metrics, performance benchmarks, and incident reduction rates.',
        achievable: 'Building on existing infrastructure with proven patterns from similar park systems.',
        relevant: 'Directly supports park mission of visitor safety and experience improvement.',
        timeBound: 'Complete initial release by end of Q4, full rollout by Q1 next year.',
      },
    });
  }

  // Update milestones
  const milestones = await prisma.goalMilestone.findMany();
  const milestoneNames = [
    'Complete architecture design',
    'Implement core functionality',
    'Integration testing complete',
    'Ranger station pilot',
    'Full park rollout',
  ];

  for (let i = 0; i < milestones.length; i++) {
    await prisma.goalMilestone.update({
      where: { id: milestones[i].id },
      data: {
        title: milestoneNames[i % milestoneNames.length],
        description: 'Key milestone for project delivery and stakeholder alignment.',
      },
    });
  }
}

async function updateReports() {
  const reports = await prisma.report.findMany();
  console.log(`Updating ${reports.length} reports...`);

  for (const report of reports) {
    const content = `# Trail Engineering Performance Summary

## Overview
This report summarizes contributions to the Parklands trail management platform, focusing on safety infrastructure, performance optimization, and team collaboration.

## Key Achievements

### Trail Condition Monitoring System
Led the architecture and implementation of real-time trail condition updates, now deployed across 12 park regions. This critical safety feature enables rangers to alert hikers about hazards within seconds.

### Performance Optimization
Achieved 85% reduction in wildlife tracking query latency through pipeline refactoring. The system now handles 10,000+ daily observations with sub-second response times.

### Campsite Calendar Launch
Designed and shipped the reservation calendar handling 500+ concurrent bookings during peak season. Zero downtime during the busiest weekend of the year.

## Technical Impact
- **PRs Authored:** ${randomInt(15, 30)}
- **Code Reviews:** ${randomInt(40, 80)}
- **Components Contributed:** ${randomItems(COMPONENTS, 5).join(', ')}

## Collaboration
Strong cross-functional work with ranger station teams and park naturalists. Established code review best practices adopted by the broader trail engineering organization.
`;

    await prisma.report.update({
      where: { id: report.id },
      data: {
        name: `${randomItem(['Q4', 'Q3', 'Annual'])} Trail Engineering Review`,
        content,
      },
    });
  }
}

async function updateMonthlyInsights() {
  const insights = await prisma.monthlyInsight.findMany();
  console.log(`Updating ${insights.length} monthly insights...`);

  for (const insight of insights) {
    await prisma.monthlyInsight.update({
      where: { id: insight.id },
      data: {
        summary: randomItem(MONTHLY_SUMMARIES),
        strengths: JSON.stringify(randomItems(STRENGTHS, 3)),
        weaknesses: JSON.stringify(randomItems(WEAKNESSES, 2)),
        tags: JSON.stringify(randomItems(['high-velocity', 'feature-focused', 'reliability-driven', 'team-player', 'technical-leader'], 3)),
        categories: JSON.stringify({
          feature: randomInt(3, 8),
          bugfix: randomInt(1, 4),
          refactor: randomInt(1, 3),
          docs: randomInt(0, 2),
        }),
      },
    });
  }
}

async function updateReportDocuments() {
  const docs = await prisma.reportDocument.findMany();
  console.log(`Updating ${docs.length} report documents...`);

  for (const doc of docs) {
    await prisma.reportDocument.update({
      where: { id: doc.id },
      data: {
        name: `${randomItem(['Annual', 'Q4', 'Mid-Year'])} Trail Performance Review`,
        description: 'Comprehensive review of contributions to park trail infrastructure.',
      },
    });
  }

  const blocks = await prisma.reportBlock.findMany();
  const blockContents = [
    'Led critical safety infrastructure development including real-time trail condition monitoring now serving 12 park regions.',
    'Demonstrated strong technical leadership through architecture decisions on the mapping pipeline and wildlife tracking systems.',
    'Collaborated effectively with ranger station teams to ensure features meet field requirements and improve visitor safety.',
    'Opportunity to delegate more routine tasks to grow team capacity and focus on higher-impact strategic work.',
    'Continue developing expertise in offline-first mobile architecture to better serve backcountry users.',
  ];

  for (let i = 0; i < blocks.length; i++) {
    await prisma.reportBlock.update({
      where: { id: blocks[i].id },
      data: {
        content: blockContents[i % blockContents.length],
        prompt: randomItem([
          'Summarize key accomplishments this review period',
          'Describe areas for growth and development',
          'Highlight collaboration and teamwork examples',
        ]),
      },
    });
  }
}

async function updateReviewDocuments() {
  const docs = await prisma.reviewDocument.findMany();
  console.log(`Updating ${docs.length} review documents...`);

  for (const doc of docs) {
    const content = doc.type === 'EMPLOYEE'
      ? `# Self Review - Trail Engineering

## Key Accomplishments
This year I led the implementation of our real-time trail condition monitoring system, which has become critical safety infrastructure across 12 park regions. Rangers can now alert hikers to hazards within seconds of discovery.

I also drove significant performance improvements to our wildlife tracking pipeline, reducing query latency by 85% and enabling real-time sighting maps that process over 10,000 daily observations.

## Growth Areas
I recognize I could delegate more routine tasks to help grow team capacity. I sometimes over-engineer solutions when simpler approaches would suffice.

## Goals for Next Year
- Lead the offline-first mobile architecture initiative
- Mentor two engineers to senior level
- Establish cross-park API standards`
      : `# Manager Review - Trail Engineering

## Performance Summary
Exceptional year demonstrating strong technical leadership and cross-functional collaboration. The trail condition monitoring system is now considered critical park infrastructure.

## Strengths
- Outstanding systems thinking and architecture skills
- Highly effective collaboration with ranger station teams
- Strong mentorship and code review contributions

## Development Areas
- Continue building delegation skills
- Consider strategic impact alongside technical excellence

## Overall Rating
Exceeds Expectations`;

    await prisma.reviewDocument.update({
      where: { id: doc.id },
      data: { content },
    });
  }
}

async function clearSensitiveConfigs() {
  console.log('Clearing sensitive config values...');

  const sensitiveKeys = ['github_token', 'anthropic_api_key', 'jira_api_token', 'google_client_secret', 'google_refresh_token'];

  for (const key of sensitiveKeys) {
    await prisma.config.updateMany({
      where: { key },
      data: { value: JSON.stringify('REDACTED_FOR_DEMO') },
    });
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  console.log('🏔️  DevTrail Fake Data Generator');
  console.log('================================\n');
  console.log('Replacing all data with National Park themed content...\n');

  try {
    await updateGitHubPRs();
    await updateJiraTickets();
    await updateSlackMessages();
    await updateEvidence();
    await updateGoals();
    await updateReports();
    await updateMonthlyInsights();
    await updateReportDocuments();
    await updateReviewDocuments();
    await clearSensitiveConfigs();

    console.log('\n✅ All data has been replaced with fake National Park themed content!');
    console.log('🏕️  Ready for marketing screenshots.');
  } catch (error) {
    console.error('Error updating data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
