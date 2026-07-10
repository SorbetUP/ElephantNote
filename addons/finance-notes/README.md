# Finance Notes

Builds `Finance/Market Dashboard.md` and one note per successfully resolved symbol.

Default assets:

- AAPL
- MSFT
- NVDA
- CAC 40 (`^FCHI`)
- Bitcoin (`BTC-USD`)

The addon calculates the latest close and daily percentage change. Successful live quotes are cached in private addon storage. When a later request fails, the dashboard may use the last valid value and labels it explicitly as **Cached**.

Declared permissions:

- HTTPS access to `query1.finance.yahoo.com`;
- write access under `Finance/**`;
- private addon storage.

A programmatic command invocation may pass `{ symbols: [...] }` with up to ten symbols. The generated notes are sourced data, not financial advice.
