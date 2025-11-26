/**
 * Evidence Type Mappings
 *
 * Centralized type mapping definitions for evidence entries.
 * This is the single source of truth for type conversions between
 * internal database types and display types used in the UI.
 */

/**
 * Map internal database Evidence types to display types
 *
 * Internal types are stored in the database and represent specific
 * actions (e.g., PR_AUTHORED, PR_REVIEWED).
 * Display types are shown in the UI and group related internal types
 * (e.g., all PR-related types map to 'PR').
 */
export const typeDisplayMap: Record<string, string> = {
  // GitHub types
  PR_AUTHORED: 'PR',
  PR_REVIEWED: 'PR',
  ISSUE_CREATED: 'PR',
  GITHUB_PR: 'PR',
  GITHUB_ISSUE: 'PR',
  // Jira types
  JIRA_OWNED: 'JIRA',
  JIRA_REVIEWED: 'JIRA',
  JIRA: 'JIRA',
  // Other types
  SLACK: 'SLACK',
  MANUAL: 'MANUAL',
} as const;

/**
 * Map display types to internal database types
 *
 * Used when filtering evidence by display type - converts the
 * display type (e.g., 'PR') to all possible internal types that
 * should be included in the query.
 */
export const displayToInternalTypes: Record<string, string[]> = {
  PR: ['PR_AUTHORED', 'PR_REVIEWED', 'ISSUE_CREATED', 'GITHUB_PR', 'GITHUB_ISSUE'],
  JIRA: ['JIRA_OWNED', 'JIRA_REVIEWED', 'JIRA'],
  SLACK: ['SLACK'],
  MANUAL: ['MANUAL'],
  REVIEW: ['MANUAL'],
} as const;

/**
 * Map display types to internal types for creating new evidence
 *
 * When creating new evidence from the UI, this map converts the
 * display type to the appropriate internal type to store in the database.
 */
export const displayToInternalType: Record<string, string> = {
  PR: 'PR_AUTHORED',
  SLACK: 'SLACK',
  REVIEW: 'MANUAL',
  MANUAL: 'MANUAL',
  JIRA: 'JIRA_OWNED',
} as const;

/**
 * All valid display types
 */
export type DisplayType = 'PR' | 'JIRA' | 'SLACK' | 'MANUAL' | 'REVIEW';

/**
 * All valid internal types
 */
export type InternalType =
  | 'PR_AUTHORED'
  | 'PR_REVIEWED'
  | 'ISSUE_CREATED'
  | 'GITHUB_PR'
  | 'GITHUB_ISSUE'
  | 'JIRA_OWNED'
  | 'JIRA_REVIEWED'
  | 'JIRA'
  | 'SLACK'
  | 'MANUAL';
