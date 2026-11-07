import { describe, expect, it } from "vitest";

import { prefijoOficial } from "@/lib/utils/prefijo-oficial";

// SLT-81 · R26 — el prefijo oficial de un país según libphonenumber.
describe("SLT-81 R26 — prefijo oficial", () => {
  it.each([
    ["CR", "506"],
    ["PA", "507"],
    ["GT", "502"],
    ["US", "1"],
  ])("%s → %s, en dígitos y sin «+»", (pais, prefijo) => {
    expect(prefijoOficial(pais)).toBe(prefijo);
  });

  it.each(["XA", "AQ", "BV", "HM"])("%s, que libphonenumber no conoce, no tiene prefijo oficial (null)", (pais) => {
    expect(prefijoOficial(pais)).toBeNull();
  });
});
