import { beforeAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";
import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";
import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { EXCEPCIONES_DOMINIO, lineasConDominio } from "./_dominio-heredado";
import { EMPRESA } from "@/lib/config/marca";
import { openApiSpec } from "@/lib/api/openapi-spec";
import { GET as paginaApiDocs } from "@/app/api-docs/route";
import { partirFrontmatter } from "@/lib/ayuda/frontmatter";
import { ARCHIVO_EXCLUIDO } from "@/lib/ayuda/catalogo";

// SL-16 (R1-R5, R7-R16, R18, R19, R22) — docs, contrato de la API y diseños sin el nombre heredado.
//
// Diseño: `specs/SL-16-*/design.md > La guardia`. Recorre una lista CERRADA de
// raíces (`ALCANCE`), no todo el árbol: el resto lo vigila `sin-nombre-heredado` (SL-15), que deja
// fuera `docs/` justamente porque es de esta ficha.
//
// - La palabra y el prefijo salen de `tests/fixtures/nombre-heredado.ts`: este archivo no puede ser
//   él mismo una aparición, y SL-15 lo recorre. Las rutas que la llevan se escriben con `${P}`.
// - Aquí se busca SIN distinguir mayúsculas (R8: «en cualquier capitalización»). En el alcance no hay
//   identificadores de este dominio que la contengan por casualidad, del tipo «orden» + «Existente»
//   (medido en T1); si un día los hay, se tapan con una excepción, no se relaja el patrón.
// - Toda excepción es temporal y nombra la ficha que la retira (R9); una que ya no cubre nada pone
//   la guardia en rojo (R12). Tras SL-14 y SL-15 solo queda la clase «historia»; las otras tres
//   viven en el tipo y se ejercen en las contrapruebas, para que no vuelvan sin su fuente (R10, R11).

const P = NOMBRE_HEREDADO.minusculas;
const PREFIJO_LLAVE = NOMBRE_HEREDADO.prefijoLlave;
const PATRON = new RegExp(`${P}|${PREFIJO_LLAVE}`, "gi");
const PATRON_RUTA = new RegExp(P, "i");

// ─── Alcance (design.md > Alcance de la guardia) ────────────────────────────────────────────────

const CARPETAS = ["docs/api", "docs/ayuda", "design-notificaciones", "design-whatsapp"] as const;
const ARCHIVOS = [
  "DESIGN.md",
  "lib/api/openapi-spec.ts",
  "app/api-docs/route.ts",
  "tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts",
  `docs/limpieza-${P}.md`,
  "docs/plan-saas.md",
  "docs/marca.md",
] as const;
/** Cada `tests/unit/api/openapi-*.test.ts` entra en el alcance (decisión P3). */
const TESTS_OPENAPI = { carpeta: "tests/unit/api", patron: /^openapi-.*\.test\.ts$/ } as const;

/**
 * R14: suelo de archivos recorridos. Medido en T1 (2026-10-22): 85; T7 borra
 * `design-notificaciones/notificaciones-${P}.html` (R3), así que se firma 84. Si una ficha retira
 * archivos del alcance, lo baja a mano en el mismo cambio y con el motivo.
 */
const MINIMO_ARCHIVOS = 84;

// ─── Excepciones (R9) ───────────────────────────────────────────────────────────────────────────

export type Clase = "dominio" | "identificador" | "cita" | "historia";
const CLASES: readonly Clase[] = ["dominio", "identificador", "cita", "historia"];

/**
 * `texto` para dominio, identificador y cita; `archivo` para historia (cubre el archivo entero y su
 * ruta). `fuente`: el archivo de código donde un identificador tiene que existir literalmente (R10).
 */
export interface Excepcion {
  clase: Clase;
  texto?: string;
  archivo?: string;
  fuente?: string;
  retira: `SL-${number}`;
}

/**
 * Solo historia: SL-14 y SL-15 ya están integradas (spec corregido el 2026-10-22). `docs/marca.md`
 * no lleva excepción aunque el design la preveía: SL-8 ya lo dejó sin la palabra y la excepción
 * sobraría desde el primer día (R12; hallazgo de T1). Se sigue recorriendo y tiene que quedar limpio.
 */
export const EXCEPCIONES: readonly Excepcion[] = [
  { clase: "historia", archivo: `docs/limpieza-${P}.md`, retira: "SL-27" },
  { clase: "historia", archivo: "docs/plan-saas.md", retira: "SL-27" },
];

/** El término de transición de SL-15 para la empresa usuaria, escrito a mano (R7, decisión Q2). */
const TERMINO_EMPRESA = "la empresa";
/** Su forma al inicio de frase o de rótulo. */
const TERMINO_EMPRESA_INICIO = "La empresa";
const PLATAFORMA = "Servi Logistic";

// ─── Detector ───────────────────────────────────────────────────────────────────────────────────

export interface Hallazgo {
  archivo: string;
  linea: number;
  contexto: string;
}

const plano = (s: string) => s.replace(/\s+/g, " ").trim();
const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** La cita como regex en la que cada espacio vale `\s+`: el Markdown parte las líneas. */
const regexDeCita = (texto: string) => new RegExp(plano(texto).split(" ").map(escaparRegex).join("\\s+"), "g");
const enAyuda = (archivo: string) => archivo.startsWith("docs/ayuda/");
/** Relleno de la misma longitud que conserva los saltos de línea: así no se mueven las líneas. */
const relleno = (s: string) => s.replace(/[^\n]/g, " ");

function cubreArchivoEntero(e: Excepcion, archivo: string): boolean {
  return e.clase === "historia" && e.archivo === archivo;
}

/** El texto con lo exceptuado tapado, o `null` si una excepción de historia cubre el archivo. */
export function tapar(texto: string, archivo: string, excepciones: readonly Excepcion[]): string | null {
  if (excepciones.some((e) => cubreArchivoEntero(e, archivo))) return null;
  let salida = texto;
  for (const e of excepciones) {
    if (e.texto === undefined) continue;
    if (e.clase === "dominio" || e.clase === "identificador") salida = salida.split(e.texto).join(relleno(e.texto));
    if (e.clase === "cita" && enAyuda(archivo)) salida = salida.replace(regexDeCita(e.texto), relleno);
  }
  return salida;
}

/** Cada aparición de la palabra o del prefijo que ninguna excepción tapa (R8, R13). */
export function apariciones(
  texto: string,
  archivo: string,
  excepciones: readonly Excepcion[] = EXCEPCIONES,
): Hallazgo[] {
  const visible = tapar(texto, archivo, excepciones);
  if (visible === null) return [];
  const salida: Hallazgo[] = [];
  for (const m of visible.matchAll(PATRON)) {
    const i = m.index;
    const linea = visible.slice(0, i).split("\n").length;
    const contexto = plano(texto.slice(Math.max(0, i - 40), i + m[0].length + 40));
    salida.push({ archivo, linea, contexto });
  }
  return salida;
}

/** Rutas recorridas que llevan la palabra y no están cubiertas por una excepción de historia (R5). */
export function rutasConPalabra(rutas: readonly string[], excepciones: readonly Excepcion[] = EXCEPCIONES): string[] {
  return rutas.filter((r) => PATRON_RUTA.test(r) && !excepciones.some((e) => cubreArchivoEntero(e, r)));
}

const describir = (e: Excepcion) =>
  `«${e.archivo ?? e.texto ?? "?"}» (${String(e.clase)}, retira ${String(e.retira)})`;

/** R9: clase conocida, ficha `SL-<n>` y el campo que su clase necesita. */
export function excepcionesMalFormadas(excepciones: readonly Excepcion[]): string[] {
  const fallos: string[] = [];
  for (const e of excepciones) {
    if (!CLASES.includes(e.clase)) fallos.push(`${describir(e)}: clase desconocida`);
    if (typeof e.retira !== "string" || !/^SL-\d+$/.test(e.retira)) fallos.push(`${describir(e)}: sin ficha que la retire`);
    if (e.clase === "historia" && !e.archivo) fallos.push(`${describir(e)}: una de historia nombra su archivo`);
    if (e.clase !== "historia" && !e.texto) fallos.push(`${describir(e)}: necesita el texto que tapa`);
    if (e.clase === "identificador" && !e.fuente) fallos.push(`${describir(e)}: un identificador nombra su fuente`);
  }
  return fallos;
}

/** R12: excepciones que ya no cubren nada en `archivos` (ruta → contenido). */
export function excepcionesSinUso(
  excepciones: readonly Excepcion[],
  archivos: ReadonlyMap<string, string>,
): string[] {
  const usada = (e: Excepcion): boolean => {
    if (e.clase === "historia") {
      const texto = e.archivo === undefined ? undefined : archivos.get(e.archivo);
      return texto !== undefined && (PATRON_RUTA.test(texto) || PATRON_RUTA.test(e.archivo ?? ""));
    }
    const t = e.texto ?? "";
    return [...archivos].some(([archivo, texto]) =>
      e.clase === "cita" ? enAyuda(archivo) && regexDeCita(t).test(texto) : texto.includes(t),
    );
  };
  return excepciones.filter((e) => !usada(e)).map((e) => `la excepción ${describir(e)} ya no aparece en el alcance: bórrala`);
}

/** Archivos que contienen `texto` (con los espacios colapsados si `comoCita`). */
const quienesCitan = (texto: string, archivos: ReadonlyMap<string, string>, comoCita: boolean) =>
  [...archivos]
    .filter(([archivo, contenido]) => (comoCita ? enAyuda(archivo) && regexDeCita(texto).test(contenido) : contenido.includes(texto)))
    .map(([archivo]) => archivo)
    .sort();

/** R10: identificadores exceptuados que ya no existen literalmente en su fuente. */
export function identificadoresSinFuente(
  excepciones: readonly Excepcion[],
  leerFuente: (ruta: string) => string | null,
  archivos: ReadonlyMap<string, string>,
): string[] {
  return excepciones
    .filter((e) => e.clase === "identificador")
    .filter((e) => !(leerFuente(e.fuente ?? "") ?? "").includes(e.texto ?? ""))
    .map(
      (e) =>
        `el identificador «${e.texto}» ya no existe en ${e.fuente}: los docs deben citar el nombre nuevo. ` +
        `Lo citan: ${quienesCitan(e.texto ?? "", archivos, false).join(", ") || "(nadie)"}`,
    );
}

/** R11: citas exceptuadas cuyo fragmento ya no existe en el código (sin comentarios, espacios colapsados). */
export function citasSinCodigo(
  excepciones: readonly Excepcion[],
  codigo: string,
  archivos: ReadonlyMap<string, string>,
): string[] {
  return excepciones
    .filter((e) => e.clase === "cita")
    .filter((e) => !codigo.includes(plano(e.texto ?? "")))
    .map(
      (e) =>
        `la cita «${e.texto}» ya no existe en app/, components/ ni lib/: la ayuda debe citar el rótulo nuevo. ` +
        `La citan: ${quienesCitan(e.texto ?? "", archivos, true).join(", ") || "(nadie)"}`,
    );
}

// ─── Lectura ────────────────────────────────────────────────────────────────────────────────────

const abs = (rel: string) => path.join(RAIZ_DEL_REPO, rel);

function listar(rel: string): string[] {
  return fs.readdirSync(abs(rel), { withFileTypes: true }).flatMap((e) => {
    const r = `${rel}/${e.name}`;
    return e.isDirectory() ? listar(r) : [r];
  });
}

/** Raíces del alcance que no existen (R14). */
function raicesQueFaltan(): string[] {
  return [...CARPETAS, ...ARCHIVOS, TESTS_OPENAPI.carpeta].filter((r) => !fs.existsSync(abs(r)));
}

function rutasDelAlcance(): string[] {
  const tests = fs
    .readdirSync(abs(TESTS_OPENAPI.carpeta))
    .filter((f) => TESTS_OPENAPI.patron.test(f))
    .map((f) => `${TESTS_OPENAPI.carpeta}/${f}`);
  return [...CARPETAS.filter((c) => fs.existsSync(abs(c))).flatMap(listar), ...ARCHIVOS.filter((a) => fs.existsSync(abs(a))), ...tests].sort();
}

/** Contenido de texto, o `""` si es binario (un `\0` en los primeros 8 KB, como `git grep -I`). */
function textoDe(rel: string): string {
  const buf = fs.readFileSync(abs(rel));
  return buf.subarray(0, 8192).includes(0) ? "" : buf.toString("utf8");
}

let cache: { rutas: string[]; archivos: Map<string, string> } | null = null;
function alcance() {
  if (cache) return cache;
  const rutas = rutasDelAlcance();
  cache = { rutas, archivos: new Map(rutas.map((r) => [r, textoDe(r)])) };
  return cache;
}

let codigo: string | null = null;
/** `app/`, `components/` y `lib/` (`.ts`/`.tsx`) sin comentarios y con los espacios colapsados (R11). */
function codigoDeLaApp(): string {
  if (codigo !== null) return codigo;
  codigo = ["app", "components", "lib"]
    .flatMap(listar)
    .filter((r) => /\.tsx?$/.test(r))
    .map((r) => plano(quitarComentarios(fs.readFileSync(abs(r), "utf8"))))
    .join("\n");
  return codigo;
}

const leerFuente = (rel: string) => (rel && fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf8") : null);

/** Todos los strings de un objeto, en profundidad: las descripciones de `openApiSpec` (R16). */
function stringsDe(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(stringsDe);
  if (valor !== null && typeof valor === "object") return Object.values(valor).flatMap(stringsDe);
  return [];
}

// ─── Frases de operador (R7; forma final medida en T1, `progress/impl_SL-16.md`) ────────────────

interface FraseOperador {
  archivo: string;
  frase: string;
}
const enArchivo = (archivo: string, frases: readonly string[]): FraseOperador[] =>
  frases.map((frase) => ({ archivo, frase }));

/**
 * Una por línea de operador (la primera aparición de cada línea), a mano. El archivo la contiene
 * con los espacios colapsados, así que una frase partida en dos líneas de Markdown también vale.
 */
const FRASES_OPERADOR: readonly FraseOperador[] = [
  ...enArchivo("design-whatsapp/PdfPicking.dc.html", [
    "600;\">La empresa</span>",
    "<span>La empresa · Picking Abarrotes",
  ]),
  ...enArchivo("design-whatsapp/PdfTransito1.dc.html", [
    "600;\">La empresa</span>",
    "<span>La empresa · Informe de tránsito",
  ]),
  ...enArchivo("design-whatsapp/PdfTransito2.dc.html", [
    "<span>La empresa · Informe de tránsito",
  ]),
  ...enArchivo("docs/api/api-key-openapi.yaml", [
    "Los CINCO conceptos que la empresa factura por una orden, en el escenario de",
  ]),
  ...enArchivo("docs/api/guia-integracion/guia-integracion.html", [
    "dato de referencia de la empresa",
    "las emite la empresa",
    "Requiere una API key emitida por la empresa",
    "La emite la empresa, no el integrador",
    "El comercio la solicita a la empresa y la empresa la entrega por un canal seguro",
    "solicita a la empresa",
    "la empresa tampoco puede volver a mostrarla",
    "La empresa puede desactivar la key",
    "requiere hablar con la empresa",
    "el paquete ya está en la bodega de la empresa",
    "la zona no tiene cobertura de la empresa. En ambos casos el mensaje es el mismo",
    "corrija la dirección o pida a la empresa reactivarlo",
    "(avise a la empresa)",
    "se puede desactivar, solicitándolo a la empresa. Sin suscripción activa, los",
    "consultar con la empresa",
    "ids contra la lista de §5.8. En cualquier otro endpoint, contacte a la empresa",
    "los casos. Si es de tarifa, es un tema comercial con la empresa, no de código",
  ]),
  ...enArchivo("docs/ayuda/compartido/analitica.md", [
    "qué cobró la empresa, cómo se compone la ganancia y la conciliación de los",
  ]),
  ...enArchivo("docs/ayuda/oficina/cierres.md", [
    "lo recaudado de sus entregas, el efectivo entra a la caja de la empresa y cada",
  ]),
  ...enArchivo("docs/ayuda/oficina/configuracion-plantillas.md", [
    "Es la voz de la empresa ante el cliente, no una nota interna",
  ]),
  ...enArchivo("docs/ayuda/oficina/configuracion-tarifas.md", [
    "El porcentaje que la empresa cobra por recaudar la plata del",
  ]),
  ...enArchivo("docs/ayuda/oficina/wallet-caja.md", [
    "La caja de la empresa",
    "ganancia de la empresa**, el **saldo inicial y aportes**",
    // SL-39 (R7 de esa ficha): la frase decía «fletes, comisiones, IVA, …» como partes de la
    // ganancia, y desde SL-39 el IVA no es ganancia (va en su propio bloque). La forma final es
    // la de abajo; la frase de operador («lo que la empresa les cobra») sigue siendo la misma.
    "fletes, comisiones, lo que la empresa les cobra a las tiendas",
    "El concepto, dicho desde la empresa",
    "**La empresa** en un aporte",
    "siempre desde la empresa, y diciendo quién le paga a quién",
    "concepto del libro se lee desde la empresa y dice quién le paga a quién. Los",
    "La empresa le cobra a una tienda",
    "La empresa le paga a una tienda",
    "La empresa paga un gasto de una tienda",
    "La empresa le paga a un mensajero",
    "Gasto de la empresa",
    "El saldo inicial o un aporte de la empresa, y su anulación",
    "Una tienda le paga a la empresa",
    "El flete que la empresa le cobra a una tienda cuando su cliente rechaza el",
    "Indemnización que la empresa paga por un incidente",
    "Pago de la empresa a una tienda",
    "Cobro de la empresa a una tienda",
    "la empresa: solo cuenta lo que se registró",
    "los pagos se hicieron con dinero que la empresa ya tenía",
    "### Lo que la empresa les debe a las tiendas",
    "lo que la empresa les cobró",
    "que le deben a la empresa",
    "**De la empresa**",
    "al dinero de la empresa, al saldo de la cuenta",
    "Sale dinero de la empresa",
    "tienda, a un mensajero, de una tienda a la empresa, y el pago de un gasto de una",
    "lo que la empresa les debe a las tiendas",
    "lo que la empresa le debe** a esa tienda",
    "pendientes y baja lo que la empresa le debe",
    "ganancia de la empresa",
    "## La empresa le cobra a una tienda",
    "Cuando la empresa le cobra algo a una tienda",
    "Lo que la empresa les debe a las tiendas",
    "le debe ese dinero a la empresa, y",
    "La empresa le cobra a la tienda",
    "tienda le debe ese dinero a la empresa",
    "## Una tienda le paga a la empresa",
    "los cargos y los cobros de la empresa superaron lo que se le",
    "y le paga a la empresa lo que debe, se registra con",
    "ganancia de la empresa no cambia",
    "sigue en contra, que la tienda todavía le debe ese dinero a la empresa",
    "Pago de una tienda a la empresa",
    "La tienda le paga a la empresa",
    "pagaste a la empresa",
    "Registrar pago de la tienda a la empresa**: es el mismo formulario",
    "## La empresa paga un gasto de una tienda, o la empresa le cobra a una tienda",
    "¿salió dinero de la empresa hacia otra persona?",
    "La empresa **le pagó a un tercero en nombre de la tienda**",
    "pasa del saldo de la tienda a la ganancia de la empresa",
    "La ganancia de la empresa",
    "La empresa paga un gasto de la tienda",
    "**Un ejemplo.** La empresa le paga",
    "con dinero de la empresa.",
    "que la empresa no ganó",
    "ese dinero **es de la empresa**",
    "tienda le debe ese dinero a la empresa. Al registrarlo, el aviso te dice en",
    "dinero de la empresa que entra a la caja y no es ganancia",
    "el dinero que la empresa tenía al empezar a usar la app",
    "dinero de la empresa que entra después",
    "la cifra grande, la ganancia, lo que la empresa les debe a las tiendas y el",
    "un **gasto de la empresa**, un **gasto fijo cobrado**",
    "cobro de la empresa a una tienda",
    "pago de la empresa a una tienda",
    "- Al anular un cobro de la empresa a una tienda, la",
    "Cobro de la empresa a la tienda anulado",
    "- Al anular un pago de una tienda a la empresa",
    "la empresa les debe a las tiendas",
    "Pago de una tienda a la empresa anulado",
    "de la tienda a la empresa anulado",
    "**lo que la empresa les debe a las tiendas** y el saldo de la tienda",
    "comprobante. El pago de una tienda a la empresa sí puede llevarlo",
    "la empresa no tienen ese límite",
    "**La empresa paga un gasto de una tienda** con el origen",
    "tienda, un pago de una tienda a la empresa, una corrección, un cobro por",
  ]),
  ...enArchivo("docs/ayuda/oficina/wallet-mensajeros.md", [
    "«La empresa le debe",
    "lo que la empresa le debe por sus cierres aprobados y",
    "La empresa le paga al mensajero",
  ]),
  ...enArchivo("docs/ayuda/oficina/wallet-satelites.md", [
    "a la caja de la empresa cuando se",
    "No es la caja de la empresa",
  ]),
  ...enArchivo("docs/ayuda/oficina/wallet-tiendas.md", [
    "desde la empresa** («La empresa le cobra a la tienda»)",
    "Es el extracto de la tienda con la empresa, como el de un banco",
    "«La empresa le debe",
    "«Pago de la empresa a una tienda · 2026-09-14",
    "La tienda le paga a la empresa",
    "le hizo a la empresa",
    "La empresa le cobra a la tienda",
    "La empresa le paga a la tienda",
    "La empresa no le debe nada a…",
    "Pagos de la empresa a la tienda",
    "El servicio de la empresa, al aprobarse un cierre",
    "Cobro de la empresa a la tienda anulado",
    "La empresa paga un gasto de la tienda",
    "Pago de la tienda a la empresa anulado",
    "entonces la tienda le debe ese dinero a la empresa",
    "No es la caja de la empresa",
  ]),
  ...enArchivo("docs/ayuda/tienda/mi-wallet.md", [
    "tu plata con la empresa",
    "entregas, cuánto te cobró la empresa de servicio, lo que te pagó, y cómo queda",
    "a tu favor, lo que le pagaste a la empresa y lo que la empresa te devolvió al",
    "Cargos de la empresa",
    "Lo que la empresa te pagó o pagó por ti",
    "extracto. Así distinguís lo que la empresa",
    "Un pago que la empresa te hizo y después anuló",
    "| **La empresa te debe",
    "a la empresa** | Tu saldo está en contra",
    "La empresa y vos no se deben nada",
    "dice qué hizo la empresa contigo",
    "La empresa anuló un pago hecho por ti",
    "La empresa anuló un cobro y te lo devolvió",
    "Le pagaste a la empresa",
    "La empresa te cobró el flete",
    "el servicio de la empresa",
    "**La empresa te cobró** — un cobro que la oficina te hace a mano",
    "**La empresa te pagó** — lo que la empresa ya te pagó de tu saldo",
    "La empresa pagó un gasto por ti",
    "La empresa anuló el pago que le hiciste",
    "**Anulado por la empresa**, el día y la hora",
    "## Un cobro que la empresa te hizo",
    "le debés ese dinero a la empresa, y se cobra",
    "## Un pago que la empresa hizo por ti",
    "A veces la empresa paga algo",
    "es dinero que la empresa ya puso por vos, en el tipo de movimiento",
    "le debés ese dinero a la empresa",
    "## Un pago que le hiciste a la empresa",
    "Si tu saldo quedó en contra y le pagaste a la empresa, lo ves como",
    "pagos que la empresa te hizo, en los pagos que la empresa hizo por ti, en los",
    "que le hiciste a la empresa. Se abre en otra pestaña con un enlace que dura",
  ]),
];

// ─── Frases de plataforma (R6; forma final medida en T1, `progress/impl_SL-16.md`) ──────────────

/**
 * Las formas en que el texto nombra a la plataforma. «SERVI LOGISTIC» es el rótulo en mayúsculas
 * del push; `servi-logistic` es la ruta de la colección de Postman; `Servi-Logistic` va en las
 * cabeceras de firma (`X-Servi-Logistic-…`) y en el nombre de archivo del PDF de la guía. «la plataforma»
 * es la forma que T3 dejó en el comentario de webhooks del YAML (l. 719): nombra al sistema, no a la empresa.
 */
const MARCAS_PLATAFORMA = ["Servi Logistic", "SERVI LOGISTIC", "servi-logistic", "Servi-Logistic", "la plataforma"] as const;

interface FrasePlataforma {
  archivo: string;
  frase: string;
  /** Apariciones mínimas en el archivo, para las líneas que repiten la misma forma (por defecto, 1). */
  veces?: number;
}
const enArchivoPlataforma = (archivo: string, frases: readonly (string | [string, number])[]): FrasePlataforma[] =>
  frases.map((f) => (typeof f === "string" ? { archivo, frase: f } : { archivo, frase: f[0], veces: f[1] }));

/**
 * Una por línea de plataforma de T1, a mano, incluidas las dudosas resueltas como plataforma. Quedan
 * fuera los títulos que ya vigilan R2 (colección), R15 (título del contrato), R18 (README de la
 * ayuda) y R19 (DESIGN.md). Es el espejo de `FRASES_OPERADOR`: allí se vigila que la empresa no se
 * vuelva plataforma; aquí, que la plataforma no se vuelva «la empresa».
 */
const FRASES_PLATAFORMA: readonly FrasePlataforma[] = [
  ...enArchivoPlataforma("design-notificaciones/Push.dc.html", [
    ["0.01em;\">SERVI LOGISTIC</span>", 3],
  ]),
  ...enArchivoPlataforma("design-whatsapp/Formulario.dc.html", [
    "font-weight: 600;\">Servi Logistic</span>",
  ]),
  ...enArchivoPlataforma("design-whatsapp/Historial.dc.html", [
    "font-weight: 600;\">Servi Logistic</span>",
  ]),
  ...enArchivoPlataforma("design-whatsapp/ListaMovil.dc.html", [
    "font-weight: 600;\">Servi Logistic</span>",
    "\">Mensajes de WhatsApp que Servi Logistic manda solo</p>",
  ]),
  ...enArchivoPlataforma("design-whatsapp/Main.dc.html", [
    "font-weight: 600;\">Servi Logistic</span>",
    "Mensajes de WhatsApp que Servi Logistic manda solo, a una hora fija o cuando pasa algo",
  ]),
  ...enArchivoPlataforma("design-whatsapp/Vacio.dc.html", [
    "font-weight: 600;\">Servi Logistic</span>",
    "\">Mensajes de WhatsApp que Servi Logistic manda solo</p>",
  ]),
  ...enArchivoPlataforma("docs/api/CHANGELOG.md", [
    "`X-Servi-Logistic-Signature`, los estados que emiten evento",
    "`X-Servi-Logistic-Signature` y `X-Servi-Logistic-Timestamp` siguen declaradas",
    "es Servi Logistic quien lo entrega a tu callback",
    "las dos cabeceras `X-Servi-Logistic-Signature` y `X-Servi-Logistic-Timestamp`",
    "`docs/api/servi-logistic-api-key.postman_collection.json` se rehízo",
    "número tenía que ser único en TODO Servi Logistic, no solo en tu cuenta",
    "**`num_guia` sigue siendo único en todo Servi Logistic.**",
    "La firma de las entregas: `X-Servi-Logistic-Timestamp` y `X-Servi-Logistic-Signature`",
    // Retirar geografía es de la plataforma (SL-32, D7); antes estaba en FRASES_OPERADOR.
    "Servi Logistic pasa a poder **retirar**",
  ]),
  ...enArchivoPlataforma("docs/api/api-key-openapi.yaml", [
    "OpenAPI 3.1 del canal integrador por API key (Servi Logistic).",
    "lo que la plataforma ENVÍA al callback del integrador",
    "Servi Logistic puede retirar una",
  ]),
  ...enArchivoPlataforma("docs/api/guia-integracion/README.md", [
    "# Guía de integración — API de Servi Logistic (fuente editable)",
    "Guia-Integracion-API-Servi-Logistic (mes año).pdf",
    "Servi Logistic · n / N»",
  ]),
  ...enArchivoPlataforma("docs/api/guia-integracion/guia-integracion.html", [
    "<title>Guía de integración — API de Servi Logistic</title>",
    "<meta name=\"author\" content=\"Servi Logistic\">",
    "canal por API key de Servi Logistic. Versión del documento",
    "@bottom-left { content: \"Guía de integración — API de Servi Logistic\";",
    "<div class=\"title\">Guía de integración<br>API de Servi Logistic</div>",
    "<h1>Guía de integración — API de Servi Logistic</h1>",
    "Servi Logistic la avisará con antelación",
    "<p>La API de Servi Logistic le permite a su sistema",
    "Se genera desde la aplicación de Servi Logistic",
    "una tienda ya registrada en Servi Logistic, esa tienda",
    "el redondeo lo hace Servi Logistic y la fila creada lo declara",
    "contador de intentos de entrega de Servi Logistic",
    "<p><strong>Servi Logistic envía</strong>",
    "Se registra en Servi Logistic, <strong>una suscripción por dueño</strong>",
    "generado por Servi Logistic y entregado una sola vez",
    "<tr><td><code>X-Servi-Logistic-Timestamp</code></td>",
    "<tr><td><code>X-Servi-Logistic-Signature</code></td><td><code>sha256=",
    "contra el valor de <code>X-Servi-Logistic-Signature</code>",
    "Descarte entregas cuyo <code>X-Servi-Logistic-Timestamp</code>",
    "Servi Logistic va a reintentarlo y a contarlo como fallo del circuito",
    "Falla del lado de Servi Logistic.",
    "“Servi Logistic me reintenta un evento que no me interesa”",
  ]),
  ...enArchivoPlataforma("docs/ayuda/publico/entrar-y-recuperar-contrasena.md", [
    "# Entrar a Servi Logistic",
  ]),
  ...enArchivoPlataforma("docs/ayuda/publico/rastreo-de-paquete.md", [
    "En la página principal de Servi Logistic está el botón **Rastrear envío**",
    "El cliente final no tiene cuenta en Servi Logistic ni debería necesitarla",
  ]),
  ...enArchivoPlataforma("tests/unit/api/openapi-266-habilitar.test.ts", [
    "\"servi-logistic-api-key.postman_collection.json\",",
  ]),
  ...enArchivoPlataforma("tests/unit/api/openapi-320-eliminar.test.ts", [
    "\"servi-logistic-api-key.postman_collection.json\",",
  ]),
  ...enArchivoPlataforma("tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts", [
    ["`docs/api/servi-logistic-api-key.postman_collection.json` y `docs/api/CHANGELOG.md`", 2],
  ]),
];

/** Raíces del alcance que tenían frases de plataforma fuera de los títulos (anti-vacuidad de R6). */
const RAICES_CON_PLATAFORMA = ["docs/api/", "docs/ayuda/", "design-notificaciones/", "design-whatsapp/", "tests/unit/api/"] as const;

/** Veces que `frase` aparece en `texto`, los dos con los espacios colapsados. */
const vecesEn = (texto: string, frase: string): number => plano(texto).split(plano(frase)).length - 1;

/** R6: frases de plataforma mal formadas (sin la marca, o con el término de la empresa). */
export function frasesPlataformaMalFormadas(frases: readonly FrasePlataforma[]): string[] {
  return frases
    .filter(
      ({ frase }) =>
        !MARCAS_PLATAFORMA.some((m) => frase.includes(m)) ||
        frase.includes(TERMINO_EMPRESA) ||
        frase.includes(TERMINO_EMPRESA_INICIO),
    )
    .map(({ archivo, frase }) => `${archivo} · «${frase}»`);
}

/** R6: frases de plataforma que su archivo no contiene (las veces pedidas) en `archivos`. */
export function frasesPlataformaQueFaltan(
  frases: readonly FrasePlataforma[],
  archivos: ReadonlyMap<string, string>,
): string[] {
  return frases
    .filter(({ archivo, frase, veces = 1 }) => vecesEn(archivos.get(archivo) ?? "", frase) < veces)
    .map(({ archivo, frase, veces = 1 }) => `${archivo} · «${frase}» (${vecesEn(archivos.get(archivo) ?? "", frase)} de ${veces})`);
}

/**
 * R16: frases de las descripciones que esta ficha cambia en el contrato, a mano. Cada una tiene que
 * estar en una descripción de `openApiSpec` y, desde ahí hasta el final de esa descripción (o la
 * primera comilla, que el YAML escapa), igual en `docs/api/api-key-openapi.yaml`.
 */
const DESCRIPCIONES_QUE_CAMBIAN = [
  "Los CINCO conceptos que la empresa factura por una orden, en el escenario de ENTREGA",
  "Servi Logistic puede retirar una",
  "invocalo con tu propio `Authorization: Bearer svl_...`, igual que cualquier otra llamada al canal",
] as const;

const TITULO_CONTRATO = "Servi Logistic — API de integración por API key";

// ─── Casos ──────────────────────────────────────────────────────────────────────────────────────

const capital = NOMBRE_HEREDADO.capital;

describe("SL-16 — docs, contrato de la API y diseños sin el nombre heredado", () => {
  beforeAll(() => {
    alcance();
  });

  describe("contrapruebas del detector sobre texto sintético (R14)", () => {
    const n = (texto: string, archivo = "docs/api/x.md", exs: readonly Excepcion[] = []) =>
      apariciones(texto, archivo, exs).length;
    const historia: Excepcion = { clase: "historia", archivo: "docs/h.md", retira: "SL-27" };
    const dominio: Excepcion = { clase: "dominio", texto: `${P}.co`, retira: "SL-14" };
    const cabecera: Excepcion = {
      clase: "identificador",
      texto: `X-${capital}-Signature`,
      fuente: "lib/crypto/webhook-firma.ts",
      retira: "SL-15",
    };
    const cita: Excepcion = { clase: "cita", texto: `${capital} le paga a una tienda`, retira: "SL-15" };

    it("el nombre suelto: 1, con archivo, línea y contexto", () => {
      expect(apariciones(`uno\nAyuda de ${capital}`, "docs/ayuda/README.md", [])).toEqual([
        { archivo: "docs/ayuda/README.md", linea: 2, contexto: `uno Ayuda de ${capital}` },
      ]);
    });

    it("el dominio en una URL: 0 con su excepción de dominio, 1 sin ella", () => {
      const url = `"evidenciasUrl": "https://app.${P}.co/api/ordenes/1"`;
      expect(n(url, "docs/api/x.md", [dominio])).toBe(0);
      expect(n(url)).toBe(1);
    });

    it("una cabecera exceptuada: 0; el prefijo de llave sin exceptuar: 1", () => {
      expect(n(`firma en X-${capital}-Signature`, "docs/api/x.md", [cabecera])).toBe(0);
      expect(n(`Authorization: Bearer ${PREFIJO_LLAVE}...`, "docs/api/x.md", [cabecera])).toBe(1);
    });

    it("una cita registrada partida en dos líneas: 0; la misma con una palabra cambiada: 1", () => {
      expect(n(`la acción **${capital} le paga\na una tienda** abre el pago`, "docs/ayuda/x.md", [cita])).toBe(0);
      expect(n(`la acción **${capital} le cobra\na una tienda**`, "docs/ayuda/x.md", [cita])).toBe(1);
    });

    it("una cita solo se tapa en docs/ayuda/: fuera de ahí cuenta", () => {
      expect(n(`${capital} le paga a una tienda`, "docs/api/x.md", [cita])).toBe(1);
    });

    it("la palabra en mayúsculas o en minúsculas: 1 cada una", () => {
      expect(n(`<span>${NOMBRE_HEREDADO.mayusculas}</span>`)).toBe(1);
      expect(n(`ruta/${P}-x.json`)).toBe(1);
    });

    it("la palabra en un archivo con excepción de historia: 0; la misma en otro archivo: 1", () => {
      expect(n(`origen: ${capital}`, "docs/h.md", [historia])).toBe(0);
      expect(n(`origen: ${capital}`, "docs/otro.md", [historia])).toBe(1);
    });

    it("tapar no mueve las líneas: el hallazgo de después de una cita tapada conserva su número", () => {
      const texto = `**${capital} le paga\na una tienda**\n\ny ${capital} cobra`;
      expect(apariciones(texto, "docs/ayuda/x.md", [cita]).map((h) => h.linea)).toEqual([4]);
    });

    it("R5: una ruta con la palabra salta, salvo la del archivo de historia", () => {
      expect(rutasConPalabra([`docs/api/${P}-x.json`, "docs/h.md", "docs/api/ok.md"], [historia])).toEqual([
        `docs/api/${P}-x.json`,
      ]);
      expect(rutasConPalabra([`docs/${P}.md`], [{ ...historia, archivo: `docs/${P}.md` }])).toEqual([]);
    });

    it("R9: una excepción sin ficha, o sin el campo de su clase, salta", () => {
      const sinFicha = { clase: "historia", archivo: "docs/h.md" } as unknown as Excepcion;
      expect(excepcionesMalFormadas([sinFicha])).toEqual(["«docs/h.md» (historia, retira undefined): sin ficha que la retire"]);
      expect(excepcionesMalFormadas([{ clase: "identificador", texto: "X", retira: "SL-15" }])).toEqual([
        "«X» (identificador, retira SL-15): un identificador nombra su fuente",
      ]);
      expect(excepcionesMalFormadas([historia, dominio, cabecera, cita])).toEqual([]);
    });

    it("R10: un identificador que ya no está en su fuente salta, nombrándolo y con quién lo cita", () => {
      const docs = new Map([["docs/api/guia.html", `<code>X-${capital}-Signature</code>`]]);
      expect(identificadoresSinFuente([cabecera], leerFuente, docs)).toEqual([
        `el identificador «X-${capital}-Signature» ya no existe en lib/crypto/webhook-firma.ts: los docs deben ` +
          "citar el nombre nuevo. Lo citan: docs/api/guia.html",
      ]);
      const vigente: Excepcion = { ...cabecera, texto: "X-Servi-Logistic-Signature" };
      expect(identificadoresSinFuente([vigente], leerFuente, docs)).toEqual([]);
    });

    it("R11: una cita cuyo rótulo ya no está en el código salta, nombrándola y con qué ayuda la cita", () => {
      const docs = new Map([
        ["docs/ayuda/oficina/x.md", `**${capital} le paga\na una tienda**`],
        ["docs/api/y.md", `${capital} le paga a una tienda`],
      ]);
      expect(citasSinCodigo([cita], codigoDeLaApp(), docs)).toEqual([
        `la cita «${capital} le paga a una tienda» ya no existe en app/, components/ ni lib/: la ayuda debe citar ` +
          "el rótulo nuevo. La citan: docs/ayuda/oficina/x.md",
      ]);
      // El rótulo de hoy (`lib/constants/wallet-rotulos.ts`, con `EMPRESA.alInicio` resuelto a mano) no
      // es una cita con la palabra, pero muestra que el lado verde del lockstep existe.
      const vigente: Excepcion = { ...cita, texto: "le paga a una tienda" };
      expect(citasSinCodigo([vigente], codigoDeLaApp(), docs)).toEqual([]);
    }, 60_000);

    it("R12: una excepción que no aparece en el alcance salta; una que aparece, no", () => {
      const archivos = new Map([
        ["docs/h.md", `historia: ${capital}`],
        ["docs/ayuda/x.md", `**${capital} le paga\na una tienda**`],
        ["docs/api/x.md", `X-${capital}-Signature`],
      ]);
      expect(excepcionesSinUso([historia, cita, cabecera], archivos)).toEqual([]);
      const limpio: Excepcion = { clase: "historia", archivo: "docs/limpio.md", retira: "SL-27" };
      const borrado: Excepcion = { clase: "historia", archivo: "docs/borrado.md", retira: "SL-27" };
      expect(excepcionesSinUso([limpio, borrado, dominio], new Map([...archivos, ["docs/limpio.md", "nada"]]))).toEqual([
        "la excepción «docs/limpio.md» (historia, retira SL-27) ya no aparece en el alcance: bórrala",
        "la excepción «docs/borrado.md» (historia, retira SL-27) ya no aparece en el alcance: bórrala",
        `la excepción «${P}.co» (dominio, retira SL-14) ya no aparece en el alcance: bórrala`,
      ]);
    });
  });

  describe("excepciones (R9, R10, R11, R12)", () => {
    it("R9: toda excepción tiene clase, ficha SL-<n> y el campo de su clase", () => {
      expect(excepcionesMalFormadas(EXCEPCIONES)).toEqual([]);
    });

    it("tras SL-14 y SL-15 solo queda la clase historia, y la retira SL-27", () => {
      expect(EXCEPCIONES.filter((e) => e.clase !== "historia").map(describir)).toEqual([]);
      expect(EXCEPCIONES.every((e) => e.retira === "SL-27")).toBe(true);
    });

    it("R10 y R11: ningún identificador ni cita exceptuados perdieron su fuente", () => {
      const { archivos } = alcance();
      const conCitas = EXCEPCIONES.some((e) => e.clase === "cita");
      expect([
        ...identificadoresSinFuente(EXCEPCIONES, leerFuente, archivos),
        ...(conCitas ? citasSinCodigo(EXCEPCIONES, codigoDeLaApp(), archivos) : []),
      ]).toEqual([]);
    });

    it("R12: ninguna excepción sobra", () => {
      const sobran = excepcionesSinUso(EXCEPCIONES, alcance().archivos);
      expect(sobran, sobran.join("\n")).toEqual([]);
    });
  });

  describe("anti-vacuidad (R14)", () => {
    it("cada raíz del alcance existe", () => {
      expect(raicesQueFaltan()).toEqual([]);
    });

    it("recorre al menos el suelo firmado de archivos", () => {
      expect(alcance().rutas.length).toBeGreaterThanOrEqual(MINIMO_ARCHIVOS);
    });

    it("recorre de verdad los archivos que la ficha cambia", () => {
      const { rutas } = alcance();
      for (const r of ["docs/ayuda/oficina/wallet-caja.md", "docs/api/api-key-openapi.yaml", "lib/api/openapi-spec.ts", "DESIGN.md"]) {
        expect(rutas).toContain(r);
      }
    });
  });

  it("R8, R13: ningún archivo del alcance lleva la palabra ni el prefijo fuera de las excepciones", () => {
    const { archivos } = alcance();
    const hallazgos = [...archivos].flatMap(([archivo, texto]) => apariciones(texto, archivo));
    const porArchivo = new Map<string, number>();
    for (const h of hallazgos) porArchivo.set(h.archivo, (porArchivo.get(h.archivo) ?? 0) + 1);
    const resumen = [...porArchivo].map(([a, c]) => `  ${a}: ${c}`).join("\n");
    const detalle = hallazgos.map((h) => `${h.archivo}:${h.linea} · …${h.contexto}…`).join("\n");
    expect(
      hallazgos.length,
      `${hallazgos.length} aparición(es) en ${porArchivo.size} archivo(s). La plataforma es «${PLATAFORMA}»; quien ` +
        `cobra, paga, debe o gana es «${TERMINO_EMPRESA}» (design.md > Regla de sustitución).\n${resumen}\n\n${detalle}`,
    ).toBe(0);
  });

  it("R5: ninguna ruta del alcance lleva la palabra, salvo el archivo de historia exceptuado", () => {
    expect(rutasConPalabra(alcance().rutas)).toEqual([]);
  });

  describe("destino de cada artefacto (R1-R4)", () => {
    it("R1: se conservan en su ruta la ayuda, el contrato, el CHANGELOG, la guía, el manual y los diseños", () => {
      const conservar = [
        "docs/ayuda",
        "docs/api/api-key-openapi.yaml",
        "docs/api/CHANGELOG.md",
        "docs/api/guia-integracion/guia-integracion.html",
        "docs/api/manual-metricas-por-mensajero.md",
        "DESIGN.md",
        "design-notificaciones",
        "design-whatsapp",
      ];
      expect(conservar.filter((r) => !fs.existsSync(abs(r)))).toEqual([]);
    });

    it("R2: la colección de Postman vive en su ruta nueva, parsea y nombra a la plataforma", () => {
      const nueva = "docs/api/servi-logistic-api-key.postman_collection.json";
      expect(fs.existsSync(abs(`docs/api/${P}-api-key.postman_collection.json`)), "la ruta vieja sigue").toBe(false);
      expect(fs.existsSync(abs(nueva)), `falta ${nueva}`).toBe(true);
      const coleccion = JSON.parse(fs.readFileSync(abs(nueva), "utf8")) as { info?: { name?: string } };
      expect(coleccion.info?.name).toContain(PLATAFORMA);
    });

    it("R3: la exportación duplicada del lienzo de notificaciones no existe", () => {
      expect(fs.existsSync(abs(`design-notificaciones/notificaciones-${P}.html`))).toBe(false);
    });

    it("R4: .design-work/ no existe", () => {
      expect(fs.existsSync(abs(".design-work"))).toBe(false);
    });
  });

  describe("R7: el operador es la empresa usuaria, nunca la plataforma", () => {
    it("el término escrito a mano es el de lib/config/marca.ts", () => {
      expect(EMPRESA.enFrase).toBe(TERMINO_EMPRESA);
      expect(EMPRESA.alInicio).toBe(TERMINO_EMPRESA_INICIO);
    });

    it("cada frase de operador lleva el término y no nombra a la plataforma", () => {
      const malas = FRASES_OPERADOR.filter(
        ({ frase }) =>
          !(frase.includes(TERMINO_EMPRESA) || frase.includes(TERMINO_EMPRESA_INICIO)) || frase.includes(PLATAFORMA),
      );
      expect(malas).toEqual([]);
      // 154 y no 156: SL-32 (D7) pasó a FRASES_PLATAFORMA las dos frases de retirar geografía.
      expect(FRASES_OPERADOR.length).toBeGreaterThanOrEqual(154);
    });

    it("cada archivo contiene su forma final de cada frase de operador", () => {
      const faltan = FRASES_OPERADOR.filter(({ archivo, frase }) => {
        const texto = alcance().archivos.get(archivo) ?? "";
        return !plano(texto).includes(plano(frase));
      }).map(({ archivo, frase }) => `${archivo} · «${frase}»`);
      expect(faltan, `${faltan.length} frase(s) de operador sin su forma final:\n${faltan.join("\n")}`).toEqual([]);
    });
  });

  describe("R6: la plataforma es Servi Logistic, nunca la empresa usuaria", () => {
    it("contraprueba sintética: la plataforma vuelta «la empresa» falta; con su forma final, no", () => {
      const frase: FrasePlataforma = { archivo: "docs/api/x.html", frase: "<p><strong>Servi Logistic envía</strong>" };
      const bien = new Map([["docs/api/x.html", "<p><strong>Servi Logistic envía</strong> (POST)"]]);
      const mal = new Map([["docs/api/x.html", "<p><strong>la empresa envía</strong> (POST)"]]);
      expect(frasesPlataformaQueFaltan([frase], bien)).toEqual([]);
      expect(frasesPlataformaQueFaltan([frase], mal)).toEqual([
        "docs/api/x.html · «<p><strong>Servi Logistic envía</strong>» (0 de 1)",
      ]);
      // Partida en dos líneas de Markdown también vale; una de tres repeticiones cambiada, no.
      expect(frasesPlataformaQueFaltan([frase], new Map([["docs/api/x.html", "<p><strong>Servi\nLogistic envía</strong>"]]))).toEqual([]);
      const tres: FrasePlataforma = { archivo: "d/p.html", frase: "\">SERVI LOGISTIC</span>", veces: 3 };
      const dosDeTres = new Map([["d/p.html", "\">SERVI LOGISTIC</span> \">SERVI LOGISTIC</span> \">La empresa</span>"]]);
      expect(frasesPlataformaQueFaltan([tres], dosDeTres)).toEqual(["d/p.html · «\">SERVI LOGISTIC</span>» (2 de 3)"]);
    });

    it("contraprueba sintética: una frase sin la marca, o con el término de la empresa, está mal formada", () => {
      expect(
        frasesPlataformaMalFormadas([
          { archivo: "a", frase: "la empresa envía" },
          { archivo: "b", frase: "Servi Logistic le cobra a la empresa" },
          { archivo: "c", frase: "Servi Logistic envía" },
        ]),
      ).toEqual(["a · «la empresa envía»", "b · «Servi Logistic le cobra a la empresa»"]);
    });

    it("anti-vacuidad: la lista no está vacía y cubre cada raíz que tenía plataforma", () => {
      expect(FRASES_PLATAFORMA.length).toBeGreaterThanOrEqual(50);
      const sinFrases = RAICES_CON_PLATAFORMA.filter((r) => !FRASES_PLATAFORMA.some(({ archivo }) => archivo.startsWith(r)));
      expect(sinFrases).toEqual([]);
      const fueraDelAlcance = FRASES_PLATAFORMA.filter(({ archivo }) => !alcance().archivos.has(archivo)).map((f) => f.archivo);
      expect(fueraDelAlcance).toEqual([]);
    });

    it("cada frase de plataforma nombra a la plataforma y no lleva el término de la empresa", () => {
      expect(frasesPlataformaMalFormadas(FRASES_PLATAFORMA)).toEqual([]);
    });

    it("cada archivo contiene su forma final de cada frase de plataforma", () => {
      const faltan = frasesPlataformaQueFaltan(FRASES_PLATAFORMA, alcance().archivos);
      expect(faltan, `${faltan.length} frase(s) de plataforma sin su forma final:\n${faltan.join("\n")}`).toEqual([]);
    });
  });

  describe("el contrato de la API (R15, R16)", () => {
    const yaml = () => alcance().archivos.get("docs/api/api-key-openapi.yaml") ?? "";

    it("R15: el título es el mismo en openApiSpec, en el YAML y en la página de /api-docs, y nombra a la plataforma", async () => {
      const lineas = yaml().split("\n");
      const info = lineas.findIndex((l) => l === "info:");
      const lineaTitulo = lineas.slice(info + 1).find((l) => /^ {2}title:/.test(l)) ?? "";
      const tituloYaml = lineaTitulo.replace(/^ {2}title:\s*/, "").trim();
      const html = await paginaApiDocs().text();
      const tituloPagina = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
      expect({ ts: openApiSpec.info.title, yaml: tituloYaml, pagina: tituloPagina }).toEqual({
        ts: TITULO_CONTRATO,
        yaml: TITULO_CONTRATO,
        pagina: TITULO_CONTRATO,
      });
    });

    it.each(DESCRIPCIONES_QUE_CAMBIAN)("R16: «%s» dice lo mismo en el TS y en el YAML", (frase) => {
      const ts = stringsDe(openApiSpec).map(plano).find((s) => s.includes(frase));
      expect(ts, `ninguna descripción de openApiSpec contiene la frase`).toBeDefined();
      const desde = (ts ?? "").slice((ts ?? "").indexOf(frase));
      const tramo = desde.split(/["\\]/)[0];
      expect(plano(yaml())).toContain(tramo);
    });
  });

  it("R18: el documento índice de la ayuda se titula «Ayuda de Servi Logistic»", () => {
    // `leerCatalogoAyuda` deja fuera el README (`ARCHIVO_EXCLUIDO`): no es un documento de usuario. Se
    // lee con el mismo parser de frontmatter que usa el catálogo.
    expect(ARCHIVO_EXCLUIDO).toBe("README.md");
    const readme = alcance().archivos.get("docs/ayuda/README.md") ?? "";
    const { datos, cuerpo } = partirFrontmatter(readme);
    expect(datos.titulo).toBe("Ayuda de Servi Logistic");
    expect(cuerpo.split("\n").find((l) => l.startsWith("# "))).toBe("# Ayuda de Servi Logistic");
  });

  it("R19: DESIGN.md se titula con la plataforma y remite a docs/marca.md y a SL-8", () => {
    const texto = alcance().archivos.get("DESIGN.md") ?? "";
    expect(texto.split("\n")[0]).toContain(PLATAFORMA);
    expect(texto).toContain("docs/marca.md");
    expect(texto).toContain("SL-8");
    expect(texto).toContain("app/globals.css");
  });

  describe("R22: sin el dominio de la marca anterior en docs/api/ ni en openapi-406", () => {
    it("ningún archivo de docs/api/ ni el test de la 406 lo llevan, tampoco con el punto escapado", () => {
      const { archivos } = alcance();
      const sujetos = [...archivos].filter(([a]) => a.startsWith("docs/api/") || a === "tests/unit/api/openapi-406-evidencias-url.test.ts");
      const conDominio = sujetos.flatMap(([a, texto]) => [
        ...lineasConDominio(texto).map((l) => `${a}:${l}`),
        ...texto
          .split("\n")
          .flatMap((linea, i) => (linea.toLowerCase().includes(`${P}\\.co`) ? [`${a}:${i + 1} (regex)`] : [])),
      ]);
      expect(sujetos.length, "docs/api/ no se leyó").toBeGreaterThan(5);
      expect(conDominio, conDominio.join("\n")).toEqual([]);
    });

    it("EXCEPCIONES_DOMINIO ya no tiene entradas que retire SL-16", () => {
      expect(EXCEPCIONES_DOMINIO.filter((e) => e.ficha === "SL-16").map((e) => e.ruta)).toEqual([]);
    });
  });
});
