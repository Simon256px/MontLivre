mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            store::library_read,
            store::library_write,
            store::book_import,
            store::book_bytes,
            store::book_delete,
            store::cover_write,
            store::cover_bytes,
            store::cover_delete,
        ])
        .run(tauri::generate_context!())
        .expect("MontLivre n'a pas pu démarrer");
}
