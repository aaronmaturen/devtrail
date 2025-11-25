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
  // Build where clause for Prisma query
  const where: any = {
    type: 'PR',
    prNumber: { not: null },
  };

  // Filter by date range
  const defaultDateFrom = new Date();
  defaultDateFrom.setFullYear(defaultDateFrom.getFullYear() - 1);

  const dateFrom = filterOptions?.dateFrom ? new Date(filterOptions.dateFrom) : defaultDateFrom;
  const dateTo = filterOptions?.dateTo ? new Date(filterOptions.dateTo) : new Date();

  where.mergedAt = {
    gte: dateFrom,
    lte: dateTo,
  };

  // Filter by repositories
  if (filterOptions?.repositories && filterOptions.repositories.length > 0) {
    where.repository = { in: filterOptions.repositories };
  }

  // Fetch PR evidence from database
  const prs = await prisma.evidenceEntry.findMany({
    where,
    select: {
      prNumber: true,
      title: true,
      repository: true,
      mergedAt: true,
      createdAt: true,
      additions: true,
      deletions: true,
      changedFiles: true,
      components: true,
      content: true, // Contains JSON data including jira_key, jira_type, etc.
    },
    orderBy: {
      mergedAt: 'desc',
    },
  });

  // Check if we have GitHub stats data
  const hasStatsData = prs.some(pr => (pr.additions || 0) > 0 || (pr.deletions || 0) > 0);
  const usingPRCounts = !hasStatsData;

  // Analyze components
  const componentData: Record<string, ComponentData> = {};

  prs.forEach(pr => {
    if (!pr.mergedAt || !pr.components) return;

    // Parse components (stored as JSON string or array)
    let components: Array<{ name: string; count?: number; depth?: number; path?: string }> = [];
    try {
      if (typeof pr.components === 'string') {
        components = JSON.parse(pr.components);
      } else {
        components = pr.components as any;
      }
    } catch (error) {
      console.error('Error parsing components:', error);
      return;
    }

    if (!Array.isArray(components)) return;

    // Parse content for Jira info and other data
    let contentData: any = {};
    try {
      if (pr.content) {
        contentData = typeof pr.content === 'string' ? JSON.parse(pr.content) : pr.content;
      }
    } catch (error) {
      console.error('Error parsing content:', error);
    }

    // Calculate PR duration in days
    const durationDays = pr.createdAt && pr.mergedAt
      ? (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

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

      if (pr.repository && !compData.repos.includes(pr.repository)) {
        compData.repos.push(pr.repository);
      }

      if (pr.prNumber) compData.pr_numbers.push(pr.prNumber);
      if (pr.title) compData.pr_titles.push(pr.title);

      if (component.path && !compData.paths.includes(component.path)) {
        compData.paths.push(component.path);
      }

      if (contentData.jira_key && !compData.jira_keys.includes(contentData.jira_key)) {
        compData.jira_keys.push(contentData.jira_key);
      }
      if (contentData.jira_type && !compData.jira_types.includes(contentData.jira_type)) {
        compData.jira_types.push(contentData.jira_type);
      }

      compData.additions += pr.additions || 0;
      compData.deletions += pr.deletions || 0;
      compData.total_changes += (pr.additions || 0) + (pr.deletions || 0);

      compData.total_duration += durationDays;

      if (pr.mergedAt < compData.first_contribution) {
        compData.first_contribution = pr.mergedAt;
      }
      if (pr.mergedAt > compData.last_contribution) {
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
    type: 'PR',
    prNumber: { not: null },
    mergedAt: { not: null },
  };

  if (filterOptions?.dateFrom) {
    where.mergedAt = { ...where.mergedAt, gte: new Date(filterOptions.dateFrom) };
  }
  if (filterOptions?.dateTo) {
    where.mergedAt = { ...where.mergedAt, lte: new Date(filterOptions.dateTo) };
  }
  if (filterOptions?.repositories && filterOptions.repositories.length > 0) {
    where.repository = { in: filterOptions.repositories };
  }

  const prs = await prisma.evidenceEntry.findMany({
    where,
    select: {
      mergedAt: true,
      additions: true,
      deletions: true,
      components: true,
    },
  });

  // Group by month
  const monthlyData: Record<string, Record<string, { pr_count: number; total_changes: number }>> = {};

  prs.forEach(pr => {
    if (!pr.mergedAt || !pr.components) return;

    const monthKey = `${pr.mergedAt.getFullYear()}-${String(pr.mergedAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {};
    }

    let components: Array<{ name: string }> = [];
    try {
      if (typeof pr.components === 'string') {
        components = JSON.parse(pr.components);
      } else {
        components = pr.components as any;
      }
    } catch (error) {
      return;
    }

    if (!Array.isArray(components)) return;

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
  const repos = await prisma.evidenceEntry.groupBy({
    by: ['repository'],
    where: {
      type: 'PR',
      prNumber: { not: null },
      repository: { not: null },
    },
    _count: {
      id: true,
    },
  });

  return Promise.all(
    repos.map(async (repo) => {
      if (!repo.repository) return null;

      const latestPR = await prisma.evidenceEntry.findFirst({
        where: {
          repository: repo.repository,
          type: 'PR',
        },
        orderBy: {
          mergedAt: 'desc',
        },
        select: {
          mergedAt: true,
        },
      });

      return {
        name: repo.repository,
        total_prs: repo._count.id,
        active_prs: repo._count.id, // All are active since we're querying from DB
        latest_activity: latestPR?.mergedAt?.toISOString() || null,
      };
    })
  ).then(repos => repos.filter(r => r !== null));
}

export async function getComponentsList() {
  const prs = await prisma.evidenceEntry.findMany({
    where: {
      type: 'PR',
      prNumber: { not: null },
      components: { not: null },
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
      if (typeof pr.components === 'string') {
        components = JSON.parse(pr.components);
      } else {
        components = pr.components as any;
      }
    } catch (error) {
      return;
    }

    if (!Array.isArray(components)) return;

    components.forEach(component => {
      componentsSet.add(component.name);
    });
  });

  return Array.from(componentsSet).sort();
}
