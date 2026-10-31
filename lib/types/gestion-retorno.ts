import type { GestionResultado } from "@prisma/client";

// Feature 238 (design §2, R1/R3/R5) — EL PUNTO UNICO de «que paquete vuelve fisicamente a
// bodega». Lo leen los tres consumidores sin copia: el REPOSITORIO (el WHERE de la lectura del
// conjunto esperado y el de la escritura de la marca), el SERVICIO (la cobertura exacta) y la
// PANTALLA (que filas pinta la ventana de confirmacion).
//
// MODULO PURO: sin Prisma en runtime (solo el `type` del enum, que se borra en compilacion), sin
// servicios, sin `@/lib/db`, sin `next/*`. Se puede importar desde un Client Component sin
// arrastrar servidor. Mismo molde que `lib/types/gestion-destino.ts` (239).

/**
 * R1/R3/R5 — que resultado de gestion devuelve el PAQUETE a bodega. **Punto unico de la regla.**
 *
 * `Record<GestionResultado, boolean>` es exhaustivo A PROPOSITO: si el enum gana un sexto
 * resultado, esto NO COMPILA hasta que alguien decida si su paquete vuelve. Sin esa red, un
 * resultado nuevo caeria en `undefined` -> falsy -> se excluiria del bloqueo EN SILENCIO, que es
 * justo la forma que tiene este fallo de aparecer: nadie ve el hueco, se ve un cierre que se
 * aprueba sin escanear.
 *
 * `incidente: false` esta DECLARADO CON SU RAZON, no omitido: el paquete perdido, robado o
 * danado NO vuelve — se indemniza (feature 158). Es la decision humana firmada del 2026-08-19
 * (`progress/design_pila_ayuda_tienda.md`, decision 3, y `requirements.md` §PUERTA HUMANA). NO
 * «arreglar» poniendolo a `true`: eso bloquearia el cierre exigiendo escanear un paquete que no
 * existe, y dejaria cierres imposibles de aprobar.
 *
 * POR QUE UN `Record` TOTAL Y NO UNA LISTA. Una lista (`["novedad","devolucion_a_origen_por_rechazo","reprogramado"]`)
 * expresa lo que entra y CALLA lo que queda fuera; ese silencio es exactamente lo que hace que la
 * exclusion de los incidentes «parezca un olvido» (R34) y lo que deja pasar un resultado nuevo.
 * El `Record` obliga a nombrar los cinco y a poner el `false` con su comentario; la lista se
 * DERIVA de el.
 */
export const RETORNA_A_BODEGA = {
  entregado: false, // se quedo con el cliente
  reprogramado: true, // vuelve a bodega y espera su fecha (liberacion_reprogramada, 46)
  novedad: true,
  devolucion_a_origen_por_rechazo: true,
  incidente: false, // perdido / robado / danado: no vuelve, se indemniza (158)
} as const satisfies Record<GestionResultado, boolean>;

/**
 * R2 — los resultados cuyo paquete vuelve, DERIVADOS del `Record` de arriba.
 *
 * Se deriva y no se escribe: un segundo literal seria una segunda verdad que puede divergir del
 * `Record` sin que nada lo diga, y la guardia `confirmacion-incidentes-excluidos` existe
 * precisamente para que no aparezca ninguna copia suelta en el arbol.
 */
export const RESULTADOS_QUE_VUELVEN: readonly GestionResultado[] = (
  Object.keys(RETORNA_A_BODEGA) as GestionResultado[]
).filter((r) => RETORNA_A_BODEGA[r]);

/**
 * R1 — ¿el paquete de esta gestion vuelve a bodega?
 *
 * Funcion y no acceso directo al objeto para que el call-site lea como una decision («¿este
 * paquete vuelve?») y no como una consulta a un mapa. Mismo criterio que
 * `estatusDestinoDeResultado` (239).
 */
export function vuelveABodega(resultado: GestionResultado): boolean {
  return RETORNA_A_BODEGA[resultado];
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Ficha 451 / SLT-72 (design §2, R1/R3/R4) — EL SEGUNDO EJE: el ORIGEN del paquete.
//
// Desde la 451 este modulo cubre DOS origenes de paquete que vuelven a bodega: las GESTIONES del
// cierre (eje de arriba, intacto) y las ordenes que el corte diario BARRIO sin gestionar
// (`cierre_sin_gestion`, 264). Una barrida no tiene `resultado`, asi que no cabe en
// `Record<GestionResultado, boolean>`; meterla ahi obligaria a relajar ese `satisfies` y se
// perderia la red que lo protege (design §9-A). Por eso es un eje HERMANO, con su propia red, en
// el MISMO modulo: sigue habiendo un solo sitio donde se decide «que vuelve».
//
// El nombre del archivo se conserva aunque se quede corto (design §9-E): renombrarlo toca una
// guardia, el spec de la 238 y sus importadores para cero cambio de comportamiento.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Ficha 451 — de donde sale una fila que el cierre pone delante de bodega. */
export type OrigenDelPaquete = "gestion" | "barrida";

/**
 * Ficha 451 (R1/R3) — QUE VUELVE, POR ORIGEN. Hermano de `RETORNA_A_BODEGA` y con su misma red:
 * `satisfies Record<OrigenDelPaquete, ...>` es exhaustivo A PROPOSITO. Un tercer origen NO
 * COMPILA hasta que alguien decida si su paquete vuelve.
 *
 * `gestion: "segun_resultado"` NO duplica la regla (R4): delega en `RETORNA_A_BODEGA`, que sigue
 * siendo el unico sitio donde se decide resultado por resultado. `"nunca"` existe declarado aunque
 * hoy no lo use nadie: es el hueco donde un origen futuro que NO vuelva se escribe con su razon,
 * en vez de caer en un `undefined` falsy — el mismo argumento con el que la 238 eligio `Record`
 * sobre lista.
 */
export const RETORNO_POR_ORIGEN = {
  // depende del resultado; lo decide RETORNA_A_BODEGA, no esta tabla
  gestion: "segun_resultado",
  // SIEMPRE. La orden estaba `en_reparto`/`ayuda_tienda` cuando vencio el cierre: el bulto esta
  // fisicamente en manos del mensajero y vuelve, vaya luego a bodega (109) o a `rechazada` (276).
  // Decision humana firmada el 2026-09-21 (ficha 451) y reiterada el 2026-10-31 (SLT-72).
  barrida: "siempre",
} as const satisfies Record<OrigenDelPaquete, "siempre" | "nunca" | "segun_resultado">;

/** Ficha 451 — una fila del cierre, identificada por su ORIGEN. Union discriminada: no hay tercer estado. */
export type PaqueteDelCierre =
  | { readonly origen: "gestion"; readonly resultado: GestionResultado }
  | { readonly origen: "barrida" };

/**
 * Ficha 451 (R1) — ¿este paquete vuelve a bodega? LOS DOS origenes, una sola funcion. El `switch`
 * sin `default` es deliberado: con `strict`, un origen nuevo sin su rama deja la funcion sin
 * `return` en un camino y no compila.
 */
export function vuelveABodegaElPaquete(p: PaqueteDelCierre): boolean {
  switch (p.origen) {
    case "gestion":
      return vuelveABodega(p.resultado); // RETORNO_POR_ORIGEN.gestion === "segun_resultado"
    case "barrida":
      return RETORNO_POR_ORIGEN.barrida === "siempre";
  }
}
