mod app_state;
mod domain;
mod llm;
mod renderer;
mod workspace;

use app_state::AppState;
use domain::{
    AppWorkspaceState, Block, LlmTaskRequest, LlmTaskResult, Profile, RenderResult,
    ResumeDefinition, WorkspaceSnapshot, WorkspaceSummary,
};
use std::path::{Path, PathBuf};
use tauri::State;

#[tauri::command(rename_all = "camelCase")]
fn create_sample_workspace(
    path: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceSnapshot, String> {
    let root = PathBuf::from(path);
    workspace::create_sample_workspace(&root)?;
    set_selected_workspace(&state, &root)?;
    workspace::load_workspace_snapshot(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn select_workspace(path: String, state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Failed to open workspace path: {error}"))?;
    workspace::validate_workspace(&canonical)?;
    set_selected_workspace(&state, &canonical)?;
    workspace::load_workspace_snapshot(&canonical)
}

#[tauri::command(rename_all = "camelCase")]
fn load_workspace_summary(state: State<'_, AppState>) -> Result<WorkspaceSummary, String> {
    let root = selected_workspace_root(&state)?;
    workspace::summarize_workspace(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn load_workspace_snapshot(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_workspace_snapshot(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn get_profile(state: State<'_, AppState>) -> Result<Profile, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_profile(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn save_profile(profile: Profile, state: State<'_, AppState>) -> Result<Profile, String> {
    let root = selected_workspace_root(&state)?;
    workspace::save_profile(&root, &profile)
}

#[tauri::command(rename_all = "camelCase")]
fn list_blocks(state: State<'_, AppState>) -> Result<Vec<Block>, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_blocks(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn create_block(block: Block, state: State<'_, AppState>) -> Result<Block, String> {
    let root = selected_workspace_root(&state)?;
    workspace::create_block(&root, &block)
}

#[tauri::command(rename_all = "camelCase")]
fn update_block(block: Block, state: State<'_, AppState>) -> Result<Block, String> {
    let root = selected_workspace_root(&state)?;
    workspace::update_block(&root, &block)
}

#[tauri::command(rename_all = "camelCase")]
fn archive_block(block_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = selected_workspace_root(&state)?;
    workspace::archive_block(&root, &block_id)
}

#[tauri::command(rename_all = "camelCase")]
fn list_resumes(state: State<'_, AppState>) -> Result<Vec<ResumeDefinition>, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_resumes(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn create_resume(
    resume: ResumeDefinition,
    state: State<'_, AppState>,
) -> Result<ResumeDefinition, String> {
    let root = selected_workspace_root(&state)?;
    workspace::create_resume(&root, &resume)
}

#[tauri::command(rename_all = "camelCase")]
fn update_resume(
    resume: ResumeDefinition,
    state: State<'_, AppState>,
) -> Result<ResumeDefinition, String> {
    let root = selected_workspace_root(&state)?;
    workspace::update_resume(&root, &resume)
}

#[tauri::command(rename_all = "camelCase")]
fn archive_resume(resume_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = selected_workspace_root(&state)?;
    workspace::archive_resume(&root, &resume_id)
}

#[tauri::command(rename_all = "camelCase")]
fn get_app_workspace_state(state: State<'_, AppState>) -> Result<AppWorkspaceState, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_app_state(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn save_app_workspace_state(
    app_state: AppWorkspaceState,
    state: State<'_, AppState>,
) -> Result<AppWorkspaceState, String> {
    let root = selected_workspace_root(&state)?;
    workspace::save_app_state(&root, &app_state)
}

#[tauri::command(rename_all = "camelCase")]
fn list_render_history(state: State<'_, AppState>) -> Result<Vec<RenderResult>, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_render_history(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn render_resume(resume_id: String, state: State<'_, AppState>) -> Result<RenderResult, String> {
    let root = selected_workspace_root(&state)?;
    let profile = workspace::load_profile(&root)?;
    let blocks = workspace::load_blocks(&root)?;
    let resumes = workspace::load_resumes(&root)?;
    let resume = resumes
        .iter()
        .find(|entry| entry.id == resume_id)
        .cloned()
        .ok_or_else(|| format!("Unknown resume id: {resume_id}"))?;

    let result = renderer::render_resume(&root, &profile, &blocks, &resume);
    workspace::append_render_history(&root, &result)?;
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
fn run_llm_task(request: LlmTaskRequest) -> Result<LlmTaskResult, String> {
    Ok(llm::run_task(&request))
}

fn selected_workspace_root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let guard = state
        .selected_workspace
        .lock()
        .map_err(|_| "Failed to lock workspace state.".to_string())?;
    guard
        .clone()
        .ok_or_else(|| "No workspace selected yet.".to_string())
}

fn set_selected_workspace(state: &State<'_, AppState>, root: &Path) -> Result<(), String> {
    let mut guard = state
        .selected_workspace
        .lock()
        .map_err(|_| "Failed to lock workspace state.".to_string())?;
    *guard = Some(root.to_path_buf());
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            create_sample_workspace,
            select_workspace,
            load_workspace_summary,
            load_workspace_snapshot,
            get_profile,
            save_profile,
            list_blocks,
            create_block,
            update_block,
            archive_block,
            list_resumes,
            create_resume,
            update_resume,
            archive_resume,
            get_app_workspace_state,
            save_app_workspace_state,
            list_render_history,
            render_resume,
            run_llm_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
