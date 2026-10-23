import { describe, it, expect } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA, esPlataforma } from "@/lib/auth/plataforma";
import { ROLES_ACCESO_TOTAL, esAccesoTotal } from "@/lib/auth/acceso-total";

// SL-32 (R4, R5) — la fuente única de «quién es plataforma», y su separación de «acceso total de
// empresa». Se recorre el enum real: un rol nuevo entra en la tabla sin tocar el test, y si alguien
// lo declara plataforma, el caso de «solo superadmin» se pone en rojo.

describe("R4 — esPlataforma", () => {
  it("ROLES_PLATAFORMA es exactamente el superadmin", () => {
    expect([...ROLES_PLATAFORMA]).toEqual(["superadmin"]);
  });

  it("es true solo para superadmin, entre los siete RolValue", () => {
    const roles = Object.values(RolValue);
    expect(roles).toHaveLength(7);
    expect(roles.filter((r) => esPlataforma(r))).toEqual([RolValue.superadmin]);
  });
});

describe("R5 — el superadmin no tiene acceso total de empresa", () => {
  it("esAccesoTotal(superadmin) es false", () => {
    expect(esAccesoTotal(RolValue.superadmin)).toBe(false);
  });

  it("ningún rol de plataforma está en ROLES_ACCESO_TOTAL", () => {
    for (const rol of ROLES_PLATAFORMA) expect(ROLES_ACCESO_TOTAL).not.toContain(rol);
  });
});
