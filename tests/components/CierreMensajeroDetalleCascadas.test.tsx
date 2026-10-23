// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { monedaConfig } from "@/lib/config/moneda";
import type {
  CierreAdminResumen,
  CierreDetalleAdminServiceResult,
} from "@/lib/interfaces/services/ICierresAdminService";
import type {
  CierreGrupos,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreEstado } from "@/lib/types/cierre";
import {
  CASCADA_DUENO_TITULO,
  CASCADA_FACTURA_TIENDA_TITULO,
  CASCADA_NETO_EMPRESA_TITULO,
  COBRADO_SOBRE_RECAUDADO_LABEL,
  COBRADO_SOBRE_RECAUDADO_NOTA,
  FACTURADO_EMPRESA_LABEL,
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_RECHAZO_AUN_NO_COBRADO_NOTA,
  FLETE_RECHAZO_NO_DEDUCIBLE_NOTA,
  FLETE_RECHAZO_NO_SE_COBRARA_NOTA,
  FLETE_RECHAZO_YA_COBRADO_NOTA,
  GANA_LA_TIENDA_LABEL,
  GANA_LA_TIENDA_NEGATIVO_NOTA,
  GANA_LA_TIENDA_NOTA,
  IVA_FACTURADO_LABEL,
  IVA_FACTURADO_NOTA,
  NETO_EMPRESA_LABEL,
  NETO_EMPRESA_NEGATIVO_NOTA,
  NETO_EMPRESA_NOTA,
  PAGO_TIENDA_HOY_NOTA,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
// Los cuatro rótulos que ESTA ficha reusa sin tocarlos siguen viviendo donde nacieron, en el
// módulo del detalle. Se piden de ahí a propósito: si un día se movieran al módulo puro, el
// import de arriba seguiría verde y éste se pondría rojo, que es el aviso que se quiere.
import {
  GANANCIA_NOTA,
  GANANCIA_NOTA_BODEGA,
  INGRESO_BODEGA_RECHAZOS_LABEL,
  PAGO_MENSAJERO_LABEL,
  PAGO_TIENDA_LABEL,
  TOTAL_GENERAL_LABEL,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";

/**
 * 💰 FICHA 395 — EL DETALLE DEL CIERRE DE MENSAJERO DICE QUÉ PLATA ES PARA QUIÉN.
 *
 * ── EL DEFECTO QUE MATA ESTE ARCHIVO
 * La pantalla enseñaba «Pago a tienda ₡225.176,33» y «Total de la empresa ₡70.946,67» sueltos e
 * invitaba a restarlos. **Esa resta no da.** El humano se confundió con su propia pantalla y lo
 * dijo así: «si yo me confundo, no quiero imaginar los operarios».
 *
 * ── LOS IMPORTES SON LOS DE SU CAPTURA
 * 285.275,00 · 70.946,67 · 60.098,67 · 10.848,00 · 225.176,33 · 214.328,33. Con estas cifras la
 * confusión es reproducible: `225.176,33 − 70.946,67` NO es lo que la tienda gana, y
 * `225.176,33 − 10.848,00` SÍ. Los importes llevan céntimos a propósito —el resto de fixturas de
 * este repo redondean, y con cifras redondas varias de estas identidades cerrarían igual sin el
 * arreglo—.
 *
 * ── LO QUE SE AFIRMA, Y CÓMO
 * Las cuentas se comprueban sobre las CADENAS QUE SE LEEN DEL DOM, no sobre los `Decimal` de
 * origen: comparar el número contra la función que lo genera está siempre verde (precedente
 * escrito en `DineroIdentidadesEnPantalla`). Lo mismo con el orden: se mide la posición real de
 * las regiones en el documento, porque **el orden es el arreglo**.
 */

vi.mock("@/lib/actions/cierres-admin", () => ({
  listarGestionesCierresAdminCompleto: vi.fn(),
  verCierreDetalle: vi.fn(),
  aprobarCierre: vi.fn(),
  rechazarCierre: vi.fn(),
  listarCierresAdmin: vi.fn(),
  forzarSolicitudVencido: vi.fn(),
  listarHistoricoCierresAdminPaginado: vi.fn(),
  listarPendientesCierresAdminPaginado: vi.fn(),
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
  listarHistoricoCierresAdminPaginado,
  listarPendientesCierresAdminPaginado,
  verCierreDetalle,
} from "@/lib/actions/cierres-admin";
import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

// ---------------------------------------------------------------------------
// Lectura de lo PINTADO
// ---------------------------------------------------------------------------

/**
 * Un importe tal y como se LEE, con su operador si lo lleva. El `[+-]?` no es cosmético: las
 * líneas de una cascada se pintan `-₡70.946,67` y `+₡10.848`, y un patrón que sólo aceptara el
 * menos recortaría el más.
 */
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

/**
 * TODOS los importes pintados junto a un rótulo dentro de una región, en orden de aparición.
 *
 * Devuelve una lista y no un importe suelto porque la línea puente aparece DOS VECES en la misma
 * cascada —una como sumando de lo facturado y otra como sustraendo de lo recaudado— y ahí está
 * justamente lo que hay que poder afirmar. Se llega al importe por la ESTRUCTURA de la línea (la
 * etiqueta, su fila, el último hijo), no por una clase de Tailwind, que es lo que se renombra
 * sin avisar.
 */
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

/** La cuenta cierra con las CADENAS que se leen, no con los `Decimal` de origen. */
function laCuentaCierra(sumandos: readonly string[], total: string, quien: string): void {
  const suma = sumandos.reduce((acc, s) => acc + centimos(s), BigInt(0));
  expect(suma, `${quien}: se lee ${sumandos.join(" ")} = ${total}, y no da`).toBe(centimos(total));
}

/** ¿`a` está ANTES que `b` en el documento? */
function vaAntes(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const GRUPOS_VACIOS: CierreGrupos = {
  entregado: [],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [],
  incidente: [],
};

/**
 * Los once campos del ingreso de la empresa. Sólo se pintan los AGRUPADOS (cada concepto con su
 * IVA); los otros se rellenan coherentes para que la fixtura no se contradiga a sí misma, pero
 * ninguna aserción de este archivo los mira.
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

function resumen(over: Partial<CierreAdminResumen> = {}): CierreAdminResumen {
  return {
    cierreId: "c395",
    mensajeroId: "m395",
    mensajeroNombre: "Ana Mensajera",
    estado: "vencido",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: {
      efectivo: "200275.00",
      simpe: "60000.00",
      transferencia: "25000.00",
      general: "285275.00",
    },
    totalPagoMensajero: "45000.55",
    totalIngresoBodegaRechazos: "1200.25",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-09-01T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    ...over,
  };
}

type DetalleOk = Extract<CierreDetalleAdminServiceResult, { status: "ok" }>;

/**
 * EL CIERRE DE LA CAPTURA: recaudó 285.275,00, la empresa le facturó 70.946,67 (60.098,67 sobre lo
 * recaudado + 10.848,00 de flete por devolución a origen), hoy se le pagan 225.176,33 y en total gana
 * 214.328,33. Estado `vencido`, que es el de la captura: el cargo del flete por devolución a origen TODAVÍA
 * no se ha hecho.
 */
const CON_RECHAZO: DetalleOk = {
  status: "ok",
  cierre: resumen(),
  grupos: GRUPOS_VACIOS,
  totalesIngreso: totalesIngreso({
    fleteConIva: "48250.17",
    comisionConIva: "11848.50",
    fleteDevolucionConIva: "10848.00",
    total: "70946.67",
  }),
  desgloseIngresoBodegaRechazos: { sla: "1200.25", manual: "0.00", total: "1200.25" },
  // SL-39: sin IVA en los conceptos de esta fixtura (`ivaFlete` & co. a "0.00"), así que el IVA
  // facturado es cero y el neto no cambia.
  ivaFacturado: "0.00",
  ganancia: "25946.12",
  pagoTienda: "225176.33",
  cobradoSobreRecaudado: "60098.67",
  netoEmpresa: "24745.87",
  ganaLaTienda: "214328.33",
  fleteRechazoYaCobradoATienda: false,
  // Ficha 396: el desglose por tienda viaja SIEMPRE en el DTO, tambien con una sola
  // tienda. Estas pruebas no lo miran, asi que aqui va vacio; las suyas estan en
  // `tests/unit/utils/partes-por-tienda.test.ts` y en las de la pantalla del desglose.
  partesPorTienda: [],
  ordenesSinGestion: [],
  sinGestionRegistrado: true,
  rechazosDeTienda: [],
};

/**
 * SIN un solo rechazo: el flete por devolución a origen vale "0.00" y la línea puente TIENE que salir igual.
 * Aquí lo que gana la tienda y lo que se le paga coinciden EXACTAMENTE, y aun así son dos líneas
 * distintas: si un día divergen, la pantalla ya sabe decirlo.
 */
const SIN_RECHAZO: DetalleOk = {
  status: "ok",
  cierre: resumen({
    totales: {
      efectivo: "100000.40",
      simpe: "60000.00",
      transferencia: "0.00",
      general: "160000.40",
    },
    totalPagoMensajero: "9000.10",
    totalIngresoBodegaRechazos: "0.00",
  }),
  grupos: GRUPOS_VACIOS,
  totalesIngreso: totalesIngreso({
    fleteConIva: "20000.15",
    comisionConIva: "4000.25",
    fleteDevolucionConIva: "0.00",
    total: "24000.40",
  }),
  desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
  ivaFacturado: "0.00", // SL-39
  ganancia: "15000.30",
  pagoTienda: "136000.00",
  cobradoSobreRecaudado: "24000.40",
  netoEmpresa: "15000.30",
  ganaLaTienda: "136000.00",
  fleteRechazoYaCobradoATienda: false,
  partesPorTienda: [],
  ordenesSinGestion: [],
  sinGestionRegistrado: true,
  rechazosDeTienda: [],
};

/**
 * PUROS RECHAZOS: no se recaudó nada y aun así la empresa facturó el flete por devolución a origen. La tienda
 * GANA un negativo y el neto de la empresa también lo es. Ninguno de los dos se recorta a cero: un
 * cero diría algo falso.
 */
const NEGATIVOS: DetalleOk = {
  status: "ok",
  cierre: resumen({
    estado: "aprobado",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "5000.20",
    totalIngresoBodegaRechazos: "900.30",
    resueltoAt: "2026-09-02T10:00:00.000Z",
    pendientePagoMensajero: "0.00",
  }),
  grupos: GRUPOS_VACIOS,
  totalesIngreso: totalesIngreso({
    fleteConIva: "0.00",
    comisionConIva: "0.00",
    fleteDevolucionConIva: "3400.75",
    total: "3400.75",
  }),
  desgloseIngresoBodegaRechazos: { sla: "900.30", manual: "0.00", total: "900.30" },
  ivaFacturado: "0.00", // SL-39
  ganancia: "-1599.45",
  pagoTienda: "0.00",
  cobradoSobreRecaudado: "0.00",
  netoEmpresa: "-2499.75",
  ganaLaTienda: "-3400.75",
  fleteRechazoYaCobradoATienda: true,
  partesPorTienda: [],
  ordenesSinGestion: [],
  sinGestionRegistrado: true,
  rechazosDeTienda: [],
};

/**
 * SL-39 — EL CIERRE A de `design.md > 12.4`: una entrega con flete 3.200,00 + IVA 13 % = 3.616,00
 * facturados, 1.500,00 de pago al mensajero y nada de bodega. Antes la pantalla decía que a la
 * empresa le quedaban 2.116,00; sin el IVA, que no es suyo, le quedan 1.700,00. El recaudado
 * (20.000,00) es de la fixtura: el diseño no lo fija y no entra en la cascada del neto.
 */
const CIERRE_A: DetalleOk = {
  status: "ok",
  cierre: resumen({
    estado: "solicitado",
    totales: { efectivo: "20000.00", simpe: "0.00", transferencia: "0.00", general: "20000.00" },
    totalPagoMensajero: "1500.00",
    totalIngresoBodegaRechazos: "0.00",
  }),
  grupos: GRUPOS_VACIOS,
  totalesIngreso: {
    montoCobrar: "20000.00",
    flete: "3200.00",
    ivaFlete: "416.00",
    fleteDevolucion: "0.00",
    ivaFleteDevolucion: "0.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
    fleteConIva: "3616.00",
    comisionConIva: "0.00",
    fleteDevolucionConIva: "0.00",
    total: "3616.00",
  },
  desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
  ivaFacturado: "416.00",
  ganancia: "1700.00",
  pagoTienda: "16384.00",
  cobradoSobreRecaudado: "3616.00",
  netoEmpresa: "1700.00",
  ganaLaTienda: "16384.00",
  fleteRechazoYaCobradoATienda: false,
  partesPorTienda: [],
  ordenesSinGestion: [],
  sinGestionRegistrado: true,
  rechazosDeTienda: [],
};

/**
 * SL-39 — EL CIERRE B de `design.md > 12.4`: un solo rechazo, flete por devolución 2.000,00 + IVA
 * 260,00, y 2.100,00 de pago al mensajero. Con el IVA dentro la ganancia daba 160,00 y la tarjeta
 * «Debe» no salía; sin él da −100,00 y sale «Debe».
 */
const CIERRE_B: DetalleOk = {
  status: "ok",
  cierre: resumen({
    estado: "solicitado",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "2100.00",
    totalIngresoBodegaRechazos: "0.00",
  }),
  grupos: GRUPOS_VACIOS,
  totalesIngreso: {
    montoCobrar: "0.00",
    flete: "0.00",
    ivaFlete: "0.00",
    fleteDevolucion: "2000.00",
    ivaFleteDevolucion: "260.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
    fleteConIva: "0.00",
    comisionConIva: "0.00",
    fleteDevolucionConIva: "2260.00",
    total: "2260.00",
  },
  desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
  ivaFacturado: "260.00",
  ganancia: "-100.00",
  pagoTienda: "0.00",
  cobradoSobreRecaudado: "0.00",
  netoEmpresa: "-100.00",
  ganaLaTienda: "-2260.00",
  fleteRechazoYaCobradoATienda: false,
  partesPorTienda: [],
  ordenesSinGestion: [],
  sinGestionRegistrado: true,
  rechazosDeTienda: [],
};

/**
 * La LÍNEA de cascada de un rótulo dentro de una región. Se llega por la estructura, igual que
 * `importesTras`: la hoja del rótulo, su envoltorio (rótulo + notas) y la línea que los contiene.
 */
function filaDe(region: HTMLElement, rotulo: string): HTMLElement {
  const hojas = within(region)
    .getAllByText(rotulo)
    .filter((el) => el.children.length === 0);
  expect(hojas.length, `«${rotulo}» aparece ${hojas.length} veces en esta región`).toBe(1);
  const fila = hojas[0].parentElement?.parentElement ?? null;
  expect(fila, `«${rotulo}» no está dentro de una línea de cascada`).not.toBeNull();
  return fila!;
}

const DE = "cierre de Ana Mensajera";
const particion = () =>
  screen.getByRole("region", { name: `${CASCADA_DUENO_TITULO} · ${DE}` });
const factura = () =>
  screen.getByRole("region", { name: `${CASCADA_FACTURA_TIENDA_TITULO} · ${DE}` });
const neto = () =>
  screen.getByRole("region", { name: `${CASCADA_NETO_EMPRESA_TITULO} · ${DE}` });

/** Monta la pantalla, abre el detalle del cierre pendiente y espera a la partición. */
async function abrirDetalle(detalle: DetalleOk = CON_RECHAZO) {
  const cola = paginaInicial([detalle.cierre]);
  vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...cola,
  });
  vi.mocked(listarHistoricoCierresAdminPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([]),
  });
  vi.mocked(verCierreDetalle).mockResolvedValue(detalle);

  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresAdminModule pendientes={cola} historico={paginaInicial([])} sinZona={false} />
    </SWRConfig>,
  );

  const user = userEvent.setup();
  // Un `vencido` NO ofrece «Ver / decidir» (feature 111/R15): sólo se puede mirar. Los dos
  // botones abren el MISMO detalle, y el fixture por defecto es el `vencido` de la captura.
  const abrir =
    detalle.cierre.estado === "vencido"
      ? `Ver el cierre de ${detalle.cierre.mensajeroNombre}`
      : "Ver / decidir";
  await user.click(await screen.findByRole("button", { name: abrir }));
  await screen.findByRole("region", { name: `${CASCADA_DUENO_TITULO} · ${DE}` });
  return user;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// ---------------------------------------------------------------------------

describe("395 — autocomprobación del lector del DOM", () => {
  it("el lector encuentra las líneas de verdad, y falla cuando le pides una que no está", async () => {
    await abrirDetalle();

    // Si esto saliera vacío o devolviera basura, TODAS las cuentas de abajo cerrarían sobre
    // nada y el verde no significaría nada.
    expect(importesTras(particion(), TOTAL_GENERAL_LABEL)).toEqual(["₡285.275"]);
    // La línea puente aparece DOS veces en la misma cascada, y el lector las ve las dos.
    expect(importesTras(factura(), COBRADO_SOBRE_RECAUDADO_LABEL)).toHaveLength(2);
    expect(() => importesTras(particion(), "Rótulo que no existe")).toThrow();
    // Y el parseador distingue el operador del signo: `+₡10.848` suma, `-₡70.946,67` resta.
    expect(centimos("+₡10.848")).toBe(BigInt(1084800));
    expect(centimos("-₡70.946,67")).toBe(BigInt(-7094667));
  });
});

describe("395 — PRIMERO la partición: el orden es el arreglo", () => {
  it("las tres cascadas son regiones distintas, con nombre accesible propio", async () => {
    await abrirDetalle();

    expect(particion()).toBeInTheDocument();
    expect(factura()).toBeInTheDocument();
    expect(neto()).toBeInTheDocument();
    expect(particion()).not.toBe(factura());
    expect(factura()).not.toBe(neto());
  });

  it("la partición se pinta ANTES que el desglose de lo facturado y que el neto", async () => {
    await abrirDetalle();

    expect(
      vaAntes(particion(), factura()),
      "el desglose de lo facturado se pinta antes que la partición. El orden ES el arreglo: la " +
        "pantalla volvería a empezar por el número que confunde.",
    ).toBe(true);
    expect(vaAntes(factura(), neto())).toBe(true);
  });

  it("la partición se pinta ANTES que la tarjeta «Pago a tienda» del comprobante", async () => {
    await abrirDetalle();

    // Esa tarjeta es la que el humano leyó primero y le hizo restar mal. Lo primero que se lee
    // al abrir el detalle tiene que ser de quién es el dinero.
    const tarjeta = screen.getByRole("region", { name: PAGO_TIENDA_LABEL });
    expect(vaAntes(particion(), tarjeta)).toBe(true);
  });

  it("la partición es UNA resta de tres líneas, y cierra con lo que se lee", async () => {
    await abrirDetalle();
    const region = particion();

    const recaudado = importeTras(region, TOTAL_GENERAL_LABEL);
    const facturado = importeTras(region, FACTURADO_EMPRESA_LABEL);
    const gana = importeTras(region, GANA_LA_TIENDA_LABEL);

    expect(recaudado).toBe("₡285.275");
    expect(facturado).toBe("-₡70.946,67");
    expect(gana).toBe("₡214.328,33");
    laCuentaCierra([recaudado, facturado], gana, "la partición");
  });
});

describe("395 — «Gana la tienda» y «Pago a tienda» son DOS preguntas, no un descuadre", () => {
  it("son dos cifras distintas, cada una con la nota que la separa de la otra", async () => {
    await abrirDetalle();

    const gana = importeTras(particion(), GANA_LA_TIENDA_LABEL);
    const pago = importeTras(factura(), PAGO_TIENDA_LABEL);
    expect(gana).not.toBe(pago);

    expect(within(particion()).getByText(GANA_LA_TIENDA_NOTA)).toBeInTheDocument();
    expect(within(factura()).getByText(PAGO_TIENDA_HOY_NOTA)).toBeInTheDocument();
  });

  it("la diferencia entre las dos es EXACTAMENTE el flete por devolución a origen, y se lee en pantalla", async () => {
    await abrirDetalle();

    const pago = importeTras(factura(), PAGO_TIENDA_LABEL);
    const gana = importeTras(particion(), GANA_LA_TIENDA_LABEL);
    const flete = importesTras(factura(), FLETE_DEV_CON_IVA_LABEL)[0];

    // `pago − flete = gana`. Es la cuenta que el humano tuvo que deducir solo, y que ahora está
    // escrita: `+₡10.848` se lee como sumando de lo facturado, así que aquí se le da la vuelta.
    expect(flete).toBe("+₡10.848");
    laCuentaCierra([gana, flete], pago, "lo que se le paga hoy frente a lo que gana");
  });
});

describe("395 — el desglose de lo que la empresa factura, y por qué hoy se paga otra cifra", () => {
  it("la línea puente más el flete por devolución a origen dan lo facturado", async () => {
    await abrirDetalle();
    const region = factura();

    const [puenteSumando] = importesTras(region, COBRADO_SOBRE_RECAUDADO_LABEL);
    const flete = importesTras(region, FLETE_DEV_CON_IVA_LABEL)[0];
    const facturado = importeTras(region, FACTURADO_EMPRESA_LABEL);

    expect(puenteSumando).toBe("₡60.098,67");
    laCuentaCierra([puenteSumando, flete], facturado, "lo que la empresa facturó");
  });

  it("lo recaudado menos la línea puente da el pago de hoy", async () => {
    await abrirDetalle();
    const region = factura();

    const recaudado = importeTras(region, TOTAL_GENERAL_LABEL);
    const puenteSustraendo = importesTras(region, COBRADO_SOBRE_RECAUDADO_LABEL)[1];
    const pago = importeTras(region, PAGO_TIENDA_LABEL);

    expect(puenteSustraendo).toBe("-₡60.098,67");
    expect(pago).toBe("₡225.176,33");
    laCuentaCierra([recaudado, puenteSustraendo], pago, "el pago a la tienda de hoy");
  });

  it("la línea puente sale IGUAL cuando el flete por devolución a origen es cero: no es condicional", async () => {
    await abrirDetalle(SIN_RECHAZO);
    const region = factura();

    // Las DOS apariciones siguen ahí. Sin ellas la cascada enseñaría «recaudado − facturado =
    // pago a tienda», que es la resta que no da en cuanto hay un rechazo.
    const puente = importesTras(region, COBRADO_SOBRE_RECAUDADO_LABEL);
    expect(puente).toEqual(["₡24.000,40", "-₡24.000,40"]);
    expect(within(region).getByText(COBRADO_SOBRE_RECAUDADO_NOTA)).toBeInTheDocument();

    laCuentaCierra(
      [puente[0], importesTras(region, FLETE_DEV_CON_IVA_LABEL)[0]],
      importeTras(region, FACTURADO_EMPRESA_LABEL),
      "sin rechazos, lo que la empresa facturó",
    );
    laCuentaCierra(
      [importeTras(region, TOTAL_GENERAL_LABEL), puente[1]],
      importeTras(region, PAGO_TIENDA_LABEL),
      "sin rechazos, el pago de hoy",
    );
  });

  it("sin rechazos, lo que gana y lo que se le paga coinciden, y siguen siendo dos líneas", async () => {
    await abrirDetalle(SIN_RECHAZO);

    expect(importeTras(particion(), GANA_LA_TIENDA_LABEL)).toBe("₡136.000");
    expect(importeTras(factura(), PAGO_TIENDA_LABEL)).toBe("₡136.000");
  });
});

describe("395 — lo que le queda a la empresa", () => {
  it("facturado − IVA − pago al mensajero − ingreso de bodega da el neto, y cierra", async () => {
    await abrirDetalle();
    const region = neto();

    const facturado = importeTras(region, FACTURADO_EMPRESA_LABEL);
    // SL-39: esta fixtura no lleva IVA, así que su línea resta cero y el neto no cambia.
    const iva = importeTras(region, IVA_FACTURADO_LABEL);
    const mensajero = importeTras(region, PAGO_MENSAJERO_LABEL);
    const bodega = importeTras(region, INGRESO_BODEGA_RECHAZOS_LABEL);
    const resultado = importeTras(region, NETO_EMPRESA_LABEL);

    expect(facturado).toBe("₡70.946,67");
    expect(iva).toBe("-₡0");
    expect(mensajero).toBe("-₡45.000,55");
    expect(bodega).toBe("-₡1.200,25");
    expect(resultado).toBe("₡24.745,87");
    laCuentaCierra([facturado, iva, mensajero, bodega], resultado, "el neto de la empresa");
  });
});

describe("SL-39 — el IVA facturado tiene su línea en «Lo que le queda a la empresa» (R24)", () => {
  it("la línea va JUSTO después de «Lo que la empresa facturó», resta y lleva su nota", async () => {
    await abrirDetalle(CIERRE_A);
    const region = neto();

    const filaIva = filaDe(region, IVA_FACTURADO_LABEL);
    // Justo después: la línea anterior a la del IVA es la de lo facturado, sin nada en medio.
    expect(
      filaIva.previousElementSibling,
      "«IVA facturado» no va justo después de «Lo que la empresa facturó»",
    ).toBe(filaDe(region, FACTURADO_EMPRESA_LABEL));
    // Y antes del pago al mensajero, también sin nada en medio.
    expect(filaIva.nextElementSibling).toBe(filaDe(region, PAGO_MENSAJERO_LABEL));

    expect(importeTras(region, IVA_FACTURADO_LABEL)).toBe("-₡416");
    // Las notas, A MANO (R24): compararlas con su constante estaría siempre verde.
    expect(
      within(filaIva).getByText(
        "El IVA que se le cobró a la tienda en este cierre. No es de la empresa.",
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        "Lo que la empresa facturó, sin el IVA, menos el pago al mensajero y menos el ingreso de bodega por devoluciones a origen.",
      ),
    ).toBeInTheDocument();
  });

  it("el cierre A cuadra con lo que se lee: 3.616 − 416 − 1.500 − 0 = 1.700 (design §12.4)", async () => {
    await abrirDetalle(CIERRE_A);
    const region = neto();

    const facturado = importeTras(region, FACTURADO_EMPRESA_LABEL);
    const iva = importeTras(region, IVA_FACTURADO_LABEL);
    const mensajero = importeTras(region, PAGO_MENSAJERO_LABEL);
    const bodega = importeTras(region, INGRESO_BODEGA_RECHAZOS_LABEL);
    const resultado = importeTras(region, NETO_EMPRESA_LABEL);

    expect([facturado, iva, mensajero, bodega, resultado]).toEqual([
      "₡3.616",
      "-₡416",
      "-₡1.500",
      "-₡0",
      "₡1.700",
    ]);
    laCuentaCierra([facturado, iva, mensajero, bodega], resultado, "el neto del cierre A");
  });

  it("R26: lo facturado, el pago a tienda y lo que gana la tienda no cambian, y el IVA no entra en esas cascadas", async () => {
    await abrirDetalle(CIERRE_A);

    // Lo que se le factura a la tienda SÍ lleva IVA: sigue siendo 3.616 en las dos cascadas.
    expect(importeTras(particion(), FACTURADO_EMPRESA_LABEL)).toBe("-₡3.616");
    expect(importeTras(factura(), FACTURADO_EMPRESA_LABEL)).toBe("₡3.616");
    expect(importeTras(particion(), GANA_LA_TIENDA_LABEL)).toBe("₡16.384");
    expect(importeTras(factura(), PAGO_TIENDA_LABEL)).toBe("₡16.384");
    expect(importesTras(factura(), COBRADO_SOBRE_RECAUDADO_LABEL)).toEqual([
      "₡3.616",
      "-₡3.616",
    ]);
    expect(within(particion()).queryByText(IVA_FACTURADO_LABEL)).toBeNull();
    expect(within(factura()).queryByText(IVA_FACTURADO_LABEL)).toBeNull();
  });

  it("R27: el cierre B sale en «Debe» −100 y su nota dice que el ingreso es sin IVA", async () => {
    await abrirDetalle(CIERRE_B);
    const dialog = screen.getByRole("dialog", { name: "Detalle del cierre" });
    const liquidacion = within(dialog).getByRole("region", { name: "Liquidación" });

    expect(within(liquidacion).getByText("Debe")).toBeInTheDocument();
    expect(within(liquidacion).getByText("-₡100")).toBeInTheDocument();
    expect(
      within(liquidacion).getByText("Ingreso sin IVA menos el pago al mensajero."),
    ).toBeInTheDocument();

    // Y la cascada del neto cuadra con el IVA del rechazo: 2.260 − 260 − 2.100 − 0 = −100.
    const region = neto();
    expect(importeTras(region, IVA_FACTURADO_LABEL)).toBe("-₡260");
    laCuentaCierra(
      [
        importeTras(region, FACTURADO_EMPRESA_LABEL),
        importeTras(region, IVA_FACTURADO_LABEL),
        importeTras(region, PAGO_MENSAJERO_LABEL),
        importeTras(region, INGRESO_BODEGA_RECHAZOS_LABEL),
      ],
      importeTras(region, NETO_EMPRESA_LABEL),
      "el neto del cierre B",
    );
  });

  it.each([
    ["IVA_FACTURADO_LABEL", IVA_FACTURADO_LABEL, "IVA facturado"],
    [
      "IVA_FACTURADO_NOTA",
      IVA_FACTURADO_NOTA,
      "El IVA que se le cobró a la tienda en este cierre. No es de la empresa.",
    ],
    [
      "NETO_EMPRESA_NOTA",
      NETO_EMPRESA_NOTA,
      "Lo que la empresa facturó, sin el IVA, menos el pago al mensajero y menos el ingreso de bodega por devoluciones a origen.",
    ],
    ["GANANCIA_NOTA", GANANCIA_NOTA, "Ingreso sin IVA menos el pago al mensajero."],
    [
      "GANANCIA_NOTA_BODEGA",
      GANANCIA_NOTA_BODEGA,
      "Ingreso sin IVA menos el pago a los mensajeros.",
    ],
  ])("%s dice exactamente lo aprobado (R24, R27)", (_nombre, constante, literal) => {
    expect(constante).toBe(literal);
  });
});

describe("395 — los negativos salen CON SU SIGNO, nunca recortados", () => {
  it("lo que gana la tienda sale negativo, con su signo y con su explicación", async () => {
    await abrirDetalle(NEGATIVOS);
    const region = particion();

    const gana = importeTras(region, GANA_LA_TIENDA_LABEL);
    expect(gana).toBe("-₡3.400,75");
    // Ni recortado a cero ni en valor absoluto: las dos formas de mentir sobre este número.
    expect(gana).not.toBe("₡0");
    expect(gana).not.toBe("₡3.400,75");
    laCuentaCierra(
      [importeTras(region, TOTAL_GENERAL_LABEL), importeTras(region, FACTURADO_EMPRESA_LABEL)],
      gana,
      "la partición con la tienda en negativo",
    );

    // Va explicado, no presentado como un fallo de la pantalla: ni alerta ni mensaje de error.
    expect(within(region).getByText(GANA_LA_TIENDA_NEGATIVO_NOTA)).toBeInTheDocument();
    expect(within(region).queryAllByRole("alert")).toEqual([]);
  });

  it("el neto de la empresa negativo sale con su signo, con su nota, y su cuenta cierra", async () => {
    await abrirDetalle(NEGATIVOS);
    const region = neto();

    const resultado = importeTras(region, NETO_EMPRESA_LABEL);
    expect(resultado).toBe("-₡2.499,75");
    laCuentaCierra(
      [
        importeTras(region, FACTURADO_EMPRESA_LABEL),
        importeTras(region, IVA_FACTURADO_LABEL),
        importeTras(region, PAGO_MENSAJERO_LABEL),
        importeTras(region, INGRESO_BODEGA_RECHAZOS_LABEL),
      ],
      resultado,
      "el neto de la empresa en negativo",
    );
    expect(within(region).getByText(NETO_EMPRESA_NEGATIVO_NOTA)).toBeInTheDocument();
  });

  it("el resultado negativo va en el tono de atención que ya usan los cierres de bodega", async () => {
    await abrirDetalle(NEGATIVOS);

    // Coherencia con el precedente de la 393 (`CascadaDinero`, R11/R36): el tono es del
    // RESULTADO, no de un sustraendo cualquiera.
    const fila = within(particion())
      .getAllByText(GANA_LA_TIENDA_LABEL)
      .filter((el) => el.children.length === 0)[0]
      .closest("div");
    expect(fila!.lastElementChild).toHaveClass("text-danger-strong");
  });
});

describe("395 — el tiempo verbal del cargo del flete por devolución a origen (la trampa)", () => {
  it("cierre VENCIDO: dice que TODAVÍA no se ha cargado, nunca que ya se cargó", async () => {
    // Éste es el cierre de la captura del humano. El cargo se escribe al APROBAR, así que aquí
    // «se le cargó» sería mentira.
    await abrirDetalle(CON_RECHAZO);
    const region = factura();

    expect(within(region).getByText(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA)).toBeInTheDocument();
    expect(within(region).queryByText(FLETE_RECHAZO_YA_COBRADO_NOTA)).toBeNull();
    expect(within(region).queryByText(FLETE_RECHAZO_NO_SE_COBRARA_NOTA)).toBeNull();
    // Y la nota de siempre —por qué ese flete no sale de lo recaudado— sigue estando.
    expect(within(region).getByText(FLETE_RECHAZO_NO_DEDUCIBLE_NOTA)).toBeInTheDocument();
  });

  it("cierre APROBADO con rechazos: dice que YA se cargó", async () => {
    await abrirDetalle(NEGATIVOS);
    const region = factura();

    expect(within(region).getByText(FLETE_RECHAZO_YA_COBRADO_NOTA)).toBeInTheDocument();
    expect(within(region).queryByText(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA)).toBeNull();
  });

  it("cierre RECHAZADO: dice que ese cargo no se hizo ni se va a hacer", async () => {
    await abrirDetalle({
      ...CON_RECHAZO,
      cierre: resumen({ estado: "rechazado", motivoRechazo: "Faltan evidencias" }),
      fleteRechazoYaCobradoATienda: false,
      partesPorTienda: [],
    });
    const region = factura();

    expect(within(region).getByText(FLETE_RECHAZO_NO_SE_COBRARA_NOTA)).toBeInTheDocument();
    expect(within(region).queryByText(FLETE_RECHAZO_YA_COBRADO_NOTA)).toBeNull();
    expect(within(region).queryByText(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA)).toBeNull();
  });

  it("cierre SOLICITADO con rechazos: todavía no, porque todavía no se aprueba", async () => {
    await abrirDetalle({
      ...CON_RECHAZO,
      cierre: resumen({ estado: "solicitado" }),
      fleteRechazoYaCobradoATienda: false,
      partesPorTienda: [],
    });

    expect(within(factura()).getByText(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA)).toBeInTheDocument();
  });

  it("sin flete por devolución a origen NO se escribe ninguna de las tres: no hay cargo del que hablar", async () => {
    await abrirDetalle(SIN_RECHAZO);
    const region = factura();

    for (const nota of [
      FLETE_RECHAZO_YA_COBRADO_NOTA,
      FLETE_RECHAZO_AUN_NO_COBRADO_NOTA,
      FLETE_RECHAZO_NO_SE_COBRARA_NOTA,
    ]) {
      expect(within(region).queryByText(nota), `sobra «${nota}» junto a un ₡0`).toBeNull();
    }
  });

  it("un cierre APROBADO sin un solo rechazo tampoco habla de ningún cargo", async () => {
    await abrirDetalle({
      ...SIN_RECHAZO,
      cierre: resumen({
        estado: "aprobado",
        totales: SIN_RECHAZO.cierre.totales,
        totalPagoMensajero: SIN_RECHAZO.cierre.totalPagoMensajero,
        totalIngresoBodegaRechazos: "0.00",
        resueltoAt: "2026-09-02T10:00:00.000Z",
        pendientePagoMensajero: "0.00",
      }),
      fleteRechazoYaCobradoATienda: false,
      partesPorTienda: [],
    });

    expect(within(factura()).queryByText(FLETE_RECHAZO_YA_COBRADO_NOTA)).toBeNull();
    expect(within(factura()).queryByText(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA)).toBeNull();
  });
});

describe("395 — los rótulos NO se confunden entre sí", () => {
  it.each([
    ["GANA_LA_TIENDA_LABEL", GANA_LA_TIENDA_LABEL, "Gana la tienda"],
    ["PAGO_TIENDA_LABEL", PAGO_TIENDA_LABEL, "Pago a tienda"],
    ["CASCADA_FACTURA_TIENDA_TITULO", CASCADA_FACTURA_TIENDA_TITULO, "Lo que la empresa le factura a la tienda"],
    ["CASCADA_NETO_EMPRESA_TITULO", CASCADA_NETO_EMPRESA_TITULO, "Lo que le queda a la empresa"],
  ])("%s dice exactamente lo aprobado", (_nombre, constante, literal) => {
    // A MANO, nunca derivado de la constante: comparar un rótulo con la función que lo genera
    // está siempre verde, y un renombrado silencioso de «Gana la tienda» a «Pago a tienda»
    // volvería a fundir las dos preguntas que esta ficha vino a separar.
    expect(constante).toBe(literal);
  });

  it("los tres estados del cargo dicen tres cosas distintas, y ninguna en el tiempo del otro", () => {
    const tres = [
      FLETE_RECHAZO_YA_COBRADO_NOTA,
      FLETE_RECHAZO_AUN_NO_COBRADO_NOTA,
      FLETE_RECHAZO_NO_SE_COBRARA_NOTA,
    ];
    expect(new Set(tres).size).toBe(3);
    expect(FLETE_RECHAZO_YA_COBRADO_NOTA).toBe(
      "Ya se le cargó al saldo de la tienda: ese cargo se hace al aprobar el cierre.",
    );
    expect(FLETE_RECHAZO_AUN_NO_COBRADO_NOTA).toBe(
      "Todavía no se le ha cargado al saldo de la tienda: ese cargo se hace al aprobar el cierre.",
    );
    expect(FLETE_RECHAZO_NO_SE_COBRARA_NOTA).toBe(
      "Este cierre se rechazó, así que ese cargo no se le hizo a la tienda ni se le va a hacer.",
    );
  });
});

describe("395 — money-safe: la pantalla no hace aritmética de dinero", () => {
  const FUENTES = [
    "app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx",
    "app/(app)/cierres-admin/_components/cierre-labels.ts",
  ] as const;

  it.each(FUENTES)("%s no convierte ni un importe a número", async (ruta) => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { quitarComentarios } = await import("@/tests/fixtures/sin-comentarios");
    const { LLAMADAS_PROHIBIDAS_EN_DINERO } = await import("@/tests/fixtures/money-safe");

    const codigo = quitarComentarios(
      readFileSync(path.resolve(__dirname, "../..", ruta), "utf8"),
    );
    expect(codigo.length, `${ruta} salió vacío: el censo no está leyendo nada`).toBeGreaterThan(
      500,
    );
    for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
      expect(codigo, `${ruta} usa ${prohibida.source} sobre un importe`).not.toMatch(prohibida);
    }
  });
});

/**
 * Un cierre `vencido` es el de la captura y por eso es el fixture por defecto — pero el botón que
 * lo abre no se llama igual que el de un `solicitado`. Este caso deja constancia de que el
 * detalle se abre por LAS DOS vías y que las cascadas salen igual en las dos: si un día el
 * `vencido` dejara de tener detalle, esto se pondría rojo aquí y no en producción.
 */
describe("395 — las cascadas salen igual se abra el detalle por donde se abra", () => {
  it("un cierre solicitado las trae, y un vencido también", async () => {
    await abrirDetalle({ ...CON_RECHAZO, cierre: resumen({ estado: "solicitado" }) });
    expect(particion()).toBeInTheDocument();
    cleanup();
    await abrirDetalle(CON_RECHAZO);
    expect(particion()).toBeInTheDocument();
  });
});
