import { describe, expect, it } from "vitest";

import {
  accionesDe,
  cuentaConciliacion,
  filasMensajeros,
  gestionesDeBodega,
  marcaConciliacion,
  modoBodegaDe,
  avisosDe,
  cifrasDe,
  lineasDinero,
  metodosVisibles,
  modoAdminDe,
  pestanasDe,
  vistaBodegaDesdeAdmin,
  vistaMensajeroDesdeAdmin,
  vistaMensajeroDesdeCierreDia,
  type AccionId,
  type Audiencia,
  type DetalleBodegaVista,
  type DetalleMensajeroVista,
  type Modo,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import type { CierreDetalleAdminServiceResult } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type {
  CierreDetalleGestion,
  CierrePasadoDTO,
  CierreRechazoDeTienda,
} from "@/lib/interfaces/services/ICierreDiaService";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.1) — la lógica pura del
// detalle único. Los números son los de `design.md > Números escritos a mano` y TODOS los
// esperados van escritos aquí como literales: nunca se comparan contra la función que los produce.

const MENSAJERO: DetalleMensajeroVista = {
  mensajeroNombre: "Ana Mensajera",
  destino: "Bodega central · GAM",
  folio: "8F2A11C4",
  estado: "solicitado",
  solicitadoAt: "2026-11-08T00:42:00.000Z",
  resueltoAt: null,
  reprogramadasRetenidasHoy: 2,
  motivoRechazo: null,
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  empresa: {
    pagoTienda: "94350.00",
    cobradoSobreRecaudado: "5650.00",
    ganaLaTienda: "92090.00",
    totalIngresoBodegaRechazos: "500.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    totalesIngreso: {
      fleteConIva: "4520.00",
      comisionConIva: "1130.00",
      fleteDevolucionConIva: "2260.00",
      total: "7910.00",
    },
    partesPorTienda: [
      { tiendaId: "t-norte", tiendaNombre: "Tienda Norte", recaudado: "60000.00", pagoTienda: "56610.00", ganaLaTienda: "55480.00" },
      { tiendaId: "t-sur", tiendaNombre: "Tienda Sur", recaudado: "40000.00", pagoTienda: "37740.00", ganaLaTienda: "36610.00" },
    ],
    modeloNuevo: false,
  },
  conteos: {
    gestiones: 19,
    entregadas: 12,
    noEntregadas: 7,
    pagosAjustados: 1,
    incidentesSinIndemnizar: 1,
    rechazosDeTienda: 2,
    paquetesVuelven: 6,
    tiendas: 2,
  },
};

const SIN_ASUNTOS: DetalleMensajeroVista = {
  ...MENSAJERO,
  conteos: { ...MENSAJERO.conteos, pagosAjustados: 0, incidentesSinIndemnizar: 0, rechazosDeTienda: 0, paquetesVuelven: 0 },
};

const BODEGA: DetalleBodegaVista = {
  zonaNombre: "Limón",
  solicitadoPorNombre: "Sara Satélite",
  folio: "C07B3E19",
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  conciliado: false,
  faltaPorRecibir: "96500.00",
  montoRecibido: null,
  conciliadoAt: null,
  conciliadoPorNombre: null,
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
  paraLaCentral: "96500.00",
  efectivoCubreDescuentos: true,
  pagoTienda: "94350.00",
  cobradoSobreRecaudado: "5650.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  totalesIngreso: { fleteConIva: "4520.00", comisionConIva: "1130.00", fleteDevolucionConIva: "2260.00", total: "7910.00" },
  partesPorTienda: [],
  modeloNuevo: false,
  conteos: { gestiones: 31, mensajeros: 2, cierres: 2, pagosAjustados: 2 },
};

const valores = (c: { label: string; valor: string | null }[]) => c.map((x) => [x.label, x.valor]);

describe("cifrasDe (R6, R8)", () => {
  it("central y satélite: cuatro cifras, en orden, cada una del campo exacto", () => {
    for (const audiencia of ["central", "satelite"] as const) {
      expect(valores(cifrasDe("mensajero", audiencia, MENSAJERO))).toEqual([
        ["Recaudado", "100000.00"],
        ["Se le paga hoy a la tienda", "94350.00"],
        ["Pago al mensajero", "3000.00"],
        ["Le queda a la empresa", "3500.00"],
      ]);
    }
  });

  it("el mensajero ve tres: Recaudado, Gestiones y Tu ganancia", () => {
    const cifras = cifrasDe("mensajero", "mensajero", { ...MENSAJERO, empresa: null });
    expect(valores(cifras)).toEqual([
      ["Recaudado", "100000.00"],
      ["Gestiones", "19"],
      ["Tu ganancia", "3000.00"],
    ]);
    expect(cifras.map((c) => c.contexto)).toEqual(["", "12 entregas · 7 vuelven o con novedad", "1 pago ajustado por la bodega"]);
  });

  it("bodega: la cifra 2 es «Debe llegar a la central» y la 3 «Pago a mensajeros»", () => {
    expect(valores(cifrasDe("bodega", "central", BODEGA))).toEqual([
      ["Recaudado", "100000.00"],
      ["Debe llegar a la central", "96500.00"],
      ["Pago a mensajeros", "3000.00"],
      ["Le queda a la empresa", "3500.00"],
    ]);
  });

  it("las líneas de contexto salen de conteos y strings del servidor (R8)", () => {
    expect(cifrasDe("mensajero", "central", MENSAJERO).map((c) => c.contexto)).toEqual([
      "",
      "2 tiendas · ganan en total ₡92.090",
      "19 gestiones · 1 ajustada",
      "sin IVA, ya restados mensajero y bodega",
    ]);
    expect(cifrasDe("bodega", "central", BODEGA).map((c) => c.contexto)).toEqual([
      "",
      "Aún no se marca recibido",
      "2 mensajeros · 2 ajustes",
      "sin IVA, ya restados mensajeros y satélite",
    ]);
  });

  it("CONTRAPRUEBA: con otro `netoEmpresa` en el doble, la cifra 4 cambia con él", () => {
    const otro = { ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, netoEmpresa: "-250.00" } };
    expect(cifrasDe("mensajero", "central", otro)[3].valor).toBe("-250.00");
    expect(cifrasDe("bodega", "central", { ...BODEGA, netoEmpresa: "-250.00" })[3].valor).toBe("-250.00");
  });
});

describe("metodosVisibles (R7)", () => {
  it("omite el método que vale cero y conserva el orden efectivo, SINPE, transferencia", () => {
    expect(metodosVisibles(MENSAJERO.totales).map((m) => [m.label, m.monto])).toEqual([
      ["Efectivo", "70000.00"],
      ["SINPE", "30000.00"],
    ]);
  });

  it("un céntimo no es cero: «0.07» se muestra y «0» se omite", () => {
    const t = { efectivo: "0", simpe: "0.00", transferencia: "0.07", general: "0.07" };
    expect(metodosVisibles(t).map((m) => m.label)).toEqual(["Transferencia"]);
  });
});

describe("avisosDe (R4)", () => {
  it("decidir: «Por revisar:» con cada asunto y su conteo", () => {
    expect(avisosDe("mensajero", "central", "decidir", MENSAJERO)).toEqual([
      {
        titulo: "Por revisar:",
        partes: [
          "1 incidente sin indemnizar",
          "2 rechazados por la tienda",
          "1 pago al mensajero ajustado",
          "6 paquetes vuelven a bodega",
        ],
        tono: "atencion",
      },
    ]);
  });

  it("sin asuntos la lista queda vacía, y los que valen 0 no aparecen", () => {
    expect(avisosDe("mensajero", "satelite", "decidir", SIN_ASUNTOS)).toEqual([]);
    const solo = { ...SIN_ASUNTOS, conteos: { ...SIN_ASUNTOS.conteos, rechazosDeTienda: 3 } };
    expect(avisosDe("mensajero", "central", "decidir", solo)[0].partes).toEqual(["3 rechazados por la tienda"]);
    expect(avisosDe("mensajero", "central", "solo lectura", MENSAJERO)).toEqual([]);
  });

  it("vencido para la central: no lo envió, está bloqueado y destrabar es una excepción", () => {
    const [aviso] = avisosDe("mensajero", "central", "vencido", MENSAJERO);
    expect(aviso.titulo).toBe("Vencido:");
    expect(aviso.partes[0]).toContain("no lo envió a aprobación y está bloqueado");
    expect(aviso.partes[0]).toContain("Destrabarlo es una excepción");
  });

  it("bodega decidir: ajustes y lo que falta marcar, distinto para la satélite", () => {
    expect(avisosDe("bodega", "central", "decidir", BODEGA)[0].partes).toEqual([
      "2 pagos al mensajero ajustados",
      "falta marcar el dinero recibido",
    ]);
    expect(avisosDe("bodega", "satelite", "decidir", BODEGA)[0].partes).toEqual([
      "2 pagos al mensajero ajustados",
      "la central aún no marca el dinero recibido",
    ]);
    const conciliado = { ...BODEGA, conciliado: true, conteos: { ...BODEGA.conteos, pagosAjustados: 0 } };
    expect(avisosDe("bodega", "central", "decidir", conciliado)).toEqual([]);
  });

  it("el mensajero: motivo del rechazo, o que la bodega no indicó uno", () => {
    const conMotivo = { ...MENSAJERO, motivoRechazo: "Faltan 2 paquetes de Tienda Norte" };
    expect(avisosDe("mensajero", "mensajero", "rechazado", conMotivo)).toEqual([
      { titulo: "Motivo del rechazo:", partes: ["«Faltan 2 paquetes de Tienda Norte»"], tono: "peligro" },
    ]);
    expect(avisosDe("mensajero", "mensajero", "rechazado", MENSAJERO)[0].partes).toEqual([
      "La bodega no indicó un motivo.",
    ]);
  });

  it("el mensajero vencido lee el aviso de bloqueo, sin el puntero a otra pantalla", () => {
    const bloqueado = {
      ...MENSAJERO,
      bloqueo: { bloqueado: true, cierresAbiertos: 1, cierresPorReenviar: 1, aResolverPrimero: null, aReenviarPrimero: null },
    };
    const [aviso] = avisosDe("mensajero", "mensajero", "vencido", bloqueado);
    expect(aviso.partes[0]).toContain("Tienes un cierre sin enviar a aprobación.");
    expect(aviso.partes[0]).toContain("con el botón de abajo");
  });

  it("el mensajero en curso: «Antes de cerrar:» solo si el servidor dice que no puede", () => {
    const conMotivo = { ...MENSAJERO, estado: null, motivoBloqueo: "Tienes 2 paquetes en reparto sin gestionar." };
    expect(avisosDe("mensajero", "mensajero", "en curso", conMotivo)).toEqual([
      { titulo: "Antes de cerrar:", partes: ["Tienes 2 paquetes en reparto sin gestionar."], tono: "atencion" },
    ]);
    expect(avisosDe("mensajero", "mensajero", "en curso", { ...conMotivo, motivoBloqueo: null })).toEqual([]);
  });
});

describe("pestanasDe (R10, D11)", () => {
  const opciones = { gestiones: 19, rechazos: 0, mensajeros: 2 };
  const labels = (tipo: "mensajero" | "bodega", aud: Audiencia, modo: Modo, conPago = false) =>
    pestanasDe(tipo, aud, modo, { ...opciones, conPago }).map((p) => p.label);

  it("mensajero · central: Dinero, Gestiones, Rechazados por la tienda (0) y Pago solo con permiso", () => {
    expect(labels("mensajero", "central", "decidir")).toEqual([
      "Dinero",
      "Gestiones (19)",
      "Rechazados por la tienda (0)",
    ]);
    expect(labels("mensajero", "central", "solo lectura", true)).toEqual([
      "Dinero",
      "Gestiones (19)",
      "Rechazados por la tienda (0)",
      "Pago al mensajero",
    ]);
  });

  it("mensajero · satélite: nunca «Pago al mensajero»", () => {
    expect(labels("mensajero", "satelite", "solo lectura", true)).toEqual([
      "Dinero",
      "Gestiones (19)",
      "Rechazados por la tienda (0)",
    ]);
  });

  it("audiencia mensajero: «Corregir» delante solo si está rechazado, y nunca «Dinero»", () => {
    expect(labels("mensajero", "mensajero", "rechazado")).toEqual([
      "Corregir",
      "Gestiones (19)",
      "Rechazados por la tienda (0)",
    ]);
    expect(labels("mensajero", "mensajero", "en curso")).toEqual(["Gestiones (19)", "Rechazados por la tienda (0)"]);
  });

  it("bodega: Dinero, Gestiones, Mensajeros y Conciliación", () => {
    expect(labels("bodega", "central", "decidir")).toEqual([
      "Dinero",
      "Gestiones (19)",
      "Mensajeros (2)",
      "Conciliación",
    ]);
  });
});

describe("accionesDe (R12)", () => {
  const TODAS = new Set<AccionId>([
    "rechazar",
    "aprobar",
    "destrabar",
    "solicitar",
    "solicitarRechazado",
    "solicitarVencido",
    "conciliacion",
    "cerrar",
  ]);
  const ids = (tipo: "mensajero" | "bodega", aud: Audiencia, modo: Modo, paquetes = 0, disponibles = TODAS) =>
    accionesDe(tipo, aud, modo, { disponibles, paquetesVuelven: paquetes }).map((a) => a.label || a.id);

  it("la tabla de R12, fila por fila", () => {
    expect(ids("mensajero", "central", "decidir")).toEqual(["Rechazar", "Aprobar"]);
    expect(ids("mensajero", "satelite", "decidir", 6)).toEqual(["Rechazar", "Revisar paquetes y aprobar"]);
    expect(ids("mensajero", "central", "vencido")).toEqual(["Cerrar", "Destrabar cierre vencido"]);
    expect(ids("mensajero", "satelite", "solo lectura")).toEqual(["Cerrar"]);
    expect(ids("bodega", "central", "decidir")).toEqual(["Cerrar", "conciliacion"]);
    expect(ids("bodega", "central", "solo lectura")).toEqual(["conciliacion", "Cerrar"]);
    expect(ids("bodega", "satelite", "solo lectura")).toEqual(["Cerrar"]);
    expect(ids("mensajero", "mensajero", "en curso")).toEqual(["Solicitar cierre"]);
    expect(ids("mensajero", "mensajero", "rechazado")).toEqual(["Solicitar aprobación del cierre rechazado"]);
    expect(ids("mensajero", "mensajero", "vencido")).toEqual(["Solicitar aprobación del cierre vencido"]);
    expect(ids("mensajero", "mensajero", "solo lectura")).toEqual(["Cerrar"]);
  });

  it("sin permiso no aparece: la acción que quien monta no ofrece se cae del pie", () => {
    expect(ids("mensajero", "central", "decidir", 0, new Set<AccionId>(["cerrar"]))).toEqual([]);
    expect(ids("mensajero", "central", "vencido", 0, new Set<AccionId>(["cerrar"]))).toEqual(["Cerrar"]);
    expect(ids("bodega", "central", "decidir", 0, new Set<AccionId>(["cerrar"]))).toEqual(["Cerrar"]);
  });
});

describe("lineasDinero (R14, R15, R16)", () => {
  const filas = (c: { lineas: { label: string; monto: string; signo: string; tipo: string }[] }) =>
    c.lineas.map((l) => [l.label, l.monto, l.signo, l.tipo]);

  it("mensajero: reparto, lo que se factura y lo que le queda, con su signo", () => {
    const d = lineasDinero("mensajero", MENSAJERO)!;
    expect(d.reparto.map((p) => [p.label, p.monto, p.porcentaje])).toEqual([
      ["Se le paga hoy a la tienda", "94350.00", null],
      ["Sale de lo recaudado", "5650.00", null],
    ]);
    expect(d.cuentas.map((c) => c.titulo)).toEqual([
      "Lo que se le factura a la tienda",
      "De lo facturado, le queda a la empresa",
    ]);
    expect(filas(d.cuentas[0])).toEqual([
      ["Flete por entregado + IVA", "4520.00", "neutro", "partida"],
      ["Comisión COD + IVA", "1130.00", "neutro", "partida"],
      ["Sale de lo recaudado", "5650.00", "neutro", "subtotal"],
      ["Flete por devolución a origen + IVA", "2260.00", "suma", "partida"],
      ["Total facturado", "7910.00", "neutro", "total"],
    ]);
    expect(filas(d.cuentas[1])).toEqual([
      ["Total facturado", "7910.00", "neutro", "partida"],
      ["IVA (no es de la empresa)", "910.00", "resta", "partida"],
      ["Pago al mensajero", "3000.00", "resta", "partida"],
      ["Ingreso de bodega por devoluciones a origen", "500.00", "resta", "partida"],
      ["Le queda a la empresa", "3500.00", "neutro", "total"],
    ]);
  });

  it("el modelo nuevo rotula la no entrega y la bodega como hoy", () => {
    const nuevo = { ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, modeloNuevo: true } };
    const d = lineasDinero("mensajero", nuevo)!;
    expect(d.cuentas[0].lineas[3].label).toBe("Flete de gestiones no entregadas + IVA");
    expect(d.cuentas[1].lineas[3].label).toBe("Ingreso de bodega");
  });

  it("«Por tienda» solo con dos o más tiendas", () => {
    expect(lineasDinero("mensajero", MENSAJERO)!.porTienda?.map((t) => t.tiendaNombre)).toEqual([
      "Tienda Norte",
      "Tienda Sur",
    ]);
    const una = { ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, partesPorTienda: MENSAJERO.empresa!.partesPorTienda.slice(0, 1) } };
    expect(lineasDinero("mensajero", una)!.porTienda).toBeNull();
  });

  it("sin el dinero de la empresa (audiencia mensajero) no hay «Dinero» que pintar", () => {
    expect(lineasDinero("mensajero", { ...MENSAJERO, empresa: null })).toBeNull();
  });

  it("bodega: lo que va a la central, lo que se factura y lo que le queda, con − mensajeros y − satélite", () => {
    const d = lineasDinero("bodega", BODEGA);
    expect(d.reparto.map((p) => [p.label, p.monto])).toEqual([
      ["Debe llegar a la central", "96500.00"],
      ["Pago a mensajeros", "3000.00"],
      ["Gana la bodega satélite", "500.00"],
    ]);
    expect(d.cuentas.map((c) => c.titulo)).toEqual([
      "Lo que va a la central",
      "Lo que se le factura a la tienda",
      "De lo facturado, le queda a la empresa",
    ]);
    expect(filas(d.cuentas[0])).toEqual([
      ["Total general", "100000.00", "neutro", "partida"],
      ["Pago a mensajeros", "3000.00", "resta", "partida"],
      ["Gana la bodega satélite", "500.00", "resta", "partida"],
      ["Debe llegar a la central", "96500.00", "neutro", "total"],
    ]);
    expect(filas(d.cuentas[2]).slice(2, 4)).toEqual([
      ["Pago a mensajeros", "3000.00", "resta", "partida"],
      ["Gana la bodega satélite", "500.00", "resta", "partida"],
    ]);
    expect(d.porTienda).toBeNull();
  });
});

describe("de los resultados del servidor a la vista (T0.2)", () => {
  function gestion(resultado: CierreDetalleGestion["resultado"], extra: Partial<CierreDetalleGestion> = {}) {
    return { resultado, indemnizacion: null, ajustesPago: [], ingresoEmpresa: null, ...extra } as CierreDetalleGestion;
  }
  const AJUSTE = {
    creadoAt: "2026-11-08T00:00:00.000Z",
    actorNombre: "Carlos R.",
    actorRol: "maestro",
    pagoAnterior: "2500.00",
    pagoNuevo: "1800.00",
    motivo: "Paquete pesado",
  } as NonNullable<CierreDetalleGestion["ajustesPago"]>[number];
  const GRUPOS = {
    entregado: [gestion("entregado"), gestion("entregado", { ajustesPago: [AJUSTE] }), gestion("entregado")],
    reprogramado: [gestion("reprogramado")],
    novedad: [gestion("novedad")],
    devolucion_a_origen_por_rechazo: [gestion("devolucion_a_origen_por_rechazo")],
    incidente: [gestion("incidente"), gestion("incidente", { indemnizacion: "5000.00" })],
  };

  it("cuenta gestiones, ajustes, incidentes sin indemnizar y paquetes que vuelven (gestiones + barridas)", () => {
    const r = {
      status: "ok",
      cierre: {
        cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee99",
        mensajeroNombre: "Ana Mensajera",
        destinoTipo: "bodega_central",
        destinoZonaNombre: "GAM",
        estado: "solicitado",
        totales: MENSAJERO.totales,
        totalPagoMensajero: "3000.00",
        totalIngresoBodegaRechazos: "500.00",
        reprogramadasRetenidasHoy: 2,
        solicitadoAt: "2026-11-08T00:42:00.000Z",
        resueltoAt: null,
        motivoRechazo: null,
      },
      grupos: GRUPOS,
      totalesIngreso: { ...MENSAJERO.empresa!.totalesIngreso },
      ivaFacturado: "910.00",
      ganancia: "4000.00",
      pagoTienda: "94350.00",
      cobradoSobreRecaudado: "5650.00",
      netoEmpresa: "3500.00",
      ganaLaTienda: "92090.00",
      partesPorTienda: MENSAJERO.empresa!.partesPorTienda,
      ordenesSinGestion: [{}, {}],
      rechazosDeTienda: [{}],
    } as unknown as Extract<CierreDetalleAdminServiceResult, { status: "ok" }>;
    const v = vistaMensajeroDesdeAdmin(r);
    expect(v.conteos).toEqual({
      gestiones: 8,
      entregadas: 3,
      noEntregadas: 5,
      pagosAjustados: 1,
      incidentesSinIndemnizar: 1,
      rechazosDeTienda: 1,
      paquetesVuelven: 5,
      tiendas: 2,
    });
    expect(v.folio).toBe("C0FFEE99");
    expect(v.destino).toBe("Bodega central · GAM");
    expect(v.empresa?.netoEmpresa).toBe("3500.00");
  });

  it("bodega: gestiones de todos los mensajeros, mensajeros distintos y ajustes sumados", () => {
    const r = {
      status: "ok",
      cierre: {
        cierreBodegaId: "11111111-2222-4333-8444-0000abcdef12",
        zonaNombre: "Limón",
        solicitadoPorNombre: "Sara Satélite",
        conciliado: false,
        faltaPorRecibir: "96500.00",
        conciliadoAt: null,
        conciliadoPorNombre: null,
        totales: BODEGA.totales,
        totalPagoMensajero: "3000.00",
        totalIngresoBodegaRechazos: "500.00",
        solicitadoAt: "2026-11-08T01:05:00.000Z",
      },
      cierres: [
        { mensajeroId: "m1", gestionesAjustadas: 2, grupos: GRUPOS },
        { mensajeroId: "m2", grupos: { ...GRUPOS, incidente: [] } },
        { mensajeroId: "m1", gestionesAjustadas: 1, grupos: { ...GRUPOS, entregado: [] } },
      ],
      totalesIngreso: BODEGA.totalesIngreso,
      ivaFacturado: "910.00",
      pagoTienda: "94350.00",
      cobradoSobreRecaudado: "5650.00",
      netoEmpresa: "3500.00",
      partesPorTienda: [],
      paraLaCentral: "96500.00",
      efectivoCubreDescuentos: true,
    } as unknown as Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;
    // SLT-104 (PA2, R121): 3 cierres del día de 2 mensajeros distintos: la cabecera cuenta 2, la pestaña 3.
    expect(vistaBodegaDesdeAdmin(r).conteos).toEqual({ gestiones: 19, mensajeros: 2, cierres: 3, pagosAjustados: 3 });
    expect(vistaBodegaDesdeAdmin(r).folio).toBe("ABCDEF12");
  });
});

// SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (T2.1) — lo que S2 añade a la
// lógica pura. Esperados escritos a mano, como el resto del archivo.
describe("SLT-100 — modoAdminDe (R79)", () => {
  it.each([
    ["solicitado", "decidir"],
    ["vencido", "vencido"],
    ["aprobado", "solo lectura"],
    ["rechazado", "solo lectura"],
  ] as const)("un cierre %s se abre en modo «%s»", (estado, modo) => {
    expect(modoAdminDe(estado)).toBe(modo);
  });
});

describe("SLT-100 — la nota del origen del ingreso de bodega (R81, D25)", () => {
  const lineaBodega = (v: DetalleMensajeroVista) => lineasDinero("mensajero", v)!.cuentas[1].lineas[3];

  it("modelo viejo con desglose: la nota va bajo «− pago a la bodega», con los rótulos de hoy", () => {
    const linea = lineaBodega({ ...MENSAJERO, desgloseIngresoBodega: { sla: "2700.00", manual: "0.00" } });
    expect(linea.label).toBe("Ingreso de bodega por devoluciones a origen");
    expect(linea.monto).toBe("500.00");
    expect(linea.signo).toBe("resta");
    expect(linea.notas).toEqual(["Automático (por plazo vencido) ₡2.700 · Manual (mensajero) ₡0"]);
  });

  it("modelo nuevo: sin nota aunque llegue el desglose", () => {
    const nuevo = {
      ...MENSAJERO,
      empresa: { ...MENSAJERO.empresa!, modeloNuevo: true },
      desgloseIngresoBodega: { sla: "2700.00", manual: "0.00" },
    };
    expect(lineaBodega(nuevo).notas).toBeUndefined();
  });

  it("sin desglose: sin nota", () => {
    expect(lineaBodega({ ...MENSAJERO, desgloseIngresoBodega: null }).notas).toBeUndefined();
    expect(lineaBodega(MENSAJERO).notas).toBeUndefined();
  });
});

describe("SLT-100 — vistaMensajeroDesdeAdmin pasa lo nuevo del servidor (R80, R81)", () => {
  const base = {
    cierre: {
      cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee99",
      mensajeroNombre: "Ana Mensajera",
      destinoTipo: "bodega_central",
      destinoZonaNombre: "GAM",
      estado: "aprobado",
      totales: MENSAJERO.totales,
      totalPagoMensajero: "3000.00",
      totalIngresoBodegaRechazos: "500.00",
      solicitadoAt: "2026-11-08T00:42:00.000Z",
      resueltoAt: "2026-11-08T01:10:00.000Z",
      motivoRechazo: null,
    },
    grupos: { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] },
    totalesIngreso: { ...MENSAJERO.empresa!.totalesIngreso },
    ivaFacturado: "910.00",
    pagoTienda: "94350.00",
    cobradoSobreRecaudado: "5650.00",
    netoEmpresa: "3500.00",
    ganaLaTienda: "92090.00",
    partesPorTienda: [],
    ordenesSinGestion: [],
    rechazosDeTienda: [],
    desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "500.00", total: "500.00" },
  };
  const vista = (extra: object) =>
    vistaMensajeroDesdeAdmin({ ...base, ...extra } as unknown as Extract<CierreDetalleAdminServiceResult, { status: "ok" }>);

  it("el nombre de quien resolvió llega a la vista y a la cabecera", () => {
    const v = vista({ resueltoPorNombre: "Carla Resolutora" });
    expect(v.resueltoPorNombre).toBe("Carla Resolutora");
  });

  it("sin el campo (dobles viejos) queda en null: sin «por …»", () => {
    expect(vista({}).resueltoPorNombre).toBeNull();
  });

  it("el desglose del ingreso de bodega llega en el modelo viejo, sin el total", () => {
    expect(vista({}).desgloseIngresoBodega).toEqual({ sla: "0.00", manual: "500.00" });
  });

  it("y queda en null en el modelo nuevo", () => {
    const grupos = {
      ...base.grupos,
      entregado: [{ resultado: "entregado", ajustesPago: [], ingresoEmpresa: { tarifaModelo: "nuevo" } }],
    };
    expect(vista({ grupos }).desgloseIngresoBodega).toBeNull();
  });
});

// ═══ SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T2.2) ══════════════════
// Lo que S6 añade a la lógica pura. Los importes son los del canvas («Central 8», `Main.dc.html`:
// Ana 80.000,10 / 9.000,30 / 70.749,55; Beto 46.089,07 / 5.000,25 / 41.088,82) y todos los esperados
// van escritos aquí a mano.

type CierreDiaBodega = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>["cierres"][number];

function gestionB(id: string, resultado: CierreDetalleGestion["resultado"]): CierreDetalleGestion {
  return { gestionId: id, resultado, indemnizacion: null, ajustesPago: [], ingresoEmpresa: null } as unknown as CierreDetalleGestion;
}

const VACIOS = { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };

const ANA = {
  cierreDiaId: "cd-ana",
  mensajeroId: "m-ana",
  mensajeroNombre: "Ana Mensajera",
  totales: { efectivo: "80000.10", simpe: "0.00", transferencia: "0.00", general: "80000.10" },
  totalPagoMensajero: "9000.30",
  paraLaCentral: "70749.55",
  gestionesAjustadas: 2,
  solicitadoAt: "2026-11-07T23:10:00.000Z",
  grupos: {
    ...VACIOS,
    entregado: [gestionB("a-e1", "entregado"), gestionB("a-e2", "entregado")],
    incidente: [gestionB("a-i1", "incidente")],
  },
} as unknown as CierreDiaBodega;

const BETO = {
  cierreDiaId: "cd-beto",
  mensajeroId: "m-beto",
  mensajeroNombre: "Beto Mensajero",
  totales: { efectivo: "46089.07", simpe: "0.00", transferencia: "0.00", general: "46089.07" },
  totalPagoMensajero: "5000.25",
  paraLaCentral: "41088.82",
  solicitadoAt: "2026-11-08T00:20:00.000Z",
  grupos: {
    ...VACIOS,
    entregado: [gestionB("b-e1", "entregado")],
    reprogramado: [gestionB("b-r1", "reprogramado")],
  },
} as unknown as CierreDiaBodega;

describe("SLT-104 — modoBodegaDe (R111)", () => {
  it("sin marca de recibido se decide; con marca (recibido o incompleto) es solo lectura", () => {
    expect(modoBodegaDe({ conciliado: false })).toBe("decidir");
    expect(modoBodegaDe({ conciliado: true })).toBe("solo lectura");
  });
});

describe("SLT-104 — gestionesDeBodega (R41, R113, R120)", () => {
  it("por resultado y, dentro, en el orden de `cierres[]` y de sus gestiones, cada una con su mensajero", () => {
    const items = gestionesDeBodega([ANA, BETO]);
    expect(items.map((i) => [i.gestion.gestionId, i.mensajeroNombre])).toEqual([
      ["a-e1", "Ana Mensajera"],
      ["a-e2", "Ana Mensajera"],
      ["b-e1", "Beto Mensajero"],
      ["b-r1", "Beto Mensajero"],
      ["a-i1", "Ana Mensajera"],
    ]);
  });

  it("PA3: cada gestión lleva la fecha de SU cierre del día; sin ella, null (nunca la del cierre de bodega)", () => {
    const sinFecha = { ...BETO, solicitadoAt: undefined } as CierreDiaBodega;
    const items = gestionesDeBodega([ANA, sinFecha]);
    expect(items.map((i) => [i.gestion.gestionId, i.congeladoAt])).toEqual([
      ["a-e1", "2026-11-07T23:10:00.000Z"],
      ["a-e2", "2026-11-07T23:10:00.000Z"],
      ["b-e1", null],
      ["b-r1", null],
      ["a-i1", "2026-11-07T23:10:00.000Z"],
    ]);
  });
});

describe("SLT-104 — filasMensajeros (R42, R114, R115)", () => {
  it("una fila por cierre del día, en el orden del servidor, con los strings tal cual y su enlace", () => {
    expect(filasMensajeros([ANA, BETO])).toEqual([
      {
        cierreDiaId: "cd-ana",
        mensajero: "Ana Mensajera",
        gestiones: 3,
        recaudado: "80000.10",
        pago: "9000.30",
        aLaCentral: "70749.55",
        senal: "2 pagos ajustados",
        href: "/cierres-admin?cierre=cd-ana",
      },
      {
        cierreDiaId: "cd-beto",
        mensajero: "Beto Mensajero",
        gestiones: 2,
        recaudado: "46089.07",
        pago: "5000.25",
        aLaCentral: "41088.82",
        senal: "—",
        href: "/cierres-admin?cierre=cd-beto",
      },
    ]);
  });

  it("señal en singular con 1, «—» con 0 y sin el campo; el orden lo pone el servidor", () => {
    const filas = filasMensajeros([
      { ...BETO, gestionesAjustadas: 0 } as CierreDiaBodega,
      { ...ANA, gestionesAjustadas: 1 } as CierreDiaBodega,
    ]);
    expect(filas.map((f) => [f.mensajero, f.senal])).toEqual([
      ["Beto Mensajero", "—"],
      ["Ana Mensajera", "1 pago ajustado"],
    ]);
  });

  it("A la central negativo sale con su signo, sin tocar", () => {
    expect(filasMensajeros([{ ...BETO, paraLaCentral: "-1250.40" } as CierreDiaBodega])[0]?.aLaCentral).toBe("-1250.40");
  });
});

describe("SLT-104 — cuentaConciliacion y marcaConciliacion (R43, R117)", () => {
  it("sin marca: «Recibido» va sin importe (nunca \"0.00\") y lo que falta es lo declarado", () => {
    expect(cuentaConciliacion(BODEGA)).toEqual({
      titulo: "Conciliación",
      lineas: [
        { label: "Debe llegar a la central", monto: "96500.00", signo: "neutro", tipo: "partida" },
        { label: "Recibido", monto: "", signo: "resta", tipo: "partida", sinImporte: true },
        { label: "Falta por recibir", monto: "96500.00", signo: "neutro", tipo: "total" },
      ],
    });
    expect(marcaConciliacion(BODEGA)).toBe("Marcó: Aún nadie");
  });

  it("con marca: los tres strings tal cual, también un faltante negativo (llegó de más)", () => {
    const marcada: DetalleBodegaVista = {
      ...BODEGA,
      conciliado: true,
      montoRecibido: "97000.25",
      faltaPorRecibir: "-500.25",
      conciliadoAt: "2026-11-08T15:12:00.000Z",
      conciliadoPorNombre: "Carlos R.",
    };
    expect(cuentaConciliacion(marcada).lineas).toEqual([
      { label: "Debe llegar a la central", monto: "96500.00", signo: "neutro", tipo: "partida" },
      { label: "Recibido", monto: "97000.25", signo: "resta", tipo: "partida" },
      { label: "Falta por recibir", monto: "-500.25", signo: "neutro", tipo: "total" },
    ]);
    expect(marcaConciliacion(marcada)).toBe("Marcó: Carlos R. · 2026-11-08 09:12");
  });
});

describe("SLT-104 — pestaña «Mensajeros (n)» cuenta filas (PA2, R121)", () => {
  it("dos cierres del día del MISMO mensajero: dos filas, la cabecera sigue contando un mensajero", () => {
    const r = {
      status: "ok",
      cierre: { ...BODEGA, cierreBodegaId: "11111111-2222-4333-8444-0000abcdef12", conciliado: false },
      cierres: [ANA, { ...ANA, cierreDiaId: "cd-ana-2" }],
      partesPorTienda: [],
    } as unknown as Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;
    const vista = vistaBodegaDesdeAdmin(r);
    expect(vista.conteos.mensajeros).toBe(1);
    expect(vista.conteos.cierres).toBe(2);
    expect(filasMensajeros(r.cierres)).toHaveLength(2);
  });
});

// SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (T1.1, R150, R71) — un cierre pasado
// del propio mensajero a la vista del detalle único. Esperados escritos a mano.
describe("SLT-108 — vistaMensajeroDesdeCierreDia (R150)", () => {
  const cierre: CierrePasadoDTO = {
    cierreId: "c0ffee00-0000-4000-8000-00abcdef1234",
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z-1",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "3503.00",
    solicitadoAt: "2026-11-07T23:10:00.000Z",
    resueltoAt: "2026-11-08T15:00:00.000Z",
    motivoRechazo: null,
  };
  const g = (gestionId: string, resultado: CierreDetalleGestion["resultado"]) =>
    ({ gestionId, resultado, pagoMensajero: "1500.00" }) as CierreDetalleGestion;
  const rechazoDeTienda = { gestionId: "rt-1" } as CierreRechazoDeTienda;
  const detalle = {
    grupos: {
      entregado: [g("g1", "entregado"), g("g2", "entregado")],
      reprogramado: [],
      novedad: [],
      devolucion_a_origen_por_rechazo: [g("g3", "devolucion_a_origen_por_rechazo")],
      incidente: [],
    },
    ordenesSinGestion: [],
    rechazosDeTienda: [rechazoDeTienda],
  };

  it("lleva la cabecera, los importes del servidor tal cual y los conteos de ese cierre", () => {
    expect(vistaMensajeroDesdeCierreDia(cierre, detalle)).toEqual({
      mensajeroNombre: "",
      destino: "Bodega central",
      folio: "CDEF1234",
      estado: "aprobado",
      solicitadoAt: "2026-11-07T23:10:00.000Z",
      resueltoAt: "2026-11-08T15:00:00.000Z",
      reprogramadasRetenidasHoy: 0,
      motivoRechazo: null,
      totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
      totalPagoMensajero: "3000.00",
      empresa: null,
      conteos: {
        gestiones: 3,
        entregadas: 2,
        noEntregadas: 1,
        pagosAjustados: 0,
        incidentesSinIndemnizar: 0,
        rechazosDeTienda: 1,
        paquetesVuelven: 1,
        tiendas: 0,
      },
    });
  });

  it("el folio son los últimos 8 del id en mayúsculas y el destino no lleva zona", () => {
    const v = vistaMensajeroDesdeCierreDia(cierre, detalle);
    expect(v.folio).toBe("CDEF1234");
    expect(v.destino).toBe("Bodega central");
  });

  it("no trae el dinero de la empresa (R9): ni el ingreso de bodega ni otra cifra suya", () => {
    const v = vistaMensajeroDesdeCierreDia(cierre, detalle);
    expect(v.empresa).toBeNull();
    expect(JSON.stringify(v)).not.toContain("3503.00");
  });

  it("sin resolución ni motivo en el DTO (campos opcionales) salen null", () => {
    const sinOpcionales: CierrePasadoDTO = { ...cierre, estado: "solicitado" };
    delete sinOpcionales.resueltoAt;
    delete sinOpcionales.motivoRechazo;
    const v = vistaMensajeroDesdeCierreDia(sinOpcionales, detalle);
    expect(v.resueltoAt).toBeNull();
    expect(v.motivoRechazo).toBeNull();
  });
});

// SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T5.2, R267) — los dos mapeadores
// de /cierres-admin copian el reparto del servidor tal cual (mismo orden, sin redondear); /cierre-dia no
// lo recibe. Literales escritos a mano: MA [94, 6] y BX [97, 3, 0] de `design.md`.
describe("SLT-111 — el reparto en % llega tal cual a la vista (R267)", () => {
  const VACIOS_M = { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
  const mensajero = (extra: object) =>
    vistaMensajeroDesdeAdmin({
      cierre: {
        cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee99",
        mensajeroNombre: "Ana Mensajera",
        destinoTipo: "bodega_central",
        destinoZonaNombre: "GAM",
        estado: "solicitado",
        totales: MENSAJERO.totales,
        totalPagoMensajero: "3000.00",
        totalIngresoBodegaRechazos: "0.00",
        solicitadoAt: "2026-11-08T00:42:00.000Z",
        resueltoAt: null,
        motivoRechazo: null,
      },
      grupos: VACIOS_M,
      totalesIngreso: { ...MENSAJERO.empresa!.totalesIngreso },
      ivaFacturado: "650.00",
      pagoTienda: "94350.00",
      cobradoSobreRecaudado: "5650.00",
      netoEmpresa: "5000.00",
      ganaLaTienda: "94350.00",
      partesPorTienda: [],
      ordenesSinGestion: [],
      rechazosDeTienda: [],
      ...extra,
    } as unknown as Extract<CierreDetalleAdminServiceResult, { status: "ok" }>);
  const bodega = (extra: object) =>
    vistaBodegaDesdeAdmin({
      status: "ok",
      cierre: { ...BODEGA, cierreBodegaId: "11111111-2222-4333-8444-0000abcdef12", conciliado: false },
      cierres: [ANA],
      partesPorTienda: [],
      ...extra,
    } as unknown as Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>);

  it("mensajero: [94, 6] llega a `empresa.porcentajesReparto` en el mismo orden", () => {
    expect(mensajero({ porcentajesReparto: [94, 6] }).empresa?.porcentajesReparto).toEqual([94, 6]);
  });

  it("mensajero: `null` del servidor sigue siendo `null`; sin el campo, también `null`", () => {
    expect(mensajero({ porcentajesReparto: null }).empresa?.porcentajesReparto).toBeNull();
    expect(mensajero({}).empresa?.porcentajesReparto).toBeNull();
  });

  it("bodega: [97, 3, 0] llega a `porcentajesReparto` en el mismo orden, con el 0 incluido", () => {
    expect(bodega({ porcentajesReparto: [97, 3, 0] }).porcentajesReparto).toEqual([97, 3, 0]);
  });

  it("bodega: `null` del servidor sigue siendo `null`; sin el campo, también `null`", () => {
    expect(bodega({ porcentajesReparto: null }).porcentajesReparto).toBeNull();
    expect(bodega({}).porcentajesReparto).toBeNull();
  });

  it("/cierre-dia no lo recibe: `empresa` sigue en `null`", () => {
    const cierre: CierrePasadoDTO = {
      cierreId: "c0ffee00-0000-4000-8000-00abcdef1234",
      estado: "aprobado",
      destinoTipo: "bodega_central",
      destinoZonaId: "z-1",
      totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
      totalPagoMensajero: "3000.00",
      totalIngresoBodegaRechazos: "0.00",
      solicitadoAt: "2026-11-07T23:10:00.000Z",
    };
    const v = vistaMensajeroDesdeCierreDia(cierre, { grupos: VACIOS_M, ordenesSinGestion: [], rechazosDeTienda: [] });
    expect(v.empresa).toBeNull();
    expect(Object.keys(v)).not.toContain("porcentajesReparto");
  });
});
