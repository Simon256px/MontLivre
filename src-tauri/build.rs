fn main() {
    // L'icône est embarquée en ressource Windows par tauri-build, ici, dans ce
    // script. Or cargo ne relance un build script que si l'une de ses entrées
    // déclarées a changé — et le dossier d'icônes n'en fait pas partie par
    // défaut. Sans cette ligne, changer de logo recompile l'application mais
    // lui laisse l'ancienne icône, sans le moindre avertissement.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    tauri_build::build()
}
