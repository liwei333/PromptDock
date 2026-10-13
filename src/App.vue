<script setup lang="ts">
import { computed } from "vue";

import MainWindow from "@/windows/MainWindow.vue";
import QuickWindow from "@/windows/QuickWindow.vue";
import StickyWindow from "@/windows/StickyWindow.vue";

const target = computed(
  () => new URLSearchParams(window.location.search).get("window") ?? "main",
);
</script>

<template>
  <QuickWindow v-if="target === 'quick'" />
  <StickyWindow v-else-if="target === 'sticky'" />
  <MainWindow v-else />
</template>
