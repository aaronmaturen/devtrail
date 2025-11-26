"use client";

import { useState } from "react";
import {
  Stack,
  Text,
  Paper,
  Textarea,
  Button,
  Center,
  Loader,
  ScrollArea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconSend } from "@tabler/icons-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatPanelProps = {
  documentId: string;
  blockId: string;
  onRevisionReady: (revision: {
    original: string;
    revised: string;
    prompt: string;
  }) => void;
};

export function ChatPanel({
  documentId,
  blockId,
  onRevisionReady,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${blockId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            chatHistory: messages,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      // Strip <revised_content> tags from the display response
      const displayResponse = data.response
        .replace(/<revised_content>[\s\S]*?<\/revised_content>/g, "")
        .trim();

      // Add the assistant response to chat (without the raw revised content)
      if (displayResponse) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: displayResponse },
        ]);
      }

      // If we got revised content, update the pending revision (but keep chat open)
      if (data.hasRevision && data.revisedContent) {
        onRevisionReady({
          original: data.originalContent,
          revised: data.revisedContent,
          prompt: userMessage,
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      notifications.show({
        title: "Error",
        message: "Failed to send message",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Stack h="calc(100vh - 180px)" style={{ display: "flex", flexDirection: "column" }}>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="sm">
          {messages.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              Ask for changes to refine the response. When you&apos;re
              satisfied, the AI will save the final version.
            </Text>
          )}
          {messages.map((msg, i) => (
            <Paper
              key={i}
              p="sm"
              radius="md"
              bg={msg.role === "user" ? "blue.0" : "gray.0"}
            >
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                {msg.role === "user" ? "You" : "Assistant"}
              </Text>
              <MarkdownRenderer
                content={msg.content}
                withBorder={false}
                withPadding={false}
              />
            </Paper>
          ))}
          {loading && (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          )}
        </Stack>
      </ScrollArea>

      <Stack gap="xs" mt="md">
        <Textarea
          placeholder="e.g., Make it more concise, add metrics, change the tone..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={2}
          maxRows={4}
          autosize
        />
        <Button
          onClick={handleSend}
          loading={loading}
          disabled={!input.trim()}
          leftSection={<IconSend size={16} />}
        >
          Send
        </Button>
      </Stack>
    </Stack>
  );
}
