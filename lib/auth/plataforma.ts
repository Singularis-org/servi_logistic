import type { RolValue } from "@prisma/client";

/**
 * SL-32 (R4) — la ÚNICA declaración de quién es plataforma: los roles que administran Servi
 * Logistic y no pertenecen a ninguna empresa. Quien autorice algo de plataforma (la pantalla
 * «Empresas», la action de alta, la gestión de la geografía, SL-25 y SL-26) lo pregunta aquí,
 * por import, nunca con un literal propio.
 *
 * Vive aparte de `acceso-total.ts` a propósito: `esAccesoTotal` responde «acceso total de
 * EMPRESA» (`maestro` y `admin`, con su dinero). Si las dos preguntas compartieran archivo, lo
 * natural sería añadir `superadmin` a `ROLES_ACCESO_TOTAL`, y eso le regalaría la caja de todas
 * las empresas. Lo vigila `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`.
 *
 * El `id` fijo de la fila `rol` vive solo en la migración (`20261023100100_seed_rol_superadmin`):
 * el código busca el rol por su valor.
 */
export const ROLES_PLATAFORMA = ["superadmin"] as const satisfies readonly RolValue[];

export type RolPlataforma = (typeof ROLES_PLATAFORMA)[number];

export function esPlataforma(rol: RolValue): boolean {
  return (ROLES_PLATAFORMA as readonly RolValue[]).includes(rol);
}
