import type { CierreEstado } from "@/lib/types/cierre";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { AlcanceLecturaBodega } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";

/**
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (R387-R389) — UN cierre del dia de un
 * cierre de bodega, con sus gestiones congeladas, tal como lo necesita la descarga. Todos los campos
 * son OBLIGATORIOS: un campo opcional que un camino no puebla se lee como «no hay».
 */
export interface CierreDiaDeBodegaLoteRow {
  cierreBodegaId: string;
  cierreDiaId: string;
  estado: CierreEstado;
  /** `P` — `cierre_dia.total_pago_mensajero`, snapshot (STRING escala 2). */
  totalPagoMensajero: string;
  /** `E` — `cierre_dia.total_efectivo`, snapshot (STRING escala 2). */
  totalEfectivo: string;
  /** SLT-123: la regla de pago del cierre. */
  pagoIndependienteEfectivo: boolean;
  /** Gestiones de este cierre con al menos un ajuste del pago (SLT-56). */
  gestionesAjustadas: number;
  /** Mismo mapper que el detalle del cierre de bodega (`toPendienteRowDesdeSnapshot`). */
  gestiones: CierreGestionPendienteRow[];
}

/**
 * SLT-141 (R389) — lectura en lote de los cierres del dia de VARIOS cierres de bodega: un numero fijo
 * de consultas sea cual sea N, con el alcance de quien descarga dentro del `WHERE`. Solo lectura.
 */
export interface ICifrasBodegaLoteLectura {
  /** Cierres del dia (y sus gestiones congeladas) de los cierres de bodega `ids` DENTRO del alcance. */
  leerCierresDiaDeBodegas(
    ids: readonly string[],
    alcance: AlcanceLecturaBodega,
    /** La zona horaria del pais de la empresa, con la que se fecha cada gestion. */
    zona: string,
  ): Promise<CierreDiaDeBodegaLoteRow[]>;
}
