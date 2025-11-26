"use client";

import {
  Group,
  Container,
  Menu,
  Center,
  Burger,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  IconFileText,
  IconTarget,
  IconChartBar,
  IconRefresh,
  IconRobot,
  IconSettings,
  IconClipboardText,
  IconListCheck,
  IconChevronDown,
  IconDashboard,
  IconSparkles,
  IconLayoutBoard,
} from "@tabler/icons-react";
import classes from "./Header.module.css";

const links = [
  { link: "/dashboard", label: "Dashboard", icon: IconDashboard },
  {
    link: "#data",
    label: "Data",
    links: [
      { link: "/evidence", label: "Evidence", icon: IconFileText },
      { link: "/criteria", label: "Criteria", icon: IconListCheck },
      { link: "/reports", label: "Reports", icon: IconChartBar },
    ],
  },
  {
    link: "#reviews",
    label: "Reviews",
    links: [
      { link: "/reviews", label: "Documents", icon: IconClipboardText },
      { link: "/reviews/interactive", label: "Interactive Review", icon: IconSparkles },
      { link: "/report-builder", label: "Report Builder", icon: IconLayoutBoard },
    ],
  },
  {
    link: "#tools",
    label: "Tools",
    links: [
      { link: "/goals", label: "Goals", icon: IconTarget },
      { link: "/sync", label: "Sync", icon: IconRefresh },
      { link: "/assistant", label: "Assistant", icon: IconRobot },
    ],
  },
  { link: "/settings", label: "Settings", icon: IconSettings },
];

export function Header() {
  const [opened, { toggle }] = useDisclosure(false);
  const pathname = usePathname();

  const items = links.map((link) => {
    const menuItems = link.links?.map((item) => {
      const Icon = item.icon;
      const isActive =
        pathname === item.link ||
        (item.link !== "/" && pathname.startsWith(item.link));

      return (
        <Menu.Item
          key={item.link}
          component={Link}
          href={item.link}
          leftSection={Icon && <Icon size={16} />}
          className={isActive ? classes.linkActive : ""}
        >
          {item.label}
        </Menu.Item>
      );
    });

    if (menuItems) {
      return (
        <Menu
          key={link.label}
          trigger="hover"
          transitionProps={{ exitDuration: 0 }}
          withinPortal
        >
          <Menu.Target>
            <a href={link.link} className={classes.link}>
              <Center>
                <span className={classes.linkLabel}>{link.label}</span>
                <IconChevronDown size={14} stroke={1.5} />
              </Center>
            </a>
          </Menu.Target>
          <Menu.Dropdown>{menuItems}</Menu.Dropdown>
        </Menu>
      );
    }

    const Icon = link.icon;
    const isActive =
      pathname === link.link ||
      (link.link !== "/" && pathname.startsWith(link.link));

    return (
      <Link
        key={link.label}
        href={link.link}
        className={`${classes.link} ${isActive ? classes.linkActive : ""}`}
      >
        <Center>
          {Icon && <Icon size={16} style={{ marginRight: 5 }} />}
          {link.label}
        </Center>
      </Link>
    );
  });

  return (
    <header className={classes.header}>
      <Container size="xl">
        <div className={classes.inner}>
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Image
              src="/logo.svg"
              alt="DevTrail Logo"
              width={32}
              height={32}
              priority
            />
          </Link>

          <Group gap={5} visibleFrom="sm">
            {items}
          </Group>

          <Burger opened={opened} onClick={toggle} size="sm" hiddenFrom="sm" aria-label="Toggle navigation menu" />
        </div>
      </Container>
    </header>
  );
}
