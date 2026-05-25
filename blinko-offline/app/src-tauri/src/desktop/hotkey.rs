use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::Shortcut;

// Global state for managing shortcuts
static REGISTERED_SHORTCUTS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub quick_note: String,
    pub quick_ai: String,
    pub enabled: bool,
    pub ai_enabled: bool,
    pub system_tray_enabled: bool,
    pub window_behavior: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowConfig {
    pub width: f64,
    pub height: f64,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            quick_note: "Shift+Space".to_string(),
            quick_ai: "Alt+Space".to_string(),
            enabled: true,
            ai_enabled: true,
            system_tray_enabled: true,
            window_behavior: "show".to_string(),
        }
    }
}

impl Default for WindowConfig {
    fn default() -> Self {
        // Try to get screen size, fallback to fixed size if unavailable
        let (default_width, default_height) = get_default_window_size();

        Self {
            width: default_width,
            height: default_height,
            x: None, // Always center, don't save position
            y: None, // Always center, don't save position
            maximized: false,
        }
    }
}

// Helper function to get default window size (full HD resolution)
fn get_default_window_size() -> (f64, f64) {
    // Use full HD as default window size
    (1920.0, 1080.0)
}

#[tauri::command]
pub fn register_hotkey(app: AppHandle, shortcut: String, command: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

        // Parse the shortcut string
        let parsed_shortcut = shortcut
            .parse::<Shortcut>()
            .map_err(|e| format!("Invalid shortcut format: {}", e))?;

        // First try to unregister if it already exists (prevent duplicate registration)
        let _ = app.global_shortcut().unregister(parsed_shortcut);

        // Register with Tauri global shortcut system
        app.global_shortcut()
            .register(parsed_shortcut)
            .map_err(|e| format!("Failed to register shortcut: {}", e))?;

        // Store command for the shortcut handler (normalize to lowercase)
        let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
        shortcuts.insert(shortcut.to_lowercase(), command.clone());

        println!(
            "Successfully registered shortcut: {} for command: {}",
            shortcut, command
        );
        Ok(())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Global shortcuts not supported on mobile".to_string())
    }
}

#[tauri::command]
pub fn unregister_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

        // Parse the shortcut string
        let parsed_shortcut = shortcut
            .parse::<Shortcut>()
            .map_err(|e| format!("Invalid shortcut format: {}", e))?;

        // Unregister from Tauri global shortcut system
        app.global_shortcut()
            .unregister(parsed_shortcut)
            .map_err(|e| format!("Failed to unregister shortcut: {}", e))?;

        // Remove from local storage (normalize to lowercase)
        let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
        shortcuts.remove(&shortcut.to_lowercase());

        println!("Successfully unregistered shortcut: {}", shortcut);
        Ok(())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Global shortcuts not supported on mobile".to_string())
    }
}

#[tauri::command]
pub fn get_registered_shortcuts() -> HashMap<String, String> {
    REGISTERED_SHORTCUTS.lock().unwrap().clone()
}

pub fn register_shortcut_command(shortcut: String, command: String) {
    let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
    shortcuts.insert(shortcut.to_lowercase(), command);
}

#[allow(dead_code)]
pub fn setup_default_shortcuts(app_handle: &AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;

        let default_config = HotkeyConfig::default();

        // Register default quick note shortcut
        if let Ok(parsed_shortcut) = default_config.quick_note.parse::<Shortcut>() {
            if let Err(e) = app_handle.global_shortcut().register(parsed_shortcut) {
                eprintln!("Failed to register default quicknote hotkey: {}", e);
            } else {
                // Store the registered shortcut (normalize to lowercase)
                let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
                shortcuts.insert(
                    default_config.quick_note.to_lowercase(),
                    "quicknote".to_string(),
                );
                println!("Registered default shortcut: {}", default_config.quick_note);
            }
        }

        // Register default quick AI shortcut
        if let Ok(parsed_shortcut) = default_config.quick_ai.parse::<Shortcut>() {
            if let Err(e) = app_handle.global_shortcut().register(parsed_shortcut) {
                eprintln!("Failed to register default quickai hotkey: {}", e);
            } else {
                // Store the registered shortcut (normalize to lowercase)
                let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
                shortcuts.insert(
                    default_config.quick_ai.to_lowercase(),
                    "quickai".to_string(),
                );
                println!(
                    "Registered default AI shortcut: {}",
                    default_config.quick_ai
                );
            }
        }
    }

    Ok(())
}
