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
import { useVaultStore } from '../../stores/vaultStore'

const store = useVaultStore()
</script>

<style scoped>
.en-library-toolbar {
  min-height: 112px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  padding: 0 34px;
}

.en-library-toolbar-left {
  flex: 1;
}

.en-library-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.en-select,
.en-view-toggle {
  height: 52px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-surface) 52%, transparent);
  font: inherit;
  font-size: 18px;
}

.en-select {
  min-width: 278px;
  padding: 0 18px;
}

.en-view-toggle {
  display: inline-flex;
  overflow: hidden;
}

.en-view-toggle button {
  width: 56px;
  border: 0;
  color: var(--en-muted);
  background: transparent;
}

.en-view-toggle button.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-icon {
  width: 22px;
  height: 22px;
}

@media (max-width: 760px), (pointer: coarse) {
  .en-library-toolbar {
    min-height: 64px;
    padding: 10px 12px 0;
    justify-content: stretch;
  }

  .en-library-toolbar-left {
    display: none;
  }

  .en-library-actions {
    width: 100%;
    gap: 10px;
  }

  .en-select {
    min-width: 0;
    flex: 1;
    height: 44px;
    border-radius: 14px;
    padding: 0 12px;
    font-size: 14px;
  }

  .en-view-toggle {
    height: 44px;
    border-radius: 14px;
    flex: 0 0 auto;
  }

  .en-view-toggle button {
    width: 46px;
  }

  .en-icon {
    width: 20px;
    height: 20px;
  }
}
</style>
