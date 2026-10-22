// Feature 58 — Blindaje (regression guard): la fila de EJEMPLO de la plantilla de
// carga masiva (ORDENES_BULK_FIELDS) debe usar provincia/cantón/distrito que EXISTAN
// en la geografía de Costa Rica, para que la plantilla descargada sea cargable tal cual
// (fix 'provincia no encontrada'). Se valida ESTÁTICAMENTE (sin DB).
//
// Feature 276 (R4) — La terna sale de la columna `provincia` mas el parser real
// (`parseCantonDistrito`) aplicado al ejemplo de `canton_distrito`: exactamente lo
// que hara el servidor con la plantilla descargada sin editar.
//
// SL-11 (R15) — Las ternas existentes salen de las MIGRACIONES que siembran la geografía
// (no de un seed ni de un xlsx, que ya no existen), normalizadas con `normalizeZonaKey`.
// Ya NO se exige que el distrito tenga zona: las zonas las crea cada empresa, y en una
// empresa nueva ningún distrito tiene zona.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeZonaKey } from "@/lib/geo/normalize";
import { ORDENES_BULK_FIELDS } from "@/app/(app)/ordenes/_components/OrdenesCargaMasivaButton";
import { parseCantonDistrito } from "@/lib/utils/canton-distrito";

/** Terna + dirección literal del ejemplo, tal como la reconstruye la vía sesión. */
interface EjemploGeo {
  provincia: string;
  canton: string;
  distrito: string;
  direccion: string;
}

interface Terna {
  provincia: string;
  canton: string;
  distrito: string;
}

/** Las migraciones que insertan distritos: el catálogo inicial y los tres de la DTA 2026. */
const MIGRACIONES_GEO = [
  "20260713005000_seed_geografia_cr",
  "20260905175156_geografia_dta_2026_distritos_faltantes",
].map((dir) => path.resolve(process.cwd(), "db", "migrations", dir, "migration.sql"));

/** Total de distritos de la DTA 2026 del IGN (491 iniciales + 3). */
const DISTRITOS_CR = 494;

// Un literal SQL: lo de dentro de las comillas simples, con `''` como comilla escapada.
const LIT = "'((?:[^']|'')+)'";
const DISTRITO_RE = new RegExp(
  `^INSERT INTO "distrito"[\\s\\S]*?c\\."id",\\s*${LIT}[\\s\\S]*?` +
    `p\\."nombre"\\s*=\\s*${LIT}\\s+AND\\s+c\\."nombre"\\s*=\\s*${LIT}`,
);

function desescapar(literal: string): string {
  return literal.replaceAll("''", "'");
}

/** Saca las ternas de cada `INSERT INTO "distrito" … p."nombre" = … AND c."nombre" = …`. */
function ternasDeSql(sql: string): Terna[] {
  const ejecutable = sql
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n");
  const salida: Terna[] = [];
  for (const sentencia of ejecutable.split(";")) {
    const m = DISTRITO_RE.exec(sentencia.trim());
    if (!m) continue;
    salida.push({
      distrito: desescapar(m[1]),
      provincia: desescapar(m[2]),
      canton: desescapar(m[3]),
    });
  }
  return salida;
}

// Terna normalizada prov::canton::distrito con el MISMO normalizador del cruce geográfico.
function ternaKey(provincia: string, canton: string, distrito: string): string | null {
  const pk = normalizeZonaKey(provincia);
  const ck = normalizeZonaKey(canton);
  const dk = normalizeZonaKey(distrito);
  if (pk === null || ck === null || dk === null) return null;
  return `${pk}::${ck}::${dk}`;
}

function exampleFor(key: string): string {
  const field = ORDENES_BULK_FIELDS.find((f) => f.key === key);
  if (!field || field.example === undefined) {
    throw new Error(`La plantilla no define ejemplo para la columna '${key}'`);
  }
  return field.example;
}

/** R4: la terna del ejemplo se arma con el MISMO parser que usa la vía sesión. */
function partesDelEjemplo(): EjemploGeo {
  const ejemplo = exampleFor("canton_distrito");
  const parsed = parseCantonDistrito(ejemplo);
  if (!parsed.ok) {
    throw new Error(
      `El ejemplo de 'canton_distrito' ("${ejemplo}") no pasa el parser: ${parsed.mensaje}`,
    );
  }
  return {
    provincia: exampleFor("provincia"),
    canton: parsed.partes.canton,
    distrito: parsed.partes.distrito,
    direccion: exampleFor("direccion"),
  };
}

const ternasCr: Terna[] = MIGRACIONES_GEO.flatMap((archivo) =>
  ternasDeSql(fs.readFileSync(archivo, "utf8")),
);
const geoTernas = new Set<string>();
for (const t of ternasCr) {
  const k = ternaKey(t.provincia, t.canton, t.distrito);
  if (k !== null) geoTernas.add(k);
}

describe("carga masiva — el parser de ternas de las migraciones de geografía (SL-11)", () => {
  it("lee una línea literal de muestra: distrito, provincia y cantón en su sitio", () => {
    const linea =
      `INSERT INTO "distrito" ("id","canton_id","nombre") SELECT gen_random_uuid()::text, ` +
      `c."id", 'Occidental' FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id" ` +
      `WHERE p."nombre" = 'Cartago' AND c."nombre" = 'Cartago' AND NOT EXISTS (SELECT 1 FROM ` +
      `"distrito" d WHERE d."canton_id" = c."id" AND d."nombre" = 'Occidental');`;
    expect(ternasDeSql(linea)).toEqual([
      { provincia: "Cartago", canton: "Cartago", distrito: "Occidental" },
    ]);
  });

  it("lee el formato multilínea de la DTA 2026 e ignora comentarios y otras sentencias", () => {
    const sql = [
      `-- INSERT INTO "distrito" de un comentario, que no cuenta`,
      `INSERT INTO "distrito" ("id", "canton_id", "nombre")`,
      `SELECT gen_random_uuid()::text, c."id", 'Pijije'`,
      `FROM "canton" c`,
      `  JOIN "provincia" p ON p."id" = c."provincia_id"`,
      `WHERE p."nombre" = 'Guanacaste'`,
      `  AND c."nombre" = 'Bagaces';`,
      `INSERT INTO "canton" ("id","provincia_id","nombre") SELECT gen_random_uuid()::text, ` +
        `p."id", 'Bagaces' FROM "provincia" p WHERE p."nombre" = 'Guanacaste';`,
    ].join("\n");
    expect(ternasDeSql(sql)).toEqual([
      { provincia: "Guanacaste", canton: "Bagaces", distrito: "Pijije" },
    ]);
  });

  it("anti-vacuidad: las migraciones dan las 494 ternas de Costa Rica, sin repetidas", () => {
    expect(ternasCr).toHaveLength(DISTRITOS_CR);
    expect(geoTernas.size).toBe(DISTRITOS_CR);
  });

  it("contraprueba: una terna inventada NO está en la geografía", () => {
    const k = ternaKey("Cartago", "Cartago", "Distrito Inventado");
    expect(k).not.toBeNull();
    expect(geoTernas.has(k!)).toBe(false);
  });
});

describe("carga masiva — fila de ejemplo con geografía válida (feature 58)", () => {
  it("R4: los ejemplos geográficos producen provincia, cantón, distrito y dirección", () => {
    const { provincia, canton, distrito, direccion } = partesDelEjemplo();
    expect(provincia).not.toBe("");
    expect(canton).not.toBe("");
    expect(distrito).not.toBe("");
    // La dirección literal del ejemplo es informativa: debe existir para que la
    // fila de muestra enseñe el formato completo (R3).
    expect(direccion).not.toBe("");
  });

  it("R4 / SL-11 R15: provincia/cantón/distrito del ejemplo EXISTEN en la geografía de CR", () => {
    const { provincia, canton, distrito } = partesDelEjemplo();

    const terna = ternaKey(provincia, canton, distrito);
    expect(terna).not.toBeNull();
    expect(
      geoTernas.has(terna!),
      `El combo de ejemplo ${provincia}/${canton}/${distrito} (derivado de provincia + canton_distrito) no existe en la geografía que siembran las migraciones. Elige una terna real.`,
    ).toBe(true);
  });
});
