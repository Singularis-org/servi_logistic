/**
 * SLT-42 · R29 — los archivos de servidor que AUN contienen un literal del pais (la zona
 * `America/Costa_Rica`, un desfase fijo de Costa Rica o el prefijo `506`) o importan un envoltorio
 * `*-cr`. Cada uno lleva la ficha que lo retira y el motivo.
 *
 * La lista SOLO BAJA: `TOPE_EXCEPCIONES` es su largo de hoy y la guardia falla si crece. Si un
 * archivo deja de necesitar su entrada, la guardia exige quitarla (y conviene bajar el tope).
 */

export type FichaQueLoRetira = "SLT-81" | "SL-22";

export interface ExcepcionPaisSinLiterales {
  /** Ruta relativa a la raiz, con `/`. */
  archivo: string;
  ficha: FichaQueLoRetira;
  motivo: string;
}

export const EXCEPCIONES_PAIS_SIN_LITERALES: readonly ExcepcionPaisSinLiterales[] = [
  {
    archivo: "lib/utils/fecha-cr.ts",
    ficha: "SLT-81",
    motivo: "envoltorio de CR sobre calendario-zona.ts que solo usa la UI (fechas en pantalla y filtros)",
  },
  {
    archivo: "lib/utils/hora-cr.ts",
    ficha: "SLT-81",
    motivo: "formato de hora en CR que solo usa la UI (analitica, cierres, mi wallet, planes)",
  },
  {
    archivo: "lib/utils/separador-dia-cr.ts",
    ficha: "SLT-81",
    motivo: "separador de dia de los hilos de chat, solo en la UI",
  },
  {
    archivo: "lib/utils/sinpe-cr.ts",
    ficha: "SL-22",
    motivo: "el numero SINPE (+506) es un metodo de pago de Costa Rica: lo generaliza SL-22",
  },
  {
    archivo: "lib/utils/telefono-cr.ts",
    ficha: "SLT-81",
    motivo: "envoltorio de CR sobre telefono-pais.ts para los botones de contacto y el chat de la UI",
  },
  {
    archivo: "lib/utils/whatsapp-telefono.ts",
    ficha: "SLT-81",
    motivo: "envoltorio de CR sobre telefono-pais.ts; sin consumidores de produccion, solo sus tests",
  },
];

export const TOPE_EXCEPCIONES = 6;

/**
 * Archivos de servidor con literales de CR que el spec de SLT-42 no resuelve sin una decision del
 * humano (`progress/impl_SLT-42.md > Tanda 6 · ajustes + bloque 7 > Preguntas abiertas`). NO son
 * excepciones de R29: la guardia los deja pasar mientras se decide y la lista solo puede bajar
 * (`TOPE_PENDIENTES`). Al decidir, cada uno se arregla o pasa a la lista de arriba con su ficha.
 */
export const PENDIENTES_DE_DECISION_SLT42: readonly { archivo: string; pregunta: string }[] = [
  {
    archivo: "lib/planes/ciclo.ts",
    pregunta: "planes: «hora de la plataforma» fija en CR (P8 de SL-24); el design dice que no se toca",
  },
  {
    archivo: "lib/planes/cobro.ts",
    pregunta: "planes: el siguiente cobro se cuenta en fechas de CR (hora de la plataforma)",
  },
  {
    archivo: "lib/planes/consumo.ts",
    pregunta: "planes: la fecha del reinicio y del cambio pendiente, en CR (hora de la plataforma)",
  },
  {
    archivo: "lib/repositories/ConteoCargadasPorDiaRepository.ts",
    pregunta: "dia de agrupacion en SQL por desfase fijo de CR: pasarlo por zona rompe R23 con horario de verano",
  },
  {
    archivo: "lib/repositories/FinanzasDiarioRepository.ts",
    pregunta: "dia de agrupacion en SQL por desfase fijo de CR: pasarlo por zona rompe R23 con horario de verano",
  },
];

export const TOPE_PENDIENTES = 5;
