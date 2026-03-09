# Resume Studio Desktop Architecture

## Summary
This repository currently implements a local-first desktop workspace editor for resume management and rendering. The architecture combines four active layers:

- legacy LaTeX presentation assets in `src/`
- a React and TypeScript desktop frontend in `desktop/src/`
- a Rust and Tauri backend in `desktop/src-tauri/src/`
- a filesystem-backed sample workspace in `examples/sample-workspace/`

The repository is not a web application and does not currently use Rails, Postgres, background jobs, or server-side persistence. The active architecture is a desktop client that reads and writes structured files from disk, persists minimal operational state inside the workspace, and renders PDFs locally.

## Architecture Goals
- preserve the current PDF quality from the LaTeX layer
- treat the filesystem as the canonical source of user data
- expose workspace and render operations through a local desktop UI
- keep the rendering pipeline inspectable and debuggable
- maintain a strong local quality workflow with lint, test, and security checks

## System Context
### External actors
- end user operating the desktop app
- local filesystem holding the workspace
- local render toolchain used by the Rust backend

### Internal subsystems
- React UI
- Tauri command surface
- Rust workspace loader and renderer
- LaTeX template assets
- repository quality tooling

## Runtime Topology
### 1. Frontend
The frontend lives in `desktop/src/` and is built with React, TypeScript, and Vite. It is responsible for:

- collecting a workspace path from the user
- opening an existing workspace
- optionally seeding a sample workspace
- showing workspace summary data and manifest version
- editing profile, blocks, and resume definitions
- archiving blocks and resumes locally
- triggering resume rendering and showing the result
- showing persisted render history
- calling a task-oriented LLM stub boundary

The frontend does not own persistence. It is a thin orchestration layer over Tauri commands.

### 2. Tauri command layer
The command layer lives primarily in `desktop/src-tauri/src/lib.rs`. It exposes the desktop capabilities to the frontend through Tauri commands:

- `create_sample_workspace`
- `select_workspace`
- `load_workspace_summary`
- `load_workspace_snapshot`
- `save_profile`
- `create_block`
- `update_block`
- `archive_block`
- `create_resume`
- `update_resume`
- `archive_resume`
- `save_app_workspace_state`
- `render_resume`
- `run_llm_task`

This layer keeps only the selected workspace in memory. Operational state and render history are persisted in the workspace itself.

### 3. Rust domain and file services
The Rust backend loads and validates the workspace using modules in `desktop/src-tauri/src/`:

- `workspace.rs`: manifest-based validation, loading, CRUD persistence, archival, and workspace-local operational state
- `domain.rs`: serializable data structures shared across the app boundary
- `renderer.rs`: local render orchestration and artifact generation
- `app_state.rs`: selected workspace
- `llm.rs`: task-oriented local stub for the future LLM boundary

This layer treats YAML files in the workspace as the source of truth.

### 4. LaTeX rendering assets
The rendering foundation still comes from the maintained LaTeX assets:

- `src/template/resume.cls`
- `src/shared/profile.tex`
- `src/shared/sections/<lang>/`
- `src/versions/<lang>/`

The desktop renderer does not ask the user to edit these files directly. Instead, it reuses the template model and generates temporary files needed for a render attempt.

## Workspace Architecture
The workspace is a directory tree on disk. The sample implementation in `examples/sample-workspace/` demonstrates the expected shape:

- `workspace.yml`: manifest and schema version entrypoint
- `.app/`: workspace-local operational state
- `profile/`: profile identity data in YAML
- `blocks/`: reusable content blocks grouped by topic
- `resumes/`: resume definitions describing variants to render
- `renders/`: output PDFs and logs created by render attempts
- `blocks/_archived` and `resumes/_archived`: archived entities kept for traceability

The workspace model is intentionally file-based:

- easy to inspect with normal tools
- easy to version with Git
- easy to copy, back up, and diff
- independent of any database or backend service

## Data Flow
### Create sample workspace
1. The frontend sends a path to `create_sample_workspace`.
2. Rust copies the bundled sample workspace, including `workspace.yml` and `.app/`, into that location.
3. Rust sets the selected workspace in runtime state.
4. The frontend hydrates from `load_workspace_snapshot`.

### Open existing workspace
1. The frontend sends a path to `select_workspace`.
2. Rust canonicalizes the path and validates the workspace structure.
3. Rust stores the selected workspace in app state.
4. The frontend requests a full workspace snapshot.

### Edit workspace
1. The frontend edits typed forms for profile, blocks, or resumes.
2. Rust validates and writes YAML back into the workspace.
3. Archive actions move files into `_archived` folders instead of deleting them.
4. The frontend reloads the workspace snapshot.

### Render resume
1. The frontend sends a `resumeId` to `render_resume`.
2. Rust loads the selected workspace, profile, blocks, and resume definitions.
3. Rust resolves the target resume definition.
4. Rust generates temporary render inputs and invokes the local render flow.
5. Rust writes artifacts into the workspace `renders/` directory.
6. Rust appends the `RenderResult` to `.app/render-history.yml`.
7. Rust returns a `RenderResult` with status, output path, log path, and optional error message.

## Rendering Pipeline
The renderer is implemented in `desktop/src-tauri/src/renderer.rs`.

Its responsibilities are:

- create a temporary render directory
- copy or synthesize the LaTeX assets needed for one render
- write generated profile and section files
- write a render entrypoint
- invoke the local TeX toolchain
- copy the produced PDF and logs into the workspace
- return a structured render result

Design constraints:

- rendering is local, not remote
- artifacts should remain inspectable after each run
- failures should be captured as explicit status plus log path
- the template quality from the legacy LaTeX layer should remain unchanged unless intentionally edited

## State Model
The runtime app state is deliberately small:

- `selected_workspace`: canonical path of the active workspace

Workspace-local operational persistence lives on disk:

- `.app/state.yml`: last selected resume and other minimal app state
- `.app/render-history.yml`: persisted render history by job

There is still no persistent application database.

## Interface Contracts
### Frontend to backend
The boundary between React and Rust is the Tauri invoke contract. The commands return serializable domain types such as:

- `WorkspaceSummary`
- `Block`
- `ResumeDefinition`
- `RenderResult`

These types are defined in Rust and mirrored structurally in the frontend TypeScript code.

### Filesystem to backend
The backend expects stable workspace conventions:

- `workspace.yml` as the manifest entrypoint
- valid YAML files
- known folder layout
- predictable identifiers for blocks and resumes

If those assumptions fail, the backend returns user-visible errors rather than trying to recover silently.

## Build and Quality Architecture
Repository quality is enforced through layered local commands:

- `make test`: repository structure and documented entrypoint checks
- `make lint`: frontend ESLint, Rust `fmt`, and Rust `clippy`
- `make security`: secret scanning plus `npm audit` and `cargo audit`
- `bin/pre-push-check`: baseline push gate with `make test`, desktop build, and Rust tests

Git hook orchestration is handled by `pre-commit` with both `pre-commit` and `pre-push` stages enabled. This keeps quality checks close to local development instead of relying only on manual discipline.

## Key Tradeoffs
### Filesystem over database
The current product chooses local files over a DB because:

- the product is still validating the workspace model
- local ownership and inspectability are primary goals
- it reduces moving parts during the bootstrap phase

Tradeoff:
- validation and migrations are more manual than in a database-backed system

### Desktop over web
The current product chooses a desktop runtime because:

- rendering is local and toolchain-dependent
- local files are already the canonical source
- the shortest path to validating the product is a desktop shell

Tradeoff:
- distribution and environment consistency are harder than in a pure hosted web app

### Template reuse over redesign
The architecture keeps the existing LaTeX assets because:

- they already solve presentation quality
- changing UX and changing layout at the same time would increase risk

Tradeoff:
- the renderer must adapt to legacy template constraints

## Current Limitations
- no real provider-backed AI integration yet
- no persistent DB for indexing or search
- no cloud sync
- no background job system beyond local command execution
- render success still depends on the local environment and available binaries

## Future Extension Path
The current architecture is intended to support future additions without discarding the desktop and filesystem foundation:

- richer workspace editing in the UI
- stronger workspace validation and schema evolution
- optional local indexing or SQLite support
- AI-assisted authoring and tailoring
- packaging of required render binaries with the app

These are extensions, not current architecture commitments.
