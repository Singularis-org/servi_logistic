// FICHA 441 — LA MADUREZ DE UNA COHORTE, Y CUANDO UN PORCENTAJE NO SE PUEDE ESCRIBIR.
// SLT-62 (2026-10-30) — el suelo de 20 se quito por decision del humano: el porcentaje se escribe
// siempre que haya al menos un desenlace.
//
// Modulo PURO: recibe numeros y devuelve numeros. Sin React, sin SWR, sin acciones y sin reloj.
// Es donde vive LA REGLA, y vive aqui —y no en un `if` dentro de un componente— por tres motivos
// que se pueden comprobar: la comparten el KPI principal y las pantallas de tienda y satelite
// (ficha 443), se prueba sin renderizar nada, y la decision de no escribir una cifra tiene UN
// solo origen.
//
// ─── EL PROBLEMA, Y POR QUE NO SE ARREGLA SOLO CAMBIANDO LA VENTANA ─────────────────────
//
// Con la ventana ya puesta sobre la fecha de CARGA (ficha 441, `ventanaDeCarga`), el KPI contesta
// por fin «de las cargadas, cuantas ya se entregaron». Pero aparece la trampa de la direccion
// contraria, medida en produccion el 2026-09-17:
//
//   | cohorte        | cargadas | entregadas | % sobre cargadas | % sobre cerradas |
//   | -------------- | -------- | ---------- | ---------------- | ---------------- |
//   | hace  1 dia    |    75    |     11     |      14,7 %      |      64,7 %      |
//   | hace  3 dias   |   171    |     75     |      43,9 %      |      85,2 %      |
//   | hace  7 dias   |   186    |    101     |      54,3 %      |      82,1 %      |
//   | hace 14 dias   |    82    |     46     |      56,1 %      |      63,9 %      |
//
// **Una cohorte joven lee mal por ser joven, no por ir mal.** Si la pantalla solo cambiara el
// filtro, manana diria 14,7 % y pareceria que el negocio se hundio. Por eso esta funcion no
// devuelve un porcentaje: devuelve el porcentaje MAS su madurez —cuantas cerraron, cuantas siguen
// vivas— y, cuando no hay ningun desenlace que medir, la AUSENCIA con su motivo.
//
// ─── EL UNICO ESTADO EN QUE NO HAY PORCENTAJE ───────────────────────────────────────────
//
// **CERO CERRADAS.** Un porcentaje sobre cero no es un cero: es que no hay dato. El caso es real y
// medido —la zona Puntarenas tiene 0 de 27 cerradas—, y ahi «0,0 % de efectividad» no dice «va
// mal», dice una falsedad: nadie ha fallado 27 entregas, es que ninguna ha terminado. Ojo a lo que
// esta regla tapa: tambien el porcentaje sobre CARGADAS, aunque 0/27 sea una division
// perfectamente definida. Que se pueda dividir no significa que se pueda afirmar.
//
// La ausencia viaja con su motivo y no como un `null` a secas: la pantalla tiene que poder decir
// «0 de 27 tienen desenlace», y un `null` sin motivo obligaria a cada consumidor a re-deducirlo,
// con lo que la regla volveria a estar en el componente — que es lo que esta ficha viene a impedir.
//
// HISTORIA: la ficha 441 tenia un segundo estado, BASE DEMASIADO CHICA (menos de 20 ordenes en la
// base, derivado de una tolerancia de 5 puntos por orden). SLT-62 lo quito por decision del humano
// (2026-10-30): el recorte de un mensajero con 11 de 12 entregadas no daba porcentaje en la
// tarjeta y si 91,7 % en «Detalle gestion», y el cliente lo leyo como un fallo. El porcentaje se
// escribe siempre que haya al menos un desenlace, sin aviso de base pequena.
//
// ─── LO QUE ESTA FUNCION NO HACE ────────────────────────────────────────────────────────
//
// **No reparte el universo.** La particion en cubos ya existe y es de otro modulo
// (`calcularEfectividad`, que separa entregadas / rechazadas / otros desenlaces / en proceso sobre
// las MISMAS filas que pinta el desglose por status). Esta funcion recibe ese reparto ya hecho
// —por eso su entrada tiene los nombres exactos que aquel produce, y su resultado se le pasa
// entero— en vez de recontar por su cuenta. Una segunda particion de la misma poblacion es
// exactamente el defecto que la ficha 346 pago: dos reglas para el mismo reparto acaban
// discrepando, y el dia que discrepan nada se pone rojo.
//
// **No formatea.** Los porcentajes salen como FRACCION (0,538 = 53,8 %), que es lo que espera
// `formatearValor(_, "porcentaje")`. Ni un texto, ni un simbolo, ni un redondeo.

/** Por que no hay porcentaje. Nunca un `null` mudo: la pantalla dice una cosa u otra. */
export type MotivoSinPorcentaje =
  /** Ninguna orden de la cohorte ha llegado a un desenlace. No hay nada que medir todavia. */
  "sin_cerradas";

/**
 * El reparto de la cohorte, tal como lo devuelve `calcularEfectividad`.
 *
 * Los nombres son los suyos A PROPOSITO: asi el resultado de aquella funcion se pasa entero, sin
 * que nadie tenga que elegir que campo va en que hueco —que es donde se cuelan los numeros
 * cruzados—. Es un tipo ESTRUCTURAL: este modulo no importa nada de la pantalla.
 */
export interface RepartoDeOrdenes {
  /** El universo del recorte. Con la ventana de carga, son las ordenes CARGADAS en el periodo. */
  readonly total: number;
  /** Ordenes cuyo ultimo desenlace es `entregada`. El numerador de las dos cifras. */
  readonly entregadas: number;
  /** Ordenes que todavia NO tienen desenlace: siguen vivas. */
  readonly enProceso: number;
}

/** Un porcentaje con su base, o su ausencia con el motivo. Nunca las dos cosas a la vez. */
export interface PorcentajeDeEntrega {
  /** FRACCION en `[0,1]`, o `null` si no se puede afirmar. Ver `motivo`. */
  readonly valor: number | null;
  /** El denominador sobre el que se calculo —o se habria calculado—. Siempre viaja (ficha 360). */
  readonly base: number;
  /** `null` exactamente cuando `valor` no lo es. */
  readonly motivo: MotivoSinPorcentaje | null;
}

/** Todo lo que la tarjeta heroe necesita, ya derivado. */
export interface MadurezDeCohorte {
  /** Ordenes cargadas en el periodo. Es `total` del reparto, renombrado a lo que significa. */
  readonly cargadas: number;
  readonly entregadas: number;
  /** Ordenes que YA tienen desenlace: `cargadas - vivas`. */
  readonly cerradas: number;
  /** Ordenes todavia sin desenlace. Es `enProceso` del reparto. */
  readonly vivas: number;
  /** Cerradas que NO son entregadas. El tramo del medio de la barra de madurez. */
  readonly otroDesenlace: number;
  /**
   * `true` mientras queden ordenes vivas: el periodo TODAVIA SE ESTA CERRANDO y su porcentaje
   * sobre cargadas solo puede subir. Es el hecho que la pantalla tiene que decir en voz alta,
   * porque es lo que distingue «va mal» de «es joven».
   */
  readonly enCurso: boolean;
  /** Entregadas / cargadas. EL numero que pidio el humano: «de las cargadas, cuantas llegaron». */
  readonly sobreCargadas: PorcentajeDeEntrega;
  /**
   * Entregadas / cerradas. La cifra que NO castiga a la cohorte por ser joven, y por eso va al
   * lado de la otra y nunca en su lugar: sola, esconde que medio lote sigue en la calle.
   */
  readonly sobreCerradas: PorcentajeDeEntrega;
}

/** El porcentaje, o su ausencia. `motivoComun` es el unico motivo posible. */
function porcentaje(
  numerador: number,
  base: number,
  motivoComun: MotivoSinPorcentaje | null,
): PorcentajeDeEntrega {
  // Con `motivoComun` nulo hay al menos un desenlace, asi que las dos bases (cargadas y
  // cerradas) son >= 1: no hay division por cero que cubrir. Sin suelo de base desde SLT-62.
  if (motivoComun !== null) return { valor: null, base, motivo: motivoComun };
  return { valor: numerador / base, base, motivo: null };
}

/**
 * Deriva la madurez de la cohorte y decide si cada porcentaje se puede escribir.
 *
 * ⚠ LANZA ante un reparto IMPOSIBLE (negativos, mas vivas que ordenes, mas entregadas que
 * cerradas) en vez de devolver una cifra plausible. Es un fallo de programacion, no un caso de
 * negocio: la unica fuente legitima de esta entrada es `calcularEfectividad`, cuya particion
 * garantiza la coherencia y esta medida sobre las 16.384 combinaciones del catalogo en
 * `tests/unit/analytics/efectividad-suma.test.ts`. Tragarselo en silencio pintaria un 120 % —o
 * peor, un numero creible— y nadie sabria de donde salio.
 */
export function evaluarMadurezDeCohorte(reparto: RepartoDeOrdenes): MadurezDeCohorte {
  const { total: cargadas, entregadas, enProceso: vivas } = reparto;
  const cerradas = cargadas - vivas;

  if (cargadas < 0 || entregadas < 0 || vivas < 0 || cerradas < 0 || entregadas > cerradas) {
    throw new Error(
      "evaluarMadurezDeCohorte: reparto incoherente " +
        `(cargadas=${cargadas}, entregadas=${entregadas}, vivas=${vivas}). ` +
        "La entrada debe venir de `calcularEfectividad` sin recomponerse por el camino.",
    );
  }

  // CERO CERRADAS tapa LAS DOS cifras, tambien la de sobre-cargadas
  // (que seria un 0/27 perfectamente calculable y perfectamente enganoso). Ver la cabecera.
  const motivoComun: MotivoSinPorcentaje | null = cerradas === 0 ? "sin_cerradas" : null;

  return {
    cargadas,
    entregadas,
    cerradas,
    vivas,
    otroDesenlace: cerradas - entregadas,
    enCurso: vivas > 0,
    sobreCargadas: porcentaje(entregadas, cargadas, motivoComun),
    sobreCerradas: porcentaje(entregadas, cerradas, motivoComun),
  };
}
