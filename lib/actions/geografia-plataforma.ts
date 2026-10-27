"use server";

import { z } from "zod";

import { construirPaisService } from "@/lib/actions/_shared/paises-plataforma";
import { exigirSuperadmin } from "@/lib/auth/exigir-superadmin";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  CargarDivisionServiceResult,
  ICargaDivisionService,
} from "@/lib/interfaces/services/ICargaDivisionService";
import type {
  CambiarActivacionGeograficaServiceResult,
  ContarOrdenesSinEntregarServiceResult,
  CrearNodoGeograficoServiceResult,
  IGeografiaService,
  ListarArbolDePaisServiceResult,
  RenombrarNodoGeograficoServiceResult,
} from "@/lib/interfaces/services/IGeografiaService";
import type {
  CambiarDisponibilidadPaisServiceResult,
  CrearPaisServiceResult,
  IPaisService,
  ListarPaisesServiceResult,
} from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { esViolacionDeUnico } from "@/lib/repositories/_shared/prisma-unique";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import {
  cambiarActivacionGeograficaSchema,
  crearNodoGeograficoSchema,
  nodoGeograficoSchema,
  renombrarNodoGeograficoSchema,
} from "@/lib/types/geografia-nodo";
import { cambiarDisponibilidadPaisSchema, CODIGO_PAIS } from "@/lib/types/pais";

// SL-20 (design §4, §5; R21–R37, R47, R51, R52; D15) — el borde de los países y la geografía del
// superadmin. Todas las actions siguen el mismo orden: sesión → `exigirSuperadmin` → zod → servicio,
// y el servicio corre dentro de `comoPlataforma`. El superadmin no tiene empresa: sin ese contexto,
// el conteo de órdenes (`orden` es de negocio) caería en `EmpresaNoResuelta` (R32), y con él cuenta
// las órdenes de todas las empresas (R31). Por eso este archivo está en `EXCEPCIONES_DE_PLATAFORMA`.
//
// Los servicios vuelven a mirar `GESTION_ROLES`: la puerta de aquí es la primera, no la única (R37).
//
// `crearPaisAction` pasa la entrada tal cual al servicio: `crearPaisSchema` exige que el código esté
// en el catálogo ISO 3166-1 (R41) y el servicio pone el nombre del catálogo (R23).
//
// Errores (R36; decisión del humano en la tanda 4): las actions que escriben (altas, renombre,
// retiro, disponibilidad, carga) y el conteo de la confirmación responden `error` y dejan el log
// cuando la base falla. Solo el único violado de un alta o un renombre es `conflict`. El árbol y el
// listado de países no lo llevan: son la carga de la pantalla, y su fallo sube a la página.

const FICHA = "SL-20";
const MOTIVO =
  "gestión de países y geografía por el superadmin, que no tiene empresa; conteo de órdenes de todas las empresas (D15)";

/** Dependencias inyectables: existen para probar el borde sin base ni sesión. */
export interface GeografiaPlataformaDeps {
  getActor?: () => Promise<Actor | null>;
  geografiaService?: IGeografiaService;
  cargaDivisionService?: ICargaDivisionService;
  paisService?: IPaisService;
}

/**
 * EL COMPOSITION ROOT de la geografía del superadmin. El segundo repositorio no es decorativo: sin
 * `OrdenRepository` el conteo de R31 revienta en producción y en ningún test de servicio (lo fija
 * `geografia-plataforma.composition-root.test.ts`).
 */
function construirGeografiaService(): IGeografiaService {
  const prisma = getPrismaClient();
  return new GeografiaService(new GeoRepository(prisma), new OrdenRepository(prisma));
}

function construirCargaDivisionService(): ICargaDivisionService {
  return new CargaDivisionService(new GeoRepository(getPrismaClient()));
}

type SinPermiso = { status: "unauthenticated" } | { status: "forbidden" };
type ErrorDeValidacion = { status: "validation_error"; fieldErrors: Record<string, string[]> };
type ErrorInterno = { status: "error" };

/**
 * La puerta común, antes de validar nada: a un anónimo o a un rol de empresa no se le cuenta cómo es
 * el borde, y el servicio ni se construye (R37).
 */
async function puerta(deps: GeografiaPlataformaDeps): Promise<{ actor: Actor } | { corte: SinPermiso }> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (actor === null) return { corte: { status: "unauthenticated" } };
  if (!exigirSuperadmin(actor)) return { corte: { status: "forbidden" } };
  return { actor };
}

function errorDeValidacion(error: z.ZodError): ErrorDeValidacion {
  const { formErrors, fieldErrors } = error.flatten();
  return {
    status: "validation_error",
    fieldErrors: {
      ...(fieldErrors as Record<string, string[]>),
      ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
    },
  };
}

/** Solo el nombre del error: el mensaje de Postgres puede llevar los valores de la fila. */
function registrarFallo(operacion: string, contexto: string, error: unknown): ErrorInterno {
  const causa = error instanceof Error ? error.name : "desconocido";
  console.error(`[geografia-plataforma] fallo ${operacion} ${contexto} causa=${causa}`);
  return { status: "error" };
}

function enPlataforma<T>(fn: () => Promise<T>): Promise<T> {
  return comoPlataforma(FICHA, MOTIVO, fn);
}

// ── Países ───────────────────────────────────────────────────────────────────────────────────────

export type ListarPaisesActionResult = ListarPaisesServiceResult | SinPermiso;

/**
 * Todos los países dados de alta, disponibles o no (design §8: el selector los muestra todos).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function listarPaisesAction(deps: GeografiaPlataformaDeps = {}): Promise<ListarPaisesActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const servicio = deps.paisService ?? construirPaisService();
  return enPlataforma(() => servicio.listar(p.actor));
}

export type CrearPaisActionResult = CrearPaisServiceResult | SinPermiso | ErrorInterno;

/**
 * R23. La validación vive en el servicio (`crearPaisSchema`); un único violado en carrera ya vuelve
 * del repositorio como `conflict`. Cualquier otro fallo es `error` (R36).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function crearPaisAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<CrearPaisActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const servicio = deps.paisService ?? construirPaisService();
  try {
    return await enPlataforma(() => servicio.crear(input, p.actor));
  } catch (error) {
    return registrarFallo("alta de pais", "-", error);
  }
}

export type CambiarDisponibilidadPaisActionResult =
  | CambiarDisponibilidadPaisServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * R47. Pedir el estado que el país ya tiene es `ok` sin escribir; apagarlo no toca a sus empresas (R46).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function cambiarDisponibilidadPaisAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<CambiarDisponibilidadPaisActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = cambiarDisponibilidadPaisSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.paisService ?? construirPaisService();
  try {
    return await enPlataforma(() => servicio.cambiarDisponible(parsed.data, p.actor));
  } catch (error) {
    return registrarFallo("disponibilidad de pais", `pais=${parsed.data.id}`, error);
  }
}

// ── Árbol y nodos ────────────────────────────────────────────────────────────────────────────────

const arbolDePaisSchema = z.object({ paisId: z.string().regex(CODIGO_PAIS, "El país no es válido.") }).strict();

export type ArbolDePaisActionResult = ListarArbolDePaisServiceResult | ErrorDeValidacion | SinPermiso;

/**
 * R20, R29, R30: el árbol de un país, activos e inactivos, sin zonas.
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function arbolDePaisAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<ArbolDePaisActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = arbolDePaisSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.geografiaService ?? construirGeografiaService();
  return enPlataforma(() => servicio.listarArbolDePais(parsed.data.paisId, p.actor));
}

export type CrearNodoActionResult =
  | CrearNodoGeograficoServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * Alta de un nodo en cualquiera de los tres niveles (R29). Un nombre o un código repetido que el
 * servicio no vio (carrera, o el código, que solo frena el único de la base: R16, R52) es `conflict`;
 * cualquier otro fallo es `error` y queda en el log (R36).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function crearNodoAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<CrearNodoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = crearNodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.geografiaService ?? construirGeografiaService();
  try {
    return await enPlataforma(() => servicio.crear(parsed.data, p.actor));
  } catch (error) {
    if (esViolacionDeUnico(error)) return { status: "conflict" };
    return registrarFallo("alta de nodo", `nivel=${parsed.data.nivel}`, error);
  }
}

export type RenombrarNodoActionResult =
  | RenombrarNodoGeograficoServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * R30 (ficha 375): renombrar a su propio nombre es `ok`; al de un hermano, `conflict`. Mismo `catch` que el alta.
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function renombrarNodoAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<RenombrarNodoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = renombrarNodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.geografiaService ?? construirGeografiaService();
  try {
    return await enPlataforma(() => servicio.renombrar(parsed.data, p.actor));
  } catch (error) {
    if (esViolacionDeUnico(error)) return { status: "conflict" };
    return registrarFallo("renombrado de nodo", `nivel=${parsed.data.nivel}`, error);
  }
}

export type CambiarActivacionNodoActionResult =
  | CambiarActivacionGeograficaServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * R30: retira o reactiva UN nodo sin tocar a sus descendientes; pedir el estado que ya tiene es `ok`
 * sin escribir. Aquí no hay único que violar: un fallo de la base es `error` con log, como el alta (R36).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function cambiarActivacionNodoAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<CambiarActivacionNodoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = cambiarActivacionGeograficaSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.geografiaService ?? construirGeografiaService();
  try {
    return await enPlataforma(() => servicio.cambiarActivacion(parsed.data, p.actor));
  } catch (error) {
    return registrarFallo(parsed.data.activo ? "reactivacion de nodo" : "retiro de nodo", `nivel=${parsed.data.nivel}`, error);
  }
}

export type ContarOrdenesSinEntregarActionResult =
  | ContarOrdenesSinEntregarServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * R31: las órdenes sin entregar de TODAS las empresas que cuelgan del nodo. Solo lectura; si falla,
 * responde `error` con log (R36) y la pantalla lo dice sin bloquear el retiro.
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function contarOrdenesSinEntregarAction(
  input: unknown,
  deps: GeografiaPlataformaDeps = {},
): Promise<ContarOrdenesSinEntregarActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = nodoGeograficoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.geografiaService ?? construirGeografiaService();
  try {
    return await enPlataforma(() => servicio.contarOrdenesSinEntregar(parsed.data, p.actor));
  } catch (error) {
    return registrarFallo("conteo de ordenes", `nivel=${parsed.data.nivel}`, error);
  }
}

// ── Carga CSV ────────────────────────────────────────────────────────────────────────────────────

export type CargarDivisionActionResult =
  | CargarDivisionServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/** Lo que el borde necesita de un `File`: el nombre (por la extensión) y los bytes. */
interface ArchivoSubido {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function esArchivo(valor: FormDataEntryValue | null): valor is FormDataEntryValue & ArchivoSubido {
  return valor !== null && typeof valor !== "string" && typeof valor.arrayBuffer === "function";
}

/**
 * R24–R28, R48–R51. El contrato del servicio pasa tal cual (`ok`, `invalido`, `archivo_rechazado`,
 * `not_found`, `forbidden`, con `avisos`); un fallo de la base al escribir es `error`, y la carga ya
 * se deshizo entera (R51). El tamaño, la extensión y la codificación los decide el servicio (R28).
 * @sin-superficie SL-20 (tasks T5.3/T5.7, frontend): la pantalla `/plataforma/geografia` que la llama aún no existe; esta tanda es solo el servidor.
 */
export async function cargarDivisionAction(
  formData: FormData,
  deps: GeografiaPlataformaDeps = {},
): Promise<CargarDivisionActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;

  const parsed = arbolDePaisSchema.safeParse({ paisId: formData.get("paisId") });
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const archivo = formData.get("archivo");
  if (!esArchivo(archivo)) {
    return { status: "validation_error", fieldErrors: { archivo: ["Falta el archivo CSV."] } };
  }

  const paisId = parsed.data.paisId;
  const servicio = deps.cargaDivisionService ?? construirCargaDivisionService();
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    return await enPlataforma(() => servicio.cargar(paisId, { nombre: archivo.name, bytes }, p.actor));
  } catch (error) {
    return registrarFallo("carga de division", `pais=${paisId}`, error);
  }
}
