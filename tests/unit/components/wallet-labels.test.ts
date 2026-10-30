import { afterEach, describe, it, expect, vi } from "vitest";

import {
  ANULAR_DOCUMENTO_CAJA_RESPUESTA,
  CAJA_COMPOSICION_MENSAJE,
  CAJA_RESUMEN_AVISO_TERCEROS,
  CAJA_RESUMEN_LABEL,
  CAJA_RESUMEN_NOTA_DIFERENCIA,
  CATEGORIA_LABEL,
  COMPOSICION_IVA_LABEL,
  IMPUESTO_ROTULO,
  REGIONES_BOLSILLO_EMPRESA,
  textoDeRegion,
  composicionCajaNombreAccesible,
  CATEGORIA_TODAS_OPTION,
  DOCUMENTO_CAJA_NOMBRE,
  MOTIVO_NO_ANULABLE_LABEL,
  ORIGEN_LABEL,
  TIPO_EGRESO_MANUAL_LABEL,
} from "@/app/(app)/wallet/_components/wallet-labels";
import { opcionesDeConceptos } from "@/components/shared/wallet/conceptos-filtro";
import { EGRESO_NOMBRADO_LABEL } from "@/app/(app)/wallet/_components/composicion-detalle-labels";
import {
  type CajaResumenDTO,
  WALLET_MOVIMIENTO_CATEGORIA_SEED,
  WALLET_ORIGEN_TIPO_SEED,
  type WalletMovimientoCategoria,
  type WalletOrigenTipo,
} from "@/lib/types/wallet";

// =================================================================================================
// FICHA 461 (T C.1, design §7.2/§7.3, HD3) — LOS NOMBRES DEL LIBRO DE LA CAJA, DESDE LA EMPRESA
// =================================================================================================
//
// R42: la tabla, el filtro por concepto y la descarga del libro rotulan cada concepto con el nombre
// desde la empresa y cada origen con el suyo, y NUNCA con el valor tecnico. R50: la explicacion de «De
// las tiendas» nombra lo que la empresa les cobro y no dice que los cobros no pasan por la caja.
//
// Los textos esperados van ESCRITOS A MANO, uno por uno, y no se leen de la fuente que los define:
// comparar un diccionario contra si mismo esta siempre verde (leccion «asercion contra su propia
// fuente»). Son el contrato aprobado por el humano (HD3): «siempre desde la empresa y diciendo quien le
// paga a quien».

/** design §7.2 — los 23 conceptos del libro de la caja, tal como se leen. */
const CONCEPTOS_ESPERADOS: Record<WalletMovimientoCategoria, string> = {
  ingreso_flete: "Flete cobrado a la tienda",
  ingreso_flete_devolucion: "Flete por devolución a origen cobrado a la tienda",
  ingreso_comision_cod: "Comisión de contra-entrega cobrada a la tienda",
  ingreso_iva_flete: "IVA del flete cobrado a la tienda",
  ingreso_iva_flete_devolucion: "IVA del flete por devolución a origen cobrado a la tienda",
  ingreso_iva_comision_cod: "IVA de la comisión cobrado a la tienda",
  ingreso_cobro_tienda: "La empresa le cobra a una tienda",
  egreso_reverso_cobro_tienda: "Cobro a una tienda anulado",
  ingreso_cod_recaudado: "Contra-entrega cobrado a los clientes de la tienda",
  egreso_pago_tienda: "La empresa le paga a una tienda",
  ingreso_reverso_pago_tienda: "Pago a una tienda anulado",
  egreso_pago_por_cuenta_tienda: "La empresa paga un gasto de una tienda",
  ingreso_reverso_pago_por_cuenta_tienda: "Pago de un gasto de una tienda anulado",
  egreso_pago_mensajero: "La empresa le paga a un mensajero",
  egreso_sueldo: "Sueldo",
  egreso_gasto_variable: "Gasto de la empresa",
  egreso_gasto_fijo: "Gasto fijo de la empresa",
  egreso_gasto: "Otro gasto de la empresa",
  egreso_indemnizacion: "Indemnización que la empresa paga por un incidente",
  ingreso_ajuste: "Corrección de caja (suma)",
  egreso_ajuste: "Corrección de caja (resta)",
  ingreso_aporte_capital: "Aporte de dinero a la caja",
  egreso_reverso_aporte_capital: "Aporte de dinero a la caja anulado",
  // Ficha 457 (design §2, DH7): el pago de una tienda a la empresa toma el nombre que la 461 reservo.
  ingreso_abono_tienda: "Una tienda le paga a la empresa",
  egreso_reverso_abono_tienda: "Pago de una tienda a la empresa anulado",
  // Ficha 458-B (design 458 §2.3): la anulacion de un cobro por devolución a origen, flete e IVA por separado.
  egreso_reverso_flete_devolucion: "Flete por devolución a origen cobrado a la tienda anulado",
  egreso_reverso_iva_flete_devolucion: "IVA del flete por devolución a origen cobrado a la tienda anulado",
  // SL-45 (R23): el nombre del pago en el libro, tal como lo pide el requisito.
  egreso_pago_plataforma: "Pago a la plataforma",
};

/** design §7.3 — los 13 origenes del libro de la caja (+ el de la 457: 14). */
const ORIGENES_ESPERADOS: Record<WalletOrigenTipo, string> = {
  cierre_dia: "Cierre del día",
  gestion_orden: "Gestión de orden",
  manual: "Registrado a mano",
  gasto: "Gasto o sueldo registrado a mano",
  pago_tienda: "Pago de la empresa a una tienda",
  pago_mensajero: "Pago de la empresa a un mensajero",
  orden_incidente: "Incidente de orden",
  ranking_snapshot_fila: "Premio del ranking",
  pago_por_cuenta_tienda: "Pago de un gasto de una tienda",
  aporte_capital: "Aporte de dinero a la caja",
  cobro_manual_reclasificado: "Cobro reclasificado como pago de un gasto de la tienda",
  cobro_tienda: "Cobro de la empresa a una tienda",
  cobro_tienda_completado: "Cobro de la empresa a una tienda (línea de caja completada al corregir)",
  // Ficha 457 (design §2): el documento del pago de una tienda a la empresa.
  abono_tienda: "Pago de una tienda a la empresa",
  // SLT-68 (design §5): el egreso de caja del incentivo y su reverso.
  incentivo_mensajero: "Incentivo a un mensajero",
};

describe("461 — CATEGORIA_LABEL: cada concepto de la caja, desde la empresa (R42, design §7.2)", () => {
  it("dice exactamente los 28 textos aprobados (23 de la 461 + 2 de la 457 + 2 de la 458-B + 1 de SL-45), y el seed es exactamente esas 28 claves", () => {
    expect(CATEGORIA_LABEL).toEqual(CONCEPTOS_ESPERADOS);
    // Anti-vacuidad: la igualdad de arriba compara contra una lista escrita a mano; esta linea
    // afirma que esa lista cubre el catalogo ENTERO y no un subconjunto que casara por casualidad.
    expect([...WALLET_MOVIMIENTO_CATEGORIA_SEED].sort()).toEqual(
      Object.keys(CONCEPTOS_ESPERADOS).sort(),
    );
    expect(WALLET_MOVIMIENTO_CATEGORIA_SEED).toHaveLength(28);
  });

  it("⭑ 457 (R45/R53): el pago de una tienda a la empresa y su anulacion, con los nombres reservados por la 461", () => {
    expect(CATEGORIA_LABEL.ingreso_abono_tienda).toBe("Una tienda le paga a la empresa");
    expect(CATEGORIA_LABEL.egreso_reverso_abono_tienda).toBe("Pago de una tienda a la empresa anulado");
    // Distintos del cobro (la empresa le cobra) y del pago de la empresa a la tienda: la direccion del dinero
    // es la contraria y el nombre lo dice.
    expect(CATEGORIA_LABEL.ingreso_abono_tienda).not.toBe(CATEGORIA_LABEL.ingreso_cobro_tienda);
    expect(CATEGORIA_LABEL.ingreso_abono_tienda).not.toBe(CATEGORIA_LABEL.egreso_pago_tienda);
    expect(ORIGEN_LABEL.abono_tienda).toBe("Pago de una tienda a la empresa");
  });

  it("ningun nombre se repite: dos conceptos con el mismo texto serian indistinguibles en la tabla", () => {
    const textos = Object.values(CATEGORIA_LABEL);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it("ningun texto es el valor tecnico ni lleva guion bajo ni la sigla «COD» (P9)", () => {
    for (const [clave, texto] of Object.entries(CATEGORIA_LABEL)) {
      expect(texto, clave).not.toBe(clave);
      expect(texto, clave).not.toMatch(/_/);
      expect(texto, clave).not.toMatch(/\bCOD\b/);
    }
  });

  it("el cobro y su anulacion son dos nombres distintos y ninguno es el del pago de un gasto", () => {
    expect(CATEGORIA_LABEL.ingreso_cobro_tienda).toBe("La empresa le cobra a una tienda");
    expect(CATEGORIA_LABEL.egreso_reverso_cobro_tienda).toBe("Cobro a una tienda anulado");
    expect(CATEGORIA_LABEL.ingreso_cobro_tienda).not.toBe(
      CATEGORIA_LABEL.egreso_pago_por_cuenta_tienda,
    );
    expect(CATEGORIA_LABEL.egreso_reverso_cobro_tienda).not.toBe(
      CATEGORIA_LABEL.ingreso_reverso_pago_por_cuenta_tienda,
    );
  });

  it("el filtro por concepto ofrece los 28 con SU nombre (R42; 457/R45; 458-B; SL-45), tras la opcion «todas»", () => {
    // 458-A (TA.3): el filtro ofrece los conceptos CON movimientos; con los 28 presentes, los 28.
    const lista = opcionesDeConceptos(
      WALLET_MOVIMIENTO_CATEGORIA_SEED.map((categoria) => ({ categoria, movimientos: 1 })),
      CATEGORIA_LABEL,
      "",
      CATEGORIA_TODAS_OPTION,
    );
    expect(lista[0]).toEqual({ value: "", label: "Todas las categorías" });
    const opciones = new Map(lista.slice(1).map((o) => [o.value, o.label]));
    expect(opciones.size).toBe(28);
    for (const [clave, texto] of Object.entries(CONCEPTOS_ESPERADOS)) {
      expect(opciones.get(clave), clave).toBe(`${texto} (1)`);
    }
  });
});

describe("461 — ORIGEN_LABEL: cada origen de la caja, desde la empresa (R42, design §7.3)", () => {
  it("dice exactamente los 15 textos aprobados (13 de la 461 + 1 de la 457 + 1 de SLT-68), y el seed es exactamente esas 15 claves", () => {
    expect(ORIGEN_LABEL).toEqual(ORIGENES_ESPERADOS);
    expect([...WALLET_ORIGEN_TIPO_SEED].sort()).toEqual(Object.keys(ORIGENES_ESPERADOS).sort());
    expect(WALLET_ORIGEN_TIPO_SEED).toHaveLength(15);
  });

  it("las dos lineas del cobro se distinguen: la completada dice que se completo al corregir (R37)", () => {
    expect(ORIGEN_LABEL.cobro_tienda_completado).toContain(ORIGEN_LABEL.cobro_tienda);
    expect(ORIGEN_LABEL.cobro_tienda_completado).toMatch(/completada al corregir/);
    expect(ORIGEN_LABEL.cobro_tienda_completado).not.toBe(ORIGEN_LABEL.cobro_tienda);
  });

  it("ningun origen se lee como el nombre tecnico ni con guion bajo", () => {
    for (const [clave, texto] of Object.entries(ORIGEN_LABEL)) {
      expect(texto, clave).not.toBe(clave);
      expect(texto, clave).not.toMatch(/_/);
    }
  });
});

describe("461 — el resto de textos de la caja que esta ficha toca (R42/R50, design §7/§9)", () => {
  it("R50: «De las tiendas» nombra lo que la empresa les cobro y NO dice que los cobros no pasan por la caja", () => {
    expect(CAJA_RESUMEN_AVISO_TERCEROS).toBe(
      "Es la suma de los saldos de todas las tiendas, ya descontados el flete, la comisión, el impuesto y lo que la empresa les cobró. El detalle de cada tienda está en Wallet → Tiendas.",
    );
    expect(CAJA_RESUMEN_AVISO_TERCEROS).not.toMatch(/sin pasar por la caja/);
    expect(CAJA_RESUMEN_AVISO_TERCEROS).not.toMatch(/cobros? de un costo/i);
  });

  it("el tipo de egreso manual se llama «Gasto de la empresa», igual que el concepto del dialogo", () => {
    // SL-45 (R6): + el pago a la plataforma, con el nombre que el requisito le da al concepto.
    expect(TIPO_EGRESO_MANUAL_LABEL).toEqual({
      gasto_variable: "Gasto de la empresa",
      sueldo: "Sueldo",
      pago_plataforma: "Pago a la plataforma",
    });
    expect(TIPO_EGRESO_MANUAL_LABEL.gasto_variable).toBe(CATEGORIA_LABEL.egreso_gasto_variable);
  });

  it("los once documentos anulables se nombran desde la empresa dentro de «Anular …» (SLT-68: el incentivo)", () => {
    expect(DOCUMENTO_CAJA_NOMBRE).toEqual({
      pago_por_cuenta_tienda: "el pago de un gasto de una tienda",
      aporte_capital: "el aporte de dinero a la caja",
      cobro_tienda: "el cobro de la empresa a una tienda",
      ajuste_caja: "la corrección de caja",
      abono_tienda: "el pago de una tienda a la empresa", // ficha 457 (design §8.5)
      // Ficha 458-B (design §3.6): egresos sin documento, indemnización y cobro por devolución a origen.
      egreso_caja: "el gasto de la caja",
      indemnizacion: "la indemnización por un incidente",
      rechazo_tienda_cobro: "el cobro por devolución a origen a una tienda",
      // Ficha 458-C (revision B3): los dos egresos que la caja ya anulaba y no traian documento.
      pago_tienda: "el pago de la empresa a una tienda",
      premio_del_ranking: "el premio del ranking",
      // SLT-68 (design §5): el egreso de caja de un incentivo a un mensajero.
      incentivo_mensajero: "el incentivo a un mensajero",
    });
  });

  it("R17: el aviso de «no anulable» dice por que, con los dos motivos que devuelve el servidor", () => {
    expect(MOTIVO_NO_ANULABLE_LABEL).toEqual({
      reclasificado: "se reclasificó como pago de un gasto de la tienda",
      sin_linea_de_caja: "no tiene su línea en la caja",
    });
    expect(ANULAR_DOCUMENTO_CAJA_RESPUESTA.noAnulable("reclasificado")).toBe(
      "Este cobro no se puede anular desde aquí: se reclasificó como pago de un gasto de la tienda.",
    );
    expect(ANULAR_DOCUMENTO_CAJA_RESPUESTA.noAnulable("sin_linea_de_caja")).toBe(
      "Este cobro no se puede anular desde aquí: no tiene su línea en la caja.",
    );
  });

  it("las filas nombradas de la composicion van en plural y desde la empresa (R27)", () => {
    expect(EGRESO_NOMBRADO_LABEL).toEqual({
      egreso_pago_mensajero: "Pagos de la empresa a mensajeros",
      egreso_ajuste: "Correcciones de caja (resta)",
      egreso_reverso_cobro_tienda: "Cobros a una tienda anulados",
      // Ficha 458-B (design 458 §2.3): las dos filas de la anulacion de un cobro por devolución a origen.
      egreso_reverso_flete_devolucion: "Fletes por devolución a origen cobrados a una tienda anulados",
      // SL-39 (design §2.1): el reverso del IVA sale de las filas nombradas; va al bloque del IVA.
      // SL-45 (R24): la fila del pago a la plataforma, con el nombre que le da el requisito.
      egreso_pago_plataforma: "Pago a la plataforma",
    });
  });
});

// =================================================================================================
// SL-39 (T4, R10, design §5 y §7.3) — LOS TEXTOS DICEN QUE LA GANANCIA NO INCLUYE EL IVA
// =================================================================================================
//
// Las frases van ESCRITAS A MANO: compararlas contra la constante que las define estaria siempre en
// verde (leccion «asercion contra su propia fuente»). Son el texto aprobado de design §7.3.

describe("SL-39 R10 — la ganancia sin IVA, en palabras", () => {
  it("el impuesto se nombra desde una sola constante", () => {
    expect(IMPUESTO_ROTULO).toBe("IVA");
  });

  it("R6: la region «IVA cobrado» y su pista", () => {
    expect(CAJA_RESUMEN_LABEL.iva).toBe("IVA cobrado");
    expect(CAJA_RESUMEN_LABEL.ivaPista).toBe(
      "IVA que se les cobró a las tiendas sobre el flete y la comisión. No es ganancia.",
    );
  });

  it("R10: la pista de la ganancia dice que no lleva el IVA", () => {
    expect(CAJA_RESUMEN_LABEL.gananciaPista).toBe(
      "Lo que la empresa gana menos lo que gasta, sin el IVA",
    );
  });

  it("R10: la nota «en qué se diferencian» excluye el IVA cobrado de la ganancia", () => {
    expect(CAJA_RESUMEN_NOTA_DIFERENCIA("Dinero en caja")).toBe(
      "«Dinero en caja» cuenta todo el dinero, también el que es de las tiendas. «Ganancia de la empresa» es solo lo que la empresa gana menos lo que gasta: no incluye el dinero de las tiendas, el IVA cobrado ni el saldo inicial o los aportes.",
    );
  });

  it("R10: «De la empresa» incluye el IVA en el nombre accesible de la barra y en `solo_tiendas`", () => {
    // design §1: ganancia 1.700 + IVA 416 = 2.116 de la empresa, la cuenta a mano.
    const resumen = { deTerceros: "10000.00", deEmpresa: "2116.00" } as unknown as CajaResumenDTO;
    expect(composicionCajaNombreAccesible(resumen)).toBe(
      "Reparto del dinero en caja. De las tiendas: ₡10.000. De la empresa: ₡2.116 (ganancia, IVA cobrado y aportes).",
    );
    expect(CAJA_COMPOSICION_MENSAJE.solo_tiendas).toBe(
      "Lo de la empresa (ganancia, IVA cobrado y aportes) está en negativo, así que hay dinero de las tiendas cubriendo ese saldo. Lo que hay en la caja no alcanza para entregarles todo lo suyo.",
    );
  });

  it("R7: los rótulos del bloque del IVA en la composición", () => {
    expect(COMPOSICION_IVA_LABEL).toEqual({
      titulo: "IVA cobrado (aparte de la ganancia)",
      grupo: "Desglose del IVA",
      total: "Total del IVA",
    });
  });

  // SL-40 (design §10): las entradas leen `{ resumen, deudaPlataforma }`. Las de SL-39 leen del
  // resumen lo mismo que antes; la deuda, de su propio dato.
  it("R9 (SL-39) y R21 (SL-40): las regiones secundarias del bolsillo, en orden, con su importe y su signo", () => {
    const resumen = {
      iva: "416.00",
      signoIva: "positivo",
      capital: "-50.00",
      signoCapital: "negativo",
    } as unknown as CajaResumenDTO;
    const datos = { resumen, deudaPlataforma: { deuda: "500.00", estado: "debe" as const, importe: "500.00" } };
    expect(
      REGIONES_BOLSILLO_EMPRESA.map((r) => ({
        id: r.id,
        rotulo: textoDeRegion(r.rotulo, datos),
        pista: textoDeRegion(r.pista, datos),
        valor: r.valor(datos),
        signo: r.signo(datos),
      })),
    ).toEqual([
      {
        id: "iva",
        rotulo: "IVA cobrado",
        pista: "IVA que se les cobró a las tiendas sobre el flete y la comisión. No es ganancia.",
        valor: "416.00",
        signo: "positivo",
      },
      {
        id: "capital",
        rotulo: "Saldo inicial y aportes",
        pista: "Dinero de la empresa que no es ganancia.",
        valor: "-50.00",
        signo: "negativo",
      },
      {
        id: "deuda_plataforma",
        rotulo: "Lo que la empresa debe a la plataforma",
        // SL-45 (R1): la pista de «debe», escrita a mano.
        pista:
          "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.",
        valor: "500.00",
        signo: null,
      },
    ]);
  });

  it("R21 (SL-40, design §9.2): sin deuda (`null`), la región de la plataforma no tiene importe y las de SL-39 sí", () => {
    const resumen = {
      iva: "416.00",
      signoIva: "positivo",
      capital: "0.00",
      signoCapital: "cero",
    } as unknown as CajaResumenDTO;
    const datos = { resumen, deudaPlataforma: null };
    expect(REGIONES_BOLSILLO_EMPRESA.map((r) => [r.id, r.valor(datos)])).toEqual([
      ["iva", "416.00"],
      ["capital", "0.00"],
      ["deuda_plataforma", null],
    ]);
  });
});

// =================================================================================================
// SL-15 (R4, design §6) — LOS RÓTULOS DE LA WALLET TOMAN EL NOMBRE DE LA EMPRESA DEL MÓDULO DE MARCA
// =================================================================================================
//
// Con otro nombre en `lib/config/marca.ts`, cada rótulo de la wallet dice ese nombre y ninguno sigue
// diciendo «la empresa»: un rótulo que alguien vuelva a escribir a mano sale aquí. `vi.doMock` +
// `vi.resetModules` remontan los módulos solo en este bloque; el resto del archivo afirma los
// literales de hoy (R19).

const MODULOS_DE_ROTULOS_WALLET = [
  "@/lib/constants/wallet-rotulos",
  "@/app/(app)/wallet/_components/wallet-labels",
  "@/app/(app)/wallet/_components/wallet-conceptos-manuales",
  "@/app/(app)/wallet/_components/composicion-detalle-labels",
  "@/app/(app)/wallet/tiendas/_components/desglose-tienda-labels",
  "@/app/(app)/wallet/tiendas/_components/estado-cuenta-tienda-labels",
  "@/app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels",
  "@/app/(app)/mi-wallet/_components/mi-wallet-labels",
  "@/app/(app)/mi-wallet/_components/mi-estado-cuenta-labels",
  "@/components/shared/wallet/detalle-movimiento-panel-labels",
  "@/components/shared/wallet/registrar-movimiento-labels",
] as const;

/** Todos los textos de un módulo: cadenas sueltas, valores de diccionario y campos de catálogos. */
function textosDe(valor: unknown, hondo = 0, acc: string[] = []): string[] {
  if (typeof valor === "string") acc.push(valor);
  else if (hondo < 3 && valor !== null && typeof valor === "object") {
    for (const v of Object.values(valor)) textosDe(v, hondo + 1, acc);
  }
  return acc;
}

describe("SL-15 R4 — el nombre de la empresa sale del módulo de marca", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/config/marca");
    vi.resetModules();
  });

  it("con «Acme Envíos» en el módulo, los rótulos lo dicen y ninguno dice «la empresa» a mano", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config/marca", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/config/marca")>()),
      EMPRESA: { enFrase: "Acme Envíos", alInicio: "Acme Envíos", membrete: "Acme Envíos" },
    }));

    const etiquetas = await import("@/app/(app)/wallet/_components/wallet-labels");
    const conceptos = await import("@/app/(app)/wallet/_components/wallet-conceptos-manuales");
    const miWallet = await import("@/app/(app)/mi-wallet/_components/mi-wallet-labels");
    expect(etiquetas.CAJA_RESUMEN_LABEL.ganancia).toBe("Ganancia de Acme Envíos");
    expect(etiquetas.TIPO_EGRESO_MANUAL_LABEL.gasto_variable).toBe("Gasto de Acme Envíos");
    expect(etiquetas.DUENO_LABEL.propio).toBe("Acme Envíos");
    expect(etiquetas.CATEGORIA_LABEL.ingreso_cobro_tienda).toBe("Acme Envíos le cobra a una tienda");
    expect(etiquetas.CAJA_RESUMEN_TIENDAS_DEBEN("₡5.000")).toBe("Las tiendas le deben a Acme Envíos ₡5.000.");
    expect(conceptos.CONCEPTOS_MANUALES.find((c) => c.id === "abono_tienda")?.label).toBe(
      "Una tienda le paga a Acme Envíos",
    );
    expect(miWallet.CATEGORIA_MI_WALLET_LABEL.pago_tienda).toBe("Acme Envíos te pagó");

    const textos: string[] = [];
    for (const m of MODULOS_DE_ROTULOS_WALLET) textosDe(await import(m), 0, textos);
    // No vacuidad: el barrido lee cientos de textos y el nombre del mock sale en decenas.
    expect(textos.length).toBeGreaterThan(300);
    expect(textos.filter((t) => t.includes("Acme Envíos")).length).toBeGreaterThan(50);
    expect(textos.filter((t) => /la empresa/i.test(t))).toEqual([]);
  });
});

// =================================================================================================
// SL-45 (T8, design §7.2; R1–R3, R14) — LA REGIÓN DE LA DEUDA DICE QUÉ HACER, SEGÚN EL ESTADO
// =================================================================================================
//
// Los textos van escritos a mano, nunca leídos de `CAJA_RESUMEN_LABEL`: compararlos contra su propia
// fuente estaría siempre en verde. El importe es el `importe` del servidor (en positivo), no la `deuda`
// con signo.

describe("SL-45 R1–R3 — el rótulo, la pista y el importe de la deuda, por estado", () => {
  const resumen = {
    iva: "0.00",
    signoIva: "cero",
    capital: "0.00",
    signoCapital: "cero",
  } as unknown as CajaResumenDTO;
  const region = REGIONES_BOLSILLO_EMPRESA.find((r) => r.id === "deuda_plataforma")!;
  const leer = (deudaPlataforma: { deuda: string; estado: "debe" | "al_dia" | "a_favor"; importe: string }) => {
    const datos = { resumen, deudaPlataforma };
    return {
      rotulo: textoDeRegion(region.rotulo, datos),
      pista: textoDeRegion(region.pista, datos),
      valor: region.valor(datos),
      signo: region.signo(datos),
    };
  };

  it("R1: «debe» — el rótulo de la deuda, el importe y la pista que lleva a pagar y registrar", () => {
    expect(leer({ deuda: "500.00", estado: "debe", importe: "500.00" })).toEqual({
      rotulo: "Lo que la empresa debe a la plataforma",
      pista:
        "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.",
      valor: "500.00",
      signo: null,
    });
  });

  it("R2: «al día» — el importe 0.00 y la pista de estar al día", () => {
    expect(leer({ deuda: "0.00", estado: "al_dia", importe: "0.00" })).toEqual({
      rotulo: "Lo que la empresa debe a la plataforma",
      pista: "La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.",
      valor: "0.00",
      signo: null,
    });
  });

  it("R3/R14: «a favor» — el rótulo del saldo a favor y el importe en POSITIVO, el que manda el servidor", () => {
    expect(leer({ deuda: "-500.00", estado: "a_favor", importe: "500.00" })).toEqual({
      rotulo: "Saldo a favor de la empresa con la plataforma",
      pista:
        "La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.",
      valor: "500.00",
      signo: null,
    });
  });

  it("R1/R4: el botón de la región se llama «Registrar pago a la plataforma»", () => {
    expect(CAJA_RESUMEN_LABEL.registrarPagoPlataforma).toBe("Registrar pago a la plataforma");
  });
});
