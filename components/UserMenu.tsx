'use client';

import { useSession, signOut } from 'next-auth/react';
import {
  Menu,
  UnstyledButton,
  Avatar,
  Text,
  Group,
  Skeleton,
} from '@mantine/core';
import {
  IconLogout,
  IconSettings,
  IconChevronDown,
  IconBrandGithub,
} from '@tabler/icons-react';
import Link from 'next/link';
import classes from './UserMenu.module.css';

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <Skeleton height={36} width={120} radius="xl" />;
  }

  if (!session?.user) {
    return null;
  }

  const { user } = session;

  return (
    <Menu
      width={200}
      position="bottom-end"
      transitionProps={{ transition: 'pop-top-right' }}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton className={classes.user}>
          <Group gap={7}>
            <Avatar
              src={user.image}
              alt={user.name || 'User'}
              radius="xl"
              size={28}
            />
            <Text fw={500} size="sm" lh={1} mr={3} visibleFrom="sm">
              {user.name || user.email}
            </Text>
            <IconChevronDown size={12} stroke={1.5} />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Account</Menu.Label>

        <Menu.Item
          leftSection={<IconBrandGithub size={14} />}
          disabled
        >
          <Text size="xs" c="dimmed">
            Connected as {user.email}
          </Text>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          component={Link}
          href="/settings"
          leftSection={<IconSettings size={14} />}
        >
          Settings
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          color="red"
          leftSection={<IconLogout size={14} />}
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
