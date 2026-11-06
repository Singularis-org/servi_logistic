import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";

// SLT-45 T1.4 (design §7.4; R1) — EL OPENAPI DE v1, CONGELADO.
//
// `tests/fixtures/contrato-v1/openapi-v1.json` se grabo sobre el commit de `BASE`, antes de tocar
// codigo de SLT-45: los paths `/api/ordenes/api-key/**` del objeto TS, la clausura de los schemas y
// respuestas que referencian (siguiendo los `$ref` hasta el final), y los mismos bloques del espejo
// `docs/api/api-key-openapi.yaml` como texto. v2 puede añadir paths y schemas propios (con `allOf`
// sobre los de v1); lo que no puede es cambiar ni una coma de esto.
//
// El yaml se compara por bloques de texto porque el repo no tiene parser de YAML y no se añade uno
// para esto: un bloque es su linea de clave y todas las siguientes mas indentadas que ella.
//
// GRABAR (solo sobre el commit de `BASE`):
//   CONTRATO_V1_GRABAR=1 pnpm exec vitest run tests/unit/api/openapi-v1-congelado.test.ts

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const FIXTURE = path.join(RAIZ, "tests", "fixtures", "contrato-v1", "openapi-v1.json");
const YAML = fs.readFileSync(path.join(RAIZ, "docs", "api", "api-key-openapi.yaml"), "utf8");
const GRABAR = process.env.CONTRATO_V1_GRABAR === "1";
const PREFIJO_V1 = "/api/ordenes/api-key";

type Componente = "schemas" | "responses";

interface OpenApiV1 {
  objeto: {
    paths: Record<string, unknown>;
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
  yaml: {
    paths: Record<string, string>;
    schemas: Record<string, string>;
    responses: Record<string, string>;
  };
}

/** Copia JSON del objeto TS: lo que se publica es su serializacion. */
function comoJson<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/** Los `$ref` a componentes que aparecen en un valor, en orden de aparicion. */
function refsDe(valor: unknown): { tipo: Componente; nombre: string }[] {
  return [...JSON.stringify(valor).matchAll(/"#\/components\/(schemas|responses)\/([A-Za-z0-9_]+)"/g)].map((m) => ({
    tipo: m[1] as Componente,
    nombre: m[2],
  }));
}

function objetoV1(): OpenApiV1["objeto"] {
  const spec = comoJson(openApiSpec) as unknown as {
    paths: Record<string, unknown>;
    components: Record<Componente, Record<string, unknown>>;
  };
  const paths = Object.fromEntries(Object.entries(spec.paths).filter(([p]) => p.startsWith(PREFIJO_V1)));
  const vistos: Record<Componente, Set<string>> = { schemas: new Set(), responses: new Set() };
  const pendientes = refsDe(paths);
  while (pendientes.length > 0) {
    const { tipo, nombre } = pendientes.shift() as { tipo: Componente; nombre: string };
    if (vistos[tipo].has(nombre)) continue;
    const def = spec.components[tipo][nombre];
    if (def === undefined) throw new Error(`$ref roto en v1: #/components/${tipo}/${nombre}`);
    vistos[tipo].add(nombre);
    pendientes.push(...refsDe(def));
  }
  // Por nombre, para que el orden del fixture no dependa del orden de recorrido.
  const elegir = (tipo: Componente) =>
    Object.fromEntries([...vistos[tipo]].sort().map((n) => [n, spec.components[tipo][n]]));
  return { paths, schemas: elegir("schemas"), responses: elegir("responses") };
}

/**
 * El bloque de texto de la clave `clave` con indentacion `sangria` dentro de `texto`: su linea y las
 * siguientes mas indentadas (o en blanco), sin las lineas en blanco del final.
 */
function bloque(texto: string, sangria: number, clave: string): string {
  const lineas = texto.split("\n");
  const cabecera = `${" ".repeat(sangria)}${clave}:`;
  const inicio = lineas.findIndex((l) => l === cabecera);
  if (inicio === -1) throw new Error(`el yaml no tiene el bloque «${cabecera.trim()}»`);
  let fin = inicio + 1;
  while (fin < lineas.length) {
    const l = lineas[fin];
    if (l.trim() !== "" && l.length - l.trimStart().length <= sangria) break;
    fin += 1;
  }
  while (fin > inicio + 1 && lineas[fin - 1].trim() === "") fin -= 1;
  return lineas.slice(inicio, fin).join("\n");
}

/** La seccion `components.<tipo>` del yaml: los bloques de nivel 4 se buscan solo ahi. */
function seccionDeComponentes(tipo: Componente): string {
  return bloque(bloque(YAML, 0, "components"), 2, tipo);
}

function yamlV1(objeto: OpenApiV1["objeto"]): OpenApiV1["yaml"] {
  const paths = bloque(YAML, 0, "paths");
  const porNombre = (tipo: Componente, nombres: string[]) => {
    const seccion = seccionDeComponentes(tipo);
    return Object.fromEntries(nombres.map((n) => [n, bloque(seccion, 4, n)]));
  };
  return {
    paths: Object.fromEntries(Object.keys(objeto.paths).map((p) => [p, bloque(paths, 2, `"${p}"`)])),
    schemas: porNombre("schemas", Object.keys(objeto.schemas)),
    responses: porNombre("responses", Object.keys(objeto.responses)),
  };
}

function actual(): OpenApiV1 {
  const objeto = objetoV1();
  return { objeto, yaml: yamlV1(objeto) };
}

function grabado(): OpenApiV1 {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as OpenApiV1;
}

describe("SLT-45 R1 — el OpenAPI de v1 queda identico al de BASE", () => {
  it.runIf(GRABAR)("graba el fixture con el codigo de hoy", () => {
    fs.writeFileSync(FIXTURE, `${JSON.stringify(actual(), null, 2)}\n`, "utf8");
  });

  it.skipIf(GRABAR)("anti-vacuidad: el fixture trae los 9 paths de v1 y la clausura de sus schemas", () => {
    const g = grabado();
    expect(Object.keys(g.objeto.paths)).toHaveLength(9);
    expect(Object.keys(g.objeto.paths).every((p) => p.startsWith(PREFIJO_V1))).toBe(true);
    expect(Object.keys(g.objeto.schemas)).toEqual(expect.arrayContaining(["CargaRow", "CargaResponse", "CotizacionRow", "OrdenDetalle"]));
    expect(Object.keys(g.objeto.responses)).toEqual(expect.arrayContaining(["Unauthorized", "ValidationError"]));
    expect(Object.keys(g.yaml.paths)).toEqual(Object.keys(g.objeto.paths));
  });

  it.skipIf(GRABAR)("objeto TS: los mismos paths de v1, con el mismo contenido y en el mismo orden", () => {
    expect(JSON.stringify(actual().objeto.paths, null, 2)).toBe(JSON.stringify(grabado().objeto.paths, null, 2));
  });

  it.skipIf(GRABAR)("objeto TS: los schemas y respuestas que v1 referencia no cambian", () => {
    const a = actual().objeto;
    const g = grabado().objeto;
    expect(JSON.stringify(a.schemas, null, 2)).toBe(JSON.stringify(g.schemas, null, 2));
    expect(JSON.stringify(a.responses, null, 2)).toBe(JSON.stringify(g.responses, null, 2));
  });

  it.skipIf(GRABAR)("espejo yaml: los mismos bloques de texto para cada path, schema y respuesta de v1", () => {
    const g = grabado();
    const y = yamlV1(g.objeto);
    const pathsV1DelYaml = [...bloque(YAML, 0, "paths").matchAll(/^ {2}"(\/api\/ordenes\/api-key[^"]*)":$/gm)].map((m) => m[1]);
    expect(pathsV1DelYaml).toEqual(Object.keys(g.yaml.paths));
    for (const tipo of ["paths", "schemas", "responses"] as const) {
      for (const [clave, texto] of Object.entries(g.yaml[tipo])) {
        expect(y[tipo][clave], `yaml ${tipo} ${clave}`).toBe(texto);
      }
    }
  });
});
