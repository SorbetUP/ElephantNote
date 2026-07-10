#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error(transparent)]
  PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
  #[error("{0}")]
  Unsupported(String),
}

pub type Result<T> = std::result::Result<T, Error>;
