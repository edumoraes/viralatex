use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

pub struct AiServiceHandle {
    pub port: u16,
    pub child: Child,
}

pub struct AppState {
    pub selected_workspace: Mutex<Option<PathBuf>>,
    pub ai_service: Mutex<Option<AiServiceHandle>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            selected_workspace: Mutex::new(None),
            ai_service: Mutex::new(None),
        }
    }
}
