mod store;

use std::path::Path;
use std::sync::Mutex;

use tauri::Manager;

const BOOK_EXTENSIONS: [&str; 7] = ["epub", "mobi", "azw3", "azw", "fb2", "cbz", "pdf"];

/// Le fichier réclamé au démarrage (double-clic sur un .epub), en attente que
/// le front finisse de se charger et vienne le chercher.
#[derive(Default)]
struct PendingOpen(Mutex<Option<String>>);

/// Windows passe le fichier associé en argument de ligne de commande. On ignore
/// l'argv[0] et tout ce qui ne ressemble pas à un livre — un drapeau de debug
/// ne doit pas se retrouver interprété comme un chemin.
fn book_argument(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|arg| {
            Path::new(arg)
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| BOOK_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        })
        .cloned()
}

#[tauri::command]
fn take_pending_open(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().ok()?.take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Doit rester le premier plugin enregistré : sans lui, un second
    // double-clic ouvrirait une deuxième fenêtre au lieu de réutiliser celle
    // qui est déjà là.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        use tauri::Emitter;
        if let Some(path) = book_argument(&argv) {
            let _ = app.emit("montlivre://open-file", path);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = book_argument(&args) {
                if let Ok(mut pending) = app.state::<PendingOpen>().0.lock() {
                    *pending = Some(path);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open,
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

#[cfg(test)]
mod tests {
    use super::book_argument;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn retient_le_livre_et_ignore_le_reste() {
        assert_eq!(
            book_argument(&args(&["montlivre.exe", "--debug", r"C:\Livres\Le Horla.EPUB"])),
            Some(r"C:\Livres\Le Horla.EPUB".to_string())
        );
        assert_eq!(book_argument(&args(&["montlivre.exe"])), None);
        assert_eq!(book_argument(&args(&["montlivre.exe", "notes.txt"])), None);
        // argv[0] ressemble à un exécutable, jamais à un livre.
        assert_eq!(book_argument(&args(&["book.epub"])), None);
    }
}
