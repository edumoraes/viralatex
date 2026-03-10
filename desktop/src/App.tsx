import { useEffect, useMemo, useState } from "react";
import { fetchServerSentEvents } from "@tanstack/ai-client";
import { useChat, type UIMessage } from "@tanstack/ai-react";
import { invoke } from "@tauri-apps/api/core";

type WorkspaceSummary = {
  rootPath: string;
  workspaceName: string;
  profileName: string;
  availableLanguages: string[];
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
  profile: Profile;
  blocks: Block[];
  resumes: ResumeDefinition[];
  renderHistory: RenderResult[];
  appState: AppWorkspaceState;
};

type AiServiceStatus = {
  baseUrl: string;
  provider: string;
  healthy: boolean;
};

type ChatContext = {
  workspaceRoot: string | null;
  workspaceSummary: WorkspaceSummary | null;
  selectedResumeId: string | null;
  availableResumeIds: string[];
};

type ChatSurfaceProps = {
  aiService: AiServiceStatus;
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

function formatTimestamp(value: string): string {
  const timestamp = Number(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString();
}

function renderMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("");
}

function ChatSurface({ aiService, context, busy, onBusyChange, onError }: ChatSurfaceProps) {
  const [prompt, setPrompt] = useState("");

  const body = useMemo(
    () => ({
      data: {
        context
      }
    }),
    [context]
  );

  const { messages, sendMessage, clear, error, isLoading, status, stop } = useChat({
    connection: fetchServerSentEvents(`${aiService.baseUrl}/chat`),
    body
  });

  useEffect(() => {
    onBusyChange(isLoading);
  }, [isLoading, onBusyChange]);

  useEffect(() => {
    if (error) {
      onError(error.message);
    }
  }, [error, onError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    setPrompt("");
    try {
      await sendMessage(trimmedPrompt);
    } catch (reason) {
      onError(String(reason));
    }
  }

  return (
    <article className="panel chat-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">AI Chat</p>
          <h2>Prompt-first workspace assistant</h2>
        </div>
        <div className="chat-meta">
          <span className="chip chip-active">{aiService.provider}</span>
          <span className="hint">State: {status}</span>
        </div>
      </div>

      <div className="chat-thread">
        {messages.length === 0 ? (
          <div className="placeholder empty-thread">
            <p>Ask for resume tailoring, rendering guidance, or workspace inspection.</p>
            <p>The current workspace summary is sent with each prompt.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={message.role === "user" ? "message-card message-user" : "message-card"}
            >
              <p className="message-role">{message.role}</p>
              <p>{renderMessageText(message)}</p>
            </article>
          ))
        )}
      </div>

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
          <button className="secondary" type="button" disabled={!isLoading} onClick={stop}>
            Stop
          </button>
          <button className="secondary" type="button" disabled={isLoading || messages.length === 0} onClick={clear}>
            Clear thread
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

    const nextResumeId =
      snapshot.appState.lastSelectedResumeId && resumes.some((resume) => resume.id === snapshot.appState.lastSelectedResumeId)
        ? snapshot.appState.lastSelectedResumeId
        : resumes[0]?.id ?? "";

    setSelectedResumeId(nextResumeId);
  }, [snapshot, resumes]);

  async function startAiService() {
    try {
      const status = await ensureAiServiceStarted();
      setAiService(status);
    } catch (reason) {
      setError(String(reason));
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
            surface in the UI is the AI chat.
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
          key={aiService.baseUrl}
          aiService={aiService}
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
