#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // the folder picker on desktop (Android uses the system picker inside the vault plugin)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_vault::init())
        .run(tauri::generate_context!())
        .expect("error while running Supsidian");
}
