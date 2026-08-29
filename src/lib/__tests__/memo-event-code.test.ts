import { describe, expect, it } from "vitest";
import { extractEventCodes, resolveEventCode } from "../memo-event-code";

const registry = [
  { project_tag: "EVT-MHC26", aliases: [] },
  { project_tag: "EVT-CKB-W", aliases: [] },
  { project_tag: "EVT-CKB-R", aliases: [] },
  { project_tag: "EVT-WW", aliases: [] },
  { project_tag: "EVT-WW2", aliases: [] },
  { project_tag: "EVT-WW4", aliases: [] },
  { project_tag: "EVT-MRN", aliases: [] },
  { project_tag: "EVT-CEV", aliases: [] },
];

const run = (memo: string) => resolveEventCode(extractEventCodes(memo), registry);

describe("memo event codes", () => {
  it("@ prefix", () => expect(run("@MHC26 ค่าเหรียญ").tag).toBe("EVT-MHC26"));
  it("* prefix", () => expect(run("*MHC26 ค่าเหรียญ").tag).toBe("EVT-MHC26"));
  it("# prefix (legacy)", () => expect(run("#MHC26 ค่าเหรียญ").tag).toBe("EVT-MHC26"));
  it("dash code", () => expect(run("@CKB-W ค่าแรงป้าบุญ 3 วัน").tag).toBe("EVT-CKB-W"));
  it("exact only, no prefix match", () => {
    const r = run("@WW ค่าเช่าพื้นที่");
    expect(r.tag).toBe("EVT-WW");
  });
  it("unknown code is flagged, never guessed", () => {
    const r = run("@MHC2026 ค่าเหรียญ");
    expect(r.tag).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.status).toBe("unknown");
  });
  it("multiple codes need a human", () => {
    const r = run("@MRN และ @CEV");
    expect(r.tag).toBeNull();
    expect(r.status).toBe("ambiguous");
    expect(r.needsReview).toBe(true);
  });
  it("no symbol means no tag", () => {
    const r = run("ค่าเหรียญงานมหาชัย");
    expect(r.tag).toBeNull();
    expect(r.status).toBe("none");
  });
});
