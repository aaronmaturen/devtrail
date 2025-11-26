import { prisma } from '@/lib/db/prisma';

export interface ComponentData {
  name: string;
  pr_count: number;
  total_changes: number;
  additions: number;
  deletions: number;
  repos: string[];
  paths: string[];
  pr_numbers: number[];
  pr_titles: string[];
  jira_keys: string[];
  jira_types: string[];
  avg_duration: number;
  total_duration: number;
  first_contribution: Date;
  last_contribution: Date;
  role: string;
  criteria_matched: {
    lead: { min_prs: boolean; min_changes: boolean; min_duration_days: boolean };
    significant: { min_prs: boolean; min_changes: boolean; min_duration_days: boolean };
    support: { min_prs: boolean; min_changes: boolean; min_duration_days: boolean };
  };
}

export interface FilterOptions {
  dateFrom?: string;
  dateTo?: string;
  repositories?: string[];
  components?: string[];
}

export interface AnalyticsSummary {
  total_components: number;
  lead_components: number;
  significant_components: number;
  support_components: number;
  minor_components: number;
  total_prs: number;
  total_changes: number;
}

function determineComponentRole(comp: ComponentData, usingPRCounts: boolean = false) {
  // Define criteria for different roles
  const criteria = usingPRCounts ? {
    lead: {
      min_prs: 8,
      min_changes: 0,
      min_duration_days: 90,
    },
    significant: {
      min_prs: 4,
      min_changes: 0,
      min_duration_days: 30,
    },
    support: {
      min_prs: 2,
      min_changes: 0,
      min_duration_days: 0,
    }
  } : {
    lead: {
      min_prs: 5,
      min_changes: 1000,
      min_duration_days: 90,
    },
    significant: {
      min_prs: 3,
      min_changes: 500,
      min_duration_days: 30,
    },
    support: {
      min_prs: 1,
      min_changes: 100,
      min_duration_days: 0,
    }
  };

  const durationDays = (comp.last_contribution.getTime() - comp.first_contribution.getTime()) / (1000 * 60 * 60 * 24);

  comp.criteria_matched = {
    lead: {
      min_prs: comp.pr_count >= criteria.lead.min_prs,
      min_changes: usingPRCounts || comp.total_changes >= criteria.lead.min_changes,
      min_duration_days: durationDays >= criteria.lead.min_duration_days,
    },
    significant: {
      min_prs: comp.pr_count >= criteria.significant.min_prs,
      min_changes: usingPRCounts || comp.total_changes >= criteria.significant.min_changes,
      min_duration_days: durationDays >= criteria.significant.min_duration_days,
    },
    support: {
      min_prs: comp.pr_count >= criteria.support.min_prs,
      min_changes: usingPRCounts || comp.total_changes >= criteria.support.min_changes,
      min_duration_days: durationDays >= criteria.support.min_duration_days,
    }
  };

  if (comp.criteria_matched.lead.min_prs &&
      comp.criteria_matched.lead.min_changes &&
      comp.criteria_matched.lead.min_duration_days) {
    comp.role = 'Lead';
  } else if (comp.criteria_matched.significant.min_prs &&
             comp.criteria_matched.significant.min_changes &&
             comp.criteria_matched.significant.min_duration_days) {
    comp.role = 'Significant Contributor';
  } else if (comp.criteria_matched.support.min_prs &&
             comp.criteria_matched.support.min_changes) {
    comp.role = 'Support';
  } else {
    comp.role = 'Minor Contributor';
  }
}

export async function analyzeComponents(filterOptions?: FilterOptions): Promise<{
  components: ComponentData[];
  summary: AnalyticsSummary;
  using_pr_counts: boolean;
  note?: string;
}> {
  // Build where clause for Evidence with GithubPR
  const where: any = {
    type: { in: ['PR_AUTHORED', 'PR_REVIEWED', 'GITHUB_PR', 'GITHUB_ISSUE'] },
    githubPrId: { not: null },
  };

  // Filter by date range
  const defaultDateFrom = new Date();
  defaultDateFrom.setFullYear(defaultDateFrom.getFullYear() - 1);

  const dateFrom = filterOptions?.dateFrom ? new Date(filterOptions.dateFrom) : defaultDateFrom;
  const dateTo = filterOptions?.dateTo ? new Date(filterOptions.dateTo) : new Date();

  where.occurredAt = {
    gte: dateFrom,
    lte: dateTo,
  };

  // Filter by repositories - need to filter on the related GithubPR
  if (filterOptions?.repositories && filterOptions.repositories.length > 0) {
    where.githubPr = {
      repo: { in: filterOptions.repositories },
    };
  }

  // Fetch Evidence entries with GithubPR data
  const evidenceEntries = await prisma.evidence.findMany({
    where,
    include: {
      githubPr: true,
      jiraTicket: true,
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });

  // Check if we have GitHub stats data
  const hasStatsData = evidenceEntries.some(e =>
    e.githubPr && ((e.githubPr.additions || 0) > 0 || (e.githubPr.deletions || 0) > 0)
  );
  const usingPRCounts = !hasStatsData;

  // Analyze components
  const componentData: Record<string, ComponentData> = {};

  evidenceEntries.forEach(evidence => {
    const pr = evidence.githubPr;
    if (!pr || !pr.mergedAt || !pr.components) return;

    // Parse components (stored as JSON string or array)
    // Can be either array of strings ["comp1", "comp2"] or objects [{name: "comp1"}, ...]
    let components: Array<{ name: string; count?: number; depth?: number; path?: string }> = [];
    try {
      let parsed: any;
      if (typeof pr.components === 'string') {
        parsed = JSON.parse(pr.components);
      } else {
        parsed = pr.components;
      }

      if (!Array.isArray(parsed)) return;

      // Normalize to objects with name property
      components = parsed.map((c: any) => {
        if (typeof c === 'string') {
          return { name: c };
        }
        return c;
      });
    } catch (error) {
      console.error('Error parsing components:', error);
      return;
    }

    if (!Array.isArray(components) || components.length === 0) return;

    // Calculate PR duration in days
    const durationDays = pr.createdAt && pr.mergedAt
      ? (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    // Get linked Jira info
    const jiraTicket = evidence.jiraTicket;

    components.forEach(component => {
      const componentName = component.name;

      // Filter by component if specified
      if (filterOptions?.components && filterOptions.components.length > 0) {
        if (!filterOptions.components.includes(componentName)) return;
      }

      // Initialize component data if not exists
      if (!componentData[componentName]) {
        componentData[componentName] = {
          name: componentName,
          pr_count: 0,
          total_changes: 0,
          additions: 0,
          deletions: 0,
          repos: [],
          paths: [],
          pr_numbers: [],
          pr_titles: [],
          jira_keys: [],
          jira_types: [],
          avg_duration: 0,
          total_duration: 0,
          first_contribution: new Date(),
          last_contribution: new Date(0),
          role: '',
          criteria_matched: {
            lead: { min_prs: false, min_changes: false, min_duration_days: false },
            significant: { min_prs: false, min_changes: false, min_duration_days: false },
            support: { min_prs: false, min_changes: false, min_duration_days: false }
          }
        };
      }

      const compData = componentData[componentName];
      compData.pr_count++;

      if (pr.repo && !compData.repos.includes(pr.repo)) {
        compData.repos.push(pr.repo);
      }

      if (pr.number) compData.pr_numbers.push(pr.number);
      if (pr.title) compData.pr_titles.push(pr.title);

      if (component.path && !compData.paths.includes(component.path)) {
        compData.paths.push(component.path);
      }

      if (jiraTicket?.key && !compData.jira_keys.includes(jiraTicket.key)) {
        compData.jira_keys.push(jiraTicket.key);
      }
      if (jiraTicket?.issueType && !compData.jira_types.includes(jiraTicket.issueType)) {
        compData.jira_types.push(jiraTicket.issueType);
      }

      compData.additions += pr.additions || 0;
      compData.deletions += pr.deletions || 0;
      compData.total_changes += (pr.additions || 0) + (pr.deletions || 0);

      compData.total_duration += durationDays;

      if (pr.mergedAt && pr.mergedAt < compData.first_contribution) {
        compData.first_contribution = pr.mergedAt;
      }
      if (pr.mergedAt && pr.mergedAt > compData.last_contribution) {
        compData.last_contribution = pr.mergedAt;
      }
    });
  });

  // Calculate averages and determine roles
  Object.values(componentData).forEach(comp => {
    comp.avg_duration = comp.total_duration / comp.pr_count;
    determineComponentRole(comp, usingPRCounts);
  });

  const components = Object.values(componentData)
    .sort((a, b) => usingPRCounts ? b.pr_count - a.pr_count : b.total_changes - a.total_changes);

  const summary: AnalyticsSummary = {
    total_components: components.length,
    lead_components: components.filter(c => c.role === 'Lead').length,
    significant_components: components.filter(c => c.role === 'Significant Contributor').length,
    support_components: components.filter(c => c.role === 'Support').length,
    minor_components: components.filter(c => c.role === 'Minor Contributor').length,
    total_prs: components.reduce((sum, c) => sum + c.pr_count, 0),
    total_changes: components.reduce((sum, c) => sum + c.total_changes, 0),
  };

  return {
    components,
    summary,
    using_pr_counts: usingPRCounts,
    note: usingPRCounts ? 'GitHub code change statistics are not available. Analysis is based on PR counts only.' : undefined,
  };
}

export async function getTimeSeriesData(filterOptions?: FilterOptions) {
  // Build where clause
  const where: any = {
    type: { in: ['PR_AUTHORED', 'PR_REVIEWED', 'GITHUB_PR', 'GITHUB_ISSUE'] },
    githubPrId: { not: null },
  };

  if (filterOptions?.dateFrom) {
    where.occurredAt = { ...where.occurredAt, gte: new Date(filterOptions.dateFrom) };
  }
  if (filterOptions?.dateTo) {
    where.occurredAt = { ...where.occurredAt, lte: new Date(filterOptions.dateTo) };
  }
  if (filterOptions?.repositories && filterOptions.repositories.length > 0) {
    where.githubPr = { repo: { in: filterOptions.repositories } };
  }

  const evidenceEntries = await prisma.evidence.findMany({
    where,
    include: {
      githubPr: true,
    },
  });

  // Group by month
  const monthlyData: Record<string, Record<string, { pr_count: number; total_changes: number }>> = {};

  evidenceEntries.forEach(evidence => {
    const pr = evidence.githubPr;
    if (!pr || !pr.mergedAt || !pr.components) return;

    const monthKey = `${pr.mergedAt.getFullYear()}-${String(pr.mergedAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {};
    }

    let components: Array<{ name: string }> = [];
    try {
      let parsed: any;
      if (typeof pr.components === 'string') {
        parsed = JSON.parse(pr.components);
      } else {
        parsed = pr.components;
      }

      if (!Array.isArray(parsed)) return;

      // Normalize to objects with name property
      components = parsed.map((c: any) => {
        if (typeof c === 'string') {
          return { name: c };
        }
        return c;
      });
    } catch (error) {
      return;
    }

    if (!Array.isArray(components) || components.length === 0) return;

    components.forEach(component => {
      const componentName = component.name;

      if (filterOptions?.components && filterOptions.components.length > 0) {
        if (!filterOptions.components.includes(componentName)) return;
      }

      if (!monthlyData[monthKey][componentName]) {
        monthlyData[monthKey][componentName] = { pr_count: 0, total_changes: 0 };
      }

      monthlyData[monthKey][componentName].pr_count++;
      monthlyData[monthKey][componentName].total_changes += (pr.additions || 0) + (pr.deletions || 0);
    });
  });

  return Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, components]) => ({ date, components }));
}

export async function getRepositories() {
  // Get all GithubPRs grouped by repo
  const prs = await prisma.gitHubPR.findMany({
    where: {
      mergedAt: { not: null },
    },
    select: {
      repo: true,
      mergedAt: true,
    },
  });

  // Group by repository
  const repoData: Record<string, { count: number; latestActivity: Date | null }> = {};

  prs.forEach(pr => {
    if (!pr.repo) return;

    if (!repoData[pr.repo]) {
      repoData[pr.repo] = { count: 0, latestActivity: null };
    }

    repoData[pr.repo].count++;

    if (pr.mergedAt && (!repoData[pr.repo].latestActivity || pr.mergedAt > repoData[pr.repo].latestActivity!)) {
      repoData[pr.repo].latestActivity = pr.mergedAt;
    }
  });

  return Object.entries(repoData).map(([name, data]) => ({
    name,
    total_prs: data.count,
    active_prs: data.count,
    latest_activity: data.latestActivity?.toISOString() || null,
  }));
}

export async function getComponentsList() {
  const prs = await prisma.gitHubPR.findMany({
    where: {
      components: { not: '' },
    },
    select: {
      components: true,
    },
  });

  const componentsSet = new Set<string>();

  prs.forEach(pr => {
    if (!pr.components) return;

    let components: Array<{ name: string }> = [];
    try {
      let parsed: any;
      if (typeof pr.components === 'string') {
        parsed = JSON.parse(pr.components);
      } else {
        parsed = pr.components;
      }

      if (!Array.isArray(parsed)) return;

      // Normalize to objects with name property
      components = parsed.map((c: any) => {
        if (typeof c === 'string') {
          return { name: c };
        }
        return c;
      });
    } catch (error) {
      return;
    }

    if (!Array.isArray(components) || components.length === 0) return;

    components.forEach(component => {
      componentsSet.add(component.name);
    });
  });

  return Array.from(componentsSet).sort();
}
