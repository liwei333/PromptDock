<script setup lang="ts">
import { X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { computed, onBeforeUnmount, useAttrs, useSlots, watch } from "vue";

import PdIconButton from "@/components/ui/PdIconButton.vue";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    closeLabel?: string;
    closeOnOutside?: boolean;
  }>(),
  {
    description: undefined,
    closeLabel: undefined,
    closeOnOutside: true,
  },
);

const emit = defineEmits<{
  dismiss: [];
}>();

const slots = useSlots();
const resolvedCloseLabel = computed(
  () => props.closeLabel ?? `关闭${props.title}`,
);
let returnFocusTarget: HTMLElement | null = null;
let focusRestorationNeeded = false;
let dismissRequested = false;

function getContentAttrs(): Record<string, unknown> {
  return {
    ...attrs,
    ...(props.description || attrs["aria-describedby"] !== undefined
      ? {}
      : { "aria-describedby": undefined }),
  };
}

function captureFocusTarget(): void {
  returnFocusTarget =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  focusRestorationNeeded = true;
}

function queueFocusRestoration(): void {
  if (!focusRestorationNeeded) return;
  focusRestorationNeeded = false;
  const target = returnFocusTarget;
  queueMicrotask(() => {
    if (target?.isConnected) target.focus();
  });
}

function restoreFocus(event: Event): void {
  event.preventDefault();
  queueFocusRestoration();
}

function requestDismiss(): void {
  if (dismissRequested) return;
  dismissRequested = true;
  emit("dismiss");
  queueMicrotask(() => {
    dismissRequested = false;
  });
}

function handleOpenChange(open: boolean): void {
  if (!open && props.open) requestDismiss();
}

function handleTooltipEscape(): void {
  requestDismiss();
}

function handlePointerDownOutside(event: Event): void {
  if (!props.closeOnOutside) event.preventDefault();
}

watch(
  () => props.open,
  (open, wasOpen) => {
    if (open && !wasOpen) captureFocusTarget();
    if (!open && wasOpen) queueFocusRestoration();
  },
  { immediate: true },
);

onBeforeUnmount(queueFocusRestoration);
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="pd-dialog-overlay" />
      <DialogContent
        v-bind="getContentAttrs()"
        class="pd-dialog-content"
        @close-auto-focus="restoreFocus"
        @pointer-down-outside="handlePointerDownOutside"
      >
        <header class="pd-dialog-header">
          <div class="pd-dialog-heading">
            <DialogTitle class="pd-dialog-title">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="pd-dialog-description">
              {{ description }}
            </DialogDescription>
          </div>
        </header>

        <div class="pd-dialog-body">
          <slot />
        </div>

        <footer v-if="slots.footer" class="pd-dialog-footer">
          <slot name="footer" />
        </footer>

        <DialogClose as-child>
          <PdIconButton
            class="pd-dialog-close"
            :label="resolvedCloseLabel"
            :icon="X"
            @tooltip-escape="handleTooltipEscape"
          />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
