import { expect, test, type Locator, type Page } from "@playwright/test";

import { conEmpresa } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { OrdenHistorialRepository } from "../lib/repositories/OrdenHistorialRepository";
import { OrdenDiaRepartoCambioRepository } from "../lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenRepository } from "../lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "../lib/repositories/OrdenTraspasoRepository";
import { EliminarOrdenService } from "../lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "../lib/services/OrdenHistorialService";
import { exigirOk } from "../tests/fabricas/escenarios/reparto";

import { importe } from "./_escenarios/caja";
import { baseReparto, crearEscenarioReparto, crearOrden, paginaDe, type OrdenE2E, type RepartoE2E } from "./_escenarios/reparto";
import {
  abrirTarifas,
  activacionesDe,
  activarConFaltantes,
  digitarYGuardar,
  elegirNivel,
  elegirOpcion,
  irAPestana,
  irAZona,
  valoresDe,
} from "./_tarifas-activacion-fixture";

/**
 * E2E — SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»» (tasks T6.2).
 *
 * El recorrido del dinero, de punta a punta y por las pantallas:
 *  1. El maestro digita en Tarifas el fulfillment de la tienda (precio propio, todas sus zonas):
 *     1 000 con 13 % de IVA, y activa las tarifas nuevas (D8: solo cobra el modelo nuevo).
 *  2. La tienda carga una orden (`BulkOrdenService.cargarMasiva`, la vía de la carga masiva). El
 *     trigger de la base le cobra el fulfillment al crearla (D2, R15): en `/mi-wallet` aparecen
 *     «La empresa te cobró el fulfillment» 1 000 y «La empresa te cobró el IVA del fulfillment» 130,
 *     y el saldo pasa de 0 a 1 130 en contra. El maestro ve las mismas dos filas en el estado de
 *     cuenta de la tienda (`/wallet/tiendas/[id]`).
 *  3. La tienda elimina la orden (`EliminarOrdenService`, montado como su Server Action): aparecen las
 *     dos devoluciones (R26) y el saldo vuelve a 0.
 *
 * CIFRAS escritas a mano (nunca desde la función que las calcula): fulfillment 1 000, IVA 13 % = 130,
 * total 1 130. ROTULOS escritos a mano: son el contrato de las pantallas (los dejó T5 en
 * `mi-wallet-labels.ts` y `desglose-tienda-labels.ts`); compararlos contra su propia fuente siempre
 * daría verde.
 */

const FULFILLMENT = { concepto: "Fulfillment", valor: "1000", iva: "13" } as const;

// Lo que lee la tienda (`CATEGORIA_MI_WALLET_LABEL`). Regex anclados a la palabra: «el fulfillment»
// no casa dentro de «el IVA del fulfillment».
const MI_WALLET = {
  cobro: /La empresa te cobró el fulfillment/,
  cobroIva: /La empresa te cobró el IVA del fulfillment/,
  devolucion: /La empresa te hizo la devolución de fulfillment/,
  devolucionIva: /La empresa te hizo la devolución del IVA del fulfillment/,
} as const;

// Lo que lee la oficina (`CATEGORIA_TIENDA_LABEL`). Sensibles a mayúsculas: «Fulfillment cobrado»
// (la fila del cobro) no casa con «del fulfillment cobrado» (la del IVA).
const OFICINA = {
  cobro: /(?<!del )Fulfillment cobrado a la tienda/,
  cobroIva: /IVA del fulfillment cobrado a la tienda/,
  devolucion: /Devolución de fulfillment a la tienda/,
  devolucionIva: /Devolución del IVA del fulfillment a la tienda/,
} as const;

let r: RepartoE2E;
let orden: OrdenE2E;
let maestro: Page;

function filas(libro: Locator, concepto: RegExp, monto: number): Locator {
  return libro.getByRole("row").filter({ hasText: concepto }).filter({ hasText: importe(monto) });
}

/** Un importe del resumen de `/mi-wallet`: su rótulo y lo que lo acompaña (cifra, insignia). */
function importeDe(resumen: Locator, rotulo: string): Locator {
  return resumen.getByText(rotulo, { exact: true }).locator("xpath=..");
}

async function abrirMiWallet(page: Page) {
  const res = await page.goto("/mi-wallet");
  expect(res?.status()).toBe(200);
  const libro = page.getByRole("table", { name: `Estado de cuenta de ${r.tienda.nombre}` });
  await expect(libro).toBeVisible();
  return { resumen: page.getByRole("region", { name: "Resumen de tu cuenta" }), libro };
}

async function abrirEstadoDeCuentaDeLaTienda(page: Page) {
  const res = await page.goto(`/wallet/tiendas/${r.tienda.id}`);
  expect(res?.status()).toBe(200);
  const libro = page.getByRole("table", { name: `Estado de cuenta de ${r.tienda.nombre}` });
  await expect(libro).toBeVisible();
  return { libro, tarjeta: page.getByRole("region", { name: `Saldo de ${r.tienda.nombre}` }) };
}

/** Los movimientos de fulfillment de la orden, leídos por detrás con el dueño. */
async function movimientosDe(ordenId: string): Promise<string[]> {
  const filasDb = await baseReparto().ordenFulfillmentMovimiento.findMany({
    where: { ordenId },
    orderBy: { secuencia: "asc" },
    select: { secuencia: true, tipo: true, causa: true, monto: true, ivaPct: true, iva: true, tiendaId: true },
  });
  return filasDb.map(
    (f) =>
      `${f.secuencia}:${f.tipo}:${f.causa}:${f.monto.toFixed(2)}:${f.ivaPct.toFixed(2)}:${f.iva.toFixed(2)}:${f.tiendaId === r.tienda.id ? "tienda" : "otra"}`,
  );
}

/** `EliminarOrdenService` montado como `lib/actions/eliminar-orden.ts`, con la tienda como actor. */
async function eliminarComoLaTienda(ordenId: string): Promise<void> {
  const prisma = getPrismaClient();
  const ordenRepo = new OrdenRepository(prisma);
  const servicio = new EliminarOrdenService(
    ordenRepo,
    new OrdenHistorialService(
      ordenRepo,
      new OrdenHistorialRepository(prisma),
      new OrdenDiaRepartoCambioRepository(prisma),
      new OrdenTraspasoRepository(prisma),
    ),
  );
  const res = exigirOk(
    "EliminarOrdenService.eliminar",
    await conEmpresa(r.empresa.organizacionId, () => servicio.eliminar({ ordenIds: [ordenId] }, r.actores.tienda)),
  );
  expect(res).toEqual({ status: "ok", eliminadas: 1 });
}

test.describe.serial("SLT-94 — fulfillment por paquete: cobro al cargar, devolución al eliminar", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("slt94-fulfillment");
    maestro = await paginaDe(browser, r.empresa.maestro);
  });

  test.afterAll(async () => {
    await maestro?.context().close();
  });

  test("el maestro digita el fulfillment de la tienda (1 000 + 13 %) y activa las tarifas nuevas", async () => {
    test.setTimeout(180_000);
    await abrirTarifas(maestro);
    await irAZona(maestro, r.zonaCentral.nombre);
    await irAPestana(maestro, "Cobro a la tienda");
    await elegirNivel(maestro, "Tienda con precio propio…");
    await elegirOpcion(maestro, maestro.locator("#tarifas-tienda"), r.tienda.nombre);
    await elegirOpcion(maestro, maestro.locator("#tarifas-alcance"), "Todas sus zonas");
    await expect(maestro.getByTestId("tarifas-esqueleto")).toHaveCount(0);
    await digitarYGuardar(maestro, "Cobro a la tienda", [FULFILLMENT]);

    await abrirTarifas(maestro);
    await activarConFaltantes(maestro);
    expect(await activacionesDe(r.empresa.organizacionId)).toBe(1);
    expect(await valoresDe(r.empresa.organizacionId)).toContain("tienda_fulfillment=1000");
  });

  test("la tienda carga una orden: Mi wallet y el estado de cuenta muestran el cobro y el saldo baja 1 130", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const tienda = await paginaDe(browser, r.tienda);

    // Antes de cargar: la cuenta en cero.
    const antes = await abrirMiWallet(tienda);
    await expect(importeDe(antes.resumen, "Saldo a favor")).toContainText("En cero");
    await expect(importeDe(antes.resumen, "Saldo a favor")).toContainText(importe(0));

    orden = await crearOrden(r, { zona: "central" });
    expect(await movimientosDe(orden.id)).toEqual(["1:cargo:creacion:1000.00:13.00:130.00:tienda"]);

    const { resumen, libro } = await abrirMiWallet(tienda);
    await expect(filas(libro, MI_WALLET.cobro, 1000)).toHaveCount(1);
    await expect(filas(libro, MI_WALLET.cobroIva, 130)).toHaveCount(1);
    await expect(importeDe(resumen, "Cargos de la empresa")).toContainText(importe(1130));
    await expect(importeDe(resumen, "A tu favor")).toContainText(importe(0));
    await expect(importeDe(resumen, "Saldo a favor")).toContainText("En contra");
    await expect(importeDe(resumen, "Saldo a favor")).toContainText(importe(1130));
    await tienda.context().close();

    const oficina = await abrirEstadoDeCuentaDeLaTienda(maestro);
    await expect(filas(oficina.libro, OFICINA.cobro, 1000)).toHaveCount(1);
    await expect(filas(oficina.libro, OFICINA.cobroIva, 130)).toHaveCount(1);
    await expect(oficina.tarjeta).toContainText(importe(1130));
  });

  test("la tienda elimina la orden: aparecen las dos devoluciones y el saldo vuelve a cero", async ({ browser }) => {
    test.setTimeout(180_000);
    await eliminarComoLaTienda(orden.id);
    expect(await movimientosDe(orden.id)).toEqual([
      "1:cargo:creacion:1000.00:13.00:130.00:tienda",
      "2:reverso:eliminacion:1000.00:13.00:130.00:tienda",
    ]);

    const tienda = await paginaDe(browser, r.tienda);
    const { resumen, libro } = await abrirMiWallet(tienda);
    await expect(filas(libro, MI_WALLET.cobro, 1000)).toHaveCount(1);
    await expect(filas(libro, MI_WALLET.cobroIva, 130)).toHaveCount(1);
    await expect(filas(libro, MI_WALLET.devolucion, 1000)).toHaveCount(1);
    await expect(filas(libro, MI_WALLET.devolucionIva, 130)).toHaveCount(1);
    await expect(importeDe(resumen, "A tu favor")).toContainText(importe(1130));
    await expect(importeDe(resumen, "Saldo a favor")).toContainText("En cero");
    await expect(importeDe(resumen, "Saldo a favor")).toContainText(importe(0));
    await tienda.context().close();

    const oficina = await abrirEstadoDeCuentaDeLaTienda(maestro);
    await expect(filas(oficina.libro, OFICINA.devolucion, 1000)).toHaveCount(1);
    await expect(filas(oficina.libro, OFICINA.devolucionIva, 130)).toHaveCount(1);
  });
});
