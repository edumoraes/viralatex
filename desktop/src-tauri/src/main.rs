#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const WORKSPACE_MODE: &str = "workspaceCanonical";

fn main() {
    let _ = WORKSPACE_MODE;
    resume_studio_desktop_lib::run();
}
