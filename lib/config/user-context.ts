import { getConfigValue, setConfigValue } from './utils';

export interface UserContext {
  role?: string;
  team?: string;
  yearsExperience?: number;
  focusAreas?: string[];
  achievements?: string[];
  careerGoals?: string[];
  customContext?: string;
}

/**
 * Get user context formatted for AI consumption
 * @returns Formatted user context string or null if not found
 */
export async function getUserContext(): Promise<string | null> {
  const context = await getConfigValue('user_context');
  if (!context) return null;
  
  try {
    // If it's JSON, stringify it nicely for AI consumption
    const parsed = JSON.parse(context);
    if (typeof parsed === 'object') {
      return formatUserContextForAI(parsed);
    }
    return parsed;
  } catch {
    return context;
  }
}

/**
 * Get raw user context object
 * @returns UserContext object or null if not found
 */
export async function getUserContextRaw(): Promise<UserContext | null> {
  const context = await getConfigValue('user_context');
  if (!context) return null;
  
  try {
    return JSON.parse(context);
  } catch {
    return { customContext: context };
  }
}

/**
 * Set user context configuration
 * @param context - UserContext object or string
 */
export async function setUserContext(context: UserContext | string): Promise<void> {
  await setConfigValue('user_context', context, false, 'Personal career context for AI analysis');
}

/**
 * Get company framework document
 * @returns Company framework string or null if not found
 */
export async function getCompanyFramework(): Promise<string | null> {
  const framework = await getConfigValue('company_framework');
  if (!framework) return null;
  
  try {
    return JSON.parse(framework);
  } catch {
    return framework;
  }
}

/**
 * Set company framework document
 * @param framework - Company mission and values framework
 */
export async function setCompanyFramework(framework: string): Promise<void> {
  await setConfigValue('company_framework', framework, false, 'Company mission and values framework');
}

/**
 * Format user context object as a string for AI prompts
 * @param context - UserContext object
 * @returns Formatted string for AI consumption
 */
function formatUserContextForAI(context: UserContext): string {
  const parts: string[] = [];
  
  if (context.role) {
    parts.push(`Role: ${context.role}`);
  }
  if (context.team) {
    parts.push(`Team: ${context.team}`);
  }
  if (context.yearsExperience) {
    parts.push(`Experience: ${context.yearsExperience} years`);
  }
  if (context.focusAreas?.length) {
    parts.push(`Focus Areas: ${context.focusAreas.join(', ')}`);
  }
  if (context.achievements?.length) {
    parts.push(`Key Achievements: ${context.achievements.join('; ')}`);
  }
  if (context.careerGoals?.length) {
    parts.push(`Career Goals: ${context.careerGoals.join('; ')}`);
  }
  if (context.customContext) {
    parts.push(context.customContext);
  }
  
  return parts.join('\n');
}

/**
 * Get combined AI context (user context + company framework)
 * @returns Object with userContext and companyFramework
 */
export async function getAIContext(): Promise<{ 
  userContext: string | null; 
  companyFramework: string | null 
}> {
  const [userContext, companyFramework] = await Promise.all([
    getUserContext(),
    getCompanyFramework(),
  ]);
  
  return { userContext, companyFramework };
}
