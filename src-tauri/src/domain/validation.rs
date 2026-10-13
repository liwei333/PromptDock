use std::collections::HashSet;

use uuid::Uuid;

use super::{errors::AppError, models::PromptInput};

pub fn validate_uuid(value: &str, label: &str) -> Result<(), AppError> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| AppError::Validation(format!("{label}格式无效")))
}

pub fn normalize_prompt_input(mut input: PromptInput) -> Result<PromptInput, AppError> {
    input.title = input.title.trim().to_string();
    input.description = input.description.trim().to_string();
    if !(1..=80).contains(&input.title.chars().count()) {
        return Err(AppError::Validation(
            "提示词名称必须为 1–80 个字符".to_string(),
        ));
    }
    if input.body.trim().is_empty() || input.body.chars().count() > 100_000 {
        return Err(AppError::Validation(
            "提示词正文必须为 1–100000 个字符".to_string(),
        ));
    }
    if input.description.chars().count() > 160 {
        return Err(AppError::Validation("简短说明最多 160 个字符".to_string()));
    }
    validate_uuid(&input.category_id, "分类 ID")?;
    if input.tags.len() > 10 {
        return Err(AppError::Validation("标签最多 10 个".to_string()));
    }
    let mut seen = HashSet::new();
    let mut tags = Vec::new();
    for tag in input.tags {
        let tag = tag.trim().to_string();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > 30 {
            return Err(AppError::Validation("单个标签最多 30 个字符".to_string()));
        }
        if seen.insert(tag.clone()) {
            tags.push(tag);
        }
    }
    input.tags = tags;
    Ok(input)
}

pub fn normalize_category_name(name: &str) -> Result<String, AppError> {
    let name = name.trim().to_string();
    if !(1..=18).contains(&name.chars().count()) {
        return Err(AppError::Validation(
            "分类名称必须为 1–18 个字符".to_string(),
        ));
    }
    Ok(name)
}

pub fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}
