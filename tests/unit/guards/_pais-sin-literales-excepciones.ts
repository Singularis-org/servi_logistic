/**
 * SLT-42 · R29 — los archivos de servidor que AUN contienen un literal del pais (la zona
 * `America/Costa_Rica`, un desfase fijo de Costa Rica o el prefijo `506`) o importan un envoltorio
 * `*-cr`. Cada uno lleva la ficha que lo retira y el motivo.
 *
 * La lista SOLO BAJA: `TOPE_EXCEPCIONES` es su largo de hoy y la guardia falla si crece. Si un
 * archivo deja de necesitar su entrada, la guardia exige quitarla (y conviene bajar el tope).
 *
 * Unica subida, decidida por el humano el 2026-11-06 (`progress/features/SLT-42.md > Decisiones`,
 * «tras bloque 7»): los tres archivos de `lib/planes/` pasan a una ficha de planes, que los lleva a la
 * zona de cada empresa; a la vez se borro `whatsapp-telefono.ts`. El tope paso de 6 a 8. Al cierre de
 * SLT-42 el humano movio esa ficha de SLT-86 a SLT-90 («Planes: ciclo y cobro en la zona de cada empresa»).
 */

export type FichaQueLoRetira = "SLT-92" | "SLT-90" | "SL-22";

export interface ExcepcionPaisSinLiterales {
  /** Ruta relativa a la raiz, con `/`. */
  archivo: string;
  ficha: FichaQueLoRetira;
  motivo: string;
}

export const EXCEPCIONES_PAIS_SIN_LITERALES: readonly ExcepcionPaisSinLiterales[] = [
  {
    archivo: "lib/planes/ciclo.ts",
    ficha: "SLT-90",
    motivo: "planes: «hora de la plataforma» fija en CR (P8 de SL-24); la pasa a la zona de cada empresa SLT-90 (decision del humano, 2026-11-06; antes SLT-86)",
  },
  {
    archivo: "lib/planes/cobro.ts",
    ficha: "SLT-90",
    motivo: "planes: el siguiente cobro se cuenta en fechas de CR; lo pasa a la zona de cada empresa SLT-90 (decision del humano, 2026-11-06; antes SLT-86)",
  },
  {
    archivo: "lib/planes/consumo.ts",
    ficha: "SLT-90",
    motivo: "planes: la fecha del reinicio y del cambio pendiente, en CR; la pasa a la zona de cada empresa SLT-90 (decision del humano, 2026-11-06; antes SLT-86)",
  },
  {
    archivo: "lib/utils/fecha-cr.ts",
    ficha: "SLT-92",
    motivo: "envoltorio de CR sobre calendario-zona.ts que solo usa la UI (fechas en pantalla y filtros)",
  },
  {
    archivo: "lib/utils/hora-cr.ts",
    ficha: "SLT-92",
    motivo: "formato de hora en CR que solo usa la UI (analitica, cierres, mi wallet, planes)",
  },
  {
    archivo: "lib/utils/separador-dia-cr.ts",
    ficha: "SLT-92",
    motivo: "separador de dia de los hilos de chat, solo en la UI",
  },
  {
    archivo: "lib/utils/sinpe-cr.ts",
    ficha: "SL-22",
    motivo: "el numero SINPE (+506) es un metodo de pago de Costa Rica: lo generaliza SL-22",
  },
  {
    archivo: "lib/utils/telefono-cr.ts",
    ficha: "SLT-92",
    motivo: "envoltorio de CR sobre telefono-pais.ts para los botones de contacto y el chat de la UI",
  },
];

export const TOPE_EXCEPCIONES = 8;
