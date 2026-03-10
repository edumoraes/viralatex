use crate::app_state::{AiServiceHandle, AppState};
use crate::domain::AiServiceStatus;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

const HOST: &str = "127.0.0.1";

pub fn ensure_started(state: &State<'_, AppState>) -> Result<AiServiceStatus, String> {
    let mut guard = state
        .ai_service
        .lock()
        .map_err(|_| "Failed to lock AI service state.".to_string())?;

    if let Some(handle) = guard.as_mut() {
        if handle
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect AI service process: {error}"))?
            .is_none()
        {
            return health_check(handle.port);
        }
        *guard = None;
    }

    let port = reserve_port()?;
    let script_path = python_script_path()?;
    let python = resolve_python_binary()?;
    let mut child = Command::new(python)
        .arg(script_path)
        .env("RESUME_STUDIO_AI_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start AI sidecar: {error}"))?;

    let started = wait_for_health(port);
    if started.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    started?;

    *guard = Some(AiServiceHandle { port, child });
    health_check(port)
}

fn reserve_port() -> Result<u16, String> {
    let listener = TcpListener::bind((HOST, 0))
        .map_err(|error| format!("Failed to reserve AI service port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read AI service port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn resolve_python_binary() -> Result<String, String> {
    for candidate in ["python3", "python"] {
        if which::which(candidate).is_ok() {
            return Ok(candidate.to_string());
        }
    }

    Err("Python 3 is required to run the AI sidecar.".to_string())
}

fn python_script_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let script_path = manifest_dir
        .parent()
        .ok_or_else(|| "Failed to resolve desktop root.".to_string())?
        .join("ai_service")
        .join("server.py");

    if script_path.is_file() {
        Ok(script_path)
    } else {
        Err(format!(
            "AI sidecar entrypoint not found at {}.",
            script_path.display()
        ))
    }
}

fn wait_for_health(port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut last_error = String::from("AI service did not become healthy.");

    while Instant::now() < deadline {
        match health_check(port) {
            Ok(_) => return Ok(()),
            Err(error) => {
                last_error = error;
                thread::sleep(Duration::from_millis(150));
            }
        }
    }

    Err(last_error)
}

fn health_check(port: u16) -> Result<AiServiceStatus, String> {
    let mut stream = TcpStream::connect((HOST, port))
        .map_err(|error| format!("Failed to connect to AI sidecar: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Failed to configure AI sidecar timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Failed to configure AI sidecar timeout: {error}"))?;

    let request =
        format!("GET /health HTTP/1.1\r\nHost: {HOST}:{port}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Failed to query AI sidecar health: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Failed to read AI sidecar health response: {error}"))?;

    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "AI sidecar returned an invalid health response.".to_string())?;

    serde_json::from_str(body)
        .map_err(|error| format!("Failed to parse AI sidecar health response: {error}"))
}
