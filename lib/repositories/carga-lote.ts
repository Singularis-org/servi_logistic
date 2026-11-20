// Feature 141 (design §4.1) — helper transaccional del LOTE de carga masiva, mismo patron
// que `appendCambioEstado(tx, ...)`: una funcion pura que opera sobre el `tx` de la
// transaccion EN CURSO, para que resolver el lote y escribir las ordenes sean atomicos (R34).
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import {
  CargaLoteAjenoError,
  CargaNombreDuplicadoError,
} from "@/lib/interfaces/repositories/IOrdenRepository";

/** Cara del `tx` que necesita el helper: solo el delegate de `carga`. */
export type CargaTxClient = Pick<PrismaClient, "carga">;

/** Indice unico compuesto (usuario_carga, name) de `carga`. */
const INDICE_NOMBRE_POR_USUARIO = "carga_usuario_carga_name_key";

export interface EnsureCargaParams {
  /**
   * Token de lote EMITIDO POR EL SERVIDOR en una peticion anterior, o `null` para CREAR el
   * lote aqui. NUNCA se inserta una fila con un id entrante (R15).
   */
  id: string | null;
  /** `carga.usuario_carga` esperado: el actor de la carga (R2/R31). */
  usuarioCargaId: string;
  /** `carga.total_files`: tamano TOTAL del lote (R7/R29/R32). Solo lo escribe la creacion. */
  totalFiles: number;
  /** `carga.name` opcional del usuario (R8/R21/R22). Solo lo escribe la creacion (R23). */
  name?: string | null;
}

/**
 * ¿El error es la violacion del unico compuesto (usuario_carga, name)?
 *
 * SLT-93: con `@prisma/adapter-pg` el P2002 NO trae columnas en `meta.target` (llega
 * «(not available)»); el nombre del indice viene en `meta.driverAdapterError`. Se lee con
 * `textoConstraintP2002`, que une las dos formas (nativa y adapter), igual que el resto de
 * repositorios. Antes se miraba solo `meta.target` y el duplicado escapaba como 500.
 */
function esNombreDuplicado(err: unknown): boolean {
  const texto = textoConstraintP2002(err);
  if (texto === null) return false;
  // Adapter: nombre del indice. Motor nativo: lista de columnas `usuario_carga,name`.
  return texto.includes(INDICE_NOMBRE_POR_USUARIO) || texto.includes("usuario_carga,name");
}

/**
 * Resuelve la fila de `carga` del lote dentro de la transaccion en curso y devuelve su id.
 * DOS ramas EXCLUYENTES (gate F1.4-7):
 *
 * 1. `id === null` → **CREACION**: el id lo genera el SERVIDOR (`randomUUID()`), nunca el
 *    cliente (R15/R16). Persiste `name`, `usuario_carga` y `total_files`. Si el actor ya
 *    tiene un lote con ese `name`, el unico compuesto revienta y se traduce a
 *    `CargaNombreDuplicadoError` (R24): la `$transaction` del call-site revierte, de modo que
 *    no queda ni el lote ni las ordenes de esa peticion.
 * 2. `id !== null` → **REUTILIZACION**: SOLO lectura (R17). Un id desconocido o de otro
 *    usuario lanza `CargaLoteAjenoError` (→ 403, R19). No se reescriben `name` ni
 *    `total_files` (R23/R29), y jamas se inserta una fila con el id recibido (R15).
 *
 * El llamador DEBE invocarlo solo cuando el batch tiene al menos una orden por insertar: asi
 * no nacen lotes huerfanos (R28/R35).
 */
export async function ensureCargaEnTx(
  tx: CargaTxClient,
  params: EnsureCargaParams,
): Promise<string> {
  if (params.id === null) return crearCarga(tx, params);
  return reutilizarCarga(tx, params.id, params.usuarioCargaId);
}

async function crearCarga(tx: CargaTxClient, params: EnsureCargaParams): Promise<string> {
  const id = randomUUID(); // R15: SIEMPRE server-side
  const name = params.name ?? null; // R22: sin nombre -> NULL
  try {
    await tx.carga.create({
      data: {
        id,
        usuarioCarga: params.usuarioCargaId,
        name,
        totalFiles: params.totalFiles,
        // `downloadUrl` NO se envia aqui: la escribe, si procede, la generacion de etiquetas
        // POST-COMMIT de la via API key (R47); en la via sesion queda NULL (R40).
      },
    });
  } catch (err) {
    if (name !== null && esNombreDuplicado(err)) throw new CargaNombreDuplicadoError(name);
    throw err;
  }
  return id;
}

async function reutilizarCarga(
  tx: CargaTxClient,
  id: string,
  usuarioCargaId: string,
): Promise<string> {
  const fila = await tx.carga.findUnique({ where: { id }, select: { usuarioCarga: true } });
  // Id desconocido y lote ajeno comparten error (y respuesta 403): no se revela si existe.
  if (fila === null || fila.usuarioCarga !== usuarioCargaId) throw new CargaLoteAjenoError(id);
  return id;
}
