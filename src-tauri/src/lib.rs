use serde::Serialize;
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
            Ok(()) => granted += 1,
            Err(_) => {
                // NFR-6: no path, no OS message — a bounded class name only.
                eprintln!("[claude3pcost] grant_read_access: a grant failed (scope error)");
            }
        }
    }
    Ok(granted)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![host_environment, grant_read_access])
        .setup(|app| {
            // The automatic US-1.1 roots, granted once at start-up and never
            // reachable from the frontend (S7 plan §5.1, §2.1). See
            // `auto_root_paths` above, kept paired with
            // `src/model/discovery-paths.ts::rootCandidates`.
            let env = resolve_host_environment();
            let scope = app.fs_scope();
            for path in auto_root_paths(&env) {
                if scope.allow_directory(&path, true).is_err() {
                    // NFR-3: a failing grant never aborts start-up. NFR-6:
                    // no path or OS message in the log line.
                    eprintln!("[claude3pcost] setup: a root grant failed (scope error)");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
