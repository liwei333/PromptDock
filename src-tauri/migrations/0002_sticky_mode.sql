ALTER TABLE prompts ADD COLUMN pin_order INTEGER
  CHECK (pin_order IS NULL OR pin_order BETWEEN 1 AND 5);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_pin_order_unique
  ON prompts(pin_order) WHERE pin_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_mini_list
  ON prompts(is_pinned, pin_order);
