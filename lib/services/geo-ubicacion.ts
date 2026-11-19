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
// la regla de hoja (SLT-48 R17) y al final la zona (R16). La regla va antes que la zona: decir «sin
// zona» de algo que nunca se podra guardar manda al integrador a pedir una zona inutil.
//
// ⚠️ PURO A PROPOSITO, como `geografia-dominio.ts`: solo importa el dominio y `normalizeName`.
// Normaliza con `normalizeName` y no con `normalize` de `geo-resolucion.ts` porque aquel es un
// envoltorio sin cambios de este, y su modulo arrastra los tipos de `IOrdenRepository` (Prisma).
// Lo vigila `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`.

export type EntradaUbicacion = { tipo: "ruta"; nombres: string[] } | { tipo: "codigo"; codigo: string };

export interface UbicacionResuelta {
  nodo: NodoDelCatalogo;
  /** De la raiz al nodo. */
  ruta: NodoDelCatalogo[];
  zona: ZonaAsignada;
  esZonaEspecial: boolean;
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

// ── Regla de hoja (SLT-48 R17, R18; decision P2) ─────────────────────────────────────────────────

/**
 * SLT-48 (design §4.1) — una orden apunta al ultimo nodo de su rama, en paises de 2 a 10 niveles.
 * Hoja = sin hijos ACTIVOS (P2): un canton cuyos distritos estan todos retirados vuelve a ser hoja,
 * porque si no ninguna orden podria entrar ahi.
 */
export function esHoja(cat: CatalogoGeografico, n: NodoDelCatalogo): boolean {
  return hijosActivos(cat, n).length === 0;
}

function hijosActivos(cat: CatalogoGeografico, n: NodoDelCatalogo): NodoDelCatalogo[] {
  return (cat.hijos.get(n.id) ?? []).filter((h) => estaActivo(cat, h.id) === true);
}

export function msgUbicacionIncompleta(nombre: string, tipoPlural: string): string {
  return `ubicacion incompleta: '${nombre}' tiene ${tipoPlural.toLowerCase()} debajo; indica el ultimo nivel`;
}

/**
 * El tipo plural de los hijos activos del nodo, o `null` si es hoja. Lo usan el motor y la carga de
 * v1 (`DistritoRow.tipoHijosActivos`) para el mensaje de R17.
 */
export function tipoDeHijosActivos(cat: CatalogoGeografico, n: NodoDelCatalogo): string | null {
  const [hijo] = hijosActivos(cat, n);
  if (hijo === undefined) return null;
  const tipo = cat.tipos.find((t) => t.id === hijo.tipoId);
  if (!tipo) throw new CatalogoGeograficoInconsistente(hijo.id, `su tipo ${hijo.tipoId} no esta en el catalogo`);
  return tipo.nombrePlural;
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

  const tipoQueFalta = tipoDeHijosActivos(cat, nodo);
  if (tipoQueFalta !== null) return fallo(msgUbicacionIncompleta(nodo.nombre, tipoQueFalta));

  const zona = zonaQueCubre(cat, asig, nodo.id);
  if (zona === null) return fallo(msgSinZona(nodo.nombre));

  return {
    ok: true,
    u: {
      nodo,
      ruta: [...ancestros(cat, nodo.id).reverse(), nodo],
      zona,
      esZonaEspecial: esZonaEspecial(cat, asig, nodo.id),
    },
  };
}
