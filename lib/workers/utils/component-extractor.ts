/**
 * Extract components/domains from file paths
 * Migrated from scripts/sync.js
 */
export function extractComponents(filePaths: string[]): Record<string, number> {
  const components: Record<string, number> = {};
  const pathDepths: Record<string, number> = {};

  filePaths.forEach((filePath) => {
    if (!filePath) return;

    const segments = filePath.split('/');

    // Skip files at the root level
    if (segments.length <= 1) {
      if (!components['root']) components['root'] = 0;
      components['root']++;
      return;
    }

    // Track all possible path combinations with their depths
    for (let i = 1; i <= segments.length - 1; i++) {
      const pathPrefix = segments.slice(0, i).join('/');
      if (!pathDepths[pathPrefix] || i > pathDepths[pathPrefix]) {
        pathDepths[pathPrefix] = i;
      }

      if (!components[pathPrefix]) components[pathPrefix] = 0;
      components[pathPrefix]++;
    }

    // Handle special cases for common project structures

    // 1. Frontend component directories
    const frontendPatterns = [
      { base: 'src/components', depth: 3 },
      { base: 'app/components', depth: 3 },
      { base: 'src/pages', depth: 3 },
      { base: 'src/views', depth: 3 },
      { base: 'src/containers', depth: 3 },
      { base: 'src/features', depth: 3 },
      { base: 'components', depth: 2 },
    ];

    frontendPatterns.forEach((pattern) => {
      const baseSegments = pattern.base.split('/');
      const matchIndex = segments.findIndex((seg, i) => {
        if (i + baseSegments.length > segments.length) return false;
        return baseSegments.every((baseSeg, j) => segments[i + j] === baseSeg);
      });

      if (matchIndex >= 0 && segments.length > matchIndex + baseSegments.length) {
        const componentName = segments
          .slice(matchIndex, matchIndex + baseSegments.length + 1)
          .join('/');
        if (!components[componentName]) components[componentName] = 0;
        components[componentName] += 2; // Give higher weight to component directories
      }
    });

    // 2. Backend component directories
    const backendPatterns = [
      'controllers',
      'routes',
      'services',
      'models',
      'middleware',
      'utils',
      'helpers',
      'api',
      'lib',
    ];

    backendPatterns.forEach((pattern) => {
      const patternIndex = segments.indexOf(pattern);
      if (patternIndex >= 0 && segments.length > patternIndex + 1) {
        const componentName = segments.slice(0, patternIndex + 2).join('/');
        if (!components[componentName]) components[componentName] = 0;
        components[componentName] += 2; // Give higher weight
      }
    });
  });

  // Sort components by count and return top meaningful ones
  const sortedComponents = Object.entries(components)
    .sort(([, a], [, b]) => b - a)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, number>);

  return sortedComponents;
}
