import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { censoModulo, rutaAbsoluta, textosDeFuente } from "../../fixtures/censo-cierres";

/**
 * SLT-134 «Textos de pantalla de cierres en tú, con guardia» — guardia de trato (R56, R142-R145,
 * R392-R394).
 *
 * Ningún texto del módulo de cierres (`SLT-103 > Definiciones`: literales, tramos de plantilla y texto
 * JSX de los archivos del censo) lleva voseo ni «usted». Los textos salen del AST
 * (`textosDeFuente`): comentarios y especificadores de `import`/`export` no cuentan.
 *
 * No mira tildes que faltan ni el posesivo «su/sus» (PA6, PA7; R394).
 */

const RAIZ = path.resolve(__dirname, "../../..");

/** Regla 1: presente de vos, lista cerrada (con las variantes sin tilde que no son de «tú»). */
export const PRESENTE_DE_VOS = [
  "tenés", "podés", "querés", "sabés", "debés", "hacés", "ponés", "creés", "leés", "venís", "decís",
  "salís", "pedís", "seguís", "elegís", "preferís", "recibís", "escribís", "sos", "vos",
  "tenes", "podes", "queres", "decis", "venis", "elegis", "preferis", "seguis", "pedis",
] as const;

/** Regla 2: imperativos de vos en `r` (los demás `-rá/-ré/-rás/-rés` son futuros). */
export const IMPERATIVOS_EN_R = [
  "esperá", "mirá", "borrá", "cerrá", "registrá", "compará", "declará", "separá", "prepará", "generá",
  "recuperá", "considerá",
] as const;

/** Regla 3: imperativo de vos con pronombre, sin tilde. */
export const IMPERATIVOS_CON_PRONOMBRE_VOS = [
  "escribile", "escribiles", "escribime", "avisale", "avisales", "avisame", "decile", "decime", "fijate",
  "acordate", "asegurate", "gestionalos", "gestionala", "gestionalo", "contactalo", "contactala",
  "intentalo", "revisalo", "confirmalo", "hacelo", "llamalo", "mandale", "pedile", "resolve", "resolvelo",
] as const;

/** «Usted»: el pronombre. */
export const USTED = ["usted", "ustedes"] as const;

/** «Usted»: imperativos con pronombre (cuentan en cualquier posición). */
export const IMPERATIVOS_CON_PRONOMBRE_USTED = [
  "asegúrese", "comuníquese", "fíjese", "diríjase", "acérquese", "inténtelo", "revíselo", "contáctelo",
  "avísele", "escríbale", "hágalo", "pídale",
] as const;

/** «Usted»: imperativos sueltos (solo cuentan si abren frase). */
export const IMPERATIVOS_USTED = [
  "ingrese", "seleccione", "intente", "verifique", "revise", "confirme", "escriba", "contacte", "elija",
  "vuelva", "espere", "indique", "escanee", "recargue", "pulse", "haga", "solicite", "avise", "descargue",
  "registre",
] as const;

/**
 * Excepciones de la regla 2 (R143): palabra → motivo. Máximo 40; cada una nueva lleva su motivo.
 */
export const EXCEPCIONES: Readonly<Record<string, string>> = {
  está: "tercera persona de «estar» (R143)",
  aquí: "adverbio (R143)",
  allí: "adverbio (R143)",
  ahí: "adverbio (R143)",
  así: "adverbio (R143)",
  acá: "adverbio (R143)",
  allá: "adverbio (R143)",
  qué: "interrogativo (R143)",
  sí: "afirmación (R143)",
  más: "adverbio (R143)",
  jamás: "adverbio (R143)",
  además: "adverbio (R143)",
  demás: "pronombre (R143)",
  atrás: "adverbio (R143)",
  detrás: "adverbio (R143)",
  después: "adverbio (R143)",
  través: "sustantivo, «a través» (R143)",
  inglés: "sustantivo/adjetivo (R143)",
  interés: "sustantivo (R143)",
  país: "sustantivo (R143)",
  caché: "sustantivo (R143)",
  estás: "«tú» de «estar» (R143)",
  estés: "«tú» de «estar», subjuntivo (R143)",
  esté: "subjuntivo de «estar» (design: frecuente en avisos)",
};

const SET_PRESENTE = new Set<string>(PRESENTE_DE_VOS);
const SET_EN_R = new Set<string>(IMPERATIVOS_EN_R);
const SET_PRONOMBRE_VOS = new Set<string>(IMPERATIVOS_CON_PRONOMBRE_VOS);
const SET_USTED = new Set<string>(USTED);
const SET_PRONOMBRE_USTED = new Set<string>(IMPERATIVOS_CON_PRONOMBRE_USTED);
const SET_IMPERATIVO_USTED = new Set<string>(IMPERATIVOS_USTED);

export type Palabra = { palabra: string; indice: number };

/** Palabras (secuencias máximas de letras Unicode) en minúsculas, sin plegar tildes. */
export function palabras(texto: string): Palabra[] {
  return [...texto.matchAll(/\p{L}+/gu)].map((m) => ({ palabra: m[0].toLowerCase(), indice: m.index ?? 0 }));
}

const AGUDA_DE_VOS = /^\p{L}{2,}(?:[áéí]|[áéí]s)$/u;
const FUTURO = /(?:rá|ré|rás|rés)$/u;

/** Las tres reglas de voseo de `SLT-103 > Definiciones`. */
export function formaDeVoseo(palabra: string): boolean {
  if (SET_PRESENTE.has(palabra)) return true;
  if (SET_PRONOMBRE_VOS.has(palabra)) return true;
  if (Object.hasOwn(EXCEPCIONES, palabra)) return false;
  if (!AGUDA_DE_VOS.test(palabra)) return false;
  if (FUTURO.test(palabra)) return SET_EN_R.has(palabra);
  return true;
}

/** ¿Abre frase la palabra `i`? Primera del texto, o el carácter no blanco anterior es `.:!?¿¡`. */
function abreFrase(texto: string, lista: Palabra[], i: number): boolean {
  if (i === 0) return true;
  const antes = texto.slice(0, lista[i].indice).trimEnd();
  return antes === "" || /[.:!?¿¡]$/u.test(antes);
}

/** Formas de «usted». */
export function formaDeUsted(texto: string, lista: Palabra[], i: number): boolean {
  const p = lista[i].palabra;
  if (SET_USTED.has(p) || SET_PRONOMBRE_USTED.has(p)) return true;
  return SET_IMPERATIVO_USTED.has(p) && abreFrase(texto, lista, i);
}

function recortar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** `"<ruta>:<línea> <forma> «<texto recortado a 80>»"` por cada forma de voseo o de «usted». */
export function hallazgos(codigo: string, ruta: string): string[] {
  const fuente = codigo.replace(/\r\n?/g, "\n");
  return textosDeFuente(fuente, ruta).flatMap(({ linea, texto }) => {
    const lista = palabras(texto);
    return lista.flatMap((p, i) =>
      formaDeVoseo(p.palabra) || formaDeUsted(texto, lista, i)
        ? [`${ruta}:${linea} ${p.palabra} «${recortar(texto)}»`]
        : [],
    );
  });
}

function leer(ruta: string): string {
  return readFileSync(rutaAbsoluta(ruta), "utf8").replace(/\r\n?/g, "\n");
}

describe("SLT-134 · trato tú en cierres", () => {
  it("R56/R142: ningún texto del censo tiene voseo ni «usted»", () => {
    const encontrados = censoModulo().flatMap((ruta) => hallazgos(leer(ruta), ruta));
    expect(encontrados, `voseo o «usted» en el censo:\n${encontrados.join("\n")}`).toEqual([]);
  });

  it("R145: control positivo del censo (más de 60 archivos y los cuatro que vigila)", () => {
    const censo = censoModulo();
    expect(censo.length).toBeGreaterThan(60);
    expect(censo).toEqual(
      expect.arrayContaining([
        "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
        "app/(app)/cierres-admin/_components/CierresAdminModule.tsx",
        "components/shared/conciliacion/conciliacion-labels.ts",
        "lib/services/CierreDiaService.ts",
      ]),
    );
  });

  it.each([...PRESENTE_DE_VOS].map((f) => [f]))("R145: contraprueba presente de vos «%s»", (forma) => {
    expect(hallazgos(`const t = "Ya ${forma} el número.";`, "m.ts")).toEqual([
      `m.ts:1 ${forma} «Ya ${forma} el número.»`,
    ]);
  });

  it.each([...IMPERATIVOS_EN_R].map((f) => [f]))("R145: contraprueba imperativo en r «%s»", (forma) => {
    expect(hallazgos(`const t = "Ahora ${forma} el número.";`, "m.ts")).toEqual([
      `m.ts:1 ${forma} «Ahora ${forma} el número.»`,
    ]);
  });

  it.each([...IMPERATIVOS_CON_PRONOMBRE_VOS].map((f) => [f]))(
    "R145: contraprueba imperativo de vos con pronombre «%s»",
    (forma) => {
      expect(hallazgos(`const t = "Ahora ${forma} el número.";`, "m.ts")).toEqual([
        `m.ts:1 ${forma} «Ahora ${forma} el número.»`,
      ]);
    },
  );

  it.each([...USTED, ...IMPERATIVOS_CON_PRONOMBRE_USTED].map((f) => [f]))(
    "R145: contraprueba «usted» «%s»",
    (forma) => {
      expect(hallazgos(`const t = "Ahora ${forma} el número.";`, "m.ts")).toEqual([
        `m.ts:1 ${forma} «Ahora ${forma} el número.»`,
      ]);
    },
  );

  it.each([...IMPERATIVOS_USTED].map((f) => [f]))(
    "R145: contraprueba imperativo de usted que abre frase «%s»",
    (forma) => {
      const conMayuscula = forma.charAt(0).toUpperCase() + forma.slice(1);
      expect(hallazgos(`const t = "${conMayuscula} el número.";`, "m.ts")).toEqual([
        `m.ts:1 ${forma} «${conMayuscula} el número.»`,
      ]);
    },
  );

  it("R142: la terminación aguda marca formas que no están en ninguna lista", () => {
    const muestra = [
      `const a = "Buscá por folio";`,
      `const b = "Usá los filtros";`,
      `const c = "Escaneá de nuevo";`,
      `const d = "Si falla, volvé a intentarlo";`,
      `const e = "Busca por folio";`,
      `const f = "Usa los filtros";`,
    ].join("\n");
    expect(hallazgos(muestra, "m.ts")).toEqual([
      "m.ts:1 buscá «Buscá por folio»",
      "m.ts:2 usá «Usá los filtros»",
      "m.ts:3 escaneá «Escaneá de nuevo»",
      "m.ts:4 volvé «Si falla, volvé a intentarlo»",
    ]);
  });

  it("R142: el hallazgo nombra ruta, línea y forma", () => {
    const muestra = ["export const X = {", "  a: 1,", '  b: "Ahora intentá de nuevo.",', "};"].join("\n");
    expect(hallazgos(muestra, "muestra.tsx")).toEqual(["muestra.tsx:3 intentá «Ahora intentá de nuevo.»"]);
  });

  it("R142: en un comentario o en un especificador de import no cuenta", () => {
    const muestra = [
      'import x from "./tenés";',
      'export { y } from "./podés";',
      'import type { Z } from "./indicá";',
      "// Ahora intentá de nuevo.",
      "/* Escribile por el chat. */",
      'const carga = () => import("./podés");',
      'type T = import("./resolvé").T;',
      "export const n = <p>{/* tenés */}Hola</p>;",
    ].join("\n");
    expect(hallazgos(muestra, "muestra.tsx")).toEqual([]);
  });

  it("R143: no marca formas de «tú», futuros, subjuntivos en mitad de frase ni las 21 palabras", () => {
    const muestra = [
      `const a = "Puedes, tienes, estás, estés, enviarás, deberás, inténtalo, escríbele, gestiónalos.";`,
      `const b = "Revisa, indica, elige y vuelve.";`,
      `const c = "Será, podrá, verá, quedará, enviará.";`,
      `const d = "Lo verá quien revise el comprobante y lo apruebe, o vuelva a enviarlo.";`,
      `const e = "está aquí allí ahí así acá allá qué sí más jamás además demás atrás detrás después través inglés interés país caché";`,
    ].join("\n");
    expect(hallazgos(muestra, "m.ts")).toEqual([]);
  });

  it("R143: cada excepción lleva motivo y no pasan de 40", () => {
    for (const [palabra, motivo] of Object.entries(EXCEPCIONES)) {
      expect(motivo.trim(), `motivo de «${palabra}»`).not.toBe("");
    }
    expect(Object.keys(EXCEPCIONES).length).toBeLessThanOrEqual(40);
  });

  it("R394: ni la tilde que falta ni los posesivos marcan", () => {
    const muestra = [
      `const a = "Esta gestion ya esta en el catalogo";`,
      `const b = "su comprobante y sus fotos";`,
    ].join("\n");
    expect(hallazgos(muestra, "m.ts")).toEqual([]);
  });

  it("R393: la guardia corre en el gate rápido (su ruta casa con gate.siempre)", () => {
    const config = JSON.parse(readFileSync(path.join(RAIZ, "arnes.config.json"), "utf8")) as {
      gate?: { siempre?: string[] };
    };
    const yo = path.relative(RAIZ, __filename).split(path.sep).join("/");
    const patrones = config.gate?.siempre ?? [];
    expect(patrones.some((p) => yo.includes(p)), `${yo} no casa con ${JSON.stringify(patrones)}`).toBe(true);
  });
});

/**
 * Anexo A (`specs/SLT-103-dialogos-trato-tu/requirements.md`), filas A1-K4, escritas a mano: nunca
 * importadas de la constante que las produce. Cada fila lleva su archivo de hoy, los tramos fijos del
 * texto (más de uno si es una plantilla con interpolación) y las veces que aparece en ese archivo.
 */
type FilaAnexo = { fila: string; archivo: string; tramos: readonly string[]; veces: number };

const ADMIN = "app/(app)/cierres-admin/_components/CierresAdminModule.tsx";
const FISICA = "app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx";
const CONSOLIDACION = "app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx";
const BODEGA_ADMIN = "app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx";
const DESCARGA = "app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx";
const PAGO = "app/(app)/cierres-admin/_components/pago-mensajero-labels.ts";
const ERROR = "app/(app)/cierres-admin/error.tsx";
const CIERRE_LABELS = "app/(app)/cierres-admin/_components/cierre-labels.ts";
const COLA_PROPIA_VISTA = "components/private/cierres/cola/cola-propia-vista.ts";
const CIERRE_DIA = "app/(app)/cierre-dia/_components/CierreDiaModule.tsx";
const FILA_LABELS = "components/private/cierres/fila/fila-gestion-labels.ts";
const CONCILIACION = "components/shared/conciliacion/conciliacion-labels.ts";

const SESION = "Tu sesión expiró. Inicia sesión de nuevo.";
const SIN_ZONA = "No tienes una zona asignada; contacta a tu administrador.";

const ANEXO_A: readonly FilaAnexo[] = [
  {
    fila: "A1",
    archivo: ADMIN,
    tramos: [
      "Este cierre trae paquetes dañados, perdidos o robados. Indica cuánto se indemniza por cada uno: al aprobar, la suma sale de la caja principal como un solo egreso.",
    ],
    veces: 1,
  },
  {
    fila: "A2",
    archivo: ADMIN,
    tramos: ["El monto no puede superar ", " (10 dígitos y 2 decimales). Revisa si sobra un dígito."],
    veces: 1,
  },
  {
    fila: "A3",
    archivo: ADMIN,
    tramos: [
      "Escribe un monto mayor que 0, con punto decimal y sin separador de miles (por ejemplo 12500.00).",
    ],
    veces: 1,
  },
  { fila: "A4", archivo: ADMIN, tramos: [SIN_ZONA], veces: 1 },
  { fila: "A4", archivo: CONSOLIDACION, tramos: [SIN_ZONA], veces: 1 },
  { fila: "A5", archivo: ADMIN, tramos: ["No se pudo abrir el detalle del cierre. Inténtalo de nuevo."], veces: 2 },
  { fila: "A6", archivo: ADMIN, tramos: [SESION], veces: 3 },
  // 2: la fila A6 (l.394) y la l.358, que ya estaba en «tú» antes de SLT-134.
  { fila: "A6", archivo: CONSOLIDACION, tramos: [SESION], veces: 2 },
  { fila: "A6", archivo: BODEGA_ADMIN, tramos: [SESION], veces: 1 },
  { fila: "A6", archivo: CONCILIACION, tramos: [SESION], veces: 1 },
  { fila: "A7", archivo: ADMIN, tramos: ["No tienes permiso para resolver este cierre."], veces: 1 },
  { fila: "A8", archivo: ADMIN, tramos: ["No se pudo resolver el cierre. Inténtalo de nuevo."], veces: 1 },
  { fila: "A9", archivo: ADMIN, tramos: ["No tienes permiso para destrabar este cierre."], veces: 1 },
  { fila: "A10", archivo: ADMIN, tramos: ["No se pudo destrabar el cierre. Inténtalo de nuevo."], veces: 1 },
  {
    fila: "A11",
    archivo: ADMIN,
    tramos: ["Indica el motivo del rechazo. El mensajero lo verá para corregir."],
    veces: 1,
  },
  {
    fila: "B1",
    archivo: FISICA,
    tramos: [
      "Antes de aprobar, ten delante cada paquete que vuelve a bodega y confirma su guía: escanea el código o escribe el número.",
    ],
    veces: 1,
  },
  { fila: "B2", archivo: FISICA, tramos: ["Escanea el código de la guía o escribe su número"], veces: 1 },
  {
    fila: "B3",
    archivo: FISICA,
    tramos: ["Sin número de guía: no se puede confirmar. Avisa a un administrador."],
    veces: 1,
  },
  {
    fila: "B4",
    archivo: FISICA,
    tramos: ["No se pudo leer un número de guía en ese código. Escanea de nuevo o escribe el número."],
    veces: 1,
  },
  {
    fila: "B5",
    archivo: FISICA,
    tramos: ["Falta 1 paquete por confirmar. Si no llegó, rechaza el cierre indicando cuál falta."],
    veces: 1,
  },
  {
    fila: "B6",
    archivo: FISICA,
    tramos: [
      "Faltan ",
      " paquetes por confirmar. Si alguno no llegó, rechaza el cierre indicando cuáles faltan.",
    ],
    veces: 1,
  },
  {
    fila: "C1",
    archivo: CONSOLIDACION,
    tramos: ["No tienes permiso para solicitar el cierre de bodega."],
    veces: 1,
  },
  {
    fila: "C2",
    archivo: CONSOLIDACION,
    tramos: ["No se pudo solicitar el cierre de bodega. Inténtalo de nuevo."],
    veces: 1,
  },
  {
    fila: "D1",
    archivo: BODEGA_ADMIN,
    tramos: ["No tienes permiso para ver este cierre de bodega."],
    veces: 1,
  },
  {
    fila: "D2",
    archivo: BODEGA_ADMIN,
    tramos: ["No se pudo abrir el detalle del cierre de bodega. Inténtalo de nuevo."],
    veces: 1,
  },
  {
    fila: "E1",
    archivo: DESCARGA,
    tramos: [
      "Recorta por la fecha de solicitud del cierre. Vacías no recortan nada: se lleva todo el historial de los mensajeros elegidos. Vacía una fecha para quitar ese extremo, o «Limpiar» para quitar las dos.",
    ],
    veces: 1,
  },
  {
    fila: "E2",
    archivo: DESCARGA,
    tramos: ["Elige al menos un mensajero para descargar sus gestiones. Sin mensajeros no hay archivo."],
    veces: 1,
  },
  {
    fila: "E3",
    archivo: DESCARGA,
    tramos: [
      "No hay gestiones de cierre en el rango de fechas elegido para esos mensajeros. Amplía el rango o vacía las fechas y vuelve a intentarlo.",
    ],
    veces: 1,
  },
  {
    fila: "E4",
    archivo: DESCARGA,
    tramos: ["Los mensajeros elegidos no tienen gestiones de cierre. Elige otros mensajeros y vuelve a intentarlo."],
    veces: 1,
  },
  {
    fila: "F1",
    archivo: PAGO,
    tramos: [
      "El cierre quedó aprobado. El pago no se registró: puedes registrarlo después desde el detalle del cierre.",
    ],
    veces: 1,
  },
  {
    fila: "F2",
    archivo: PAGO,
    tramos: ["No se registró el pago. Revisa el aviso del formulario e inténtalo de nuevo."],
    veces: 1,
  },
  { fila: "G1", archivo: ERROR, tramos: ["Antes de repetir una aprobación, mira cómo quedó"], veces: 1 },
  {
    fila: "G2",
    archivo: ERROR,
    tramos: [
      "El fallo ocurrió al mostrar la pantalla, y eso también puede pasar justo después de guardar. Vuelve a cargar los cierres y revisa el estado del que estabas resolviendo antes de aprobarlo o rechazarlo otra vez.",
    ],
    veces: 1,
  },
  {
    fila: "H1",
    archivo: CIERRE_LABELS,
    tramos: [
      "Esta gestión la registró la tienda desde «Ayuda solicitada», no tú: el motivo y la foto son suyos. Cuenta en tu cierre igual.",
    ],
    veces: 1,
  },
  // SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R456): el campo de la barra
  // dejó de decir «Usa los filtros para acotar los cierres» y busca por folio con el placeholder de
  // `/cierre-dia`, que vive en `cola-propia-vista.ts` y la barra importa.
  { fila: "I1", archivo: COLA_PROPIA_VISTA, tramos: ["Busca por folio"], veces: 1 },
  { fila: "J1", archivo: CIERRE_DIA, tramos: ["No puedes deshacer esta gestión."], veces: 1 },
  { fila: "J2", archivo: CIERRE_DIA, tramos: ["No se pudo deshacer la gestión. Inténtalo de nuevo."], veces: 1 },
  {
    fila: "J3",
    archivo: FILA_LABELS,
    tramos: [
      "Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escríbele por el chat de la orden.",
    ],
    veces: 1,
  },
  { fila: "J4", archivo: CIERRE_DIA, tramos: ["No tienes permiso para solicitar el cierre."], veces: 1 },
  { fila: "J5", archivo: CIERRE_DIA, tramos: ["No se pudo solicitar el cierre. Inténtalo de nuevo."], veces: 1 },
  {
    fila: "K1",
    archivo: CONCILIACION,
    tramos: ["Escribe un monto válido, mayor que cero y con dos decimales como máximo."],
    veces: 1,
  },
  {
    fila: "K2",
    archivo: CONCILIACION,
    tramos: ["Escribe un monto válido, de cero o más y con dos decimales como máximo."],
    veces: 1,
  },
  {
    fila: "K3",
    archivo: CONCILIACION,
    tramos: ["No tienes permiso para conciliar consolidaciones de bodega."],
    veces: 1,
  },
  {
    fila: "K4",
    archivo: CONCILIACION,
    tramos: ["No se pudo completar la operación. Inténtalo de nuevo."],
    veces: 1,
  },
];

function colapsar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Veces que los tramos aparecen, en orden, en textos consecutivos del archivo. */
function apariciones(ruta: string, tramos: readonly string[]): number {
  const textos = textosDeFuente(leer(ruta), ruta).map((t) => colapsar(t.texto));
  const buscados = tramos.map(colapsar);
  let n = 0;
  for (let i = 0; i + buscados.length <= textos.length; i++) {
    if (buscados.every((b, k) => textos[i + k] === b)) n++;
  }
  return n;
}

describe("SLT-134 · Anexo A (R144)", () => {
  it("cubre las 40 filas A1-K4", () => {
    expect(new Set(ANEXO_A.map((f) => f.fila)).size).toBe(40);
  });

  it.each(ANEXO_A.map((f) => [f.fila, f.archivo, f] as const))("%s en %s", (_fila, archivo, f) => {
    expect(apariciones(archivo, f.tramos)).toBe(f.veces);
  });
});
