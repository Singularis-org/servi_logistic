// @vitest-environment jsdom
//
// SLT-54 (T5.3, R66) — la columna «Fulfillment» de órdenes, monitoreo y recibidas sale del resolver único
// (`item.fulfillment`), no de la fila de `tarifas`, que en el modelo nuevo no existe. Y quien no lo ve no
// lo recibe: el recorte lo retira del dato, y además no le montan la columna.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { columnasDetalle } from "@/app/(app)/monitoreo/_components/detalle-columnas";
import { ordenesColumnsDe } from "@/app/(app)/ordenes/_components/ordenes-columns";
import {
  COLUMNAS_SIN_DATO_EN_ALCANCE_ZONA,
  recibidasColumns,
} from "@/app/(app)/recepcion-satelite/_components/recibidas-columns";
import { DataTable } from "@/components/shared/DataTable";
import { recortarPorAlcance } from "@/lib/types/recorte-alcance-orden";
import type { OrdenDetalleDia } from "@/lib/types/tablero-dia";
import { ETIQUETAS_CR } from "@/tests/fabricas/etiquetas-geograficas";
import { CENTINELAS, ordenDelDetalle } from "@/tests/fixtures/orden-detalle-dia";

afterEach(() => cleanup());

const ordenesColumns = ordenesColumnsDe(ETIQUETAS_CR);

/** La misma fila de los dos modelos: en el nuevo no hay `relaciones.tienda.tarifa`. */
function fila(extra: Partial<OrdenDetalleDia>): OrdenDetalleDia {
  return { ...ordenDelDetalle({ id: "o1" }), ...extra };
}

function celdaFulfillment(orden: OrdenDetalleDia): HTMLElement {
  render(<DataTable columns={ordenesColumns} data={[orden]} rowKey="id" ariaLabel="Órdenes" />);
  const indice = ordenesColumns.findIndex((c) => c.id === "fulfillment");
  const filas = screen.getAllByRole("row");
  return within(filas[filas.length - 1]).getAllByRole("cell")[indice];
}

const SIN_TARIFA = (orden: OrdenDetalleDia): OrdenDetalleDia["relaciones"] =>
  orden.relaciones === undefined || orden.relaciones === null
    ? orden.relaciones
    : ({
        ...orden.relaciones,
        tienda:
          orden.relaciones.tienda === null
            ? null
            : { ...orden.relaciones.tienda, tarifa: null },
      } as OrdenDetalleDia["relaciones"]);

describe("SLT-54 R66 — la columna de /ordenes", () => {
  it("nuevo: sin fila de `tarifas`, enseña el fulfillment del resolver", () => {
    const base = fila({ fulfillment: "900.00" });
    expect(celdaFulfillment({ ...base, relaciones: SIN_TARIFA(base) })).toHaveTextContent(/^₡900$/);
  });

  it("viejo: el mismo importe de antes, céntimos incluidos", () => {
    expect(celdaFulfillment(fila({ fulfillment: "250.50" }))).toHaveTextContent(/^₡250,50$/);
  });

  it("no lee `relaciones.tienda.tarifa`: si discreparan, manda el resolver", () => {
    const orden = fila({ fulfillment: "100.00" });
    expect(orden.relaciones?.tienda?.tarifa?.fulfillment).toBe(CENTINELAS.tarifa);
    const celda = celdaFulfillment(orden);
    expect(celda).toHaveTextContent(/^₡100$/);
    expect(celda.textContent).not.toContain(String(CENTINELAS.tarifa));
  });

  it("sin tarifa: el servidor manda 0.00 y se ve ₡0", () => {
    expect(celdaFulfillment(fila({ fulfillment: "0.00" }))).toHaveTextContent(/^₡0$/);
  });
});

describe("SLT-54 R66 — monitoreo y recibidas: quien no lo ve no lo recibe", () => {
  it("el recorte de zona retira el dato, no solo la columna", () => {
    const recortada = recortarPorAlcance(ordenDelDetalle({ id: "o1" }), "zona");
    expect(recortada).not.toHaveProperty("fulfillment");
    expect(recortada.relaciones?.tienda?.tarifa).toBeNull();
    expect(JSON.stringify(recortada)).not.toContain(CENTINELAS.fulfillment);
    expect(JSON.stringify(recortada)).not.toContain(String(CENTINELAS.tarifa));
  });

  it("monitoreo global la monta y lee el resolver; el de zona no la monta", () => {
    const orden = ordenDelDetalle({ id: "o1" });
    const global = columnasDetalle("global", ETIQUETAS_CR);
    const columna = global.find((c) => c.id === "fulfillment");
    expect(columna).toBeDefined();
    render(<DataTable columns={global} data={[orden]} rowKey="id" ariaLabel="Detalle" />);
    const filas = screen.getAllByRole("row");
    const celda = within(filas[filas.length - 1]).getAllByRole("cell")[global.findIndex((c) => c.id === "fulfillment")];
    // El centinela del ítem, no el de la tarifa: `recorte-por-alcance.guardia` mira lo mismo.
    expect(celda.textContent?.replace(/\D/g, "")).toBe(CENTINELAS.fulfillment);
    expect(columnasDetalle("zona", ETIQUETAS_CR).some((c) => c.id === "fulfillment")).toBe(false);
  });

  it("recibidas (solo la satélite): sin columna, ni en el encabezado ni en la lista", () => {
    expect(COLUMNAS_SIN_DATO_EN_ALCANCE_ZONA).toContain("fulfillment");
    expect(recibidasColumns(ETIQUETAS_CR).some((c) => c.id === "fulfillment")).toBe(false);
  });
});
