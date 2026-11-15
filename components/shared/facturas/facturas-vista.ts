import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import type {
  CuotaDeLaFactura,
  FacturaPlataformaDTO,
  PeriodicidadFactura,
  TipoLineaFactura,
} from "@/lib/types/factura-plataforma";
import type { TipoCobro } from "@/lib/types/planes";
import { horaDePared } from "@/lib/utils/calendario-zona";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

// SLT-119 (design §6.1) — la vista de las facturas de la plataforma, sin React: la comparten la sección «Facturas
// de la empresa» de «Mi plan» y la pestaña «Facturación» del detalle de empresa. Solo da formato a lo que devuelve
// la base (R5): ningún importe se recalcula aquí, salvo la suma de las dos cuotas de la fila, que es exacta en
// céntimos. Sin imports de `lib/actions`, `lib/services`, `lib/repositories` ni `lib/db`.

/** La hora de la plataforma hasta SLT-90: los períodos y las líneas se leen en ella (R3, R7). */
const ZONA_PLATAFORMA = ZONA_CR;

/** Todos los literales de las pantallas de facturas, en un sitio para cuando llegue la i18n. */
export const FACTURAS_TEXTOS = {
  titulo: "Facturas de la empresa",
  ayuda: "Todas las facturas de la empresa, de cualquier plan o sin plan.",
  vacio: "Aún no hay facturas de la empresa",
  errorLista: "No se pudieron cargar las facturas",
  errorDetalle: "No se pudo cargar la factura",
  cargando: "Cargando la factura…",
  columnas: {
    numero: "Número",
    periodo: "Período",
    plan: "Plan de las órdenes",
    ordenes: "Órdenes",
    cuotas: "Cuotas",
    total: "Total",
    estado: "Estado",
    acciones: "Detalle",
  },
  sinPlan: "Sin plan",
  sinNumero: "—",
  sinGuia: "—",
  prevista: "prevista",
  verDetalle: "Ver detalle",
  verDetalleDe: (periodo: string) => `Ver detalle de la factura ${periodo}`,
  estado: { cerrada: "Emitida", noCerrada: "En curso" },
  numero: (n: number) => `N.º ${n}`,
  /** El título del panel: el número si la tiene, si no el período. */
  tituloDetalle: (numero: string | null, periodo: string) => (numero === null ? `Factura ${periodo}` : `Factura ${numero}`),
  descripcionDetalle: "Detalle de la factura de la empresa: cuotas, resumen de órdenes y cada cargo y reverso.",
  detalle: {
    numero: "Número",
    periodo: "Período",
    estado: "Estado",
    plan: "Plan de las órdenes",
    periodicidad: "Periodicidad de las órdenes",
    cuotas: "Cuotas",
    sinCuotas: "Esta factura no lleva cuota.",
    cuotaEmision: "Cuota del período",
    primeraCuota: "Primera cuota",
    tipoCobro: "Tipo de cobro",
    tramo: "Tramo",
    importe: "Importe",
    resumen: "Resumen de órdenes",
    cargos: "Cargos",
    reversos: "Reversos",
    movimientos: "Movimientos",
    totalOrdenes: "Total de órdenes",
    total: "Total",
    lineas: "Cargos y reversos",
    sinLineas: "Sin cargos ni reversos en esta página.",
  },
  lineas: {
    instante: "Fecha y hora",
    guia: "Guía",
    tipo: "Tipo",
    valor: "Valor",
    tipos: { cargo: "Cargo", reverso: "Reverso" } satisfies Record<TipoLineaFactura, string>,
  },
  paginacion: {
    anterior: "Anterior",
    siguiente: "Siguiente",
    total: (n: number) => (n === 1 ? "1 línea" : `${n} líneas`),
    pagina: (p: number, de: number) => `Página ${p} de ${de}`,
    etiqueta: "Páginas de líneas",
  },
  dias: (cobrados: number, periodo: number) => `${cobrados} de ${periodo} días`,
  /** «Quincenal», «Mensual»…: las mismas etiquetas que el tipo de cobro de los planes. */
  periodicidad: TEXTOS_TIPO_COBRO.tipo satisfies Record<PeriodicidadFactura, string>,
  tipoCobro: TEXTOS_TIPO_COBRO.tipo satisfies Record<TipoCobro, string>,
} as const;

/** R2: una `en_curso` y una `por_cerrar` se muestran igual (SLT-118 R24). */
export function esNoCerrada(f: Pick<FacturaPlataformaDTO, "estado">): boolean {
  return f.estado !== "cerrada";
}

/** R4, P2: «N.º 7» en la cerrada; `null` en la no cerrada, que no lleva número. */
export function numeroVisible(f: Pick<FacturaPlataformaDTO, "estado" | "numero">): string | null {
  if (esNoCerrada(f) || f.numero === null) return null;
  return FACTURAS_TEXTOS.numero(f.numero);
}

/** R3: el día de `instante` en la hora de la plataforma («1 nov 2026»). */
function diaVisible(instante: Date): string {
  return fechaCortaEnZona(instante, ZONA_PLATAFORMA);
}

/**
 * R3: el primer y el último día de `[desde, hasta)`. `hasta` está excluido, así que el último día es el del
 * instante anterior (`hasta` − 1 ms): `[1 nov, 16 nov)` → «1 nov 2026 – 15 nov 2026».
 */
export function periodoVisible(desde: Date, hasta: Date): string {
  return `${diaVisible(desde)} – ${diaVisible(new Date(hasta.getTime() - 1))}`;
}

/** R2: «Emitida» o «En curso». */
export function estadoVisible(f: Pick<FacturaPlataformaDTO, "estado">): string {
  return esNoCerrada(f) ? FACTURAS_TEXTOS.estado.noCerrada : FACTURAS_TEXTOS.estado.cerrada;
}

/**
 * R1, R5: la cuota de la emisión más la primera cuota, como importe con dos decimales; `null` si no lleva
 * ninguna. Solo suma los importes que da la base, en céntimos exactos (nunca `Number`).
 */
export function sumaDeCuotas(f: Pick<FacturaPlataformaDTO, "cuota" | "primeraCuota">): string | null {
  const cuotas = [f.cuota, f.primeraCuota].filter((c): c is CuotaDeLaFactura => c !== null);
  if (cuotas.length === 0) return null;
  return aTexto(cuotas.reduce((suma, c) => suma + aCentimos(c.cuota), BigInt(0)));
}

/** R6: «X de Y días» en una cuota prorrateada; `null` si cobra el período entero. */
export function diasVisibles(c: Pick<CuotaDeLaFactura, "diasCobrados" | "diasPeriodo">): string | null {
  return c.diasCobrados === c.diasPeriodo ? null : FACTURAS_TEXTOS.dias(c.diasCobrados, c.diasPeriodo);
}

/** R7, P5: la fecha y la hora del cobro en la hora de la plataforma («14 nov 2026 09:30»). */
export function instanteVisible(instante: Date): string {
  return `${diaVisible(instante)} ${horaDePared(instante, ZONA_PLATAFORMA)}`;
}

/** R10: cuántas páginas tiene una factura con `total` líneas; al menos una. */
export function paginasDe(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}
