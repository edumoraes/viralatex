use crate::domain::{Block, Profile, RenderResult, ResumeDefinition};
use crate::workspace;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::tempdir;

const MANAGED_TECTONIC_RELATIVE_PATH: &str = "binaries/tectonic";

pub fn render_resume(
    workspace_root: &Path,
    profile: &Profile,
    blocks: &[Block],
    resume: &ResumeDefinition,
    resource_dir: Option<&Path>,
) -> RenderResult {
    render_resume_with_resolver(workspace_root, profile, blocks, resume, || {
        resolve_tectonic_path(resource_dir)
    })
}

fn render_resume_with_resolver<F>(
    workspace_root: &Path,
    profile: &Profile,
    blocks: &[Block],
    resume: &ResumeDefinition,
    resolve_tectonic: F,
) -> RenderResult
where
    F: FnOnce() -> Result<PathBuf, String>,
{
    let job_id = format!("render-{}", unix_millis());
    let renders_root = workspace_root.join("renders");

    if let Err(error) = fs::create_dir_all(&renders_root) {
        return failed_result(
            job_id,
            resume.id.clone(),
            format!("Failed to create renders directory: {error}"),
        );
    }

    let tectonic_path = match resolve_tectonic() {
        Ok(path) => path,
        Err(error) => return failed_result(job_id, resume.id.clone(), error),
    };

    let temp_root = match tempdir() {
        Ok(directory) => directory,
        Err(error) => {
            return failed_result(
                job_id,
                resume.id.clone(),
                format!("Failed to create temporary render directory: {error}"),
            )
        }
    };

    let render_root = temp_root.path();

    if let Err(error) = materialize_template(render_root) {
        return failed_result(job_id, resume.id.clone(), error);
    }

    let selected_blocks: Vec<Block> = resume
        .block_ids
        .iter()
        .filter_map(|id| blocks.iter().find(|block| &block.id == id).cloned())
        .collect();

    if selected_blocks.len() != resume.block_ids.len() {
        return failed_result(
            job_id,
            resume.id.clone(),
            "Resume definition references missing block ids.".to_string(),
        );
    }

    if let Err(error) = write_profile_tex(render_root, profile, &resume.language, &resume.role_key)
    {
        return failed_result(job_id, resume.id.clone(), error);
    }

    if let Err(error) = write_section_files(render_root, &resume.language, &selected_blocks) {
        return failed_result(job_id, resume.id.clone(), error);
    }

    if let Err(error) = write_entrypoint(render_root, &resume.language) {
        return failed_result(job_id, resume.id.clone(), error);
    }

    let output_dir = renders_root.join(&resume.id);
    if let Err(error) = fs::create_dir_all(&output_dir) {
        return failed_result(
            job_id,
            resume.id.clone(),
            format!("Failed to create output directory: {error}"),
        );
    }

    let command = Command::new(tectonic_path)
        .current_dir(render_root)
        .arg("-Z")
        .arg(format!("search-path={}", render_root.display()))
        .arg("-o")
        .arg(output_dir.display().to_string())
        .arg("resume.tex")
        .output();

    let output = match command {
        Ok(output) => output,
        Err(error) => {
            return failed_result(
                job_id,
                resume.id.clone(),
                format!("Failed to execute tectonic: {error}"),
            )
        }
    };

    let log_path = output_dir.join("render.log");
    let log_body = format!(
        "stdout:\n{}\n\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    if let Err(error) = fs::write(&log_path, log_body) {
        return failed_result(
            job_id,
            resume.id.clone(),
            format!("Failed to write render log: {error}"),
        );
    }

    if !output.status.success() {
        return RenderResult {
            job_id,
            resume_id: resume.id.clone(),
            status: "failed".to_string(),
            output_path: None,
            log_path: Some(log_path.display().to_string()),
            error_message: Some("Tectonic failed to compile the generated resume.".to_string()),
            created_at: unix_timestamp_string(),
        };
    }

    let pdf_path = output_dir.join("resume.pdf");
    if !pdf_path.is_file() {
        return failed_result(
            job_id,
            resume.id.clone(),
            format!(
                "Tectonic finished without producing a PDF at {}",
                pdf_path.display()
            ),
        );
    }

    RenderResult {
        job_id,
        resume_id: resume.id.clone(),
        status: "completed".to_string(),
        output_path: Some(pdf_path.display().to_string()),
        log_path: Some(log_path.display().to_string()),
        error_message: None,
        created_at: unix_timestamp_string(),
    }
}

fn materialize_template(render_root: &Path) -> Result<(), String> {
    let template_root = workspace::template_root();
    let resume_class = template_root.join("resume.cls");
    let destination = render_root.join("resume.cls");
    fs::copy(&resume_class, &destination).map_err(|error| {
        format!(
            "Failed to copy template asset {} to {}: {error}",
            resume_class.display(),
            destination.display()
        )
    })?;
    Ok(())
}

fn write_profile_tex(
    render_root: &Path,
    profile: &Profile,
    language: &str,
    role_key: &str,
) -> Result<(), String> {
    let role = if language == "pt" || role_key == "pt" {
        &profile.roles.pt
    } else {
        &profile.roles.en
    };

    let profile_tex = format!(
        "\\newcommand{{\\ProfileName}}{{{}}}\n\
\\newcommand{{\\ProfileRolePT}}{{{}}}\n\
\\newcommand{{\\ProfileRoleEN}}{{{}}}\n\
\\newcommand{{\\ProfileEmail}}{{{}}}\n\
\\newcommand{{\\ProfilePhone}}{{}}\n\
\\newcommand{{\\ProfileLocation}}{{{}}}\n\
\\newcommand{{\\ProfileLinkedIn}}{{{}}}\n\
\\newcommand{{\\ProfileGitHub}}{{{}}}\n\
\\newcommand{{\\ProfileWebsite}}{{}}\n\
\n\
\\newcommand{{\\ProfileContacts}}{{\n\
  \\href{{mailto:{email}}}{{{email_display}}} \\,|\\,\n\
  {location_display} \\\\\n\
  \\href{{https://{linkedin}}}{{LinkedIn}} \\,|\\,\n\
  \\href{{https://{github}}}{{GitHub}}\n\
}}\n\
% Active role for this render: {active_role}\n",
        escape_tex(&profile.name),
        escape_tex(&profile.roles.pt),
        escape_tex(&profile.roles.en),
        escape_tex(&profile.email),
        escape_tex(&profile.location),
        escape_tex(&profile.linkedin),
        escape_tex(&profile.github),
        email = profile.email,
        email_display = escape_tex(&profile.email),
        location_display = escape_tex(&profile.location),
        linkedin = profile.linkedin,
        github = profile.github,
        active_role = escape_tex(role)
    );

    fs::write(render_root.join("profile.tex"), profile_tex)
        .map_err(|error| format!("Failed to write profile.tex: {error}"))
}

fn write_section_files(render_root: &Path, language: &str, blocks: &[Block]) -> Result<(), String> {
    let section_dir = render_root.join(language);
    fs::create_dir_all(&section_dir)
        .map_err(|error| format!("Failed to create language section directory: {error}"))?;

    fs::write(
        section_dir.join("summary_generated.tex"),
        render_summaries(blocks),
    )
    .map_err(|error| format!("Failed to write summary section: {error}"))?;
    fs::write(
        section_dir.join("experience_generated.tex"),
        render_experiences(blocks),
    )
    .map_err(|error| format!("Failed to write experience section: {error}"))?;
    fs::write(
        section_dir.join("projects_generated.tex"),
        render_projects(blocks),
    )
    .map_err(|error| format!("Failed to write projects section: {error}"))?;
    fs::write(
        section_dir.join("skills_generated.tex"),
        render_skills(blocks),
    )
    .map_err(|error| format!("Failed to write skills section: {error}"))?;
    fs::write(
        section_dir.join("education_generated.tex"),
        render_education(blocks),
    )
    .map_err(|error| format!("Failed to write education section: {error}"))?;

    Ok(())
}

fn write_entrypoint(render_root: &Path, language: &str) -> Result<(), String> {
    let headings = if language == "pt" {
        (
            "Resumo",
            "Experiência",
            "Projetos",
            "Competências",
            "Formação",
            "\\ProfileRolePT",
        )
    } else {
        (
            "Summary",
            "Experience",
            "Projects",
            "Skills",
            "Education",
            "\\ProfileRoleEN",
        )
    };

    let resume_tex = format!(
        "\\documentclass{{resume}}\n\
\n\
\\input{{profile.tex}}\n\
\n\
\\begin{{document}}\n\
\n\
\\makeprofile{{\\ProfileName}}{{{}}}{{\\ProfileContacts}}\n\
\n\
\\resumesection{{{}}}\n\
\\input{{{}/summary_generated.tex}}\n\
\n\
\\resumesection{{{}}}\n\
\\input{{{}/experience_generated.tex}}\n\
\n\
\\resumesection{{{}}}\n\
\\input{{{}/projects_generated.tex}}\n\
\n\
\\resumesection{{{}}}\n\
\\input{{{}/skills_generated.tex}}\n\
\n\
\\resumesection{{{}}}\n\
\\input{{{}/education_generated.tex}}\n\
\n\
\\end{{document}}\n",
        headings.5,
        headings.0,
        language,
        headings.1,
        language,
        headings.2,
        language,
        headings.3,
        language,
        headings.4,
        language
    );

    fs::write(render_root.join("resume.tex"), resume_tex)
        .map_err(|error| format!("Failed to write resume.tex: {error}"))
}

fn render_summaries(blocks: &[Block]) -> String {
    blocks
        .iter()
        .filter(|block| block.block_type == "summary")
        .map(|block| {
            format!(
                "\\summaryblock{{{}}}\n",
                escape_tex(block.content.as_deref().unwrap_or_default())
            )
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn render_experiences(blocks: &[Block]) -> String {
    join_entries(
        blocks
            .iter()
            .filter(|block| block.block_type == "experience")
            .map(|block| {
                let highlights = format!(
                    "\\begin{{highlights}}\n{}\n\\end{{highlights}}",
                    block
                        .items
                        .iter()
                        .map(|item| format!("  \\item {}", escape_tex(item)))
                        .collect::<Vec<String>>()
                        .join("\n")
                );
                format!(
                    "\\resumeentry{{{}}}{{{}}}{{{}}}{{\n{}\n}}",
                    escape_tex(block.title.as_deref().unwrap_or_default()),
                    escape_tex(block.date_range.as_deref().unwrap_or_default()),
                    escape_tex(block.subtitle.as_deref().unwrap_or_default()),
                    highlights
                )
            })
            .collect(),
    )
}

fn render_projects(blocks: &[Block]) -> String {
    join_entries(
        blocks
            .iter()
            .filter(|block| block.block_type == "project")
            .map(|block| {
                format!(
                    "\\projectentry{{{}}}{{{}}}{{{}}}",
                    escape_tex(block.title.as_deref().unwrap_or_default()),
                    escape_tex(block.date_range.as_deref().unwrap_or_default()),
                    escape_tex(block.content.as_deref().unwrap_or_default())
                )
            })
            .collect(),
    )
}

fn render_skills(blocks: &[Block]) -> String {
    blocks
        .iter()
        .filter(|block| block.block_type == "skill")
        .map(|block| {
            format!(
                "\\skillline{{{}}}{{{}}}",
                escape_tex(block.label.as_deref().unwrap_or_default()),
                escape_tex(block.value.as_deref().unwrap_or_default())
            )
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn render_education(blocks: &[Block]) -> String {
    join_entries(
        blocks
            .iter()
            .filter(|block| block.block_type == "education")
            .map(|block| {
                format!(
                    "\\educationentry{{{}}}{{{}}}{{{}}}{{{}}}",
                    escape_tex(block.title.as_deref().unwrap_or_default()),
                    escape_tex(block.date_range.as_deref().unwrap_or_default()),
                    escape_tex(block.label.as_deref().unwrap_or_default()),
                    escape_tex(block.subtitle.as_deref().unwrap_or_default())
                )
            })
            .collect(),
    )
}

fn join_entries(entries: Vec<String>) -> String {
    entries.join("\n\n\\spacer\n\n")
}

fn resolve_tectonic_path(resource_dir: Option<&Path>) -> Result<PathBuf, String> {
    let packaged_binary = resource_dir.map(|path| path.join(MANAGED_TECTONIC_RELATIVE_PATH));

    resolve_tectonic_path_from(
        std::env::var("TECTONIC_BIN").ok().map(PathBuf::from),
        managed_tectonic_path(),
        packaged_binary,
        || which::which("tectonic").map_err(|_| missing_tectonic_error_message()),
    )
}

fn resolve_tectonic_path_from<F>(
    env_override: Option<PathBuf>,
    managed_binary: PathBuf,
    packaged_binary: Option<PathBuf>,
    system_lookup: F,
) -> Result<PathBuf, String>
where
    F: FnOnce() -> Result<PathBuf, String>,
{
    if let Some(resolved) = env_override.filter(|path| path.is_file()) {
        return Ok(resolved);
    }

    if managed_binary.is_file() {
        return Ok(managed_binary);
    }

    if let Some(packaged_binary) = packaged_binary.filter(|path| path.is_file()) {
        return Ok(packaged_binary);
    }

    system_lookup().map_err(|_| missing_tectonic_error_message())
}

fn managed_tectonic_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(MANAGED_TECTONIC_RELATIVE_PATH)
}

fn missing_tectonic_error_message() -> String {
    "Tectonic executable not found. Run 'bin/setup-tectonic /path/to/tectonic' or set TECTONIC_BIN before rendering.".to_string()
}

fn failed_result(job_id: String, resume_id: String, error_message: String) -> RenderResult {
    RenderResult {
        job_id,
        resume_id,
        status: "failed".to_string(),
        output_path: None,
        log_path: None,
        error_message: Some(error_message),
        created_at: unix_timestamp_string(),
    }
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn unix_timestamp_string() -> String {
    unix_millis().to_string()
}

fn escape_tex(input: &str) -> String {
    let mut escaped = String::new();

    for character in input.chars() {
        match character {
            '\\' => escaped.push_str("\\textbackslash{}"),
            '&' => escaped.push_str("\\&"),
            '%' => escaped.push_str("\\%"),
            '$' => escaped.push_str("\\$"),
            '#' => escaped.push_str("\\#"),
            '_' => escaped.push_str("\\_"),
            '{' => escaped.push_str("\\{"),
            '}' => escaped.push_str("\\}"),
            '~' => escaped.push_str("\\textasciitilde{}"),
            '^' => escaped.push_str("\\textasciicircum{}"),
            _ => escaped.push(character),
        }
    }

    escaped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Profile, ResumeDefinition, Roles};
    use tempfile::tempdir;

    #[test]
    fn prefers_env_override_then_managed_then_packaged_then_system() {
        let root = tempdir().expect("tempdir should exist");
        let env_override = root.path().join("env-tectonic");
        let managed_binary = root.path().join("managed/tectonic");
        let packaged_binary = root.path().join("resources/binaries/tectonic");

        fs::create_dir_all(managed_binary.parent().expect("managed parent"))
            .expect("managed dir should be created");
        fs::create_dir_all(packaged_binary.parent().expect("packaged parent"))
            .expect("packaged dir should be created");
        fs::write(&managed_binary, "managed").expect("managed binary should exist");
        fs::write(&packaged_binary, "packaged").expect("packaged binary should exist");

        let from_managed = resolve_tectonic_path_from(
            Some(env_override.clone()),
            managed_binary.clone(),
            Some(packaged_binary.clone()),
            || Ok(root.path().join("system-tectonic")),
        )
        .expect("managed binary should resolve");
        assert_eq!(from_managed, managed_binary);

        fs::write(&env_override, "env").expect("env binary should exist");
        let from_env = resolve_tectonic_path_from(
            Some(env_override.clone()),
            managed_binary.clone(),
            Some(packaged_binary.clone()),
            || Ok(root.path().join("system-tectonic")),
        )
        .expect("env binary should resolve");
        assert_eq!(from_env, env_override);

        fs::remove_file(&env_override).expect("env binary should be removed");
        fs::remove_file(&managed_binary).expect("managed binary should be removed");
        let from_packaged = resolve_tectonic_path_from(
            Some(env_override),
            managed_binary,
            Some(packaged_binary.clone()),
            || Ok(root.path().join("system-tectonic")),
        )
        .expect("packaged binary should resolve");
        assert_eq!(from_packaged, packaged_binary);
    }

    #[test]
    fn reports_actionable_error_when_no_binary_is_available() {
        let root = tempdir().expect("tempdir should exist");
        let error = resolve_tectonic_path_from(
            None,
            root.path().join("managed/tectonic"),
            Some(root.path().join("resources/binaries/tectonic")),
            || Err("not found".to_string()),
        )
        .expect_err("missing binary should return an error");

        assert!(error.contains("bin/setup-tectonic"));
        assert!(error.contains("TECTONIC_BIN"));
    }

    #[test]
    fn render_resume_returns_failed_result_when_binary_resolution_fails() {
        let workspace_root = tempdir().expect("workspace tempdir should exist");
        fs::create_dir_all(workspace_root.path().join("renders"))
            .expect("renders dir should exist");

        let profile = Profile {
            name: "Edu".to_string(),
            roles: Roles {
                pt: "Dev".to_string(),
                en: "Dev".to_string(),
            },
            email: "edu@example.com".to_string(),
            location: "Manaus".to_string(),
            linkedin: "linkedin.com/in/edu".to_string(),
            github: "github.com/edu".to_string(),
        };
        let resume = ResumeDefinition {
            id: "base-en".to_string(),
            title: "Base".to_string(),
            language: "en".to_string(),
            role_key: "en".to_string(),
            block_ids: Vec::new(),
        };

        let result =
            render_resume_with_resolver(workspace_root.path(), &profile, &[], &resume, || {
                Err(missing_tectonic_error_message())
            });

        assert_eq!(result.status, "failed");
        assert!(result.output_path.is_none());
        assert_eq!(
            result.error_message.as_deref(),
            Some(missing_tectonic_error_message().as_str())
        );
    }
}
