import type { ModuloApagable } from "@prisma/client";

import { esPlataforma } from "@/lib/auth/plataforma";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";

type PuertasDeModulo = typeof import("@/lib/modulos/exigir-modulo");

// SL-23 (design §10) — las puertas de módulo con todos encendidos, para los tests de páginas y
// actions que ya simulan la sesión y no van contra la base. Se usa así:
//
//   vi.mock("@/lib/modulos/exigir-modulo", async () =>
//     (await import("@/tests/fabricas/modulos")).puertasAbiertas());
//
// Devuelve el módulo entero (mismo tipo que el real): si la puerta gana una exportación, esto deja de
// compilar en vez de dejar un `undefined` en el test.

export function puertasAbiertas(): PuertasDeModulo {
  const todos: ReadonlySet<ModuloApagable> = new Set(ORDEN_MODULOS);
  const ninguno: ReadonlySet<ModuloApagable> = new Set();
  return {
    modulosActivos: async () => todos,
    moduloActivo: async () => true,
    exigirModuloActivo: async () => undefined,
    exigirModuloEnRuta: async () => undefined,
    primerModuloApagado: async () => null,
    modulosDelMenu: async (actor) => (!actor || esPlataforma(actor.rol) ? ninguno : todos),
  };
}
