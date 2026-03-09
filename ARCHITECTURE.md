# Resume Tailoring Web Application Architecture

## Summary
This architecture evolves the current repository from a file-based LaTeX resume generator into a Rails-based web application with structured persistence, asynchronous AI workflows, and an isolated compile engine.

The initial implementation is a `modular monolith` built with Ruby on Rails and Postgres. It keeps one deployable application for speed of delivery, but enforces clear module boundaries so the compile engine and AI orchestration can be extracted later if scale or operational needs require it.

The current LaTeX assets remain valuable. The `resume.cls` layout, composition patterns, and compilation flow become the seed of the rendering subsystem. They are no longer the source of truth for user data.

## Architecture Goals
- preserve the current PDF quality and LaTeX rendering strengths
- move canonical data storage to Postgres
- support a prompt-first UX without sacrificing structured persistence
- keep AI integrations isolated behind provider adapters
- run expensive or failure-prone work asynchronously
- maintain traceability from every PDF back to approved source content

## System Context
### External actors
- end user managing their professional profile and resume versions
- LLM provider used for extraction, scoring, translation, and rewrite tasks
- file or object storage used for generated PDF artifacts and optional logs

### Internal subsystems
- web application
- domain services
- AI orchestration
- compile engine
- background job processing
- persistence layer

## High-Level Topology
Version 1 uses a Rails modular monolith with these logical modules:

### 1. Web App
Handles HTTP requests, authentication, pages, forms, and chat-like authoring flows. This module owns the user-facing interaction model and delegates business logic to domain services.

### 2. Domain
Owns the core business entities and workflows:

- profiles
- raw intake
- blocks
- block variants
- job targets
- resumes
- resume versions
- suggestions
- renders

This module decides what data is canonical, what requires approval, and what transitions are legal.

### 3. AI Orchestration
Builds prompts, calls provider adapters, validates output shape, stores prompt and response metadata, and translates AI output into domain-level commands or suggestions.

### 4. Compile Engine
Transforms an approved resume version into temporary LaTeX files, runs the LaTeX build, captures logs, and stores resulting artifacts. This module is isolated because LaTeX compilation is operationally expensive and can fail independently from the web request flow.

### 5. Async Jobs
Executes long-running extraction, proposal, translation, and render jobs outside the request-response path.

## Recommended Runtime Stack
- `Ruby on Rails` as the fullstack application framework
- `Postgres` as the system of record
- `Sidekiq` or another durable Rails-compatible queue backend for asynchronous jobs
- `Redis` if Sidekiq is used
- object storage abstraction for generated PDFs and logs
- Dockerized LaTeX runtime derived from the current repository setup

## Reuse of the Existing Repository
### What is reused directly
- `src/template/resume.cls` as the initial default template class
- the current LuaLaTeX and `latexmk` compilation approach
- the Dockerized build model for LaTeX execution
- the modular section concept as inspiration for runtime block assembly

### What changes conceptually
- `.tex` files in `src/versions/...` stop being the source of truth for user resumes
- shared sections become application-driven render templates or partial generators
- user content moves to database-backed domain records
- generated `.tex` files become ephemeral build artifacts created from approved resume versions

### Practical migration stance
In the first application version, the existing LaTeX class and layout conventions should be preserved as much as possible. The system should focus on generating temporary `.tex` entrypoints from structured data rather than redesigning the visual template layer.

## Canonical Domain Model
### User
Owns all profile, block, target, and render data.

### Profile
Stores identity, contact details, localization preferences, and default resume preferences.

### Raw Intake
Stores user-submitted freeform content before normalization. Examples include pasted resumes, career narratives, LinkedIn-like summaries, project notes, and follow-up prompts.

Key fields:
- `user_id`
- `source_text`
- `source_type`
- `language`
- `status`
- `created_at`

### Block
Represents a reusable unit of professional evidence or narrative.

Examples:
- summary fragment
- experience
- project
- education
- certification
- skill
- custom block

Key fields:
- `user_id`
- `block_type`
- `canonical_label`
- `normalized_data` as JSONB
- `source_intake_id`
- `confidence_score`
- `status` such as proposed, approved, rejected, superseded
- `provenance_metadata`

### Block Variant
Represents a language-specific or style-specific rendering of a block while preserving the same block identity.

Key fields:
- `block_id`
- `language`
- `content`
- `tone`
- `created_by` as user or AI
- `approval_state`

### Job Target
Represents one target opportunity.

Key fields:
- `user_id`
- `company_name`
- `role_title`
- `job_description`
- `target_language`
- `notes`

### Resume
Logical container for versions associated with a job target.

### Resume Version
Represents one concrete proposed or approved assembly of a tailored resume.

Key fields:
- `resume_id`
- `language`
- `selected_block_ids`
- `section_order`
- `summary_strategy`
- `status` such as draft, proposed, approved, rendered, failed
- `proposal_metadata`
- `diff_metadata`

### Suggestion
Represents one AI-proposed mutation that can be accepted or rejected.

Examples:
- include this block
- remove that block
- rewrite this experience
- translate this project
- move projects ahead of education

Key fields:
- `resume_version_id`
- `suggestion_type`
- `target_ref`
- `rationale`
- `payload`
- `status`

### Render
Represents one asynchronous compile attempt.

Key fields:
- `resume_version_id`
- `status`
- `latex_source_path` or stored source reference
- `pdf_artifact_path`
- `build_log`
- `error_summary`

## Prompt-First but Structured
The UI is intentionally freeform. The user can describe their experience conversationally and ask for refinements in natural language. Internally, the system must not remain freeform.

The required pattern is:

1. capture raw input exactly as submitted
2. extract typed candidate blocks through AI orchestration
3. validate output shape and store normalized records
4. require approval before a block becomes canonical for reuse

This constraint is non-negotiable because reuse, translation, ranking, and rendering all depend on stable structured entities.

## AI Orchestration Design
### Responsibilities
- map domain use cases into prompt contracts
- call the configured provider through a provider-neutral adapter
- validate, normalize, and persist structured outputs
- create explicit suggestions rather than silently mutating approved content
- log model, prompt version, and execution metadata for traceability

### Provider abstraction
The application should define an adapter boundary with operations such as:

- `extract_blocks(raw_intake)`
- `rewrite_block(block, target_context)`
- `translate_block(block_variant, target_language)`
- `score_job_fit(job_target, candidate_blocks)`
- `propose_resume(job_target, approved_blocks)`

This keeps the domain isolated from provider-specific SDKs and allows future support for multiple providers without rewriting core business logic.

### Safety constraints
- AI must not directly overwrite approved canonical records without producing reviewable suggestions
- the system must preserve provenance linking extracted or rewritten content back to source material
- low-confidence outputs should be marked for extra review
- prompts should explicitly discourage unsupported claims and fabrication

## Resume Assembly Pipeline
### 1. Raw intake submission
The user submits freeform source material. The system stores it as `Raw Intake`.

### 2. Extraction job
An async job calls the AI extraction flow, producing typed candidate blocks and optional block variants.

### 3. Review flow
The user reviews proposed blocks and approves, edits, merges, or rejects them.

### 4. Job target submission
The user creates a `Job Target` from a job description and optional metadata.

### 5. Proposal job
An async job evaluates job fit and creates a `Resume Version` proposal using approved blocks plus explicit `Suggestions`.

### 6. Approval flow
The user reviews the proposed version, accepts or rejects individual suggestions, and approves the assembled draft.

### 7. Render job
A compile job receives the approved `Resume Version`, generates temporary `.tex` artifacts, compiles them, stores logs and PDF, and updates the `Render` record.

### 8. Delivery
The user downloads the generated PDF and can later clone or revise the same resume for another target.

## Render Architecture
### Render input contract
The compile engine receives a fully resolved, approved resume version, including:

- resolved profile data
- selected blocks
- selected block variants or required target language
- section ordering
- template identifier
- render options

### Render processing
The engine should:

1. map structured records into LaTeX-safe content
2. inject content into a generated temporary `.tex` document
3. reference the maintained `resume.cls` and supporting template assets
4. execute `latexmk -lualatex` inside an isolated runtime
5. capture the PDF and logs

### Isolation
Compilation should not run inline in the web process. It should run in a worker context, preferably containerized using the current Docker-based LaTeX environment or an equivalent isolated runtime. This keeps failures, timeouts, and package-specific issues away from the request path.

## Application Interfaces
The exact Rails controller naming can change, but the architecture should support workflow-level interfaces equivalent to:

- `POST /profiles/intake`
- `POST /blocks/extract`
- `POST /job_targets`
- `POST /resumes/propose`
- `POST /resume_versions/:id/approve`
- `POST /resume_versions/:id/render`
- `GET /renders/:id`

These represent system capabilities, not final route declarations.

## Persistence and Storage Strategy
### Postgres
Postgres is the canonical store for:

- users
- profiles
- raw intake
- blocks
- block variants
- job targets
- resumes
- resume versions
- suggestions
- render metadata
- LLM execution metadata

Use JSONB where flexibility is beneficial, especially for `normalized_data`, `proposal_metadata`, `diff_metadata`, and provider-specific metadata. Keep lifecycle state and query-critical fields modeled explicitly in relational columns.

### File storage
Generated artifacts should be stored outside the database body:

- rendered PDFs
- optional generated `.tex` snapshots
- compile logs if large

The DB stores references, status, and summary metadata.

## State and Approval Rules
- raw intake is never treated as canonical resume data by itself
- blocks become reusable only after user approval
- suggestions never silently apply themselves to approved content
- a resume version can be rendered only after approval
- each render must be traceable to one approved resume version

## Failure Modes
### LLM failures
- provider timeout or API error
- malformed structured response
- low-confidence extraction
- unsupported translation or rewrite quality

Response:
- keep the raw intake or current draft intact
- mark the job as failed or requiring review
- surface a recoverable retry path

### Compile failures
- malformed LaTeX escaping
- missing template asset
- incompatible generated content

Response:
- store logs and summarized error metadata
- keep the approved resume version unchanged
- allow re-render after correction

## Security and Trust Considerations
- escape and sanitize all user-generated content before LaTeX compilation
- isolate compilation to reduce blast radius from malformed content
- preserve auditability of AI-generated changes
- avoid hidden auto-rewrites that the user did not approve

## Scalability Path
The modular monolith should preserve clear seams for later extraction:

### Likely first extraction
The compile engine can become a dedicated render service if:
- render traffic increases
- compile isolation needs become stricter
- job throughput or queue contention grows

### Possible later extraction
AI orchestration can become its own service if provider routing, prompt management, or model governance becomes materially complex.

The initial architecture should keep these as internal modules with well-defined service interfaces so extraction is a deployment decision, not a domain redesign.

## Suggested Implementation Phases
### Phase 1
- bootstrap Rails app and Postgres schema
- implement auth and profile basics
- model raw intake, blocks, job targets, resumes, suggestions, and renders
- wrap current LaTeX engine in a worker-driven render module

### Phase 2
- add AI extraction and review workflow
- add job-target analysis and resume proposal generation
- add PT and EN block variant support

### Phase 3
- improve observability, retries, and template controls
- optimize assembly quality and explanation UX
- prepare extraction seams if operational pressure justifies it

## Acceptance Criteria
The architecture is successful for v1 when it supports these guarantees:

- canonical resume data lives in Postgres, not hand-maintained `.tex` files
- prompt-first user interaction still results in reusable typed internal blocks
- every AI-generated change is reviewable
- every rendered PDF is traceable to an approved resume version
- LaTeX compilation is asynchronous and isolated
- the existing LaTeX layout system is reused as the initial rendering layer
- PT and EN are first-class output languages, with room for more languages later
