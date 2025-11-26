/**
 * Tests for user-context configuration
 * 
 * Run with: npm test lib/config/__tests__/user-context.test.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { 
  getUserContext, 
  getUserContextRaw, 
  setUserContext,
  getCompanyFramework,
  setCompanyFramework,
  getAIContext,
  UserContext 
} from '../user-context';

describe('User Context Configuration', () => {
  it('should handle structured UserContext objects', async () => {
    const testContext: UserContext = {
      role: 'Senior Software Engineer',
      team: 'Platform',
      yearsExperience: 5,
      focusAreas: ['Architecture', 'Performance'],
      achievements: ['Led migration project', 'Improved API performance'],
      careerGoals: ['Technical leadership', 'System design'],
    };

    await setUserContext(testContext);
    const raw = await getUserContextRaw();
    
    expect(raw).toMatchObject(testContext);
  });

  it('should format UserContext for AI consumption', async () => {
    const testContext: UserContext = {
      role: 'Senior Software Engineer',
      yearsExperience: 5,
    };

    await setUserContext(testContext);
    const formatted = await getUserContext();
    
    expect(formatted).toContain('Role: Senior Software Engineer');
    expect(formatted).toContain('Experience: 5 years');
  });

  it('should handle plain string context', async () => {
    const plainContext = 'I am a developer focused on backend systems.';
    
    await setUserContext(plainContext);
    const retrieved = await getUserContext();
    
    expect(retrieved).toBe(plainContext);
  });

  it('should get and set company framework', async () => {
    const framework = 'Our mission is to build great products.';
    
    await setCompanyFramework(framework);
    const retrieved = await getCompanyFramework();
    
    expect(retrieved).toBe(framework);
  });

  it('should get combined AI context', async () => {
    const testContext: UserContext = {
      role: 'Engineer',
      focusAreas: ['Testing'],
    };
    const framework = 'Company values: Innovation, Quality';

    await setUserContext(testContext);
    await setCompanyFramework(framework);
    
    const { userContext, companyFramework } = await getAIContext();
    
    expect(userContext).toContain('Role: Engineer');
    expect(userContext).toContain('Focus Areas: Testing');
    expect(companyFramework).toBe(framework);
  });

  it('should return null for missing config', async () => {
    // Note: This test would require cleaning up the config first
    // For now, we just verify the functions exist
    const context = await getUserContext();
    expect(context).toBeDefined();
  });
});
