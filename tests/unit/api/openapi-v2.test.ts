import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";
import { MSG_CARGA_SIN_TARIFA } from "@/lib/services/mensajes-tarifa";
import { MSG_COTIZACION_SIN_TARIFA } from "@/lib/services/mensajes-cotizacion";
import { MSG_UBICACION_UNA_DE_LAS_DOS, type UbicacionDTO } from "@/lib/services/geo-ubicacion";
import {
  MAX_NIVELES_UBICACION,
  cargaV2BodySchema,
  cotizacionV2BodySchema,
  crearOrdenV2BodySchema,
  geografiaQuerySchema,
  type GeografiaResponse,
} from "@/lib/types/api-v2";

// SLT-45 T7.1 (design §4, §6, §9; R34) — EL CONTENIDO de cada operación de v2 en el contrato
// publicado: cuerpo, respuestas y errores, en el objeto TS y en su espejo `.yaml`. La EXISTENCIA de
// las cinco (y que sean rutas reales) la afirman `openapi-177-paths-pdf-y-carga-id.test.ts` y
// `openapi-canal-rutas-reales.guardia.test.ts`; que v1 no cambie, `openapi-v1-congelado.test.ts`.
//
// Los schemas se contrastan con el CODIGO de v2, no consigo mismos: los topes contra los schemas zod
// de `lib/types/api-v2.ts` y las claves requeridas contra objetos tipados con los DTO reales.

type Nodo = Record<string, unknown>;

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const yaml = fs.readFileSync(path.join(RAIZ, "docs", "api", "api-key-openapi.yaml"), "utf8");
const lineasYaml = yaml.split(/\r?\n/);

const paths = openApiSpec.paths as unknown as Record<string, Nodo>;
const schemas = openApiSpec.components.schemas as unknown as Record<string, Nodo>;

const SCHEMAS_V2 = [
  "FilaV2",
  "CargaRequestV2",
  "CrearOrdenRequestV2",
  "CargaResponseV2",
  "CargaOrdenV2",
  "CotizacionRequestV2",
  "CotizacionResponseV2",
  "CotizacionRowResultV2",
  "OrdenDetalleV2",
  "Ubicacion",
  "GeografiaResponse",
];

/** El bloque de texto de una clave del yaml: su linea y las siguientes mas indentadas. */
function bloqueYaml(cabecera: string): string {
  const inicio = lineasYaml.indexOf(cabecera);
  if (inicio === -1) throw new Error(`el yaml no declara ${cabecera.trim()}`);
  const sangria = cabecera.length - cabecera.trimStart().length;
  const out = [cabecera];
  for (let i = inicio + 1; i < lineasYaml.length; i++) {
    const l = lineasYaml[i];
    if (l.trim() !== "" && l.length - l.trimStart().length <= sangria) break;
    out.push(l);
  }
  return out.join("\n");
}

const bloquePath = (p: string) => bloqueYaml(`  "${p}":`);
const bloqueSchema = (s: string) => bloqueYaml(`    ${s}:`);

function operacion(p: string, verbo: "get" | "post"): Nodo {
  const op = paths[p]?.[verbo] as Nodo | undefined;
  if (op === undefined) throw new Error(`${verbo.toUpperCase()} ${p} no esta publicado`);
  return op;
}

function respuestas(op: Nodo): Record<string, Nodo> {
  return op.responses as Record<string, Nodo>;
}

function refDelCuerpo(op: Nodo): string {
  return ((op.requestBody as Nodo).content as Record<string, { schema: { $ref: string } }>)["application/json"].schema.$ref;
}

function refDel200(op: Nodo): string {
  return (respuestas(op)["200"].content as Record<string, { schema: { $ref: string } }>)["application/json"].schema.$ref;
}

function mensajeDelEjemplo(r: Nodo): string {
  return (r.content as Record<string, { example: { message: string } }>)["application/json"].example.message;
}

const ref = (s: string) => `#/components/schemas/${s}`;
const resp = (s: string) => ({ $ref: `#/components/responses/${s}` });

describe("SLT-45 R34 — las cinco operaciones de v2, con su cuerpo, respuestas y errores", () => {
  it("todas van etiquetadas v2, con operationId propio y la misma API key (seguridad global)", () => {
    const ops = [
      operacion("/api/v2/ordenes", "post"),
      operacion("/api/v2/ordenes/carga", "post"),
      operacion("/api/v2/ordenes/cotizacion", "post"),
      operacion("/api/v2/ordenes/{id}", "get"),
      operacion("/api/v2/geografia", "get"),
    ];
    expect(ops.map((o) => o.operationId)).toEqual([
      "crearOrdenV2",
      "cargarOrdenesV2",
      "cotizarOrdenesV2",
      "detalleOrdenV2",
      "catalogoGeograficoV2",
    ]);
    for (const o of ops) {
      expect(o.tags).toEqual(["v2"]);
      expect(o).not.toHaveProperty("security");
      expect(respuestas(o)["401"]).toEqual(resp("Unauthorized"));
      expect(respuestas(o)["403"]).toEqual(resp("Forbidden"));
      expect(respuestas(o)["422"]).toEqual(resp("ValidationError"));
    }
    expect(openApiSpec.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiSpec.tags.map((t) => t.name)).toContain("v2");
  });

  it("POST /api/v2/ordenes: cuerpo `CrearOrdenRequestV2`, 200 `CargaResponseV2` y 409 con el mensaje de la carga", () => {
    const op = operacion("/api/v2/ordenes", "post");
    expect((op.requestBody as Nodo).required).toBe(true);
    expect(refDelCuerpo(op)).toBe(ref("CrearOrdenRequestV2"));
    expect(Object.keys(respuestas(op)).sort()).toEqual(["200", "401", "403", "409", "422"]);
    expect(refDel200(op)).toBe(ref("CargaResponseV2"));
    expect(mensajeDelEjemplo(respuestas(op)["409"])).toBe(MSG_CARGA_SIN_TARIFA);
  });

  it("POST /api/v2/ordenes/carga: cuerpo `CargaRequestV2`, 200 `CargaResponseV2` y 409 con el mensaje de la carga", () => {
    const op = operacion("/api/v2/ordenes/carga", "post");
    expect(refDelCuerpo(op)).toBe(ref("CargaRequestV2"));
    expect(Object.keys(respuestas(op)).sort()).toEqual(["200", "401", "403", "409", "422"]);
    expect(refDel200(op)).toBe(ref("CargaResponseV2"));
    expect(mensajeDelEjemplo(respuestas(op)["409"])).toBe(MSG_CARGA_SIN_TARIFA);
  });

  it("POST /api/v2/ordenes/cotizacion: cuerpo `CotizacionRequestV2`, 200 `CotizacionResponseV2` y 409 con el mensaje de la cotización", () => {
    const op = operacion("/api/v2/ordenes/cotizacion", "post");
    expect(refDelCuerpo(op)).toBe(ref("CotizacionRequestV2"));
    expect(Object.keys(respuestas(op)).sort()).toEqual(["200", "401", "403", "409", "422"]);
    expect(refDel200(op)).toBe(ref("CotizacionResponseV2"));
    expect(mensajeDelEjemplo(respuestas(op)["409"])).toBe(MSG_COTIZACION_SIN_TARIFA);
  });

  it("GET /api/v2/ordenes/{id}: `{id}` es guía o remisión, 200 `OrdenDetalleV2` y el 404 uniforme", () => {
    const item = paths["/api/v2/ordenes/{id}"];
    const op = operacion("/api/v2/ordenes/{id}", "get");
    expect(op).not.toHaveProperty("requestBody");
    expect(item.parameters).toEqual(paths["/api/ordenes/api-key/orden/{id}"].parameters);
    expect(Object.keys(respuestas(op)).sort()).toEqual(["200", "401", "403", "404", "422"]);
    expect(refDel200(op)).toBe(ref("OrdenDetalleV2"));
    expect(respuestas(op)["404"]).toEqual(resp("NotFound"));
  });

  it("GET /api/v2/geografia: `pais` obligatorio con el patrón del borde, 200 `GeografiaResponse` y 404", () => {
    const op = operacion("/api/v2/geografia", "get");
    const [pais] = op.parameters as Nodo[];
    expect(op.parameters).toHaveLength(1);
    expect(pais).toMatchObject({ name: "pais", in: "query", required: true });
    const patron = new RegExp((pais.schema as { pattern: string }).pattern);
    // El patrón publicado acepta y rechaza lo mismo que el schema zod del borde.
    for (const valor of ["CR", "GTM", "cr", "C", "CRRR", "C1"]) {
      expect(patron.test(valor), valor).toBe(geografiaQuerySchema.safeParse({ pais: valor }).success);
    }
    expect(Object.keys(respuestas(op)).sort()).toEqual(["200", "401", "403", "404", "422"]);
    expect(refDel200(op)).toBe(ref("GeografiaResponse"));
    expect(mensajeDelEjemplo(respuestas(op)["404"])).toBe("El recurso solicitado no existe.");
  });

  it("ninguna operación de v1 aparece bajo /api/v2 (R10)", () => {
    const v2 = Object.keys(paths).filter((p) => p.startsWith("/api/v2"));
    expect(v2.sort()).toEqual(
      ["/api/v2/geografia", "/api/v2/ordenes", "/api/v2/ordenes/carga", "/api/v2/ordenes/cotizacion", "/api/v2/ordenes/{id}"].sort(),
    );
    for (const p of v2) expect(Object.keys(paths[p]).filter((k) => k !== "parameters")).toHaveLength(1);
  });
});

describe("SLT-45 R34 — los schemas de v2, contra el código real", () => {
  it("declara los once schemas de §9 y todo `$ref` de v2 resuelve", () => {
    for (const s of SCHEMAS_V2) expect(schemas, s).toHaveProperty(s);
    const texto = JSON.stringify([SCHEMAS_V2.map((s) => schemas[s]), Object.entries(paths).filter(([p]) => p.startsWith("/api/v2"))]);
    for (const m of texto.matchAll(/"#\/components\/(schemas|responses)\/([A-Za-z0-9_]+)"/g)) {
      const comp = (openApiSpec.components as unknown as Record<string, Record<string, unknown>>)[m[1]];
      expect(comp, `$ref roto: ${m[0]}`).toHaveProperty(m[2]);
    }
  });

  it("los que extienden uno de v1 lo hacen con allOf + $ref al de v1 (R1)", () => {
    const extiende: Record<string, string> = {
      CargaOrdenV2: "CargaOrden",
      CargaResponseV2: "CargaResponse",
      CotizacionRowResultV2: "CotizacionRowResult",
      CotizacionResponseV2: "CotizacionResponse",
      OrdenDetalleV2: "OrdenDetalle",
    };
    for (const [v2, v1] of Object.entries(extiende)) {
      const allOf = schemas[v2].allOf as Nodo[];
      expect(allOf[0], v2).toEqual({ $ref: ref(v1) });
    }
    const ubicacionEn = (s: string) => ((schemas[s].allOf as Nodo[])[1] as { required: string[]; properties: Nodo }).required;
    for (const s of ["CargaOrdenV2", "CotizacionRowResultV2", "OrdenDetalleV2"]) expect(ubicacionEn(s)).toEqual(["ubicacion"]);
    const itemsDe = (s: string, clave: string) =>
      (((schemas[s].allOf as Nodo[])[1] as { properties: Record<string, { items: Nodo }> }).properties[clave]).items;
    expect(itemsDe("CargaResponseV2", "ordenes")).toEqual({ $ref: ref("CargaOrdenV2") });
    expect(itemsDe("CotizacionResponseV2", "filas")).toEqual({ $ref: ref("CotizacionRowResultV2") });
  });

  it("Ubicacion exige exactamente las claves de `UbicacionDTO`", () => {
    const dto: UbicacionDTO = { profundidad: 1, id: "x", nombre: "x", codigoOficial: null, tipo: { clave: "nivel_1", nombre: "x" } };
    const u = schemas.Ubicacion as { required: string[]; properties: Record<string, { required?: string[] }> };
    expect([...u.required].sort()).toEqual(Object.keys(dto).sort());
    expect([...(u.properties.tipo.required ?? [])].sort()).toEqual(Object.keys(dto.tipo).sort());
  });

  it("GeografiaResponse exige exactamente las claves de la respuesta real", () => {
    const real: GeografiaResponse = {
      pais: { id: "x", nombre: "x" },
      tipos: [{ clave: "nivel_1", nombreSingular: "x", nombrePlural: "x" }],
      nodos: [{ id: "x", padreId: null, profundidad: 1, tipo: "nivel_1", nombre: "x", codigoOficial: null, activo: true }],
    };
    type Obj = { required: string[]; properties: Record<string, Obj & { items: Obj }> };
    const g = schemas.GeografiaResponse as unknown as Obj;
    expect([...g.required].sort()).toEqual(Object.keys(real).sort());
    expect([...g.properties.pais.required].sort()).toEqual(Object.keys(real.pais).sort());
    expect([...g.properties.tipos.items.required].sort()).toEqual(Object.keys(real.tipos[0]).sort());
    expect([...g.properties.nodos.items.required].sort()).toEqual(Object.keys(real.nodos[0]).sort());
  });

  it("FilaV2 publica los topes que aplica `filaV2Schema` y no exige ninguna clave (R12 es error de fila)", () => {
    const f = schemas.FilaV2 as { required?: string[]; properties: Record<string, Nodo & { items?: Nodo }> };
    expect(f).not.toHaveProperty("required");
    for (const clave of ["provincia", "canton", "distrito"]) expect(f.properties).not.toHaveProperty(clave);
    expect(f.properties.ubicacion).toMatchObject({ type: "array", minItems: 1, maxItems: MAX_NIVELES_UBICACION });
    expect(f.properties.ubicacion.items).toMatchObject({ type: "string", minLength: 1, maxLength: 200 });
    expect(f.properties.ubicacion_codigo).toMatchObject({ type: "string", minLength: 1, maxLength: 64 });
    expect(String(schemas.FilaV2.description)).toContain(MSG_UBICACION_UNA_DE_LAS_DOS);

    // Los mismos topes, medidos en el borde real.
    const lote = (fila: unknown) => cotizacionV2BodySchema.safeParse({ ordenes: [fila] }).success;
    const nombres = (n: number) => Array.from({ length: n }, () => "x");
    expect(lote({ ubicacion: nombres(MAX_NIVELES_UBICACION) })).toBe(true);
    expect(lote({ ubicacion: nombres(MAX_NIVELES_UBICACION + 1) })).toBe(false);
    expect(lote({ ubicacion: [] })).toBe(false);
    expect(lote({ ubicacion: ["x".repeat(200)] })).toBe(true);
    expect(lote({ ubicacion: ["x".repeat(201)] })).toBe(false);
    expect(lote({ ubicacion_codigo: "x".repeat(64) })).toBe(true);
    expect(lote({ ubicacion_codigo: "x".repeat(65) })).toBe(false);
    // Ninguna o las dos: el lote pasa (el error es de la fila).
    expect(lote({})).toBe(true);
    expect(lote({ ubicacion: ["x"], ubicacion_codigo: "1" })).toBe(true);
  });

  it("los cuerpos publican el tope de lote, `name` y `download_type` del borde real", () => {
    const limite = (s: string) => (schemas[s].properties as Record<string, Nodo>).ordenes;
    for (const s of ["CargaRequestV2", "CotizacionRequestV2"]) {
      expect(schemas[s].required).toEqual(["ordenes"]);
      expect(limite(s)).toMatchObject({ minItems: 1, maxItems: 5000, items: { $ref: ref("FilaV2") } });
    }
    expect(schemas.CrearOrdenRequestV2.required).toEqual(["orden"]);
    expect((schemas.CrearOrdenRequestV2.properties as Nodo).orden).toEqual({ $ref: ref("FilaV2") });
    for (const s of ["CargaRequestV2", "CrearOrdenRequestV2"]) {
      const props = schemas[s].properties as Record<string, Nodo>;
      expect(props.name).toMatchObject({ type: "string", minLength: 1, maxLength: 120 });
      expect(props.download_type).toMatchObject({ enum: ["consolidate", "individual"], default: "consolidate" });
    }
    const fila = { ubicacion: ["x"] };
    expect(cargaV2BodySchema.safeParse({ ordenes: [] }).success).toBe(false);
    expect(cargaV2BodySchema.safeParse({ ordenes: [fila], name: "x".repeat(121) }).success).toBe(false);
    expect(cargaV2BodySchema.parse({ ordenes: [fila] }).download_type).toBe("consolidate");
    expect(crearOrdenV2BodySchema.safeParse({ orden: fila, download_type: "otro" }).success).toBe(false);
  });
});

describe("SLT-45 R34 — el espejo .yaml declara lo mismo", () => {
  it("cada path de v2 trae en el yaml su operationId, su cuerpo, su 200 y sus códigos de error", () => {
    const esperado: [string, string, string | null, string, string[]][] = [
      ["/api/v2/ordenes", "crearOrdenV2", "CrearOrdenRequestV2", "CargaResponseV2", ["401", "403", "409", "422"]],
      ["/api/v2/ordenes/carga", "cargarOrdenesV2", "CargaRequestV2", "CargaResponseV2", ["401", "403", "409", "422"]],
      ["/api/v2/ordenes/cotizacion", "cotizarOrdenesV2", "CotizacionRequestV2", "CotizacionResponseV2", ["401", "403", "409", "422"]],
      ["/api/v2/ordenes/{id}", "detalleOrdenV2", null, "OrdenDetalleV2", ["401", "403", "404", "422"]],
      ["/api/v2/geografia", "catalogoGeograficoV2", null, "GeografiaResponse", ["401", "403", "404", "422"]],
    ];
    for (const [p, opId, cuerpo, ok, codigos] of esperado) {
      const b = bloquePath(p);
      expect(b, p).toContain(`operationId: ${opId}`);
      expect(b, p).toContain("        - v2");
      if (cuerpo) expect(b, p).toContain(`$ref: "${ref(cuerpo)}"`);
      else expect(b, p).not.toContain("requestBody:");
      expect(b, p).toContain(`$ref: "${ref(ok)}"`);
      for (const c of ["200", ...codigos]) expect(b, `${p} sin ${c}`).toContain(`        "${c}":`);
    }
    expect(bloquePath("/api/v2/ordenes")).toContain(`message: "${MSG_CARGA_SIN_TARIFA}"`);
    expect(bloquePath("/api/v2/ordenes/carga")).toContain(`message: "${MSG_CARGA_SIN_TARIFA}"`);
    expect(bloquePath("/api/v2/ordenes/cotizacion")).toContain(`message: "${MSG_COTIZACION_SIN_TARIFA}"`);
    expect(bloquePath("/api/v2/geografia")).toContain('pattern: "^[A-Z]{2,3}$"');
  });

  it("cada schema de v2 está en el yaml, y los que extienden uno de v1 con el mismo allOf", () => {
    for (const s of SCHEMAS_V2) {
      const b = bloqueSchema(s);
      const allOf = schemas[s].allOf as { $ref?: string }[] | undefined;
      if (allOf) expect(b, s).toContain(`allOf:\n        - $ref: "${allOf[0].$ref}"`);
      const required = schemas[s].required as string[] | undefined;
      for (const r of required ?? []) expect(b, `${s}.${r}`).toContain(`        - ${r}`);
    }
    expect(bloqueSchema("FilaV2")).toContain(`maxItems: ${MAX_NIVELES_UBICACION}`);
    expect(bloqueSchema("FilaV2")).toContain(MSG_UBICACION_UNA_DE_LAS_DOS);
    expect(bloqueSchema("FilaV2")).not.toContain("required:");
  });
});
