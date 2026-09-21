use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_fs::FsExt;

/// US-1.1's environment facts, resolved on the Rust side so the frontend
/// never reads an environment variable directly (S7 plan §2.7, §5.1).
///
/// Windows: `%LOCALAPPDATA%` / `%APPDATA%`.
/// macOS:   only `home` is populated — `local_app_data` / `app_data` stay
///          `None` because `src/model/discovery-paths.ts::rootCandidates`
///          would otherwise also emit the four Windows-shaped candidates
///          under a `%LOCALAPPDATA%` / `%APPDATA%` label; its macOS branch
///          reads `home` alone (S7 plan §2.7).
/// Linux:   `$XDG_DATA_HOME` or `~/.local/share` for `local_app_data`;
///          `$XDG_CONFIG_HOME` or `~/.config` for `app_data` — otherwise
///          Linux has zero candidates and the empty state names nothing.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HostEnvironment {
    platform: String,
    local_app_data: Option<String>,
    app_data: Option<String>,
    home: Option<String>,
}

fn home_dir() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .filter(|value| !value.is_empty())
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn resolve_host_environment() -> HostEnvironment {
    let home = home_dir();

    if cfg!(target_os = "windows") {
        HostEnvironment {
            platform: "windows".to_string(),
            local_app_data: env_var("LOCALAPPDATA"),
            app_data: env_var("APPDATA"),
            home,
        }
    } else if cfg!(target_os = "macos") {
        HostEnvironment {
            platform: "macos".to_string(),
            local_app_data: None,
            app_data: None,
            home,
        }
    } else {
        let local_app_data =
            env_var("XDG_DATA_HOME").or_else(|| home.clone().map(|h| format!("{h}/.local/share")));
        let app_data =
            env_var("XDG_CONFIG_HOME").or_else(|| home.clone().map(|h| format!("{h}/.config")));
        HostEnvironment {
            platform: "linux".to_string(),
            local_app_data,
            app_data,
            home,
        }
    }
}

/// Mirrors `src/model/discovery-paths.ts::rootCandidates` path shapes
/// exactly — kept next to that function in a comment on both sides so a
/// change to one is obviously paired with a change to the other (S7 plan
/// §5.1). Used ONLY to grant the runtime fs scope in `setup()`; the
/// frontend derives the same candidates itself via the `host_environment`
/// command and the (unchanged, pure) TS function — this list never crosses
/// the IPC boundary.
fn auto_root_paths(env: &HostEnvironment) -> Vec<String> {
    let mut paths = Vec::new();

    if let Some(base) = &env.local_app_data {
        paths.push(format!("{base}/Claude-3p/local-agent-mode-sessions"));
        paths.push(format!("{base}/Claude-3p/claude-code-sessions"));
    }
    if let Some(base) = &env.app_data {
        paths.push(format!("{base}/Claude/local-agent-mode-sessions"));
        paths.push(format!("{base}/Claude/claude-code-sessions"));
    }
    if env.platform == "macos" {
        if let Some(home) = &env.home {
            paths.push(format!(
                "{home}/Library/Application Support/Claude/local-agent-mode-sessions"
            ));
        }
    }

    paths
}

#[tauri::command]
fn host_environment() -> HostEnvironment {
    resolve_host_environment()
}

/// Extends the fs READ scope with directories the USER chose (US-1.2), and
/// with folders restored from persistence on start-up (S7 plan §2.5). Never
/// used for the five automatic roots — those are granted in `setup()`,
/// where the frontend cannot influence them. Returns how many were granted;
/// a failing grant is swallowed (NFR-3) and never surfaces an OS message or
/// a path (NFR-6).
#[tauri::command]
fn grant_read_access(app: tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    let scope = app.fs_scope();
    let mut granted = 0usize;
    for path in paths {
        match scope.allow_directory(&path, true) {
            Ok(()) => {
                granted += 1;
                // US-1.6, S15 plan §5.2.1: every directory the frontend gets
                // READ access to is also a directory the export writer must
                // never touch.
                protect_root(&path);
            }
            Err(_) => {
                // NFR-6: no path, no OS message — a bounded class name only.
                eprintln!("[claude3pcost] grant_read_access: a grant failed (scope error)");
            }
        }
    }
    Ok(granted)
}

/// Paths the export writer must never touch: the automatic roots granted in
/// `setup()` plus every directory `grant_read_access` has granted (US-1.6,
/// S15 plan §5.2.1). Canonicalised on insert. Maintained in BOTH `setup()`
/// and `grant_read_access` — forgetting either half silently empties the
/// guarantee for that source of roots.
static PROTECTED_ROOTS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Canonicalises `path` and records it as protected, if it exists. A path
/// that does not (yet) exist on disk cannot be canonicalised and is simply
/// not recorded — it cannot be an export target either, since
/// `export_path_is_permitted` also requires the parent directory to
/// canonicalise (S15 plan §5.2.2 rule 2).
fn protect_root(path: &str) {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        if let Ok(mut roots) = PROTECTED_ROOTS.lock() {
            roots.push(canonical);
        }
    }
}

/// Bounded, content-free error classes (NFR-6): never a path, never an OS
/// message.
#[derive(Debug)]
enum RejectReason {
    NotJson,
    ParentNotFound,
    ProtectedRoot,
    TooLarge,
    Io,
}

impl std::fmt::Display for RejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            RejectReason::NotJson => "not-json",
            RejectReason::ParentNotFound => "parent-not-found",
            RejectReason::ProtectedRoot => "protected-root",
            RejectReason::TooLarge => "too-large",
            RejectReason::Io => "io",
        };
        write!(f, "{name}")
    }
}

/// Rules 1 and 2 (S15 plan §5.2.2): `.json` extension, case-insensitive, and
/// the parent directory must canonicalise (resolve first, then confine —
/// CLAUDE.md's symlink rule, never a string prefix test). Shared by both
/// commands; rule 3 (not under a protected root) is layered on top by
/// `export_path_is_permitted` for the WRITE path only — reading inside a
/// session root is already permitted (US-1.6 forbids writing, not reading).
fn check_json_path(path: &Path) -> Result<PathBuf, RejectReason> {
    let has_json_extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !has_json_extension {
        return Err(RejectReason::NotJson);
    }
    let parent = path.parent().ok_or(RejectReason::ParentNotFound)?;
    std::fs::canonicalize(parent).map_err(|_| RejectReason::ParentNotFound)
}

/// The full write-side predicate (S15 plan §5.2.2). Rejects unless the file
/// name ends in `.json`, the parent directory canonicalises, and the
/// canonicalised parent is neither equal to nor a descendant of any entry in
/// `PROTECTED_ROOTS` (themselves canonicalised).
fn export_path_is_permitted(path: &Path) -> Result<PathBuf, RejectReason> {
    let canonical_parent = check_json_path(path)?;

    let roots = PROTECTED_ROOTS.lock().map_err(|_| RejectReason::Io)?;
    for root in roots.iter() {
        if canonical_parent == *root || canonical_parent.starts_with(root) {
            return Err(RejectReason::ProtectedRoot);
        }
    }

    Ok(canonical_parent)
}

/// Rule 3 applied to a path that already exists on disk. Canonicalising the
/// PARENT is not sufficient on its own: the file NAME itself can be a
/// symlink into a protected root even when its directory sits outside one,
/// and `OpenOptions::open` follows it and would truncate whatever it points
/// at (US-1.6). Resolve the full path when it exists, and confine THAT.
/// A path that does not exist yet cannot be a symlink, so the parent check
/// governs on its own there — which is the ordinary "save a new file" case.
fn resolved_target_is_permitted(target: &Path) -> Result<(), RejectReason> {
    let Ok(canonical) = std::fs::canonicalize(target) else {
        return Ok(());
    };
    let roots = PROTECTED_ROOTS.lock().map_err(|_| RejectReason::Io)?;
    for root in roots.iter() {
        if canonical == *root || canonical.starts_with(root) {
            return Err(RejectReason::ProtectedRoot);
        }
    }
    Ok(())
}

const MAX_IMPORT_BYTES: u64 = 1024 * 1024; // 1 MiB (S15 plan §5.2.3)

/// US-4.2's JSON export (S15 plan §5.2.3). Opens with write + create +
/// truncate — NEVER append, NEVER create_dir_all. `contents` is always a
/// `String` from the app, never a path. Returns a bounded error class name,
/// never a path and never an OS message (NFR-6).
#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    let candidate = PathBuf::from(&path);
    let canonical_parent = export_path_is_permitted(&candidate).map_err(|reason| reason.to_string())?;
    let file_name = candidate
        .file_name()
        .ok_or_else(|| RejectReason::NotJson.to_string())?;
    let target = canonical_parent.join(file_name);
    resolved_target_is_permitted(&target).map_err(|reason| reason.to_string())?;

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&target)
        .map_err(|_| RejectReason::Io.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|_| RejectReason::Io.to_string())
}

/// US-4.2's JSON import (S15 plan §5.2.3). Applies rules 1 and 2 but not
/// rule 3 — reading inside a session root is already permitted; only writing
/// is forbidden. Caps the read at 1 MiB.
#[tauri::command]
fn read_import_file(path: String) -> Result<String, String> {
    let candidate = PathBuf::from(&path);
    let canonical_parent = check_json_path(&candidate).map_err(|reason| reason.to_string())?;
    let file_name = candidate
        .file_name()
        .ok_or_else(|| RejectReason::NotJson.to_string())?;
    let target = canonical_parent.join(file_name);

    let metadata = std::fs::metadata(&target).map_err(|_| RejectReason::Io.to_string())?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err(RejectReason::TooLarge.to_string());
    }

    std::fs::read_to_string(&target).map_err(|_| RejectReason::Io.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `PROTECTED_ROOTS` is a single process-wide static and `cargo test`
    /// runs tests on parallel threads by default; every test below mutates
    /// it, so each must serialise on this lock for its whole body (held via
    /// the returned guard until the test function returns) or two tests
    /// racing on the same static produce a spurious failure unrelated to the
    /// predicate itself.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "c3p-test-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn reset_protected_roots(roots: Vec<PathBuf>) {
        let mut guard = PROTECTED_ROOTS.lock().unwrap();
        *guard = roots;
    }

    #[test]
    fn export_path_is_permitted_rejects_a_path_inside_a_protected_root() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let root = temp_dir("protected-root");
        reset_protected_roots(vec![std::fs::canonicalize(&root).unwrap()]);

        let target = root.join("export.json");
        let result = export_path_is_permitted(&target);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "protected-root");

        reset_protected_roots(vec![]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn export_path_is_permitted_rejects_a_symlinked_parent_into_a_protected_root() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let root = temp_dir("protected-root-real");
        let outside = temp_dir("outside");
        let link = outside.join("into-protected");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&root, &link).unwrap();

        reset_protected_roots(vec![std::fs::canonicalize(&root).unwrap()]);

        // The candidate path goes through the SYMLINK, not the real root —
        // proving the predicate resolves (realpath) before confining rather
        // than doing a string-prefix test, which this path would evade.
        let target = link.join("export.json");
        let result = export_path_is_permitted(&target);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "protected-root");

        reset_protected_roots(vec![]);
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn export_path_is_permitted_rejects_a_non_json_extension() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("non-json");
        reset_protected_roots(vec![]);

        let target = dir.join("export.txt");
        let result = export_path_is_permitted(&target);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "not-json");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_path_is_permitted_accepts_an_unrelated_directory() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let protected = temp_dir("protected-unrelated");
        let unrelated = temp_dir("unrelated");
        reset_protected_roots(vec![std::fs::canonicalize(&protected).unwrap()]);

        let target = unrelated.join("export.json");
        let result = export_path_is_permitted(&target);

        assert!(result.is_ok());

        reset_protected_roots(vec![]);
        let _ = std::fs::remove_dir_all(&protected);
        let _ = std::fs::remove_dir_all(&unrelated);
    }

    #[test]
    fn write_export_file_refuses_a_file_name_that_symlinks_into_a_protected_root() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let root = temp_dir("protected-root-target");
        let outside = temp_dir("outside-target");

        // A real file inside the protected root, and a .json symlink to it
        // from a directory that is NOT protected. The parent canonicalises
        // outside every root, so the parent check alone lets this through —
        // only resolving the target itself catches it.
        let victim = root.join("victim.json");
        std::fs::write(&victim, "original").unwrap();
        let link = outside.join("export.json");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&victim, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&victim, &link).unwrap();

        reset_protected_roots(vec![std::fs::canonicalize(&root).unwrap()]);

        let result = write_export_file(link.to_string_lossy().into_owned(), "OVERWRITTEN".into());

        assert_eq!(result.unwrap_err(), "protected-root");
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "original");

        reset_protected_roots(vec![]);
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn write_export_file_writes_to_an_unrelated_directory() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let protected = temp_dir("protected-write");
        let unrelated = temp_dir("unrelated-write");
        reset_protected_roots(vec![std::fs::canonicalize(&protected).unwrap()]);

        let target = unrelated.join("export.json");
        write_export_file(target.to_string_lossy().into_owned(), "{}".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "{}");

        reset_protected_roots(vec![]);
        let _ = std::fs::remove_dir_all(&protected);
        let _ = std::fs::remove_dir_all(&unrelated);
    }

    #[test]
    fn export_path_is_permitted_rejects_a_parent_that_does_not_exist() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_protected_roots(vec![]);
        let target = PathBuf::from("/this/does/not/exist/anywhere/export.json");
        let result = export_path_is_permitted(&target);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "parent-not-found");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            host_environment,
            grant_read_access,
            write_export_file,
            read_import_file
        ])
        .setup(|app| {
            // The automatic US-1.1 roots, granted once at start-up and never
            // reachable from the frontend (S7 plan §5.1, §2.1). See
            // `auto_root_paths` above, kept paired with
            // `src/model/discovery-paths.ts::rootCandidates`.
            let env = resolve_host_environment();
            let scope = app.fs_scope();
            for path in auto_root_paths(&env) {
                match scope.allow_directory(&path, true) {
                    Ok(()) => {
                        // US-1.6, S15 plan §5.2.1: the automatic roots are
                        // protected from the export writer too.
                        protect_root(&path);
                    }
                    Err(_) => {
                        // NFR-3: a failing grant never aborts start-up. NFR-6:
                        // no path or OS message in the log line.
                        eprintln!("[claude3pcost] setup: a root grant failed (scope error)");
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
