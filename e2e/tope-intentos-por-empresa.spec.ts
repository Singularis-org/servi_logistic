import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { crearUsuarioE2E, type UsuarioE2E } from "../tests/fabricas/e2e";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { marcarCasilla } from "./_escenarios/casillas";
import { aprobarCierre, cierresDe, importe, solicitarCierre } from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
import { abrirCon } from "./_escenarios/pulsar";
import {
  baseReparto,
  corregirFechaReprogramacion,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  gestionesDe,
  hoyDeLaApp,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import { abrirTarifas, elegirOpcion } from "./_tarifas-activacion-fixture";

/**
 * SLT-77 T6.1 — el tope de intentos de cada empresa, de la sección de Tarifas a lo que el usuario ve después.
 *
 * DATOS: dos empresas nuevas, A y B, idénticas, por los servicios reales. El `maestro` de A baja su tope a 2 y lo
 * vuelve a subir a 3 por la pantalla; B se queda en 3. La aprobación de los cierres que aquí se miran va también por
 * la pantalla: es lo único que ejercita la relectura del tope con el cliente real de la app (R35, R36).
 *
 * CIFRAS, a mano:
 *   Tope                     A: 3, luego 2, luego 3      B: 3 siempre
 *   Pago al mensajero        1.500 por entregado, 900 por rechazo
 *   Órdenes de cada empresa, con sus intentos vigentes al bajar A a 2:
 *     novedad                2 (reprogramada + `wrong_address`), en `novedad`, con ventana de 5 días sin vencer
 *     barrida                2 (dos reprogramadas), en la mano del mensajero
 *     bodega                 2 (dos reprogramadas), en `en_bodega_satelite`
 *     panel                  1 (una reprogramada), en la mano del mensajero
 *   Desenlaces:
 *     novedad   A: rechazo en la corrida; el siguiente cierre lleva 900.   B: sigue en `novedad`, sin gestión sintética.
 *     barrida   A: rechazo al aprobar; el siguiente cierre lleva 900.      B: a su bodega, sin gestión sintética.
 *     bodega    A: no se asigna con 2, y se asigna con 3.                  B: se asigna.
 *     panel     A: en el tope, sin «Reprogramar» ni «Devolver».            B: los ofrece.
 *
 * ⚠️ EXCEPCIÓN (como `anclarDevolucionHaceDias`): el corte solo barre lo reservado para un día ya cerrado, y asignar
 * reserva para hoy. Sin reloj falso, `repartoDeDiasAtras` mueve al pasado la `fecha_reparto` de la orden barrida. Solo
 * esa fecha: el barrido, el cierre y el rechazo los producen el cron, la pantalla y el servicio reales.
 *
 * El panel del mensajero se mira antes del corte, que le barrería la orden: por eso va antes que el paso 3 de `tasks.md`.
 */

const TARIFA_MENSAJERO = { cobroEntregado: 1500, cobroRechazado: 900 };
const COBRO_RECHAZO = 900;

const CONTEXTO_MENSAJERO = { geolocation: { latitude: 9.9281, longitude: -84.0907 }, permissions: ["geolocation"] };
const RECHAZO = "devolucion_a_origen_por_rechazo";
const DIA_MS = 24 * 60 * 60 * 1000;

const AVISO_AL_BAJAR =
  "Guardar no rechaza ni cobra nada. Pero las novedades que ya alcancen este número se rechazan solas, sin más clics, unas en la siguiente corrida automática y otras al vencer su plazo, y ese rechazo genera cobro. Las órdenes en bodega que ya lo alcancen no se podrán asignar.";
const MOTIVO_TOPE_EN_LA_RESPUESTA = "esta orden ya agoto sus intentos de entrega: no puede volver a salir a reparto";
const MOTIVO_RECHAZO_AL_APROBAR = "sin intentos de entrega disponibles";

interface EmpresaDelCaso {
  r: RepartoE2E;
  mNovedad: MensajeroE2E;
  mBarrida: MensajeroE2E;
  mBodega: MensajeroE2E;
  mPanel: MensajeroE2E;
  novedad: OrdenE2E;
  barrida: OrdenE2E;
  bodega: OrdenE2E;
  panel: OrdenE2E;
}

/** Un intento real: reprogramada, cierre aprobado, fecha llegada y liberada por el cron. Vuelve a su bodega. */
async function intentoReprogramado(r: RepartoE2E, orden: OrdenE2E, m: MensajeroE2E, bodega: string): Promise<OrdenE2E> {
  const enCalle = await llevarA(r, orden, "en_reparto", { mensajero: m });
  await gestionar(r, enCalle, m, { resultado: "reprogramado", motivo: "No estaba" });
  await aprobarCierre(r, await solicitarCierre(r, m));
  await corregirFechaReprogramacion(r, enCalle);
  await correrCron("liberar-reprogramadas");
  expect(await estadoDe(enCalle)).toBe(bodega);
  return enCalle;
}

async function montarEmpresa(etiqueta: string): Promise<EmpresaDelCaso> {
  const r = await crearEscenarioReparto(etiqueta, { tarifaMensajero: TARIFA_MENSAJERO });
  const mNovedad = await crearMensajero(r, "central");
  const mBarrida = await crearMensajero(r, "central");
  const mBodega = await crearMensajero(r, "satelite");
  const mPanel = await crearMensajero(r, "central");

  let novedad = await intentoReprogramado(r, await crearOrden(r, { zona: "central" }), mNovedad, "en_bodega_central");
  novedad = await llevarA(r, novedad, "en_reparto", { mensajero: mNovedad });
  await gestionar(r, novedad, mNovedad, { resultado: "novedad", causa: "wrong_address", motivo: "La dirección no existe" });
  await aprobarCierre(r, await solicitarCierre(r, mNovedad));
  expect(await estadoDe(novedad)).toBe("novedad");

  let barrida = await intentoReprogramado(r, await crearOrden(r, { zona: "central" }), mBarrida, "en_bodega_central");
  barrida = await intentoReprogramado(r, barrida, mBarrida, "en_bodega_central");
  barrida = await llevarA(r, barrida, "en_reparto", { mensajero: mBarrida });

  let bodega = await intentoReprogramado(r, await crearOrden(r, { zona: "satelite" }), mBodega, "en_bodega_satelite");
  bodega = await intentoReprogramado(r, bodega, mBodega, "en_bodega_satelite");

  let panel = await intentoReprogramado(r, await crearOrden(r, { zona: "central" }), mPanel, "en_bodega_central");
  panel = await llevarA(r, panel, "en_reparto", { mensajero: mPanel });

  return { r, mNovedad, mBarrida, mBodega, mPanel, novedad, barrida, bodega, panel };
}

/** La excepción de la cabecera: la orden quedó reservada para un día que el corte ya cierra. */
async function repartoDeDiasAtras(r: RepartoE2E, orden: { id: string }): Promise<void> {
  const db = baseReparto();
  const n = await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, r.empresa.organizacionId);
    const res = await tx.orden.updateMany({
      where: { id: orden.id },
      data: { fechaReparto: new Date(new Date(`${hoyDeLaApp()}T00:00:00.000Z`).getTime() - 2 * DIA_MS) },
    });
    return res.count;
  });
  if (n !== 1) throw new Error(`SLT-77 E2E: la orden debía existir una vez y aparece ${n}.`);
}

const seccionDe = (page: Page): Locator => page.getByRole("region", { name: "Intentos de entrega", exact: true });
const controlDe = (page: Page): Locator => seccionDe(page).getByRole("combobox", { name: "Intentos de entrega", exact: true });
const avisoDe = (page: Page): Locator => seccionDe(page).getByText(AVISO_AL_BAJAR, { exact: true });
const guardarDe = (page: Page): Locator => seccionDe(page).getByRole("button", { name: "Guardar", exact: true });

async function topeEnBase(organizacionId: string): Promise<number> {
  const o = await baseReparto().organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { topeIntentosEntrega: true } });
  return o.topeIntentosEntrega;
}

/** Lo que guardar el tope no debe mover (R8): cada orden y las cinco tablas que cuelgan de ella, de esa empresa. */
async function fotoDeLaEmpresa(organizacionId: string): Promise<string> {
  const db = baseReparto();
  const donde = { where: { organizacionId } };
  const [ordenes, gestiones, historial, cierres, detalles, billetera] = await Promise.all([
    db.orden.findMany({
      ...donde,
      orderBy: { id: "asc" },
      select: { id: true, estatusId: true, mensajeroAsignadoId: true, fechaReparto: true, updatedAt: true },
    }),
    db.gestionOrden.count(donde),
    db.ordenHistorialEstado.count(donde),
    db.cierreDia.count(donde),
    db.cierreDetail.count(donde),
    db.walletMovimiento.count(donde),
  ]);
  return JSON.stringify({ ordenes, gestiones, historial, cierres, detalles, billetera });
}

/** El badge de la línea de tiempo, tal como lo lee quien abre el historial en `/ordenes`. */
async function intentoQueVe(browser: Browser, u: UsuarioE2E, orden: OrdenE2E, texto: string): Promise<void> {
  const page = await paginaDe(browser, u);
  await page.goto("/ordenes");
  const dialogo = page.getByRole("dialog", { name: `Historial de la orden ${orden.numRemision}` });
  await abrirCon(page.getByRole("button", { name: `Ver historial de la orden ${orden.numRemision}` }), dialogo);
  await expect(dialogo.getByRole("status", { name: `Intentos de entrega: ${texto.replace("Intento ", "")}` })).toHaveText(texto);
  await page.context().close();
}

/** El mensajero solicita en pantalla. Devuelve el id del cierre: el nuevo, o el vencido que pasó a solicitado. */
async function solicitarEnPantalla(browser: Browser, m: MensajeroE2E): Promise<string> {
  const page = await paginaDe(browser, m);
  await page.goto("/cierre-dia");
  const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
  await abrirCon(page.getByRole("region", { name: "Solicitar cierre" }).getByRole("button", { name: "Solicitar cierre" }), dialogo);
  await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
  await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();
  await page.context().close();
  const cierres = await cierresDe(m);
  return cierres[cierres.length - 1].id;
}

async function enviarVencidoEnPantalla(browser: Browser, m: MensajeroE2E): Promise<void> {
  const page = await paginaDe(browser, m);
  await page.goto("/cierre-dia");
  const dialogo = page.getByRole("dialog", { name: "Solicitar aprobación del cierre vencido" });
  await abrirCon(
    page.getByRole("region", { name: "Cierre vencido" }).getByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    dialogo,
  );
  await dialogo.getByRole("button", { name: "Solicitar aprobación" }).click();
  await expect(page.getByText("Cierre vencido enviado a aprobación.")).toBeVisible();
  await page.context().close();
}

/** La aprobación real: el maestro, con su sesión y el cliente real de la app, confirmando la guía que vuelve. */
async function aprobarEnPantalla(browser: Browser, r: RepartoE2E, m: MensajeroE2E, orden: OrdenE2E, ingreso: number | null): Promise<void> {
  const page = await paginaDe(browser, r.empresa.maestro);
  await page.goto("/cierres-admin");
  const comprobante = page
    .getByRole("region", { name: "Pendientes de decisión" })
    .getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await abrirCon(comprobante.getByRole("button", { name: "Ver / decidir" }), detalle);
  if (ingreso !== null) {
    await expect(detalle.getByRole("region", { name: "Ingreso de bodega por devoluciones a origen del cierre" })).toContainText(importe(ingreso));
  }
  const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
  await abrirCon(detalle.getByRole("button", { name: "Aprobar", exact: true }), confirmar);
  const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
  await lector.getByLabel("Número de guía").fill(String(orden.numGuia));
  await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
  const aprobar = confirmar.getByRole("button", { name: "Confirmar y aprobar" });
  await expect(aprobar).toBeEnabled();
  await aprobar.click();
  await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
  await page.context().close();
}

const sinteticasDe = async (orden: OrdenE2E) => (await gestionesDe(orden)).filter((g) => g.resultado === RECHAZO);

/** Marca la orden en la bodega satélite, elige al mensajero y pulsa «Asignar». Deja el modal como haya quedado. */
async function intentarAsignar(page: Page, orden: OrdenE2E, m: MensajeroE2E): Promise<Locator> {
  await page.goto("/recepcion-satelite/en-bodega");
  const bodega = page.getByRole("region", { name: "Órdenes de la bodega" });
  await marcarCasilla(bodega.getByRole("checkbox", { name: `Seleccionar ${orden.numRemision}` }));
  const modal = page.getByRole("dialog", { name: "Asignar mensajero" });
  await abrirCon(bodega.getByRole("button", { name: "Asignar", exact: true }), modal);
  await modal.getByRole("combobox", { name: "Mensajero para el lote" }).click();
  await page.getByRole("option", { name: m.nombre, exact: true }).click();
  await modal.getByRole("button", { name: "Asignar", exact: true }).click();
  return modal;
}

async function asignarYVer(page: Page, orden: OrdenE2E, m: MensajeroE2E): Promise<void> {
  const modal = await intentarAsignar(page, orden, m);
  await expect(modal.getByText("Mensajero asignado a 1 orden(es).").first()).toBeVisible();
  await page.context().close();
  expect(await estadoDe(orden)).toBe("mensajero_recogiendo_en_bodega");
}

const CABECERAS_DEL_CUERPO_ORIGINAL = new Set(["content-encoding", "content-length", "transfer-encoding"]);
const TIPOS_QUE_SE_LEEN = ["text/html", "text/x-component", "application/json"];

/**
 * Lo que el servidor le mandó a esa página, sin el JS del bundle: documentos y respuestas de acción.
 *
 * El cuerpo se lee en el proceso del test (`route.fetch`), NO con `response.text()` de un `page.on("response")`:
 * ese lee por CDP (`Network.getResponseBody`), y Chromium tira el cuerpo de las respuestas en streaming de Next
 * («No data found for resource with given identifier»). Medido en local: 134 de 290 cuerpos perdidos en una tanda,
 * acciones incluidas. Era lo que ponía rojo el paso 4 a ratos: la página sí recibía el motivo, el lector no.
 * Un cuerpo que no se pudo leer hace caer `leer()`: un "" silencioso dejaría ciegas las búsquedas en negativo.
 */
async function escucharRespuestas(page: Page): Promise<() => Promise<string>> {
  const capturas: Promise<{ texto: string } | { error: string }>[] = [];
  await page.route(
    (url) => !url.pathname.startsWith("/_next/static/"),
    async (route) => {
      const pedido = route.request();
      if (!["document", "fetch", "xhr"].includes(pedido.resourceType())) return route.fallback();
      // Sin seguir redirecciones: el navegador recibe el 3xx tal cual y lo sigue él, como sin la ruta.
      const respuesta = route.fetch({ maxRedirects: 0 });
      capturas.push(
        respuesta.then(
          async (r) => {
            const tipo = r.headers()["content-type"] ?? "";
            return { texto: TIPOS_QUE_SE_LEEN.some((t) => tipo.includes(t)) ? await r.text() : "" };
          },
          (e: unknown) => ({ error: `${pedido.method()} ${pedido.url()}: ${e instanceof Error ? e.message : String(e)}` }),
        ),
      );
      const r = await respuesta.catch(() => null);
      if (!r) return route.abort().catch(() => undefined);
      // El cuerpo ya viene descomprimido: sin estas cabeceras el navegador lo trataría como gzip.
      const headers = Object.fromEntries(Object.entries(r.headers()).filter(([k]) => !CABECERAS_DEL_CUERPO_ORIGINAL.has(k.toLowerCase())));
      // Una prefetch que el navegador ya canceló no admite respuesta; su cuerpo ya quedó capturado.
      await route.fulfill({ status: r.status(), headers, body: await r.body() }).catch(() => undefined);
    },
  );
  // Dentro de un documento, el JSON del servidor viaja escapado en un `<script>`: sin quitar las barras, una búsqueda de
  // `"umbral"` no vería nada aunque estuviera.
  return async () => {
    const leidas = await Promise.all(capturas);
    const fallos = leidas.flatMap((l) => ("error" in l ? [l.error] : []));
    if (fallos.length > 0) throw new Error(`SLT-77 E2E: no se pudo leer la respuesta de ${fallos.join("; ")}`);
    return leidas.map((l) => ("texto" in l ? l.texto : "")).join("\n").replace(/\\+"/g, '"');
  };
}

async function abrirGestionDelMensajero(page: Page, orden: OrdenE2E): Promise<Locator> {
  await page.goto("/mis-asignaciones/reparto");
  const panel = page.getByRole("region", { name: "Detalle de la orden" });
  await expect(panel.getByText(`Guía ${orden.numGuia}`).first()).toBeVisible();
  const gate = panel.getByRole("region", { name: "Verificar la guía del paquete antes de gestionar" });
  await abrirCon(panel.getByRole("button", { name: "Gestionar esta orden" }), gate);
  await gate.getByLabel("Número de guía").fill(String(orden.numGuia));
  await gate.getByRole("button", { name: "Gestionar", exact: true }).click();
  await expect(panel.getByText("¿Cómo terminó la gestión?")).toBeVisible();
  return panel;
}

const anchoDePagina = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);

/** El alto de cada control visible de `zona`, sin el `input` oculto del `Select` de Base UI. */
async function altosDeControles(zona: Locator): Promise<{ nombre: string; alto: number }[]> {
  return zona.evaluate((raiz) => {
    const controles = raiz.querySelectorAll<HTMLElement>("button, input, select, textarea, [role='combobox']");
    return [...controles]
      .filter((c) => c.getClientRects().length > 0 && getComputedStyle(c).visibility !== "hidden" && c.closest("[aria-hidden='true']") === null)
      .map((c) => ({ nombre: c.getAttribute("aria-label") ?? c.textContent ?? c.tagName, alto: c.getBoundingClientRect().height }));
  });
}

/**
 * El contraste real de un texto (WCAG 2.1). Los colores se resuelven pintándolos en un canvas: los tokens llegan en
 * `oklch()` y con transparencia, y el aviso en oscuro es un `/15` sobre la tarjeta. Se compone el fondo desde la raíz.
 */
async function contrasteDe(texto: Locator): Promise<number> {
  return texto.evaluate((el) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 1;
    lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (ctx === null) throw new Error("sin canvas");
    const capas: string[] = [];
    for (let nodo: Element | null = el; nodo !== null; nodo = nodo.parentElement) capas.unshift(getComputedStyle(nodo).backgroundColor);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
    for (const capa of capas) {
      ctx.fillStyle = capa;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [fr, fg, fb] = ctx.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    const [tr, tg, tb] = ctx.getImageData(0, 0, 1, 1).data;
    const lin = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const [a, b] = [lum(fr, fg, fb), lum(tr, tg, tb)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  });
}

test.use({ actionTimeout: 30_000 });

test.describe.serial("Tope de intentos por empresa (SLT-77)", () => {
  let a: EmpresaDelCaso;
  let b: EmpresaDelCaso;
  let adminDeA: UsuarioE2E;
  let accionGuardar: { id: string; cuerpo: string } | undefined;

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    a = await montarEmpresa("tope-intentos-a");
    b = await montarEmpresa("tope-intentos-b");
    adminDeA = await crearUsuarioE2E(a.r.empresa, "admin");
  });

  test("paso 1 — las dos empresas ven 3, y con 3 una novedad de dos intentos espera su ventana (R2, R12)", async ({ browser }) => {
    for (const e of [a, b]) {
      const page = await paginaDe(browser, e.r.empresa.maestro);
      await abrirTarifas(page);
      await expect(controlDe(page)).toHaveText("3");
      await expect(guardarDe(page)).toBeDisabled();
      await expect(avisoDe(page)).toHaveCount(0);
      await page.context().close();
      expect(await topeEnBase(e.r.empresa.organizacionId)).toBe(3);
    }
    await correrCron("procesar-devueltas-sla");
    for (const e of [a, b]) {
      expect(await estadoDe(e.novedad)).toBe("novedad");
      expect(await sinteticasDe(e.novedad)).toEqual([]);
    }
  });

  test("paso 2 — el maestro de A elige 2: ve el aviso antes de guardar, y guardar no mueve nada (R8, R15, R16)", async ({ browser }) => {
    const idA = a.r.empresa.organizacionId;
    const idB = b.r.empresa.organizacionId;
    const fotoA = await fotoDeLaEmpresa(idA);
    const fotoB = await fotoDeLaEmpresa(idB);

    const page = await paginaDe(browser, a.r.empresa.maestro);
    await abrirTarifas(page);
    page.on("request", (req) => {
      const id = req.headers()["next-action"];
      const cuerpo = req.postData();
      if (id !== undefined && cuerpo !== null && cuerpo.includes('"tope"')) accionGuardar = { id, cuerpo };
    });

    await elegirOpcion(page, controlDe(page), /^4$/);
    await expect(avisoDe(page)).toHaveCount(0);
    await elegirOpcion(page, controlDe(page), /^2$/);
    await expect(avisoDe(page)).toBeVisible();
    // Antes de guardar: se ve el aviso, y en la base sigue el 3.
    expect(await topeEnBase(idA)).toBe(3);

    await guardarDe(page).click();
    await expect(page.getByText("Intentos de entrega guardados.")).toBeVisible();
    await expect(avisoDe(page)).toHaveCount(0);
    await expect(guardarDe(page)).toBeDisabled();
    expect(await topeEnBase(idA)).toBe(2);
    expect(accionGuardar?.cuerpo).toContain('"tope":2');

    await page.reload();
    await expect(controlDe(page)).toHaveText("2");
    await page.context().close();

    expect(await fotoDeLaEmpresa(idA)).toBe(fotoA);
    expect(await fotoDeLaEmpresa(idB)).toBe(fotoB);
    expect(await estadoDe(a.novedad)).toBe("novedad");

    const pageB = await paginaDe(browser, b.r.empresa.maestro);
    await abrirTarifas(pageB);
    await expect(controlDe(pageB)).toHaveText("3");
    await pageB.context().close();
    expect(await topeEnBase(idB)).toBe(3);
  });

  test("la línea de tiempo da a cada empresa su total, y el panel del mensajero decide sin traer el número (R24, R25, R32)", async ({ browser }) => {
    await intentoQueVe(browser, a.r.empresa.maestro, a.novedad, "Intento 2 de 2");
    await intentoQueVe(browser, b.r.empresa.maestro, b.novedad, "Intento 2 de 3");

    // A, con tope 2: un intento ya está en el tope. B, con tope 3: todavía no.
    const pageA = await paginaDe(browser, a.mPanel, CONTEXTO_MENSAJERO);
    const leerA = await escucharRespuestas(pageA);
    const panelA = await abrirGestionDelMensajero(pageA, a.panel);
    await expect(panelA.getByRole("button", { name: "Reprogramar", exact: true })).toHaveCount(0);
    await expect(panelA.getByRole("button", { name: "Devolver", exact: true })).toHaveCount(0);
    await expect(panelA.getByRole("button", { name: "Entregar", exact: true })).toBeVisible();
    await expect(panelA.getByRole("button", { name: "Rechazar", exact: true })).toBeVisible();
    await expect(panelA.getByRole("note").first()).toBeVisible();
    const textoA = await panelA.innerText();
    const respuestasA = await leerA();
    await pageA.context().close();

    const pageB = await paginaDe(browser, b.mPanel, CONTEXTO_MENSAJERO);
    const leerB = await escucharRespuestas(pageB);
    const panelB = await abrirGestionDelMensajero(pageB, b.panel);
    await expect(panelB.getByRole("button", { name: "Reprogramar", exact: true })).toBeVisible();
    await expect(panelB.getByRole("button", { name: "Devolver", exact: true })).toBeVisible();
    const respuestasB = await leerB();
    await pageB.context().close();

    // El lector no está ciego: lo que sí viaja es el booleano ya decidido, distinto en cada empresa.
    expect(respuestasA).toContain('"enElTope":true');
    expect(respuestasB).toContain('"enElTope":false');
    for (const respuestas of [respuestasA, respuestasB]) {
      expect(respuestas).not.toMatch(/"umbral"|"tope"|topeIntentos|tope_intentos/);
    }
    expect(textoA).not.toMatch(/\bde 2\b/);
  });

  test("paso 3 — la novedad de A escala en la corrida, sin más clics, y el siguiente cierre lleva 900; la de B no (R22, R26)", async ({ browser }) => {
    const previosB = (await cierresDe(b.mNovedad)).length;

    await correrCron("procesar-devueltas-sla");

    expect(await estadoDe(a.novedad)).toBe(RECHAZO);
    const [sintetica, ...resto] = await sinteticasDe(a.novedad);
    expect(resto).toEqual([]);
    expect(sintetica.cierreId).toBeNull();
    expect(await estadoDe(b.novedad)).toBe("novedad");
    expect(await sinteticasDe(b.novedad)).toEqual([]);
    expect(await cierresDe(b.mNovedad)).toHaveLength(previosB);

    const pageA = await paginaDe(browser, a.r.empresa.maestro);
    await pageA.goto("/ordenes");
    await expect(pageA.getByRole("row", { name: new RegExp(a.novedad.numRemision) }).getByText("Devolución a origen por rechazo").first()).toBeVisible();
    await pageA.context().close();
    const pageB = await paginaDe(browser, b.r.empresa.maestro);
    await pageB.goto("/ordenes");
    const filaB = pageB.getByRole("row", { name: new RegExp(b.novedad.numRemision) });
    await expect(filaB).toBeVisible();
    await expect(filaB.getByText("Devolución a origen por rechazo")).toHaveCount(0);
    await pageB.context().close();

    const cierreId = await solicitarEnPantalla(browser, a.mNovedad);
    const siguiente = (await cierresDe(a.mNovedad)).find((c) => c.id === cierreId);
    expect(String(siguiente?.totalIngresoBodegaRechazos)).toBe(String(COBRO_RECHAZO));
    await aprobarEnPantalla(browser, a.r, a.mNovedad, a.novedad, COBRO_RECHAZO);
    expect((await cierresDe(a.mNovedad)).find((c) => c.id === cierreId)?.estado).toBe("aprobado");
    expect((await sinteticasDe(a.novedad)).map((g) => g.cierreId)).toEqual([cierreId]);
  });

  test("aprobar por la app relee el tope: la barrida de A se rechaza y la de B va a su bodega (R21, R35, R36)", async ({ browser }) => {
    await repartoDeDiasAtras(a.r, a.barrida);
    await repartoDeDiasAtras(b.r, b.barrida);
    await correrCron("corte-diario");
    for (const e of [a, b]) {
      expect(await estadoDe(e.barrida)).toBe("novedad_interna");
      expect((await cierresDe(e.mBarrida)).at(-1)?.estado).toBe("vencido");
      await enviarVencidoEnPantalla(browser, e.mBarrida);
      expect((await cierresDe(e.mBarrida)).at(-1)?.estado).toBe("solicitado");
      await aprobarEnPantalla(browser, e.r, e.mBarrida, e.barrida, null);
      expect((await cierresDe(e.mBarrida)).at(-1)?.estado).toBe("aprobado");
    }

    // A, con tope 2 y dos intentos: rechazo, con su gestión sintética y su rastro. Vuelve a la tienda.
    expect(await estadoDe(a.barrida)).toBe("por_devolver_a_tienda");
    const [sintetica, ...resto] = await sinteticasDe(a.barrida);
    expect(resto).toEqual([]);
    expect(sintetica.cierreId).toBeNull();
    expect(sintetica.motivo).toContain(MOTIVO_RECHAZO_AL_APROBAR);
    const rastro = (id: string) => baseReparto().ordenHistorialEstado.count({ where: { ordenId: id, origenTipo: "rechazo_tope_intentos" } });
    expect(await rastro(a.barrida.id)).toBe(1);

    // B, con tope 3 y dos intentos: vuelve a su bodega, sin cobro.
    expect(await estadoDe(b.barrida)).toBe("en_bodega_central");
    expect(await sinteticasDe(b.barrida)).toEqual([]);
    expect(await rastro(b.barrida.id)).toBe(0);

    // El cobro entra en el siguiente cierre de A, y B no tiene de qué pedirlo.
    const cierreId = await solicitarEnPantalla(browser, a.mBarrida);
    const siguiente = (await cierresDe(a.mBarrida)).find((c) => c.id === cierreId);
    expect(String(siguiente?.totalIngresoBodegaRechazos)).toBe(String(COBRO_RECHAZO));
    expect((await sinteticasDe(a.barrida)).map((g) => g.cierreId)).toEqual([cierreId]);
    await aprobarEnPantalla(browser, a.r, a.mBarrida, a.barrida, COBRO_RECHAZO);
    expect((await cierresDe(a.mBarrida)).find((c) => c.id === cierreId)?.estado).toBe("aprobado");
  });

  test("paso 4 — en A, la orden de bodega con 2 intentos no se asigna; en B, sí (R20)", async ({ browser }) => {
    const page = await paginaDe(browser, a.r.adminSatelite);
    const leer = await escucharRespuestas(page);
    const modal = await intentarAsignar(page, a.bodega, a.mBodega);
    // Lo que ve quien asigna (R42): la causa, porque actualizar la lista no arregla una orden agotada.
    await expect(page.getByText("Alguna orden de la selección ya agotó sus intentos de entrega y no puede volver a salir a reparto. Quítala de la selección.").first()).toBeVisible();
    await expect(page.getByText("Alguna orden de la selección ya no se puede asignar. Actualiza la lista y vuelve a intentarlo.")).toHaveCount(0);
    await expect(modal.getByText("Mensajero asignado a 1 orden(es).")).toHaveCount(0);
    expect(await leer()).toContain(MOTIVO_TOPE_EN_LA_RESPUESTA);
    await page.context().close();
    expect(await estadoDe(a.bodega)).toBe("en_bodega_satelite");

    await asignarYVer(await paginaDe(browser, b.r.adminSatelite), b.bodega, b.mBodega);
  });

  test("paso 5 — sube a 3: la orden de bodega vuelve a asignarse, y el historial lo cuenta (R10, R16, R29)", async ({ browser }) => {
    const page = await paginaDe(browser, a.r.empresa.maestro);
    await abrirTarifas(page);
    await expect(controlDe(page)).toHaveText("2");
    await elegirOpcion(page, controlDe(page), /^3$/);
    await expect(avisoDe(page)).toHaveCount(0);
    await guardarDe(page).click();
    await expect(page.getByText("Intentos de entrega guardados.")).toBeVisible();
    await expect(guardarDe(page)).toBeDisabled();
    expect(await topeEnBase(a.r.empresa.organizacionId)).toBe(3);

    await asignarYVer(await paginaDe(browser, a.r.adminSatelite), a.bodega, a.mBodega);

    const filas = page.getByRole("row").filter({ hasText: "Cambió el tope de intentos de entrega" });
    await page.goto("/historico/acciones");
    await expect(filas).toHaveCount(2);
    const texto = async (fila: Locator): Promise<string[]> => (await fila.getByRole("cell").allInnerTexts()).map((t) => t.trim());
    const encabezados = (await page.getByRole("columnheader").allInnerTexts()).map((t) => t.trim());
    const col = (nombre: string): number => {
      const i = encabezados.indexOf(nombre);
      if (i < 0) throw new Error(`SLT-77 E2E: sin la columna «${nombre}»; hay ${encabezados.join(", ")}`);
      return i;
    };
    const [reciente, primera] = [await texto(filas.nth(0)), await texto(filas.nth(1))];
    expect([reciente[col("Valor anterior")], reciente[col("Valor nuevo")]]).toEqual(["2", "3"]);
    expect([primera[col("Valor anterior")], primera[col("Valor nuevo")]]).toEqual(["3", "2"]);
    expect(reciente.join(" ")).toContain(a.r.empresa.maestro.nombre);
    expect(primera.join(" ")).toContain(a.r.empresa.maestro.nombre);
    await page.context().close();

    // El historial de B no sabe nada de esto.
    const pageB = await paginaDe(browser, b.r.empresa.maestro);
    await pageB.goto("/historico/acciones");
    await expect(pageB.getByRole("heading", { name: "Registro de acciones" }).or(pageB.getByRole("table", { name: "Registro de acciones" })).first()).toBeVisible();
    await expect(pageB.getByRole("row").filter({ hasText: "Cambió el tope de intentos de entrega" })).toHaveCount(0);
    await pageB.context().close();
  });

  test("paso 6 — el admin lee sin control y su sesión no puede escribir; el mensajero no entra (R4, R13, R14)", async ({ browser }) => {
    const page = await paginaDe(browser, adminDeA);
    await abrirTarifas(page);
    await expect(seccionDe(page)).toContainText("3");
    await expect(seccionDe(page)).toContainText("Lo cambia el maestro.");
    await expect(seccionDe(page).getByRole("combobox")).toHaveCount(0);
    await expect(seccionDe(page).getByRole("button")).toHaveCount(0);

    // La misma acción que mandó el maestro, con la sesión del admin: `forbidden`, y nada escrito.
    expect(accionGuardar, "no se vio salir la acción de guardar").toBeDefined();
    const accion = accionGuardar as { id: string; cuerpo: string };
    const prohibida = await page.evaluate(
      async ({ id, cuerpo }) => {
        const res = await fetch("/configuracion/tarifas", {
          method: "POST",
          headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
          body: cuerpo,
        });
        return { status: res.status, texto: await res.text() };
      },
      { id: accion.id, cuerpo: accion.cuerpo.replace('"tope":2', '"tope":1') },
    );
    expect(prohibida.status).toBe(200);
    expect(prohibida.texto).toContain("forbidden");
    expect(await topeEnBase(a.r.empresa.organizacionId)).toBe(3);
    await page.context().close();

    const mensajero = await paginaDe(browser, a.mNovedad);
    await mensajero.goto("/configuracion/tarifas");
    await expect(mensajero.getByRole("alert").filter({ hasText: "No tienes permiso para acceder a esta sección." })).toBeVisible();
    await expect(seccionDe(mensajero)).toHaveCount(0);
    await mensajero.context().close();
  });

  // T6.3 y el paso 7: cada caso mide lo que Tanda E solo dejó atado por clases. El aviso se mira elegido sin guardar.
  for (const { ancho, alto } of [
    { ancho: 1360, alto: 900 },
    { ancho: 390, alto: 844 },
  ]) {
    for (const tema of ["claro", "oscuro"] as const) {
      test(`paso 7 — la sección a ${ancho} px en ${tema}: sin scroll, controles de 44 y contraste de 4,5 (R17)`, async ({ browser, baseURL }, info) => {
        const abrir = async (u: UsuarioE2E): Promise<Page> => {
          const page = await paginaDe(browser, u, { viewport: { width: ancho, height: alto } });
          await page.context().addCookies([{ name: "servi_logistic_tema", value: tema, url: baseURL ?? "" }]);
          await abrirTarifas(page);
          await expect(page.locator(".dark")).toHaveCount(tema === "oscuro" ? 1 : 0);
          await seccionDe(page).scrollIntoViewIfNeeded();
          return page;
        };

        const maestro = await abrir(a.r.empresa.maestro);
        await elegirOpcion(maestro, controlDe(maestro), /^2$/);
        await expect(avisoDe(maestro)).toBeVisible();
        await seccionDe(maestro).scrollIntoViewIfNeeded();
        const medidaMaestro = {
          scrollWidth: await anchoDePagina(maestro),
          viewport: ancho,
          controles: await altosDeControles(seccionDe(maestro)),
          contrasteAviso: await contrasteDe(avisoDe(maestro)),
          contrasteAyuda: await contrasteDe(seccionDe(maestro).getByText("Cuántos intentos se hacen antes de pasar una orden a rechazo.", { exact: false })),
          contrasteTitulo: await contrasteDe(seccionDe(maestro).getByRole("heading", { name: "Intentos de entrega" })),
          contrasteValor: await contrasteDe(controlDe(maestro)),
        };
        await maestro.screenshot({ path: info.outputPath(`seccion-${ancho}-${tema}.png`) });
        await maestro.context().close();

        const admin = await abrir(adminDeA);
        const medidaAdmin = {
          scrollWidth: await anchoDePagina(admin),
          contrasteValor: await contrasteDe(seccionDe(admin).locator("p.text-2xl")),
          contrasteNota: await contrasteDe(seccionDe(admin).getByText("Lo cambia el maestro.")),
        };
        await admin.screenshot({ path: info.outputPath(`solo-lectura-${ancho}-${tema}.png`) });
        await admin.context().close();

        console.log(`MEDIDA ${ancho} ${tema} ${JSON.stringify({ maestro: medidaMaestro, admin: medidaAdmin })}`);

        expect(medidaMaestro.scrollWidth).toBeLessThanOrEqual(ancho);
        expect(medidaAdmin.scrollWidth).toBeLessThanOrEqual(ancho);
        expect(medidaMaestro.controles.length).toBe(2);
        expect(medidaMaestro.controles.filter((c) => c.alto < 44)).toEqual([]);
        for (const contraste of [
          medidaMaestro.contrasteAviso,
          medidaMaestro.contrasteAyuda,
          medidaMaestro.contrasteTitulo,
          medidaMaestro.contrasteValor,
          medidaAdmin.contrasteValor,
          medidaAdmin.contrasteNota,
        ]) {
          expect(contraste).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
