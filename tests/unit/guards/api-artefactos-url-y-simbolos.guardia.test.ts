import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";
import { URL_PRODUCCION_API } from "@/lib/api/url-produccion";

// GUARDIA — SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador
// se conecte».
//
// Lo que un integrador recibe para conectarse son tres artefactos: la guía de integración (de ella
// salen la página de Ayuda y el PDF), la colección de Postman y el contrato OpenAPI que pinta Swagger
// en `/api-docs` (con su espejo `.yaml`). Hasta esta ficha los tres apuntaban a una URL que no es la
// de producción (`app.example.com`, `localhost`) o a ninguna, y la guía usaba símbolos que el
// documento no debe llevar. Cuatro reglas, sobre los cuatro archivos:
//
// 1. Ningún dominio de prueba: ni `example.com`, ni `localhost`, ni `127.0.0.1`.
// 2. Ningún símbolo de los vetados: `§`, `⭑`, `→`, `✔`, `⚠`, `∈`, `☐`. Las referencias van como
//    «sección 5.9».
// 3. La URL base es la de producción: la guía la declara, la `baseUrl` de Postman la trae y el
//    contrato la publica en `servers`, detrás del relativo `/` («Este servidor», para que «Try it out»
//    use el host donde se abrió Swagger: review H9). Toda URL absoluta de los artefactos es de
//    producción o un marcador entre `<>` (por ejemplo `https://<host-de-storage>`).
// 4. Ni país ni moneda escritos a mano (review H3): ni `colones`, ni `colón`, ni `Costa Rica`. Se dice
//    «la moneda del país de la empresa» y «la zona horaria del país de la empresa». Se exceptúan las
//    filas de historial de la guía con fecha anterior al 2026-11-18, que cuentan lo que se dijo.
//
// 5. La guía no remite a archivos del repositorio, que el integrador no tiene (review H6, R8 del
//    spec): ni `docs/`, ni `lib/`, ni `app/`, ni `.yaml`, ni `CHANGELOG.md` en el cuerpo. Se exceptúan
//    el front matter (`fuentes:` es para quien mantiene la guía) y el mensaje literal del `422` por
//    código anterior, que es el texto que devuelve la API. Una ruta de URL (`/api/docs/openapi`) no
//    cuenta: va detrás de `/`.
//
// En el `.yaml` las reglas 2 y 4 miran también los comentarios (review H8): quien abre el archivo los
// lee. Las reglas 1 y 3 los dejan fuera: los comentarios citan rutas internas y no son una URL base.
//
// La URL va LITERAL aquí, a mano: es el contrato. Comparar los artefactos solo contra
// `URL_PRODUCCION_API` dejaría pasar un cambio de esa constante a cualquier otra cosa.
//
// Se declara como guardia porque lee archivos del disco: ningún grafo de imports la seleccionaría.

const URL_PRODUCCION = "https://www.servilogistic.co";

const RAIZ = process.cwd();
const leer = (rel: string): string => readFileSync(path.join(RAIZ, rel), "utf8");

const DOMINIOS_DE_PRUEBA = ["example.com", "localhost", "127.0.0.1"] as const;
const SIMBOLOS_VETADOS = ["§", "⭑", "→", "✔", "⚠", "∈", "☐"] as const;
const PAIS_Y_MONEDA = ["colones", "colón", "costa rica"] as const;
/** Fecha de esta revisión: las filas de historial anteriores pueden citar lo que se dijo entonces. */
const FECHA_REVISION = "2026-11-18";

/** Hosts que no son una URL base de la API pero pueden aparecer: el esquema de Postman. */
const HOSTS_AJENOS_PERMITIDOS = new Set(["schema.getpostman.com"]);

/** Quita las líneas de comentario del `.yaml`. */
function sinComentariosYaml(texto: string): string {
  return texto
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");
}

/** Quita las filas de tabla que empiezan por una fecha anterior a la revisión (historial). */
export function sinHistorialAnterior(texto: string): string {
  return texto
    .split(/\r?\n/)
    .filter((l) => {
      const m = /^\| (\d{4}-\d{2}-\d{2}) \|/.exec(l);
      return !(m && m[1] < FECHA_REVISION);
    })
    .join("\n");
}

/** Los dominios de prueba que aparecen en el texto. */
export function dominiosDePrueba(texto: string): string[] {
  const minus = texto.toLowerCase();
  return DOMINIOS_DE_PRUEBA.filter((d) => minus.includes(d));
}

/** Los símbolos vetados que aparecen en el texto. */
export function simbolosVetados(texto: string): string[] {
  return SIMBOLOS_VETADOS.filter((s) => texto.includes(s));
}

/** Los literales de país o moneda que aparecen en el texto. */
export function paisOMoneda(texto: string): string[] {
  const minus = texto.toLowerCase();
  return PAIS_Y_MONEDA.filter((s) => minus.includes(s));
}

/** El mensaje que devuelve la API al filtrar por un código anterior: la guía lo cita tal cual. */
const LITERAL_DEL_422 = "Ver docs/api/CHANGELOG.md.";

/** Las referencias a archivos del repositorio en el cuerpo de la guía (sin front matter). */
export function referenciasAlRepositorio(guia: string): string[] {
  const cuerpo = guia.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").split(LITERAL_DEL_422).join("");
  return cuerpo.match(/(?<![\w/.-])(?:docs|lib|app)\/|\.ya?ml\b|CHANGELOG\.md/g) ?? [];
}

/** Las URL absolutas cuyo origen no es el de producción ni un marcador `<...>`. */
export function urlsAjenas(texto: string): string[] {
  const urls = texto.match(/https?:\/\/[^\s"'`)\\]+/g) ?? [];
  return urls.filter((u) => {
    if (u === URL_PRODUCCION || u.startsWith(`${URL_PRODUCCION}/`)) return false;
    const host = u.replace(/^https?:\/\//, "").split("/")[0];
    if (host.includes("<")) return false;
    return !HOSTS_AJENOS_PERMITIDOS.has(host);
  });
}

interface Artefacto {
  nombre: string;
  /** Lo que miran las reglas 1 y 3. */
  texto: () => string;
  /** Lo que miran las reglas 2 y 4: en el `.yaml`, también los comentarios. */
  textoCompleto: () => string;
}

const GUIA = "docs/ayuda/oficina/guia-integracion-api.md";
const POSTMAN = "docs/api/servi-logistic-api-key.postman_collection.json";
const YAML = "docs/api/api-key-openapi.yaml";

const ARTEFACTOS: Artefacto[] = [
  { nombre: GUIA, texto: () => leer(GUIA), textoCompleto: () => sinHistorialAnterior(leer(GUIA)) },
  { nombre: POSTMAN, texto: () => leer(POSTMAN), textoCompleto: () => leer(POSTMAN) },
  // Lo que sirve `/api/docs/openapi` y pinta Swagger: el objeto serializado, no el código fuente
  // (sus comentarios no los lee el integrador).
  {
    nombre: "lib/api/openapi-spec.ts (serializado)",
    texto: () => JSON.stringify(openApiSpec),
    textoCompleto: () => JSON.stringify(openApiSpec),
  },
  { nombre: YAML, texto: () => sinComentariosYaml(leer(YAML)), textoCompleto: () => leer(YAML) },
];

describe("SLT-208 — la constante de la URL de producción es la del contrato", () => {
  it("URL_PRODUCCION_API vale la URL de producción literal", () => {
    expect(URL_PRODUCCION_API).toBe(URL_PRODUCCION);
  });
});

describe.each(ARTEFACTOS)("SLT-208 — $nombre", ({ nombre, texto, textoCompleto }) => {
  it("regla 1: no nombra ningún dominio de prueba (example.com, localhost, 127.0.0.1)", () => {
    expect(dominiosDePrueba(texto()), `${nombre} nombra un dominio de prueba`).toEqual([]);
  });

  it("regla 2: no usa ninguno de los símbolos vetados (§ ⭑ → ✔ ⚠ ∈ ☐)", () => {
    expect(simbolosVetados(textoCompleto()), `${nombre} usa un símbolo vetado`).toEqual([]);
  });

  it("regla 3: toda URL absoluta es la de producción o un marcador <...>", () => {
    expect(urlsAjenas(texto()), `${nombre} trae una URL que no es la de producción`).toEqual([]);
  });

  it("regla 4: no escribe país ni moneda (colones, colón, Costa Rica)", () => {
    expect(paisOMoneda(textoCompleto()), `${nombre} nombra un país o una moneda`).toEqual([]);
  });
});

describe("SLT-208 regla 5 — la guía no remite a archivos del repositorio", () => {
  it("el cuerpo de la guía no cita docs/, lib/, app/, .yaml ni CHANGELOG.md", () => {
    expect(referenciasAlRepositorio(leer(GUIA))).toEqual([]);
  });
});

describe("SLT-208 regla 3 — cada artefacto declara la URL base de producción", () => {
  it("la guía la declara al comienzo y en la tabla de la sección 4.1", () => {
    const guia = leer(GUIA);
    expect(guia).toContain(`Base URL de producción: \`${URL_PRODUCCION}\``);
    expect(guia).toContain(`| Producción | \`${URL_PRODUCCION}\` |`);
  });

  it("la `baseUrl` de la colección de Postman es la de producción", () => {
    const coleccion = JSON.parse(leer(POSTMAN)) as { variable: { key: string; value: string }[] };
    const baseUrl = coleccion.variable.find((v) => v.key === "baseUrl");
    expect(baseUrl?.value).toBe(URL_PRODUCCION);
  });

  it("el contrato servido publica `servers`: primero «este servidor» y después producción", () => {
    const spec = openApiSpec as unknown as { servers?: { url: string }[] };
    expect(spec.servers?.map((s) => s.url)).toEqual(["/", URL_PRODUCCION]);
  });

  it("el espejo `.yaml` publica los mismos dos servidores, en el mismo orden", () => {
    const yaml = leer(YAML);
    expect(yaml).toMatch(
      /^servers:\r?\n {2}- url: \/\r?\n {4}description: Este servidor\r?\n {2}- url: "https:\/\/www\.servilogistic\.co"\r?$/m,
    );
  });
});

describe("SLT-208 — MUTACIÓN: las reglas se ponen rojas con un texto malo", () => {
  it("regla 1 caza cada dominio de prueba", () => {
    expect(dominiosDePrueba("curl https://app.example.com/api")).toEqual(["example.com"]);
    expect(dominiosDePrueba("http://localhost:3000")).toEqual(["localhost"]);
    expect(dominiosDePrueba("http://127.0.0.1:3000")).toEqual(["127.0.0.1"]);
  });

  it("regla 2 caza cada símbolo vetado", () => {
    for (const s of SIMBOLOS_VETADOS) expect(simbolosVetados(`ver ${s}5.9`)).toEqual([s]);
  });

  it("regla 3 caza una URL de otro host y deja pasar producción y marcadores", () => {
    expect(urlsAjenas("https://servilogistic.co/api")).toEqual(["https://servilogistic.co/api"]);
    expect(urlsAjenas("https://www.servilogistic.co.otro.com/api")).toEqual([
      "https://www.servilogistic.co.otro.com/api",
    ]);
    expect(urlsAjenas(`${URL_PRODUCCION}/api y https://<host-de-storage>/x`)).toEqual([]);
  });

  it("regla 5 caza las rutas del repositorio y deja pasar el front matter, el 422 y las URL", () => {
    const frontMatter = "---\nfuentes:\n  - lib/api/openapi-spec.ts\n---\n";
    expect(referenciasAlRepositorio(`${frontMatter}Ver \`docs/api/api-key-openapi.yaml\``)).toEqual(["docs/", ".yaml"]);
    expect(referenciasAlRepositorio(`${frontMatter}Lea CHANGELOG.md y app/x`)).toEqual(["CHANGELOG.md", "app/"]);
    expect(referenciasAlRepositorio(`${frontMatter}"... ${LITERAL_DEL_422}" en /api/docs/openapi`)).toEqual([]);
  });

  it("regla 4 caza país y moneda, y deja pasar el historial anterior a la revisión", () => {
    expect(paisOMoneda("Monto en colones")).toEqual(["colones"]);
    expect(paisOMoneda("se redondea al colón")).toEqual(["colón"]);
    expect(paisOMoneda("hora de Costa Rica")).toEqual(["costa rica"]);
    expect(sinHistorialAnterior("| 2026-11-05 | hora de Costa Rica |")).toBe("");
    expect(sinHistorialAnterior("| 2026-11-18 | hora de Costa Rica |")).toBe("| 2026-11-18 | hora de Costa Rica |");
  });
});
