use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use std::{fs, io, path::Path, time::SystemTime};

const ORIGINAL_ID: &str = "com.abplayer.app";
const FORK_ID: &str = "com.ironpanda666.abplayer";
const STORES: &[&str] = &[
    "library.json",
    "positions.json",
    "bookmarks.json",
    "userdata.json",
    "statistics.json",
    "tierlists.json",
];
// Tauri uses encodeURIComponent for local asset URLs.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

pub(crate) fn import_original_profile(roaming: &Path) -> io::Result<()> {
    let source = roaming.join(ORIGINAL_ID);
    let target = roaming.join(FORK_ID);
    if target.try_exists()? {
        return Ok(());
    }
    if !source.join("library.json").is_file() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "The original library was not found"));
    }

    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let stage = roaming.join(format!("{FORK_ID}.import-{}-{timestamp}", std::process::id()));
    fs::create_dir(&stage)?;

    let result = copy_profile(&source, &stage, &target).and_then(|()| fs::rename(&stage, target));
    if result.is_err() {
        let _ = fs::remove_dir_all(&stage);
    }
    result
}

fn copy_profile(source: &Path, stage: &Path, target: &Path) -> io::Result<()> {
    let covers = source.join("covers");
    if covers.is_dir() {
        fs::create_dir(stage.join("covers"))?;
        for cover in fs::read_dir(covers)? {
            let cover = cover?;
            if cover.file_type()?.is_file() {
                fs::copy(cover.path(), stage.join("covers").join(cover.file_name()))?;
            }
        }
    }

    let separator = std::path::MAIN_SEPARATOR;
    let old_path = format!("{}{separator}covers{separator}", source.display());
    let new_path = format!("{}{separator}covers{separator}", target.display());
    let from = utf8_percent_encode(&old_path, URI_COMPONENT).to_string();
    let to = utf8_percent_encode(&new_path, URI_COMPONENT).to_string();
    for &name in STORES {
        let file = source.join(name);
        if !file.is_file() {
            continue;
        }
        let destination = stage.join(name);
        if name == "library.json" || name == "userdata.json" {
            let contents = fs::read_to_string(file)?.replace(&from, &to);
            fs::write(destination, contents)?;
        } else {
            fs::copy(file, destination)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new(test: &str) -> Self {
            let root = std::env::temp_dir().join(format!("abplayer-fork-{test}-{}", std::process::id()));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn copies_positions_bookmarks_and_cover_links_without_editing_original() {
        let home = Fixture::new("profile-copy");
        let original = home.0.join(ORIGINAL_ID);
        let cover = original.join("covers").join("Example cover.png");
        fs::create_dir_all(cover.parent().unwrap()).unwrap();
        fs::write(&cover, b"cover").unwrap();
        let cover_path = cover.to_str().unwrap();
        let library = format!(
            r#"{{"books":[{{"coverArt":"http://asset.localhost/{}"}}]}}"#,
            utf8_percent_encode(cover_path, URI_COMPONENT)
        );
        fs::write(original.join("library.json"), &library).unwrap();
        fs::write(original.join("positions.json"), br#"{"book":{"position":42}}"#).unwrap();
        fs::write(original.join("bookmarks.json"), br#"{"bookmarks":{"book":[{}]}}"#).unwrap();

        import_original_profile(&home.0).unwrap();

        let fork = home.0.join(FORK_ID);
        assert_eq!(fs::read_to_string(original.join("library.json")).unwrap(), library);
        assert_eq!(
            fs::read_to_string(fork.join("library.json")).unwrap(),
            library.replace(ORIGINAL_ID, FORK_ID)
        );
        assert_eq!(fs::read(fork.join("covers/Example cover.png")).unwrap(), b"cover");
        for name in ["positions.json", "bookmarks.json"] {
            assert_eq!(fs::read(original.join(name)).unwrap(), fs::read(fork.join(name)).unwrap());
        }
    }

    #[test]
    fn preserves_an_existing_fork_profile() {
        let home = Fixture::new("profile-existing");
        let original = home.0.join(ORIGINAL_ID);
        let fork = home.0.join(FORK_ID);
        fs::create_dir(&original).unwrap();
        fs::write(original.join("library.json"), "original").unwrap();
        fs::create_dir(&fork).unwrap();
        fs::write(fork.join("library.json"), "fork").unwrap();
        import_original_profile(&home.0).unwrap();
        assert_eq!(fs::read_to_string(fork.join("library.json")).unwrap(), "fork");
    }
}
