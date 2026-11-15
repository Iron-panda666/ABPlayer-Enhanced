import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { get } from "svelte/store";
import { audioStore, setVolume, toggleMute, togglePlay } from "../stores/audioStore";
import { addBookmark } from "../stores/bookmarkStore";
import { showToast } from "../stores/toastStore";
import { userdataStore } from "../stores/userdataStore";
import { formatTime } from "../utils/format";

export async function markCurrentPosition() {
  const state = get(audioStore);
  if (!state.currentBook || state.currentBook.fileless) return;
  await addBookmark(state.currentBook.filePath, formatTime(state.currentTime),
    state.currentTime, state.currentTrackIndex);
  showToast("Bookmark added", "bookmark_added");
}

export const STREAM_DECK_SHORTCUTS = [
  { key: "1", label: "Play / pause", action: () => {
    const book = get(audioStore).currentBook;
    if (book && !book.fileless) togglePlay();
  } },
  { key: "2", label: "Volume down", action: () => setVolume(get(audioStore).volume - 0.05) },
  { key: "3", label: "Volume up", action: () => setVolume(get(audioStore).volume + 0.05) },
  { key: "4", label: "Mute / unmute", action: toggleMute },
  { key: "5", label: "Add bookmark", action: () => void markCurrentPosition() },
] as const;

export function initStreamDeckShortcuts() {
  const registered = new Set<string>();
  let enabled = false;
  let pending = Promise.resolve();
  return userdataStore.subscribe(({ preferences }) => {
    if (enabled === preferences.streamDeckShortcuts) return;
    enabled = preferences.streamDeckShortcuts;
    const shouldRegister = enabled;
    pending = pending.then(async () => {
      for (const { key, label, action } of STREAM_DECK_SHORTCUTS) {
        const shortcut = `CommandOrControl+Alt+Shift+${key}`;
        try {
          if (shouldRegister && !registered.has(shortcut)) {
            await register(shortcut, (event) => {
              if (enabled && event.state === "Pressed") action();
            });
            registered.add(shortcut);
          } else if (!shouldRegister && registered.has(shortcut)) {
            await unregister(shortcut);
            registered.delete(shortcut);
          }
        } catch (error) {
          console.warn(`Stream Deck shortcut: ${shortcut}`, error);
          showToast(`Could not ${shouldRegister ? "register" : "release"} shortcut: ${label}`, "error");
        }
      }
    });
  });
}
