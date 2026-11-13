import { z } from "zod";

import type { Ruta } from "@/lib/utils/ubicacion-presentacion";

// SLT-125 (design §2.1, §4.4; R21, R24, R25) — `cierre_detail.ubicacion_snapshot`, version 1.
//
// La forma es la de SLT-43 §2.6, la misma que escribe `geo:backfill` (`scripts/geo-backfill-nodo.ts`):
//   { "v": 1, "niveles": [ { "profundidad": 1, "tipo": "Provincia", "nombre": "San José", "id": "…" }, … ] }
// un nivel por paso de la ruta, de la raiz a la hoja. El NOMBRE es la foto del instante del cierre; el
// `id` solo enlaza con el nodo y puede faltar.
//
// Es un JSONB que escriben dos caminos (la app al cerrar y el script por lotes) y que una persona puede
// tocar a mano: por eso se lee validando, como cualquier entrada externa, y lo que no cumple la version
// 1 no es un error sino una fila «sin snapshot» que se lee como hoy (R25).

export const ubicacionSnapshotV1Schema = z.object({
  v: z.literal(1),
  niveles: z
    .array(
      z.object({
        profundidad: z.number().int().positive(),
        tipo: z.string(),
        nombre: z.string(),
        // R24: un `id` nulo se admite (el nodo pudo no conocerse); nunca se usa para buscar un nombre.
        id: z.string().nullable(),
      }),
    )
    // Un snapshot sin niveles no dice donde estaba la orden: no sirve como foto y se cae a las columnas.
    .min(1),
});

export type UbicacionSnapshotV1 = z.infer<typeof ubicacionSnapshotV1Schema>;

/** Lo que `leerUbicacionCongelada` necesita de una fila de `cierre_detail`. */
export interface FilaConUbicacionCongelada {
  ubicacionSnapshot: unknown;
  provinciaNombre: string | null;
  cantonNombre: string | null;
  distritoNombre: string | null;
}

/**
 * La ruta congelada de una fila de cierre (R24, R25).
 *
 * - Con un snapshot v1 valido: sus `niveles`, en su orden, con su `nombre` y su `id` tal cual.
 * - Sin snapshot o con uno que no cumple la v1: las tres columnas de nombre, sin las vacias y con
 *   `id: null`, que es lo que hoy se pinta de una fila vieja.
 *
 * Nunca resuelve un nombre a partir de un id: el cierre es una foto, y el nombre vivo del nodo puede
 * haber cambiado despues (R24).
 */
export function leerUbicacionCongelada(fila: FilaConUbicacionCongelada): Ruta {
  const snapshot = ubicacionSnapshotV1Schema.safeParse(fila.ubicacionSnapshot);
  if (snapshot.success) return snapshot.data.niveles.map((n) => ({ id: n.id, nombre: n.nombre }));
  return [fila.provinciaNombre, fila.cantonNombre, fila.distritoNombre]
    .filter((nombre): nombre is string => Boolean(nombre))
    .map((nombre) => ({ id: null, nombre }));
}
