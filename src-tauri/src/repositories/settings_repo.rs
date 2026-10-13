use chrono::Utc;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::domain::errors::AppError;

#[derive(Clone)]
pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, key: &str) -> Result<Option<Value>, AppError> {
        let value: Option<String> =
            sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key = ?")
                .bind(key)
                .fetch_optional(&self.pool)
                .await?;
        value
            .map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }

    pub async fn set(&self, key: &str, value: &Value) -> Result<(), AppError> {
        let encoded = serde_json::to_string(value)?;
        sqlx::query(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        )
        .bind(key)
        .bind(encoded)
        .bind(Utc::now().timestamp_millis())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
