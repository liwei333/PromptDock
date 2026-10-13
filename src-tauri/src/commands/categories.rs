use tauri::{AppHandle, Emitter, State};

use crate::{
    commands::{ChangeEvent, MutationResult},
    domain::{errors::ErrorPayload, models::Category},
    repositories::category_repo::CategoryRepository,
    state::AppState,
};

type CommandResult<T> = Result<T, ErrorPayload>;

fn repository(state: &AppState) -> CategoryRepository {
    CategoryRepository::new(state.database.pool().clone())
}

fn emit_change(app: &AppHandle, action: &'static str, id: Option<String>) {
    let _ = app.emit(
        "prompts-changed",
        ChangeEvent {
            entity: "category",
            action,
            id,
        },
    );
}

#[tauri::command]
pub async fn list_categories(state: State<'_, AppState>) -> CommandResult<Vec<Category>> {
    repository(&state).list().await.map_err(Into::into)
}

#[tauri::command]
pub async fn create_category(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> CommandResult<Category> {
    let category = repository(&state).create(&name).await?;
    emit_change(&app, "created", Some(category.id.clone()));
    Ok(category)
}

#[tauri::command]
pub async fn rename_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> CommandResult<Category> {
    let category = repository(&state).rename(&id, &name).await?;
    emit_change(&app, "renamed", Some(category.id.clone()));
    Ok(category)
}

#[tauri::command]
pub async fn delete_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    move_to_category_id: String,
) -> CommandResult<MutationResult> {
    repository(&state)
        .delete_and_move(&id, &move_to_category_id)
        .await?;
    emit_change(&app, "deleted", Some(id));
    Ok(MutationResult { deleted: true })
}
