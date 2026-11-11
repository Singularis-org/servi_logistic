// @vitest-environment jsdom
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
import type { ParteDeTienda } from "@/lib/utils/ingreso-empresa";

/**
 * 💰 FICHA 396 · TANDA D — EL CIERRE DE BODEGA DICE DE QUÉ TIENDA ES CADA PARTE, EN SUS DOS
 * NIVELES.
 *
 * ── LO PRIMERO, PORQUE CAMBIA CÓMO SE LEE TODO LO DEMÁS
 * **El dinero está BIEN.** `wallet_tienda_movimiento` lleva los movimientos separados por tienda
 * desde siempre, cada uno con sus propias cifras: a nadie se le paga mal, y esta ficha no toca ni
 * una fila del ledger ni una fórmula. Lo que se arregla es la PANTALLA.
 *
 * ── POR QUÉ EN BODEGA ES EL PEOR DE LOS TRES CASOS
 * El detalle del cierre de un mensajero agrega las tiendas de ESE mensajero. El de bodega agrega
 * **N mensajeros × M tiendas** bajo un solo «Para la tienda» — y lo hace DOS veces: una por cada
 * mensajero incluido y otra para toda la bodega.
 *
 * ── LOS TRES UMBRALES, QUE ES LA TRAMPA DE ESTA TANDA
 * El del nivel de cada mensajero se evalúa sobre **las tiendas de ESE mensajero**, no sobre las de
 * la bodega. Una bodega con dos mensajeros que llevaron UNA tienda cada uno no enseña desglose en
 * ningún nivel de mensajero y **sí** en el agregado. Tiene su propio bloque aquí abajo.
 *
 * ── LO QUE SE AFIRMA, Y CÓMO
 * Las cifras se leen DEL DOM y se comparan contra literales escritos a mano; las sumas se hacen
 * sobre las cadenas pintadas, no sobre los datos de entrada. Comparar un número —o un rótulo—
 * contra la función que lo genera está siempre verde, y en este repo ya dejó pasar un tope falso.
 *
 * ── LOS IMPORTES
 * Son los del fixture de la ficha 393 (`CierreBodegaDetalleCascadas.test.tsx`), partidos ahora por
 * tienda. Deliberado: el día de Ana tuvo un rechazo y el de Beto no, así que sólo en las tiendas de
 * Ana difieren «Se le paga hoy» y «Gana en total» — si todas difirieran igual, una derivación con
 * el subconjunto equivocado pasaría desapercibida. Y «Tienda Norte» aparece en LOS DOS mensajeros,
 * que es lo que hace comprobable Q8: una sola fila por tienda en el agregado.
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
// Lectura de lo PINTADO
// ---------------------------------------------------------------------------

/** Un importe tal y como se LEE, con su operador si lo lleva. */
const PATRON_IMPORTE = new RegExp(
  `^[+-]?${monedaConfig.simbolo}\\d[\\d${monedaConfig.separadorMiles}]*(?:${monedaConfig.separadorDecimal}\\d\\d)?$`,
);

/** Céntimos enteros de un importe pintado. `BigInt` y no `Number`: aquí no se pierde un céntimo. */
function centimos(pintado: string): bigint {
  const texto = pintado.trim();
  const negativo = texto.startsWith("-");
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

/** Todos los importes pintados junto a un rótulo dentro de una región, en orden de aparición. */
function importesTras(region: HTMLElement, rotulo: string): string[] {
  const etiquetas = within(region)
    .getAllByText(rotulo)
    // El rótulo vive en un `span` HOJA. Su envoltorio (rótulo + notas) también casaría cuando la
    // línea no lleva notas, y contaría cada línea dos veces.
    .filter((el) => el.children.length === 0);
  expect(etiquetas.length, `el rótulo «${rotulo}» no está en la región`).toBeGreaterThan(0);

  return etiquetas.map((etiqueta) => {
    const fila = etiqueta.closest("div");
    expect(fila, `«${rotulo}» no está dentro de una línea de cascada`).not.toBeNull();
    const importe = (fila!.lastElementChild?.textContent ?? "").trim();
    expect(importe, `no hay importe junto a «${rotulo}»`).toMatch(PATRON_IMPORTE);
    return importe;
  });
}

/** El único importe pintado junto a un rótulo. Falla si hay más de uno: eso sería otra pregunta. */
function importeTras(region: HTMLElement, rotulo: string): string {
  const todos = importesTras(region, rotulo);
  expect(todos.length, `«${rotulo}» aparece ${todos.length} veces en esta región`).toBe(1);
  return todos[0];
}

/**
 * TODOS los importes que se leen dentro de una región. Es lo que hace comprobable R5: una cuarta
 * cifra por tienda se vería aquí aunque nadie supiera cómo se llama.
 */
function todosLosImportes(region: HTMLElement): string[] {
  return within(region)
    .queryAllByText(PATRON_IMPORTE)
    .filter((el) => el.children.length === 0)
    .map((el) => (el.textContent ?? "").trim());
}

/** La cuenta cierra con las CADENAS que se leen, no con los datos de entrada. */
function laCuentaCierra(sumandos: readonly string[], total: string, quien: string): void {
  const suma = sumandos.reduce((acc, s) => acc + centimos(s), BigInt(0));
  expect(suma, `${quien}: se lee ${sumandos.join(" + ")} = ${total}, y no da`).toBe(
    centimos(total),
  );
}

/** ¿`a` está ANTES que `b` en el documento? */
function vaAntes(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const ZONA = "33333333-3333-4333-8333-333333333333";
const GRUPOS_VACIOS: CierreGrupos = {
  entregado: [],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [],
  incidente: [],
};

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

/**
 * LAS TIENDAS DE ANA. Su día tuvo un rechazo (500,75 de flete + IVA) y lo trajo NORTE, así que
 * sólo en Norte difieren «Se le paga hoy» y «Gana en total», y difieren en exactamente eso.
 *
 *   Norte  recaudó 50.000,10 · se le pagan 40.000,00 · gana 39.499,25   (difieren en 500,75)
 *   Sur    recaudó 30.000,00 · se le pagan 22.499,75 · gana 22.499,75   (no difieren)
 *   ────────────────────────────────────────────────────────────────────────────────────────
 *   suma           80.000,10              62.499,75        61.999,00    = los de Ana
 */
const ANA_NORTE: ParteDeTienda = {
  tiendaId: "t-norte",
  tiendaNombre: "Tienda Norte",
  recaudado: "50000.10",
  pagoTienda: "40000.00",
  ganaLaTienda: "39499.25",
};
const ANA_SUR: ParteDeTienda = {
  tiendaId: "t-sur",
  tiendaNombre: "Tienda Sur",
  recaudado: "30000.00",
  pagoTienda: "22499.75",
  ganaLaTienda: "22499.75",
};

/**
 * LAS TIENDAS DE BETO. Su día no tuvo ni un rechazo: en las dos coinciden las dos cifras de pago.
 * NORTE vuelve a aparecer —la misma tienda, el mismo id— y es lo que hace comprobable Q8.
 *
 *   Norte  recaudó 26.089,07 · se le pagan 20.454,59 · gana 20.454,59
 *   Este   recaudó 20.000,00 · se le pagan 16.000,00 · gana 16.000,00
 *   ────────────────────────────────────────────────────────────────
 *   suma           46.089,07              36.454,59       36.454,59   = los de Beto
 */
const BETO_NORTE: ParteDeTienda = {
  tiendaId: "t-norte",
  tiendaNombre: "Tienda Norte",
  recaudado: "26089.07",
  pagoTienda: "20454.59",
  ganaLaTienda: "20454.59",
};
const BETO_ESTE: ParteDeTienda = {
  tiendaId: "t-este",
  tiendaNombre: "Tienda Este",
  recaudado: "20000.00",
  pagoTienda: "16000.00",
  ganaLaTienda: "16000.00",
};

/**
 * EL DESGLOSE AGREGADO: UNA fila por tienda a través de los DOS mensajeros (Q8, R20). Norte suma
 * las dos suyas; Sur y Este vienen de un solo mensajero. Ordenado por lo que se le paga, de mayor
 * a menor, como lo emite el servidor (R8).
 *
 *   Norte  76.089,17 · 60.454,59 · 59.953,84   (= 50.000,10+26.089,07 · 40.000+20.454,59 · …)
 *   Sur    30.000,00 · 22.499,75 · 22.499,75
 *   Este   20.000,00 · 16.000,00 · 16.000,00
 *   ─────────────────────────────────────────
 *   suma  126.089,17 · 98.954,34 · 98.453,59   = los agregados de toda la bodega
 */
const AGG_NORTE: ParteDeTienda = {
  tiendaId: "t-norte",
  tiendaNombre: "Tienda Norte",
  recaudado: "76089.17",
  pagoTienda: "60454.59",
  ganaLaTienda: "59953.84",
};
const AGG_SUR: ParteDeTienda = { ...ANA_SUR };
const AGG_ESTE: ParteDeTienda = { ...BETO_ESTE };

/** El día CON rechazo. */
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
  ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
  ganancia: "9000.80",
  pagoTienda: "62499.75",
  cobradoSobreRecaudado: "17500.35",
  netoEmpresa: "8750.55",
  ganaLaTienda: "61999.00",
  partesPorTienda: [ANA_NORTE, ANA_SUR],
  paraLaCentral: "70749.55",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("60000.10"),
};

/** El día SIN rechazo. */
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
  ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
  ganancia: "4634.23",
  pagoTienda: "36454.59",
  cobradoSobreRecaudado: "9634.48",
  netoEmpresa: "4634.23",
  ganaLaTienda: "36454.59",
  partesPorTienda: [BETO_NORTE, BETO_ESTE],
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
  ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
  ganancia: "13635.03",
  pagoTienda: "98954.34",
  cobradoSobreRecaudado: "27134.83",
  netoEmpresa: "13384.78",
  ganaLaTienda: "98453.59",
  partesPorTienda: [AGG_NORTE, AGG_SUR, AGG_ESTE],
  paraLaCentral: "111838.37",
  efectivoCubreDescuentos: true,
  // FICHA 431: la marca de conciliacion, CUADRADA con el efectivo de este doble.
  ...marcaSinConciliar("40000.07"),
};

type DetalleOk = typeof DETALLE_OK;

/**
 * ⚠️ EL CASO QUE SEPARA LOS TRES UMBRALES (R19 vs R20): dos mensajeros que llevaron UNA tienda
 * cada uno. Ninguno de los dos niveles de mensajero enseña desglose —cada uno tiene una sola
 * tienda— y el AGREGADO sí, porque la bodega tiene dos. Los agregados no cambian: Ana entera es
 * Norte y Beto entero es Este.
 */
const UNA_TIENDA_CADA_MENSAJERO: DetalleOk = {
  ...DETALLE_OK,
  cierres: [
    {
      ...DIA_ANA,
      partesPorTienda: [
        {
          tiendaId: "t-norte",
          tiendaNombre: "Tienda Norte",
          recaudado: "80000.10",
          pagoTienda: "62499.75",
          ganaLaTienda: "61999.00",
        },
      ],
    },
    {
      ...DIA_BETO,
      partesPorTienda: [
        {
          tiendaId: "t-este",
          tiendaNombre: "Tienda Este",
          recaudado: "46089.07",
          pagoTienda: "36454.59",
          ganaLaTienda: "36454.59",
        },
      ],
    },
  ],
  partesPorTienda: [
    {
      tiendaId: "t-norte",
      tiendaNombre: "Tienda Norte",
      recaudado: "80000.10",
      pagoTienda: "62499.75",
      ganaLaTienda: "61999.00",
    },
    {
      tiendaId: "t-este",
      tiendaNombre: "Tienda Este",
      recaudado: "46089.07",
      pagoTienda: "36454.59",
      ganaLaTienda: "36454.59",
    },
  ],
};

/**
 * DOS TIENDAS HOMÓNIMAS en el agregado, con ids distintos. El servidor las permite a propósito
 * —agrupa por el id congelado y no por el nombre (R7)— y aquí no se pueden fundir.
 */
const HOMONIMAS: DetalleOk = {
  ...DETALLE_OK,
  partesPorTienda: [
    { ...AGG_NORTE, tiendaId: "t-uno", tiendaNombre: "Mi Tienda" },
    { ...AGG_SUR, tiendaId: "t-dos", tiendaNombre: "Mi Tienda" },
    AGG_ESTE,
  ],
};

// --- Las regiones, por su nombre accesible ---------------------------------

/**
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)»: el desglose por tienda es la
 * tabla «Por tienda» de la pestaña «Dinero» del detalle único (SLT-95 R16, canvas F6), solo para el
 * AGREGADO. El desglose de CADA mensajero (R19 de la 396) vive en el detalle de su cierre del día
 * (R118), al que lleva «Ver su cierre» (R115).
 */
const porTienda = () => screen.getByRole("region", { name: "Por tienda" });
const sinPorTienda = () => screen.queryByRole("region", { name: "Por tienda" });
const central = () => screen.getByRole("region", { name: "Lo que va a la central" });
const queda = () => screen.getByRole("region", { name: "De lo facturado, le queda a la empresa" });
const factura = () => screen.getByRole("region", { name: "Lo que se le factura a la tienda" });

/** Las filas de la tabla como se leen: [tienda, recaudado, se le paga hoy, gana en total]. */
function filasPorTienda(): string[][] {
  return within(within(porTienda()).getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((f) => [...f.children].map((c) => (c.textContent ?? "").trim()));
}

/** La fila de UNA tienda, por su encabezado de fila. */
function filaDe(nombre: string): HTMLElement {
  const encabezados = within(porTienda()).getAllByRole("rowheader", { name: nombre });
  expect(encabezados, `«${nombre}» aparece ${encabezados.length} veces`).toHaveLength(1);
  return encabezados[0]!.closest("tr") as HTMLElement;
}

/** La columna `i` (1 = recaudado, 2 = se le paga hoy, 3 = gana en total) de todas las filas. */
const columna = (i: number) => filasPorTienda().map((f) => f[i]!);

/** Monta la pantalla, abre el detalle del cierre de bodega pendiente (en «Dinero») y devuelve el `user`. */
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
    await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }),
  );
  await screen.findByRole("region", { name: "Lo que va a la central" });
  return user;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// ---------------------------------------------------------------------------

describe("396 · D3 — autocomprobación del lector del DOM", () => {
  it("encuentra las filas de verdad, y falla cuando le pides una que no está", async () => {
    await abrirDetalle();
    expect(filasPorTienda()).toHaveLength(3);
    expect(() => filaDe("Tienda Que No Existe")).toThrow();
    expect(importeTras(central(), "Total general")).toBe("₡126.089,17");
    expect(() => importeTras(central(), "Rótulo que no existe")).toThrow();
  });
});

describe("396 · D3 — con dos mensajeros y tres tiendas, el desglose de toda la bodega", () => {
  it("hay UN desglose, el de toda la bodega (R20; el de cada mensajero, en su detalle: SLT-104 R118)", async () => {
    await abrirDetalle();
    expect(screen.getAllByRole("region", { name: "Por tienda" })).toHaveLength(1);
    expect(within(porTienda()).getByRole("heading", { name: "Por tienda" })).toBeInTheDocument();
  });

  it("el AGREGADO trae las TRES tiendas con sus NUEVE cifras, escritas a mano (R20)", async () => {
    await abrirDetalle();
    expect(filasPorTienda()).toEqual([
      ["Tienda Norte", "₡76.089,17", "₡60.454,59", "₡59.953,84"],
      ["Tienda Sur", "₡30.000", "₡22.499,75", "₡22.499,75"],
      ["Tienda Este", "₡20.000", "₡16.000", "₡16.000"],
    ]);
  });

  it("va DESPUÉS de las cuentas (canvas F6)", async () => {
    await abrirDetalle();
    expect(vaAntes(central(), porTienda())).toBe(true);
    expect(vaAntes(queda(), porTienda())).toBe(true);
  });
});

describe("396 · D3 · ⚠️ EL CASO QUE SEPARA LOS UMBRALES — R19 vs R20", () => {
  it("dos mensajeros con UNA tienda cada uno: el agregado SÍ se desglosa", async () => {
    await abrirDetalle(UNA_TIENDA_CADA_MENSAJERO);
    expect(filasPorTienda()).toEqual([
      ["Tienda Norte", "₡80.000,10", "₡62.499,75", "₡61.999"],
      ["Tienda Este", "₡46.089,07", "₡36.454,59", "₡36.454,59"],
    ]);
  });

  it("y las cuentas quedan EXACTAMENTE como estaban (R2/R18)", async () => {
    await abrirDetalle(UNA_TIENDA_CADA_MENSAJERO);
    expect(importeTras(central(), "Debe llegar a la central")).toBe("₡111.838,37");
    expect(importeTras(queda(), "Le queda a la empresa")).toBe("₡13.384,78");
  });

  it("con UNA sola tienda en toda la bodega no aparece el desglose", async () => {
    const UNA: ParteDeTienda = {
      tiendaId: "t-norte",
      tiendaNombre: "Tienda Norte",
      recaudado: "126089.17",
      pagoTienda: "98954.34",
      ganaLaTienda: "98453.59",
    };
    await abrirDetalle({
      ...DETALLE_OK,
      cierres: [
        { ...DIA_ANA, partesPorTienda: [ANA_NORTE] },
        { ...DIA_BETO, partesPorTienda: [BETO_NORTE] },
      ],
      partesPorTienda: [UNA],
    });
    expect(sinPorTienda()).toBeNull();
    expect(screen.queryByText("Tienda Norte")).toBeNull();
  });
});

describe("396 · D3 · R10/R11/R12 — la suma de las partes ES el agregado", () => {
  it("lo recaudado por cada tienda suma el «Total general» de toda la bodega", async () => {
    await abrirDetalle();
    laCuentaCierra(columna(1), importeTras(central(), "Total general"), "Σ recaudado por tienda");
  });

  it("lo que se le paga hoy a cada tienda suma el «Para la tienda» del contrato, que esta pantalla NO pinta", async () => {
    // SLT-104: el Dinero de bodega no pinta «Para la tienda» (SLT-95 R16, canvas F6); el agregado es
    // el `pagoTienda` del contrato, escrito a mano.
    await abrirDetalle();
    laCuentaCierra(columna(2), "₡98.954,34", "Σ se le paga hoy");
  });

  it("lo que gana cada tienda suma el agregado del contrato, que esta pantalla NO pinta", async () => {
    await abrirDetalle();
    laCuentaCierra(columna(3), "₡98.453,59", "Σ gana en total");
  });

  it("en Norte las dos cifras de pago DIFIEREN sólo donde hubo rechazo: en el flete por devolución", async () => {
    await abrirDetalle();
    const [, , hoy, gana] = filasPorTienda()[0]!;
    expect(centimos(hoy!) - centimos(gana!)).toBe(centimos(importeTras(factura(), "+ Flete por devolución a origen + IVA")));
    for (const [nombre, , h, g] of filasPorTienda().slice(1)) expect(h, nombre).toBe(g);
  });
});

describe("396 · D3 · R20/Q8 — una tienda en DOS mensajeros sale UNA sola vez en el agregado", () => {
  it("Norte es UNA fila", async () => {
    await abrirDetalle();
    expect(filasPorTienda().filter((f) => f[0] === "Tienda Norte")).toHaveLength(1);
    expect(filaDe("Tienda Norte")).toBeInTheDocument();
  });
});

describe("396 · D3 · R5 — TRES cifras por tienda, ni una cuarta", () => {
  it("cada fila lee exactamente tres importes y las dos cifras de pago se pintan las dos", async () => {
    await abrirDetalle();
    for (const fila of within(within(porTienda()).getByRole("table")).getAllByRole("row").slice(1)) {
      expect(todosLosImportes(fila), fila.textContent ?? "").toHaveLength(3);
    }
  });
});

describe("396 · D3 · R22 — la misma plata se lee IGUAL que en el detalle del mensajero", () => {
  it("las columnas son los mismos textos aprobados (la misma tabla que el Dinero del mensajero)", async () => {
    await abrirDetalle();
    const cabecera = within(within(porTienda()).getByRole("table")).getAllByRole("columnheader");
    expect(cabecera.map((c) => c.textContent)).toEqual(["Tienda", "Recaudado", "Se le paga hoy", "Gana en total"]);
  });

  it("los rótulos de dinero que nombran a la tienda son textos distintos", async () => {
    // Antes eran cinco (con «Para la tienda» y su marca); el Dinero de bodega pinta solo la tabla del
    // canvas (SLT-95 R16, canvas F6), así que se vigilan los tres de sus columnas de dinero.
    await abrirDetalle();
    const cabecera = within(within(porTienda()).getByRole("table")).getAllByRole("columnheader");
    const rotulos = cabecera.slice(1).map((c) => c.textContent);
    expect(rotulos).toHaveLength(3);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});

// R17 de la 396 (las dos notas de cabecera del desglose): la tabla «Por tienda» del canvas aprobado no
// las dibuja (SLT-95 R16, canvas F6, `Main.dc.html`); se retira esa vigilancia aquí. Igual R1 (la marca
// «de N tiendas» pegada a «Para la tienda»): el Dinero de bodega no pinta esa línea (SLT-95 R16, canvas F6).
// Los casos por mensajero (R19, sumas y umbral de cada nivel, homónimas de un nivel) viven en el detalle
// de su cierre del día (SLT-104 R118, R115).

describe("396 · D3 — los nombres accesibles son ÚNICOS dentro del detalle", () => {
  it("ninguna región del detalle se anuncia igual que otra", async () => {
    await abrirDetalle();
    const nombres = within(screen.getByRole("dialog"))
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label") ?? "");
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  // La segunda mitad de la 396 («y NO comparten nombre accesible») se retira: vigilaba las regiones con
  // nombre de cada tienda del desglose viejo. La tabla «Por tienda» del canvas (SLT-95 R16, canvas F6)
  // no tiene una región por tienda: cada tienda es una fila de tabla, que se distingue por su posición y
  // sus cifras (lo afirma este caso), y el test de arriba vigila que ninguna REGIÓN se anuncie igual.
  it("dos tiendas HOMÓNIMAS no se funden", async () => {
    await abrirDetalle(HOMONIMAS);
    expect(filasPorTienda().map((f) => f[0])).toEqual(["Mi Tienda", "Mi Tienda", "Tienda Este"]);
    expect(columna(1)).toEqual(["₡76.089,17", "₡30.000", "₡20.000"]);
  });
});

describe("396 · D3 · R8 — la pantalla pinta en el orden que le llega, y no reordena", () => {
  it("un desglose que llega de menor a mayor se pinta de menor a mayor", async () => {
    await abrirDetalle({ ...DETALLE_OK, partesPorTienda: [AGG_ESTE, AGG_SUR, AGG_NORTE] });
    expect(filasPorTienda().map((f) => f[0])).toEqual(["Tienda Este", "Tienda Sur", "Tienda Norte"]);
  });

  it("y el orden normal del servidor —de mayor a menor— se respeta igual", async () => {
    await abrirDetalle();
    expect(filasPorTienda().map((f) => f[0])).toEqual(["Tienda Norte", "Tienda Sur", "Tienda Este"]);
  });
});

describe("396 · D3 · R18 — ni un importe ya visible cambia de valor", () => {
  it("las cuentas siguen diciendo lo mismo con el desglose pintado", async () => {
    await abrirDetalle();
    expect(importeTras(central(), "Debe llegar a la central")).toBe("₡111.838,37");
    expect(importeTras(queda(), "Le queda a la empresa")).toBe("₡13.384,78");
    expect(importeTras(factura(), "Total facturado")).toBe("₡27.635,58");
  });
});

describe("396 · D3 — el desglose no devuelve a esta pantalla un rótulo que la 393 le quitó", () => {
  it("con las tres tiendas pintadas, las cinco cifras sueltas siguen sin aparecer (R24/R34)", async () => {
    await abrirDetalle();
    for (const rotulo of [
      "Ingreso bruto",
      "Ganancia",
      "Pago a tienda",
      "Ingreso de bodega por devoluciones a origen",
      "Total a pagar a mensajeros",
    ]) {
      expect(document.body.textContent, rotulo).not.toContain(rotulo);
    }
  });
});

describe("396 · D3 — money-safe: la pantalla no hace aritmética de dinero", () => {
  // SLT-104: el desglose lo pintan `DineroCierre` con lo que elige `detalle-cierre-vista` (y el módulo
  // que lo monta). `DesglosePorTienda` ya no se monta en el detalle de bodega (R118).
  const FUENTES = [
    "components/private/cierres/detalle/DineroCierre.tsx",
    "components/private/cierres/detalle/detalle-cierre-vista.ts",
    "app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx",
  ] as const;

  it.each(FUENTES)("%s no convierte ni un importe a número", async (ruta) => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { quitarComentarios } = await import("@/tests/fixtures/sin-comentarios");
    const { LLAMADAS_PROHIBIDAS_EN_DINERO } = await import("@/tests/fixtures/money-safe");

    const codigo = quitarComentarios(
      readFileSync(path.resolve(__dirname, "../..", ruta), "utf8"),
    );
    expect(codigo.length, `${ruta} salió vacío: la guardia no está leyendo nada`).toBeGreaterThan(
      500,
    );
    for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
      expect(codigo, `${ruta} usa ${prohibida.source} sobre un importe`).not.toMatch(prohibida);
    }
  });

  it.each(FUENTES)("%s tampoco ORDENA el desglose: eso lo hizo el servidor", async (ruta) => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { quitarComentarios } = await import("@/tests/fixtures/sin-comentarios");

    const codigo = quitarComentarios(
      readFileSync(path.resolve(__dirname, "../..", ruta), "utf8"),
    );
    for (const prohibida of [/\.sort\s*\(/, /\.reverse\s*\(/, /localeCompare\s*\(/]) {
      expect(codigo, `${ruta} usa ${prohibida.source} sobre el desglose`).not.toMatch(prohibida);
    }
  });
});
