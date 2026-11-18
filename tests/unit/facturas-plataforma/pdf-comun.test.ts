import { describe, expect, it } from "vitest";

import { MARCA_FACTURA } from "@/lib/config/marca";
import {
  COLORES,
  Lienzo,
  MEDIDAS,
  type Color,
  type Columna,
  type Fila,
  type LogoDelPdf,
} from "@/lib/facturas-plataforma/pdf-comun";
import {
  contenidoDePagina,
  fuentesDePagina,
  objetos,
  paginas,
  textoLegible,
  textosDePagina,
} from "../pdf/pdf-inspector";

// SLT-199 (T1.1) — R2, R5 y R6 sobre el PDF REAL que dibuja el módulo común: el texto se lee con la fuente que
// declara el propio documento y los colores con los operadores del content stream.

const PT = 72 / 25.4;
const COLUMNAS: readonly Columna[] = [
  { titulo: "#", ancho: 30 },
  { titulo: "Remisión", ancho: MEDIDAS.util - 70 },
  { titulo: "Importe", ancho: 40, derecha: true },
];
const FILAS = 120;

function* filas(n: number): Generator<Fila> {
  for (let i = 1; i <= n; i++) yield { celdas: [{ texto: `F${i}` }, { texto: `R-${i}` }, { texto: "100.00" }] };
}

function documento(dibujar: (l: Lienzo) => void) {
  const l = new Lienzo();
  dibujar(l);
  const bytes = new Uint8Array(l.bytes());
  const n = paginas(objetos(bytes)).length;
  const pags = Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(bytes, i);
    return textosDePagina(bytes, i).map((t) => {
      const fuente = fuentes.get(t.fuenteRes);
      return { texto: textoLegible(t, fuente), fuente: fuente?.baseFont ?? "", y: t.y };
    });
  });
  return { bytes, pags, textos: pags.map((p) => p.map((t) => t.texto)) };
}

/** Los rectángulos rellenos en orden de dibujo, con el color de relleno activo (`r g b rg`, o `g` si es gris). */
function rectangulosConColor(contenido: string): { x: number; w: number; h: number; color: Color }[] {
  const out: { x: number; w: number; h: number; color: Color }[] = [];
  const re = /([\d.]+) ([\d.]+) ([\d.]+) rg|([\d.]+) g\b|(-?[\d.]+) -?[\d.]+ (-?[\d.]+) (-?[\d.]+) re\s+f/g;
  let color: Color = [0, 0, 0];
  let m: RegExpExecArray | null;
  while ((m = re.exec(contenido)) !== null) {
    if (m[1] !== undefined) color = [m[1], m[2], m[3]].map((c) => Number(c) * 255) as unknown as Color;
    else if (m[4] !== undefined) color = [0, 1, 2].map(() => Number(m![4]) * 255) as unknown as Color;
    else out.push({ x: Number(m[5]), w: Number(m[6]), h: Math.abs(Number(m[7])), color });
  }
  return out;
}

/** jsPDF escribe cada canal con dos decimales: hasta ~2 de 255 de diferencia. */
function mismoColor(a: Color, b: Color): boolean {
  return a.every((c, i) => Math.abs(c - b[i]) <= 2.6);
}

describe("SLT-199 R5 — tabla partida: cabecera repetida, sin perder ni duplicar filas, fondos alternos", () => {
  const { bytes, textos } = documento((l) => {
    l.tituloSeccion("Movimientos");
    l.tabla(COLUMNAS, filas(FILAS), MEDIDAS.filaCompacta);
    l.pies("Pie de prueba");
  });

  it("ocupa varias páginas y cada una empieza con la cabecera de la tabla", () => {
    expect(textos.length).toBeGreaterThanOrEqual(2);
    for (const p of textos) {
      const i = p.indexOf("#");
      expect(i, "falta la cabecera").toBeGreaterThanOrEqual(0);
      expect(p.slice(i, i + 3)).toEqual(["#", "Remisión", "Importe"]);
    }
  });

  it("todas las filas, en orden, una sola vez", () => {
    const vistas = textos.flatMap((p) => p.filter((t) => /^F\d+$/.test(t)));
    expect(vistas).toEqual(Array.from({ length: FILAS }, (_, i) => `F${i + 1}`));
  });

  it("las filas alternan dos fondos claros", () => {
    const fondos = rectangulosConColor(contenidoDePagina(bytes, 0))
      .filter((r) => Math.abs(r.h - MEDIDAS.filaCompacta.alto * PT) < 0.01)
      .map((r) => r.color);
    expect(fondos.length).toBeGreaterThan(20);
    fondos.forEach((c, i) => expect(mismoColor(c, i % 2 === 0 ? COLORES.fondoFila : COLORES.fondoFilaAlterna)).toBe(true));
    expect(mismoColor(COLORES.fondoFila, COLORES.fondoFilaAlterna)).toBe(false);
  });

  it("cada página lleva «Página x de y» y el texto del pie", () => {
    textos.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${textos.length}`);
      expect(p).toContain("Pie de prueba");
    });
  });
});

describe("SLT-199 R2 — Helvetica, y la fuente embebida solo para el texto que la Helvetica no puede escribir", () => {
  const { pags } = documento((l) => {
    l.texto("Cargos por orden", 20, 20);
    l.texto("Total", 20, 30, { negrita: true });
    l.texto("₡473 000,00", 20, 40);
    l.texto("Envíos “Ñandú”", 20, 50);
    l.texto("Envíos 日本", 20, 60);
  });
  const de = (t: string) => pags[0].find((x) => x.texto === t);

  it("un texto escribible en WinAnsi va en Helvetica, normal o negrita", () => {
    expect(de("Cargos por orden")?.fuente).toBe("Helvetica");
    expect(de("Total")?.fuente).toBe("Helvetica-Bold");
  });

  it("un texto con el símbolo de la moneda o comillas tipográficas va ENTERO en la fuente embebida, sin perder nada", () => {
    for (const t of ["₡473 000,00", "Envíos “Ñandú”"]) {
      const dibujado = de(t);
      expect(dibujado, `falta «${t}» entero`).toBeDefined();
      expect(dibujado?.fuente).not.toMatch(/Helvetica/);
    }
  });

  it("un carácter que tampoco cubre la embebida sale «?» visible", () => {
    expect(de("Envíos ??")).toBeDefined();
  });

  it("ninguna fuente Poppins ni otra que no sea Helvetica o la embebida", () => {
    const fuentes = new Set(pags[0].map((t) => t.fuente));
    expect([...fuentes].some((f) => /poppins/i.test(f))).toBe(false);
    expect(fuentes.size).toBe(3);
  });
});

describe("SLT-199 R6 — cabecera y barra degradada", () => {
  const cabecera = (logo: LogoDelPdf | null) =>
    documento((l) => l.cabecera({ logo, antetitulo: "ANTETÍTULO", titulo: "Título", cliente: "Cliente: X" }));

  it("sin logo, «Singularis» en texto y el documento se genera igual", () => {
    for (const logo of [null, new Uint8Array([1, 2, 3, 4])]) {
      const { textos } = cabecera(logo);
      expect(textos[0]).toEqual(expect.arrayContaining([MARCA_FACTURA.emisor, "ANTETÍTULO", "Título", "Cliente: X"]));
    }
  });

  it("la barra degradada son tiras contiguas de cian a rosa, pasando por violeta, bajo la banda", () => {
    const { bytes } = cabecera(null);
    const tiras = rectangulosConColor(contenidoDePagina(bytes, 0)).filter(
      (r) => Math.abs(r.h - MEDIDAS.altoBarra * PT) < 0.01,
    );
    expect(tiras).toHaveLength(MEDIDAS.tiras);
    expect(mismoColor(tiras[0].color, COLORES.degradado[0])).toBe(true);
    expect(mismoColor(tiras[MEDIDAS.tiras - 1].color, COLORES.degradado[2])).toBe(true);
    // Con 60 tiras ninguna cae justo en la mitad: la del centro está a un paso del violeta.
    const centro = tiras[MEDIDAS.tiras / 2].color;
    centro.forEach((c, i) => expect(Math.abs(c - COLORES.degradado[1][i])).toBeLessThanOrEqual(8));
    expect(tiras[0].x).toBeCloseTo(MEDIDAS.margen * PT, 1);
    expect(tiras.at(-1)!.x + tiras.at(-1)!.w).toBeCloseTo((MEDIDAS.margen + MEDIDAS.util) * PT, 1);
  });
});
