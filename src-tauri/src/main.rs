#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod profile_migration;

fn main() {
    #[cfg(windows)]
    if std::env::args_os().nth(1).as_deref()
        == Some(std::ffi::OsStr::new("--import-original-profile"))
    {
        let result = std::env::var_os("APPDATA")
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "APPDATA is unavailable"))
            .and_then(|path| profile_migration::import_original_profile(std::path::Path::new(&path)));
        if result.is_err() {
            std::process::exit(1);
        }
        return;
    }
    abplayer_lib::run()
}
