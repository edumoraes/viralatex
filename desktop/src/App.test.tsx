import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (command: string) => {
  if (command === "ensure_ai_service_started") {
    return {
      baseUrl: "http://127.0.0.1:8765",
      provider: "stub",
      healthy: true
    };
  }

  throw new Error(`Unexpected invoke command: ${command}`);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("@tanstack/ai-client", () => ({
  fetchServerSentEvents: vi.fn(() => ({ connect: vi.fn() }))
}));

vi.mock("@tanstack/ai-react", async () => {
  const React = await import("react");

  return {
    useChat: () => {
      const [messages, setMessages] = React.useState<
        Array<{ id: string; role: "user" | "assistant"; parts: Array<{ type: "text"; content: string }> }>
      >([]);
      const [isLoading, setIsLoading] = React.useState(false);
      const [status, setStatus] = React.useState("ready");

      return {
        messages,
        error: null,
        isLoading,
        status,
        clear: () => setMessages([]),
        stop: () => {
          setIsLoading(false);
          setStatus("ready");
        },
        sendMessage: async (prompt: string) => {
          setIsLoading(true);
          setStatus("streaming");
          setMessages((current) => [
            ...current,
            {
              id: `user-${current.length}`,
              role: "user",
              parts: [{ type: "text", content: prompt }]
            }
          ]);

          await new Promise((resolve) => setTimeout(resolve, 25));

          setMessages((current) => [
            ...current,
            {
              id: `assistant-${current.length}`,
              role: "assistant",
              parts: [{ type: "text", content: "Stub provider active." }]
            }
          ]);
          setIsLoading(false);
          setStatus("ready");
        }
      };
    }
  };
});

describe("App chat flow", () => {
  beforeEach(() => {
    invokeMock.mockClear();
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
