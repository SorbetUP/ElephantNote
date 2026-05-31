<template>
  <main class="en-empty">
    <section class="en-empty-card">
      <div class="en-empty-logo">
        <img
          class="en-logo-image"
          :src="logoUrl"
          alt="ElephantNote"
          @error="$event.target.classList.add('is-missing')"
        >
        <span class="en-logo-fallback">EN</span>
      </div>
      <h1>Choose your first vault</h1>
      <p>Select a folder where ElephantNote will store your notes.</p>
      <button
        class="en-primary-button"
        type="button"
        @click="$emit('choose')"
      >
        Choose vault
      </button>
    </section>
  </main>
</template>

<script setup>
import logoUrl from '../../assets/ElephantLogo.png'

defineEmits(['choose'])
</script>

<style scoped>
.en-empty {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--en-bg, #0f141d);
  color: var(--en-text, #eef3fb);
}

.en-empty-card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.en-empty-logo {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
}

.en-logo-image {
  width: 96px;
  height: 96px;
  object-fit: contain;
  display: block;
}

.en-logo-image.is-missing {
  display: none;
}

.en-logo-fallback {
  display: none;
  font-size: 28px;
  font-weight: 800;
}

.en-logo-image.is-missing + .en-logo-fallback {
  display: block;
}

.en-empty-card h1,
.en-empty-card p {
  margin: 0;
}

.en-empty-card h1 {
  font-size: 28px;
  line-height: 1.2;
}

.en-empty-card p {
  color: var(--en-muted, #98a3b6);
  font-size: 16px;
  line-height: 1.45;
}
</style>
