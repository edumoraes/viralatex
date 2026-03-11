# ViraLaTex

Local-first desktop software for writing, structuring, and rendering professional documents with AI assistance.

Today, ViraLaTex is focused on resume authoring. The product direction is broader: a local document workstation for resumes, technical documents, and scientific writing, with plain files as the source of truth and an AI assistant that works inside a user-owned workspace.

## Why This Exists

Most writing tools force a bad tradeoff:

- polished editing but weak structure
- strong markup but poor UX
- AI assistance but zero control over files, prompts, or approval flow

ViraLaTex is trying to remove that tradeoff.

The app keeps document data local, renders locally, stores artifacts as regular files, and uses AI as an assistant instead of a hidden black box. The current workflow is resume-first because that is the narrowest useful problem to solve well before expanding into broader authoring workflows.

## Current Product Scope

What works today:

- local desktop app built with Tauri, Rust, React, and TypeScript
- manifest-based workspace stored on disk
- structured authoring for profile, reusable content blocks, and resume definitions
- local PDF rendering through `tectonic`
- local AI sidecar with persistent threads, streamed responses, and approval-based file mutations
- sample workspace to validate the authoring model end to end

What comes next:

- richer document authoring beyond resumes
- app-defined templates plus workspace-owned document sources
- stronger flows for technical and scientific documents
- more capable AI-assisted drafting, editing, and restructuring

## Product Direction

ViraLaTex is being built as a document workstation, not just a resume generator.

The intended end state is:

- resumes as one document type among many
- technical writing backed by structured content and reusable fragments
- scientific and academic writing with local files, reproducible rendering, and agent assistance
- explicit human approval before workspace mutations
- no dependency on cloud-hosted document storage

The current repository already reflects that transition: the legacy LaTeX resume system still exists, while the desktop app is the main path forward.

## How It Is Built

This repository has two active layers.

### 1. Legacy LaTeX engine

The original LaTeX system lives in `src/` and remains the canonical reference for the current resume pipeline.

```text
src/
  template/
    resume.cls
  shared/
    profile.tex
    sections/
      pt/
      en/
  versions/
    pt/
    en/
```

Use this layer when you want deterministic Docker-based generation of the existing resume variants.

### 2. Desktop application

The product layer under active development lives in `desktop/`.

```text
desktop/
  src/                 React UI
  src-tauri/           Tauri app and Rust backend
  ai_service/          Python AI sidecar
examples/
  sample-workspace/    Example local workspace
```

This app is local-first by design:

- user data lives in workspace files
- rendering happens locally
- AI runs through a local sidecar
- thread state and long-term memory are persisted locally

## Workspace Model

Each workspace is a plain-file contract rooted at `workspace.yml`.

```text
workspace.yml
.app/
  state.yml
  render-history.yml
profile/
  profile.yml
blocks/
  _archived/
resumes/
  _archived/
documents/
renders/
```

Meaning:

- `profile/`: singleton profile data
- `blocks/`: reusable content units
- `resumes/`: composed resume definitions
- `documents/`: workspace-owned LaTeX document sources
- `renders/`: generated output artifacts
- `.app/`: local operational state only

The desktop app also ships app-defined LaTeX templates from `desktop/src-tauri/templates/`, which are exposed to the AI as read-only references.

## AI Model

The AI sidecar is not a generic chatbot bolted onto the UI. It is a workspace-aware assistant with explicit boundaries.

Key properties:

- started locally by Tauri
- streams responses through a LangGraph-compatible API
- persists thread state in local SQLite
- can inspect workspace files and app templates
- must go through approval interrupts before mutating workspace files
- falls back to a stub runtime when no provider-backed model is configured

Supported providers:

- `openai`
- `anthropic`
- `ollama`
- `stub`

The app stores provider selection and optional API key in app-local state, not in the workspace.

## Quick Start

### Desktop app

Requirements:

- Node.js + npm
- Rust toolchain
- Python 3.12+
- `uv`

Install dependencies:

```bash
npm --prefix desktop install
uv sync --directory desktop/ai_service
```

Install or register `tectonic`:

```bash
bin/setup-tectonic
```

Start the app:

```bash
npm --prefix desktop run tauri:dev
```

Build the desktop app:

```bash
npm --prefix desktop run tauri:build
```

`tectonic` is resolved in this order:

1. `TECTONIC_BIN`
2. `desktop/src-tauri/binaries/tectonic`
3. packaged Tauri resources
4. `tectonic` from `PATH`

You can also install the managed binary with:

```bash
make tectonic-setup
```

Or point to a custom binary:

```bash
TECTONIC_BIN=/path/to/tectonic npm --prefix desktop run tauri:dev
```

### Legacy LaTeX pipeline

Requirements:

- Docker
- GNU Make

Build the image:

```bash
make image
```

Build everything:

```bash
make build
make build-all
```

Build only Portuguese variants:

```bash
make build-pt
```

Build only English variants:

```bash
make build-en
```

Remove generated artifacts:

```bash
make clean
```

Outputs are written to `out/`.

## Development Workflow

The repository follows an XP-style workflow with tests and automation around each layer.

Useful commands:

```bash
make test
python3 -m unittest discover -s desktop/ai_service/tests -p 'test_*.py'
npm --prefix desktop run test
npm --prefix desktop run build
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

Repository validation is also available through:

```bash
make lint
make security
make check
make hooks-run
```

## What To Expect From The App

In its current state, ViraLaTex is best understood as:

- a serious local foundation for AI-assisted resume authoring
- a transition layer from a handcrafted LaTeX system to a broader authoring product
- a workspace-centric architecture designed to grow into technical and scientific document workflows

If your interest is only resumes, the repository already supports that.

If your interest is broader authoring, this is the direction the product is being actively shaped toward.
