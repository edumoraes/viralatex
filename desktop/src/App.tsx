import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type WorkspaceSummary = {
  rootPath: string;
  profileName: string;
  availableLanguages: string[];
  blockCount: number;
  resumeCount: number;
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
};

const DEFAULT_SAMPLE_PATH = "/tmp/resume-studio-sample-workspace";

async function createSampleWorkspace(path: string): Promise<WorkspaceSummary> {
  return invoke("create_sample_workspace", { path });
}

async function selectWorkspace(path: string): Promise<WorkspaceSummary> {
  return invoke("select_workspace", { path });
}

async function loadWorkspaceSummary(): Promise<WorkspaceSummary> {
  return invoke("load_workspace_summary");
}

async function listBlocks(): Promise<Block[]> {
  return invoke("list_blocks");
}

async function listResumes(): Promise<ResumeDefinition[]> {
  return invoke("list_resumes");
}

async function renderResume(resumeId: string): Promise<RenderResult> {
  return invoke("render_resume", { resumeId });
}

export default function App() {
  const [workspacePath, setWorkspacePath] = useState(DEFAULT_SAMPLE_PATH);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [resumes, setResumes] = useState<ResumeDefinition[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [message, setMessage] = useState("Create a sample workspace or open an existing one.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const groupedBlocks = useMemo(() => {
    return blocks.reduce<Record<string, Block[]>>((groups, block) => {
      groups[block.blockType] ||= [];
      groups[block.blockType].push(block);
      return groups;
    }, {});
  }, [blocks]);

  async function refreshWorkspace() {
    const [nextSummary, nextBlocks, nextResumes] = await Promise.all([
      loadWorkspaceSummary(),
      listBlocks(),
      listResumes()
    ]);
    setSummary(nextSummary);
    setBlocks(nextBlocks);
    setResumes(nextResumes);
    setSelectedResumeId((current) => current || nextResumes[0]?.id || "");
  }

  async function handleCreateSampleWorkspace() {
    setBusy(true);
    setError("");
    setRenderResult(null);
    try {
      const nextSummary = await createSampleWorkspace(workspacePath);
      setSummary(nextSummary);
      setMessage(`Sample workspace created at ${nextSummary.rootPath}.`);
      await refreshWorkspace();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenWorkspace() {
    setBusy(true);
    setError("");
    setRenderResult(null);
    try {
      const nextSummary = await selectWorkspace(workspacePath);
      setSummary(nextSummary);
      setMessage(`Workspace loaded from ${nextSummary.rootPath}.`);
      await refreshWorkspace();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
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
      setMessage(`Render finished with status ${nextResult.status}.`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setMessage("Create a sample workspace in /tmp or open an existing workspace.");
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Resume Studio Bootstrap</p>
          <h1>Local-first desktop foundation</h1>
          <p className="lede">
            This bootstrap validates the future product shell: filesystem-backed
            workspaces, typed resume content, and real local PDF rendering with
            Tectonic.
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
            <button disabled={busy} onClick={handleCreateSampleWorkspace}>
              Create sample workspace
            </button>
            <button className="secondary" disabled={busy} onClick={handleOpenWorkspace}>
              Open workspace
            </button>
          </div>
          <p className="hint">{message}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Workspace</h2>
          {summary ? (
            <dl className="stats">
              <div>
                <dt>Profile</dt>
                <dd>{summary.profileName}</dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>{summary.availableLanguages.join(", ")}</dd>
              </div>
              <div>
                <dt>Blocks</dt>
                <dd>{summary.blockCount}</dd>
              </div>
              <div>
                <dt>Resumes</dt>
                <dd>{summary.resumeCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="placeholder">No workspace selected.</p>
          )}
        </article>

        <article className="panel">
          <h2>Resumes</h2>
          {resumes.length === 0 ? (
            <p className="placeholder">No resume definitions found.</p>
          ) : (
            <>
              <select
                value={selectedResumeId}
                onChange={(event) => setSelectedResumeId(event.target.value)}
              >
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
              {renderResult.errorMessage ? (
                <p className="error">{renderResult.errorMessage}</p>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>

      <section className="panel">
        <h2>Content overview</h2>
        {Object.keys(groupedBlocks).length === 0 ? (
          <p className="placeholder">No blocks loaded yet.</p>
        ) : (
          <div className="block-groups">
            {Object.entries(groupedBlocks).map(([group, entries]) => (
              <section key={group} className="block-group">
                <h3>{group}</h3>
                <ul>
                  {entries.map((block) => (
                    <li key={block.id}>
                      <strong>{block.title || block.label || block.id}</strong>
                      <span>{block.language.toUpperCase()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
