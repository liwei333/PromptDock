use serde_json::json;
use tempfile::tempdir;

use crate::{
    db::Database,
    domain::models::PromptInput,
    repositories::prompt_repo::PromptRepository,
    services::backup_service::{
        BackupCategory, BackupDocument, BackupPrompt, ImportMode, MAX_BACKUP_BYTES, commit_import,
        commit_replace_with_safety_backup, export_document, parse_backup_bytes,
        write_document_atomic,
    },
};

fn current_backup(prompts: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "app": "PromptDock",
        "version": 2,
        "exportedAt": "2026-10-13T12:00:00Z",
        "categories": [{
            "id": "10000000-0000-4000-8000-000000000006",
            "name": "通用效率",
            "icon": "sparkles",
            "color": "#6687AE",
            "sortOrder": 0,
            "createdAt": 1,
            "updatedAt": 1
        }],
        "prompts": prompts
    }))
    .expect("serialize fixture")
}

#[test]
fn current_backup_validates_without_changing_multiline_text() {
    let bytes = current_backup(json!([{
        "id": "20000000-0000-4000-8000-000000000001",
        "title": "备份测试",
        "description": "说明",
        "body": "第一行\n  第二行",
        "categoryId": "10000000-0000-4000-8000-000000000006",
        "tags": ["测试"],
        "isFavorite": true,
        "isPinned": true,
        "pinOrder": 1,
        "copyCount": 3,
        "lastCopiedAt": 123,
        "createdAt": 1,
        "updatedAt": 2
    }]));
    let parsed = parse_backup_bytes(&bytes).expect("valid current backup");
    assert_eq!(parsed.prompts[0].body, "第一行\n  第二行");
    assert_eq!(parsed.prompts[0].copy_count, 3);
}

#[test]
fn legacy_ids_are_mapped_to_stable_uuids() {
    let legacy = serde_json::to_vec(&json!({
        "app": "PromptDock",
        "version": 1,
        "categories": ["技术研发"],
        "prompts": [{
            "id": "demo-import-1",
            "title": "旧版",
            "body": "正文",
            "category": "技术研发",
            "tags": [],
            "favorite": false,
            "pinned": true,
            "uses": 2,
            "createdAt": 1,
            "updatedAt": 2,
            "lastUsed": null
        }]
    }))
    .expect("legacy fixture");
    let first = parse_backup_bytes(&legacy).expect("first parse");
    let second = parse_backup_bytes(&legacy).expect("second parse");
    assert_eq!(first.prompts[0].id, second.prompts[0].id);
    assert!(uuid::Uuid::parse_str(&first.prompts[0].id).is_ok());
}

#[test]
fn invalid_json_oversize_and_duplicate_ids_are_rejected() {
    assert_eq!(
        parse_backup_bytes(b"not-json")
            .expect_err("invalid JSON")
            .code(),
        "SERIALIZATION_ERROR"
    );
    assert_eq!(
        parse_backup_bytes(&vec![b' '; MAX_BACKUP_BYTES + 1])
            .expect_err("oversize")
            .code(),
        "VALIDATION_ERROR"
    );

    let prompt = json!({
        "id": "20000000-0000-4000-8000-000000000001",
        "title": "重复",
        "description": "",
        "body": "正文",
        "categoryId": "10000000-0000-4000-8000-000000000006",
        "tags": [],
        "isFavorite": false,
        "isPinned": false,
        "pinOrder": null,
        "copyCount": 0,
        "lastCopiedAt": null,
        "createdAt": 1,
        "updatedAt": 1
    });
    let duplicated = current_backup(json!([prompt.clone(), prompt]));
    assert_eq!(
        parse_backup_bytes(&duplicated)
            .expect_err("duplicate IDs")
            .code(),
        "CONFLICT"
    );
}

#[test]
fn more_than_ten_thousand_prompts_are_rejected() {
    let base = json!({
        "id": "placeholder",
        "title": "大量导入",
        "description": "",
        "body": "正文",
        "categoryId": "10000000-0000-4000-8000-000000000006",
        "tags": [],
        "isFavorite": false,
        "isPinned": false,
        "pinOrder": null,
        "copyCount": 0,
        "lastCopiedAt": null,
        "createdAt": 1,
        "updatedAt": 1
    });
    let prompts: Vec<_> = (0..10_001)
        .map(|index| {
            let mut prompt = base.clone();
            prompt["id"] = json!(uuid::Uuid::new_v4().to_string());
            prompt["title"] = json!(format!("提示词 {index}"));
            prompt
        })
        .collect();
    assert_eq!(
        parse_backup_bytes(&current_backup(json!(prompts)))
            .expect_err("item limit")
            .code(),
        "VALIDATION_ERROR"
    );
}

#[tokio::test]
async fn current_format_round_trip_preserves_all_prompt_fields() {
    let source_dir = tempdir().expect("source directory");
    let source = Database::connect_path(source_dir.path().join("source.sqlite3"))
        .await
        .expect("source database");
    let repository = PromptRepository::new(source.pool().clone());
    let created = repository
        .create(PromptInput {
            title: "完整往返".to_string(),
            description: "保留全部字段".to_string(),
            body: "第一行\n  第二行 {{变量}}".to_string(),
            category_id: "10000000-0000-4000-8000-000000000006".to_string(),
            tags: vec!["备份".to_string(), "Unicode".to_string()],
            is_favorite: true,
            is_pinned: true,
        })
        .await
        .expect("create prompt");
    repository
        .record_successful_copy(&created.id)
        .await
        .expect("record copy");

    let document = export_document(source.pool())
        .await
        .expect("export document");
    let backup_path = source_dir.path().join("roundtrip.json");
    write_document_atomic(&backup_path, &document).expect("atomic write");
    let parsed = parse_backup_bytes(&std::fs::read(&backup_path).expect("read backup"))
        .expect("parse exported backup");

    let target_dir = tempdir().expect("target directory");
    let target = Database::connect_path(target_dir.path().join("target.sqlite3"))
        .await
        .expect("target database");
    commit_import(target.pool(), &parsed, ImportMode::Replace)
        .await
        .expect("replace import");
    let restored = PromptRepository::new(target.pool().clone())
        .get(&created.id)
        .await
        .expect("restored prompt");
    assert_eq!(restored.title, created.title);
    assert_eq!(restored.description, created.description);
    assert_eq!(restored.body, created.body);
    assert_eq!(restored.tags, created.tags);
    assert_eq!(restored.is_favorite, created.is_favorite);
    assert_eq!(restored.is_pinned, created.is_pinned);
    assert_eq!(restored.pin_order, created.pin_order);
    assert_eq!(restored.copy_count, 1);
}

#[tokio::test]
async fn failed_import_rolls_back_categories_and_prompts() {
    let directory = tempdir().expect("directory");
    let database = Database::connect_path(directory.path().join("rollback.sqlite3"))
        .await
        .expect("database");
    let category_id = uuid::Uuid::new_v4().to_string();
    let document = BackupDocument {
        app: "PromptDock".to_string(),
        version: 2,
        exported_at: "2026-10-13T12:00:00Z".to_string(),
        categories: vec![BackupCategory {
            id: category_id.clone(),
            name: "事务回滚".to_string(),
            icon: "folder".to_string(),
            color: "#000000".to_string(),
            sort_order: 99,
            created_at: 1,
            updated_at: 1,
        }],
        prompts: vec![BackupPrompt {
            id: uuid::Uuid::new_v4().to_string(),
            title: "无效正文".to_string(),
            description: "".to_string(),
            body: "".to_string(),
            category_id,
            tags: vec![],
            is_favorite: false,
            is_pinned: false,
            pin_order: None,
            copy_count: 0,
            last_copied_at: None,
            created_at: 1,
            updated_at: 1,
        }],
    };
    commit_import(database.pool(), &document, ImportMode::Merge)
        .await
        .expect_err("prompt constraint fails");
    let category_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE name = '事务回滚'")
            .fetch_one(database.pool())
            .await
            .expect("count rolled-back category");
    assert_eq!(category_count, 0);
}

#[tokio::test]
async fn replace_aborts_without_changes_when_safety_backup_cannot_be_written() {
    let directory = tempdir().expect("directory");
    let database = Database::connect_path(directory.path().join("safety.sqlite3"))
        .await
        .expect("database");
    let repository = PromptRepository::new(database.pool().clone());
    let original = repository
        .create(PromptInput {
            title: "必须保留".to_string(),
            description: "".to_string(),
            body: "安全备份失败时不能清库".to_string(),
            category_id: "10000000-0000-4000-8000-000000000006".to_string(),
            tags: vec![],
            is_favorite: false,
            is_pinned: false,
        })
        .await
        .expect("original prompt");
    let replacement = export_document(database.pool()).await.expect("replacement");
    let impossible_path = directory.path().join("destination-is-a-directory");
    std::fs::create_dir(&impossible_path).expect("create conflicting directory");

    commit_replace_with_safety_backup(database.pool(), &replacement, &impossible_path)
        .await
        .expect_err("safety backup failure aborts replace");
    assert_eq!(
        repository
            .get(&original.id)
            .await
            .expect("original remains")
            .body,
        "安全备份失败时不能清库"
    );
}
