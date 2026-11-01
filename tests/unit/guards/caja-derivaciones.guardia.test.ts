import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { derivarBalance } from "@/lib/utils/wallet-balance";
import { derivarCaja, NATURALEZA_POR_CATEGORIA } from "@/lib/utils/caja-tesoreria";
import {
  WALLET_MOVIMIENTO_CATEGORIA_SEED,
  type AgregadoCajaRow,
  type WalletMovimientoCategoria,
} from "@/lib/types/wallet";
import { codigoSinComentarios } from "../../fixtures/money-safe";

/**
 * Feature 173 (T A.5, R9) — GUARDIA: `derivarBalance` queda INTACTO y `derivarCaja` no lo
 * reimplementa por dentro.
 *
 * Por que existe. La opcion «obvia» al abrir esta feature era cambiar la firma de
 * `derivarBalance` para que devolviera las dos cifras (design §10-F). Esta descartada: su
 * segundo consumidor es la analitica financiera, que la llama sobre SUBCONJUNTOS de categorias
 * declarados por el catalogo, donde «ingresos − egresos» sigue siendo lo correcto y donde
 * «ganancia» no significaria nada. Tocarla arrastraria cuatro metricas de dinero a un refactor
 * que esta feature no pide.
 *
 * Y la trampa simetrica: copiar la resta con signo dentro de `derivarCaja`. Dos copias de la
 * misma aritmetica de dinero no dan un error, dan una discusion el dia que difieran. Aqui se
 * afirma que hay UNA sola resta con signo en el arbol y que la funcion nueva la REUSA.
 *
 * La suite propia de `derivarBalance` (`tests/unit/utils/wallet-balance.test.ts`) NO se edita:
 * el ultimo bloque de este archivo lo comprueba leyendola.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const FUENTE_BALANCE = "lib/utils/wallet-balance.ts";
const FUENTE_CAJA = "lib/utils/caja-tesoreria.ts";
const SUITE_BALANCE = "tests/unit/utils/wallet-balance.test.ts";

function leer(rutaRelativa: string): string {
  return readFileSync(path.join(RAIZ, rutaRelativa), "utf8");
}

function tipoDe(categoria: WalletMovimientoCategoria): AgregadoCajaRow["tipo"] {
  return categoria.startsWith("ingreso_") ? "ingreso" : "egreso";
}

/** Conjuntos variados con los que comparar las dos derivaciones sobre el MISMO libro. */
const CONJUNTOS: { nombre: string; filas: AgregadoCajaRow[] }[] = [
  { nombre: "libro vacio", filas: [] },
  {
    nombre: "solo dinero propio (el estado de hoy en produccion)",
    filas: [
      { categoria: "ingreso_flete", tipo: "ingreso", total: "1000.00" },
      { categoria: "ingreso_iva_flete", tipo: "ingreso", total: "130.00" },
      { categoria: "egreso_pago_mensajero", tipo: "egreso", total: "400.00" },
      { categoria: "egreso_sueldo", tipo: "egreso", total: "900.00" },
    ],
  },
  {
    nombre: "con contra-entrega y pago a tienda (el estado tras la 173)",
    filas: [
      { categoria: "ingreso_cod_recaudado", tipo: "ingreso", total: "10000.00" },
      { categoria: "ingreso_flete", tipo: "ingreso", total: "1000.00" },
      { categoria: "egreso_pago_tienda", tipo: "egreso", total: "6000.00" },
      { categoria: "ingreso_reverso_pago_tienda", tipo: "ingreso", total: "500.00" },
      { categoria: "egreso_gasto_fijo", tipo: "egreso", total: "250.00" },
    ],
  },
  {
    nombre: "todas las categorias del catalogo, un colon cada una",
    filas: WALLET_MOVIMIENTO_CATEGORIA_SEED.map((categoria) => ({
      categoria,
      tipo: tipoDe(categoria),
      total: "0.01",
    })),
  },
];

describe("R9 — `derivarBalance` conserva firma y salida", () => {
  it("R9: la firma sigue siendo (ingresos, egresos) y la salida, sus CUATRO claves de siempre", () => {
    expect(derivarBalance.length).toBe(2);
    expect(Object.keys(derivarBalance("0", "0")).sort()).toEqual([
      "balance",
      "egresos",
      "ingresos",
      "signo",
    ]);
  });

  it("R9: sigue siendo «Σ ingresos − Σ egresos sobre el conjunto que le den», con signo explicito", () => {
    expect(derivarBalance("1000.00", "300.00")).toEqual({
      ingresos: "1000.00",
      egresos: "300.00",
      balance: "700.00",
      signo: "positivo",
    });
    expect(derivarBalance("100.00", "250.50").balance).toBe("-150.50");
    expect(derivarBalance("100.00", "250.50").signo).toBe("negativo");
    expect(derivarBalance("500.00", "500.00").signo).toBe("cero");
    // Y sigue aceptando Prisma.Decimal ademas de STRING (lo que usa la analitica).
    expect(derivarBalance(new Prisma.Decimal("10.10"), new Prisma.Decimal("0.05")).balance).toBe(
      "10.05",
    );
  });

  it("R9: el modulo exporta esa funcion y nada mas (no gana una segunda derivacion)", () => {
    const fuente = codigoSinComentarios(FUENTE_BALANCE);
    const exportados = [...fuente.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map(
      (m) => m[1],
    );
    expect(exportados).toEqual(["derivarBalance"]);
    // Ninguna palabra de la 173 se ha colado dentro: la funcion no sabe que existen las
    // naturalezas, y por eso la analitica puede seguir llamandola con subconjuntos.
    for (const palabra of ["naturaleza", "NATURALEZA", "terceros", "ganancia", "enCaja"]) {
      expect(fuente, `${FUENTE_BALANCE} nombra ${palabra}`).not.toContain(palabra);
    }
  });
});

describe("R9 — `derivarCaja` REUSA la resta con signo, no la duplica", () => {
  it("R9: importa `derivarBalance` y lo llama una vez por cada cifra (seis, SLT-73)", () => {
    const fuente = codigoSinComentarios(FUENTE_CAJA);
    expect(fuente).toMatch(
      /import\s*\{\s*derivarBalance\s*\}\s*from\s*"@\/lib\/utils\/wallet-balance"/,
    );
    const llamadas = [...fuente.matchAll(/derivarBalance\s*\(/g)].length;
    // Ficha 459 (design §2.2): de tres a CUATRO — cifra principal, ganancia, «De las tiendas» y
    // capital. SL-39 (design §2.2): CINCO — el IVA de la caja, que sale de la ganancia y tiene su
    // propia resta con signo (ingresos de IVA − el reverso). SLT-73 (design §2.9.4, R27): SEIS —
    // «Por cobrar a satélites». La propiedad protegida es «no hay restas propias»; la cuenta es su
    // sintoma.
    expect(llamadas).toBe(6);
  });

  it("⭑ SLT-73 (R25/R27): «Por cobrar a satélites» es `derivarBalance(egresos, ingresos)` de ese dueño", () => {
    // El orden INVERTIDO es el contrato: el importe sale positivo cuando la satélite debe.
    const fuente = codigoSinComentarios(FUENTE_CAJA);
    expect(fuente).toMatch(
      /derivarBalance\(\s*acc\.egresosPorCobrarSatelite\s*,\s*acc\.ingresosPorCobrarSatelite\s*\)/,
    );
  });

  it("⭑ SLT-73 (design §2.9.6): la única negación es la del tramo de la empresa en `tres_tramos` (y el tope de 100 − tiendas)", () => {
    // `E − P` y `100 − tiendas` dimensionan la barra a partir de importes YA derivados; no son restas
    // con signo de un balance. Se escriben como suma del opuesto y aquí se cuentan: una tercera
    // negación sería una resta nueva colándose por la puerta de atrás.
    const fuente = codigoSinComentarios(FUENTE_CAJA);
    expect([...fuente.matchAll(/\.neg\(/g)].length).toBe(2);
    expect(fuente).toContain("deEmpresa.add(porCobrar.neg())");
    expect(fuente).toContain("CIEN.add(porcentajeTiendas.neg())");
  });

  it("R9: no reimplementa el calculo del signo (ni un literal positivo/negativo/cero en el codigo)", () => {
    // Si alguien copiara aqui el ternario de `derivarBalance`, existirian dos definiciones de
    // «cuando una cifra de dinero es negativa» y nadie se enteraria hasta que difirieran.
    const fuente = codigoSinComentarios(FUENTE_CAJA);
    for (const literal of ['"positivo"', '"negativo"', '"cero"']) {
      expect(fuente, `${FUENTE_CAJA} declara ${literal} por su cuenta`).not.toContain(literal);
    }
    // Tampoco la resta: la unica aritmetica propia de este modulo son SUMAS por cubeta.
    expect(fuente).not.toContain(".sub(");
    expect(fuente).not.toContain(".minus(");
  });

  it("R9: sobre cualquier conjunto, `enCaja` es EXACTAMENTE lo que devuelve `derivarBalance`", () => {
    for (const { nombre, filas } of CONJUNTOS) {
      const caja = derivarCaja(filas);
      const balance = derivarBalance(caja.entradas, caja.salidas);
      expect(caja.enCaja, nombre).toBe(balance.balance);
      expect(caja.signoEnCaja, nombre).toBe(balance.signo);
    }
  });

  it("R9 (SL-39): `ganancia` es `derivarBalance` sobre lo PROPIO sin IVA, e `iva` sobre lo de IVA", () => {
    // SL-39 (R1/R2): el IVA se reconoce aqui por su nombre (`_iva_`), no con `esCategoriaIva`: es la
    // definicion del glosario, y R18 vigila que el seed no se deje ninguna.
    const esIva = (f: AgregadoCajaRow) => f.categoria.includes("_iva_");
    const sumar = (filas: readonly AgregadoCajaRow[], tipo: AgregadoCajaRow["tipo"]) =>
      filas
        .filter((f) => f.tipo === tipo)
        .reduce((s, f) => s.add(new Prisma.Decimal(f.total)), new Prisma.Decimal(0));
    let conIva = 0;
    for (const { nombre, filas } of CONJUNTOS) {
      const caja = derivarCaja(filas);
      const propias = filas.filter((f) => NATURALEZA_POR_CATEGORIA[f.categoria] === "propio");
      const ganancia = propias.filter((f) => !esIva(f));
      const iva = propias.filter(esIva);
      if (iva.length > 0) conIva += 1;
      const balance = derivarBalance(sumar(ganancia, "ingreso"), sumar(ganancia, "egreso"));
      const balanceIva = derivarBalance(sumar(iva, "ingreso"), sumar(iva, "egreso"));

      expect(caja.ganancia, nombre).toBe(balance.balance);
      expect(caja.signoGanancia, nombre).toBe(balance.signo);
      expect(caja.iva, nombre).toBe(balanceIva.balance);
      expect(caja.signoIva, nombre).toBe(balanceIva.signo);
    }
    // Control: hay conjuntos con IVA dentro (el de «solo dinero propio» y el catalogo entero).
    expect(conIva).toBeGreaterThanOrEqual(2);
  });

  it("R9: las dos derivaciones COEXISTEN — la nueva no sustituye a la vieja en el arbol", () => {
    // `derivarBalance` sigue teniendo consumidor vivo: la analitica financiera. Si un dia
    // alguien la borrase «porque ya esta derivarCaja», este assert lo dice antes que el build.
    const analitica = codigoSinComentarios("lib/services/AnaliticaFinancieraService.ts");
    expect(analitica).toContain("derivarBalance");
  });
});

describe("R9 — la suite de `derivarBalance` NO se edita", () => {
  it("R9: sigue siendo la misma suite, con sus seis casos originales", () => {
    // T A.5 se cumple demostrando que este archivo no aparece en el diff. Como un diff caduca
    // el dia que se mergea, aqui queda escrito lo que ese diff decia: los titulos exactos.
    const suite = leer(SUITE_BALANCE);
    expect(suite).toContain('from "@/lib/utils/wallet-balance"');
    const titulos = [...suite.matchAll(/\bit\("([^"]+)"/g)].map((m) => m[1]);
    expect(titulos).toEqual([
      "positivo: ingresos > egresos",
      "negativo: egresos > ingresos -> balance con signo",
      "cero: ingresos == egresos",
      "acepta Prisma.Decimal ademas de STRING",
      "Decimal exacto (sin drift): 0.10 + 0.20 - 0.30 = 0.00",
      "salida SIEMPRE STRING escala 2",
    ]);
    // Y no se le ha colado ni una asercion de la 173.
    expect(suite).not.toContain("derivarCaja");
  });
});
