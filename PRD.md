# Resume Studio Desktop PRD

## Summary
Resume Studio is a local-first desktop application for managing structured resume workspaces and rendering PDFs locally. It combines a Tauri desktop shell, a React and TypeScript frontend, a Rust backend, and the existing LaTeX resume assets that still power the final document layout.

The current product goal is to validate the desktop foundation end to end:

- create or open a local workspace on disk
- treat the workspace as a versioned manifest-backed contract
- inspect and edit structured profile, block, and resume data from YAML files
- render a real PDF locally through the maintained LaTeX template pipeline
- persist operational history inside the workspace
- keep the workflow offline-friendly and auditable

## Problem
The current LaTeX-only workflow produces good PDFs, but it is still file-centric and manual. Maintaining multiple resume variants directly in TeX is efficient for output quality, but weak for product usability.

The main problems this product addresses now are:

- managing resume data directly in source files is too technical for normal editing flows
- there is no guided application for opening, validating, and rendering a resume workspace
- rendering success depends on local tooling that is not surfaced through a user-facing interface
- the future product needs a local foundation before adding more advanced authoring or AI flows

## Product Vision
The application should become a local resume workstation:

- the filesystem is the source of truth
- the desktop app is the main interaction surface
- the workspace contract is explicit and versioned
- structured blocks and resume definitions live in a workspace folder
- rendering happens locally with explicit logs and outputs
- future AI-assisted authoring can be added on top through a task-oriented boundary without changing the local-first foundation

The product is currently a bootstrap, not a full resume operating system. It should prove the local workspace model and rendering pipeline before broader product expansion.

## Target User
### Primary audience
- individual professionals managing their own resumes locally
- technical users comfortable running a desktop app and storing files in a workspace directory

### Initial user profile
- software engineers and adjacent technical professionals
- bilingual users working in PT-BR and English
- users who want local control over source files and generated PDFs

## Goals
### Product goals
- validate a local-first desktop product shell
- preserve high-quality PDF output using the existing LaTeX template
- establish a structured workspace model that the UI can load and render
- make the workspace contract explicit enough to support schema evolution
- keep the foundation compatible with future expansion such as richer editing or AI assistance

### User goals
- create a sample workspace quickly
- open an existing workspace from disk
- inspect and edit available profile, block, and resume data
- render a selected resume and find the generated PDF and logs

## Non-Goals for the current version
- user accounts, sign-in, or multi-user collaboration
- cloud sync or server-backed persistence
- recruiter-facing workflows
- real provider-backed conversational authoring or AI-assisted extraction
- job description analysis and targeting
- automatic resume tailoring
- end-user editing of raw LaTeX files inside the app

## Core Principles
- `Local-first`: user data lives in workspace files on disk
- `Structured filesystem`: profile, blocks, and resume definitions are stored as explicit files and folders
- `Stable contract`: `workspace.yml` declares the schema version and workspace identity
- `Desktop-native`: the primary product runtime is a local desktop app, not a web app
- `Renderable truth`: every supported workspace should map to a real local render attempt
- `Template continuity`: the existing LaTeX assets remain the source of presentation quality
- `Auditability`: outputs, logs, and source files should stay inspectable by the user

## User Journey
### 1. Start the app
The user opens the desktop application and sees the local-first bootstrap interface.

### 2. Create or open a workspace
The user either creates a sample workspace in a chosen directory or opens an existing workspace path.

### 3. Inspect workspace contents
The app loads a workspace snapshot, lists reusable content blocks and resume definitions, and allows structured edits.

### 4. Select a resume
The user chooses one of the available resume definitions from the workspace.

### 5. Render locally
The app invokes the Rust backend to compose temporary render artifacts and run the local PDF build flow.

### 6. Review output
The user sees render status plus the output PDF path and log path inside the workspace renders directory, and the app persists that result in workspace-local operational history.

## Key Features
### 1. Local workspace management
- create a sample workspace from bundled examples
- open an existing workspace by absolute path
- validate workspace structure before use
- validate `workspace.yml` and schema compatibility before loading entities

### 2. Structured content loading
- load profile data
- load blocks from YAML files
- load resume definitions from YAML files
- summarize available languages and content counts
- edit and archive entities through typed desktop forms

### 3. Local PDF rendering
- transform workspace content into render-ready temporary files
- reuse the maintained resume class and template assets
- produce a PDF and a log file in the workspace

### 4. Clear render feedback
- show render status in the UI
- expose output paths for PDF and logs
- keep failures visible and local

### 5. Operational persistence
- persist render history inside the workspace
- persist minimal workspace-local app state such as last selected resume

### 6. Future LLM boundary
- expose a task-oriented local interface for future AI features
- keep provider integration out of scope for the current version

### 5. Developer quality workflow
- repository-level structural checks through `make test`
- lint and static checks for frontend, Rust, and shell tooling
- local `pre-commit` and `pre-push` hooks for consistent validation

## Functional Requirements
### Desktop shell
- the product must run as a Tauri desktop application
- the UI must call Rust commands through Tauri invoke handlers

### Workspace model
- a workspace must be loaded from the filesystem
- a workspace must contain `workspace.yml`, profile data, blocks, resumes, and workspace-local operational files in the expected structure
- the app must reject invalid workspaces with clear error messages

### Content visibility
- the app must show workspace summary information
- the app must list blocks and resume definitions after a workspace is loaded
- the app must support local CRUD for profile, blocks, and resume definitions

### Rendering
- the user must be able to render a selected resume definition
- a render attempt must return status plus output and log paths when available
- rendered artifacts must be written into the workspace renders directory

### Sample bootstrap
- the app must be able to create a sample workspace from bundled example assets

### Future AI boundary
- the app must expose a local task-oriented LLM boundary without requiring a real provider integration

## Data Model Concepts
- `Workspace`: local root directory containing the resume data model
- `Profile`: identity and contact information for the owner of the workspace
- `Block`: reusable unit of resume content such as summary, experience, project, skill, or education item
- `Resume Definition`: a file-backed selection of blocks and metadata for one resume variant
- `Render Result`: status and artifact references for one local render attempt

## Languages and Localization
- PT and EN are the required languages today
- the sample workspace and template pipeline must support both languages
- the product should keep the workspace model extensible for more languages later

## UX Requirements
- the UI should make the local workspace model obvious
- the app should keep actions simple: create, open, inspect, render
- the app should show enough feedback for debugging local render failures
- the app should not hide where artifacts are stored

## Success Metrics
### Core product metrics
- a new user can create a sample workspace and render a PDF locally without editing source files
- an existing valid workspace loads successfully
- render failures produce actionable local logs
- PT and EN sample resumes render through the same product flow

### Quality metrics
- local build and validation commands stay green
- hook-based checks catch formatting, lint, and security issues before push
- rendered output remains consistent with the maintained LaTeX template quality

## Risks
- local rendering depends on external binaries such as Tectonic or the configured toolchain
- filesystem-driven workflows can fail on invalid paths or malformed workspace files
- the desktop bootstrap may remain too technical if richer editing flows are delayed
- future AI or database features could overcomplicate the local-first architecture if added too early

## Release Scope for the current version
The current version is complete when it does the following reliably:

- creates a sample workspace
- opens a valid existing workspace
- loads profile, blocks, and resume definitions
- renders a selected resume locally to PDF
- exposes output and log paths to the user
- remains supported by repeatable local lint, test, and security checks

Anything beyond that is future work on top of the validated desktop foundation.
