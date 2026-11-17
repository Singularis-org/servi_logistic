// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (T4.1; R377-R381) — el libro del
// nivel «Resumen · una fila por cierre» cuando hay cierres del modelo nuevo: columnas y celdas de
// «Cierres» y «Por tienda», y el reparto en hojas (con «Cierres modelo anterior» en el mixto).
//
// TODOS los literales están escritos A MANO (contrato del archivo), nunca con `folioCierre`,
// `destinoCierre`, `fechaDiaInstanteCR` ni las funciones del módulo. Las cifras son las de N1 y N2 de
// `design.md > Verificación`.
import { describe, it, expect } from "vitest";

import {
  COLUMNAS_POR_TIENDA,
  columnasCierresModeloNuevoPara,
  filaCierreModeloNuevo,
  filaPorTienda,
} from "@/app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas";
import {
  libroResumenCierres,
  obtenerResumenCierres,
} from "@/app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga";
import { filaDescargaCierreHistorico } from "@/app/(app)/cierres-admin/_components/cierres-admin-descarga-columnas";
import type {
  CierreAdminResumen,
  CifrasCierreDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { DescargaColumna } from "@/lib/types/descarga";

// --- Dobles -----------------------------------------------------------------------------------

function cierre(over: Partial<CierreAdminResumen>): CierreAdminResumen {
  return {
    cierreId: "00000000-0000-4000-8000-0000abcd1234",
    mensajeroId: "11111111-1111-4111-8111-111111111111",
    mensajeroNombre: "Mario Mensajero",
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: "33333333-3333-4333-8333-333333333333",
    destinoZonaNombre: "Centro",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    incluyeModeloNuevo: true,
    pagoIndependienteEfectivo: true,
    pendientePagoMensajero: "1800.00",
    senalesCola: { incidentesSinIndemnizar: 0, pagosAjustados: 1, vuelvenABodega: 0 },
    // 18:00 UTC = 12:00 en CR; resuelto 03:30 UTC del 7 = 21:30 del 6 en CR (el día de CR, no el de UTC).
    solicitadoAt: "2026-11-06T18:00:00.000Z",
    resueltoAt: "2026-11-07T03:30:00.000Z",
    motivoRechazo: null,
    ...over,
  };
}

const N1 = cierre({});
const N2 = cierre({
  cierreId: "00000000-0000-4000-8000-0000beef0002",
  estado: "solicitado",
  resueltoAt: null,
  pendientePagoMensajero: null,
  senalesCola: undefined,
});
const V1 = cierre({
  cierreId: "00000000-0000-4000-8000-0000cafe0003",
  mensajeroNombre: "Rosa Mensajera",
  incluyeModeloNuevo: false,
  pagoIndependienteEfectivo: false,
  totales: { efectivo: "10000.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
});

const PARTES_N1 = [
  { tiendaNombre: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00" },
  { tiendaNombre: "Tienda Sur", recaudado: "0.00", pagoTienda: "-2260.00" },
];

const CIFRAS_N1: CifrasCierreDescargaDTO = {
  cierreId: N1.cierreId,
  // SLT-169 (R620): 100.000 − 7.910 de todo lo facturado.
  pagoTienda: "92090.00",
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  gestiones: 2,
  pagoEntregado: "1200.00",
  partesPorTienda: PARTES_N1,
};
const CIFRAS_N2: CifrasCierreDescargaDTO = { ...CIFRAS_N1, cierreId: N2.cierreId, pagoEntregado: null };

/** SLT-161 (R481): lo que el servidor le manda a la satélite, las cifras de la empresa en `null`. */
const SIN_EMPRESA = {
  pagoTienda: null,
  totalFacturado: null,
  ivaFacturado: null,
  netoEmpresa: null,
  pagoEntregado: null,
  partesPorTienda: null,
};
const CIFRAS_N1_SATELITE: CifrasCierreDescargaDTO = { ...CIFRAS_N1, ...SIN_EMPRESA };
const CIFRAS_N2_SATELITE: CifrasCierreDescargaDTO = { ...CIFRAS_N2, ...SIN_EMPRESA };

/**
 * Señuelos imposibles de encontrar por casualidad: si una celda de la satélite saliera con uno, la
 * proyección habría leído una cifra de la empresa.
 */
const SENUELOS_EMPRESA: CifrasCierreDescargaDTO = {
  ...CIFRAS_N1,
  pagoTienda: "731957.41",
  totalFacturado: "731957.43",
  ivaFacturado: "731957.44",
  netoEmpresa: "731957.45",
  pagoEntregado: "731957.46",
};

/** Lo que el usuario dejó MARCADO en el selector del «Resumen» de hoy: solo tres columnas. */
const MARCADAS: DescargaColumna[] = [
  { clave: "mensajero", encabezado: "Mensajero" },
  { clave: "general", encabezado: "Total general" },
  { clave: "motivo", encabezado: "Motivo" },
];

// SLT-169 (R628): 19 columnas; una sola de la tienda, «Se le paga a la tienda», sin «Gana la tienda en total».
const ENCABEZADOS_CIERRES_CENTRAL = [
  "Folio", "Mensajero", "Destino", "Estado", "Solicitado", "Resuelto", "Efectivo", "SINPE",
  "Transferencia", "Recaudado", "Se le paga a la tienda",
  "Pago al mensajero", "Pago a la bodega satélite", "Total facturado", "IVA facturado",
  "Le queda a la empresa", "Gestiones", "Pagos ajustados", "Pago entregado",
];

const FILA_N1_CENTRAL = {
  folio: "ABCD1234",
  mensajero: "Mario Mensajero",
  destino: "Bodega central · Centro",
  estado: "Aprobado",
  solicitado: "2026-11-06",
  resuelto: "2026-11-06",
  efectivo: "70000.00",
  sinpe: "30000.00",
  transferencia: "0.00",
  recaudado: "100000.00",
  // SLT-169 (R620): 100.000 − 7.910 de todo lo facturado.
  pagoTienda: "92090.00",
  pagoMensajero: "3000.00",
  pagoBodega: "500.00",
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  gestiones: 2,
  pagosAjustados: 1,
  pagoEntregado: "1200.00",
};

const FILAS_TIENDA_N1 = [
  { folio: "ABCD1234", tienda: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00" },
  { folio: "ABCD1234", tienda: "Tienda Sur", recaudado: "0.00", pagoTienda: "-2260.00" },
];

// --- Columnas ---------------------------------------------------------------------------------

describe("SLT-140 — columnas de «Cierres» y «Por tienda» (R379, R382)", () => {
  it("«Cierres»: 19 columnas para la central, en el orden de R379, sin «Gana la tienda en total» (SLT-169 R628)", () => {
    const encabezados = columnasCierresModeloNuevoPara("admin").map((c) => c.encabezado);
    expect(encabezados).toHaveLength(19);
    expect(encabezados).toEqual(ENCABEZADOS_CIERRES_CENTRAL);
    expect(encabezados).not.toContain("Gana la tienda en total");
  });

  it("R485: Cierres de la satélite, 14 columnas", () => {
    // 19 de la central − «Pago entregado» (R382) − «Se le paga a la tienda», «Total facturado»,
    // «IVA facturado», «Le queda a la empresa» (SLT-161) = 14, en el orden relativo de siempre, y
    // ninguna nueva (SLT-169 R634).
    const encabezados = columnasCierresModeloNuevoPara("satelite").map((c) => c.encabezado);
    expect(encabezados).toHaveLength(14);
    expect(encabezados).toEqual([
      "Folio", "Mensajero", "Destino", "Estado", "Solicitado", "Resuelto", "Efectivo", "SINPE",
      "Transferencia", "Recaudado", "Pago al mensajero", "Pago a la bodega satélite", "Gestiones",
      "Pagos ajustados",
    ]);
  });

  it("R487: la central, como antes: 19 columnas en «Cierres» y la hoja «Por tienda»", () => {
    const encabezados = columnasCierresModeloNuevoPara("admin").map((c) => c.encabezado);
    expect(encabezados).toHaveLength(19);
    expect(encabezados).toEqual(ENCABEZADOS_CIERRES_CENTRAL);
    const hojas = libroResumenCierres({
      items: [N1],
      cifras: [CIFRAS_N1],
      columnasAnterior: MARCADAS,
      filaAnterior: filaDescargaCierreHistorico,
      audiencia: "admin",
    });
    expect(hojas?.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda"]);
    expect(hojas?.[1].filas).toEqual(FILAS_TIENDA_N1);
  });

  it("los importes salen como número de Excel (`formato: \"monto\"`); el resto, como texto o entero (R380)", () => {
    const montos = columnasCierresModeloNuevoPara("admin")
      .filter((c) => c.formato === "monto")
      .map((c) => c.encabezado);
    expect(montos).toEqual([
      "Efectivo", "SINPE", "Transferencia", "Recaudado", "Se le paga a la tienda",
      "Pago al mensajero", "Pago a la bodega satélite", "Total facturado", "IVA facturado",
      "Le queda a la empresa", "Pago entregado",
    ]);
  });

  it("«Por tienda»: Folio · Tienda · Recaudado · Se le paga hoy, sin «Gana en total» (R379; SLT-169 R630)", () => {
    expect(COLUMNAS_POR_TIENDA).toEqual([
      { clave: "folio", encabezado: "Folio" },
      { clave: "tienda", encabezado: "Tienda" },
      { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
      { clave: "pagoTienda", encabezado: "Se le paga hoy", formato: "monto" },
    ]);
  });
});

// --- Celdas -----------------------------------------------------------------------------------

describe("SLT-140 — celdas de «Cierres» y «Por tienda» (R379-R382)", () => {
  it("N1 en la central: cada celda contra el literal; importes como el string del servidor", () => {
    expect(filaCierreModeloNuevo({ folio: "ABCD1234", item: N1, cifras: CIFRAS_N1 }, "admin")).toEqual(FILA_N1_CENTRAL);
  });

  it("R489: la fila de la satélite no lleva las claves quitadas", () => {
    // Aunque las cifras trajeran la empresa (señuelos), la fila de la satélite no lleva la clave: 14
    // claves, las de sus 14 columnas.
    const fila = filaCierreModeloNuevo({ folio: "ABCD1234", item: N1, cifras: SENUELOS_EMPRESA }, "satelite");
    expect(Object.keys(fila).sort()).toEqual(
      [
        "folio", "mensajero", "destino", "estado", "solicitado", "resuelto", "efectivo", "sinpe",
        "transferencia", "recaudado", "pagoMensajero", "pagoBodega", "gestiones", "pagosAjustados",
      ].sort(),
    );
    expect(JSON.stringify(fila)).not.toContain("731957");
    // Con lo que de verdad manda el servidor (R481), las celdas de la satélite, las de siempre.
    expect(filaCierreModeloNuevo({ folio: "ABCD1234", item: N1, cifras: CIFRAS_N1_SATELITE }, "satelite")).toEqual({
      folio: "ABCD1234",
      mensajero: "Mario Mensajero",
      destino: "Bodega central · Centro",
      estado: "Aprobado",
      solicitado: "2026-11-06",
      resuelto: "2026-11-06",
      efectivo: "70000.00",
      sinpe: "30000.00",
      transferencia: "0.00",
      recaudado: "100000.00",
      pagoMensajero: "3000.00",
      pagoBodega: "500.00",
      gestiones: 2,
      pagosAjustados: 1,
    });
  });

  it("N2 (solicitado): Resuelto, Pagos ajustados y Pago entregado vacíos (R379, R382)", () => {
    const fila = filaCierreModeloNuevo({ folio: "BEEF0002", item: N2, cifras: CIFRAS_N2 }, "admin");
    expect(fila.estado).toBe("Solicitado");
    expect(fila.resuelto).toBeNull();
    expect(fila.pagosAjustados).toBeNull();
    expect(fila.pagoEntregado).toBeNull();
  });

  it("cada importe es el string del servidor TAL CUAL, aunque no cuadre con los demás (R380: nada se calcula aquí)", () => {
    // Cifras que ninguna resta del navegador reproduce: si una celda se calculara aquí con los totales
    // del item (como en N1, donde todo cuadra), saldría otro número.
    const senuelo: CifrasCierreDescargaDTO = {
      ...CIFRAS_N1,
      pagoTienda: "11.01",
      totalFacturado: "33.03",
      ivaFacturado: "44.04",
      netoEmpresa: "55.05",
      pagoEntregado: "66.06",
    };
    const fila = filaCierreModeloNuevo({ folio: "ABCD1234", item: N1, cifras: senuelo }, "admin");
    expect([fila.pagoTienda, fila.totalFacturado, fila.ivaFacturado, fila.netoEmpresa, fila.pagoEntregado]).toEqual([
      "11.01", "33.03", "44.04", "55.05", "66.06",
    ]);
    // SLT-169 (R628): el alias del DTO no viaja a la hoja.
    expect(Object.keys(fila)).not.toContain("ganaLaTienda");
  });

  it("«Por tienda»: la tienda que pierde sale con su signo, nunca recortada a 0 (R380; SLT-169 R630)", () => {
    expect(filaPorTienda({ folio: "ABCD1234", parte: PARTES_N1[1] })).toEqual({
      folio: "ABCD1234",
      tienda: "Tienda Sur",
      recaudado: "0.00",
      pagoTienda: "-2260.00",
    });
  });
});

// --- Libro ------------------------------------------------------------------------------------

describe("SLT-140 — `libroResumenCierres` (R377, R378, R381)", () => {
  const base = { columnasAnterior: MARCADAS, filaAnterior: filaDescargaCierreHistorico, audiencia: "admin" as const };

  it("sin `cifras` del servidor: `null` (el archivo de hoy)", () => {
    expect(libroResumenCierres({ ...base, items: [N1, V1], cifras: undefined })).toBeNull();
  });

  it("solo cierres viejos: `null` (R377)", () => {
    expect(libroResumenCierres({ ...base, items: [V1], cifras: [] })).toBeNull();
  });

  it("solo nuevos: «Cierres» + «Por tienda», una fila por tienda en el orden del detalle (R378, R381)", () => {
    const hojas = libroResumenCierres({ ...base, items: [N1], cifras: [CIFRAS_N1] });
    expect(hojas?.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda"]);
    expect(hojas?.[0].filas).toEqual([FILA_N1_CENTRAL]);
    expect(hojas?.[1].filas).toEqual(FILAS_TIENDA_N1);
    expect(hojas?.[1].columnas).toBe(COLUMNAS_POR_TIENDA);
  });

  it("mixto: tercera hoja «Cierres modelo anterior» con las columnas MARCADAS y la fila de hoy (R378)", () => {
    const hojas = libroResumenCierres({ ...base, items: [V1, N1, N2], cifras: [CIFRAS_N1, CIFRAS_N2] });
    expect(hojas?.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda", "Cierres modelo anterior"]);
    // «Cierres» no depende de las marcadas: las 19 de siempre (SLT-169).
    expect(hojas?.[0].columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_CENTRAL);
    // Orden del listado entre los nuevos; ningún cierre en dos hojas.
    expect(hojas?.[0].filas.map((f) => f.folio)).toEqual(["ABCD1234", "BEEF0002"]);
    expect(hojas?.[1].filas.map((f) => f.folio)).toEqual(["ABCD1234", "ABCD1234", "BEEF0002", "BEEF0002"]);
    expect(hojas?.[2].columnas).toEqual(MARCADAS);
    expect(hojas?.[2].filas).toEqual([
      {
        estado: "Aprobado",
        mensajero: "Rosa Mensajera",
        fechaResuelta: "2026-11-06",
        destino: "Bodega central · Centro",
        general: "10000.00",
        pagoMensajero: "1500.00",
        ingresoBodega: "0.00",
        motivo: null,
      },
    ]);
  });

  it("R486: el libro de la satélite sin Por tienda (solo nuevo y mixto)", () => {
    const sat = { ...base, audiencia: "satelite" as const };
    const soloNuevo = libroResumenCierres({ ...sat, items: [N1], cifras: [CIFRAS_N1_SATELITE] });
    expect(soloNuevo?.map((h) => h.titulo)).toEqual(["Cierres"]);
    const mixto = libroResumenCierres({
      ...sat,
      items: [V1, N1, N2],
      cifras: [CIFRAS_N1_SATELITE, CIFRAS_N2_SATELITE],
    });
    expect(mixto?.map((h) => h.titulo)).toEqual(["Cierres", "Cierres modelo anterior"]);
    expect(mixto?.[0].filas.map((f) => f.folio)).toEqual(["ABCD1234", "BEEF0002"]);
    // Aunque el reparto llegara, la satélite no gana hoja (R489).
    const conReparto = libroResumenCierres({ ...sat, items: [N1], cifras: [CIFRAS_N1] });
    expect(conReparto?.map((h) => h.titulo)).toEqual(["Cierres"]);
  });

  it("la central sin el reparto por tienda de un cierre nuevo es un error, no una hoja vacía", () => {
    expect(() => libroResumenCierres({ ...base, items: [N1], cifras: [CIFRAS_N1_SATELITE] })).toThrow(
      "faltan las partes por tienda de un cierre del modelo nuevo",
    );
  });

  it("un cierre nuevo sin sus cifras es un error, no se degrada a viejo", () => {
    expect(() => libroResumenCierres({ ...base, items: [N1, N2], cifras: [CIFRAS_N1] })).toThrow(
      "faltan las cifras de un cierre del modelo nuevo",
    );
  });
});

// --- Una sola llamada ---------------------------------------------------------------------------

describe("SLT-140 — `obtenerResumenCierres` (R377, R378)", () => {
  it("solo viejos: EXACTAMENTE el resultado de hoy (sin libro)", async () => {
    const accion = async () => ({ status: "ok" as const, items: [V1], total: 1 });
    const r = await obtenerResumenCierres(accion, filaDescargaCierreHistorico, MARCADAS, "admin");
    expect(r).toEqual({ status: "ok", filas: [filaDescargaCierreHistorico(V1)] });
  });

  it("con nuevos: el libro, y `filas` = las de «Cierres»", async () => {
    const accion = async () => ({
      status: "ok" as const,
      items: [V1, N1],
      total: 2,
      cifrasModeloNuevo: [CIFRAS_N1_SATELITE],
    });
    const r = await obtenerResumenCierres(accion, filaDescargaCierreHistorico, MARCADAS, "satelite");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("se esperaba ok");
    // SLT-161 (R486): la satélite, sin «Por tienda».
    expect(r.libro?.hojas.map((h) => h.titulo)).toEqual(["Cierres", "Cierres modelo anterior"]);
    expect(r.filas).toEqual(r.libro?.hojas[0].filas);
    expect(r.filas[0]).not.toHaveProperty("pagoEntregado");
  });

  it("tope excedido: el mensaje de hoy, sin libro", async () => {
    const accion = async () => ({ status: "limite_excedido" as const, total: 9, limite: 3 });
    const r = await obtenerResumenCierres(accion, filaDescargaCierreHistorico, MARCADAS, "admin");
    expect(r.status).toBe("error");
  });
});
