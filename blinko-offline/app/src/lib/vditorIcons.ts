export function ensureVditorIconsInjected(svgSprite: string) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vditor-icons-svg')) return;
  if (!svgSprite) return;

  try {
    document.body.insertAdjacentHTML('afterbegin', svgSprite);

    // Vditor tries to synchronously fetch `/dist/js/icons/{ant|material}.js` via XHR and inject it as a
    // <script id="vditorIconScript">. That is fragile on mobile local-first during early boot.
    // We inject an empty marker script with that id so Vditor skips the request.
    if (!document.getElementById('vditorIconScript')) {
      const marker = document.createElement('script');
      marker.id = 'vditorIconScript';
      marker.type = 'text/javascript';
      marker.text = '/* icons injected via inline SVG sprite */';
      document.head.appendChild(marker);
    }
  } catch (error) {
    console.error('[Client] Failed to inject Vditor icon sprite:', error);
  }
}
