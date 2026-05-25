use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

use crate::desktop::{toggle_editor_window, toggle_quicknote_window};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn setup_system_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let icon_bytes = include_bytes!("../../icons/32x32.png");
    let image = Image::from_bytes(icon_bytes)?;

    // Create system tray menu
    let quick_note_item = MenuItem::with_id(app, "quicknote", "Quick Note", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let toggle_item = MenuItem::with_id(app, "toggle", "Show/Hide Window", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let tray_menu = MenuBuilder::new(app)
        .items(&[
            &quick_note_item,
            &separator1,
            &toggle_item,
            &settings_item,
            &separator2,
            &quit_item,
        ])
        .build()?;

    let tray_icon = TrayIconBuilder::with_id("blinko-tray")
        .icon(image)
        .menu(&tray_menu)
        .tooltip("Blinko - Quick Note")
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    // Left click to toggle window visibility
                    let app = tray.app_handle();
                    let _ = toggle_editor_window(app.clone());
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quicknote" => {
                let _ = toggle_quicknote_window(app.clone());
            }
            "toggle" => {
                let _ = toggle_editor_window(app.clone());
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("navigate-to-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(tray_icon)
}
