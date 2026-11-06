import type { TarifaConcepto } from "@prisma/client";

import type { MensajeroDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { CargarZonaResult, ZonaResumen } from "@/lib/interfaces/services/ITarifasPantallaService";
import type { Referencia, ReferenciaDeZona } from "@/lib/tarifas/referencia-vigente";
import { CONCEPTOS, CATALOGO_CONCEPTOS } from "@/lib/tarifas/catalogo";
import type { TarifaValorDTO } from "@/lib/types/tarifa-flexible";

// SLT-54 — datos de la pantalla de Tarifas para los tests de componente. Nombres inventados y neutros.

export function valor(concepto: TarifaConcepto, extra: Partial<TarifaValorDTO> = {}): TarifaValorDTO {
  return {
    id: `id-${concepto}-${extra.vehiculoId ?? "todos"}`,
    concepto,
    modo: "monto",
    valor: "1500.00",
    ivaPct: CATALOGO_CONCEPTOS[concepto].actor === "tienda" ? "13.00" : null,
    nivel: "zona",
    zonaId: "z1",
    grupoId: null,
    tiendaId: null,
    mensajeroId: null,
    vehiculoId: null,
    updatedAt: new Date("2026-11-01T12:00:00Z"),
    ...extra,
  };
}

/** SLT-55: un valor propio tal como lo da la lectura: sin zona, sin IVA y con el nivel `mensajero`. */
export function valorPropio(
  concepto: TarifaConcepto,
  mensajeroId: string,
  extra: Partial<TarifaValorDTO> = {},
): TarifaValorDTO {
  return valor(concepto, { id: `id-${concepto}-${mensajeroId}`, nivel: "mensajero", zonaId: null, mensajeroId, ...extra });
}

/** SLT-55: un mensajero elegible, de nombre neutro. */
export function mensajeroPantalla(extra: Partial<MensajeroDePantalla> = {}): MensajeroDePantalla {
  return { id: "m1", nombre: "Ana Torres", elegible: true, ...extra };
}

export function zonaResumen(extra: Partial<ZonaResumen> = {}): ZonaResumen {
  return { id: "z1", nombre: "Norte", esCentral: false, grupos: [], estado: "completa", faltantes: [], usaZona: [], ...extra };
}

/** Una referencia con el mismo resultado en todos los conceptos. */
export function referenciaUniforme(r: Referencia): ReferenciaDeZona {
  const nivel = Object.fromEntries(CONCEPTOS.map((c) => [c, r])) as ReferenciaDeZona["zona"];
  return { zona: nivel, grupos: {}, vehiculos: {}, tienda: null };
}

export function zonaOk(extra: Partial<Extract<CargarZonaResult, { status: "ok" }>> = {}): Extract<CargarZonaResult, { status: "ok" }> {
  return { status: "ok", grupos: [], distritos: [], valores: [], referencia: null, ...extra };
}

