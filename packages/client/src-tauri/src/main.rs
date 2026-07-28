// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use utils::base::set_current_show_toolbar;

use serde::Serialize;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

mod implement;
mod utils;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn get_show_toolbar() -> Result<(), String> {
    // todo show: bool 回显 是否显示工具栏 到 menu 菜单栏
    Ok(())
}

#[derive(Serialize)]
struct AiRunCheckResult {
    code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

fn is_allowed_check_command(command: &str) -> bool {
    let command = command.trim();
    let allowed_prefixes = [
        "npm test",
        "npm run test",
        "npm run build",
        "npm run lint",
        "yarn test",
        "yarn build",
        "yarn lint",
        "pnpm test",
        "pnpm build",
        "pnpm lint",
    ];
    allowed_prefixes.iter().any(|prefix| command == *prefix || command.starts_with(&format!("{} ", prefix)))
}

#[tauri::command]
fn ai_run_check(command: String, cwd: Option<String>, timeout_ms: Option<u64>) -> Result<AiRunCheckResult, String> {
    if !is_allowed_check_command(&command) {
        return Err(format!("命令不在 run-check 白名单内: {}", command));
    }

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000).min(180_000));
    let mut child = Command::new("sh")
        .arg("-lc")
        .arg(command)
        .current_dir(cwd.unwrap_or_else(|| ".".to_string()))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let started_at = Instant::now();
    loop {
        if started_at.elapsed() > timeout {
            let _ = child.kill();
            let output = child.wait_with_output().map_err(|error| error.to_string())?;
            return Ok(AiRunCheckResult {
                code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                timed_out: true,
            });
        }
        if child.try_wait().map_err(|error| error.to_string())?.is_some() {
            let output = child.wait_with_output().map_err(|error| error.to_string())?;
            return Ok(AiRunCheckResult {
                code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                timed_out: false,
            });
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let _ = implement::system_tray::system_tray_menu(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_show_toolbar, ai_run_check])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
