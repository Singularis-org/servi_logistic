import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { ErrorDeLinea, ResumenCargaPorProfundidad } from "@/lib/types/division-csv";

// SL-20 (design §6; R24–R28) — el contrato de la carga de la division geografica de un pais por CSV.
//
// `unauthenticated` no aparece: lo resuelve la Server Action antes de llamar al servicio, como en el
// resto de la geografia.

/** El archivo tal como llega del formulario: su nombre (por la extension) y sus bytes. */
export interface ArchivoDivision {
  nombre: string;
  bytes: Uint8Array;
}

export type CargarDivisionServiceResult =
  /**
   * Escrito, en una sola transaccion (R24). `avisos` dice lo que se ignoro sin ser un error: hoy,
   * las columnas que el formato no conoce (decision 4 de SL-20). SLT-46 (R33): `creados` va por
   * profundidad (claves 1..P); la pantalla lo nombra con el plural de cada tipo.
   */
  | ({ status: "ok"; avisos: string[] } & ResumenCargaPorProfundidad)
  /** Una o mas filas invalidas: no se escribio nada (R25). `errores` va recortado; `total` no. */
  | { status: "invalido"; errores: ErrorDeLinea[]; total: number; avisos: string[] }
  /**
   * El archivo entero no sirve (R28): extension, tamaño, codificacion, columnas (las de los P tipos
   * del pais, SLT-46 R30) o filas.
   */
  | { status: "archivo_rechazado"; motivo: string }
  /** El pais no existe. */
  | { status: "not_found" }
  | { status: "forbidden" };

export interface ICargaDivisionService {
  /**
   * Carga para `paisId` los nodos que falten, a P profundidades (SLT-46, R33). Todo o nada: con un
   * error no se escribe nada. No renombra, no reactiva y no cambia codigos que ya existen (R26).
   */
  cargar(
    paisId: string,
    archivo: ArchivoDivision,
    actor: Actor,
  ): Promise<CargarDivisionServiceResult>;
}
