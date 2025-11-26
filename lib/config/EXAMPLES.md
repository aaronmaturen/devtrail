# User Context Configuration Examples

## Setting User Context

### As a Structured Object

```typescript
import { setUserContext, type UserContext } from '@/lib/config';

const context: UserContext = {
  role: 'Senior Software Engineer',
  team: 'Platform Engineering',
  yearsExperience: 8,
  focusAreas: [
    'System Architecture',
    'Performance Optimization',
    'Team Leadership'
  ],
  achievements: [
    'Led migration of monolith to microservices',
    'Reduced API latency by 40%',
    'Mentored 5 junior engineers'
  ],
  careerGoals: [
    'Move into technical leadership role',
    'Develop expertise in distributed systems',
    'Contribute to open source projects'
  ],
};

await setUserContext(context);
```

### As a Plain Text String

```typescript
import { setUserContext } from '@/lib/config';

const context = `
I am a Senior Software Engineer on the Platform team with 8 years of experience.
My focus areas include system architecture, performance optimization, and team leadership.

Key achievements:
- Led migration of monolith to microservices
- Reduced API latency by 40%
- Mentored 5 junior engineers

Career goals:
- Move into technical leadership
- Develop expertise in distributed systems
`;

await setUserContext(context);
```

## Retrieving User Context

### For AI Prompts (Formatted)

```typescript
import { getUserContext } from '@/lib/config';

const context = await getUserContext();
// Returns formatted string like:
// "Role: Senior Software Engineer
//  Team: Platform Engineering
//  Experience: 8 years
//  Focus Areas: System Architecture, Performance Optimization, Team Leadership
//  ..."

// Use in AI system prompts
const systemPrompt = `
You are a performance review assistant.

${context ? `## Developer Context\n${context}\n` : ''}

Help the user write their performance review...
`;
```

### For Programmatic Access (Raw Object)

```typescript
import { getUserContextRaw } from '@/lib/config';

const context = await getUserContextRaw();
// Returns: { role: 'Senior Software Engineer', ... }

if (context?.yearsExperience && context.yearsExperience > 5) {
  console.log('Senior developer detected');
}
```

## Company Framework

### Setting Company Framework

```typescript
import { setCompanyFramework } from '@/lib/config';

const framework = `
# Company Mission
Empower developers to build amazing products faster

# Core Values
1. **Innovation** - Embrace new technologies and ideas
2. **Quality** - Ship reliable, well-tested code
3. **Collaboration** - Work together to achieve goals
4. **Customer Focus** - Put users first in everything we do

# Strategic Pillars 2024
- Platform Stability
- Developer Experience
- Performance & Scale
- Security & Compliance
`;

await setCompanyFramework(framework);
```

### Retrieving Company Framework

```typescript
import { getCompanyFramework } from '@/lib/config';

const framework = await getCompanyFramework();
console.log(framework);
```

## Combined AI Context

### For Report Generation

```typescript
import { getAIContext } from '@/lib/config';

async function generatePerformanceReport() {
  const { userContext, companyFramework } = await getAIContext();
  
  const systemPrompt = `
You are a performance review assistant that helps write professional performance reviews.

${userContext ? `## Developer Context\n${userContext}\n\n` : ''}
${companyFramework ? `## Company Framework\n${companyFramework}\n\n` : ''}

Based on the above context, analyze the following evidence and generate a comprehensive review...
`;
  
  // Use systemPrompt with AI SDK...
}
```

### For Goal Generation

```typescript
import { getAIContext } from '@/lib/config';
import { generateText } from 'ai';

async function generateCareerGoals(strengths: string[], growthAreas: string[]) {
  const { userContext, companyFramework } = await getAIContext();
  
  const prompt = `
${userContext ? `Developer Profile:\n${userContext}\n\n` : ''}
${companyFramework ? `Company Framework:\n${companyFramework}\n\n` : ''}

Current Strengths:
${strengths.map(s => `- ${s}`).join('\n')}

Areas for Growth:
${growthAreas.map(a => `- ${a}`).join('\n')}

Generate 3-5 SMART career goals that:
1. Build on existing strengths
2. Address areas for growth
3. Align with company strategic pillars
4. Are achievable within 6-12 months
`;
  
  const result = await generateText({
    model: yourModel,
    prompt,
  });
  
  return result.text;
}
```

## Integration with Review Analysis

### Using Context in Review Session

```typescript
import { getAIContext } from '@/lib/config';
import { getReviewContext } from '@/lib/services/review-context';

async function generateReviewResponse(question: string) {
  // Get user/company context
  const { userContext, companyFramework } = await getAIContext();
  
  // Get historical review insights
  const reviewContext = await getReviewContext(5);
  
  const systemPrompt = `
You are helping a developer complete their performance review.

${userContext ? `## Developer Profile\n${userContext}\n\n` : ''}
${companyFramework ? `## Company Context\n${companyFramework}\n\n` : ''}

## Past Review Insights
Based on ${reviewContext.recentReviews.length} previous reviews:

Common Strengths:
${reviewContext.allStrengths.slice(0, 5).map(s => `- ${s}`).join('\n')}

Common Growth Areas:
${reviewContext.allGrowthAreas.slice(0, 5).map(a => `- ${a}`).join('\n')}

Recurring Themes:
${reviewContext.commonThemes.slice(0, 3).map(t => `- ${t.theme} (${t.count}x)`).join('\n')}

Now help answer: ${question}
`;
  
  // Generate AI response with full context...
}
```

## Best Practices

1. **Keep Context Updated**: Update user context when role, team, or goals change
2. **Use Structured Format**: Prefer the `UserContext` object format for easier maintenance
3. **Include Specifics**: More specific context leads to better AI personalization
4. **Update Annually**: Refresh company framework yearly or when strategic priorities change
5. **Combine Contexts**: Always use `getAIContext()` to get both contexts together for AI features
