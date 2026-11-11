import { describe, expect, it } from "vitest";

import { sqlLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { resolverLugar } from "@/lib/repositories/_shared/lugares-del-filtro";
import { crearCatalogo, type NodoDelCatalogo, type TipoDeNivel } from "@/lib/services/geografia-dominio";
import { declararNiveles, traductorPorId, type OpcionesDeLugar } from "@/lib/utils/filtro-ubicacion";

// SLT-47 (T3.1; R32; design §8; P3) — con un catalogo sintetico de 10 niveles y ~20.000 nodos, cada
// operacion tarda menos de 200 ms en la mediana de 5 corridas, y la consulta lleva todos los ids en un
// solo parametro.

const NIVELES = 10;
const UMBRAL_MS = 200;
const CORRIDAS = 5;

/** Un arbol de 10 niveles: 3 raices y ~3 hijos por nodo, hasta pasar de 20.000 nodos. */
function sintetico(): NodoDelCatalogo[] {
  const nodos: NodoDelCatalogo[] = [];
  let nivel = ["r0", "r1", "r2"].map((id) => ({ id, padreId: null as string | null }));
  for (let k = 1; k <= NIVELES; k++) {
    for (const n of nivel) {
      nodos.push({ id: n.id, padreId: n.padreId, profundidad: k, tipoId: `t${k}`, nombre: `N ${n.id}`, nombreNormalizado: `n ${n.id}`, codigoOficial: null, activo: true });
    }
    if (k === NIVELES) break;
    // Se ramifica hasta llegar al tamaño de P3 y luego un hijo por nodo, para que llegue al nivel 10.
    const hijos = nodos.length < 14_000 ? 3 : 1;
    nivel = nivel.flatMap((n) => Array.from({ length: hijos }, (_, i) => ({ id: `${n.id}.${i}`, padreId: n.id })));
  }
  return nodos;
}

function mediana(fn: () => unknown): number {
  const tiempos: number[] = [];
  for (let i = 0; i < CORRIDAS; i++) {
    const t0 = performance.now();
    fn();
    tiempos.push(performance.now() - t0);
  }
  tiempos.sort((a, b) => a - b);
  return tiempos[Math.floor(CORRIDAS / 2)];
}

describe("SLT-47 R32 — 10 niveles y ~20.000 nodos", () => {
  const nodos = sintetico();
  const tipos: TipoDeNivel[] = Array.from({ length: NIVELES }, (_, i) => ({
    id: `t${i + 1}`,
    clave: `nivel_${i + 1}`,
    nombreSingular: `Nivel ${i + 1}`,
    nombrePlural: `Niveles ${i + 1}`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  }));
  const cat = crearCatalogo("XA", tipos, nodos);
  const op: OpcionesDeLugar = {
    niveles: tipos.map((t, i) => ({ profundidad: i + 1, singular: t.nombreSingular, plural: t.nombrePlural })),
    lugares: nodos.map((n) => ({ id: n.id, nombre: n.nombre, padreId: n.padreId, profundidad: n.profundidad })),
  };
  const hoja = nodos.find((n) => n.profundidad === NIVELES)!;

  it("el catalogo tiene el tamaño de P3", () => {
    expect(nodos.length).toBeGreaterThanOrEqual(20_000);
    expect(hoja).toBeDefined();
  });

  it("resolver en el servidor el nodo raiz a sus ids", () => {
    const ms = mediana(() => resolverLugar(cat, ["r0"]));
    console.log(`SLT-47 R32 resolverLugar(raiz): mediana=${ms.toFixed(1)} ms`);
    expect(resolverLugar(cat, ["r0"]).length).toBeGreaterThan(5_000);
    expect(ms).toBeLessThan(UMBRAL_MS);
  });

  it("declarar la barra", () => {
    const ms = mediana(() => declararNiveles(op));
    console.log(`SLT-47 R32 declararNiveles: mediana=${ms.toFixed(1)} ms`);
    expect(declararNiveles(op)).toHaveLength(NIVELES);
    expect(ms).toBeLessThan(UMBRAL_MS);
  });

  it("traducir una URL con un `lugar_id` del nivel 10", () => {
    const filtros = declararNiveles(op);
    const t = traductorPorId();
    const params = new URLSearchParams(`lugar_id=${hoja.id}`);
    const ms = mediana(() => t.traducir(params, filtros));
    console.log(`SLT-47 R32 traducir(nivel 10): mediana=${ms.toFixed(1)} ms`);
    expect([...t.traducir(params, filtros).entries()]).toHaveLength(NIVELES);
    expect(ms).toBeLessThan(UMBRAL_MS);
  });

  it("la consulta lleva todos los ids en un solo parametro de lista (por rama)", () => {
    const ids = resolverLugar(cat, ["r0"]);
    const sql = sqlLugarEn(ids);
    expect(sql.values).toEqual([[...ids], [...ids]]);
  });
});
