import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

/**
 * ⭑ SLT-56 / T3 (R16) — GUARDIA MONEY-SAFE del ajuste del pago al mensajero.
 *
 * El ajuste valida, compara y suma importes de lo que cobra una persona. R16 exige que no pasen por
 * coma flotante EN NINGUN PUNTO: un `Number(...)` intermedio empata dos importes que difieren en un
 * centimo (y el ajuste sale `sin_cambio` cuando no lo es) o suma mal el total del cierre.
 *
 * Vigila DOS piezas, acotadas a proposito (patron `pago-mensajero-money-safe`, ficha 380):
 *   · el modulo puro `lib/utils/ajuste-pago-mensajero.ts`, ENTERO;
 *   · el CUERPO del metodo `ajustarPagoMensajeroEnCierre` de `CierresAdminRepository.ts`, y no el
 *     archivo: otros metodos de ese repositorio no son de esta ficha y una guardia a nivel de archivo
 *     naceria con excepciones.
 *
 * Sobre el fuente SIN COMENTARIOS (los comentarios nombran a proposito lo prohibido) y con
 * CONTRAPRUEBA: una guardia estatica rota no falla, CALLA.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const MODULO = "lib/utils/ajuste-pago-mensajero.ts";
const REPOSITORIO = "lib/repositories/CierresAdminRepository.ts";
const METODO = "ajustarPagoMensajeroEnCierre";

const CONVERSIONES_PROHIBIDAS: readonly { readonly nombre: string; readonly patron: RegExp }[] = [
  { nombre: "Number(", patron: /\bNumber\s*\(/ },
  { nombre: "parseFloat(", patron: /\bparseFloat\s*\(/ },
  { nombre: "parseInt(", patron: /\bparseInt\s*\(/ },
  { nombre: ".toNumber(", patron: /\.toNumber\s*\(/ },
  { nombre: "Number.parseFloat/parseInt", patron: /\bNumber\.parse(?:Float|Int)\s*\(/ },
  { nombre: "+pago (unario)", patron: /[^\w)\]]\+\s*(?:\w+\.)?pago\w*\b/ },
];

function reventar(que: string): never {
  throw new Error(
    `guardia ajuste-pago-mensajero-money-safe: ${que}. La guardia NO pudo leer lo que vigila; se ` +
      `detiene en ROJO en vez de dar por buena una lectura vacia.`,
  );
}

function codigo(rel: string): string {
  const ruta = path.join(RAIZ, rel);
  if (!existsSync(ruta)) reventar(`falta \`${rel}\``);
  const fuente = readFileSync(ruta, "utf8");
  if (fuente.trim().length === 0) reventar(`\`${rel}\` se leyo en blanco`);
  return quitarComentarios(fuente);
}

/**
 * El cuerpo de un metodo de clase: desde `async <metodo>(` hasta la llave que cierra su bloque,
 * contando llaves. Basta para este repositorio (sin llaves dentro de cadenas en ese metodo); si el
 * recorte fallara, `reventar`.
 */
function cuerpoDelMetodo(fuente: string, metodo: string): string {
  const inicio = fuente.search(new RegExp(`\\basync\\s+${metodo}\\s*\\(`));
  if (inicio < 0) reventar(`no se encontro el metodo \`${metodo}\``);
  // La primera llave tras el tipo de retorno: la firma no lleva llaves.
  const abre = fuente.indexOf("{", fuente.indexOf("Promise<", inicio));
  if (abre < 0) reventar(`no se encontro el cuerpo de \`${metodo}\``);
  let nivel = 0;
  for (let i = abre; i < fuente.length; i += 1) {
    if (fuente[i] === "{") nivel += 1;
    if (fuente[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fuente.slice(inicio, i + 1);
    }
  }
  return reventar(`el cuerpo de \`${metodo}\` no cierra`);
}

function hallazgosEn(fuente: string, etiqueta: string): string[] {
  return CONVERSIONES_PROHIBIDAS.filter((p) => p.patron.test(fuente)).map((p) => `${etiqueta}: ${p.nombre}`);
}

describe("(0) autocomprobacion — la guardia lee algo y sus detectores detectan", () => {
  it("el modulo existe y compara en Decimal", () => {
    const fuente = codigo(MODULO);
    expect(fuente).toMatch(/\bvalidarAjustePago\b/);
    expect(fuente).toMatch(/Prisma\.Decimal/);
    expect(fuente).toMatch(/\.equals\(/);
  });

  it("el metodo del repositorio se recorta y es el que escribe el ajuste", () => {
    const cuerpo = cuerpoDelMetodo(codigo(REPOSITORIO), METODO);
    expect(cuerpo.length).toBeGreaterThan(500);
    expect(cuerpo).toMatch(/gestionPagoMensajeroAjuste\.create\(/);
    expect(cuerpo).toMatch(/sumarSnapshotsCongelados\(/);
    // Y no se comio el metodo siguiente.
    expect(cuerpo).not.toMatch(/\basync\s+resolverCierre\s*\(/);
  });

  it("⭑ CONTRAPRUEBA: el detector VE cada conversion prohibida cuando se le inyecta", () => {
    const inyecciones = [
      "const n = Number(pagoNuevo);",
      "const n = parseFloat(pagoNuevo);",
      "const n = parseInt(pagoNuevo);",
      "const n = g.pagoMensajero.toNumber();",
      "const n = Number.parseFloat(pagoNuevo);",
      "const n = +pagoNuevo;",
    ];
    for (const linea of inyecciones) {
      expect(hallazgosEn(linea, "inyeccion"), `el detector NO vio: ${linea}`).not.toEqual([]);
    }
  });

  it("⭑ CONTRAPRUEBA: inyectada en el cuerpo del metodo, la guardia la ve", () => {
    const fuente = codigo(REPOSITORIO).replace(
      /(async\s+ajustarPagoMensajeroEnCierre\s*\([\s\S]*?\{)/,
      "$1\n    const x = Number(pagoNuevo);",
    );
    expect(hallazgosEn(cuerpoDelMetodo(fuente, METODO), METODO)).toEqual([`${METODO}: Number(`]);
  });

  it("y NO marca lo correcto: transportar, comparar o serializar con `Decimal`", () => {
    const legitimas = [
      "pagoMensajero: new Prisma.Decimal(pagoNuevo),",
      "pagoMensajero: ajuste.pagoNuevo.toFixed(2),",
      "if (new Prisma.Decimal(pagoNuevo).equals(vigente)) return \"sin_cambio\";",
      "total = total.plus(valor);",
    ];
    for (const linea of legitimas) {
      expect(hallazgosEn(linea, "legitima"), `falso positivo en: ${linea}`).toEqual([]);
    }
  });
});

describe("SLT-56/R16 — el ajuste no convierte un importe a coma flotante", () => {
  it("⭑ el modulo de validacion: ni `Number(`, ni `parseFloat(`, ni `.toNumber(`", () => {
    expect(hallazgosEn(codigo(MODULO), MODULO)).toEqual([]);
  });

  it("⭑ el metodo del repositorio: ni `Number(`, ni `parseFloat(`, ni `.toNumber(`", () => {
    expect(hallazgosEn(cuerpoDelMetodo(codigo(REPOSITORIO), METODO), METODO)).toEqual([]);
  });

  it("⭑ CONTROL POSITIVO: el repositorio escribe con `Prisma.Decimal` y serializa con `toFixed(2)`", () => {
    const cuerpo = cuerpoDelMetodo(codigo(REPOSITORIO), METODO);
    expect(cuerpo).toMatch(/new Prisma\.Decimal\(pagoNuevo\)/);
    expect(cuerpo).toMatch(/new Prisma\.Decimal\(pagoAnterior\)/);
    expect(cuerpo).toMatch(/\.toFixed\(2\)/);
  });
});
