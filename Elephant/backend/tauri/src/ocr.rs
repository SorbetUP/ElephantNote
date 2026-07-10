use serde::{Deserialize, Serialize};
use std::process::Command;
use which::which;

#[derive(Serialize, Clone, Debug, Default)]
pub struct OcrStatus {
    pub available: bool,
    pub binary_path: Option<String>,
    pub desktop_only: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OcrResult {
    pub text: String,
    pub source: String,
}

pub struct OcrRuntime;

impl OcrRuntime {
    pub fn status() -> OcrStatus {
        let (path, available) = match which("tesseract") {
            Ok(found) => (Some(found.to_string_lossy().to_string()), true),
            Err(_) => (None, false),
        };
        OcrStatus {
            available,
            binary_path: path,
            desktop_only: cfg!(not(any(target_os = "android", target_os = "ios"))),
            error: if available {
                None
            } else {
                Some("tesseract binary not found".into())
            },
        }
    }

    pub fn run(image_path: &str) -> Result<OcrResult, String> {
        let output = Command::new("tesseract")
            .arg(image_path)
            .arg("stdout")
            .output()
            .map_err(|e| format!("tesseract spawn failed: {e}"))?;
        if output.status.success() {
            Ok(OcrResult {
                text: String::from_utf8_lossy(&output.stdout).to_string(),
                source: "tesseract".into(),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("tesseract failed: {stderr}"))
        }
    }
}

#[tauri::command]
pub fn tauri_ocr_status() -> OcrStatus {
    OcrRuntime::status()
}

#[tauri::command]
pub fn tauri_ocr_image(path: String) -> Result<OcrResult, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("OCR is desktop-only".into());
    }
    OcrRuntime::run(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_reports_desktop_only_flag_on_supported_targets() {
        let status = OcrRuntime::status();
        if cfg!(any(target_os = "android", target_os = "ios")) {
            assert!(!status.desktop_only);
        } else {
            assert!(status.desktop_only);
        }
    }

    #[test]
    fn status_shape_serializes_json() {
        let s = OcrStatus {
            available: true,
            binary_path: Some("/usr/bin/tesseract".into()),
            desktop_only: true,
            error: None,
        };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json.get("available").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(
            json.get("desktop_only").and_then(|v| v.as_bool()),
            Some(true)
        );
    }

    #[test]
    fn ocr_result_serializes_text_and_source() {
        let r = OcrResult {
            text: "hello".into(),
            source: "tesseract".into(),
        };
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(json.get("text").and_then(|v| v.as_str()), Some("hello"));
        assert_eq!(
            json.get("source").and_then(|v| v.as_str()),
            Some("tesseract")
        );
    }

    #[test]
    fn run_with_nonexistent_image_returns_error() {
        let result = OcrRuntime::run("/this/does/not/exist.jpg");
        assert!(result.is_err());
    }
}
