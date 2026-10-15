<script setup lang="ts">
import { type ButtonHTMLAttributes, type Component, useAttrs } from "vue";

import PdTooltip from "@/components/ui/PdTooltip.vue";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

withDefaults(
  defineProps<{
    label: string;
    icon: Component;
    tooltip?: string;
    pressed?: boolean;
    disabled?: boolean;
    type?: ButtonHTMLAttributes["type"];
  }>(),
  {
    tooltip: undefined,
    pressed: undefined,
    disabled: false,
    type: "button",
  },
);

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <PdTooltip :text="tooltip ?? label">
    <button
      v-bind="attrs"
      class="pd-icon-button"
      :type="type"
      :aria-label="label"
      :aria-pressed="pressed === undefined ? undefined : pressed"
      :disabled="disabled"
      @click="$emit('click', $event)"
    >
      <component :is="icon" aria-hidden="true" />
    </button>
  </PdTooltip>
</template>

<style scoped>
.pd-icon-button {
  display: inline-grid;
  place-items: center;
  width: var(--pd-control-sm);
  height: var(--pd-control-sm);
  padding: 0;
  color: var(--pd-text-secondary);
  border: 1px solid transparent;
  border-radius: var(--pd-radius-sm);
  background: transparent;
  transition:
    color var(--pd-motion-fast) ease,
    border-color var(--pd-motion-fast) ease,
    background var(--pd-motion-fast) ease;
}

.pd-icon-button:hover:not(:disabled) {
  color: var(--pd-text);
  background: var(--pd-surface-hover);
}

.pd-icon-button[aria-pressed="true"] {
  color: var(--pd-accent);
  border-color: color-mix(in srgb, var(--pd-accent) 18%, transparent);
  background: var(--pd-accent-soft);
}

.pd-icon-button :deep(svg) {
  width: 15px;
  height: 15px;
  stroke-width: 1.8;
}
</style>
