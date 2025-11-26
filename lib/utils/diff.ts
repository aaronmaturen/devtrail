/**
 * Simple word-level diff utility
 * Returns an array of diff segments with type: 'unchanged' | 'removed' | 'added'
 */

export type DiffSegment = {
  type: 'unchanged' | 'removed' | 'added';
  text: string;
};

/**
 * Compute word-level diff between two strings
 * Uses a simple LCS-based approach
 */
export function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);

  // Compute LCS matrix
  const lcs = computeLCS(oldWords, newWords);

  // Backtrack to build diff
  return buildDiff(oldWords, newWords, lcs);
}

/**
 * Tokenize text into words while preserving whitespace/punctuation
 */
function tokenize(text: string): string[] {
  // Split on word boundaries but keep the delimiters
  return text.split(/(\s+|(?=[.,!?;:])|(?<=[.,!?;:]))/).filter(t => t.length > 0);
}

/**
 * Compute Longest Common Subsequence matrix
 */
function computeLCS(oldWords: string[], newWords: string[]): number[][] {
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Build diff segments by backtracking through LCS matrix
 */
function buildDiff(oldWords: string[], newWords: string[], lcs: number[][]): DiffSegment[] {
  const result: DiffSegment[] = [];
  let i = oldWords.length;
  let j = newWords.length;

  // Temp arrays to collect consecutive segments
  const temp: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      temp.unshift({ type: 'unchanged', text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      temp.unshift({ type: 'added', text: newWords[j - 1] });
      j--;
    } else if (i > 0) {
      temp.unshift({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive segments of the same type
  for (const segment of temp) {
    const last = result[result.length - 1];
    if (last && last.type === segment.type) {
      last.text += segment.text;
    } else {
      result.push({ ...segment });
    }
  }

  return result;
}

/**
 * Check if diff has any changes
 */
export function hasChanges(diff: DiffSegment[]): boolean {
  return diff.some(s => s.type !== 'unchanged');
}

/**
 * Get just the new text from a diff
 */
export function getNewText(diff: DiffSegment[]): string {
  return diff
    .filter(s => s.type !== 'removed')
    .map(s => s.text)
    .join('');
}

/**
 * Get just the old text from a diff
 */
export function getOldText(diff: DiffSegment[]): string {
  return diff
    .filter(s => s.type !== 'added')
    .map(s => s.text)
    .join('');
}
