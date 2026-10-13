use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tempfile::tempdir;
use uuid::Uuid;

use crate::db::Database;
use crate::{
    domain::models::{PromptInput, PromptQuery, PromptSort, PromptView},
    repositories::{
        category_repo::CategoryRepository, prompt_repo::PromptRepository,
        settings_repo::SettingsRepository,
    },
};

const GENERAL_CATEGORY_ID: &str = "10000000-0000-4000-8000-000000000006";

fn prompt_input(title: &str, body: &str) -> PromptInput {
    PromptInput {
        title: title.to_string(),
        description: "用于自动化测试".to_string(),
        body: body.to_string(),
        category_id: GENERAL_CATEGORY_ID.to_string(),
        tags: vec!["测试".to_string(), "Codex".to_string()],
        is_favorite: false,
        is_pinned: false,
    }
}

#[tokio::test]
async fn initializes_six_default_categories_and_no_prompts() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database initializes");

    let category_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
        .fetch_one(database.pool())
        .await
        .expect("count categories");
    let prompt_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompts")
        .fetch_one(database.pool())
        .await
        .expect("count prompts");

    assert_eq!(category_count, 6);
    assert_eq!(prompt_count, 0);
}

#[tokio::test]
async fn restarting_the_database_does_not_duplicate_default_categories() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("promptdock.sqlite3");

    let first = Database::connect_path(&path)
        .await
        .expect("first startup initializes");
    first.close().await;

    let second = Database::connect_path(&path)
        .await
        .expect("second startup initializes");
    let category_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
        .fetch_one(second.pool())
        .await
        .expect("count categories");

    assert_eq!(category_count, 6);
}

#[tokio::test]
async fn validates_and_persists_prompt_crud_without_losing_multiline_text() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("promptdock.sqlite3");
    let database = Database::connect_path(&path).await.expect("database");
    let repository = PromptRepository::new(database.pool().clone());

    let body = "第一行\n  第二行保留缩进\n第三行 % _ ' ; DROP TABLE prompts;";
    let created = repository
        .create(prompt_input(" 中文标题 ", body))
        .await
        .expect("create prompt");
    assert_eq!(created.title, "中文标题");
    assert_eq!(created.body, body);
    assert_eq!(created.tags, vec!["测试", "Codex"]);

    let fetched = repository.get(&created.id).await.expect("fetch prompt");
    assert_eq!(fetched.body, body);

    let mut update = prompt_input("更新后的标题", "更新正文\n仍保留换行");
    update.is_favorite = true;
    let updated = repository
        .update(&created.id, update)
        .await
        .expect("update prompt");
    assert!(updated.is_favorite);

    database.close().await;
    let reopened = Database::connect_path(&path)
        .await
        .expect("reopen database");
    let reopened_repository = PromptRepository::new(reopened.pool().clone());
    assert_eq!(
        reopened_repository
            .get(&created.id)
            .await
            .expect("persisted prompt")
            .body,
        "更新正文\n仍保留换行"
    );

    reopened_repository
        .delete(&created.id)
        .await
        .expect("delete prompt");
    let error = reopened_repository
        .get(&created.id)
        .await
        .expect_err("deleted prompt is missing");
    assert_eq!(error.code(), "NOT_FOUND");
}

#[tokio::test]
async fn rejects_invalid_prompt_fields_and_unknown_categories() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let repository = PromptRepository::new(database.pool().clone());

    let empty_title = repository
        .create(prompt_input("   ", "有效正文"))
        .await
        .expect_err("empty title rejected");
    assert_eq!(empty_title.code(), "VALIDATION_ERROR");

    let mut unknown_category = prompt_input("有效标题", "有效正文");
    unknown_category.category_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_string();
    let category_error = repository
        .create(unknown_category)
        .await
        .expect_err("unknown category rejected");
    assert_eq!(category_error.code(), "CATEGORY_NOT_FOUND");

    let too_many_tags = PromptInput {
        tags: (0..11).map(|index| format!("标签{index}")).collect(),
        ..prompt_input("有效标题", "有效正文")
    };
    assert_eq!(
        repository
            .create(too_many_tags)
            .await
            .expect_err("too many tags rejected")
            .code(),
        "VALIDATION_ERROR"
    );
}

#[tokio::test]
async fn searches_chinese_and_treats_like_wildcards_as_literal_text() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let repository = PromptRepository::new(database.pool().clone());

    repository
        .create(prompt_input("季度复盘", "检查经营现金流和合同负债"))
        .await
        .expect("create Chinese prompt");
    repository
        .create(prompt_input("百分比模板", "SQL LIKE 中的 100% 和下划线 _"))
        .await
        .expect("create wildcard prompt");

    let chinese = repository
        .list(PromptQuery {
            search: Some("现金流".to_string()),
            ..PromptQuery::default()
        })
        .await
        .expect("Chinese search");
    assert_eq!(chinese.total, 1);

    let percent = repository
        .list(PromptQuery {
            search: Some("100%".to_string()),
            ..PromptQuery::default()
        })
        .await
        .expect("literal percent search");
    assert_eq!(percent.total, 1);

    let underscore = repository
        .list(PromptQuery {
            search: Some("_".to_string()),
            ..PromptQuery::default()
        })
        .await
        .expect("literal underscore search");
    assert_eq!(underscore.total, 1);
}

#[tokio::test]
async fn records_copy_count_and_applies_views_and_sorting() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let repository = PromptRepository::new(database.pool().clone());

    let first = repository
        .create(prompt_input("A 提示词", "正文 A"))
        .await
        .expect("first prompt");
    let mut favorite_input = prompt_input("B 提示词", "正文 B");
    favorite_input.is_favorite = true;
    let favorite = repository
        .create(favorite_input)
        .await
        .expect("favorite prompt");

    repository
        .record_successful_copy(&first.id)
        .await
        .expect("record first copy");
    repository
        .record_successful_copy(&first.id)
        .await
        .expect("record second copy");

    let popular = repository
        .list(PromptQuery {
            sort: PromptSort::Popular,
            ..PromptQuery::default()
        })
        .await
        .expect("popular list");
    assert_eq!(popular.items[0].id, first.id);
    assert_eq!(popular.items[0].copy_count, 2);
    assert!(popular.items[0].last_copied_at.is_some());

    let favorites = repository
        .list(PromptQuery {
            view: PromptView::Favorite,
            ..PromptQuery::default()
        })
        .await
        .expect("favorites list");
    assert_eq!(favorites.items.len(), 1);
    assert_eq!(favorites.items[0].id, favorite.id);
}

#[tokio::test]
async fn categories_are_case_insensitively_unique() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let repository = CategoryRepository::new(database.pool().clone());

    let category = repository.create("Research").await.expect("new category");
    assert_eq!(category.name, "Research");
    let duplicate = repository
        .create("research")
        .await
        .expect_err("case insensitive duplicate rejected");
    assert_eq!(duplicate.code(), "CATEGORY_EXISTS");
}

#[tokio::test]
async fn categories_can_be_renamed_and_deleted_after_moving_prompts() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let categories = CategoryRepository::new(database.pool().clone());
    let prompts = PromptRepository::new(database.pool().clone());

    let source = categories.create("待整理").await.expect("source category");
    let target = categories.create("已整理").await.expect("target category");
    let renamed = categories
        .rename(&source.id, "进行中")
        .await
        .expect("rename category");
    assert_eq!(renamed.name, "进行中");

    let mut input = prompt_input("分类移动", "删除分类时保留提示词");
    input.category_id = source.id.clone();
    let prompt = prompts.create(input).await.expect("prompt in source");

    categories
        .delete_and_move(&source.id, &target.id)
        .await
        .expect("delete and move");
    assert_eq!(
        prompts
            .get(&prompt.id)
            .await
            .expect("moved prompt")
            .category_id,
        target.id
    );
    assert_eq!(
        categories
            .get(&source.id)
            .await
            .expect_err("source deleted")
            .code(),
        "NOT_FOUND"
    );
}

#[tokio::test]
async fn category_delete_rejects_same_or_missing_move_target() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let categories = CategoryRepository::new(database.pool().clone());
    let source = categories
        .create("临时分类")
        .await
        .expect("source category");

    assert_eq!(
        categories
            .delete_and_move(&source.id, &source.id)
            .await
            .expect_err("same target rejected")
            .code(),
        "CONFLICT"
    );
    assert_eq!(
        categories
            .delete_and_move(&source.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
            .await
            .expect_err("missing target rejected")
            .code(),
        "CATEGORY_NOT_FOUND"
    );
}

#[tokio::test]
async fn sticky_slots_reject_a_sixth_prompt_and_keep_stable_manual_order() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let repository = PromptRepository::new(database.pool().clone());
    let mut prompts = Vec::new();

    for index in 1..=6 {
        prompts.push(
            repository
                .create(prompt_input(&format!("提示词 {index}"), "完整正文"))
                .await
                .expect("create prompt"),
        );
    }
    for prompt in prompts.iter().take(5) {
        repository
            .set_pinned(&prompt.id, true)
            .await
            .expect("pin prompt");
    }

    let sixth_error = repository
        .set_pinned(&prompts[5].id, true)
        .await
        .expect_err("sixth pin rejected");
    assert_eq!(sixth_error.code(), "PIN_LIMIT_REACHED");

    let reversed_ids: Vec<String> = prompts
        .iter()
        .take(5)
        .rev()
        .map(|prompt| prompt.id.clone())
        .collect();
    let reversed = repository
        .reorder_sticky(&reversed_ids)
        .await
        .expect("reorder pins");
    assert_eq!(
        reversed.iter().map(|prompt| &prompt.id).collect::<Vec<_>>(),
        reversed_ids.iter().collect::<Vec<_>>()
    );

    repository
        .record_successful_copy(&prompts[0].id)
        .await
        .expect("copy does not reorder");
    assert_eq!(
        repository
            .list_sticky()
            .await
            .expect("sticky list after copy")
            .iter()
            .map(|prompt| &prompt.id)
            .collect::<Vec<_>>(),
        reversed_ids.iter().collect::<Vec<_>>()
    );

    repository
        .set_pinned(&reversed_ids[2], false)
        .await
        .expect("unpin middle");
    let compact = repository.list_sticky().await.expect("compact sticky list");
    assert_eq!(
        compact
            .iter()
            .map(|prompt| prompt.pin_order)
            .collect::<Vec<_>>(),
        vec![Some(1), Some(2), Some(3), Some(4)]
    );
}

#[tokio::test]
async fn migration_backfills_only_five_legacy_pins_without_deleting_overflow() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("legacy.sqlite3");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .expect("legacy database");
    sqlx::raw_sql(include_str!("../../migrations/0001_init.sql"))
        .execute(&pool)
        .await
        .expect("legacy schema");
    sqlx::query("INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, '旧分类', 'folder', '#000000', 0, 1, 1)")
        .bind(GENERAL_CATEGORY_ID)
        .execute(&pool)
        .await
        .expect("legacy category");
    for index in 0..6 {
        sqlx::query("INSERT INTO prompts (id, title, body, category_id, is_pinned, copy_count, created_at, updated_at) VALUES (?, ?, '正文', ?, 1, ?, 1, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(format!("旧置顶 {index}"))
            .bind(GENERAL_CATEGORY_ID)
            .bind(index)
            .bind(index)
            .execute(&pool)
            .await
            .expect("legacy prompt");
    }
    pool.close().await;

    let migrated = Database::connect_path(&path)
        .await
        .expect("migrate legacy database");
    let positioned: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM prompts WHERE pin_order IS NOT NULL")
            .fetch_one(migrated.pool())
            .await
            .expect("positioned pins");
    let pinned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompts WHERE is_pinned = 1")
        .fetch_one(migrated.pool())
        .await
        .expect("all legacy pins");
    let first_title: String = sqlx::query_scalar("SELECT title FROM prompts WHERE pin_order = 1")
        .fetch_one(migrated.pool())
        .await
        .expect("highest-use prompt assigned first");

    assert_eq!(positioned, 5);
    assert_eq!(pinned, 6);
    assert_eq!(first_title, "旧置顶 5");
}

#[tokio::test]
async fn empty_dashboard_stats_are_zero_and_settings_round_trip_as_json() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::connect_path(directory.path().join("promptdock.sqlite3"))
        .await
        .expect("database");
    let prompts = PromptRepository::new(database.pool().clone());
    let settings = SettingsRepository::new(database.pool().clone());

    let stats = prompts.dashboard_stats().await.expect("empty stats");
    assert_eq!(stats.total, 0);
    assert_eq!(stats.recent, 0);
    assert_eq!(stats.favorites, 0);
    assert_eq!(stats.pinned, 0);
    assert_eq!(stats.templates, 0);

    let value = serde_json::json!({"visible": true, "alwaysOnTop": false, "x": 120});
    settings
        .set("sticky_window", &value)
        .await
        .expect("save settings");
    assert_eq!(
        settings.get("sticky_window").await.expect("read settings"),
        Some(value)
    );
}
