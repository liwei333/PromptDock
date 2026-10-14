<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "neutral" | "accent" | "success" | "warning";
  }>(),
  { tone: "neutral" },
);
</script>

<template>
  <span class="pd-badge" :data-tone="tone"><slot /></span>
</template>

<style scoped>
.pd-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 7px;
  color: var(--pd-text-secondary);
  border: 1px solid var(--pd-border);
  border-radius: 999px;
  background: var(--pd-surface-hover);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
}

.pd-badge[data-tone="accent"] {
  color: var(--pd-accent);
  border-color: color-mix(in srgb, var(--pd-accent) 18%, transparent);
  background: var(--pd-accent-soft);
}

.pd-badge[data-tone="success"] {
  color: var(--pd-success);
  border-color: color-mix(in srgb, var(--pd-success) 20%, transparent);
  background: color-mix(in srgb, var(--pd-success) 9%, white);
}

.pd-badge[data-tone="warning"] {
  color: var(--pd-warning);
  border-color: color-mix(in srgb, var(--pd-warning) 22%, transparent);
  background: color-mix(in srgb, var(--pd-warning) 10%, white);
}
</style>
