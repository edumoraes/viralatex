use crate::domain::RenderResult;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub selected_workspace: Mutex<Option<PathBuf>>,
    pub render_history: Mutex<HashMap<String, RenderResult>>,
}
