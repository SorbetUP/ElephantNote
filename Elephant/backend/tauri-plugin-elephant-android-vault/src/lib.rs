use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

mod desktop;
mod error;
mod models;
#[cfg(mobile)]
mod mobile;

pub use error::{Error, Result};
pub use models::*;

#[cfg(not(mobile))]
pub use desktop::ElephantAndroidVault;
#[cfg(mobile)]
pub use mobile::ElephantAndroidVault;

pub trait ElephantAndroidVaultExt<R: Runtime> {
  fn elephant_android_vault(&self) -> &ElephantAndroidVault<R>;
}

impl<R: Runtime, T: Manager<R>> ElephantAndroidVaultExt<R> for T {
  fn elephant_android_vault(&self) -> &ElephantAndroidVault<R> {
    self.state::<ElephantAndroidVault<R>>().inner()
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("elephant-android-vault")
    .setup(|app, api| {
      #[cfg(mobile)]
      let vault = mobile::init(app, api)?;
      #[cfg(not(mobile))]
      let vault = desktop::init(app, api)?;
      app.manage(vault);
      Ok(())
    })
    .build()
}
