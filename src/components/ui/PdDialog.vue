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
import { computed, onBeforeUnmount, useSlots } from "vue";

import PdIconButton from "@/components/ui/PdIconButton.vue";

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
const contentAccessibilityAttrs = computed(() =>
  props.description ? {} : { "aria-describedby": undefined },
);
const returnFocusTarget =
  document.activeElement instanceof HTMLElement ? document.activeElement : null;
let focusRestorationQueued = false;

function queueFocusRestoration(): void {
  if (focusRestorationQueued) return;
  focusRestorationQueued = true;
  queueMicrotask(() => {
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
  });
}

function restoreFocus(event: Event): void {
  event.preventDefault();
  queueFocusRestoration();
}

function handleOpenChange(open: boolean): void {
  if (!open && props.open) emit("dismiss");
}

function handlePointerDownOutside(event: Event): void {
  if (!props.closeOnOutside) event.preventDefault();
}

onBeforeUnmount(queueFocusRestoration);
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="pd-dialog-overlay" />
      <DialogContent
        v-bind="contentAccessibilityAttrs"
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
          />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
