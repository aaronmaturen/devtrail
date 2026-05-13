'use client';

import { Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  Stack,
  Center,
  Box,
  Loader,
} from '@mantine/core';
import { IconBrandGithub } from '@tabler/icons-react';
import Image from 'next/image';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  const handleSignIn = () => {
    signIn('github', { callbackUrl });
  };

  return (
    <Paper radius="md" p="xl" withBorder shadow="md">
      <Stack gap="lg">
        <Center>
          <Image
            src="/logo.svg"
            alt="DevTrail Logo"
            width={64}
            height={64}
            priority
          />
        </Center>

        <Stack gap="xs" align="center">
          <Title order={2} ta="center">
            Welcome to DevTrail
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            Track your development journey and build your performance review evidence
          </Text>
        </Stack>

        {error && (
          <Text c="red" size="sm" ta="center">
            {error === 'OAuthAccountNotLinked'
              ? 'This email is already associated with another account.'
              : 'An error occurred during sign in. Please try again.'}
          </Text>
        )}

        <Button
          leftSection={<IconBrandGithub size={20} />}
          variant="filled"
          color="dark"
          size="lg"
          fullWidth
          onClick={handleSignIn}
        >
          Continue with GitHub
        </Button>

        <Text c="dimmed" size="xs" ta="center">
          By signing in, you grant DevTrail access to your GitHub account
          for syncing your pull requests and contributions.
        </Text>
      </Stack>
    </Paper>
  );
}

export default function SignInPage() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--mantine-color-gray-0)',
      }}
    >
      <Container size={420}>
        <Suspense fallback={
          <Paper radius="md" p="xl" withBorder shadow="md">
            <Center><Loader /></Center>
          </Paper>
        }>
          <SignInContent />
        </Suspense>
      </Container>
    </Box>
  );
}
