import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios, quitarComentariosSql } from "../../fixtures/sin-comentarios";

// SLT-44 (T2.4; R13) — NINGUNA LECTURA CALCULA ANCESTROS NI DESCENDIENTES CON UNA CTE RECURSIVA.
//
// LA REGLA: ningun `WITH RECURSIVE` (sin distinguir mayusculas) en el codigo de `lib/` ni de
// `scripts/`. Ancestros y descendientes salen del catalogo del pais en memoria
// (`lib/services/geografia-dominio.ts`), y una consulta que necesite los nodos bajo otro recibe la
// lista de ids ya calculada (`= ANY($ids)`). Decision cerrada de SLT-44, heredada de la enmienda
// «sin `ruta`» de SLT-43.
//
// QUE SE PIERDE SI ESTO NO EXISTE. La regla de herencia escrita en SQL en cada repositorio: N
// copias de lo que el dominio resuelve una vez, y la que divergiera tarifaria con la zona de otro
// ancestro sin romper ningun test.
//
// Se mide sobre el codigo sin comentarios: un comentario que explica la regla no es una consulta.
// No barre `db/migrations/`: R13 habla de las lecturas de la app.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "scripts"];
const EXTENSIONES_TS = /\.(tsx?|mjs|cjs|js)$/;

/** Cada `WITH RECURSIVE` del texto, tal como esta escrito. */
export function ctesRecursivasEn(codigo: string): string[] {
  return [...codigo.matchAll(/\bwith\s+recursive\b/gi)].map((m) => m[0]);
}

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules") continue;
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) fuentes(completo, acc);
    else if (EXTENSIONES_TS.test(entrada) || entrada.endsWith(".sql")) acc.push(completo);
  }
  return acc;
}

function codigoDe(archivo: string): string {
  const texto = readFileSync(archivo, "utf8");
  return archivo.endsWith(".sql") ? quitarComentariosSql(texto) : quitarComentarios(texto);
}

describe("SLT-44 R13 — el detector se prueba a si mismo", () => {
  const SANO = "await tx.$queryRaw`SELECT id FROM orden WHERE distrito_id = ANY(${ids})`;";

  it("CONTRAPRUEBA (control positivo): la consulta que recibe los ids ya calculados no es hallazgo", () => {
    expect(ctesRecursivasEn(SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: un texto con `with recursive` se detecta, en cualquier caja y con saltos de linea", () => {
    expect(ctesRecursivasEn("await tx.$queryRawUnsafe(`with recursive sub AS (SELECT 1) SELECT * FROM sub`)")).toEqual(
      ["with recursive"],
    );
    expect(ctesRecursivasEn("WITH\n  RECURSIVE bajo AS (SELECT 1)")).toEqual(["WITH\n  RECURSIVE"]);
    expect(ctesRecursivasEn("With Recursive x AS (SELECT 1)")).toHaveLength(1);
  });

  it("un comentario que nombra la regla no cuenta", () => {
    expect(ctesRecursivasEn(quitarComentarios("// sin WITH RECURSIVE: el catalogo en memoria\nconst a = 1;"))).toEqual(
      [],
    );
    expect(ctesRecursivasEn(quitarComentariosSql("-- sin WITH RECURSIVE\nSELECT 1;"))).toEqual([]);
  });
});

describe("SLT-44 R13 — `lib/` y `scripts/` sin CTE recursiva", () => {
  const archivos = ARBOLES.flatMap((d) => fuentes(path.join(RAIZ, d)));

  it("el barrido lee de verdad (anti-vacuidad)", () => {
    const rel = archivos.map((a) => path.relative(RAIZ, a).split(path.sep).join("/"));
    expect(rel.filter((r) => r.startsWith("lib/")).length).toBeGreaterThan(200);
    expect(rel.filter((r) => r.startsWith("scripts/")).length).toBeGreaterThan(20);
    expect(rel).toContain("lib/services/geografia-dominio.ts");
  });

  it("ningun archivo escribe `WITH RECURSIVE`", () => {
    const hallazgos = archivos.flatMap((a) =>
      ctesRecursivasEn(codigoDe(a)).map((h) => `${path.relative(RAIZ, a).split(path.sep).join("/")}: ${h}`),
    );
    expect(
      hallazgos,
      "ancestros y descendientes salen del catalogo en memoria (`geografia-dominio.ts`); la consulta " +
        "recibe `nodosBajo(cat, x)` como `= ANY($ids)` (R13)",
    ).toEqual([]);
  });
});
