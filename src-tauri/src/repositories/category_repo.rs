use chrono::Utc;
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::domain::{
    errors::AppError,
    models::Category,
    validation::{normalize_category_name, validate_uuid},
};

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
        validate_uuid(id, "分类 ID")?;
        let row = sqlx::query_as::<_, CategoryRow>(
            "SELECT c.*, COUNT(p.id) AS prompt_count FROM categories c LEFT JOIN prompts p ON p.category_id = c.id WHERE c.id = ? GROUP BY c.id",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AppError::NotFound("分类"))?;
        Ok(row.into())
    }

    pub async fn rename(&self, id: &str, name: &str) -> Result<Category, AppError> {
        validate_uuid(id, "分类 ID")?;
        let name = normalize_category_name(name)?;
        let duplicate: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM categories WHERE name = ? COLLATE NOCASE AND id != ?",
        )
        .bind(&name)
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        if duplicate > 0 {
            return Err(AppError::CategoryExists);
        }
        let result = sqlx::query("UPDATE categories SET name = ?, updated_at = ? WHERE id = ?")
            .bind(&name)
            .bind(Utc::now().timestamp_millis())
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("分类"));
        }
        self.get(id).await
    }

    pub async fn delete_and_move(
        &self,
        id: &str,
        move_to_category_id: &str,
    ) -> Result<(), AppError> {
        validate_uuid(id, "分类 ID")?;
        validate_uuid(move_to_category_id, "目标分类 ID")?;
        if id == move_to_category_id {
            return Err(AppError::Conflict(
                "不能将提示词移动到待删除分类".to_string(),
            ));
        }
        let mut transaction = self.pool.begin().await?;
        let source_exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?)")
                .bind(id)
                .fetch_one(&mut *transaction)
                .await?;
        if !source_exists {
            return Err(AppError::NotFound("分类"));
        }
        let category_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&mut *transaction)
            .await?;
        if category_count <= 1 {
            return Err(AppError::Conflict("不能删除最后一个分类".to_string()));
        }
        let target_exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?)")
                .bind(move_to_category_id)
                .fetch_one(&mut *transaction)
                .await?;
        if !target_exists {
            return Err(AppError::CategoryNotFound);
        }
        sqlx::query("UPDATE prompts SET category_id = ? WHERE category_id = ?")
            .bind(move_to_category_id)
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(())
    }
}
