use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::BlinkoExt;

#[command]
pub(crate) async fn setcolor<R: Runtime>(
    app: AppHandle<R>,
    payload: SetColorRequest,
) -> Result<()> {
    app.blinko().setcolor(payload)
}

#[command]
pub(crate) async fn open_app_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<()> {
    app.blinko().open_app_settings()
}

#[command]
pub(crate) async fn present_share_sheet<R: Runtime>(
    app: AppHandle<R>,
    payload: PresentShareSheetRequest,
) -> Result<()> {
    app.blinko().present_share_sheet(payload)
}

#[command]
pub(crate) async fn get_pending_share_payload<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>> {
    app.blinko().get_pending_share_payload()
}

#[command]
pub(crate) async fn clear_pending_share_payload<R: Runtime>(
    app: AppHandle<R>,
) -> Result<()> {
    app.blinko().clear_pending_share_payload()
}
