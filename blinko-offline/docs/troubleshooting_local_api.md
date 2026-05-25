# Troubleshooting local API

## Local API does not respond
- Verify the app data directory exists and `local_config.json` has `local_api.enabled = true`.
- Confirm the API base URL returned by `get_local_api_base_url`.
- Check logs in app data `logs/` for startup errors.

## Auth errors (401)
- Ensure UI is using `Authorization: Bearer <local_token>`.
- Re-run local login (`/api/auth/login`) to refresh the token in storage.

## Attachments not rendering
- Confirm the attachment path uses `/api/file/<id>`.
- Check `attachments/` directory permissions and file existence.

## Sync issues
- Verify remote URL/token in `/sync/settings`.
- Inspect `outbox` and `sync_state` tables for pending ops and cursors.
