const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', '^FCHI', 'BTC-USD']

const cleanSymbol = (value) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9.^-]/g, '')

const lastFinite = (values = []) => [...values].reverse().find((value) => Number.isFinite(value))

const percentChange = (previous, current) => {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const formatNumber = (value, maximumFractionDigits = 2) => Number.isFinite(value)
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)
  : 'Unavailable'

const formatChange = (value) => Number.isFinite(value)
  ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  : 'Unavailable'

const fetchQuote = async (api, symbol) => {
  const response = await api.http.request({
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const payload = JSON.parse(response.body)
  const result = payload?.chart?.result?.[0]
  if (!result) throw new Error(payload?.chart?.error?.description || 'No quote returned')

  const meta = result.meta || {}
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
  const latestClose = lastFinite(closes)
  const previousClose = closes.length > 1 ? closes[closes.length - 2] : meta.chartPreviousClose
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || '',
    exchange: meta.exchangeName || 'Unknown',
    instrumentType: meta.instrumentType || 'Unknown',
    latestClose,
    previousClose,
    changePercent: percentChange(previousClose, latestClose),
    fetchedAt: new Date().toISOString(),
    stale: false,
    error: ''
  }
}

const symbolNote = (quote) => [
  '---',
  `title: ${JSON.stringify(quote.name || quote.symbol)}`,
  'type: "market-snapshot"',
  `symbol: ${JSON.stringify(quote.symbol)}`,
  `updatedAt: ${JSON.stringify(quote.fetchedAt)}`,
  `stale: ${quote.stale ? 'true' : 'false'}`,
  'tags: [finance, generated]',
  '---',
  '',
  `# ${quote.name || quote.symbol}`,
  '',
  `- **Symbol:** \`${quote.symbol}\``,
  `- **Latest close:** ${formatNumber(quote.latestClose)} ${quote.currency}`,
  `- **Daily change:** ${formatChange(quote.changePercent)}`,
  `- **Exchange:** ${quote.exchange}`,
  `- **Instrument:** ${quote.instrumentType}`,
  `- **Fetched:** ${quote.fetchedAt}`,
  `- **Data status:** ${quote.stale ? 'Cached fallback' : 'Live request'}`,
  quote.error ? `- **Latest request error:** ${quote.error}` : '',
  '',
  '## Source',
  '',
  `- Yahoo Finance chart API for \`${quote.symbol}\``,
  '- This note is generated data, not financial advice.',
  ''
].filter(Boolean).join('\n')

const dashboardMarkdown = (quotes, generatedAt) => {
  const live = quotes.filter((quote) => !quote.stale).length
  const cached = quotes.filter((quote) => quote.stale).length
  const lines = [
    '---',
    'title: "Market Dashboard"',
    'type: "market-dashboard"',
    `generatedAt: ${JSON.stringify(generatedAt)}`,
    'tags: [finance, dashboard, generated]',
    '---',
    '',
    '# Market Dashboard',
    '',
    `Generated: ${generatedAt}`,
    '',
    `- Live quotes: ${live}`,
    `- Cached fallbacks: ${cached}`,
    '',
    '| Asset | Last | Change | Currency | Status |',
    '| --- | ---: | ---: | --- | --- |'
  ]

  for (const quote of quotes) {
    lines.push(`| [[Finance/${quote.symbol}|${quote.name || quote.symbol}]] | ${formatNumber(quote.latestClose)} | ${formatChange(quote.changePercent)} | ${quote.currency || '—'} | ${quote.stale ? 'Cached' : 'Live'} |`)
  }

  lines.push('', '## Notes', '', '- Prices may be delayed or incomplete.', '- This dashboard is generated data, not financial advice.', '')
  return lines.join('\n')
}

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.examples.finance-notes.refresh',
      title: 'Refresh market dashboard',
      description: 'Fetch several market snapshots, write one note per symbol and update Finance/Market Dashboard.md.',
      async run(input = {}) {
        const requested = Array.isArray(input?.symbols) ? input.symbols : DEFAULT_SYMBOLS
        const symbols = [...new Set(requested.map(cleanSymbol).filter(Boolean))].slice(0, 10)
        if (symbols.length === 0) throw new Error('At least one valid market symbol is required')

        const cachedQuotes = await api.storage.get('quotes') || {}
        const settled = await Promise.allSettled(symbols.map((symbol) => fetchQuote(api, symbol)))
        const quotes = settled.map((result, index) => {
          const symbol = symbols[index]
          if (result.status === 'fulfilled') return result.value
          const cached = cachedQuotes[symbol]
          if (cached) {
            return {
              ...cached,
              stale: true,
              error: result.reason?.message || String(result.reason || 'Request failed')
            }
          }
          return {
            symbol,
            name: symbol,
            currency: '',
            exchange: 'Unknown',
            instrumentType: 'Unknown',
            latestClose: null,
            previousClose: null,
            changePercent: null,
            fetchedAt: new Date().toISOString(),
            stale: true,
            error: result.reason?.message || String(result.reason || 'Request failed')
          }
        })

        const usableQuotes = quotes.filter((quote) => Number.isFinite(quote.latestClose))
        if (usableQuotes.length === 0) throw new Error('No live or cached market quote was available')

        await Promise.all(usableQuotes.map((quote) => api.notes.write(`Finance/${quote.symbol}.md`, symbolNote(quote))))
        const generatedAt = new Date().toISOString()
        const path = 'Finance/Market Dashboard.md'
        await api.notes.write(path, dashboardMarkdown(usableQuotes, generatedAt))

        const nextCache = { ...cachedQuotes }
        for (const quote of usableQuotes) {
          if (!quote.stale) nextCache[quote.symbol] = quote
        }
        await api.storage.set('quotes', nextCache)
        await api.storage.set('lastRun', {
          generatedAt,
          symbols,
          live: quotes.filter((quote) => !quote.stale).length,
          cached: quotes.filter((quote) => quote.stale && Number.isFinite(quote.latestClose)).length,
          failed: quotes.filter((quote) => !Number.isFinite(quote.latestClose)).map((quote) => ({ symbol: quote.symbol, error: quote.error }))
        })

        return {
          path,
          generatedAt,
          symbols: usableQuotes.map((quote) => quote.symbol),
          live: usableQuotes.filter((quote) => !quote.stale).length,
          cached: usableQuotes.filter((quote) => quote.stale).length
        }
      }
    })
  }
}
