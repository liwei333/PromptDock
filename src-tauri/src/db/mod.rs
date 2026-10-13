use std::{path::Path, time::Duration};

use chrono::Utc;
use sqlx::{
    SqlitePool,
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use crate::domain::errors::AppError;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

const DEFAULT_CATEGORIES: [(&str, &str, &str, &str); 6] = [
    (
        "10000000-0000-4000-8000-000000000001",
        "技术研发",
        "code",
        "#5776CF",
    ),
    (
        "10000000-0000-4000-8000-000000000002",
        "投资研究",
        "chart",
        "#478CA2",
    ),
    (
        "10000000-0000-4000-8000-000000000003",
        "产品规划",
        "layers",
        "#9A70C0",
    ),
    (
        "10000000-0000-4000-8000-000000000004",
        "内容创作",
        "video",
        "#CF855B",
    ),
    (
        "10000000-0000-4000-8000-000000000005",
        "商业运营",
        "bag",
        "#B28C49",
    ),
    (
        "10000000-0000-4000-8000-000000000006",
        "通用效率",
        "sparkles",
        "#6687AE",
    ),
];

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn connect_path(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;

        MIGRATOR.run(&pool).await?;
        backfill_legacy_pin_order_once(&pool).await?;
        seed_default_categories(&pool).await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn close(self) {
        self.pool.close().await;
    }
}

async fn backfill_legacy_pin_order_once(pool: &SqlitePool) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    let completed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = 'sticky_legacy_backfill_v1')",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if !completed {
        let ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM prompts WHERE is_pinned = 1 ORDER BY copy_count DESC, updated_at DESC, id ASC LIMIT 5",
        )
        .fetch_all(&mut *transaction)
        .await?;
        for (index, id) in ids.iter().enumerate() {
            sqlx::query("UPDATE prompts SET pin_order = ? WHERE id = ?")
                .bind(index as i64 + 1)
                .bind(id)
                .execute(&mut *transaction)
                .await?;
        }
        sqlx::query(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('sticky_legacy_backfill_v1', 'true', ?)",
        )
        .bind(Utc::now().timestamp_millis())
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

async fn seed_default_categories(pool: &SqlitePool) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
        .fetch_one(&mut *transaction)
        .await?;
    if count == 0 {
        let now = Utc::now().timestamp_millis();
        for (sort_order, (id, name, icon, color)) in DEFAULT_CATEGORIES.iter().enumerate() {
            sqlx::query(
                "INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(id)
            .bind(name)
            .bind(icon)
            .bind(color)
            .bind(sort_order as i64)
            .bind(now)
            .bind(now)
            .execute(&mut *transaction)
            .await?;
        }
    }
    transaction.commit().await?;
    Ok(())
}
