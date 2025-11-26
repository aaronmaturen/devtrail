# ErrorBoundary Component

React Error Boundary implementation for graceful error handling in the DevTrail application.

## Overview

The `ErrorBoundary` component catches JavaScript errors anywhere in the component tree, logs those errors, and displays a fallback UI instead of crashing the entire application.

## Features

- **Class-based Error Boundary**: Implements React's error boundary lifecycle methods
- **Custom Fallback UI**: Optional custom fallback component support
- **Error Recovery**: "Try Again" button to reset error state
- **TypeScript Support**: Fully typed with proper interfaces
- **HOC Wrapper**: `withErrorBoundary` utility for easy component wrapping
- **Mantine Integration**: Uses Mantine UI components for consistent styling

## Files

- `/Users/aaron/Projects/aaronmaturen/devtrail/components/ErrorBoundary.tsx` - Main component
- `/Users/aaron/Projects/aaronmaturen/devtrail/components/AppShellLayout.tsx` - Layout integration

## Usage

### 1. Basic Usage (Declarative)

Wrap any component or section that might throw errors:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

function MyPage() {
  return (
    <ErrorBoundary>
      <ComponentThatMightError />
    </ErrorBoundary>
  );
}
```

### 2. With Custom Fallback

Provide your own fallback UI:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Alert } from '@mantine/core';

function MyPage() {
  const customFallback = (
    <Alert color="red" title="Chart Error">
      Unable to load chart data. Please refresh the page.
    </Alert>
  );

  return (
    <ErrorBoundary fallback={customFallback}>
      <ComplexChart data={data} />
    </ErrorBoundary>
  );
}
```

### 3. Using the HOC Wrapper

Wrap a component at definition time:

```tsx
import { withErrorBoundary } from '@/components/ErrorBoundary';

function MyChart({ data }: ChartProps) {
  // Component implementation
  return <div>Chart goes here</div>;
}

// Export wrapped version
export default withErrorBoundary(MyChart);

// Or with custom fallback
export default withErrorBoundary(MyChart, <div>Chart failed to load</div>);
```

### 4. Protecting Critical Sections

Wrap individual sections of a page to isolate errors:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

function DashboardPage() {
  return (
    <Container>
      <Title>Dashboard</Title>

      {/* Summary cards - if one fails, others still work */}
      <ErrorBoundary>
        <SummaryCards />
      </ErrorBoundary>

      {/* Charts section - isolated from other sections */}
      <ErrorBoundary>
        <ChartsSection />
      </ErrorBoundary>

      {/* Data table - isolated error handling */}
      <ErrorBoundary>
        <DataTable />
      </ErrorBoundary>
    </Container>
  );
}
```

## Current Implementation

### App Layout Integration

The ErrorBoundary is integrated into the main app layout at:
`/Users/aaron/Projects/aaronmaturen/devtrail/components/AppShellLayout.tsx`

**Main content area:**
```tsx
<AppShell.Main>
  <ErrorBoundary>
    {children}
  </ErrorBoundary>
</AppShell.Main>
```

**Aside panel:**
```tsx
<ScrollArea>
  <ErrorBoundary>
    {content}
  </ErrorBoundary>
</ScrollArea>
```

This ensures that:
- Errors in page content don't crash the navigation/shell
- Errors in aside panels are isolated
- The header and navigation remain functional even if content fails

## Error Boundary Behavior

### What it Catches
- Runtime errors during rendering
- Errors in lifecycle methods
- Errors in constructors of child components

### What it Does NOT Catch
- Errors in event handlers (use try-catch)
- Asynchronous code (setTimeout, promises)
- Server-side rendering errors
- Errors in the error boundary itself

### For Event Handlers

Event handler errors need traditional try-catch:

```tsx
function MyComponent() {
  const handleClick = async () => {
    try {
      await riskyOperation();
    } catch (error) {
      console.error('Operation failed:', error);
      // Handle error appropriately
    }
  };

  return <Button onClick={handleClick}>Do Something</Button>;
}
```

## Default Fallback UI

The default fallback displays:
- Alert triangle icon
- "Something went wrong" heading
- Error message (if available)
- "Try Again" button to reset the error state

Example appearance:
```
┌─────────────────────────────────┐
│         ⚠️                      │
│   Something went wrong          │
│                                 │
│   [Error message here]          │
│                                 │
│      [Try Again Button]         │
└─────────────────────────────────┘
```

## Best Practices

1. **Granular Boundaries**: Place boundaries around independent UI sections
2. **Custom Fallbacks**: Provide context-specific error messages for better UX
3. **Logging**: The component logs errors to console - consider adding error reporting service
4. **Recovery**: The "Try Again" button resets error state - ensure it's safe to retry
5. **Testing**: Test error states by temporarily throwing errors in components

## Example: Wrapping Report Builder Blocks

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

function ReportBuilder() {
  return (
    <div>
      {blocks.map((block) => (
        <ErrorBoundary key={block.id}>
          <ReportBlock block={block} />
        </ErrorBoundary>
      ))}
    </div>
  );
}
```

## Example: Wrapping Dashboard Charts

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

function Dashboard() {
  return (
    <Tabs>
      <Tabs.Panel value="overview">
        <ErrorBoundary>
          <RoleDistributionChart />
        </ErrorBoundary>

        <ErrorBoundary>
          <ComponentMatrixChart />
        </ErrorBoundary>
      </Tabs.Panel>
    </Tabs>
  );
}
```

## TypeScript Interfaces

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
```

## Future Enhancements

Consider adding:
- Error reporting to external service (Sentry, etc.)
- Error boundary reset on route change
- Different UI for different error types
- Error boundary composition for nested error handling strategies
- Development vs production error displays
