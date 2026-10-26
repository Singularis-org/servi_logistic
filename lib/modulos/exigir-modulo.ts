import type { ModuloApagable } from "@prisma/client";
import { notFound } from "next/navigation";
import { cache } from "react";

import { esPlataforma } from "@/lib/auth/plataforma";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ModuloInactivoError } from "@/lib/modulos/modulo-inactivo-error";
import { ModulosActivosRepository } from "@/lib/repositories/ModulosActivosRepository";

// SL-23 (design §5.1; R9, R16, R17, R33) — las puertas de lectura de un módulo. La empresa sale del
// contexto (`conEmpresa`) o de la sesión, nunca de un argumento: el cliente no puede elegirla.
//
// `cache()` de React memoriza la lista DENTRO de una petición (el layout, la página y sus actions la
// piden varias veces). No hay memo entre peticiones, a diferencia de `empresaDeLaPeticion`: la empresa
// de una sesión no cambia, pero sus módulos sí, y el cambio del superadmin vale desde la siguiente
// petición (R9).
//
// SIN EMPRESA LA PUERTA NO APLICA (R34). Sin sesión, o con el superadmin, no hay empresa: la lectura
// lanza `EmpresaNoResuelta` y `modulosActivos()` da `null`. Las puertas dejan pasar y responde la
// siguiente sentencia de la página o la action (`resolveActor`, el rol), como antes de SL-23: sin
// empresa no se lee ni escribe ningún dato de negocio, así que la puerta no abre nada.

/** Una clave, o las dos de una pieza compartida (§3.7). */
export type ClavesDeModulo = readonly [ModuloApagable, ...ModuloApagable[]];

const SIN_MODULOS: ReadonlySet<ModuloApagable> = new Set();

/** Los módulos encendidos de la empresa en curso, o `null` sin empresa (R34). El `null` también se memoriza. */
export const modulosActivos = cache(async (): Promise<ReadonlySet<ModuloApagable> | null> => {
  try {
    const activos = await new ModulosActivosRepository(getPrismaClient()).activos();
    return new Set(activos);
  } catch (e) {
    // Solo «sin empresa». Cualquier otro fallo de la lectura se propaga: tragárselo abriría la puerta.
    if (e instanceof EmpresaNoResuelta) return null;
    throw e;
  }
});

export async function moduloActivo(modulo: ModuloApagable): Promise<boolean> {
  return (await modulosActivos())?.has(modulo) ?? false;
}

/**
 * La primera clave apagada, en el orden pedido, o `null` si están todas encendidas o si no hay
 * empresa (R34).
 */
async function primeraApagada(modulos: ClavesDeModulo): Promise<ModuloApagable | null> {
  const activos = await modulosActivos();
  if (activos === null) return null;
  return modulos.find((m) => !activos.has(m)) ?? null;
}

/**
 * Para actions, la API y los jobs: con alguna clave apagada lanza `ModuloInactivoError` (403,
 * `details.codigo = "modulo_inactivo"`, `details.modulo` = la primera apagada).
 */
export async function exigirModuloActivo(...modulos: ClavesDeModulo): Promise<void> {
  const apagado = await primeraApagada(modulos);
  if (apagado) throw new ModuloInactivoError(apagado);
}

/** Para páginas: con alguna clave apagada responde la pantalla de no encontrado (R16). */
export async function exigirModuloEnRuta(...modulos: ClavesDeModulo): Promise<void> {
  if (await primeraApagada(modulos)) notFound();
}

/**
 * Lo que filtra el menú. El superadmin no tiene empresa y sin sesión no hay a quién preguntar: los
 * dos reciben un conjunto vacío SIN consulta. «Empresas» no lleva módulo, así que sigue visible.
 */
export async function modulosDelMenu(actor: Actor | null): Promise<ReadonlySet<ModuloApagable>> {
  if (!actor || esPlataforma(actor.rol)) return SIN_MODULOS;
  return (await modulosActivos()) ?? SIN_MODULOS;
}
