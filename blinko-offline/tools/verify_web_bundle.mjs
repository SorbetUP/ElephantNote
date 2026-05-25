// Usage: node tools/verify_web_bundle.mjs http://host:port

const base = process.argv[2];
if (!base) {
  console.error('Usage: node tools/verify_web_bundle.mjs http://host:port');
  process.exit(2);
}

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
};

const main = async () => {
  const html = await fetchText(`${base.replace(/\/+$/, '')}/`);
  const m = html.match(/\/assets\/(index-[^"']+\.js)/);
  if (!m) {
    throw new Error('Failed to locate main index bundle in HTML');
  }
  const bundle = m[1];
  const js = await fetchText(`${base.replace(/\/+$/, '')}/assets/${bundle}`);

  const checks = [
    { key: 'import-from-google-keep', desc: 'Google Keep import UI' },
    { key: 'import-from-google-keep-tip', desc: 'Google Keep import tip text' },
    { key: 'sync-mode-title', desc: 'Sync settings strings present (code may be present even if hidden in web)' },
  ];

  console.log(`bundle: ${bundle}`);
  for (const c of checks) {
    const ok = js.includes(c.key);
    console.log(`${ok ? 'OK ' : 'MISSING '} ${c.key} (${c.desc})`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
