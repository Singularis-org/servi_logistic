import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { ErrorDeLinea, ResumenCarga } from "@/lib/types/division-csv";

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
   * las columnas que el formato no conoce (decision 4 de SL-20).
   */
  | ({ status: "ok"; avisos: string[] } & ResumenCarga)
  /** Una o mas filas invalidas: no se escribio nada (R25). `errores` va recortado; `total` no. */
  | { status: "invalido"; errores: ErrorDeLinea[]; total: number; avisos: string[] }
  /** El archivo entero no sirve (R28): extension, tamaño, codificacion, columnas o filas. */
  | { status: "archivo_rechazado"; motivo: string }
  /** El pais no existe. */
  | { status: "not_found" }
  | { status: "forbidden" };

export interface ICargaDivisionService {
  /**
   * Carga para `paisId` las provincias, cantones y distritos que falten. Todo o nada: con un error
   * no se escribe nada. No renombra, no reactiva y no cambia codigos que ya existen (R26).
   */
  cargar(
    paisId: string,
    archivo: ArchivoDivision,
    actor: Actor,
  ): Promise<CargarDivisionServiceResult>;
}
