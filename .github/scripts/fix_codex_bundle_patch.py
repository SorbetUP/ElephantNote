from pathlib import Path

root = Path(__file__).resolve().parents[2]

cargo_path = root / 'Elephant/backend/tauri/Cargo.toml'
cargo = cargo_path.read_text()
cargo = cargo.replace(
    'reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream"] }',
    'reqwest = { version = "0.12", default-features = false, features = ["json", "blocking", "rustls-tls", "stream"] }',
)
cargo_path.write_text(cargo)

lib_path = root / 'Elephant/backend/tauri/src/lib_min.rs'
lib = lib_path.read_text()
lib = lib.replace(
    '  #[test]\n  #[test]\n  fn platform_info_contains_target_flags()',
    '  #[test]\n  fn platform_info_contains_target_flags()',
)
lib_path.write_text(lib)
