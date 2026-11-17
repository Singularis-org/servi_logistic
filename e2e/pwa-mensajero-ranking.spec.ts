import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  hoyDeLaApp,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import {
  ALTO_MOVIL,
  ANCHOS_MOVIL,
  MENSAJERO_LARGO,
  PREMIO_DESCRIPCION_LARGA,
  sinDesborde,
  sinElipsis,
  sinSolapes,
  tactil,
} from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-162 «Ranking del mensajero en tarjetas en el móvil» (rebanada de SLT-156 «PWA de los
 * mensajeros: tablas usables en el móvil»; R753, R757-R761, R766-R769).
 *
 *  (a) `/ranking` como el mensajero del nombre largo, a 360 y 414 px: el podio y sus tres secciones
 *      sin «…», sin datos montados y sin desbordar; su fila del resto y su tarjeta con «Tú»; la letra
 *      del podio ≥ 12 px; el campo de búsqueda y «Descargar» a 44 px, «Descargar» a todo el ancho y
 *      encima de la lista.
 *  (b) `/ranking` como maestro: monto, descripción y «Guardar» de cada premio a 44 px en la tarjeta.
 *  (c) `/ranking/historico?fecha=<ayer>` con un snapshot sembrado: la tarjeta sin «…», el desplegar a
 *      la derecha y a 44 px, el selector de fecha a todo el ancho y 44 px, «Descargar» a 44 px.
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`, módulo `ranking` encendido por defecto) con tres
 * mensajeros de la CENTRAL (el ranking es de la central, SLT-124) y sus entregas del día por los
 * servicios reales; el del nombre largo con una entrega y una orden aún en reparto (queda el último,
 * en la lista del resto). Los premios —con la descripción larga— y el snapshot del Histórico se
 * siembran con Prisma en la base desechable (precedente: `pwa-mensajero-recoger-recoleccion.spec.ts`).
 * Sin datos, los `expect` fallan: no se salta nada.
 */

let r: RepartoE2E;
let largo: MensajeroE2E;
let ayer: string;

const RANKING_TABLA = 'table[aria-label="Ranking diario de mensajeros"]';
const PREMIOS_TABLA = 'table[aria-label="Premios del podio"]';
const HISTORICO_TABLA = 'table[aria-label="Ranking congelado del día"]';

async function entregada(m: MensajeroE2E, monto: number): Promise<void> {
  const orden = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: monto }), "en_reparto", {
    mensajero: m,
  });
  await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto }] });
}

/** La tarjeta (`[data-slot="card"]`) que contiene `dentro`. */
function tarjetaCon(page: Page, dentro: string): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator(dentro) });
}

/** El tamaño de letra calculado más pequeño entre los elementos con texto propio de `region`. */
async function letraMinima(region: Locator): Promise<number> {
  return region.evaluate((raiz) => {
    let min = Number.POSITIVE_INFINITY;
    for (const el of [raiz as HTMLElement, ...Array.from(raiz.querySelectorAll<HTMLElement>("*"))]) {
      const propio = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      if (!propio) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" && el.clientWidth <= 1 && el.clientHeight <= 1) continue; // sr-only
      if (el.getBoundingClientRect().width === 0) continue;
      min = Math.min(min, parseFloat(cs.fontSize));
    }
    return min;
  });
}

/** R766: «Descargar» ocupa el ancho de su sección y queda encima de la lista. */
async function descargaAnchaEncima(page: Page, descargar: Locator, tabla: string): Promise<void> {
  await tactil(descargar);
  const boton = await descargar.boundingBox();
  const lista = await page.locator(tabla).boundingBox();
  expect(boton, "sin caja para «Descargar»").not.toBeNull();
  expect(lista, `sin caja para ${tabla}`).not.toBeNull();
  // A todo el ancho: mide lo mismo que la tabla (±2 px de borde).
  expect(Math.abs(boton!.width - lista!.width)).toBeLessThanOrEqual(2);
  expect(boton!.y + boton!.height).toBeLessThanOrEqual(lista!.y + 1);
}

test.describe("SLT-162 — Ranking del mensajero en tarjetas a 360 y 414 px", () => {
  test.beforeAll(async () => {
    test.setTimeout(600_000);
    r = await crearEscenarioReparto("pwa-mensajero-ranking");
    const primero = await crearMensajero(r, "central");
    const segundo = await crearMensajero(r, "central");
    largo = await crearMensajero(r, "central");
    const db = baseReparto();
    await db.usuario.update({
      where: { id: largo.id },
      data: { nombre: MENSAJERO_LARGO, primerApellido: null, segundoApellido: null },
    });

    // Entregas del día: los dos primeros al 100 %; el largo con una de dos (queda el último).
    await entregada(primero, 2000);
    await entregada(primero, 2100);
    await entregada(segundo, 2200);
    await entregada(largo, 2300);
    await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 2400 }), "en_reparto", {
      mensajero: largo,
    });

    // Premios del podio, el 1º con la descripción larga.
    const organizacionId = r.empresa.organizacionId;
    await db.premioRanking.deleteMany({ where: { organizacionId } });
    await db.premioRanking.createMany({
      data: [
        { organizacionId, posicion: 1, monto: "10000", descripcion: PREMIO_DESCRIPCION_LARGA },
        { organizacionId, posicion: 2, monto: "5000", descripcion: null },
        { organizacionId, posicion: 3, monto: null, descripcion: null },
      ],
    });

    // El Histórico de AYER (calendario de la app), con el nombre largo y la descripción larga.
    const hoy = new Date(`${hoyDeLaApp()}T00:00:00.000Z`);
    ayer = new Date(hoy.getTime() - 86_400_000).toISOString().slice(0, 10);
    const snapshot = await db.rankingSnapshotDia.create({
      data: { organizacionId, fecha: new Date(`${ayer}T00:00:00.000Z`), minAsignadasPodio: 1, filas: 2 },
    });
    await db.rankingSnapshotFila.createMany({
      data: [
        {
          organizacionId,
          snapshotId: snapshot.id,
          puesto: 1,
          posicion: 1,
          mensajeroId: largo.id,
          mensajeroNombre: MENSAJERO_LARGO,
          entregadas: 9,
          asignadas: 10,
          premioMonto: "10000",
          premioDescripcion: PREMIO_DESCRIPCION_LARGA,
        },
        {
          organizacionId,
          snapshotId: snapshot.id,
          puesto: 2,
          posicion: null,
          mensajeroId: primero.id,
          mensajeroNombre: primero.nombre,
          entregadas: 0,
          asignadas: 0,
          premioMonto: null,
          premioDescripcion: null,
        },
      ],
    });
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) R758-R761, R766-R769: /ranking del mensajero a ${ancho} px`, async ({ browser }) => {
      const page = await paginaDe(browser, largo, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto("/ranking");

      // Podio: su fila del resto, con «Tú», en una línea sin datos montados (R767).
      const resto = page.getByRole("list", { name: "Resto del ranking diario" });
      const filaPropia = resto.getByRole("listitem").filter({ hasText: MENSAJERO_LARGO });
      await expect(filaPropia).toHaveCount(1);
      await expect(filaPropia.getByText("Tú", { exact: true })).toBeVisible();
      await sinSolapes(filaPropia, "[data-columna]");
      const podio = tarjetaCon(page, 'ul[aria-label="Podio del ranking diario"]');
      await sinElipsis(podio);
      // R768: ningún texto del podio por debajo de 12 px.
      expect(await letraMinima(podio)).toBeGreaterThanOrEqual(12);

      // Ranking del día: su tarjeta con «Tú», entera y sin datos montados (R750, R758, R759).
      const ranking = page.locator(RANKING_TABLA);
      const tarjeta = ranking.locator("tbody tr").filter({ hasText: MENSAJERO_LARGO });
      await expect(tarjeta).toHaveCount(1);
      await expect(tarjeta.getByText("Tú", { exact: true })).toBeVisible();
      await sinElipsis(tarjetaCon(page, RANKING_TABLA));
      await sinSolapes(tarjeta, "[data-columna]");

      // R769: el campo de búsqueda a 44 px; «Descargar» a todo el ancho, 44 px y encima (R766).
      await tactil(page.getByRole("searchbox", { name: "Buscar mensajero" }));
      await descargaAnchaEncima(page, page.getByRole("button", { name: "Descargar Ranking del día" }), RANKING_TABLA);

      // Premios: la tarjeta del 1º con la descripción larga, entera y sin montarse sobre el monto.
      const premio1 = page.locator(`${PREMIOS_TABLA} tbody tr`).first();
      await expect(premio1.getByText(PREMIO_DESCRIPCION_LARGA)).toBeVisible();
      await sinElipsis(tarjetaCon(page, PREMIOS_TABLA));
      await sinSolapes(premio1, "[data-columna]");

      // R761: nada desborda.
      await sinDesborde(page);
      await page.context().close();
    });

    test(`(b) R753: los premios del maestro a ${ancho} px`, async ({ browser }) => {
      const page = await paginaDe(browser, r.empresa.maestro, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto("/ranking");
      for (const posicion of [1, 2, 3]) {
        await tactil(page.getByRole("textbox", { name: `Monto del premio — posición ${posicion}` }));
        await tactil(page.getByRole("textbox", { name: `Descripción — posición ${posicion}` }));
      }
      const guardar = page.locator(PREMIOS_TABLA).getByRole("button", { name: "Guardar" });
      await expect(guardar).toHaveCount(3);
      for (let i = 0; i < 3; i++) await tactil(guardar.nth(i));
      await sinElipsis(tarjetaCon(page, PREMIOS_TABLA));
      await sinDesborde(page);
      await page.context().close();
    });

    test(`(c) R755, R757, R758-R761, R766: /ranking/historico a ${ancho} px`, async ({ browser }) => {
      const page = await paginaDe(browser, largo, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(`/ranking/historico?fecha=${ayer}`);

      // R757: la fecha a todo el ancho y 44 px.
      const fecha = page.getByLabel("Fecha del histórico");
      await tactil(fecha);
      const cajaFecha = await fecha.boundingBox();
      const cajaTabla = await page.locator(HISTORICO_TABLA).boundingBox();
      expect(cajaFecha && cajaTabla).toBeTruthy();
      expect(cajaFecha!.width).toBeGreaterThanOrEqual(cajaTabla!.width - 2);

      // R755, R758, R759: la tarjeta del nombre largo, entera y sin datos montados.
      const tarjeta = page.locator(`${HISTORICO_TABLA} tbody tr`).filter({ hasText: MENSAJERO_LARGO });
      await expect(tarjeta).toHaveCount(1);
      await expect(tarjeta.getByText(PREMIO_DESCRIPCION_LARGA, { exact: false })).toBeVisible();
      await sinElipsis(tarjetaCon(page, HISTORICO_TABLA));
      await sinSolapes(tarjeta, "[data-columna]");

      // R755, R760: el desplegar a la derecha de la tarjeta, a 44 px, y abre Puesto/Entregado/Asignados.
      const desplegar = tarjeta.getByRole("button", { name: "Ver detalle" });
      await tactil(desplegar);
      const cajaBoton = await desplegar.boundingBox();
      const cajaNombre = await tarjeta.locator('[data-columna="nombre"]').boundingBox();
      expect(cajaBoton!.x).toBeGreaterThanOrEqual(cajaNombre!.x + cajaNombre!.width - 1);
      await desplegar.click();
      await expect(tarjeta.getByRole("button", { name: "Ocultar detalle" })).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Puesto", { exact: true })).toBeVisible();

      // R766: «Descargar» a todo el ancho, 44 px y encima de la lista.
      await descargaAnchaEncima(page, page.getByRole("button", { name: `Descargar Ranking del día ${ayer}` }), HISTORICO_TABLA);

      // R761: nada desborda (con el detalle abierto).
      await sinDesborde(page);
      await page.context().close();
    });
  }
});
