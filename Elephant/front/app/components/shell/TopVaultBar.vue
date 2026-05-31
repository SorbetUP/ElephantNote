<template>
  <header
    class="en-topstrip"
    :class="{ 'en-topstrip-sidebar-hidden': !sidebarVisible }"
  >
    <navigation-bar
      class="en-topstrip-nav"
      :class="{ 'en-topstrip-nav-macos': isMac }"
    />
    <div class="en-topstrip-drag" />
  </header>
</template>

<script setup>
import NavigationBar from '../navigation/NavigationBar.vue'

defineProps({
  sidebarVisible: {
    type: Boolean,
    default: true
  }
})

const isMac = navigator.platform
  ? navigator.platform.startsWith('Mac')
  : /mac/i.test(navigator.userAgent)
</script>

<style scoped>
.en-topstrip {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  background:
    linear-gradient(
      to right,
      var(--en-sidebar-bg, var(--en-bg)) 0,
      var(--en-sidebar-bg, var(--en-bg)) calc(48px + var(--en-sidebar-width) + 1px),
      var(--en-bg) calc(48px + var(--en-sidebar-width) + 1px),
      var(--en-bg) 100%
    );
}

.en-topstrip-sidebar-hidden {
  background: var(--en-bg);
}

.en-topstrip::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(48px + var(--en-sidebar-width) - 1px);
  width: 2px;
  background: var(--en-border);
  z-index: 1;
}

.en-topstrip-sidebar-hidden::after {
  display: none;
}

.en-topstrip-nav {
  position: absolute;
  left: 56px;
  top: 4px;
  z-index: 3;
  width: 76px;
  height: 24px;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}

.en-topstrip-nav-macos {
  left: 84px;
}

.en-topstrip-drag {
  flex: 1;
  height: 100%;
  min-width: 0;
  position: relative;
  z-index: 0;
  margin-left: 180px;
  -webkit-app-region: drag;
}
</style>
