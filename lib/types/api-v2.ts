// SLT-45 (design §4.2, §4.3) — los cuerpos y las respuestas de la API v2.
//
// v2 cambia SOLO la ubicacion: la fila es la de v1 sin `provincia`/`canton`/`distrito` y con
// `ubicacion` (ruta de nombres) o `ubicacion_codigo` (codigo oficial). Lo demas —claves de texto,
// topes del lote, `name`, `download_type`— es el contrato de v1, y por eso se reutiliza en vez de
// copiarse.
import { z } from "zod";

import { cargaMasivaConfig } from "@/lib/config/carga-masiva";
import type { CargaViaApiOrden, CargaViaApiSummary } from "@/lib/interfaces/services/IBulkOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import type { ResolvedGeo } from "@/lib/services/geo-resolucion";
import {
  CLAVE_UBICACION,
  MSG_UBICACION_UNA_DE_LAS_DOS,
  type EntradaUbicacion,
  type UbicacionDTO,
  type UbicacionResuelta,
} from "@/lib/services/geo-ubicacion";
import {
  filaCotizacionSchema,
  type CotizacionFilaCotizada,
  type CotizacionResumen,
} from "@/lib/types/cotizacion";

export type { UbicacionDTO };

// ── Entrada (§4.2) ───────────────────────────────────────────────────────────────────────────────

/** Defensivo: hoy el maximo es 3 niveles y la epica no fija uno. */
export const MAX_NIVELES_UBICACION = 10;
const MAX_LARGO_NOMBRE = 200;
const MAX_LARGO_CODIGO = 64;

const MSG_LOTE_VACIO = "el lote no puede estar vacío";
const MSG_LOTE_EXCEDE = "el lote excede el máximo permitido";

/**
 * Una fila de v2. Las claves que no son de ubicacion son texto, como en v1 (`z.record` de textos):
 * un valor que no es texto, o una `ubicacion` que no es lista de textos, es 422 del lote. «Las dos o
 * ninguna» NO se rechaza aqui: es error de fila (R12), para que una fila mala no tumbe el lote.
 */
export const filaV2Schema = z
  .object({
    ubicacion: z
      .array(z.string().min(1, "cada nombre de ubicacion es obligatorio").max(MAX_LARGO_NOMBRE))
      .min(1, "ubicacion necesita al menos un nivel")
      .max(MAX_NIVELES_UBICACION, `ubicacion admite como maximo ${MAX_NIVELES_UBICACION} niveles`)
      .optional(),
    ubicacion_codigo: z.string().min(1, "ubicacion_codigo no puede estar vacio").max(MAX_LARGO_CODIGO).optional(),
  })
  .catchall(z.string());

/**
 * La fila ya validada. Se declara a mano porque el tipo que infiere zod de un `catchall` (indice de
 * textos + `ubicacion` lista) no admite literales en TS; la salida de `filaV2Schema` es asignable a el.
 */
export interface FilaV2 {
  ubicacion?: string[];
  ubicacion_codigo?: string;
  [campo: string]: string | string[] | undefined;
}

const ordenesV2 = z.array(filaV2Schema).min(1, MSG_LOTE_VACIO).max(cargaMasivaConfig.MAX_CHUNK_ROWS, MSG_LOTE_EXCEDE);

// `name` y `download_type` con las mismas reglas que el cuerpo de la carga v1.
const nombreDelLote = z.string().trim().min(1).max(120).optional();
const tipoDeDescarga = z.enum(["consolidate", "individual"]).optional().default("consolidate");

/** `POST /api/v2/ordenes/carga`. */
export const cargaV2BodySchema = z.object({ ordenes: ordenesV2, name: nombreDelLote, download_type: tipoDeDescarga });
export type CargaV2Body = z.infer<typeof cargaV2BodySchema>;

/** `POST /api/v2/ordenes`: una orden, que el pipeline trata como lote de una fila (R18). */
export const crearOrdenV2BodySchema = z.object({
  orden: filaV2Schema,
  name: nombreDelLote,
  download_type: tipoDeDescarga,
});
export type CrearOrdenV2Body = z.infer<typeof crearOrdenV2BodySchema>;

/** `POST /api/v2/ordenes/cotizacion`, con el tope de v1. */
export const cotizacionV2BodySchema = z.object({ ordenes: ordenesV2 });
export type CotizacionV2Body = z.infer<typeof cotizacionV2BodySchema>;

/** La fila de cotizacion de v1 sin la terna geografica: la ubicacion la resuelve el motor. */
export const filaCotizacionV2Schema = filaCotizacionSchema.omit({ provincia: true, canton: true, distrito: true });

// ── Fila interna ─────────────────────────────────────────────────────────────────────────────────

/** La fila no trae exactamente una de las dos formas de ubicacion (R12). */
export interface ErrorDeEntrada {
  tipo: "error";
  fieldErrors: Record<string, string[]>;
}

/** Como viaja la fila de v2 hasta los servicios (design §4.2). */
export interface FilaV2Interna {
  campos: RawRow;
  ubicacion: EntradaUbicacion | ErrorDeEntrada;
}

/** Separa la ubicacion de los campos de texto y aplica R12. */
export function aFilaInterna(fila: FilaV2): FilaV2Interna {
  const { ubicacion, ubicacion_codigo, ...resto } = fila;
  const campos = resto as RawRow;
  if ((ubicacion === undefined) === (ubicacion_codigo === undefined)) {
    return { campos, ubicacion: { tipo: "error", fieldErrors: { [CLAVE_UBICACION]: [MSG_UBICACION_UNA_DE_LAS_DOS] } } };
  }
  return {
    campos,
    ubicacion:
      ubicacion !== undefined ? { tipo: "ruta", nombres: ubicacion } : { tipo: "codigo", codigo: ubicacion_codigo as string },
  };
}

/**
 * La entrada del motor de una fila, con la direccion literal, o su error de R12. La forma coincide
 * con la del extractor de `BulkOrdenService` (`EntradaDelMotor` | el fallo de `GeoInput`).
 */
export function extraerUbicacionV2(
  fila: FilaV2Interna,
):
  | { ok: true; entrada: EntradaUbicacion; direccion: string }
  | { ok: false; fieldErrors: Record<string, string[]> } {
  if (fila.ubicacion.tipo === "error") return { ok: false, fieldErrors: fila.ubicacion.fieldErrors };
  return { ok: true, entrada: fila.ubicacion, direccion: (fila.campos.direccion ?? "").trim() };
}

/**
 * La ubicacion resuelta por el motor, en la forma que ya consumen la tarifa y la creacion
 * (`ResolvedGeo`): las 3 FK de `fksDeNodo` y la zona y marca del motor.
 */
export function geoDeUbicacion(u: UbicacionResuelta): ResolvedGeo {
  return {
    provinciaId: u.fks.provinciaId,
    cantonId: u.fks.cantonId,
    distritoId: u.fks.distritoId,
    zonaId: u.zona.id,
    esCentral: u.zona.esCentral,
    esZonaEspecial: u.esZonaEspecial,
  };
}

// ── Salida (§4.3) ────────────────────────────────────────────────────────────────────────────────

/** Una orden creada de v2: la de v1 + la ruta de su nodo (R17, R21). */
export type CargaViaApiOrdenV2 = CargaViaApiOrden & { ubicacion: UbicacionDTO[] };

/** El resumen de la carga v2: el de v1 con `ordenes[].ubicacion`. */
export type CargaViaApiSummaryV2 = Omit<CargaViaApiSummary, "ordenes"> & { ordenes: CargaViaApiOrdenV2[] };

/** Una fila cotizada de v2: la de v1 + la ruta de su nodo (R19, R21). */
export type CotizacionFilaCotizadaV2 = CotizacionFilaCotizada & { ubicacion: UbicacionDTO[] };

/** El resumen de la cotizacion v2: el de v1 con `filas[].ubicacion`. */
export type CotizacionResumenV2 = Omit<CotizacionResumen, "filas"> & { filas: CotizacionFilaCotizadaV2[] };
