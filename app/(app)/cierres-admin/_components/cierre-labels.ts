/**
 * Feature 170 (tanda E) — etiquetas de texto de los cierres, en un módulo PURO.
 *
 * Todas estas constantes vivían en `cierre-detalle-shared.tsx`, que importa `Card`, `Badge`,
 * `Modal` y `DataTable`. Los módulos de columnas de export tienen que ser puros (design §3:
 * «sin React, sin DOM»), así que se PROMOVIERON aquí SIN EDITAR NI UN TEXTO —misma operación
 * que hizo la tanda B con `usuario-estado-label` y `ROL_LABELS`— y `cierre-detalle-shared`
 * las RE-EXPORTA: ningún consumidor de los que ya existían cambia una línea.
 *
 * Que el archivo descargado y la pantalla digan lo mismo (R8/R24) es cierto porque leen del
 * MISMO sitio, no porque hoy coincidan dos literales escritos en dos archivos.
 */
import type {
  CierreDetalleGestion,
  CierreResultado,
  IngresoEmpresaDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreDestinoTipo, CierreEstado } from "@/lib/types/cierre";
import type { ParteDeTienda } from "@/lib/types/parte-de-tienda";
import { EMPRESA } from "@/lib/config/marca";
// FICHA 408 — los dos módulos del vocabulario de la causa de devolución. Los DOS son PUROS
// (sin React, sin DOM), así que este archivo lo sigue siendo. El precedente de importar
// etiquetas desde `mis-asignaciones/_components` está escrito en `cierre-detalle-shared.tsx`
// (`CAUSA_INCIDENTE_LABEL`), y el vocabulario es el aprobado el 2026-07-15 (feature 73).
import { CAUSA_DEVOLUCION_LABEL } from "@/app/(app)/mis-asignaciones/_components/causa-devolucion-options";
// SL-39 (menor 6 de la revisión) — el nombre del impuesto vive en UN sitio, el mismo que lee la
// wallet. El módulo no tiene dependencias, así que este archivo sigue siendo puro y el bundle del
// panel no arrastra el cliente de Prisma que trae `wallet-labels` (`pagos-captura.guardia`, R19).
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import { CAUSA_DEVOLUCION_SEED } from "@/lib/types/causa-devolucion";
import { nombreDeResultado } from "@/lib/types/gestion-resultado";

// --- Etiquetas i18n-ready (texto separado de la lógica) ---

/**
 * FICHA 455 (2026-09-24, design §2.1; R4/R5): el resultado de una gestión se rotula con el nombre
 * EXACTO de su estado homónimo (`nombreDeResultado`, la fuente única) en TODOS los sitios: la
 * pestaña/sección de la pantalla, la celda de la descarga, la confirmación física y el wallet.
 *
 * Hasta la 455 había DOS mapas escritos a mano: `RESULTADO_LABEL` en plural para las secciones
 * («Entregadas», «Devueltas», «Rechazadas») y `RESULTADO_FILA_LABEL` en singular para las celdas
 * (feature 230). Con un solo nombre por estado (R2: «sin plural») vuelven a ser UNO: la pestaña y
 * la columna de la descarga dicen exactamente lo mismo. `RESULTADO_FILA_LABEL` se conserva como
 * alias del mismo objeto para sus consumidores.
 */
export const RESULTADO_LABEL: Readonly<Record<CierreResultado, string>> = {
  entregado: nombreDeResultado("entregado"),
  reprogramado: nombreDeResultado("reprogramado"),
  novedad: nombreDeResultado("novedad"),
  devolucion_a_origen_por_rechazo: nombreDeResultado("devolucion_a_origen_por_rechazo"),
  incidente: nombreDeResultado("incidente"), // feature 158/R18
};

/**
 * FICHA 456 (design §5.2): el título de una sección o pestaña que CUENTA gestiones de un resultado
 * («Entregado (3)»). Es un rótulo de recuento: no lleva botón de información (cada fila sí).
 */
export function tituloResultadoConCifra(resultado: CierreResultado, cuantas: number): string {
  return `${RESULTADO_LABEL[resultado]} (${cuantas})`;
}

/** Alias de `RESULTADO_LABEL` (feature 230; R45: la celda es SIEMPRE esta etiqueta, nunca el enum). */
export const RESULTADO_FILA_LABEL: Readonly<Record<CierreResultado, string>> = RESULTADO_LABEL;

/**
 * FICHA 455 (2026-09-24, R5): el texto de la sección VACÍA de un resultado, con su nombre exacto.
 * Antes era un mapa escrito a mano en cada detalle («No hay devoluciones.» para `novedad`, «No hay
 * rechazos.» para la devolución a origen por rechazo): otro vocabulario para el mismo estado.
 */
export function textoResultadoVacio(resultado: CierreResultado): string {
  return `No hay gestiones con resultado «${RESULTADO_LABEL[resultado]}».`;
}

/** El texto vacío de cada resultado (feature 158/R18: `incidente` incluido), derivado de arriba. */
export const RESULTADO_VACIO: Readonly<Record<CierreResultado, string>> = {
  entregado: textoResultadoVacio("entregado"),
  reprogramado: textoResultadoVacio("reprogramado"),
  novedad: textoResultadoVacio("novedad"),
  devolucion_a_origen_por_rechazo: textoResultadoVacio("devolucion_a_origen_por_rechazo"),
  incidente: textoResultadoVacio("incidente"),
};

/** Vive en `lib/constants/metodo-pago-label.ts` desde la 458-A (lo lee tambien un servicio). */
export { METODO_LABEL } from "@/lib/constants/metodo-pago-label";

export const ESTADO_LABEL: Record<CierreEstado, string> = {
  solicitado: "Solicitado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  vencido: "Vencido", // feature 41: etiqueta minima; el tratamiento diferenciado (R20) lo hace frontend_dev
};

/**
 * FICHA 386 — los nombres de las DOS listas en que `/cierres-admin` parte los cierres del día:
 * las pestañas «Pendientes» y «Resueltos».
 *
 * Vivían como literales privados de `CierresAdminModule`. Salen aquí —el módulo PURO de textos
 * de cierres, y por el mismo motivo por el que salió `DESTINO_TIPO_LABEL`— porque desde esta
 * ficha los necesita un SEGUNDO archivo: `FiltrosCierresBarra` agrupa las opciones del filtro de
 * estado por la lista en la que ese estado aparece, y el rótulo de cada grupo tiene que ser LA
 * MISMA palabra que el usuario lee en la pestaña. Dos literales iguales escritos en dos archivos
 * se separan en cuanto alguien renombre una pestaña, y entonces el filtro mandaría al usuario a
 * una lista que ya no se llama así.
 *
 * ⚠️ NO son los nombres de las pestañas de las pantallas de BODEGA (`CierresBodegaAdminModule`
 * dice «Pendientes»/«Resueltos» pero `ConsolidacionBodegaModule` dice «A consolidar»/
 * «Solicitados»): esos siguen siendo suyos, porque parten otro conjunto por otro criterio.
 */
export const TAB_PENDIENTES_LABEL = "Pendientes";
export const TAB_RESUELTOS_LABEL = "Resueltos";

/**
 * Destino de un cierre. Estaba DUPLICADA palabra por palabra en `CierresAdminModule` y en
 * `CierreDiaModule`; los dos la leen ahora de aquí, que es lo que hace cierto que el archivo
 * y las dos pantallas digan lo mismo (R8).
 */
export const DESTINO_TIPO_LABEL: Record<CierreDestinoTipo, string> = {
  bodega_central: "Bodega central",
  bodega_satelite: "Bodega satélite",
};

/**
 * Feature 170 — FASE 2 (T I.2): destino LEGIBLE de un cierre (tipo + zona), la línea que
 * pintan la columna «Destino» y la celda del archivo.
 *
 * Estaba escrita tres veces con el mismo texto: en `CierresAdminModule`, en
 * `cierres-admin-descarga-columnas` y —al partir el histórico en su propio componente— habría
 * llegado a cuatro. Sale aquí, junto al mapa del que depende, por el mismo motivo que salió
 * `DESTINO_TIPO_LABEL`: que la pantalla y el archivo no puedan decir cosas distintas (R8).
 */
export function destinoCierre(cierre: {
  destinoTipo: CierreDestinoTipo;
  destinoZonaNombre: string;
}): string {
  return `${DESTINO_TIPO_LABEL[cierre.destinoTipo] ?? cierre.destinoTipo} · ${cierre.destinoZonaNombre}`;
}

// --- Feature 39: etiquetas del pago al mensajero (texto separado, i18n-ready) ---
export const PAGO_MENSAJERO_COL = "Pago mensajero";
// --- Feature 56: etiquetas del ingreso de bodega por rechazos (texto separado, i18n-ready) ---
export const INGRESO_BODEGA_RECHAZOS_COL = "Ingreso bodega";
// --- Feature 102 (R9): marca por fila del ORIGEN de un rechazo ---
export const RECHAZO_ORIGEN_COL = "Origen";
export const RECHAZO_SLA_BADGE_LABEL = "Automático";
export const RECHAZO_MANUAL_BADGE_LABEL = "Manual";

// ---------------------------------------------------------------------------
// FEATURE 237 (R41, D6) — LA FILA DICE QUIEN LA REGISTRO.
//
// Los DOS textos se declararon en `cierre-dia/_components/CierreDiaModule.tsx` y la FICHA 414 los
// MUDA aquí, al módulo PURO, SIN cambiar ni un carácter: el comprobante (`cierre-factura.tsx`)
// también tiene que decirlo, y no puede pedírselos a `CierreDiaModule` —ese módulo ya importa
// `CierreFacturaDetalle`, así que la vuelta sería un ciclo—. Copiar los literales está descartado
// (414/R9): dos copias del mismo texto de cara al usuario divergen a la primera corrección, y la
// regla de esta familia es que las superficies digan lo mismo PORQUE LEEN DEL MISMO SITIO.
//
// Que NO esté la marca significa que la gestión la registró el mensajero. NO es «no lo sé»:
// `desdeAyudaTienda` es obligatorio en el DTO y se deriva del historial, que nace en la MISMA
// transacción que la gestión (`lib/utils/gestion-de-la-tienda-flag.ts`). La ausencia es una
// afirmación, y por eso su test va emparejado con el de la presencia.
// ---------------------------------------------------------------------------

/** Rotulo de la marca. Dice QUIEN, no solo que la fila es distinta, y cabe en una celda apretada. */
export const GESTION_TIENDA_BADGE_LABEL = "La tienda";

/**
 * La nota accesible del badge (`title` + `aria-label`). El rotulo dice quien; la nota dice lo que el
 * mensajero necesita para explicarla si le preguntan: desde donde se hizo, que el motivo y la foto
 * no son suyos, y que aun asi cuenta en este cierre.
 */
export const GESTION_TIENDA_BADGE_NOTA =
  "Esta gestión la registró la tienda desde «Ayuda solicitada», no tú: el motivo y la foto son suyos. Cuenta en tu cierre igual.";

// --- Desglose del ingreso de la empresa por orden (texto separado, i18n-ready) ---
export const MONTO_COBRAR_COL = "A cobrar";
// Monto FIJO de fulfillment de la tarifa CONGELADA del cierre (2026-08-19). No es un concepto
// derivado: no se suma al «Total de la empresa» ni a las wallets. Vacío en los cierres anteriores a
// la columna `cierre_detail.tarifa_fulfillment`.
export const FULFILLMENT_COL = "Fulfillment";
// Conceptos AGRUPADOS (cada uno con su IVA incluido): así se leen en tablas y paneles.
export const FLETE_CON_IVA_LABEL = "Flete + IVA";
export const COMISION_CON_IVA_LABEL = "Comisión + IVA";
/** SLT-244 (R6): con el nombre del impuesto del país. La constante es el rótulo de la plataforma. */
export function fleteDevConImpuestoLabel(impuesto: string): string {
  return `Flete por devolución a origen + ${impuesto}`;
}
export const FLETE_DEV_CON_IVA_LABEL = fleteDevConImpuestoLabel(IMPUESTO_ROTULO);
// SLT-54 (R65): en el modelo nuevo ese mismo concepto suma también reprogramado, novedad e incidente
// (SLT-52 R29). Llamarlo «devolución a origen» diría que se cobró una que no hubo.
export const FLETE_NO_ENTREGADAS_LABEL = "Flete de gestiones no entregadas";
/** SLT-244 (R6): con el nombre del impuesto del país. La constante es el rótulo de la plataforma. */
export function fleteNoEntregadasConImpuestoLabel(impuesto: string): string {
  return `${FLETE_NO_ENTREGADAS_LABEL} + ${impuesto}`;
}
export const FLETE_NO_ENTREGADAS_CON_IVA_LABEL = fleteNoEntregadasConImpuestoLabel(IMPUESTO_ROTULO);
// Menor 2 de la revisión F2.2: en el nuevo tampoco se descuentan los fletes de reprogramado, novedad e
// incidente. `PAGO_TIENDA_NOTA` es cierta y completa solo en el viejo, donde esos no se cobran.
export const PAGO_TIENDA_NOTA_MODELO_NUEVO =
  "Total general menos flete + IVA y comisión + IVA. No descuenta el flete de una gestión no entregada: no recauda contra entrega, así que ese dinero nunca entró en el total general.";
/**
 * El flete que no es de entrega de UNA gestión del modelo nuevo, por el resultado que lo cobró. El nombre
 * sale de la fuente única (ficha 455) y coincide con las filas de Tarifas. El rechazo conserva el nombre
 * de la ficha 466, el mismo del viejo.
 */
export function fleteNoEntregaLabel(resultado: CierreResultado): string {
  if (resultado === "entregado") return FLETE_NO_ENTREGADAS_LABEL;
  if (resultado === "devolucion_a_origen_por_rechazo") return "Flete por devolución a origen";
  return `Flete por ${nombreDeResultado(resultado).toLowerCase()}`;
}
/** Su impuesto, en la forma de `impuestoFleteRechazoLabel`. SLT-244 (R6): con el del país. */
export function impuestoFleteNoEntregaLabel(resultado: CierreResultado, impuesto: string): string {
  const nombre = fleteNoEntregaLabel(resultado);
  return `${impuesto} del ${nombre.charAt(0).toLowerCase()}${nombre.slice(1)}`;
}
/** Su IVA, en la forma de `IVA_FLETE_RECHAZO_LABEL` (el rótulo de la plataforma). */
export function ivaFleteNoEntregaLabel(resultado: CierreResultado): string {
  return impuestoFleteNoEntregaLabel(resultado, IMPUESTO_ROTULO);
}
/** R65, la fila de una gestión. En el viejo, el rótulo de siempre. SLT-244 (R6): con el impuesto del país. */
export function fleteDevConImpuestoDeGestion(
  g: Pick<CierreDetalleGestion, "resultado" | "ingresoEmpresa">,
  impuesto: string,
): string {
  return g.ingresoEmpresa?.tarifaModelo === "nuevo"
    ? `${fleteNoEntregaLabel(g.resultado)} + ${impuesto}`
    : fleteDevConImpuestoLabel(impuesto);
}
/** `fleteDevConImpuestoDeGestion` con el rótulo de la plataforma, para el código sin montar. */
export function fleteDevConIvaDeGestion(
  g: Pick<CierreDetalleGestion, "resultado" | "ingresoEmpresa">,
): string {
  return fleteDevConImpuestoDeGestion(g, IMPUESTO_ROTULO);
}
/**
 * R65, los totales: los paneles no reciben el modelo, y lo dicen sus gestiones. Basta con una: un cierre
 * de bodega puede agregar días a ambos lados de la activación, y «no entregadas» sigue siendo cierto
 * para los rechazos del viejo. La otra frase no lo sería para una novedad del nuevo.
 *
 * SLT-154 (R463, D1): sin acceso total `ingresoEmpresa` llega en `null` y el modelo viaja en
 * `tarifaModelo`; sin leerlo, la satélite perdería el modelo nuevo y sus notas dirían algo falso.
 */
export function hayGestionEnModeloNuevo(
  grupos: Readonly<
    Record<string, readonly Pick<CierreDetalleGestion, "ingresoEmpresa" | "tarifaModelo">[]>
  >,
): boolean {
  return Object.values(grupos).some((lista) =>
    lista.some((g) => (g.tarifaModelo ?? g.ingresoEmpresa?.tarifaModelo) === "nuevo"),
  );
}
/**
 * SLT-54 (R62) — el fulfillment que se enseña de una gestión. En el nuevo no hay fila de `tarifas`:
 * sale de `ing.fulfillment`. En el viejo sigue saliendo de la tarifa congelada porque `ing.fulfillment`
 * convierte en "0.00" el `null` de un cierre anterior a la columna, y esa celda hoy va vacía. `null`
 * también para quien no lo ve: el servidor ya se lo anuló (ficha 481).
 */
export function fulfillmentDeIngreso(
  ing: Pick<IngresoEmpresaDTO, "fulfillment" | "tarifa" | "tarifaModelo"> | null | undefined,
): string | null {
  if (!ing) return null;
  return ing.tarifaModelo === "nuevo" ? ing.fulfillment : (ing.tarifa?.fulfillment ?? null);
}
export const INGRESO_TOTAL_COL = `Total de ${EMPRESA.enFrase}`;
// --- Feature 158 (R34/R9/R19): columnas propias del grupo `incidente` (texto i18n-ready) ---
export const CAUSA_INCIDENTE_COL = "Causa";
export const INDEMNIZACION_COL = "Indemnización";

// ---------------------------------------------------------------------------
// Feature 393 (R33, design §5) — las DOS CASCADAS del cierre de bodega.
//
// Viven aquí, en el módulo PURO, y no en `cierre-detalle-shared.tsx`, por el mismo motivo que
// las de la tanda E: el archivo de la descarga necesita `PARA_LA_CENTRAL_LABEL` y no puede
// arrastrar `Card`/`Badge`/`DataTable`. Que la pantalla y el archivo digan lo mismo (R22/R23)
// es cierto porque leen del MISMO sitio, no porque hoy coincidan dos literales.
//
// TODAS estas constantes son SÓLO de las superficies del cierre de BODEGA. Las del cierre de
// mensajero (`INGRESO_BODEGA_RECHAZOS_LABEL`, `GANANCIA_LABEL`, `INGRESO_BRUTO_LABEL`,
// `PAGO_TIENDA_LABEL`) NO se tocan (R21/R30).
// ---------------------------------------------------------------------------

/**
 * Rótulo y nombre accesible de la cascada B. Responde: ¿cuánto le entrega esta bodega a la
 * central? Es la única de las dos que alcanza al `adminSatelite` (R39).
 */
export const CASCADA_CENTRAL_TITULO = "Lo que va a la central";

/** Resultado de la cascada A: lo que le queda a la tienda de lo que se recaudó. */
export const PARA_LA_TIENDA_LABEL = "Para la tienda";

/**
 * Resultado de la cascada B (D2′) — el número que el humano pidió el 2026-09-08.
 *
 * Dice **a dónde va** el dinero, que es lo que él describió, y RIMA con «Para la tienda»: dos
 * preguntas de la misma familia, dos rótulos de la misma forma, que es lo que hace que las dos
 * cascadas se lean como una sola historia.
 *
 * Descartado «Entrega a la central»: «entrega/entregada» es el desenlace de una gestión en esta
 * app y colisionaría en la misma pantalla que la tabla de entregadas. Descartado «Queda en
 * caja»: lo recaudado incluye SINPE y transferencia, así que no todo «queda en caja».
 *
 * Y NO se reusa `CENTRAL_DEBE_LABEL` (D6/A8): esa etiqueta ya significa algo muy concreto y
 * distinto —el pago a mensajeros que el efectivo no alcanzó a cubrir, en la pantalla de
 * consolidación, antes de solicitar—. Darle un segundo significado es exactamente lo que R24
 * prohíbe. El rótulo TAMPOCO cambia cuando el número sale negativo: una cifra, un nombre.
 */
export const PARA_LA_CENTRAL_LABEL = "Para la central";

/**
 * Resultado de la cascada A. NO es la «Ganancia» de hoy: aquella no resta el pago a la bodega
 * satélite, así que las dos sólo coinciden cuando ese pago es cero.
 */
export const NETO_EMPRESA_LABEL = `Neto de ${EMPRESA.enFrase}`;

/** El mismo número que el «Ingreso bruto» del cierre de mensajero, dicho como lo dice quien lo lee. */
export const FACTURADO_EMPRESA_LABEL = `Lo que ${EMPRESA.enFrase} facturó`;

/**
 * `total_ingreso_bodega_rechazos` dicho desde el punto de vista de quien mira (R25, D3′), y con
 * el verbo que usó el humano: «menos lo que gana la satélite».
 *
 * SÓLO en las superficies del cierre de bodega: ahí la bodega responsable es SIEMPRE la
 * satélite. En un cierre de MENSAJERO la bodega puede ser la central, así que allí sigue
 * diciendo `INGRESO_BODEGA_RECHAZOS_LABEL` y no se toca.
 */
export const GANA_BODEGA_SATELITE_LABEL = "Gana la bodega satélite";

/** R26 — de qué resta sale «Para la central», en el idioma de quien la hace. */
export const PARA_LA_CENTRAL_NOTA =
  "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por las devoluciones a origen.";
/** SLT-54 (R71, menor 5): en el nuevo la satélite gana por cualquier resultado (SLT-52 R32). */
export const PARA_LA_CENTRAL_NOTA_MODELO_NUEVO =
  "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por sus gestiones.";

/**
 * R36 — qué significa que salga NEGATIVO. Sin esta nota, un «−₡3.400» en una pantalla de dinero
 * es peor que no tener el número. El caso no es teórico: medido contra producción el 2026-09-08,
 * 1 de 14 cierres de bodega ya lo tenía negativo.
 */
export const PARA_LA_CENTRAL_NEGATIVO_NOTA =
  "Los descuentos superan lo recaudado en este cierre: la satélite no entrega nada y la central pone la diferencia.";

/**
 * R37 — el caso MÁS frecuente, y distinto del negativo: «Para la central» puede ser positivo y
 * aun así la bodega no tener el efectivo para pagar. Medido: 2 de 14 cierres, el peor por −₡2.000.
 */
export const EFECTIVO_NO_CUBRE_NOTA =
  "El efectivo recaudado no cubre los descuentos: parte de lo recaudado entró por SINPE o transferencia.";

/**
 * R27 — que no se confunda con un movimiento de caja. `FUENTE_CAJA`
 * (`lib/utils/aporte-por-orden.ts`) es un catálogo TOTAL de las categorías del libro y no tiene
 * ninguna del ingreso de bodega; la ficha 56 lo declaró: sólo se calcula, se snapshotea y se
 * muestra.
 */
export const GANA_BODEGA_SATELITE_NOTA =
  "Lo que se le reconoce a la bodega satélite por las devoluciones a origen. No es un movimiento de caja registrado.";
/** SLT-54 (R71): en el nuevo se le reconoce por cualquier resultado (SLT-52 R32). */
export const GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO =
  "Lo que se le reconoce a la bodega satélite por sus gestiones. No es un movimiento de caja registrado.";

// ---------------------------------------------------------------------------
// FICHA 395 (2026-09-08) — LAS TRES CASCADAS DEL CIERRE DE **MENSAJERO**.
//
// El detalle del cierre de mensajero —el que se mira todos los días— enseñaba «Pago a tienda»
// y «Total de la empresa» sueltos e invitaba a restarlos. Esa resta NO da: los dos números no salen
// de la misma bolsa. El humano se confundió leyendo su propia pantalla y lo dijo así: «si yo
// me confundo, no quiero imaginar los operarios».
//
// Estas constantes viven aquí, en el módulo PURO, por el mismo motivo que las de la 393: es la
// puerta única del texto de los cierres, y `cierre-detalle-shared` las re-exporta.
//
// ⚠️ NO se toca ni un rótulo de los que ya existían. `PAGO_TIENDA_LABEL` sigue diciendo «Pago a
// tienda» y sigue significando `pagoTienda`; `INGRESO_BODEGA_RECHAZOS_LABEL` sigue siendo el de
// esta superficie —en un cierre de MENSAJERO la bodega puede ser la central, así que
// `GANA_BODEGA_SATELITE_LABEL` sería falso aquí—. Lo que la ficha añade son los nombres de lo
// que ANTES NO TENÍA NOMBRE.
// ---------------------------------------------------------------------------

/**
 * SL-39 (R24) — la línea propia del IVA en la cascada «Lo que le queda a la empresa», justo después
 * de «Lo que la empresa facturó». El importe llega derivado del servidor (`ivaFacturado`, R21).
 * También es el renglón del IVA en el bloque «Liquidación» del detalle (menor 1 de la revisión).
 * La palabra del impuesto se compone desde `IMPUESTO_ROTULO`: SL-21 la cambia en un solo sitio.
 */
export const IVA_FACTURADO_LABEL = `${IMPUESTO_ROTULO} facturado`;

// ---------------------------------------------------------------------------
// FICHA 396 (2026-09-08) — DE QUÉ TIENDA ES CADA PARTE DEL «PAGO A TIENDA».
//
// ⚠️ NO ES UNA CORRECCIÓN DE DINERO. El dinero ya estaba bien: `wallet_tienda_movimiento` lleva
// los movimientos separados por tienda desde siempre, cada uno con sus propias cifras. A nadie se
// le paga mal. Lo que faltaba es que la PANTALLA dijera de quién es cada parte.
//
// El cierre es del MENSAJERO, no de la tienda: un mensajero reparte para quien le toque ese día,
// así que un cierre puede llevar órdenes de varias tiendas —medido en producción el 2026-09-08:
// de 56 cierres, 39 tienen UNA y 17 tienen DOS—. Hasta esta ficha «Pago a tienda» era la SUMA de
// todas ellas y no lo decía en ninguna parte: quien lo leía creía estar viendo lo de *una*.
//
// Estas constantes viven aquí, en el módulo PURO, por el mismo motivo que las de la 393 y la 395:
// es la puerta única del texto de los cierres, y las necesitan DOS pantallas —el detalle del
// mensajero y, cuando llegue su tanda, el de bodega—. Dos literales iguales escritos en dos
// archivos se separan en cuanto alguien renombre uno.
//
// ⚠️ NO se toca ni un rótulo de los que ya existían. `PAGO_TIENDA_LABEL`, `PAGO_TIENDA_NOTA` y
// `PARA_LA_TIENDA_LABEL` siguen diciendo y significando exactamente lo mismo (R18).
// ---------------------------------------------------------------------------

/**
 * FICHA 396 (R1) — LA MARCA: dice que el importe de al lado es un total de VARIAS tiendas, y de
 * cuántas. Va pegada a los DOS agregados que el desglose parte —«Pago a tienda» y «Gana la
 * tienda»—, porque los dos engañan igual: un número solo, sin esta frase, se lee como si fuera
 * de una tienda. R1 sólo exige marcar el primero; marcar también el segundo es decisión del
 * `frontend_dev`, y el motivo es que marcar uno solo diría, por omisión, que el otro sí es de
 * una tienda.
 *
 * Es una FUNCIÓN y no una constante porque el número de tiendas es parte del texto (R1 exige
 * decir «de cuántas»). Sigue cumpliendo R3 —el texto sale de este módulo, no de un literal
 * tecleado en el componente— con el mismo patrón que ya usa `destinoCierre` aquí al lado.
 *
 * El cardinal SIEMPRE es 2 o más: con una sola tienda no se pinta nada (R2), así que el plural
 * no tiene ningún caso raro que cubrir.
 */
export function totalDeVariasTiendasNota(cuantasTiendas: number): string {
  return `Es el total de las ${cuantasTiendas} tiendas de este cierre, sumadas. Abajo, cuánto le toca a cada una.`;
}

/**
 * FICHA 396 — EL UMBRAL (R2, Q5) Y LA MARCA (R1), en UNA sola función para todos los niveles del
 * detalle. Devuelve la frase de `totalDeVariasTiendasNota` cuando el nivel tiene dos o más
 * tiendas, y `null` con una o ninguna: ahí la pantalla no enseña ni marca ni «Por tienda».
 *
 * El umbral se evalúa sobre las tiendas del NIVEL que se pinta (el cierre de un mensajero, o el
 * agregado de bodega), nunca sobre una lista de más arriba. Está en un solo sitio a propósito: la
 * marca y el desglose tienen que aparecer y desaparecer JUNTOS.
 *
 * SLT-172 la mudó aquí desde `DesglosePorTienda.tsx`, que se retiró sin superficie: su único
 * consumidor vivo es `components/private/cierres/detalle/detalle-cierre-vista.ts`.
 *
 * SLT-174 (R661): recibe `readonly ParteDeTienda[]`, pedido a `lib/types/parte-de-tienda`, un
 * módulo sin imports. Pedirlo a `lib/utils/ingreso-empresa` metería ese módulo (que importa
 * `Prisma` como valor) en el árbol del panel del mensajero que vigila `pagos-captura.guardia` (R19).
 */
export function marcaDeVariasTiendas(partes: readonly ParteDeTienda[]): string | null {
  return partes.length >= 2 ? totalDeVariasTiendasNota(partes.length) : null;
}

// ---------------------------------------------------------------------------
// FICHA 408 (2026-09-10) — EL MOTIVO DE UN RECHAZO AUTOMÁTICO, EN CASTELLANO.
//
// El cron de plazos vencidos (feature 99) guarda el motivo como `escalado SLA <causa>`
// (`lib/services/DevolucionSlaService.ts`). Esa cadena es jerga de programador, lleva una sigla
// que este repo decidió no enseñar nunca y termina en el value inglés del enum. Se traduce AL
// PINTAR: el histórico de `gestion_orden.motivo` NO se toca —esas filas son evidencia— y el
// productor del texto tampoco.
//
// Vive aquí, en el módulo PURO, porque lo necesitan por igual la pantalla del admin, la del
// mensajero, el comprobante y las TRES descargas: que el archivo y la pantalla digan lo mismo es
// cierto porque leen del MISMO sitio, no porque hoy coincidan dos literales.
// ---------------------------------------------------------------------------

/**
 * Lo que se le añade a la causa cuando la fila NO enseña el marcador de origen (R11).
 *
 * NO copia la frase de `RECHAZO_SLA_BADGE_NOTA`: si algún día los dos apareciesen juntos, no
 * sería un eco literal. Y no depende de ningún `title` para entenderse, que en táctil no existe.
 */
export const MOTIVO_RECHAZO_AUTOMATICO_COLA =
  "el sistema la pasó a devolución a origen al vencerse el plazo de la novedad";

/**
 * Las TRES cadenas que el cron puede haber guardado, con su etiqueta en castellano.
 *
 * Se compone desde `CAUSA_DEVOLUCION_SEED` y no de una lista literal paralela: si el enum gana un
 * cuarto valor, esta tabla lo gana sola —y el `Record` exhaustivo de `CAUSA_DEVOLUCION_LABEL`
 * rompe el build si nadie le puso nombre—. Es un `Map` y no un objeto: la entrada es texto que
 * escribe una persona, y un objeto respondería a `"constructor"` o a `"__proto__"`.
 */
const ETIQUETA_POR_MOTIVO_AUTOMATICO: ReadonlyMap<string, string> = new Map(
  CAUSA_DEVOLUCION_SEED.map((causa) => [
    `escalado SLA ${causa}`,
    CAUSA_DEVOLUCION_LABEL[causa],
  ]),
);

/**
 * El motivo de una gestión, listo para pintarse. Función PURA: no toca la gestión ni nada más.
 *
 * `hayMarcadorDeOrigen`: ¿esta fila enseña el marcador «Automático»? Los DIECIOCHO puntos de
 * llamada —4 en `cierre-detalle-shared` + 4 en `cierre-gestiones-descarga-columnas` + 1 en
 * `cierre-factura` + 1 en `cierres-gestiones-fundida-descarga-columnas` + 4 en `CierreDiaModule`
 * + 4 en `cierre-dia-descarga-columnas`—
 * pasan SIEMPRE `gestion.esRechazoSla` —el mismo booleano que decide si el marcador se pinta—,
 * así que el llamador no decide nada y las dos cosas no pueden desincronizarse. En `/cierre-dia`
 * es siempre `false` (`CierreDiaRepository.ts`, decisión expresa de la 102): ahí no hay marcador
 * ni puede haberlo, y el texto del motivo es el ÚNICO portador de que el rechazo no fue suyo.
 *
 * Tres decisiones que parecen detalles y no lo son:
 *
 * 1. **La igualdad es EXACTA contra la cadena completa**, no `startsWith`/`includes`/`toLowerCase`
 *    ni una expresión regular: el texto libre que escribe el mensajero es sagrado (R2) y
 *    cualquier emparejamiento laxo puede comérselo o deformarlo. Coste aceptado: una fila con un
 *    espacio de más saldría cruda — ninguna existe, todas las produce el mismo template literal.
 * 2. **`null` sigue siendo `null`, jamás `"—"`**: el guion es un marcador de PANTALLA y la
 *    descarga declara que una celda sin dato va VACÍA (R10 de la 170). Colapsarlo aquí metería un
 *    `"—"` dentro del Excel. El `?? "—"` se queda en el render, fuera de esta función.
 * 3. **Dos variantes y UN solo vocabulario**: donde el marcador acompaña al motivo, cada columna
 *    responde una pregunta distinta y la celda no repite lo que el marcador ya dice; donde no hay
 *    marcador, el texto tiene que sostenerse solo.
 */
export function motivoGestionLegible(
  motivo: string | null,
  hayMarcadorDeOrigen: boolean,
): string | null {
  if (motivo === null) return null;
  const etiqueta = ETIQUETA_POR_MOTIVO_AUTOMATICO.get(motivo);
  if (etiqueta === undefined) return motivo;
  return hayMarcadorDeOrigen ? etiqueta : `${etiqueta} · ${MOTIVO_RECHAZO_AUTOMATICO_COLA}`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 — EL VOCABULARIO DE LA CONCILIACIÓN DE UNA CONSOLIDACIÓN DE BODEGA (R28).
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ── QUÉ CAMBIA, Y QUÉ NO
// `ESTADO_LABEL` (arriba) NO se toca, y es una restricción dura: lo comparten el cierre del
// MENSAJERO y el de BODEGA porque comparten el enum `cierre_estado` (D3). Renombrar allí
// «Aprobado» → «Recibido» se lo renombraría también al cierre de un mensajero, donde «Recibido»
// no significa nada.
//
// Lo que esta ficha cambia es CÓMO SE LEE el mismo estado **en las superficies del cierre de
// bodega**, y por eso vive en un mapa aparte:
//
//     `solicitado`                  → «Pendiente de conciliar»   (antes «Esperando aprobación»)
//     `aprobado` y nada que falte   → «Recibido»                 (antes «Aprobado»)
//     `aprobado` y con faltante     → «Recibido incompleto»      (no existía)
//     `rechazado`                   → se RETIRA de la pantalla, se deja en la base (R16)
//
// ── POR QUÉ HAY UN TERCER ESTADO QUE LA BASE NO TIENE
// Porque la base sí tiene el DATO: `monto_recibido` puede ser menor que el efectivo declarado.
// Sin este tercer rótulo, una consolidación de la que llegaron ₡485.000 de ₡500.000 se leería
// «Recibido» a secas y la diferencia sólo existiría en una columna que hay que saber mirar. Es
// exactamente el caso que Q7 obliga a que la satélite VEA en su propia pantalla.
//
// ── EL VALOR DE ESTOS RÓTULOS ESTÁ ANCLADO A MANO
// En `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`, bloque «el VALOR de los
// rótulos», con el literal escrito y NO comparado contra la constante. Cambiar uno es legítimo
// —el vocabulario lo decide el humano— pero cuesta un cambio visible y a propósito, que es justo
// lo que se quiere que pase.

/** `solicitado` en una superficie de cierre de bodega. */
export const PENDIENTE_CONCILIAR_LABEL = "Pendiente de conciliar";
/** `aprobado` con lo esperado («Para la central», SLT-73) llegado entero. */
export const RECIBIDO_LABEL = "Recibido";
/** `aprobado` pero con diferencia: llegó menos de lo declarado. */
export const RECIBIDO_INCOMPLETO_LABEL = "Recibido incompleto";
/** Cuánto contó de verdad quien recibió el bulto. */
export const MONTO_RECIBIDO_LABEL = "Monto recibido";
/** «Para la central» − lo recibido (SLT-73, D3/R8; antes `total_efectivo`). Puede ser negativo (llegó de más). */
export const FALTA_POR_RECIBIR_LABEL = "Falta por recibir";
/** El conjunto de lo que todavía no se ha marcado. */
export const SIN_CONCILIAR_LABEL = "Sin conciliar";

/** Los tres estados de PRESENTACIÓN de una consolidación (no son estados de la base). */
export type EstadoConciliacion = "pendiente" | "recibido" | "incompleto";

export const ESTADO_CONCILIACION_LABEL: Record<EstadoConciliacion, string> = {
  pendiente: PENDIENTE_CONCILIAR_LABEL,
  recibido: RECIBIDO_LABEL,
  incompleto: RECIBIDO_INCOMPLETO_LABEL,
};

/**
 * El color de cada estado, con los tokens semánticos de `DESIGN.md` (nunca un hex).
 *
 * «Recibido incompleto» va en `warning` —el MISMO tono que «Pendiente de conciliar»— y no en
 * `success`: mientras falte un colón por llegar, esa consolidación sigue teniendo dinero fuera
 * de la central y sigue sumando al saldo de su bodega. Pintarla como una recibida entera sería
 * decir en color lo contrario de lo que dice la cifra de al lado.
 */
export const ESTADO_CONCILIACION_VARIANT: Record<EstadoConciliacion, "success" | "warning"> = {
  pendiente: "warning",
  recibido: "success",
  incompleto: "warning",
};

/**
 * ¿Queda algo por llegar de este importe? Comparación TEXTUAL, money-safe: ni `Number(`, ni
 * `parseFloat`, ni `Decimal` en el navegador (R20).
 *
 * Es una pregunta PROPIA y no una composición de `esMontoCero`/`esMontoNegativo`: aquí el
 * negativo y el cero significan LO MISMO —no falta nada— mientras que en las cascadas de la 393
 * un negativo es un caso con nota propia. Escribirla como una sola expresión es lo que impide
 * que un día alguien conteste «sí falta» a un `-15.00`, que es dinero que llegó de MÁS.
 */
const NADA_FALTA = /^\s*-|^\s*0+(\.0+)?\s*$/;

export function hayFaltantePorRecibir(faltaPorRecibir: string): boolean {
  return !NADA_FALTA.test(faltaPorRecibir);
}

/**
 * El estado de PRESENTACIÓN de una consolidación, derivado de los dos datos que el servidor ya
 * manda cuadrados. La pantalla no compara campos de la base ni resta dinero: sólo lee.
 *
 * ⚠️ `conciliado` llega del servidor como `conciliado_at IS NOT NULL`. NO se deduce de
 * `estado === "aprobado"` aunque el `CHECK` los ate: el día que el camino viejo de aprobar vuelva
 * a escribir (Q4), esta función seguiría diciendo la verdad sobre si alguien contó el dinero.
 */
export function estadoConciliacionDe(marca: {
  conciliado: boolean;
  faltaPorRecibir: string;
}): EstadoConciliacion {
  if (!marca.conciliado) return "pendiente";
  return hayFaltantePorRecibir(marca.faltaPorRecibir) ? "incompleto" : "recibido";
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 462 (T3.1, S3, R27) — LA MARCA «RETIENE N PAQUETES REPROGRAMADOS PARA HOY».
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Un cierre sin aprobar RETIENE las órdenes que su mensajero reprogramó para hoy: la regla 276 no
// las deja volver a bodega —ni asignarse— hasta que se apruebe. La marca dice CUÁNTAS, con singular
// y plural explícitos, y la nota (`title`/nombre accesible) dice QUÉ pasa mientras tanto.
//
// ── EL VOCABULARIO, decidido por el leader el 2026-09-25 (prevalece sobre requirements/R27)
// Se habla del PAQUETE en masculino («paquetes reprogramados para hoy»), con el nombre vigente del
// estado de la 455 («Reprogramado») como adjetivo. El plural femenino «reprogramadas» —el nombre
// RETIRADO del estado viejo— no aparece en ningún texto visible, y la guardia
// `nombres-estado-retirados` lo vigila sin excepción alguna para esta ficha.
//
// La cifra NUNCA se calcula aquí: llega del conteo único (`CierreAdminResumen.reprogramadasRetenidasHoy`,
// `IReprogramadasRetenidasService.contarPorCierre`), el mismo que alimenta la campana y la franja de
// `/ordenes` (R7). Los literales se afirman A MANO en su test, nunca contra esta función.

/** El texto visible de la marca. `n >= 1`; con 0 la marca no se pinta (R27). */
export function retieneReprogramadas(n: number): string {
  return n === 1
    ? "Retiene 1 paquete reprogramado para hoy"
    : `Retiene ${n} paquetes reprogramados para hoy`;
}

/** La nota de la marca (`title` y parte del nombre accesible): qué pasa mientras el cierre no se apruebe. */
export function notaRetieneReprogramadas(n: number): string {
  return n === 1
    ? "1 paquete reprogramado para hoy no se puede asignar hasta que se apruebe este cierre."
    : `${n} paquetes reprogramados para hoy no se pueden asignar hasta que se apruebe este cierre.`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SLT-56 (design §5; R11, R19, R20, R21) — EL AJUSTE DEL PAGO AL MENSAJERO AL REVISAR EL CIERRE.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Los textos del botón, del diálogo, de la marca «Ajustado» y de su historial, y de la marca
// «Con ajustes» del cierre de bodega. Los importes NO se componen aquí: este módulo es puro y el
// formateador de moneda lo aplica quien pinta.

/** Botón de la fila de la gestión (R21). */
export const FILA_AJUSTAR_PAGO = "Ajustar pago";

/** Nombre accesible del botón: lleva la orden, como sus vecinos de la fila. */
export function ajustarPagoAriaLabel(numRemision: string, destinatario: string): string {
  return `${FILA_AJUSTAR_PAGO} al mensajero de la orden ${numRemision} · ${destinatario}`;
}

/** La marca de la gestión con al menos un ajuste (R19). */
export const AJUSTADO_BADGE_LABEL = "Ajustado";

/** Nombre accesible de la marca, que además abre el historial. */
export function ajustadoBadgeAriaLabel(n: number): string {
  return n === 1
    ? "Pago ajustado: ver el ajuste"
    : `Pago ajustado: ver los ${n} ajustes`;
}

/** Título del historial de ajustes de una gestión (R19). */
export const AJUSTES_PAGO_TITULO = "Ajustes del pago al mensajero";
export const AJUSTE_MOTIVO_LABEL = "Motivo";

/** La marca del cierre del día dentro del detalle del cierre de bodega (R20). */
export const CON_AJUSTES_BADGE_LABEL = "Con ajustes";

/** Nota de la marca «Con ajustes»: cuántas gestiones. La cifra llega del servidor. */
export function conAjustesNota(n: number): string {
  return n === 1
    ? "1 gestión de este cierre tiene el pago al mensajero ajustado."
    : `${n} gestiones de este cierre tienen el pago al mensajero ajustado.`;
}

/** Textos del diálogo «Ajustar pago» (R21). */
export const AJUSTE_PAGO_TEXTO = {
  titulo: "Ajustar el pago al mensajero",
  aviso:
    "Cambia solo lo que el mensajero gana por esta orden: no cambia la tarifa ni el pago de las demás. Queda registrado quién lo ajustó, cuándo y con qué motivo.",
  pagoVigente: "Pago vigente",
  pagoNuevo: "Valor nuevo",
  pagoNuevoAyuda:
    "Puede ser 0. Solo números, con punto para los decimales (hasta 2), por ejemplo 1500 o 1500.50.",
  motivo: "Motivo del ajuste",
  motivoAyuda: "Obligatorio. Queda en el historial del ajuste.",
  confirmar: "Guardar ajuste",
  cerrar: "Cerrar",
  ok: "Pago al mensajero ajustado.",
  hechoNota: "Listo. Así quedó el pago, según el servidor:",
  hechoPagoGestion: "Pago de esta orden",
  hechoTotalCierre: "Total de pago al mensajero del cierre",
  errorGenerico: "No se pudo ajustar el pago. Inténtalo de nuevo.",
  conflicto:
    "El cierre dejó de estar abierto o el pago de esta orden cambió mientras ajustabas: recarga el detalle para ver el valor vigente.",
  noEncontrada: "Esta gestión ya no está disponible para ajustar.",
  sinPermiso: "No tienes permiso para ajustar el pago al mensajero.",
  sinSesion: "Tu sesión expiró. Inicia sesión de nuevo.",
} as const;
