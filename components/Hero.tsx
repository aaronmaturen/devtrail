import { Container, Stack, Text, Button, Group, useMantineTheme } from '@mantine/core';
import Image from 'next/image';
import Link from 'next/link';
import { IconRocket, IconSettings } from '@tabler/icons-react';

export function Hero() {
  const theme = useMantineTheme();

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${theme.colors.violet[8]} 0%, ${theme.colors.grape[9]} 100%)`,
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'url(/topography-themed.svg)',
        opacity: 0.1,
        color: theme.colors.violet[0],
      }} />
      <Container size="xl" py={80} style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '3rem',
          alignItems: 'center',
        }}>
          {/* Left Column - Content */}
          <Stack gap="xl">
            {/* Wordmark */}
            <div style={{ maxWidth: '400px' }}>
              <Image
                src="/wordmark.svg"
                alt="DevTrail"
                width={449}
                height={195}
                priority
                style={{
                  width: '100%',
                  height: 'auto',
                  filter: 'brightness(0) invert(1)', // Make it white
                }}
              />
            </div>

            <Text size="xl" c="white" style={{ opacity: 0.95 }}>
              Track your development journey through GitHub PRs, Slack messages, and performance reviews.
              Generate insights, set SMART goals, and showcase your impact with AI-powered analysis.
            </Text>

            <Group>
              <Button
                component={Link}
                href="/sync"
                size="lg"
                leftSection={<IconRocket size={20} />}
                variant="white"
                color="dark"
              >
                Get Started
              </Button>
              <Button
                component={Link}
                href="/settings"
                size="lg"
                leftSection={<IconSettings size={20} />}
                variant="outline"
                style={{
                  borderColor: 'white',
                  color: 'white',
                }}
              >
                Configure
              </Button>
            </Group>
          </Stack>

          {/* Right Column - Hero Image */}
          <div style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <Image
              src="/hero.png"
              alt="DevTrail Dashboard"
              width={1200}
              height={800}
              priority
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
        </div>
      </Container>
    </div>
  );
}
