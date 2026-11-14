import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A7; R490, R494) — guardia estática de las
 * pantallas del mensajero.
 *
 * 1. **Ningún dato se recorta** (R490, `design.md §2`): ni `truncate`, ni `text-ellipsis`, ni
 *    `line-clamp-*`, ni un `title={…}` que lleve un dato (el «…» con tooltip de SLT-152 no se lee en
 *    el móvil: no hay tooltip).
 * 2. **Escala de 4 px** (R494, `design.md §3`): sin medios pasos (`*-0.5`, `*-1.5`, `*-2.5`,
 *    `*-3.5`) ni valores arbitrarios (`p-[13px]`) en márgenes, rellenos y huecos. Los tamaños de
 *    letra, de icono (`size-3.5`) y las posiciones (`left-2.5`) no son espaciado y no entran.
 *
 * La lista es EXPLÍCITA (`ARCHIVOS_PWA_MENSAJERO`): cada rebanada de SLT-156 añade los suyos. Un archivo
 * nuevo de la ficha que no esté en ella lo señala el reviewer. Lo que esta guardia no ve —que el
 * texto de verdad no se salga en el navegador— lo mide el E2E `e2e/pwa-mensajero-base.spec.ts`.
 *
 * Se lee el código SIN comentarios: un comentario que explique por qué ya no hay `truncate` no es
 * un `truncate`.
 */

type Regla = "recorte" | "escala";

interface ArchivoVigilado {
  archivo: string;
  /**
   * Solo estas funciones del archivo (desde su declaración hasta la siguiente de primer nivel).
   * Para archivos grandes que la ficha toca en parte: el resto no es pantalla del mensajero.
   */
  segmentos?: readonly string[];
  reglas: readonly Regla[];
  /** Por qué entra con menos reglas que las dos, si es el caso. */
  nota?: string;
}

const ARCHIVOS_PWA_MENSAJERO: readonly ArchivoVigilado[] = [
  // Rebanada A — base común.
  { archivo: "components/shared/texto-entero.ts", reglas: ["recorte", "escala"] },
  { archivo: "components/private/cierres/fila/FilaGestion.tsx", reglas: ["recorte", "escala"] },
  { archivo: "components/private/cierres/detalle/RechazosDeTiendaCierre.tsx", reglas: ["recorte", "escala"] },
  {
    archivo: "app/(app)/cierres-admin/_components/cierre-factura.tsx",
    segmentos: ["FilaSinGestion", "SeccionSinGestion"],
    reglas: ["recorte", "escala"],
    nota: "El comprobante (`CierreFacturaDetalle`) no es pantalla del mensajero en este alcance.",
  },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx", reglas: ["recorte", "escala"] },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx", reglas: ["recorte", "escala"] },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx", reglas: ["recorte", "escala"] },
  { archivo: "app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx", reglas: ["recorte", "escala"] },
  { archivo: "app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx", reglas: ["recorte", "escala"] },
  { archivo: "components/shared/ReporteBugBoton.tsx", reglas: ["recorte", "escala"] },
  { archivo: "components/shared/EscanerModal.tsx", reglas: ["recorte", "escala"] },
  { archivo: "hooks/use-flotante-compacto.ts", reglas: ["recorte", "escala"] },
  {
    archivo: "components/shared/BuscadorFiltros.tsx",
    reglas: ["escala"],
    nota:
      "Su `text-ellipsis` es del PLACEHOLDER del campo y su `truncate`, del rótulo de un filtro en el " +
      "selector: ninguno es un dato de orden, gestión o cierre (R490).",
  },
];

const PROPIEDADES_ESPACIADO =
  "(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)";
const MEDIO_PASO = new RegExp(`^-?${PROPIEDADES_ESPACIADO}-[0-3]\\.5$`);
const ARBITRARIO = new RegExp(`^-?${PROPIEDADES_ESPACIADO}-\\[[^\\]]+\\]$`);
/** `title={…}` con un dato: el texto de una celda o un campo de orden, gestión o cierre. */
const TITLE_CON_DATO = /\btitle=\{\s*(?:texto\b|g\.|r\.|o\.|orden\.|mensajeroNombre\b)/;

/** El código sin comentarios de bloque, de JSX ni de línea (las URL `https://` se respetan). */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** La utilidad sin sus variantes (`max-md:`, `sm:`, `[&>button]:`, `group-data-[open]/x:`). */
function sinVariantes(token: string): string {
  let profundidad = 0;
  let corte = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") profundidad++;
    else if (c === "]") profundidad--;
    else if (c === ":" && profundidad === 0) corte = i;
  }
  return token.slice(corte + 1).replace(/^!/, "");
}

interface Hallazgo {
  regla: Regla;
  linea: number;
  texto: string;
}

/** Lo que incumple cada regla en un trozo de código (ya sin comentarios). */
function hallazgos(codigo: string, reglas: readonly Regla[]): Hallazgo[] {
  const out: Hallazgo[] = [];
  codigo.split("\n").forEach((linea, i) => {
    const tokens = linea.split(/[\s"'`{}(),;]+/).filter(Boolean);
    for (const token of tokens) {
      const u = sinVariantes(token);
      if (reglas.includes("recorte") && (u === "truncate" || u === "text-ellipsis" || /^line-clamp-(?!none$)/.test(u))) {
        out.push({ regla: "recorte", linea: i + 1, texto: token });
      }
      if (reglas.includes("escala") && (MEDIO_PASO.test(u) || ARBITRARIO.test(u))) {
        out.push({ regla: "escala", linea: i + 1, texto: token });
      }
    }
    if (reglas.includes("recorte") && TITLE_CON_DATO.test(linea)) {
      out.push({ regla: "recorte", linea: i + 1, texto: linea.trim() });
    }
  });
  return out;
}

/** El trozo de `fuente` desde la declaración de `nombre` hasta la siguiente de primer nivel. */
function segmento(fuente: string, nombre: string): string {
  const inicio = fuente.search(new RegExp(`^(?:export )?function ${nombre}\\b`, "m"));
  if (inicio < 0) throw new Error(`no encuentro la función ${nombre}`);
  const resto = fuente.slice(inicio + 1);
  const fin = resto.search(/^(?:export )?(?:async )?(?:function|const|let|interface|type|class) /m);
  return fin < 0 ? fuente.slice(inicio) : fuente.slice(inicio, inicio + 1 + fin);
}

const RAIZ = process.cwd();

function codigoVigilado(a: ArchivoVigilado): string {
  const fuente = readFileSync(join(RAIZ, a.archivo), "utf8").replace(/\r\n/g, "\n");
  const trozos = a.segmentos ? a.segmentos.map((s) => segmento(fuente, s)) : [fuente];
  return sinComentarios(trozos.join("\n"));
}

describe("SLT-156 — pantallas del mensajero: ningún dato se recorta (R490) y escala de 4 px (R494)", () => {
  it.each(ARCHIVOS_PWA_MENSAJERO.map((a) => [a.archivo, a] as const))("%s", (_nombre, a) => {
    const codigo = codigoVigilado(a);
    // Un segmento vacío (función renombrada) dejaría la guardia verde sin mirar nada.
    expect(codigo.trim().length, `${a.archivo}: no hay código que mirar`).toBeGreaterThan(40);
    const malos = hallazgos(codigo, a.reglas).map((h) => `${h.regla} · línea ${h.linea} del trozo · ${h.texto}`);
    expect(malos, `${a.archivo}`).toEqual([]);
  });
});

describe("SLT-156 — la guardia detecta lo que dice (autocomprobación)", () => {
  it("caza el recorte, con o sin variante", () => {
    for (const malo of [
      '<p className="truncate text-sm">',
      '<p className="md:truncate">',
      '<p className="text-ellipsis">',
      '<p className="line-clamp-2">',
      "<span title={texto}>",
      "<span title={g.destinatario}>",
    ]) {
      expect(hallazgos(malo, ["recorte"]), malo).not.toEqual([]);
    }
    expect(hallazgos('<p className="line-clamp-none whitespace-normal">', ["recorte"])).toEqual([]);
    expect(hallazgos("<Button title={motivoDeshabilitado}>", ["recorte"])).toEqual([]);
  });

  it("caza medios pasos y espaciado arbitrario, y deja pasar letra, iconos y posiciones", () => {
    for (const malo of ['"gap-1.5"', '"px-2.5 py-0.5"', '"max-md:mt-3.5"', '"-mx-1.5"', '"p-[13px]"', '"gap-x-[6px]"', '"space-y-1.5"']) {
      expect(hallazgos(malo, ["escala"]), malo).not.toEqual([]);
    }
    for (const bueno of ['"size-3.5"', '"left-2.5"', '"text-[13px]"', '"min-w-[250px]"', '"gap-2 p-3 px-(--card-spacing)"', '"[&>button]:h-11"']) {
      expect(hallazgos(bueno, ["escala"]), bueno).toEqual([]);
    }
  });

  it("no lee los comentarios", () => {
    const codigo = sinComentarios('// antes llevaba `truncate`\n/* gap-1.5 */\n{/* truncate */}\nconst x = "https://a.b";');
    expect(hallazgos(codigo, ["recorte", "escala"])).toEqual([]);
    expect(codigo).toContain("https://a.b");
  });

  it("el segmento de una función acaba en la siguiente declaración de primer nivel", () => {
    const fuente = "const a = 1;\nfunction Uno() {\n  return 'truncate';\n}\n\nexport function Dos() {}\n";
    expect(segmento(fuente, "Uno")).toContain("truncate");
    expect(segmento(fuente, "Uno")).not.toContain("Dos");
    expect(() => segmento(fuente, "Tres")).toThrow();
  });
});
