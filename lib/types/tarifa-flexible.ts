import { z } from "zod";
import type { TarifaNivel } from "@prisma/client";

import {
  CONCEPTOS_PAGO,
  CONCEPTOS_TIENDA,
  type ConceptoPago,
  type ConceptoTienda,
} from "@/lib/tarifas/catalogo";
import type { TarifaVigenteResuelta } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";

/**
 * SLT-52 (design §5, R3, R4, R23, R34, R45) — tipos del modelo nuevo de tarifas y su validacion
 * de escritura.
 *
 * Por que el pago y el cobro son DOS tipos y no uno con `ivaPct` opcional: decision P4, los pagos
 * al mensajero y a la satelite no llevan IVA. Con un solo tipo opcional, nada impediria que un
 * camino leyera un IVA de pago y lo sumara; con dos, `ivaDe(valorPago)` no compila (R34/R45).
 *
 * Sin imports de valor de `@prisma/client`: este modulo lo pueden importar componentes de cliente
 * (la pantalla de SLT-54 valida con estos esquemas), como `lib/types/tarifa.ts`.
 */

export type { ConceptoPago, ConceptoTienda } from "@/lib/tarifas/catalogo";

export type ModoTarifa = "monto" | "porcentaje";

/** Lo comun a un valor resuelto, sea cobro o pago. Importes y porcentajes en texto (money-safe). */
interface ValorResueltoBase {
  modo: ModoTarifa;
  /** Monto o porcentaje (0..100) segun `modo`, texto con 2 decimales. */
  valor: string;
  /** Nivel del que salio: se congela para poder explicar despues el importe. */
  nivel: TarifaNivel;
  tarifaValorId: string;
}

/** Pago al mensajero o a la satelite. SIN IVA por diseño (P4): no hay campo donde ponerlo. */
export interface ValorPago extends ValorResueltoBase {
  concepto: ConceptoPago;
}

/** Cobro a la tienda: el unico que lleva IVA (R3). */
export interface ValorCobro extends ValorResueltoBase {
  concepto: ConceptoTienda;
  /** % de IVA 0..100, texto con 2 decimales. */
  ivaPct: string;
}

/** Concepto ausente = «sin tarifa» (R23). Un 0 escrito es una entrada con `valor: "0.00"`. */
export type ValoresTienda = Partial<Record<ConceptoTienda, ValorCobro>>;

export type TarifaTienda =
  | { modelo: "viejo"; tarifa: TarifaVigenteResuelta }
  | { modelo: "nuevo"; valores: ValoresTienda };

export type TarifaPago =
  | { modelo: "viejo"; tarifa: PagoTarifa }
  | {
      modelo: "nuevo";
      mensajero: ValorPago | null;
      satelite: ValorPago | null;
      /** Flete sin IVA cobrado a la tienda por ESA gestion: base del % del pago (R28, P1). */
      baseFlete: string;
    };

// ---------------------------------------------------------------------------------------------
// Escritura (la usara `TarifaValorService` en T6.2 y la pantalla de SLT-54).
//
// Todo llega como TEXTO decimal y se valida con expresiones regulares, sin convertir a `number`:
// pasarlo a coma flotante en el borde ya habria perdido el centimo que luego se discute. numeric(12,2) deja
// 10 digitos enteros.
// ---------------------------------------------------------------------------------------------

/** Importe >= 0 con hasta 2 decimales. Sin signo: un negativo no casa (R4). */
const DECIMAL_NO_NEGATIVO = /^\d{1,10}(\.\d{1,2})?$/;
/** Porcentaje 0..100 con hasta 2 decimales (R4). `100.01` o `101` no casan. */
const PORCENTAJE_0_A_100 = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

const idSchema = z.string().min(1);

const valorSchema = z
  .string()
  .regex(DECIMAL_NO_NEGATIVO, "El valor debe ser un numero >= 0 con hasta 2 decimales.");

const ivaPctSchema = z
  .string()
  .regex(PORCENTAJE_0_A_100, "El IVA debe ser un porcentaje entre 0 y 100 con hasta 2 decimales.");

/** Los niveles; que la combinacion sea valida para el actor (R7) lo decide el service (T6.2). */
const nivelSchema = {
  zonaId: idSchema.nullable(),
  grupoId: idSchema.nullable(),
  tiendaId: idSchema.nullable(),
  vehiculoId: idSchema.nullable(),
};

type ConModoYValor = { modo: ModoTarifa; valor: string };

/** El tope de 100 solo aplica al porcentaje: un monto de 150 es valido (R4). */
function porcentajeHasta100(dato: ConModoYValor, ctx: z.RefinementCtx): void {
  if (dato.modo === "porcentaje" && !PORCENTAJE_0_A_100.test(dato.valor)) {
    ctx.addIssue({
      code: "custom",
      path: ["valor"],
      message: "Un porcentaje no puede pasar de 100.",
    });
  }
}

/** Cobro a la tienda: `ivaPct` OBLIGATORIO (R3, R4). */
export const escrituraCobroSchema = z
  .object({
    concepto: z.enum(CONCEPTOS_TIENDA),
    modo: z.enum(["monto", "porcentaje"]),
    valor: valorSchema,
    ivaPct: ivaPctSchema,
    ...nivelSchema,
  })
  .superRefine(porcentajeHasta100);

/**
 * Pago al mensajero o a la satelite: `ivaPct` PROHIBIDO, tambien `"0"` y `null` (R45, P4). Se
 * rechaza en vez de ignorarse para que nadie crea haber guardado un IVA de pago que la app nunca
 * aplicaria. `z.never().optional()` deja el error en la ruta `ivaPct`, que es la que el service
 * devuelve como `validation_error` (T6.2).
 */
export const escrituraPagoSchema = z
  .object({
    concepto: z.enum(CONCEPTOS_PAGO),
    modo: z.enum(["monto", "porcentaje"]),
    valor: valorSchema,
    ivaPct: z.never({ error: "Los pagos al mensajero y a la satelite no llevan IVA." }).optional(),
    ...nivelSchema,
  })
  .superRefine(porcentajeHasta100);

/** Discriminada por el concepto, que fija el actor: cada concepto cae en UNA sola rama. */
export const escrituraValorSchema = z.discriminatedUnion("concepto", [
  escrituraCobroSchema,
  escrituraPagoSchema,
]);

export type EscrituraValorInput = z.infer<typeof escrituraValorSchema>;
