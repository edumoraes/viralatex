use crate::app_state::{AiServiceHandle, AppState};
use crate::domain::{AiProviderConfig, AiProviderConfigInput, AiServiceStatus};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const HOST: &str = "127.0.0.1";
const CONFIG_FILE: &str = "config.yml";
const OPENAI_PROVIDER: &str = "openai";
const ANTHROPIC_PROVIDER: &str = "anthropic";
const OLLAMA_PROVIDER: &str = "ollama";
const STUB_PROVIDER: &str = "stub";
const DEFAULT_OPENAI_MODEL: &str = "openai:gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL: &str = "anthropic:claude-3-5-haiku-latest";
const DEFAULT_OLLAMA_MODEL: &str = "ollama:llama3.2";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredAiProviderConfig {
    provider: String,
    #[serde(default)]
    api_key: Option<String>,
}

pub fn ensure_started(
    state: &State<'_, AppState>,
    app: &AppHandle,
) -> Result<AiServiceStatus, String> {
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
    let data_dir = ai_service_data_dir(app)?;
    let config = load_stored_config(&config_path(app)?)?.unwrap_or_else(default_stored_config);
    let mut command = Command::new(python);
    command
        .arg(script_path)
        .env("RESUME_STUDIO_AI_PORT", port.to_string())
        .env("RESUME_STUDIO_AI_DATA_DIR", &data_dir)
        .env("RESUME_STUDIO_AI_PROVIDER", &config.provider)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_provider_env(&mut command, &config);
    let mut child = command
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

pub fn load_config(app: &AppHandle) -> Result<AiProviderConfig, String> {
    let stored = load_stored_config(&config_path(app)?)?.unwrap_or_else(default_stored_config);
    Ok(mask_config(&stored))
}

pub fn update_config(
    state: &State<'_, AppState>,
    app: &AppHandle,
    input: AiProviderConfigInput,
) -> Result<AiServiceStatus, String> {
    let path = config_path(app)?;
    let existing = load_stored_config(&path)?;
    let stored = normalize_config(input, existing.as_ref())?;
    write_stored_config(&path, &stored)?;
    stop_running_service(state)?;
    ensure_started(state, app)
}

fn stop_running_service(state: &State<'_, AppState>) -> Result<(), String> {
    let mut guard = state
        .ai_service
        .lock()
        .map_err(|_| "Failed to lock AI service state.".to_string())?;

    if let Some(handle) = guard.as_mut() {
        let _ = handle.child.kill();
        let _ = handle.child.wait();
    }

    *guard = None;
    Ok(())
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
    if let Ok(path) = venv_python_path() {
        return Ok(path.display().to_string());
    }

    for candidate in ["python3", "python"] {
        if which::which(candidate).is_ok() {
            return Ok(candidate.to_string());
        }
    }

    Err("Python 3 is required to run the AI sidecar.".to_string())
}

fn venv_python_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let python = manifest_dir
        .parent()
        .ok_or_else(|| "Failed to resolve desktop root.".to_string())?
        .join("ai_service")
        .join(".venv")
        .join("bin")
        .join("python");

    if python.is_file() {
        Ok(python)
    } else {
        Err("AI sidecar virtualenv not found.".to_string())
    }
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

fn ai_service_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve AI sidecar data directory: {error}"))?
        .join("ai-service");
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Failed to prepare AI sidecar data directory: {error}"))?;
    Ok(data_dir)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ai_service_data_dir(app)?.join(CONFIG_FILE))
}

fn load_stored_config(path: &Path) -> Result<Option<StoredAiProviderConfig>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read AI provider config {}: {error}",
            path.display()
        )
    })?;
    serde_yaml::from_str(&raw).map(Some).map_err(|error| {
        format!(
            "Failed to parse AI provider config {}: {error}",
            path.display()
        )
    })
}

fn write_stored_config(path: &Path, config: &StoredAiProviderConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create directory {}: {error}", parent.display()))?;
    }

    let body = serde_yaml::to_string(config).map_err(|error| {
        format!(
            "Failed to serialize AI provider config for {}: {error}",
            path.display()
        )
    })?;
    fs::write(path, body).map_err(|error| {
        format!(
            "Failed to write AI provider config {}: {error}",
            path.display()
        )
    })
}

fn default_stored_config() -> StoredAiProviderConfig {
    StoredAiProviderConfig {
        provider: STUB_PROVIDER.to_string(),
        api_key: None,
    }
}

fn mask_config(config: &StoredAiProviderConfig) -> AiProviderConfig {
    AiProviderConfig {
        provider: config.provider.clone(),
        has_api_key: config
            .api_key
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
    }
}

fn normalize_config(
    input: AiProviderConfigInput,
    existing: Option<&StoredAiProviderConfig>,
) -> Result<StoredAiProviderConfig, String> {
    let provider = normalize_provider(&input.provider)?;
    let api_key = input
        .api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            existing
                .filter(|config| config.provider == provider)
                .and_then(|config| config.api_key.clone())
        });

    if requires_api_key(&provider) && api_key.is_none() {
        return Err(format!("Provider {provider} requires an API key."));
    }

    Ok(StoredAiProviderConfig { provider, api_key })
}

fn normalize_provider(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_lowercase();
    if matches!(
        normalized.as_str(),
        OPENAI_PROVIDER | ANTHROPIC_PROVIDER | OLLAMA_PROVIDER | STUB_PROVIDER
    ) {
        Ok(normalized)
    } else {
        Err(format!("Unsupported AI provider: {provider}"))
    }
}

fn requires_api_key(provider: &str) -> bool {
    matches!(provider, OPENAI_PROVIDER | ANTHROPIC_PROVIDER)
}

fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        OPENAI_PROVIDER => DEFAULT_OPENAI_MODEL,
        ANTHROPIC_PROVIDER => DEFAULT_ANTHROPIC_MODEL,
        OLLAMA_PROVIDER => DEFAULT_OLLAMA_MODEL,
        _ => STUB_PROVIDER,
    }
}

fn apply_provider_env(command: &mut Command, config: &StoredAiProviderConfig) {
    command.env_remove("OPENAI_API_KEY");
    command.env_remove("ANTHROPIC_API_KEY");
    command.env_remove("OLLAMA_BASE_URL");
    command.env_remove("OLLAMA_MODEL");
    command.env(
        "RESUME_STUDIO_AI_MODEL",
        default_model_for_provider(&config.provider),
    );

    match config.provider.as_str() {
        OPENAI_PROVIDER => {
            if let Some(api_key) = config.api_key.as_ref() {
                command.env("OPENAI_API_KEY", api_key);
            }
        }
        ANTHROPIC_PROVIDER => {
            if let Some(api_key) = config.api_key.as_ref() {
                command.env("ANTHROPIC_API_KEY", api_key);
            }
        }
        OLLAMA_PROVIDER | STUB_PROVIDER => {}
        _ => {}
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn env_value(command: &Command, key: &str) -> Option<String> {
        command.get_envs().find_map(|(name, value)| {
            if name == key {
                value.map(|entry| entry.to_string_lossy().to_string())
            } else {
                None
            }
        })
    }

    #[test]
    fn stored_config_roundtrips_and_masks_api_key() {
        let temp = tempdir().expect("tempdir should exist");
        let path = temp.path().join("config.yml");
        let config = StoredAiProviderConfig {
            provider: OPENAI_PROVIDER.to_string(),
            api_key: Some("secret".to_string()),
        };

        write_stored_config(&path, &config).expect("config should be written");
        let loaded = load_stored_config(&path)
            .expect("config should load")
            .expect("config should exist");

        assert_eq!(loaded.provider, OPENAI_PROVIDER);
        assert!(mask_config(&loaded).has_api_key);
    }

    #[test]
    fn normalize_config_requires_api_key_for_remote_provider() {
        let error = normalize_config(
            AiProviderConfigInput {
                provider: OPENAI_PROVIDER.to_string(),
                api_key: None,
            },
            None,
        )
        .expect_err("openai without key should fail");

        assert!(error.contains("requires an API key"));
    }

    #[test]
    fn normalize_config_accepts_ollama_without_api_key() {
        let config = normalize_config(
            AiProviderConfigInput {
                provider: OLLAMA_PROVIDER.to_string(),
                api_key: None,
            },
            None,
        )
        .expect("ollama config should be valid");

        assert_eq!(config.provider, OLLAMA_PROVIDER);
        assert_eq!(config.api_key, None);
    }

    #[test]
    fn normalize_config_accepts_stub_without_api_key() {
        let config = normalize_config(
            AiProviderConfigInput {
                provider: STUB_PROVIDER.to_string(),
                api_key: None,
            },
            None,
        )
        .expect("stub config should be valid");

        assert_eq!(config.provider, STUB_PROVIDER);
        assert_eq!(config.api_key, None);
    }

    #[test]
    fn normalize_config_rejects_unsupported_provider() {
        let error = normalize_config(
            AiProviderConfigInput {
                provider: "bedrock".to_string(),
                api_key: None,
            },
            None,
        )
        .expect_err("unsupported provider should fail");

        assert!(error.contains("Unsupported AI provider"));
        assert!(error.contains("bedrock"));
    }

    #[test]
    fn default_model_matches_each_provider() {
        assert_eq!(
            default_model_for_provider(OPENAI_PROVIDER),
            DEFAULT_OPENAI_MODEL
        );
        assert_eq!(
            default_model_for_provider(ANTHROPIC_PROVIDER),
            DEFAULT_ANTHROPIC_MODEL
        );
        assert_eq!(
            default_model_for_provider(OLLAMA_PROVIDER),
            DEFAULT_OLLAMA_MODEL
        );
        assert_eq!(default_model_for_provider(STUB_PROVIDER), STUB_PROVIDER);
    }

    #[test]
    fn normalize_config_reuses_existing_api_key_for_same_provider() {
        let config = normalize_config(
            AiProviderConfigInput {
                provider: OPENAI_PROVIDER.to_string(),
                api_key: None,
            },
            Some(&StoredAiProviderConfig {
                provider: OPENAI_PROVIDER.to_string(),
                api_key: Some("secret".to_string()),
            }),
        )
        .expect("existing key should be reused");

        assert_eq!(config.api_key.as_deref(), Some("secret"));
    }

    #[test]
    fn apply_provider_env_sets_openai_model_and_key_only() {
        let mut command = Command::new("python3");
        command.env("ANTHROPIC_API_KEY", "stale-anthropic");
        command.env("OLLAMA_MODEL", "stale-ollama");

        apply_provider_env(
            &mut command,
            &StoredAiProviderConfig {
                provider: OPENAI_PROVIDER.to_string(),
                api_key: Some("secret".to_string()),
            },
        );

        assert_eq!(
            env_value(&command, "RESUME_STUDIO_AI_MODEL").as_deref(),
            Some(DEFAULT_OPENAI_MODEL)
        );
        assert_eq!(
            env_value(&command, "OPENAI_API_KEY").as_deref(),
            Some("secret")
        );
        assert_eq!(env_value(&command, "ANTHROPIC_API_KEY"), None);
        assert_eq!(env_value(&command, "OLLAMA_MODEL"), None);
        assert_eq!(env_value(&command, "OLLAMA_BASE_URL"), None);
    }

    #[test]
    fn apply_provider_env_clears_stale_remote_provider_keys() {
        let mut command = Command::new("python3");
        command.env("OPENAI_API_KEY", "stale-openai");
        command.env("ANTHROPIC_API_KEY", "stale-anthropic");
        command.env("OLLAMA_BASE_URL", "http://localhost:11434");
        command.env("OLLAMA_MODEL", "llama3.2");

        apply_provider_env(
            &mut command,
            &StoredAiProviderConfig {
                provider: STUB_PROVIDER.to_string(),
                api_key: None,
            },
        );

        assert_eq!(
            env_value(&command, "RESUME_STUDIO_AI_MODEL").as_deref(),
            Some(STUB_PROVIDER)
        );
        assert_eq!(env_value(&command, "OPENAI_API_KEY"), None);
        assert_eq!(env_value(&command, "ANTHROPIC_API_KEY"), None);
        assert_eq!(env_value(&command, "OLLAMA_BASE_URL"), None);
        assert_eq!(env_value(&command, "OLLAMA_MODEL"), None);
    }
}
