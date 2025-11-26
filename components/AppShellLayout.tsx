'use client';

import { AppShell, Group, Text, CloseButton, ScrollArea } from '@mantine/core';
import { AsideProvider, useAside } from '@/contexts/AsideContext';
import { Header } from './Header';
import { ErrorBoundary } from './ErrorBoundary';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isOpen, close, content, title } = useAside();

  return (
    <AppShell
      header={{ height: 60 }}
      aside={{
        width: 400,
        breakpoint: 'sm',
        collapsed: { mobile: !isOpen, desktop: !isOpen },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>

      <AppShell.Main>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </AppShell.Main>

      {isOpen && (
        <AppShell.Aside p="md">
          <Group justify="space-between" mb="md">
            <Text fw={600}>{title || 'Panel'}</Text>
            <CloseButton onClick={close} />
          </Group>
          <ScrollArea style={{ height: 'calc(100vh - 140px)' }}>
            <ErrorBoundary>
              {content}
            </ErrorBoundary>
          </ScrollArea>
        </AppShell.Aside>
      )}
    </AppShell>
  );
}

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AsideProvider>
      <AppShellInner>{children}</AppShellInner>
    </AsideProvider>
  );
}
