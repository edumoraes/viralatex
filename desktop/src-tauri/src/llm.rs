use crate::domain::{LlmTaskRequest, LlmTaskResult};

pub fn run_task(request: &LlmTaskRequest) -> LlmTaskResult {
    let trimmed = request.input_text.trim();
    let output_text = match request.task_type.as_str() {
        "rewrite_block" => {
            if trimmed.is_empty() {
                "No input text provided for rewrite_block.".to_string()
            } else {
                format!("Stub rewrite suggestion: {}", trimmed)
            }
        }
        "summarize_profile" => {
            if trimmed.is_empty() {
                "No profile context provided for summarize_profile.".to_string()
            } else {
                format!("Stub profile summary: {}", trimmed)
            }
        }
        "suggest_resume" => {
            if trimmed.is_empty() {
                "No targeting context provided for suggest_resume.".to_string()
            } else {
                format!("Stub resume suggestion based on: {}", trimmed)
            }
        }
        _ => format!(
            "Task {} is not connected to a real provider yet.",
            request.task_type
        ),
    };

    let warnings = vec!["Using local stub provider. No external LLM call was made.".to_string()];

    LlmTaskResult {
        task_type: request.task_type.clone(),
        status: "stubbed".to_string(),
        provider: "local-stub".to_string(),
        output_text,
        warnings,
    }
}
