import { describe, it, expect } from "vitest";
import { parseSlipDateRaw } from "./slip-date";

const now = new Date("2026-08-28T00:00:00Z");

describe("parseSlipDateRaw (Thai slips: day → month → year)", () => {
  const cases: [string, string | null][] = [
    ["23/04/26", "2026-04-23"],
    ["05/03/26", "2026-03-05"],
    ["26/04/24", "2024-04-26"],
    ["1 ก.พ. 67", "2024-02-01"],
    ["15/08/68", "2025-08-15"],
    ["28/08/2569", "2026-08-28"],
    ["26 ส.ค. 2569", "2026-08-26"],
    ["6 Jun 26", "2026-06-06"],
    ["", null],
    ["อ่านไม่ออก", null],
  ];

  for (const [raw, want] of cases) {
    it(`${raw || "(empty)"} → ${want}`, () => {
      expect(parseSlipDateRaw(raw, now)).toBe(want);
    });
  }
});
