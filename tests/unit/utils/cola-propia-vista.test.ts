import { describe, it, expect } from "vitest";

import {
  BARRA_PROPIA,
  BUSCA_POR_FOLIO,
  DESCRIPCION_PROPIA,
  ERROR_PROPIA,
  FILTRO_ESTADO_PROPIA,
  FILTRO_FECHA_PROPIA,
  VACIO_FILTRADO_PROPIA,
  aFiltrosPropios,
  opcionesEstadoPropias,
  MOTIVO_SIN_TEXTO,
  PAGO_LIQUIDADO,
  PAGO_PENDIENTE,
  PAGO_SIN_DATO,
  PESTANA_PROPIA,
  REGION_PROPIA,
  TABLIST_PROPIA,
  VACIO_PROPIA,
  columnasColaPropia,
  destinoPropio,
  pagoPropioDe,
  textoPagoPropio,
} from "@/components/private/cierres/cola/cola-propia-vista";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { filtrosColaPropiaSchema } from "@/lib/types/filtros-cierres";

/**
 * SLT-138 (R180, deuda de la review de SLT-137): límites de letra Unicode. Con `\b` y sin la bandera
 * `u`, la «á» final no cuenta como letra y «Buscá» pasaba sin casar.
 */
const VOSEO = /(?<!\p{L})(vos|tenés|podés|querés|hacé|buscá|mirá|usá)(?!\p{L})/iu;

// SLT-137 (T2.1) — la lógica pura de la cola con rol mensajero. Los textos esperados son LITERALES
// del spec (`design.md > Textos`, `requirements.md > R155-R157, R160`): compararlos contra la
// constante que los genera estaría siempre en verde.

type EntradaPago = Pick<CierrePasadoDTO, "estado" | "motivoRechazo" | "pendientePagoMensajero">;

function pago(c: EntradaPago): string {
  return textoPagoPropio(pagoPropioDe(c));
}

describe("SLT-137 — pagoPropioDe / textoPagoPropio (R157)", () => {
  it("rechazado con motivo: «Motivo: «…»»", () => {
    expect(pago({ estado: "rechazado", motivoRechazo: "Faltan 2 guías" })).toBe(
      "Motivo: «Faltan 2 guías»",
    );
  });

  it("rechazado sin motivo, con null, con texto vacío o solo espacios: el texto por defecto", () => {
    for (const motivoRechazo of [undefined, null, "", "   "]) {
      expect(pago({ estado: "rechazado", motivoRechazo })).toBe("La bodega no indicó un motivo.");
    }
  });

  it("aprobado con pendiente mayor que cero: «Pendiente de pago»", () => {
    expect(pago({ estado: "aprobado", pendientePagoMensajero: "12.50" })).toBe("Pendiente de pago");
    expect(pago({ estado: "aprobado", pendientePagoMensajero: "0.01" })).toBe("Pendiente de pago");
  });

  it("aprobado con pendiente cero: «Liquidado»", () => {
    expect(pago({ estado: "aprobado", pendientePagoMensajero: "0.00" })).toBe("Liquidado");
  });

  it("aprobado sin el campo o con null: «Sin dato», nunca «Liquidado»", () => {
    expect(pago({ estado: "aprobado" })).toBe("Sin dato");
    expect(pago({ estado: "aprobado", pendientePagoMensajero: null })).toBe("Sin dato");
  });

  it("solicitado y vencido: «—», aunque traigan un pendiente", () => {
    expect(pago({ estado: "solicitado", pendientePagoMensajero: null })).toBe("—");
    expect(pago({ estado: "vencido" })).toBe("—");
    expect(pago({ estado: "solicitado", pendientePagoMensajero: "100.00" })).toBe("—");
  });

  it("el tipo devuelto distingue los cinco casos", () => {
    expect(pagoPropioDe({ estado: "aprobado", pendientePagoMensajero: "1.00" })).toEqual({ tipo: "pendiente" });
    expect(pagoPropioDe({ estado: "aprobado", pendientePagoMensajero: "0.00" })).toEqual({ tipo: "liquidado" });
    expect(pagoPropioDe({ estado: "aprobado" })).toEqual({ tipo: "sinDato" });
    expect(pagoPropioDe({ estado: "solicitado" })).toEqual({ tipo: "nulo" });
    expect(pagoPropioDe({ estado: "rechazado", motivoRechazo: "x" })).toEqual({
      tipo: "motivo",
      texto: "Motivo: «x»",
    });
  });
});

describe("SLT-137 — textos de la cola propia (R155, R157, R160, R180)", () => {
  it("descripción, pestaña, tablist y región con el texto del spec", () => {
    expect(DESCRIPCION_PROPIA).toBe("Tus cierres enviados a aprobación y cómo terminaron.");
    expect(PESTANA_PROPIA).toBe("Cierres solicitados");
    expect(TABLIST_PROPIA).toBe("Tus cierres");
    expect(REGION_PROPIA).toBe("Cierres solicitados");
  });

  it("vacío y error conservan el texto de hoy (R160)", () => {
    expect(VACIO_PROPIA).toBe("Aún no has solicitado ningún cierre.");
    expect(ERROR_PROPIA).toBe("No se pudieron cargar tus cierres solicitados.");
  });

  it("los rótulos del pago", () => {
    expect(PAGO_PENDIENTE).toBe("Pendiente de pago");
    expect(PAGO_LIQUIDADO).toBe("Liquidado");
    expect(PAGO_SIN_DATO).toBe("Sin dato");
    expect(MOTIVO_SIN_TEXTO).toBe("La bodega no indicó un motivo.");
  });

  it("ningún texto usa voseo (R180)", () => {
    const textos = [
      BUSCA_POR_FOLIO,
      VACIO_FILTRADO_PROPIA,
      BARRA_PROPIA,
      FILTRO_FECHA_PROPIA,
      FILTRO_ESTADO_PROPIA,
      DESCRIPCION_PROPIA,
      PESTANA_PROPIA,
      TABLIST_PROPIA,
      REGION_PROPIA,
      VACIO_PROPIA,
      ERROR_PROPIA,
      PAGO_PENDIENTE,
      PAGO_LIQUIDADO,
      PAGO_SIN_DATO,
      MOTIVO_SIN_TEXTO,
    ];
    for (const t of textos) expect(t).not.toMatch(VOSEO);
  });

  it("el regex de voseo reconoce la tilde final (control positivo, SLT-138)", () => {
    // Sin la bandera `u`, `\b` no ve la «á» final como letra y «Buscá por folio» no casaba: el test
    // de arriba salía verde con voseo dentro.
    expect("Buscá por folio").toMatch(VOSEO);
    expect("Usá los filtros").toMatch(VOSEO);
    expect("Busca por folio").not.toMatch(VOSEO);
  });
});

describe("SLT-138 — textos y traducción de la barra (R176, R177)", () => {
  it("los textos nuevos, literales del spec", () => {
    expect(BUSCA_POR_FOLIO).toBe("Busca por folio");
    expect(VACIO_FILTRADO_PROPIA).toBe("Ningún cierre coincide con los filtros.");
    expect(BARRA_PROPIA).toBe("Filtros de tus cierres");
    expect(FILTRO_FECHA_PROPIA).toBe("Fecha de solicitud");
    expect(FILTRO_ESTADO_PROPIA).toBe("Estado");
  });

  it("opcionesEstadoPropias: los cuatro estados con su etiqueta y sin grupo", () => {
    expect(opcionesEstadoPropias()).toEqual([
      { value: "solicitado", label: "Solicitado" },
      { value: "vencido", label: "Vencido" },
      { value: "aprobado", label: "Aprobado" },
      { value: "rechazado", label: "Rechazado" },
    ]);
    expect(opcionesEstadoPropias().some((o) => "group" in o)).toBe(false);
  });

  it("aFiltrosPropios: sin selección ni término, el objeto vacío (ninguna clave viaja)", () => {
    expect(aFiltrosPropios({}, "")).toEqual({});
    expect(Object.keys(aFiltrosPropios({ fecha: ["", "", ""], estado: [] }, "   "))).toEqual([]);
  });

  it("aFiltrosPropios: la terna de fecha con un extremo vacío deja solo el otro", () => {
    expect(aFiltrosPropios({ fecha: ["", "2026-07-01", ""] }, "")).toEqual({ desde: "2026-07-01" });
    expect(aFiltrosPropios({ fecha: ["7d", "2026-07-01", "2026-07-08"] }, "")).toEqual({
      desde: "2026-07-01",
      hasta: "2026-07-08",
    });
  });

  it("aFiltrosPropios: estados y folio recortado; el servidor normaliza el resto", () => {
    expect(aFiltrosPropios({ estado: ["vencido", "rechazado"] }, "  #3f2a ")).toEqual({
      estados: ["vencido", "rechazado"],
      folio: "#3f2a",
    });
    // Lo emitido pasa por el MISMO zod que valida la acción.
    expect(
      filtrosColaPropiaSchema.safeParse(
        aFiltrosPropios({ fecha: ["", "2026-07-01", "2026-07-08"], estado: ["aprobado"] }, "AB12"),
      ).success,
    ).toBe(true);
  });
});

describe("SLT-137 — columnas y destino (R60, R156)", () => {
  it("las ocho columnas en el orden del spec", () => {
    expect(columnasColaPropia().map((c) => [c.id, c.label])).toEqual([
      ["folio", "Folio"],
      ["solicitado", "Solicitado"],
      ["destino", "Destino"],
      ["estado", "Estado"],
      ["recaudado", "Recaudado"],
      ["ganancia", "Ganancia"],
      ["pago", "Pago"],
      ["acciones", "Acciones"],
    ]);
  });

  it("la de acciones solo tiene nombre para el lector", () => {
    const acciones = columnasColaPropia().filter((c) => c.soloLector);
    expect(acciones.map((c) => c.id)).toEqual(["acciones"]);
  });

  it("el destino es el rótulo del tipo, sin la zona", () => {
    expect(destinoPropio({ destinoTipo: "bodega_central" })).toBe("Bodega central");
    expect(destinoPropio({ destinoTipo: "bodega_satelite" })).toBe("Bodega satélite");
  });
});
