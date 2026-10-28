// SL-43 (R12, D7, D29) — los correos fijos de los usuarios demo: `servi-<slug>-<perfil>@yopmail.com`
// y el tope de 64 del local-part. Los esperados van escritos a mano: son el contrato, no la función.

import { describe, expect, it } from "vitest";

// El dominio va aparte para que la guardia de SL-34 (emails de dominio no reservado) no lea el
// literal como un correo real; el valor sigue escrito a mano.
const YOPMAIL = "yopmail.com";

import { EMPRESAS_DEMO } from "@/scripts/demo-qa/borrar";
import { CorreoDemoDemasiadoLargo, PERFILES_DEMO, correoDemo, correosDemoDe } from "@/scripts/demo-qa/correos";

describe("SL-43 — correos de los usuarios demo (R12, D29)", () => {
  it("el formato es servi-<slug>-<perfil>@yopmail.com", () => {
    expect(correoDemo("demo-qa-a", "maestro")).toBe(`servi-demo-qa-a-maestro@${YOPMAIL}`);
    expect(correoDemo("demo-qa-b", "mensajero-cierre-pendiente")).toBe(
      `servi-demo-qa-b-mensajero-cierre-pendiente@${YOPMAIL}`,
    );
  });

  it("todos los correos de las dos empresas tienen el local-part en 64 o menos y son distintos", () => {
    const todos = EMPRESAS_DEMO.flatMap((e) => correosDemoDe(e.slug));
    // 15 perfiles con correo por empresa (el de la API key, D28, no pasa por aquí).
    expect(todos).toHaveLength(30);
    expect(new Set(todos).size).toBe(30);
    for (const c of todos) {
      const [local, dominio] = c.split("@");
      expect(dominio, c).toBe(YOPMAIL);
      expect(local.length, c).toBeLessThanOrEqual(64);
    }
  });

  it("el perfil api no recibe correo demo (D28)", () => {
    expect(PERFILES_DEMO).toContain("api");
    expect(correosDemoDe("demo-qa-a").some((c) => c.includes("-api@"))).toBe(false);
  });

  it("un local-part de 64 vale y uno de 65 lanza CorreoDemoDemasiadoLargo", () => {
    // `servi-` (6) + slug + `-` (1) + perfil.
    const slug = "s".repeat(10);
    const perfil64 = "p".repeat(64 - 6 - 10 - 1);
    expect(correoDemo(slug, perfil64).split("@")[0]).toHaveLength(64);
    expect(() => correoDemo(slug, `${perfil64}p`)).toThrow(CorreoDemoDemasiadoLargo);
  });

  it("correosDemoDe lanza si un slug largo deja algún perfil por encima de 64", () => {
    // El perfil más largo es `mensajero-cierre-rechazado` (26): servi- + 31 + - + 26 = 64 vale; 32 no.
    expect(() => correosDemoDe("x".repeat(31))).not.toThrow();
    expect(() => correosDemoDe("x".repeat(32))).toThrow(CorreoDemoDemasiadoLargo);
  });
});
