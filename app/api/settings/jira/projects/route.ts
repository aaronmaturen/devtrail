import { NextRequest, NextResponse } from 'next/server';
import { Version3Client } from 'jira.js';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/settings/jira/projects
 * Fetches available Jira projects using the stored credentials
 */
export async function GET(request: NextRequest) {
  try {
    // Get Jira config
    const [hostConfig, emailConfig, tokenConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'jira_host' } }),
      prisma.config.findUnique({ where: { key: 'jira_email' } }),
      prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
    ]);

    if (!hostConfig?.value || !emailConfig?.value || !tokenConfig?.value) {
      return NextResponse.json(
        { error: 'Jira credentials not fully configured' },
        { status: 400 }
      );
    }

    const host = JSON.parse(hostConfig.value);
    const email = JSON.parse(emailConfig.value);
    const token = JSON.parse(tokenConfig.value);

    // Initialize Jira client
    const jira = new Version3Client({
      host: `https://${host}`,
      authentication: {
        basic: {
          email,
          apiToken: token,
        },
      },
    });

    try {
      // Fetch projects using jira.js
      const response = await jira.projects.searchProjects();
      const projects = response.values || [];

      // Format the projects
      const formattedProjects = projects.map((project: any) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        projectTypeKey: project.projectTypeKey,
        avatarUrl: project.avatarUrls?.['48x48'],
        lead: project.lead?.displayName,
      }));

      return NextResponse.json({ projects: formattedProjects });
    } catch (error: any) {
      // jira-client throws errors for auth issues
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        return NextResponse.json(
          { error: 'Invalid Jira credentials', details: error.message },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to connect to Jira', details: error.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to fetch Jira projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
