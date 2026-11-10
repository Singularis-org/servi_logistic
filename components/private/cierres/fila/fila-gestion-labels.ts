// SLT-101 «Fila de gestión única y lista con filtros» (T2.1) — los textos NUEVOS de la lista y de la
// fila de una gestión, con el trato «tú» y los nombres del canvas aprobado (`Fila2.dc.html` y la
// lista de `Main.dc.html`). Donde la cifra ya tenía nombre en el módulo de cierres se reutiliza su
// `*_LABEL` (D20: una cifra, un nombre); aquí solo vive lo que no existía.
//
// Módulo PURO: sin React ni DOM. Ningún texto calcula dinero (R71): los que llevan un importe lo
// reciben como STRING del servidor y lo pasan por `money()`.

import { money } from "@/lib/config/moneda";
import { porcentajeParaVer } from "@/app/(app)/configuracion/tarifas/_components/tarifas-textos";
import type { OrigenTarifaDTO } from "@/lib/interfaces/services/ICierreDiaService";

import {
  COBRO_A_LA_TIENDA_COL,
  IVA_NO_ES_DE_LA_EMPRESA,
  PAGO_AL_MENSAJERO_COL,
} from "../detalle/detalle-cierre-labels";

// --- Lista (R23, R84, R89) ---
export const FILTRAR_POR_RESULTADO = "Filtrar por resultado";
export const FILTRO_TODAS = "Todas";
export const FILTRO_CON_SENALES = "Con señales";
/** «Entregado 12», como el canvas: el conteo detrás del nombre, separado por un espacio (R84). */
export const textoFiltro = (nombre: string, n: number): string => `${nombre} ${n}`;
export const ORDENES_DEL_CIERRE = "Órdenes del cierre";
export const SIN_GESTIONES = "Este cierre no tiene gestiones.";
export const SIN_GESTIONES_CON_SENALES = "Ninguna gestión de este cierre tiene señales.";

// --- Columnas (R23) ---
export const COL_GUIA = "Guía";
export const COL_DESTINO = "Destinatario · tienda";
export const COL_MENSAJERO = "Mensajero";
export const COL_RESULTADO = "Resultado";
export const COL_RECIBIDO = "Recibido";
export const COL_COBRO = COBRO_A_LA_TIENDA_COL;
export const COL_PAGO = PAGO_AL_MENSAJERO_COL;
export const COL_GANANCIA = "Ganancia";
export const COL_SENALES = "Señales";

// --- Señales (R24, R85) ---
export const SENAL_PAGO_AJUSTADO = "Pago ajustado";
export const sinIndemnizar = (causa: string): string => `${causa} · sin indemnizar`;
/** Incidente sin causa registrada (gestiones viejas): la señal sin el nombre de la causa. */
export const SIN_INDEMNIZAR = "Sin indemnizar";
export const SENAL_VUELVE_A_BODEGA = "Vuelve a bodega";
export const SENAL_RECHAZO_AUTOMATICO = "Rechazo automático";
export const SENAL_SIN_TARIFA_DE_PAGO = "Sin tarifa de pago";
/** El canvas le dice al mensajero «Sin tarifa» (F9). */
export const SENAL_SIN_TARIFA = "Sin tarifa";
export const SEPARADOR_SENALES = " · ";

// --- Fila desplegada: cabecera (R25, solo datos de la orden) ---
export const DATO_ORDEN = "Orden";
export const DATO_PRODUCTO = "Producto";
export const DATO_DIRECCION = "Dirección";

// --- Tarjetas (R25, R27, R93-R95, R98) ---
export const SIN_DATO = "Sin dato";
export const RECIBIO_TITULO = "Recibió el mensajero";
export const RECIBIO_TOTAL = "Recibió";
export const COBRO_TITULO = "Se le cobra a la tienda";
export const COBRO_TOTAL = "Se le cobra";
export const DE_ESO_IVA = `de eso, ${IVA_NO_ES_DE_LA_EMPRESA}`;
export const VER_CALCULO = "Ver cómo se calculó";
export const OCULTAR_CALCULO = "Ocultar cómo se calculó";
export const PAGO_TITULO = "Se le paga al mensajero";
export const PAGO_TOTAL = "Se le paga";
export const porTarifa = (origen: string): string => `Por tarifa · ${origen}`;
export const AJUSTE_LINEA = "Ajuste";
export const motivoAjuste = (motivo: string): string => `Motivo: «${motivo}»`;
export const ajusto = (nombre: string, cuando: string): string => `Ajustó ${nombre} · ${cuando}`;
export const FULFILLMENT_TITULO = "Fulfillment · se cobró al crear la orden";
export const FULFILLMENT_TOTAL = "Se cobró";
export const ivaConPorcentaje = (pct: string): string => `IVA ${porcentajeParaVer(pct)} %`;
export const FULFILLMENT_NO_DEPENDE = "No depende de esta gestión ni de este cierre.";
/** R94: sin fecha de cargo solo queda la segunda frase. */
export const notaFulfillment = (fecha: string | null): string =>
  fecha === null
    ? FULFILLMENT_NO_DEPENDE
    : `Se cargó al saldo de la tienda el ${fecha}, una vez por paquete. ${FULFILLMENT_NO_DEPENDE}`;

// --- Acciones (R26, R89) ---
export const DEVOLVER_A_GESTION = "Devolver a gestión";
export const devolverAriaLabel = (remision: string, destinatario: string): string =>
  `${DEVOLVER_A_GESTION} la orden ${remision} · ${destinatario}`;
export const detalleOrdenAriaLabel = (remision: string, destinatario: string): string =>
  `Detalle de la orden ${remision} · ${destinatario}`;

// --- «Ver cómo se calculó» (R28, R29, R97) ---
export const CALCULO_REGION = "Cómo se calculó el cobro a la tienda";
export const FLETE_POR_ENTREGADO = "Flete por entregado";
export const MONTO_FIJO = "Monto fijo";
export const tarifaDe = (origen: string): string => `Tarifa: ${origen}`;
/** «2 % de ₡25.000»: el % es el string congelado; el importe, el del servidor por `money()`. */
export const porcentajeDe = (valor: string, base: string | null): string =>
  base === null ? `${porcentajeParaVer(valor)} %` : `${porcentajeParaVer(valor)} % de ${money(base)}`;
/** Modelo viejo (R29): la columna aplicada con los rótulos de hoy. */
export const tarifaVieja = (columna: string): string => `tarifa ${columna}`;
export const conPorcentaje = (rotulo: string, pct: string, base: string): string =>
  `${rotulo} (${porcentajeParaVer(pct)} % de ${money(base)})`;
const NOTA_CALCULO_COLA = "Si después cambian, aquí no cambia nada.";
export const notaCalculo = (cuando: string | null): string =>
  cuando === null
    ? `Tarifas tal como estaban al crear el cierre. ${NOTA_CALCULO_COLA}`
    : `Tarifas tal como estaban al crear el cierre (${cuando}). ${NOTA_CALCULO_COLA}`;

// --- Origen de una tarifa congelada (R97, R98; PA8) ---
type Nombres = Pick<OrigenTarifaDTO, "zonaNombre" | "grupoNombre" | "vehiculoNombre">;

const deLaZona = (zona: string | null): string => (zona === null ? "" : ` de la zona ${zona}`);
const enLaZona = (zona: string | null): string => (zona === null ? "" : ` en la zona ${zona}`);
const grupo = (nombre: string | null): string => (nombre === null ? "grupo" : `grupo «${nombre}»`);
const paraVehiculo = (vehiculo: string | null): string => (vehiculo === null ? "" : ` para ${vehiculo}`);

/**
 * El texto de «Tarifa: …» y de «Por tarifa · …» por nivel. Los tres del canvas (grupo, zona,
 * mensajero) y los de PA8 para los demás. Con los nombres nulos (el valor se borró después) dice el
 * nivel sin nombres (R97).
 */
export function origenDe(nivel: OrigenTarifaDTO["nivel"], n: Nombres): string {
  switch (nivel) {
    case "grupo":
      return `${grupo(n.grupoNombre)}${deLaZona(n.zonaNombre)}`;
    case "zona":
      return `valor base de la zona${n.zonaNombre === null ? "" : ` ${n.zonaNombre}`}`;
    case "mensajero":
      return "precio propio del mensajero";
    case "tienda_grupo":
      return `precio propio de la tienda en el ${grupo(n.grupoNombre)}${deLaZona(n.zonaNombre)}`;
    case "tienda_zona":
      return `precio propio de la tienda${enLaZona(n.zonaNombre)}`;
    case "tienda_general":
      return "precio propio de la tienda";
    case "grupo_vehiculo":
      return `${grupo(n.grupoNombre)}${deLaZona(n.zonaNombre)}${paraVehiculo(n.vehiculoNombre)}`;
    case "zona_vehiculo":
      return `valor base de la zona${n.zonaNombre === null ? "" : ` ${n.zonaNombre}`}${paraVehiculo(n.vehiculoNombre)}`;
  }
}
