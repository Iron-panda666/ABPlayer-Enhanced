import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { get } from "svelte/store";
import { showToast } from "../stores/toastStore";
import { userdataStore } from "../stores/userdataStore";
import { audioStore } from "../stores/audioStore";
import { savePosition } from "../stores/positionStore";
import { getStore } from "../stores/storeUtils";

export async function initTray(openMini: (anchor?: TrayIconEvent["position"]) => Promise<void>) {
  const main = getCurrentWindow();
  let tray: TrayIcon | undefined;
  let trayVisible = false;
  let quitting = false;
  let closing = false;
  let pending = Promise.resolve();

  function report(error: unknown) {
    console.warn("Desktop window controls:", error);
    showToast("Could not complete the window action", "error");
  }

  async function showMain() {
    await main.show();
    await main.unminimize();
    await main.setFocus();
  }

  const stopClose = await main.onCloseRequested(async (event) => {
    event.preventDefault();
    if (closing) return;
    const prefs = get(userdataStore).preferences;
    if (!quitting && trayVisible && prefs.trayIcon && prefs.closeToTray) {
      await main.hide().catch(report);
      return;
    }

    closing = true;
    try {
      const state = get(audioStore);
      if (state.currentBook && !state.currentBook.fileless &&
          (state.currentTime > 0 || state.currentTrackIndex > 0)) {
        await savePosition(state.currentBook.filePath, state.currentTime, state.duration, state.currentTrackIndex);
        await (await getStore("positions.json")).save();
      }
    } catch (error) {
      report(error);
    }
    try {
      const mini = await WebviewWindow.getByLabel("mini-player");
      await mini?.destroy().catch(console.warn);
      await main.destroy();
    } catch (error) {
      closing = false;
      quitting = false;
      report(error);
    }
  });

  let requested: boolean | undefined;
  const stopPrefs = userdataStore.subscribe(({ preferences }) => {
    if (requested === preferences.trayIcon) return;
    const enabled = preferences.trayIcon;
    requested = enabled;
    pending = pending.then(async () => {
      if (!enabled) {
        await tray?.setVisible(false);
        trayVisible = false;
        return;
      }
      if (!tray) {
        const icon = await defaultWindowIcon();
        if (!icon) throw new Error("The default application icon is missing");
        const menu = await Menu.new({
          items: [
            { text: "Open ABPlayer", action: () => void showMain().catch(report) },
            { text: "Mini player", action: () => void openMini().catch(report) },
            { item: "Separator" },
            { text: "Quit ABPlayer", action: () => {
              quitting = true;
              void main.close().catch((error) => {
                quitting = false;
                report(error);
              });
            } },
          ],
        });
        tray = await TrayIcon.new({
          id: "abplayer",
          icon,
          menu,
          tooltip: "ABPlayer",
          showMenuOnLeftClick: false,
          action: (event) => {
            const clicks = get(userdataStore).preferences.trayClicks;
            const shouldOpen = clicks === 2
              ? event.type === "DoubleClick" && event.button === "Left"
              : event.type === "Click" && event.button === "Left" && event.buttonState === "Up";
            if (shouldOpen) void openMini(event.rect.position).catch(report);
          },
        });
      } else {
        await tray.setVisible(true);
      }
      trayVisible = true;
    }).catch(report);
  });

  return () => {
    stopPrefs();
    stopClose();
  };
}
