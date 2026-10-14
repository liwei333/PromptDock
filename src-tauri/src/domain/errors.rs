use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库操作失败")]
    Database(#[from] sqlx::Error),
    #[error("数据库迁移失败")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("无法访问应用数据目录")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
    #[error("未找到指定的{0}")]
    NotFound(&'static str),
    #[error("所选分类不存在")]
    CategoryNotFound,
    #[error("分类名称已经存在")]
    CategoryExists,
    #[error("便签已满，请先移除一条")]
    PinLimitReached,
    #[error("{0}")]
    Conflict(String),
    #[error("数据格式无效")]
    Serialization(#[from] serde_json::Error),
    #[error("原生功能不可用：{0}")]
    Native(String),
    #[error("{original}；回滚失败：{rollback}")]
    WindowTransition {
        original: Box<AppError>,
        rollback: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for ErrorPayload {
    fn from(error: AppError) -> Self {
        let code = error.code();
        Self {
            code,
            message: error.to_string(),
        }
    }
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "DATABASE_ERROR",
            Self::Migration(_) => "MIGRATION_ERROR",
            Self::Io(_) => "IO_ERROR",
            Self::Validation(_) => "VALIDATION_ERROR",
            Self::NotFound(_) => "NOT_FOUND",
            Self::CategoryNotFound => "CATEGORY_NOT_FOUND",
            Self::CategoryExists => "CATEGORY_EXISTS",
            Self::PinLimitReached => "PIN_LIMIT_REACHED",
            Self::Conflict(_) => "CONFLICT",
            Self::Serialization(_) => "SERIALIZATION_ERROR",
            Self::Native(_) => "NATIVE_ERROR",
            Self::WindowTransition { original, .. } => original.code(),
        }
    }
}
