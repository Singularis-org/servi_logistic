import { afterEach, describe, it, expect, vi } from "vitest";

import {
  ANULAR_DOCUMENTO_CAJA_RESPUESTA,
  CAJA_RESUMEN_AVISO_TERCEROS,
  CATEGORIA_LABEL,
  CATEGORIA_TODAS_OPTION,
  DOCUMENTO_CAJA_NOMBRE,
  MOTIVO_NO_ANULABLE_LABEL,
  ORIGEN_LABEL,
  TIPO_EGRESO_MANUAL_LABEL,
} from "@/app/(app)/wallet/_components/wallet-labels";
import { opcionesDeConceptos } from "@/components/shared/wallet/conceptos-filtro";
import { EGRESO_NOMBRADO_LABEL } from "@/app/(app)/wallet/_components/composicion-detalle-labels";
import {
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
};

describe("461 — CATEGORIA_LABEL: cada concepto de la caja, desde la empresa (R42, design §7.2)", () => {
  it("dice exactamente los 27 textos aprobados (23 de la 461 + 2 de la 457 + 2 de la 458-B), y el seed es exactamente esas 27 claves", () => {
    expect(CATEGORIA_LABEL).toEqual(CONCEPTOS_ESPERADOS);
    // Anti-vacuidad: la igualdad de arriba compara contra una lista escrita a mano; esta linea
    // afirma que esa lista cubre el catalogo ENTERO y no un subconjunto que casara por casualidad.
    expect([...WALLET_MOVIMIENTO_CATEGORIA_SEED].sort()).toEqual(
      Object.keys(CONCEPTOS_ESPERADOS).sort(),
    );
    expect(WALLET_MOVIMIENTO_CATEGORIA_SEED).toHaveLength(27);
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

  it("el filtro por concepto ofrece los 27 con SU nombre (R42; 457/R45; 458-B), tras la opcion «todas»", () => {
    // 458-A (TA.3): el filtro ofrece los conceptos CON movimientos; con los 27 presentes, los 27.
    const lista = opcionesDeConceptos(
      WALLET_MOVIMIENTO_CATEGORIA_SEED.map((categoria) => ({ categoria, movimientos: 1 })),
      CATEGORIA_LABEL,
      "",
      CATEGORIA_TODAS_OPTION,
    );
    expect(lista[0]).toEqual({ value: "", label: "Todas las categorías" });
    const opciones = new Map(lista.slice(1).map((o) => [o.value, o.label]));
    expect(opciones.size).toBe(27);
    for (const [clave, texto] of Object.entries(CONCEPTOS_ESPERADOS)) {
      expect(opciones.get(clave), clave).toBe(`${texto} (1)`);
    }
  });
});

describe("461 — ORIGEN_LABEL: cada origen de la caja, desde la empresa (R42, design §7.3)", () => {
  it("dice exactamente los 14 textos aprobados (13 de la 461 + 1 de la 457), y el seed es exactamente esas 14 claves", () => {
    expect(ORIGEN_LABEL).toEqual(ORIGENES_ESPERADOS);
    expect([...WALLET_ORIGEN_TIPO_SEED].sort()).toEqual(Object.keys(ORIGENES_ESPERADOS).sort());
    expect(WALLET_ORIGEN_TIPO_SEED).toHaveLength(14);
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
    expect(TIPO_EGRESO_MANUAL_LABEL).toEqual({ gasto_variable: "Gasto de la empresa", sueldo: "Sueldo" });
    expect(TIPO_EGRESO_MANUAL_LABEL.gasto_variable).toBe(CATEGORIA_LABEL.egreso_gasto_variable);
  });

  it("los diez documentos anulables se nombran desde la empresa dentro de «Anular …»", () => {
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
      egreso_reverso_iva_flete_devolucion: "IVA de fletes por devolución a origen cobrados a una tienda anulados",
    });
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
