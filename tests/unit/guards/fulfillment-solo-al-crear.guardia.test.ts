import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { TRANSICIONES } from "@/lib/types/order-status-transiciones";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-94 (design §5, R25, R30, R40) — EL COBRO DE FULFILLMENT LO ESCRIBE SOLO LA BASE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PROTEGE. El cobro de fulfillment por paquete, su IVA y sus devoluciones los escriben los
// triggers de M4 (`20261108120300_slt94_fulfillment_triggers`) al crear, eliminar, restaurar o
// cancelar por API una orden. Es dinero de la tienda: una segunda vía desde la app cobraría dos
// veces o devolvería sin cobro, y en `comoPlataforma` nada lo frenaría. Esta guardia lo convierte
// en un rojo al escribirlo:
//   (a) ningún archivo de `lib/` ni de `app/` asigna una categoría nueva de fulfillment ni el
//       origen `orden_fulfillment` a un movimiento (lo que haría falta para pasarlo a un
//       `crearMovimientos`), ni escribe en `orden_fulfillment_movimiento`;
//   (b) el campo Prisma `fulfillmentRetirado` y el SQL `"fulfillment" =` sobre `usuario` (la marca
//       vieja, retirada por D4) no aparecen en `lib/` ni `app/`;
//   (c) `resolverDestinoCreacion(` solo recibe la marca «se recoge en tienda» (negada), nunca el
//       valor de fulfillment (D5: cobro y marca son independientes, R18);
//   (R40) `devolviendo_a_tienda` solo sale al terminal `devuelta_a_tienda` (no hay des-cancelar,
//       y por tanto no hay re-cobro sin decidir), y `"cancelacion_api"` como origen del historial
//       solo lo escribe `OrdenRepository.cancelarViaApi` (el trigger de cancelación lo lee: otra
//       vía que lo escribiera devolvería el cobro sin ser una cancelación).
//
// CON AUTOCOMPROBACIÓN: cada detector, sobre material sintético que infringe, tiene que encontrar
// el hallazgo. Sin ella, un detector roto que no encontrara nada dejaría la guardia verde siempre.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

/** Las ocho categorías de libro que añade SLT-94 (M1). Solo las escribe el trigger. */
const CATEGORIAS_NUEVAS = [
  "fulfillment",
  "iva_fulfillment",
  "fulfillment_anulado",
  "iva_fulfillment_anulado",
  "ingreso_fulfillment",
  "ingreso_iva_fulfillment",
  "egreso_reverso_fulfillment",
  "egreso_reverso_iva_fulfillment",
] as const;

const ALT_CATEGORIAS = CATEGORIAS_NUEVAS.join("|");
// (a) Asignar categoría nueva u origen `orden_fulfillment` a un movimiento (objeto TS o SQL).
const ASIGNA_CATEGORIA = new RegExp(`\\bcategoria\\s*:\\s*["'\`](?:${ALT_CATEGORIAS})["'\`]`);
const ASIGNA_ORIGEN = /\b(?:origenTipo|origen_tipo)\s*:\s*["'`]orden_fulfillment["'`]/;
// En SQL a mano, el valor va entre comillas simples (las 7 inequívocas + el origen; `'fulfillment'`
// a secas choca con otros usos y lo cubre la regla del objeto).
const LITERAL_SQL = new RegExp(
  `'(?:${CATEGORIAS_NUEVAS.filter((c) => c !== "fulfillment").join("|")}|orden_fulfillment)'`,
);
const ESCRITURA_PRISMA_COBRO = /\bordenFulfillmentMovimiento\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/;
const ESCRITURA_SQL_COBRO = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?orden_fulfillment_movimiento\b/i;

// (b) La marca vieja.
const CAMPO_RETIRADO = /\bfulfillmentRetirado\b/;
const SQL_MARCA_VIEJA = /"fulfillment"\s*(?:=(?!=)|<>|!=|\bIS\b)/i;

// (c) Llamadas a `resolverDestinoCreacion(` (no la declaración).
const LLAMADA_DESTINO = /(?<!function\s)\bresolverDestinoCreacion\s*\(([^)]*)\)/g;
const ARGUMENTO_VALIDO = /^\s*!\s*(?:[\w$]+\.)*seRecogeEnTienda\s*$/;

/** Hallazgos «línea: texto» de (a) en un fuente ya sin comentarios. */
function escriturasDeCobro(codigo: string): string[] {
  const hallazgos: string[] = [];
  codigo.split("\n").forEach((linea, i) => {
    if (
      ASIGNA_CATEGORIA.test(linea) ||
      ASIGNA_ORIGEN.test(linea) ||
      LITERAL_SQL.test(linea) ||
      ESCRITURA_PRISMA_COBRO.test(linea) ||
      ESCRITURA_SQL_COBRO.test(linea)
    ) {
      hallazgos.push(`${i + 1}: ${linea.trim()}`);
    }
  });
  return hallazgos;
}

/** Hallazgos «línea: texto» de (b). */
function usosDeLaMarcaVieja(codigo: string): string[] {
  const hallazgos: string[] = [];
  codigo.split("\n").forEach((linea, i) => {
    if (CAMPO_RETIRADO.test(linea) || SQL_MARCA_VIEJA.test(linea)) hallazgos.push(`${i + 1}: ${linea.trim()}`);
  });
  return hallazgos;
}

/** Argumentos de cada llamada a `resolverDestinoCreacion(`, y cuáles no son la marca negada. */
function llamadasADestino(codigo: string): { argumentos: string[]; invalidas: string[] } {
  const argumentos = [...codigo.matchAll(LLAMADA_DESTINO)].map((m) => m[1]);
  return { argumentos, invalidas: argumentos.filter((a) => !ARGUMENTO_VALIDO.test(a)) };
}

const LITERAL_CANCELACION = /["'`]cancelacion_api["'`]/g;

/**
 * Cuerpo del método `cancelarViaApi` del repositorio: desde su firma hasta el cierre del método
 * con la sangría de clase (`\n  }\n`).
 */
function cuerpoDeCancelarViaApi(codigo: string): string | null {
  const inicio = codigo.indexOf("async cancelarViaApi(");
  if (inicio < 0) return null;
  const fin = codigo.indexOf("\n  }\n", inicio);
  return fin < 0 ? null : codigo.slice(inicio, fin);
}

/**
 * R40: dónde aparece el literal `"cancelacion_api"` fuera de los sitios permitidos. Permitidos:
 * el catálogo del enum (`lib/types/orden-historial.ts`), el `via` de las aristas declarativas
 * (`lib/types/order-status-transiciones.ts`, solo en líneas `via:`) y exactamente UNA vez dentro de
 * `OrdenRepository.cancelarViaApi`.
 */
function cancelacionFueraDeSitio(fuentes: readonly { ruta: string; codigo: string }[]): string[] {
  const fallos: string[] = [];
  for (const { ruta, codigo } of fuentes) {
    const total = (codigo.match(LITERAL_CANCELACION) ?? []).length;
    // El repositorio se mira aunque no tenga ninguna: perder el escritor también es rojo.
    if (total === 0 && ruta !== "lib/repositories/OrdenRepository.ts") continue;
    if (ruta === "lib/types/orden-historial.ts") {
      if (total !== 1) fallos.push(`${ruta}: ${total} apariciones (el catálogo la declara una vez)`);
      continue;
    }
    if (ruta === "lib/types/order-status-transiciones.ts") {
      codigo.split("\n").forEach((linea, i) => {
        if (/["'`]cancelacion_api["'`]/.test(linea) && !/\bvia\s*:\s*["'`]cancelacion_api["'`]/.test(linea)) {
          fallos.push(`${ruta}:${i + 1}: ${linea.trim()}`);
        }
      });
      continue;
    }
    if (ruta === "lib/repositories/OrdenRepository.ts") {
      const cuerpo = cuerpoDeCancelarViaApi(codigo);
      const dentro = cuerpo ? (cuerpo.match(LITERAL_CANCELACION) ?? []).length : 0;
      const dentroComoOrigen = cuerpo ? /\borigenTipo\s*:\s*["'`]cancelacion_api["'`]/.test(cuerpo) : false;
      if (dentro !== 1 || !dentroComoOrigen) {
        fallos.push(`${ruta}: cancelarViaApi debe escribir origenTipo "cancelacion_api" exactamente una vez (hay ${dentro})`);
      }
      if (total !== dentro) fallos.push(`${ruta}: ${total - dentro} aparición(es) fuera de cancelarViaApi`);
      continue;
    }
    fallos.push(`${ruta}: ${total} aparición(es) de "cancelacion_api"`);
  }
  return fallos;
}

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDe(ruta));
    else if (EXTENSIONES.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");
const FUENTES = ARBOLES.flatMap((a) => archivosDe(path.join(RAIZ, a))).map((a) => ({
  ruta: relativa(a),
  codigo: quitarComentarios(readFileSync(a, "utf8").replace(/\r\n/g, "\n")),
}));
const fuente = (ruta: string) => FUENTES.find((f) => f.ruta === ruta);

// ── Autocomprobación ──────────────────────────────────────────────────────────────────────────

describe("SLT-94 — autocomprobación de los detectores", () => {
  it.each([
    '{ categoria: "fulfillment", monto }',
    "{ categoria: 'iva_fulfillment', monto }",
    '{ categoria: "fulfillment_anulado" }',
    '{ categoria: "iva_fulfillment_anulado" }',
    '{ categoria: "ingreso_fulfillment" }',
    '{ categoria: "ingreso_iva_fulfillment" }',
    '{ categoria: "egreso_reverso_fulfillment" }',
    '{ categoria: "egreso_reverso_iva_fulfillment" }',
    '{ origenTipo: "orden_fulfillment", origenId }',
    "VALUES ($1, 'ingreso_fulfillment'::wallet_movimiento_categoria)",
    "WHERE origen_tipo = 'orden_fulfillment'",
    "await tx.ordenFulfillmentMovimiento.create({ data })",
    "prisma.ordenFulfillmentMovimiento.updateMany({ where, data })",
    "prisma.ordenFulfillmentMovimiento?.deleteMany({})",
    'INSERT INTO "orden_fulfillment_movimiento" ("id") VALUES (1)',
    "delete from public.orden_fulfillment_movimiento",
  ])("(a) encuentra la escritura del cobro en: %s", (linea) => {
    expect(escriturasDeCobro(`const x = 1;\n${linea}\n`)).toEqual([`2: ${linea}`]);
  });

  it.each([
    "prisma.ordenFulfillmentMovimiento.findMany({ where })",
    "fulfillment_anulado: \"aFavor\",",
    '"egreso_reverso_fulfillment",',
    '{ categoria: "flete" }',
    'if (m.categoria === "fulfillment") return x;',
  ])("(a) no confunde una lectura o un catálogo con una escritura: %s", (linea) => {
    expect(escriturasDeCobro(linea)).toEqual([]);
  });

  it.each([
    "select: { fulfillmentRetirado: true }",
    'WHERE u."fulfillment" = true',
    'AND "fulfillment" IS NOT NULL',
    'WHERE "fulfillment" <> false',
  ])("(b) encuentra la marca vieja en: %s", (linea) => {
    expect(usosDeLaMarcaVieja(`x\n${linea}`)).toEqual([`2: ${linea}`]);
  });

  it.each(['if (cat === "fulfillment") x();', "seRecogeEnTienda: true", '"fulfillment": 1'])(
    "(b) no confunde otro uso con la marca vieja: %s",
    (linea) => {
      expect(usosDeLaMarcaVieja(linea)).toEqual([]);
    },
  );

  it("(c) acepta solo la marca negada y rechaza el fulfillment u otra cosa", () => {
    const sintetico = [
      "export function resolverDestinoCreacion(naceEnBodega: boolean) {}",
      "const a = resolverDestinoCreacion(!seRecogeEnTienda);",
      "const b = resolverDestinoCreacion(!tienda.seRecogeEnTienda);",
      "const c = resolverDestinoCreacion(tieneFulfillment);",
      "const d = resolverDestinoCreacion(!fulfillment);",
      "const e = resolverDestinoCreacion(seRecogeEnTienda);",
    ].join("\n");
    const { argumentos, invalidas } = llamadasADestino(sintetico);
    expect(argumentos).toHaveLength(5);
    expect(invalidas).toEqual(["tieneFulfillment", "!fulfillment", "seRecogeEnTienda"]);
  });

  it("(R40) rojo si otra vía escribe cancelacion_api o el repositorio lo saca de cancelarViaApi", () => {
    const repoBueno = [
      "class R {",
      "  async cancelarViaApi(p) {",
      '    await appendCambioEstado(tx, [{ origenTipo: "cancelacion_api" }]);',
      "  }",
      "  async otro() {}",
      "}",
    ].join("\n");
    expect(cancelacionFueraDeSitio([{ ruta: "lib/repositories/OrdenRepository.ts", codigo: repoBueno }])).toEqual([]);

    const repoConFuga = `${repoBueno}\nconst x = { origenTipo: "cancelacion_api" };\n`;
    expect(cancelacionFueraDeSitio([{ ruta: "lib/repositories/OrdenRepository.ts", codigo: repoConFuga }])).not.toEqual([]);

    const repoSinEscritor = repoBueno.replace('"cancelacion_api"', '"ajuste_estado"');
    expect(cancelacionFueraDeSitio([{ ruta: "lib/repositories/OrdenRepository.ts", codigo: repoSinEscritor }])).not.toEqual([]);

    expect(
      cancelacionFueraDeSitio([{ ruta: "lib/services/Otro.ts", codigo: 'append({ origenTipo: "cancelacion_api" })' }]),
    ).toEqual(['lib/services/Otro.ts: 1 aparición(es) de "cancelacion_api"']);

    expect(
      cancelacionFueraDeSitio([
        { ruta: "lib/types/order-status-transiciones.ts", codigo: 'const k = "cancelacion_api";' },
      ]),
    ).not.toEqual([]);
  });
});

// ── El árbol real ─────────────────────────────────────────────────────────────────────────────

describe("SLT-94 — el cobro de fulfillment solo nace en la base (design §5)", () => {
  it("control: el árbol se leyó y los sitios que mira la guardia están en él", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    expect(fuente("lib/repositories/OrigenLegibleRepository.ts")?.codigo).toMatch(/ordenFulfillmentMovimiento\.findMany/);
    expect(fuente("lib/services/BulkOrdenService.ts")).toBeDefined();
    expect(cuerpoDeCancelarViaApi(fuente("lib/repositories/OrdenRepository.ts")?.codigo ?? "")).not.toBeNull();
  });

  it("(a) ningún archivo de lib/ ni app/ escribe el cobro, su IVA o su devolución", () => {
    const fallos = FUENTES.flatMap((f) => escriturasDeCobro(f.codigo).map((h) => `${f.ruta}:${h}`));
    expect(
      fallos,
      "El cobro de fulfillment lo escriben los triggers de M4 (SLT-94 design §1). Otra vía va en una migración, no en la app.",
    ).toEqual([]);
  });

  it("(b) la marca vieja (`fulfillmentRetirado` / `\"fulfillment\" =`) no aparece en lib/ ni app/", () => {
    const fallos = FUENTES.flatMap((f) => usosDeLaMarcaVieja(f.codigo).map((h) => `${f.ruta}:${h}`));
    expect(fallos, "D4: la marca es `seRecogeEnTienda`; la columna vieja queda solo para el rollback.").toEqual([]);
  });

  it("(c) resolverDestinoCreacion( solo recibe la marca «se recoge en tienda» negada", () => {
    const porArchivo = FUENTES.map((f) => ({ ruta: f.ruta, ...llamadasADestino(f.codigo) }));
    const total = porArchivo.reduce((n, f) => n + f.argumentos.length, 0);
    // Control: hoy la llaman las dos vías de creación de BulkOrdenService.
    expect(porArchivo.find((f) => f.ruta === "lib/services/BulkOrdenService.ts")?.argumentos).toHaveLength(2);
    expect(total).toBeGreaterThanOrEqual(2);
    const invalidas = porArchivo.flatMap((f) => f.invalidas.map((a) => `${f.ruta}: resolverDestinoCreacion(${a})`));
    expect(invalidas, "D5/R18: el destino lo decide la marca, no el valor de fulfillment.").toEqual([]);
  });

  it("(R40) devolviendo_a_tienda solo sale al terminal devuelta_a_tienda", () => {
    expect(
      TRANSICIONES.devolviendo_a_tienda.map((t) => t.to),
      "Una salida nueva de devolviendo_a_tienda des-cancela una orden: decide antes su re-cobro de fulfillment (R40).",
    ).toEqual(["devuelta_a_tienda"]);
    expect(TRANSICIONES.devuelta_a_tienda).toEqual([]);
  });

  it('(R40) "cancelacion_api" como origen solo lo escribe OrdenRepository.cancelarViaApi', () => {
    expect(cancelacionFueraDeSitio(FUENTES)).toEqual([]);
  });
});
