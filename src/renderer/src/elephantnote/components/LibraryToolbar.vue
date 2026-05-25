<template>
  <div class="en-library-toolbar">
    <div class="en-library-toolbar-left">
      <div class="en-library-title" />
    </div>

    <div class="en-library-actions">
      <select
        v-model="store.sort"
        class="en-select"
      >
        <option value="updated-newest">
          Sort: Updated newest
        </option>
        <option value="updated-oldest">
          Sort: Updated oldest
        </option>
        <option value="title">
          Sort: Title A-Z
        </option>
      </select>
      <div class="en-view-toggle">
        <button
          type="button"
          :class="{ active: store.viewMode === 'grid' }"
          title="Grid"
          @click="store.viewMode = 'grid'"
        >
          <Grid3x3 class="en-icon" />
        </button>
        <button
          type="button"
          :class="{ active: store.viewMode === 'list' }"
          title="List"
          @click="store.viewMode = 'list'"
        >
          <List class="en-icon" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Grid3x3, List } from '@lucide/vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
</script>

<style scoped>
.en-library-toolbar {
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  padding: 0 28px;
}

.en-library-toolbar-left {
  flex: 1;
}

.en-library-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.en-select,
.en-view-toggle {
  height: 44px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}

.en-select {
  min-width: 220px;
  padding: 0 14px;
}

.en-view-toggle {
  display: inline-flex;
  overflow: hidden;
}

.en-view-toggle button {
  width: 44px;
  border: 0;
  color: var(--en-muted);
  background: transparent;
}

.en-view-toggle button.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-icon {
  width: 20px;
  height: 20px;
}
</style>
