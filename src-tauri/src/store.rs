//! Tout ce qui touche au disque passe par ici.
//!
//! Le front n'a aucune permission `fs` : il ne connaît que des identifiants, et
//! c'est Rust qui les traduit en chemins sous le dossier de données de l'app.
//! Ça évite d'avoir à ouvrir un scope `fs` sur le disque de l'utilisateur juste
//! pour importer un livre, et ça garde les gros fichiers hors du tas JS.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

const LIBRARY: &str = "library.json";

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("dossier de données introuvable : {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("création de {} : {e}", dir.display()))?;
    Ok(dir)
}

fn sub_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("création de {} : {e}", dir.display()))?;
    Ok(dir)
}

/// Les identifiants viennent de `crypto.randomUUID()` côté front, mais ils
/// finissent en nom de fichier : on refuse tout ce qui n'est pas alphanumérique
/// plutôt que d'espérer que personne n'y glissera jamais `..`.
fn safe_id(id: &str) -> Result<&str, String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if valid {
        Ok(id)
    } else {
        Err(format!("identifiant invalide : {id}"))
    }
}

fn safe_ext(ext: &str) -> Result<String, String> {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    let valid = !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric());
    if valid {
        Ok(ext)
    } else {
        Err(format!("extension invalide : {ext}"))
    }
}

/// Écrit à côté puis renomme : une coupure de courant au mauvais moment ne doit
/// pas laisser une bibliothèque tronquée.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("écriture de {} : {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("remplacement de {} : {e}", path.display()))
}

#[tauri::command]
pub fn library_read(app: AppHandle) -> Result<String, String> {
    let path = data_dir(&app)?.join(LIBRARY);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        // Premier lancement : pas de fichier, pas d'erreur.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("lecture de {} : {e}", path.display())),
    }
}

#[tauri::command]
pub fn library_write(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&data_dir(&app)?.join(LIBRARY), json.as_bytes())
}

/// Copie le fichier choisi par l'utilisateur dans la bibliothèque et renvoie le
/// nom sous lequel il y est rangé. On copie plutôt que de garder le chemin
/// d'origine : un livre déplacé ou débranché ne doit pas disparaître.
#[tauri::command]
pub fn book_import(app: AppHandle, id: String, source: String) -> Result<String, String> {
    let id = safe_id(&id)?;
    let source = PathBuf::from(&source);
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| format!("fichier sans extension : {}", source.display()))?;
    let name = format!("{id}.{}", safe_ext(ext)?);
    fs::copy(&source, sub_dir(&app, "books")?.join(&name))
        .map_err(|e| format!("copie de {} : {e}", source.display()))?;
    Ok(name)
}

#[tauri::command]
pub fn book_bytes(app: AppHandle, name: String) -> Result<Response, String> {
    let path = book_path(&app, &name)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("lecture de {} : {e}", path.display()))
}

#[tauri::command]
pub fn book_delete(app: AppHandle, name: String) -> Result<(), String> {
    let path = book_path(&app, &name)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        // Déjà parti : le but est atteint.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("suppression de {} : {e}", path.display())),
    }
}

fn book_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let (id, ext) = name
        .rsplit_once('.')
        .ok_or_else(|| format!("nom de fichier invalide : {name}"))?;
    Ok(sub_dir(app, "books")?.join(format!("{}.{}", safe_id(id)?, safe_ext(ext)?)))
}

#[tauri::command]
pub fn cover_write(app: AppHandle, id: String, bytes: Vec<u8>) -> Result<(), String> {
    let name = format!("{}.png", safe_id(&id)?);
    write_atomic(&sub_dir(&app, "covers")?.join(name), &bytes)
}

#[tauri::command]
pub fn cover_bytes(app: AppHandle, id: String) -> Result<Response, String> {
    let name = format!("{}.png", safe_id(&id)?);
    let path = sub_dir(&app, "covers")?.join(name);
    match fs::read(&path) {
        Ok(bytes) => Ok(Response::new(bytes)),
        // Pas de couverture extraite : le front en dessinera une.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(e) => Err(format!("lecture de {} : {e}", path.display())),
    }
}

#[tauri::command]
pub fn cover_delete(app: AppHandle, id: String) -> Result<(), String> {
    let name = format!("{}.png", safe_id(&id)?);
    let path = sub_dir(&app, "covers")?.join(name);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("suppression de {} : {e}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::{safe_ext, safe_id};

    #[test]
    fn refuse_les_identifiants_qui_remontent_l_arborescence() {
        assert!(safe_id("../../windows/system32/drivers/etc/hosts").is_err());
        assert!(safe_id("a/b").is_err());
        assert!(safe_id("").is_err());
        assert!(safe_id("3f7a-9c21-4e08").is_ok());
    }

    #[test]
    fn normalise_les_extensions() {
        assert_eq!(safe_ext(".EPUB").unwrap(), "epub");
        assert_eq!(safe_ext("azw3").unwrap(), "azw3");
        assert!(safe_ext("../exe").is_err());
        assert!(safe_ext("").is_err());
    }
}
