<script lang="ts">
export interface PdSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
</script>

<script setup lang="ts">
import { Check, ChevronDown } from "lucide-vue-next";
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";

withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    options: PdSelectOption[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: "请选择",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function updateValue(value: string): void {
  emit("update:modelValue", value);
}
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="updateValue"
  >
    <SelectTrigger class="pd-select-trigger" type="button" :aria-label="label">
      <SelectValue :placeholder="placeholder" />
      <SelectIcon class="pd-select-trigger__icon">
        <ChevronDown aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="pd-select-content"
        position="popper"
        :side-offset="5"
        :collision-padding="8"
        :body-lock="false"
      >
        <SelectViewport class="pd-select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="pd-select-item"
            :value="option.value"
            :disabled="option.disabled"
            :text-value="option.label"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="pd-select-item__indicator">
              <Check aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
