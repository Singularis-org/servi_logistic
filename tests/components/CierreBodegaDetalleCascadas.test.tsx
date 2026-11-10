// @vitest-environment jsdom
import { gestion478, grupos478, ingreso478 } from "@/tests/fixtures/gestion-detalle-478";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { monedaConfig } from "@/lib/config/moneda";
import type {
  CierreBodegaDetalleCierre,
  CierreBodegaResumen,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type {
  CierreGrupos,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";

/**
 * Feature 393 (F6) — EL DETALLE DEL CIERRE DE BODEGA: las cuentas, separadas y rotuladas.
 *
 * ── LAS DOS PREGUNTAS, Y POR QUÉ SON DOS
 * Una cuenta dice **de quién es el dinero** (lo facturado y lo que le queda a la empresa); la otra
 * dice **qué efectivo sale** (de lo recaudado, cuánto le entrega la satélite a la central). Las dos
 * terminan en cifras distintas y las dos son verdad. Mezcladas —que es como estaban— no se lee
 * ninguna.
 *
 * ── SLT-104 «Detalle de cierre de bodega en el detalle único (central)»
 * El detalle es ahora el detalle único de SLT-95 (R40): las cascadas de la 393 son las cuentas de la
 * pestaña «Dinero» (SLT-95 R14-R16, canvas F6): «Lo que va a la central», «Lo que se le factura a la
 * tienda» y «De lo facturado, le queda a la empresa», con los rótulos de una cifra, un nombre
 * («Debe llegar a la central», «Pago a mensajeros», «Le queda a la empresa»). Lo que se vigilaba de
 * CADA cierre del día (sus dos cascadas, sus notas, su panel de ingreso) ya no se pinta en el
 * detalle de bodega (R118): vive en el detalle de ese cierre del día, al que lleva «Ver su cierre»
 * (R115); aquí cada cierre del día es su fila de «Mensajeros» (R42, R114), y sobre ella se siguen
 * vigilando sus cifras y que sumen el agregado (R16 de la 393).
 *
 * ── LOS IMPORTES
 * Todos con céntimos, y la suma de los dos días es EXACTAMENTE el agregado. Con cifras redondas,
 * estas identidades cerrarían igual sin el arreglo y el archivo no probaría nada. Los esperados van
 * escritos a mano (`money()` sin cola con céntimos cero).
 */

vi.mock("@/lib/actions/cierre-bodega", () => ({
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
  listarGestionesCierresBodegaCompleto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
// ---------------------------------------------------------------------------
// Parseador de lo PINTADO (independiente del de `DineroIdentidadesEnPantalla`, a propósito).
// ---------------------------------------------------------------------------

/**
 * Un importe tal y como se LEE, con su operador si lo lleva. El `[+-]?` no es cosmetico: las
 * lineas de una cascada se pintan `-₡14.000,55` y `+₡0`, y un patron que solo aceptara el menos
 * recortaria el mas — devolveria «₡0» y una asercion sobre el operador pasaria por casualidad.
 */
const PATRON_IMPORTE = new RegExp(
  `[+-]?${monedaConfig.simbolo}\\d[\\d${monedaConfig.separadorMiles}]*(?:${monedaConfig.separadorDecimal}\\d\\d)?`,
);

function centimos(pintado: string): bigint {
  const texto = pintado.trim();
  const negativo = texto.startsWith("-");
  // El «+» de una linea que SUMA no cambia el valor; el «-» si. Se quitan los dos para leer el
  // cuerpo, y solo el segundo decide el signo.
  const sinSigno = negativo || texto.startsWith("+") ? texto.slice(1) : texto;
  expect(sinSigno.startsWith(monedaConfig.simbolo), `«${pintado}» no es un importe`).toBe(true);
  const cuerpo = sinSigno.slice(monedaConfig.simbolo.length);
  const corte = cuerpo.indexOf(monedaConfig.separadorDecimal);
  const enteros = corte === -1 ? cuerpo : cuerpo.slice(0, corte);
  const cola = corte === -1 ? "00" : `${cuerpo.slice(corte + 1)}00`.slice(0, 2);
  const valor =
    BigInt(enteros.split(monedaConfig.separadorMiles).join("")) * BigInt(100) + BigInt(cola);
  return negativo ? -valor : valor;
}

/** El importe pintado que sigue a un rótulo dentro de una región. */
function importeTras(region: HTMLElement, rotulo: string): string {
  const texto = region.textContent ?? "";
  const desde = texto.indexOf(rotulo);
  expect(desde, `el rótulo «${rotulo}» no está en la región`).toBeGreaterThanOrEqual(0);
  const hallado = texto.slice(desde + rotulo.length).match(PATRON_IMPORTE);
  expect(hallado, `no hay importe junto a «${rotulo}»`).not.toBeNull();
  return hallado![0];
}

/** La cuenta cierra con las CADENAS que se leen, no con los `Decimal` de origen. */
function laCuentaCierra(sumandos: readonly string[], total: string, quien: string): void {
  const suma = sumandos.reduce((acc, s) => acc + centimos(s), BigInt(0));
  expect(suma, `${quien}: se lee ${sumandos.join(" ")} = ${total}, y no da`).toBe(centimos(total));
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/**
 * Los totales del ingreso de la empresa, completos. Sólo cuatro de los once campos se pintan (los
 * AGRUPADOS con su IVA); los otros siete existen para poder auditar cuánto de cada agrupado es
 * IVA sin volver a recorrer las órdenes. Se rellenan coherentes con el agrupado —el IVA de este
 * país es el 13 %— para que un lector no encuentre un fixture que se contradice a sí mismo, pero
 * ninguna aserción de este archivo los mira: no se pintan.
 */
function totalesIngreso(over: {
  fleteConIva: string;
  comisionConIva: string;
  fleteDevolucionConIva: string;
  total: string;
}): TotalesIngresoEmpresa {
  return {
    montoCobrar: "0.00",
    flete: over.fleteConIva,
    ivaFlete: "0.00",
    fleteDevolucion: over.fleteDevolucionConIva,
    ivaFleteDevolucion: "0.00",
    comisionCod: over.comisionConIva,
    ivaComisionCod: "0.00",
    ...over,
  };
}


const ZONA = "33333333-3333-4333-8333-333333333333";
const GRUPOS_VACIOS: CierreGrupos = {
  entregado: [],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [],
  incidente: [],
};

const CABECERA: CierreBodegaResumen = {
  cierreBodegaId: "b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1",
  zonaId: ZONA,
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: {
    efectivo: "100000.17",
    simpe: "26089.00",
    transferencia: "0.00",
    general: "126089.17",
  },
  totalPagoMensajero: "14000.55",
  totalIngresoBodegaRechazos: "250.25",
  cantidadCierres: 2,
  solicitadoAt: "2026-09-01T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "111838.37",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("100000.17"),
};

/** El día CON rechazo: su flete por devolución a origen es lo que hace que la línea puente importe. */
const DIA_ANA: CierreBodegaDetalleCierre = {
  cierreDiaId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  mensajeroId: "m1",
  mensajeroNombre: "Ana Mensajera",
  totales: {
    efectivo: "60000.10",
    simpe: "20000.00",
    transferencia: "0.00",
    general: "80000.10",
  },
  totalPagoMensajero: "9000.30",
  totalIngresoBodegaRechazos: "250.25",
  grupos: GRUPOS_VACIOS,
  totalesIngreso: totalesIngreso({
    fleteConIva: "15000.20",
    comisionConIva: "2500.15",
    fleteDevolucionConIva: "500.75",
    total: "18001.10",
  }),
  ivaFacturado: "0.00", // SL-39: los conceptos de esta fixtura no llevan IVA
  ganancia: "9000.80",
  pagoTienda: "62499.75",
  cobradoSobreRecaudado: "17500.35",
  netoEmpresa: "8750.55",
  // Ficha 396 (D1) — el agregado que le faltaba a este nivel: 80.000,10 - 18.001,10. Difiere
  // de `pagoTienda` en exactamente su flete por devolución a origen (500,75), que es el dia CON rechazo.
  ganaLaTienda: "61999.00",
  // Ficha 396 — este bloque es de la 393 y no pinta el desglose; el campo va porque el DTO lo
  // declara REQUERIDO. Los casos del desglose viven en su propio archivo.
  partesPorTienda: [],
  paraLaCentral: "70749.55",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("60000.10"),
};

/** El día SIN rechazo: su flete por devolución a origen vale "0.00" y la línea puente TIENE que salir igual. */
const DIA_BETO: CierreBodegaDetalleCierre = {
  cierreDiaId: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
  mensajeroId: "m2",
  mensajeroNombre: "Beto Mensajero",
  totales: {
    efectivo: "40000.07",
    simpe: "6089.00",
    transferencia: "0.00",
    general: "46089.07",
  },
  totalPagoMensajero: "5000.25",
  totalIngresoBodegaRechazos: "0.00",
  grupos: GRUPOS_VACIOS,
  totalesIngreso: totalesIngreso({
    fleteConIva: "8000.13",
    comisionConIva: "1634.35",
    fleteDevolucionConIva: "0.00",
    total: "9634.48",
  }),
  ivaFacturado: "0.00", // SL-39: los conceptos de esta fixtura no llevan IVA
  ganancia: "4634.23",
  pagoTienda: "36454.59",
  cobradoSobreRecaudado: "9634.48",
  netoEmpresa: "4634.23",
  // Ficha 396 (D1): 46.089,07 - 9.634,48. Sin rechazos, COINCIDE con `pagoTienda`.
  ganaLaTienda: "36454.59",
  partesPorTienda: [],
  paraLaCentral: "41088.82",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("40000.07"),
};

const DETALLE_OK = {
  status: "ok" as const,
  cierre: CABECERA,
  cierres: [DIA_ANA, DIA_BETO],
  totalesIngreso: totalesIngreso({
    fleteConIva: "23000.33",
    comisionConIva: "4134.50",
    fleteDevolucionConIva: "500.75",
    total: "27635.58",
  }),
  ivaFacturado: "0.00", // SL-39: los conceptos de esta fixtura no llevan IVA
  ganancia: "13635.03",
  pagoTienda: "98954.34",
  cobradoSobreRecaudado: "27134.83",
  netoEmpresa: "13384.78",
  // Ficha 396 (D1) — el agregado que le faltaba a este contrato: 126.089,17 - 27.635,58.
  ganaLaTienda: "98453.59",
  partesPorTienda: [],
  paraLaCentral: "111838.37",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("40000.07"),
};

type DetalleOk = typeof DETALLE_OK;

/** Monta la pantalla, abre el detalle del cierre pendiente (abre en «Dinero») y devuelve el `user`. */
async function abrirDetalle(detalle: DetalleOk = DETALLE_OK) {
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([CABECERA]),
  });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([]),
  });
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle);

  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={paginaInicial([CABECERA])}
        historico={paginaInicial([])}
      />
    </SWRConfig>,
  );

  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" }),
  );
  await screen.findByRole("region", { name: "Lo que va a la central" });
  return user;
}

const central = () => screen.getByRole("region", { name: "Lo que va a la central" });
const factura = () => screen.getByRole("region", { name: "Lo que se le factura a la tienda" });
const queda = () => screen.getByRole("region", { name: "De lo facturado, le queda a la empresa" });

/** Las líneas de una cuenta como se leen: [rótulo, importe, signo, tipo]. */
function lineas(region: HTMLElement): string[][] {
  return [...region.querySelectorAll("[data-signo]")].map((l) => [
    l.querySelector("[data-rotulo]")?.textContent ?? "",
    l.querySelector("[data-monto]")?.textContent ?? "",
    l.getAttribute("data-signo") ?? "",
    l.getAttribute("data-tipo") ?? "",
  ]);
}

/** La cuenta cierra con lo que se LEE: partidas con su signo (el «−» vive en el rótulo) = total. */
function laCuentaCierraConSigno(region: HTMLElement, quien: string): void {
  const ls = lineas(region);
  const total = ls.find((l) => l[3] === "total")!;
  const partidas = ls.filter((l) => l[3] === "partida");
  const suma = partidas.reduce(
    (acc, [, monto, signo]) => acc + (signo === "resta" ? -centimos(monto!) : centimos(monto!)),
    BigInt(0),
  );
  expect(suma, `${quien}: las partidas no dan el total`).toBe(centimos(total[1]!));
}

/** Las filas de «Mensajeros»: [mensajero, gestiones, recaudado, pago, a la central, señales]. */
async function filasMensajeros(user: ReturnType<typeof userEvent.setup>): Promise<string[][]> {
  const dialogo = screen.getByRole("dialog");
  await user.click(within(dialogo).getByRole("tab", { name: /^Mensajeros \(/ }));
  const [, ...filas] = within(within(dialogo).getByRole("table", { name: "Mensajeros del cierre de bodega" })).getAllByRole("row");
  return filas.map((f) => within(f).getAllByRole("cell").slice(0, 6).map((c) => c.textContent ?? ""));
}

const NOTA_CENTRAL_VIEJA =
  "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por las devoluciones a origen.";
const NOTA_GANA_VIEJA =
  "Lo que se le reconoce a la bodega satélite por las devoluciones a origen. No es un movimiento de caja registrado.";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("393 · F6 — las cuentas del detalle (SLT-104: pestaña «Dinero»)", () => {
  it("son regiones distintas, con nombres accesibles distintos y su título visible (R1/R32)", async () => {
    await abrirDetalle();
    const regiones = [central(), factura(), queda()];
    expect(new Set(regiones).size).toBe(3);
    expect(within(central()).getByRole("heading", { name: "Lo que va a la central" })).toBeInTheDocument();
    expect(within(factura()).getByRole("heading", { name: "Lo que se le factura a la tienda" })).toBeInTheDocument();
    expect(within(queda()).getByRole("heading", { name: "De lo facturado, le queda a la empresa" })).toBeInTheDocument();
  });

  it("ninguna región mezcla el resultado de la otra: son subárboles disjuntos (R2)", async () => {
    await abrirDetalle();
    for (const a of [central(), factura(), queda()]) {
      for (const b of [central(), factura(), queda()]) if (a !== b) expect(a.contains(b)).toBe(false);
    }
    expect(within(central()).queryByText("Le queda a la empresa")).toBeNull();
    expect(within(central()).queryByText("Total facturado")).toBeNull();
    expect(within(queda()).queryByText("Debe llegar a la central")).toBeNull();
  });

  it("«Total facturado» y «Le queda a la empresa» son los totales, DESTACADOS (R3)", async () => {
    // SLT-104: «Para la tienda» no es una línea del Dinero de bodega (SLT-95 R16, canvas F6: las tres
    // cuentas de bodega no la dibujan); su vigilancia queda en el detalle de cada cierre del día (R115).
    await abrirDetalle();
    expect(lineas(factura()).at(-1)).toEqual(["Total facturado", "₡27.635,58", "neutro", "total"]);
    expect(lineas(queda()).at(-1)).toEqual(["Le queda a la empresa", "₡13.384,78", "neutro", "total"]);
  });

  it("«Debe llegar a la central» es el total, DESTACADO y con la misma cifra que la tarjeta y la cifra (R4/R23)", async () => {
    await abrirDetalle();
    expect(lineas(central()).at(-1)).toEqual(["Debe llegar a la central", "₡111.838,37", "neutro", "total"]);
    expect(importeTras(screen.getByRole("group", { name: "Debe llegar a la central" }), "Debe llegar a la central")).toBe(
      "₡111.838,37",
    );
  });

  it("«Debe llegar a la central» lleva su NOTA FIJA (R26)", async () => {
    // Las de CADA cierre del día van con su cuenta, en el detalle de ese cierre (R118, R115).
    await abrirDetalle();
    expect(within(central()).getByText(NOTA_CENTRAL_VIEJA)).toBeInTheDocument();
  });

  it("las TRES cuentas cierran, leyendo lo pintado (R6/R8/R9)", async () => {
    await abrirDetalle();
    expect(lineas(central())).toEqual([
      ["Total general", "₡126.089,17", "neutro", "partida"],
      ["− Pago a mensajeros", "₡14.000,55", "resta", "partida"],
      ["− Gana la bodega satélite", "₡250,25", "resta", "partida"],
      ["Debe llegar a la central", "₡111.838,37", "neutro", "total"],
    ]);
    laCuentaCierraConSigno(central(), "lo que va a la central");
    expect(lineas(queda())).toEqual([
      ["Total facturado", "₡27.635,58", "neutro", "partida"],
      ["− IVA (no es de la empresa)", "₡0", "resta", "partida"],
      ["− Pago a mensajeros", "₡14.000,55", "resta", "partida"],
      ["− Gana la bodega satélite", "₡250,25", "resta", "partida"],
      ["Le queda a la empresa", "₡13.384,78", "neutro", "total"],
    ]);
    laCuentaCierraConSigno(queda(), "le queda a la empresa");
    // R6 — lo que sale de lo recaudado es el flete + la comisión.
    laCuentaCierra(
      [importeTras(factura(), "Flete por entregado + IVA"), importeTras(factura(), "Comisión COD + IVA")],
      importeTras(factura(), "Sale de lo recaudado"),
      "sale de lo recaudado",
    );
  });

  it("la LÍNEA PUENTE explica la diferencia que el flete por devolución a origen abre (R7/R10)", async () => {
    await abrirDetalle();
    expect(lineas(factura())).toEqual([
      ["Flete por entregado + IVA", "₡23.000,33", "neutro", "partida"],
      ["Comisión COD + IVA", "₡4.134,50", "neutro", "partida"],
      ["Sale de lo recaudado", "₡27.134,83", "neutro", "subtotal"],
      ["+ Flete por devolución a origen + IVA", "₡500,75", "suma", "partida"],
      ["Total facturado", "₡27.635,58", "neutro", "total"],
    ]);
    // Lo facturado NO es lo que sale de lo recaudado: la diferencia es el flete por devolución.
    const sale = centimos(importeTras(factura(), "Sale de lo recaudado"));
    const facturado = centimos(importeTras(factura(), "Total facturado"));
    expect(facturado - sale).toBe(centimos(importeTras(factura(), "Flete por devolución a origen + IVA")));
    expect(facturado).not.toBe(sale);
  });

  it("la línea puente sale TAMBIÉN con el flete por devolución a origen en cero (R10)", async () => {
    // Antes se medía en la cascada del día sin rechazos; el Dinero de bodega es el agregado (R118), así
    // que el caso se mide con un agregado sin rechazos.
    await abrirDetalle({
      ...DETALLE_OK,
      totalesIngreso: totalesIngreso({
        fleteConIva: "8000.13",
        comisionConIva: "1634.35",
        fleteDevolucionConIva: "0.00",
        total: "9634.48",
      }),
      cobradoSobreRecaudado: "9634.48",
    });
    expect(lineas(factura()).slice(2)).toEqual([
      ["Sale de lo recaudado", "₡9.634,48", "neutro", "subtotal"],
      ["+ Flete por devolución a origen + IVA", "₡0", "suma", "partida"],
      ["Total facturado", "₡9.634,48", "neutro", "total"],
    ]);
  });

  it("la nota de «Gana la bodega satélite» dice que NO es un movimiento de caja (R27)", async () => {
    // SLT-104: va en «Lo que va a la central»; «De lo facturado…» la pinta sin nota (canvas F6, SLT-95 R16).
    await abrirDetalle();
    expect(within(central()).getByText(NOTA_GANA_VIEJA)).toBeInTheDocument();
  });

  it("cada cierre del día es SU fila de «Mensajeros», con las cifras de SU nivel (R15/R23 → SLT-104 R42, R114)", async () => {
    const user = await abrirDetalle();
    expect(await filasMensajeros(user)).toEqual([
      ["Ana Mensajera", "0", "₡80.000,10", "₡9.000,30", "₡70.749,55", "—"],
      ["Beto Mensajero", "0", "₡46.089,07", "₡5.000,25", "₡41.088,82", "—"],
    ]);
  });

  it("y la suma de los días da el agregado, AL CÉNTIMO, sin que nadie corrija nada (R16)", async () => {
    const user = await abrirDetalle();
    const agregado = importeTras(central(), "Debe llegar a la central");
    const porDia = (await filasMensajeros(user)).map((f) => f[4]!);
    laCuentaCierra(porDia, agregado, "Σ días = agregado");
  });

  it("NO queda ninguna tarjeta suelta repitiendo una cifra de una cuenta (R24/R34)", async () => {
    await abrirDetalle();
    for (const rotulo of [
      "Ingreso bruto",
      "Ganancia",
      "Pago a tienda",
      "Ingreso de bodega por devoluciones a origen",
      "Total a pagar a mensajeros",
    ]) {
      expect(
        document.body.textContent,
        `«${rotulo}» sigue suelto en el detalle: es una cifra que ya es línea de una cuenta`,
      ).not.toContain(rotulo);
    }
    for (const nombre of [
      "Ingreso bruto del cierre de bodega",
      "Pago a mensajeros del cierre de bodega",
      "Ganancia del cierre de bodega",
      "Ingreso de bodega por devoluciones a origen del cierre de bodega",
      "Pago a tienda del cierre de bodega",
    ]) {
      expect(screen.queryByRole("region", { name: nombre }), nombre).toBeNull();
    }
  });

  it("lo recaudado se lee por método bajo la cifra «Recaudado» (R29 → SLT-95 R7)", async () => {
    // SLT-104: el panel «Totales del cierre de bodega» lo sustituye la cifra «Recaudado» con sus
    // métodos (SLT-95 R6-R7); los que valen cero no se pintan (SLT-95 D4), por eso no hay «Transferencia».
    await abrirDetalle();
    const recaudado = screen.getByRole("group", { name: "Recaudado" });
    expect(recaudado.textContent).toContain("₡126.089,17");
    const metodos = within(recaudado).getByLabelText("Métodos de pago de lo recaudado");
    expect(metodos.textContent).toContain("Efectivo");
    expect(metodos.textContent).toContain("₡100.000,17");
    expect(metodos.textContent).toContain("SINPE");
    expect(metodos.textContent).toContain("₡26.089");
    expect(metodos.textContent).not.toContain("Transferencia");
    laCuentaCierra(["₡100.000,17", "₡26.089"], "₡126.089,17", "métodos = recaudado");
  });

  it("el desglose por concepto lo da «Lo que se le factura a la tienda»", async () => {
    // SLT-104 (requirements > Lo que NO entra): el panel «Ingreso de la empresa» por concepto deja de
    // verse en bodega; sus conceptos agrupados son las líneas de esta cuenta.
    await abrirDetalle();
    expect(importeTras(factura(), "Flete por entregado + IVA")).toBe("₡23.000,33");
    expect(importeTras(factura(), "Total facturado")).toBe("₡27.635,58");
  });
});

describe("393 · F6 — el caso raro, dicho en la pantalla", () => {
  /** El cierre de la jornada prepagada: los descuentos superan lo recaudado. */
  const EN_DEUDA: DetalleOk = {
    ...DETALLE_OK,
    cierre: {
      ...CABECERA,
      totales: {
        efectivo: "500.00",
        simpe: "500.00",
        transferencia: "0.00",
        general: "1000.00",
      },
      totalPagoMensajero: "2000.05",
      totalIngresoBodegaRechazos: "0.00",
      paraLaCentral: "-1000.05",
      efectivoCubreDescuentos: false,
      ...marcaSinConciliar("500.00"),
    },
    cierres: [],
    totalesIngreso: totalesIngreso({
      fleteConIva: "300.10",
      comisionConIva: "0.00",
      fleteDevolucionConIva: "0.00",
      total: "300.10",
    }),
    ganancia: "-1699.95",
    pagoTienda: "699.90",
    cobradoSobreRecaudado: "300.10",
    netoEmpresa: "-1699.95",
    paraLaCentral: "-1000.05",
    efectivoCubreDescuentos: false,
    ...marcaSinConciliar("500.00"),
  };

  it("un «Debe llegar a la central» NEGATIVO lleva su signo, su tono y SU NOTA (R36)", async () => {
    await abrirDetalle(EN_DEUDA);
    const pintado = importeTras(central(), "Debe llegar a la central");
    expect(pintado).toBe("-₡1.000,05");
    expect(centimos(pintado)).toBe(BigInt(-100005));
    expect(within(central()).getByText(pintado).className).toContain("text-danger-strong");
    expect(
      within(central()).getByText(
        "Los descuentos superan lo recaudado en este cierre: la satélite no entrega nada y la central pone la diferencia.",
      ),
    ).toBeInTheDocument();
    // El rótulo NO cambia con el signo: una cifra, un nombre (D6).
    expect(within(central()).getByText("Debe llegar a la central")).toBeInTheDocument();
  });

  it("un «Le queda a la empresa» NEGATIVO se pinta con signo y marcado como deuda (R11)", async () => {
    await abrirDetalle(EN_DEUDA);
    const pintado = importeTras(queda(), "Le queda a la empresa");
    expect(pintado).toBe("-₡1.699,95");
    expect(within(queda()).getByText(pintado).className).toContain("text-danger-strong");
  });

  it("la nota del EFECTIVO aparece sólo cuando el efectivo no cubre los descuentos (R37)", async () => {
    const NOTA = "El efectivo recaudado no cubre los descuentos: parte de lo recaudado entró por SINPE o transferencia.";
    await abrirDetalle(EN_DEUDA);
    expect(within(central()).getByText(NOTA)).toBeInTheDocument();

    cleanup();
    vi.clearAllMocks();
    await abrirDetalle();
    expect(within(central()).queryByText(NOTA)).toBeNull();
  });
});

/**
 * SL-39 (R24) — EL IVA FACTURADO TIENE SU LÍNEA en la cuenta «de quién es el dinero», justo después de
 * lo facturado. SLT-104: en el detalle de bodega se lee el AGREGADO (el de cada cierre del día, en su
 * detalle: R118, R115), y la línea se llama «IVA (no es de la empresa)» (SLT-95 R16: el rótulo dice lo
 * que la nota de la 393 explicaba).
 *
 * Los dos días son los cierres A y B de `design.md > 12.4` de SL-39; el agregado es su suma:
 * 5.876,00 − 676,00 − 3.600,00 − 0,00 = 1.600,00.
 */
describe("SL-39 — el IVA facturado en el detalle del cierre de bodega (R24, R26)", () => {
  const INGRESO_AGREGADO: TotalesIngresoEmpresa = {
    montoCobrar: "20000.00",
    flete: "3200.00",
    ivaFlete: "416.00",
    fleteDevolucion: "2000.00",
    ivaFleteDevolucion: "260.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
    fleteConIva: "3616.00",
    comisionConIva: "0.00",
    fleteDevolucionConIva: "2260.00",
    total: "5876.00",
  };
  const TOTALES_A = { efectivo: "20000.00", simpe: "0.00", transferencia: "0.00", general: "20000.00" };
  const DIA_A: CierreBodegaDetalleCierre = {
    ...DIA_ANA,
    totales: TOTALES_A,
    totalPagoMensajero: "1500.00",
    totalIngresoBodegaRechazos: "0.00",
    paraLaCentral: "18500.00",
  };
  const DIA_B: CierreBodegaDetalleCierre = {
    ...DIA_BETO,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "2100.00",
    totalIngresoBodegaRechazos: "0.00",
    paraLaCentral: "-2100.00",
    efectivoCubreDescuentos: false,
  };
  const DETALLE_AB: DetalleOk = {
    ...DETALLE_OK,
    cierre: {
      ...CABECERA,
      totales: TOTALES_A,
      totalPagoMensajero: "3600.00",
      totalIngresoBodegaRechazos: "0.00",
      cantidadCierres: 2,
      paraLaCentral: "16400.00",
      ...marcaSinConciliar("20000.00"),
    },
    cierres: [DIA_A, DIA_B],
    totalesIngreso: INGRESO_AGREGADO,
    ivaFacturado: "676.00",
    ganancia: "1600.00",
    pagoTienda: "16384.00",
    cobradoSobreRecaudado: "3616.00",
    netoEmpresa: "1600.00",
    ganaLaTienda: "14124.00",
    paraLaCentral: "16400.00",
    ...marcaSinConciliar("20000.00"),
  };

  it("la línea va JUSTO después de lo facturado, resta y tiene su importe", async () => {
    await abrirDetalle(DETALLE_AB);
    const rotulos = lineas(queda()).map((l) => l[0]);
    expect(rotulos.indexOf("− IVA (no es de la empresa)")).toBe(rotulos.indexOf("Total facturado") + 1);
    expect(rotulos.indexOf("− Pago a mensajeros")).toBe(rotulos.indexOf("− IVA (no es de la empresa)") + 1);
    expect(lineas(queda())[1]).toEqual(["− IVA (no es de la empresa)", "₡676", "resta", "partida"]);
  });

  it("facturado − IVA − mensajeros − bodega = le queda, se lee y cuadra (design §12.4)", async () => {
    await abrirDetalle(DETALLE_AB);
    expect(lineas(queda()).map((l) => l[1])).toEqual(["₡5.876", "₡676", "₡3.600", "₡0", "₡1.600"]);
    laCuentaCierraConSigno(queda(), "le queda · agregado");
  });

  it("R26: lo que sale de lo recaudado y lo de la central no cambian, y el IVA no entra en la cuenta de la central", async () => {
    await abrirDetalle(DETALLE_AB);
    expect(importeTras(factura(), "Sale de lo recaudado")).toBe("₡3.616");
    expect(importeTras(central(), "Debe llegar a la central")).toBe("₡16.400");
    expect(within(central()).queryByText(/IVA/)).toBeNull();
  });
});

/**
 * SL-15 R4 — los rótulos del detalle nombran a la empresa leyendo `EMPRESA` de
 * `lib/config/marca.ts`, no escribiéndola a mano. Con otro nombre en el módulo, la pantalla lo
 * dice en cada rótulo y no queda ni un «la empresa» escrito a mano.
 */
describe("SL-15 R4 — el nombre de la empresa sale del módulo de marca", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/config/marca");
    vi.resetModules();
  });

  it("con «Acme Envíos» en el módulo, las cuentas y las cifras lo dicen; «la empresa», nunca", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config/marca", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/config/marca")>()),
      EMPRESA: { enFrase: "Acme Envíos", alInicio: "Acme Envíos", membrete: "Acme Envíos" },
    }));
    const acciones = await import("@/lib/actions/cierre-bodega");
    const { CierresBodegaAdminModule: ModuloAcme } = await import(
      "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule"
    );
    const { SWRConfig: SWRAcme } = await import("swr");

    vi.mocked(acciones.listarPendientesCierresBodegaPaginado).mockResolvedValue({
      status: "ok",
      page: 1,
      ...paginaInicial([CABECERA]),
    });
    vi.mocked(acciones.listarHistoricoCierresBodegaPaginado).mockResolvedValue({
      status: "ok",
      page: 1,
      ...paginaInicial([]),
    });
    vi.mocked(acciones.verCierreBodegaDetalle).mockResolvedValue(DETALLE_OK);

    render(
      <SWRAcme value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ModuloAcme pendientes={paginaInicial([CABECERA])} historico={paginaInicial([])} />
      </SWRAcme>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" }),
    );
    const cuenta = await screen.findByRole("region", { name: "De lo facturado, le queda a Acme Envíos" });

    expect(within(cuenta).getByText("Le queda a Acme Envíos")).toBeInTheDocument();
    expect(within(cuenta).getByText("− IVA (no es de Acme Envíos)")).toBeInTheDocument();
    expect(importeTras(cuenta, "Le queda a Acme Envíos")).toBe("₡13.384,78");
    expect(screen.getByRole("group", { name: "Le queda a Acme Envíos" })).toBeInTheDocument();
    // Ni un «la empresa» escrito a mano en lo que se lee, ni en los nombres accesibles.
    const accesibles = Array.from(document.querySelectorAll("[aria-label]"))
      .map((el) => el.getAttribute("aria-label") ?? "")
      .join(" | ");
    expect(document.body.textContent).not.toMatch(/la empresa/i);
    expect(accesibles).not.toMatch(/la empresa/i);
  });
});

describe("SLT-54 R65 — el rótulo del flete que no es de entrega", () => {
  const conNuevo = {
    grupos: grupos478({
      novedad: [gestion478({ gestionId: "g-slt54", resultado: "novedad", ingresoEmpresa: ingreso478({ tarifaModelo: "nuevo", tarifa: null }) })],
    }),
  };
  const FLETE_NO_ENTREGADAS = "+ Flete de gestiones no entregadas + IVA";
  const FLETE_DEVOLUCION = "+ Flete por devolución a origen + IVA";

  it("con un mensajero del nuevo, la cuenta del agregado lo dice", async () => {
    // SLT-104: el rótulo POR mensajero vive en el detalle de su cierre del día (R118, R115).
    const [ana, beto] = DETALLE_OK.cierres;
    await abrirDetalle({ ...DETALLE_OK, cierres: [{ ...ana!, ...conNuevo }, beto!] });
    const rotulos = lineas(factura()).map((l) => l[0]);
    expect(rotulos).toContain(FLETE_NO_ENTREGADAS);
    expect(rotulos).not.toContain(FLETE_DEVOLUCION);
  });

  it("todo viejo: nada cambia", async () => {
    await abrirDetalle();
    const rotulos = lineas(factura()).map((l) => l[0]);
    expect(rotulos).toContain(FLETE_DEVOLUCION);
    expect(rotulos).not.toContain(FLETE_NO_ENTREGADAS);
  });

  it("R71: la nota de lo que gana la satélite no habla de devoluciones en el nuevo; en el viejo, literal", async () => {
    const [ana, beto] = DETALLE_OK.cierres;
    await abrirDetalle({ ...DETALLE_OK, cierres: [{ ...ana!, ...conNuevo }, beto!] });
    const NOTA_NUEVA = "Lo que se le reconoce a la bodega satélite por sus gestiones. No es un movimiento de caja registrado.";
    expect(within(central()).getByText(NOTA_NUEVA)).toBeInTheDocument();
    expect(within(central()).queryByText(NOTA_GANA_VIEJA)).toBeNull();
    cleanup();
    await abrirDetalle();
    expect(within(central()).getByText(NOTA_GANA_VIEJA)).toBeInTheDocument();
  });

  it("R71 (menor 5): la nota de «Debe llegar a la central» sigue al cierre: nuevo sin devoluciones; viejo, literal", async () => {
    const [ana, beto] = DETALLE_OK.cierres;
    await abrirDetalle({ ...DETALLE_OK, cierres: [{ ...ana!, ...conNuevo }, beto!] });
    const NOTA_NUEVA = "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por sus gestiones.";
    expect(within(central()).getByText(NOTA_NUEVA)).toBeInTheDocument();
    expect(within(central()).queryByText(NOTA_CENTRAL_VIEJA)).toBeNull();
    cleanup();
    await abrirDetalle();
    expect(within(central()).getByText(NOTA_CENTRAL_VIEJA)).toBeInTheDocument();
    expect(within(central()).queryByText(NOTA_NUEVA)).toBeNull();
  });
});
