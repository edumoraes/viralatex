mod app_state;
mod domain;
mod renderer;
mod workspace;

use app_state::AppState;
use domain::{Block, RenderResult, ResumeDefinition, WorkspaceSummary};
use std::path::PathBuf;
use tauri::State;

#[tauri::command(rename_all = "camelCase")]
fn create_sample_workspace(
    path: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceSummary, String> {
    let root = PathBuf::from(path);
    workspace::create_sample_workspace(&root)?;

    {
        let mut guard = state
            .selected_workspace
            .lock()
            .map_err(|_| "Failed to lock workspace state.".to_string())?;
        *guard = Some(root.clone());
    }

    workspace::summarize_workspace(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn select_workspace(path: String, state: State<'_, AppState>) -> Result<WorkspaceSummary, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Failed to open workspace path: {error}"))?;
    workspace::validate_workspace(&canonical)?;

    {
        let mut guard = state
            .selected_workspace
            .lock()
            .map_err(|_| "Failed to lock workspace state.".to_string())?;
        *guard = Some(canonical.clone());
    }

    workspace::summarize_workspace(&canonical)
}

#[tauri::command(rename_all = "camelCase")]
fn load_workspace_summary(state: State<'_, AppState>) -> Result<WorkspaceSummary, String> {
    let root = selected_workspace_root(&state)?;
    workspace::summarize_workspace(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn list_blocks(state: State<'_, AppState>) -> Result<Vec<Block>, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_blocks(&root)
}

#[tauri::command(rename_all = "camelCase")]
fn list_resumes(state: State<'_, AppState>) -> Result<Vec<ResumeDefinition>, String> {
    let root = selected_workspace_root(&state)?;
    workspace::load_resumes(&root)
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
    {
        let mut guard = state
            .render_history
            .lock()
            .map_err(|_| "Failed to lock render history.".to_string())?;
        guard.insert(result.job_id.clone(), result.clone());
    }
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
fn get_render_status(
    job_id: String,
    state: State<'_, AppState>,
) -> Result<Option<RenderResult>, String> {
    let guard = state
        .render_history
        .lock()
        .map_err(|_| "Failed to lock render history.".to_string())?;
    Ok(guard.get(&job_id).cloned())
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

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            create_sample_workspace,
            select_workspace,
            load_workspace_summary,
            list_blocks,
            list_resumes,
            render_resume,
            get_render_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
