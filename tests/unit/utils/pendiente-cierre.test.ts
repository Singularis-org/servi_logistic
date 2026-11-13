import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  derivarPagoEntregadoCierre,
  derivarPendienteCierre,
  type PendienteCierreInput,
} from "@/lib/utils/pendiente-cierre";
import { calcularSplitPago } from "@/lib/utils/cuenta-por-pagar";

// Feature 172 / T A.4 — derivacion PURA del pendiente de un cierre. Cubre R22 (el pendiente se
// deriva de P, E y los pagos VIGENTES, en el servidor), R24 (un pago parcial baja el pendiente
// exactamente en su monto y R80 (un pago anulado NO descuenta).
//
// Feature 293 / T2.1 — la funcion gana un TERMINO (`premiosVivos`) y una FIRMA POR OBJETO.
// Los casos de la 172 siguen aqui intactos, con `premiosVivos: "0.00"`, y esa es la
// no-regresion: el dia que alguien cambie la formula, estos numeros —que son los que el sistema
// lleva dando desde la 172— cambian con el. Los bloques nuevos cubren 293/R24 y 293/R25.
//
// Money-safe: montos como STRING de extremo a extremo. En este archivo no hay ni un `Number(`
// ni un `parseFloat` sobre un monto, y el ultimo bloque afirma lo mismo del modulo.

/** Atajo de los casos de la 172: sin premio, la firma nueva dice exactamente lo de antes. */
function sinPremio(
  pagoDebido: string,
  efectivo: string,
  pagadoVigente: string,
): string {
  return derivarPendienteCierre({
    pagoDebido,
    efectivo,
    premiosVivos: "0.00",
    pagadoVigente,
    pagoIndependienteEfectivo: false, // SLT-123: los casos de la 172 son de la regla vieja
  });
}

describe("R22 — el pendiente sale de min(P, E) menos lo ya entregado", () => {
  it("sin efectivo recaudado (E = 0), el cierre debe el pago entero", () => {
    expect(sinPremio("50000.00", "0.00", "0.00")).toBe("50000.00");
    expect(sinPremio("12345.67", "0", "0")).toBe("12345.67");
  });

  it("con efectivo suficiente (E >= P), no queda nada pendiente", () => {
    expect(sinPremio("50000.00", "50000.00", "0.00")).toBe("0.00");
    expect(sinPremio("50000.00", "90000.00", "0.00")).toBe("0.00");
    // FRONTERA: un centimo por debajo de P si deja pendiente, y es exactamente ese centimo.
    expect(sinPremio("50000.00", "49999.99", "0.00")).toBe("0.01");
  });

  it("un cierre que no devengo nada (P = 0) no debe nada", () => {
    expect(sinPremio("0.00", "0.00", "0.00")).toBe("0.00");
    expect(sinPremio("0.00", "80000.00", "0.00")).toBe("0.00");
  });

  it("reutiliza calcularSplitPago: sin pagos registrados coincide con su `pendiente`", () => {
    // Es la contraprueba de que `min(P, E)` NO se reimplementa aqui: si esta funcion tuviera su
    // propia version de la regla, estos pares dejarian de coincidir en cuanto una de las dos
    // cambiara.
    const casos: [string, string][] = [
      ["50000.00", "0.00"],
      ["50000.00", "20000.00"],
      ["50000.00", "50000.00"],
      ["50000.00", "70000.00"],
      ["0.00", "0.00"],
      ["0.01", "0.00"],
    ];
    for (const [P, E] of casos) {
      expect(sinPremio(P, E, "0.00")).toBe(calcularSplitPago(P, E).pendiente);
    }
  });
});

describe("R24 — los pagos parciales bajan el pendiente exactamente en su monto", () => {
  it("un pago parcial deja pendiente el resto, al centimo", () => {
    // P = 50 000, E = 20 000 -> el cierre genero 30 000 de cuenta por pagar.
    expect(sinPremio("50000.00", "20000.00", "0.00")).toBe("30000.00");
    expect(sinPremio("50000.00", "20000.00", "10000.00")).toBe("20000.00");
    expect(sinPremio("50000.00", "20000.00", "29999.99")).toBe("0.01");
  });

  it("los pagos parciales se acumulan: tres entregas saldan el cierre", () => {
    const P = "30000.00";
    const E = "0.00";
    expect(sinPremio(P, E, "10000.00")).toBe("20000.00");
    expect(sinPremio(P, E, "20000.00")).toBe("10000.00");
    expect(sinPremio(P, E, "30000.00")).toBe("0.00");
  });

  it("con centimos, la resta es exacta (lo que un float redondearia mal)", () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004; con Decimal, 30000.00 - 0.30 es exacto.
    expect(sinPremio("30000.00", "0.00", "0.30")).toBe("29999.70");
    expect(sinPremio("0.30", "0.00", "0.10")).toBe("0.20");
    expect(sinPremio("0.30", "0.00", "0.30")).toBe("0.00");
  });
});

describe("R80 — un pago anulado no descuenta", () => {
  it("al anular, el pendiente vuelve EXACTAMENTE al valor que tenia antes de ese pago", () => {
    const P = "50000.00";
    const E = "0.00";
    // `pagadoVigente` es la suma de pagos VIGENTES. Anular saca ese pago de la suma.
    const antesDelPago = sinPremio(P, E, "0.00");
    const conElPagoVigente = sinPremio(P, E, "20000.00");
    const trasAnularlo = sinPremio(P, E, "0.00");

    expect(antesDelPago).toBe("50000.00");
    expect(conElPagoVigente).toBe("30000.00");
    expect(trasAnularlo).toBe(antesDelPago); // R71/R79: el monto vuelve a estar adeudado.
  });

  it("con dos pagos y uno anulado, solo descuenta el vigente", () => {
    // Dos pagos de 20 000; el segundo se anula -> la suma de vigentes es 20 000, no 40 000.
    expect(sinPremio("50000.00", "0.00", "40000.00")).toBe("10000.00");
    expect(sinPremio("50000.00", "0.00", "20000.00")).toBe("30000.00");
  });
});

describe("el pendiente nunca es negativo", () => {
  it.each([
    ["pagado por encima de lo debido", "30000.00", "0.00", "45000.00"],
    ["pagado justo al limite", "30000.00", "0.00", "30000.00"],
    ["el efectivo ya cubria todo y ademas hay un pago", "30000.00", "30000.00", "5000.00"],
    ["un centimo de mas", "30000.00", "0.00", "30000.01"],
  ])("%s -> 0.00, nunca una deuda al reves", (_caso, P, E, pagado) => {
    expect(sinPremio(P, E, pagado)).toBe("0.00");
  });
});

// ── Feature 293 (T2.1) — el termino nuevo ───────────────────────────────────────────────────

describe("293/R24 — lo pagable de un cierre SUMA los premios vivos imputados a el", () => {
  it("un cierre SALDADO al que se le imputa un premio vuelve a deber EXACTAMENTE el premio", () => {
    // Es el caso de borde 2 de la ficha (R27) y el que se va a ver el primer dia en produccion,
    // donde hoy todos los cierres tienen P = 0,00 y salen «saldados».
    expect(
      derivarPendienteCierre({
        pagoDebido: "0.00",
        efectivo: "0.00",
        premiosVivos: "5000.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("5000.00");
    // Y un cierre ya pagado por completo (P = 30 000 entregados) tambien vuelve a deber.
    expect(
      derivarPendienteCierre({
        pagoDebido: "30000.00",
        efectivo: "0.00",
        premiosVivos: "5000.00",
        pagadoVigente: "30000.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("5000.00");
  });

  it("el premio se SUMA a lo que el cierre ya debia, no lo sustituye", () => {
    // P = 50 000, E = 20 000 -> 30 000 de deuda propia del cierre; + 5 000 de premio.
    expect(
      derivarPendienteCierre({
        pagoDebido: "50000.00",
        efectivo: "20000.00",
        premiosVivos: "5000.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("35000.00");
  });

  it("un pago parcial descuenta de la suma de las dos deudas, al centimo", () => {
    expect(
      derivarPendienteCierre({
        pagoDebido: "50000.00",
        efectivo: "20000.00",
        premiosVivos: "5000.00",
        pagadoVigente: "34999.99",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("0.01");
    expect(
      derivarPendienteCierre({
        pagoDebido: "50000.00",
        efectivo: "20000.00",
        premiosVivos: "5000.00",
        pagadoVigente: "35000.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("0.00");
  });

  it("anular el premio (premiosVivos vuelve a 0) devuelve el cierre a como estaba (R33)", () => {
    const entrada = {
      pagoDebido: "30000.00",
      efectivo: "0.00",
      pagadoVigente: "30000.00",
      pagoIndependienteEfectivo: false as const,
    };
    const saldado = derivarPendienteCierre({ ...entrada, premiosVivos: "0.00" });
    const conPremio = derivarPendienteCierre({ ...entrada, premiosVivos: "5000.00" });
    // `premiosVivos` llega YA NETO: el repositorio resta la compensacion de la anulacion.
    const trasAnular = derivarPendienteCierre({ ...entrada, premiosVivos: "0.00" });

    expect(saldado).toBe("0.00");
    expect(conPremio).toBe("5000.00");
    expect(trasAnular).toBe(saldado);
  });

  it("con centimos, la suma del premio tambien es exacta", () => {
    expect(
      derivarPendienteCierre({
        pagoDebido: "0.30",
        efectivo: "0.00",
        premiosVivos: "0.10",
        pagadoVigente: "0.20",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("0.20");
  });
});

describe("293/R25 — el premio queda FUERA de la regla min(P, E)", () => {
  it("con E >= P (cierre saldado por el efectivo del dia) el premio NO se da por entregado", () => {
    // ES EL CASO QUE DISTINGUE ESTA REGLA DE LA ALTERNATIVA D (`design.md §11`): si el premio se
    // sumara DENTRO de `calcularSplitPago` (`P + premio` contra `E`), con efectivo de sobra
    // saldria `0.00` — el mensajero se quedaria sin su premio y nadie veria un error.
    const conEfectivoDeSobra = derivarPendienteCierre({
      pagoDebido: "30000.00",
      efectivo: "90000.00",
      premiosVivos: "5000.00",
      pagadoVigente: "0.00",
      pagoIndependienteEfectivo: false,
    });
    expect(conEfectivoDeSobra).toBe("5000.00");
    // Y la contraprueba de que la alternativa D daria otra cosa: metido dentro, `min(35000,
    // 90000) = 35000` y el pendiente seria CERO.
    expect(calcularSplitPago("35000.00", "90000.00").pendiente).toBe("0.00");
    expect(conEfectivoDeSobra).not.toBe(calcularSplitPago("35000.00", "90000.00").pendiente);
  });

  it("`calcularSplitPago` sigue viendo SOLO P y E: el premio no le llega por ningun lado", () => {
    // El `min(P,E)` que el feed escribio al aprobar el cierre no puede cambiar a posteriori.
    // P = 30 000, E = 12 000 -> la deuda PROPIA del cierre es 18 000, y es la misma con premio
    // y sin el. Las tres cifras esperadas van como LITERAL, no derivadas de la funcion bajo
    // prueba: una asercion contra su propia fuente siempre esta verde.
    expect(calcularSplitPago("30000.00", "12000.00").pendiente).toBe("18000.00");
    const casos: [string, string][] = [
      ["0.00", "18000.00"],
      ["5000.00", "23000.00"],
      ["999999.99", "1017999.99"],
    ];
    for (const [premio, esperado] of casos) {
      expect(
        derivarPendienteCierre({
          pagoDebido: "30000.00",
          efectivo: "12000.00",
          premiosVivos: premio,
          pagadoVigente: "0.00",
          pagoIndependienteEfectivo: false,
        }),
      ).toBe(esperado);
    }
  });
});

describe("money-safe — el modulo no toca coma flotante", () => {
  it("no contiene Number( ni parseFloat, y reutiliza calcularSplitPago", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "lib", "utils", "pendiente-cierre.ts"),
      "utf8",
    );
    expect(fuente).not.toMatch(/parseFloat/);
    expect(fuente).not.toMatch(/Number\(/);
    expect(fuente).not.toMatch(/Math\.min/);
    expect(fuente).toMatch(/import \{ calcularSplitPago \} from "@\/lib\/utils\/cuenta-por-pagar";/);
    expect(fuente).toMatch(/Prisma\.Decimal/);
  });

  it("devuelve SIEMPRE un string con 2 decimales, tambien con entradas Decimal", () => {
    const salida = sinPremio("100", "0", "0");
    expect(typeof salida).toBe("string");
    expect(salida).toBe("100.00");
    expect(sinPremio("100.5", "0", "0.25")).toBe("100.25");
    // Y con el premio dentro, la escala se mantiene.
    expect(
      derivarPendienteCierre({
        pagoDebido: "100",
        efectivo: "0",
        premiosVivos: "0.5",
        pagadoVigente: "0.25",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("100.25");
  });
});

// ── SLT-123 (T4.1) — la marca del cierre decide la regla ───────────────────────────────────────
//
// La tabla de `specs/SLT-123-pago-independiente-efectivo/tasks.md > T4.1`, con los importes
// ESCRITOS A MANO: nunca derivados de `calcularSplitPago` ni de la funcion bajo prueba (una
// asercion contra su propia fuente siempre esta verde). Filas 1-2: la regla de la 44 sigue intacta
// (R325). Filas 3-6: con la marca, lo generado es `P` completo y el efectivo no entra (R315).

describe("SLT-123 R315/R325/R327 — la marca `pagoIndependienteEfectivo` decide la regla", () => {
  it.each([
    // [#, marca, P, E, premios, vigentes, esperado]
    ["1", false, "3000.00", "1000.00", "0.00", "0.00", "2000.00"],
    ["2", false, "3000.00", "5000.00", "0.00", "0.00", "0.00"],
    ["3", true, "3000.00", "5000.00", "0.00", "0.00", "3000.00"],
    ["4", true, "3000.00", "0.00", "500.00", "1000.00", "2500.00"],
    ["5", true, "3000.00", "0.00", "0.00", "3500.00", "0.00"],
    ["6", true, "0.00", "1000.00", "0.00", "0.00", "0.00"],
  ] as const)(
    "fila %s: marca %s, P %s, E %s, premios %s, vigentes %s -> %s",
    (_fila, marca, P, E, premios, vigentes, esperado) => {
      expect(
        derivarPendienteCierre({
          pagoDebido: P,
          efectivo: E,
          premiosVivos: premios,
          pagadoVigente: vigentes,
          pagoIndependienteEfectivo: marca,
          pagadoPorSatelite: "0.00", // SLT-139: nada pagado por la satelite; la regla de SLT-123 intacta
        }),
      ).toBe(esperado);
    },
  );

  it("con la marca, el efectivo no mueve lo pendiente: E = 0, E < P y E > P dan lo mismo", () => {
    for (const E of ["0.00", "1000.00", "2999.99", "3000.00", "90000.00"]) {
      expect(
        derivarPendienteCierre({
          pagoDebido: "3000.00",
          efectivo: E,
          premiosVivos: "0.00",
          pagadoVigente: "0.00",
          pagoIndependienteEfectivo: true,
          pagadoPorSatelite: "0.00",
        }),
      ).toBe("3000.00");
    }
  });

  it("con la marca, P con mas de dos decimales se redondea igual que en la regla vieja", () => {
    // 3000.005 -> 3000.01 (ROUND_HALF_UP), el mismo redondeo que `calcularSplitPago` aplica a P.
    expect(
      derivarPendienteCierre({
        pagoDebido: "3000.005",
        efectivo: "0.00",
        premiosVivos: "0.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: true,
        pagadoPorSatelite: "0.00",
      }),
    ).toBe("3000.01");
  });

  it("R332: la rama nueva tampoco toca coma flotante (lee el archivo)", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "lib", "utils", "pendiente-cierre.ts"),
      "utf8",
    );
    // La rama de la marca existe y trabaja con `Prisma.Decimal` y redondeo explicito.
    expect(fuente).toMatch(/pagoIndependienteEfectivo\s*\n?\s*\?\s*new Prisma\.Decimal\(pagoDebido\)\.toDecimalPlaces\(2, Prisma\.Decimal\.ROUND_HALF_UP\)/);
    // Y en todo el modulo, ni `Number(`, ni `parseFloat`, ni `+x`/`Math`, ni `toNumber`.
    expect(fuente).not.toMatch(/Number\(|parseFloat|Math\.|toNumber\(/);
  });
});

// ── SLT-139 (T4.1) — lo pagado por la satelite (R338, R343) ─────────────────────────────────────
//
// La tabla de `specs/SLT-139-pago-independiente-satelite/tasks.md > T4.1`, importes ESCRITOS A MANO.
// Filas 7-11: con la marca, lo pagado por la satelite se RESTA (nunca por debajo de 0). Fila 12: sin
// la marca se IGNORA aunque venga distinto de cero (la regla de la 44 queda igual).

describe("SLT-139 R338 — en un cierre nuevo, lo pagado por la satelite se resta", () => {
  it.each([
    // [#, marca, P, E, premios, vigentes, pagado satelite, esperado]
    ["7", true, "2500.00", "4000.00", "0.00", "0.00", "0.00", "2500.00"],
    ["8", true, "2500.00", "4000.00", "0.00", "0.00", "2500.00", "0.00"],
    ["9", true, "2500.00", "0.00", "300.00", "0.00", "2500.00", "300.00"],
    ["10", true, "2500.00", "0.00", "0.00", "0.00", "1000.00", "1500.00"],
    ["11", true, "2500.00", "0.00", "0.00", "0.00", "3000.00", "0.00"],
    ["12", false, "3000.00", "1000.00", "0.00", "0.00", "1500.00", "2000.00"],
  ] as const)(
    "fila %s: marca %s, P %s, E %s, premios %s, vigentes %s, satelite %s -> %s",
    (_fila, marca, P, E, premios, vigentes, satelite, esperado) => {
      expect(
        derivarPendienteCierre({
          pagoDebido: P,
          efectivo: E,
          premiosVivos: premios,
          pagadoVigente: vigentes,
          pagoIndependienteEfectivo: marca,
          pagadoPorSatelite: satelite,
        }),
      ).toBe(esperado);
    },
  );

  it("el tipo: una marca `boolean` sin `pagadoPorSatelite` no compila; `false` literal si", () => {
    // Una marca leida de una fila: `boolean`, sin el estrechamiento de un literal.
    const leerMarca = (fila: { m: boolean }): boolean => fila.m;
    const marca = leerMarca({ m: true });
    const base = { pagoDebido: "2500.00", efectivo: "0.00", premiosVivos: "0.00", pagadoVigente: "0.00" };
    // @ts-expect-error SLT-139 (design §5.1): con la marca como `boolean`, el termino es obligatorio.
    const sinTermino: PendienteCierreInput = { ...base, pagoIndependienteEfectivo: marca };
    // @ts-expect-error SLT-139: con la marca en `true`, tambien.
    const nuevoSinTermino: PendienteCierreInput = { ...base, pagoIndependienteEfectivo: true };
    const viejo: PendienteCierreInput = { ...base, pagoIndependienteEfectivo: false };
    void sinTermino;
    void nuevoSinTermino;
    expect(derivarPendienteCierre(viejo)).toBe("2500.00");
  });

  it("toda llamada a derivarPendienteCierre en lib/ nombra pagadoPorSatelite (o la regla de su cierre)", () => {
    const raiz = path.join(__dirname, "..", "..", "..", "lib");
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.tsx?$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(raiz);
    const llamadas: string[] = [];
    for (const archivo of archivos) {
      if (archivo.endsWith(path.join("utils", "pendiente-cierre.ts"))) continue;
      const fuente = fs.readFileSync(archivo, "utf8");
      let i = fuente.indexOf("derivarPendienteCierre({");
      while (i >= 0) {
        // El objeto de la llamada, hasta su `})` de cierre.
        const fin = fuente.indexOf("})", i);
        llamadas.push(`${path.basename(archivo)}: ${fuente.slice(i, fin)}`);
        i = fuente.indexOf("derivarPendienteCierre({", fin);
      }
    }
    // Los seis consumidores de produccion (design §5.3).
    expect(llamadas).toHaveLength(6);
    for (const l of llamadas) expect(l, l.slice(0, 80)).toMatch(/pagadoPorSatelite|reglaDelCierre\(/);
  });

  it("R343: ni pendiente-cierre ni el feed ni la consolidacion ni CierreDiaService tocan coma flotante", () => {
    const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const rel of [
      ["lib", "utils", "pendiente-cierre.ts"],
      ["lib", "services", "WalletMensajeroFeedService.ts"],
      ["lib", "services", "CierreBodegaService.ts"],
      ["lib", "services", "CierreDiaService.ts"],
    ]) {
      const fuente = sinComentarios(fs.readFileSync(path.join(__dirname, "..", "..", "..", ...rel), "utf8"));
      expect(fuente.length, rel.join("/")).toBeGreaterThan(500);
      expect(fuente, rel.join("/")).not.toMatch(/Number\(|parseFloat|Math\.|toNumber\(/);
    }
    // Y el termino de la satelite trabaja con `Prisma.Decimal` y redondeo explicito.
    const pendiente = fs.readFileSync(path.join(__dirname, "..", "..", "..", "lib", "utils", "pendiente-cierre.ts"), "utf8");
    expect(pendiente).toMatch(/new Prisma\.Decimal\(input\.pagadoPorSatelite\)\.toDecimalPlaces\(2, Prisma\.Decimal\.ROUND_HALF_UP\)/);
  });
});

// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (R382, PA1 del 2026-11-12) —
// «Pago entregado» = (P + premios vivos) − pendiente, de la MISMA entrada que el pendiente. Cifras
// escritas a mano: son el contrato.
describe("SLT-140 R382 — «Pago entregado» = (P + premios vivos) − pendiente", () => {
  it("(a) con la marca: P 3 000,00 y un pago de 1 200,00 → entregado 1 200,00", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "70000.00",
        premiosVivos: "0.00",
        pagadoVigente: "1200.00",
        pagoIndependienteEfectivo: true,
        pagadoPorSatelite: "0.00",
      }),
    ).toBe("1200.00");
  });

  it("(b) sin la marca: P 3 000,00 con E 70 000,00 y nada pagado → el efectivo lo cubrio: 3 000,00", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "70000.00",
        premiosVivos: "0.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("3000.00");
  });

  it("(b') sin la marca y E por debajo de P: lo entregado es min(P, E) = 1 000,00", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "1000.00",
        premiosVivos: "0.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: false,
      }),
    ).toBe("1000.00");
  });

  it("(c) con la marca, P 3 000,00 y un premio de 500,00 sin pagar → 0,00 (sin los premios daria −500,00)", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "70000.00",
        premiosVivos: "500.00",
        pagadoVigente: "0.00",
        pagoIndependienteEfectivo: true,
        pagadoPorSatelite: "0.00",
      }),
    ).toBe("0.00");
  });

  it("(d) pagado de mas → P + premios, nunca mas", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "70000.00",
        premiosVivos: "500.00",
        pagadoVigente: "9000.00",
        pagoIndependienteEfectivo: true,
        pagadoPorSatelite: "0.00",
      }),
    ).toBe("3500.00");
  });

  it("(e) lo pagado por la satelite (SLT-139) cuenta como entregado: 700,00 + 1 000,00 = 1 700,00", () => {
    expect(
      derivarPagoEntregadoCierre({
        pagoDebido: "3000.00",
        efectivo: "70000.00",
        premiosVivos: "0.00",
        pagadoVigente: "700.00",
        pagoIndependienteEfectivo: true,
        pagadoPorSatelite: "1000.00",
      }),
    ).toBe("1700.00");
  });

  it("entregado + pendiente = P + premios en el caso del premio pagado a medias", () => {
    const entrada: PendienteCierreInput = {
      pagoDebido: "3000.00",
      efectivo: "70000.00",
      premiosVivos: "500.00",
      pagadoVigente: "3200.00",
      pagoIndependienteEfectivo: true,
      pagadoPorSatelite: "0.00",
    };
    expect(derivarPendienteCierre(entrada)).toBe("300.00");
    expect(derivarPagoEntregadoCierre(entrada)).toBe("3200.00");
  });
});
