/**
 * SLT-42 · R29 y SL-21 · R20 — los archivos de servidor que AUN contienen un literal del pais o lo
 * dan por supuesto: la zona `America/Costa_Rica`, un desfase fijo de Costa Rica, el prefijo `506`, un
 * import de un envoltorio `*-cr`, el simbolo «₡», el codigo `CRC`, la palabra `IVA` o un import de un
 * formateador que usa la moneda de la plataforma sin nombrarla. Cada uno lleva la ficha que lo retira
 * y el motivo; `permanente` es lo que no se retira nunca, y su motivo lleva la fecha de la decision.
 *
 * La lista SOLO BAJA: `TOPE_EXCEPCIONES` es su largo de hoy y la guardia falla si crece. Si un
 * archivo deja de necesitar su entrada, la guardia exige quitarla (y conviene bajar el tope).
 *
 * Subidas, cada una decidida por el humano:
 * - 2026-11-06 (`progress/features/SLT-42.md > Decisiones`, «tras bloque 7»): los tres archivos de
 *   `lib/planes/` pasan a una ficha de planes, que los lleva a la zona de cada empresa; a la vez se
 *   borro `whatsapp-telefono.ts`. El tope paso de 6 a 8. Al cierre de SLT-42 el humano movio esa ficha
 *   de SLT-86 a SLT-90 («Planes: ciclo y cobro en la zona de cada empresa»).
 * - 2026-11-20 (SL-21, design §7): el censo gana la moneda y el impuesto. Las pantallas y la vista
 *   previa pasan a SLT-235, la moneda de los planes a SLT-237 y la OpenAPI queda `permanente`. El tope
 *   pasa de 8 a 20, el recuento exacto de la guardia al cerrar T5.1.
 */

export type FichaQueLoRetira = "SLT-81" | "SLT-90" | "SL-22" | "SLT-235" | "SLT-237" | "permanente";

export interface ExcepcionPaisSinLiterales {
  /** Ruta relativa a la raiz, con `/`. */
  archivo: string;
  ficha: FichaQueLoRetira;
  motivo: string;
}

export const EXCEPCIONES_PAIS_SIN_LITERALES: readonly ExcepcionPaisSinLiterales[] = [
  {
    archivo: "app/paquete/[numGuia]/page.tsx",
    ficha: "SLT-235",
    motivo: "pagina publica de rastreo: pinta el monto a cobrar con `formatMonto` (moneda de la plataforma); la pasa a la del pais SLT-235",
  },
  {
    archivo: "lib/analytics/metrics.ts",
    ficha: "SLT-235",
    motivo: "rotulos y descripciones de las metricas de analitica con «IVA» (pantalla); los toma del pais SLT-235",
  },
  {
    archivo: "lib/api/openapi-spec.ts",
    ficha: "permanente",
    motivo: "documento OpenAPI estatico, publico y comun a todas las empresas: sus descripciones dicen «IVA» (decision del humano, 2026-11-20)",
  },
  {
    archivo: "lib/config/moneda.ts",
    ficha: "SLT-237",
    motivo: "valores por defecto de la moneda de la plataforma (`CRC`, «₡»), que es la de los planes hasta que SLT-237 les ponga precio por moneda",
  },
  {
    archivo: "lib/constants/impuesto-rotulo.ts",
    ficha: "SLT-235",
    motivo: "`IMPUESTO_ROTULO = \"IVA\"`: rotulo de pantalla (wallet, detalle de cierres); SLT-235 lo toma del pais",
  },
  {
    archivo: "lib/constants/wallet-rotulos.ts",
    ficha: "SLT-235",
    motivo: "rotulos de los movimientos de la wallet con «IVA» (pantalla); los toma del pais SLT-235",
  },
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
    archivo: "lib/repositories/TarifaValorRepository.ts",
    ficha: "SLT-235",
    motivo: "texto «IVA 13.00» del historial de tarifas, que se pinta en pantalla (decision del humano, 2026-11-20)",
  },
  {
    archivo: "lib/repositories/_shared/resolver-tarifas.ts",
    ficha: "SLT-235",
    motivo: "mensaje interno de error «no tiene IVA» del resolver de tarifas; lo nombra con el impuesto del pais SLT-235",
  },
  {
    archivo: "lib/services/AnaliticaFinancieraService.ts",
    ficha: "SLT-235",
    motivo: "`monedaConfig.currency` en el DTO que pintan las pantallas de analitica financiera; la moneda del pais la pone SLT-235",
  },
  {
    archivo: "lib/types/plantilla-datos.ts",
    ficha: "SLT-235",
    motivo: "ejemplo «₡12.500» del selector de variables y la moneda de la plataforma por defecto de la vista previa en el navegador; la pasa a la del pais SLT-235",
  },
  {
    archivo: "lib/types/tarifa-flexible.ts",
    ficha: "SLT-235",
    motivo: "mensaje de validacion «El IVA debe ser…» del formulario de tarifas (pantalla); lo toma del pais SLT-235",
  },
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
    archivo: "lib/whatsapp-envios/informes/transito/informe.ts",
    ficha: "SLT-235",
    motivo: "ejemplo «₡322.900» de `por_cobrar` en el panel de variables (pantalla); el valor real ya sale en la moneda del pais",
  },
];

export const TOPE_EXCEPCIONES = 20;
