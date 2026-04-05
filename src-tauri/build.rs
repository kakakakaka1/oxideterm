fn main() {
    // Ensure resource directories exist so tauri_build doesn't fail on a fresh clone.
    // These are populated by CI for release builds; empty dirs are fine for dev.
    let _ = std::fs::create_dir_all("cli-bin");
    let _ = std::fs::create_dir_all("agents");
    tauri_build::build()
}
