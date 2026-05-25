use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Blinko<R>> {
  Ok(Blinko(app.clone()))
}

/// Access to the blinko APIs.
pub struct Blinko<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Blinko<R> {
  pub fn setcolor(&self, _payload: SetColorRequest) -> crate::Result<()> {
    Ok(())
  }

  pub fn open_app_settings(&self) -> crate::Result<()> {
    // On desktop, this is a no-op or could open system settings
    // Different platforms would need different implementations
    Ok(())
  }

  pub fn present_share_sheet(&self, _payload: PresentShareSheetRequest) -> crate::Result<()> {
    // iOS-only UI; desktop can use native opener/download flows instead.
    Ok(())
  }

  pub fn get_pending_share_payload(&self) -> crate::Result<Option<String>> {
    Ok(None)
  }

  pub fn clear_pending_share_payload(&self) -> crate::Result<()> {
    Ok(())
  }
}
