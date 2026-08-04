// Sur Windows, empêche la console de s'ouvrir derrière la fenêtre en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    montlivre_lib::run()
}
