const config = {
  workers: 1,
  webServer: {
    command: 'pnpm tauri:web:dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 120000
  },
  use: {
    baseURL: 'http://127.0.0.1:1420',
    headless: true,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  }
}

module.exports = config
