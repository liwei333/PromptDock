<script setup lang="ts">
import { windowApi } from "@/api/commands";
import QuickPalette from "@/components/QuickPalette.vue";

function close(): void {
  void windowApi.hideQuick();
}
</script>

<template>
  <main class="quick-window-page">
    <QuickPalette @close="close" />
  </main>
</template>
