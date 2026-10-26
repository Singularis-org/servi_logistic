import { AsyncLocalStorage } from "node:async_hooks";

import { PREFIJO, rastroDelError } from "./salida";

// SL-43 (medición del build de QA, 2026-10-26) — EN QUÉ PASO FALLÓ LA DEMO.
//
// El build de QA cayó con `PrismaClientKnownRequestError P2028` y nada más: la salida no imprime el
// mensaje de la base (R5), y con A y B y sus tramos a la vez no había forma de saber qué paso era.
// Cada paso de la receta corre dentro de `enPaso(nombre, …)`, que apila su nombre; el error sale
// envuelto UNA vez, por el paso más interno, con la ruta entera:
//
//   [demo-qa] FALLÓ la demo en «demo-qa-a › tramos › mensajero-central › gestionar(entregado)»:
//   PrismaClientKnownRequestError P2028, timeout de la transacción (FalloDePaso P2028)
//
// La ruta solo lleva nombres de paso, de servicio, de perfil y de estado: nunca un dato.

const rutaActual = new AsyncLocalStorage<readonly string[]>();

/** El error de un paso: su ruta y la causa. `cause` lleva el error original (para `rastroDelError`). */
export class FalloDePaso extends Error {
  readonly ruta: readonly string[];

  constructor(ruta: readonly string[], causa: unknown) {
    super(`${PREFIJO} FALLÓ la demo en «${ruta.join(" › ")}»: ${describirCausa(causa)}`, { cause: causa });
    this.name = "FalloDePaso";
    this.ruta = ruta;
  }
}

/**
 * La causa, sin datos. Un error de la propia demo (`[demo-qa] …`) trae un texto fijo o con nombres:
 * va entero. Cualquier otro, solo su rastro (nombre, código y, en un P2028, cuál de los dos tiempos).
 */
function describirCausa(causa: unknown): string {
  if (causa instanceof Error && causa.message.startsWith(`${PREFIJO} `)) return causa.message.slice(PREFIJO.length + 1);
  return rastroDelError(causa);
}

/** La ruta de pasos en curso (vacía fuera de cualquiera). */
export function rutaDePasos(): readonly string[] {
  return rutaActual.getStore() ?? [];
}

/**
 * `trabajo` como el paso `nombre`, dentro de los que ya estén en curso. Si falla, lanza un
 * `FalloDePaso` con la ruta hasta aquí; si lo que falló ya era un `FalloDePaso` (de un paso más
 * interno), lo deja pasar tal cual: manda el paso más concreto.
 */
export async function enPaso<T>(nombre: string, trabajo: () => Promise<T>): Promise<T> {
  const ruta = [...rutaDePasos(), nombre];
  try {
    return await rutaActual.run(ruta, trabajo);
  } catch (error) {
    if (error instanceof FalloDePaso) throw error;
    throw new FalloDePaso(ruta, error);
  }
}
