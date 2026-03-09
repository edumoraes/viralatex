use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub selected_workspace: Mutex<Option<PathBuf>>,
}
