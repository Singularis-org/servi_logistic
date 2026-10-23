"use server";

import { z } from "zod";

import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import type {
  ActualizarDistritosEspecialesServiceResult,
  IDistritoZonaEspecialService,
} from "@/lib/interfaces/services/IDistritoZonaEspecialService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { distritosEspecialesSchema } from "@/lib/types/distrito-zona-especial";
import type {
  CambiarActivacionGeograficaServiceResult,
  ContarOrdenesSinEntregarServiceResult,
  CrearNodoGeograficoServiceResult,
  IGeografiaService,
  ListarArbolGeograficoServiceResult,
  RenombrarNodoGeograficoServiceResult,
} from "@/lib/interfaces/services/IGeografiaService";
import {
  cambiarActivacionGeograficaSchema,
  crearNodoGeograficoSchema,
  nodoGeograficoSchema,
  renombrarNodoGeograficoSchema,
} from "@/lib/types/geografia-nodo";

// Catalogo geografico global (provincia -> canton -> distrito).
//
// ⚠️ FICHA 374 — YA NO ES DE SOLO LECTURA. La cabecera anterior decia, con todas sus letras, que
// «el catalogo en si es de solo lectura» y que por eso se toleraba el Prisma directo. Esa premisa
// muere con la primera escritura: desde esta ficha el catalogo se administra desde la app, asi que
// la lectura del arbol tambien pasa por la cadena de siempre —Server Action -> `GeografiaService`
// -> `GeoRepository`— y este archivo deja de tocar Prisma para eso.
//
// SL-38 — ya no queda ninguna excepcion: `actualizarDistritosEspeciales`, al final del archivo, era
// la ultima escritura con Prisma directo, y pasa por `DistritoZonaEspecialService` ->
// `DistritoZonaEspecialRepository` desde que la marca es de la empresa.
//
// ⚠️ NO HAY NINGUNA ACCION DE BORRADO (R5): quitar un nodo es DESACTIVARLO. Ver el porque en
// `lib/interfaces/repositories/IGeoRepository.ts`.
//
// ⚠️ FICHA 375 — EL RENOMBRADO YA EXISTE (`renombrarNodoGeografico`), y solo porque el catalogo
// gano una clave estable (`codigo_dta`). Mientras el nombre hacia de clave, renombrar duplicaba el
// nodo en la siguiente corrida de `scripts/seed-zonas.ts`.

// Los DTO del arbol viven en `lib/types/geografia-nodo.ts` desde la ficha 374 —los produce
// `GeoRepository`, y un repositorio no puede importar un modulo `"use server"`—. Se RE-EXPORTAN
// aqui para que ningun consumidor tenga que cambiar su import.
export type {
  CantonArbolDTO,
  DistritoArbolDTO,
  ProvinciaArbolDTO,
} from "@/lib/types/geografia-nodo";

/**
 * Dependencias inyectables del borde (patron `VehiculoActionDeps`). Existen para poder probar las
 * cuatro acciones SIN base y sin sesion, no para cambiar el comportamiento en produccion.
 */
export interface GeografiaActionDeps {
  geografiaService?: IGeografiaService;
  getActor?: () => Promise<Actor | null>;
}

/**
 * EL COMPOSITION ROOT. Es el UNICO sitio del sistema que construye el servicio, y por tanto el
 * unico que le pasa sus DOS repositorios.
 *
 * ⚠️ EL SEGUNDO ARGUMENTO NO ES DECORATIVO: sin `OrdenRepository`, el conteo de ordenes sin
 * entregar de R60 reventaria en la primera confirmacion de desactivar, en produccion y no en
 * ningun test —los tests de servicio inyectan sus propios dobles—. Comprobar que el modulo lo
 * IMPORTA no basta; hay que comprobar que alguien lo PASA, y eso lo fija
 * `tests/unit/actions/geografia.composition-root.test.ts`.
 */
function buildGeografiaService(): IGeografiaService {
  const prisma = getPrismaClient();
  return new GeografiaService(new GeoRepository(prisma), new OrdenRepository(prisma));
}

/** Traduce el ZodError del borde a `validation_error` con los errores por campo. */
function errorDeValidacion(error: z.ZodError): {
  status: "validation_error";
  fieldErrors: Record<string, string[]>;
} {
  return {
    status: "validation_error",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

// ── Lectura del arbol ────────────────────────────────────────────────────────────────────────

export type ArbolGeograficoResult =
  | ListarArbolGeograficoServiceResult
  | { status: "unauthenticated" };

/**
 * Devuelve el arbol geografico COMPLETO —activos e inactivos— ordenado alfabeticamente en cada
 * nivel. Autoriza solo al rol `maestro` (misma puerta que /configuracion).
 *
 * CONSERVA SU FIRMA: lo llaman `app/(app)/configuracion/tarifas/page.tsx` y
 * `ZonasTarifasModule.tsx` sin argumentos, y siguen compilando. `deps` es opcional y solo sirve
 * para probarlo sin base.
 */
export async function listarArbolGeografico(
  deps: GeografiaActionDeps = {},
): Promise<ArbolGeograficoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  const service = deps.geografiaService ?? buildGeografiaService();
  return service.listarArbol(actor);
}

// ── Alta ─────────────────────────────────────────────────────────────────────────────────────

export type CrearNodoGeograficoResult =
  | CrearNodoGeograficoServiceResult
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };

/**
 * Alta de una provincia, un canton o un distrito (solo `maestro`).
 *
 * UNA accion para los tres niveles, no tres: el nivel viaja como dato de un vocabulario cerrado y
 * la `discriminatedUnion` mantiene el borde igual de estricto. Tres cuerpos identicos serian dos
 * sitios mas donde olvidar la comprobacion de rol.
 */
export async function crearNodoGeografico(
  input: unknown,
  deps: GeografiaActionDeps = {},
): Promise<CrearNodoGeograficoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" }; // R23

  const parsed = crearNodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error); // R25

  const service = deps.geografiaService ?? buildGeografiaService();
  try {
    return await service.crear(parsed.data, actor);
  } catch {
    // R18 — El UNIQUE de la base es la ultima palabra: si dos altas simultaneas pasan la
    // comprobacion del service, una de las dos falla aqui y se cuenta como conflict en vez de
    // escapar como error crudo de Postgres.
    return { status: "conflict" };
  }
}

// ── Activacion ───────────────────────────────────────────────────────────────────────────────

export type CambiarActivacionGeograficaResult =
  | CambiarActivacionGeograficaServiceResult
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };

/**
 * Desactiva o reactiva un nodo del catalogo (solo `maestro`).
 *
 * `activo` es el estado DESEADO, no un toggle: pedir el estado en el que el nodo ya esta devuelve
 * `ok` sin escribir nada (R21). Esta escritura NO toca a ningun descendiente (R8) ni a
 * `zona_distrito` (R50).
 */
export async function cambiarActivacionGeografica(
  input: unknown,
  deps: GeografiaActionDeps = {},
): Promise<CambiarActivacionGeograficaResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };

  const parsed = cambiarActivacionGeograficaSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);

  const service = deps.geografiaService ?? buildGeografiaService();
  return service.cambiarActivacion(parsed.data, actor);
}

// ── Renombrado (ficha 375) ───────────────────────────────────────────────────────────────────

export type RenombrarNodoGeograficoResult =
  | RenombrarNodoGeograficoServiceResult
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };

/**
 * FICHA 375 — cambia el NOMBRE de un nodo del catalogo (solo `maestro`).
 *
 * POR QUE ESTA ACCION NO EXISTIA HASTA HOY, y no era una omision: la ficha 374 la dejo fuera porque
 * `scripts/seed-zonas.ts` resolvia la geografia por NOMBRE y creaba lo que no encontraba, asi que
 * renombrar habria hecho que la siguiente corrida del seed creara un duplicado ACTIVO con el nombre
 * viejo — y a partir de ahi toda carga masiva que lo mencionara moriria con «distrito ambiguo en el
 * canton». Lo que lo desbloquea es `codigo_dta`: con una clave estable el seed cruza por codigo y
 * el nombre pasa a ser una etiqueta mutable.
 *
 * Renombrar a SU PROPIO nombre devuelve `ok` —guardar sin cambios tiene que seguir funcionando—;
 * al de un HERMANO devuelve `conflict`.
 */
export async function renombrarNodoGeografico(
  input: unknown,
  deps: GeografiaActionDeps = {},
): Promise<RenombrarNodoGeograficoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };

  const parsed = renombrarNodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);

  const service = deps.geografiaService ?? buildGeografiaService();
  try {
    return await service.renombrar(parsed.data, actor);
  } catch {
    // El UNIQUE de la base es la ultima palabra: si dos renombrados simultaneos pasan la
    // comprobacion del service, uno de los dos falla aqui y se cuenta como conflict en vez de
    // escapar como error crudo de Postgres. Mismo `catch` que el alta.
    return { status: "conflict" };
  }
}

// ── El dato de la confirmacion (R60) ─────────────────────────────────────────────────────────

export type ContarOrdenesSinEntregarDeNodoResult =
  | ContarOrdenesSinEntregarServiceResult
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };

/**
 * SOLO LECTURA: cuantas ordenes sin entregar cuelgan del nodo. Alimenta la confirmacion de
 * desactivar y NUNCA escribe.
 *
 * Es informacion para decidir, no una condicion de la operacion: si esta llamada falla, la
 * pantalla lo dice y NO bloquea (R62). Un conteo caido que impidiera retirar un distrito
 * convertiria un dato de cortesia en un bloqueo.
 */
export async function contarOrdenesSinEntregarDeNodo(
  input: unknown,
  deps: GeografiaActionDeps = {},
): Promise<ContarOrdenesSinEntregarDeNodoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };

  const parsed = nodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);

  const service = deps.geografiaService ?? buildGeografiaService();
  return service.contarOrdenesSinEntregar(parsed.data, actor);
}

// ── Marca de zona especial (SL-38) ───────────────────────────────────────────────────────────
//
// La marca es de la EMPRESA (`distrito_zona_especial`), no del distrito: escribirla no toca la
// geografia, que es de plataforma (SL-17 R40). Conserva nombre, entrada y resultado porque la llaman
// `CrearZonaForm` y la mockean seis tests de componentes.

/** Dependencias inyectables de `actualizarDistritosEspeciales`, con el patron de `GeografiaActionDeps`. */
export interface DistritosEspecialesActionDeps {
  distritoZonaEspecialService?: IDistritoZonaEspecialService;
  getActor?: () => Promise<Actor | null>;
}

/**
 * El composition root de la marca. El repositorio que recibe es el que escribe: un servicio
 * construido sin el compilaria igual si el parametro se volviera opcional, y lo mide
 * `tests/unit/actions/distritos-especiales-action.test.ts` llamando a la accion sin servicio.
 */
function buildDistritoZonaEspecialService(): IDistritoZonaEspecialService {
  return new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(getPrismaClient()));
}

export type ActualizarDistritosEspecialesResult =
  | ActualizarDistritosEspecialesServiceResult
  | { status: "unauthenticated" };

/**
 * Guarda la marca de zona especial de la empresa del actor para un lote de distritos. Recibe el
 * DELTA (lo que cambio en el formulario), no el estado completo: asi dos zonas abiertas a la vez no
 * se pisan la marca de los distritos que ninguna toco.
 *
 * La marca es del distrito PARA LA EMPRESA: queda visible desde cualquier zona de la empresa que lo
 * contenga, y el llamador refresca el arbol para verlo. Solo `maestro` (lo decide el servicio).
 */
export async function actualizarDistritosEspeciales(
  input: unknown,
  deps: DistritosEspecialesActionDeps = {},
): Promise<ActualizarDistritosEspecialesResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" }; // R11

  const parsed = distritosEspecialesSchema.safeParse(input);
  if (!parsed.success) return { status: "validation_error" }; // R12

  const service = deps.distritoZonaEspecialService ?? buildDistritoZonaEspecialService();
  return service.actualizar(parsed.data, actor);
}
