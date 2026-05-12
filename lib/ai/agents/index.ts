import { performanceAnalystAgent } from './performance-analyst';
import { goalGeneratorAgent } from './goal-generator';
import { evidenceReviewerAgent } from './evidence-reviewer';
import { githubSyncAgent } from './github-sync';
import { jiraSyncAgent } from './jira-sync';
import { reportBuilderAgent } from './report-builder';

export const agents = {
  'performance-analyst': performanceAnalystAgent,
  'goal-generator': goalGeneratorAgent,
  'evidence-reviewer': evidenceReviewerAgent,
  'github-sync': githubSyncAgent,
  'jira-sync': jiraSyncAgent,
  'report-builder': reportBuilderAgent,
} as const;

export type AgentType = keyof typeof agents;

export function getAgent(agentType: AgentType) {
  const agent = agents[agentType];
  if (!agent) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return agent;
}

// Re-export all agents
export {
  performanceAnalystAgent,
  goalGeneratorAgent,
  evidenceReviewerAgent,
  githubSyncAgent,
  jiraSyncAgent,
  reportBuilderAgent,
};

// Sync agents specifically
export const syncAgents = {
  github: githubSyncAgent,
  jira: jiraSyncAgent,
} as const;

export type SyncAgentType = keyof typeof syncAgents;
