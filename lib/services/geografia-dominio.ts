import { activoEnCascada } from "@/lib/repositories/_shared/geografia-activa";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";

// SLT-44 (design §2) — LA GEOGRAFIA DE N NIVELES, EN MEMORIA Y SIN BASE.
//
// Responde ancestros, descendientes, activo en cascada, tipos del pais, zona que cubre un nodo y
// marca especial sobre dos datos que le pasan: el catalogo de UN pais y las asignaciones de UNA
// empresa. Los carga `CatalogoGeograficoRepository`.
//
// POR QUE EN MEMORIA Y NO CON UNA CTE RECURSIVA (decision cerrada de SLT-44, R13): un pais son
// unos 600 nodos, y la regla de herencia escrita en SQL en cada repositorio serian N copias que un
// dia divergen. Aqui vive una vez. Una consulta que necesite «todo lo que cuelga de X» recibe
// `nodosBajo(cat, x)` ya calculado como `= ANY($ids)`.
//
// ⚠️ PURO A PROPOSITO (R1): no importa Prisma, `@/lib/db/*` ni repositorios, salvo las dos reglas
// compartidas sin Prisma (colapso de zona y activo en cascada). Lo vigila
// `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`.

export interface TipoDeNivel {
  id: string;
  clave: string;
  nombreSingular: string;
  nombrePlural: string;
  digitosCodigo: number | null;
  codigoHeredaPrefijo: boolean;
}

export interface NodoDelCatalogo {
  id: string;
  padreId: string | null;
  profundidad: number;
  tipoId: string;
  nombre: string;
  nombreNormalizado: string;
  codigoOficial: string | null;
  activo: boolean;
}

export interface CatalogoGeografico {
  readonly paisId: string;
  readonly tipos: readonly TipoDeNivel[];
  /** En el orden en que llegaron: el repositorio los pide por nombre e id (design §3). */
  readonly nodos: readonly NodoDelCatalogo[];
  readonly porId: ReadonlyMap<string, NodoDelCatalogo>;
  /** Hijos de cada padre en el orden de `nodos`; la clave `null` son las raices. */
  readonly hijos: ReadonlyMap<string | null, readonly NodoDelCatalogo[]>;
}

export interface ZonaAsignada {
  id: string;
  nombre: string;
  esCentral: boolean;
}

export interface AsignacionesDeLaEmpresa {
  readonly zonasPorNodo: ReadonlyMap<string, readonly ZonaAsignada[]>;
  readonly nodosConMarca: ReadonlySet<string>;
}

/** El nodo mas cercano con asignacion de zona (el propio o un ancestro) y sus zonas. */
export interface ZonasCandidatas {
  nodoId: string;
  zonas: readonly ZonaAsignada[];
}

/**
 * Un `padreId` que no esta en el catalogo, o una cadena que no termina. No puede ocurrir con la FK
 * compuesta de SLT-43 y la RLS por pais; se lanza en vez de iterar sin tope.
 */
export class CatalogoGeograficoInconsistente extends Error {
  readonly nodoId: string;
  constructor(nodoId: string, detalle: string) {
    super(`Catalogo geografico inconsistente en el nodo ${nodoId}: ${detalle}`);
    this.name = "CatalogoGeograficoInconsistente";
    this.nodoId = nodoId;
  }
}

export function crearCatalogo(
  paisId: string,
  tipos: readonly TipoDeNivel[],
  nodos: readonly NodoDelCatalogo[],
): CatalogoGeografico {
  const porId = new Map<string, NodoDelCatalogo>();
  const hijos = new Map<string | null, NodoDelCatalogo[]>();
  for (const n of nodos) {
    porId.set(n.id, n);
    const hermanos = hijos.get(n.padreId);
    if (hermanos) hermanos.push(n);
    else hijos.set(n.padreId, [n]);
  }
  return { paisId, tipos, nodos, porId, hijos };
}

export function crearAsignaciones(
  filasDeZona: readonly { nodoId: string; zona: ZonaAsignada }[],
  nodosConMarca: Iterable<string>,
): AsignacionesDeLaEmpresa {
  const zonasPorNodo = new Map<string, ZonaAsignada[]>();
  for (const { nodoId, zona } of filasDeZona) {
    const zonas = zonasPorNodo.get(nodoId);
    if (zonas) zonas.push(zona);
    else zonasPorNodo.set(nodoId, [zona]);
  }
  return { zonasPorNodo, nodosConMarca: new Set(nodosConMarca) };
}

/** El nodo, o `null` si no esta en el catalogo («no existe», R3). */
export function nodo(cat: CatalogoGeografico, id: string): NodoDelCatalogo | null {
  return cat.porId.get(id) ?? null;
}

/** Del padre a la raiz. `[]` para una raiz o un id que no existe (R2, R3). */
export function ancestros(cat: CatalogoGeografico, id: string): NodoDelCatalogo[] {
  const inicio = cat.porId.get(id);
  if (!inicio) return [];
  const cadena: NodoDelCatalogo[] = [];
  let actual = inicio;
  while (actual.padreId !== null) {
    // Un nodo de profundidad p tiene exactamente p - 1 ancestros: pasar de ahi es un ciclo.
    if (cadena.length >= inicio.profundidad - 1) {
      throw new CatalogoGeograficoInconsistente(id, "la cadena de padres supera su profundidad");
    }
    const padre = cat.porId.get(actual.padreId);
    if (!padre) {
      throw new CatalogoGeograficoInconsistente(actual.id, `su padre ${actual.padreId} no esta en el catalogo`);
    }
    cadena.push(padre);
    actual = padre;
  }
  return cadena;
}

/**
 * Todo lo que cuelga del nodo, a cualquier profundidad, en preorden y con los hermanos en el orden
 * del catalogo. `[]` para una hoja o un id que no existe (R2, R3, R13).
 */
export function nodosBajo(cat: CatalogoGeografico, id: string): NodoDelCatalogo[] {
  if (!cat.porId.has(id)) return [];
  const salida: NodoDelCatalogo[] = [];
  const vistos = new Set<string>([id]);
  const pila = [...(cat.hijos.get(id) ?? [])].reverse();
  while (pila.length > 0) {
    const n = pila.pop() as NodoDelCatalogo;
    if (vistos.has(n.id)) {
      throw new CatalogoGeograficoInconsistente(n.id, "aparece dos veces bajo el mismo nodo");
    }
    vistos.add(n.id);
    salida.push(n);
    const hijos = cat.hijos.get(n.id);
    if (hijos) for (let i = hijos.length - 1; i >= 0; i--) pila.push(hijos[i]);
  }
  return salida;
}

/** Los nodos de esa profundidad, en el orden del catalogo (R14). */
export function nodosDeProfundidad(cat: CatalogoGeografico, profundidad: number): NodoDelCatalogo[] {
  return cat.nodos.filter((n) => n.profundidad === profundidad);
}

export function tiposDelPais(cat: CatalogoGeografico): readonly TipoDeNivel[] {
  return cat.tipos;
}

/** Activo si el y todos sus ancestros lo estan; `null` si no existe, que no es «inactivo» (R3, R5). */
export function estaActivo(cat: CatalogoGeografico, id: string): boolean | null {
  const n = cat.porId.get(id);
  if (!n) return null;
  return activoEnCascada([...ancestros(cat, id).map((a) => a.activo), n.activo]);
}

/**
 * Las zonas del nodo mas cercano con al menos una asignacion de la empresa: el propio y luego sus
 * ancestros, de padre a raiz. `null` si ninguno tiene, o si el id no existe (R3, R6).
 */
export function zonasCandidatas(
  cat: CatalogoGeografico,
  asig: AsignacionesDeLaEmpresa,
  id: string,
): ZonasCandidatas | null {
  const n = cat.porId.get(id);
  if (!n) return null;
  for (const eslabon of [n, ...ancestros(cat, id)]) {
    const zonas = asig.zonasPorNodo.get(eslabon.id);
    if (zonas && zonas.length > 0) return { nodoId: eslabon.id, zonas };
  }
  return null;
}

/**
 * La zona que cubre el nodo: el colapso 1/0/>1 de la ficha 374 sobre la asignacion mas especifica.
 * Con dos zonas en el nodo mas cercano da `null` y NO sube a buscar una zona unica en el abuelo:
 * eso seria elegir tarifa por descarte (R6).
 */
export function zonaQueCubre(
  cat: CatalogoGeografico,
  asig: AsignacionesDeLaEmpresa,
  id: string,
): ZonaAsignada | null {
  return zonaUnicaDeDistrito(zonasCandidatas(cat, asig, id)?.zonas ?? []);
}

/** `true` si el nodo o alguno de sus ancestros tiene la marca de la empresa (R7). */
export function esZonaEspecial(cat: CatalogoGeografico, asig: AsignacionesDeLaEmpresa, id: string): boolean {
  const n = cat.porId.get(id);
  if (!n) return false;
  return [n, ...ancestros(cat, id)].some((eslabon) => asig.nodosConMarca.has(eslabon.id));
}
