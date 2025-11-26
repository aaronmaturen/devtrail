# Configuration Module

Centralized configuration utilities for accessing and managing application settings stored in the database `Config` table.

## Overview

This module provides a clean API for managing user context, company frameworks, and other configuration values that AI features need for personalized analysis.

## Files

- **`utils.ts`** - Core config database operations (get/set/delete)
- **`user-context.ts`** - User context and company framework management
- **`index.ts`** - Barrel exports for easy importing

## Usage

### Basic Configuration Operations

```typescript
import { getConfigValue, setConfigValue } from '@/lib/config';

// Get a config value
const value = await getConfigValue('some_key');

// Set a config value
await setConfigValue('some_key', 'some_value', 'Optional description');
```

### User Context

User context provides personal career information for AI analysis.

```typescript
import { getUserContext, setUserContext, type UserContext } from '@/lib/config';

// Set structured user context
const context: UserContext = {
  role: 'Senior Software Engineer',
  team: 'Platform',
  yearsExperience: 5,
  focusAreas: ['Architecture', 'Performance'],
  achievements: ['Led migration project'],
  careerGoals: ['Technical leadership'],
};
await setUserContext(context);

// Get formatted context for AI prompts
const aiContext = await getUserContext();
// Returns: "Role: Senior Software Engineer\nTeam: Platform\n..."

// Get raw context object
const rawContext = await getUserContextRaw();
// Returns: { role: 'Senior Software Engineer', ... }
```

### Company Framework

Company framework provides organizational context (mission, values, strategic pillars).

```typescript
import { getCompanyFramework, setCompanyFramework } from '@/lib/config';

const framework = `
# Company Mission
Build tools that empower developers...

# Core Values
- Innovation
- Quality
- Customer Focus
`;

await setCompanyFramework(framework);
const retrieved = await getCompanyFramework();
```

### Combined AI Context

Get both user context and company framework in one call:

```typescript
import { getAIContext } from '@/lib/config';

const { userContext, companyFramework } = await getAIContext();

// Use in AI prompts
const systemPrompt = `
${userContext ? `## Developer Context\n${userContext}\n` : ''}
${companyFramework ? `## Company Framework\n${companyFramework}\n` : ''}
`;
```

## Integration with Existing Code

This module centralizes functionality previously scattered across:
- `/lib/services/review-context.ts` - Review analysis context
- `/lib/ai/config.ts` - AI model configuration

The new module follows the same patterns but provides a cleaner, more focused API.

## Database Schema

Configuration is stored in the `Config` table:

```prisma
model Config {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String   // JSON-encoded value
  encrypted   Boolean  @default(false)
  description String?
  updatedAt   DateTime @updatedAt
}
```

## Special Config Keys

- `user_context` - Personal career context for AI (role, achievements, goals)
- `company_framework` - Company mission/values framework for AI context

## Testing

Run tests with:

```bash
npm test lib/config/__tests__/user-context.test.ts
```

## Migration Notes

This module is designed to work alongside the existing `/lib/services/review-context.ts`. Future refactoring may consolidate these modules further.
