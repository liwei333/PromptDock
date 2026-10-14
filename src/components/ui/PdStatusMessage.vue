<script setup lang="ts">
import { computed, type Component } from "vue";

const props = withDefaults(
  defineProps<{
    tone: "info" | "success" | "warning" | "danger";
    message: string;
    icon?: Component;
    live?: "off" | "polite" | "assertive";
  }>(),
  {
    icon: undefined,
    live: undefined,
  },
);

const semanticRole = computed(() =>
  props.tone === "danger" || props.live === "assertive" ? "alert" : "status",
);
const liveMode = computed(
  () => props.live ?? (semanticRole.value === "alert" ? "assertive" : "polite"),
);
</script>

<template>
  <div
    class="pd-status-message"
    :data-tone="tone"
    :role="semanticRole"
    :aria-live="liveMode"
  >
    <component
      :is="icon"
      v-if="icon"
      class="pd-status-message__icon"
      aria-hidden="true"
    />
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.pd-status-message {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--pd-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.pd-status-message[data-tone="info"] {
  color: var(--pd-accent);
}

.pd-status-message[data-tone="success"] {
  color: var(--pd-success);
}

.pd-status-message[data-tone="warning"] {
  color: var(--pd-warning);
}

.pd-status-message[data-tone="danger"] {
  color: var(--pd-danger);
}

.pd-status-message__icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  stroke-width: 1.8;
}
</style>
