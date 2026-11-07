import type {
  NodoArbolPlataformaDTO,
  NodoPlataformaDTO,
  ProvinciaPlataformaDTO,
} from "@/lib/types/geografia-nodo";

// SLT-46 (T4.1) — puente hasta T6. El servicio ya devuelve el arbol de N niveles (`raices`), pero la
// pantalla sigue pintando los tres de SL-20 hasta que la maqueta del arbol recursivo este aprobada
// (R52). Esto lo proyecta a la forma de antes, con lo mismo que leia `listArbolDePais`: las
// profundidades 1–3, en el orden del catalogo. Lo que cuelga mas abajo no se pinta, como hasta hoy.

function plano(n: NodoArbolPlataformaDTO): NodoPlataformaDTO {
  return { id: n.id, nombre: n.nombre, codigo: n.codigo, activo: n.activo };
}

function hijosDe(n: NodoArbolPlataformaDTO, profundidad: number): NodoArbolPlataformaDTO[] {
  return n.hijos.filter((h) => h.profundidad === profundidad);
}

export function arbolDeTresNiveles(raices: readonly NodoArbolPlataformaDTO[]): ProvinciaPlataformaDTO[] {
  return raices
    .filter((p) => p.profundidad === 1)
    .map((p) => ({
      ...plano(p),
      cantones: hijosDe(p, 2).map((c) => ({ ...plano(c), distritos: hijosDe(c, 3).map(plano) })),
    }));
}
