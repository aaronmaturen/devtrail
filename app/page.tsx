'use client';

import { Container, Title, Text, Card, SimpleGrid, Group, ThemeIcon, Stack } from '@mantine/core';
import { IconFileText, IconChartBar, IconTarget, IconRefresh, IconRobot, IconListCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { Hero } from '@/components/Hero';

const features = [
  {
    icon: IconFileText,
    title: 'Evidence',
    description: 'Manage PRs, Slack, and manual evidence',
    href: '/evidence',
    color: 'brand',
  },
  {
    icon: IconChartBar,
    title: 'Reports',
    description: 'Generate and view performance reports',
    href: '/reports',
    color: 'forest',
  },
  {
    icon: IconTarget,
    title: 'Goals',
    description: 'Track and generate SMART career goals',
    href: '/goals',
    color: 'moss',
  },
  {
    icon: IconListCheck,
    title: 'Criteria',
    description: 'View performance review criteria',
    href: '/criteria',
    color: 'moss',
  },
  {
    icon: IconRobot,
    title: 'AI Assistant',
    description: 'Chat with AI agents for insights',
    href: '/assistant',
    color: 'forest',
  },
  {
    icon: IconRefresh,
    title: 'Sync',
    description: 'Sync GitHub PRs and Jira tickets',
    href: '/sync',
    color: 'bark',
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      <Container size="lg" py={60}>
        <Stack gap="xl" align="center">
          <Stack gap="sm" align="center">
            <Title order={2} size={36}>
              Features
            </Title>
            <Text size="lg" c="dimmed" ta="center">
              Everything you need to track and showcase your development impact
            </Text>
          </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg" mt="xl" w="100%">
          {features.map((feature) => (
            <Card
              key={feature.href}
              component={Link}
              href={feature.href}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
              styles={{
                root: {
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 'var(--mantine-shadow-md)',
                  },
                },
              }}
            >
              <Group>
                <ThemeIcon size={40} radius="md" color={feature.color}>
                  <feature.icon size={24} />
                </ThemeIcon>
                <Stack gap={0}>
                  <Text fw={500} size="lg">
                    {feature.title}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {feature.description}
                  </Text>
                </Stack>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
        </Stack>
      </Container>
    </>
  );
}
