import type { Metadata } from "next";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { AppShellLayout } from "@/components/AppShellLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevTrail - Performance Review Evidence Tracking",
  description:
    "Track your development journey through GitHub PRs, Slack messages, and performance reviews",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <a href="#main-content" className="sr-only">
          Skip to main content
        </a>
        <MantineProvider
          defaultColorScheme="light"
          theme={{
            fontFamily:
              "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif",
            fontFamilyMonospace: "monospace",
            colors: {
              brand: [
                "#e8fcef",
                "#d9f2e2",
                "#b7e2c5",
                "#91d2a7",
                "#71c38d",
                "#5bba7b",
                "#50b673",
                "#40a061",
                "#358f55",
                "#257c46",
              ],
              bark: [
                "#f8f4f0",
                "#ebe3d8",
                "#d4c5b3",
                "#bda68c",
                "#a98b6b",
                "#9d7855",
                "#986e48",
                "#855e3a",
                "#775331",
                "#684726",
              ],
              moss: [
                "#f2f7f2",
                "#e3ebe1",
                "#c5d4c1",
                "#a5bc9e",
                "#8ba880",
                "#799b6c",
                "#6f9460",
                "#5e814f",
                "#527245",
                "#446139",
              ],
              forest: [
                "#f0f5f0",
                "#dfe8df",
                "#bccfbc",
                "#96b596",
                "#769f76",
                "#619061",
                "#558856",
                "#467647",
                "#3c693d",
                "#2f5a2f",
              ],
            },
            primaryColor: "brand",
            defaultRadius: "md",
            shadows: {
              sm: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
              md: "0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)",
              lg: "0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)",
            },
          }}
        >
          <ModalsProvider>
            <Notifications />
            <AppShellLayout>
              <div id="main-content">{children}</div>
            </AppShellLayout>
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
