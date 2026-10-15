<script setup lang="ts">
import { type Component } from "vue";
import { Toggle } from "reka-ui";

defineProps<{
  pressed: boolean;
  label: string;
  icon?: Component;
}>();

defineEmits<{
  "update:pressed": [value: boolean];
}>();
</script>

<template>
  <Toggle
    class="pd-toggle"
    type="button"
    :model-value="pressed"
    :aria-label="label"
    @update:model-value="$emit('update:pressed', $event)"
  >
    <component v-if="icon" :is="icon" aria-hidden="true" />
  </Toggle>
</template>
