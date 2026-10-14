<script setup lang="ts">
import type { DashboardStats } from "@/types/prompt";

defineProps<{ stats: DashboardStats }>();
</script>

<template>
  <section class="dashboard-stat-grid" aria-label="提示词概览">
    <article data-test="stat-total">
      <span class="stat-icon blue">▤</span>
      <div>
        <small>总提示词</small><strong>{{ stats.total }}</strong>
      </div>
    </article>
    <article data-test="stat-today">
      <span class="stat-icon amber">ϟ</span>
      <div>
        <small>今日复制次数</small><strong>{{ stats.todayCopies }}</strong>
      </div>
    </article>
    <article data-test="stat-favorites">
      <span class="stat-icon gold">☆</span>
      <div>
        <small>收藏</small><strong>{{ stats.favorites }}</strong>
      </div>
    </article>
    <article data-test="stat-pinned">
      <span class="stat-icon rose">⌖</span>
      <div>
        <small>置顶</small><strong>{{ stats.pinned }}/5</strong>
      </div>
    </article>
  </section>
</template>
