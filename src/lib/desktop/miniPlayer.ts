export const MINI_WIDTH = 430;
export const MINI_HEIGHT = 216;

export interface MiniState {
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  title: string;
  author: string;
  coverArt: string | null;
  chapter: string;
  previous: boolean;
  next: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  sleepMinutes: number | "chapter" | "off";
  eq: string;
  eqPresets: string[];
  error: string | null;
  isDark: boolean;
  primary: string;
  fontFamily: "editorial" | "modern";
  opacity: number;
}

export type MiniCommand =
  | { action: "ready" | "toggle-play" | "skip-forward" | "skip-back" | "previous" | "next" | "mute" | "bookmark" }
  | { action: "seek" | "volume" | "speed"; value: number }
  | { action: "sleep"; value: MiniState["sleepMinutes"] }
  | { action: "eq"; value: string };
