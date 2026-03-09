use crate::domain::{
    AppWorkspaceState, Block, Profile, RenderResult, ResumeDefinition, WorkspaceManifest,
    WorkspaceSnapshot, WorkspaceSummary, APP_DIR, ARCHIVED_DIR, WORKSPACE_SCHEMA_VERSION,
};
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

const REQUIRED_DIRECTORIES: &[&str] = &["profile", "blocks", "resumes", "renders"];

pub fn sample_workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples/sample-workspace")
        .canonicalize()
        .expect("sample workspace should exist")
}

pub fn template_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates/default")
}

pub fn validate_workspace(root: &Path) -> Result<WorkspaceManifest, String> {
    if !root.exists() {
        return Err(format!("Workspace path does not exist: {}", root.display()));
    }

    let manifest = load_manifest(root)?;

    if manifest.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported workspace schema version {} in {}. Expected {}.",
            manifest.schema_version,
            root.join("workspace.yml").display(),
            WORKSPACE_SCHEMA_VERSION
        ));
    }

    for directory in REQUIRED_DIRECTORIES {
        let path = root.join(directory);
        if !path.is_dir() {
            return Err(format!("Missing workspace directory: {}", path.display()));
        }
    }

    ensure_app_dirs(root)?;

    let profile_path = root.join("profile/profile.yml");
    if !profile_path.is_file() {
        return Err(format!("Missing profile file: {}", profile_path.display()));
    }

    Ok(manifest)
}

pub fn create_sample_workspace(target: &Path) -> Result<(), String> {
    if target.exists() {
        let mut entries = target
            .read_dir()
            .map_err(|error| format!("Failed to inspect target directory: {error}"))?;
        if entries.next().is_some() {
            return Err(format!(
                "Target directory must be empty before seeding a sample workspace: {}",
                target.display()
            ));
        }
    } else {
        fs::create_dir_all(target)
            .map_err(|error| format!("Failed to create workspace directory: {error}"))?;
    }

    copy_directory(&sample_workspace_root(), target)?;
    ensure_app_dirs(target)?;
    validate_workspace(target).map(|_| ())
}

pub fn load_manifest(root: &Path) -> Result<WorkspaceManifest, String> {
    let path = root.join("workspace.yml");
    read_yaml_file(&path)
}

pub fn load_profile(root: &Path) -> Result<Profile, String> {
    let path = root.join("profile/profile.yml");
    read_yaml_file(&path)
}

pub fn save_profile(root: &Path, profile: &Profile) -> Result<Profile, String> {
    validate_profile(profile)?;
    let path = root.join("profile/profile.yml");
    write_yaml_file(&path, profile)?;
    Ok(profile.clone())
}

pub fn load_blocks(root: &Path) -> Result<Vec<Block>, String> {
    let mut blocks = load_yaml_collection::<Block>(&root.join("blocks"))?;
    blocks.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(blocks)
}

pub fn create_block(root: &Path, block: &Block) -> Result<Block, String> {
    validate_block(block)?;
    let path = active_block_path(root, block);
    if path.exists() {
        return Err(format!("Block id already exists: {}", block.id));
    }
    write_yaml_file(&path, block)?;
    Ok(block.clone())
}

pub fn update_block(root: &Path, block: &Block) -> Result<Block, String> {
    validate_block(block)?;
    let path = locate_active_block(root, &block.id)?;
    write_yaml_file(&path, block)?;
    Ok(block.clone())
}

pub fn archive_block(root: &Path, block_id: &str) -> Result<(), String> {
    let resumes = load_resumes(root)?;
    let still_used = resumes
        .iter()
        .filter(|resume| resume.block_ids.iter().any(|id| id == block_id))
        .map(|resume| resume.id.clone())
        .collect::<Vec<String>>();

    if !still_used.is_empty() {
        return Err(format!(
            "Cannot archive block {block_id} while referenced by resumes: {}",
            still_used.join(", ")
        ));
    }

    let source = locate_active_block(root, block_id)?;
    let target = archived_block_path(root, block_id);
    move_to_archive(&source, &target)
}

pub fn load_resumes(root: &Path) -> Result<Vec<ResumeDefinition>, String> {
    let mut resumes = load_yaml_collection::<ResumeDefinition>(&root.join("resumes"))?;
    resumes.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(resumes)
}

pub fn create_resume(root: &Path, resume: &ResumeDefinition) -> Result<ResumeDefinition, String> {
    validate_resume(root, resume)?;
    let path = active_resume_path(root, resume);
    if path.exists() {
        return Err(format!("Resume id already exists: {}", resume.id));
    }
    write_yaml_file(&path, resume)?;
    Ok(resume.clone())
}

pub fn update_resume(root: &Path, resume: &ResumeDefinition) -> Result<ResumeDefinition, String> {
    validate_resume(root, resume)?;
    let path = locate_active_resume(root, &resume.id)?;
    write_yaml_file(&path, resume)?;
    Ok(resume.clone())
}

pub fn archive_resume(root: &Path, resume_id: &str) -> Result<(), String> {
    let source = locate_active_resume(root, resume_id)?;
    let target = archived_resume_path(root, resume_id);
    move_to_archive(&source, &target)
}

pub fn load_app_state(root: &Path) -> Result<AppWorkspaceState, String> {
    let path = app_state_path(root);
    if !path.exists() {
        return Ok(AppWorkspaceState::default());
    }
    read_yaml_file(&path)
}

pub fn save_app_state(
    root: &Path,
    app_state: &AppWorkspaceState,
) -> Result<AppWorkspaceState, String> {
    ensure_app_dirs(root)?;
    let path = app_state_path(root);
    write_yaml_file(&path, app_state)?;
    Ok(app_state.clone())
}

pub fn load_render_history(root: &Path) -> Result<Vec<RenderResult>, String> {
    let path = render_history_path(root);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut history: Vec<RenderResult> = read_yaml_file(&path)?;
    history.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(history)
}

pub fn append_render_history(root: &Path, result: &RenderResult) -> Result<(), String> {
    ensure_app_dirs(root)?;
    let mut history = load_render_history(root)?;
    history.push(result.clone());
    history.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    write_yaml_file(&render_history_path(root), &history)
}

pub fn summarize_workspace(root: &Path) -> Result<WorkspaceSummary, String> {
    let manifest = validate_workspace(root)?;
    let profile = load_profile(root)?;
    let blocks = load_blocks(root)?;
    let resumes = load_resumes(root)?;
    let render_history = load_render_history(root)?;

    let mut languages: Vec<String> = blocks.iter().map(|block| block.language.clone()).collect();
    languages.extend(resumes.iter().map(|resume| resume.language.clone()));
    languages.sort();
    languages.dedup();

    Ok(WorkspaceSummary {
        root_path: root.display().to_string(),
        workspace_name: manifest.workspace_name,
        profile_name: profile.name,
        available_languages: languages,
        block_count: blocks.len(),
        resume_count: resumes.len(),
        render_history_count: render_history.len(),
    })
}

pub fn load_workspace_snapshot(root: &Path) -> Result<WorkspaceSnapshot, String> {
    let summary = summarize_workspace(root)?;
    Ok(WorkspaceSnapshot {
        summary,
        manifest: load_manifest(root)?,
        profile: load_profile(root)?,
        blocks: load_blocks(root)?,
        resumes: load_resumes(root)?,
        render_history: load_render_history(root)?,
        app_state: load_app_state(root)?,
    })
}

#[cfg(test)]
fn make_default_manifest(workspace_name: &str) -> WorkspaceManifest {
    WorkspaceManifest {
        schema_version: WORKSPACE_SCHEMA_VERSION,
        workspace_id: format!("workspace-{}", unix_millis()),
        workspace_name: workspace_name.to_string(),
        default_template_id: "default".to_string(),
    }
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in WalkDir::new(source).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        let relative = path
            .strip_prefix(source)
            .map_err(|error| format!("Failed to calculate relative path: {error}"))?;
        let target = destination.join(relative);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|error| {
                format!("Failed to create directory {}: {error}", target.display())
            })?;
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("Failed to create directory {}: {error}", parent.display())
            })?;
        }

        fs::copy(path, &target).map_err(|error| {
            format!(
                "Failed to copy {} to {}: {error}",
                path.display(),
                target.display()
            )
        })?;
    }

    Ok(())
}

fn ensure_app_dirs(root: &Path) -> Result<(), String> {
    for path in [
        root.join(APP_DIR),
        root.join("blocks").join(ARCHIVED_DIR),
        root.join("resumes").join(ARCHIVED_DIR),
        root.join("renders"),
    ] {
        fs::create_dir_all(&path)
            .map_err(|error| format!("Failed to create directory {}: {error}", path.display()))?;
    }
    Ok(())
}

fn active_block_path(root: &Path, block: &Block) -> PathBuf {
    root.join("blocks")
        .join(section_dir_name(&block.section))
        .join(format!("{}.yml", block.id))
}

fn archived_block_path(root: &Path, block_id: &str) -> PathBuf {
    root.join("blocks")
        .join(ARCHIVED_DIR)
        .join(format!("{block_id}.yml"))
}

fn active_resume_path(root: &Path, resume: &ResumeDefinition) -> PathBuf {
    root.join("resumes").join(format!("{}.yml", resume.id))
}

fn archived_resume_path(root: &Path, resume_id: &str) -> PathBuf {
    root.join("resumes")
        .join(ARCHIVED_DIR)
        .join(format!("{resume_id}.yml"))
}

fn locate_active_block(root: &Path, block_id: &str) -> Result<PathBuf, String> {
    locate_yaml_entry(&root.join("blocks"), block_id)
}

fn locate_active_resume(root: &Path, resume_id: &str) -> Result<PathBuf, String> {
    locate_yaml_entry(&root.join("resumes"), resume_id)
}

fn locate_yaml_entry(root: &Path, entry_id: &str) -> Result<PathBuf, String> {
    for entry in WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path
            .components()
            .any(|component| component.as_os_str() == ARCHIVED_DIR)
        {
            continue;
        }
        if path.is_file() && path.file_stem().and_then(|stem| stem.to_str()) == Some(entry_id) {
            return Ok(path.to_path_buf());
        }
    }

    Err(format!("Unknown entity id: {entry_id}"))
}

fn move_to_archive(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create archive directory {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::rename(source, target).map_err(|error| {
        format!(
            "Failed to archive {} to {}: {error}",
            source.display(),
            target.display()
        )
    })
}

fn load_yaml_collection<T>(root: &Path) -> Result<Vec<T>, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path
            .components()
            .any(|component| component.as_os_str() == ARCHIVED_DIR)
        {
            continue;
        }
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
            continue;
        }
        entries.push(read_yaml_file(path)?);
    }
    Ok(entries)
}

fn read_yaml_file<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read YAML file {}: {error}", path.display()))?;
    serde_yaml::from_str(&raw)
        .map_err(|error| format!("Failed to parse YAML file {}: {error}", path.display()))
}

fn write_yaml_file<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: serde::Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create directory {}: {error}", parent.display()))?;
    }

    let body = serde_yaml::to_string(value)
        .map_err(|error| format!("Failed to serialize YAML for {}: {error}", path.display()))?;
    fs::write(path, body).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn validate_profile(profile: &Profile) -> Result<(), String> {
    if profile.name.trim().is_empty() {
        return Err("Profile name cannot be empty.".to_string());
    }
    if profile.email.trim().is_empty() {
        return Err("Profile email cannot be empty.".to_string());
    }
    Ok(())
}

fn validate_block(block: &Block) -> Result<(), String> {
    if block.id.trim().is_empty() {
        return Err("Block id cannot be empty.".to_string());
    }
    if block.block_type.trim().is_empty() {
        return Err("Block type cannot be empty.".to_string());
    }
    if block.language.trim().is_empty() {
        return Err("Block language cannot be empty.".to_string());
    }
    if block.section.trim().is_empty() {
        return Err("Block section cannot be empty.".to_string());
    }
    Ok(())
}

fn validate_resume(root: &Path, resume: &ResumeDefinition) -> Result<(), String> {
    if resume.id.trim().is_empty() {
        return Err("Resume id cannot be empty.".to_string());
    }
    if resume.title.trim().is_empty() {
        return Err("Resume title cannot be empty.".to_string());
    }
    if resume.language.trim().is_empty() {
        return Err("Resume language cannot be empty.".to_string());
    }

    let blocks = load_blocks(root)?;
    let block_ids = blocks
        .into_iter()
        .map(|block| block.id)
        .collect::<Vec<String>>();
    let missing = resume
        .block_ids
        .iter()
        .filter(|block_id| !block_ids.iter().any(|candidate| candidate == *block_id))
        .cloned()
        .collect::<Vec<String>>();

    if !missing.is_empty() {
        return Err(format!(
            "Resume {} references unknown block ids: {}",
            resume.id,
            missing.join(", ")
        ));
    }

    Ok(())
}

fn section_dir_name(section: &str) -> String {
    if section.trim().is_empty() {
        "misc".to_string()
    } else {
        section.trim().to_lowercase().replace(' ', "-")
    }
}

fn app_state_path(root: &Path) -> PathBuf {
    root.join(APP_DIR).join("state.yml")
}

fn render_history_path(root: &Path) -> PathBuf {
    root.join(APP_DIR).join("render-history.yml")
}

#[cfg(test)]
fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Roles, WORKSPACE_SCHEMA_VERSION};
    use tempfile::tempdir;

    #[test]
    fn validates_manifest_based_workspace() {
        let temp = tempdir().expect("tempdir should exist");
        let root = temp.path();

        write_yaml_file(
            &root.join("workspace.yml"),
            &WorkspaceManifest {
                schema_version: WORKSPACE_SCHEMA_VERSION,
                workspace_id: "workspace-test".to_string(),
                workspace_name: "Test Workspace".to_string(),
                default_template_id: "default".to_string(),
            },
        )
        .expect("manifest should be written");

        save_profile(
            root,
            &Profile {
                name: "Edu".to_string(),
                roles: Roles {
                    pt: "Dev".to_string(),
                    en: "Dev".to_string(),
                },
                email: "edu@example.com".to_string(),
                location: "Manaus".to_string(),
                linkedin: "linkedin.com/in/edu".to_string(),
                github: "github.com/edu".to_string(),
            },
        )
        .expect("profile should be saved");

        ensure_app_dirs(root).expect("app dirs should be created");

        let manifest = validate_workspace(root).expect("workspace should validate");
        assert_eq!(manifest.schema_version, WORKSPACE_SCHEMA_VERSION);
    }

    #[test]
    fn archives_block_when_not_referenced() {
        let temp = tempdir().expect("tempdir should exist");
        let root = temp.path();

        write_yaml_file(
            &root.join("workspace.yml"),
            &make_default_manifest("Archive Test"),
        )
        .expect("manifest should be written");
        save_profile(
            root,
            &Profile {
                name: "Edu".to_string(),
                roles: Roles {
                    pt: "Dev".to_string(),
                    en: "Dev".to_string(),
                },
                email: "edu@example.com".to_string(),
                location: "Manaus".to_string(),
                linkedin: "linkedin.com/in/edu".to_string(),
                github: "github.com/edu".to_string(),
            },
        )
        .expect("profile should be saved");
        ensure_app_dirs(root).expect("app dirs should be created");

        create_block(
            root,
            &Block {
                id: "summary-en".to_string(),
                block_type: "summary".to_string(),
                language: "en".to_string(),
                section: "summary".to_string(),
                title: None,
                subtitle: None,
                date_range: None,
                content: Some("Hello".to_string()),
                items: Vec::new(),
                label: None,
                value: None,
            },
        )
        .expect("block should be created");

        archive_block(root, "summary-en").expect("block should archive");
        assert!(load_blocks(root).expect("blocks should load").is_empty());
        assert!(archived_block_path(root, "summary-en").is_file());
    }

    #[test]
    fn blocks_archive_when_referenced_is_rejected() {
        let temp = tempdir().expect("tempdir should exist");
        let root = temp.path();

        write_yaml_file(
            &root.join("workspace.yml"),
            &make_default_manifest("Reference Test"),
        )
        .expect("manifest should be written");
        save_profile(
            root,
            &Profile {
                name: "Edu".to_string(),
                roles: Roles {
                    pt: "Dev".to_string(),
                    en: "Dev".to_string(),
                },
                email: "edu@example.com".to_string(),
                location: "Manaus".to_string(),
                linkedin: "linkedin.com/in/edu".to_string(),
                github: "github.com/edu".to_string(),
            },
        )
        .expect("profile should be saved");
        ensure_app_dirs(root).expect("app dirs should be created");

        create_block(
            root,
            &Block {
                id: "summary-en".to_string(),
                block_type: "summary".to_string(),
                language: "en".to_string(),
                section: "summary".to_string(),
                title: None,
                subtitle: None,
                date_range: None,
                content: Some("Hello".to_string()),
                items: Vec::new(),
                label: None,
                value: None,
            },
        )
        .expect("block should be created");

        create_resume(
            root,
            &ResumeDefinition {
                id: "resume-en".to_string(),
                title: "Resume".to_string(),
                language: "en".to_string(),
                role_key: "en".to_string(),
                block_ids: vec!["summary-en".to_string()],
            },
        )
        .expect("resume should be created");

        let error = archive_block(root, "summary-en").expect_err("archive should fail");
        assert!(error.contains("referenced by resumes"));
    }
}
