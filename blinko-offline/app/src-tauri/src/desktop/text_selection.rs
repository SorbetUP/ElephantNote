use tauri::{AppHandle, Emitter, Manager, Runtime};
// Position and Size are not used in this file anymore
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use arboard::Clipboard;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use get_selected_text::get_selected_text;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use mouse_position::mouse_position::Mouse;

#[cfg(target_os = "macos")]
use macos_accessibility_client::accessibility;

/// Check if the application has accessibility permissions on macOS
#[cfg(target_os = "macos")]
fn query_accessibility_permissions() -> bool {
    let trusted = accessibility::application_is_trusted_with_prompt();
    if trusted {
        println!("✅ Application has accessibility permissions");
    } else {
        println!("❌ Application does not have accessibility permissions");
        println!("ℹ️  Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility");
    }
    trusted
}

/// Check accessibility permissions on macOS, return true on other platforms
#[cfg(not(target_os = "macos"))]
fn query_accessibility_permissions() -> bool {
    true // Other platforms don't need special permissions
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSelectionEvent {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub modifier_pressed: bool,
    pub modifier: String,
}

// Global text selection monitoring state is now defined above with TextSelectionMonitor

// We'll pass the app handle through the monitoring thread instead of using a global

// Global text selection monitoring state
static TEXT_SELECTION_STATE: LazyLock<Mutex<TextSelectionMonitor>> =
    LazyLock::new(|| Mutex::new(TextSelectionMonitor::new()));

#[derive(Debug, Clone)]
pub struct TextSelectionMonitor {
    pub enabled: bool,
    pub trigger_modifier: String,
}

impl TextSelectionMonitor {
    pub fn new() -> Self {
        Self {
            enabled: false,
            trigger_modifier: "ctrl".to_string(),
        }
    }
}

#[tauri::command]
pub fn setup_text_selection_monitoring<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
    trigger_modifier: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    println!(
        "🔧 setup_text_selection_monitoring called: enabled={}, modifier={}",
        enabled, trigger_modifier
    );

    let mut monitor = TEXT_SELECTION_STATE.lock().unwrap();

    if enabled {
        // Update the monitor state
        monitor.enabled = true;
        monitor.trigger_modifier = trigger_modifier.clone();

        // Register the modifier key shortcut for text selection triggering
        // Using Backquote which matches the actual shortcut string format
        let shortcut_str = match trigger_modifier.as_str() {
            "ctrl" => "Control+Backquote",
            "shift" => "Shift+Backquote",
            "alt" => "Alt+Backquote",
            _ => "Control+Backquote",
        };

        println!("📝 Attempting to register shortcut: {}", shortcut_str);

        // Try to parse and register the shortcut, but don't fail if it's already in use
        match shortcut_str.parse::<Shortcut>() {
            Ok(parsed_shortcut) => {
                match app.global_shortcut().register(parsed_shortcut) {
                    Ok(_) => {
                        // Store the shortcut mapping for the global handler (normalize to lowercase)
                        crate::desktop::register_shortcut_command(
                            shortcut_str.to_lowercase(),
                            "text-selection".to_string(),
                        );

                        println!(
                            "✅ Text selection monitoring enabled with {} + Backquote",
                            trigger_modifier
                        );
                    }
                    Err(e) => {
                        println!(
                            "⚠️  Failed to register shortcut '{}': {}",
                            shortcut_str, e
                        );
                        println!("ℹ️  Text selection monitoring is enabled, but the hotkey could not be registered.");
                        println!("ℹ️  This is usually because the key combination is already in use by the system.");
                        println!("ℹ️  You can still use text selection features via the settings UI.");
                    }
                }
            }
            Err(e) => {
                println!("⚠️  Failed to parse shortcut '{}': {}", shortcut_str, e);
                println!("ℹ️  Text selection monitoring is enabled without hotkey.");
            }
        }
    } else {
        // Disable monitoring and unregister shortcuts
        monitor.enabled = false;

        // Unregister the modifier shortcut
        let shortcut_str = match monitor.trigger_modifier.as_str() {
            "ctrl" => "Control+Backquote",
            "shift" => "Shift+Backquote",
            "alt" => "Alt+Backquote",
            _ => "Control+Backquote",
        };

        if let Ok(parsed_shortcut) = shortcut_str.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(parsed_shortcut);
        }

        println!("❌ Text selection monitoring disabled");
    }

    Ok(())
}

// Helper function to get and validate mouse position
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_mouse_position<R: Runtime>(_app: &AppHandle<R>) -> (f64, f64) {
    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => {
            println!("📍 Raw mouse position: ({}, {})", x, y);
            let mut pos_x = x as f64;
            let mut pos_y = y as f64; // Position at cursor level

            // Windows-specific adjustments for DPI scaling
            #[cfg(target_os = "windows")]
            {
                println!("🪟 Windows detected - checking DPI scaling");
                // Get primary monitor to determine scaling factor
                if let Ok(monitors) = _app.available_monitors() {
                    if let Some(primary_monitor) = monitors.into_iter().next() {
                        let monitor_size = primary_monitor.size();
                        let monitor_scale = primary_monitor.scale_factor();

                        println!(
                            "📺 Primary monitor: size=({}x{}), scale={}",
                            monitor_size.width, monitor_size.height, monitor_scale
                        );

                        // If scale factor > 1, mouse position is likely in physical pixels
                        // Convert to logical pixels for Tauri
                        if monitor_scale > 1.0 {
                            pos_x /= monitor_scale;
                            pos_y /= monitor_scale;
                            println!("🔧 Converted to logical pixels: ({}, {})", pos_x, pos_y);
                        }

                        // Ensure window fits within monitor bounds
                        let window_width = crate::desktop::QUICKTOOL_WIDTH;
                        let window_height = crate::desktop::QUICKTOOL_HEIGHT;
                        let max_x =
                            (monitor_size.width as f64 / monitor_scale) - window_width - 10.0;
                        let max_y =
                            (monitor_size.height as f64 / monitor_scale) - window_height - 10.0;

                        pos_x = pos_x.max(10.0).min(max_x);
                        pos_y = pos_y.max(10.0).min(max_y);

                        println!(
                            "📐 Constrained position: ({}, {}) within bounds (0,0)-({}, {})",
                            pos_x, pos_y, max_x, max_y
                        );
                    } else {
                        println!("⚠️ No primary monitor found, using fallback positioning");
                        // Fallback: assume 1920x1080 monitor with scale 1.0
                        let max_x = 1920.0 - crate::desktop::QUICKTOOL_WIDTH - 10.0;
                        let max_y = 1080.0 - crate::desktop::QUICKTOOL_HEIGHT - 10.0;
                        pos_x = pos_x.max(10.0).min(max_x);
                        pos_y = pos_y.max(10.0).min(max_y);
                        println!("📐 Fallback constrained position: ({}, {})", pos_x, pos_y);
                    }
                } else {
                    println!("❌ Failed to get monitors, using basic bounds check");
                    pos_x = pos_x.max(10.0).min(1600.0); // Conservative bounds
                    pos_y = pos_y.max(10.0).min(900.0);
                }
            }

            // For non-Windows platforms, just ensure minimum bounds
            #[cfg(not(target_os = "windows"))]
            {
                pos_x = pos_x.max(10.0);
                pos_y = pos_y.max(10.0);
            }

            println!("🎯 Final window position: ({}, {})", pos_x, pos_y);
            (pos_x, pos_y)
        }
        Mouse::Error => {
            println!("❌ Failed to get mouse position, using fallback");
            (400.0, 300.0) // Better fallback position
        }
    }
}

// Fallback for mobile platforms
#[cfg(any(target_os = "android", target_os = "ios"))]
fn get_mouse_position<R: Runtime>(_app: &AppHandle<R>) -> (f64, f64) {
    println!("📱 Mobile platform - using fixed position");
    (400.0, 300.0) // Fixed position for mobile
}

// Helper function to show and position quicktool window
fn show_quicktool_window_at_position<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quicktool") {
        println!("✅ Found existing quicktool window, repositioning and showing");

        // Check current URL and navigate back to quicktool if needed
        if let Ok(url) = window.url() {
            let url_str = url.to_string();
            println!("🔗 Current quicktool window URL: {}", url_str);

            // If URL is not /quicktool, send navigation event to frontend
            if !url_str.contains("/quicktool") {
                println!("🔄 Quicktool window URL changed, sending navigation event to frontend");

                // Use JavaScript to navigate back to quicktool route
                let js_code = r#"
                    console.log('🔄 Current location:', window.location.href);
                    if (window.location.pathname !== '/quicktool') {
                        window.history.replaceState(null, '', '/quicktool');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                        console.log('✅ JavaScript navigation to /quicktool completed via history.replaceState');
                    } else {
                        console.log('✅ Already at /quicktool, no navigation needed');
                    }
                "#;

                if let Err(e) = window.eval(js_code) {
                    eprintln!(
                        "❌ Failed to navigate quicktool window back to /quicktool via JS: {}",
                        e
                    );
                } else {
                    println!("✅ Quicktool window navigated back to /quicktool via JavaScript");
                }

                // Add a small delay to ensure navigation completes
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }

        // Position window first
        let position = tauri::Position::Logical(tauri::LogicalPosition::new(x, y));
        window
            .set_position(position)
            .map_err(|e| format!("Failed to set window position: {}", e))?;

        // Small delay to ensure navigation completes
        std::thread::sleep(std::time::Duration::from_millis(50));

        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;

        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;

        // Debug: Check if window is actually visible
        match window.is_visible() {
            Ok(true) => println!("✅ Quicktool window is visible"),
            Ok(false) => println!("⚠️ Quicktool window is not visible after show()"),
            Err(e) => println!("❌ Failed to check window visibility: {}", e),
        }

        println!(
            "✅ Quicktool window repositioned and shown at ({}, {})",
            x, y
        );
        Ok(())
    } else {
        // Create new window if it doesn't exist
        crate::desktop::toggle_quicktool_window(app.clone())
            .map_err(|e| format!("Failed to create quicktool window: {}", e))?;
        println!("✅ New quicktool window created via toggle");
        Ok(())
    }
}

// Function to handle text selection when double modifier press is detected
pub fn handle_text_selection<R: Runtime>(app: &AppHandle<R>) {
    println!("🎯 Text selection shortcut triggered!");

    // Get and validate selected text
    let selected_text = match get_selected_text_directly() {
        Ok(text) if !text.is_empty() && text.trim().len() > 1 => {
            println!("📋 Got selected text: '{}' (length: {})", text, text.len());
            text
        }
        Ok(_) => {
            println!("⚠️ Selected text is empty or too short");
            return;
        }
        Err(e) => {
            eprintln!("❌ Failed to get selected text: {}", e);
            return;
        }
    };

    // Get mouse position for window placement
    let (x, y) = get_mouse_position(app);

    // Send the selected text to the quicktool window
    let text_event = TextSelectionEvent {
        text: selected_text.clone(),
        x: x as i32,
        y: y as i32,
        modifier_pressed: true,
        modifier: "shortcut".to_string(),
    };

    // Toggle quicktool window behavior
    if let Some(window) = app.get_webview_window("quicktool") {
        match window.is_visible() {
            Ok(true) => {
                // Window is visible, hide it
                println!("🔄 Quicktool window is visible, hiding it (toggle)");
                if let Err(e) = window.hide() {
                    eprintln!("❌ Failed to hide quicktool window: {}", e);
                }
                return;
            }
            Ok(false) => {
                // Window exists but is hidden, show it at mouse position
                println!("🔄 Quicktool window exists but hidden, showing at mouse position");
                if let Err(e) = show_quicktool_window_at_position(app, x, y) {
                    eprintln!("❌ Failed to show quicktool window: {}", e);
                    return;
                }
                // Send event after showing window
                send_text_selection_event(app, &text_event);
                return;
            }
            Err(_) => {
                // Can't determine visibility, recreate the window
                println!("⚠️ Can't determine window visibility, recreating");
            }
        }
    }

    // Window doesn't exist or visibility check failed, create and show
    println!("🔄 Quicktool window doesn't exist, creating and showing");
    if let Err(e) = show_quicktool_window_at_position(app, x, y) {
        eprintln!("❌ Failed to create/show quicktool window: {}", e);
        return;
    }

    // Send event after creating/showing window
    send_text_selection_event(app, &text_event);
}

// Function to send text selection event to quicktool window
fn send_text_selection_event<R: Runtime>(app: &AppHandle<R>, text_event: &TextSelectionEvent) {
    // Emit to the quicktool window specifically
    if let Some(quicktool_window) = app.get_webview_window("quicktool") {
        match quicktool_window.emit("text-selection-detected", text_event) {
            Ok(_) => println!("📡 Successfully emitted text selection event to quicktool window"),
            Err(e) => eprintln!(
                "❌ Failed to emit text selection event to quicktool window: {}",
                e
            ),
        }
    } else {
        eprintln!("❌ Quicktool window not found for event emission");
    }

    // Also emit globally as fallback
    match app.emit("text-selection-detected", text_event) {
        Ok(_) => println!("📡 Successfully emitted text selection event globally"),
        Err(e) => eprintln!("❌ Failed to emit text selection event globally: {}", e),
    }
}

// Function to check if text selection is enabled for a modifier
pub fn is_text_selection_enabled_for(modifier: &str) -> bool {
    println!(
        "🔍 Checking if text selection is enabled for modifier: {}",
        modifier
    );

    let monitor = TEXT_SELECTION_STATE.lock().unwrap();

    println!(
        "📊 Current monitor state: enabled={}, trigger_modifier={}",
        monitor.enabled, monitor.trigger_modifier
    );

    monitor.enabled && monitor.trigger_modifier == modifier
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    println!(
        "📋 copy_to_clipboard called with text: '{}' (length: {})",
        text,
        text.len()
    );

    // Use arboard for cross-platform clipboard access
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut clipboard =
            Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

        clipboard
            .set_text(&text)
            .map_err(|e| format!("Failed to set clipboard text: {}", e))?;

        println!("✅ Clipboard updated with text");

        // Clear clipboard after a delay
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            if let Ok(mut cb) = Clipboard::new() {
                if let Err(e) = cb.clear() {
                    eprintln!("Failed to clear clipboard: {}", e);
                } else {
                    println!("🗑️ Clipboard cleared");
                }
            }
        });
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // Mobile platforms don't need clipboard clearing
        println!("📱 Mobile platform - clipboard not modified");
    }

    Ok(())
}

#[tauri::command]
pub fn test_text_selection() -> Result<String, String> {
    println!("🧪 test_text_selection command called");
    Ok("Text selection system is working!".to_string())
}

#[tauri::command]
pub fn check_accessibility_permissions() -> Result<bool, String> {
    println!("🔐 Checking accessibility permissions...");
    let has_permissions = query_accessibility_permissions();
    Ok(has_permissions)
}

#[tauri::command]
pub fn show_quicktool<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    println!("🔧 Manually showing quicktool window");

    if let Some(window) = app.get_webview_window("quicktool") {
        // Position at center of screen
        let position = tauri::Position::Logical(tauri::LogicalPosition::new(400.0, 300.0));
        window
            .set_position(position)
            .map_err(|e| format!("Failed to set position: {}", e))?;

        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;

        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;

        println!("✅ Quicktool window shown at (400, 300)");
        Ok(())
    } else {
        // Create new window if it doesn't exist
        crate::desktop::toggle_quicktool_window(app)
            .map_err(|e| format!("Failed to create window: {}", e))?;
        println!("✅ New quicktool window created");
        Ok(())
    }
}

// Get selected text directly without using clipboard
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_selected_text_directly() -> Result<String, String> {
    println!("📋 Attempting to get selected text directly...");

    // Check accessibility permissions on macOS
    if !query_accessibility_permissions() {
        println!(
            "⚠️  Accessibility permissions not granted - text selection may not work properly"
        );
        println!("ℹ️  On macOS, please grant accessibility permissions in System Settings > Privacy & Security > Accessibility");
    }

    match get_selected_text() {
        Ok(text) => {
            if !text.trim().is_empty() {
                println!(
                    "✅ Selected text found: '{}' (length: {})",
                    text,
                    text.len()
                );
                Ok(text)
            } else {
                println!("❌ Selected text is empty");
                Err("No text selected".to_string())
            }
        }
        Err(e) => {
            println!("❌ Failed to get selected text: {}", e);
            println!("ℹ️  This might be because:");
            println!("   - The application doesn't support accessibility API");
            println!("   - On macOS: accessibility permissions not granted");
            println!("   - The fallback clipboard method will be used automatically");
            Err(format!("Failed to get selected text: {}", e))
        }
    }
}
