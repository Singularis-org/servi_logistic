// GUARDIA — `POST /api/ordenes/api-key/carga`: lo que la ruta LEE y DEVUELVE, contra el contrato.
//
// **El defecto que la motiva (SLT-201, auditoría del 2026-11-18, D2).** La ruta leía `name` y
// `download_type` y devolvía `downloadType`, `etiquetasPdf`, `manifiesto` y `ordenes[].downloadUrl`
// desde las features 136, 141 y 155, y el Swagger no los nombraba. Las 21 pruebas `openapi-*`
// seguían en verde porque comparan el spec CONSIGO MISMO y con su espejo YAML, nunca con la ruta.
// `openapi-canal-rutas-reales.guardia.test.ts` cierra ese hueco para VERBO + PATH; este archivo lo
// cierra para las CLAVES de la carga.
//
// **Cómo lo mide, sin regex sobre el código:**
//   - Petición: recorre el AST de `carga/route.ts` (compilador de TypeScript) hasta el
//     `z.object({...})` de `cargaApiBodySchema`, y compara sus claves, su `z.enum`, su `.default`
//     y sus topes literales con `CargaRequest`.
//   - Respuesta: EJECUTA `handleCargaApi` con dobles de los servicios y compara las claves del JSON
//     real con `CargaResponse`, `CargaOrden`, `CargaEtiquetasPdf`, `CargaManifiesto` y
//     `ManifiestoFila`. Los dobles se construyen con los tipos del servicio, y el AST de esos tipos
//     confirma que el doble trae TODAS sus claves (opcionales incluidas): una clave nueva del
//     resumen no se puede quedar fuera del doble sin que esto se ponga rojo.
//   - El 409 por nombre repetido y el 500 genérico se piden a la ruta y al manejador global, y se
//     comparan con los ejemplos publicados.
//   - D6: el `info.description` del YAML es el MISMO texto que el del objeto TS.
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => {
    throw new Error("SLT-201: esta guardia no toca la base; algún servicio quedó sin doble");
  },
  PRISMA_OMIT: {},
}));

import { EJEMPLO_NOMBRE_LOTE, openApiSpec } from "@/lib/api/openapi-spec";
import { withErrorHandler } from "@/lib/errors";
import { CargaNombreDuplicadoError } from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  CargaViaApiOrden,
  CargaViaApiResult,
  CargaViaApiSummary,
  IBulkOrdenService,
} from "@/lib/interfaces/services/IBulkOrdenService";
import type {
  EtiquetasDescargaResultado,
  IEtiquetasDescargaService,
} from "@/lib/interfaces/services/IEtiquetasDescargaService";
import type { IManifiestoService } from "@/lib/interfaces/services/IManifiestoService";
import type { ManifiestoFilaDTO, ManifiestoOmitidaDTO } from "@/lib/types/manifiesto";

const { handleCargaApi } = await import("@/app/api/ordenes/api-key/carga/route");

const RAIZ = path.join(__dirname, "..", "..", "..");
const RUTA_CARGA = path.join(RAIZ, "app", "api", "ordenes", "api-key", "carga", "route.ts");
const YAML_PATH = path.join(RAIZ, "docs", "api", "api-key-openapi.yaml");

const PATH_CARGA = "/api/ordenes/api-key/carga";
const S = openApiSpec.components.schemas as unknown as Record<string, Schema>;

interface Schema {
  type?: unknown;
  required?: readonly string[];
  properties?: Record<string, Schema>;
  oneOf?: readonly Schema[];
  enum?: readonly unknown[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  $ref?: string;
}

const ordenar = (xs: Iterable<string>): string[] => [...xs].sort();
const props = (nombre: string): string[] => ordenar(Object.keys(S[nombre]?.properties ?? {}));

// ---------------------------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------------------------

function parsear(archivo: string): ts.SourceFile {
  return ts.createSourceFile(archivo, fs.readFileSync(archivo, "utf8"), ts.ScriptTarget.Latest, true);
}

function buscar<T extends ts.Node>(raiz: ts.Node, es: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  const visitar = (n: ts.Node): void => {
    if (es(n)) out.push(n);
    ts.forEachChild(n, visitar);
  };
  visitar(raiz);
  return out;
}

function nombreDe(n: ts.PropertyName): string {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  throw new Error(`SLT-201: clave no literal en el schema (${n.getText()})`);
}

/** Llamadas `<algo>.<metodo>(...)` dentro de la cadena zod de una propiedad. */
function llamadas(expr: ts.Node, metodo: string): ts.CallExpression[] {
  return buscar(
    expr,
    (n): n is ts.CallExpression =>
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === metodo,
  );
}

function literal(n: ts.Expression | undefined): string | number | undefined {
  if (n === undefined) return undefined;
  if (ts.isStringLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  return undefined; // un tope que sale de config no es literal: no se compara aquí
}

interface CampoZod {
  enum?: string[];
  default?: string | number;
  min?: number;
  max?: number;
}

/** Las claves del `z.object({...})` de `cargaApiBodySchema`, con lo que dice cada una. */
function cuerpoDeLaRuta(): Map<string, CampoZod> {
  const sf = parsear(RUTA_CARGA);
  const decl = buscar(
    sf,
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "cargaApiBodySchema",
  );
  expect(decl, "SLT-201: `cargaApiBodySchema` ya no existe en carga/route.ts").toHaveLength(1);
  const init = decl[0].initializer;
  if (!init || !ts.isCallExpression(init) || init.expression.getText() !== "z.object") {
    throw new Error("SLT-201: `cargaApiBodySchema` dejó de ser un `z.object({...})`");
  }
  const obj = init.arguments[0];
  if (!obj || !ts.isObjectLiteralExpression(obj)) throw new Error("SLT-201: z.object sin objeto literal");

  const campos = new Map<string, CampoZod>();
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) throw new Error(`SLT-201: propiedad no literal: ${p.getText()}`);
    const c: CampoZod = {};
    const en = llamadas(p.initializer, "enum").find((l) => l.expression.getText() === "z.enum");
    if (en) {
      const arr = en.arguments[0];
      if (!arr || !ts.isArrayLiteralExpression(arr)) throw new Error("SLT-201: z.enum sin lista literal");
      c.enum = arr.elements.map((e) => {
        if (!ts.isStringLiteral(e)) throw new Error("SLT-201: valor de enum no literal");
        return e.text;
      });
    }
    c.default = literal(llamadas(p.initializer, "default")[0]?.arguments[0]);
    const min = literal(llamadas(p.initializer, "min")[0]?.arguments[0]);
    const max = literal(llamadas(p.initializer, "max")[0]?.arguments[0]);
    if (typeof min === "number") c.min = min;
    if (typeof max === "number") c.max = max;
    campos.set(nombreDe(p.name), c);
  }
  return campos;
}

/** Miembros (opcionales incluidos) de una `interface` exportada. */
function miembrosDeInterfaz(archivo: string, nombre: string): string[] {
  const sf = parsear(path.join(RAIZ, archivo));
  const decl = buscar(
    sf,
    (n): n is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(n) && n.name.text === nombre,
  );
  expect(decl, `SLT-201: no encuentro la interfaz ${nombre} en ${archivo}`).toHaveLength(1);
  expect(decl[0].heritageClauses, `SLT-201: ${nombre} hereda; esta guardia no lo ve`).toBeUndefined();
  return ordenar(
    decl[0].members.filter(ts.isPropertySignature).map((m) => nombreDe(m.name)),
  );
}

// ---------------------------------------------------------------------------------------------
// Dobles: tipados con los contratos del servicio
// ---------------------------------------------------------------------------------------------

const ORDEN_ID = "6f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f";

const ORDEN: CargaViaApiOrden = {
  id: ORDEN_ID,
  numRemision: "REM-0001",
  numGuia: 100234,
  estado: "por_recolectar_en_tienda",
  estadoNombre: "Por recolectar en tienda",
  costoEnvio: "3.39",
  fulfillment: "0.00",
  ivaFulfillment: "0.00",
};

const SUMMARY: CargaViaApiSummary = {
  total: 1,
  creadas: 1,
  duplicadas: 0,
  conError: 0,
  filas: [],
  errores: [],
  ordenes: [ORDEN],
  cargaId: "9c2b7f10-5d3a-4e21-9a4b-77c8e0f1a2b3",
};

const FILA: ManifiestoFilaDTO = {
  numGuia: 100234,
  numRemision: "REM-0001",
  destinatario: "Juan Pérez",
  telefono: "88887777",
  direccion: null,
  zona: "Zona 1",
  producto: "Camiseta",
  monto: 25.9,
  intentos: 0,
  origen: "Tienda",
  destino: "Central",
  responsable: "Integración",
  fecha: "2026-11-18",
};

const OMITIDA: ManifiestoOmitidaDTO = { ref: "x", motivo: "no_encontrada" };

const autenticar = async () => ({
  status: "ok" as const,
  actor: { usuarioId: "u-key", rol: "apiKey" as const },
  apiKeyId: "k-1",
});

function bulk(resultado: () => Promise<CargaViaApiResult>): IBulkOrdenService {
  return { cargarViaApi: resultado } as unknown as IBulkOrdenService;
}

const bulkOk = bulk(async () => ({ status: "ok", summary: SUMMARY, manifiestoOrdenIds: [ORDEN_ID] }));

const descarga = (
  impl: (p: { modo: string }) => Promise<EtiquetasDescargaResultado>,
): IEtiquetasDescargaService => ({ generarYPersistir: impl });

const descargaOk = descarga(async ({ modo }) =>
  modo === "individual"
    ? { consolidado: null, porOrden: new Map([[ORDEN_ID, "https://storage/orden.pdf"]]) }
    : { consolidado: { url: "https://storage/lote.pdf", expiraEnSegundos: 3600 }, porOrden: new Map() },
);
const descargaRota = descarga(async () => {
  throw new Error("storage caído");
});

const manifiestoOk: IManifiestoService = {
  armar: async () => ({ status: "ok", filas: [FILA], omitidas: [OMITIDA] }),
};
const manifiestoRoto: IManifiestoService = {
  armar: async () => {
    throw new Error("consulta caída");
  },
};

function peticion(cuerpo: unknown): Request {
  return new Request(`http://localhost${PATH_CARGA}`, {
    method: "POST",
    headers: { authorization: "Bearer svl_prueba", "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

const CUERPO = { ordenes: [{ num_remision: "REM-0001" }] };

async function llamar(
  cuerpo: unknown,
  deps: { descargaService?: IEtiquetasDescargaService; manifiestoService?: IManifiestoService; bulkService?: IBulkOrdenService } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await handleCargaApi(peticion(cuerpo), {
    autenticar: autenticar as never,
    bulkService: bulkOk,
    descargaService: descargaOk,
    manifiestoService: manifiestoOk,
    ...deps,
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const claves = (o: unknown): string[] => ordenar(Object.keys(o as object));

/**
 * Única excepción DECLARADA: la fila real del manifiesto trae el conteo de reintentos de entrega,
 * y el contrato no lo publica porque 160/R31 (QA5) lo deja fuera (`intentos-no-alcance.test.ts`).
 * Si alguien lo publica o la ruta deja de enviarlo, el test de abajo lo dice.
 */
const FUERA_DEL_CONTRATO_FILA_MANIFIESTO = ["intentos"];
const sinExcepciones = (xs: string[]): string[] => xs.filter((x) => !FUERA_DEL_CONTRATO_FILA_MANIFIESTO.includes(x));

/** La variante objeto de un `oneOf` cuyas `properties` incluyen `clave`. */
function variante(schema: string, clave: string): string[] {
  const v = S[schema]?.oneOf?.find((x) => x.properties && clave in x.properties);
  expect(v, `SLT-201: ${schema} no publica una variante con \`${clave}\``).toBeDefined();
  return ordenar(Object.keys(v!.properties!));
}

// ---------------------------------------------------------------------------------------------
// R1 — petición
// ---------------------------------------------------------------------------------------------

describe("SLT-201 R1 — el cuerpo que LEE la ruta es el que publica `CargaRequest`", () => {
  const campos = cuerpoDeLaRuta();

  it("control: el AST encuentra las claves del z.object (incluida `ordenes`)", () => {
    expect(campos.size, "SLT-201: el z.object vino vacío").toBeGreaterThanOrEqual(1);
    expect([...campos.keys()]).toContain("ordenes");
  });

  it("las mismas claves, ni una más ni una menos", () => {
    expect(props("CargaRequest")).toEqual(ordenar(campos.keys()));
  });

  it("cada `z.enum`, `.default` y tope literal coincide con el schema publicado", () => {
    const publicados = S.CargaRequest.properties!;
    let comparados = 0;
    for (const [clave, c] of campos) {
      const p = publicados[clave];
      if (c.enum) {
        expect(p.enum, `SLT-201: enum de ${clave}`).toEqual(c.enum);
        comparados++;
      }
      if (c.default !== undefined) {
        expect(p.default, `SLT-201: default de ${clave}`).toBe(c.default);
        comparados++;
      }
      if (p.type === "string") {
        if (c.min !== undefined) expect(p.minLength, `SLT-201: minLength de ${clave}`).toBe(c.min);
        if (c.max !== undefined) expect(p.maxLength, `SLT-201: maxLength de ${clave}`).toBe(c.max);
        if (c.max !== undefined) comparados++;
      }
    }
    // control positivo: hoy son enum + default de `download_type` y el tope de `name`.
    expect(comparados, "SLT-201: no se comparó ningún enum/default/tope").toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------
// R2 — respuesta
// ---------------------------------------------------------------------------------------------

describe("SLT-201 R2 — la respuesta REAL de la ruta tiene las claves que publica el contrato", () => {
  it("los dobles traen TODAS las claves de sus tipos (si no, la comparación de abajo miente)", () => {
    expect(claves(SUMMARY)).toEqual(
      miembrosDeInterfaz("lib/interfaces/services/IBulkOrdenService.ts", "CargaViaApiSummary"),
    );
    expect(claves(ORDEN)).toEqual(
      miembrosDeInterfaz("lib/interfaces/services/IBulkOrdenService.ts", "CargaViaApiOrden"),
    );
    expect(claves(FILA)).toEqual(miembrosDeInterfaz("lib/types/manifiesto.ts", "ManifiestoFilaDTO"));
    expect(claves(OMITIDA)).toEqual(miembrosDeInterfaz("lib/types/manifiesto.ts", "ManifiestoOmitidaDTO"));
  });

  it("consolidate: claves de nivel superior, de `ordenes[]`, de `etiquetasPdf` y de `manifiesto`", async () => {
    const { status, json } = await llamar(CUERPO);
    expect(status).toBe(200);
    expect(claves(json)).toEqual(props("CargaResponse"));
    for (const r of S.CargaResponse.required ?? []) expect(json, `SLT-201: falta ${r}`).toHaveProperty(r);

    const ordenes = json.ordenes as Record<string, unknown>[];
    expect(ordenes, "SLT-201: control, el doble crea una orden").toHaveLength(1);
    expect(claves(ordenes[0])).toEqual(props("CargaOrden"));

    expect(S.CargaResponse.properties!.downloadType.enum).toContain(json.downloadType);
    expect(json.downloadType).toBe("consolidate");
    expect(claves(json.etiquetasPdf)).toEqual(variante("CargaEtiquetasPdf", "url"));

    const manifiesto = json.manifiesto as { filas: unknown[]; omitidas: unknown[] };
    expect(claves(manifiesto)).toEqual(variante("CargaManifiesto", "filas"));
    const fila = claves(manifiesto.filas[0]);
    expect(sinExcepciones(fila)).toEqual(props("ManifiestoFila"));
    // La excepción sigue siendo real (si la fila deja de traerla, sobra) y sigue sin publicarse.
    for (const x of FUERA_DEL_CONTRATO_FILA_MANIFIESTO) {
      expect(fila, `SLT-201: la fila ya no trae ${x}; quita la excepción`).toContain(x);
      expect(props("ManifiestoFila")).not.toContain(x);
    }
    expect(claves(manifiesto.omitidas[0])).toEqual(props("ManifiestoOmitida"));
  });

  it("individual: `downloadType` y `ordenes[].downloadUrl` con la URL; `etiquetasPdf` es null", async () => {
    const { status, json } = await llamar({ ...CUERPO, download_type: "individual" });
    expect(status).toBe(200);
    expect(json.downloadType).toBe("individual");
    expect(S.CargaResponse.properties!.downloadType.enum).toContain(json.downloadType);
    expect((json.ordenes as { downloadUrl: unknown }[])[0].downloadUrl).toBe("https://storage/orden.pdf");
    expect(json.etiquetasPdf).toBeNull();
    expect(S.CargaEtiquetasPdf.oneOf!.some((v) => v.type === "null")).toBe(true);
  });

  it("best-effort: un fallo del PDF y del manifiesto llega como la variante `{ error }` publicada", async () => {
    const { status, json } = await llamar(CUERPO, {
      descargaService: descargaRota,
      manifiestoService: manifiestoRoto,
    });
    expect(status).toBe(200);
    expect(claves(json.etiquetasPdf)).toEqual(variante("CargaEtiquetasPdf", "error"));
    expect(claves(json.manifiesto)).toEqual(variante("CargaManifiesto", "error"));
  });
});

// ---------------------------------------------------------------------------------------------
// R3 — errores: 409 por nombre repetido y 500 genérico
// ---------------------------------------------------------------------------------------------

describe("SLT-201 R3 — los errores que la ruta emite están en el contrato", () => {
  const carga = openApiSpec.paths[PATH_CARGA].post;

  it("nombre de lote repetido: la ruta responde 409 con el cuerpo del ejemplo publicado", async () => {
    const { status, json } = await llamar(
      { ...CUERPO, name: EJEMPLO_NOMBRE_LOTE },
      {
        bulkService: bulk(async () => {
          throw new CargaNombreDuplicadoError(EJEMPLO_NOMBRE_LOTE);
        }),
      },
    );
    expect(status).toBe(409);
    const ejemplos = carga.responses["409"].content["application/json"].examples;
    expect(json).toEqual(ejemplos.nombreRepetido.value);
    expect(json.message).toContain(EJEMPLO_NOMBRE_LOTE);
  });

  it("un error inesperado sale como el 500 publicado, y TODAS las operaciones lo declaran", async () => {
    const res = await withErrorHandler(async () => {
      throw new Error("SLT-201: detalle interno que no debe salir");
    });
    const ejemplo = openApiSpec.components.responses.InternalError.content["application/json"].example;
    expect(res).toEqual(ejemplo);

    let ops = 0;
    for (const metodos of Object.values(openApiSpec.paths)) {
      for (const [verbo, op] of Object.entries(metodos as Record<string, { responses?: Record<string, unknown> }>)) {
        if (verbo === "parameters" || !op.responses) continue;
        ops++;
        expect(op.responses["500"], `SLT-201: ${verbo} sin 500`).toEqual({
          $ref: "#/components/responses/InternalError",
        });
        // No existe límite de peticiones en el código (auditoría, D7): no se publica un 429.
        expect(op.responses).not.toHaveProperty("429");
      }
    }
    expect(ops, "SLT-201: control, el canal tiene 10 operaciones").toBe(10);
  });
});

// ---------------------------------------------------------------------------------------------
// R4 — el espejo YAML (D6 y las claves nuevas)
// ---------------------------------------------------------------------------------------------

const lineasYaml = fs.readFileSync(YAML_PATH, "utf8").split(/\r?\n/);

function indent(l: string): number | null {
  return l.trim() === "" ? null : l.length - l.trimStart().length;
}

function bloque(lineas: string[], cabecera: string, sangria: number): string[] {
  const i = lineas.findIndex((l) => l === `${" ".repeat(sangria)}${cabecera}`);
  if (i === -1) throw new Error(`SLT-201: el YAML no tiene \`${cabecera}\` a sangría ${sangria}`);
  const out: string[] = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const ind = indent(lineas[j]);
    if (ind !== null && ind <= sangria) break;
    out.push(lineas[j]);
  }
  return out;
}

function propsYaml(schema: string): string[] {
  const b = bloque(bloque(lineasYaml, "schemas:", 2), `${schema}:`, 4);
  return ordenar(
    bloque(b, "properties:", 6)
      .filter((l) => indent(l) === 8)
      .map((l) => l.trim().replace(/:$/, "")),
  );
}

function requiredYaml(schema: string): string[] {
  const b = bloque(bloque(lineasYaml, "schemas:", 2), `${schema}:`, 4);
  return ordenar(bloque(b, "required:", 6).map((l) => l.replace(/^\s*-\s+/, "").trim()));
}

describe("SLT-201 R4 — el YAML publicado dice lo mismo que el objeto TS", () => {
  it("D6: `info.description` es el MISMO texto, con las dos cabeceras de firma del webhook", () => {
    const desc = bloque(bloque(lineasYaml, "info:", 0), "description: |-", 2)
      .map((l) => (l.trim() === "" ? "" : l.slice(4)))
      .join("\n")
      .replace(/\n+$/, "");
    expect(desc).toBe(openApiSpec.info.description);
    expect(desc).toContain("X-Servi-Logistic-Signature");
    expect(desc).toContain("X-Servi-Logistic-Timestamp");
  });

  it.each(["CargaRequest", "CargaOrden", "CargaResponse", "ManifiestoFila", "ManifiestoOmitida"])(
    "%s: mismas propiedades y mismo `required`",
    (schema) => {
      expect(propsYaml(schema)).toEqual(props(schema));
      expect(requiredYaml(schema)).toEqual(ordenar(S[schema].required ?? []));
    },
  );

  it("los bloques `oneOf` de etiquetasPdf y manifiesto existen en el YAML", () => {
    const schemas = bloque(lineasYaml, "schemas:", 2);
    for (const s of ["CargaEtiquetasPdf", "CargaManifiesto"]) {
      expect(bloque(schemas, `${s}:`, 4)).toContain("      oneOf:");
    }
  });
});
