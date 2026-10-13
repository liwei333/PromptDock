-- PromptDock migration 002: 5-slot sticky prompt window.
-- Apply AFTER schema.sql / migration 001. Do NOT apply twice.
-- The original is_pinned flag remains for compatibility with V1.0 datasets.
ALTER TABLE prompts ADD COLUMN pin_order INTEGER
  CHECK (pin_order IS NULL OR pin_order BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_pin_order_unique
  ON prompts(pin_order) WHERE pin_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompts_mini_list
  ON prompts(is_pinned, pin_order);

-- Legacy data policy: business service (Rust) backfills positions 1..5 ONCE
-- in a transaction after this migration. Keep >5 legacy pinned rows as
-- is_pinned=1 and pin_order=NULL; never delete their prompt content.
-- This file deliberately does not auto-drop/unpin the overflow rows.
