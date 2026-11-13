// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T4.1; R384-R388) — el libro del
// «Resumen» de los cierres de bodega cuando hay cierres del modelo nuevo: columnas y celdas de
// «Cierres» y «Por tienda», y el reparto en hojas (con «Cierres modelo anterior» en el mixto).
//
// TODOS los literales están escritos A MANO (contrato del archivo), nunca con `folioCierre`,
// `fechaDiaInstanteCR`, las etiquetas de `cierre-labels` ni las funciones del módulo. Las cifras de BN
// son las de `design.md > Verificación` (comprobadas a mano en T0.2).
import { describe, it, expect } from "vitest";

import {
  COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO,
  columnasCierresBodegaModeloNuevoPara,
  type CifrasCierreBodegaDescarga,
} from "@/app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas";
import {
  libroCierresBodega,
  obtenerResumenCierresBodega,
} from "@/app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga";
import {
  COLUMNAS_DESCARGA_BODEGA_RESUELTOS,
  filaDescargaBodegaResuelto,
  filaDescargaBodegaSolicitado,
} from "@/app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import { celdaMonto } from "@/lib/utils/xlsx-monto";

// --- Dobles -----------------------------------------------------------------------------------

function bodega(over: Partial<CierreBodegaResumen>): CierreBodegaResumen {
  return {
    cierreBodegaId: "00000000-0000-4000-8000-0000b0de9a01",
    zonaId: "33333333-3333-4333-8333-333333333333",
    zonaNombre: "Centro",
    solicitadoPorId: "44444444-4444-4444-8444-444444444444",
    solicitadoPorNombre: "Sara Satélite",
    estado: "aprobado",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    cantidadCierres: 1,
    // 03:00 UTC del 07 = 21:00 del 06 en Costa Rica: el día del archivo es el 06, no el del ISO.
    solicitadoAt: "2026-11-07T03:00:00.000Z",
    resueltoAt: "2026-11-07T02:30:00.000Z",
    motivoRechazo: null,
    paraLaCentral: "96500.00",
    efectivoCubreDescuentos: true,
    conciliado: true,
    desmarcable: false,
    montoRecibido: "96000.00",
    faltaPorRecibir: "500.00",
    conciliadoAt: "2026-11-07T02:30:00.000Z",
    conciliadoPorNombre: "Ana Pérez",
    conciliadoNota: null,
    incluyeModeloNuevo: true,
    ...over,
  };
}

/** BN: nuevo, conciliado con faltante (los literales del design). */
const BN = bodega({});
/** BX: nuevo, sin conciliar, con importes negativos (llegó de más y la tienda pierde). */
const BX = bodega({
  cierreBodegaId: "00000000-0000-4000-8000-00000000fe17",
  zonaNombre: "Oeste",
  estado: "solicitado",
  resueltoAt: null,
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "1000.00",
  totalIngresoBodegaRechazos: "250.00",
  cantidadCierres: 2,
  paraLaCentral: "-1250.00",
  faltaPorRecibir: "-1250.00",
  conciliado: false,
  montoRecibido: null,
  conciliadoAt: null,
  conciliadoPorNombre: null,
});
/** Viejos, cada uno con su zona para reconocerlos en cualquier hoja. */
const BV = bodega({
  cierreBodegaId: "00000000-0000-4000-8000-0000000c1a51",
  zonaNombre: "Norte",
  incluyeModeloNuevo: false,
  totales: { efectivo: "10000.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  paraLaCentral: "8500.00",
  montoRecibido: "8500.00",
  faltaPorRecibir: "0.00",
});
/** Viejo sin el campo (ausente se lee como viejo, D40). */
const BV2 = bodega({
  ...BV,
  cierreBodegaId: "00000000-0000-4000-8000-0000000c1a52",
  zonaNombre: "Sur",
  incluyeModeloNuevo: undefined,
});

const CIFRAS_BN: CifrasCierreBodegaDescarga = {
  cierreBodegaId: BN.cierreBodegaId,
  gestiones: 3,
  pagosAjustados: 1,
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  ganaLaTienda: "92090.00",
  pagoEntregado: "3000.00",
  partesPorTienda: [
    { tiendaId: "t1", tiendaNombre: "Tienda Uno", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
    { tiendaId: "t2", tiendaNombre: "Tienda Dos", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
  ],
};
const CIFRAS_BX: CifrasCierreBodegaDescarga = {
  cierreBodegaId: BX.cierreBodegaId,
  gestiones: 1,
  pagosAjustados: 0,
  totalFacturado: "2260.00",
  ivaFacturado: "260.00",
  netoEmpresa: "-1250.00",
  ganaLaTienda: "-2260.00",
  pagoEntregado: null,
  partesPorTienda: [
    { tiendaId: "t3", tiendaNombre: "Tienda Tres", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
  ],
};

const ENCABEZADOS_CIERRES_CENTRAL = [
  "Folio", "Bodega", "Destino", "Estado", "Solicitado", "Resuelto", "Efectivo", "SINPE",
  "Transferencia", "Recaudado", "Debe llegar a la central", "Gana la tienda en total",
  "Pago al mensajero", "Pago a la bodega satélite", "Total facturado", "IVA facturado",
  "Le queda a la empresa", "Gestiones", "Pagos ajustados", "Pago entregado", "Cierres incluidos",
  "Recibido", "Falta por recibir", "Estado de conciliación", "Conciliado por", "Conciliado el",
];
const ENCABEZADOS_CIERRES_SATELITE = [
  "Folio", "Bodega", "Destino", "Estado", "Solicitado", "Resuelto", "Efectivo", "SINPE",
  "Transferencia", "Recaudado", "Debe llegar a la central", "Gana la tienda en total",
  "Pago al mensajero", "Pago a la bodega satélite", "Total facturado", "IVA facturado",
  "Le queda a la empresa", "Gestiones", "Pagos ajustados", "Cierres incluidos",
  "Recibido", "Falta por recibir", "Estado de conciliación", "Conciliado por", "Conciliado el",
];

function libro(items: CierreBodegaResumen[], cifras: CifrasCierreBodegaDescarga[] | undefined, audiencia: "admin" | "satelite" = "admin") {
  return libroCierresBodega({
    items,
    cifras,
    columnasAnterior: COLUMNAS_DESCARGA_BODEGA_RESUELTOS,
    filaAnterior: filaDescargaBodegaResuelto,
    audiencia,
  });
}

// --- Columnas ---------------------------------------------------------------------------------

describe("SLT-141 — columnas de «Cierres» y «Por tienda» de bodega (R386)", () => {
  it("«Cierres» de la central: 26 columnas en el orden del documento", () => {
    const columnas = columnasCierresBodegaModeloNuevoPara("admin");
    expect(columnas).toHaveLength(26);
    expect(columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_CENTRAL);
    expect(COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_CENTRAL);
  });

  it("«Cierres» de la satélite: 25 columnas, sin «Pago entregado» (F481)", () => {
    const columnas = columnasCierresBodegaModeloNuevoPara("satelite");
    expect(columnas).toHaveLength(25);
    expect(columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_SATELITE);
  });

  it("los importes de «Cierres» van con `formato: \"monto\"` y nada más (R387)", () => {
    const montos = columnasCierresBodegaModeloNuevoPara("admin")
      .filter((c) => c.formato === "monto")
      .map((c) => c.encabezado);
    expect(montos).toEqual([
      "Efectivo", "SINPE", "Transferencia", "Recaudado", "Debe llegar a la central",
      "Gana la tienda en total", "Pago al mensajero", "Pago a la bodega satélite", "Total facturado",
      "IVA facturado", "Le queda a la empresa", "Pago entregado", "Recibido", "Falta por recibir",
    ]);
  });

  it("«Por tienda»: Folio · Tienda · Recaudado · Se le paga hoy · Gana en total, importes en monto", () => {
    const hojas = libro([BN], [CIFRAS_BN]);
    expect(hojas?.[1].columnas).toEqual([
      { clave: "folio", encabezado: "Folio" },
      { clave: "tienda", encabezado: "Tienda" },
      { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
      { clave: "pagoTienda", encabezado: "Se le paga hoy", formato: "monto" },
      { clave: "ganaLaTienda", encabezado: "Gana en total", formato: "monto" },
    ]);
  });
});

// --- Celdas -----------------------------------------------------------------------------------

describe("SLT-141 — celdas de «Cierres» y «Por tienda» (R387, R388)", () => {
  it("BN en la central: la fila con los literales del design", () => {
    const hojas = libro([BN], [CIFRAS_BN]);
    expect(hojas?.[0].filas).toEqual([
      {
        folio: "B0DE9A01",
        bodega: "Centro",
        destino: "Bodega central",
        estado: "Recibido incompleto",
        solicitado: "2026-11-06",
        resuelto: "2026-11-06",
        efectivo: "70000.00",
        sinpe: "30000.00",
        transferencia: "0.00",
        recaudado: "100000.00",
        paraLaCentral: "96500.00",
        ganaLaTienda: "92090.00",
        pagoMensajero: "3000.00",
        pagoBodega: "500.00",
        totalFacturado: "7910.00",
        ivaFacturado: "910.00",
        netoEmpresa: "3500.00",
        gestiones: 3,
        pagosAjustados: 1,
        pagoEntregado: "3000.00",
        cierresIncluidos: 1,
        recibido: "96000.00",
        faltaPorRecibir: "500.00",
        estadoConciliacion: "Recibido incompleto",
        conciliadoPor: "Ana Pérez",
        conciliadoEl: "2026-11-06",
      },
    ]);
  });

  it("«Por tienda» de BN: una fila por tienda en el orden del detalle, con el folio de su cierre", () => {
    const hojas = libro([BN], [CIFRAS_BN]);
    expect(hojas?.[1].filas).toEqual([
      { folio: "B0DE9A01", tienda: "Tienda Uno", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
      { folio: "B0DE9A01", tienda: "Tienda Dos", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
    ]);
  });

  it("BX sin conciliar: negativos con su signo, Recibido / Resuelto / Conciliado vacíos (nunca 0)", () => {
    const hojas = libro([BX], [CIFRAS_BX]);
    const fila = hojas?.[0].filas[0];
    expect(fila).toMatchObject({
      folio: "0000FE17",
      bodega: "Oeste",
      estado: "Pendiente de conciliar",
      resuelto: null,
      paraLaCentral: "-1250.00",
      ganaLaTienda: "-2260.00",
      netoEmpresa: "-1250.00",
      pagoEntregado: null,
      cierresIncluidos: 2,
      recibido: null,
      faltaPorRecibir: "-1250.00",
      estadoConciliacion: "Pendiente de conciliar",
      conciliadoPor: null,
      conciliadoEl: null,
    });
    // El generador convierte la celda «monto» a número de Excel con el signo (no lo recorta).
    expect(celdaMonto(fila?.paraLaCentral as string)).toBe(-1250);
    expect(hojas?.[1].filas).toEqual([
      { folio: "0000FE17", tienda: "Tienda Tres", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
    ]);
  });

  it("satélite: la fila no lleva la clave «pagoEntregado» aunque la cifra la trajera", () => {
    const hojas = libro([BN], [CIFRAS_BN], "satelite");
    expect(hojas?.[0].columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_SATELITE);
    expect(hojas?.[0].filas[0]).not.toHaveProperty("pagoEntregado");
    expect(hojas?.[0].filas[0]).toMatchObject({ folio: "B0DE9A01", gestiones: 3 });
  });
});

// --- Reparto en hojas -------------------------------------------------------------------------

describe("SLT-141 — el libro: hojas, orden y reparto (R384, R385)", () => {
  it("solo viejos → null (el archivo de hoy, R384)", () => {
    expect(libro([BV, BV2], [])).toBeNull();
  });

  it("sin `cifrasModeloNuevo` en la respuesta → null", () => {
    expect(libro([BN, BV], undefined)).toBeNull();
  });

  it("solo nuevos: «Cierres» y «Por tienda», en ese orden y nada más", () => {
    const hojas = libro([BN, BX], [CIFRAS_BX, CIFRAS_BN]);
    expect(hojas?.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda"]);
    // El orden de la lista manda, no el de `cifras`.
    expect(hojas?.[0].filas.map((f) => f.folio)).toEqual(["B0DE9A01", "0000FE17"]);
    expect(hojas?.[1].filas.map((f) => [f.folio, f.tienda])).toEqual([
      ["B0DE9A01", "Tienda Uno"],
      ["B0DE9A01", "Tienda Dos"],
      ["0000FE17", "Tienda Tres"],
    ]);
  });

  it("mixto: «Cierres modelo anterior» al final, con el formato de hoy, y ningún cierre en dos hojas", () => {
    const hojas = libro([BV, BN, BV2, BX], [CIFRAS_BN, CIFRAS_BX]);
    expect(hojas?.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda", "Cierres modelo anterior"]);
    const anterior = hojas?.[2];
    expect(anterior?.columnas.map((c) => c.encabezado)).toEqual([
      "Estado", "Zona", "Solicitó", "Fecha resuelta", "Total general", "Pago mensajero",
      "Ingreso bodega", "Motivo", "Para la central", "Monto recibido", "Falta por recibir",
    ]);
    // El formato de hoy: la misma fila que el archivo de hoy, no una copia.
    const viejo = {
      estado: "Recibido",
      solicito: "Sara Satélite",
      fechaResuelta: "2026-11-06",
      general: "10000.00",
      pagoMensajero: "1500.00",
      ingresoBodega: "0.00",
      motivo: null,
      paraLaCentral: "8500.00",
      montoRecibido: "8500.00",
      faltaPorRecibir: "0.00",
    };
    expect(anterior?.filas).toEqual([
      { ...viejo, zona: "Norte" },
      { ...viejo, zona: "Sur" },
    ]);

    // Cada cierre de bodega, en UNA hoja: las bodegas de «Cierres» y las zonas de la anterior son
    // disjuntas y juntas son las cuatro de la lista.
    const enCierres = hojas?.[0].filas.map((f) => f.bodega) ?? [];
    const enAnterior = anterior?.filas.map((f) => f.zona) ?? [];
    expect(enCierres).toEqual(["Centro", "Oeste"]);
    expect(enAnterior).toEqual(["Norte", "Sur"]);
    expect(enCierres.filter((b) => enAnterior.includes(b))).toEqual([]);
  });

  it("un cierre nuevo sin su entrada en `cifras` → error (no se inventa una fila vacía)", () => {
    expect(() => libro([BN, BX], [CIFRAS_BN])).toThrow(/cifras/);
  });
});

// --- La llamada de la pantalla ----------------------------------------------------------------

describe("SLT-141 — obtenerResumenCierresBodega: una llamada, libro o archivo de hoy", () => {
  it("solo viejos: exactamente las filas de hoy, sin libro (R384)", async () => {
    let llamadas = 0;
    const resultado = await obtenerResumenCierresBodega(
      async () => {
        llamadas += 1;
        return { status: "ok", items: [BV], total: 1 };
      },
      filaDescargaBodegaSolicitado,
      [],
      "satelite",
    );
    expect(llamadas).toBe(1);
    expect(resultado).toEqual({
      status: "ok",
      filas: [
        {
          estado: "Recibido",
          fechaSolicitud: "2026-11-06",
          cierresDelDia: 1,
          general: "10000.00",
          pagoMensajero: "1500.00",
          ingresoBodega: "0.00",
          motivo: null,
          paraLaCentral: "8500.00",
          montoRecibido: "8500.00",
          faltaPorRecibir: "0.00",
        },
      ],
    });
  });

  it("con un cierre nuevo: `filas` es la hoja «Cierres» y `libro` lleva todas las hojas (R385)", async () => {
    const resultado = await obtenerResumenCierresBodega(
      async () => ({ status: "ok", items: [BN], total: 1, cifrasModeloNuevo: [CIFRAS_BN] }),
      filaDescargaBodegaResuelto,
      COLUMNAS_DESCARGA_BODEGA_RESUELTOS,
      "admin",
    );
    if (resultado.status !== "ok") throw new Error(`se esperaba ok y llegó ${resultado.status}`);
    expect(resultado.libro?.hojas.map((h) => h.titulo)).toEqual(["Cierres", "Por tienda"]);
    expect(resultado.filas).toBe(resultado.libro?.hojas[0].filas);
  });

  it("el tope de filas se reporta como hoy, sin libro", async () => {
    const resultado = await obtenerResumenCierresBodega(
      async () => ({ status: "limite_excedido", total: 6001, limite: 5000 }),
      filaDescargaBodegaResuelto,
      [],
      "admin",
    );
    expect(resultado.status).toBe("error");
  });
});
