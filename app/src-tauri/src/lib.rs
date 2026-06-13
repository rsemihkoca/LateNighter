use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

// ---- Custom filesystem commands -----------------------------------------
// These run in the Rust core with full OS permissions, so a user-picked
// folder (returned by the dialog plugin) can be read/written directly —
// no fs-plugin path-scope wrangling. The frontend Tauri storage backend
// invokes these.

fn json_path(dir: &str, id: &str) -> PathBuf {
    Path::new(dir).join(format!("{id}.json"))
}

/// List project ids (json file stems) in a directory.
#[tauri::command]
fn list_projects(dir: String) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                ids.push(stem.to_string());
            }
        }
    }
    ids.sort();
    Ok(ids)
}

/// Read a project's raw JSON text.
#[tauri::command]
fn read_project(dir: String, id: String) -> Result<String, String> {
    fs::read_to_string(json_path(&dir, &id)).map_err(|e| e.to_string())
}

/// Write a project's JSON text (pretty-printed by the caller).
#[tauri::command]
fn write_project(dir: String, id: String, contents: String) -> Result<(), String> {
    fs::write(json_path(&dir, &id), contents).map_err(|e| e.to_string())
}

/// Last-modified time in milliseconds (0 if missing) — for external-change polling.
#[tauri::command]
fn project_revision(dir: String, id: String) -> Result<u64, String> {
    let path = json_path(&dir, &id);
    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(_) => return Ok(0),
    };
    let modified = meta.modified().map_err(|e| e.to_string())?;
    let millis = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    Ok(millis)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_projects,
            read_project,
            write_project,
            project_revision
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
