#!/usr/bin/env tsx

/**
 * Import 2025 SMART goals directly into the database
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
  timelineMonths: number;
}

const goals: GoalInput[] = [
  {
    title: 'Cross-Team Technical Leadership and Mentoring',
    description: 'Lead 2 cross-team technical initiatives over the next 6 months, formally mentor 3 engineers (including 1 from another team), and establish a monthly "Tech Talk" series where team members present solutions and learnings to foster knowledge sharing and technical growth.',
    category: 'LEADERSHIP',
    specific: 'Lead 2 cross-team technical initiatives over the next 6 months, formally mentor 3 engineers (including 1 from another team), and establish a monthly "Tech Talk" series where team members present solutions and learnings to foster knowledge sharing and technical growth.',
    measurable: `- Successfully deliver 2 technical projects involving coordination across teams
- Conduct bi-weekly 1:1 mentoring sessions with documented growth plans for each mentee
- Host 6 monthly tech talks with 80%+ team attendance and post-session feedback scores of 4/5+
- Receive positive feedback from mentees and cross-team collaborators in performance reviews`,
    achievable: 'Directly addresses staff engineer expectations for mentoring and cross-team influence while building the facilitation and collaboration skills needed for senior technical leadership.',
    relevant: 'Directly addresses staff engineer expectations for mentoring and cross-team influence while building the facilitation and collaboration skills needed for senior technical leadership.',
    timeBound: '6 months',
    timelineMonths: 6,
  },
  {
    title: 'Security-First Culture and Process Improvement',
    description: 'Partner with the security team to conduct a comprehensive security audit of our domain, implement 3 security improvements, and establish a quarterly security review process that includes threat modeling for new features and dependency vulnerability assessments.',
    category: 'TECHNICAL',
    specific: 'Partner with the security team to conduct a comprehensive security audit of our domain, implement 3 security improvements, and establish a quarterly security review process that includes threat modeling for new features and dependency vulnerability assessments.',
    measurable: `- Complete security audit with documented findings and remediation plan
- Implement and deploy 3 security enhancements (e.g., improved authentication, data encryption, input validation)
- Establish documented security review process adopted by the team
- Achieve 100% security review completion for new features over 3 months
- Reduce security-related incidents in our domain by 50%`,
    achievable: 'Addresses the low evidence in security leadership while positioning you as a technical leader who can drive organizational security strategy implementation.',
    relevant: 'Addresses the low evidence in security leadership while positioning you as a technical leader who can drive organizational security strategy implementation.',
    timeBound: '4 months for implementation, ongoing quarterly reviews',
    timelineMonths: 4,
  },
  {
    title: 'Strategic Communication and Stakeholder Alignment',
    description: 'Establish and lead monthly strategic alignment sessions with business stakeholders and engineering teams, create a transparent project communication framework, and implement a structured feedback culture including regular retrospectives and peer feedback sessions.',
    category: 'COMMUNICATION',
    specific: 'Establish and lead monthly strategic alignment sessions with business stakeholders and engineering teams, create a transparent project communication framework, and implement a structured feedback culture including regular retrospectives and peer feedback sessions.',
    measurable: `- Host 6 monthly stakeholder alignment meetings with documented outcomes and action items
- Create and implement a project communication template used across the team
- Establish bi-weekly team retrospectives with 90%+ participation
- Implement 360-degree feedback process with quarterly peer reviews
- Achieve measurable improvement in stakeholder satisfaction scores (target: 4.5/5)
- Reduce project miscommunication incidents by 60%`,
    achievable: 'Directly addresses multiple communication and collaboration gaps while building the strategic thinking and stakeholder management skills essential for staff engineer roles.',
    relevant: 'Directly addresses multiple communication and collaboration gaps while building the strategic thinking and stakeholder management skills essential for staff engineer roles.',
    timeBound: '6 months',
    timelineMonths: 6,
  },
  {
    title: 'Proactive System Reliability and Dependency Management',
    description: 'Develop and implement a comprehensive dependency tracking and risk management system, create automated monitoring for critical system dependencies, and establish a proactive communication protocol for potential blockers and system issues.',
    category: 'TECHNICAL',
    specific: 'Develop and implement a comprehensive dependency tracking and risk management system, create automated monitoring for critical system dependencies, and establish a proactive communication protocol for potential blockers and system issues.',
    measurable: `- Create dependency mapping for all team services with risk assessments
- Implement automated alerts for critical dependency failures
- Establish weekly dependency health reports shared with stakeholders
- Reduce unplanned outages by 40% through proactive issue identification
- Achieve 95% accuracy in predicting and communicating potential blockers before they impact delivery
- Document and share best practices with other teams`,
    achievable: 'Leverages your strong debugging and observability skills while addressing the need for better dependency management and proactive communication - key staff engineer responsibilities.',
    relevant: 'Leverages your strong debugging and observability skills while addressing the need for better dependency management and proactive communication - key staff engineer responsibilities.',
    timeBound: '3 months for implementation, ongoing monitoring and improvement',
    timelineMonths: 3,
  },
];

async function importGoals() {
  console.log('📥 Importing 2025 SMART Goals...\n');

  const now = new Date();

  for (const goal of goals) {
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + goal.timelineMonths);

    try {
      const created = await prisma.goal.create({
        data: {
          title: goal.title,
          description: goal.description,
          category: goal.category,
          status: 'ACTIVE',
          priority: 'HIGH',
          specific: goal.specific,
          measurable: goal.measurable,
          achievable: goal.achievable,
          relevant: goal.relevant,
          timeBound: goal.timeBound,
          startDate: now,
          targetDate,
          progressPercent: 0,
          generatedFrom: JSON.stringify({
            source: 'manual-import',
            importDate: now.toISOString(),
            year: 2025,
          }),
        },
      });

      console.log(`  ✓ ${created.title}`);
      console.log(`    Category: ${created.category} | Target: ${targetDate.toLocaleDateString()}`);
    } catch (error) {
      console.error(`  ✗ Failed to import "${goal.title}":`, error);
    }
  }

  console.log('\n🎉 Import complete!');

  const count = await prisma.goal.count({ where: { status: 'ACTIVE' } });
  console.log(`📊 Total active goals: ${count}`);
}

importGoals()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
