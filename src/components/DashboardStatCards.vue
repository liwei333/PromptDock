<script setup lang="ts">
import { LibraryBig, Pin, Star, Zap } from "lucide-vue-next";
import { computed } from "vue";

import type { DashboardStats } from "@/types/prompt";

const props = defineProps<{ stats: DashboardStats }>();
const visiblePinned = computed(() =>
  Math.min(Math.max(props.stats.pinned, 0), 5),
);
</script>

<template>
  <section class="dashboard-stat-grid" aria-label="提示词概览">
    <article data-test="stat-total">
      <span class="stat-icon blue" aria-hidden="true"><LibraryBig /></span>
      <div>
        <small>总提示词</small><strong>{{ stats.total }}</strong>
      </div>
    </article>
    <article data-test="stat-today">
      <span class="stat-icon amber" aria-hidden="true"><Zap /></span>
      <div>
        <small>今日复制次数</small><strong>{{ stats.todayCopies }}</strong>
      </div>
    </article>
    <article data-test="stat-favorites">
      <span class="stat-icon gold" aria-hidden="true"><Star /></span>
      <div>
        <small>收藏</small><strong>{{ stats.favorites }}</strong>
      </div>
    </article>
    <article data-test="stat-pinned">
      <span class="stat-icon rose" aria-hidden="true"><Pin /></span>
      <div>
        <small>置顶</small>
        <strong :aria-label="`置顶容量 ${stats.pinned}/5`"
          >{{ stats.pinned }}/5</strong
        >
        <span class="pin-capacity" aria-hidden="true">
          <i
            v-for="segment in 5"
            :key="segment"
            data-test="pin-capacity-segment"
            :class="{ active: segment <= visiblePinned }"
          />
        </span>
      </div>
    </article>
  </section>
</template>
