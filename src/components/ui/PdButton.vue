<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "secondary",
    size: "md",
    loading: false,
    disabled: false,
  },
);

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    class="pd-button"
    type="button"
    :data-variant="variant"
    :data-size="size"
    :aria-busy="loading || undefined"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="$slots.leading" class="pd-button__slot">
      <slot name="leading" />
    </span>
    <span class="pd-button__label"><slot /></span>
    <span v-if="$slots.trailing" class="pd-button__slot">
      <slot name="trailing" />
    </span>
  </button>
</template>

<style scoped>
.pd-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  height: var(--pd-control-md);
  padding: 0 13px;
  color: var(--pd-text);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-surface-elevated);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  transition:
    color var(--pd-motion-fast) ease,
    border-color var(--pd-motion-fast) ease,
    background var(--pd-motion-fast) ease,
    transform var(--pd-motion-fast) ease;
}

.pd-button[data-size="sm"] {
  height: var(--pd-control-sm);
  padding-inline: 10px;
  font-size: 11px;
}

.pd-button[data-variant="primary"] {
  color: white;
  border-color: var(--pd-accent);
  background: var(--pd-accent);
}

.pd-button[data-variant="primary"]:hover:not(:disabled) {
  border-color: var(--pd-accent-hover);
  background: var(--pd-accent-hover);
}

.pd-button[data-variant="secondary"]:hover:not(:disabled),
.pd-button[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--pd-surface-hover);
}

.pd-button[data-variant="ghost"] {
  border-color: transparent;
  background: transparent;
}

.pd-button[data-variant="danger"] {
  color: var(--pd-danger);
  border-color: color-mix(in srgb, var(--pd-danger) 28%, transparent);
  background: color-mix(in srgb, var(--pd-danger) 8%, white);
}

.pd-button[data-variant="danger"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pd-danger) 13%, white);
}

.pd-button:active:not(:disabled) {
  transform: translateY(1px);
}

.pd-button__slot,
.pd-button__label {
  display: inline-flex;
  align-items: center;
}

.pd-button__slot :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
