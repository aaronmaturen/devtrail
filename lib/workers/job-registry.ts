/**
 * Job Registry - Single source of truth for job type routing
 *
 * This file maps job types to their handler functions.
 * When adding a new job type:
 * 1. Create the handler in a separate file (e.g., handlers/my-job.ts)
 * 2. Add an entry to JOB_HANDLERS below
 * That's it! No need to update worker.ts, process-helper.ts, or job-processor.ts
 */

// Handler function signature - all handlers take a jobId and return a Promise
// Some handlers return void, others return result objects - we accept both
export type JobHandler = (jobId: string) => Promise<unknown>;

// Lazy-loaded handler modules to avoid circular dependencies
// and improve startup time
type HandlerLoader = () => Promise<{ default: JobHandler } | { process: JobHandler }>;

/**
 * Registry of all job types and their handlers
 *
 * Format: 'JOB_TYPE': async () => import('./path-to-handler')
 *
 * The handler module should export either:
 * - A default export function
 * - A named export called 'process'
 */
const JOB_HANDLERS: Record<string, HandlerLoader> = {
  // GitHub/Jira sync jobs - using hybrid-sync for full functionality
  AGENT_GITHUB_SYNC: async () => {
    const mod = await import('./hybrid-sync');
    return { process: mod.processHybridGitHubSync };
  },
  AGENT_JIRA_SYNC: async () => {
    const mod = await import('./hybrid-sync');
    return { process: mod.processHybridJiraSync };
  },

  // Google Drive sync
  GOOGLE_DRIVE_SYNC: async () => {
    const mod = await import('./google-drive-sync');
    return { process: mod.processGoogleDriveSyncJob };
  },

  // Review analysis
  REVIEW_ANALYSIS: async () => {
    const mod = await import('./review-analysis');
    return { process: mod.processReviewAnalysisJob };
  },

  // AI evidence analysis
  AI_ANALYSIS: async () => {
    const mod = await import('./ai-analysis');
    return { process: mod.processAIAnalysisJob };
  },

  // Monthly AI insights
  MONTHLY_INSIGHT_GENERATION: async () => {
    const mod = await import('./monthly-insight');
    return { process: mod.processMonthlyInsightJob };
  },
};

// Legacy job types that are deprecated
const LEGACY_JOB_TYPES = new Set([
  'GITHUB_SYNC',
  'JIRA_SYNC',
  'REPORT_GENERATION',
  'GOAL_PROGRESS',
  'GOAL_GENERATION',
]);

/**
 * Get all registered job types
 */
export function getRegisteredJobTypes(): string[] {
  return Object.keys(JOB_HANDLERS);
}

/**
 * Check if a job type is registered
 */
export function isJobTypeRegistered(jobType: string): boolean {
  return jobType in JOB_HANDLERS;
}

/**
 * Check if a job type is deprecated
 */
export function isLegacyJobType(jobType: string): boolean {
  return LEGACY_JOB_TYPES.has(jobType);
}

/**
 * Process a job by its ID and type
 *
 * This is the main entry point for job processing.
 * It loads the appropriate handler and executes it.
 *
 * @param jobId - The job ID to process
 * @param jobType - The type of job (must be registered in JOB_HANDLERS)
 * @throws Error if job type is unknown or deprecated
 */
export async function processJob(jobId: string, jobType: string): Promise<void> {
  // Check for legacy job types
  if (isLegacyJobType(jobType)) {
    throw new Error(
      `Job type '${jobType}' is deprecated. Please use AGENT_GITHUB_SYNC or AGENT_JIRA_SYNC instead.`
    );
  }

  // Check if job type is registered
  const handlerLoader = JOB_HANDLERS[jobType];
  if (!handlerLoader) {
    throw new Error(
      `Unknown job type: ${jobType}. Registered types: ${getRegisteredJobTypes().join(', ')}`
    );
  }

  // Load and execute the handler
  console.log(`📦 Processing job ${jobId} (type: ${jobType})`);

  const handlerModule = await handlerLoader();
  const handler = 'process' in handlerModule ? handlerModule.process : handlerModule.default;

  if (typeof handler !== 'function') {
    throw new Error(`Handler for job type '${jobType}' is not a function`);
  }

  await handler(jobId);
}

/**
 * Get a description of a job type for logging/UI
 */
export function getJobTypeDescription(jobType: string): string {
  const descriptions: Record<string, string> = {
    AGENT_GITHUB_SYNC: 'Sync GitHub PRs and issues',
    AGENT_JIRA_SYNC: 'Sync Jira tickets',
    GOOGLE_DRIVE_SYNC: 'Sync documents from Google Drive',
    REVIEW_ANALYSIS: 'Analyze review documents',
    AI_ANALYSIS: 'AI analysis of evidence items',
    MONTHLY_INSIGHT_GENERATION: 'Generate monthly AI insights',
  };
  return descriptions[jobType] || jobType;
}
