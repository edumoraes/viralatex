import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (command: string) => {
  if (command === "ensure_ai_service_started") {
    return {
      baseUrl: "http://127.0.0.1:8765",
      provider: "stub",
      model: "stub",
      healthy: true
    };
  }

  throw new Error(`Unexpected invoke command: ${command}`);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("@langchain/langgraph-sdk/react", async () => {
  const React = await import("react");

  class FetchStreamTransport {}

  return {
    FetchStreamTransport,
    useStream: ({ onThreadId }: { onThreadId?: (threadId: string) => void }) => {
      const [messages, setMessages] = React.useState<Array<{ id: string; type: string; content: string }>>([]);
      const [isLoading, setIsLoading] = React.useState(false);
      const [interrupts, setInterrupts] = React.useState<Array<unknown>>([]);

      return {
        messages,
        isLoading,
        interrupts,
        interrupt: interrupts[0],
        error: null,
        stop: async () => {
          setIsLoading(false);
        },
        submit: async (values: { messages?: Array<{ id: string; type: string; content: string }> } | null, options?: { command?: unknown }) => {
          if (options?.command) {
            setInterrupts([]);
            setMessages((current) => [
              ...current,
              {
                id: `assistant-${current.length}`,
                type: "ai",
                content: "Approved. I updated the summary-en block in the workspace."
              }
            ]);
            return;
          }

          setIsLoading(true);
          onThreadId?.("thread-test");
          if (values?.messages?.length) {
            setMessages((current) => [...current, ...(values.messages ?? [])]);
          }

          await new Promise((resolve) => setTimeout(resolve, 25));

          setMessages((current) => [
            ...current,
            {
              id: `assistant-${current.length}`,
              type: "ai",
              content: "Stub DeepAgents runtime active."
            }
          ]);
          setIsLoading(false);
        },
        toolCalls: [],
        getToolCalls: () => [],
        subagents: new Map(),
        activeSubagents: [],
        getSubagent: () => undefined,
        getSubagentsByType: () => [],
        getSubagentsByMessage: () => [],
        values: { messages },
      };
    }
  };
});

describe("App chat flow", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        }
      }
    });
  });

  it("leaves streaming and allows another prompt without stop", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("State: ready")).toBeInTheDocument();

    const promptField = screen.getByLabelText("Chat prompt");
    await userEvent.type(promptField, "oi");
    await userEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    await screen.findByText("State: streaming");
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText("State: ready")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
    });

    await userEvent.type(screen.getByLabelText("Chat prompt"), "de novo");
    await userEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    await waitFor(() => {
      expect(screen.getAllByText("State: ready")[0]).toBeInTheDocument();
    });
  });
});
