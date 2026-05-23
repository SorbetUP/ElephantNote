<template>
  <el-dialog
    v-model="store.isOpen"
    class="en-search-dialog"
    modal-class="en-search-overlay"
    :show-close="false"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    width="860px"
    @closed="handleClosed"
  >
    <div class="en-search-modal">
      <header class="en-search-header">
        <div class="en-search-commandbar">
          <Search class="en-search-command-icon" />
          <input
            ref="searchInput"
            v-model="query"
            class="en-search-input"
            type="search"
            placeholder="Search notes, paths, tags, or ideas..."
            autocomplete="off"
            spellcheck="false"
            @keydown.enter.prevent="searchNow"
            @keydown.esc.stop.prevent="store.close()"
          >
          <button
            class="en-search-icon-button"
            type="button"
            title="Close"
            @click="store.close()"
          >
            <X />
          </button>
        </div>

        <div
          v-if="showStatus"
          class="en-search-status-row"
        >
          <SearchStatusBadge :status="store.status" />
        </div>
      </header>

      <div
        v-if="store.error"
        class="en-search-error"
      >
        {{ store.error }}
      </div>

      <div
        v-if="store.busy"
        class="en-search-loading"
      >
        <ScanSearch class="en-search-state-icon" />
        <span>Searching locally...</span>
      </div>

      <div
        v-else-if="!store.results.length"
        class="en-search-empty"
      >
        <Search class="en-search-state-icon" />
        <span>No matching notes found.</span>
      </div>

      <div
        v-else
        class="en-search-results"
      >
        <SearchResultItem
          v-for="result in store.results"
          :key="result.uri"
          :result="result"
          @open="store.openResult"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { debounce } from 'underscore'
import {
  ScanSearch,
  Search,
  X
} from '@lucide/vue'
import { useSearchStore } from '../stores/searchStore'
import SearchResultItem from './SearchResultItem.vue'
import SearchStatusBadge from './SearchStatusBadge.vue'

const store = useSearchStore()
const searchInput = ref(null)
let pollTimer = null

const query = computed({
  get: () => store.query,
  set: (value) => store.setQuery(value)
})

const showStatus = computed(() => {
  return !['ready', 'not_initialized'].includes(store.status?.status || 'not_initialized')
})

const focusInput = async () => {
  await nextTick()
  searchInput.value?.focus()
  searchInput.value?.select()
}

const searchNow = () => {
  store.search()
}

const debouncedSearch = debounce(() => {
  store.search()
}, 300)

watch(
  () => store.query,
  (value, oldValue) => {
    if (value === oldValue) return
    if (!store.isOpen) return
    debouncedSearch()
  }
)

watch(
  () => store.mode,
  (value, oldValue) => {
    if (value !== oldValue && store.isOpen) {
      store.search()
    }
  }
)

watch(
  () => store.isOpen,
  async (value) => {
    if (value) {
      await focusInput()
      store.refreshStatus()
      clearInterval(pollTimer)
      pollTimer = setInterval(() => {
        store.refreshStatus()
      }, 1500)
    } else {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
)

const handleClosed = () => {
  store.results = []
  store.error = ''
  store.busy = false
}

onMounted(() => {
  store.refreshStatus()
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
.en-search-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--en-text);
}

.en-search-header {
  display: grid;
  gap: 14px;
}

.en-search-commandbar {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 76px;
  gap: 12px;
  padding: 0 14px 0 24px;
  border: 1px solid color-mix(in srgb, var(--en-border-strong) 78%, transparent);
  border-radius: 24px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--en-soft) 78%, var(--en-surface)), var(--en-surface));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 9%, transparent),
    0 18px 42px rgba(15, 23, 42, 0.1);
}

.en-shell.en-theme-dark .en-search-commandbar {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--en-soft-strong) 78%, #252832), var(--en-soft));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 20px 54px rgba(0, 0, 0, 0.36);
}

.en-search-command-icon {
  width: 28px;
  height: 28px;
  color: var(--en-muted);
}

.en-search-input {
  min-width: 0;
  height: 74px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--en-text);
  font: inherit;
  font-size: 23px;
  font-weight: 750;
  outline: none;
}

.en-search-input::placeholder {
  color: color-mix(in srgb, var(--en-muted) 82%, transparent);
}

.en-search-icon-button {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--en-muted);
  cursor: pointer;
}

.en-search-icon-button svg {
  width: 22px;
  height: 22px;
}

.en-search-icon-button:hover {
  background: var(--en-soft-strong);
  color: var(--en-text);
}

.en-search-status-row {
  display: flex;
  justify-content: flex-start;
}

.en-search-error {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #ef4444 12%, var(--en-surface));
  color: #c2410c;
}

.en-shell.en-theme-dark .en-search-error {
  color: #ffb4b4;
}

.en-search-loading,
.en-search-empty {
  min-height: 168px;
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 22px;
  color: var(--en-muted);
  text-align: center;
}

.en-search-state-icon {
  width: 26px;
  height: 26px;
  color: var(--en-primary);
}

.en-search-results {
  display: grid;
  gap: 10px;
  max-height: min(56vh, 520px);
  overflow: auto;
  padding-right: 2px;
}

:global(.en-search-dialog .el-dialog) {
  border-radius: 26px;
  overflow: hidden;
  background: color-mix(in srgb, var(--en-surface) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--en-border-strong) 46%, transparent);
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(26px) saturate(155%);
  -webkit-backdrop-filter: blur(26px) saturate(155%);
}

:global(.en-shell.en-theme-dark .en-search-dialog .el-dialog) {
  background: color-mix(in srgb, var(--en-surface) 14%, transparent);
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.42);
}

:global(.en-search-overlay) {
  background: rgba(8, 12, 18, 0.24);
  backdrop-filter: blur(18px) saturate(145%);
  -webkit-backdrop-filter: blur(18px) saturate(145%);
}

:global(.en-shell.en-theme-dark .en-search-overlay) {
  background: rgba(3, 6, 12, 0.34);
}

:global(.en-search-dialog .el-dialog__header),
:global(.en-search-dialog .el-dialog__body) {
  padding: 0;
}

:global(.en-search-dialog .el-dialog__body) {
  padding: 20px;
}

@media (max-width: 760px) {
  .en-search-commandbar {
    grid-template-columns: 26px minmax(0, 1fr) auto;
    min-height: 64px;
    padding-left: 18px;
    border-radius: 18px;
  }

  .en-search-input {
    height: 62px;
    font-size: 17px;
  }

  .en-search-commandbar .en-search-icon-button:last-child {
    display: none;
  }

}
</style>
