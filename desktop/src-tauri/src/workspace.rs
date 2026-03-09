use crate::domain::{Block, Profile, ResumeDefinition, WorkspaceSummary};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const REQUIRED_DIRECTORIES: &[&str] = &["profile", "blocks", "resumes"];

pub fn sample_workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples/sample-workspace")
        .canonicalize()
        .expect("sample workspace should exist")
}

pub fn template_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates/default")
}

pub fn validate_workspace(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Err(format!("Workspace path does not exist: {}", root.display()));
    }

    for directory in REQUIRED_DIRECTORIES {
        let path = root.join(directory);
        if !path.is_dir() {
            return Err(format!("Missing workspace directory: {}", path.display()));
        }
    }

    let profile_path = root.join("profile/profile.yml");
    if !profile_path.is_file() {
        return Err(format!("Missing profile file: {}", profile_path.display()));
    }

    Ok(())
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

    copy_directory(&sample_workspace_root(), target)
}

pub fn load_profile(root: &Path) -> Result<Profile, String> {
    let path = root.join("profile/profile.yml");
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read profile file {}: {error}", path.display()))?;
    serde_yaml::from_str(&raw)
        .map_err(|error| format!("Failed to parse profile file {}: {error}", path.display()))
}

pub fn load_blocks(root: &Path) -> Result<Vec<Block>, String> {
    let mut blocks = Vec::new();
    let blocks_root = root.join("blocks");

    for entry in WalkDir::new(&blocks_root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
            continue;
        }

        let raw = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read block file {}: {error}", path.display()))?;
        let block: Block = serde_yaml::from_str(&raw)
            .map_err(|error| format!("Failed to parse block file {}: {error}", path.display()))?;
        blocks.push(block);
    }

    blocks.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(blocks)
}

pub fn load_resumes(root: &Path) -> Result<Vec<ResumeDefinition>, String> {
    let mut resumes = Vec::new();
    let resumes_root = root.join("resumes");

    for entry in WalkDir::new(&resumes_root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
            continue;
        }

        let raw = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read resume file {}: {error}", path.display()))?;
        let resume: ResumeDefinition = serde_yaml::from_str(&raw)
            .map_err(|error| format!("Failed to parse resume file {}: {error}", path.display()))?;
        resumes.push(resume);
    }

    resumes.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(resumes)
}

pub fn summarize_workspace(root: &Path) -> Result<WorkspaceSummary, String> {
    validate_workspace(root)?;

    let profile = load_profile(root)?;
    let blocks = load_blocks(root)?;
    let resumes = load_resumes(root)?;

    let mut languages: Vec<String> = blocks.iter().map(|block| block.language.clone()).collect();
    languages.sort();
    languages.dedup();

    Ok(WorkspaceSummary {
        root_path: root.display().to_string(),
        profile_name: profile.name,
        available_languages: languages,
        block_count: blocks.len(),
        resume_count: resumes.len(),
    })
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in WalkDir::new(source).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        let relative = path
            .strip_prefix(source)
            .map_err(|error| format!("Failed to calculate relative path: {error}"))?;
        let target = destination.join(relative);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("Failed to create directory {}: {error}", target.display()))?;
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create directory {}: {error}", parent.display()))?;
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
