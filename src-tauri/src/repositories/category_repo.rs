use chrono::Utc;
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::domain::{errors::AppError, models::Category, validation::normalize_category_name};

#[derive(Clone)]
pub struct CategoryRepository {
    pool: SqlitePool,
}

#[derive(Debug, FromRow)]
struct CategoryRow {
    id: String,
    name: String,
    icon: String,
    color: String,
    sort_order: i64,
    created_at: i64,
    updated_at: i64,
    prompt_count: i64,
}

impl From<CategoryRow> for Category {
    fn from(row: CategoryRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            icon: row.icon,
            color: row.color,
            sort_order: row.sort_order,
            created_at: row.created_at,
            updated_at: row.updated_at,
            prompt_count: row.prompt_count,
        }
    }
}

impl CategoryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Category>, AppError> {
        let rows = sqlx::query_as::<_, CategoryRow>(
            "SELECT c.*, COUNT(p.id) AS prompt_count FROM categories c LEFT JOIN prompts p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create(&self, name: &str) -> Result<Category, AppError> {
        let name = normalize_category_name(name)?;
        let existing: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE name = ? COLLATE NOCASE")
                .bind(&name)
                .fetch_one(&self.pool)
                .await?;
        if existing > 0 {
            return Err(AppError::CategoryExists);
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        let sort_order: i64 =
            sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories")
                .fetch_one(&self.pool)
                .await?;
        sqlx::query(
            "INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, 'folder', '#64748B', ?, ?, ?)",
        )
        .bind(&id)
        .bind(&name)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.get(&id).await
    }

    pub async fn get(&self, id: &str) -> Result<Category, AppError> {
        let row = sqlx::query_as::<_, CategoryRow>(
            "SELECT c.*, COUNT(p.id) AS prompt_count FROM categories c LEFT JOIN prompts p ON p.category_id = c.id WHERE c.id = ? GROUP BY c.id",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AppError::NotFound("分类"))?;
        Ok(row.into())
    }
}
