// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R928; decisión de Carlos del
// 2026-11-17): el escáner es UN solo componente. La barra con el título y el único «Cerrar» de
// 44 × 44 px son de `components/shared/EscanerModal.tsx`, para todos los usos.
//
// La regla: **ningún cierre propio DENTRO del contenido del escáner**. La guardia recorre `app/` y
// `components/` y, en cada archivo:
// - toma el CONTENIDO de cada `<EscanerModal …>…</EscanerModal>` (los hijos, no las `acciones`) y el
//   de cada envoltorio que se lo pasa como `{children}` (`<RecibirPaquetesEntrada>…`);
// - sigue los componentes que ese contenido monta (`<EscanerGuiaCard`, `<TarjetaEscaneoContinuo`,
//   `<EscanerRecepcionOrigen`…), por su declaración en el mismo archivo o por su `import`, y dentro
//   de ellos los que montan a su vez (`components/ui/` no se sigue: es la primitiva, no una pantalla);
// - en todo ese código no admite `DialogClose`, `showCloseButton`, la etiqueta del cierre del
//   escáner ni el literal «Cerrar» (como texto JSX, como `"Cerrar"` en cualquier prop o expresión, o
//   por una constante cuyo valor es «Cerrar»).
// Un «Cerrar» de OTRO diálogo del mismo archivo no cuenta: no está en ese contenido.
// Además, cada `<EscanerModal` lleva `titulo=` (el typecheck lo refuerza: `titulo` es obligatorio).
// Se lee el código sin comentarios: la prosa que nombra estas piezas no dispara.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

const RAIZ = process.cwd();
const COMPONENTE = path.join("components", "shared", "EscanerModal.tsx");

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = path.join(dir, entrada);
    if (statSync(ruta).isDirectory()) return recorrer(ruta);
    return /\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

function relativa(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

/**
 * La etiqueta de apertura que empieza en `inicio` (`<EscanerModal …>`): termina en el primer `>`
 * fuera de llaves, así que las props con JSX dentro (`acciones={<>…</>}`) no la cortan.
 */
export function etiquetaDeApertura(fuente: string, inicio: number): string {
  let profundidad = 0;
  for (let i = inicio + 1; i < fuente.length; i++) {
    const c = fuente[i];
    if (c === "{") profundidad++;
    else if (c === "}") profundidad--;
    else if (c === ">" && profundidad === 0) return fuente.slice(inicio, i + 1);
  }
  return fuente.slice(inicio);
}

/** El contenido (hijos) de cada `<Etiqueta …>…</Etiqueta>` del código; las autocerradas no tienen. */
export function contenidosDe(codigo: string, etiqueta: string): string[] {
  const out: string[] = [];
  const apertura = new RegExp(`<${etiqueta}\\b`, "g");
  for (let m = apertura.exec(codigo); m; m = apertura.exec(codigo)) {
    const tag = etiquetaDeApertura(codigo, m.index);
    if (tag.endsWith("/>")) continue;
    const desde = m.index + tag.length;
    const marcas = new RegExp(`<${etiqueta}\\b|</${etiqueta}\\s*>`, "g");
    marcas.lastIndex = desde;
    let nivel = 1;
    for (let x = marcas.exec(codigo); x; x = marcas.exec(codigo)) {
      if (x[0].startsWith("</")) nivel--;
      else if (!etiquetaDeApertura(codigo, x.index).endsWith("/>")) nivel++;
      if (nivel === 0) {
        out.push(codigo.slice(desde, x.index));
        break;
      }
    }
  }
  return out;
}

const DECLARACION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/gm;

/** El cuerpo de la declaración de nivel superior `nombre` del archivo (hasta la siguiente), o null. */
export function declaracionDe(codigo: string, nombre: string): string | null {
  const decls = [...codigo.matchAll(DECLARACION)];
  const i = decls.findIndex((d) => d[1] === nombre);
  if (i < 0) return null;
  const fin = i + 1 < decls.length ? decls[i + 1].index : codigo.length;
  return codigo.slice(decls[i].index, fin);
}

/** El archivo del que `codigo` importa `nombre` (alias `@/` o relativo), si es nuestro y no de `ui/`. */
function archivoImportado(codigo: string, nombre: string, desde: string): string | null {
  for (const m of codigo.matchAll(/import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const nombres = m[1]
      .replace(/[{}]/g, ",")
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, ""))
      .filter(Boolean);
    if (!nombres.includes(nombre)) continue;
    const ruta = m[2];
    let base: string;
    if (ruta.startsWith("@/")) base = path.join(RAIZ, ruta.slice(2));
    else if (ruta.startsWith(".")) base = path.resolve(path.dirname(desde), ruta);
    else return null;
    if (relativa(base).startsWith("components/ui/")) return null;
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
    return null;
  }
  return null;
}

const CODIGO = new Map<string, string>();
function codigoDe(archivo: string): string {
  if (!CODIGO.has(archivo)) CODIGO.set(archivo, quitarComentarios(readFileSync(archivo, "utf8")));
  return CODIGO.get(archivo)!;
}

const ARCHIVOS = ["app", "components"].flatMap((dir) => recorrer(path.join(RAIZ, dir)));

/** Constantes del código cuyo valor es exactamente «Cerrar» (las de otros diálogos, la del escáner…). */
const CONSTANTES_CERRAR = new Set(
  ARCHIVOS.flatMap((a) => [...codigoDe(a).matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*["'`]Cerrar["'`]/g)].map((m) => m[1])),
);

/** Un cierre propio en un trozo de código. */
export function cierresPropios(codigo: string, constantes: ReadonlySet<string> = CONSTANTES_CERRAR): string[] {
  const reglas: [string, RegExp][] = [
    ["DialogClose", /\bDialogClose\b/],
    ["showCloseButton", /\bshowCloseButton\b/],
    ["ESCANER_CERRAR_LABEL", /\bESCANER_CERRAR_LABEL\b/],
    ["texto JSX «Cerrar»", />\s*Cerrar\s*</],
    ['literal "Cerrar"', /["'`]Cerrar["'`]/],
  ];
  const hallados = reglas.filter(([, re]) => re.test(codigo)).map(([n]) => n);
  for (const c of constantes) if (new RegExp(`\\b${c}\\b`).test(codigo)) hallados.push(`constante ${c}`);
  return hallados;
}

/** Envoltorios que pasan su `{children}` como contenido de un `EscanerModal`. */
const ENVOLTORIOS = new Set(
  ARCHIVOS.flatMap((a) => {
    const codigo = codigoDe(a);
    return contenidosDe(codigo, "EscanerModal").some((c) => /\{\s*children\s*\}/.test(c))
      ? [...codigo.matchAll(/export\s+function\s+(\w+)/g)].map((m) => m[1])
      : [];
  }),
);

interface Visita {
  archivo: string;
  donde: string;
  codigo: string;
}

/** Todo el código que vive dentro de algún escáner: sus contenidos y lo que montan, sin repetir. */
function codigoDentroDelEscaner(): Visita[] {
  const visitas: Visita[] = [];
  const vistos = new Set<string>();
  const pendientes: { archivo: string; donde: string; trozo: string }[] = [];
  for (const archivo of ARCHIVOS) {
    const codigo = codigoDe(archivo);
    for (const etiqueta of ["EscanerModal", ...ENVOLTORIOS]) {
      for (const c of contenidosDe(codigo, etiqueta)) {
        if (/^\s*\{\s*children\s*\}\s*$/.test(c)) continue;
        pendientes.push({ archivo, donde: `contenido de <${etiqueta}>`, trozo: c });
      }
    }
  }
  while (pendientes.length > 0) {
    const { archivo, donde, trozo } = pendientes.shift()!;
    visitas.push({ archivo: relativa(archivo), donde, codigo: trozo });
    const codigoArchivo = codigoDe(archivo);
    for (const [, nombre] of trozo.matchAll(/<([A-Z]\w*)/g)) {
      if (nombre === "EscanerModal") continue;
      const local = declaracionDe(codigoArchivo, nombre);
      const destino = local !== null ? archivo : archivoImportado(codigoArchivo, nombre, archivo);
      if (destino === null) continue;
      const clave = `${destino}#${nombre}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const cuerpo = local ?? declaracionDe(codigoDe(destino), nombre);
      if (cuerpo !== null) pendientes.push({ archivo: destino, donde: nombre, trozo: cuerpo });
    }
  }
  return visitas;
}

const MONTAJES = ARCHIVOS.filter((a) => relativa(a) !== relativa(path.join(RAIZ, COMPONENTE))).filter((a) =>
  /<EscanerModal\b/.test(codigoDe(a)),
);

describe("SLT-193 · R928 — las piezas de la guardia", () => {
  it("el contenido de un escáner es solo sus hijos, no las `acciones` ni otro diálogo del archivo", () => {
    const codigo = `
      <Dialog><DialogClose>Cerrar</DialogClose></Dialog>
      <EscanerModal titulo="X" acciones={<button>Cerrar</button>}>
        <Tarjeta />
      </EscanerModal>`;
    expect(contenidosDe(codigo, "EscanerModal").map((c) => c.trim())).toEqual(["<Tarjeta />"]);
    expect(cierresPropios(contenidosDe(codigo, "EscanerModal")[0], new Set())).toEqual([]);
  });

  it.each([
    ["texto JSX", "<Button>Cerrar</Button>"],
    ["expresión", '<Button>{"Cerrar"}</Button>'],
    ["aria-label", '<button aria-label="Cerrar" />'],
    ["otra prop", '<Confirmar cancelLabel="Cerrar" />'],
    ["DialogClose", "<DialogClose />"],
    ["constante", "<button aria-label={CERRAR_LABEL} />"],
  ])("detecta un cierre propio por %s", (_caso, trozo) => {
    expect(cierresPropios(trozo, new Set(["CERRAR_LABEL"]))).not.toEqual([]);
  });

  it("«Cerrar cámara» (QrScanner) no es un cierre del diálogo", () => {
    expect(cierresPropios('<Button aria-label="Cerrar cámara">Cerrar cámara</Button>', new Set())).toEqual([]);
  });
});

describe("SLT-193 · R928 — el escáner pinta un solo cierre, el de EscanerModal", () => {
  const visitas = codigoDentroDelEscaner();

  it("la guardia no está vacía: llega a los montajes y a las tarjetas de dentro", () => {
    // Reparto, Recoger, Recolección, recepción continua y cámara del buscador. SLT-202 «Escritorio
    // igual a prod: tamaños de controles y un solo botón de recibir» (Carlos, 2026-11-18): Órdenes y la
    // satélite ya no montan `EscanerModal` (la guía suelta se quitó); su único disparador es
    // `RecibirPaquetesEntrada`, que la guardia sigue recorriendo como envoltorio (abajo).
    expect(MONTAJES.length).toBeGreaterThanOrEqual(5);
    const alcanzados = new Set(visitas.map((v) => v.donde));
    for (const pieza of [
      "EscanerGuiaCard",
      "TarjetaEscaneoContinuo",
      "EscanerRecepcion",
      "EscanerRecepcionOrigen",
      "EscanerRecepcionBodegaCentral",
      "CamaraDelBuscador",
      "QrScanner",
    ]) {
      expect(alcanzados, pieza).toContain(pieza);
    }
    expect(ENVOLTORIOS).toContain("RecibirPaquetesEntrada");
  });

  it("nada de lo que vive dentro del escáner pinta su propio cierre", () => {
    const fallos = visitas.flatMap(({ archivo, donde, codigo }) =>
      cierresPropios(codigo).map((c) => `${archivo} · ${donde}: ${c}`),
    );
    expect(fallos).toEqual([]);
  });

  it("cada `<EscanerModal` lleva `titulo=`", () => {
    const fallos: string[] = [];
    let total = 0;
    for (const archivo of MONTAJES) {
      const codigo = codigoDe(archivo);
      const re = /<EscanerModal\b/g;
      for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
        total++;
        if (!/\btitulo=/.test(etiquetaDeApertura(codigo, m.index))) fallos.push(relativa(archivo));
      }
    }
    // SLT-202: cinco montajes (ver arriba).
    expect(total).toBeGreaterThanOrEqual(5);
    expect(fallos).toEqual([]);
  });
});
