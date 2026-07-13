use std::{
  env,
  fs,
  io::{Read, Write},
  path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

type R<T> = Result<T, String>;

fn collect_files(root: &Path, current: &Path, output: &mut Vec<PathBuf>) -> R<()> {
  let mut entries = fs::read_dir(current)
    .map_err(|error| format!("Failed to read {}: {error}", current.display()))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?;
  entries.sort_by_key(|entry| entry.file_name());

  for entry in entries {
    let path = entry.path();
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
      return Err(format!("Symbolic links are not allowed in addon packages: {}", path.display()));
    }
    if metadata.is_dir() {
      collect_files(root, &path, output)?;
    } else if metadata.is_file() {
      let relative = path
        .strip_prefix(root)
        .map_err(|error| error.to_string())?
        .to_path_buf();
      output.push(relative);
    }
  }
  Ok(())
}

fn package(source: &Path, output: &Path) -> R<(u64, String)> {
  if !source.is_dir() {
    return Err(format!("Addon staging directory does not exist: {}", source.display()));
  }
  if !source.join("manifest.json").is_file() || !source.join("main.js").is_file() {
    return Err("Addon staging directory must contain manifest.json and main.js".to_string());
  }
  if let Some(parent) = output.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  let mut files = Vec::new();
  collect_files(source, source, &mut files)?;
  files.sort();

  let file = fs::File::create(output).map_err(|error| error.to_string())?;
  let mut archive = ZipWriter::new(file);
  let options = SimpleFileOptions::default()
    .compression_method(CompressionMethod::Deflated)
    .unix_permissions(0o644)
    .last_modified_time(zip::DateTime::default());

  for relative in files {
    let name = relative.to_string_lossy().replace('\\', "/");
    let path = source.join(&relative);
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let file_options = if name.starts_with("native/") {
      options.unix_permissions(0o755)
    } else {
      options
    };
    archive.start_file(name, file_options).map_err(|error| error.to_string())?;
    let mut input = fs::File::open(&path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    input.read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    archive.write_all(&bytes).map_err(|error| error.to_string())?;
  }
  archive.finish().map_err(|error| error.to_string())?;

  let bytes = fs::read(output).map_err(|error| error.to_string())?;
  Ok((bytes.len() as u64, blake3::hash(&bytes).to_hex().to_string()))
}

fn main() {
  let args = env::args().skip(1).collect::<Vec<_>>();
  if args.len() != 2 {
    eprintln!("usage: elephant-enaddon-packager <staging-dir> <output.enaddon>");
    std::process::exit(2);
  }

  let source = PathBuf::from(&args[0]);
  let output = PathBuf::from(&args[1]);
  match package(&source, &output) {
    Ok((bytes, blake3)) => {
      println!(
        "{}",
        serde_json::json!({
          "path": output,
          "bytes": bytes,
          "blake3": blake3
        })
      );
    }
    Err(error) => {
      eprintln!("{error}");
      std::process::exit(1);
    }
  }
}
