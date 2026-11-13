// SLT-113 «Excel del modelo nuevo de cierres» (S15a, design «Hojas») — columnas y proyección de las
// hojas «Gestiones» y «Rechazados por la tienda» del libro del modelo nuevo. El libro (qué hojas, en
// qué orden) lo arma `cierres-gestiones-modelo-nuevo-descarga.ts`.
//
// Lleva el sufijo `-descarga-columnas` porque declara columnas de export: así la guardia de datos
// sensibles lo carga y ejecuta sus proyecciones con su sonda, como a los demás.
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). MONEY-SAFE: ningún importe se calcula aquí; cada celda de importe es
// el STRING del servidor tal cual, o ese string con `-` delante para el «Ajuste» que resta. La
// conversión a número de Excel la hace `celdaMonto` en el generador (`formato: "monto"`).

import type { CierreGestionDescargaDTO, RechazoTiendaDescargaDTO } from "@/lib/interfaces/services/ICierresAdminService";
import type { ConceptoTarifaDTO, PagoPorTarifaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { money } from "@/lib/config/moneda";
import { MONTO_FIJO, origenDe, porcentajeDe } from "@/components/private/cierres/fila/fila-gestion-labels";
import { textoSenales, type AudienciaFila } from "@/components/private/cierres/fila/fila-gestion-vista";

import {
  FLETE_NO_ENTREGADAS_LABEL,
  METODO_LABEL,
  RESULTADO_FILA_LABEL,
  motivoGestionLegible,
} from "./cierre-labels";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import { CLAVE_MEDIO_PAGO, MEDIOS_PAGO, montoPorMetodo } from "./desglose-pago";

// --- Textos (separados de la lógica, i18n-ready) ---------------------------------------------

const SEPARADOR_TARIFA = " · ";

// --- «Gestiones» ------------------------------------------------------------------------------

/** Columnas que son dato de la CENTRAL (F481): la satélite no las recibe. */
const CLAVES_SOLO_CENTRAL: ReadonlySet<string> = new Set([
  "fulfillment",
  "ivaFulfillment",
  "fulfillmentCargadoDia",
]);

const COLUMNAS_MEDIOS_PAGO: DescargaColumna[] = MEDIOS_PAGO.map((metodo) => ({
  clave: CLAVE_MEDIO_PAGO[metodo],
  encabezado: METODO_LABEL[metodo],
  formato: "monto",
}));

/**
 * Las 35 columnas de «Gestiones» para la central, en el orden de `design.md > Hojas`. El flete de
 * no entregadas usa el rótulo aprobado de R65 de SLT-54 (`FLETE_NO_ENTREGADAS_LABEL`), no un texto
 * nuevo: una cifra, un nombre (D20).
 */
const COLUMNAS_GESTIONES: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio del cierre" },
  { clave: "mensajero", encabezado: "Mensajero" },
  { clave: "fechaGestion", encabezado: "Fecha de gestión" },
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "numRemision", encabezado: "Nº Remisión" },
  { clave: "destinatario", encabezado: "Destinatario" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "resultado", encabezado: "Resultado" },
  { clave: "motivo", encabezado: "Motivo" },
  { clave: "recibido", encabezado: "Recibido", formato: "monto" },
  ...COLUMNAS_MEDIOS_PAGO,
  { clave: "flete", encabezado: "Flete por entregado", formato: "monto" },
  { clave: "tarifaFlete", encabezado: "Tarifa del flete" },
  { clave: "ivaFlete", encabezado: "IVA del flete", formato: "monto" },
  { clave: "comisionCod", encabezado: "Comisión COD", formato: "monto" },
  { clave: "tarifaComision", encabezado: "Tarifa de la comisión" },
  { clave: "ivaComisionCod", encabezado: "IVA de la comisión", formato: "monto" },
  { clave: "fleteDevolucion", encabezado: FLETE_NO_ENTREGADAS_LABEL, formato: "monto" },
  { clave: "tarifaFleteDevolucion", encabezado: `Tarifa del ${FLETE_NO_ENTREGADAS_LABEL.toLowerCase()}` },
  { clave: "ivaFleteDevolucion", encabezado: `IVA del ${FLETE_NO_ENTREGADAS_LABEL.toLowerCase()}`, formato: "monto" },
  { clave: "cobroTienda", encabezado: "Se le cobra a la tienda", formato: "monto" },
  { clave: "ivaIncluido", encabezado: "De eso, IVA", formato: "monto" },
  { clave: "pagoPorTarifa", encabezado: "Pago por tarifa", formato: "monto" },
  { clave: "tarifaPago", encabezado: "Tarifa del pago" },
  { clave: "ajuste", encabezado: "Ajuste", formato: "monto" },
  { clave: "pagoMensajero", encabezado: "Pago al mensajero", formato: "monto" },
  { clave: "motivoAjuste", encabezado: "Motivo del ajuste" },
  { clave: "ajusto", encabezado: "Ajustó" },
  { clave: "gananciaBodega", encabezado: "Gana la bodega satélite", formato: "monto" },
  { clave: "fulfillment", encabezado: "Fulfillment", formato: "monto" },
  { clave: "ivaFulfillment", encabezado: "IVA de fulfillment", formato: "monto" },
  { clave: "fulfillmentCargadoDia", encabezado: "Fulfillment cargado el" },
  { clave: "senales", encabezado: "Señales" },
];

/** Columnas de «Gestiones» para una audiencia: la satélite, sin las tres de fulfillment (falla cerrado). */
export function columnasGestionesModeloNuevoPara(
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaColumna[] {
  if (audiencia === "admin") return COLUMNAS_GESTIONES;
  return COLUMNAS_GESTIONES.filter((columna) => !CLAVES_SOLO_CENTRAL.has(columna.clave));
}

/** Audiencia de las señales: la central dice lo de la central; todo lo demás, lo de la satélite. */
function audienciaSenales(audiencia: AudienciaDescargaGestionesFundida): AudienciaFila {
  return audiencia === "admin" ? "central" : "satelite";
}

/** «Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro»: las piezas de «Ver cómo se calculó». */
function textoTarifa(t: ConceptoTarifaDTO | PagoPorTarifaDTO): string {
  // El texto se arma con los strings tal cual. La plantilla (`${…}`) no cambia un string; está para
  // que la sonda de la guardia de datos sensibles (un Proxy) llegue al texto como su marcador.
  const valor = `${t.valor}`;
  const base = t.base === null ? null : `${t.base}`;
  const rotulo = t.modo === "monto" ? `${MONTO_FIJO} ${money(valor)}` : porcentajeDe(valor, base);
  return `${rotulo}${SEPARADOR_TARIFA}${origenDe(t.nivel, t)}`;
}

function textoTarifaDeConcepto(
  conceptos: readonly ConceptoTarifaDTO[] | undefined,
  concepto: ConceptoTarifaDTO["concepto"],
): string | null {
  const encontrado = conceptos?.find((c) => c.concepto === concepto);
  return encontrado === undefined ? null : textoTarifa(encontrado);
}

/** El ajuste del pago CON su signo: el monto del servidor, con `-` delante si resta. */
function ajusteFirmado(pago: PagoPorTarifaDTO | null | undefined): string | null {
  const ajuste = pago?.ajuste ?? null;
  if (ajuste === null) return null;
  return ajuste.signo === "resta" ? `-${ajuste.monto}` : ajuste.monto;
}

/** Proyecta UNA gestión de un cierre del modelo nuevo a UNA fila de «Gestiones». `null` → vacía. */
export function filaGestionModeloNuevo(
  dto: CierreGestionDescargaDTO,
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaFila {
  const ingreso = dto.ingresoEmpresa;
  const medios = montoPorMetodo(dto.pagos);
  const pago = dto.pagoPorTarifa ?? null;
  const ultimoAjuste = dto.ajustesPago?.at(-1) ?? null;
  const fila: DescargaFila = {
    folio: dto.folioCierre ?? null,
    mensajero: dto.mensajeroNombre,
    fechaGestion: dto.fechaGestion,
    numGuia: dto.numGuia,
    numRemision: dto.numRemision,
    destinatario: dto.destinatario,
    tienda: dto.tiendaNombre,
    resultado: RESULTADO_FILA_LABEL[dto.resultado],
    motivo: motivoGestionLegible(dto.motivo, dto.esRechazoSla),
    recibido: dto.montoRecibido,
    [CLAVE_MEDIO_PAGO.efectivo]: medios.efectivo,
    [CLAVE_MEDIO_PAGO.SINPE]: medios.SINPE,
    [CLAVE_MEDIO_PAGO.transferencia]: medios.transferencia,
    flete: ingreso?.flete ?? null,
    tarifaFlete: textoTarifaDeConcepto(ingreso?.conceptosTarifa, "flete"),
    ivaFlete: ingreso?.ivaFlete ?? null,
    comisionCod: ingreso?.comisionCod ?? null,
    tarifaComision: textoTarifaDeConcepto(ingreso?.conceptosTarifa, "comisionCod"),
    ivaComisionCod: ingreso?.ivaComisionCod ?? null,
    fleteDevolucion: ingreso?.fleteDevolucion ?? null,
    tarifaFleteDevolucion: textoTarifaDeConcepto(ingreso?.conceptosTarifa, "fleteDevolucion"),
    ivaFleteDevolucion: ingreso?.ivaFleteDevolucion ?? null,
    cobroTienda: ingreso?.total ?? null,
    ivaIncluido: ingreso?.ivaIncluido ?? null,
    pagoPorTarifa: pago?.importe ?? null,
    tarifaPago: pago === null ? null : textoTarifa(pago),
    ajuste: ajusteFirmado(pago),
    pagoMensajero: dto.pagoMensajero,
    motivoAjuste: ultimoAjuste?.motivo ?? null,
    ajusto: ultimoAjuste?.actorNombre ?? null,
    gananciaBodega: dto.ingresoBodegaRechazo,
    senales:
      textoSenales(
        {
          ajustesPago: dto.ajustesPago,
          resultado: dto.resultado,
          indemnizacion: dto.indemnizacion,
          causaIncidente: dto.causaIncidente,
          esRechazoSla: dto.esRechazoSla,
          tarifaFaltante: dto.tarifaFaltante === true,
        },
        audienciaSenales(audiencia),
      ) || null,
  };
  // F481: lo de la central solo entra en la fila de la central (el servidor ya lo anula para la
  // satélite; aquí además no viaja la clave).
  if (audiencia === "admin") {
    fila.fulfillment = ingreso?.fulfillment ?? null;
    fila.ivaFulfillment = ingreso?.ivaFulfillment ?? null;
    fila.fulfillmentCargadoDia = dto.fulfillmentCargadoDia ?? null;
  }
  return fila;
}

// --- «Rechazados por la tienda» --------------------------------------------------------------

export const COLUMNAS_RECHAZOS_TIENDA: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio" },
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "destinatario", encabezado: "Destinatario" },
  { clave: "motivo", encabezado: "Motivo" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "fechaRechazo", encabezado: "Fecha del rechazo" },
];

export function filaRechazoTienda(rechazo: RechazoTiendaDescargaDTO): DescargaFila {
  return {
    folio: rechazo.folioCierre,
    numGuia: rechazo.numGuia,
    destinatario: rechazo.destinatario,
    motivo: rechazo.motivo,
    tienda: rechazo.tiendaNombre,
    fechaRechazo: rechazo.fechaRechazo,
  };
}
