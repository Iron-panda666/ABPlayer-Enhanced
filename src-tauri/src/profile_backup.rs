use base64::{engine::general_purpose::STANDARD, Engine};
use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{self, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf, MAIN_SEPARATOR};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{App, Manager, State, WebviewWindow};
use tauri_plugin_store::StoreExt;

const FORMAT: &str = "ABPlayer Fork profile";
const VERSION: u32 = 1;
const AUTOMATIC_BACKUPS_TO_KEEP: usize = 3;
const STORES: [&str; 6] = [
    "library.json",
    "positions.json",
    "bookmarks.json",
    "userdata.json",
    "statistics.json",
    "tierlists.json",
];

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: String,
    version: u32,
    created_at: String,
    cover_folder: String,
    stores: BTreeMap<String, Value>,
    covers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    automatic_update_version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Preview {
    created_at: String,
    books: usize,
    bookmarks: usize,
    folders: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct FolderMapping {
    from: String,
    to: String,
}

pub(crate) struct BackupState {
    profile: PathBuf,
    preview: Mutex<Option<Backup>>,
    startup_notice: Option<String>,
    _profile_lock: File,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestoreStatus {
    pending: bool,
    startup_notice: Option<String>,
    automatic_backup_folder: Option<String>,
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().expect("path is a named file or folder").to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

fn unique_suffix(kind: &str) -> String {
    let time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!(".{kind}-{}-{time}", std::process::id())
}

fn pending_path(profile: &Path) -> PathBuf {
    sibling(profile, ".restore-pending")
}

fn publish_restore(profile: &Path) -> io::Result<()> {
    let pending = pending_path(profile);
    let previous = sibling(profile, &unique_suffix("before-restore"));
    let had_profile = profile.try_exists()?;
    if had_profile {
        fs::rename(profile, &previous)?;
    }
    if let Err(error) = fs::rename(&pending, profile) {
        if had_profile {
            fs::rename(&previous, profile)?;
        }
        return Err(error);
    }
    Ok(())
}

pub(crate) fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let profile = app.path().app_data_dir()?;
    fs::create_dir_all(profile.parent().ok_or("Could not locate the app data folder")?)?;
    let lock = OpenOptions::new().create(true).truncate(false).read(true).write(true)
        .open(sibling(&profile, ".restore-lock"))?;
    let mut startup_notice = None;
    if pending_path(&profile).try_exists()? {
        match lock.try_lock() {
            Ok(()) => {
                let result = pending_path(&profile).try_exists().and_then(|pending| {
                    if pending { publish_restore(&profile).map(|()| true) } else { Ok(false) }
                });
                lock.unlock()?;
                startup_notice = Some(match result {
                    Ok(false) => String::new(),
                    Ok(true) => "Library backup restored".into(),
                    Err(e) if profile.is_dir() => format!("Restore is still pending: {e}"),
                    Err(e) => return Err(e.into()),
                });
            }
            Err(TryLockError::WouldBlock) => {
                startup_notice = Some("Restore is pending. Quit all ABPlayer Fork windows and reopen the app.".into());
            }
            Err(TryLockError::Error(e)) => return Err(e.into()),
        }
    }
    lock.lock_shared()?;
    app.manage(BackupState { profile, preview: Mutex::new(None),
        startup_notice: startup_notice.filter(|notice| !notice.is_empty()), _profile_lock: lock });
    Ok(())
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("Use the main ABPlayer window".into()) }
}

fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let mut writer = BufWriter::new(OpenOptions::new().write(true).create_new(true).open(path).map_err(error)?);
    serde_json::to_writer(&mut writer, value).map_err(error)?;
    writer.flush().map_err(error)?;
    writer.get_ref().sync_all().map_err(error)
}

fn cover_name(name: &str) -> bool {
    let Some((stem, ext)) = name.split_once('.') else { return false };
    let stem_upper = stem.to_ascii_uppercase();
    let reserved = matches!(stem_upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") ||
        (stem_upper.len() == 4 && (stem_upper.starts_with("COM") || stem_upper.starts_with("LPT"))
            && stem_upper.as_bytes()[3].is_ascii_digit());
    !reserved && !stem.is_empty() && stem.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        && matches!(ext, "jpg" | "png" | "webp")
}

fn collect_covers(profile: &Path) -> Result<BTreeMap<String, String>, String> {
    let folder = profile.join("covers");
    let mut covers = BTreeMap::new();
    if folder.is_dir() {
        for entry in fs::read_dir(folder).map_err(error)? {
            let entry = entry.map_err(error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if cover_name(&name) && entry.file_type().map_err(error)?.is_file() {
                covers.insert(name, STANDARD.encode(fs::read(entry.path()).map_err(error)?));
            }
        }
    }
    Ok(covers)
}

fn publish_archive(path: &Path, backup: &Backup) -> Result<(), String> {
    backup.preview()?;
    let temporary = sibling(path, &unique_suffix("writing"));
    let result = write_json(&temporary, backup).and_then(|()| {
        // Read the flushed archive back through the same validation used by Restore.
        let verified: Backup = serde_json::from_reader(BufReader::new(File::open(&temporary).map_err(error)?))
            .map_err(error)?;
        verified.preview()?;
        fs::rename(&temporary, path).map_err(error)
    });
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

fn utc_timestamp(time: SystemTime) -> Result<String, String> {
    let elapsed = time.duration_since(UNIX_EPOCH).map_err(error)?;
    let mut days = elapsed.as_secs() / 86_400;
    let mut year = 1970u32;
    let leap = |year: u32| year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    loop {
        let length = if leap(year) { 366 } else { 365 };
        if days < length { break; }
        days -= length;
        year += 1;
        if year > 9999 { return Err("The system clock is outside the supported range".into()); }
    }
    let lengths = [31, if leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 0;
    while days >= lengths[month] { days -= lengths[month]; month += 1; }
    let seconds = elapsed.as_secs() % 86_400;
    Ok(format!("{year:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        month + 1, days + 1, seconds / 3600, seconds / 60 % 60, seconds % 60, elapsed.subsec_millis()))
}

fn prune_automatic_backups(folder: &Path, newest: &Path) -> io::Result<()> {
    let mut previous = Vec::new();
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path == newest || !entry.file_type()?.is_file()
            || !name.starts_with("ABPlayer-before-update-to-") || !name.contains(".snapshot-")
            || path.extension().and_then(|s| s.to_str()) != Some("abplayer-backup") { continue; }
        // The name AND archive marker must identify a verified automatic backup.
        // Hand-created archives and unrelated files are never retention candidates.
        let Ok(file) = File::open(&path) else { continue; };
        let Ok(backup) = serde_json::from_reader::<_, Backup>(BufReader::new(file)) else { continue; };
        if backup.automatic_update_version.is_none() || backup.preview().is_err() { continue; }
        previous.push((entry.metadata()?.modified()?, path));
    }
    previous.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    for (_, path) in previous.into_iter().skip(AUTOMATIC_BACKUPS_TO_KEEP - 1) {
        // Only direct, regular archive files read above; never recurse into a folder.
        fs::remove_file(path)?;
    }
    Ok(())
}

/// Installer-only, before the new app is copied into place. Does not initialize Tauri or WebView.
pub(crate) fn create_before_update_backup(profile: &Path, target_version: &str) -> Result<Option<PathBuf>, String> {
    if !profile.is_absolute() { return Err("The profile path must be absolute".into()); }
    if !profile.try_exists().map_err(error)? { return Ok(None); }
    if !profile.is_dir() { return Err("The profile is not a directory".into()); }
    // The running app holds a shared lock. Refuse a snapshot while it can still write.
    let lock = OpenOptions::new().create(true).truncate(false).read(true).write(true)
        .open(sibling(profile, ".restore-lock")).map_err(error)?;
    match lock.try_lock() {
        Ok(()) => (),
        Err(TryLockError::WouldBlock) => return Err("Quit all ABPlayer Fork windows before updating".into()),
        Err(TryLockError::Error(e)) => return Err(error(e)),
    }
    let mut stores = BTreeMap::new();
    for name in STORES {
        let path = profile.join(name);
        let data = if path.try_exists().map_err(error)? {
            serde_json::from_reader(BufReader::new(File::open(path).map_err(error)?))
                .map_err(|e| format!("Could not read {name}: {e}"))?
        } else { Value::Object(Map::new()) };
        stores.insert(name.to_owned(), data);
    }
    let backup = Backup { format: FORMAT.into(), version: VERSION, created_at: utc_timestamp(SystemTime::now())?,
        cover_folder: profile.join("covers").to_string_lossy().into_owned(), stores, covers: collect_covers(profile)?,
        automatic_update_version: Some(target_version.to_owned()) };
    backup.preview()?;
    let folder = sibling(profile, "-backups");
    fs::create_dir_all(&folder).map_err(error)?;
    let safe_version: String = target_version.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-').collect();
    let path = folder.join(format!("ABPlayer-before-update-to-{safe_version}{}.abplayer-backup", unique_suffix("snapshot")));
    publish_archive(&path, &backup)?;
    // Retention starts only after the new archive has been flushed and verified.
    // A locked old backup is left in place; it must not invalidate the new snapshot.
    if let Err(e) = prune_automatic_backups(&folder, &path) { eprintln!("Could not prune older automatic backups: {e}"); }
    Ok(Some(path))
}

#[tauri::command]
pub(crate) async fn create_profile_backup(
    window: WebviewWindow, state: State<'_, BackupState>, path: PathBuf, created_at: String,
) -> Result<(), String> {
    main_window(&window)?;
    if !path.is_absolute() || path.extension().and_then(|ext| ext.to_str()) != Some("abplayer-backup") {
        return Err("Choose an .abplayer-backup file".into());
    }
    let mut stores = BTreeMap::new();
    for name in STORES {
        let store = window.store(name).map_err(error)?;
        stores.insert(name.to_owned(), Value::Object(store.entries().into_iter().collect()));
    }
    let backup = Backup { format: FORMAT.into(), version: VERSION, created_at,
        cover_folder: state.profile.join("covers").to_string_lossy().into_owned(), stores, covers: collect_covers(&state.profile)?,
        automatic_update_version: None };
    publish_archive(&path, &backup)
}

impl Backup {
    fn preview(&self) -> Result<Preview, String> {
        if self.format != FORMAT || self.version != VERSION ||
            self.stores.len() != STORES.len() ||
            STORES.iter().any(|name| !self.stores.get(*name).is_some_and(Value::is_object)) ||
            self.covers.keys().any(|name| !cover_name(name)) {
            return Err("This file is not a supported ABPlayer Fork backup".into());
        }
        let library = &self.stores["library.json"];
        if let Some(index) = library.get("library") {
            let valid_books = index.get("books").and_then(Value::as_array).is_some_and(|books| {
                books.iter().all(|book| {
                    ["filePath", "title", "author"].into_iter().all(|key| book.get(key).is_some_and(Value::is_string))
                        && book.get("chapters").is_some_and(Value::is_array)
                        && book.get("tracks").and_then(Value::as_array).is_some_and(|tracks| {
                            tracks.iter().all(|track| track.get("filePath").is_some_and(Value::is_string))
                        })
                })
            });
            if !valid_books
                || !index.get("folders").is_some_and(Value::is_array) {
                return Err("The backup contains an invalid library index".into());
            }
        }
        let folders = library.pointer("/library/folders").and_then(Value::as_array)
            .into_iter().flatten().map(|folder| folder.as_str().map(str::to_owned)
                .ok_or_else(|| "The backup contains an invalid library folder".to_owned()))
            .collect::<Result<Vec<_>, _>>()?;
        let books = library.pointer("/library/books").and_then(Value::as_array)
            .map_or(0, Vec::len);
        let bookmarks = self.stores["bookmarks.json"].get("bookmarks").and_then(Value::as_object)
            .into_iter().flat_map(|map| map.values()).filter_map(Value::as_array).map(Vec::len).sum();
        Ok(Preview { created_at: self.created_at.clone(), books, bookmarks, folders })
    }
}

#[tauri::command]
pub(crate) async fn inspect_profile_backup(
    window: WebviewWindow, state: State<'_, BackupState>, path: PathBuf,
) -> Result<Preview, String> {
    main_window(&window)?;
    let backup: Backup = serde_json::from_reader(BufReader::new(File::open(path).map_err(error)?))
        .map_err(|_| "This file is not a readable ABPlayer Fork backup".to_owned())?;
    let preview = backup.preview()?;
    *state.preview.lock().map_err(error)? = Some(backup);
    Ok(preview)
}

fn remap_path(path: &str, mappings: &[FolderMapping]) -> String {
    if let Some(key) = path.strip_prefix("group:auto:") {
        if let Some((folder, label)) = key.split_once("::") {
            return format!("group:auto:{}::{label}", remap_path(folder, mappings));
        }
    }
    let normalized = path.replace('\\', "/");
    for mapping in mappings {
        let from = mapping.from.replace('\\', "/");
        let from = from.trim_end_matches('/');
        let tail = if from.as_bytes().get(1) == Some(&b':') || from.starts_with("//") {
            normalized.get(..from.len()).filter(|prefix| prefix.eq_ignore_ascii_case(from))
                .and_then(|_| normalized.get(from.len()..))
        } else {
            normalized.strip_prefix(from)
        };
        match tail {
            Some("") => return mapping.to.clone(),
            Some(rest) if rest.starts_with('/') => {
                let relative = rest.trim_start_matches('/').replace('/', &MAIN_SEPARATOR.to_string());
                return Path::new(&mapping.to).join(relative).to_string_lossy().into_owned();
            }
            _ => {}
        }
    }
    path.to_owned()
}

fn remap_field(value: &mut Value, mappings: &[FolderMapping]) {
    if let Some(path) = value.as_str() {
        *value = Value::String(remap_path(path, mappings));
    }
}

fn remap_keys(map: &mut Map<String, Value>, mappings: &[FolderMapping]) -> Result<(), String> {
    let old = std::mem::take(map);
    for (path, value) in old {
        let path = remap_path(&path, mappings);
        if map.insert(path.clone(), value).is_some() {
            return Err(format!("Two library entries would use the same path: {path}"));
        }
    }
    Ok(())
}

fn relocate_cover(value: &mut Value, old_dir: &str, new_dir: &Path) {
    let Some(url) = value.as_str() else { return };
    let Some((scheme, tail)) = url.split_once("://") else { return };
    let (host, encoded) = match scheme {
        "https" | "http" => match tail.strip_prefix("asset.localhost/") {
            Some(path) => ("asset.localhost/", path),
            None => return,
        },
        "asset" => ("", tail),
        _ => return,
    };
    let Ok(decoded) = percent_decode_str(encoded).decode_utf8() else { return };
    let normalized = decoded.replace('\\', "/");
    let old_dir = old_dir.replace('\\', "/");
    let Some(filename) = normalized.strip_prefix(&old_dir)
        .and_then(|path| path.strip_prefix('/')).filter(|name| cover_name(name)) else { return };
    let path = new_dir.join(filename);
    let encoded = utf8_percent_encode(&path.to_string_lossy(), NON_ALPHANUMERIC).to_string();
    *value = Value::String(format!("{scheme}://{host}{encoded}"));
}

fn remap_stores(backup: &Backup, profile: &Path, mappings: &[FolderMapping]) -> Result<BTreeMap<String, Value>, String> {
    let mut stores = backup.stores.clone();
    let cover_dir = profile.join("covers");
    for (name, store) in &mut stores {
        match name.as_str() {
            "library.json" => {
                if let Some(index) = store.get_mut("library") {
                    for field in ["folders", "splitKeys", "hidden"] {
                        if let Some(values) = index.get_mut(field).and_then(Value::as_array_mut) {
                            for value in values { remap_field(value, mappings); }
                        }
                    }
                    let mut paths = BTreeSet::new();
                    if let Some(books) = index.get_mut("books").and_then(Value::as_array_mut) {
                        for book in books {
                            if let Some(path) = book.get_mut("filePath") {
                                remap_field(path, mappings);
                                if !paths.insert(path.as_str().ok_or("Invalid book path")?.to_owned()) {
                                    return Err("Two books would use the same path".into());
                                }
                            }
                            if let Some(cover) = book.get_mut("coverArt") {
                                relocate_cover(cover, &backup.cover_folder, &cover_dir);
                            }
                            for track in book.get_mut("tracks").and_then(Value::as_array_mut).into_iter().flatten() {
                                if let Some(path) = track.get_mut("filePath") { remap_field(path, mappings); }
                            }
                        }
                    }
                    for group in index.get_mut("groups").and_then(Value::as_array_mut).into_iter().flatten() {
                        for path in group.get_mut("trackPaths").and_then(Value::as_array_mut).into_iter().flatten() {
                            remap_field(path, mappings);
                        }
                    }
                }
            }
            "positions.json" => if let Some(map) = store.as_object_mut() { remap_keys(map, mappings)?; },
            "userdata.json" => if let Some(map) = store.get_mut("books").and_then(Value::as_object_mut) {
                remap_keys(map, mappings)?;
                for book in map.values_mut() {
                    if let Some(cover) = book.get_mut("coverArtOverride") {
                        relocate_cover(cover, &backup.cover_folder, &cover_dir);
                    }
                }
            },
            "bookmarks.json" => if let Some(map) = store.get_mut("bookmarks").and_then(Value::as_object_mut) {
                remap_keys(map, mappings)?;
                for mark in map.values_mut().filter_map(Value::as_array_mut).flatten() {
                    if let Some(path) = mark.get_mut("bookFilePath") { remap_field(path, mappings); }
                }
            },
            "statistics.json" => {
                if let Some(map) = store.pointer_mut("/stats/secsByBook").and_then(Value::as_object_mut) {
                    remap_keys(map, mappings)?;
                }
                for session in store.pointer_mut("/stats/sessionsLog").and_then(Value::as_array_mut).into_iter().flatten() {
                    if let Some(path) = session.get_mut("bookFilePath") { remap_field(path, mappings); }
                }
            }
            "tierlists.json" => {
                for list in store.get_mut("lists").and_then(Value::as_array_mut).into_iter().flatten() {
                    if let Some(map) = list.get_mut("assignments").and_then(Value::as_object_mut) {
                        remap_keys(map, mappings)?;
                    }
                }
            }
            _ => {}
        }
    }
    Ok(stores)
}

fn stage_backup(backup: &Backup, profile: &Path, mut mappings: Vec<FolderMapping>) -> Result<(), String> {
    let summary = backup.preview()?;
    if mappings.iter().any(|mapping| !summary.folders.contains(&mapping.from)
        || !Path::new(&mapping.to).is_absolute()) {
        return Err("Choose valid replacement folders for this backup".into());
    }
    mappings.sort_by_key(|mapping| std::cmp::Reverse(mapping.from.len()));
    let stores = remap_stores(backup, profile, &mappings)?;
    let pending = pending_path(profile);
    if pending.try_exists().map_err(error)? {
        return Err("A restore is already scheduled".into());
    }
    let staging = sibling(profile, &unique_suffix("restoring"));
    fs::create_dir(&staging).map_err(error)?;
    let result = (|| {
        for (name, value) in stores {
            write_json(&staging.join(name), &value)?;
        }
        if !backup.covers.is_empty() {
            let covers = staging.join("covers");
            fs::create_dir(&covers).map_err(error)?;
            for (name, contents) in &backup.covers {
                let bytes = STANDARD.decode(contents).map_err(error)?;
                fs::write(covers.join(name), bytes).map_err(error)?;
            }
        }
        fs::rename(&staging, &pending).map_err(error)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[tauri::command]
pub(crate) async fn schedule_profile_restore(
    window: WebviewWindow, state: State<'_, BackupState>, mappings: Vec<FolderMapping>,
) -> Result<(), String> {
    main_window(&window)?;
    let mut preview = state.preview.lock().map_err(error)?;
    let backup = preview.as_ref().ok_or("Choose a backup first")?;
    stage_backup(backup, &state.profile, mappings)?;
    preview.take();
    Ok(())
}

#[tauri::command]
pub(crate) async fn profile_restore_status(window: WebviewWindow, state: State<'_, BackupState>) -> Result<RestoreStatus, String> {
    main_window(&window)?;
    Ok(RestoreStatus { pending: pending_path(&state.profile).try_exists().map_err(error)?,
        startup_notice: state.startup_notice.clone(),
        automatic_backup_folder: sibling(&state.profile, "-backups").is_dir()
            .then(|| sibling(&state.profile, "-backups").to_string_lossy().into_owned()) })
}

#[tauri::command]
pub(crate) async fn cancel_profile_restore(window: WebviewWindow, state: State<'_, BackupState>) -> Result<(), String> {
    main_window(&window)?;
    match fs::remove_dir_all(pending_path(&state.profile)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(error(e)),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("abplayer{}", unique_suffix("backup-test")));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample_backup() -> Backup {
        let path = r"group:auto:D:\Books::mystery";
        let track = r"D:\Books\01.mp3";
        let cover_folder = r"C:\Profiles\Old\covers";
        let cover_path = format!(r"{cover_folder}\mystery.png");
        let cover = format!("http://asset.localhost/{}", utf8_percent_encode(&cover_path, NON_ALPHANUMERIC));
        let stores = [
            ("library.json", json!({"library": {
                "folders": [r"D:\Books"],
                "books": [{"filePath": path, "title": "Mystery", "author": "A.", "chapters": [],
                    "tracks": [{"filePath": track}], "coverArt": cover}],
                "splitKeys": [r"D:\Books\Split"],
                "hidden": [r"D:\Bookshelf\Untouched.mp3"],
                "groups": [{"id": "custom", "trackPaths": [track]}]
            }})),
            ("positions.json", json!({(path): {"position": 42.5, "trackIndex": 1}})),
            ("bookmarks.json", json!({"bookmarks": {(path): [{"bookFilePath": path, "position": 17}]}})),
            ("userdata.json", json!({"books": {(path): {"coverArtOverride": cover}}, "preferences": {"theme": "light"}})),
            ("statistics.json", json!({"stats": {"secsByBook": {(path): 120}, "sessionsLog": [{"bookFilePath": path}]}})),
            ("tierlists.json", json!({"lists": [{"assignments": {(path): "s"}}]})),
        ].into_iter().map(|(key, value)| (key.to_owned(), value)).collect();
        Backup {
            format: FORMAT.into(), version: VERSION, created_at: "2026-01-01T00:00:00Z".into(),
            cover_folder: cover_folder.into(), stores,
            covers: [("mystery.png".into(), STANDARD.encode(b"cover"))].into_iter().collect(),
            automatic_update_version: None,
        }
    }

    fn read_json(path: PathBuf) -> Value {
        serde_json::from_reader(BufReader::new(File::open(path).unwrap())).unwrap()
    }

    fn write_sample_profile(profile: &Path) -> Backup {
        let mut sample = sample_backup();
        fs::create_dir_all(profile.join("covers")).unwrap();
        let cover = format!("http://asset.localhost/{}",
            utf8_percent_encode(profile.join("covers/mystery.png").to_str().unwrap(), NON_ALPHANUMERIC));
        sample.stores.get_mut("library.json").unwrap()["library"]["books"][0]["coverArt"] = Value::String(cover.clone());
        let key = r"group:auto:D:\Books::mystery";
        sample.stores.get_mut("userdata.json").unwrap()["books"][key]["coverArtOverride"] = Value::String(cover);
        for (name, value) in &sample.stores { write_json(&profile.join(name), value).unwrap(); }
        fs::write(profile.join("covers/mystery.png"), b"cover").unwrap();
        sample
    }

    #[test]
    fn automatic_backup_is_restorable_and_never_overwrites_previous_backups() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile with spaces č");
        let sample = write_sample_profile(&profile);
        let original: Vec<_> = STORES.iter().map(|name| (*name, fs::read(profile.join(name)).unwrap())).collect();
        let archive = create_before_update_backup(&profile, "1.7.6").unwrap().unwrap();
        let archived_bytes = fs::read(&archive).unwrap();
        let backup: Backup = serde_json::from_slice(&archived_bytes).unwrap();
        assert_eq!((backup.preview().unwrap().books, backup.preview().unwrap().bookmarks), (1, 1));
        assert_eq!(backup.stores, sample.stores);
        assert_eq!(backup.covers, sample.covers);
        for (name, bytes) in original { assert_eq!(fs::read(profile.join(name)).unwrap(), bytes); }
        assert_eq!(fs::read(profile.join("covers/mystery.png")).unwrap(), b"cover");
        let second = create_before_update_backup(&profile, "1.7.6").unwrap().unwrap();
        assert_ne!(archive, second);
        assert_eq!(fs::read(&archive).unwrap(), archived_bytes);
        let restored = temp.0.join("restored");
        stage_backup(&backup, &restored, vec![]).unwrap();
        publish_restore(&restored).unwrap();
        assert_eq!(read_json(restored.join("positions.json")), sample.stores["positions.json"]);
        assert_eq!(fs::read(restored.join("covers/mystery.png")).unwrap(), b"cover");
    }

    #[test]
    fn fresh_install_does_not_create_an_empty_backup_or_profile() {
        let temp = TempDir::new();
        let profile = temp.0.join("not-created");
        assert!(create_before_update_backup(&profile, "1.7.6").unwrap().is_none());
        assert!(!profile.exists());
        assert!(!sibling(&profile, "-backups").exists());
    }

    #[test]
    fn automatic_backup_refuses_a_profile_still_used_by_the_player() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        write_sample_profile(&profile);
        let lock = OpenOptions::new().create(true).truncate(false).read(true).write(true)
            .open(sibling(&profile, ".restore-lock")).unwrap();
        lock.lock_shared().unwrap();
        assert!(create_before_update_backup(&profile, "1.7.6").unwrap_err().contains("Quit all"));
        assert!(!sibling(&profile, "-backups").exists());
        lock.unlock().unwrap();
        assert!(create_before_update_backup(&profile, "1.7.6").unwrap().is_some());
    }

    #[test]
    fn corrupt_profile_stops_backup_without_changing_the_source() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        write_sample_profile(&profile);
        fs::write(profile.join("positions.json"), b"{not-json").unwrap();
        assert!(create_before_update_backup(&profile, "1.7.6").is_err());
        assert_eq!(fs::read(profile.join("positions.json")).unwrap(), b"{not-json");
        assert!(!sibling(&profile, "-backups").exists());
    }

    #[test]
    fn unavailable_backup_destination_stops_backup_without_changing_the_source() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        let sample = write_sample_profile(&profile);
        fs::write(sibling(&profile, "-backups"), b"existing file").unwrap();
        assert!(create_before_update_backup(&profile, "1.7.6").is_err());
        assert_eq!(read_json(profile.join("userdata.json")), sample.stores["userdata.json"]);
        assert_eq!(fs::read(sibling(&profile, "-backups")).unwrap(), b"existing file");
    }

    #[test]
    fn automatic_backup_timestamp_uses_utc_including_leap_days() {
        use std::time::Duration;
        assert_eq!(utc_timestamp(UNIX_EPOCH).unwrap(), "1970-01-01T00:00:00.000Z");
        assert_eq!(utc_timestamp(UNIX_EPOCH + Duration::from_secs(951_782_400)).unwrap(), "2000-02-29T00:00:00.000Z");
        assert_eq!(utc_timestamp(UNIX_EPOCH + Duration::from_millis(1_709_164_800_123)).unwrap(), "2024-02-29T00:00:00.123Z");
    }

    #[test]
    fn retention_keeps_three_automatic_archives_and_all_manual_archives() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        let sample = write_sample_profile(&profile);
        let folder = sibling(&profile, "-backups");
        fs::create_dir(&folder).unwrap();
        let manual = folder.join("ABPlayer-before-update-to-manual.snapshot-keep.abplayer-backup");
        write_json(&manual, &sample).unwrap();
        let mut archives = Vec::new();
        for version in ["1.7.6", "1.7.7", "1.7.8", "1.7.9", "1.8.0"] {
            archives.push(create_before_update_backup(&profile, version).unwrap().unwrap());
        }
        assert!(!archives[0].exists());
        assert!(!archives[1].exists());
        assert!(archives[2..].iter().all(|path| path.is_file()));
        assert!(manual.is_file());
        assert_eq!(fs::read_dir(&folder).unwrap().count(), 4);
        // A failed snapshot never prunes the three known-good archives.
        fs::write(profile.join("userdata.json"), b"invalid").unwrap();
        assert!(create_before_update_backup(&profile, "1.8.1").is_err());
        assert!(archives[2..].iter().all(|path| path.is_file()));
        assert!(manual.is_file());
    }

    #[test]
    fn archive_round_trip_relocates_paths_and_preserves_previous_profile() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        fs::create_dir(&profile).unwrap();
        fs::write(profile.join("old-marker"), b"current profile").unwrap();
        let archive = temp.0.join("sample.abplayer-backup");
        write_json(&archive, &sample_backup()).unwrap();
        let backup: Backup = serde_json::from_reader(File::open(archive).unwrap()).unwrap();
        let preview = backup.preview().unwrap();
        assert_eq!((preview.books, preview.bookmarks), (1, 1));
        let destination = temp.0.join("new audiobooks");
        let mappings = vec![FolderMapping {
            from: r"D:\Books".into(), to: destination.to_str().unwrap().into(),
        }];
        stage_backup(&backup, &profile, mappings).unwrap();
        assert!(profile.join("old-marker").is_file());
        assert!(pending_path(&profile).is_dir());
        publish_restore(&profile).unwrap();

        let key = format!("group:auto:{}::mystery", destination.display());
        let library = read_json(profile.join("library.json"));
        let track = destination.join("01.mp3");
        assert_eq!(library["library"]["books"][0]["filePath"], key);
        assert_eq!(library["library"]["books"][0]["tracks"][0]["filePath"], track.to_str().unwrap());
        assert_eq!(library["library"]["groups"][0]["trackPaths"][0], track.to_str().unwrap());
        assert_eq!(library["library"]["hidden"][0], r"D:\Bookshelf\Untouched.mp3");
        assert_eq!(read_json(profile.join("positions.json"))[&key]["position"], 42.5);
        assert_eq!(read_json(profile.join("bookmarks.json"))["bookmarks"][&key][0]["bookFilePath"], key);
        let userdata = read_json(profile.join("userdata.json"));
        let expected = format!("http://asset.localhost/{}",
            utf8_percent_encode(profile.join("covers").join("mystery.png").to_str().unwrap(), NON_ALPHANUMERIC));
        assert_eq!(userdata["books"][&key]["coverArtOverride"], expected);
        assert_eq!(userdata["preferences"]["theme"], "light");
        assert_eq!(read_json(profile.join("statistics.json"))["stats"]["secsByBook"][&key], 120);
        assert_eq!(read_json(profile.join("tierlists.json"))["lists"][0]["assignments"][&key], "s");
        assert_eq!(fs::read(profile.join("covers/mystery.png")).unwrap(), b"cover");
        assert!(fs::read_dir(&temp.0).unwrap().any(|entry| entry.unwrap().path().join("old-marker").is_file()));
        assert!(!pending_path(&profile).exists());
    }

    #[test]
    fn malformed_cover_never_publishes_a_pending_restore() {
        let temp = TempDir::new();
        let profile = temp.0.join("profile");
        fs::create_dir(&profile).unwrap();
        fs::write(profile.join("old-marker"), b"current profile").unwrap();
        let mut backup = sample_backup();
        backup.covers.insert("../unsafe.png".into(), STANDARD.encode(b"cover"));
        assert!(stage_backup(&backup, &profile, vec![]).is_err());
        backup.covers.remove("../unsafe.png");
        backup.covers.insert("bad.png".into(), ".invalid base64.".into());
        assert!(stage_backup(&backup, &profile, vec![]).is_err());
        assert!(!pending_path(&profile).exists());
        assert_eq!(fs::read(profile.join("old-marker")).unwrap(), b"current profile");
    }
}
