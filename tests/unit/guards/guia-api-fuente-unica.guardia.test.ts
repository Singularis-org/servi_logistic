import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";
import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import { EVENTOS_PUBLICOS } from "@/lib/types/webhook-eventos";

// GUARDIA — SLT-80 «Guía de integración por API en la ayuda» (R1300-R1305, R1312, R1316).
//
// La guía del canal por API key tiene UNA fuente: `docs/ayuda/oficina/guia-integracion-api.md`.
// De ella salen la pantalla de Ayuda, el PDF y el contexto del asistente. Esta guardia vigila dos
// cosas que ningún test de pantalla ve:
//
// 1. Que la fuente sea única (R1300, R1312): ni el HTML ni `generar-pdf.py` vuelven, y la colección
//    de Postman no tiene una segunda copia que se desfase de la primera.
// 2. Que la guía no se desfase de la API (R1302-R1305). La referencia es `openApiSpec.paths`, el
//    contrato que sirve `/api-docs`. Una operación nueva en la spec sin documentar, o una ruta en la
//    guía que la spec no tiene, pone esto rojo.
//
// R1316 (API v2 de geografía, SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»): no hay un
// caso aparte A PROPÓSITO. Las comprobaciones de R1303-R1305 recorren `openApiSpec.paths` entera,
// así que en cuanto esas rutas entren en la spec, este archivo exige documentarlas sin cambiar nada.
//
// Las comprobaciones son funciones puras sobre (texto, paths) para poder probarlas con datos
// inyectados: los casos «MUTACION» de abajo las ponen rojas con una operación ficticia y un `json`
// roto, que es lo que pide T10.
//
// Se declara como guardia porque lee archivos del disco: ningún grafo de imports la seleccionaría.

const RAIZ = process.cwd();
const SLUG_GUIA = "oficina/guia-integracion-api";
const ARCHIVO_GUIA = `docs/ayuda/${SLUG_GUIA}.md`;
const POSTMAN = "docs/api/servi-logistic-api-key.postman_collection.json";

const METODOS = ["get", "post", "put", "patch", "delete"] as const;
type Metodo = (typeof METODOS)[number];

interface Operacion {
  metodo: Metodo;
  ruta: string;
  /** Códigos de respuesta declarados que NO son 2xx. */
  codigosNo2xx: string[];
}

type PathsSpec = Record<string, Partial<Record<string, { responses?: Record<string, unknown> }>>>;

/** Las operaciones (método + ruta) de un objeto `paths` de OpenAPI. Ignora `parameters` y demás. */
export function operacionesDe(paths: PathsSpec): Operacion[] {
  return Object.entries(paths).flatMap(([ruta, item]) =>
    METODOS.filter((m) => item[m] !== undefined).map((metodo) => ({
      metodo,
      ruta,
      codigosNo2xx: Object.keys(item[metodo]?.responses ?? {}).filter((c) => !/^2\d\d$/.test(c)),
    })),
  );
}

interface Titulo {
  linea: number;
  nivel: number;
  texto: string;
}

/** Los títulos `#` del Markdown, sin contar los `#` de dentro de un bloque de código. */
function titulosDe(lineas: readonly string[]): Titulo[] {
  const titulos: Titulo[] = [];
  let enCodigo = false;
  lineas.forEach((linea, i) => {
    if (/^```/.test(linea)) enCodigo = !enCodigo;
    else if (!enCodigo) {
      const m = /^(#{1,6})\s+(.*)$/.exec(linea);
      if (m) titulos.push({ linea: i, nivel: m[1].length, texto: m[2] });
    }
  });
  return titulos;
}

/** El título con el que la guía documenta una operación: `**POST** \`/api/...\``. */
const marcaDeOperacion = (op: Pick<Operacion, "metodo" | "ruta">) =>
  `**${op.metodo.toUpperCase()}** \`${op.ruta}\``;

/** El texto de la sección de una operación: de su título al siguiente de igual o mayor rango. */
export function seccionDeOperacion(markdown: string, op: Pick<Operacion, "metodo" | "ruta">): string | null {
  const lineas = markdown.split(/\r?\n/);
  const titulos = titulosDe(lineas);
  const marca = marcaDeOperacion(op);
  const i = titulos.findIndex((t) => t.texto.includes(marca));
  if (i === -1) return null;
  const propio = titulos[i];
  const siguiente = titulos.slice(i + 1).find((t) => t.nivel <= propio.nivel);
  return lineas.slice(propio.linea, siguiente ? siguiente.linea : lineas.length).join("\n");
}

/** R1303 (a): las operaciones de la spec que la guía no nombra con su método y su ruta exactos. */
export function operacionesSinDocumentar(markdown: string, paths: PathsSpec): string[] {
  return operacionesDe(paths)
    .filter((op) => seccionDeOperacion(markdown, op) === null)
    .map(marcaDeOperacion);
}

/**
 * El cuerpo SIN la sección «Cambios respecto de la versión de …». Esa sección es historia: nombra a
 * propósito lo que se retiró (por ejemplo `GET /api/ordenes/api-key/{numGuia}`, que el 2026-08-31
 * dejó de existir) para que el integrador sepa qué dejar de llamar. Fuera de ella, nombrar una ruta
 * es presentarla como endpoint del canal.
 */
export function sinSeccionDeCambios(markdown: string): string {
  const lineas = markdown.split(/\r?\n/);
  const titulos = titulosDe(lineas);
  const i = titulos.findIndex((t) => t.texto.startsWith("Cambios respecto de la versión de"));
  if (i === -1) return markdown;
  const propio = titulos[i];
  const siguiente = titulos.slice(i + 1).find((t) => t.nivel <= propio.nivel);
  return [...lineas.slice(0, propio.linea), ...lineas.slice(siguiente ? siguiente.linea : lineas.length)].join("\n");
}

/** Una ruta concreta (`/api/ordenes/api-key/orden/123`) casa con una plantilla (`.../orden/{id}`). */
function casaConPlantilla(ruta: string, plantilla: string): boolean {
  if (ruta === plantilla) return true;
  const patron = plantilla
    .split(/(\{[^}]+\})/)
    .map((trozo) => (trozo.startsWith("{") ? "[^/]+" : trozo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${patron}$`).test(ruta);
}

/**
 * R1303 (b): las operaciones que la guía nombra como endpoint (método + `/api/...`) y que la spec no
 * tiene. Formas que cuentan: el título `**POST** \`/api/...\``, el código en línea `` `GET /api/...` ``
 * y la llamada `curl` (método de `-X`, o GET si no lo lleva).
 */
export function operacionesQueLaSpecNoTiene(markdown: string, paths: PathsSpec): string[] {
  const ops = operacionesDe(paths);
  const nombradas = new Set<string>();
  const texto = sinSeccionDeCambios(markdown);

  for (const m of texto.matchAll(/\*\*(GET|POST|PUT|PATCH|DELETE)\*\*\s+`(\/api\/[^`\s]+)`/g)) nombradas.add(`${m[1]} ${m[2]}`);
  for (const m of texto.matchAll(/`(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^`\s]+)`/g)) nombradas.add(`${m[1]} ${m[2]}`);
  // `curl` puede partirse en varias líneas con `\`: se une antes de leerlo.
  for (const m of texto.replace(/\\\r?\n/g, " ").matchAll(/^curl\b.*$/gm)) {
    const llamada = m[0];
    const url = /https?:\/\/[^/\s"']+(\/api\/[^\s"'?]*)/.exec(llamada);
    if (!url) continue;
    const metodo = /-X\s+([A-Z]+)/.exec(llamada)?.[1] ?? "GET";
    nombradas.add(`${metodo} ${url[1]}`);
  }

  return [...nombradas]
    .filter((nombrada) => {
      const [metodo, ruta] = nombrada.split(" ");
      return !ops.some((op) => op.metodo.toUpperCase() === metodo && casaConPlantilla(ruta, op.ruta));
    })
    .sort();
}

/** R1305: por operación, si su sección no trae un bloque de código o no nombra un código no-2xx. */
export function huecosPorOperacion(markdown: string, paths: PathsSpec): string[] {
  return operacionesDe(paths).flatMap((op) => {
    const seccion = seccionDeOperacion(markdown, op);
    if (seccion === null) return [`${marcaDeOperacion(op)}: sin sección`];
    const huecos: string[] = [];
    if (!/^```/m.test(seccion)) huecos.push(`${marcaDeOperacion(op)}: sin ejemplo (bloque de código)`);
    for (const codigo of op.codigosNo2xx) {
      if (!new RegExp(`(?<!\\d)${codigo}(?!\\d)`).test(seccion)) huecos.push(`${marcaDeOperacion(op)}: no nombra ${codigo}`);
    }
    return huecos;
  });
}

/** Los bloques ```json del Markdown, tal cual. */
export function bloquesJson(markdown: string): string[] {
  return [...markdown.matchAll(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]);
}

/**
 * R1302: los bloques ```json que no son JSON válido. Mismo criterio que tenía `generar-pdf.py`:
 * los marcadores angulares (`<ordenId>`) se sustituyen por un texto plano, y un fragmento que no
 * empieza por `{` ni por `[` (`"pagination": {...}`) se envuelve en llaves para validarlo.
 */
export function bloquesJsonInvalidos(markdown: string): string[] {
  return bloquesJson(markdown).flatMap((bloque, i) => {
    let candidato = bloque.trim().replace(/<[^<>"]+>/g, "x");
    if (!candidato.startsWith("{") && !candidato.startsWith("[")) candidato = `{${candidato}}`;
    try {
      JSON.parse(candidato);
      return [];
    } catch (error) {
      return [`bloque json #${i + 1}: ${(error as Error).message} · ${bloque.slice(0, 80)}`];
    }
  });
}

const PATHS = openApiSpec.paths as unknown as PathsSpec;

/** El cuerpo de la guía, leído por el MISMO camino que la pantalla y el PDF (R1301). */
async function cuerpoGuia(): Promise<string> {
  const doc = await leerDocumentoAyuda(SLUG_GUIA);
  if (doc === null) throw new Error(`SLT-80: el catálogo de Ayuda no tiene ${SLUG_GUIA}`);
  return doc.cuerpo;
}

describe("R1300 — una sola fuente editable", () => {
  it("la guía es un documento de Ayuda solo para maestro y admin", async () => {
    const doc = await leerDocumentoAyuda(SLUG_GUIA);
    expect(doc, `falta ${ARCHIVO_GUIA}`).not.toBeNull();
    expect([...(doc?.roles ?? [])].sort()).toEqual(["admin", "maestro"]);
  });

  it("el HTML y `generar-pdf.py` no existen", () => {
    expect(existsSync(path.join(RAIZ, "docs/api/guia-integracion/guia-integracion.html"))).toBe(false);
    expect(existsSync(path.join(RAIZ, "docs/api/guia-integracion/generar-pdf.py"))).toBe(false);
  });

  it("el README de la carpeta vieja nombra el `.md` como la fuente", () => {
    const readme = readFileSync(path.join(RAIZ, "docs/api/guia-integracion/README.md"), "utf8");
    expect(readme).toContain(`\`${ARCHIVO_GUIA}\``);
    expect(readme).toContain("una sola fuente");
  });
});

describe("R1302 — los ejemplos `json` son JSON válido", () => {
  it("CONTROL DE NO-VACUIDAD: la guía tiene bloques `json` que validar", async () => {
    expect(bloquesJson(await cuerpoGuia()).length).toBeGreaterThanOrEqual(10);
  });

  it("todos parsean, sustituidos los marcadores angulares", async () => {
    expect(bloquesJsonInvalidos(await cuerpoGuia())).toEqual([]);
  });

  it("MUTACION: un `json` roto se ve, y un marcador angular dentro de una cadena no", () => {
    const roto = '```json\n{ "ordenId": "<ordenId>", "ok": true, }\n```\n';
    expect(bloquesJsonInvalidos(roto)).toHaveLength(1);
    const bien = '```json\n{ "ordenId": "<ordenId>" }\n```\n\n```json\n"pagination": { "limit": 50 }\n```\n';
    expect(bloquesJsonInvalidos(bien)).toEqual([]);
  });
});

describe("R1303 / R1316 — la guía nombra cada operación de la spec, y ninguna más", () => {
  it("CONTROL DE NO-VACUIDAD: la spec tiene al menos 10 operaciones", () => {
    expect(operacionesDe(PATHS).length).toBeGreaterThanOrEqual(10);
  });

  it("cada operación de `openApiSpec.paths` sale con su método y su ruta exactos", async () => {
    expect(operacionesSinDocumentar(await cuerpoGuia(), PATHS)).toEqual([]);
  });

  it("ninguna ruta que la guía presenta como endpoint falta de `openApiSpec.paths`", async () => {
    expect(operacionesQueLaSpecNoTiene(await cuerpoGuia(), PATHS)).toEqual([]);
  });

  it("y la extracción ve los endpoints de verdad (si no, el caso de arriba sería vacuo)", async () => {
    const cuerpo = await cuerpoGuia();
    const ficticia = `${cuerpo}\n\n## 9.9 **GET** \`/api/ordenes/api-key/no-existe\`\n`;
    expect(operacionesQueLaSpecNoTiene(ficticia, PATHS)).toEqual(["GET /api/ordenes/api-key/no-existe"]);
  });

  it("MUTACION: una operación ficticia añadida a una copia de la spec pone rojo el caso de R1303", async () => {
    const copia: PathsSpec = {
      ...PATHS,
      "/api/ordenes/api-key/ficticia-slt80": { post: { responses: { "200": {}, "418": {} } } },
    };
    expect(operacionesSinDocumentar(await cuerpoGuia(), copia)).toEqual([
      "**POST** `/api/ordenes/api-key/ficticia-slt80`",
    ]);
  });
});

describe("R1304 — la guía nombra cada evento de `EVENTOS_PUBLICOS`", () => {
  it("CONTROL DE NO-VACUIDAD: hay al menos un evento", () => {
    expect(EVENTOS_PUBLICOS.size).toBeGreaterThanOrEqual(1);
  });

  it("cada uno aparece como código en la guía", async () => {
    const cuerpo = await cuerpoGuia();
    expect([...EVENTOS_PUBLICOS].filter((evento) => !cuerpo.includes(`\`${evento}\``))).toEqual([]);
  });
});

describe("R1305 — cada operación trae un ejemplo y nombra sus respuestas no-2xx", () => {
  it("sin huecos en ninguna sección", async () => {
    expect(huecosPorOperacion(await cuerpoGuia(), PATHS)).toEqual([]);
  });

  it("MUTACION: una sección sin ejemplo y sin su código de error se ve", () => {
    const paths: PathsSpec = { "/api/x": { get: { responses: { "200": {}, "404": {} } } } };
    expect(huecosPorOperacion("## 1 **GET** `/api/x`\n\nTexto.\n\n## 2 Otra\n\n404\n", paths)).toEqual([
      "**GET** `/api/x`: sin ejemplo (bloque de código)",
      "**GET** `/api/x`: no nombra 404",
    ]);
  });
});

/** Los `.json` del repositorio, sin las carpetas que no son fuente. */
function jsonDelRepo(dir = RAIZ, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (/^(node_modules|\.next|\.git|\.worktrees|\.vercel|\.turbo|coverage|test-results|playwright-report)$/.test(entrada.name)) continue;
      jsonDelRepo(path.join(dir, entrada.name), acc);
    } else if (entrada.name.endsWith(".json")) acc.push(path.join(dir, entrada.name));
  }
  return acc;
}

describe("R1312 — la colección de Postman no tiene otra copia", () => {
  it("ningún otro `.json` del repositorio tiene su contenido ni su `info.name`", () => {
    const leer = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    const original = leer(path.join(RAIZ, POSTMAN));
    const huella = createHash("sha256").update(original).digest("hex");
    const nombre = (JSON.parse(original) as { info?: { name?: string } }).info?.name;
    expect(nombre, "CONTROL DE NO-VACUIDAD: la colección tiene `info.name`").toBeTruthy();

    const todos = jsonDelRepo();
    expect(todos.some((f) => path.relative(RAIZ, f).split(path.sep).join("/") === POSTMAN)).toBe(true);
    const copias = todos
      .filter((f) => path.relative(RAIZ, f).split(path.sep).join("/") !== POSTMAN)
      .filter((f) => {
        const texto = leer(f);
        if (createHash("sha256").update(texto).digest("hex") === huella) return true;
        return texto.includes(`"name": ${JSON.stringify(nombre)}`) || texto.includes(`"name":${JSON.stringify(nombre)}`);
      })
      .map((f) => path.relative(RAIZ, f));
    expect(copias).toEqual([]);
  });
});
