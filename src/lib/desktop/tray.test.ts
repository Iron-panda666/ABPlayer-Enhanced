import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { TrayIconOptions } from "@tauri-apps/api/tray";
import type { MenuOptions } from "@tauri-apps/api/menu";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { initTray } from "./tray";
import { audioStore } from "../stores/audioStore";
import { getSavedPosition } from "../stores/positionStore";
import { setPreference, userdataStore } from "../stores/userdataStore";
import { resetStores } from "../../test/memoryStore";

const desktop = vi.hoisted(() => {
  const closeRequested = vi.fn<(event: { preventDefault(): void }) => Promise<void>>();
  return {
    closeRequested,
    main: {
      onCloseRequested: vi.fn(async (listener) => {
        closeRequested.mockImplementation(listener);
        return () => closeRequested.mockReset();
      }),
      close: vi.fn(async () => closeRequested({ preventDefault: vi.fn() })),
      hide: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
      show: vi.fn(async () => {}),
      unminimize: vi.fn(async () => {}),
      setFocus: vi.fn(async () => {}),
    },
    menu: vi.fn(async (_options: MenuOptions) => ({})),
    tray: vi.fn(async (_options: TrayIconOptions) => ({ setVisible: vi.fn() })),
    mini: vi.fn<() => Promise<{ close(): Promise<void> } | null>>(),
  };
});

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => desktop.main }));
vi.mock("@tauri-apps/api/app", () => ({ defaultWindowIcon: async () => 1 }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: desktop.menu } }));
vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: desktop.tray } }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: desktop.mini },
}));

const initialAudio = get(audioStore);
const initialUserdata = get(userdataStore);
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  desktop.mini.mockReset().mockResolvedValue(null);
  resetStores();
  audioStore.set(initialAudio);
  userdataStore.set(initialUserdata);
});

afterEach(() => {
  stop?.();
});

describe("Windows notification area", () => {
  it.each([1, 2] as const)("restores the main window when the %i-click gesture is repeated", async (clicks) => {
    const openMini = vi.fn(async () => {});
    const closeMini = vi.fn(async () => {});
    await setPreference("trayIcon", true);
    await setPreference("trayClicks", clicks);
    desktop.mini.mockResolvedValueOnce(null).mockResolvedValueOnce({ close: closeMini });
    stop = await initTray(openMini);
    await vi.waitFor(() => expect(desktop.tray).toHaveBeenCalledOnce());
    const click = desktop.tray.mock.calls[0][0].action;
    const position = new PhysicalPosition(400, 600);
    const point = { id: "abplayer", button: "Left" as const, position,
      rect: { position, size: new PhysicalSize(24, 24) } };
    const event = clicks === 1
      ? { ...point, type: "Click" as const, buttonState: "Up" as const }
      : { ...point, type: "DoubleClick" as const };

    click?.(event);
    await vi.waitFor(() => expect(openMini).toHaveBeenCalledOnce());
    click?.(event);
    await vi.waitFor(() => expect(closeMini).toHaveBeenCalledOnce());
    expect(desktop.main.show).toHaveBeenCalledOnce();
    expect(desktop.main.setFocus).toHaveBeenCalledOnce();
  });

  it("keeps playback running on × and saves the position before quitting", async () => {
    const filePath = "test-listening.m4b";
    audioStore.update((state) => ({
      ...state,
      playing: true,
      currentTime: 37,
      duration: 120,
      currentBook: { filePath, title: "Test book", author: "Test author", album: "",
        duration: 120, coverArt: null, chapters: [], tracks: [] },
    }));
    await setPreference("trayIcon", true);
    await setPreference("closeToTray", true);
    stop = await initTray(vi.fn());
    await vi.waitFor(() => expect(desktop.tray).toHaveBeenCalledOnce());

    const preventDefault = vi.fn();
    await desktop.closeRequested({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(desktop.main.hide).toHaveBeenCalledOnce();
    expect(desktop.main.destroy).not.toHaveBeenCalled();
    expect(await getSavedPosition(filePath)).toBeNull();
    expect(get(audioStore).playing).toBe(true);

    const items = desktop.menu.mock.calls[0][0].items ?? [];
    const exit = items.find((item) => "text" in item && item.text === "Quit ABPlayer-Enhanced");
    if (!exit || !("action" in exit) || !exit.action) throw new Error("Missing tray Quit command");
    exit.action("quit");
    await vi.waitFor(() => expect(desktop.main.destroy).toHaveBeenCalledOnce());
    expect(await getSavedPosition(filePath)).toMatchObject({ position: 37, duration: 120 });
  });

  it("exits normally if creating the tray icon fails", async () => {
    await setPreference("trayIcon", true);
    await setPreference("closeToTray", true);
    desktop.tray.mockRejectedValueOnce(new Error("Tray unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      stop = await initTray(vi.fn());
      await vi.waitFor(() => expect(warning).toHaveBeenCalledOnce());
      await desktop.closeRequested({ preventDefault: vi.fn() });
      expect(desktop.main.hide).not.toHaveBeenCalled();
      expect(desktop.main.destroy).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
