import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (command: string) => {
  if (command === "ensure_ai_service_started") {
    return {
      baseUrl: "http://127.0.0.1:8765",
      provider: "stub",
      model: "stub",
      healthy: true
    };
  }

  if (command === "load_ai_provider_config") {
    return {
      provider: "stub",
      hasApiKey: false
    };
  }

  if (command === "update_ai_provider_config") {
    return {
      baseUrl: "http://127.0.0.1:8765",
      provider: "openai",
      model: "openai:gpt-4o-mini",
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
      const streamingIdRef = React.useRef<string | null>(null);

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
                content: "Approved. I updated the requested workspace file."
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
          const streamingId = `assistant-streaming-${crypto.randomUUID()}`;
          streamingIdRef.current = streamingId;
          setMessages((current) => [
            ...current,
            {
              id: streamingId,
              type: "ai",
              content: "Stub DeepAgents"
            }
          ]);

          await new Promise((resolve) => setTimeout(resolve, 25));
          setMessages((current) =>
            current.map((message) =>
              message.id === streamingIdRef.current ? { ...message, content: "Stub DeepAgents runtime active." } : message
            )
          );
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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    invokeMock.mockClear();
    const store = new Map<string, string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "idle",
          values: {
            messages: []
          }
        })
      }))
    );
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
    await screen.findByText("Stub DeepAgents");

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

  it("shows the partial assistant response before streaming finishes", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("State: ready")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Chat prompt"), "stream this");
    await userEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    const chatPanel = screen.getByRole("heading", { name: "Template-aware workspace assistant" }).closest("article");
    expect(chatPanel).not.toBeNull();

    await screen.findByText("State: streaming");
    await waitFor(() => {
      expect(within(chatPanel as HTMLElement).getByText("Stub DeepAgents")).toBeInTheDocument();
    });

    expect(within(chatPanel as HTMLElement).queryByText("Stub DeepAgents runtime active.")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(chatPanel as HTMLElement).getByText("Stub DeepAgents runtime active.")).toBeInTheDocument();
    });
  });

  it("shows provider controls and applies a remote provider config", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByLabelText("AI provider")).toHaveValue("stub");
    expect(screen.queryByLabelText("Provider API key")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("AI provider"), "openai");
    expect(screen.getByLabelText("Provider API key")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Provider API key"), "sk-test"); // pragma: allowlist secret
    await userEvent.click(screen.getAllByRole("button", { name: "Apply provider" })[0]);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_ai_provider_config", {
        config: {
          provider: "openai",
          apiKey: "sk-test" // pragma: allowlist secret
        }
      });
    });

    expect((await screen.findAllByText("openai")).length).toBeGreaterThan(0);
    expect(screen.getByText("openai:gpt-4o-mini")).toBeInTheDocument();
  });
});
