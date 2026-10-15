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
import { computed, useAttrs, useId } from "vue";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    options: PdSelectOption[];
    placeholder?: string;
    clearLabel?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: "请选择",
    disabled: false,
  },
);
const validOptions = computed(() =>
  props.options.filter((option) => option.value !== ""),
);
const selectedLabel = computed(
  () =>
    validOptions.value.find((option) => option.value === props.modelValue)
      ?.label ?? props.placeholder,
);
const selectId = useId();
const clearValue = computed(() => {
  const externalValues = new Set([
    props.modelValue,
    ...props.options.map((option) => option.value),
  ]);
  let value = `__pd-select-clear-${selectId}__`;
  while (externalValues.has(value)) value += "_";
  return value;
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function updateValue(value: string): void {
  emit("update:modelValue", value === clearValue.value ? "" : value);
}
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="updateValue"
  >
    <SelectTrigger
      v-bind="attrs"
      class="pd-select-trigger"
      type="button"
      :aria-label="label"
    >
      <SelectValue class="pd-select-value" :placeholder="placeholder">
        {{ selectedLabel }}
      </SelectValue>
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
            v-if="clearLabel"
            class="pd-select-item"
            :value="clearValue"
            :text-value="clearLabel"
          >
            <SelectItemText>{{ clearLabel }}</SelectItemText>
            <SelectItemIndicator class="pd-select-item__indicator">
              <Check aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
          <SelectItem
            v-for="option in validOptions"
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
