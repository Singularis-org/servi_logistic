import { describe, expect, it } from "vitest";

import {
  accionesDe,
  calculoDe,
  columnasDe,
  estadoVacioDe,
  filtrar,
  filtrosDe,
  gestionesEnOrden,
  montoDeColumna,
  senalesDe,
  tarjetasDe,
  textoSenales,
  type AudienciaFila,
  type TarjetaFila,
} from "@/components/private/cierres/fila/fila-gestion-vista";
import { origenDe } from "@/components/private/cierres/fila/fila-gestion-labels";
import type { CierreGrupos } from "@/lib/interfaces/services/ICierreDiaService";
import {
  CONGELADO_AT,
  gestionCanvas,
  gestionFila,
  ingresoNuevo,
  ingresoViejo,
} from "@/tests/fixtures/gestion-cierre-fila";

// SLT-101 «Fila de gestión única y lista con filtros» (T2.1) — la lógica pura de la lista y de la
// fila. Todos los esperados van ESCRITOS A MANO (nunca la función que los produce): son el texto y
// el string del servidor que ve el usuario.

const AUDIENCIAS: AudienciaFila[] = ["central", "satelite", "mensajero", "solo lectura"];

/** [rótulo con su operador, monto] de cada línea de una tarjeta. */
function lineas(t: TarjetaFila | { lineas: TarjetaFila["lineas"] }): [string, string][] {
  const op = { neutro: "", suma: "+ ", resta: "− " } as const;
  return t.lineas.map((l) => [`${op[l.signo]}${l.label}`, l.monto]);
}

const incidente = gestionFila({
  gestionId: "g-inc",
  resultado: "incidente",
  causaIncidente: "danado",
  indemnizacion: null,
  montoRecibido: null,
  pagos: [],
});
const devolucionSla = gestionFila({
  gestionId: "g-dev",
  resultado: "devolucion_a_origen_por_rechazo",
  esRechazoSla: true,
  montoRecibido: null,
  pagos: [],
});
const sinTarifa = gestionFila({ gestionId: "g-st", tarifaFaltante: true, ingresoEmpresa: ingresoNuevo() });

describe("R24, R85 — señales por audiencia, en su orden", () => {
  it("incidente sin indemnizar: con la causa legible para central y satélite; solo la causa para mensajero y solo lectura", () => {
    expect(textoSenales(incidente, "central")).toBe("Paquete dañado · sin indemnizar");
    expect(textoSenales(incidente, "satelite")).toBe("Paquete dañado · sin indemnizar");
    expect(textoSenales(incidente, "mensajero")).toBe("Paquete dañado");
    expect(textoSenales(incidente, "solo lectura")).toBe("Paquete dañado");
  });

  it("incidente ya indemnizado: sin señal", () => {
    expect(textoSenales({ ...incidente, indemnizacion: "5000.00" }, "central")).toBe("");
  });

  it("devolución automática: «Vuelve a bodega · Rechazo automático»; al mensajero sin el origen (414)", () => {
    expect(textoSenales(devolucionSla, "central")).toBe("Vuelve a bodega · Rechazo automático");
    expect(textoSenales(devolucionSla, "solo lectura")).toBe("Vuelve a bodega · Rechazo automático");
    expect(textoSenales(devolucionSla, "mensajero")).toBe("Vuelve a bodega");
  });

  it("reprogramado y novedad vuelven a bodega; entregado e incidente no", () => {
    expect(textoSenales(gestionFila({ gestionId: "r", resultado: "reprogramado" }), "central")).toBe("Vuelve a bodega");
    expect(textoSenales(gestionFila({ gestionId: "n", resultado: "novedad" }), "central")).toBe("Vuelve a bodega");
    expect(textoSenales(gestionFila({ gestionId: "e" }), "central")).toBe("");
  });

  it("sin tarifa: «Sin tarifa de pago» para la central; «Sin tarifa» para el mensajero (F9)", () => {
    expect(textoSenales(sinTarifa, "central")).toBe("Sin tarifa de pago");
    expect(textoSenales(sinTarifa, "satelite")).toBe("Sin tarifa de pago");
    expect(textoSenales(sinTarifa, "mensajero")).toBe("Sin tarifa");
  });

  it("pago ajustado va primero y nunca al mensajero (SLT-56 Q2)", () => {
    const g = gestionCanvas({ resultado: "reprogramado" });
    expect(senalesDe(g, "central").map((s) => s.id)).toEqual(["pago_ajustado", "vuelve_a_bodega"]);
    expect(textoSenales(g, "central")).toBe("Pago ajustado · Vuelve a bodega");
    expect(textoSenales(g, "mensajero")).toBe("Vuelve a bodega");
  });

  it("una gestión sin señales da celda vacía", () => {
    for (const a of AUDIENCIAS) expect(senalesDe(gestionFila({ gestionId: "x" }), a)).toEqual([]);
  });
});

describe("R84, S3-5 — filtros, orden y filtrado", () => {
  const grupos: CierreGrupos = {
    entregado: [gestionFila({ gestionId: "e1" }), gestionCanvas()],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [devolucionSla],
    incidente: [incidente],
  };
  const lista = gestionesEnOrden(grupos);

  it("«Todas» va por resultado y, dentro, en el orden del servidor", () => {
    expect(lista.map((g) => g.gestionId)).toEqual(["e1", "g-canvas", "g-dev", "g-inc"]);
  });

  it("7 opciones «<nombre> <n>», «Todas» primero, «Con señales» al final con tono de aviso", () => {
    expect(filtrosDe(lista, "central")).toEqual([
      { value: "todas", label: "Todas 4" },
      { value: "entregado", label: "Entregado 2" },
      { value: "reprogramado", label: "Reprogramado 0" },
      { value: "novedad", label: "Novedad 0" },
      { value: "devolucion_a_origen_por_rechazo", label: "Devolución a origen por rechazo 1" },
      { value: "incidente", label: "Incidente 1" },
      { value: "con_senales", label: "Con señales 3", tono: "aviso" },
    ]);
  });

  it("«Con señales» cuenta por audiencia: el mensajero no ve el ajuste", () => {
    expect(filtrosDe(lista, "mensajero").at(-1)?.label).toBe("Con señales 2");
  });

  it("filtrar devuelve el subconjunto sin reordenar", () => {
    const items = lista.map((gestion) => ({ gestion }));
    expect(filtrar(items, "todas", "central").map((i) => i.gestion.gestionId)).toEqual(["e1", "g-canvas", "g-dev", "g-inc"]);
    expect(filtrar(items, "entregado", "central").map((i) => i.gestion.gestionId)).toEqual(["e1", "g-canvas"]);
    expect(filtrar(items, "con_senales", "central").map((i) => i.gestion.gestionId)).toEqual(["g-canvas", "g-dev", "g-inc"]);
    expect(filtrar(items, "reprogramado", "central")).toEqual([]);
  });

  it("estado vacío con texto, nunca en blanco", () => {
    expect(estadoVacioDe("reprogramado")).toBe("No hay gestiones con resultado «Reprogramado».");
    expect(estadoVacioDe("con_senales")).toBe("Ninguna gestión de este cierre tiene señales.");
    expect(estadoVacioDe("todas")).toBe("Este cierre no tiene gestiones.");
  });
});

describe("R23, R86 — columnas por audiencia", () => {
  it("central y satélite: cobro a la tienda, pago al mensajero y señales", () => {
    for (const a of ["central", "satelite"] as const) {
      expect(columnasDe(a).map((c) => c.label)).toEqual([
        "Guía",
        "Destinatario · tienda",
        "Resultado",
        "Recibido",
        "Cobro a la tienda",
        "Pago al mensajero",
        "Señales",
      ]);
    }
  });

  it("con mensajero (bodega): «Mensajero» tras «Destinatario · tienda»", () => {
    expect(columnasDe("solo lectura", true).map((c) => c.label)).toEqual([
      "Guía",
      "Destinatario · tienda",
      "Mensajero",
      "Resultado",
      "Recibido",
      "Cobro a la tienda",
      "Pago al mensajero",
      "Señales",
    ]);
  });

  it("mensajero: «Ganancia», sin cobro a la tienda", () => {
    expect(columnasDe("mensajero").map((c) => c.label)).toEqual([
      "Guía",
      "Destinatario · tienda",
      "Resultado",
      "Recibido",
      "Ganancia",
      "Señales",
    ]);
  });

  it("los importes son el string del servidor; nulo se queda nulo (se pinta «—»)", () => {
    const g = gestionCanvas();
    expect(montoDeColumna(g, "recibido")).toBe("25000.00");
    expect(montoDeColumna(g, "cobro")).toBe("4520.00");
    expect(montoDeColumna(g, "pago")).toBe("1800.00");
    const pre = gestionFila({ gestionId: "pre", resultado: "novedad", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null });
    expect(montoDeColumna(pre, "recibido")).toBeNull();
    expect(montoDeColumna(pre, "cobro")).toBeNull();
    expect(montoDeColumna(pre, "pago")).toBeNull();
  });
});

describe("R25, R27, R30, R93-R95, R98 — tarjetas", () => {
  const vieja = gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo() });

  it("R25: qué tarjetas ve cada audiencia", () => {
    const ids = (a: AudienciaFila, central = false) => tarjetasDe(vieja, a, central).map((t) => t.id);
    expect(ids("central", true)).toEqual(["recibido", "cobro", "pago", "fulfillment"]);
    expect(ids("satelite")).toEqual(["recibido", "cobro", "pago"]);
    expect(ids("mensajero")).toEqual(["recibido", "pago"]);
    expect(ids("solo lectura", true)).toEqual(["recibido", "cobro", "pago", "fulfillment"]);
    expect(ids("solo lectura", false)).toEqual(["recibido", "cobro", "pago"]);
  });

  it("R27: «Recibió el mensajero» sin los métodos en 0 (D4)", () => {
    const [recibido] = tarjetasDe(vieja, "central", true);
    expect(recibido.titulo).toBe("Recibió el mensajero");
    expect(lineas(recibido)).toEqual([
      ["Efectivo", "15000.00"],
      ["+ SINPE", "10000.00"],
      ["Recibió", "25000.00"],
    ]);
  });

  it("R27, R93: «Se le cobra a la tienda» con cada concepto con IVA y «de eso, IVA»", () => {
    const cobro = tarjetasDe(vieja, "central", true)[1];
    expect(cobro.titulo).toBe("Se le cobra a la tienda");
    expect(lineas(cobro)).toEqual([
      ["Flete por entregado + IVA", "4520.00"],
      ["+ Comisión COD + IVA", "1130.00"],
      ["Se le cobra", "5650.00"],
    ]);
    expect(cobro.aparte).toEqual({ label: "de eso, IVA (no es de la empresa)", monto: "650.00" });
  });

  it("R93: sin `ivaIncluido` no hay línea «de eso, IVA»", () => {
    const g = gestionFila({ gestionId: "s", ingresoEmpresa: ingresoViejo({ ivaIncluido: null }) });
    expect(tarjetasDe(g, "central", true)[1].aparte).toBeUndefined();
  });

  it("R27: una devolución del viejo cobra con el rótulo de siempre", () => {
    const g = gestionFila({
      gestionId: "d",
      resultado: "devolucion_a_origen_por_rechazo",
      ingresoEmpresa: ingresoViejo({
        flete: null,
        ivaFlete: null,
        fleteConIva: null,
        comisionCod: null,
        ivaComisionCod: null,
        comisionConIva: null,
        fleteDevolucion: "2000.00",
        ivaFleteDevolucion: "260.00",
        fleteDevolucionConIva: "2260.00",
        total: "2260.00",
        ivaIncluido: "260.00",
      }),
    });
    expect(lineas(tarjetasDe(g, "satelite", false)[1])).toEqual([
      ["Flete por devolución a origen + IVA", "2260.00"],
      ["Se le cobra", "2260.00"],
    ]);
  });

  it("R27: fuente nula → «Sin dato», no ₡0", () => {
    const pre = gestionFila({ gestionId: "pre", resultado: "novedad", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null });
    const t = tarjetasDe(pre, "central", true);
    expect(t.map((x) => [x.titulo, x.vacio, x.lineas.length])).toEqual([
      ["Recibió el mensajero", "Sin dato", 0],
      ["Se le cobra a la tienda", "Sin dato", 0],
      ["Se le paga al mensajero", "Sin dato", 0],
    ]);
  });

  it("R95, R98: pago con «Por tarifa», «− Ajuste», «Se le paga», insignia, motivo y quién ajustó", () => {
    const pago = tarjetasDe(gestionCanvas(), "central", true)[2];
    expect(pago.titulo).toBe("Se le paga al mensajero");
    expect(lineas(pago)).toEqual([
      ["Por tarifa · precio propio del mensajero", "2500.00"],
      ["− Ajuste", "700.00"],
      ["Se le paga", "1800.00"],
    ]);
    expect(pago.ajustado).toBe(true);
    expect(pago.tono).toBe("aviso");
    expect(pago.notas).toEqual(["Motivo: «Entrega compartida con Luis»", "Ajustó Carlos R. · 07/11 19:02"]);
  });

  it("R95: «+ Ajuste» cuando el pago sube", () => {
    const g = gestionCanvas({
      pagoMensajero: "3200.00",
      pagoPorTarifa: { ...gestionCanvas().pagoPorTarifa!, ajuste: { signo: "suma", monto: "700.00" } },
    });
    expect(lineas(tarjetasDe(g, "satelite", false)[2])).toEqual([
      ["Por tarifa · precio propio del mensajero", "2500.00"],
      ["+ Ajuste", "700.00"],
      ["Se le paga", "3200.00"],
    ]);
  });

  it("R95: modelo viejo sin pago congelado → solo «Se le paga»", () => {
    const pago = tarjetasDe(vieja, "central", true)[2];
    expect(lineas(pago)).toEqual([["Se le paga", "1500.00"]]);
    expect(pago.ajustado).toBeUndefined();
  });

  it("mensajero: «Tu ganancia», sin ajuste ni marca", () => {
    const pago = tarjetasDe(gestionCanvas(), "mensajero", false)[1];
    expect(pago.titulo).toBe("Tu ganancia");
    expect(lineas(pago)).toEqual([
      ["Por tarifa · precio propio del mensajero", "2500.00"],
      ["Se le paga", "1800.00"],
    ]);
    expect(pago.notas).toBeUndefined();
  });

  it("R30, R94: fulfillment de la central con «+ IVA 13 %», «Se cobró» y la nota con fecha", () => {
    const f = tarjetasDe(gestionCanvas(), "central", true)[3];
    expect(f.titulo).toBe("Fulfillment · se cobró al crear la orden");
    expect(lineas(f)).toEqual([
      ["Fulfillment", "600.00"],
      ["+ IVA 13 %", "78.00"],
      ["Se cobró", "678.00"],
    ]);
    expect(f.tono).toBe("aparte");
    expect(f.nota).toBe(
      "Se cargó al saldo de la tienda el 06/11/2026, una vez por paquete. No depende de esta gestión ni de este cierre.",
    );
  });

  it("R94: sin fecha de cargo, solo la segunda frase", () => {
    const g = gestionCanvas({ ingresoEmpresa: ingresoNuevo({ fulfillmentCargadoAt: null }) });
    expect(tarjetasDe(g, "central", true)[3].nota).toBe("No depende de esta gestión ni de este cierre.");
  });

  it("R30: la satélite nunca ve el fulfillment, aunque llegara", () => {
    expect(tarjetasDe(gestionCanvas(), "satelite", true).map((t) => t.id)).not.toContain("fulfillment");
  });

  it("R30: el viejo sin IVA de fulfillment no pinta «+ IVA»", () => {
    const f = tarjetasDe(vieja, "central", true)[3];
    expect(lineas(f)).toEqual([
      ["Fulfillment", "300.00"],
      ["Se cobró", "300.00"],
    ]);
  });
});

describe("R28, R29, R97 — «Ver cómo se calculó»", () => {
  it("R29 viejo GAM: «tarifa GAM», IVA con su % y base, comisión con su % de lo cobrado", () => {
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo() }), CONGELADO_AT)!;
    expect(c.cuentas.map((x) => [x.titulo, lineas(x)])).toEqual([
      [
        "Flete por entregado",
        [
          ["tarifa GAM", "4000.00"],
          ["+ IVA flete (13 % de ₡4.000)", "520.00"],
          ["Flete por entregado", "4520.00"],
        ],
      ],
      [
        "Comisión COD",
        [
          ["Comisión COD (4 % de ₡25.000)", "1000.00"],
          ["+ IVA comisión (13 % de ₡1.000)", "130.00"],
          ["Comisión COD", "1130.00"],
        ],
      ],
    ]);
    expect(c.nota).toBe(
      "Tarifas tal como estaban al crear el cierre (07/11/2026 18:42). Si después cambian, aquí no cambia nada.",
    );
  });

  it("R29 viejo no GAM: la columna no GAM", () => {
    const ing = ingresoViejo({ esCentral: false, flete: "3000.00", ivaFlete: "390.00", fleteConIva: "3390.00" });
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ing }), CONGELADO_AT)!;
    expect(lineas(c.cuentas[0])).toEqual([
      ["tarifa no GAM", "3000.00"],
      ["+ IVA flete (13 % de ₡3.000)", "390.00"],
      ["Flete por entregado", "3390.00"],
    ]);
  });

  it("R29 pacto especial: «tarifa especial pactada» y su nota", () => {
    const ing = ingresoViejo({
      fleteOrigen: "especial",
      esZonaEspecial: true,
      flete: "5000.00",
      ivaFlete: "650.00",
      fleteConIva: "5650.00",
      tarifa: { ...ingresoViejo().tarifa!, tarifaEspecial: "5000.00" },
    });
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ing }), CONGELADO_AT)!;
    expect(lineas(c.cuentas[0])).toEqual([
      ["tarifa especial pactada", "5000.00"],
      ["+ IVA flete (13 % de ₡5.000)", "650.00"],
      ["Flete por entregado", "5650.00"],
    ]);
    expect(c.notas).toContain(
      "El flete salió de la tarifa especial pactada para el distrito, no de la tabla de precios normal.",
    );
  });

  it("R29 especial sin pacto: la columna normal y la marca de falta de pacto", () => {
    const ing = ingresoViejo({ fleteOrigen: "especial_sin_pacto", esZonaEspecial: true });
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ing }), CONGELADO_AT)!;
    expect(lineas(c.cuentas[0])[0]).toEqual(["tarifa GAM", "4000.00"]);
    expect(c.faltaPacto).toBe(true);
  });

  it("R29 sin comisión: una tarjeta menos y la nota de hoy", () => {
    const ing = ingresoViejo({
      cobraComision: false,
      comisionCod: null,
      ivaComisionCod: null,
      comisionConIva: null,
      total: "4520.00",
    });
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ing }), CONGELADO_AT)!;
    expect(c.cuentas.map((x) => x.titulo)).toEqual(["Flete por entregado"]);
    expect(c.notas).toEqual(["Esta orden no cobra comisión COD."]);
  });

  it("R29 sin tarifa congelada: solo el aviso", () => {
    const c = calculoDe(gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo({ tarifa: null }) }), CONGELADO_AT)!;
    expect(c.sinTarifa).toBe(true);
    expect(c.cuentas).toEqual([]);
  });

  it("R97 nuevo = el canvas: «Tarifa: …», «Monto fijo», «2 % de ₡25.000», «+ IVA 13 %»", () => {
    const c = calculoDe(gestionCanvas(), CONGELADO_AT)!;
    expect(c.cuentas.map((x) => [x.titulo, x.tarifa, lineas(x)])).toEqual([
      [
        "Flete por entregado",
        "Tarifa: grupo «San José centro» de la zona GAM",
        [
          ["Monto fijo", "3500.00"],
          ["+ IVA 13 %", "455.00"],
          ["Flete por entregado", "3955.00"],
        ],
      ],
      [
        "Comisión COD",
        "Tarifa: valor base de la zona GAM",
        [
          ["2 % de ₡25.000", "500.00"],
          ["+ IVA 13 %", "65.00"],
          ["Comisión COD", "565.00"],
        ],
      ],
    ]);
  });

  it("R97: con el valor de tarifa borrado (nombres nulos), el nivel sin nombres", () => {
    const ing = ingresoNuevo();
    const conceptos = ing.conceptosTarifa!.map((c) => ({ ...c, zonaNombre: null, grupoNombre: null }));
    const c = calculoDe(gestionCanvas({ ingresoEmpresa: { ...ing, conceptosTarifa: conceptos } }), CONGELADO_AT)!;
    expect(c.cuentas.map((x) => x.tarifa)).toEqual(["Tarifa: grupo", "Tarifa: valor base de la zona"]);
  });

  it("R97: sin fecha del cierre, la nota sin paréntesis", () => {
    expect(calculoDe(gestionCanvas(), null)!.nota).toBe(
      "Tarifas tal como estaban al crear el cierre. Si después cambian, aquí no cambia nada.",
    );
  });

  it("sin snapshot no hay cálculo", () => {
    expect(calculoDe(gestionFila({ gestionId: "p", ingresoEmpresa: null }), CONGELADO_AT)).toBeNull();
  });
});

describe("R97, R98, PA8 — origen de una tarifa por nivel", () => {
  const n = { zonaNombre: "GAM", grupoNombre: "San José centro", vehiculoNombre: "Moto" };
  it.each([
    ["grupo", "grupo «San José centro» de la zona GAM"],
    ["zona", "valor base de la zona GAM"],
    ["mensajero", "precio propio del mensajero"],
    ["tienda_grupo", "precio propio de la tienda en el grupo «San José centro» de la zona GAM"],
    ["tienda_zona", "precio propio de la tienda en la zona GAM"],
    ["tienda_general", "precio propio de la tienda"],
    ["grupo_vehiculo", "grupo «San José centro» de la zona GAM para Moto"],
    ["zona_vehiculo", "valor base de la zona GAM para Moto"],
  ] as const)("%s → «%s»", (nivel, texto) => {
    expect(origenDe(nivel, n)).toBe(texto);
  });
});

describe("R26 — acciones por audiencia, resultado y presencia del callback", () => {
  const cb = () => {};
  const todas = { corregirMetodos: cb, ajustarPago: cb, corregirResultado: cb, devolver: cb };
  const entrega = gestionFila({ gestionId: "e" });

  it("tabla de R26 con todos los callbacks", () => {
    expect(accionesDe(entrega, "central", todas)).toEqual({
      corregirMetodos: true,
      ajustarPago: true,
      corregirResultado: true,
      devolver: false,
    });
    expect(accionesDe(entrega, "satelite", todas)).toEqual({
      corregirMetodos: false,
      ajustarPago: true,
      corregirResultado: false,
      devolver: false,
    });
    expect(accionesDe(entrega, "mensajero", todas)).toEqual({
      corregirMetodos: false,
      ajustarPago: false,
      corregirResultado: false,
      devolver: true,
    });
    expect(accionesDe(entrega, "solo lectura", todas)).toEqual({
      corregirMetodos: false,
      ajustarPago: false,
      corregirResultado: false,
      devolver: false,
    });
  });

  it("sin callback no se ofrece (permiso o cierre cerrado)", () => {
    expect(accionesDe(entrega, "central", {})).toEqual({
      corregirMetodos: false,
      ajustarPago: false,
      corregirResultado: false,
      devolver: false,
    });
  });

  it("corregir métodos solo en una entrega que cobró; corregir resultado solo en una entrega", () => {
    const sinCobro = gestionFila({ gestionId: "s", pagos: [] });
    expect(accionesDe(sinCobro, "central", todas).corregirMetodos).toBe(false);
    expect(accionesDe(sinCobro, "central", todas).corregirResultado).toBe(true);
    const novedad = gestionFila({ gestionId: "n", resultado: "novedad", pagos: [] });
    expect(accionesDe(novedad, "central", todas).corregirResultado).toBe(false);
    expect(accionesDe(novedad, "central", todas).ajustarPago).toBe(true);
  });

  it("ajustar pago necesita un pago congelado", () => {
    const pre = gestionFila({ gestionId: "p", pagoMensajero: null });
    expect(accionesDe(pre, "central", todas).ajustarPago).toBe(false);
  });
});
