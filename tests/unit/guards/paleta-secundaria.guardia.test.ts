// SL-33 — guardia de la paleta secundaria: gráficas, grises cálidos y restos de la marca anterior
// (R1–R13, R16–R20; `specs/SL-33-paleta-secundaria/design.md > D9`).
//
// Toda la aritmética de color sale de `tests/fixtures/contraste.ts` (`contraste`, `componer`), y
// toda lectura del CSS, de los lectores compartidos (`token`, `paleta`, `tokenAlImprimir`,
// `reglasDe`, los quitadores de comentarios). Aquí no se escribe otra fórmula ni otro parser de
// CSS: una segunda copia es la que miente en verde (cabecera del fixture).
//
// Cada bloque lleva un caso sintético que tiene que dar rojo y otro que tiene que dar verde. Sin
// ellos, una lectura que no encuentra nada pasaría la guardia en vacío.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLOR_SEGMENTO,
  VARIANTE_CONTADOR,
} from "@/app/(app)/monitoreo/_components/contadores";

import {
  componer,
  contraste,
  cssSinComentarios,
  paleta,
  token,
  tokenAlImprimir,
} from "../../fixtures/contraste";
import { reglasDe, type Regla } from "../../fixtures/css-reglas";
import { contieneNombreHeredado } from "../../fixtures/nombre-heredado";
import { codigoSinComentarios, quitarComentariosCss } from "../../fixtures/sin-comentarios";

const RAIZ = path.resolve(__dirname, "../../..");

function leer(rel: string): string {
  return readFileSync(path.join(RAIZ, rel), "utf8");
}

type Decls = Record<string, string>;

/** `#FFF` y `#ffffff` son el mismo color: se comparan en una sola forma. */
function normalizar(hex: string): string {
  const s = hex.trim().toLowerCase().replace("#", "");
  return "#" + (s.length === 3 ? s.split("").map((c) => c + c).join("") : s);
}

/** El valor de una declaración, si es un hex. `null` si no existe o no es hex (no se adivina). */
function hexDe(decls: Decls, nombre: string): string | null {
  const v = decls[nombre];
  return v && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? normalizar(v) : null;
}

const f2 = (n: number) => n.toFixed(2);

/** Umbral de objeto gráfico (WCAG 1.4.11). */
const AA_GRAFICO = 3;
/** Umbral de texto normal (WCAG 1.4.3). */
const AA_TEXTO = 4.5;
/**
 * Los «antes» del spec están redondeados a dos decimales. Esta tolerancia absorbe ese redondeo y
 * nada más: un 7.695 que se escribió 7.70 no puede poner rojo un par que no bajó.
 */
const REDONDEO = 0.005;

// ─────────────────────────────────────────────────────────────────────────────────────────
// Los bloques de `app/globals.css`, leídos con `reglasDe` del fixture
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Seis sitios declaran los tokens que toca SL-33 (`design.md > Contexto`). `token()` solo ve la
 * ÚLTIMA declaración de cada mitad del archivo: `.dark` queda tapado por `.tema-sistema`, y el
 * papel no lo ve. Por eso cada bloque se lee entero, por su selector, y un caso de abajo comprueba
 * que lo leído coincide con lo que devuelven `token()` y `tokenAlImprimir()`.
 */
const REGLAS_CSS: Regla[] = reglasDe(cssSinComentarios);

function unicaRegla(descripcion: string, criterio: (r: Regla) => boolean): Decls {
  const halladas = REGLAS_CSS.filter(criterio);
  if (halladas.length !== 1) {
    throw new Error(
      `se esperaba UNA regla ${descripcion} en app/globals.css y hay ${halladas.length}. ` +
        "Si el archivo cambió de forma, esta lectura hay que revisarla a mano.",
    );
  }
  return halladas[0]!.declaraciones;
}

const enImpresion = (r: Regla) => r.ancestros.some((a) => /^@media\s+print\b/.test(a));

const BLOQUES = {
  claro: unicaRegla("`:root, .tema-claro`", (r) =>
    r.ancestros.length === 0 && r.selectores.includes(":root") && r.selectores.includes(".tema-claro"),
  ),
  papel: unicaRegla("`@media print { .papel-al-imprimir }`", (r) =>
    enImpresion(r) && r.selectores.includes(".papel-al-imprimir"),
  ),
  impresion: unicaRegla("`@media print { html .dark … }`", (r) =>
    enImpresion(r) && r.selectores.some((s) => /(^|[\s>+~])\.dark\b/.test(s)),
  ),
  dark: unicaRegla("`.dark`", (r) => r.ancestros.length === 0 && r.selectores.includes(".dark")),
  sistema: unicaRegla("`.tema-sistema` bajo `prefers-color-scheme: dark`", (r) =>
    r.ancestros.some((a) => /prefers-color-scheme:\s*dark/.test(a)) &&
    r.selectores.includes(".tema-sistema"),
  ),
  tema: unicaRegla("`@theme inline`", (r) => r.selectores.includes("@theme inline")),
} as const;

type NombreBloque = keyof typeof BLOQUES;
const CLAROS: NombreBloque[] = ["claro", "papel", "impresion"];
const OSCUROS: NombreBloque[] = ["dark", "sistema"];

describe("SL-33 — la herramienta: fórmula, composición y lectura de bloques", () => {
  it("la fórmula reproduce tres razones publicadas por WCAG y la composición sus extremos", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contraste("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(componer("#ff0000", "#ffffff", 1)).toBe("#ff0000");
    expect(componer("#ff0000", "#ffffff", 0)).toBe("#ffffff");
  });

  it("cada bloque leído coincide con lo que devuelven `token()`, `tokenAlImprimir()` y `paleta()`", () => {
    // Si la selección de reglas apuntara a otro bloque, todo lo de abajo mediría el tema
    // equivocado. Se ancla contra los lectores compartidos con tokens que esta feature no toca.
    expect(hexDe(BLOQUES.claro, "--background")).toBe(normalizar(token("claro", "background")));
    expect(hexDe(BLOQUES.sistema, "--card")).toBe(normalizar(token("oscuro", "card")));
    expect(hexDe(BLOQUES.dark, "--card")).toBe(normalizar(token("oscuro", "card")));
    expect(hexDe(BLOQUES.impresion, "--card")).toBe(normalizar(tokenAlImprimir("card")));
    expect(hexDe(BLOQUES.papel, "--card")).toBe(normalizar(token("claro", "card")));
    expect(hexDe(BLOQUES.tema, "--color-navy-deep")).toBe(normalizar(paleta("navy-deep")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R1, R2 — los 20 `--chart-N` con la tabla aprobada
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Copia literal de `specs/SL-33-paleta-secundaria/requirements.md > Paleta de gráficas aprobada
 * (2026-10-28)`, fijada por el humano. El índice es N − 1 porque `paleta.ts` asigna por índice.
 */
const PALETA_APROBADA = [
  { nombre: "Negro Servi / Amarillo Señal", claro: "#111111", oscuro: "#FFD000" },
  { nombre: "Ocre", claro: "#A16207", oscuro: "#FDE68A" },
  { nombre: "Petróleo", claro: "#0F766E", oscuro: "#2DD4BF" },
  { nombre: "Rojo", claro: "#B91C1C", oscuro: "#F87171" },
  { nombre: "Azul", claro: "#1D4ED8", oscuro: "#60A5FA" },
  { nombre: "Verde", claro: "#15803D", oscuro: "#4ADE80" },
  { nombre: "Violeta", claro: "#7E22CE", oscuro: "#C084FC" },
  { nombre: "Magenta", claro: "#BE185D", oscuro: "#F472B6" },
  { nombre: "Celeste", claro: "#0369A1", oscuro: "#38BDF8" },
  { nombre: "Oliva", claro: "#4D7C0F", oscuro: "#A3E635" },
  { nombre: "Piedra", claro: "#57534E", oscuro: "#D6D3D1" },
  { nombre: "Ocre profundo", claro: "#854D0E", oscuro: "#FACC15" },
  { nombre: "Petróleo claro", claro: "#0D9488", oscuro: "#99F6E4" },
  { nombre: "Rojo claro", claro: "#DC2626", oscuro: "#FECACA" },
  { nombre: "Azul claro", claro: "#2563EB", oscuro: "#BFDBFE" },
  { nombre: "Verde claro", claro: "#16A34A", oscuro: "#BBF7D0" },
  { nombre: "Violeta claro", claro: "#9333EA", oscuro: "#E9D5FF" },
  { nombre: "Magenta claro", claro: "#DB2777", oscuro: "#FBCFE8" },
  { nombre: "Celeste claro", claro: "#0284C7", oscuro: "#BAE6FD" },
  { nombre: "Piedra clara", claro: "#78716C", oscuro: "#A8A29E" },
] as const;

type Columna = "claro" | "oscuro";
const N_GRAFICAS = Array.from({ length: 20 }, (_, i) => i + 1);

function aprobado(n: number, columna: Columna): string {
  return normalizar(PALETA_APROBADA[n - 1]![columna]);
}

function fallosPaletaGraficas(decls: Decls, columna: Columna): string[] {
  return N_GRAFICAS.flatMap((n) => {
    const real = hexDe(decls, `--chart-${n}`);
    const esperado = aprobado(n, columna);
    return real === esperado ? [] : [`--chart-${n}: ${real ?? "sin declarar"} (tabla ${esperado})`];
  });
}

describe("R1, R2 — los 20 `--chart-N` son los de la tabla aprobada", () => {
  it("sintético: un hex distinto o uno que falta dan rojo; la tabla entera, verde", () => {
    const buena: Decls = Object.fromEntries(N_GRAFICAS.map((n) => [`--chart-${n}`, aprobado(n, "claro")]));
    expect(fallosPaletaGraficas(buena, "claro")).toEqual([]);
    const mala: Decls = { ...buena, "--chart-1": "#f26419" };
    delete mala["--chart-20"];
    expect(fallosPaletaGraficas(mala, "claro")).toEqual([
      "--chart-1: #f26419 (tabla #111111)",
      "--chart-20: sin declarar (tabla #78716c)",
    ]);
  });

  it.each(CLAROS)("R1: el bloque `%s` declara la columna «Claro»", (bloque) => {
    expect(fallosPaletaGraficas(BLOQUES[bloque], "claro")).toEqual([]);
  });

  it.each(OSCUROS)("R2: el bloque `%s` declara la columna «Oscuro»", (bloque) => {
    expect(fallosPaletaGraficas(BLOQUES[bloque], "oscuro")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R3 — cada `--chart-N` a 3:1 o más sobre `--background` y `--card` de su tema
// ─────────────────────────────────────────────────────────────────────────────────────────

function fallosContrasteGraficas(decls: Decls): string[] {
  const superficies = { fondo: hexDe(decls, "--background"), tarjeta: hexDe(decls, "--card") };
  return N_GRAFICAS.flatMap((n) => {
    const color = hexDe(decls, `--chart-${n}`);
    if (!color) return [`--chart-${n} sin declarar`];
    return Object.entries(superficies).flatMap(([nombre, sup]) => {
      if (!sup) return [`--${nombre} sin declarar`];
      const medido = contraste(color, sup);
      return medido >= AA_GRAFICO ? [] : [`--chart-${n} ${color} s/ ${nombre} ${f2(medido)}`];
    });
  });
}

describe("R3 — cada `--chart-N` llega a 3:1 sobre el fondo y la tarjeta de su tema", () => {
  it("sintético: un ámbar sobre blanco da rojo; la tabla aprobada, verde en los dos temas", () => {
    const tabla = (columna: Columna, fondo: string, tarjeta: string): Decls => ({
      "--background": fondo,
      "--card": tarjeta,
      ...Object.fromEntries(N_GRAFICAS.map((n) => [`--chart-${n}`, aprobado(n, columna)])),
    });
    expect(fallosContrasteGraficas(tabla("claro", "#F7F7F5", "#ffffff"))).toEqual([]);
    expect(fallosContrasteGraficas(tabla("oscuro", "#111111", "#1C1C1A"))).toEqual([]);
    const mala = { ...tabla("claro", "#F7F7F5", "#ffffff"), "--chart-5": "#f59e0b" };
    expect(fallosContrasteGraficas(mala)).toEqual([
      `--chart-5 #f59e0b s/ fondo ${f2(contraste("#f59e0b", "#F7F7F5"))}`,
      `--chart-5 #f59e0b s/ tarjeta ${f2(contraste("#f59e0b", "#ffffff"))}`,
    ]);
  });

  it.each(["claro", ...OSCUROS] as NombreBloque[])("el bloque `%s` cumple 3:1 en los 40 pares", (bloque) => {
    expect(fallosContrasteGraficas(BLOQUES[bloque])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R4 — los cuatro pares `-soft`/`-strong` del `Badge`
// ─────────────────────────────────────────────────────────────────────────────────────────

/** `design.md > D4`: el `-soft` es `componer(chart claro, #FFFFFF, 0.15)`; el `-strong`, el propio color. */
const PARES_D4 = [
  { n: 5, soft: "#dde4f9", strongClaro: "#1d4ed8", strongOscuro: "#60a5fa" },
  { n: 7, soft: "#ecdef8", strongClaro: "#7e22ce", strongOscuro: "#c084fc" },
  { n: 11, soft: "#e6e5e4", strongClaro: "#57534e", strongOscuro: "#d6d3d1" },
  { n: 12, soft: "#ede4db", strongClaro: "#854d0e", strongOscuro: "#facc15" },
] as const;

/** Misma α que `--color-brand-soft` (`design.md > D4`). */
const ALFA_SOFT = 0.15;

interface LecturaPar {
  tema: Decls;
  claros: Decls[];
  oscuros: Decls[];
}

function fallosParMonitoreo(par: (typeof PARES_D4)[number], l: LecturaPar): string[] {
  const { n } = par;
  const fallos: string[] = [];
  const soft = hexDe(l.tema, `--color-chart-${n}-soft`);
  const alias = l.tema[`--color-chart-${n}-strong`];
  if (alias !== `var(--chart-${n}-strong)`) fallos.push(`--color-chart-${n}-strong: ${alias ?? "sin declarar"}`);
  for (const claro of l.claros) {
    const chart = hexDe(claro, `--chart-${n}`);
    const strong = hexDe(claro, `--chart-${n}-strong`);
    if (!chart || !strong || !soft) {
      fallos.push(`claro chart-${n}: falta chart, -strong o -soft`);
      continue;
    }
    if (soft !== componer(chart, "#ffffff", ALFA_SOFT)) fallos.push(`--color-chart-${n}-soft ${soft} no es componer(${chart})`);
    if (strong !== par.strongClaro) fallos.push(`claro --chart-${n}-strong ${strong} (D4 ${par.strongClaro})`);
    const superficies = { tarjeta: hexDe(claro, "--card"), fondo: hexDe(claro, "--background"), soft };
    for (const [nombre, sup] of Object.entries(superficies)) {
      const medido = sup ? contraste(strong, sup) : 0;
      if (medido < AA_TEXTO) fallos.push(`claro chart-${n}-strong s/ ${nombre} ${f2(medido)}`);
    }
  }
  for (const oscuro of l.oscuros) {
    const chart = hexDe(oscuro, `--chart-${n}`);
    const strong = hexDe(oscuro, `--chart-${n}-strong`);
    const tarjeta = hexDe(oscuro, "--card");
    if (!chart || !strong || !tarjeta) {
      fallos.push(`oscuro chart-${n}: falta chart, -strong o --card`);
      continue;
    }
    if (strong !== par.strongOscuro) fallos.push(`oscuro --chart-${n}-strong ${strong} (D4 ${par.strongOscuro})`);
    const superficies = {
      fondo: hexDe(oscuro, "--background"),
      tarjeta,
      [`chart-${n}/15`]: componer(chart, tarjeta, ALFA_SOFT),
    };
    for (const [nombre, sup] of Object.entries(superficies)) {
      const medido = sup ? contraste(strong, sup) : 0;
      if (medido < AA_TEXTO) fallos.push(`oscuro chart-${n}-strong s/ ${nombre} ${f2(medido)}`);
    }
  }
  return fallos;
}

describe("R4 — los pares del `Badge`: `-soft` compuesto y `-strong` a 4.5:1", () => {
  it("el literal de D4 es el que da `componer()` sobre la tabla aprobada", () => {
    for (const par of PARES_D4) {
      expect(componer(aprobado(par.n, "claro"), "#ffffff", ALFA_SOFT)).toBe(par.soft);
      expect(par.strongClaro).toBe(aprobado(par.n, "claro"));
      expect(par.strongOscuro).toBe(aprobado(par.n, "oscuro"));
    }
  });

  const sintetico = (strongClaro: string): LecturaPar => ({
    tema: { "--color-chart-7-soft": "#ecdef8", "--color-chart-7-strong": "var(--chart-7-strong)" },
    claros: [{ "--card": "#ffffff", "--background": "#F7F7F5", "--chart-7": "#7e22ce", "--chart-7-strong": strongClaro }],
    oscuros: [{ "--card": "#1C1C1A", "--background": "#111111", "--chart-7": "#c084fc", "--chart-7-strong": "#c084fc" }],
  });

  it("sintético: un `-strong` claro que no llega a 4.5 da rojo; el de D4, verde", () => {
    expect(fallosParMonitoreo(PARES_D4[1], sintetico("#7e22ce"))).toEqual([]);
    expect(fallosParMonitoreo(PARES_D4[1], sintetico("#c084fc"))).toEqual([
      "claro --chart-7-strong #c084fc (D4 #7e22ce)",
      `claro chart-7-strong s/ tarjeta ${f2(contraste("#c084fc", "#ffffff"))}`,
      `claro chart-7-strong s/ fondo ${f2(contraste("#c084fc", "#F7F7F5"))}`,
      `claro chart-7-strong s/ soft ${f2(contraste("#c084fc", "#ecdef8"))}`,
    ]);
  });

  it.each(PARES_D4.map((p) => [p.n, p] as const))("chart-%i: `-soft`, `-strong` y sus contrastes", (_n, par) => {
    const lectura: LecturaPar = {
      tema: BLOQUES.tema,
      claros: CLAROS.map((b) => BLOQUES[b]),
      oscuros: OSCUROS.map((b) => BLOQUES[b]),
    };
    expect(fallosParMonitoreo(par, lectura)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R5 — cada contador sin semántico propio, con el `--chart-N` de su familia
// ─────────────────────────────────────────────────────────────────────────────────────────

/** `design.md > D3`: la familia de la maqueta y el índice que la lleva en la paleta aprobada. */
const FAMILIA_CONTADOR = [
  { contador: "devueltas", n: 7, familia: "Violeta" },
  { contador: "incidentes", n: 12, familia: "Ocre profundo" },
  { contador: "sinRecoger", n: 11, familia: "Piedra" },
  { contador: "enReparto", n: 5, familia: "Azul" },
] as const;

function fallosFamilia(
  colores: Readonly<Record<string, string>>,
  variantes: Readonly<Record<string, string>>,
  badge: string,
): string[] {
  const fallos: string[] = [];
  for (const { contador, n } of FAMILIA_CONTADOR) {
    if (colores[contador] !== `bg-chart-${n}`) fallos.push(`COLOR_SEGMENTO.${contador}: ${colores[contador]}`);
    if (variantes[contador] !== `chart${n}`) fallos.push(`VARIANTE_CONTADOR.${contador}: ${variantes[contador]}`);
    const clases = badge.match(new RegExp(`\\bchart${n}:\\s*"([^"]*)"`))?.[1] ?? "";
    for (const clase of [`bg-chart-${n}-soft`, `text-chart-${n}-strong`, `dark:bg-chart-${n}/15`]) {
      if (!clases.split(/\s+/).includes(clase)) fallos.push(`Badge chart${n} sin ${clase}`);
    }
  }
  return fallos;
}

describe("R5 — la barra y la tarjeta de cada contador llevan el `--chart-N` de su familia", () => {
  const badgeBueno = FAMILIA_CONTADOR.map(
    ({ n }) => `chart${n}: "bg-chart-${n}-soft text-chart-${n}-strong dark:bg-chart-${n}/15",`,
  ).join("\n");
  const coloresBuenos = Object.fromEntries(FAMILIA_CONTADOR.map(({ contador, n }) => [contador, `bg-chart-${n}`]));
  const variantesBuenas = Object.fromEntries(FAMILIA_CONTADOR.map(({ contador, n }) => [contador, `chart${n}`]));

  it("la familia de D3 es el nombre de ese índice en la tabla aprobada", () => {
    for (const { n, familia } of FAMILIA_CONTADOR) expect(PALETA_APROBADA[n - 1]!.nombre).toBe(familia);
  });

  it("sintético: el índice viejo de la 292 da rojo; el de la familia, verde", () => {
    expect(fallosFamilia(coloresBuenos, variantesBuenas, badgeBueno)).toEqual([]);
    expect(
      fallosFamilia({ ...coloresBuenos, devueltas: "bg-chart-6" }, { ...variantesBuenas, devueltas: "chart6" }, badgeBueno),
    ).toEqual(["COLOR_SEGMENTO.devueltas: bg-chart-6", "VARIANTE_CONTADOR.devueltas: chart6"]);
  });

  it("`contadores.ts` y las variantes de `badge.tsx` dan la familia de D3", () => {
    expect(
      fallosFamilia(COLOR_SEGMENTO, VARIANTE_CONTADOR, codigoSinComentarios("components/ui/badge.tsx")),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R6 — cada segmento `--chart-N` de la barra a 3:1 sobre la pista `--muted`
// ─────────────────────────────────────────────────────────────────────────────────────────

function indicesDeSegmento(colores: Readonly<Record<string, string>>): number[] {
  return Object.values(colores).flatMap((c) => {
    const m = /^bg-chart-(\d+)$/.exec(c);
    return m ? [Number(m[1])] : [];
  });
}

function fallosPista(indices: number[], decls: Decls): string[] {
  const pista = hexDe(decls, "--muted");
  if (!pista) return ["--muted sin declarar"];
  return indices.flatMap((n) => {
    const color = hexDe(decls, `--chart-${n}`);
    const medido = color ? contraste(color, pista) : 0;
    return medido >= AA_GRAFICO ? [] : [`--chart-${n} s/ --muted ${f2(medido)}`];
  });
}

describe("R6 — los segmentos `--chart-N` se separan de la pista en los dos temas", () => {
  it("sintético: un gris sobre la pista da rojo; el piedra de la tabla, verde", () => {
    expect(indicesDeSegmento({ a: "bg-chart-11", b: "bg-success", c: "bg-chart-5" })).toEqual([11, 5]);
    expect(fallosPista([11], { "--muted": "#f5f5f4", "--chart-11": "#57534e" })).toEqual([]);
    expect(fallosPista([11], { "--muted": "#f5f5f4", "--chart-11": "#a8a29e" })).toEqual([
      `--chart-11 s/ --muted ${f2(contraste("#a8a29e", "#f5f5f4"))}`,
    ]);
  });

  it.each(["claro", ...OSCUROS] as NombreBloque[])("bloque `%s`: los cuatro segmentos a 3:1 o más", (bloque) => {
    const indices = indicesDeSegmento(COLOR_SEGMENTO);
    expect(indices).toHaveLength(4);
    expect(fallosPista(indices, BLOQUES[bloque])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R7 — los grises, a la escala `stone`
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Escala `stone` de Tailwind v3, en HEX (`design.md > D5 > Por qué los HEX de Tailwind v3`). La
 * tabla aprobada usa ya cuatro de ellos (`#57534E`, `#D6D3D1`, `#78716C`, `#A8A29E`).
 */
const STONE: Record<number, string> = {
  50: "#fafaf9",
  100: "#f5f5f4",
  200: "#e7e5e4",
  300: "#d6d3d1",
  400: "#a8a29e",
  500: "#78716c",
  600: "#57534e",
  700: "#44403c",
  800: "#292524",
  900: "#1c1917",
  950: "#0c0a09",
};

/** `design.md > D5`, columna «Ahora». `donde`: tema claro (y su papel) o `@theme inline`. */
const MAPEO_GRISES = [
  { token: "--secondary", donde: "claro", stone: 100, antes: "#eef1f8" },
  { token: "--muted", donde: "claro", stone: 100, antes: "#f1f4fb" },
  { token: "--muted-foreground", donde: "claro", stone: 700, antes: "#4a5368" },
  { token: "--border", donde: "claro", stone: 200, antes: "#e3e8f2" },
  { token: "--input", donde: "claro", stone: 200, antes: "#e3e8f2" },
  { token: "--color-asfalto-0", donde: "tema", stone: 100, antes: "#f2f5fb" },
  { token: "--color-asfalto-1", donde: "tema", stone: 200, antes: "#e9edf6" },
  { token: "--color-asfalto-2", donde: "tema", stone: 200, antes: "#dde1ee" },
  { token: "--color-asfalto-4", donde: "tema", stone: 500, antes: "#8a94ad" },
  { token: "--color-asfalto-5", donde: "tema", stone: 700, antes: "#4a5368" },
  { token: "--color-asfalto-7", donde: "tema", stone: 800, antes: "#1f3a63" },
  { token: "--color-asfalto-9", donde: "tema", stone: 900, antes: "#0d2444" },
  { token: "--color-kraft-inset", donde: "tema", stone: 100, antes: "#f1f4fb" },
] as const;

function fallosGrises(bloques: Record<"claro" | "papel" | "impresion" | "tema", Decls>): string[] {
  return MAPEO_GRISES.flatMap(({ token: nombre, donde, stone }) => {
    const esperado = STONE[stone]!;
    const sitios = donde === "claro" ? (["claro", "papel", "impresion"] as const) : (["tema"] as const);
    return sitios.flatMap((sitio) => {
      const real = hexDe(bloques[sitio], nombre);
      return real === esperado ? [] : [`${sitio} ${nombre}: ${real ?? "sin declarar"} (stone-${stone} ${esperado})`];
    });
  });
}

describe("R7 — los grises azulados pasan a `stone`, también en papel", () => {
  const todoStone = () => {
    const claro: Decls = {};
    const tema: Decls = {};
    for (const g of MAPEO_GRISES) (g.donde === "claro" ? claro : tema)[g.token] = STONE[g.stone]!;
    return { claro, papel: { ...claro }, impresion: { ...claro }, tema };
  };

  it("sintético: un gris azulado que queda en papel da rojo; todo `stone`, verde", () => {
    expect(fallosGrises(todoStone())).toEqual([]);
    const b = todoStone();
    b.papel["--muted-foreground"] = "#4a5368";
    expect(fallosGrises(b)).toEqual(["papel --muted-foreground: #4a5368 (stone-700 #44403c)"]);
  });

  it("los 13 tokens de D5 valen su `stone-N` en `app/globals.css`", () => {
    expect(
      fallosGrises({ claro: BLOQUES.claro, papel: BLOQUES.papel, impresion: BLOQUES.impresion, tema: BLOQUES.tema }),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R8 — ningún par en que se usa un gris baja; `asfalto-2` a cifra exacta
// ─────────────────────────────────────────────────────────────────────────────────────────

interface LecturaGrises {
  claro: Decls;
  oscuro: Decls;
  tema: Decls;
}

type Fuente = (l: LecturaGrises) => string | null;
const cl = (n: string): Fuente => (l) => hexDe(l.claro, `--${n}`);
const os = (n: string): Fuente => (l) => hexDe(l.oscuro, `--${n}`);
const th = (n: string): Fuente => (l) => hexDe(l.tema, `--color-${n}`);
/** Blanco literal: la superficie de la landing y del papel, que no es un token. */
const BLANCO: Fuente = () => "#ffffff";

interface ParGris {
  par: string;
  tinta: Fuente;
  superficie: Fuente;
  /** Contraste con el valor anterior (`design.md > D5`, columna «Pares», izquierda de la flecha). */
  antes: number;
  /** Solo la línea de `asfalto-2` (P1): la cifra exacta a la que baja, y ni una centésima más. */
  excepcion?: number;
}

/** `design.md > D5`: cada token en los pares en que se usa de verdad. */
const PARES_GRISES: ParGris[] = [
  { par: "--secondary-foreground s/ --secondary", tinta: cl("secondary-foreground"), superficie: cl("secondary"), antes: 16.7 },
  { par: "anillo --destructive s/ --secondary", tinta: cl("destructive"), superficie: cl("secondary"), antes: 3.33 },
  { par: "--foreground s/ --muted", tinta: cl("foreground"), superficie: cl("muted"), antes: 17.15 },
  { par: "--muted-foreground s/ --muted", tinta: cl("muted-foreground"), superficie: cl("muted"), antes: 6.99 },
  { par: "--muted-foreground s/ --card", tinta: cl("muted-foreground"), superficie: cl("card"), antes: 7.7 },
  { par: "--muted-foreground s/ --background", tinta: cl("muted-foreground"), superficie: cl("background"), antes: 7.18 },
  { par: "línea --border s/ --card", tinta: cl("border"), superficie: cl("card"), antes: 1.23 },
  { par: "línea --border s/ --background", tinta: cl("border"), superficie: cl("background"), antes: 1.15 },
  { par: "línea --input s/ --card", tinta: cl("input"), superficie: cl("card"), antes: 1.23 },
  { par: "línea --input s/ --background", tinta: cl("input"), superficie: cl("background"), antes: 1.15 },
  { par: "--foreground s/ asfalto-0", tinta: cl("foreground"), superficie: th("asfalto-0"), antes: 17.29 },
  { par: "asfalto-7 s/ asfalto-1 (podio 2.º)", tinta: th("asfalto-7"), superficie: th("asfalto-1"), antes: 9.71 },
  { par: "anillo asfalto-4 s/ asfalto-1", tinta: th("asfalto-4"), superficie: th("asfalto-1"), antes: 2.59 },
  { par: "línea asfalto-1 s/ kraft-inset", tinta: th("asfalto-1"), superficie: th("kraft-inset"), antes: 1.07 },
  { par: "línea asfalto-1 s/ blanco", tinta: th("asfalto-1"), superficie: BLANCO, antes: 1.17 },
  { par: "texto asfalto-2 s/ navy-deep", tinta: th("asfalto-2"), superficie: th("navy-deep"), antes: 14.46 },
  { par: "premio asfalto-9 s/ asfalto-2", tinta: th("asfalto-9"), superficie: th("asfalto-2"), antes: 11.88 },
  { par: "línea asfalto-2 s/ tarjeta oscura", tinta: th("asfalto-2"), superficie: os("card"), antes: 13.07 },
  { par: "línea asfalto-2 s/ blanco", tinta: th("asfalto-2"), superficie: BLANCO, antes: 1.31, excepcion: 1.26 },
  { par: "línea asfalto-2 s/ --background", tinta: th("asfalto-2"), superficie: cl("background"), antes: 1.22, excepcion: 1.17 },
  { par: "placeholder asfalto-4 s/ blanco", tinta: th("asfalto-4"), superficie: BLANCO, antes: 3.03 },
  { par: "placeholder asfalto-4 s/ --background", tinta: th("asfalto-4"), superficie: cl("background"), antes: 2.83 },
  { par: "asfalto-5 s/ blanco", tinta: th("asfalto-5"), superficie: BLANCO, antes: 7.7 },
  { par: "asfalto-5 s/ kraft-inset", tinta: th("asfalto-5"), superficie: th("kraft-inset"), antes: 6.99 },
  { par: "asfalto-5 s/ --background", tinta: th("asfalto-5"), superficie: cl("background"), antes: 7.18 },
  { par: "asfalto-7 s/ blanco (papel, F4)", tinta: th("asfalto-7"), superficie: BLANCO, antes: 11.39 },
  { par: "asfalto-7 s/ kraft-inset", tinta: th("asfalto-7"), superficie: th("kraft-inset"), antes: 10.35 },
  { par: "asfalto-9 s/ blanco", tinta: th("asfalto-9"), superficie: BLANCO, antes: 15.52 },
  { par: "asfalto-9 s/ --background", tinta: th("asfalto-9"), superficie: cl("background"), antes: 14.47 },
  { par: "brand-light s/ asfalto-9", tinta: th("brand-light"), superficie: th("asfalto-9"), antes: 10.55 },
  { par: "blanco s/ asfalto-9", tinta: BLANCO, superficie: th("asfalto-9"), antes: 15.52 },
];

function fallosPares(pares: ParGris[], l: LecturaGrises): string[] {
  return pares.flatMap((p) => {
    const tinta = p.tinta(l);
    const superficie = p.superficie(l);
    if (!tinta || !superficie) return [`${p.par}: falta un color`];
    const medido = contraste(tinta, superficie);
    if (p.excepcion !== undefined) {
      return Math.abs(medido - p.excepcion) < REDONDEO ? [] : [`${p.par}: ${f2(medido)} (excepción fija ${f2(p.excepcion)})`];
    }
    return medido >= p.antes - REDONDEO ? [] : [`${p.par}: ${f2(medido)} < antes ${f2(p.antes)}`];
  });
}

describe("R8 — los grises nuevos no bajan ningún par; la línea de `asfalto-2`, a su cifra exacta", () => {
  it("la excepción es la única y está en la línea de `asfalto-2`", () => {
    const excepciones = PARES_GRISES.filter((p) => p.excepcion !== undefined).map((p) => p.par);
    expect(excepciones).toEqual(["línea asfalto-2 s/ blanco", "línea asfalto-2 s/ --background"]);
  });

  const lecturaStone = (cambios: Partial<Record<string, string>> = {}): LecturaGrises => {
    const claro: Decls = { ...BLOQUES.claro };
    const tema: Decls = { ...BLOQUES.tema };
    for (const g of MAPEO_GRISES) (g.donde === "claro" ? claro : tema)[g.token] = STONE[g.stone]!;
    for (const [k, v] of Object.entries(cambios)) (k.startsWith("--color-") ? tema : claro)[k] = v!;
    return { claro, oscuro: BLOQUES.dark, tema };
  };

  it("sintético: el mapeo de D5 da verde; `stone-600` en `--muted-foreground` o `stone-300` en `asfalto-2` dan rojo", () => {
    expect(fallosPares(PARES_GRISES, lecturaStone())).toEqual([]);
    expect(fallosPares(PARES_GRISES, lecturaStone({ "--muted-foreground": STONE[600]! }))).toContain(
      `--muted-foreground s/ --card: ${f2(contraste(STONE[600]!, "#ffffff"))} < antes 7.70`,
    );
    // `stone-300` sube la línea, pero la excepción está fijada a su cifra: tampoco puede subir
    // en silencio sin que alguien rehaga P1.
    const conStone300 = fallosPares(PARES_GRISES, lecturaStone({ "--color-asfalto-2": STONE[300]! }));
    expect(conStone300).toContain(`texto asfalto-2 s/ navy-deep: ${f2(contraste(STONE[300]!, "#111111"))} < antes 14.46`);
    expect(conStone300.some((f) => f.startsWith("línea asfalto-2 s/ blanco"))).toBe(true);
  });

  it("los pares de D5 en `app/globals.css`", () => {
    const lectura: LecturaGrises = { claro: BLOQUES.claro, oscuro: BLOQUES.dark, tema: BLOQUES.tema };
    expect(fallosPares(PARES_GRISES, lectura)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R9 — ningún token de `app/globals.css` con los HEX azulados anteriores
// ─────────────────────────────────────────────────────────────────────────────────────────

/** `requirements.md > R9`, literal. */
const HEX_AZULADOS = [
  "#eef1f8", "#f1f4fb", "#4a5368", "#e3e8f2", "#f2f5fb", "#e9edf6", "#dde1ee", "#8a94ad", "#1f3a63", "#0d2444",
];

function patronHex(lista: readonly string[]): RegExp {
  return new RegExp(`(?:${lista.join("|")})(?![0-9a-f])`, "i");
}

function fallosAzulados(reglas: Regla[]): string[] {
  const patron = patronHex(HEX_AZULADOS);
  return reglas.flatMap((r) =>
    Object.entries(r.declaraciones)
      .filter(([nombre, valor]) => nombre.startsWith("--") && patron.test(valor))
      .map(([nombre, valor]) => `${r.selectores.join(", ")} ${nombre}: ${valor}`),
  );
}

describe("R9 — ningún token conserva un gris azulado (los comentarios no cuentan)", () => {
  it("sintético: un azulado en un token da rojo; en un comentario o como prefijo de otro hex, no", () => {
    const css = quitarComentariosCss(
      ":root {\n  /* antes #eef1f8 */\n  --secondary: #f5f5f4;\n  --x: #EEF1F80a;\n}\n.b { --muted: #F1F4FB; }",
    );
    expect(fallosAzulados(reglasDe(css))).toEqual([".b --muted: #F1F4FB"]);
  });

  it("`app/globals.css` sin comentarios no declara ninguno", () => {
    expect(fallosAzulados(REGLAS_CSS)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R10 — `asfalto-*` y `kraft-inset` no se renombran
// ─────────────────────────────────────────────────────────────────────────────────────────

const NOMBRES_QUE_SIGUEN = [
  "--color-asfalto-0", "--color-asfalto-1", "--color-asfalto-2", "--color-asfalto-4",
  "--color-asfalto-5", "--color-asfalto-7", "--color-asfalto-9", "--color-kraft-inset",
];

function faltantes(decls: Decls): string[] {
  return NOMBRES_QUE_SIGUEN.filter((n) => !(n in decls));
}

describe("R10 — los ocho nombres siguen declarados en `@theme`", () => {
  it("sintético: un nombre renombrado da rojo", () => {
    const todos = Object.fromEntries(NOMBRES_QUE_SIGUEN.map((n) => [n, "#f5f5f4"]));
    expect(faltantes(todos)).toEqual([]);
    const renombrado = Object.fromEntries(
      Object.entries(todos).map(([n, v]) => [n.replace("kraft-inset", "piedra-inset"), v]),
    );
    expect(faltantes(renombrado)).toEqual(["--color-kraft-inset"]);
  });

  it("`@theme inline` los declara", () => {
    expect(faltantes(BLOQUES.tema)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R11 — `TituloSeccion` de la landing en `stone`, sin la marca anterior
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * `specs/SL-8-marca-logo-paleta-fuente/design.md > D5`, literal: naranja y navy de la marca
 * anterior. La comparten R11 y el barrido de R20.
 */
const HEX_SL8_D5 = [
  "#f26419", "#d4530d", "#ffaa6b", "#fff0e8", "#ff7a33", "#ffb27f", "#2a1710",
  "#0b2545", "#0d2444", "#12233f", "#17233b", "#14294a", "#1f3a63", "#aab6d2", "#0a1524",
  "#071627", "#10203a", "#e6ecf8", "#16294a", "#22345a", "#26406e",
];
const RGBA_NARANJA = /rgba\(\s*242\s*,\s*100\s*,\s*25\b/i;

function cuerpoDeFuncion(codigo: string, nombre: string): string {
  const inicio = codigo.indexOf(`export function ${nombre}(`);
  if (inicio === -1) return "";
  const siguiente = codigo.indexOf("\nexport ", inicio + 1);
  return siguiente === -1 ? codigo.slice(inicio) : codigo.slice(inicio, siguiente);
}

function fallosTitulo(cuerpo: string, asfalto9: string): string[] {
  const fallos: string[] = [];
  if (!cuerpo) return ["no se encontró `TituloSeccion`"];
  if (!/\btext-asfalto-9\b/.test(cuerpo)) fallos.push("no pinta con `text-asfalto-9`");
  if (patronHex(HEX_SL8_D5).test(cuerpo)) fallos.push("lleva un hex de SL-8 D5");
  const hex = normalizar(asfalto9);
  if (!Object.values(STONE).includes(hex)) fallos.push(`asfalto-9 ${hex} no es de la escala stone`);
  if (HEX_SL8_D5.includes(hex)) fallos.push(`asfalto-9 ${hex} es de la marca anterior`);
  return fallos;
}

describe("R11 — los títulos de sección de la landing dejan el navy", () => {
  const cuerpo = 'export function TituloSeccion() {\n  return <h2 className="font-bold text-asfalto-9" />;\n}\n';

  it("sintético: `asfalto-9` navy da rojo; `stone-900`, verde", () => {
    expect(fallosTitulo(cuerpoDeFuncion(cuerpo, "TituloSeccion"), "#1c1917")).toEqual([]);
    expect(fallosTitulo(cuerpoDeFuncion(cuerpo, "TituloSeccion"), "#0d2444")).toEqual([
      "asfalto-9 #0d2444 no es de la escala stone",
      "asfalto-9 #0d2444 es de la marca anterior",
    ]);
  });

  it("`TituloSeccion` pinta `text-asfalto-9` y `asfalto-9` es `stone-900`", () => {
    const codigo = codigoSinComentarios("app/_landing/primitivas.tsx");
    expect(fallosTitulo(cuerpoDeFuncion(codigo, "TituloSeccion"), paleta("asfalto-9"))).toEqual([]);
    expect(normalizar(paleta("asfalto-9"))).toBe(STONE[900]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R12 — el tema oscuro no cambia fuera de las gráficas
// ─────────────────────────────────────────────────────────────────────────────────────────

/** La tabla «Tema oscuro» de `docs/marca.md` (SL-8): token → hex. */
function filasDeSeccion(md: string, titulo: RegExp): string[] {
  const lineas = md.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => titulo.test(l));
  if (inicio === -1) return [];
  const fin = lineas.findIndex((l, i) => i > inicio && /^## /.test(l));
  return lineas.slice(inicio + 1, fin === -1 ? undefined : fin).filter((l) => /^\|\s*`/.test(l));
}

function celdas(fila: string): string[] {
  return fila.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

function tablaTemaOscuro(md: string): Map<string, string> {
  const filas = new Map<string, string>();
  for (const fila of filasDeSeccion(md, /^## Tema oscuro\b/)) {
    const [token_, hex] = celdas(fila);
    const nombre = /`(--[a-z0-9-]+)`/.exec(token_ ?? "")?.[1];
    const valor = /`(#[0-9a-fA-F]{3,8})`/.exec(hex ?? "")?.[1];
    if (nombre && valor) filas.set(nombre, normalizar(valor));
  }
  return filas;
}

function fallosOscuro(tabla: Map<string, string>, decls: Decls): string[] {
  return [...tabla].flatMap(([nombre, hex]) => {
    if (/^--chart-\d+(-strong)?$/.test(nombre)) return [];
    const real = hexDe(decls, nombre);
    return real === hex ? [] : [`${nombre}: CSS ${real ?? "sin declarar"}, docs/marca.md ${hex}`];
  });
}

describe("R12 — `.dark` y `.tema-sistema` siguen con la tabla «Tema oscuro» de `docs/marca.md`", () => {
  const md = "# M\n\n## Tema oscuro\n\n| Token | HEX |\n| --- | --- |\n| `--card` | `#1C1C1A` | x |\n| `--muted` | `#232323` | x |\n\n## Otra\n\n| `--card` | `#000000` |\n";

  it("sintético: un gris oscuro cambiado da rojo; la tabla y el CSS iguales, verde", () => {
    const tabla = tablaTemaOscuro(md);
    expect(tabla.size).toBe(2);
    expect(fallosOscuro(tabla, { "--card": "#1c1c1a", "--muted": "#232323" })).toEqual([]);
    expect(fallosOscuro(tabla, { "--card": "#1c1c1a", "--muted": "#e7e5e4" })).toEqual([
      "--muted: CSS #e7e5e4, docs/marca.md #232323",
    ]);
  });

  it.each(OSCUROS)("el bloque `%s` coincide con la tabla en todos sus tokens", (bloque) => {
    const tabla = tablaTemaOscuro(leer("docs/marca.md"));
    expect(tabla.size).toBe(25);
    expect(fallosOscuro(tabla, BLOQUES[bloque])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R13 — las dos tablas nuevas de `docs/marca.md` son las del CSS
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * «Paleta de gráficas», con la forma de `design.md > D2`: Token | Claro | s/ fondo | s/ tarjeta |
 * Oscuro | s/ fondo | s/ tarjeta. Las cifras se exigen tal como las da `contraste()` a dos
 * decimales: si el doc se escribe a mano y se desvía, esto lo caza.
 */
function fallosTablaGraficas(md: string, claro: Decls, oscuro: Decls): string[] {
  const filas = filasDeSeccion(md, /^## Paleta de gráficas\b/);
  const fallos: string[] = [];
  for (const n of N_GRAFICAS) {
    const fila = filas.find((f) => new RegExp(`^\\|\\s*\`--chart-${n}\``).test(f));
    if (!fila) {
      fallos.push(`falta --chart-${n}`);
      continue;
    }
    const c = celdas(fila).map((x) => x.replace(/[`*]/g, "").trim());
    const sitios = [
      { tema: "claro", decls: claro, hex: c[1], cifras: [c[2], c[3]] },
      { tema: "oscuro", decls: oscuro, hex: c[4], cifras: [c[5], c[6]] },
    ];
    for (const s of sitios) {
      const css = hexDe(s.decls, `--chart-${n}`);
      const doc = s.hex && /^#[0-9a-f]{3,6}$/i.test(s.hex) ? normalizar(s.hex) : null;
      if (!css || doc !== css) {
        fallos.push(`--chart-${n} ${s.tema}: doc ${s.hex}, CSS ${css}`);
        continue;
      }
      const fondo = hexDe(s.decls, "--background");
      const tarjeta = hexDe(s.decls, "--card");
      const esperadas = [fondo, tarjeta].map((sup) => (sup ? f2(contraste(css, sup)) : "?"));
      if (s.cifras.join(" ") !== esperadas.join(" ")) {
        fallos.push(`--chart-${n} ${s.tema}: cifras ${s.cifras.join(" · ")}, fixture ${esperadas.join(" · ")}`);
      }
    }
  }
  return fallos;
}

/**
 * «Grises cálidos», con la forma de `design.md > D5`: Token | Antes | Ahora (`stone-N` `#hex`) |
 * Pares. La celda del token puede nombrar dos (`--border`, `--input`).
 */
function fallosTablaGrises(md: string, valorCss: (token: string) => string | null): string[] {
  const filas = filasDeSeccion(md, /^## Grises cálidos\b/);
  const vistos = new Set<string>();
  const fallos: string[] = [];
  for (const fila of filas) {
    const [celdaToken, , ahora, pares] = celdas(fila);
    const tokens = [...(celdaToken ?? "").matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!);
    const stone = /stone-(\d+)/.exec(ahora ?? "")?.[1];
    const hex = /(#[0-9a-fA-F]{6})/.exec(ahora ?? "")?.[1];
    for (const t of tokens) {
      const mapeo = MAPEO_GRISES.find((g) => g.token === t || g.token === `--color-${t}`);
      if (!mapeo) continue;
      vistos.add(mapeo.token);
      if (Number(stone) !== mapeo.stone) fallos.push(`${t}: doc stone-${stone}, D5 stone-${mapeo.stone}`);
      if (!hex || normalizar(hex) !== valorCss(mapeo.token)) fallos.push(`${t}: doc ${hex}, CSS ${valorCss(mapeo.token)}`);
      if (!/→/.test(pares ?? "")) fallos.push(`${t}: sin contraste antes → después`);
    }
  }
  for (const g of MAPEO_GRISES) if (!vistos.has(g.token)) fallos.push(`falta ${g.token}`);
  return fallos;
}

function valorGrisDelCss(nombre: string): string | null {
  const g = MAPEO_GRISES.find((x) => x.token === nombre);
  return g ? hexDe(g.donde === "claro" ? BLOQUES.claro : BLOQUES.tema, nombre) : null;
}

describe("R13 — `docs/marca.md` documenta la paleta de gráficas y los grises cálidos con los HEX del CSS", () => {
  const claroSint: Decls = {
    "--background": "#F7F7F5",
    "--card": "#ffffff",
    ...Object.fromEntries(N_GRAFICAS.map((n) => [`--chart-${n}`, aprobado(n, "claro")])),
  };
  const oscuroSint: Decls = {
    "--background": "#111111",
    "--card": "#1C1C1A",
    ...Object.fromEntries(N_GRAFICAS.map((n) => [`--chart-${n}`, aprobado(n, "oscuro")])),
  };
  const filaGrafica = (n: number, cifraClaroFondo?: string) => {
    const cl_ = aprobado(n, "claro");
    const os_ = aprobado(n, "oscuro");
    const a = cifraClaroFondo ?? f2(contraste(cl_, "#F7F7F5"));
    return `| \`--chart-${n}\` | \`${cl_}\` | ${a} | ${f2(contraste(cl_, "#ffffff"))} | \`${os_}\` | ${f2(contraste(os_, "#111111"))} | ${f2(contraste(os_, "#1C1C1A"))} |`;
  };
  const docGraficas = (filas: string[]) => `# M\n\n## Paleta de gráficas\n\n| Token |\n| --- |\n${filas.join("\n")}\n\n## Otra\n`;

  it("sintético (gráficas): una cifra que no es la del fixture o una fila que falta dan rojo", () => {
    const buenas = N_GRAFICAS.map((n) => filaGrafica(n));
    expect(fallosTablaGraficas(docGraficas(buenas), claroSint, oscuroSint)).toEqual([]);
    const malas = [filaGrafica(1, "17.61"), ...buenas.slice(1, 19)];
    expect(fallosTablaGraficas(docGraficas(malas), claroSint, oscuroSint)).toEqual([
      "--chart-1 claro: cifras 17.61 · 18.88, fixture 17.60 · 18.88",
      "falta --chart-20",
    ]);
  });

  it("sintético (grises): un HEX que no es el del CSS da rojo", () => {
    const css = (t: string) => STONE[MAPEO_GRISES.find((g) => g.token === t)!.stone]!;
    const fila = (celda: string, stone: number, hex = STONE[stone]!) =>
      `| ${celda} | \`#000000\` | \`stone-${stone}\` \`${hex}\` | 1.00 → 2.00 |`;
    const doc = (extra: string) =>
      [
        "## Grises cálidos (tema claro)",
        "",
        fila("`--secondary`", 100),
        fila("`--muted`", 100),
        fila("`--muted-foreground`", 700),
        fila("`--border`, `--input`", 200),
        fila("`asfalto-0`", 100),
        fila("`asfalto-1`", 200),
        fila("`asfalto-2`", 200),
        fila("`asfalto-4`", 500),
        fila("`asfalto-5`", 700),
        fila("`asfalto-7`", 800),
        extra,
        fila("`kraft-inset`", 100),
      ].join("\n");
    expect(fallosTablaGrises(doc(fila("`asfalto-9`", 900)), css)).toEqual([]);
    expect(fallosTablaGrises(doc(fila("`asfalto-9`", 900, "#0d2444")), css)).toEqual([
      "asfalto-9: doc #0d2444, CSS #1c1917",
    ]);
  });

  it("la tabla «Paleta de gráficas» del árbol es la del CSS, con las cifras del fixture", () => {
    expect(fallosTablaGraficas(leer("docs/marca.md"), BLOQUES.claro, BLOQUES.dark)).toEqual([]);
  });

  it("la tabla «Grises cálidos» del árbol es la del CSS", () => {
    expect(fallosTablaGrises(leer("docs/marca.md"), valorGrisDelCss)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R16 — el nombre heredado no aparece en lo que esta feature toca
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * `tasks.md > Archivos esperados`, menos lo que guarda historia (`specs/`, `progress/`) y los PNG.
 * El nombre se busca con el patrón compartido (`tests/fixtures/nombre-heredado.ts`), para que este
 * archivo no lo contenga.
 */
const ARCHIVOS_DE_LA_FEATURE = [
  "app/globals.css",
  "components/ui/badge.tsx",
  "app/(app)/monitoreo/_components/contadores.ts",
  "docs/marca.md",
  "public/offline.html",
  "app/global-error.tsx",
  "app/(app)/mis-asignaciones/_components/UbicacionMapaInner.tsx",
  "app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx",
  "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx",
  "app/(app)/ordenes/_components/EstatusBadge.tsx",
  "app/(app)/analitica/_components/entregas/ProductosTabla.tsx",
  "components/ui/tabs.tsx",
  "DESIGN.md",
  "design-whatsapp/Formulario.dc.html",
  "design-whatsapp/FormularioMovil.dc.html",
  "design-whatsapp/Historial.dc.html",
  "design-whatsapp/ListaMovil.dc.html",
  "design-whatsapp/Main.dc.html",
  "design-whatsapp/ParamsPicking.dc.html",
  "design-whatsapp/ParamsTransito.dc.html",
  "design-whatsapp/PdfPicking.dc.html",
  "design-whatsapp/PdfTransito1.dc.html",
  "design-whatsapp/PdfTransito2.dc.html",
  "design-whatsapp/Vacio.dc.html",
  "design-notificaciones/Campana.dc.html",
  "design-notificaciones/Main.dc.html",
  "design-notificaciones/PorRol.dc.html",
  "design-notificaciones/Push.dc.html",
  "tests/unit/guards/paleta-secundaria.guardia.test.ts",
  "tests/unit/guards/contraste-tokens.guardia.test.ts",
  "tests/unit/guards/impresion-tokens.guardia.test.ts",
  "tests/unit/guards/impresion-sin-dark.guardia.test.ts",
  "tests/unit/guards/factura-contraste.guardia.test.ts",
  "tests/unit/guards/marca-texto-amarillo.guardia.test.ts",
  "tests/unit/tablero-dia/color-contador.guardia.test.tsx",
  "tests/components/TableroDiaComposicion.test.tsx",
  "tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts",
];

function conNombreHeredado(archivos: { ruta: string; texto: string }[]): string[] {
  return archivos.filter((a) => contieneNombreHeredado(a.texto)).map((a) => a.ruta);
}

describe("R16 — ningún archivo de la feature contiene el nombre heredado", () => {
  it("sintético: el nombre en un comentario da rojo; sin él, verde", () => {
    const nombre = ["Orden", "ex"].join("");
    expect(conNombreHeredado([{ ruta: "a.ts", texto: `// paleta de ${nombre}` }, { ruta: "b.ts", texto: "ok" }])).toEqual([
      "a.ts",
    ]);
  });

  it("los archivos esperados de `tasks.md` no lo contienen", () => {
    const archivos = ARCHIVOS_DE_LA_FEATURE.map((ruta) => ({ ruta, texto: leer(ruta) }));
    expect(conNombreHeredado(archivos)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R17 — `public/offline.html`
// ─────────────────────────────────────────────────────────────────────────────────────────

interface ColoresOffline {
  themeColor: string | null;
  fondo: string | null;
  texto: string | null;
  titulo: string | null;
  parrafo: string | null;
  icono: string | null;
  botonTexto: string | null;
  botonFondo: string | null;
  todos: string[];
}

function estiloDe(reglas: Regla[], selector: string): Decls {
  return Object.assign({}, ...reglas.filter((r) => r.selectores.includes(selector)).map((r) => r.declaraciones));
}

function hexDeValor(valor: string | undefined): string | null {
  const m = /#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i.exec(valor ?? "");
  return m ? normalizar(m[0]) : null;
}

function coloresOffline(html: string): ColoresOffline {
  const estilo = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const reglas = reglasDe(quitarComentariosCss(estilo));
  const body = estiloDe(reglas, "body");
  const boton = estiloDe(reglas, "button");
  return {
    themeColor: hexDeValor(/<meta\s+name="theme-color"\s+content="([^"]*)"/.exec(html)?.[1]),
    fondo: hexDeValor(body["background-color"] ?? body.background),
    texto: hexDeValor(body.color),
    titulo: hexDeValor(estiloDe(reglas, "h1").color),
    parrafo: hexDeValor(estiloDe(reglas, "p").color),
    icono: hexDeValor(/<svg\b[^>]*\sstroke="([^"]*)"/.exec(html)?.[1]),
    botonTexto: hexDeValor(boton.color),
    botonFondo: hexDeValor(boton["background-color"] ?? boton.background),
    todos: [...html.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi)].map((m) => normalizar(m[0])),
  };
}

/** `design.md > D13`, columna «Ahora». */
const OFFLINE_D13 = {
  themeColor: "#111111",
  fondo: "#f7f7f5",
  texto: "#111111",
  titulo: "#111111",
  parrafo: "#44403c",
  icono: "#78716c",
  botonTexto: "#ffffff",
  botonFondo: "#111111",
} as const;

/** `design.md > D13`, columna «Par»: el «antes» y el umbral de cada uno. */
const PARES_OFFLINE = [
  { par: "texto s/ fondo", tinta: "texto", fondo: "fondo", antes: 14.79, umbral: AA_TEXTO },
  { par: "h1 s/ fondo", tinta: "titulo", fondo: "fondo", antes: 2.99, umbral: AA_TEXTO },
  { par: "p s/ fondo", tinta: "parrafo", fondo: "fondo", antes: 7.25, umbral: AA_TEXTO },
  { par: "icono s/ fondo", tinta: "icono", fondo: "fondo", antes: 2.86, umbral: AA_GRAFICO },
  { par: "botón", tinta: "botonTexto", fondo: "botonFondo", antes: 3.18, umbral: AA_TEXTO },
] as const;

function fallosOffline(c: ColoresOffline, themeManifiesto: string): string[] {
  const fallos: string[] = [];
  for (const [clave, esperado] of Object.entries(OFFLINE_D13)) {
    const real = c[clave as keyof typeof OFFLINE_D13];
    if (real !== esperado) fallos.push(`${clave}: ${real ?? "no encontrado"} (D13 ${esperado})`);
  }
  if (c.themeColor !== normalizar(themeManifiesto)) fallos.push(`theme-color ${c.themeColor} ≠ manifest ${themeManifiesto}`);
  const permitidos = new Set<string>(Object.values(OFFLINE_D13));
  for (const hex of new Set(c.todos)) if (!permitidos.has(hex)) fallos.push(`hex fuera de D13: ${hex}`);
  for (const p of PARES_OFFLINE) {
    const t = c[p.tinta];
    const f = c[p.fondo];
    const medido = t && f ? contraste(t, f) : 0;
    const suelo = Math.max(p.antes - REDONDEO, p.umbral);
    if (medido < suelo) fallos.push(`${p.par}: ${f2(medido)}`);
  }
  return fallos;
}

describe("R17 — `offline.html` usa la marca y `stone`, y ningún par baja", () => {
  const html = (h1: string, extra = "") =>
    `<meta name="theme-color" content="#111111" /><style>
      body { background: #F7F7F5; color: #111111; }
      h1 { color: ${h1}; } p { color: #44403c; }
      button { color: #fff; background: #111111; }
      button:hover { opacity: 0.9; }
    </style><svg width="64" stroke="#78716c"></svg>${extra}`;

  it("sintético: el naranja en el título da rojo; los colores de D13, verde", () => {
    expect(fallosOffline(coloresOffline(html("#111111")), "#111111")).toEqual([]);
    expect(fallosOffline(coloresOffline(html("#f26419")), "#111111")).toEqual([
      "titulo: #f26419 (D13 #111111)",
      "hex fuera de D13: #f26419",
      `h1 s/ fondo: ${f2(contraste("#f26419", "#f7f7f5"))}`,
    ]);
  });

  it("`public/offline.html` lleva los colores de D13 y el `theme_color` del manifiesto", () => {
    const manifiesto = JSON.parse(leer("public/manifest.json")) as { theme_color: string };
    expect(fallosOffline(coloresOffline(leer("public/offline.html")), manifiesto.theme_color)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R18 — `app/global-error.tsx`
// ─────────────────────────────────────────────────────────────────────────────────────────

function estiloEnLinea(codigo: string, constante: string): { fondo: string | null; texto: string | null } {
  const cuerpo = new RegExp(`const ${constante}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(codigo)?.[1] ?? "";
  return {
    fondo: hexDeValor(/\bbackgroundColor:\s*"([^"]*)"/.exec(cuerpo)?.[1]),
    texto: hexDeValor(/\bcolor:\s*"([^"]*)"/.exec(cuerpo)?.[1]),
  };
}

/** `design.md > D14`: los HEX de `--color-navy-deep` y `--color-brand-light`, y el «antes» de cada par. */
const GLOBAL_ERROR_D14 = {
  cuerpo: { fondo: "#111111", texto: "#ffffff", antes: 15.52 },
  boton: { fondo: "#ffd000", texto: "#111111", antes: 3.18 },
} as const;

function fallosGlobalError(codigo: string): string[] {
  const fallos: string[] = [];
  const leidos = { cuerpo: estiloEnLinea(codigo, "ESTILO_CUERPO"), boton: estiloEnLinea(codigo, "ESTILO_BOTON") };
  for (const clave of ["cuerpo", "boton"] as const) {
    const real = leidos[clave];
    const d14 = GLOBAL_ERROR_D14[clave];
    if (real.fondo !== d14.fondo || real.texto !== d14.texto) {
      fallos.push(`${clave}: ${real.texto} s/ ${real.fondo} (D14 ${d14.texto} s/ ${d14.fondo})`);
    }
    const medido = real.fondo && real.texto ? contraste(real.texto, real.fondo) : 0;
    if (medido < Math.max(AA_TEXTO, d14.antes - REDONDEO)) fallos.push(`${clave}: ${f2(medido)}`);
  }
  return fallos;
}

describe("R18 — `global-error` pinta fondo, texto y botón con la marca", () => {
  const codigo = (botonFondo: string, botonTexto: string) =>
    `const ESTILO_CUERPO: CSSProperties = {\n  backgroundColor: "#111111",\n  color: "#ffffff",\n};\n\nconst ESTILO_BOTON: CSSProperties = {\n  backgroundColor: "${botonFondo}",\n  color: "${botonTexto}",\n};\n`;

  it("sintético: el botón blanco sobre naranja da rojo; negro sobre amarillo, verde", () => {
    expect(fallosGlobalError(codigo("#FFD000", "#111111"))).toEqual([]);
    expect(fallosGlobalError(codigo("#f26419", "#ffffff"))).toEqual([
      "boton: #ffffff s/ #f26419 (D14 #111111 s/ #ffd000)",
      `boton: ${f2(contraste("#ffffff", "#f26419"))}`,
    ]);
  });

  it("`app/global-error.tsx`, sin comentarios, lleva los colores de D14", () => {
    expect(fallosGlobalError(codigoSinComentarios("app/global-error.tsx"))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R19 — pin y tramo de los mapas del mensajero
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * La tierra del estilo estándar de OpenStreetMap (OSM Carto), `design.md > D15`. Es la superficie
 * sobre la que caen el pin y el tramo. T7 la comprueba con el cuentagotas sobre una captura del
 * mapa real; si difiere, manda la captura y se corrige aquí y en D15.
 */
const TIERRA_OSM = "#f2efe9";
/** La calle de OSM es blanca: el pin cae a veces encima. */
const CALLE_OSM = "#ffffff";
/** Negro Servi y `--chart-1` claro (`design.md > D15`). */
const COLOR_DESTINO = "#111111";
/** Contraste del tramo contra la ruta azul con el color de D15: el suelo de «distinguirse». */
const TRAMO_VS_RUTA_D15 = 3.65;

interface ColoresMapa {
  pin: string | null;
  tramo: string | null;
  ruta: string | null;
}

function coloresMapa(ubicacion: string, ruta: string): ColoresMapa {
  const pin = /function iconoCliente\(\)[\s\S]*?background:\s*(#[0-9a-fA-F]{3,6})\b/.exec(ubicacion)?.[1];
  const tramo = /pathOptions=\{\{\s*color:\s*"([^"]*)",\s*weight:\s*6\b/.exec(ruta)?.[1];
  const lineaRuta = /pathOptions=\{\{\s*color:\s*"([^"]*)",\s*weight:\s*4\b/.exec(ruta)?.[1];
  return { pin: hexDeValor(pin), tramo: hexDeValor(tramo), ruta: hexDeValor(lineaRuta) };
}

function fallosMapa(c: ColoresMapa): string[] {
  const fallos: string[] = [];
  if (c.pin !== COLOR_DESTINO) fallos.push(`pin ${c.pin ?? "no encontrado"} (D15 ${COLOR_DESTINO})`);
  if (c.tramo !== COLOR_DESTINO) fallos.push(`tramo ${c.tramo ?? "no encontrado"} (D15 ${COLOR_DESTINO})`);
  const pares = [
    { par: "pin s/ tierra", a: c.pin, b: TIERRA_OSM, suelo: AA_GRAFICO },
    { par: "pin s/ calle", a: c.pin, b: CALLE_OSM, suelo: AA_GRAFICO },
    { par: "tramo s/ tierra", a: c.tramo, b: TIERRA_OSM, suelo: AA_GRAFICO },
    { par: "tramo vs ruta", a: c.tramo, b: c.ruta, suelo: TRAMO_VS_RUTA_D15 - REDONDEO },
  ];
  for (const p of pares) {
    const medido = p.a && p.b ? contraste(p.a, p.b) : 0;
    if (medido < p.suelo) fallos.push(`${p.par}: ${f2(medido)}`);
  }
  return fallos;
}

describe("R19 — el pin del cliente y el tramo a la siguiente parada en Negro Servi", () => {
  const ubic = (color: string) =>
    `function iconoCliente(): L.DivIcon {\n  return L.divIcon({ html: \`<div style="width:28px;background:${color};border:2px solid #fff"></div>\` });\n}`;
  const ruta = (tramo: string) =>
    `<Polyline pathOptions={{\n color: "#2563eb",\n weight: 4,\n }} />\n<Polyline pathOptions={{ color: "${tramo}", weight: 6, opacity: 0.95 }} />`;

  it("sintético: el naranja da rojo; el negro, verde", () => {
    expect(fallosMapa(coloresMapa(ubic("#111111"), ruta("#111111")))).toEqual([]);
    expect(fallosMapa(coloresMapa(ubic("#f26419"), ruta("#f26419")))).toEqual([
      "pin #f26419 (D15 #111111)",
      "tramo #f26419 (D15 #111111)",
      `pin s/ tierra: ${f2(contraste("#f26419", TIERRA_OSM))}`,
      `tramo s/ tierra: ${f2(contraste("#f26419", TIERRA_OSM))}`,
      `tramo vs ruta: ${f2(contraste("#f26419", "#2563eb"))}`,
    ]);
  });

  it("los dos mapas de `/mis-asignaciones` pintan pin y tramo con `#111111`", () => {
    const dir = "app/(app)/mis-asignaciones/_components";
    const colores = coloresMapa(
      codigoSinComentarios(`${dir}/UbicacionMapaInner.tsx`),
      codigoSinComentarios(`${dir}/RutaMapaInner.tsx`),
    );
    expect(colores.ruta).toBe("#2563eb");
    expect(fallosMapa(colores)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// R20 — ningún HEX de la marca anterior en el árbol versionado
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que no se recorre. Dos grupos, y ninguno se amplía a mano para poner esto en verde:
 * - lo que `.gitignore` deja fuera de git, más `.git` y `.worktrees` (copias del repo);
 * - las exclusiones de R20: `tests/`, `specs/` y `progress/` guardan historia.
 */
const CARPETAS_FUERA = new Set([
  "node_modules", ".next", ".git", ".worktrees", "_trabajo", "coverage", "out", "build",
  "test-results", "playwright-report", "blob-report", ".vitest", ".vercel", "harnessConfig",
  "tests", "specs", "progress",
]);
/** Rutas ignoradas por `.gitignore` que no son una carpeta de primer nivel. */
const RUTAS_FUERA = new Set([".claude/worktrees", "playwright/.cache", "progress/logs"]);
const ARCHIVOS_FUERA = /^(?:\.git|\.env(?!\.example$).*|dev\.log|.*\.dev\.log|.*\.tsbuildinfo|next-env\.d\.ts|feature_list\.json|\.arnes\.local\.json|\.vitest-rojos\.json|\.vitest-codigo|npm-debug\.log.*|yarn-.*\.log.*|\.pnpm-debug\.log.*|\.DS_Store|.*\.pem)$/;
/** Binarios: no llevan HEX de texto y leerlos como UTF-8 solo da ruido. */
const BINARIOS = /\.(?:png|jpe?g|gif|webp|ico|avif|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm|mp3|wasm)$/i;

/** El árbol recorrido tenía 2.866 archivos de texto el 2026-10-28; el suelo deja margen sin pasar en vacío. */
const SUELO_ARCHIVOS = 2500;

function archivosVersionados(rel = ""): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(path.join(RAIZ, rel), { withFileTypes: true })) {
    const hijo = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if ((rel === "" && CARPETAS_FUERA.has(e.name)) || e.name === ".git" || e.name === "node_modules") continue;
      if (RUTAS_FUERA.has(hijo)) continue;
      salida.push(...archivosVersionados(hijo));
    } else if (e.isFile() && !ARCHIVOS_FUERA.test(e.name) && !BINARIOS.test(e.name)) {
      salida.push(hijo);
    }
  }
  return salida;
}

function fallosMarcaAnterior(archivos: { ruta: string; texto: string }[]): string[] {
  const patron = new RegExp(patronHex(HEX_SL8_D5).source, "gi");
  return archivos.flatMap(({ ruta, texto }) => {
    // Los comentarios de `app/globals.css` citan los valores viejos a propósito; sus tokens
    // ya los vigilan R1, R2 y R9 (exclusión de R20).
    const cuerpo = ruta === "app/globals.css" ? quitarComentariosCss(texto) : texto;
    const hallados = new Set([...cuerpo.matchAll(patron)].map((m) => m[0].toLowerCase()));
    if (RGBA_NARANJA.test(cuerpo)) hallados.add("rgba(242, 100, 25, …)");
    return hallados.size ? [`${ruta}: ${[...hallados].sort().join(", ")}`] : [];
  });
}

describe("R20 — ningún archivo versionado lleva el naranja o el navy de la marca anterior", () => {
  it("sintético: un HEX en mayúsculas, un `rgba` o un comentario dan rojo; en `globals.css`, el comentario no", () => {
    expect(
      fallosMarcaAnterior([
        { ruta: "a.html", texto: "color: #F26419;" },
        { ruta: "b.tsx", texto: "// era rgba(242,100,25,0.4)" },
        { ruta: "c.css", texto: "--x: #0d24440a; --y: #111111;" },
        { ruta: "app/globals.css", texto: "/* antes #0d2444 */ --x: #1c1917;" },
      ]),
    ).toEqual(["a.html: #f26419", "b.tsx: rgba(242, 100, 25, …)"]);
    expect(fallosMarcaAnterior([{ ruta: "app/globals.css", texto: "--x: #0D2444;" }])).toEqual([
      "app/globals.css: #0d2444",
    ]);
  });

  it("el recorrido no pasa en vacío y deja fuera lo que R20 excluye", () => {
    const archivos = archivosVersionados();
    expect(archivos.length).toBeGreaterThanOrEqual(SUELO_ARCHIVOS);
    expect(archivos).toContain("app/globals.css");
    expect(archivos).toContain("public/offline.html");
    expect(archivos).toContain("DESIGN.md");
    expect(archivos.some((a) => /^(tests|specs|progress|node_modules)\//.test(a))).toBe(false);
  });

  it("el árbol no tiene ninguno de los HEX de SL-8 D5 ni el `rgba` del naranja", () => {
    const archivos = archivosVersionados().map((ruta) => ({ ruta, texto: leer(ruta) }));
    expect(fallosMarcaAnterior(archivos)).toEqual([]);
  });
});
