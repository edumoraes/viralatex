import { useEffect, useState } from "react";
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

type LlmTaskResult = {
  taskType: string;
  status: string;
  provider: string;
  outputText: string;
  warnings: string[];
};

const DEFAULT_WORKSPACE_PATH = "/tmp/resume-studio-workspace";

const EMPTY_PROFILE: Profile = {
  name: "",
  roles: { pt: "", en: "" },
  email: "",
  location: "",
  linkedin: "",
  github: ""
};

const EMPTY_BLOCK: Block = {
  id: "",
  blockType: "summary",
  language: "en",
  section: "summary",
  title: "",
  subtitle: "",
  dateRange: "",
  content: "",
  items: [],
  label: "",
  value: ""
};

const EMPTY_RESUME: ResumeDefinition = {
  id: "",
  title: "",
  language: "en",
  roleKey: "en",
  blockIds: []
};

async function createSampleWorkspace(path: string): Promise<WorkspaceSnapshot> {
  return invoke("create_sample_workspace", { path });
}

async function selectWorkspace(path: string): Promise<WorkspaceSnapshot> {
  return invoke("select_workspace", { path });
}

async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke("load_workspace_snapshot");
}

async function saveProfile(profile: Profile): Promise<Profile> {
  return invoke("save_profile", { profile });
}

async function createBlock(block: Block): Promise<Block> {
  return invoke("create_block", { block });
}

async function updateBlock(block: Block): Promise<Block> {
  return invoke("update_block", { block });
}

async function archiveBlock(blockId: string): Promise<void> {
  return invoke("archive_block", { blockId });
}

async function createResume(resume: ResumeDefinition): Promise<ResumeDefinition> {
  return invoke("create_resume", { resume });
}

async function updateResume(resume: ResumeDefinition): Promise<ResumeDefinition> {
  return invoke("update_resume", { resume });
}

async function archiveResume(resumeId: string): Promise<void> {
  return invoke("archive_resume", { resumeId });
}

async function saveAppWorkspaceState(appState: AppWorkspaceState): Promise<AppWorkspaceState> {
  return invoke("save_app_workspace_state", { appState });
}

async function renderResume(resumeId: string): Promise<RenderResult> {
  return invoke("render_resume", { resumeId });
}

async function runLlmTask(taskType: string, inputText: string): Promise<LlmTaskResult> {
  return invoke("run_llm_task", { request: { taskType, inputText } });
}

function sanitizeLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function linesToText(items: string[]): string {
  return items.join("\n");
}

function formatTimestamp(value: string): string {
  const timestamp = Number(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString();
}

export default function App() {
  const [workspacePath, setWorkspacePath] = useState(DEFAULT_WORKSPACE_PATH);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [profileDraft, setProfileDraft] = useState<Profile>(EMPTY_PROFILE);
  const [blockDraft, setBlockDraft] = useState<Block>(EMPTY_BLOCK);
  const [resumeDraft, setResumeDraft] = useState<ResumeDefinition>(EMPTY_RESUME);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [llmInput, setLlmInput] = useState("");
  const [llmResult, setLlmResult] = useState<LlmTaskResult | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [message, setMessage] = useState("Open a workspace or seed a local sample workspace.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const blocks = snapshot?.blocks ?? [];
  const resumes = snapshot?.resumes ?? [];
  const renderHistory = snapshot?.renderHistory ?? [];

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setProfileDraft(snapshot.profile);
    const nextResumeId =
      snapshot.appState.lastSelectedResumeId && resumes.some((resume) => resume.id === snapshot.appState.lastSelectedResumeId)
        ? snapshot.appState.lastSelectedResumeId
        : resumes[0]?.id ?? "";
    setSelectedResumeId(nextResumeId);
    setResumeDraft(resumes.find((resume) => resume.id === nextResumeId) ?? EMPTY_RESUME);
    const nextBlock = blocks[0] ?? EMPTY_BLOCK;
    setSelectedBlockId(nextBlock.id ?? "");
    setBlockDraft(nextBlock);
  }, [snapshot, blocks, resumes]);

  async function refreshWorkspace() {
    const nextSnapshot = await loadWorkspaceSnapshot();
    setSnapshot(nextSnapshot);
  }

  async function handleCreateSampleWorkspace() {
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await createSampleWorkspace(workspacePath);
      setSnapshot(nextSnapshot);
      setMessage(`Sample workspace created at ${nextSnapshot.summary.rootPath}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenWorkspace() {
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await selectWorkspace(workspacePath);
      setSnapshot(nextSnapshot);
      setMessage(`Workspace loaded from ${nextSnapshot.summary.rootPath}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile() {
    setBusy(true);
    setError("");
    try {
      await saveProfile(profileDraft);
      await refreshWorkspace();
      setMessage("Profile saved to the workspace.");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBlock() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...blockDraft,
        title: blockDraft.title || null,
        subtitle: blockDraft.subtitle || null,
        dateRange: blockDraft.dateRange || null,
        content: blockDraft.content || null,
        label: blockDraft.label || null,
        value: blockDraft.value || null
      };
      if (blocks.some((block) => block.id === payload.id)) {
        await updateBlock(payload);
        setMessage(`Block ${payload.id} updated.`);
      } else {
        await createBlock(payload);
        setMessage(`Block ${payload.id} created.`);
      }
      await refreshWorkspace();
      setSelectedBlockId(payload.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveBlock() {
    if (!selectedBlockId) {
      setError("Select a block before archiving.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await archiveBlock(selectedBlockId);
      await refreshWorkspace();
      setSelectedBlockId("");
      setBlockDraft(EMPTY_BLOCK);
      setMessage(`Block ${selectedBlockId} archived.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResume() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...resumeDraft,
        blockIds: resumeDraft.blockIds
      };
      if (resumes.some((resume) => resume.id === payload.id)) {
        await updateResume(payload);
        setMessage(`Resume ${payload.id} updated.`);
      } else {
        await createResume(payload);
        setMessage(`Resume ${payload.id} created.`);
      }
      await saveAppWorkspaceState({ lastSelectedResumeId: payload.id });
      await refreshWorkspace();
      setSelectedResumeId(payload.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveResume() {
    if (!selectedResumeId) {
      setError("Select a resume before archiving.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await archiveResume(selectedResumeId);
      await saveAppWorkspaceState({ lastSelectedResumeId: null });
      await refreshWorkspace();
      setSelectedResumeId("");
      setResumeDraft(EMPTY_RESUME);
      setMessage(`Resume ${selectedResumeId} archived.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectResume(resumeId: string) {
    setSelectedResumeId(resumeId);
    setResumeDraft(resumes.find((resume) => resume.id === resumeId) ?? EMPTY_RESUME);
    if (!snapshot) {
      return;
    }
    await saveAppWorkspaceState({ lastSelectedResumeId: resumeId });
    await refreshWorkspace();
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

  async function handleRunLlmTask() {
    setBusy(true);
    setError("");
    try {
      const nextResult = await runLlmTask("rewrite_block", llmInput);
      setLlmResult(nextResult);
      setMessage("Local LLM stub executed.");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Resume Studio Workspace</p>
          <h1>Local resume editor with a stable disk contract</h1>
          <p className="lede">
            The desktop app now treats the workspace as a versioned local contract,
            persists render operations inside the workspace, and exposes form-based
            CRUD for profile, blocks, and resumes.
          </p>
        </div>
        <div className="hero-card">
          <label htmlFor="workspacePath">Workspace path</label>
          <input
            id="workspacePath"
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
            placeholder="/path/to/workspace"
          />
          <div className="button-row">
            <button disabled={busy} onClick={handleOpenWorkspace}>
              Open workspace
            </button>
            <button className="secondary" disabled={busy} onClick={handleCreateSampleWorkspace}>
              Seed sample workspace
            </button>
          </div>
          <p className="hint">{message}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Workspace contract</h2>
          {snapshot ? (
            <dl className="stats">
              <div>
                <dt>Name</dt>
                <dd>{snapshot.summary.workspaceName}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>v{snapshot.manifest.schemaVersion}</dd>
              </div>
              <div>
                <dt>Blocks</dt>
                <dd>{snapshot.summary.blockCount}</dd>
              </div>
              <div>
                <dt>Resumes</dt>
                <dd>{snapshot.summary.resumeCount}</dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>{snapshot.summary.availableLanguages.join(", ")}</dd>
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
          <h2>Render</h2>
          {resumes.length === 0 ? (
            <p className="placeholder">Create a resume definition to render.</p>
          ) : (
            <>
              <select
                value={selectedResumeId}
                onChange={(event) => {
                  void handleSelectResume(event.target.value);
                }}
              >
                <option value="">Select a resume</option>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title} ({resume.language})
                  </option>
                ))}
              </select>
              <button disabled={busy} onClick={handleRenderResume}>
                Render selected resume
              </button>
            </>
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
      </section>

      <section className="editor-grid">
        <article className="panel">
          <h2>Profile</h2>
          <div className="field-grid">
            <label>
              Name
              <input
                value={profileDraft.name}
                onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                value={profileDraft.email}
                onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
              />
            </label>
            <label>
              Role PT
              <input
                value={profileDraft.roles.pt}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    roles: { ...profileDraft.roles, pt: event.target.value }
                  })
                }
              />
            </label>
            <label>
              Role EN
              <input
                value={profileDraft.roles.en}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    roles: { ...profileDraft.roles, en: event.target.value }
                  })
                }
              />
            </label>
            <label>
              Location
              <input
                value={profileDraft.location}
                onChange={(event) => setProfileDraft({ ...profileDraft, location: event.target.value })}
              />
            </label>
            <label>
              LinkedIn
              <input
                value={profileDraft.linkedin}
                onChange={(event) => setProfileDraft({ ...profileDraft, linkedin: event.target.value })}
              />
            </label>
            <label>
              GitHub
              <input
                value={profileDraft.github}
                onChange={(event) => setProfileDraft({ ...profileDraft, github: event.target.value })}
              />
            </label>
          </div>
          <button disabled={busy || !snapshot} onClick={handleSaveProfile}>
            Save profile
          </button>
        </article>

        <article className="panel">
          <div className="section-header">
            <h2>Blocks</h2>
            <button
              className="secondary"
              disabled={busy || !snapshot}
              onClick={() => {
                setSelectedBlockId("");
                setBlockDraft(EMPTY_BLOCK);
              }}
            >
              New block
            </button>
          </div>
          <div className="picker-list">
            {blocks.map((block) => (
              <button
                key={block.id}
                className={selectedBlock?.id === block.id ? "chip chip-active" : "chip"}
                disabled={busy}
                onClick={() => {
                  setSelectedBlockId(block.id);
                  setBlockDraft(block);
                }}
              >
                {block.id}
              </button>
            ))}
          </div>
          <div className="field-grid">
            <label>
              Id
              <input
                value={blockDraft.id}
                onChange={(event) => setBlockDraft({ ...blockDraft, id: event.target.value })}
              />
            </label>
            <label>
              Type
              <select
                value={blockDraft.blockType}
                onChange={(event) => setBlockDraft({ ...blockDraft, blockType: event.target.value })}
              >
                <option value="summary">summary</option>
                <option value="experience">experience</option>
                <option value="project">project</option>
                <option value="skill">skill</option>
                <option value="education">education</option>
              </select>
            </label>
            <label>
              Language
              <input
                value={blockDraft.language}
                onChange={(event) => setBlockDraft({ ...blockDraft, language: event.target.value })}
              />
            </label>
            <label>
              Section
              <input
                value={blockDraft.section}
                onChange={(event) => setBlockDraft({ ...blockDraft, section: event.target.value })}
              />
            </label>
            <label>
              Title
              <input
                value={blockDraft.title ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, title: event.target.value })}
              />
            </label>
            <label>
              Subtitle
              <input
                value={blockDraft.subtitle ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, subtitle: event.target.value })}
              />
            </label>
            <label>
              Date range
              <input
                value={blockDraft.dateRange ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, dateRange: event.target.value })}
              />
            </label>
            <label>
              Label
              <input
                value={blockDraft.label ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, label: event.target.value })}
              />
            </label>
            <label>
              Value
              <input
                value={blockDraft.value ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, value: event.target.value })}
              />
            </label>
            <label className="field-span">
              Content
              <textarea
                value={blockDraft.content ?? ""}
                onChange={(event) => setBlockDraft({ ...blockDraft, content: event.target.value })}
              />
            </label>
            <label className="field-span">
              Items
              <textarea
                value={linesToText(blockDraft.items)}
                onChange={(event) => setBlockDraft({ ...blockDraft, items: sanitizeLines(event.target.value) })}
              />
            </label>
          </div>
          <div className="button-row">
            <button disabled={busy || !snapshot} onClick={handleSaveBlock}>
              Save block
            </button>
            <button className="secondary" disabled={busy || !selectedBlockId} onClick={handleArchiveBlock}>
              Archive block
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="section-header">
            <h2>Resumes</h2>
            <button
              className="secondary"
              disabled={busy || !snapshot}
              onClick={() => {
                setSelectedResumeId("");
                setResumeDraft(EMPTY_RESUME);
              }}
            >
              New resume
            </button>
          </div>
          <div className="picker-list">
            {resumes.map((resume) => (
              <button
                key={resume.id}
                className={selectedResumeId === resume.id ? "chip chip-active" : "chip"}
                disabled={busy}
                onClick={() => {
                  setSelectedResumeId(resume.id);
                  setResumeDraft(resume);
                }}
              >
                {resume.id}
              </button>
            ))}
          </div>
          <div className="field-grid">
            <label>
              Id
              <input
                value={resumeDraft.id}
                onChange={(event) => setResumeDraft({ ...resumeDraft, id: event.target.value })}
              />
            </label>
            <label>
              Title
              <input
                value={resumeDraft.title}
                onChange={(event) => setResumeDraft({ ...resumeDraft, title: event.target.value })}
              />
            </label>
            <label>
              Language
              <input
                value={resumeDraft.language}
                onChange={(event) => setResumeDraft({ ...resumeDraft, language: event.target.value })}
              />
            </label>
            <label>
              Role key
              <input
                value={resumeDraft.roleKey}
                onChange={(event) => setResumeDraft({ ...resumeDraft, roleKey: event.target.value })}
              />
            </label>
            <label className="field-span">
              Block ids
              <textarea
                value={linesToText(resumeDraft.blockIds)}
                onChange={(event) =>
                  setResumeDraft({ ...resumeDraft, blockIds: sanitizeLines(event.target.value) })
                }
              />
            </label>
          </div>
          <div className="button-row">
            <button disabled={busy || !snapshot} onClick={handleSaveResume}>
              Save resume
            </button>
            <button className="secondary" disabled={busy || !selectedResumeId} onClick={handleArchiveResume}>
              Archive resume
            </button>
          </div>
        </article>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Render history</h2>
          {renderHistory.length === 0 ? (
            <p className="placeholder">No render history persisted in this workspace yet.</p>
          ) : (
            <div className="history-list">
              {renderHistory.map((entry) => (
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

        <article className="panel">
          <h2>LLM boundary</h2>
          <p className="placeholder">
            This stays local for now. The UI talks to a task-oriented stub instead of a real provider.
          </p>
          <label>
            Rewrite input
            <textarea value={llmInput} onChange={(event) => setLlmInput(event.target.value)} />
          </label>
          <button disabled={busy || !snapshot} onClick={handleRunLlmTask}>
            Run stub task
          </button>
          {llmResult ? (
            <div className="result">
              <p>
                <strong>Provider:</strong> {llmResult.provider}
              </p>
              <p>{llmResult.outputText}</p>
              {llmResult.warnings.map((warning) => (
                <p key={warning} className="hint">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
