// SL-8 — guardia de la marca: amarillo nunca sobre claro, tinta legible sobre la marca, tokens sin
// la paleta anterior, manifiesto y `docs/marca.md` alineados con el CSS, fuente Archivo y el nombre
// anterior fuera del alcance.
//
// Por qué una guardia y no tests de componente: `text-brand-light` compila igual sobre negro que
// sobre blanco, y el día que alguien lo pone sobre el fondo claro (1.37:1) no cae ningún test. Lo
// único que lo ve es barrer las listas de clases y resolver cada color con el CSS real.
//
// Cada parte separa la regla (una función pura) de su aplicación al árbol, y prueba la regla con un
// texto sintético que tiene que dar rojo y otro que tiene que dar verde. Sin el rojo sintético, un
// barrido que no encuentra nada por estar mal escrito pasaría en verde.
//
// Los censos llevan su cifra como LITERAL, medida a mano con `contraste()` el 2026-10-22. La guardia
// la vuelve a calcular y exige que coincida: si cambia una superficie o un token, el número escrito
// deja de ser cierto y eso tiene que verse aquí.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { contraste, cssSinComentarios, paleta, token, utilidad } from "../../fixtures/contraste";
import { quitarComentarios } from "../../fixtures/sin-comentarios";

type Tema = "claro" | "oscuro";

const RAIZ = path.resolve(__dirname, "../../..");
const AMARILLO = "#ffd000";
const NEGRO = "#111111";
const AA_TEXTO = 4.5;

// Partido para que este archivo no contenga el nombre anterior literal (R26).
const NOMBRE_ANTERIOR = ["orden", "ex"].join("");

// ─────────────────────────────────────────────────────────────────────────────────────────
// Lectura del árbol
// ─────────────────────────────────────────────────────────────────────────────────────────

function leer(rel: string): string {
  return readFileSync(path.join(RAIZ, rel), "utf8");
}

function archivosBajo(rel: string, extensiones: RegExp): string[] {
  const abs = path.join(RAIZ, rel);
  if (statSync(abs).isFile()) return [rel];
  const salida: string[] = [];
  for (const entrada of readdirSync(abs, { withFileTypes: true })) {
    const hijo = path.posix.join(rel, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosBajo(hijo, extensiones));
    else if (extensiones.test(entrada.name)) salida.push(hijo);
  }
  return salida;
}

const CODIGO = /\.(ts|tsx)$/;

interface Lista {
  archivo: string;
  linea: number;
  clases: string[];
}

/**
 * Una lista de clases es el texto de UN literal de cadena. Se parsea con el compilador y no con
 * una regex porque un apóstrofo en un texto de JSX desalinea cualquier escáner de comillas, y un
 * escáner desalineado no falla: deja de ver clases.
 */
function listasDeClases(archivo: string, fuente: string): Lista[] {
  const codigo = quitarComentarios(fuente);
  const sf = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const listas: Lista[] = [];
  const anotar = (nodo: ts.Node, texto: string) => {
    const clases = texto.split(/\s+/).filter(Boolean);
    if (clases.length === 0) return;
    const linea = sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1;
    listas.push({ archivo, linea, clases });
  };
  const visitar = (nodo: ts.Node) => {
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) {
      anotar(nodo, nodo.text);
    } else if (ts.isTemplateExpression(nodo)) {
      anotar(nodo, [nodo.head.text, ...nodo.templateSpans.map((s) => s.literal.text)].join(" "));
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return listas;
}

function listasDelArbol(raices: string[]): Lista[] {
  return raices
    .flatMap((r) => archivosBajo(r, CODIGO))
    .flatMap((archivo) => listasDeClases(archivo, leer(archivo)));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Resolución de una clase de Tailwind a un color
// ─────────────────────────────────────────────────────────────────────────────────────────

interface Clase {
  variantes: string[];
  utilidad: string;
  nombre: string;
  alfa: number | null;
}

/** Parte `hover:dark:text-brand-light/80` en variantes, utilidad, nombre y alfa. */
function partirClase(clase: string): Clase | null {
  const partes: string[] = [];
  let hondura = 0;
  let actual = "";
  for (const c of clase) {
    if (c === "[") hondura += 1;
    if (c === "]") hondura -= 1;
    if (c === ":" && hondura === 0) {
      partes.push(actual);
      actual = "";
    } else actual += c;
  }
  const m = actual.replace(/^!/, "").match(/^(text|bg)-([a-z][a-z0-9-]*)(?:\/(\d+))?$/);
  if (!m) return null;
  return {
    variantes: partes,
    utilidad: m[1]!,
    nombre: m[2]!,
    alfa: m[3] ? Number(m[3]) / 100 : null,
  };
}

const COLORES_DE_TAILWIND: Record<string, string> = { white: "#ffffff", black: "#000000" };

/** El hex de la utilidad `--color-<nombre>` en un tema, o `null` si no es un color (`text-sm`). */
const UTILIDADES_DE_COLOR = new Set(
  [...cssSinComentarios.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]!),
);

function colorDe(tema: Tema, nombre: string): string | null {
  if (COLORES_DE_TAILWIND[nombre]) return COLORES_DE_TAILWIND[nombre]!;
  // Que no exista la utilidad quiere decir que no es un color, no que haya que adivinarlo.
  if (!UTILIDADES_DE_COLOR.has(nombre)) return null;
  return utilidad(tema, nombre).toLowerCase();
}

const enOscuro = (c: Clase) => c.variantes.includes("dark");

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 1 — la regla no ha caducado (R15)
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Los fondos sobre los que el amarillo SÍ llegaría a texto AA: si hay alguno, la regla caducó. */
function fondosDondeLaReglaCaduca(amarillo: string, fondos: string[]): string[] {
  return fondos.filter((f) => contraste(amarillo, f) >= AA_TEXTO);
}

describe("parte 1 — el amarillo no llega a texto sobre blanco ni sobre el fondo claro (R15)", () => {
  it("sintético: un amarillo oscurecido haría caducar la regla, el de la marca no", () => {
    expect(fondosDondeLaReglaCaduca("#5c4b00", ["#ffffff"])).toEqual(["#ffffff"]);
    expect(fondosDondeLaReglaCaduca("#FFD000", ["#ffffff"])).toEqual([]);
  });

  it("el amarillo de la marca mide 1.47 sobre blanco y 1.37 sobre el fondo claro", () => {
    expect(fondosDondeLaReglaCaduca(AMARILLO, ["#ffffff", token("claro", "background")])).toEqual(
      [],
    );
    expect(contraste(AMARILLO, "#ffffff")).toBeCloseTo(1.47, 2);
    expect(contraste(AMARILLO, token("claro", "background"))).toBeCloseTo(1.37, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 2 — amarillo sin `dark:` solo sobre oscuro fijo, y censado (R15)
// ─────────────────────────────────────────────────────────────────────────────────────────

interface FilaCenso {
  archivo: string;
  clase: string;
  /** Utilidad de fondo de valor fijo (hex en `@theme`) sobre la que va el texto. */
  superficie: string;
  /** `contraste()` del texto sobre la superficie, medido a mano y escrito como literal. */
  medido: number;
  apariciones: number;
}

// Medido el 2026-10-22. `primitivas.tsx` se usa sobre `navy-deep` (12.84) y sobre `asfalto-9`; se
// censa el peor caso. SL-33, re-medido el 2026-10-28: `asfalto-9` pasa de `#0d2444` a `stone-900`
// (`#1c1917`) y el amarillo sobre ella sube de 10.55 a 11.89; sigue siendo el peor caso.
const CENSO_AMARILLO: readonly FilaCenso[] = [
  { archivo: "app/_landing/LandingBanda.tsx", clase: "text-brand-light", superficie: "navy-deep", medido: 12.84, apariciones: 1 },
  { archivo: "app/_landing/LandingFooter.tsx", clase: "text-brand-light", superficie: "navy-deep", medido: 12.84, apariciones: 1 },
  { archivo: "app/_landing/LandingHero.tsx", clase: "text-brand-light", superficie: "navy-deep", medido: 12.84, apariciones: 1 },
  { archivo: "app/_landing/LandingPoliticas.tsx", clase: "text-brand-light", superficie: "asfalto-9", medido: 11.89, apariciones: 1 },
  { archivo: "app/_landing/primitivas.tsx", clase: "text-brand-light", superficie: "asfalto-9", medido: 11.89, apariciones: 2 },
];

/** Cuenta, por archivo y clase, las clases de texto sin `dark:` que cumplen `cumple`. */
function contarSinDark(
  listas: Lista[],
  cumple: (c: Clase, lista: Clase[]) => boolean,
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const lista of listas) {
    const clases = lista.clases.map(partirClase).filter((c): c is Clase => c !== null);
    for (const c of clases) {
      if (c.utilidad !== "text" || enOscuro(c) || !cumple(c, clases)) continue;
      const clave = `${lista.archivo}|text-${c.nombre}`;
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    }
  }
  return cuenta;
}

function contrastarConCenso(cuenta: Map<string, number>, censo: readonly FilaCenso[]): string[] {
  const fallos: string[] = [];
  const censadas = new Map(censo.map((f) => [`${f.archivo}|${f.clase}`, f]));
  for (const [clave, n] of cuenta) {
    const fila = censadas.get(clave);
    if (!fila) fallos.push(`fuera del censo: ${clave} (${n})`);
    else if (fila.apariciones !== n) fallos.push(`${clave}: ${n} apariciones, censadas ${fila.apariciones}`);
  }
  for (const clave of censadas.keys()) {
    if (!cuenta.has(clave)) fallos.push(`fila del censo que ya no aparece: ${clave}`);
  }
  return fallos;
}

const esAmarilloEnClaro = (c: Clase) => colorDe("claro", c.nombre) === AMARILLO;

function fallosAmarillo(listas: Lista[], censo: readonly FilaCenso[]): string[] {
  return contrastarConCenso(contarSinDark(listas, esAmarilloEnClaro), censo);
}

/** Una superficie censada es de valor fijo (`paleta()` solo lee hexes) y cumple el umbral. */
function verificarSuperficie(fila: FilaCenso, tinta: string) {
  const fondo = paleta(fila.superficie);
  const medido = contraste(tinta, fondo);
  expect(medido, `${fila.archivo} sobre ${fila.superficie}`).toBeGreaterThanOrEqual(AA_TEXTO);
  expect(medido, `${fila.archivo}: la cifra escrita ya no es la medida`).toBeCloseTo(fila.medido, 2);
}

describe("parte 2 — texto amarillo sin `dark:` solo en el censo de superficies oscuras (R15)", () => {
  const censoSintetico: FilaCenso[] = [
    { archivo: "x.tsx", clase: "text-brand-light", superficie: "navy-deep", medido: 12.84, apariciones: 1 },
  ];

  it("sintético: un amarillo fuera del censo, o una fila sin aparición, da rojo", () => {
    const fuera = listasDeClases("y.tsx", `<p className="text-sm text-brand-light">a</p>`);
    expect(fallosAmarillo(fuera, censoSintetico)).toEqual([
      "fuera del censo: y.tsx|text-brand-light (1)",
      "fila del censo que ya no aparece: x.tsx|text-brand-light",
    ]);
    const hover = listasDeClases("x.tsx", `const a = "hover:text-sidebar-primary"; const b = "text-brand-light";`);
    expect(fallosAmarillo(hover, censoSintetico)).toEqual([
      "fuera del censo: x.tsx|text-sidebar-primary (1)",
    ]);
  });

  it("sintético: el censado, o el amarillo con `dark:`, da verde", () => {
    const censado = listasDeClases("x.tsx", `<p className="text-brand-light">l'a</p><b className="dark:text-brand-light" />`);
    expect(fallosAmarillo(censado, censoSintetico)).toEqual([]);
  });

  it("en el árbol, cada amarillo sin `dark:` está en CENSO_AMARILLO y nada más", () => {
    expect(fallosAmarillo(listasDelArbol(["app", "components"]), CENSO_AMARILLO)).toEqual([]);
  });

  it.each(CENSO_AMARILLO)("$archivo: $superficie es oscura fija y el amarillo mide $medido", (fila) => {
    verificarSuperficie(fila, AMARILLO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 3 — la tinta sobre `bg-brand` o `bg-brand-light` opacos (R16)
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * La landing monta su árbol con `tema-claro` (`app/page.tsx`) y sus dos diálogos portaleados lo
 * vuelven a declarar, así que allí `bg-brand` nunca gira a amarillo: se mide solo en claro. Que la
 * excepción siga siendo cierta lo comprueba un caso propio.
 */
const SOLO_CLARO = "app/_landing/";
const RAICES_TEMA_CLARO_FIJO = [
  "app/page.tsx",
  "app/_landing/PostularRecursoModal.tsx",
  "app/_landing/RastreoDialog.tsx",
];

const temasDe = (archivo: string): Tema[] =>
  archivo.startsWith(SOLO_CLARO) ? ["claro"] : ["claro", "oscuro"];

function tintaEn(tema: Tema, textos: Clase[]): Clase[] {
  const claras = textos.filter((c) => c.variantes.length === 0);
  const oscuras = textos.filter((c) => c.variantes.length === 1 && enOscuro(c));
  return tema === "oscuro" && oscuras.length > 0 ? oscuras : claras;
}

function fallosTintaSobreMarca(listas: Lista[]): string[] {
  const fallos: string[] = [];
  for (const lista of listas) {
    const clases = lista.clases.map(partirClase).filter((c): c is Clase => c !== null);
    const fondo = clases.find(
      (c) =>
        c.utilidad === "bg" &&
        c.variantes.length === 0 &&
        c.alfa === null &&
        (c.nombre === "brand" || c.nombre === "brand-light"),
    );
    if (!fondo) continue;
    for (const tema of temasDe(lista.archivo)) {
      const textos = clases.filter((c) => c.utilidad === "text" && colorDe(tema, c.nombre) !== null);
      const bg = colorDe(tema, fondo.nombre)!;
      for (const t of tintaEn(tema, textos)) {
        const medido = contraste(colorDe(tema, t.nombre)!, bg);
        if (medido < AA_TEXTO) {
          fallos.push(
            `${lista.archivo}:${lista.linea} ${tema}: text-${t.nombre} sobre bg-${fondo.nombre} = ${medido.toFixed(2)}`,
          );
        }
      }
    }
  }
  return fallos;
}

describe("parte 3 — la tinta sobre la marca opaca da 4.5:1 en los dos temas (R16)", () => {
  it("sintético: blanco sobre `bg-brand` en el portal cae en oscuro (1.47)", () => {
    const rojo = listasDeClases("app/(app)/x.tsx", `<a className="bg-brand text-white">a</a>`);
    expect(fallosTintaSobreMarca(rojo)).toEqual([
      "app/(app)/x.tsx:1 oscuro: text-white sobre bg-brand = 1.47",
    ]);
    const amarilloSobreAmarillo = listasDeClases("components/x.tsx", `"bg-brand-light text-brand-light"`);
    expect(fallosTintaSobreMarca(amarilloSobreAmarillo)).toHaveLength(2);
  });

  it("sintético: la tinta de la marca, o la fija negra sobre el acento, da verde", () => {
    const verde = listasDeClases(
      "app/(app)/x.tsx",
      `"bg-brand text-brand-foreground"; "bg-brand-light text-brand-dark hover:bg-brand-light/90"; "bg-brand text-white dark:text-brand-foreground"`,
    );
    expect(fallosTintaSobreMarca(verde)).toEqual([]);
  });

  it("en el árbol, ninguna tinta sobre `bg-brand` o `bg-brand-light` baja de 4.5", () => {
    expect(fallosTintaSobreMarca(listasDelArbol(["app", "components"]))).toEqual([]);
  });

  it.each(RAICES_TEMA_CLARO_FIJO)("%s monta `tema-claro`: la landing se mide solo en claro", (rel) => {
    const clases = listasDeClases(rel, leer(rel)).flatMap((l) => l.clases);
    expect(clases).toContain("tema-claro");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 4 — negro fijo en el portal: con `dark:` o censado sobre claro fijo (R17)
// ─────────────────────────────────────────────────────────────────────────────────────────

// Medido el 2026-10-22: `#111111` sobre la superficie. `RankingPodio.tsx` pinta sus dos premios sobre
// `warning` (8.79) y sobre `brand-light` (12.84); se censa el peor caso.
const CENSO_NEGRO_FIJO: readonly FilaCenso[] = [
  { archivo: "app/(app)/ranking/_components/RankingPodio.tsx", clase: "text-navy-deep", superficie: "warning", medido: 8.79, apariciones: 2 },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx", clase: "text-brand-dark", superficie: "brand-light", medido: 12.84, apariciones: 1 },
  { archivo: "app/(app)/ordenes/_components/OrdenesCargaMasivaButton.tsx", clase: "text-brand-dark", superficie: "brand-soft", medido: 17.7, apariciones: 1 },
  { archivo: "app/(app)/ordenes/_components/OrdenesCargaPreview.tsx", clase: "text-brand-dark", superficie: "brand-soft", medido: 17.7, apariciones: 1 },
];

const RAICES_PORTAL = ["app/(app)", "components"];

/**
 * Negro FIJO es una utilidad con hex propio en `@theme` (`brand-dark`, `navy-deep`), no un alias de
 * token. `text-sidebar-primary-foreground` vale `#111111` en los dos temas, pero es un token: gira
 * con su fondo `--sidebar-primary`, que tampoco cambia, y no es lo que R17 vigila.
 */
const esNegroFijo = (c: Clase) =>
  cssSinComentarios.match(new RegExp(`--color-${c.nombre}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`))?.[1]?.toLowerCase() ===
  NEGRO;

const tieneTextoOscuro = (lista: Clase[]) =>
  lista.some((c) => c.utilidad === "text" && enOscuro(c) && colorDe("oscuro", c.nombre) !== null);

function fallosNegroFijo(listas: Lista[], censo: readonly FilaCenso[]): string[] {
  const cuenta = contarSinDark(listas, (c, lista) => esNegroFijo(c) && !tieneTextoOscuro(lista));
  return contrastarConCenso(cuenta, censo);
}

describe("parte 4 — negro fijo sin `dark:` en el portal solo sobre claro fijo censado (R17)", () => {
  const censoSintetico: FilaCenso[] = [
    { archivo: "x.tsx", clase: "text-brand-dark", superficie: "brand-soft", medido: 17.7, apariciones: 1 },
  ];

  it("sintético: `text-brand-dark` sin `dark:` y sin censo da rojo", () => {
    const rojo = listasDeClases("y.tsx", `"text-brand-dark"; "hover:text-navy-deep"`);
    expect(fallosNegroFijo(rojo, censoSintetico)).toEqual([
      "fuera del censo: y.tsx|text-brand-dark (1)",
      "fuera del censo: y.tsx|text-navy-deep (1)",
      "fila del censo que ya no aparece: x.tsx|text-brand-dark",
    ]);
  });

  it("sintético: con su `dark:text-*` en la lista, o censado, da verde", () => {
    const verde = listasDeClases("x.tsx", `"bg-brand-soft text-brand-dark"; "text-brand-dark dark:text-brand-light"`);
    expect(fallosNegroFijo(verde, censoSintetico)).toEqual([]);
  });

  it("en el portal, cada negro fijo sin `dark:` está en CENSO_NEGRO_FIJO y nada más", () => {
    expect(fallosNegroFijo(listasDelArbol(RAICES_PORTAL), CENSO_NEGRO_FIJO)).toEqual([]);
  });

  it.each(CENSO_NEGRO_FIJO)("$archivo: $superficie es clara fija y el negro mide $medido", (fila) => {
    verificarSuperficie(fila, NEGRO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 5 — los tokens de identidad sin la paleta anterior; `brand` gira (R13, R14)
// ─────────────────────────────────────────────────────────────────────────────────────────

// `design.md > D5`.
const HEX_ANTERIORES = [
  "#f26419", "#d4530d", "#ffaa6b", "#fff0e8", "#ff7a33", "#ffb27f", "#2a1710",
  "#0b2545", "#0d2444", "#12233f", "#17233b", "#14294a", "#1f3a63", "#aab6d2", "#0a1524",
  "#071627", "#10203a", "#e6ecf8", "#16294a", "#22345a", "#26406e",
];
const RGBA_NARANJA = /rgba\(\s*242\s*,\s*100\s*,\s*25\b/i;

// `design.md > D3`: los de `@theme inline`, y los de `:root, .tema-claro`.
const UTILIDADES_D3 = [
  "brand", "brand-foreground", "brand-light", "brand-dark", "brand-soft",
  "navy", "navy-deep", "kraft-canvas", "primary-strong",
];
const SIDEBAR = [
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];
const TOKENS_D3 = [
  "background", "foreground", "card-foreground", "popover-foreground", "secondary-foreground",
  "primary", "primary-foreground", "accent", "accent-foreground", "ring", ...SIDEBAR,
];
// `design.md > D4`.
const TOKENS_D4 = [
  "background", "card", "popover", "foreground", "card-foreground", "popover-foreground",
  "secondary-foreground", "primary", "primary-foreground", "secondary", "muted",
  "muted-foreground", "accent", "accent-foreground", "border", "input", "ring", ...SIDEBAR,
];

function fallosPaletaAnterior(valores: Record<string, string>): string[] {
  return Object.entries(valores)
    .filter(([, v]) => HEX_ANTERIORES.includes(v.trim().toLowerCase()) || RGBA_NARANJA.test(v))
    .map(([k, v]) => `${k}: ${v}`);
}

function valorDeUtilidad(nombre: string): string {
  const m = cssSinComentarios.match(new RegExp(`--color-${nombre}:\\s*([^;]+);`));
  if (!m) throw new Error(`--color-${nombre} no aparece en app/globals.css`);
  return m[1]!.trim();
}

describe("parte 5 — ningún token de identidad conserva la paleta anterior (R13, R14)", () => {
  it("sintético: un hex o un rgba del naranja dan rojo; los de la marca, verde", () => {
    expect(
      fallosPaletaAnterior({ "--primary": "#F26419", "--ring": "rgba(242, 100, 25, 0.4)", "--card": "#0B2545" }),
    ).toEqual(["--primary: #F26419", "--ring: rgba(242, 100, 25, 0.4)", "--card: #0B2545"]);
    expect(fallosPaletaAnterior({ "--primary": "#111111", "--ring": "#FFD000" })).toEqual([]);
  });

  it("los tokens de D3 y D4 del CSS no tienen ningún hex de D5", () => {
    const valores: Record<string, string> = {};
    for (const u of UTILIDADES_D3) valores[`--color-${u}`] = valorDeUtilidad(u);
    for (const t of TOKENS_D3) valores[`claro --${t}`] = token("claro", t);
    for (const t of TOKENS_D4) valores[`oscuro --${t}`] = token("oscuro", t);
    expect(fallosPaletaAnterior(valores)).toEqual([]);
  });

  it("`brand` y `brand-foreground` son alias de `--primary` y giran con el tema", () => {
    expect(valorDeUtilidad("brand")).toBe("var(--primary)");
    expect(valorDeUtilidad("brand-foreground")).toBe("var(--primary-foreground)");
    expect(utilidad("claro", "brand").toLowerCase()).toBe("#111111");
    expect(utilidad("claro", "brand-foreground").toLowerCase()).toBe("#ffffff");
    expect(utilidad("oscuro", "brand").toLowerCase()).toBe("#ffd000");
    expect(utilidad("oscuro", "brand-foreground").toLowerCase()).toBe("#111111");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 6 — manifiesto y `theme-color` iguales al tema claro (R29)
// ─────────────────────────────────────────────────────────────────────────────────────────

interface ColoresDeLaApp {
  manifiestoTema: string | undefined;
  manifiestoFondo: string | undefined;
  metaTema: string | undefined;
}

function fallosColoresDeLaApp(app: ColoresDeLaApp, primario: string, fondo: string): string[] {
  const igual = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
  const fallos: string[] = [];
  if (!igual(app.manifiestoTema, primario)) fallos.push(`theme_color ${app.manifiestoTema}`);
  if (!igual(app.manifiestoFondo, fondo)) fallos.push(`background_color ${app.manifiestoFondo}`);
  if (!igual(app.metaTema, primario)) fallos.push(`meta theme-color ${app.metaTema}`);
  return fallos;
}

function metaTemaDe(codigo: string): string | undefined {
  return codigo.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/)?.[1];
}

describe("parte 6 — el manifiesto y el `theme-color` son los del tema claro (R29)", () => {
  it("sintético: un `theme_color` de la paleta anterior da rojo; los de la marca, verde", () => {
    const meta = metaTemaDe(`<meta name="theme-color" content="#0b2545" />`);
    expect(
      fallosColoresDeLaApp({ manifiestoTema: "#f26419", manifiestoFondo: "#F7F7F5", metaTema: meta }, NEGRO, "#f7f7f5"),
    ).toEqual(["theme_color #f26419", "meta theme-color #0b2545"]);
    expect(
      fallosColoresDeLaApp({ manifiestoTema: "#111111", manifiestoFondo: "#F7F7F5", metaTema: "#111111" }, NEGRO, "#f7f7f5"),
    ).toEqual([]);
  });

  it("`public/manifest.json` y `app/layout.tsx` usan `--primary` y `--background` de claro", () => {
    const manifiesto = JSON.parse(leer("public/manifest.json")) as {
      theme_color?: string;
      background_color?: string;
    };
    const app: ColoresDeLaApp = {
      manifiestoTema: manifiesto.theme_color,
      manifiestoFondo: manifiesto.background_color,
      metaTema: metaTemaDe(quitarComentarios(leer("app/layout.tsx"))),
    };
    expect(fallosColoresDeLaApp(app, token("claro", "primary"), token("claro", "background"))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Parte 7 — la tabla «Tema oscuro» de `docs/marca.md` es la del CSS (R11)
// ─────────────────────────────────────────────────────────────────────────────────────────

function filasTemaOscuro(md: string): Map<string, string> {
  const inicio = md.indexOf("\n## Tema oscuro");
  if (inicio === -1) return new Map();
  const resto = md.slice(inicio + 1);
  const fin = resto.indexOf("\n## ", 1);
  const seccion = fin === -1 ? resto : resto.slice(0, fin);
  const filas = new Map<string, string>();
  for (const m of seccion.matchAll(/^\|\s*`--([a-z0-9-]+)`\s*\|\s*`(#[0-9a-fA-F]{3,8})`/gm)) {
    filas.set(m[1]!, m[2]!);
  }
  return filas;
}

function fallosTablaOscura(
  filas: Map<string, string>,
  esperados: string[],
  leerToken: (nombre: string) => string,
): string[] {
  const fallos: string[] = [];
  for (const nombre of esperados) {
    const hex = filas.get(nombre);
    if (!hex) fallos.push(`falta --${nombre}`);
    else if (hex.toLowerCase() !== leerToken(nombre).toLowerCase()) {
      fallos.push(`--${nombre}: tabla ${hex}, CSS ${leerToken(nombre)}`);
    }
  }
  for (const nombre of filas.keys()) {
    if (!esperados.includes(nombre)) fallos.push(`--${nombre} no es un token de D4`);
  }
  return fallos;
}

describe("parte 7 — cada hex de «Tema oscuro» en `docs/marca.md` es el token del CSS (R11)", () => {
  const md = (fila: string) =>
    `# Marca\n\n## Tema oscuro\n\n| Token | HEX |\n| --- | --- |\n${fila}\n\n## Otra\n\n| \`--card\` | \`#000000\` |\n`;
  const css = (n: string) => ({ background: "#111111", card: "#1C1C1A" })[n] ?? "#000000";

  it("sintético: un hex distinto, una fila que falta o una que sobra dan rojo", () => {
    const filas = filasTemaOscuro(md("| `--background` | `#121212` | Primario |\n| `--chart-1` | `#ffffff` | x |"));
    expect(fallosTablaOscura(filas, ["background", "card"], css)).toEqual([
      "--background: tabla #121212, CSS #111111",
      "falta --card",
      "--chart-1 no es un token de D4",
    ]);
  });

  it("sintético: la tabla igual al CSS da verde, y lo de otra sección no cuenta", () => {
    const filas = filasTemaOscuro(md("| `--background` | `#111111` | — |\n| `--card` | `#1C1C1A` | — |"));
    expect(fallosTablaOscura(filas, ["background", "card"], css)).toEqual([]);
  });

  it("la tabla del árbol tiene los 25 tokens de D4 con el hex de `.dark`", () => {
    const filas = filasTemaOscuro(leer("docs/marca.md"));
    expect(filas.size).toBe(25);
    expect(fallosTablaOscura(filas, TOKENS_D4, (n) => token("oscuro", n))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fuente — Archivo como `--font-sans`, sin Poppins (R20)
// ─────────────────────────────────────────────────────────────────────────────────────────

function fallosFuente(codigo: string): string[] {
  const fallos: string[] = [];
  if (!/import\s*\{[^}]*\bArchivo\b[^}]*\}\s*from\s*["']next\/font\/google["']/.test(codigo)) {
    fallos.push("no importa Archivo de next/font/google");
  }
  if (!/\bArchivo\(\s*\{[^}]*variable:\s*["']--font-sans["']/.test(codigo)) {
    fallos.push("Archivo no es --font-sans");
  }
  if (/\bPoppins\b/.test(codigo)) fallos.push("carga Poppins");
  return fallos;
}

describe("fuente — el layout raíz carga Archivo como `--font-sans` y no Poppins (R20)", () => {
  it("sintético: Poppins como `--font-sans` da rojo; Archivo, verde", () => {
    const rojo = `import { Poppins } from "next/font/google";\nconst s = Poppins({ variable: "--font-sans" });`;
    expect(fallosFuente(rojo)).toEqual([
      "no importa Archivo de next/font/google",
      "Archivo no es --font-sans",
      "carga Poppins",
    ]);
    const verde = `import { Archivo, JetBrains_Mono } from "next/font/google";\nconst s = Archivo({ subsets: ["latin"], variable: "--font-sans" });`;
    expect(fallosFuente(verde)).toEqual([]);
  });

  it("`app/layout.tsx`, sin comentarios, cumple", () => {
    expect(fallosFuente(quitarComentarios(leer("app/layout.tsx")))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Nombre — 0 apariciones del nombre anterior en las rutas fijas del alcance (R26)
// ─────────────────────────────────────────────────────────────────────────────────────────

// `design.md > D11`.
const RUTAS_FIJAS = [
  "app/_landing",
  "app/page.tsx",
  "app/layout.tsx",
  "app/login",
  "components/shared/Logo.tsx",
  "lib/config/marca.ts",
  "app/globals.css",
  "app/(app)/_components/Sidebar.tsx",
];

function conNombreAnterior(archivos: { ruta: string; texto: string }[]): string[] {
  const patron = new RegExp(NOMBRE_ANTERIOR, "i");
  return archivos.filter((a) => patron.test(a.texto)).map((a) => a.ruta);
}

describe("nombre — las rutas fijas del alcance no contienen el nombre anterior (R26)", () => {
  it("sintético: cualquier combinación de mayúsculas, también en un comentario o un dominio, da rojo", () => {
    const mayus = NOMBRE_ANTERIOR.toUpperCase();
    const capital = NOMBRE_ANTERIOR[0]!.toUpperCase() + NOMBRE_ANTERIOR.slice(1);
    expect(
      conNombreAnterior([
        { ruta: "a.tsx", texto: `// ver ${NOMBRE_ANTERIOR}.co` },
        { ruta: "b.tsx", texto: `<p>${capital}</p>` },
        { ruta: "c.css", texto: `/* ${mayus} */` },
        { ruta: "d.tsx", texto: "<p>Servi Logistic</p>" },
      ]),
    ).toEqual(["a.tsx", "b.tsx", "c.css"]);
  });

  it("las rutas fijas de D11 dan 0", () => {
    const archivos = RUTAS_FIJAS.flatMap((r) => archivosBajo(r, /\.(ts|tsx|css)$/)).map((ruta) => ({
      ruta,
      texto: leer(ruta),
    }));
    expect(archivos.length).toBeGreaterThan(RUTAS_FIJAS.length);
    expect(conNombreAnterior(archivos)).toEqual([]);
  });
});
