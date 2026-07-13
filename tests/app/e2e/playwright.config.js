const config = {
  testDir: __dirname,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 120000
  }
}

module.exports = config
