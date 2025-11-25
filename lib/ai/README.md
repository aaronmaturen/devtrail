# DevTrail AI Agents

This directory contains specialized AI agents built with the Vercel AI SDK v6 (ToolLoopAgent) for DevTrail's performance review and career development features.

## Agents

### 1. Performance Analyst (`performance-analyst.ts`)
**Purpose**: Analyzes work accomplishments and provides insights on professional performance

**Capabilities**:
- Analyze pull requests, Slack messages, and manual evidence
- Map evidence to performance review criteria
- Identify patterns and trends in contributions
- Highlight strengths and growth opportunities
- Provide component/domain analysis
- Generate data-driven performance insights

**Tools**:
- `getRecentPRs`: Fetch recent PRs with criteria matching
- `getSlackEvidence`: Retrieve Slack message evidence
- `getManualEvidence`: Get manual evidence entries
- `searchEvidenceByCriteria`: Search by performance criteria
- `getComponentAnalysis`: Analyze contributions by component/domain

**System Instructions**: Expert performance analyst with focus on:
- Engineering Experience (quality, testing, debugging, architecture, security)
- Delivery (incremental value, self-organization, risk management)
- Communication (feedback, documentation, collaboration)
- Influence & Initiative (decision making, mentoring, facilitation)
- Business Impact (strategy, product development)

---

### 2. Goal Generator (`goal-generator.ts`)
**Purpose**: Creates SMART career goals and tracks progress

**Capabilities**:
- Generate SMART goals based on evidence and trends
- Track goal progress and milestones
- Analyze performance trends over time
- Identify strengths and skill gaps
- Provide goal achievement strategies

**Tools**:
- `getPerformanceTrends`: Analyze trends over months
- `getExistingGoals`: Retrieve current goals
- `getStrengthsAndGaps`: Identify strengths and areas for growth
- `createGoal`: Create new SMART goals
- `updateGoalProgress`: Track progress on existing goals

**System Instructions**: Specialized career development coach focusing on:
- Specific, Measurable, Achievable, Relevant, Time-bound goals
- Technical Excellence, Architecture & Design, Quality & Testing
- Leadership & Influence, Communication, Business Impact
- Includes detailed examples of strong SMART goals

---

### 3. Evidence Reviewer (`evidence-reviewer.ts`)
**Purpose**: Reviews, categorizes, and matches evidence to performance criteria

**Capabilities**:
- Review all evidence types (PRs, Slack, manual)
- Match evidence to specific criteria
- Identify evidence gaps and patterns
- Suggest documentation improvements
- Generate evidence statistics

**Tools**:
- `getEvidenceForReview`: Get evidence needing review
- `getEvidenceGaps`: Identify criteria with little evidence
- `updateEvidenceDescription`: Enhance evidence descriptions
- `getSimilarEvidence`: Find similar evidence for categorization
- `getEvidenceStatistics`: Get overall evidence statistics

**System Instructions**: Expert evidence reviewer focusing on:
- Precision in matching criteria
- Pattern recognition and gap identification
- Clear explanations of evidence-criteria alignment
- Constructive suggestions for improvement

---

## Configuration

All agents are configured with:
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Stop Condition**: Maximum 10 steps (`stepCountIs(10)`)
- **Streaming**: Supported via `agent.stream()`

## Usage

### Basic Usage

\`\`\`typescript
import { performanceAnalystAgent, AgentType, getAgent } from '@/lib/ai/agents';

// Use directly
const result = await performanceAnalystAgent.generate({
  prompt: 'Analyze my performance evidence from the last 6 months',
});

// Or get by type
const agent = getAgent(AgentType.PerformanceAnalyst);
const result = await agent.generate({
  prompt: 'What are my key strengths?',
});
\`\`\`

### Streaming Usage

\`\`\`typescript
import { performanceAnalystAgent } from '@/lib/ai/agents';

const stream = performanceAnalystAgent.stream({
  prompt: 'Generate a performance summary',
});

for await (const chunk of stream.textStream) {
  console.log(chunk);
}
\`\`\`

### In API Routes

\`\`\`typescript
import { performanceAnalystAgent } from '@/lib/ai/agents';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: performanceAnalystAgent,
    messages,
  });
}
\`\`\`

## Agent Metadata

Use `getAgentMetadata()` to get agent information for UI display:

\`\`\`typescript
import { getAgentMetadata, AgentType } from '@/lib/ai/agents';

const metadata = getAgentMetadata(AgentType.PerformanceAnalyst);
console.log(metadata.name); // "Performance Analyst"
console.log(metadata.description); // "Analyzes work accomplishments..."
console.log(metadata.capabilities); // Array of capabilities
console.log(metadata.tools); // Array of tool names
\`\`\`

## Helper Functions

- `getAgent(type)`: Get an agent instance by type
- `getAgentMetadata(type)`: Get agent metadata
- `getAllAgentTypes()`: Get all available agent types
- `getAllAgents()`: Get all agents as a map

## Architecture

### ToolLoopAgent Pattern

Each agent follows the ToolLoopAgent pattern from AI SDK v6:
1. **Instructions**: Comprehensive system prompt defining role and behavior
2. **Tools**: Specific database queries and operations via Prisma
3. **Stop Condition**: Configured with `stepCountIs(10)` for thorough analysis
4. **Streaming**: Full support for real-time responses

### Database Integration

Agents use Prisma to query the DevTrail database:
- **EvidenceEntry**: PRs, Slack messages, manual evidence
- **Criterion**: Performance review criteria
- **EvidenceCriterion**: Mappings between evidence and criteria
- **Goal**: Career goals and progress tracking

### Tool Design

Tools are designed to:
- Be specific and focused
- Return structured data
- Handle filtering and pagination
- Provide error handling
- Support date-based queries

## Performance Review Criteria

Agents analyze evidence across 29 specific criteria organized into 5 areas:

1. **Engineering Experience** (9 criteria)
   - Quality & testing
   - Debugging & observability
   - Software design & architecture
   - Security

2. **Delivery** (4 criteria)
   - Incremental value delivery
   - Self-organization

3. **Communication** (6 criteria)
   - Feedback
   - Communication
   - Collaboration

4. **Influence & Initiative** (5 criteria)
   - Decision making
   - Driving alignment
   - Process thinking
   - Facilitation
   - Mentoring

5. **Business Impact** (5 criteria)
   - Business Acumen & Strategy
   - Strategic collaboration
   - Product development

## Development

### Adding New Agents

1. Create agent file in `lib/ai/agents/`
2. Define with `ToolLoopAgent`
3. Add tools using `tool()` from AI SDK
4. Configure `stepCountIs()` stop condition
5. Export agent and type
6. Add to `index.ts` exports
7. Add metadata to `agentMetadata` object

### Adding New Tools

1. Create tool definition in agent file
2. Use Zod for parameter schema
3. Implement execute function with Prisma
4. Return structured data
5. Add error handling

## Dependencies

- `ai@6.0.0-beta.85`: Vercel AI SDK v6
- `@ai-sdk/anthropic@2.0.45`: Anthropic provider
- `@prisma/client`: Database access
- `zod@4.1.12`: Schema validation

## Next Steps

Potential enhancements:
- Add more specialized agents (e.g., Resume Generator, Interview Prep)
- Implement agent orchestration for complex workflows
- Add caching for frequently accessed data
- Create agent testing framework
- Add conversation history management
- Implement tool approval workflow for sensitive operations
