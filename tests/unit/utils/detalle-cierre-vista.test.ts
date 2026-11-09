import { describe, expect, it } from "vitest";

import {
  accionesDe,
  avisosDe,
  cifrasDe,
  lineasDinero,
  metodosVisibles,
  pestanasDe,
  vistaBodegaDesdeAdmin,
  vistaMensajeroDesdeAdmin,
  type AccionId,
  type Audiencia,
  type DetalleBodegaVista,
  type DetalleMensajeroVista,
  type Modo,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import type { CierreDetalleAdminServiceResult } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";

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
  conteos: { gestiones: 31, mensajeros: 2, pagosAjustados: 2 },
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
    expect(vistaBodegaDesdeAdmin(r).conteos).toEqual({ gestiones: 19, mensajeros: 2, pagosAjustados: 3 });
    expect(vistaBodegaDesdeAdmin(r).folio).toBe("ABCDEF12");
  });
});
