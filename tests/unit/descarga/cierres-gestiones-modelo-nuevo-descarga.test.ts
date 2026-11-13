// SLT-113 «Excel del modelo nuevo de cierres» (T4.2; R370-R375) — el libro del nivel «Detalle · una
// fila por gestión» cuando hay cierres del modelo nuevo: columnas y celdas de «Gestiones», «Rechazados
// por la tienda» y «Gestiones modelo anterior».
//
// TODOS los literales están escritos A MANO (contrato del archivo): nunca con `textoSenales`, `money`,
// `origenDe` ni las funciones del módulo. Las cifras son las de `design.md > Verificación` (A y B de N1).
import { describe, it, expect } from "vitest";

import {
  columnasGestionesModeloNuevoPara,
  filaGestionModeloNuevo,
} from "@/app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas";
import { libroGestiones } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type {
  CierreGestionDescargaDTO,
  RechazoTiendaDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { DescargaColumna } from "@/lib/types/descarga";

// --- Dobles -----------------------------------------------------------------------------------

function ingreso(over: Partial<IngresoEmpresaDTO>): IngresoEmpresaDTO {
  return {
    tarifaModelo: "nuevo",
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    total: "0.00",
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    ...over,
  };
}

function gestion(over: Partial<CierreGestionDescargaDTO>): CierreGestionDescargaDTO {
  return {
    mensajeroNombre: "Mario Mensajero",
    cierreSolicitadoAt: "2026-11-06T18:00:00.000Z",
    fechaGestion: "2026-11-06",
    diaReparto: "2026-11-05",
    fechaCreacionOrden: "2026-11-04",
    numGuia: 501,
    numRemision: "REM-A",
    destinatario: "Laura Díaz",
    direccion: "Calle 3",
    zonaNombre: "Centro",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda Sol",
    intentosContactoTienda: 0,
    intentosEntrega: 1,
    resultado: "entregado",
    montoRecibido: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    esRechazoSla: false,
    causaIncidente: null,
    indemnizacion: null,
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    ingresoEmpresa: null,
    ...over,
  };
}

/** A: entrega del cierre nuevo N1 (folio ABCD1234), con ajuste del pago de 2.500 a 1.800. */
const A = gestion({
  folioCierre: "ABCD1234",
  cierreModelo: "nuevo",
  numGuia: 501,
  montoRecibido: "25000.00",
  pagos: [{ metodo: "efectivo", monto: "25000.00" }],
  pagoMensajero: "1800.00",
  ingresoEmpresa: ingreso({
    montoCobrar: "25000.00",
    cobraComision: true,
    flete: "3500.00",
    ivaFlete: "455.00",
    comisionCod: "500.00",
    ivaComisionCod: "65.00",
    total: "4520.00",
    ivaIncluido: "520.00",
    fulfillment: "600.00",
    ivaFulfillment: "78.00",
    conceptosTarifa: [
      { concepto: "flete", modo: "monto", valor: "3500.00", ivaPct: "13.00", base: null, nivel: "grupo", zonaNombre: "Centro", grupoNombre: "San José centro", vehiculoNombre: null },
      { concepto: "comisionCod", modo: "porcentaje", valor: "2.00", ivaPct: "13.00", base: "25000.00", nivel: "zona", zonaNombre: "Centro", grupoNombre: null, vehiculoNombre: null },
    ],
  }),
  pagoPorTarifa: {
    importe: "2500.00",
    modo: "monto",
    valor: "2500.00",
    base: null,
    nivel: "zona",
    zonaNombre: "Centro",
    grupoNombre: null,
    vehiculoNombre: null,
    ajuste: { signo: "resta", monto: "700.00" },
  },
  ajustesPago: [
    { creadoAt: "2026-11-06T20:00:00.000Z", actorNombre: "Ana Pérez", actorRol: "admin", pagoAnterior: "2500.00", pagoNuevo: "1800.00", motivo: "Ruta corta" },
  ],
  tarifaFaltante: false,
  fulfillmentCargadoDia: "2026-11-06",
});

/** B: novedad del mismo cierre, sin pago congelado del mensajero (`tarifaFaltante`). */
const B = gestion({
  folioCierre: "ABCD1234",
  cierreModelo: "nuevo",
  numGuia: 502,
  numRemision: "REM-B",
  destinatario: "Pedro Mora",
  resultado: "novedad",
  motivo: "Cliente ausente",
  ingresoEmpresa: ingreso({
    fleteDevolucion: "1500.00",
    ivaFleteDevolucion: "195.00",
    total: "1695.00",
    ivaIncluido: "195.00",
    fulfillment: "0.00",
    ivaFulfillment: "0.00",
    conceptosTarifa: [
      { concepto: "fleteDevolucion", modo: "monto", valor: "1500.00", ivaPct: "13.00", base: null, nivel: "tienda_general", zonaNombre: null, grupoNombre: null, vehiculoNombre: null },
    ],
  }),
  pagoPorTarifa: null,
  ajustesPago: [],
  tarifaFaltante: true,
  fulfillmentCargadoDia: null,
});

/** C: entrega de un cierre VIEJO (folio EF567890). */
const C = gestion({
  folioCierre: "EF567890",
  cierreModelo: "viejo",
  mensajeroNombre: "Rosa Mensajera",
  numGuia: 503,
  numRemision: "REM-C",
  destinatario: "Carla Soto",
  montoRecibido: "10000.00",
  pagos: [{ metodo: "SINPE", monto: "10000.00" }],
  pagoMensajero: "1500.00",
  ingresoEmpresa: ingreso({
    tarifaModelo: "viejo",
    montoCobrar: "10000.00",
    cobraComision: true,
    flete: "2000.00",
    ivaFlete: "260.00",
    comisionCod: "300.00",
    ivaComisionCod: "39.00",
    fleteConIva: "2260.00",
    comisionConIva: "339.00",
    total: "2599.00",
    fulfillment: "0.00",
    ivaFulfillment: "0.00",
  }),
  pagoPorTarifa: null,
  ajustesPago: [],
  tarifaFaltante: false,
  fulfillmentCargadoDia: null,
});

/** D: otra gestión del mismo cierre viejo de C. */
const D = gestion({ ...C, numGuia: 504, numRemision: "REM-D", resultado: "novedad", montoRecibido: null, pagos: [] });

const R1: RechazoTiendaDescargaDTO = {
  folioCierre: "ABCD1234",
  numGuia: 777,
  destinatario: "Luis Vega",
  motivo: "No lo pidió",
  tiendaNombre: "Tienda Sol",
  fechaRechazo: "2026-11-05",
};

const COLUMNAS_ANTERIOR: DescargaColumna[] = [
  { clave: "mensajero", encabezado: "Mensajero" },
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "ingresoTotal", encabezado: "Total de la empresa" },
];

// --- Encabezados -------------------------------------------------------------------------------

const ENCABEZADOS_CENTRAL = [
  "Folio del cierre",
  "Mensajero",
  "Fecha de gestión",
  "Nº Guía",
  "Nº Remisión",
  "Destinatario",
  "Tienda",
  "Resultado",
  "Motivo",
  "Recibido",
  "Efectivo",
  "SINPE",
  "Transferencia",
  "Flete por entregado",
  "Tarifa del flete",
  "IVA del flete",
  "Comisión COD",
  "Tarifa de la comisión",
  "IVA de la comisión",
  "Flete de gestiones no entregadas",
  "Tarifa del flete de gestiones no entregadas",
  "IVA del flete de gestiones no entregadas",
  "Se le cobra a la tienda",
  "De eso, IVA",
  "Pago por tarifa",
  "Tarifa del pago",
  "Ajuste",
  "Pago al mensajero",
  "Motivo del ajuste",
  "Ajustó",
  "Gana la bodega satélite",
  "Fulfillment",
  "IVA de fulfillment",
  "Fulfillment cargado el",
  "Señales",
];

describe("SLT-113 — encabezados (R373)", () => {
  it("«Gestiones» de la central: 35 columnas en orden", () => {
    const columnas = columnasGestionesModeloNuevoPara("admin");
    expect(columnas).toHaveLength(35);
    expect(columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CENTRAL);
  });

  it("«Gestiones» de la satélite: 32, sin «Fulfillment», «IVA de fulfillment» ni «Fulfillment cargado el» (R376)", () => {
    const columnas = columnasGestionesModeloNuevoPara("satelite");
    expect(columnas).toHaveLength(32);
    expect(columnas.map((c) => c.encabezado)).toEqual([
      "Folio del cierre", "Mensajero", "Fecha de gestión", "Nº Guía", "Nº Remisión", "Destinatario",
      "Tienda", "Resultado", "Motivo", "Recibido", "Efectivo", "SINPE", "Transferencia",
      "Flete por entregado", "Tarifa del flete", "IVA del flete", "Comisión COD", "Tarifa de la comisión",
      "IVA de la comisión", "Flete de gestiones no entregadas", "Tarifa del flete de gestiones no entregadas",
      "IVA del flete de gestiones no entregadas", "Se le cobra a la tienda", "De eso, IVA", "Pago por tarifa",
      "Tarifa del pago", "Ajuste", "Pago al mensajero", "Motivo del ajuste", "Ajustó",
      "Gana la bodega satélite", "Señales",
    ]);
  });

  it("las columnas de importe llevan formato «monto» y las de texto no (R374)", () => {
    const conMonto = columnasGestionesModeloNuevoPara("admin")
      .filter((c) => c.formato === "monto")
      .map((c) => c.encabezado);
    expect(conMonto).toEqual([
      "Recibido", "Efectivo", "SINPE", "Transferencia", "Flete por entregado", "IVA del flete",
      "Comisión COD", "IVA de la comisión", "Flete de gestiones no entregadas", "IVA del flete de gestiones no entregadas",
      "Se le cobra a la tienda", "De eso, IVA", "Pago por tarifa", "Ajuste", "Pago al mensajero",
      "Gana la bodega satélite", "Fulfillment", "IVA de fulfillment",
    ]);
  });

  it("«Rechazados por la tienda»: Folio · Nº Guía · Destinatario · Motivo · Tienda · Fecha del rechazo", () => {
    const hojas = libroGestiones({ items: [A], rechazos: [], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.[1].columnas.map((c) => c.encabezado)).toEqual([
      "Folio", "Nº Guía", "Destinatario", "Motivo", "Tienda", "Fecha del rechazo",
    ]);
  });
});

/** Fila de «Gestiones» → array en el orden de las columnas (lo que se ve en el archivo). */
function celdas(dto: CierreGestionDescargaDTO, audiencia: "admin" | "satelite") {
  const fila = filaGestionModeloNuevo(dto, audiencia);
  return columnasGestionesModeloNuevoPara(audiencia).map((c) => fila[c.clave] ?? null);
}

describe("SLT-113 — celdas de «Gestiones» (R374, R375)", () => {
  it("A, central: cada celda contra su literal; «Ajuste» negativo; tarifa con su origen", () => {
    expect(celdas(A, "admin")).toEqual([
      "ABCD1234", // Folio del cierre
      "Mario Mensajero",
      "2026-11-06",
      501,
      "REM-A",
      "Laura Díaz",
      "Tienda Sol",
      "Entregado",
      null, // Motivo
      "25000.00", // Recibido
      "25000.00", // Efectivo
      null, // SINPE
      null, // Transferencia
      "3500.00", // Flete por entregado
      "Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro",
      "455.00",
      "500.00", // Comisión COD
      "2 % de ₡25.000 · valor base de la zona Centro",
      "65.00",
      null, // Flete de no entregadas
      null,
      null,
      "4520.00", // Se le cobra a la tienda
      "520.00", // De eso, IVA
      "2500.00", // Pago por tarifa
      "Monto fijo ₡2.500 · valor base de la zona Centro",
      "-700.00", // Ajuste
      "1800.00", // Pago al mensajero
      "Ruta corta",
      "Ana Pérez",
      null, // Gana la bodega satélite
      "600.00", // Fulfillment
      "78.00",
      "2026-11-06", // Fulfillment cargado el
      "Pago ajustado",
    ]);
  });

  it("B, central: vacías las que no aplican (nunca «0.00» inventado); señales «Vuelve a bodega · Sin tarifa de pago»", () => {
    expect(celdas(B, "admin")).toEqual([
      "ABCD1234",
      "Mario Mensajero",
      "2026-11-06",
      502,
      "REM-B",
      "Pedro Mora",
      "Tienda Sol",
      "Novedad",
      "Cliente ausente",
      null, // Recibido
      null,
      null,
      null,
      null, // Flete por entregado
      null,
      null,
      null, // Comisión COD
      null,
      null,
      "1500.00", // Flete de no entregadas
      "Monto fijo ₡1.500 · precio propio de la tienda",
      "195.00",
      "1695.00",
      "195.00",
      null, // Pago por tarifa
      null, // Tarifa del pago
      null, // Ajuste
      null, // Pago al mensajero
      null,
      null,
      null,
      "0.00", // Fulfillment: el «0.00» es del SERVIDOR, no inventado
      "0.00",
      null, // Fulfillment cargado el
      "Vuelve a bodega · Sin tarifa de pago",
    ]);
  });

  it("B, satélite: 32 celdas, las mismas sin las tres de fulfillment", () => {
    const fila = celdas(B, "satelite");
    expect(fila).toHaveLength(32);
    expect(fila.slice(-2)).toEqual([null, "Vuelve a bodega · Sin tarifa de pago"]);
    expect(Object.keys(filaGestionModeloNuevo(B, "satelite"))).not.toContain("fulfillment");
  });

  it("ningún importe se recalcula: cada celda es el string del servidor aunque no cuadre con los conceptos", () => {
    const trampa = gestion({
      ...A,
      ingresoEmpresa: ingreso({ ...A.ingresoEmpresa!, total: "9999.99", ivaIncluido: "1.01" }),
      pagoMensajero: "1234.56",
    });
    const fila = filaGestionModeloNuevo(trampa, "admin");
    expect([fila.cobroTienda, fila.ivaIncluido, fila.pagoMensajero, fila.ajuste]).toEqual([
      "9999.99", "1.01", "1234.56", "-700.00",
    ]);
  });
});

describe("SLT-113 — libroGestiones (R370, R371, R372)", () => {
  it("todo viejo → null (el archivo de hoy)", () => {
    expect(libroGestiones({ items: [C, D], rechazos: [R1], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" })).toBeNull();
  });

  it("sin cierreModelo (doble de hoy) → null", () => {
    const sinModelo = gestion({ numGuia: 900 });
    expect(libroGestiones({ items: [sinModelo], rechazos: undefined, columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" })).toBeNull();
  });

  it("solo nuevo → dos hojas: «Gestiones» y «Rechazados por la tienda» con R1", () => {
    const hojas = libroGestiones({ items: [A, B], rechazos: [R1], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.map((h) => h.titulo)).toEqual(["Gestiones", "Rechazados por la tienda"]);
    expect(hojas?.[0].filas.map((f) => f.numGuia)).toEqual([501, 502]);
    expect(hojas?.[1].filas).toEqual([
      { folio: "ABCD1234", numGuia: 777, destinatario: "Luis Vega", motivo: "No lo pidió", tienda: "Tienda Sol", fechaRechazo: "2026-11-05" },
    ]);
  });

  it("sin rechazos → «Rechazados por la tienda» con solo encabezados", () => {
    const hojas = libroGestiones({ items: [A], rechazos: undefined, columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.[1].titulo).toBe("Rechazados por la tienda");
    expect(hojas?.[1].filas).toEqual([]);
  });

  it("mixto → tres hojas en orden; ninguna gestión repetida; todas las de un cierre en la misma hoja", () => {
    const hojas = libroGestiones({ items: [A, C, B, D], rechazos: [R1], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.map((h) => h.titulo)).toEqual(["Gestiones", "Rechazados por la tienda", "Gestiones modelo anterior"]);
    expect(hojas?.[0].filas.map((f) => [f.folio, f.numGuia])).toEqual([["ABCD1234", 501], ["ABCD1234", 502]]);
    expect(hojas?.[2].filas.map((f) => f.numGuia)).toEqual([503, 504]);
  });

  it("el modelo es del CIERRE (R371): una gestión con fila congelada vieja dentro de un cierre nuevo va a «Gestiones»", () => {
    const filaViejaEnCierreNuevo = gestion({
      ...A,
      numGuia: 505,
      ingresoEmpresa: ingreso({ ...A.ingresoEmpresa!, tarifaModelo: "viejo" }),
    });
    const hojas = libroGestiones({ items: [A, filaViejaEnCierreNuevo, C], rechazos: [], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.[0].filas.map((f) => [f.folio, f.numGuia])).toEqual([["ABCD1234", 501], ["ABCD1234", 505]]);
    expect(hojas?.[2].filas.map((f) => f.numGuia)).toEqual([503]);
  });

  it("«Gestiones modelo anterior» = la hoja fundida de hoy con las columnas recibidas (fila literal)", () => {
    const hojas = libroGestiones({ items: [A, C], rechazos: [], columnasAnterior: COLUMNAS_ANTERIOR, audiencia: "admin" });
    expect(hojas?.[2].columnas).toEqual([
      { clave: "mensajero", encabezado: "Mensajero" },
      { clave: "numGuia", encabezado: "Nº Guía" },
      { clave: "ingresoTotal", encabezado: "Total de la empresa" },
    ]);
    expect(hojas?.[2].filas).toEqual([
      {
        mensajero: "Rosa Mensajera",
        fechaCierre: "2026-11-06",
        fechaGestion: "2026-11-06",
        diaReparto: "2026-11-05",
        fechaCreacionOrden: "2026-11-04",
        numGuia: 503,
        numRemision: "REM-C",
        destinatario: "Carla Soto",
        direccion: "Calle 3",
        ubicacion: "Centro · San José · Central · Carmen",
        producto: "Caja",
        tienda: "Tienda Sol",
        intentosEntrega: 1,
        resultado: "Entregado",
        montoCobrar: "10000.00",
        fulfillment: null,
        recibido: "10000.00",
        pago_efectivo: null,
        pago_SINPE: "10000.00",
        pago_transferencia: null,
        nuevaFecha: null,
        origenRechazo: null,
        causa: null,
        motivo: null,
        fleteConIva: "2260.00",
        comisionConIva: "339.00",
        fleteDevolucionConIva: null,
        ingresoTotal: "2599.00",
        pagoMensajero: "1500.00",
        ingresoBodega: null,
        indemnizacion: null,
      },
    ]);
  });
});
