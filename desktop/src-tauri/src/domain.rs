use serde::{Deserialize, Serialize};

pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
pub const APP_DIR: &str = ".app";
pub const ARCHIVED_DIR: &str = "_archived";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceManifest {
    pub schema_version: u32,
    pub workspace_id: String,
    pub workspace_name: String,
    pub default_template_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub roles: Roles,
    pub email: String,
    pub location: String,
    pub linkedin: String,
    pub github: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roles {
    pub pt: String,
    pub en: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub block_type: String,
    pub language: String,
    pub section: String,
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub date_range: Option<String>,
    pub content: Option<String>,
    #[serde(default)]
    pub items: Vec<String>,
    pub label: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeDefinition {
    pub id: String,
    pub title: String,
    pub language: String,
    pub role_key: String,
    pub block_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub root_path: String,
    pub workspace_name: String,
    pub profile_name: String,
    pub available_languages: Vec<String>,
    pub block_count: usize,
    pub resume_count: usize,
    pub render_history_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
    pub job_id: String,
    pub resume_id: String,
    pub status: String,
    pub output_path: Option<String>,
    pub log_path: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppWorkspaceState {
    #[serde(default)]
    pub last_selected_resume_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub summary: WorkspaceSummary,
    pub manifest: WorkspaceManifest,
    pub profile: Profile,
    pub blocks: Vec<Block>,
    pub resumes: Vec<ResumeDefinition>,
    pub render_history: Vec<RenderResult>,
    pub app_state: AppWorkspaceState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmTaskRequest {
    pub task_type: String,
    #[serde(default)]
    pub input_text: String,
    pub block_id: Option<String>,
    pub resume_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmTaskResult {
    pub task_type: String,
    pub status: String,
    pub provider: String,
    pub output_text: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiServiceStatus {
    pub base_url: String,
    pub provider: String,
    pub model: String,
    pub healthy: bool,
}
