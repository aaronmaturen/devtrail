import { performanceAnalystAgent } from './performance-analyst';
import { goalGeneratorAgent } from './goal-generator';
import { evidenceReviewerAgent } from './evidence-reviewer';
import { reviewAssistantAgent } from './review-assistant';

export const agents = {
  'performance-analyst': performanceAnalystAgent,
  'goal-generator': goalGeneratorAgent,
  'evidence-reviewer': evidenceReviewerAgent,
  'review-assistant': reviewAssistantAgent,
} as const;

export type AgentType = keyof typeof agents;

export function getAgent(agentType: AgentType) {
  const agent = agents[agentType];
  if (!agent) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return agent;
}

export { performanceAnalystAgent, goalGeneratorAgent, evidenceReviewerAgent, reviewAssistantAgent };
