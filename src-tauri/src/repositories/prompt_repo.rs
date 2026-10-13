use std::collections::HashSet;

use chrono::Utc;
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::domain::{
    errors::AppError,
    models::{
        CopyStats, DashboardStats, Prompt, PromptInput, PromptPage, PromptQuery, PromptSort,
        PromptTab, PromptView,
    },
    validation::{escape_like, normalize_prompt_input, validate_uuid},
};

#[derive(Clone)]
pub struct PromptRepository {
    pool: SqlitePool,
}

#[derive(Debug, FromRow)]
struct PromptRow {
    id: String,
    title: String,
    description: String,
    body: String,
    category_id: String,
    category_name: String,
    tags_json: String,
    is_favorite: bool,
    is_pinned: bool,
    pin_order: Option<i64>,
    copy_count: i64,
    last_copied_at: Option<i64>,
    created_at: i64,
    updated_at: i64,
}

impl TryFrom<PromptRow> for Prompt {
    type Error = AppError;

    fn try_from(row: PromptRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            title: row.title,
            description: row.description,
            body: row.body,
            category_id: row.category_id,
            category_name: row.category_name,
            tags: serde_json::from_str(&row.tags_json)?,
            is_favorite: row.is_favorite,
            is_pinned: row.is_pinned,
            pin_order: row.pin_order,
            copy_count: row.copy_count,
            last_copied_at: row.last_copied_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

impl PromptRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: PromptInput) -> Result<Prompt, AppError> {
        let input = normalize_prompt_input(input)?;
        let mut transaction = self.pool.begin().await?;
        ensure_category(&mut transaction, &input.category_id).await?;
        let pin_order = if input.is_pinned {
            Some(next_pin_order(&mut transaction).await?)
        } else {
            None
        };
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        sqlx::query(
            "INSERT INTO prompts (id, title, description, body, category_id, tags_json, is_favorite, is_pinned, pin_order, copy_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(&input.title)
        .bind(&input.description)
        .bind(&input.body)
        .bind(&input.category_id)
        .bind(serde_json::to_string(&input.tags)?)
        .bind(input.is_favorite)
        .bind(input.is_pinned)
        .bind(pin_order)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        self.get(&id).await
    }

    pub async fn get(&self, id: &str) -> Result<Prompt, AppError> {
        validate_uuid(id, "提示词 ID")?;
        let row = sqlx::query_as::<_, PromptRow>(&prompt_select("WHERE p.id = ?"))
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(AppError::NotFound("提示词"))?;
        row.try_into()
    }

    pub async fn update(&self, id: &str, input: PromptInput) -> Result<Prompt, AppError> {
        validate_uuid(id, "提示词 ID")?;
        let input = normalize_prompt_input(input)?;
        let mut transaction = self.pool.begin().await?;
        ensure_category(&mut transaction, &input.category_id).await?;
        let existing: Option<(bool, Option<i64>)> =
            sqlx::query_as("SELECT is_pinned, pin_order FROM prompts WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await?;
        let (was_pinned, old_pin_order) = existing.ok_or(AppError::NotFound("提示词"))?;
        let pin_order = match (was_pinned, input.is_pinned) {
            (true, true) => old_pin_order.or(Some(next_pin_order(&mut transaction).await?)),
            (false, true) => Some(next_pin_order(&mut transaction).await?),
            (_, false) => None,
        };
        sqlx::query(
            "UPDATE prompts SET title = ?, description = ?, body = ?, category_id = ?, tags_json = ?, is_favorite = ?, is_pinned = ?, pin_order = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&input.title)
        .bind(&input.description)
        .bind(&input.body)
        .bind(&input.category_id)
        .bind(serde_json::to_string(&input.tags)?)
        .bind(input.is_favorite)
        .bind(input.is_pinned)
        .bind(pin_order)
        .bind(Utc::now().timestamp_millis())
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        if was_pinned && !input.is_pinned {
            compact_pin_orders(&mut transaction).await?;
        }
        transaction.commit().await?;
        self.get(id).await
    }

    pub async fn delete(&self, id: &str) -> Result<(), AppError> {
        validate_uuid(id, "提示词 ID")?;
        let mut transaction = self.pool.begin().await?;
        let pin_order: Option<Option<i64>> =
            sqlx::query_scalar("SELECT pin_order FROM prompts WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await?;
        let pin_order = pin_order.ok_or(AppError::NotFound("提示词"))?;
        sqlx::query("DELETE FROM prompts WHERE id = ?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        if pin_order.is_some() {
            compact_pin_orders(&mut transaction).await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn set_favorite(&self, id: &str, value: bool) -> Result<Prompt, AppError> {
        validate_uuid(id, "提示词 ID")?;
        let result = sqlx::query("UPDATE prompts SET is_favorite = ?, updated_at = ? WHERE id = ?")
            .bind(value)
            .bind(Utc::now().timestamp_millis())
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("提示词"));
        }
        self.get(id).await
    }

    pub async fn set_pinned(&self, id: &str, value: bool) -> Result<Prompt, AppError> {
        validate_uuid(id, "提示词 ID")?;
        let mut transaction = self.pool.begin().await?;
        let current: Option<(bool, Option<i64>)> =
            sqlx::query_as("SELECT is_pinned, pin_order FROM prompts WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await?;
        let (is_pinned, _pin_order) = current.ok_or(AppError::NotFound("提示词"))?;
        if is_pinned != value {
            if value {
                let order = next_pin_order(&mut transaction).await?;
                sqlx::query(
                    "UPDATE prompts SET is_pinned = 1, pin_order = ?, updated_at = ? WHERE id = ?",
                )
                .bind(order)
                .bind(Utc::now().timestamp_millis())
                .bind(id)
                .execute(&mut *transaction)
                .await?;
            } else {
                sqlx::query(
                    "UPDATE prompts SET is_pinned = 0, pin_order = NULL, updated_at = ? WHERE id = ?",
                )
                .bind(Utc::now().timestamp_millis())
                .bind(id)
                .execute(&mut *transaction)
                .await?;
                compact_pin_orders(&mut transaction).await?;
            }
        }
        transaction.commit().await?;
        self.get(id).await
    }

    pub async fn list_sticky(&self) -> Result<Vec<Prompt>, AppError> {
        let rows = sqlx::query_as::<_, PromptRow>(&prompt_select(
            "WHERE p.is_pinned = 1 AND p.pin_order BETWEEN 1 AND 5 ORDER BY p.pin_order ASC",
        ))
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn reorder_sticky(&self, ordered_ids: &[String]) -> Result<Vec<Prompt>, AppError> {
        if ordered_ids.len() > 5
            || ordered_ids.iter().collect::<HashSet<_>>().len() != ordered_ids.len()
        {
            return Err(AppError::Conflict("置顶顺序包含重复或过多条目".to_string()));
        }
        for id in ordered_ids {
            validate_uuid(id, "提示词 ID")?;
        }
        let mut transaction = self.pool.begin().await?;
        let current_ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM prompts WHERE is_pinned = 1 AND pin_order BETWEEN 1 AND 5 ORDER BY pin_order ASC",
        )
        .fetch_all(&mut *transaction)
        .await?;
        if current_ids.iter().cloned().collect::<HashSet<_>>()
            != ordered_ids.iter().cloned().collect::<HashSet<_>>()
        {
            return Err(AppError::Conflict(
                "置顶顺序必须包含当前全部便签条目".to_string(),
            ));
        }
        sqlx::query("UPDATE prompts SET pin_order = NULL WHERE pin_order IS NOT NULL")
            .execute(&mut *transaction)
            .await?;
        for (index, id) in ordered_ids.iter().enumerate() {
            sqlx::query("UPDATE prompts SET pin_order = ? WHERE id = ?")
                .bind(index as i64 + 1)
                .bind(id)
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        self.list_sticky().await
    }

    pub async fn record_successful_copy(&self, id: &str) -> Result<CopyStats, AppError> {
        validate_uuid(id, "提示词 ID")?;
        let now = Utc::now().timestamp_millis();
        let result = sqlx::query(
            "UPDATE prompts SET copy_count = copy_count + 1, last_copied_at = ? WHERE id = ?",
        )
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("提示词"));
        }
        let copy_count: i64 = sqlx::query_scalar("SELECT copy_count FROM prompts WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        Ok(CopyStats {
            copy_count,
            last_copied_at: now,
        })
    }

    pub async fn list(&self, mut query: PromptQuery) -> Result<PromptPage, AppError> {
        query.limit = query.limit.clamp(1, 200);
        query.offset = query.offset.max(0);
        let mut count_builder = filtered_query("SELECT COUNT(*)", &query);
        let total: i64 = count_builder
            .build_query_scalar()
            .fetch_one(&self.pool)
            .await?;

        let mut item_builder = filtered_query("SELECT p.*, c.name AS category_name", &query);
        item_builder.push(match (query.view, query.sort) {
            (PromptView::Recent, _) => " ORDER BY p.last_copied_at DESC, p.updated_at DESC",
            (_, PromptSort::Popular) => " ORDER BY p.copy_count DESC, p.updated_at DESC",
            (_, PromptSort::Name) => " ORDER BY p.title COLLATE NOCASE ASC, p.updated_at DESC",
            _ => " ORDER BY p.updated_at DESC, p.id ASC",
        });
        item_builder
            .push(" LIMIT ")
            .push_bind(query.limit)
            .push(" OFFSET ")
            .push_bind(query.offset);
        let rows = item_builder
            .build_query_as::<PromptRow>()
            .fetch_all(&self.pool)
            .await?;
        Ok(PromptPage {
            items: rows
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            total,
        })
    }

    pub async fn dashboard_stats(&self) -> Result<DashboardStats, AppError> {
        let (total, recent, favorites, pinned, templates): (i64, i64, i64, i64, i64) =
            sqlx::query_as(
                "SELECT COUNT(*), COALESCE(SUM(CASE WHEN last_copied_at IS NOT NULL THEN 1 ELSE 0 END), 0), COALESCE(SUM(is_favorite), 0), COALESCE(SUM(CASE WHEN pin_order IS NOT NULL THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN body LIKE '%{{%}}%' THEN 1 ELSE 0 END), 0) FROM prompts",
            )
            .fetch_one(&self.pool)
            .await?;
        Ok(DashboardStats {
            total,
            recent,
            favorites,
            pinned,
            templates,
        })
    }
}

fn prompt_select(suffix: &str) -> String {
    format!(
        "SELECT p.*, c.name AS category_name FROM prompts p JOIN categories c ON c.id = p.category_id {suffix}"
    )
}

fn filtered_query(select: &'static str, query: &PromptQuery) -> QueryBuilder<'static, Sqlite> {
    let mut builder = QueryBuilder::new(select);
    builder.push(" FROM prompts p JOIN categories c ON c.id = p.category_id WHERE 1 = 1");
    if let Some(search) = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let pattern = format!("%{}%", escape_like(search));
        builder
            .push(" AND (p.title LIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '\\' OR p.description LIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '\\' OR p.body LIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '\\' OR p.tags_json LIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '\\' OR c.name LIKE ")
            .push_bind(pattern)
            .push(" ESCAPE '\\')");
    }
    match query.view {
        PromptView::All => {}
        PromptView::Recent => {
            builder.push(" AND p.last_copied_at IS NOT NULL");
        }
        PromptView::Favorite => {
            builder.push(" AND p.is_favorite = 1");
        }
        PromptView::Pinned => {
            builder.push(" AND p.is_pinned = 1");
        }
    };
    match query.tab {
        PromptTab::All => {}
        PromptTab::Favorite => {
            builder.push(" AND p.is_favorite = 1");
        }
        PromptTab::Template => {
            builder.push(" AND p.body LIKE '%{{%}}%'");
        }
    };
    if let Some(category_id) = &query.category_id {
        builder
            .push(" AND p.category_id = ")
            .push_bind(category_id.clone());
    }
    builder
}

async fn ensure_category(
    transaction: &mut Transaction<'_, Sqlite>,
    category_id: &str,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?)")
        .bind(category_id)
        .fetch_one(&mut **transaction)
        .await?;
    if !exists {
        return Err(AppError::CategoryNotFound);
    }
    Ok(())
}

async fn next_pin_order(transaction: &mut Transaction<'_, Sqlite>) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM prompts WHERE is_pinned = 1 AND pin_order BETWEEN 1 AND 5",
    )
    .fetch_one(&mut **transaction)
    .await?;
    if count >= 5 {
        return Err(AppError::PinLimitReached);
    }
    let next: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(pin_order), 0) + 1 FROM prompts WHERE pin_order IS NOT NULL",
    )
    .fetch_one(&mut **transaction)
    .await?;
    Ok(next)
}

async fn compact_pin_orders(transaction: &mut Transaction<'_, Sqlite>) -> Result<(), AppError> {
    let ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM prompts WHERE is_pinned = 1 AND pin_order IS NOT NULL ORDER BY pin_order ASC",
    )
    .fetch_all(&mut **transaction)
    .await?;
    sqlx::query("UPDATE prompts SET pin_order = NULL WHERE pin_order IS NOT NULL")
        .execute(&mut **transaction)
        .await?;
    for (index, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE prompts SET pin_order = ? WHERE id = ?")
            .bind(index as i64 + 1)
            .bind(id)
            .execute(&mut **transaction)
            .await?;
    }
    Ok(())
}
