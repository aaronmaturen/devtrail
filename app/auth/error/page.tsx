'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration.',
  AccessDenied: 'You do not have access to this resource.',
  Verification: 'The verification link has expired or has already been used.',
  OAuthSignin: 'Error starting the OAuth flow. Please try again.',
  OAuthCallback: 'Error completing the OAuth flow. Please try again.',
  OAuthCreateAccount: 'Could not create user account. Please try again.',
  EmailCreateAccount: 'Could not create user account. Please try again.',
  Callback: 'Error during the authentication callback.',
  OAuthAccountNotLinked: 'This email is already associated with another account.',
  EmailSignin: 'Error sending the email. Please try again.',
  CredentialsSignin: 'Invalid credentials. Please try again.',
  SessionRequired: 'You must be signed in to access this page.',
  Default: 'An unexpected error occurred. Please try again.',
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <Paper radius="md" p="xl" withBorder shadow="md">
      <Stack gap="lg">
        <Center>
          <IconAlertCircle size={64} color="var(--mantine-color-red-6)" />
        </Center>

        <Stack gap="xs" align="center">
          <Title order={2} ta="center" c="red">
            Authentication Error
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            {errorMessage}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Button
            component={Link}
            href="/auth/signin"
            variant="filled"
            fullWidth
          >
            Try Again
          </Button>

          <Button
            component={Link}
            href="/"
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            fullWidth
          >
            Back to Home
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function AuthErrorPage() {
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
          <AuthErrorContent />
        </Suspense>
      </Container>
    </Box>
  );
}
