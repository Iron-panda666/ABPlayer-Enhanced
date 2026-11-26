# Enhanced release naming

**Jiří Veselý, aka Iron-panda666, introduced this naming scheme with the first public Enhanced binary release to avoid confusion between original ABPlayer versions and the fork's improvements.**

The public format is:

```text
<upstream version>-Enhanced.<revision>
```

For example, **1.7.0-Enhanced.1** means the original ABPlayer **1.7.0** plus the first publicly packaged Enhanced revision. **1.7.0-Enhanced.2** would identify another Enhanced release on the same upstream base. After actually integrating an upstream 1.8.0 release, an example label would be **1.8.0-Enhanced.1**. These future labels are examples, not announcements.

The GitHub tag uses lowercase, for example **v1.7.0-enhanced.1**. The displayed release uses **1.7.0-Enhanced.1**. The suffix identifies the Enhanced edition; it is not an upstream ABPlayer release.

## Transition from earlier numbering

| Label | Meaning |
| --- | --- |
| Original ABPlayer 1.7.0 | The original code on which this fork is based. |
| Earlier Enhanced/Fork 1.7.3–1.7.7 | Earlier local builds and source milestones using the old numbering. They are preserved in the changelog. |
| 1.7.0-Enhanced.1 | First public binary release using the new naming. Includes the prior Enhanced changes; it is not a downgrade from the local 1.7.7 build. |
| Windows installer/build 1.8.0 | Internal monotonically increasing version used for Windows file metadata and installer upgrade comparisons. |

The application name stays **ABPlayer-Enhanced**, with the executable **ABPlayer-Enhanced.exe**. The current profile and installation identities remain unchanged, so existing Enhanced/Fork installations can be upgraded in place.

## Maintainer rules

The release label, tag, upstream baseline and Enhanced revision are recorded in [`release-info.json`](../release-info.json). The exact upstream commit is recorded alongside the upstream version.

- Increment `enhancedRevision` for a new Enhanced release on the same upstream base.
- Only change `upstreamVersion` and `upstreamCommit` after actually integrating that upstream release. Reset the Enhanced revision to 1 for the new base.
- Keep `releaseVersion` and `releaseTag` consistent with that information.
- Increment `installerVersion` for every public binary update. Keep it identical to package.json, Cargo.toml, Cargo.lock and tauri.conf.json. **Do not lower it to match the displayed upstream base.**
- Use the internal installer version for Windows upgrade comparisons. The public label describes lineage rather than a single globally increasing upstream/fork SemVer sequence.
- Run `npm run release:check` before building. The normal build also runs this consistency check.

The first public release uses upstream commit `6071782e61cfbdb9caf5142d166284bf1f628a55`, displayed release **1.7.0-Enhanced.1**, tag **v1.7.0-enhanced.1** and internal Windows version **1.8.0**.
