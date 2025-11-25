import { prisma } from '../db/prisma';
import { generateReport, BaseReportConfig, EvidenceWithCriteria } from './report-generators';

export interface ReportGenerationJobConfig {
  reportType: string;
  startDate?: string;
  endDate?: string;
  repositories?: string[];
  criteriaIds?: number[];
  options?: Record<string, any>;
}

/**
 * Add a log entry to a job
 */
async function addJobLog(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const logs = JSON.parse(job.logs || '[]');
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
  });

  await prisma.job.update({
    where: { id: jobId },
    data: { logs: JSON.stringify(logs) },
  });
}

/**
 * Update job progress
 */
async function updateJobProgress(jobId: string, progress: number): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { progress },
  });
}

/**
 * Main function to process REPORT_GENERATION jobs
 * - Fetch evidence based on job config (date range, repos, criteria)
 * - Call appropriate report generator
 * - Save report to Report table
 * - Update job with result
 * - Handle errors
 */
export async function processReportGenerationJob(jobId: string): Promise<void> {
  let job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.type !== 'REPORT_GENERATION') {
    throw new Error(`Job ${jobId} is not a REPORT_GENERATION job`);
  }

  try {
    // Update job status to RUNNING
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        progress: 0,
      },
    });

    await addJobLog(jobId, 'info', 'Starting report generation');

    // Parse job config
    const config: ReportGenerationJobConfig = JSON.parse(job.config || '{}');

    // Validate report type
    const validReportTypes = [
      'EVIDENCE',
      'SUMMARY',
      'COMPREHENSIVE',
      'COMPONENT_ANALYSIS',
      'CAPITALIZATION',
      'UPWARD',
      'REVIEW_PACKAGE',
      'RESUME',
    ];

    if (!validReportTypes.includes(config.reportType)) {
      throw new Error(`Invalid report type: ${config.reportType}`);
    }

    await addJobLog(jobId, 'info', `Report type: ${config.reportType}`);
    await updateJobProgress(jobId, 10);

    // Fetch evidence based on filters
    await addJobLog(jobId, 'info', 'Fetching evidence...');

    const whereClause: any = {};

    // Filter by date range
    if (config.startDate || config.endDate) {
      whereClause.timestamp = {};
      if (config.startDate) {
        whereClause.timestamp.gte = new Date(config.startDate);
      }
      if (config.endDate) {
        whereClause.timestamp.lte = new Date(config.endDate);
      }
    }

    // Filter by repositories
    if (config.repositories && config.repositories.length > 0) {
      whereClause.repository = {
        in: config.repositories,
      };
    }

    // Fetch evidence with criteria relationships
    const evidence: EvidenceWithCriteria[] = await prisma.evidenceEntry.findMany({
      where: whereClause,
      include: {
        criteria: {
          include: {
            criterion: true,
          },
          // Filter by criteria IDs if specified
          ...(config.criteriaIds && config.criteriaIds.length > 0
            ? {
                where: {
                  criterionId: {
                    in: config.criteriaIds,
                  },
                },
              }
            : {}),
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    await addJobLog(jobId, 'info', `Found ${evidence.length} evidence entries`);
    await updateJobProgress(jobId, 30);

    if (evidence.length === 0) {
      await addJobLog(jobId, 'warn', 'No evidence found matching the criteria');
    }

    // Get API keys from Config table
    let anthropicApiKey: string | undefined;
    let claudeModel: string | undefined;
    let userContext: string | undefined;

    try {
      const anthropicConfig = await prisma.config.findUnique({
        where: { key: 'anthropic_api_key' },
      });
      if (anthropicConfig) {
        anthropicApiKey = anthropicConfig.value;
      }

      const modelConfig = await prisma.config.findUnique({
        where: { key: 'claude_model' },
      });
      if (modelConfig) {
        claudeModel = modelConfig.value;
      }

      const contextConfig = await prisma.config.findUnique({
        where: { key: 'user_context' },
      });
      if (contextConfig) {
        userContext = contextConfig.value;
      }
    } catch (error) {
      await addJobLog(jobId, 'warn', 'Could not load API configuration from database');
    }

    // Build report config
    const reportConfig: BaseReportConfig = {
      reportType: config.reportType as any,
      startDate: config.startDate,
      endDate: config.endDate,
      repositories: config.repositories,
      criteriaIds: config.criteriaIds,
      anthropicApiKey,
      claudeModel,
      userContext,
      ...config.options,
    };

    await addJobLog(jobId, 'info', 'Generating report...');
    await updateJobProgress(jobId, 50);

    // Generate report
    const { content, metadata } = await generateReport(evidence, reportConfig);

    await addJobLog(jobId, 'info', 'Report generated successfully');
    await updateJobProgress(jobId, 80);

    // Save report to database
    await addJobLog(jobId, 'info', 'Saving report to database...');

    const reportName = `${config.reportType} Report - ${new Date().toISOString().split('T')[0]}`;

    const report = await prisma.report.create({
      data: {
        name: reportName,
        type: config.reportType,
        content,
        metadata: JSON.stringify(metadata),
        jobId,
        evidenceCount: evidence.length,
        criteriaCount: metadata.criteriaCount,
      },
    });

    await addJobLog(jobId, 'info', `Report saved with ID: ${report.id}`);
    await updateJobProgress(jobId, 90);

    // Update job with success result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          reportId: report.id,
          reportName,
          evidenceCount: evidence.length,
          metadata,
        }),
      },
    });

    await addJobLog(jobId, 'info', 'Report generation completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';

    await addJobLog(jobId, 'error', `Error: ${errorMessage}`);

    // Update job with failure status
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: errorMessage,
        result: JSON.stringify({
          error: errorMessage,
          stack: errorStack,
        }),
      },
    });

    throw error;
  }
}
