# Resume Tailoring Web Application PRD

## Summary
This product turns the current LaTeX resume generator into a web application that helps a professional maintain a complete career knowledge base and rapidly assemble tailored resumes for specific job applications.

Version 1 is a fullstack web application built around three principles:

- the user works primarily through natural language, not manual LaTeX editing
- the system converts raw input into reusable structured resume blocks
- every job-specific resume is proposed by AI, reviewed by the user, and rendered to PDF through the existing LaTeX engine

The current repository already solves the final presentation problem well. In v1, that LaTeX foundation becomes the rendering layer of a larger product that manages profile data, reusable content blocks, job targeting, AI suggestions, and versioned outputs.

## Problem
Maintaining a resume for multiple job applications is repetitive and slow. Most candidates keep fragmented information across old resumes, LinkedIn, notes, portfolios, and memory. Tailoring a resume for each opportunity usually means rewriting similar content, translating sections manually, and deciding under time pressure what should be emphasized.

This leads to four recurring problems:

- the full professional history is not captured in one reusable system
- tailoring for each vacancy takes too long
- translation and rewriting quality is inconsistent
- the final resume often does not align well with the target role

## Product Vision
The application becomes a personal resume operating system:

- it stores the user's complete professional history
- it breaks that history into reusable blocks
- it evaluates a target job description against available blocks
- it proposes a high-adherence resume draft for the specific job
- it helps translate, rewrite, reorder, and refine content
- it renders an approved PDF using a high-quality LaTeX template

The product is a copilot, not an autopilot. AI helps generate and refine options, but the user remains responsible for approving what will be used in the final resume.

## Target User
### Primary audience
Single professionals who want to maintain a high-quality career profile and quickly generate tailored resumes for different applications.

### Initial user profile
- software engineers and adjacent technical professionals
- professionals applying to multiple positions in PT-BR and English
- users comfortable describing their experience in natural language, but not interested in editing LaTeX or manually assembling multiple resume versions

## Goals
### Business and product goals
- reduce the time required to create a tailored resume for a new job application
- improve the relevance of resume content to the target vacancy
- centralize all professional information in one reusable system
- preserve high-quality PDF output through LaTeX

### User goals
- describe my full history once and reuse it many times
- ask the system to tailor a resume for a specific vacancy
- receive suggestions for what to include, remove, rewrite, or translate
- approve the final version before generating the PDF

## Non-Goals for v1
- recruiter-facing features
- collaborative editing or agency workflows
- billing and subscription management
- direct LaTeX editing by end users
- an open template marketplace
- advanced analytics for application outcomes
- fully autonomous resume generation without explicit user approval

## Core Principles
- `Prompt-first UX`: the main interaction model is freeform natural language
- `Structured persistence`: the backend normalizes content into reusable typed blocks
- `Human approval`: important content changes and final resume generation require approval
- `Versioned outputs`: each generated resume is tied to a specific target opportunity and version history
- `LaTeX-first rendering`: final output quality is handled by the existing template engine
- `Extensible localization`: PT and EN are mandatory in v1, but the model must support additional languages later

## User Journey
### 1. Profile setup
The user creates an account and starts describing their background in natural language. They can paste long-form summaries, old resumes, LinkedIn-style content, project notes, or job history.

### 2. AI-assisted ingestion
The system parses that raw input and proposes reusable blocks, such as:

- professional summary fragments
- experiences
- projects
- education items
- certifications
- skills
- custom evidence blocks

Each proposed block includes extracted fields, source traceability, and confidence indicators where relevant.

### 3. Review and approval
The user reviews extracted blocks, accepts them, edits them, or rejects them. Approved blocks become part of the reusable professional knowledge base.

### 4. Job targeting
The user pastes a job description and optionally specifies company, role title, preferred language, and emphasis preferences.

### 5. Resume proposal
The system analyzes the target vacancy, evaluates available blocks, and proposes:

- which blocks should be included
- recommended ordering
- suggested rewrites
- suggested translations
- suggested emphasis changes
- coverage gaps or missing evidence

### 6. Draft approval
The user reviews the proposed tailored resume and accepts or rejects suggestions before generating the final document.

### 7. Render and download
The system compiles an approved version through the LaTeX rendering engine and returns a PDF with associated version metadata.

## Key Features
### 1. Professional knowledge base
- store the complete professional profile in a reusable system of blocks
- preserve source text and normalized content
- maintain approval state and provenance

### 2. Prompt-first authoring
- allow users to add and refine content through conversational or freeform input
- support iterative follow-up prompts such as "rewrite this for senior backend roles" or "make this stronger in English"

### 3. AI extraction and normalization
- transform raw input into typed internal blocks
- identify missing fields, ambiguities, and overlap
- capture confidence and rationale for traceability

### 4. Job-fit analysis
- evaluate the alignment between a vacancy and the user's existing blocks
- highlight the strongest matching evidence
- point out missing qualifications or weak coverage

### 5. Resume assembly suggestions
- propose a tailored set of blocks for a specific opportunity
- suggest ordering, wording, language, and emphasis changes
- keep all changes reviewable before finalization

### 6. Translation and rewriting
- support PT and EN content generation in v1
- distinguish between original block meaning and language-specific variants
- preserve user-approved versions for reuse

### 7. PDF rendering
- convert an approved resume version into LaTeX
- compile the final PDF using the current class and layout system
- store logs and output artifacts for troubleshooting

## Functional Requirements
### Accounts and identity
- users can register and sign in
- each user owns one professional profile in v1
- all profile, block, and resume data is isolated per user

### Profile intake
- users can submit freeform raw content at any time
- the system stores raw intake separately from approved blocks
- the system can process multiple intake submissions over time

### Block lifecycle
- the system creates typed candidate blocks from intake
- the user can approve, edit, merge, or reject proposed blocks
- approved blocks remain reusable across many target resumes

### Job targeting
- users can create a target opportunity from a pasted job description
- a target opportunity can include optional metadata such as company, title, language, and notes

### Resume generation
- the system can create a proposed resume draft from approved blocks plus a target opportunity
- the system records the selected blocks, order, language, and AI suggestions
- the user must approve the draft before final PDF generation

### Suggestions
- suggestions are explicit objects that can be accepted or rejected
- suggestions may include selection changes, rewrites, translations, reorderings, or warnings
- suggestions must include rationale

### Rendering
- only approved resume versions can be rendered to final PDF
- each render stores status, logs, output file reference, and source version reference

## Data Model Concepts
These are product-level concepts that the architecture must support:

- `User`: authenticated owner of the profile
- `Profile`: canonical professional identity and global preferences
- `Raw Intake`: freeform source material submitted by the user
- `Block`: reusable unit of resume content
- `Block Variant`: language-specific or style-specific representation of a block
- `Job Target`: a job description plus metadata for one opportunity
- `Resume`: logical grouping for a target opportunity
- `Resume Version`: a specific assembled draft with selected blocks and suggestions
- `Suggestion`: an AI-proposed change requiring review
- `Render`: an asynchronous compile attempt that produces artifacts

## Languages and Localization
- PT and EN are required in v1
- the domain must support more languages later without redesigning the core entities
- content identity and translated representation must be distinct concepts
- job targeting and output generation must allow a requested output language independent of the source intake language

## UX Requirements
- the primary authoring surface should feel like guided natural-language interaction
- the user must still be able to inspect what the system extracted and plans to use
- the user should see why a block or suggestion was selected for a job
- the user should be able to compare resume versions for different opportunities
- the product should make the review step explicit before final generation

## Success Metrics
### Core product metrics
- median time from pasted job description to approved tailored resume draft
- median time from approved draft to rendered PDF
- acceptance rate of AI suggestions
- percent of job-targeted resumes successfully rendered
- reuse rate of approved blocks across multiple opportunities

### Quality metrics
- user-rated relevance of the tailored resume to the target vacancy
- user-rated quality of translations and rewrites
- frequency of manual corrections after AI extraction
- frequency of failed or rejected resume proposals

## Risks
- low-quality extraction from noisy freeform input
- AI suggestions introducing unsupported claims or exaggeration
- translation that changes intended meaning
- compile failures caused by malformed generated LaTeX
- over-automation reducing user trust

## Release Scope for v1
Version 1 ships when the product can do the following end to end:

- accept freeform professional history from a single authenticated user
- normalize it into reusable blocks with AI assistance
- let the user approve those blocks
- accept a target job description
- propose a tailored PT or EN resume draft with explicit suggestions
- let the user approve the draft
- render and deliver a PDF using the existing LaTeX presentation layer

Anything beyond that is secondary to achieving a reliable end-to-end tailoring workflow.
