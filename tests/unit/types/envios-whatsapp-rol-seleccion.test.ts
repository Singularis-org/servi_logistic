import { describe, it, expect } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { esRolDeSeleccion, seleccionDestinatariosSchema } from "@/lib/types/envios-whatsapp";

// SL-32 (R5) — un envío automático es de una empresa: los roles de plataforma no son destinatarios.
// `esRolDeSeleccion` estrecha `RolValue` a lo que acepta el borde, y lo usan el servicio (al volver
// un envío al formulario) y el formulario (al armar la entrada).

describe("SL-32 — esRolDeSeleccion", () => {
  it("acepta los seis roles de empresa y rechaza los de plataforma", () => {
    const roles = Object.values(RolValue);
    expect(roles.filter(esRolDeSeleccion)).toEqual(roles.filter((r) => !(ROLES_PLATAFORMA as readonly string[]).includes(r)));
    expect(roles.filter(esRolDeSeleccion)).toHaveLength(6);
    expect(esRolDeSeleccion(RolValue.superadmin)).toBe(false);
  });

  it("coincide con el schema del borde, rol por rol", () => {
    for (const rol of Object.values(RolValue)) {
      const enBorde = seleccionDestinatariosSchema.safeParse({ roles: [rol] }).success;
      expect(esRolDeSeleccion(rol), rol).toBe(enBorde);
    }
  });
});
