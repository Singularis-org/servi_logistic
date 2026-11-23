import {
  CatalogoGeograficoInconsistente,
  ancestros,
  esZonaEspecial,
  estaActivo,
  zonaQueCubre,
  type AsignacionesDeLaEmpresa,
  type CatalogoGeografico,
  type NodoDelCatalogo,
  type ZonaAsignada,
} from "@/lib/services/geografia-dominio";
import { normalizeName } from "@/lib/utils/normalize";

// SLT-45 (design §2.2, §5) — EL MOTOR DE N NIVELES: resuelve una ubicacion de v2 (y de la carga
// de sesion de un pais que no es de forma CR) contra el catalogo de UN pais y las asignaciones de
// UNA empresa, sin base.
//
// v1 NO pasa por aqui: sigue en `resolveGeo` con sus 11 mensajes (R3, design §2.1 y §11.1).
//
// Orden de comprobacion, que fija la precedencia de los errores: ruta o codigo (R13, R14), luego
// la regla de guardado (R15) y al final la zona (R16). La regla va antes que la zona: decir «sin
// zona» de algo que nunca se podra guardar manda al integrador a pedir una zona inutil.
//
// ⚠️ PURO A PROPOSITO, como `geografia-dominio.ts`: solo importa el dominio y `normalizeName`.
// Normaliza con `normalizeName` y no con `normalize` de `geo-resolucion.ts` porque aquel es un
// envoltorio sin cambios de este, y su modulo arrastra los tipos de `IOrdenRepository` (Prisma).
// Lo vigila `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`.

export type EntradaUbicacion = { tipo: "ruta"; nombres: string[] } | { tipo: "codigo"; codigo: string };

export interface FksDeNodo {
  provinciaId: string;
  cantonId: string;
  distritoId: string | null;
}

export interface UbicacionResuelta {
  nodo: NodoDelCatalogo;
  /** De la raiz al nodo. */
  ruta: NodoDelCatalogo[];
  zona: ZonaAsignada;
  esZonaEspecial: boolean;
  fks: FksDeNodo;
}

export type ResultadoUbicacion =
  | { ok: true; u: UbicacionResuelta }
  | { ok: false; fieldErrors: Record<string, string[]> };

/** Un eslabon de `ubicacion` en las respuestas de v2 (R21). */
export interface UbicacionDTO {
  profundidad: number;
  id: string;
  nombre: string;
  codigoOficial: string | null;
  tipo: { clave: string; nombre: string };
}

export const CLAVE_UBICACION = "ubicacion";

// ── Mensajes (design §5), sin tildes como los de v1 ──────────────────────────────────────────────

export const MSG_UBICACION_UNA_DE_LAS_DOS = "indica ubicacion o ubicacion_codigo, uno de los dos";
export const MSG_PAIS_NO_HABILITADO =
  "pais aun no habilitado: solo se aceptan ubicaciones de nivel 2 o 3 en paises de 3 niveles";

/**
 * Design §2.3: una via del motor sin catalogo es un error de CONFIGURACION del composition root, no
 * de la fila; nunca se degrada en silencio a `resolveGeo`. Lo lanzan la carga y la cotizacion.
 */
export const MSG_MOTOR_SIN_CATALOGO =
  "configuracion: la resolucion por ubicacion necesita el catalogo geografico de la empresa";

export function msgNivelVacio(n: number): string {
  return `nivel ${n}: el nombre esta vacio`;
}

export function msgNivelNoEncontrado(n: number, nombre: string, padre: string | null): string {
  return padre === null
    ? `nivel ${n}: '${nombre}' no encontrado`
    : `nivel ${n}: '${nombre}' no encontrado en '${padre}'`;
}

export function msgNivelAmbiguo(n: number, nombre: string, padre: string | null): string {
  return padre === null ? `nivel ${n}: '${nombre}' es ambiguo` : `nivel ${n}: '${nombre}' es ambiguo en '${padre}'`;
}

export function msgNivelRetirado(n: number, nombre: string): string {
  return `nivel ${n}: '${nombre}' esta retirado del catalogo`;
}

export function msgCodigoNoEncontrado(codigo: string): string {
  return `ubicacion_codigo '${codigo}' no encontrado`;
}

export function msgCodigoAmbiguo(codigo: string): string {
  return `ubicacion_codigo '${codigo}' es ambiguo: lo comparten varios niveles`;
}

export function msgCodigoRetirado(codigo: string): string {
  return `ubicacion_codigo '${codigo}' esta retirado del catalogo`;
}

export function msgSinZona(nombre: string): string {
  return `la ubicacion '${nombre}' no tiene zona asignada`;
}

// ── Forma del pais y regla de guardado (R5, R15, R33) ────────────────────────────────────────────

const PROFUNDIDAD_DE_FORMA_GUARDABLE = 3;
const PROFUNDIDADES_GUARDABLES: ReadonlySet<number> = new Set([2, 3]);

/** `true` si la profundidad maxima del catalogo es 3. Un catalogo vacio no lo es. */
export function esPaisDeTresNiveles(cat: CatalogoGeografico): boolean {
  let maxima = 0;
  for (const n of cat.nodos) if (n.profundidad > maxima) maxima = n.profundidad;
  return maxima === PROFUNDIDAD_DE_FORMA_GUARDABLE;
}

/** Hasta SLT-46 solo se guardan nodos de profundidad 2 o 3 de un pais de 3 niveles. */
export function admiteGuardado(cat: CatalogoGeografico, nodo: NodoDelCatalogo): boolean {
  return esPaisDeTresNiveles(cat) && PROFUNDIDADES_GUARDABLES.has(nodo.profundidad);
}

/**
 * Las tres FK viejas de la orden, derivadas de la ruta del nodo (design §3.1, R25): profundidad 3
 * → abuelo, padre, nodo; profundidad 2 → padre, nodo, `null`. `null` si no admite guardado.
 */
export function fksDeNodo(cat: CatalogoGeografico, nodo: NodoDelCatalogo): FksDeNodo | null {
  if (!admiteGuardado(cat, nodo)) return null;
  const [padre, abuelo] = ancestros(cat, nodo.id);
  if (nodo.profundidad === 3) return { provinciaId: abuelo.id, cantonId: padre.id, distritoId: nodo.id };
  return { provinciaId: padre.id, cantonId: nodo.id, distritoId: null };
}

// ── Ruta publica (R21) ───────────────────────────────────────────────────────────────────────────

/** De la raiz al nodo, con el nombre ACTUAL de cada eslabon. `[]` si el id no esta en el catalogo. */
export function rutaPublica(cat: CatalogoGeografico, nodoId: string): UbicacionDTO[] {
  const n = cat.porId.get(nodoId);
  if (!n) return [];
  return [...ancestros(cat, nodoId).reverse(), n].map((eslabon) => aDto(cat, eslabon));
}

function aDto(cat: CatalogoGeografico, n: NodoDelCatalogo): UbicacionDTO {
  const tipo = cat.tipos.find((t) => t.id === n.tipoId);
  if (!tipo) throw new CatalogoGeograficoInconsistente(n.id, `su tipo ${n.tipoId} no esta en el catalogo`);
  return {
    profundidad: n.profundidad,
    id: n.id,
    nombre: n.nombre,
    codigoOficial: n.codigoOficial,
    tipo: { clave: tipo.clave, nombre: tipo.nombreSingular },
  };
}

// ── Resolucion (R13–R16) ─────────────────────────────────────────────────────────────────────────

type Paso = { ok: true; nodo: NodoDelCatalogo } | { ok: false; mensaje: string };

function fallo(mensaje: string): ResultadoUbicacion {
  return { ok: false, fieldErrors: { [CLAVE_UBICACION]: [mensaje] } };
}

/** Los hijos del nodo; con `null`, las raices del pais. */
function hijosDe(cat: CatalogoGeografico, padre: NodoDelCatalogo | null): readonly NodoDelCatalogo[] {
  return cat.hijos.get(padre === null ? null : padre.id) ?? [];
}

/** Nivel a nivel desde las raices; para en el primer fallo, igual que `resolveGeo` (R13). */
function porRuta(cat: CatalogoGeografico, nombres: readonly string[]): Paso {
  if (nombres.length === 0) return { ok: false, mensaje: MSG_UBICACION_UNA_DE_LAS_DOS };
  let padre: NodoDelCatalogo | null = null;
  for (const [i, crudo] of nombres.entries()) {
    const n = i + 1;
    const nombre = crudo.trim();
    if (nombre === "") return { ok: false, mensaje: msgNivelVacio(n) };
    const clave = normalizeName(nombre);
    const candidatos: NodoDelCatalogo[] = hijosDe(cat, padre).filter((h) => h.nombreNormalizado === clave);
    const nombrePadre = padre?.nombre ?? null;
    if (candidatos.length === 0) return { ok: false, mensaje: msgNivelNoEncontrado(n, nombre, nombrePadre) };
    if (candidatos.length > 1) return { ok: false, mensaje: msgNivelAmbiguo(n, nombre, nombrePadre) };
    if (estaActivo(cat, candidatos[0].id) !== true) return { ok: false, mensaje: msgNivelRetirado(n, nombre) };
    padre = candidatos[0];
  }
  return { ok: true, nodo: padre as NodoDelCatalogo };
}

/** Coincidencia exacta tras `trim()`; dos tipos pueden compartir codigo y eso es «ambiguo» (R14). */
function porCodigo(cat: CatalogoGeografico, crudo: string): Paso {
  const codigo = crudo.trim();
  if (codigo === "") return { ok: false, mensaje: MSG_UBICACION_UNA_DE_LAS_DOS };
  const candidatos = cat.nodos.filter((n) => n.codigoOficial === codigo);
  if (candidatos.length === 0) return { ok: false, mensaje: msgCodigoNoEncontrado(codigo) };
  if (candidatos.length > 1) return { ok: false, mensaje: msgCodigoAmbiguo(codigo) };
  if (estaActivo(cat, candidatos[0].id) !== true) return { ok: false, mensaje: msgCodigoRetirado(codigo) };
  return { ok: true, nodo: candidatos[0] };
}

export function resolverUbicacion(
  entrada: EntradaUbicacion,
  cat: CatalogoGeografico,
  asig: AsignacionesDeLaEmpresa,
): ResultadoUbicacion {
  const paso = entrada.tipo === "ruta" ? porRuta(cat, entrada.nombres) : porCodigo(cat, entrada.codigo);
  if (!paso.ok) return fallo(paso.mensaje);
  const { nodo } = paso;

  const fks = fksDeNodo(cat, nodo);
  if (fks === null) return fallo(MSG_PAIS_NO_HABILITADO);

  const zona = zonaQueCubre(cat, asig, nodo.id);
  if (zona === null) return fallo(msgSinZona(nodo.nombre));

  return {
    ok: true,
    u: {
      nodo,
      ruta: [...ancestros(cat, nodo.id).reverse(), nodo],
      zona,
      esZonaEspecial: esZonaEspecial(cat, asig, nodo.id),
      fks,
    },
  };
}
