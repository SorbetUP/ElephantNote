<script setup>
import './platform/shellKeyboardShortcuts.js'
import './platform/automationAcceptancePhysicalSurface.js'
</script>

<template>
  <div id="app">
    <!-- This router-view will render either App component (/editor) or Preference component (/preference) -->
    <router-view />
  </div>
</template>
