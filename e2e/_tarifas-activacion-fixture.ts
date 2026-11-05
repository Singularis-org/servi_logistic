import { expect, type Locator, type Page } from "@playwright/test";

import { baseReparto } from "./_escenarios/reparto";

/**
 * SLT-54 T6.1 — lo que los E2E de Tarifas repiten: moverse por la pantalla como el `maestro`, digitar y leer
 * lo que un cierre dejó congelado. Los textos van escritos a mano, sin importar `tarifas-textos.ts`: son el
 * contrato de la pantalla, y compararlos contra su propia fuente siempre daría verde.
 */

export const panelDe = (page: Page): Locator => page.getByTestId("tarifas-panel");
export const zonasDe = (page: Page): Locator => page.getByTestId("tarifas-zonas");

export async function abrirTarifas(page: Page): Promise<void> {
  await page.goto("/configuracion/tarifas");
  await expect(page.getByRole("heading", { name: "Tarifas", exact: true })).toBeVisible();
  await expect(panelDe(page)).toBeVisible();
}

export async function irAZona(page: Page, zona: string): Promise<void> {
  const fila = zonasDe(page).getByRole("button", { name: new RegExp(zona) });
  await fila.click();
  await expect(fila).toHaveAttribute("aria-current", "true");
  await expect(panelDe(page).getByRole("heading", { name: zona })).toBeVisible();
  await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
}

export type Pestana = "Cobro a la tienda" | "Pago al mensajero" | "Pago a la satélite";

export async function irAPestana(page: Page, pestana: Pestana): Promise<void> {
  const tab = panelDe(page).getByRole("tab", { name: pestana });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Un `Select` de Base UI: la lista vive en un portal, fuera del panel. */
export async function elegirOpcion(page: Page, combobox: Locator, opcion: string | RegExp): Promise<void> {
  await combobox.click();
  await page.getByRole("option", { name: opcion }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

export async function elegirNivel(page: Page, nivel: string | RegExp): Promise<void> {
  await elegirOpcion(page, page.locator("#tarifas-nivel"), nivel);
  await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
}

/** Una fila de la rejilla por el nombre de su concepto. */
export function filaDe(page: Page, concepto: string): Locator {
  return page.getByTestId("tarifas-rejilla").getByRole("row").filter({ has: page.getByText(concepto, { exact: true }) });
}

export interface Digitado {
  concepto: string;
  valor: string;
  /** Solo en «Cobro a la tienda». */
  iva?: string;
}

/**
 * Digita en la pestaña abierta y guarda. Espera a que el botón deje de estar ocupado, y no solo al toast: el
 * toast sale antes de que termine la recarga del panel, y seguir digitando en ese rato es otra prueba.
 */
export async function digitarYGuardar(
  page: Page,
  pestana: Pestana,
  filas: readonly Digitado[],
  guardar: "Guardar borrador" | "Guardar cambios" = "Guardar borrador",
): Promise<void> {
  await irAPestana(page, pestana);
  const panel = panelDe(page);
  for (const f of filas) {
    await panel.getByRole("textbox", { name: `Valor de ${f.concepto}`, exact: true }).fill(f.valor);
    if (f.iva !== undefined) await panel.getByRole("textbox", { name: `IVA de ${f.concepto}`, exact: true }).fill(f.iva);
  }
  const boton = panel.getByRole("button", { name: guardar, exact: true });
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(boton).toBeDisabled();
  await expect(boton).not.toHaveAttribute("aria-busy", "true");
  for (const f of filas) {
    await expect(panel.getByRole("textbox", { name: `Valor de ${f.concepto}`, exact: true })).toHaveValue(f.valor);
  }
}

/** Pulsa «Activar tarifas nuevas» y confirma con faltantes. Devuelve el diálogo ya cerrado. */
export async function activarConFaltantes(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Activar tarifas nuevas", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Activar tarifas nuevas" });
  const activar = dialogo.getByRole("button", { name: "Activar con lo que falta", exact: true });
  await expect(activar).toBeDisabled();
  await dialogo.getByRole("checkbox", { name: "Entiendo que lo que falta quedará en 0 en cobros y pagos." }).click();
  await expect(activar).toBeEnabled();
  await activar.click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText(/^En vigor desde el \d{2}-\d{2}-\d{4}$/)).toBeVisible();
}

/**
 * Una cifra de `KpiValorAnimado` cuenta desde 0 al montar y pasa por valores intermedios. Devuelve su texto
 * cuando dos lecturas seguidas coinciden y no es el arranque: afirmar sobre el primer texto que casa dio ya
 * un verde por el valor intermedio.
 */
export async function cifraAsentada(cifra: Locator): Promise<string> {
  let anterior: string | null = null;
  let asentada = "";
  await expect
    .poll(
      async () => {
        const ahora = (await cifra.innerText()).trim();
        const igual = ahora === anterior;
        anterior = ahora;
        asentada = ahora;
        return igual;
      },
      { intervals: [400], timeout: 15_000, message: "la cifra animada no se asentó" },
    )
    .toBe(true);
  return asentada;
}

/**
 * Lo que un cierre dejó congelado, leído por detrás como dueño, en JSON para compararlo tal cual antes y
 * después de activar. Los importes son texto: sale de `Decimal` y no pasa por `number`.
 */
export async function congeladoDelCierre(cierreId: string) {
  const db = baseReparto();
  const cierre = await db.cierreDia.findUniqueOrThrow({
    where: { id: cierreId },
    select: {
      estado: true,
      totalGeneral: true,
      totalPagoMensajero: true,
      totalIngresoBodegaRechazos: true,
      detalle: {
        orderBy: { numRemision: "asc" },
        select: {
          numRemision: true,
          tarifaModelo: true,
          tarifaValorFlete: true,
          tarifaValorFleteDevuelto: true,
          tarifaIvaFlete: true,
          conceptos: { orderBy: { concepto: "asc" }, select: { concepto: true, modo: true, valor: true, ivaPct: true, nivel: true } },
        },
      },
    },
  });
  const gestiones = await db.gestionOrden.findMany({
    where: { cierreId, anuladaAt: null },
    orderBy: { resultado: "asc" },
    select: {
      resultado: true,
      pagoMensajero: true,
      ingresoBodegaRechazo: true,
      pagosCongelados: { orderBy: { actor: "asc" }, select: { actor: true, concepto: true, valor: true, importe: true } },
    },
  });
  return JSON.parse(JSON.stringify({ ...cierre, gestiones })) as {
    estado: string;
    totalGeneral: string;
    totalPagoMensajero: string;
    totalIngresoBodegaRechazos: string;
    detalle: {
      numRemision: string;
      tarifaModelo: string;
      tarifaValorFlete: string | null;
      tarifaValorFleteDevuelto: string | null;
      tarifaIvaFlete: string | null;
      conceptos: { concepto: string; modo: string; valor: string; ivaPct: string; nivel: string }[];
    }[];
    gestiones: {
      resultado: string;
      pagoMensajero: string | null;
      ingresoBodegaRechazo: string | null;
      pagosCongelados: { actor: string; concepto: string; valor: string; importe: string }[];
    }[];
  };
}

/** Cuántas activaciones tiene la empresa, por detrás. Una es activada; ninguna, no. */
export function activacionesDe(organizacionId: string): Promise<number> {
  return baseReparto().tarifaActivacion.count({ where: { organizacionId } });
}

/** Los valores nuevos de la empresa, por detrás: `concepto` y `valor`, ordenados. */
export async function valoresDe(organizacionId: string): Promise<string[]> {
  const filas = await baseReparto().tarifaValor.findMany({
    where: { organizacionId },
    select: { concepto: true, valor: true },
  });
  return filas.map((f) => `${f.concepto}=${f.valor.toString()}`).sort();
}
