import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import type { PasoDeRuta } from "@/lib/types/geografia-nodo";
import { declararNiveles, esFemenino, nivelDeClave, type OpcionesDeLugar } from "@/lib/utils/filtro-ubicacion";

// SLT-47 (design §5.4; R7, R9, R13) — el filtro de lugar de las asignaciones del mensajero. Sucesor
// de la lógica de la feature 117 (cantón y distrito por nombre): ahora filtra por ID sobre la
// `lugarRuta` que trae cada orden, así que dos lugares con el mismo nombre no se confunden (R13).
//
// MODULO PURO (sin React ni DOM), aplicado 100 % en cliente sobre las órdenes que ya llegan por
// props: sin URL, sin vistas y sin lecturas nuevas. La forma es la de hoy, generalizada (P2): una
// primera lista del nivel 2 con su nivel 1 entre paréntesis y una lista por cada nivel de 3 a P.
// Las opciones salen solo de las órdenes cargadas; la declaración la hace `declararNiveles`, como en
// el resto de pantallas, con `desde: 2` y `etiquetaConPadre`.

/** Una opción de un select de lugar: `value` es el id del lugar; `label`, lo que se pinta. */
export interface OpcionFiltro {
  value: string;
  label: string;
}

/** Lo único que este filtro lee de una orden. `lugarRuta` va del nivel 1 al lugar de la orden. */
export interface LugarDeOrden {
  lugarRuta?: readonly PasoDeRuta[];
}

/** Una lista del filtro: su nivel, sus nombres y TODAS sus opciones (cada una con su padre). */
export interface ListaDeLugar {
  profundidad: number;
  singular: string;
  plural: string;
  opciones: readonly (OpcionFiltro & { padre?: string })[];
}

// Colación en español, insensible a acentos y caso: un orden alfabético estable, que no hace
// «saltar» opciones al cambiar la selección (el mismo de la 117). Un solo `Collator`: `localeCompare`
// con opciones crea uno por comparación, y aquí se ordenan todas las listas de una vez.
const COLACION_ES = new Intl.Collator("es", { sensitivity: "base" });
function compararEs(a: string, b: string): number {
  return COLACION_ES.compare(a, b);
}

/**
 * Los lugares que aparecen en las rutas de las órdenes, una vez cada uno (el primero que se ve). Cada
 * paso de la ruta es un lugar de profundidad `i + 1` cuyo padre es el paso anterior.
 */
export function lugaresDeLasOrdenes(ordenes: readonly LugarDeOrden[]): OpcionesDeLugar["lugares"] {
  const vistos = new Map<string, OpcionesDeLugar["lugares"][number]>();
  for (const orden of ordenes) {
    const ruta = orden.lugarRuta ?? [];
    ruta.forEach((paso, i) => {
      if (vistos.has(paso.id)) return;
      vistos.set(paso.id, {
        id: paso.id,
        nombre: paso.nombre,
        padreId: i === 0 ? null : ruta[i - 1].id,
        profundidad: i + 1,
      });
    });
  }
  return [...vistos.values()];
}

/**
 * R7 — las listas del filtro: una por nivel de 2 a P, con las opciones sacadas solo de `ordenes`. La
 * primera rotula «lugar (lugar de nivel 1)» para distinguir homónimos («Central (San José)» y
 * «Central (Alajuela)»); las demás llevan el id de su padre para el encadenado. Ordenadas por rótulo.
 */
export function listasDeLugar(
  ordenes: readonly LugarDeOrden[],
  niveles: readonly NivelDeFiltroDTO[],
): ListaDeLugar[] {
  const defs = declararNiveles(
    { niveles, lugares: lugaresDeLasOrdenes(ordenes) },
    { desde: 2, etiquetaConPadre: true },
  );
  const porProfundidad = new Map(niveles.map((n) => [n.profundidad, n]));
  return defs.map((def) => {
    const profundidad = nivelDeClave(def.key) ?? 0;
    const nivel = porProfundidad.get(profundidad);
    return {
      profundidad,
      singular: def.label,
      plural: nivel?.plural ?? def.label,
      opciones: (def.options ?? [])
        .map((o) => ({
          value: o.value,
          label: o.label,
          ...(o.parentValue === undefined ? {} : { padre: o.parentValue }),
        }))
        .sort((a, b) => compararEs(a.label, b.label)),
    };
  });
}

/**
 * Las opciones que ofrece una lista: con `padre === null` (la primera), todas; si no, solo los hijos
 * de ese lugar. Una lista cuya lista de arriba no tiene elección no llama aquí: va deshabilitada y
 * vacía, como el distrito de hoy sin cantón.
 */
export function opcionesOfrecidas(
  lista: ListaDeLugar,
  padre: string | null,
): OpcionFiltro[] {
  const ofrecidas = padre === null ? lista.opciones : lista.opciones.filter((o) => o.padre === padre);
  return ofrecidas.map(({ value, label }) => ({ value, label }));
}

/**
 * R7, R9, R13 — aplica el lugar elegido (el id de la lista más honda con elección), conservando el
 * orden de entrada. `""` (sin elección) devuelve la MISMA lista sin recorrerla. Una orden pasa si su
 * ruta contiene ese id: la de un cantón entra eligiendo el cantón y queda fuera eligiendo un distrito
 * si no lo tiene (una orden sin distrito no está bajo ningún distrito).
 */
export function filtrarAsignaciones<T extends LugarDeOrden>(ordenes: T[], lugarId: string): T[] {
  if (lugarId === "") return ordenes;
  return ordenes.filter((orden) => (orden.lugarRuta ?? []).some((paso) => paso.id === lugarId));
}

/**
 * «Todos los cantones» / «Todas las regiones»: la opción «todos» de una lista de lugar. El tipo de
 * nivel no trae género: se deduce del singular con `esFemenino` (la misma regla que el placeholder de
 * `declararNiveles`).
 */
export function todosLosDelNivel(singular: string, plural: string): string {
  const p = plural.toLowerCase();
  return esFemenino(singular) ? `Todas las ${p}` : `Todos los ${p}`;
}
