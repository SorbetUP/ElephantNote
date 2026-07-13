use std::{env, ffi::OsStr, path::{Path, PathBuf}};

#[cfg(windows)]
fn executable_names(program: &OsStr) -> Vec<PathBuf> {
  let candidate = PathBuf::from(program);
  if candidate.extension().is_some() {
    return vec![candidate];
  }
  let extensions = env::var_os("PATHEXT")
    .map(|value| env::split_paths(&value).collect::<Vec<_>>())
    .unwrap_or_else(|| vec![PathBuf::from(".EXE"), PathBuf::from(".CMD"), PathBuf::from(".BAT")]);
  let mut names = vec![candidate.clone()];
  for extension in extensions {
    let extension = extension.to_string_lossy();
    let suffix = extension.trim();
    if suffix.is_empty() { continue; }
    names.push(PathBuf::from(format!("{}{}", candidate.to_string_lossy(), suffix)));
  }
  names
}

#[cfg(not(windows))]
fn executable_names(program: &OsStr) -> Vec<PathBuf> {
  vec![PathBuf::from(program)]
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
  use std::os::unix::fs::PermissionsExt;
  path.is_file()
    && path.metadata().map(|metadata| metadata.permissions().mode() & 0o111 != 0).unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
  path.is_file()
}

pub fn which<P: AsRef<OsStr>>(program: P) -> Result<PathBuf, String> {
  let program = program.as_ref();
  if program.is_empty() {
    return Err("Executable name is empty".to_string());
  }

  let direct = PathBuf::from(program);
  if direct.components().count() > 1 || direct.is_absolute() {
    for candidate in executable_names(program) {
      if is_executable(&candidate) {
        return candidate.canonicalize().or(Ok(candidate)).map_err(|error: std::io::Error| error.to_string());
      }
    }
    return Err(format!("Executable not found: {}", direct.display()));
  }

  let path = env::var_os("PATH").ok_or_else(|| "PATH is not available".to_string())?;
  for directory in env::split_paths(&path) {
    for name in executable_names(program) {
      let candidate = directory.join(name);
      if is_executable(&candidate) {
        return candidate.canonicalize().or(Ok(candidate)).map_err(|error: std::io::Error| error.to_string());
      }
    }
  }

  Err(format!("Executable not found: {}", direct.display()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn missing_program_is_reported() {
    assert!(which("elephant-definitely-missing-binary").is_err());
  }
}
