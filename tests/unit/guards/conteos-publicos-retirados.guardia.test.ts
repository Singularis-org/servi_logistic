import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  aristasDeImport,
  exportaLaAccion,
  fuenteDelModulo,
} from "../../fixtures/deteccion-maqueta";
import { quitarComentarios } from "../../fixtures/sin-comentarios";
import {
  NO_SON_SUPERFICIES_DE_ENVIO,
  PRODUCTOR_POR_SUPERFICIE,
  type ProductorSuperficie,
} from "../../fixtures/superficies-publicas";

// SL-17 R43 (D17, design §7.8) — LOS CONTEOS PÚBLICOS SE RETIRARON Y NO VUELVEN.
//
// Con una sola empresa, contar órdenes y distritos sin sesión era una cifra comercial. Con
// varias, la landing es de la plataforma: el mismo conteo suma el negocio de todas y lo publica
// a cualquiera. No hay una versión «por empresa» que sirva aquí, así que se retiró entero
// (acción, repositorio, caché y componente) en vez de quedarse como excepción de plataforma.
//
// Lo que esta guardia sostiene, en tres frentes:
//   1. ningún archivo de los retirados existe;
//   2. nada en `lib/`, `app/` ni `components/` importa ni exporta un símbolo de conteos públicos;
//      y la landing, en particular, no importa ninguno;
//   3. las Server Actions que una raíz pública dispara son EXACTAMENTE las del censo de
//      superficies de envío, y la lista de lecturas exentas está vacía: una lectura pública
//      nueva —el camino por el que volvería un agregado— no puede entrar sin romper esto.
//
// Se mira el código SIN comentarios: la prosa de este repo cita los conteos al explicar por qué
// se fueron, y eso no es un import.

const RAIZ = path.resolve(__dirname, "../../..");

/** Los archivos que §7.8 borra. Si uno reaparece, vuelve el mecanismo entero. */
const RETIRADOS = [
  "lib/actions/conteos-publicos.ts",
  "lib/repositories/ConteosPublicosRepository.ts",
  "lib/interfaces/repositories/IConteosPublicosRepository.ts",
  "lib/interfaces/external/IConteosPublicosCache.ts",
  "lib/config/conteos-publicos-cache.ts",
  "lib/cache/conteos-publicos-cache-nula.ts",
  "lib/cache/next-conteos-publicos-cache.ts",
  "lib/types/conteos-publicos.ts",
  "app/_landing/cifras-publicas.tsx",
];

/** Dónde vive el código de producción que podría reimportarlos. */
const AMBITO = ["lib", "app", "components"];

/** La landing de la plataforma: su carpeta y la página que la compone. */
const LANDING = ["app/_landing", "app/page.tsx"];

/**
 * Las raíces que alguien sin sesión alcanza. Las del censo de superficies más `app/page.tsx`, que
 * el censo no lista porque no tiene formularios, pero es justo donde se montaban las cifras.
 */
const RAICES_SIN_SESION = ["app/_landing", "app/postulacion", "app/page.tsx"];

/** El nombre de un módulo de conteos públicos, en cualquiera de las grafías que tuvo. */
const NOMBRE_RETIRADO = /conteos[-_]?publicos|cifras[-_]publicas/i;

/** Especificadores de módulo: `from "…"`, `import "…"`, `import("…")` y `require("…")`. */
const ESPECIFICADOR =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;

/** Un export cuyo nombre es de conteos públicos (función, constante, clase, tipo o interfaz). */
const EXPORT_RETIRADO =
  /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+(\w*conteos_?publicos\w*)/gi;

function listar(rel: string): string[] {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) return [];
  if (/\.tsx?$/.test(rel)) return [rel];
  const salida: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const hijo = `${rel}/${e.name}`;
    if (e.isDirectory()) salida.push(...listar(hijo));
    else if (/\.tsx?$/.test(e.name)) salida.push(hijo);
  }
  return salida;
}

function codigoDe(rel: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
}

/** Los módulos de conteos públicos que este código importa (por cualquier vía). */
function importacionesRetiradas(codigo: string): string[] {
  return [...codigo.matchAll(ESPECIFICADOR)]
    .map((m) => m[1])
    .filter((especificador) => NOMBRE_RETIRADO.test(especificador));
}

/** Los exports de conteos públicos que este código declara. */
function exportsRetirados(codigo: string): string[] {
  return [...codigo.matchAll(EXPORT_RETIRADO)].map((m) => m[1]);
}

/** Server Actions de `lib/actions/` que dispara un fuente, ya sin comentarios. */
function accionesDisparadas(codigo: string): string[] {
  const salida: string[] = [];
  for (const arista of aristasDeImport(codigo)) {
    if (arista.esTipo) continue;
    const modulo = arista.modulo.replace(/^@\//, "").replace(/\.tsx?$/, "");
    if (!modulo.startsWith("lib/actions/")) continue;
    const fuente = fuenteDelModulo(modulo);
    if (fuente === null) continue;
    for (const simbolo of arista.simbolos) {
      if (exportaLaAccion(fuente, simbolo)) salida.push(simbolo);
    }
  }
  return salida;
}

function accionesDelCenso(): Set<string> {
  return new Set(
    Object.values(PRODUCTOR_POR_SUPERFICIE as Record<string, ProductorSuperficie>)
      .filter((p): p is { accionServidor: string; modulo: string } => "accionServidor" in p)
      .map((p) => p.accionServidor),
  );
}

// =================================================================================================
// 0 — LOS DETECTORES, CONTRA RESPUESTAS CONOCIDAS. Sin esto, un detector roto da verde por vacío.
// =================================================================================================
describe("SL-17 R43 — los detectores ven un reimport y no confunden la prosa", () => {
  it("ve el import nombrado, el de tipo, el dinámico y el relativo de la landing", () => {
    const inventada = quitarComentarios(
      [
        `import { obtenerConteosPublicos } from "@/lib/actions/conteos-publicos";`,
        `import type { ConteosPublicos } from "@/lib/types/conteos-publicos";`,
        `const m = await import("@/lib/repositories/ConteosPublicosRepository");`,
        `import { CifraAnimada } from "./cifras-publicas";`,
      ].join("\n"),
    );
    expect(importacionesRetiradas(inventada)).toEqual([
      "@/lib/actions/conteos-publicos",
      "@/lib/types/conteos-publicos",
      "@/lib/repositories/ConteosPublicosRepository",
      "./cifras-publicas",
    ]);
  });

  it("ve los exports con nombre de conteos públicos", () => {
    const inventada = [
      "export async function obtenerConteosPublicos() { return null; }",
      "export interface ConteosPublicos { ordenes: number }",
      "export class ConteosPublicosRepository {}",
    ].join("\n");
    expect(exportsRetirados(inventada)).toEqual([
      "obtenerConteosPublicos",
      "ConteosPublicos",
      "ConteosPublicosRepository",
    ]);
  });

  it("no cuenta la prosa: un comentario que cita los conteos no es un import", () => {
    const prosa = quitarComentarios(
      [
        `// antes: import { obtenerConteosPublicos } from "@/lib/actions/conteos-publicos";`,
        `/* export const ConteosPublicos = 1; */`,
        `import { EnfasisOscuro } from "./primitivas";`,
      ].join("\n"),
    );
    expect(importacionesRetiradas(prosa)).toEqual([]);
    expect(exportsRetirados(prosa)).toEqual([]);
  });
});

// =================================================================================================
// 1 — LOS ARCHIVOS
// =================================================================================================
describe("SL-17 R43 — los archivos de los conteos públicos ya no existen", () => {
  it.each(RETIRADOS)("%s no existe", (rel) => {
    expect(existsSync(path.join(RAIZ, rel)), `${rel} se retiró en SL-17 (design §7.8)`).toBe(false);
  });
});

// =================================================================================================
// 2 — LOS IMPORTS Y LOS EXPORTS
// =================================================================================================
describe("SL-17 R43 — nada importa ni exporta conteos públicos", () => {
  const fuentes = AMBITO.flatMap(listar);

  it("el ámbito tiene código de verdad (anti-vacuidad)", () => {
    expect(fuentes.length).toBeGreaterThan(200);
    expect(fuentes).toContain("app/page.tsx");
    expect(fuentes).toContain("app/_landing/LandingHero.tsx");
  });

  it("ningún archivo de lib/, app/ ni components/ importa un módulo de conteos públicos", () => {
    const infractores = fuentes.flatMap((rel) =>
      importacionesRetiradas(codigoDe(rel)).map((m) => `${rel} importa ${m}`),
    );
    expect(infractores).toEqual([]);
  });

  it("ninguno declara un export de conteos públicos", () => {
    const infractores = fuentes.flatMap((rel) =>
      exportsRetirados(codigoDe(rel)).map((s) => `${rel} exporta ${s}`),
    );
    expect(infractores).toEqual([]);
  });

  it("la landing (app/_landing/** y app/page.tsx) no importa ninguno", () => {
    const landing = LANDING.flatMap(listar);
    expect(landing.length).toBeGreaterThanOrEqual(5);
    const infractores = landing.flatMap((rel) =>
      importacionesRetiradas(codigoDe(rel)).map((m) => `${rel} importa ${m}`),
    );
    expect(infractores).toEqual([]);
  });
});

// =================================================================================================
// 3 — LO QUE SE ALCANZA SIN SESIÓN
// =================================================================================================
describe("SL-17 R43 — sin sesión solo se disparan las superficies del censo", () => {
  it("la lista de lecturas públicas exentas está vacía", () => {
    // Era la puerta por la que entraban los conteos: una lectura que no es un envío. Vacía, toda
    // acción pública tiene que ser una superficie declarada del censo.
    expect([...NO_SON_SUPERFICIES_DE_ENVIO]).toEqual([]);
  });

  it("toda acción que dispara una raíz sin sesión es una superficie del censo, y ninguna es un conteo", () => {
    const censo = accionesDelCenso();
    const disparadas = RAICES_SIN_SESION.flatMap(listar).flatMap((rel) =>
      accionesDisparadas(codigoDe(rel)).map((simbolo) => ({ simbolo, rel })),
    );

    // Anti-vacuidad: el detector ve las tres superficies de hoy.
    const vistas = new Set(disparadas.map((d) => d.simbolo));
    for (const s of censo) expect([...vistas], s).toContain(s);

    const fuera = disparadas
      .filter((d) => !censo.has(d.simbolo))
      .map((d) => `${d.simbolo} (lo dispara ${d.rel})`);
    expect(fuera, "acción pública fuera del censo de superficies de envío").toEqual([]);

    const agregados = [...vistas].filter((s) => /conteo|cifra|agregad|estadistic|total/i.test(s));
    expect(agregados, "acción pública con nombre de agregado de negocio").toEqual([]);
  });
});
