use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::domain::{
    errors::AppError,
    models::PromptInput,
    validation::{normalize_category_name, normalize_prompt_input, validate_uuid},
};

pub const MAX_BACKUP_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_BACKUP_PROMPTS: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupCategory {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BackupPrompt {
    pub id: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub category_id: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub pin_order: Option<i64>,
    pub copy_count: i64,
    pub last_copied_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupDocument {
    pub app: String,
    pub version: u32,
    pub exported_at: String,
    pub categories: Vec<BackupCategory>,
    pub prompts: Vec<BackupPrompt>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    Merge,
    Replace,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewSummary {
    pub prompt_count: usize,
    pub category_count: usize,
    pub id_conflicts: i64,
    pub categories_added: usize,
    pub invalid_records: usize,
    pub source_version: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub duplicated: usize,
    pub categories_added: usize,
    pub safety_backup_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEnvelope {
    app: String,
    version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyBackup {
    app: String,
    version: u32,
    #[serde(default)]
    exported_at: Option<String>,
    categories: Vec<String>,
    prompts: Vec<LegacyPrompt>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPrompt {
    id: String,
    title: String,
    body: String,
    #[serde(default)]
    description: String,
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    pinned: bool,
    #[serde(default)]
    uses: i64,
    #[serde(default)]
    created_at: i64,
    #[serde(default)]
    updated_at: i64,
    #[serde(default)]
    last_used: Option<i64>,
}

#[derive(Debug, FromRow)]
struct ExportPromptRow {
    id: String,
    title: String,
    description: String,
    body: String,
    category_id: String,
    tags_json: String,
    is_favorite: bool,
    is_pinned: bool,
    pin_order: Option<i64>,
    copy_count: i64,
    last_copied_at: Option<i64>,
    created_at: i64,
    updated_at: i64,
}

pub fn parse_backup_bytes(bytes: &[u8]) -> Result<BackupDocument, AppError> {
    if bytes.len() > MAX_BACKUP_BYTES {
        return Err(AppError::Validation("备份文件不能超过 10 MiB".to_string()));
    }
    let envelope: BackupEnvelope = serde_json::from_slice(bytes)?;
    if envelope.app != "PromptDock" {
        return Err(AppError::Validation("不是 PromptDock 备份文件".to_string()));
    }
    let document = match envelope.version {
        2 => serde_json::from_slice(bytes)?,
        1 => convert_legacy(serde_json::from_slice(bytes)?)?,
        version => {
            return Err(AppError::Validation(format!("不支持的备份版本：{version}")));
        }
    };
    validate_document(document)
}

fn convert_legacy(legacy: LegacyBackup) -> Result<BackupDocument, AppError> {
    if legacy.app != "PromptDock" || legacy.version != 1 {
        return Err(AppError::Validation("旧版备份标识无效".to_string()));
    }
    let now = Utc::now().timestamp_millis();
    let mut categories = Vec::new();
    let mut category_ids = HashMap::new();
    for (index, name) in legacy.categories.iter().enumerate() {
        let name = normalize_category_name(name)?;
        let id = Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            format!("legacy-category:{name}").as_bytes(),
        )
        .to_string();
        category_ids.insert(name.to_lowercase(), id.clone());
        categories.push(BackupCategory {
            id,
            name,
            icon: "folder".to_string(),
            color: "#64748B".to_string(),
            sort_order: index as i64,
            created_at: now,
            updated_at: now,
        });
    }
    let mut next_pin = 1;
    let mut prompts = Vec::with_capacity(legacy.prompts.len());
    for prompt in legacy.prompts {
        let category_name = normalize_category_name(&prompt.category)?;
        let category_id = if let Some(id) = category_ids.get(&category_name.to_lowercase()) {
            id.clone()
        } else {
            let id = Uuid::new_v5(
                &Uuid::NAMESPACE_URL,
                format!("legacy-category:{category_name}").as_bytes(),
            )
            .to_string();
            category_ids.insert(category_name.to_lowercase(), id.clone());
            categories.push(BackupCategory {
                id: id.clone(),
                name: category_name,
                icon: "folder".to_string(),
                color: "#64748B".to_string(),
                sort_order: categories.len() as i64,
                created_at: now,
                updated_at: now,
            });
            id
        };
        let id = Uuid::parse_str(&prompt.id)
            .unwrap_or_else(|_| {
                Uuid::new_v5(
                    &Uuid::NAMESPACE_URL,
                    format!("legacy-prompt:{}", prompt.id).as_bytes(),
                )
            })
            .to_string();
        let pin_order = if prompt.pinned && next_pin <= 5 {
            let current = next_pin;
            next_pin += 1;
            Some(current)
        } else {
            None
        };
        prompts.push(BackupPrompt {
            id,
            title: prompt.title,
            description: prompt.description,
            body: prompt.body,
            category_id,
            tags: prompt.tags,
            is_favorite: prompt.favorite,
            is_pinned: prompt.pinned,
            pin_order,
            copy_count: prompt.uses.max(0),
            last_copied_at: prompt.last_used,
            created_at: if prompt.created_at > 0 {
                prompt.created_at
            } else {
                now
            },
            updated_at: if prompt.updated_at > 0 {
                prompt.updated_at
            } else {
                now
            },
        });
    }
    Ok(BackupDocument {
        app: legacy.app,
        version: legacy.version,
        exported_at: legacy
            .exported_at
            .unwrap_or_else(|| Utc::now().to_rfc3339()),
        categories,
        prompts,
    })
}

fn validate_document(mut document: BackupDocument) -> Result<BackupDocument, AppError> {
    if document.prompts.len() > MAX_BACKUP_PROMPTS {
        return Err(AppError::Validation(
            "备份最多包含 10000 条提示词".to_string(),
        ));
    }
    let mut category_ids = HashSet::new();
    let mut category_names = HashSet::new();
    for category in &mut document.categories {
        validate_uuid(&category.id, "分类 ID")?;
        category.name = normalize_category_name(&category.name)?;
        if !category_ids.insert(category.id.clone())
            || !category_names.insert(category.name.to_lowercase())
        {
            return Err(AppError::Conflict("备份中存在重复分类".to_string()));
        }
    }
    let mut prompt_ids = HashSet::new();
    let mut pin_orders = HashSet::new();
    for prompt in &mut document.prompts {
        validate_uuid(&prompt.id, "提示词 ID")?;
        if !prompt_ids.insert(prompt.id.clone()) {
            return Err(AppError::Conflict("备份中存在重复提示词 ID".to_string()));
        }
        if !category_ids.contains(&prompt.category_id) {
            return Err(AppError::CategoryNotFound);
        }
        let normalized = normalize_prompt_input(PromptInput {
            title: prompt.title.clone(),
            description: prompt.description.clone(),
            body: prompt.body.clone(),
            category_id: prompt.category_id.clone(),
            tags: prompt.tags.clone(),
            is_favorite: prompt.is_favorite,
            is_pinned: prompt.is_pinned,
        })?;
        prompt.title = normalized.title;
        prompt.description = normalized.description;
        prompt.tags = normalized.tags;
        prompt.copy_count = prompt.copy_count.max(0);
        if let Some(order) = prompt.pin_order {
            if !prompt.is_pinned || !(1..=5).contains(&order) || !pin_orders.insert(order) {
                return Err(AppError::Conflict("备份中的便签顺序无效".to_string()));
            }
        }
    }
    Ok(document)
}

pub async fn export_document(pool: &SqlitePool) -> Result<BackupDocument, AppError> {
    let categories = sqlx::query_as::<_, (String, String, String, String, i64, i64, i64)>(
        "SELECT id, name, icon, color, sort_order, created_at, updated_at FROM categories ORDER BY sort_order, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(
        |(id, name, icon, color, sort_order, created_at, updated_at)| BackupCategory {
            id,
            name,
            icon,
            color,
            sort_order,
            created_at,
            updated_at,
        },
    )
    .collect();
    let rows = sqlx::query_as::<_, ExportPromptRow>(
        "SELECT id, title, description, body, category_id, tags_json, is_favorite, is_pinned, pin_order, copy_count, last_copied_at, created_at, updated_at FROM prompts ORDER BY created_at, id",
    )
    .fetch_all(pool)
    .await?;
    let prompts = rows
        .into_iter()
        .map(|row| {
            Ok(BackupPrompt {
                id: row.id,
                title: row.title,
                description: row.description,
                body: row.body,
                category_id: row.category_id,
                tags: serde_json::from_str(&row.tags_json)?,
                is_favorite: row.is_favorite,
                is_pinned: row.is_pinned,
                pin_order: row.pin_order,
                copy_count: row.copy_count,
                last_copied_at: row.last_copied_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    Ok(BackupDocument {
        app: "PromptDock".to_string(),
        version: 2,
        exported_at: Utc::now().to_rfc3339(),
        categories,
        prompts,
    })
}

pub fn write_document_atomic(path: &Path, document: &BackupDocument) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("导出路径无效".to_string()))?;
    std::fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".promptdock-{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(document)?;
    std::fs::write(&temporary, bytes)?;
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

pub async fn preview_summary(
    pool: &SqlitePool,
    document: &BackupDocument,
) -> Result<ImportPreviewSummary, AppError> {
    let mut conflicts = 0;
    for prompt in &document.prompts {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM prompts WHERE id = ?)")
            .bind(&prompt.id)
            .fetch_one(pool)
            .await?;
        conflicts += i64::from(exists);
    }
    let existing_names: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT lower(name) FROM categories")
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect();
    Ok(ImportPreviewSummary {
        prompt_count: document.prompts.len(),
        category_count: document.categories.len(),
        id_conflicts: conflicts,
        categories_added: document
            .categories
            .iter()
            .filter(|category| !existing_names.contains(&category.name.to_lowercase()))
            .count(),
        invalid_records: 0,
        source_version: document.version,
    })
}

fn duplicate_title(title: &str) -> String {
    let suffix = "（导入副本）";
    let keep = 80usize.saturating_sub(suffix.chars().count());
    format!("{}{}", title.chars().take(keep).collect::<String>(), suffix)
}

async fn insert_categories(
    transaction: &mut Transaction<'_, Sqlite>,
    document: &BackupDocument,
    replace: bool,
) -> Result<(HashMap<String, String>, usize), AppError> {
    let mut mapping = HashMap::new();
    let mut added = 0;
    for category in &document.categories {
        if !replace {
            if let Some(existing_id) = sqlx::query_scalar::<_, String>(
                "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
            )
            .bind(&category.name)
            .fetch_optional(&mut **transaction)
            .await?
            {
                mapping.insert(category.id.clone(), existing_id);
                continue;
            }
        }
        let id_in_use: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?)")
                .bind(&category.id)
                .fetch_one(&mut **transaction)
                .await?;
        let id = if id_in_use {
            Uuid::new_v4().to_string()
        } else {
            category.id.clone()
        };
        sqlx::query("INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(&category.name)
            .bind(&category.icon)
            .bind(&category.color)
            .bind(category.sort_order)
            .bind(category.created_at)
            .bind(category.updated_at)
            .execute(&mut **transaction)
            .await?;
        mapping.insert(category.id.clone(), id);
        added += 1;
    }
    Ok((mapping, added))
}

pub async fn commit_import(
    pool: &SqlitePool,
    document: &BackupDocument,
    mode: ImportMode,
) -> Result<ImportResult, AppError> {
    let replace = matches!(mode, ImportMode::Replace);
    let mut transaction = pool.begin().await?;
    if replace {
        sqlx::query("DELETE FROM prompts")
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM categories")
            .execute(&mut *transaction)
            .await?;
    }
    let (category_mapping, categories_added) =
        insert_categories(&mut transaction, document, replace).await?;
    let mut occupied_orders: HashSet<i64> =
        sqlx::query_scalar("SELECT pin_order FROM prompts WHERE pin_order BETWEEN 1 AND 5")
            .fetch_all(&mut *transaction)
            .await?
            .into_iter()
            .collect();
    let mut imported = 0;
    let mut skipped = 0;
    let mut duplicated = 0;
    for prompt in &document.prompts {
        let category_id = category_mapping
            .get(&prompt.category_id)
            .ok_or(AppError::CategoryNotFound)?;
        let existing: Option<(String, String, String, String, bool, bool, i64)> = sqlx::query_as(
            "SELECT title, description, body, tags_json, is_favorite, is_pinned, copy_count FROM prompts WHERE id = ?",
        )
        .bind(&prompt.id)
        .fetch_optional(&mut *transaction)
        .await?;
        let tags_json = serde_json::to_string(&prompt.tags)?;
        let mut id = prompt.id.clone();
        let mut title = prompt.title.clone();
        if let Some((
            old_title,
            old_description,
            old_body,
            old_tags,
            old_favorite,
            old_pinned,
            old_count,
        )) = existing
        {
            if old_title == prompt.title
                && old_description == prompt.description
                && old_body == prompt.body
                && old_tags == tags_json
                && old_favorite == prompt.is_favorite
                && old_pinned == prompt.is_pinned
                && old_count == prompt.copy_count
            {
                skipped += 1;
                continue;
            }
            id = Uuid::new_v4().to_string();
            title = duplicate_title(&title);
            duplicated += 1;
        }
        let pin_order = if prompt.is_pinned {
            let preferred = prompt
                .pin_order
                .filter(|order| !occupied_orders.contains(order));
            let available =
                preferred.or_else(|| (1..=5).find(|order| !occupied_orders.contains(order)));
            if let Some(order) = available {
                occupied_orders.insert(order);
            }
            available
        } else {
            None
        };
        sqlx::query("INSERT INTO prompts (id, title, description, body, category_id, tags_json, is_favorite, is_pinned, pin_order, copy_count, last_copied_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(id)
            .bind(title)
            .bind(&prompt.description)
            .bind(&prompt.body)
            .bind(category_id)
            .bind(tags_json)
            .bind(prompt.is_favorite)
            .bind(prompt.is_pinned)
            .bind(pin_order)
            .bind(prompt.copy_count)
            .bind(prompt.last_copied_at)
            .bind(prompt.created_at)
            .bind(prompt.updated_at)
            .execute(&mut *transaction)
            .await?;
        imported += 1;
    }
    transaction.commit().await?;
    Ok(ImportResult {
        imported,
        skipped,
        duplicated,
        categories_added,
        safety_backup_path: None,
    })
}

pub async fn commit_replace_with_safety_backup(
    pool: &SqlitePool,
    document: &BackupDocument,
    safety_backup_path: &Path,
) -> Result<ImportResult, AppError> {
    let current = export_document(pool).await?;
    write_document_atomic(safety_backup_path, &current)?;
    let mut result = commit_import(pool, document, ImportMode::Replace).await?;
    result.safety_backup_path = Some(safety_backup_path.to_string_lossy().into_owned());
    Ok(result)
}
