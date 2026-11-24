import { describe, expect, it } from "vitest";
import { formatBookLength, parseBookLength, parseBookYear } from "./bookEdit";

describe("book form time and year entry", () => {
  it("preserves hours, minutes and seconds instead of rounding to tenths of an hour", () => {
    expect(formatBookLength(43_325)).toBe("12:02:05");
    expect(parseBookLength("12:02:05")).toBe(43_325);
    expect(parseBookLength("12:30")).toBe(45_000);
    expect(parseBookLength("12.5")).toBe(45_000);
    expect(parseBookLength("12,5")).toBe(45_000);
    expect(parseBookLength("0:00:45")).toBe(45);
    expect(parseBookLength("0")).toBe(0);
    expect(parseBookLength(" ")).toBeNull();
  });

  it.each(["12:60", "12:30:61", "-2", "NaN", "12foo", "10001", "2,5,5", "12:3", "1:02:03:04"])("rejects invalid length %s", (value) => {
    expect(parseBookLength(value)).toBeNull();
  });

  it("requires a full year and allows clearing an unknown year", () => {
    expect(parseBookYear("2026")).toBe(2026);
    for (const value of ["", "16", "202", "20.5", "2026x", "999", "3001"]) {
      expect(parseBookYear(value)).toBeNull();
    }
  });
});
