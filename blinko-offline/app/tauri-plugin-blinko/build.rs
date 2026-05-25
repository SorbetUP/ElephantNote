const COMMANDS: &[&str] = &[
    "setcolor",
    "open_app_settings",
    "present_share_sheet",
    "get_pending_share_payload",
    "clear_pending_share_payload",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
