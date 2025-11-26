/**
 * TOON (Token-Oriented Object Notation) utilities for LLM prompts
 *
 * TOON is a compact data format that uses ~40% fewer tokens than JSON
 * while maintaining lossless round-trip conversion.
 *
 * @see https://toonformat.dev
 */

import { encode as toonEncode, decode as toonDecode } from '@toon-format/toon';

/**
 * System prompt snippet explaining TOON format to the LLM
 * Include this in system prompts when sending TOON-formatted data
 */
export const TOON_FORMAT_EXPLANATION = `Data in this prompt uses TOON (Token-Oriented Object Notation) format for efficiency.
TOON syntax:
- Arrays: [N]{field1,field2,...}: followed by tab-separated rows
- Objects: fieldName: value (indented)
- Nested objects use indentation
Example: users[2]{id,name}: followed by rows "1\\tAlice" and "2\\tBob"`;

/**
 * Encode any data structure to TOON format
 */
export function encode<T>(data: T): string {
  return toonEncode(data);
}

/**
 * Decode TOON string back to JSON
 */
export function decode<T>(toonString: string): T {
  return toonDecode(toonString) as T;
}

// =============================================================================
// Typed encoders for common data structures
// =============================================================================

export interface CriterionForPrompt {
  id: number;
  area: string;
  subarea: string;
  description: string;
}

/**
 * Encode criteria list for AI prompts
 * Optimized for the uniform array structure
 */
export function encodeCriteria(criteria: CriterionForPrompt[]): string {
  if (criteria.length === 0) return '';
  return toonEncode(criteria);
}

/**
 * Convert database criteria to prompt format
 */
export function mapCriteriaForPrompt(dbCriteria: {
  id: number;
  areaOfConcentration: string;
  subarea: string;
  description: string;
}[]): CriterionForPrompt[] {
  return dbCriteria.map(c => ({
    id: c.id,
    area: c.areaOfConcentration,
    subarea: c.subarea,
    description: c.description,
  }));
}

export interface EvidenceForPrompt {
  id: string;
  type: string;
  summary: string;
  category: string;
  scope: string;
  occurredAt: string;
  // Optional nested data - flattened for efficiency
  prTitle?: string;
  prChanges?: number;
  prComponents?: string;
  jiraKey?: string;
  jiraSummary?: string;
  jiraType?: string;
  slackChannel?: string;
  slackAuthor?: string;
  slackContent?: string;
  confidence?: number;
  criterionId?: number;
}

/**
 * Encode evidence array for AI prompts
 * Flattens nested PR/Jira/Slack data for better TOON compression
 */
export function encodeEvidence(evidence: EvidenceForPrompt[]): string {
  if (evidence.length === 0) return '';
  return toonEncode(evidence);
}

/**
 * Map database evidence to prompt format (flattened)
 */
export function mapEvidenceForPrompt(dbEvidence: {
  id: string;
  type: string;
  summary: string;
  category: string;
  scope: string;
  occurredAt: Date;
  githubPr?: {
    title: string;
    changedFiles: number;
    components: string | null;
  } | null;
  jiraTicket?: {
    key: string;
    summary: string;
    issueType: string;
  } | null;
  slackMessage?: {
    channel: string;
    author: string;
    content: string;
  } | null;
  criteria?: {
    criterionId: number;
    confidence: number;
  }[];
}[]): EvidenceForPrompt[] {
  return dbEvidence.map(e => {
    const base: EvidenceForPrompt = {
      id: e.id,
      type: e.type,
      summary: e.summary,
      category: e.category,
      scope: e.scope,
      occurredAt: e.occurredAt.toISOString().split('T')[0], // Just date, no time
    };

    // Flatten PR data
    if (e.githubPr) {
      base.prTitle = e.githubPr.title;
      base.prChanges = e.githubPr.changedFiles;
      base.prComponents = e.githubPr.components || undefined;
    }

    // Flatten Jira data
    if (e.jiraTicket) {
      base.jiraKey = e.jiraTicket.key;
      base.jiraSummary = e.jiraTicket.summary;
      base.jiraType = e.jiraTicket.issueType;
    }

    // Flatten Slack data
    if (e.slackMessage) {
      base.slackChannel = e.slackMessage.channel;
      base.slackAuthor = e.slackMessage.author;
      base.slackContent = e.slackMessage.content;
    }

    // Top criterion match
    if (e.criteria && e.criteria.length > 0) {
      const top = e.criteria.sort((a, b) => b.confidence - a.confidence)[0];
      base.criterionId = top.criterionId;
      base.confidence = top.confidence;
    }

    return base;
  });
}

export interface ChatMessageForPrompt {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Encode chat history for AI prompts
 */
export function encodeChatHistory(messages: ChatMessageForPrompt[]): string {
  if (messages.length === 0) return '';
  return toonEncode(messages);
}

export interface GoalForPrompt {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  progress: number;
  targetDate: string;
}

/**
 * Encode goals array for AI prompts
 */
export function encodeGoals(goals: GoalForPrompt[]): string {
  if (goals.length === 0) return '';
  return toonEncode(goals);
}

/**
 * Map database goals to prompt format
 */
export function mapGoalsForPrompt(dbGoals: {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  progressPercent: number;
  targetDate: Date | null;
}[]): GoalForPrompt[] {
  return dbGoals.map(g => ({
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    status: g.status,
    progress: g.progressPercent,
    targetDate: g.targetDate?.toISOString().split('T')[0] || '',
  }));
}

export interface ReviewAnalysisForPrompt {
  id: string;
  title: string;
  year: string;
  type: string;
  summary: string;
  themes: string[];
  strengths: string[];
  growthAreas: string[];
}

/**
 * Encode review analyses for AI prompts
 */
export function encodeReviewAnalyses(analyses: ReviewAnalysisForPrompt[]): string {
  if (analyses.length === 0) return '';
  return toonEncode(analyses);
}

/**
 * Map database review analyses to prompt format
 */
export function mapReviewAnalysesForPrompt(dbAnalyses: {
  id: string;
  title: string;
  year: string;
  reviewType: string;
  aiSummary: string | null;
  themes: string | null;
  strengths: string | null;
  growthAreas: string | null;
}[]): ReviewAnalysisForPrompt[] {
  return dbAnalyses.map(a => ({
    id: a.id,
    title: a.title,
    year: a.year,
    type: a.reviewType,
    summary: a.aiSummary || '',
    themes: a.themes ? JSON.parse(a.themes) : [],
    strengths: a.strengths ? JSON.parse(a.strengths) : [],
    growthAreas: a.growthAreas ? JSON.parse(a.growthAreas) : [],
  }));
}

// =============================================================================
// Helper to build prompts with TOON data
// =============================================================================

/**
 * Build a section of a prompt with TOON-formatted data
 * Includes the format explanation if this is the first TOON section
 */
export function buildToonSection(
  label: string,
  toonData: string,
  includeExplanation: boolean = false
): string {
  if (!toonData) return '';

  const explanation = includeExplanation ? `\n${TOON_FORMAT_EXPLANATION}\n` : '';
  return `${explanation}
${label}:
\`\`\`toon
${toonData}
\`\`\``;
}
