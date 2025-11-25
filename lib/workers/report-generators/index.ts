import { EvidenceEntry, Criterion } from '@prisma/client';
import { generateEvidenceReport, EvidenceReportConfig } from './evidence-report';
import { generateAISummary, AISummaryConfig } from './ai-summary';
import { generateComponentAnalysis, ComponentAnalysisConfig } from './component-analysis';
import { generateCapitalizationReport, CapitalizationConfig } from './capitalization';
import { generateUpwardReview, UpwardReviewConfig } from './upward-review';
import { generateResume, ResumeConfig } from './resume';

export type ReportType =
  | 'EVIDENCE'
  | 'SUMMARY'
  | 'COMPREHENSIVE'
  | 'COMPONENT_ANALYSIS'
  | 'CAPITALIZATION'
  | 'UPWARD'
  | 'REVIEW_PACKAGE'
  | 'RESUME';

export interface BaseReportConfig {
  reportType: ReportType;
  startDate?: string;
  endDate?: string;
  repositories?: string[];
  criteriaIds?: number[];
  anthropicApiKey?: string;
  claudeModel?: string;
  userContext?: string;
  presenceWayContent?: string;
}

export type EvidenceWithCriteria = EvidenceEntry & {
  criteria: Array<{
    criterionId: number;
    confidence: number;
    explanation?: string;
    criterion: Criterion;
  }>;
};

/**
 * Main report generator router
 * Routes to appropriate generator based on report type
 * Handles all 7 report types
 */
export async function generateReport(
  evidence: EvidenceWithCriteria[],
  config: BaseReportConfig
): Promise<{ content: string; metadata: Record<string, any> }> {
  const startTime = Date.now();

  let content: string;
  const metadata: Record<string, any> = {
    reportType: config.reportType,
    generatedAt: new Date().toISOString(),
    evidenceCount: evidence.length,
  };

  // Add filters to metadata
  if (config.startDate) metadata.startDate = config.startDate;
  if (config.endDate) metadata.endDate = config.endDate;
  if (config.repositories) metadata.repositories = config.repositories;
  if (config.criteriaIds) metadata.criteriaIds = config.criteriaIds;

  switch (config.reportType) {
    case 'EVIDENCE': {
      const evidenceConfig: EvidenceReportConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
      };
      content = await generateEvidenceReport(evidence, evidenceConfig);

      // Count criteria represented in evidence
      const criteriaSet = new Set<number>();
      evidence.forEach(e => {
        e.criteria.forEach(c => criteriaSet.add(c.criterionId));
      });
      metadata.criteriaCount = criteriaSet.size;
      break;
    }

    case 'SUMMARY': {
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for SUMMARY report type');
      }
      const summaryConfig: AISummaryConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
      };
      content = await generateAISummary(evidence, summaryConfig);

      // Count criteria represented in evidence
      const criteriaSet = new Set<number>();
      evidence.forEach(e => {
        e.criteria.forEach(c => criteriaSet.add(c.criterionId));
      });
      metadata.criteriaCount = criteriaSet.size;
      break;
    }

    case 'COMPREHENSIVE': {
      // Comprehensive report combines evidence + AI summary
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for COMPREHENSIVE report type');
      }

      const evidenceConfig: EvidenceReportConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
      };

      const summaryConfig: AISummaryConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
      };

      const evidenceReport = await generateEvidenceReport(evidence, evidenceConfig);
      const summaryReport = await generateAISummary(evidence, summaryConfig);

      content = `${summaryReport}\n\n---\n\n${evidenceReport}`;

      // Count criteria represented in evidence
      const criteriaSet = new Set<number>();
      evidence.forEach(e => {
        e.criteria.forEach(c => criteriaSet.add(c.criterionId));
      });
      metadata.criteriaCount = criteriaSet.size;
      break;
    }

    case 'COMPONENT_ANALYSIS': {
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for COMPONENT_ANALYSIS report type');
      }
      const componentConfig: ComponentAnalysisConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
      };
      content = await generateComponentAnalysis(evidence, componentConfig);

      // Count unique components
      const componentSet = new Set<string>();
      evidence.forEach(e => {
        if (e.components) {
          try {
            const components = JSON.parse(e.components);
            components.forEach((c: any) => componentSet.add(c.name));
          } catch (error) {
            // Skip invalid component data
          }
        }
      });
      metadata.componentCount = componentSet.size;
      break;
    }

    case 'CAPITALIZATION': {
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for CAPITALIZATION report type');
      }
      const capConfig: CapitalizationConfig = {
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
        userContext: config.userContext,
      };
      content = await generateCapitalizationReport(evidence, capConfig);

      // Count PRs from last 3 months
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentPRs = evidence.filter(e => e.type === 'PR' && e.mergedAt && e.mergedAt >= threeMonthsAgo);
      metadata.recentPRCount = recentPRs.length;
      break;
    }

    case 'UPWARD': {
      // Upward review - for reviewing manager
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for UPWARD report type');
      }
      const upwardConfig: UpwardReviewConfig = {
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
        userContext: config.userContext,
        presenceWayContent: config.presenceWayContent,
      };
      content = await generateUpwardReview(evidence, upwardConfig);
      metadata.evidenceUsedForContext = evidence.length;
      break;
    }

    case 'REVIEW_PACKAGE': {
      // Review package - combines multiple reports
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key is required for REVIEW_PACKAGE report type');
      }

      const evidenceConfig: EvidenceReportConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
      };

      const summaryConfig: AISummaryConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        criteriaIds: config.criteriaIds,
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
      };

      const componentConfig: ComponentAnalysisConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        repositories: config.repositories,
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
      };

      const capConfig: CapitalizationConfig = {
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
        userContext: config.userContext,
      };

      const summaryReport = await generateAISummary(evidence, summaryConfig);
      const componentReport = await generateComponentAnalysis(evidence, componentConfig);
      const capReport = await generateCapitalizationReport(evidence, capConfig);
      const evidenceReport = await generateEvidenceReport(evidence, evidenceConfig);

      content = `# Performance Review Package\n\n`;
      content += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
      content += `---\n\n`;
      content += `${summaryReport}\n\n`;
      content += `---\n\n`;
      content += `${componentReport}\n\n`;
      content += `---\n\n`;
      content += `${capReport}\n\n`;
      content += `---\n\n`;
      content += `${evidenceReport}`;

      // Count criteria represented in evidence
      const criteriaSet = new Set<number>();
      evidence.forEach(e => {
        e.criteria.forEach(c => criteriaSet.add(c.criterionId));
      });
      metadata.criteriaCount = criteriaSet.size;
      metadata.packageContents = ['summary', 'component_analysis', 'capitalization', 'evidence'];
      break;
    }

    case 'RESUME': {
      // Resume generation - creates resume statements from evidence
      const resumeConfig: ResumeConfig = {
        anthropicApiKey: config.anthropicApiKey,
        claudeModel: config.claudeModel,
        theme: (config as any).theme || 'plain',
      };
      content = await generateResume(evidence, resumeConfig);

      // Count PRs used for resume generation
      const prCount = evidence.filter(e => e.type === 'PR').length;
      metadata.prCount = prCount;
      metadata.theme = resumeConfig.theme;
      break;
    }

    default:
      throw new Error(`Unsupported report type: ${config.reportType}`);
  }

  const generationTime = Date.now() - startTime;
  metadata.generationTimeMs = generationTime;

  return { content, metadata };
}
