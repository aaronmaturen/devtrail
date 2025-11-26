#!/usr/bin/env tsx

/**
 * Import 2024 completed goals into the database
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '../lib/db/prisma';

interface GoalInput {
  title: string;
  description: string;
  category: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  progressPercent: number;
  accomplishments: string[];
}

const goals: GoalInput[] = [
  {
    title: 'Productivity and Results Delivery',
    description: 'Demonstrate consistent high-quality output and proactive communication patterns that align with staff engineer expectations.',
    category: 'DELIVERY',
    specific: 'Demonstrate exceptional documentation and knowledge sharing, strong incremental value delivery, economic decision-making, effective risk management under pressure, and collaborative problem-solving.',
    measurable: `- Receive positive feedback from manager and team members about productivity improvements
- Deliver weekly status updates communicating progress, challenges, and successes
- Meet all project deadlines with documented exceptions`,
    achievable: 'Builds on existing strong technical skills and communication practices.',
    relevant: 'Aligns with staff engineer expectations for productivity and delivery excellence.',
    timeBound: '2024 fiscal year',
    progressPercent: 85,
    accomplishments: [
      'Exceptional Documentation and Knowledge Sharing - Consistently provides comprehensive PR descriptions with usage examples, API documentation, and implementation guidance',
      'Strong Incremental Value Delivery - Demonstrates excellent project decomposition skills by breaking down complex epics into manageable, well-scoped pieces',
      'Economic Decision-Making and Self-Organization - Makes cost-effective technical decisions, such as choosing library upgrades with zero API changes',
      'Effective Risk Management Under Pressure - Successfully handles high-pressure production issues with decisive action',
      'Collaborative Problem-Solving - Proactively identifies and prevents potential blockers for teammates',
    ],
  },
  {
    title: 'Cross-Team Collaboration',
    description: 'Work effectively across multiple teams, demonstrating strong collaboration skills and receiving positive feedback from cross-team partners.',
    category: 'COMMUNICATION',
    specific: 'Participate in cross-team initiatives, demonstrate strong technical communication and knowledge sharing, develop multi-domain technical expertise, and engage with business stakeholders.',
    measurable: `- Receive positive feedback from at least 3 people from other teams
- Participate in 3+ cross-team initiatives
- Lead or drive at least 1 cross-team project`,
    achievable: 'Leverages existing technical communication skills and domain knowledge.',
    relevant: 'Critical for staff engineer level impact across the organization.',
    timeBound: '2024 fiscal year',
    progressPercent: 75,
    accomplishments: [
      'Extensive Cross-Team Initiative Participation - Led multiple initiatives connecting assignment management with provider profile systems',
      'Strong Technical Communication & Knowledge Sharing - Consistently provided detailed PR descriptions with testing instructions, screenshots, and implementation guidance',
      'Multi-Domain Technical Expertise - Successfully integrated features across provider profiles, assignment management, and recommitments systems',
      'Business Stakeholder Engagement - Multiple PRs show evidence of working with product stakeholders on feature requirements',
    ],
  },
  {
    title: 'Data Seeding Optimization and Best Practices',
    description: 'Improve data seeding infrastructure and establish best practices for cross-team data management.',
    category: 'TECHNICAL',
    specific: 'Optimize data seeding processes, establish documentation and best practices, and improve infrastructure collaboration.',
    measurable: `- Improve data seeding efficiency and reliability
- Document best practices for the organization
- Collaborate with backend and infrastructure teams`,
    achievable: 'Builds on existing infrastructure collaboration experience.',
    relevant: 'Supports cross-team efficiency and reduces friction in development workflows.',
    timeBound: '2024 fiscal year',
    progressPercent: 100,
    accomplishments: [
      'Participated in cross-team data seeding projects spanning multiple service domains',
      'Coordinated with backend API teams on data infrastructure',
    ],
  },
];

async function importGoals() {
  console.log('📥 Importing 2024 Completed Goals...\n');

  // Start date: beginning of 2024
  const startDate = new Date('2024-01-01');
  // Completed date: end of 2024
  const completedDate = new Date('2024-12-31');

  for (const goal of goals) {
    try {
      const created = await prisma.goal.create({
        data: {
          title: goal.title,
          description: goal.description,
          category: goal.category,
          status: 'COMPLETED',
          priority: 'HIGH',
          specific: goal.specific,
          measurable: goal.measurable,
          achievable: goal.achievable,
          relevant: goal.relevant,
          timeBound: goal.timeBound,
          startDate,
          targetDate: completedDate,
          completedDate,
          progressPercent: goal.progressPercent,
          generatedFrom: JSON.stringify({
            source: 'manual-import',
            importDate: new Date().toISOString(),
            year: 2024,
          }),
        },
      });

      // Add progress entry with accomplishments
      await prisma.goalProgress.create({
        data: {
          goalId: created.id,
          progressPercent: goal.progressPercent,
          notes: goal.accomplishments.map(a => `- ${a}`).join('\n'),
          aiSummary: `Final progress: ${goal.progressPercent}%`,
        },
      });

      console.log(`  ✓ ${created.title} (${goal.progressPercent}% - COMPLETED)`);
    } catch (error) {
      console.error(`  ✗ Failed to import "${goal.title}":`, error);
    }
  }

  console.log('\n🎉 Import complete!');

  const activeCount = await prisma.goal.count({ where: { status: 'ACTIVE' } });
  const completedCount = await prisma.goal.count({ where: { status: 'COMPLETED' } });
  console.log(`📊 Goals: ${activeCount} active, ${completedCount} completed`);
}

importGoals()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
