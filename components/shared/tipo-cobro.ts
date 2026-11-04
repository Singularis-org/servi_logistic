import type { TipoCobro } from "@/lib/types/planes";

/**
 * Ajuste planes-custom (D6, D9) — los textos del tipo de cobro, en un solo sitio para cuando llegue la
 * i18n. Sin directiva de cliente: los usan tanto el selector (`TipoCobroCampo`) como piezas de servidor
 * (`ConsumoDelPlan`).
 */
export const TEXTOS_TIPO_COBRO = {
  campo: "Tipo de cobro",
  tipo: { mensual: "Mensual", anual: "Anual" } satisfies Record<TipoCobro, string>,
} as const;
