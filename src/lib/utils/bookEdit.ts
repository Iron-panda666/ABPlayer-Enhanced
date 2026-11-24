/** Empty means unknown; a partial year must never be silently saved as year 16. */
export function parseBookYear(text: string): number | null {
  const value = text.trim();
  return /^\d{4}$/.test(value) && Number(value) >= 1000 && Number(value) <= 3000
    ? Number(value) : null;
}

/** Bare numbers are hours; colon notation is H:MM[:SS]. Accept decimal commas. */
export function parseBookLength(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  let seconds: number;
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    seconds = Math.round(Number(value.replace(",", ".")) * 3600);
  } else if (/^\d+:\d{2}(?::\d{2})?$/.test(value)) {
    const [h, m, s = 0] = value.split(":").map(Number);
    if (m > 59 || s > 59) return null;
    seconds = h * 3600 + m * 60 + s;
  } else return null;
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 36_000_000 ? seconds : null;
}

export function formatBookLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 3600)}:${String(Math.floor(whole / 60) % 60).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
