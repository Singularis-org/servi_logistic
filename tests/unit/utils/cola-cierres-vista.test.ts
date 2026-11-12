import { describe, expect, it } from "vitest";

import {
  accionBodegaDe,
  accionesFilaDe,
  columnasCola,
  faltaResaltada,
  fechaCola,
  folioBodegaCola,
  folioCola,
  pagoEntregadoDe,
  recibidoCola,
  senalesDe,
  tablistCola,
  aprobadoCola,
  folioConsolidable,
  piePorConsolidar,
  senalesConsolidable,
  tarjetasAConsolidar,
  tarjetasSolicitados,
  type TarjetasAConsolidarEntrada,
} from "@/components/private/cierres/cola/cola-cierres-vista";
import {
  descripcionCola,
  descripcionColaSatelite,
  nombreVerCierreBodega,
} from "@/components/private/cierres/cola/cola-cierres-labels";
import type { ResumenSolicitados } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T2.2) — la lógica pura de la cola.
// Los esperados van escritos a mano: son los textos del canvas (`ColaCierres.dc.html`, rama
// mensajero) y los de hoy que la cola conserva; ninguno se compara contra la función que lo genera.

function cierre(over: Partial<CierreAdminResumen> = {}): CierreAdminResumen {
  return {
    cierreId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2a11c4",
    mensajeroId: "m1",
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-11-08T00:42:00.000Z",
    resueltoAt: "2026-11-08T01:30:00.000Z",
    motivoRechazo: null,
    ...over,
  };
}

const ids = (cols: { id: string }[]) => cols.map((c) => c.id);
const rotulos = (cols: { label: string }[]) => cols.map((c) => c.label);

describe("columnasCola (R33, R34)", () => {
  it("central · Pendientes: el orden del canvas, sin «Pago entregado»", () => {
    const cols = columnasCola("mensajero", "central", "pendientes");
    expect(rotulos(cols)).toEqual([
      "Folio",
      "Mensajero",
      "Solicitado",
      "Estado",
      "Recaudado",
      "Pago al mensajero",
      "Señales",
      "Acciones",
    ]);
  });

  it("central · Resueltos: «Resuelto» y «Pago entregado» antes de Señales", () => {
    const cols = columnasCola("mensajero", "central", "resueltos");
    expect(rotulos(cols)).toEqual([
      "Folio",
      "Mensajero",
      "Resuelto",
      "Estado",
      "Recaudado",
      "Pago al mensajero",
      "Pago entregado",
      "Señales",
      "Acciones",
    ]);
  });

  it("satélite: ni en Pendientes ni en Resueltos hay «Pago entregado»", () => {
    expect(ids(columnasCola("mensajero", "satelite", "pendientes"))).not.toContain("pagoEntregado");
    expect(rotulos(columnasCola("mensajero", "satelite", "resueltos"))).toEqual([
      "Folio",
      "Mensajero",
      "Resuelto",
      "Estado",
      "Recaudado",
      "Pago al mensajero",
      "Señales",
      "Acciones",
    ]);
  });

  it("los importes a la derecha y la cabecera de acciones solo para el lector", () => {
    const cols = columnasCola("mensajero", "central", "resueltos");
    expect(cols.filter((c) => c.align === "right").map((c) => c.id)).toEqual(["recaudado", "pago"]);
    expect(cols.filter((c) => c.soloLector).map((c) => c.id)).toEqual(["acciones"]);
  });
});

describe("folioCola y fechaCola (R101)", () => {
  it("folio «#» + los últimos 8 del id en mayúsculas", () => {
    expect(folioCola(cierre())).toBe("#8F2A11C4");
  });

  it("Pendientes lee `solicitadoAt` y Resueltos `resueltoAt`, en hora de Costa Rica", () => {
    expect(fechaCola(cierre(), "pendientes")).toBe("2026-11-07 18:42");
    expect(fechaCola(cierre(), "resueltos")).toBe("2026-11-07 19:30");
  });

  it("una fecha nula es «—»", () => {
    expect(fechaCola(cierre({ resueltoAt: null }), "resueltos")).toBe("—");
  });
});

describe("pagoEntregadoDe (R103)", () => {
  it("`null` (no aprobado) → nulo", () => {
    expect(pagoEntregadoDe(null)).toEqual({ tipo: "nulo" });
  });

  it("`\"0.00\"` → liquidado", () => {
    expect(pagoEntregadoDe("0.00")).toEqual({ tipo: "liquidado" });
  });

  it("`\"45000.55\"` → pendiente con el STRING del servidor tal cual", () => {
    expect(pagoEntregadoDe("45000.55")).toEqual({ tipo: "pendiente", monto: "45000.55" });
  });
});

describe("senalesDe (R102, R110)", () => {
  it("sin ninguna señal: lista vacía", () => {
    expect(senalesDe(cierre())).toEqual([]);
  });

  it("`bloqueoMensajero` ausente no afirma ni niega el bloqueo", () => {
    expect(senalesDe(cierre({ bloqueoMensajero: undefined }))).toEqual([]);
  });

  it("mensajero no bloqueado: no pinta nada del bloqueo", () => {
    const s = senalesDe(
      cierre({ bloqueoMensajero: { bloqueado: false, cierresAbiertos: 1, cierresPorReenviar: 0 } }),
    );
    expect(s).toEqual([]);
  });

  it("mensajero bloqueado con su conteo y su nota de hoy", () => {
    const s = senalesDe(
      cierre({ bloqueoMensajero: { bloqueado: true, cierresAbiertos: 2, cierresPorReenviar: 1 } }),
    );
    expect(s).toEqual([
      {
        texto: "Mensajero bloqueado · 2",
        nota: "Este mensajero arrastra 2 cierres sin aprobar, y 1 de ellos espera a que él lo vuelva a enviar. Mientras tanto no puede entregar, cobrar ni recibir trabajo nuevo. Aprueba el más antiguo para desbloquearlo.",
      },
    ]);
  });

  it("rechazado → «Bloqueante hasta re-solicitud» con su nota", () => {
    expect(senalesDe(cierre({ estado: "rechazado" }))).toEqual([
      {
        texto: "Bloqueante hasta re-solicitud",
        nota: "Un cierre rechazado no es terminal: sigue bloqueando al mensajero hasta que lo vuelva a solicitar y su bodega lo apruebe.",
      },
    ]);
  });

  it("retenidas 1 y 3: singular y plural", () => {
    expect(senalesDe(cierre({ reprogramadasRetenidasHoy: 1 }))).toEqual([
      {
        texto: "Retiene 1 paquete reprogramado para hoy",
        nota: "1 paquete reprogramado para hoy no se puede asignar hasta que se apruebe este cierre.",
      },
    ]);
    expect(senalesDe(cierre({ reprogramadasRetenidasHoy: 3 }))).toEqual([
      {
        texto: "Retiene 3 paquetes reprogramados para hoy",
        nota: "3 paquetes reprogramados para hoy no se pueden asignar hasta que se apruebe este cierre.",
      },
    ]);
  });

  it("retenidas 0: no se pinta", () => {
    expect(senalesDe(cierre({ reprogramadasRetenidasHoy: 0 }))).toEqual([]);
  });

  it("las del servidor (R110) en su orden, singular y plural, y sin las que valen 0", () => {
    expect(
      senalesDe(
        cierre({ senalesCola: { incidentesSinIndemnizar: 1, pagosAjustados: 0, vuelvenABodega: 6 } }),
      ).map((s) => s.texto),
    ).toEqual(["1 incidente sin indemnizar", "6 vuelven a bodega"]);
    expect(
      senalesDe(
        cierre({ senalesCola: { incidentesSinIndemnizar: 2, pagosAjustados: 1, vuelvenABodega: 1 } }),
      ).map((s) => s.texto),
    ).toEqual(["2 incidentes sin indemnizar", "1 pago ajustado", "1 vuelve a bodega"]);
    expect(
      senalesDe(
        cierre({ senalesCola: { incidentesSinIndemnizar: 0, pagosAjustados: 4, vuelvenABodega: 0 } }),
      ).map((s) => s.texto),
    ).toEqual(["4 pagos ajustados"]);
  });

  it("todas juntas, en el orden de R102 y R110", () => {
    const s = senalesDe(
      cierre({
        estado: "rechazado",
        bloqueoMensajero: { bloqueado: true, cierresAbiertos: 1, cierresPorReenviar: 0 },
        reprogramadasRetenidasHoy: 3,
        senalesCola: { incidentesSinIndemnizar: 1, pagosAjustados: 1, vuelvenABodega: 2 },
      }),
    );
    expect(s.map((x) => x.texto)).toEqual([
      "Mensajero bloqueado · 1",
      "Bloqueante hasta re-solicitud",
      "Retiene 3 paquetes reprogramados para hoy",
      "1 incidente sin indemnizar",
      "1 pago ajustado",
      "2 vuelven a bodega",
    ]);
    // Las de R110 no tienen nota: el canvas no la dibuja y no se inventa.
    expect(s.slice(3).map((x) => x.nota)).toEqual([null, null, null]);
  });
});

describe("accionesFilaDe (R33, R34, R105)", () => {
  it("Pendientes: un solicitado se decide", () => {
    expect(accionesFilaDe(cierre(), "central", "pendientes", true)).toEqual(["verDecidir"]);
    expect(accionesFilaDe(cierre(), "satelite", "pendientes", false)).toEqual(["verDecidir"]);
  });

  it("Pendientes: un vencido se ve y se destraba", () => {
    expect(accionesFilaDe(cierre({ estado: "vencido" }), "central", "pendientes", true)).toEqual([
      "ver",
      "destrabar",
    ]);
  });

  it("Resueltos: central + aprobado + pendiente > 0 + permiso → «Registrar pago»", () => {
    const c = cierre({ estado: "aprobado", pendientePagoMensajero: "45000.55" });
    expect(accionesFilaDe(c, "central", "resueltos", true)).toEqual(["ver", "registrarPago"]);
  });

  it("Resueltos: la satélite nunca registra pago, aunque le llegara el permiso", () => {
    const c = cierre({ estado: "aprobado", pendientePagoMensajero: "45000.55" });
    expect(accionesFilaDe(c, "satelite", "resueltos", true)).toEqual(["ver"]);
  });

  it("Resueltos: sin permiso, liquidado, no aprobado o pendiente nulo → solo «Ver»", () => {
    const aprobado = cierre({ estado: "aprobado", pendientePagoMensajero: "45000.55" });
    expect(accionesFilaDe(aprobado, "central", "resueltos", false)).toEqual(["ver"]);
    expect(
      accionesFilaDe({ ...aprobado, pendientePagoMensajero: "0.00" }, "central", "resueltos", true),
    ).toEqual(["ver"]);
    expect(
      accionesFilaDe({ ...aprobado, pendientePagoMensajero: null }, "central", "resueltos", true),
    ).toEqual(["ver"]);
    expect(
      accionesFilaDe(
        cierre({ estado: "rechazado", pendientePagoMensajero: "45000.55" }),
        "central",
        "resueltos",
        true,
      ),
    ).toEqual(["ver"]);
  });
});

describe("descripcionCola (R106)", () => {
  it("central y satélite, con y sin zona", () => {
    expect(descripcionCola("central", null)).toBe(
      "Bodega central. Revisa el cierre de cada mensajero y apruébalo o recházalo.",
    );
    expect(descripcionCola("central", "GAM")).toBe(
      "Bodega central · GAM. Revisa el cierre de cada mensajero y apruébalo o recházalo.",
    );
    expect(descripcionCola("satelite", "Limón")).toBe(
      "Bodega satélite · Limón. Revisa el cierre de cada mensajero de tu bodega y apruébalo o recházalo.",
    );
    expect(descripcionCola("satelite", null)).toBe(
      "Bodega satélite. Revisa el cierre de cada mensajero de tu bodega y apruébalo o recházalo.",
    );
  });
});

// ═══ SLT-127 «Cola de bodega de la central con la cola única» (T1.3) ════════════════════════════
// Esperados escritos a mano (canvas, rama bodega · central); ninguno sale de la función probada.

describe("columnasCola · bodega central (R44, R129)", () => {
  const BODEGA = [
    "Folio",
    "Bodega",
    "Solicitó",
    "Solicitado",
    "Cierres",
    "Debe llegar",
    "Recibido",
    "Falta",
    "Estado",
    "Acciones",
  ];

  it.each(["pendientes", "resueltos"] as const)("las 9 columnas + acciones, en orden (%s)", (p) => {
    const cols = columnasCola("bodega", "central", p);
    expect(rotulos(cols)).toEqual(BODEGA);
    expect(cols.filter((c) => c.align === "right").map((c) => c.label)).toEqual([
      "Cierres",
      "Debe llegar",
      "Recibido",
      "Falta",
    ]);
    expect(cols.at(-1)).toMatchObject({ id: "acciones", soloLector: true });
  });

  it("la rama mensajero no gana columnas de bodega (R135)", () => {
    expect(ids(columnasCola("mensajero", "central", "pendientes"))).not.toContain("debeLlegar");
  });
});

describe("celdas de bodega (R127, R129, R130)", () => {
  it("tablist por tipo y rol (los de hoy no cambian, R206)", () => {
    expect(tablistCola("mensajero", "central")).toBe("Cierres del día por estado");
    expect(tablistCola("mensajero", "satelite")).toBe("Cierres del día por estado");
    expect(tablistCola("bodega", "central")).toBe("Cierres de bodega por estado");
  });

  it("folio: «#» + los 8 últimos del id, en mayúsculas", () => {
    expect(folioBodegaCola({ cierreBodegaId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2a7d3e" })).toBe(
      "#8F2A7D3E",
    );
  });

  it("Recibido: «nulo» sin marca, y el string del servidor tal cual con ella (R71)", () => {
    expect(recibidoCola({ montoRecibido: null })).toEqual({ tipo: "nulo" });
    expect(recibidoCola({ montoRecibido: "334100.00" })).toEqual({
      tipo: "monto",
      monto: "334100.00",
    });
    expect(recibidoCola({ montoRecibido: "0.00" })).toEqual({ tipo: "monto", monto: "0.00" });
  });

  it.each([
    ["15000.00", true],
    ["0.00", false],
    ["-500.00", false],
  ])("Falta %s resaltada: %s", (falta, esperado) => {
    expect(faltaResaltada({ faltaPorRecibir: falta })).toBe(esperado);
  });

  it.each([
    ["pendiente (sin marca)", { conciliado: false, faltaPorRecibir: "349100.00" }, "verConciliar"],
    ["incompleto", { conciliado: true, faltaPorRecibir: "15000.00" }, "verCorregir"],
    ["recibido", { conciliado: true, faltaPorRecibir: "0.00" }, "ver"],
    ["llegó de más", { conciliado: true, faltaPorRecibir: "-500.00" }, "ver"],
    // Un `rechazado` heredado llega sin marca: está en «Por conciliar» y se concilia.
    ["rechazado sin marca", { conciliado: false, faltaPorRecibir: "7000.00" }, "verConciliar"],
  ])("accionBodegaDe: %s", (_caso, marca, esperado) => {
    expect(accionBodegaDe(marca)).toBe(esperado);
  });
});

// ═══ SLT-106 «Bodega satélite: A consolidar con la cola única» (T2.1) ══════════════════════════
// Esperados escritos a mano (canvas, rama bodega · satélite, y `requirements.md` R190-R197); ninguno
// sale de la función probada.

describe("columnasCola · bodega satélite (R192, R206)", () => {
  it("«A consolidar»: las columnas en el orden de R192", () => {
    const cols = columnasCola("bodega", "satelite", "aConsolidar");
    expect(rotulos(cols)).toEqual([
      "Folio",
      "Mensajero",
      "Aprobado",
      "Recaudado",
      "Pago",
      "Gana bodega",
      "A la central",
      "Señales",
      "Acciones",
    ]);
    expect(cols.filter((c) => c.align === "right").map((c) => c.label)).toEqual([
      "Recaudado",
      "Pago",
      "Gana bodega",
      "A la central",
    ]);
    expect(cols.at(-1)).toMatchObject({ id: "acciones", soloLector: true });
  });

  it("la bodega central y los mensajeros no ganan columnas de la satélite (R206)", () => {
    expect(ids(columnasCola("bodega", "central", "pendientes"))).not.toContain("aLaCentral");
    expect(ids(columnasCola("mensajero", "satelite", "pendientes"))).not.toContain("ganaBodega");
  });

  it("tablist de la satélite: «Cierre de bodega por etapa» (R190)", () => {
    expect(tablistCola("bodega", "satelite")).toBe("Cierre de bodega por etapa");
  });
});

describe("celdas de «A consolidar» (R192)", () => {
  it("folio «#» + los 8 últimos del id del cierre del día", () => {
    expect(folioConsolidable({ cierreDiaId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2ab7c9" })).toBe(
      "#8F2AB7C9",
    );
  });

  it("Aprobado: fecha y hora; «—» sin fecha", () => {
    expect(aprobadoCola({ aprobadoAt: "2026-11-08T01:10:00.000Z" })).toBe("2026-11-07 19:10");
    expect(aprobadoCola({ aprobadoAt: null })).toBe("—");
  });

  it.each([
    [0, null],
    [1, "1 pago ajustado"],
    [3, "3 pagos ajustados"],
  ])("Señales con %s gestiones ajustadas → %s", (n, esperado) => {
    expect(senalesConsolidable({ gestionesAjustadas: n })).toBe(esperado);
  });
});

describe("tarjetasAConsolidar (R196, R71)", () => {
  const base: TarjetasAConsolidarEntrada = {
    totales: {
      efectivo: "70000.00",
      simpe: "30000.00",
      transferencia: "0.00",
      general: "100000.00",
    },
    pagoMensajeros: "3000.00",
    ganaBodega: "500.00",
    paraLaCentral: "96500.00",
    centralDebe: "0.00",
    mensajeros: 3,
    incluyeModeloNuevo: false,
  };

  it("orden e ids; sin «La central debe» cuando vale 0.00", () => {
    const t = tarjetasAConsolidar(base);
    expect(t.map((c) => c.id)).toEqual(["recaudado", "pago", "ganaBodega", "paraCentral"]);
    expect(t.map((c) => c.label)).toEqual([
      "Recaudado",
      "Pago a mensajeros",
      "Gana la bodega satélite",
      "Debe llegar a la central",
    ]);
  });

  it("los valores son los strings de entrada, sin tocar", () => {
    expect(tarjetasAConsolidar(base).map((c) => c.valor)).toEqual([
      "100000.00",
      "3000.00",
      "500.00",
      "96500.00",
    ]);
  });

  it("«Recaudado» con métodos; «Debe llegar» destacada con su nota", () => {
    const [recaudado, , , debe] = tarjetasAConsolidar(base);
    expect(recaudado).toMatchObject({ conMetodos: true, destacada: false });
    expect(debe).toMatchObject({ destacada: true, contexto: "recaudado − mensajeros − bodega" });
  });

  it("nota de «Pago a mensajeros» en singular y plural", () => {
    expect(tarjetasAConsolidar({ ...base, mensajeros: 1 })[1].contexto).toBe(
      "1 mensajero · se paga del efectivo",
    );
    expect(tarjetasAConsolidar(base)[1].contexto).toBe("3 mensajeros · se paga del efectivo");
  });

  it("nota de «Gana la bodega satélite»: «por devoluciones a origen» solo con el modelo viejo", () => {
    expect(tarjetasAConsolidar(base)[2].contexto).toBe("por devoluciones a origen");
    expect(tarjetasAConsolidar({ ...base, incluyeModeloNuevo: true })[2].contexto).toBe("");
  });

  it("«La central debe» con 12500.00: quinta tarjeta, en tono de aviso, con su nota", () => {
    const t = tarjetasAConsolidar({ ...base, centralDebe: "12500.00" });
    expect(t).toHaveLength(5);
    expect(t[4]).toMatchObject({
      id: "centralDebe",
      label: "La central debe",
      valor: "12500.00",
      contexto: "el efectivo no alcanzó para pagar a todos los mensajeros",
      aviso: true,
    });
  });
});

describe("piePorConsolidar (R197)", () => {
  it("se puede solicitar: plural y singular con el número del conjunto", () => {
    expect(piePorConsolidar(null, 3)).toBe(
      "Se enviarán los 3 cierres aprobados a la central. No se puede deshacer.",
    );
    expect(piePorConsolidar(null, 1)).toBe(
      "Se enviará el cierre aprobado a la central. No se puede deshacer.",
    );
  });

  it("cierres sin resolver: cuándo se habilita", () => {
    expect(piePorConsolidar("sin_resolver", 3)).toBe(
      "Se habilita cuando no quede ningún cierre de mensajero por resolver.",
    );
  });

  it("nada que consolidar: sin texto", () => {
    expect(piePorConsolidar("vacio", 0)).toBeUndefined();
  });
});

describe("descripcionColaSatelite (R203)", () => {
  it("con y sin el nombre de la zona", () => {
    expect(descripcionColaSatelite("Limón")).toBe(
      "Bodega satélite · Limón. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
    );
    expect(descripcionColaSatelite(null)).toBe(
      "Bodega satélite. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
    );
  });
});

// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T2.1) — «Solicitados» con la
// cola única. Los esperados van escritos a mano (`requirements.md` R286, R288, R289).

describe("columnasCola · «Solicitados» de la satélite (R49, R288, R296)", () => {
  it("las columnas en el orden de R288, sin Bodega ni Solicitó", () => {
    const cols = columnasCola("bodega", "satelite", "solicitados");
    expect(rotulos(cols)).toEqual([
      "Folio",
      "Solicitado",
      "Cierres",
      "Recaudado",
      "Debe llegar",
      "Recibido",
      "Falta",
      "Estado",
      "Acciones",
    ]);
    expect(ids(cols)).not.toContain("bodega");
    expect(ids(cols)).not.toContain("solicito");
    expect(cols.filter((c) => c.align === "right").map((c) => c.label)).toEqual([
      "Cierres",
      "Recaudado",
      "Debe llegar",
      "Recibido",
      "Falta",
    ]);
    expect(cols.at(-1)).toMatchObject({ id: "acciones", soloLector: true });
  });

  it("R296: «A consolidar», la central y los mensajeros no cambian", () => {
    expect(ids(columnasCola("bodega", "satelite", "aConsolidar"))).toEqual([
      "folio",
      "mensajero",
      "aprobado",
      "recaudado",
      "pago",
      "ganaBodega",
      "aLaCentral",
      "senales",
      "acciones",
    ]);
    expect(ids(columnasCola("bodega", "central", "pendientes"))).toEqual([
      "folio",
      "bodega",
      "solicito",
      "fecha",
      "cierres",
      "debeLlegar",
      "recibido",
      "falta",
      "conciliacion",
      "acciones",
    ]);
    expect(ids(columnasCola("mensajero", "satelite", "pendientes"))).toEqual([
      "folio",
      "mensajero",
      "fecha",
      "estado",
      "recaudado",
      "pago",
      "senales",
      "acciones",
    ]);
  });

  it("R288: el nombre accesible de «Ver» lleva el folio con su «#»", () => {
    expect(nombreVerCierreBodega("#8F2AB7C9")).toBe("Ver el cierre de bodega #8F2AB7C9");
  });
});

describe("tarjetasSolicitados (R286, R71)", () => {
  function resumen(over: Partial<ResumenSolicitados> = {}): ResumenSolicitados {
    return {
      porLlegar: { monto: "436963.27", cierres: 3 },
      recibido30Dias: { monto: "53500.00", cierres: 2 },
      faltaPorRecibir: { monto: "15000.00", cierres: 2 },
      ...over,
    };
  }

  it("orden, ids, rótulos y montos del servidor sin tocar", () => {
    const t = tarjetasSolicitados(resumen());
    expect(t.map((c) => c.id)).toEqual(["porLlegar", "recibido30Dias", "faltaPorRecibir"]);
    expect(t.map((c) => c.label)).toEqual([
      "Por llegar a la central",
      "Recibido por la central (30 días)",
      "Falta por recibir",
    ]);
    expect(t.map((c) => c.valor)).toEqual(["436963.27", "53500.00", "15000.00"]);
    expect(t.every((c) => c.esMonto && !c.conMetodos)).toBe(true);
    expect(t.map((c) => c.destacada)).toEqual([true, false, false]);
  });

  it("notas en plural", () => {
    expect(tarjetasSolicitados(resumen()).map((c) => c.contexto)).toEqual([
      "3 cierres pendientes de conciliar",
      "2 cierres de bodega",
      "2 llegaron incompletos",
    ]);
  });

  it("notas en singular", () => {
    const uno = { monto: "1.00", cierres: 1 };
    const t = tarjetasSolicitados({ porLlegar: uno, recibido30Dias: uno, faltaPorRecibir: uno });
    expect(t.map((c) => c.contexto)).toEqual([
      "1 cierre pendiente de conciliar",
      "1 cierre de bodega",
      "1 llegó incompleto",
    ]);
  });

  it("PA2: las tres también en 0.00, con sus notas en 0 y sin aviso", () => {
    const cero = { monto: "0.00", cierres: 0 };
    const t = tarjetasSolicitados({ porLlegar: cero, recibido30Dias: cero, faltaPorRecibir: cero });
    expect(t).toHaveLength(3);
    expect(t.map((c) => c.valor)).toEqual(["0.00", "0.00", "0.00"]);
    expect(t.map((c) => c.contexto)).toEqual([
      "0 cierres pendientes de conciliar",
      "0 cierres de bodega",
      "0 llegaron incompletos",
    ]);
    expect(t.some((c) => c.aviso === true)).toBe(false);
  });

  it("«Falta por recibir» en tono de aviso solo con conteo mayor que 0", () => {
    const [porLlegar, recibido, falta] = tarjetasSolicitados(resumen());
    expect(falta.aviso).toBe(true);
    expect(porLlegar.aviso).not.toBe(true);
    expect(recibido.aviso).not.toBe(true);
  });

  it("R71: un monto negativo pasa con su signo, tal cual", () => {
    const t = tarjetasSolicitados(resumen({ porLlegar: { monto: "-1200.00", cierres: 1 } }));
    expect(t[0].valor).toBe("-1200.00");
  });
});
