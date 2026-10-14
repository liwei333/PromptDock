CREATE TABLE IF NOT EXISTS daily_copy_stats (
    copy_date TEXT PRIMARY KEY NOT NULL,
    copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0)
);
