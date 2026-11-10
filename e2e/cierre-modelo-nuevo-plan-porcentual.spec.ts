import { randomBytes } from "node:crypto";

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { Prisma } from "@prisma/client";

import { conEmpresa } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { ORDEN_MODULOS } from "../lib/modulos/catalogo";
import { OrdenRepository } from "../lib/repositories/OrdenRepository";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import { PlanesService } from "../lib/services/PlanesService";
import { RecepcionOrigenService } from "../lib/services/RecepcionOrigenService";
import { crearTarifaSchema } from "../lib/types/tarifa";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearUsuarioE2E, type UsuarioE2E } from "../tests/fabricas/e2e";
import { actorDe, exigirOk, servicios } from "../tests/fabricas/escenarios/reparto";

import { marcarCasilla } from "./_escenarios/casillas";
import { aprobarCierre, cierresDe, filaDeCola, pestanaDeCola, solicitarCierre } from "./_escenarios/cierres";
import { abrirCon } from "./_escenarios/pulsar";
import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  paginaDe,
  type GestionE2E,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import { asegurarSuperadmin, conCandadoDelSuperadmin, SUPERADMIN_DE_PRUEBA } from "./_superadmin-fixture";
import {
  abrirTarifas,
  activacionesDe,
  activarConFaltantes,
  cifraAsentada,
  digitarValorPropio,
  digitarYGuardar,
  editarValorPropio,
  elegirNivel,
  elegirOpcion,
  irAPestana,
  irAZona,
  valoresDe,
  type Digitado,
  type ValorPropioDigitado,
} from "./_tarifas-activacion-fixture";

/**
 * SLT-54 R67 + SLT-55 R40 + SLT-83 R28, JUNTOS — una empresa activada, con plan porcentual y un cierre aprobado.
 * Cada feature tiene su E2E por separado; este es el recorrido que ninguno hace: las tres reglas de dinero en el
 * mismo cierre, leídas en pantalla y en la base.
 *
 * DATOS: empresa A nueva, por los servicios reales. Plan público de 2 % con mínimo 500 (`PlanesService`, costo base
 * 1.000 al mes). T1 y T2, sus dos tiendas, y M1 y M2, de la zona central: el cierre de una satélite no entra en las
 * wallets hasta consolidarse. Empresa B, sin activar y sin plan, para el aislamiento; su cierre sale en la misma
 * corrida que los de A, con A ya activada: el mismo día.
 *
 * CIFRAS, A MANO. Nada de esto se lee de la función que se prueba.
 *
 * Tarifas (todas distintas: un error de precedencia no da el mismo número por casualidad)
 *                                   Viejo T1      Viejo T2      Zona (general)   T2 (todas sus zonas)
 *   Flete por entregado             2.500 + 13 %  2.600 + 13 %  3.100 + 13 %     4.700 + 4 %
 *   Flete por devolución a origen   1.250 + 13 %  1.300 + 13 %  1.400 + 13 %     1.900 + 4 %
 *   Flete por reprogramado          no cobra      no cobra      250 + 13 %       (cae a la zona)
 *   Flete por novedad               no cobra      no cobra      350 + 13 %       (cae a la zona)
 *
 *                                   Viejo         Zona          Propio de M1
 *   Pago por entregado              1.700         2.200         2.900 (monto)
 *   Pago por devolución a origen    no paga       180           15 % del flete sin IVA
 *   Pago por reprogramado           no paga       90            (usa la zona)
 *   Pago por novedad                no paga       70            (usa la zona)
 *
 * Costo de plataforma: max(2 % del valor, 500), al llegar la orden a un estado final. Sin IVA.
 *
 * ── Cierre VIEJO de M1, con todo digitado y sin activar ─────────────────────────────────────
 *   orden  tienda  resultado   valor    cobro                          pago    plataforma
 *   V1     T1      entregado   60.000   2.500 + 325 = 2.825            1.700   1.200 (2 %)
 *   V2     T2      rechazo     vacío    1.300 + 169 = 1.469            0       0 (no es final)
 *   Total de la empresa 4.294 · pago 1.700 · recaudo 60.000
 *
 * ── Cierre NUEVO de M1, activada ────────────────────────────────────────────────────────────
 *   N1     T1      entregado   100.000  3.100 + 403 = 3.503     zona   2.900   2.000 (2 % > piso)
 *   N2     T2      entregado    10.000  4.700 + 188 = 4.888     T2     2.900     500 (2 % = 200: piso)
 *   N3     T1      reprogram.   30.000    250 + 32,50 = 282,50  zona      90       0 (no es final)
 *   N4     T2      rechazo      45.000  1.900 + 76 = 1.976      T2       285       0 hasta volver a la tienda
 *                                         (285 = 15 % de 1.900, el flete de T2 y no el de la zona: 210)
 *   Total de la empresa 3.503 + 4.888 + 282,50 + 1.976 = 10.649,50 · pago 2.900 + 2.900 + 90 + 285 = 6.175
 *   Recaudo 110.000, y el pago sale de ese efectivo (6.175 devengado, 6.175 pagado).
 *   Tienda T1: +100.000; flete 3.100; IVA 403; no entregadas 250; IVA 32,50.
 *   Tienda T2:  +10.000; flete 4.700; IVA 188; no entregadas 1.900; IVA 76.
 *   Empresa:   flete 7.800; IVA 591; no entregadas 2.150; IVA 108,50.
 *
 * ── Cierre NUEVO de M2, sin valor propio ────────────────────────────────────────────────────
 *   Z1     T2      entregado    40.000  4.700 + 188 = 4.888     T2     2.200     800 (2 %)
 *   Z2     T1      novedad       5.000    350 + 45,50 = 395,50  zona      70       0
 *   Z3     T2      reprogram.   15.000    250 + 32,50 = 282,50  ZONA      90       0 (T2 no lo pactó: IVA 13 %, no 4 %)
 *   Total de la empresa 4.888 + 395,50 + 282,50 = 5.566 · pago 2.200 + 70 + 90 = 2.360
 *
 * ── Después de aprobar: zona 3.100 → 3.300, T2 4.700 → 5.000, propio de M1 2.900 → 3.000 ────
 *   Los cierres anteriores no se mueven. El siguiente de M1:
 *   S1     T1      entregado    70.000  3.300 + 429 = 3.729     zona   3.000   1.400 (2 %)
 *
 * ── Deuda con la plataforma, acumulada ──────────────────────────────────────────────────────
 *   V1 1.200 → N1 + N2 3.700 → Z1 4.500 → N4 de vuelta en la tienda (2 % de 45.000 = 900) 5.400 → S1 6.800.
 *   Sin estado final: V2, N3, Z2, Z3 = 4. «Mi plan»: 1000.00 + 6800.00 = 7800.00.
 *
 * ── Empresa B, sin activar y sin plan ───────────────────────────────────────────────────────
 *   B1     entregado    24.000  2.700 + 351 = 3.051        pago 1.600
 *   B2     rechazo      vacío   1.350 + 175,50 = 1.525,50  pago 0
 *   Total de la empresa 4.576,50 · cargo de plataforma 0 en cada orden, deuda 0.
 *
 * Todo lleva sufijo aleatorio y nada se borra: dos corridas seguidas sobre la misma base pasan.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

const TARIFA_T1 = { valorFlete: 2500, valorFleteGam: 2500, valorFleteDevuelto: 1250, valorFleteDevueltoGam: 1250, ivaFlete: 13 };
const TARIFA_T2 = { valorFlete: 2600, valorFleteGam: 2600, valorFleteDevuelto: 1300, valorFleteDevueltoGam: 1300, comisionCod: 0, ivaFlete: 13, ivaComisionCod: 0 };
const TARIFA_B = { valorFlete: 2700, valorFleteGam: 2700, valorFleteDevuelto: 1350, valorFleteDevueltoGam: 1350, ivaFlete: 13 };
const PAGO_VIEJO = { cobroEntregado: 1700, cobroRechazado: 300 };
const PAGO_VIEJO_B = { cobroEntregado: 1600, cobroRechazado: 250 };

const COBRO_ZONA: readonly Digitado[] = [
  { concepto: "Flete por entregado", valor: "3100", iva: "13" },
  { concepto: "Flete por devolución a origen", valor: "1400", iva: "13" },
  { concepto: "Flete por reprogramado", valor: "250", iva: "13" },
  { concepto: "Flete por novedad", valor: "350", iva: "13" },
];
const COBRO_T2: readonly Digitado[] = [
  { concepto: "Flete por entregado", valor: "4700", iva: "4" },
  { concepto: "Flete por devolución a origen", valor: "1900", iva: "4" },
];
const PAGO_ZONA: readonly Digitado[] = [
  { concepto: "Por entregado", valor: "2200" },
  { concepto: "Por devolución a origen", valor: "180" },
  { concepto: "Por reprogramado", valor: "90" },
  { concepto: "Por novedad", valor: "70" },
];
const PROPIO_M1: readonly ValorPropioDigitado[] = [
  { concepto: "Por entregado", valor: "2900", modo: "Monto" },
  { concepto: "Por devolución a origen", valor: "15", modo: "%" },
];

/** Los fletes congelados en un detalle de T1, con el nivel de la zona: todo lo que T1 tenía resuelto. */
const CONCEPTOS_T1 = [
  "tienda_flete_entregado monto 3100+13 zona",
  "tienda_flete_novedad monto 350+13 zona",
  "tienda_flete_rechazo monto 1400+13 zona",
  "tienda_flete_reprogramado monto 250+13 zona",
];
/** En T2 gana su precio donde lo pactó, y lo demás cae a la zona: la elección es por concepto. */
const CONCEPTOS_T2 = [
  "tienda_flete_entregado monto 4700+4 tienda_general",
  "tienda_flete_novedad monto 350+13 zona",
  "tienda_flete_rechazo monto 1900+4 tienda_general",
  "tienda_flete_reprogramado monto 250+13 zona",
];

/** El texto de un importe, tal cual lo pinta `money()`: «₡3.503» o «₡282,50». */
function cifra(texto: string, solo = false): RegExp {
  const c = `${texto.replaceAll(".", "\\.")}${texto.includes(",") ? "" : "(?:,00)?"}`;
  return solo ? new RegExp(`^\\D*${c}$`) : new RegExp(`(?<![\\d.,])${c}(?![\\d])`);
}

type Tienda = { usuario: UsuarioE2E; r: RepartoE2E };

/**
 * Lo que un cierre dejó, orden a orden, en lo que el reparto no agrupa: modelo, conceptos, resultado y pago. Por
 * etiqueta y no por remisión, para que la tabla de la cabecera se lea tal cual en el `toEqual`.
 */
async function congeladoPorOrden(cierreId: string, etiquetas: ReadonlyMap<string, string>) {
  const db = baseReparto();
  const [detalles, gestiones] = await Promise.all([
    db.cierreDetail.findMany({
      where: { cierreId },
      select: {
        numRemision: true,
        tarifaModelo: true,
        tarifaValorFlete: true,
        conceptos: { select: { concepto: true, modo: true, valor: true, ivaPct: true, nivel: true } },
      },
    }),
    db.gestionOrden.findMany({
      where: { cierreId, anuladaAt: null },
      select: {
        resultado: true,
        pagoMensajero: true,
        orden: { select: { numRemision: true } },
        pagosCongelados: { where: { actor: "mensajero" }, select: { concepto: true, modo: true, valor: true, nivel: true, base: true, importe: true } },
      },
    }),
  ]);
  const etiqueta = (remision: string | null): string => (remision !== null && etiquetas.get(remision)) || `? ${String(remision)}`;
  return {
    detalle: detalles
      .map((d) => ({
        orden: etiqueta(d.numRemision),
        modelo: d.tarifaModelo,
        fleteViejo: d.tarifaValorFlete?.toString() ?? null,
        conceptos: d.conceptos.map((c) => `${c.concepto} ${c.modo} ${c.valor.toString()}+${c.ivaPct.toString()} ${c.nivel}`).sort(),
      }))
      .sort((a, b) => a.orden.localeCompare(b.orden)),
    gestiones: gestiones
      .map((g) => ({
        orden: etiqueta(g.orden.numRemision),
        resultado: g.resultado,
        pago: g.pagoMensajero?.toString() ?? null,
        pagos: g.pagosCongelados.map((p) => `${p.concepto} ${p.modo} ${p.valor.toString()} ${p.nivel} base=${p.base?.toString() ?? "-"} = ${p.importe.toString()}`),
      }))
      .sort((a, b) => a.orden.localeCompare(b.orden)),
  };
}

/** Suma por concepto los tres libros que un cierre aprueba. El libro de la tienda, con la tienda. */
async function libros(cierreId: string, tiendas: ReadonlyMap<string, string>): Promise<string[]> {
  const db = baseReparto();
  const donde = { origenTipo: "cierre_dia", origenId: cierreId } as const;
  const [mensajero, empresa, tienda] = await Promise.all([
    db.pagoMensajeroMovimiento.findMany({ where: donde, select: { categoria: true, monto: true } }),
    db.walletMovimiento.findMany({ where: donde, select: { categoria: true, monto: true } }),
    db.walletTiendaMovimiento.findMany({ where: donde, select: { tiendaId: true, categoria: true, monto: true } }),
  ]);
  const suma = new Map<string, Prisma.Decimal>();
  const sumar = (clave: string, monto: Prisma.Decimal): void => {
    suma.set(clave, (suma.get(clave) ?? new Prisma.Decimal(0)).add(monto));
  };
  for (const m of mensajero) sumar(`mensajero:${m.categoria}`, m.monto);
  for (const m of empresa) sumar(`empresa:${m.categoria}`, m.monto);
  for (const m of tienda) sumar(`${tiendas.get(m.tiendaId) ?? "?"}:${m.categoria}`, m.monto);
  return [...suma].map(([k, v]) => `${k}=${v.toFixed(2)}`).sort();
}

/** Los cargos y reversos de plataforma de la empresa, ordenados, con la etiqueta de cada orden. */
async function cargos(organizacionId: string, etiquetas: ReadonlyMap<string, string>): Promise<string[]> {
  const filas = await baseReparto().cobroPlataformaMovimiento.findMany({
    where: { organizacionId },
    select: { tipo: true, monto: true, fuente: true, orden: { select: { numRemision: true } } },
  });
  return filas.map((f) => `${(f.orden && etiquetas.get(f.orden.numRemision ?? "")) ?? "?"}:${f.tipo}:${f.monto.toFixed(2)}:${f.fuente}`).sort();
}

async function deudaEnWallet(page: Page): Promise<string> {
  await page.goto("/wallet");
  const region = page.locator('[data-region="deuda_plataforma"]');
  await expect(region, "la región de la deuda con la plataforma").toHaveCount(1, { timeout: 60_000 });
  const cifraDeuda = region.locator(".tabular-nums").first();
  await expect(cifraDeuda).toBeVisible();
  return (await cifraDeuda.innerText()).trim();
}

/** Lo que el mensajero lee como su ganancia del día, antes de cerrar. */
async function abrirCierreDelDia(browser: Browser, m: MensajeroE2E): Promise<Page> {
  const page = await paginaDe(browser, m);
  await page.goto("/cierre-dia");
  await expect(page.getByRole("region", { name: "Totales del día" })).toBeVisible();
  return page;
}

/** El mensajero solicita su cierre en pantalla, con su sesión. Devuelve el id del cierre que acaba de nacer. */
async function solicitarEnPantalla(page: Page, m: MensajeroE2E): Promise<string> {
  const previos = (await cierresDe(m)).length;
  const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
  await abrirCon(page.getByRole("region", { name: "Solicitar cierre" }).getByRole("button", { name: "Solicitar cierre" }), dialogo);
  await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
  await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();
  const cierres = await cierresDe(m);
  expect(cierres).toHaveLength(previos + 1);
  return cierres[cierres.length - 1].id;
}

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»: el KPI «Pago al mensajero» es la cifra del
 * mismo nombre del detalle único, y el KPI «Total de la empresa» es el «Total facturado» de la cuenta «Lo que se
 * le factura a la tienda» (mismo importe). Se espera a que el texto se asiente, como antes.
 */
async function kpi(detalle: Locator, rotulo: "Pago al mensajero" | "Total de la empresa"): Promise<string> {
  const valor =
    rotulo === "Pago al mensajero"
      ? detalle.locator('[data-cifra="pago"]')
      : detalle.getByRole("region", { name: "Lo que se le factura a la tienda" }).locator('[data-tipo="total"] [data-monto]');
  return cifraAsentada(valor);
}

/** La aprobación real: el maestro, por `/cierres-admin`, confirmando cada guía que vuelve. */
async function aprobarEnPantalla(
  page: Page,
  m: MensajeroE2E,
  vuelven: readonly OrdenE2E[],
  esperado: { pago: string; empresa: string },
): Promise<void> {
  await page.goto("/cierres-admin");
  const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
  const comprobante = filaDeCola(pendientes, m.nombre);
  await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await abrirCon(comprobante.getByRole("button", { name: "Ver / decidir" }), detalle);
  expect(await kpi(detalle, "Pago al mensajero")).toMatch(cifra(esperado.pago, true));
  expect(await kpi(detalle, "Total de la empresa")).toMatch(cifra(esperado.empresa, true));

  const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
  await abrirCon(detalle.getByRole("button", { name: "Revisar paquetes y aprobar", exact: true }), confirmar);
  const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
  for (const o of vuelven) {
    await lector.getByLabel("Número de guía").fill(String(o.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(lector.getByLabel("Número de guía")).toHaveValue("");
  }
  const aprobar = confirmar.getByRole("button", { name: "Confirmar y aprobar" });
  await expect(aprobar).toBeEnabled();
  await aprobar.click();
  await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
}

/** Abre un cierre ya resuelto por su folio: un mensajero tiene varios en el histórico. */
async function abrirResuelto(page: Page, m: MensajeroE2E, cierreId: string): Promise<Locator> {
  await page.goto("/cierres-admin");
  await pestanaDeCola(page, "Resueltos").click();
  const comprobante = filaDeCola(page.getByRole("region", { name: "Histórico" }), m.nombre)
    .filter({ hasText: cierreId.slice(-8).toUpperCase() });
  await comprobante.getByRole("button", { name: `Ver el cierre resuelto de ${m.nombre}` }).click();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await expect(detalle).toBeVisible();
  return detalle;
}

/** El importe de la línea de una tarjeta (`Cuenta`) cuyo rótulo casa con `rotulo`. */
const montoDeLinea = (tarjeta: Locator, rotulo: RegExp): Locator =>
  tarjeta
    .locator("[data-signo]")
    .filter({ has: tarjeta.page().locator("[data-rotulo]", { hasText: rotulo }) })
    .locator("[data-monto]");

/**
 * Despliega la gestión de una orden con su filtro, y comprueba sus cifras antes de plegarla.
 *
 * SLT-101 «Fila de gestión única y lista con filtros» (D2, R27, R28, R97): ANTES se leían los renglones del panel
 * «Cobros de esta gestión» de la ficha 338 («Valor flete GAM», «Flete», «IVA flete», «Total cobrado»). Ese panel
 * no existe en la fila única: AHORA las MISMAS cifras se leen donde las pinta el canvas aprobado:
 *   - «Total cobrado» → el total «Se le cobra» de la tarjeta «Se le cobra a la tienda»;
 *   - «Valor flete GAM» → la línea «tarifa GAM» de la tarjeta «Flete por entregado» de «Ver cómo se calculó»;
 *   - «Flete» → la primera línea de esa tarjeta («Monto fijo» o «<n> % de …», según el modo de la tarifa);
 *   - «IVA flete» → su línea «+ IVA …».
 * Los literales de las llamadas no cambian.
 */
async function cobrosDeLaOrden(detalle: Locator, pestana: RegExp, orden: OrdenE2E, renglones: Readonly<Record<string, string>>): Promise<void> {
  // SLT-100: las órdenes viven en la pestaña «Gestiones» del detalle único.
  await detalle.getByRole("tab", { name: /^Gestiones \(/ }).click();
  // SLT-101 (R84): la pestaña por resultado es ahora el filtro «Filtrar por resultado» («<resultado> <n>»).
  await detalle
    .getByRole("group", { name: "Filtrar por resultado" })
    .getByRole("button", { name: new RegExp(`^${pestana.source}.* \\d+$`) })
    .click();
  const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
  const fila = ordenes.getByRole("button", { name: new RegExp(`^Desglose de ingreso de la orden ${orden.numRemision}`) });
  await fila.click();
  const deLaOrden = (titulo: string) => ordenes.getByRole("region", { name: new RegExp(`^${titulo} de la orden ${orden.numRemision} · `) });
  const cobro = deLaOrden("Se le cobra a la tienda");
  await expect(cobro).toBeVisible();
  const flete = deLaOrden("Flete por entregado");
  if ("Valor flete GAM" in renglones || "Flete" in renglones || "IVA flete" in renglones) {
    await ordenes.getByRole("button", { name: "Ver cómo se calculó" }).click();
    await expect(flete).toBeVisible();
  }
  for (const [rotulo, texto] of Object.entries(renglones)) {
    const monto =
      rotulo === "Total cobrado"
        ? cobro.locator("[data-tipo='total'] [data-monto]")
        : rotulo === "Valor flete GAM"
          ? montoDeLinea(flete, /^tarifa GAM$/)
          : rotulo === "IVA flete"
            ? montoDeLinea(flete, /^\+ IVA /)
            : flete.locator("[data-signo]").first().locator("[data-monto]");
    await expect(monto).toHaveText(cifra(texto, true));
  }
  await fila.click();
  await expect(cobro).toHaveCount(0);
}

test.use({ actionTimeout: 30_000 });

test.describe.serial("Cierre del modelo nuevo con plan porcentual, de punta a punta", () => {
  const sufijo = randomBytes(4).toString("hex");
  const nombrePlan = `Plan E2E cierre nuevo ${sufijo}`;
  const etiquetas = new Map<string, string>();
  const nombresTienda = new Map<string, string>();

  let r: RepartoE2E;
  let t1: Tienda;
  let t2: Tienda;
  let m1: MensajeroE2E;
  let m2: MensajeroE2E;
  let page: Page;
  let organizacionId: string;

  let cierreViejo: string;
  let cierreNuevo: string;
  let cierreZona: string;
  let n4: OrdenE2E;
  const congelados = new Map<string, unknown>();
  const libroAntes = new Map<string, string[]>();
  let cargosAprobados: string[] = [];

  /** Una orden de la tienda, ya en reparto con ese mensajero y con su gestión hecha. */
  async function gestionada(
    etiqueta: string,
    t: Tienda,
    m: MensajeroE2E,
    montoCobrar: number,
    gestion: GestionE2E,
  ): Promise<OrdenE2E> {
    const orden = await crearOrden(t.r, { zona: "central", montoCobrar });
    etiquetas.set(orden.numRemision, etiqueta);
    const enReparto = await llevarA(t.r, orden, "en_reparto", { mensajero: m });
    await gestionar(t.r, enReparto, m, gestion);
    return enReparto;
  }

  /** El plan público de 2 % con mínimo 500, por el servicio del superadmin. */
  async function asignarPlanPorcentual(): Promise<void> {
    await conCandadoDelSuperadmin(() => asegurarSuperadmin(baseReparto()));
    const sa = await baseReparto().usuario.findFirstOrThrow({
      where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
      select: { id: true },
    });
    const actor = { usuarioId: sa.id, rol: "superadmin" as const, zonaId: null, organizacionId: null };
    const planes = new PlanesService(new PlanesRepository(baseReparto()));
    const creado = await planes.crear(actor, {
      nombre: nombrePlan,
      visibilidad: "publico",
      organizacionId: null,
      topes: { porRol: {}, apiKeys: null },
      modulos: [...ORDEN_MODULOS],
      precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" },
    });
    if (creado.estado !== "ok") throw new Error(`crear el plan no fue ok: ${JSON.stringify(creado)}`);
    // Al menos 5 días atrás y sin dejar el período en curso como tramo: ver `planes-costo-porcentual.spec.ts`.
    const haceCinco = fechaCalendarioCR(new Date(Date.now() - 5 * DIA_MS));
    const diaUno = `${fechaCalendarioCR(new Date()).slice(0, 8)}01`;
    const asignado = await planes.asignar(actor, {
      organizacionId,
      planId: creado.planId,
      inicioCiclo: haceCinco < diaUno ? haceCinco : diaUno,
      tipoCobro: "mensual",
    });
    if (asignado.estado !== "ok") throw new Error(`asignar el plan no fue ok: ${JSON.stringify(asignado)}`);
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierre-nuevo-a", { tarifa: TARIFA_T1, tarifaMensajero: PAGO_VIEJO });
    organizacionId = r.empresa.organizacionId;

    // La segunda tienda, con su tarifa vieja propia, como el maestro la daría de alta.
    const usuarioT2 = await crearUsuarioE2E(r.empresa, "adminTienda", { seRecogeEnTienda: false });
    const tarifaT2 = crearTarifaSchema.parse({ tiendaId: usuarioT2.id, ...TARIFA_T2 });
    exigirOk("TarifaService.crear", await conEmpresa(organizacionId, () => servicios().tarifa.crear(tarifaT2, r.actores.maestro)));
    t1 = { usuario: r.tienda, r };
    t2 = { usuario: usuarioT2, r: { ...r, tienda: usuarioT2, actores: { ...r.actores, tienda: actorDe(r.empresa, usuarioT2, "adminTienda", null) } } };
    nombresTienda.set(t1.usuario.id, "T1");
    nombresTienda.set(t2.usuario.id, "T2");

    await asignarPlanPorcentual();
    m1 = await crearMensajero(r, "central");
    m2 = await crearMensajero(r, "central");
    page = await paginaDe(browser, r.empresa.maestro);
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("el maestro digita el cobro general, el de una tienda, el pago y un valor propio, y nada queda activado", async () => {
    test.setTimeout(180_000);
    await abrirTarifas(page);
    await irAZona(page, r.zonaCentral.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_ZONA);
    await digitarYGuardar(page, "Pago al mensajero", PAGO_ZONA);

    await irAPestana(page, "Cobro a la tienda");
    await elegirNivel(page, "Tienda con precio propio…");
    await elegirOpcion(page, page.locator("#tarifas-tienda"), t2.usuario.nombre);
    await elegirOpcion(page, page.locator("#tarifas-alcance"), "Todas sus zonas");
    await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_T2);

    await digitarValorPropio(page, m1, PROPIO_M1);

    expect(await activacionesDe(organizacionId)).toBe(0);
    expect(await valoresDe(organizacionId)).toEqual([
      "mensajero_entregado=2200",
      "mensajero_entregado=2900",
      "mensajero_novedad=70",
      "mensajero_rechazo=15",
      "mensajero_rechazo=180",
      "mensajero_reprogramado=90",
      "tienda_flete_entregado=3100",
      "tienda_flete_entregado=4700",
      "tienda_flete_novedad=350",
      "tienda_flete_rechazo=1400",
      "tienda_flete_rechazo=1900",
      "tienda_flete_reprogramado=250",
    ]);
  });

  test("sin activar, el cierre de M1 cobra y paga con el modelo viejo, aunque tenga propio; el plan ya cobra su 2 %", async ({ browser }) => {
    test.setTimeout(300_000);
    const v1 = await gestionada("V1", t1, m1, 60_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 60_000 }] });
    const v2 = await gestionada("V2", t2, m1, 0, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });

    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("region", { name: "Ganancia" })).toContainText(cifra("1.700"));
    cierreViejo = await solicitarEnPantalla(mensajero, m1);
    await mensajero.context().close();
    await aprobarEnPantalla(page, m1, [v2], { pago: "1.700", empresa: "4.294" });

    const viejo = await baseReparto().cierreDia.findUniqueOrThrow({
      where: { id: cierreViejo },
      select: { estado: true, totalGeneral: true, totalPagoMensajero: true },
    });
    expect(JSON.parse(JSON.stringify(viejo))).toEqual({ estado: "aprobado", totalGeneral: "60000", totalPagoMensajero: "1700" });
    const congelado = await congeladoPorOrden(cierreViejo, etiquetas);
    expect(congelado).toEqual({
      detalle: [
        { orden: "V1", modelo: "viejo", fleteViejo: "2500", conceptos: [] },
        { orden: "V2", modelo: "viejo", fleteViejo: "2600", conceptos: [] },
      ],
      gestiones: [
        { orden: "V1", resultado: "entregado", pago: "1700", pagos: [] },
        { orden: "V2", resultado: "devolucion_a_origen_por_rechazo", pago: "0", pagos: [] },
      ],
    });
    congelados.set(cierreViejo, congelado);
    libroAntes.set(cierreViejo, await libros(cierreViejo, nombresTienda));

    // V1 condicionada al crearla, aunque el modelo de tarifas sea el viejo. Es lo que une las dos features.
    const condiciones = await baseReparto().cobroPlataformaPorcentualOrden.findUniqueOrThrow({
      where: { ordenId: v1.id },
      select: { porcentaje: true, minimo: true },
    });
    expect([condiciones.porcentaje.toFixed(2), condiciones.minimo?.toFixed(2)]).toEqual(["2.00", "500.00"]);
    expect(await cargos(organizacionId, etiquetas)).toEqual(["V1:cargo:1200.00:plan"]);
    expect(await deudaEnWallet(page)).toBe("₡1.200");

    const detalle = await abrirResuelto(page, m1, cierreViejo);
    await cobrosDeLaOrden(detalle, /Entregado/, v1, { "Valor flete GAM": "2.500", "IVA flete": "325", "Total cobrado": "2.825" });
    await cobrosDeLaOrden(detalle, /Devoluci/, v2, { "Total cobrado": "1.469" });
  });

  test("activa, con la otra zona en 0 confirmada", async () => {
    await abrirTarifas(page);
    await activarConFaltantes(page);
    expect(await activacionesDe(organizacionId)).toBe(1);
  });

  test("M1 solicita y el maestro aprueba: cobro con IVA, valor propio, conceptos congelados, wallets y piso del plan", async ({ browser }) => {
    test.setTimeout(300_000);
    const n1 = await gestionada("N1", t1, m1, 100_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 100_000 }] });
    const n2 = await gestionada("N2", t2, m1, 10_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10_000 }] });
    const n3 = await gestionada("N3", t1, m1, 30_000, { resultado: "reprogramado" });
    n4 = await gestionada("N4", t2, m1, 45_000, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });

    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("region", { name: "Ganancia" })).toContainText(cifra("6.175"));
    cierreNuevo = await solicitarEnPantalla(mensajero, m1);
    await mensajero.context().close();
    await aprobarEnPantalla(page, m1, [n3, n4], { pago: "6.175", empresa: "10.649,50" });

    const cabecera = await baseReparto().cierreDia.findUniqueOrThrow({
      where: { id: cierreNuevo },
      select: { estado: true, totalGeneral: true, totalPagoMensajero: true },
    });
    expect(JSON.parse(JSON.stringify(cabecera))).toEqual({ estado: "aprobado", totalGeneral: "110000", totalPagoMensajero: "6175" });

    const congelado = await congeladoPorOrden(cierreNuevo, etiquetas);
    expect(congelado).toEqual({
      detalle: [
        { orden: "N1", modelo: "nuevo", fleteViejo: null, conceptos: CONCEPTOS_T1 },
        { orden: "N2", modelo: "nuevo", fleteViejo: null, conceptos: CONCEPTOS_T2 },
        { orden: "N3", modelo: "nuevo", fleteViejo: null, conceptos: CONCEPTOS_T1 },
        { orden: "N4", modelo: "nuevo", fleteViejo: null, conceptos: CONCEPTOS_T2 },
      ],
      gestiones: [
        { orden: "N1", resultado: "entregado", pago: "2900", pagos: ["mensajero_entregado monto 2900 mensajero base=- = 2900"] },
        { orden: "N2", resultado: "entregado", pago: "2900", pagos: ["mensajero_entregado monto 2900 mensajero base=- = 2900"] },
        { orden: "N3", resultado: "reprogramado", pago: "90", pagos: ["mensajero_reprogramado monto 90 zona base=- = 90"] },
        { orden: "N4", resultado: "devolucion_a_origen_por_rechazo", pago: "285", pagos: ["mensajero_rechazo porcentaje 15 mensajero base=1900 = 285"] },
      ],
    });
    congelados.set(cierreNuevo, congelado);

    const libro = await libros(cierreNuevo, nombresTienda);
    expect(libro).toEqual([
      "T1:cod_recaudado=100000.00",
      "T1:flete=3100.00",
      "T1:flete_devolucion=250.00",
      "T1:iva_flete=403.00",
      "T1:iva_flete_devolucion=32.50",
      "T2:cod_recaudado=10000.00",
      "T2:flete=4700.00",
      "T2:flete_devolucion=1900.00",
      "T2:iva_flete=188.00",
      "T2:iva_flete_devolucion=76.00",
      "empresa:egreso_pago_mensajero=6175.00",
      "empresa:ingreso_cod_recaudado=110000.00",
      "empresa:ingreso_flete=7800.00",
      "empresa:ingreso_flete_devolucion=2150.00",
      "empresa:ingreso_iva_flete=591.00",
      "empresa:ingreso_iva_flete_devolucion=108.50",
      "mensajero:pago_devengado=6175.00",
      "mensajero:pago_efectivo=6175.00",
    ]);
    libroAntes.set(cierreNuevo, libro);

    // Los dos lados del piso, y lo que no es final no cobra.
    expect(await estadoDe(n1)).toBe("entregado");
    expect(await estadoDe(n2)).toBe("entregado");
    expect(await estadoDe(n3)).toBe("reprogramado");
    expect(await estadoDe(n4)).toBe("por_devolver_a_tienda");
    expect(await cargos(organizacionId, etiquetas)).toEqual(["N1:cargo:2000.00:plan", "N2:cargo:500.00:plan", "V1:cargo:1200.00:plan"]);
    expect(await deudaEnWallet(page)).toBe("₡3.700");

    // Lo que ve quien aprueba, orden a orden.
    const detalle = await abrirResuelto(page, m1, cierreNuevo);
    expect(await kpi(detalle, "Pago al mensajero")).toMatch(cifra("6.175", true));
    expect(await kpi(detalle, "Total de la empresa")).toMatch(cifra("10.649,50", true));
    await cobrosDeLaOrden(detalle, /Entregado/, n1, { Flete: "3.100", "IVA flete": "403", "Total cobrado": "3.503" });
    await cobrosDeLaOrden(detalle, /Entregado/, n2, { Flete: "4.700", "IVA flete": "188", "Total cobrado": "4.888" });
    await cobrosDeLaOrden(detalle, /Reprogram/, n3, { "Total cobrado": "282,50" });
    await cobrosDeLaOrden(detalle, /Devoluci/, n4, { "Total cobrado": "1.976" });

    // Lo que ve T2 en su estado de cuenta: su precio, no el de la zona, y su IVA del 4 %.
    const tienda = await paginaDe(browser, t2.usuario);
    await tienda.goto("/mi-wallet");
    const cuenta = tienda.getByRole("table", { name: `Estado de cuenta de ${t2.usuario.nombre}` });
    const fila = (concepto: string, texto: string): Locator =>
      cuenta.getByRole("row").filter({ hasText: concepto }).filter({ hasText: cifra(texto) });
    await expect(fila("La empresa te cobró el flete", "4.700")).toHaveCount(1);
    await expect(fila("La empresa te cobró el IVA del flete", "188")).toHaveCount(1);
    await expect(fila("La empresa te cobró el flete de gestiones no entregadas", "1.900")).toHaveCount(1);
    await expect(fila("La empresa te cobró el IVA del flete de gestiones no entregadas", "76")).toHaveCount(1);
    await tienda.context().close();

    // Lo que le queda a M1 en su libro, en la pantalla del maestro.
    await page.goto(`/wallet/mensajeros/${m1.id}`);
    const devengos = page.getByRole("table", { name: `Estado de cuenta de ${m1.nombre}` }).getByRole("row").filter({ hasText: "Pago devengado" });
    await expect(devengos).toHaveCount(2);
    await expect(devengos.filter({ hasText: cifra("6.175") })).toHaveCount(1);
    await expect(devengos.filter({ hasText: cifra("1.700") })).toHaveCount(1);
  });

  test("M2, sin valor propio: paga la zona, T2 conserva su precio y lo que T2 no pactó cae a la zona", async ({ browser }) => {
    test.setTimeout(300_000);
    const z1 = await gestionada("Z1", t2, m2, 40_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 40_000 }] });
    const z2 = await gestionada("Z2", t1, m2, 5_000, { resultado: "novedad", causa: "not_found", motivo: "No aparece" });
    const z3 = await gestionada("Z3", t2, m2, 15_000, { resultado: "reprogramado" });

    const mensajero = await abrirCierreDelDia(browser, m2);
    await expect(mensajero.getByRole("region", { name: "Ganancia" })).toContainText(cifra("2.360"));
    cierreZona = await solicitarEnPantalla(mensajero, m2);
    await mensajero.context().close();
    await aprobarEnPantalla(page, m2, [z2, z3], { pago: "2.360", empresa: "5.566" });

    const congelado = await congeladoPorOrden(cierreZona, etiquetas);
    expect(congelado.gestiones).toEqual([
      { orden: "Z1", resultado: "entregado", pago: "2200", pagos: ["mensajero_entregado monto 2200 zona base=- = 2200"] },
      { orden: "Z2", resultado: "novedad", pago: "70", pagos: ["mensajero_novedad monto 70 zona base=- = 70"] },
      { orden: "Z3", resultado: "reprogramado", pago: "90", pagos: ["mensajero_reprogramado monto 90 zona base=- = 90"] },
    ]);
    expect(congelado.detalle.map((d) => [d.orden, d.modelo, d.conceptos])).toEqual([
      ["Z1", "nuevo", CONCEPTOS_T2],
      ["Z2", "nuevo", CONCEPTOS_T1],
      ["Z3", "nuevo", CONCEPTOS_T2],
    ]);
    congelados.set(cierreZona, congelado);
    libroAntes.set(cierreZona, await libros(cierreZona, nombresTienda));

    expect(await cargos(organizacionId, etiquetas)).toEqual(["N1:cargo:2000.00:plan", "N2:cargo:500.00:plan", "V1:cargo:1200.00:plan", "Z1:cargo:800.00:plan"]);
    expect(await deudaEnWallet(page)).toBe("₡4.500");

    const detalle = await abrirResuelto(page, m2, cierreZona);
    await cobrosDeLaOrden(detalle, /Entregado/, z1, { Flete: "4.700", "IVA flete": "188", "Total cobrado": "4.888" });
    await cobrosDeLaOrden(detalle, /Novedad/, z2, { "Total cobrado": "395,50" });
    await cobrosDeLaOrden(detalle, /Reprogram/, z3, { "Total cobrado": "282,50" });
  });

  test("la devolución cobra su 2 % al llegar a la tienda, y no antes", async () => {
    test.setTimeout(180_000);
    await page.goto("/ordenes");
    const fila = page.getByRole("row", { name: new RegExp(n4.numRemision) });
    await expect(fila.getByText("Por devolver a tienda")).toBeVisible();
    await marcarCasilla(fila.getByRole("checkbox", { name: `Seleccionar orden ${n4.numRemision}` }));
    await page.getByRole("button", { name: "Enviar a la tienda", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Enviar a la tienda" });
    await expect(modal.getByText(n4.numRemision)).toBeVisible();
    await modal.getByRole("button", { name: "Enviar a la tienda", exact: true }).click();
    await expect(modal.getByText("1 orden(es) enviada(s) a la tienda.").first()).toBeVisible();
    await modal.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(modal).toBeHidden();

    expect(await estadoDe(n4)).toBe("devolviendo_a_tienda");
    expect(await deudaEnWallet(page)).toBe("₡4.500");

    // La tienda escanea su paquete: el servicio de `lib/actions/recepcion-origen.ts`, con su actor.
    const numGuia = n4.numGuia;
    if (numGuia === null) throw new Error("N4 sin guía");
    const recibida = await conEmpresa(organizacionId, () =>
      new RecepcionOrigenService(new OrdenRepository(getPrismaClient())).recibirEnOrigen(numGuia, t2.r.actores.tienda),
    );
    expect(recibida.status).toBe("ok");
    expect(await estadoDe(n4)).toBe("devuelta_a_tienda");

    expect(await cargos(organizacionId, etiquetas)).toEqual([
      "N1:cargo:2000.00:plan",
      "N2:cargo:500.00:plan",
      "N4:cargo:900.00:plan",
      "V1:cargo:1200.00:plan",
      "Z1:cargo:800.00:plan",
    ]);
    expect(await deudaEnWallet(page)).toBe("₡5.400");
    // Llegar al estado final no toca el dinero del cierre que ya se aprobó.
    expect(await congeladoPorOrden(cierreNuevo, etiquetas)).toEqual(congelados.get(cierreNuevo));
    expect(await libros(cierreNuevo, nombresTienda)).toEqual(libroAntes.get(cierreNuevo));
    cargosAprobados = await cargos(organizacionId, etiquetas);
  });

  test("cambiar las tarifas después de aprobar no mueve ningún cierre; el siguiente sí cobra y paga lo nuevo", async ({ browser }) => {
    test.setTimeout(300_000);
    await abrirTarifas(page);
    await irAZona(page, r.zonaCentral.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por entregado", valor: "3300" }], "Guardar cambios");
    await elegirNivel(page, "Tienda con precio propio…");
    await elegirOpcion(page, page.locator("#tarifas-tienda"), t2.usuario.nombre);
    await elegirOpcion(page, page.locator("#tarifas-alcance"), "Todas sus zonas");
    await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
    await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por entregado", valor: "5000" }], "Guardar cambios");
    await editarValorPropio(page, m1, [{ concepto: "Por entregado", valor: "3000" }]);

    for (const cierre of [cierreViejo, cierreNuevo, cierreZona]) {
      expect(await congeladoPorOrden(cierre, etiquetas)).toEqual(congelados.get(cierre));
      expect(await libros(cierre, nombresTienda)).toEqual(libroAntes.get(cierre));
    }
    expect(await cargos(organizacionId, etiquetas)).toEqual(cargosAprobados);

    // Y en pantalla, con los mismos números.
    const detalle = await abrirResuelto(page, m1, cierreNuevo);
    expect(await kpi(detalle, "Pago al mensajero")).toMatch(cifra("6.175", true));
    expect(await kpi(detalle, "Total de la empresa")).toMatch(cifra("10.649,50", true));

    // El control: el cambio de verdad rige. Sin él, «no se movió» pasaría también si el guardado no hubiera hecho nada.
    await gestionada("S1", t1, m1, 70_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 70_000 }] });
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("region", { name: "Ganancia" })).toContainText(cifra("3.000"));
    await mensajero.context().close();
    const siguiente = await solicitarCierre(r, m1);
    await aprobarCierre(r, siguiente);
    const congeladoS = await congeladoPorOrden(siguiente, etiquetas);
    expect(congeladoS.gestiones).toEqual([
      { orden: "S1", resultado: "entregado", pago: "3000", pagos: ["mensajero_entregado monto 3000 mensajero base=- = 3000"] },
    ]);
    expect(congeladoS.detalle[0].conceptos).toContain("tienda_flete_entregado monto 3300+13 zona");
    expect((await libros(siguiente, nombresTienda)).filter((l) => l.startsWith("T1:"))).toEqual([
      "T1:cod_recaudado=70000.00",
      "T1:flete=3300.00",
      "T1:iva_flete=429.00",
    ]);

    expect(await cargos(organizacionId, etiquetas)).toEqual([...cargosAprobados, "S1:cargo:1400.00:plan"].sort());
    expect(await deudaEnWallet(page)).toBe("₡6.800");
  });

  test("«Mi plan» dice lo cobrado, lo que falta por llegar y el total", async () => {
    test.setTimeout(120_000);
    await page.goto("/mi-plan");
    await expect(page.getByRole("heading", { name: nombrePlan, exact: true })).toBeVisible({ timeout: 60_000 });
    const lista = page.getByRole("list", { name: "Costo del período", exact: true });
    for (const linea of [
      "Costo base mensual: 1000.00",
      "Costo por orden: 2.00 % del valor del paquete, mínimo 500.00",
      "Cobrado en el período: 6800.00",
      "Órdenes del período sin estado final: 4",
      "Total del período hasta hoy: 1000.00 + 6800.00 = 7800.00",
    ]) {
      await expect(lista.getByText(linea, { exact: true })).toBeVisible();
    }
  });

  test("B, sin activar y sin plan, sigue en el modelo viejo con sus importes, con A activada", async ({ browser }) => {
    test.setTimeout(300_000);
    const b = await crearEscenarioReparto("cierre-nuevo-b", { tarifa: TARIFA_B, tarifaMensajero: PAGO_VIEJO_B });
    const mB = await crearMensajero(b, "central");
    const tB: Tienda = { usuario: b.tienda, r: b };
    const b1 = await gestionada("B1", tB, mB, 24_000, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 24_000 }] });
    const b2 = await gestionada("B2", tB, mB, 0, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });

    const paginaB = await paginaDe(browser, b.empresa.maestro);
    const mensajero = await abrirCierreDelDia(browser, mB);
    await expect(mensajero.getByRole("region", { name: "Ganancia" })).toContainText(cifra("1.600"));
    const cierreB = await solicitarEnPantalla(mensajero, mB);
    await mensajero.context().close();
    await aprobarEnPantalla(paginaB, mB, [b2], { pago: "1.600", empresa: "4.576,50" });

    expect(await congeladoPorOrden(cierreB, etiquetas)).toEqual({
      detalle: [
        { orden: "B1", modelo: "viejo", fleteViejo: "2700", conceptos: [] },
        { orden: "B2", modelo: "viejo", fleteViejo: "2700", conceptos: [] },
      ],
      gestiones: [
        { orden: "B1", resultado: "entregado", pago: "1600", pagos: [] },
        { orden: "B2", resultado: "devolucion_a_origen_por_rechazo", pago: "0", pagos: [] },
      ],
    });
    expect(await activacionesDe(organizacionId)).toBe(1);
    expect(await activacionesDe(b.empresa.organizacionId)).toBe(0);
    expect(await valoresDe(b.empresa.organizacionId)).toEqual([]);
    // Sin plan ni global, SL-40 asienta un cargo en 0 al crear cada orden: la deuda sigue en cero.
    expect(await cargos(b.empresa.organizacionId, etiquetas)).toEqual(["B1:cargo:0.00:sin_configurar", "B2:cargo:0.00:sin_configurar"]);
    expect(await deudaEnWallet(paginaB)).toBe("₡0");

    const detalle = await abrirResuelto(paginaB, mB, cierreB);
    await cobrosDeLaOrden(detalle, /Entregado/, b1, { "Valor flete GAM": "2.700", "IVA flete": "351", "Total cobrado": "3.051" });
    await cobrosDeLaOrden(detalle, /Devoluci/, b2, { "Total cobrado": "1.525,50" });
    await paginaB.context().close();

    // Y la deuda de A no recibió nada de B.
    expect(await deudaEnWallet(page)).toBe("₡6.800");
  });
});
