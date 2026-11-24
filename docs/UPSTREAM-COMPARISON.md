# Compared with upstream ABPlayer 1.7.0

ABPlayer Enhanced is a substantial feature extension of the original player. It retains the Tauri 2 / Svelte 5 architecture and the existing audiobook engine, library scanner, audio formats, equalizer, tiers and most components.

This comparison measures upstream commit [`6071782`](https://github.com/kurohige/ABPlayer/commit/6071782e61cfbdb9caf5142d166284bf1f628a55) against Enhanced commit [`c56ced2`](https://github.com/Iron-panda666/ABPlayer-Enhanced/commit/c56ced2ad25dd9b50f947772d338e7498f63ebc2), before this comparison document and release notes were added.

## Size of the change

| Measure | Result |
| --- | ---: |
| Additional commits | 7: six implementation/verification commits and one presentation/privacy commit |
| Files changed across the repository | 59 |
| New files across the repository | 26 |
| Text lines added / removed | 4,955 / 1,011 |
| Files changed under `src/` and `src-tauri/src/` | 38 |
| Original application files modified | 22 of 112 (19.6%) |
| Original application files untouched | 90 of 112 |
| New application and test files | 16 |
| Application/test text lines added / removed | 3,337 / 674 |

These are Git diff measurements, not a percentage of functionality or effort. The whole-repository total includes documentation, configuration and a 995-line installer template adapted from Tauri; it should not be interpreted as 4,955 lines of entirely new player logic. Git classifies `mediaSession.ts` as binary, so its file change is counted but its line delta is absent from the text totals.

## What changed for listeners

| Area | Original ABPlayer 1.7.0 | Enhanced 1.7.3 |
| --- | --- | --- |
| Chapter navigation | Chapter list and media-key navigation; transport focuses on 30-second jumps | Previous/next buttons beside the 30-second controls in the player, Continue card and mini player |
| Accidental seeking | Normal timeline and chapter jumps | Undo the last manual jump, including a jump to another track; a timeline drag is one undoable action |
| Bookmarks | Saved bookmarks and book detail views | Bookmarks also appear under their matching chapter/track for direct navigation |
| Notification area | No configurable tray workflow | Tray icon and menu, close/minimize options, single/double-click behavior, repeated gesture restores the main window |
| Mini player | Compact 360 × 104 always-on-top transport | 430 × 216 layout with chapter controls, speed, volume/mute, sleep, EQ and bookmarks; adjustable background opacity |
| Player layout | Split player and chapter/details area | Optional expanded player fills the content area while retaining the sidebar and header |
| Audio display | Chapter waveform and progress | Optional real-time spectrum, oscilloscope or level meter, with reduced-motion support |
| Library list | Search, filters, grid/list and sort menu | Clickable sortable headings, ten column choices, show/hide and reorder optional columns; preferences persist |
| Metadata | Local file metadata and manual library edits | Optional Open Library search by title, author or ISBN; review title, author and first publication year before saving |
| Stream Deck | Existing general/global keyboard controls | Optional dedicated global shortcuts for play/pause, volume down/up, mute and add bookmark |
| Backup | Existing library export/import | Full profile archive containing library, positions, bookmarks, covers, settings, tiers and statistics; folder remapping on restore |
| Installation | Original application identity and installer | Separate Fork identity, first-use original-profile copy, in-place updates, repair/reinstall and uninstall maintenance |

## What remains inherited

Audio decoding and streaming, supported formats, chapter extraction, library grouping, collections, ranking, the equalizer and most visual primitives remain based on upstream. The fork adds controls and workflows around this foundation rather than replacing the engine.

The original was already a capable audiobook player with a mini player, bookmarks and media keys. Those features are expanded here; they are not all new inventions of the fork.

## Limits and verification

- Metadata is stored in the player's library. This is not an embedded Mp3tag integration and does not write ID3/MP4 tags back into audiobook files.
- Stream Deck support uses Elgato's System → Hotkey action. There is no dedicated Stream Deck plugin, feedback display or verified physical-hardware test yet.
- Installer updates are manual, by running the new installer. There is no automatic online updater.
- Updates and repair preserve the Fork profile. Uninstall offers a separate option to delete application data; deleting it removes saved library state.
- Original ABPlayer and the Fork use separate profiles. The first-install import copies the original data when no Fork profile exists; it is not continuous synchronization.
- Profile archives contain library state and covers, not audiobook audio files.
- The frontend suite passes all 165 tests in 23 files. The production Windows build is verified separately for the release draft. Full native test execution previously encountered a Windows test-loader error; targeted backup and migration verification is recorded in the release notes.
- Native screenshots use an isolated demonstration profile and sample audio. Personal library data, credentials and settings are excluded from the repository and release assets.

## Distribution status

The upstream README states that all rights are reserved and provides source for viewing. The release is being prepared as a private draft until permission to distribute modified binaries is obtained. A public GitHub fork is not a substitute for that permission.

[Full code comparison](https://github.com/Iron-panda666/ABPlayer-Enhanced/compare/6071782e61cfbdb9caf5142d166284bf1f628a55...c56ced2ad25dd9b50f947772d338e7498f63ebc2)

Developed with AI-assisted vibe coding using OpenAI Codex.
