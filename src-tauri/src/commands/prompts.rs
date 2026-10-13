use tauri::{AppHandle, Emitter, State};

use crate::{
    commands::{ChangeEvent, MutationResult},
    domain::{
        errors::ErrorPayload,
        models::{CopyStats, DashboardStats, Prompt, PromptInput, PromptPage, PromptQuery},
    },
    repositories::prompt_repo::PromptRepository,
    state::AppState,
};

type CommandResult<T> = Result<T, ErrorPayload>;

fn repository(state: &AppState) -> PromptRepository {
    PromptRepository::new(state.database.pool().clone())
}

fn emit_change(app: &AppHandle, action: &'static str, id: Option<String>) {
    let _ = app.emit(
        "prompts-changed",
        ChangeEvent {
            entity: "prompt",
            action,
            id,
        },
    );
}

#[tauri::command]
pub async fn list_prompts(
    state: State<'_, AppState>,
    query: PromptQuery,
) -> CommandResult<PromptPage> {
    repository(&state).list(query).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_prompt(state: State<'_, AppState>, id: String) -> CommandResult<Prompt> {
    repository(&state).get(&id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn create_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    input: PromptInput,
) -> CommandResult<Prompt> {
    let prompt = repository(&state).create(input).await?;
    emit_change(&app, "created", Some(prompt.id.clone()));
    Ok(prompt)
}

#[tauri::command]
pub async fn update_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: PromptInput,
) -> CommandResult<Prompt> {
    let prompt = repository(&state).update(&id, input).await?;
    emit_change(&app, "updated", Some(prompt.id.clone()));
    Ok(prompt)
}

#[tauri::command]
pub async fn delete_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<MutationResult> {
    repository(&state).delete(&id).await?;
    emit_change(&app, "deleted", Some(id));
    Ok(MutationResult { deleted: true })
}

#[tauri::command]
pub async fn set_favorite(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    value: bool,
) -> CommandResult<Prompt> {
    let prompt = repository(&state).set_favorite(&id, value).await?;
    emit_change(&app, "favorite", Some(prompt.id.clone()));
    Ok(prompt)
}

#[tauri::command]
pub async fn set_pinned(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    value: bool,
) -> CommandResult<Prompt> {
    let prompt = repository(&state).set_pinned(&id, value).await?;
    emit_change(&app, "pinned", Some(prompt.id.clone()));
    Ok(prompt)
}

#[tauri::command]
pub async fn record_successful_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<CopyStats> {
    let stats = repository(&state).record_successful_copy(&id).await?;
    emit_change(&app, "copied", Some(id));
    Ok(stats)
}

#[tauri::command]
pub async fn list_sticky_prompts(state: State<'_, AppState>) -> CommandResult<Vec<Prompt>> {
    repository(&state).list_sticky().await.map_err(Into::into)
}

#[tauri::command]
pub async fn reorder_sticky_prompts(
    app: AppHandle,
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> CommandResult<Vec<Prompt>> {
    let prompts = repository(&state).reorder_sticky(&ordered_ids).await?;
    emit_change(&app, "reordered", None);
    Ok(prompts)
}

#[tauri::command]
pub async fn get_dashboard_stats(state: State<'_, AppState>) -> CommandResult<DashboardStats> {
    repository(&state)
        .dashboard_stats()
        .await
        .map_err(Into::into)
}
