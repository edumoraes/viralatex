import { FetchStreamTransport, useStream } from "@langchain/langgraph-sdk/react";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type WorkspaceSummary = {
  rootPath: string;
  workspaceName: string;
  profileName: string;
  availableLanguages: string[];
  templateCount: number;
  blockCount: number;
  resumeCount: number;
  renderHistoryCount: number;
};

type WorkspaceManifest = {
  schemaVersion: number;
  workspaceId: string;
  workspaceName: string;
  defaultTemplateId: string;
};

type Profile = {
  name: string;
  roles: {
    pt: string;
    en: string;
  };
  email: string;
  location: string;
  linkedin: string;
  github: string;
};

type Block = {
  id: string;
  blockType: string;
  language: string;
  section: string;
  title?: string | null;
  subtitle?: string | null;
  dateRange?: string | null;
  content?: string | null;
  items: string[];
  label?: string | null;
  value?: string | null;
};

type ResumeDefinition = {
  id: string;
  title: string;
  language: string;
  roleKey: string;
  blockIds: string[];
};

type RenderResult = {
  jobId: string;
  resumeId: string;
  status: string;
  outputPath?: string | null;
  logPath?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

type AppWorkspaceState = {
  lastSelectedResumeId?: string | null;
};

type WorkspaceSnapshot = {
  summary: WorkspaceSummary;
  manifest: WorkspaceManifest;
  templates: Array<{
    id: string;
    name: string;
    engine: string;
    description?: string | null;
  }>;
  profile: Profile;
  blocks: Block[];
  resumes: ResumeDefinition[];
  renderHistory: RenderResult[];
  appState: AppWorkspaceState;
};

type AiServiceStatus = {
  baseUrl: string;
  provider: string;
  model: string;
  healthy: boolean;
};

type AiProviderConfig = {
  provider: string;
  hasApiKey: boolean;
};

type AiProviderConfigInput = {
  provider: string;
  apiKey?: string;
};

type ChatMessage = {
  id?: string;
  type: string;
  content?: string | Array<{ text?: string; type?: string }>;
};

type ChatInterrupt = {
  id?: string;
  value?: {
    action_requests?: Array<{
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
  when?: string;
};

type ChatState = {
  messages: ChatMessage[];
  __interrupt__?: ChatInterrupt[];
};

type ChatContext = {
  workspaceRoot: string | null;
  workspaceSummary: WorkspaceSummary | null;
  selectedResumeId: string | null;
  availableResumeIds: string[];
};

type ChatSurfaceProps = {
  aiService: AiServiceStatus;
  providerConfig: AiProviderConfig;
  onApplyProviderConfig: (config: AiProviderConfigInput) => Promise<void>;
  context: ChatContext;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
};

async function openWorkspaceDialog(): Promise<WorkspaceSnapshot> {
  return invoke("open_workspace_dialog");
}

async function createSampleWorkspaceDialog(): Promise<WorkspaceSnapshot> {
  return invoke("create_sample_workspace_dialog");
}

async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke("load_workspace_snapshot");
}

async function saveAppWorkspaceState(appState: AppWorkspaceState): Promise<AppWorkspaceState> {
  return invoke("save_app_workspace_state", { appState });
}

async function renderResume(resumeId: string): Promise<RenderResult> {
  return invoke("render_resume", { resumeId });
}

async function ensureAiServiceStarted(): Promise<AiServiceStatus> {
  return invoke("ensure_ai_service_started");
}

async function loadAiProviderConfig(): Promise<AiProviderConfig> {
  return invoke("load_ai_provider_config");
}

async function updateAiProviderConfig(config: AiProviderConfigInput): Promise<AiServiceStatus> {
  return invoke("update_ai_provider_config", { config });
}

async function fetchThreadState(baseUrl: string, threadId: string): Promise<{ status: string; values: ChatState }> {
  const response = await fetch(`${baseUrl}/threads/${encodeURIComponent(threadId)}/state`);
  if (!response.ok) {
    throw new Error(`Failed to load AI thread state: ${response.statusText}`);
  }
  return response.json();
}

function formatTimestamp(value: string): string {
  const timestamp = Number(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString();
}

function renderMessageText(message: ChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => part.text ?? "")
      .filter(Boolean)
      .join("");
  }
  return "";
}

function ChatSurface({
  aiService,
  providerConfig,
  onApplyProviderConfig,
  context,
  busy,
  onBusyChange,
  onError
}: ChatSurfaceProps) {
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(() => localStorage.getItem("resume-studio-ai-thread-id"));
  const [initialValues, setInitialValues] = useState<ChatState | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(providerConfig.provider);
  const [apiKey, setApiKey] = useState("");

  const transport = useMemo(
    () =>
      new FetchStreamTransport<ChatState>({
        apiUrl: `${aiService.baseUrl}/stream`
      }),
    [aiService.baseUrl]
  );

  const stream = useStream<ChatState>({
    transport,
    threadId,
    initialValues,
    onThreadId(nextThreadId: string) {
      setThreadId(nextThreadId);
      localStorage.setItem("resume-studio-ai-thread-id", nextThreadId);
    },
    onError(error: unknown) {
      onError(String(error));
    }
  });

  useEffect(() => {
    onBusyChange(stream.isLoading);
  }, [onBusyChange, stream.isLoading]);

  useEffect(() => {
    if (!threadId) {
      setInitialValues({ messages: [] });
      return;
    }
    let cancelled = false;
    void fetchThreadState(aiService.baseUrl, threadId)
      .then((state) => {
        if (!cancelled) {
          setInitialValues(state.values);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          onError(String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [aiService.baseUrl, onError, threadId]);

  const interrupts = stream.interrupts as ChatInterrupt[];
  const primaryInterrupt = interrupts[0];
  const primaryAction = primaryInterrupt?.value?.action_requests?.[0];
  const proposedContent = typeof primaryAction?.args?.proposed_content === "string" ? primaryAction.args.proposed_content : "";

  useEffect(() => {
    setEditedContent(proposedContent);
  }, [proposedContent]);

  useEffect(() => {
    setSelectedProvider(providerConfig.provider);
    setApiKey("");
  }, [providerConfig]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    setPrompt("");
    try {
      await stream.submit(
        {
          messages: [
            {
              id: crypto.randomUUID(),
              type: "human",
              content: trimmedPrompt
            }
          ]
        },
        {
          context,
          optimisticValues: (current: ChatState) => ({
            messages: [
              ...(current.messages ?? []),
              {
                id: crypto.randomUUID(),
                type: "human",
                content: trimmedPrompt
              }
            ]
          })
        }
      );
    } catch (reason) {
      onError(String(reason));
    }
  }

  async function handleDecision(type: "approve" | "reject" | "edit") {
    try {
      await stream.submit(null, {
        context,
        command: {
          resume: {
            decisions: [
              type === "edit"
                ? {
                    type,
                    edited_action: {
                      proposed_content: editedContent
                    }
                  }
                : {
                    type
                  }
            ]
          }
        }
      });
    } catch (reason) {
      onError(String(reason));
    }
  }

  function handleNewThread() {
    localStorage.removeItem("resume-studio-ai-thread-id");
    setThreadId(null);
    setInitialValues({ messages: [] });
    setEditedContent("");
  }

  async function handleApplyProviderConfig() {
    try {
      await onApplyProviderConfig({
        provider: selectedProvider,
        apiKey: apiKey.trim() || undefined
      });
      setApiKey("");
      handleNewThread();
    } catch (reason) {
      onError(String(reason));
    }
  }

  const status = stream.isLoading ? "streaming" : interrupts.length > 0 ? "interrupted" : "ready";
  const messages = stream.messages as ChatMessage[];
  const requiresApiKey = selectedProvider === "openai" || selectedProvider === "anthropic";

  return (
    <article className="panel chat-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">AI Chat</p>
          <h2>Template-aware workspace assistant</h2>
        </div>
        <div className="chat-meta">
          <span className="chip chip-active">{aiService.provider}</span>
          <span className="chip">{aiService.model}</span>
          <span className="hint">State: {status}</span>
        </div>
      </div>

      <div className="provider-config">
        <div className="provider-config-row">
          <label htmlFor="providerSelect">AI provider</label>
          <select id="providerSelect" value={selectedProvider} disabled={busy} onChange={(event) => setSelectedProvider(event.target.value)}>
            <option value="stub">Stub</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama</option>
          </select>
          <button
            className="secondary"
            type="button"
            disabled={
              busy ||
              (requiresApiKey &&
                !apiKey.trim() &&
                !(selectedProvider === providerConfig.provider && providerConfig.hasApiKey))
            }
            onClick={() => void handleApplyProviderConfig()}
          >
            Apply provider
          </button>
        </div>
        {requiresApiKey ? (
          <div className="provider-config-row">
            <label htmlFor="providerApiKey">Provider API key</label>
            <input
              id="providerApiKey"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={providerConfig.hasApiKey && selectedProvider === providerConfig.provider ? "Saved key is configured. Enter a new one to replace it." : "Paste the API key for the selected provider."}
              disabled={busy}
            />
          </div>
        ) : (
          <p className="hint">Ollama and stub run without an API key.</p>
        )}
      </div>

      <div className="chat-thread">
        {messages.length === 0 ? (
          <div className="placeholder empty-thread">
            <p>Ask for template selection, resume tailoring, or LaTeX compilation.</p>
            <p>The current workspace summary is sent with each prompt.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id ?? `${message.type}-${renderMessageText(message)}`}
              className={message.type === "human" || message.type === "user" ? "message-card message-user" : "message-card"}
            >
              <p className="message-role">{message.type === "human" ? "user" : message.type}</p>
              <p>{renderMessageText(message)}</p>
            </article>
          ))
        )}
      </div>

      {primaryAction ? (
        <div className="result">
          <p>
            <strong>Approval required:</strong> {primaryAction.name || "workspace action"}
          </p>
          {typeof primaryAction.args?.path === "string" ? (
            <p>
              <strong>Target:</strong> {primaryAction.args.path}
            </p>
          ) : null}
          <textarea
            aria-label="Approval edit"
            value={editedContent}
            onChange={(event) => setEditedContent(event.target.value)}
            disabled={busy}
          />
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void handleDecision("approve")}>
              Approve
            </button>
            <button className="secondary" type="button" disabled={busy || !editedContent.trim()} onClick={() => void handleDecision("edit")}>
              Approve edited
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void handleDecision("reject")}>
              Reject
            </button>
          </div>
        </div>
      ) : null}

      <form className="chat-form" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="chatPrompt" className="sr-only">
          Chat prompt
        </label>
        <textarea
          id="chatPrompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the role, the changes you want, or ask the assistant what to render next."
          disabled={busy}
        />
        <div className="button-row">
          <button type="submit" disabled={busy || !aiService.healthy}>
            Send prompt
          </button>
          <button className="secondary" type="button" disabled={!stream.isLoading} onClick={() => void stream.stop()}>
            Stop
          </button>
          <button className="secondary" type="button" disabled={stream.isLoading} onClick={handleNewThread}>
            New thread
          </button>
        </div>
      </form>
    </article>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [aiService, setAiService] = useState<AiServiceStatus | null>(null);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>({
    provider: "stub",
    hasApiKey: false
  });
  const [message, setMessage] = useState("Open a workspace or create a sample workspace.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const resumes = snapshot?.resumes ?? [];
  const renderHistory = snapshot?.renderHistory ?? [];

  useEffect(() => {
    void startAiService();
  }, []);

  useEffect(() => {
    if (!snapshot) {
      setSelectedResumeId("");
      return;
    }

    const snapshotResumes = snapshot.resumes;
    const nextResumeId =
      snapshot.appState.lastSelectedResumeId &&
      snapshotResumes.some((resume) => resume.id === snapshot.appState.lastSelectedResumeId)
        ? snapshot.appState.lastSelectedResumeId
        : snapshotResumes[0]?.id ?? "";

    setSelectedResumeId(nextResumeId);
  }, [snapshot]);

  async function startAiService() {
    try {
      const [config, status] = await Promise.all([loadAiProviderConfig(), ensureAiServiceStarted()]);
      setProviderConfig(config);
      setAiService(status);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleApplyProviderConfig(config: AiProviderConfigInput) {
    setBusy(true);
    setError("");
    try {
      const status = await updateAiProviderConfig(config);
      setProviderConfig({
        provider: config.provider,
        hasApiKey: Boolean(config.apiKey?.trim()) || (config.provider === providerConfig.provider && providerConfig.hasApiKey)
      });
      localStorage.removeItem("resume-studio-ai-thread-id");
      setAiService(status);
      setMessage(`AI provider updated to ${status.provider}.`);
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkspace() {
    const nextSnapshot = await loadWorkspaceSnapshot();
    setSnapshot(nextSnapshot);
  }

  async function handleOpenWorkspace() {
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await openWorkspaceDialog();
      setSnapshot(nextSnapshot);
      setMessage(`Workspace loaded from ${nextSnapshot.summary.rootPath}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSampleWorkspace() {
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await createSampleWorkspaceDialog();
      setSnapshot(nextSnapshot);
      setMessage(`Sample workspace created at ${nextSnapshot.summary.rootPath}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectResume(resumeId: string) {
    setSelectedResumeId(resumeId);
    if (!snapshot) {
      return;
    }

    try {
      await saveAppWorkspaceState({ lastSelectedResumeId: resumeId });
      await refreshWorkspace();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function handleRenderResume() {
    if (!selectedResumeId) {
      setError("Select a resume before rendering.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const nextResult = await renderResume(selectedResumeId);
      setRenderResult(nextResult);
      await saveAppWorkspaceState({ lastSelectedResumeId: selectedResumeId });
      await refreshWorkspace();
      setMessage(`Render finished with status ${nextResult.status}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const chatContext: ChatContext = {
    workspaceRoot: snapshot?.summary.rootPath ?? null,
    workspaceSummary: snapshot?.summary ?? null,
    selectedResumeId: selectedResumeId || null,
    availableResumeIds: resumes.map((resume) => resume.id)
  };

  return (
    <main className="shell">
      <section className="hero hero-single">
        <div>
          <p className="eyebrow">Resume Studio</p>
          <h1>Chat-first local resume workstation</h1>
          <p className="lede">
            Workspace operations stay local in Tauri and LaTeX rendering stays in Rust. The only editable
            surface in the UI is the AI chat, now grounded in app-defined LaTeX templates and workspace documents.
          </p>
        </div>
        <div className="hero-card">
          <div className="button-row">
            <button disabled={busy} onClick={handleOpenWorkspace}>
              Open workspace
            </button>
            <button className="secondary" disabled={busy} onClick={handleCreateSampleWorkspace}>
              Create sample workspace
            </button>
            <button className="secondary" disabled={busy || !selectedResumeId} onClick={handleRenderResume}>
              Render selected resume
            </button>
          </div>
          <p className="hint">{message}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="grid dashboard-grid">
        <article className="panel">
          <div className="section-header">
            <h2>Workspace</h2>
            {snapshot ? <span className="chip">{snapshot.manifest.workspaceId}</span> : null}
          </div>
          {snapshot ? (
            <dl className="stats">
              <div>
                <dt>Name</dt>
                <dd>{snapshot.summary.workspaceName}</dd>
              </div>
              <div>
                <dt>Root</dt>
                <dd>{snapshot.summary.rootPath}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{snapshot.summary.profileName}</dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>{snapshot.summary.availableLanguages.join(", ")}</dd>
              </div>
              <div>
                <dt>Blocks</dt>
                <dd>{snapshot.summary.blockCount}</dd>
              </div>
              <div>
                <dt>Templates</dt>
                <dd>{snapshot.summary.templateCount}</dd>
              </div>
              <div>
                <dt>Renders</dt>
                <dd>{snapshot.summary.renderHistoryCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="placeholder">No workspace selected.</p>
          )}
        </article>

        <article className="panel">
          <div className="section-header">
            <h2>Resumes</h2>
            {selectedResumeId ? <span className="chip chip-active">{selectedResumeId}</span> : null}
          </div>
          {resumes.length === 0 ? (
            <p className="placeholder">Open a workspace to select a resume.</p>
          ) : (
            <div className="picker-list">
              {resumes.map((resume) => (
                <button
                  key={resume.id}
                  className={selectedResumeId === resume.id ? "chip chip-active" : "chip"}
                  disabled={busy}
                  onClick={() => {
                    void handleSelectResume(resume.id);
                  }}
                >
                  {resume.title} ({resume.language})
                </button>
              ))}
            </div>
          )}
          {renderResult ? (
            <div className="result">
              <p>
                <strong>Status:</strong> {renderResult.status}
              </p>
              <p>
                <strong>PDF:</strong> {renderResult.outputPath || "Unavailable"}
              </p>
              <p>
                <strong>Log:</strong> {renderResult.logPath || "Unavailable"}
              </p>
              {renderResult.errorMessage ? <p className="error">{renderResult.errorMessage}</p> : null}
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="section-header">
            <h2>Recent renders</h2>
            {aiService ? <span className="chip">{aiService.provider}</span> : null}
          </div>
          {renderHistory.length === 0 ? (
            <p className="placeholder">No render history persisted in this workspace yet.</p>
          ) : (
            <div className="history-list">
              {renderHistory.slice(0, 4).map((entry) => (
                <div key={entry.jobId} className="history-card">
                  <p>
                    <strong>{entry.resumeId}</strong> · {entry.status}
                  </p>
                  <p>{formatTimestamp(entry.createdAt)}</p>
                  <p>{entry.outputPath || entry.logPath || "No artifact path recorded."}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      {aiService ? (
        <ChatSurface
          key={`${aiService.baseUrl}:${aiService.provider}:${aiService.model}`}
          aiService={aiService}
          providerConfig={providerConfig}
          onApplyProviderConfig={handleApplyProviderConfig}
          context={chatContext}
          busy={busy}
          onBusyChange={setBusy}
          onError={setError}
        />
      ) : (
        <article className="panel">
          <h2>AI Chat</h2>
          <p className="placeholder">Starting the local AI sidecar.</p>
        </article>
      )}
    </main>
  );
}
