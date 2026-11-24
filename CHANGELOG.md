# Changelog

Changes made in ABPlayer-Enhanced. The original player is maintained by [jhidalgo_dev / kurohige](https://github.com/kurohige/ABPlayer).

## 1.7.7 — 2026-11-24

- Rename the app, executable, window and tray text to **ABPlayer-Enhanced**.
- Recognize legacy **ABPlayer Fork** installations and migrate matching shortcuts while preserving the existing installation folder and profile.
- Refuse updates while either the renamed or registered legacy player is running.
- Add a persistent **0% progress** filter for the exact beginning of the first track, excluding Finished books and positive positions rounded to zero percent.
- Add a separate [Windows build guide](docs/BUILD-WINDOWS.md), including using an existing Visual Studio C++ installation.

[Detailed notes](docs/releases/1.7.7-enhanced.md)

## 1.7.6 — 2026-11-24

- Automatically back up an existing Fork profile before an installer update or repair replaces application files.
- Save a restore-compatible `.abplayer-backup` archive in `%APPDATA%\com.ironpanda666.abplayer-backups` after the player exits normally.
- Read back and validate the archive before allowing installation to continue. Backup failure stops the update and leaves installed program files in place.
- Keep the newest **3 automatic backups**. Only verified automatic archives are eligible for cleanup, and cleanup starts after the new backup succeeds. Manual backups are never automatically deleted.
- Show the automatic backup folder in **Backup and restore** and use it as the initial location when choosing an archive to restore.
- Keep automatic backups separate from the profile so normal uninstall/profile cleanup does not remove them.

[Detailed notes](docs/releases/1.7.6-enhanced.md)

## 1.7.5 — 2026-11-24

- Add **Unfinished**: include every book whose stored status is not exactly `finished`, including unset and unexpected statuses.
- Remember the filter and combine it with existing library filters.
- Safely render and sort unknown statuses without losing the book from the list.

[Detailed notes](docs/releases/1.7.5-enhanced.md)

## 1.7.4 — 2026-11-24

- Separate original book publication year, audiobook release year and year read/listened.
- Replace year spinners starting at 1 with validated four-digit entry.
- Protect unsaved book edits from outside clicks, Escape and Cancel; require an explicit discard or save.
- Keep cover changes in the draft until saving and confirm reset to original.
- Accept exact book lengths and decimal hours with either comma or dot; persist catalog length without changing playback timing.
- Search Open Library by separate title and author fields without requiring ISBN.

[Detailed notes](docs/releases/1.7.4-enhanced.md)

## Earlier Enhanced changes — 1.7.0–1.7.3

- Add chapter/track buttons to the main player, Continue card and expanded mini player.
- Display bookmarks inside their matching chapter/track and allow undoing a manual seek.
- Add configurable tray behavior, mini-player opacity, expanded player layout and audio visualizations.
- Add configurable, sortable library columns and optional Stream Deck hotkeys.
- Extend original manual metadata editing with Open Library lookup.
- Extend the original library export/import with full profile backups, restore folder remapping and a safety copy of the previous profile.
- Introduce a separate Fork application identity, original-profile copying and installer maintenance.

[Measured comparison with upstream](docs/UPSTREAM-COMPARISON.md)

Binary distribution remains subject to upstream permission. Executables are not published on the fork's public Releases page.

Developed with AI-assisted vibe coding using OpenAI Codex.
