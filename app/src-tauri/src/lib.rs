use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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

// ---- Folder-tree mirror -------------------------------------------------
// The canonical doc lives in <dir>/<id>.json. Alongside it we materialize a
// mirror folder <dir>/<id>/ that reflects the flow→screen→state hierarchy as
// real nested folders, one folder per node named "<slug>.<kind>" with a
// "<slug>.<kind>.md" inside carrying the node's frontmatter (id/status/…) and
// a free markdown body that is the user's editable content. The body is
// preserved across re-materialization — only the frontmatter is rewritten.

const NODE_SUFFIXES: [&str; 3] = [".flow", ".screen", ".state"];

/// "<slug>.flow" → Some("flow"); non-node dirs → None.
fn node_kind(name: &str) -> Option<&'static str> {
    for suffix in NODE_SUFFIXES {
        if name.ends_with(suffix) {
            return Some(&suffix[1..]);
        }
    }
    None
}

/// A desired node folder: relative "/"-joined path + the YAML frontmatter body
/// (between the --- fences) the frontend wants stored.
#[derive(Deserialize)]
struct FolderSpec {
    path: String,
    frontmatter: String,
}

/// A node folder read back from disk: relative path, kind, parsed frontmatter.
#[derive(Serialize)]
struct TreeEntry {
    path: String,
    kind: String,
    frontmatter: HashMap<String, String>,
}

fn mirror_root(dir: &str, id: &str) -> PathBuf {
    Path::new(dir).join(id)
}

/// Body of an `.md` after its frontmatter fence (or the whole text if none).
fn md_body(content: &str) -> String {
    let mut lines = content.lines();
    if lines.next() == Some("---") {
        let mut in_body = false;
        let mut body = String::new();
        for line in lines {
            if !in_body {
                if line == "---" {
                    in_body = true;
                }
                continue;
            }
            body.push_str(line);
            body.push('\n');
        }
        if in_body {
            return body;
        }
    }
    content.to_string()
}

/// Parse simple `key: value` frontmatter lines into a map.
fn parse_frontmatter(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut lines = content.lines();
    if lines.next() != Some("---") {
        return map;
    }
    for line in lines {
        if line == "---" {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            map.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    map
}

/// Recursively delete node folders not in `desired` and clean stray `.md`
/// files inside kept node folders. Non-node files/dirs are left untouched.
fn prune(folder: &Path, desired: &HashSet<PathBuf>) -> Result<(), String> {
    let entries = match fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if path.is_dir() {
            if node_kind(&name).is_none() {
                continue; // not one of our node folders — leave it alone
            }
            if desired.contains(&path) {
                prune(&path, desired)?; // keep, recurse to clean inside
            } else {
                fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
            }
        } else if name.ends_with(".md") {
            // Inside a kept node folder, keep only "<foldername>.md".
            let keep = folder
                .file_name()
                .and_then(|n| n.to_str())
                .map(|fname| name == format!("{fname}.md"))
                .unwrap_or(false);
            if !keep {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Reconcile the mirror folder to match `folders`: create missing node dirs,
/// (re)write each node's `.md` frontmatter (preserving any existing body), and
/// delete node dirs/`.md` files no longer present in the spec.
#[tauri::command]
fn materialize_tree(dir: String, id: String, folders: Vec<FolderSpec>) -> Result<(), String> {
    let root = mirror_root(&dir, &id);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let mut desired: HashSet<PathBuf> = HashSet::new();
    for spec in &folders {
        let abs = root.join(&spec.path);
        desired.insert(abs.clone());

        fs::create_dir_all(&abs).map_err(|e| e.to_string())?;
        let folder_name = abs
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("invalid folder name")?;
        let md_path = abs.join(format!("{folder_name}.md"));
        let body = fs::read_to_string(&md_path)
            .map(|c| md_body(&c))
            .unwrap_or_default();
        let contents = format!("---\n{}\n---\n{}", spec.frontmatter.trim_end(), body);
        fs::write(&md_path, contents).map_err(|e| e.to_string())?;
    }

    prune(&root, &desired)?;
    Ok(())
}

/// Recursively collect node folders under `folder` into `out`.
fn walk_tree(root: &Path, folder: &Path, out: &mut Vec<TreeEntry>) -> Result<(), String> {
    let entries = match fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let kind = match node_kind(&name) {
            Some(k) => k,
            None => continue,
        };
        let rel = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let md_path = path.join(format!("{name}.md"));
        let frontmatter = fs::read_to_string(&md_path)
            .map(|c| parse_frontmatter(&c))
            .unwrap_or_default();
        out.push(TreeEntry {
            path: rel,
            kind: kind.to_string(),
            frontmatter,
        });
        walk_tree(root, &path, out)?;
    }
    Ok(())
}

/// Read the mirror folder back into a flat, path-sorted list of node entries.
#[tauri::command]
fn read_tree(dir: String, id: String) -> Result<Vec<TreeEntry>, String> {
    let root = mirror_root(&dir, &id);
    let mut out = Vec::new();
    walk_tree(&root, &root, &mut out)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Max last-modified (ms) across the mirror tree — the external-change token
/// for the folder side, symmetric with `project_revision` for the JSON side.
fn max_mtime(folder: &Path, acc: &mut u64) {
    let entries = match fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
                    *acc = (*acc).max(d.as_millis() as u64);
                }
            }
        }
        if path.is_dir() {
            max_mtime(&path, acc);
        }
    }
}

#[tauri::command]
fn tree_revision(dir: String, id: String) -> Result<u64, String> {
    let root = mirror_root(&dir, &id);
    if !root.exists() {
        return Ok(0);
    }
    let mut acc = 0u64;
    max_mtime(&root, &mut acc);
    Ok(acc)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_projects,
            read_project,
            write_project,
            project_revision,
            materialize_tree,
            read_tree,
            tree_revision
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
