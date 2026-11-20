import { describe, it, expect } from "vitest";
import { opcionesZonaUsuario, type ZonaDTO } from "@/lib/types/zona";

/**
 * SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» (R1756) — el selector
 * de zona del formulario de usuarios no ofrece zonas desactivadas, salvo la que el usuario ya tiene.
 */
function zona(id: string, activa: boolean): ZonaDTO {
  return { id, nombre: `Zona ${id}`, cobroVehiculo: false, distritosCount: 1, esCentral: false, activa };
}

const ZONAS = [zona("a", true), zona("kevin", false), zona("b", true), zona("vieja", false)];

describe("SLT-225 — opcionesZonaUsuario (R1756)", () => {
  it("opcionesZonaUsuario deja fuera las desactivadas salvo la actual", () => {
    expect(opcionesZonaUsuario(ZONAS, "kevin").map((z) => z.id)).toEqual(["a", "kevin", "b"]);
  });

  it("sin zona actual (alta) solo ofrece las activas, en el orden de entrada", () => {
    expect(opcionesZonaUsuario(ZONAS, null).map((z) => z.id)).toEqual(["a", "b"]);
  });

  it("una zona actual activa no añade nada ni duplica", () => {
    expect(opcionesZonaUsuario(ZONAS, "b").map((z) => z.id)).toEqual(["a", "b"]);
  });
});
