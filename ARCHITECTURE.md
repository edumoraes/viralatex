# Resume Studio Desktop Architecture

## Summary
This repository currently implements a local-first desktop bootstrap for resume management and rendering. The architecture combines four active layers:

- legacy LaTeX presentation assets in `src/`
- a React and TypeScript desktop frontend in `desktop/src/`
- a Rust and Tauri backend in `desktop/src-tauri/src/`
- a filesystem-backed sample workspace in `examples/sample-workspace/`

The repository is not a web application and does not currently use Rails, Postgres, background jobs, or server-side persistence. The active architecture is a desktop client that reads structured files from disk and renders PDFs locally.

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
- triggering sample workspace creation
- opening an existing workspace
- showing workspace summary data
- listing blocks and resume definitions
- triggering resume rendering and showing the result

The frontend does not own persistence. It is a thin orchestration layer over Tauri commands.

### 2. Tauri command layer
The command layer lives primarily in `desktop/src-tauri/src/lib.rs`. It exposes the desktop capabilities to the frontend through Tauri commands:

- `create_sample_workspace`
- `select_workspace`
- `load_workspace_summary`
- `list_blocks`
- `list_resumes`
- `render_resume`
- `get_render_status`

This layer also manages in-memory app state such as the selected workspace and recent render history.

### 3. Rust domain and file services
The Rust backend loads and validates the workspace using modules in `desktop/src-tauri/src/`:

- `workspace.rs`: filesystem validation, loading, and sample workspace creation
- `domain.rs`: serializable data structures shared across the app boundary
- `renderer.rs`: local render orchestration and artifact generation
- `app_state.rs`: selected workspace and render history

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

- `profile/`: profile identity data in YAML
- `blocks/`: reusable content blocks grouped by topic
- `resumes/`: resume definitions describing variants to render
- `renders/`: output PDFs and logs created by render attempts
- `.cache/`: local render cache area when needed

The workspace model is intentionally file-based:

- easy to inspect with normal tools
- easy to version with Git
- easy to copy, back up, and diff
- independent of any database or backend service

## Data Flow
### Create sample workspace
1. The frontend sends a path to `create_sample_workspace`.
2. Rust copies the bundled sample workspace into that location.
3. Rust sets the selected workspace in app state.
4. The frontend refreshes summary, blocks, and resumes.

### Open existing workspace
1. The frontend sends a path to `select_workspace`.
2. Rust canonicalizes the path and validates the workspace structure.
3. Rust stores the selected workspace in app state.
4. The frontend requests summary, blocks, and resumes.

### Render resume
1. The frontend sends a `resumeId` to `render_resume`.
2. Rust loads the selected workspace, profile, blocks, and resume definitions.
3. Rust resolves the target resume definition.
4. Rust generates temporary render inputs and invokes the local render flow.
5. Rust writes artifacts into the workspace `renders/` directory.
6. Rust returns a `RenderResult` with status, output path, log path, and optional error message.

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
The current app state is deliberately small:

- `selected_workspace`: canonical path of the active workspace
- `render_history`: in-memory map of recent render results by job id

This is sufficient for the current bootstrap. There is no persistent application database yet.

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
- no in-app editing of workspace content yet
- no persistent DB for indexing or history
- no cloud sync
- no AI extraction, rewrite, or targeting workflows
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
