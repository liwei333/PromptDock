<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";

withDefaults(
  defineProps<{
    modelValue: boolean;
    label: string;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

defineEmits<{
  "update:modelValue": [value: boolean];
}>();
</script>

<template>
  <SwitchRoot
    class="pd-switch"
    type="button"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="label"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <SwitchThumb class="pd-switch__thumb" />
  </SwitchRoot>
</template>
