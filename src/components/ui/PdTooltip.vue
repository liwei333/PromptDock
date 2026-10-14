<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";

defineProps<{
  text: string;
}>();
</script>

<template>
  <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
    <TooltipRoot :delay-duration="0">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="pd-tooltip-content" :side-offset="6">
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style scoped>
.pd-tooltip-content {
  z-index: 1000;
  max-width: 240px;
  padding: 6px 8px;
  color: white;
  border-radius: 6px;
  background: rgba(31, 36, 48, 0.94);
  box-shadow: var(--pd-shadow-popover);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  pointer-events: none;
  user-select: none;
}
</style>
