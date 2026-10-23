import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RolValue } from "@prisma/client";

import { altaEmpresaAction } from "@/lib/actions/organizaciones";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-17 / T2.8 (design §7.7) — R48: la action de alta solo la ejecuta el superadmin de SL-32, y
// mientras `lib/auth/plataforma.ts` no exista no la ejecuta NADIE. El servicio es un doble que
// cuenta llamadas: si se llama una sola vez para un actor no autorizado, el test lo ve.

const ENTRADA = {
  nombre: "Envíos del Sur",
  slug: "envios-del-sur",
  maestro: { nombre: "Lucía", email: "lucia@ejemplo.test", telefono: "88887777", documento: "112223333", tipoDocumento: "cedula" },
};

function servicioDoble() {
  const altaEmpresa = vi.fn(async () => ({ estado: "creada" as const, organizacionId: "o", maestroId: "u" }));
  const service: IOrganizacionService = { altaEmpresa };
  return { service, altaEmpresa };
}

// Todos los valores reales de `RolValue` (db/schema.prisma). `satisfies` hace que añadir un rol
// al enum sin listarlo aquí no compile.
const ROLES = {
  maestro: true,
  admin: true,
  mensajero: true,
  adminTienda: true,
  adminSatelite: true,
  apiKey: true,
} satisfies Record<RolValue, true>;

describe("R48 — todo actor que no es superadmin recibe «no autorizado» sin llamar al servicio", () => {
  it.each(Object.keys(ROLES) as RolValue[])("rol %s", async (rol) => {
    const { service, altaEmpresa } = servicioDoble();
    const actor: Actor = { usuarioId: `u-${rol}`, rol };
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => actor, service });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("sin sesión", async () => {
    const { service, altaEmpresa } = servicioDoble();
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => null, service });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("sin lib/auth/plataforma.ts, también un supuesto superadmin", async () => {
    // Si SL-32 ya está en el árbol, este caso no aplica: lo cubre la guardia de abajo.
    if (existsSync(RUTA_PLATAFORMA)) return expect(importaPlataforma(leer(RUTA_EXIGIR))).toBe(true);
    const { service, altaEmpresa } = servicioDoble();
    const superadmin = { usuarioId: "u-super", rol: "superadmin" as RolValue };
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => superadmin, service });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Guardia del punto de enganche con SL-32                                     */
/* -------------------------------------------------------------------------- */

const RAIZ = path.resolve(__dirname, "../../..");
const RUTA_PLATAFORMA = path.join(RAIZ, "lib/auth/plataforma.ts");
const RUTA_EXIGIR = path.join(RAIZ, "lib/auth/exigir-superadmin.ts");

function leer(ruta: string): string {
  return readFileSync(ruta, "utf8");
}

/** Un import real (no un comentario) de `lib/auth/plataforma`, por alias o relativo. */
function importaPlataforma(texto: string): boolean {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /\bfrom\s+["'](?:@\/lib\/auth\/|\.\/)plataforma(?:\.ts)?["']/.test(sinComentarios);
}

/** La regla: si `plataforma.ts` existe, el enganche lo importa. */
function enganchePendiente(existePlataforma: boolean, textoExigir: string): boolean {
  return existePlataforma && !importaPlataforma(textoExigir);
}

describe("R48 — guardia: el enganche no se queda en `false` por olvido", () => {
  it("en el árbol real: si lib/auth/plataforma.ts existe, exigir-superadmin.ts lo importa", () => {
    expect(existsSync(RUTA_EXIGIR)).toBe(true);
    expect(enganchePendiente(existsSync(RUTA_PLATAFORMA), leer(RUTA_EXIGIR))).toBe(false);
  });

  it("hoy, sin plataforma.ts, el enganche lleva su marca de pendiente", () => {
    if (existsSync(RUTA_PLATAFORMA)) return;
    expect(leer(RUTA_EXIGIR)).toContain("// SL-32: sustituir por esPlataforma de lib/auth/plataforma.ts");
  });

  it("autocomprobación: detecta el olvido con el texto de hoy si plataforma.ts existiera", () => {
    const olvidado = `import type { Actor } from "@/lib/interfaces/services/IOrdenService";
// SL-32: sustituir por esPlataforma de lib/auth/plataforma.ts
// import { esPlataforma } from "@/lib/auth/plataforma";
export function exigirSuperadmin(actor: Actor | null): boolean { return false; }`;
    expect(enganchePendiente(true, olvidado)).toBe(true);
    expect(enganchePendiente(true, leer(RUTA_EXIGIR))).toBe(!importaPlataforma(leer(RUTA_EXIGIR)));
  });

  it("autocomprobación: acepta el enganche hecho, por alias o relativo", () => {
    expect(enganchePendiente(true, `import { esPlataforma } from "@/lib/auth/plataforma";`)).toBe(false);
    expect(enganchePendiente(true, `import { esPlataforma } from './plataforma';`)).toBe(false);
  });
});
