fn assert_mobile_compatibility(manifest_bytes: &[u8]) -> R<()> {
  let manifest: Value = serde_json::from_slice(manifest_bytes)
    .map_err(|error| format!("Invalid official addon manifest: {error}"))?;
  let native = manifest.pointer("/permissions/native").and_then(Value::as_bool).unwrap_or(false);
  if !native {
    return Ok(());
  }
  let platform = if cfg!(target_os = "android") {
    "android"
  } else if cfg!(target_os = "ios") {
    "ios"
  } else {
    return Ok(());
  };
  if manifest
    .pointer(&format!("/native/mobile/{platform}/supported"))
    .and_then(Value::as_bool)
    != Some(true)
  {
    let reason = manifest
      .pointer(&format!("/native/mobile/{platform}/reason"))
      .and_then(Value::as_str)
      .unwrap_or("This addon has no native implementation for this mobile platform.");
    return Err(reason.to_string());
  }
  Ok(())
}

fn package_prefix(item: &CatalogAddon) -> R<String> {
  let manifest = safe_official_path(&item.manifest_path)?;
  Path::new(&manifest)
    .parent()
    .map(|path| path.to_string_lossy().replace('\\', "/"))
    .ok_or_else(|| format!("Official addon has no package directory: {}", item.id))
}

fn static_relative_imports(source: &str) -> Vec<String> {
  let mut imports = Vec::new();
  let lines = source.lines().collect::<Vec<_>>();
  let mut index = 0;
  while index < lines.len() {
    let trimmed = lines[index].trim();
    if !trimmed.starts_with("import ") && !trimmed.starts_with("export ") {
      index += 1;
      continue;
    }

    let mut statement = trimmed.to_string();
    let mut next_index = index + 1;
    while !statement.contains(['\'', '"']) && next_index < lines.len() {
      statement.push(' ');
      statement.push_str(lines[next_index].trim());
      next_index += 1;
    }

    for quote in ['\'', '"'] {
      let Some(start) = statement.find(quote) else { continue };
      let rest = &statement[start + 1..];
      let Some(end) = rest.find(quote) else { continue };
      let candidate = &rest[..end];
      if candidate.starts_with('.') {
        imports.push(candidate.to_string());
      }
    }
    index = next_index;
  }
  imports
}

fn resolve_remote_module(package_prefix: &str, current: &str, specifier: &str) -> R<String> {
  let current_parent = Path::new(current).parent().unwrap_or_else(|| Path::new(""));
  let mut relative = current_parent.join(specifier).to_string_lossy().replace('\\', "/");
  if Path::new(&relative).extension().is_none() {
    relative.push_str(".js");
  }
  let full = format!("{package_prefix}/{relative}");
  let normalized = safe_official_path(&full)?;
  if !normalized.starts_with(&format!("{package_prefix}/")) {
    return Err(format!("Official addon module escaped its package: {specifier}"));
  }
  Ok(normalized)
}

fn current_sidecar_path(manifest: &Value) -> Option<String> {
  manifest
    .pointer(&format!("/native/sidecars/{}", platform_key()))
    .and_then(Value::as_str)
    .map(str::to_string)
}

fn requires_desktop_service(manifest: &Value) -> bool {
  !matches!(std::env::consts::OS, "android" | "ios")
    && manifest.pointer("/permissions/native").and_then(Value::as_bool) == Some(true)
    && manifest.pointer("/native/runner").and_then(Value::as_str) == Some("service")
}

fn required_sidecar_path(item: &CatalogAddon, manifest: &Value) -> R<Option<String>> {
  if !requires_desktop_service(manifest) {
    return Ok(None);
  }
  current_sidecar_path(manifest).map(Some).ok_or_else(|| {
    format!(
      "Official addon {} has no native service executable for {}",
      item.id,
      platform_key()
    )
  })
}

fn require_declared_sidecar(
  item: &CatalogAddon,
  manifest: &Value,
  files: &BTreeMap<String, Vec<u8>>,
) -> R<()> {
  let Some(sidecar) = required_sidecar_path(item, manifest)? else {
    return Ok(());
  };
  if !files.contains_key(&sidecar) {
    return Err(format!(
      "Official addon package is incomplete for {} on {}: missing native executable {sidecar}",
      item.id,
      platform_key()
    ));
  }
  Ok(())
}
