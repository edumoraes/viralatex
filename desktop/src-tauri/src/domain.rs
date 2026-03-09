use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub root_path: String,
    pub profile_name: String,
    pub available_languages: Vec<String>,
    pub block_count: usize,
    pub resume_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
    pub job_id: String,
    pub resume_id: String,
    pub status: String,
    pub output_path: Option<String>,
    pub log_path: Option<String>,
    pub error_message: Option<String>,
}
