-- PromptDock V1.0 SQLite schema. Apply from a versioned sqlx migration.
-- PRAGMA foreign_keys = ON must be set for EACH connection in application code.
-- Set journal_mode=WAL and busy_timeout in connection options/startup.
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    icon TEXT NOT NULL DEFAULT 'folder',
    color TEXT NOT NULL DEFAULT '#64748B',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 160),
    body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 100000 AND length(trim(body)) > 0),
    category_id TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0, 1)),
    copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0),
    last_copied_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_category_id ON prompts(category_id);
CREATE INDEX IF NOT EXISTS idx_prompts_copy_count ON prompts(copy_count DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_last_copied_at ON prompts(last_copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_pinned ON prompts(is_pinned, copy_count DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite, updated_at DESC);
