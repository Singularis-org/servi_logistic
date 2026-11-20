import { z } from "zod";

import { SOLO_UNA_FORMA, importeCanonico, porcentajeSchema } from "@/lib/planes/importes";
import { montoCobroSchema } from "@/lib/types/cobro-plataforma";

// SLT-215 (design §3.1; R1–R5, R20, R21) — los niveles de beneficio por volumen de un plan: el esquema que valida
// toda escritura (crear, programar y aplicar la versión), los descuentos que acumula un nivel y sus textos. Sin
// React: lo usan el servidor, el formulario y las vistas. Módulo hoja como `beneficios.ts`: `lib/types/planes.ts`
// lo importa, así que de allí no importa nada (ver `importes.ts`).

/** P2: un plan admite hasta 10 niveles. El CHECK `plan_nivel_nivel_check` de 20261121140100 admite 1 a 10. */
export const MAX_NIVELES = 10;

/** El descuento de un nivel, en porcentaje o en monto fijo; nunca los dos (R1). */
export type DescuentoNivel = { tipo: "porcentaje"; porcentaje: string } | { tipo: "monto"; monto: string };

/** Un nivel: su meta mensual de órdenes efectivas y su descuento. Su número es su posición + 1 (R1). */
export type Nivel = { meta: number; descuento: DescuentoNivel };

export const META_INVALIDA = "Escribe una meta de al menos 1 orden.";
export const META_NO_CRECE = "La meta debe ser mayor que la del nivel anterior.";
export const DEMASIADOS_NIVELES = "Un plan admite hasta 10 niveles.";

/**
 * R4: la forma de `descuentoPeriodoSchema` (la otra clave como `never`, para que el error de «las dos formas»
 * caiga en su campo), con el monto estrictamente positivo: el del período admite 0 y un nivel con 0 no descuenta.
 */
export const descuentoNivelSchema = z.discriminatedUnion("tipo", [
  z
    .object({
      tipo: z.literal("porcentaje"),
      porcentaje: porcentajeSchema,
      monto: z.never({ error: SOLO_UNA_FORMA }).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("monto"),
      monto: montoCobroSchema.refine((m) => /[1-9]/.test(m)),
      porcentaje: z.never({ error: SOLO_UNA_FORMA }).optional(),
    })
    .strict(),
]);

// R3: un entero de al menos 1. `NaN` (lo que manda el formulario con una meta que no es un entero) cae en el
// mismo mensaje.
export const nivelSchema = z
  .object({
    meta: z.int(META_INVALIDA).min(1, META_INVALIDA),
    descuento: descuentoNivelSchema,
  })
  .strict();

/** R3: cada meta mayor que la anterior; el error va en la meta que no crece, para pintarlo junto a su campo. */
function metasCrecientes(niveles: readonly Nivel[], ctx: z.RefinementCtx): void {
  niveles.forEach((n, i) => {
    if (i > 0 && n.meta <= niveles[i - 1].meta) {
      ctx.addIssue({ code: "custom", path: [i, "meta"], message: META_NO_CRECE });
    }
  });
}

// R1, R5: de 0 a 10; la lista vacía es «sin niveles».
export const nivelesSchema = z.array(nivelSchema).max(MAX_NIVELES, DEMASIADOS_NIVELES).superRefine(metasCrecientes);

/**
 * R2: los descuentos que aplica el nivel `nivel` (0 = ninguno): los de los niveles 1 a `nivel`, en orden. Se
 * acumulan y cada uno se calcula sobre el cobro base; aplicarlos es de SLT-216.
 */
export function descuentosDelNivel(niveles: readonly Nivel[], nivel: number): DescuentoNivel[] {
  return niveles.slice(0, Math.max(0, nivel)).map((n) => n.descuento);
}

/** R21: el descuento con su signo, sin moneda y con dos decimales, como el costo por orden. */
function textoDelDescuento(d: DescuentoNivel): string {
  return d.tipo === "porcentaje" ? `−${importeCanonico(d.porcentaje)} %` : `−${importeCanonico(d.monto)}`;
}

/** R21: «Nivel n: desde M órdenes, −p %» o «Nivel n: desde M órdenes, −monto». */
export function textoDelNivel(numero: number, nivel: Nivel): string {
  return `Nivel ${numero}: desde ${nivel.meta} órdenes, ${textoDelDescuento(nivel.descuento)}`;
}

export const SIN_NIVELES = "Sin niveles";

/** R20: la lista de R21 en una línea, separada por «; », o «Sin niveles». */
export function textoDeLosNiveles(niveles: readonly Nivel[]): string {
  return niveles.length === 0 ? SIN_NIVELES : niveles.map((n, i) => textoDelNivel(i + 1, n)).join("; ");
}
