import { z } from "zod";

import type { FilaHistorialMora } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { EstadoMora, FacturaVencida } from "@/lib/planes/mora";
import { GRACIA_MAX, GRACIA_MIN, MOTIVO_MAX } from "@/lib/planes/mora";

// SLT-121 (design §5.3, §5.4) — los contratos del borde de la mora: lo que reciben y devuelven el servicio y las
// actions. Los tipos del dominio viven en `lib/planes/mora.ts` (puro, lo comparten la corrida y los correos) y en
// `IMoraEmpresaRepository`; aquí se reexportan para que las pantallas importen de un solo sitio.

export type { EstadoMora, FacturaVencida, FilaMora, OrganizacionMora } from "@/lib/planes/mora";
export type { FilaHistorialMora } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";

/* -------------------------------------------------------------------------- */
/* Entradas (zod)                                                              */
/* -------------------------------------------------------------------------- */

export const moraDeEmpresaSchema = z.object({ organizacionId: z.uuid() });

/** R3: un entero de 1 a 60, o `null` para volver a la global. */
export const fijarGraciaSchema = z.object({
  organizacionId: z.uuid(),
  dias: z.int().min(GRACIA_MIN).max(GRACIA_MAX).nullable(),
});

/** SLT-255 R6: el motivo recortado, de 1 a 200 caracteres. */
const motivoSchema = z.string().trim().min(1).max(MOTIVO_MAX);

/**
 * SLT-255 R6 (el `descongelarSchema` de SLT-121 con otro nombre): el motivo y `hasta`, una fecha de calendario real.
 * Su rango (hoy … hoy + 60) depende del «ahora» de la plataforma y lo comprueba el servicio.
 */
export const darPlazoSchema = z.object({
  organizacionId: z.uuid(),
  motivo: motivoSchema,
  hasta: z.iso.date(),
});

/** SLT-255 R5, R6: quitar la prórroga solo pide el motivo. */
export const quitarPlazoSchema = z.object({
  organizacionId: z.uuid(),
  motivo: motivoSchema,
});

/* -------------------------------------------------------------------------- */
/* Salidas                                                                     */
/* -------------------------------------------------------------------------- */

/** Una factura cerrada con saldo, como la pinta la sección del superadmin (R32). */
export interface FacturaConSaldoVista {
  facturaId: string;
  numero: number;
  /** `AAAA-MM-DD`, calendario de la plataforma. */
  fechaLimite: string;
  /** Importe con dos decimales. */
  saldo: string;
  vencida: boolean;
}

/** Lo que la sección «Plazo de pago y mora» del detalle de empresa necesita (R31, R32). */
export interface MoraEmpresaVista {
  gracia: {
    /** La vigente: la propia o la global. */
    dias: number;
    origen: "propia" | "global";
    /** `null` = rige la global. */
    propia: number | null;
    global: number;
  };
  estado: EstadoMora;
  /** Las cerradas con saldo, vencidas o no, por fecha límite. */
  facturas: FacturaConSaldoVista[];
  /** Las vencidas con saldo, también durante un plazo (el `EstadoMora` `con_plazo` no las trae). */
  facturasVencidas: FacturaVencida[];
  /**
   * SLT-255 R6, R13: el rango que acepta «Dar plazo hasta…» (hoy … hoy + 60), el valor por defecto del diálogo (el
   * plazo vigente, o hoy + 7) y el plazo vigente, o `null`. Todo `AAAA-MM-DD`.
   */
  plazo: { desde: string; hasta: string; porDefecto: string; vigente: string | null };
  historial: FilaHistorialMora[];
}

type Forbidden = { estado: "forbidden" };
type NotFound = { estado: "not_found" };
type ErrorDeValidacion = { estado: "validation_error"; errores: Record<string, string> };

export type MoraDeEmpresaResult = { estado: "ok"; datos: MoraEmpresaVista } | Forbidden | NotFound;

export type FijarGraciaResult = { estado: "ok" } | { estado: "sin_cambio" } | Forbidden | NotFound | ErrorDeValidacion;

/** SLT-255 R2-R4: la empresa se descongeló, quedó con prórroga, o ya tenía esa misma fecha. */
export type DarPlazoResult =
  | { estado: "descongelada" }
  | { estado: "prorroga" }
  | { estado: "sin_cambio" }
  | Forbidden
  | NotFound
  | ErrorDeValidacion;

/** SLT-255 R5: `sin_plazo` si no había prórroga vigente o la empresa está congelada. */
export type QuitarPlazoResult = { estado: "ok" } | { estado: "sin_plazo" } | Forbidden | NotFound | ErrorDeValidacion;
