// SLT-101 «Fila de gestión única y lista con filtros» (T2.1) — la lógica PURA de la lista y de la
// fila de una gestión. ELIGE qué se ve por audiencia (señales, filtros, columnas, tarjetas, cálculo y
// acciones) y CUENTA gestiones; los importes son siempre el STRING del servidor tal cual, sin
// convertirlos ni operar con ellos (R71). Ninguna cifra se deriva aquí: «de eso, IVA», «Se cobró»,
// «Por tarifa» y «− Ajuste» llegan hechas (R92-R95). Se prueba sin montar nada
// (`tests/unit/utils/fila-gestion-vista.test.ts`).

import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
  ConceptoTarifaDTO,
  IngresoEmpresaDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { FilterOption } from "@/components/shared/FilterComponent";
import { METODO_LABEL } from "@/lib/constants/metodo-pago-label";
import { vuelveABodega } from "@/lib/types/gestion-retorno";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";
import { fechaLegibleEnZona } from "@/lib/whatsapp-envios/informes/formato";
import { esMontoCero } from "@/components/shared/monto-cliente";
import { CAUSA_INCIDENTE_LABEL } from "@/app/(app)/mis-asignaciones/_components/causa-incidente-options";
import {
  RESULTADO_LABEL,
  RESULTADO_VACIO,
  fleteDevConIvaDeGestion,
  FULFILLMENT_COL,
  fleteNoEntregaLabel,
  fulfillmentDeIngreso,
  ivaFleteNoEntregaLabel,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  COMISION_COD_LABEL as COMISION_COD_CONCEPTO,
  ESPECIAL_BADGE_NOTA,
  FLETE_RECHAZO_LABEL,
  HINT_TARIFA_ESPECIAL,
  IVA_COMISION_LABEL,
  IVA_FLETE_LABEL,
  IVA_FLETE_RECHAZO_LABEL,
  ORDEN_RESULTADOS,
  SIN_COMISION_NOTA,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";

import type { LineaCuenta } from "../detalle/detalle-cierre-vista";
import { COMISION_COD_LABEL, FLETE_POR_ENTREGADO_LABEL, TU_GANANCIA_LABEL } from "../detalle/detalle-cierre-labels";
import * as L from "./fila-gestion-labels";

// ═══ Audiencia y filtros ═════════════════════════════════════════════════════════════════════════

/** Quién mira la fila (R22): un componente, cuatro audiencias. */
export type AudienciaFila = "central" | "satelite" | "mensajero" | "solo lectura";

export const FILTRO_TODAS = "todas";
export const FILTRO_CON_SENALES = "con_senales";
export type FiltroGestiones = typeof FILTRO_TODAS | CierreResultado | typeof FILTRO_CON_SENALES;

/** Lo que la lista recibe por gestión: la gestión y, en bodega, su mensajero (R23). */
export interface ItemGestion {
  gestion: CierreDetalleGestion;
  mensajeroNombre?: string;
  /**
   * SLT-104 (PA3, R120): en bodega, el `solicitadoAt` del cierre del día de ESTA gestión (nota de R97).
   * Ausente = el `congeladoAt` de la lista; `null` = sin fecha.
   */
  congeladoAt?: string | null;
}

/** «Todas» = por resultado (S3-5) y, dentro de cada uno, el orden del servidor. */
export function gestionesEnOrden(grupos: CierreGrupos): CierreDetalleGestion[] {
  return ORDEN_RESULTADOS.flatMap((r) => grupos[r] ?? []);
}

// ═══ Señales (R24, R85) ══════════════════════════════════════════════════════════════════════════

export type SenalId = "pago_ajustado" | "sin_indemnizar" | "vuelve_a_bodega" | "rechazo_automatico" | "sin_tarifa";
export interface SenalFila {
  id: SenalId;
  texto: string;
}

const esMensajero = (a: AudienciaFila) => a === "mensajero";
const esAdministracion = (a: AudienciaFila) => a === "central" || a === "satelite";

/** Las señales de una gestión para esa audiencia, en el orden de R85. Solo campos que llegan. */
export function senalesDe(g: CierreDetalleGestion, a: AudienciaFila): SenalFila[] {
  const s: SenalFila[] = [];
  // Al mensajero no le llegan los ajustes (SLT-56 Q2): nunca se le dice «Pago ajustado».
  if (!esMensajero(a) && (g.ajustesPago?.length ?? 0) > 0) {
    s.push({ id: "pago_ajustado", texto: L.SENAL_PAGO_AJUSTADO });
  }
  if (g.resultado === "incidente" && g.indemnizacion === null) {
    const causa = g.causaIncidente ? CAUSA_INCIDENTE_LABEL[g.causaIncidente] : null;
    if (esAdministracion(a)) {
      s.push({ id: "sin_indemnizar", texto: causa === null ? L.SIN_INDEMNIZAR : L.sinIndemnizar(causa) });
    } else if (causa !== null) {
      s.push({ id: "sin_indemnizar", texto: causa });
    }
  }
  if (vuelveABodega(g.resultado)) s.push({ id: "vuelve_a_bodega", texto: L.SENAL_VUELVE_A_BODEGA });
  // Ficha 414: el origen del rechazo no se le enseña al mensajero.
  if (!esMensajero(a) && g.esRechazoSla) {
    s.push({ id: "rechazo_automatico", texto: L.SENAL_RECHAZO_AUTOMATICO });
  }
  if (g.tarifaFaltante) {
    s.push({ id: "sin_tarifa", texto: esMensajero(a) ? L.SENAL_SIN_TARIFA : L.SENAL_SIN_TARIFA_DE_PAGO });
  }
  return s;
}

/** La celda «Señales» (y la columna de «Descargar», R91): `""` sin señales. */
export function textoSenales(g: CierreDetalleGestion, a: AudienciaFila): string {
  return senalesDe(g, a)
    .map((x) => x.texto)
    .join(L.SEPARADOR_SENALES);
}

/** Opción del filtro: la de la barra de la app, con su tono (S3-4). */
export type OpcionFiltro = FilterOption & { value: FiltroGestiones };

/** Los 7 filtros de R84: «Todas», los cinco resultados y «Con señales», todos con su conteo. */
export function filtrosDe(gestiones: readonly CierreDetalleGestion[], a: AudienciaFila): OpcionFiltro[] {
  const conSenales = gestiones.filter((g) => senalesDe(g, a).length > 0).length;
  return [
    { value: FILTRO_TODAS, label: L.textoFiltro(L.FILTRO_TODAS, gestiones.length) },
    ...ORDEN_RESULTADOS.map((r) => ({
      value: r,
      label: L.textoFiltro(RESULTADO_LABEL[r], gestiones.filter((g) => g.resultado === r).length),
    })),
    { value: FILTRO_CON_SENALES, label: L.textoFiltro(L.FILTRO_CON_SENALES, conSenales), tono: "aviso" },
  ];
}

/** El subconjunto del filtro, SIN reordenar (R84). */
export function filtrar<T extends { gestion: CierreDetalleGestion }>(
  items: readonly T[],
  filtro: FiltroGestiones,
  a: AudienciaFila,
): T[] {
  if (filtro === FILTRO_TODAS) return [...items];
  if (filtro === FILTRO_CON_SENALES) return items.filter((i) => senalesDe(i.gestion, a).length > 0);
  return items.filter((i) => i.gestion.resultado === filtro);
}

/** El estado vacío de un filtro sin gestiones (R84): siempre un texto. */
export function estadoVacioDe(filtro: FiltroGestiones): string {
  if (filtro === FILTRO_TODAS) return L.SIN_GESTIONES;
  if (filtro === FILTRO_CON_SENALES) return L.SIN_GESTIONES_CON_SENALES;
  return RESULTADO_VACIO[filtro];
}

// ═══ Columnas (R23, R86) ═════════════════════════════════════════════════════════════════════════

export type ColumnaId =
  | "guia"
  | "destino"
  | "mensajero"
  | "resultado"
  | "recibido"
  | "cobro"
  | "pago"
  | "ganancia"
  | "senales";
export interface ColumnaFila {
  id: ColumnaId;
  label: string;
  /** Las cifras van a la derecha (canvas). */
  derecha?: boolean;
}

export function columnasDe(a: AudienciaFila, conMensajero = false): ColumnaFila[] {
  const inicio: ColumnaFila[] = [
    { id: "guia", label: L.COL_GUIA },
    { id: "destino", label: L.COL_DESTINO },
  ];
  if (esMensajero(a)) {
    return [
      ...inicio,
      { id: "resultado", label: L.COL_RESULTADO },
      { id: "recibido", label: L.COL_RECIBIDO, derecha: true },
      { id: "ganancia", label: L.COL_GANANCIA, derecha: true },
      { id: "senales", label: L.COL_SENALES },
    ];
  }
  return [
    ...inicio,
    ...(conMensajero ? [{ id: "mensajero" as const, label: L.COL_MENSAJERO }] : []),
    { id: "resultado", label: L.COL_RESULTADO },
    { id: "recibido", label: L.COL_RECIBIDO, derecha: true },
    { id: "cobro", label: L.COL_COBRO, derecha: true },
    { id: "pago", label: L.COL_PAGO, derecha: true },
    { id: "senales", label: L.COL_SENALES },
  ];
}

/** El importe (STRING del servidor) de una columna de dinero; `null` se pinta «—» (R86). */
export function montoDeColumna(g: CierreDetalleGestion, id: ColumnaId): string | null {
  if (id === "recibido") return g.montoRecibido;
  if (id === "cobro") return g.ingresoEmpresa?.total ?? null;
  if (id === "pago" || id === "ganancia") return g.pagoMensajero;
  return null;
}

// ═══ Fechas ═════════════════════════════════════════════════════════════════════════════════════

function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «06/11/2026» en el calendario de Costa Rica (canvas). */
export function fechaCorta(iso: string | null | undefined): string | null {
  const d = instante(iso);
  return d === null ? null : fechaLegibleEnZona(d, ZONA_CR);
}

/** «07/11/2026 18:42» (nota del cálculo, R97). */
export function fechaHoraCorta(iso: string | null | undefined): string | null {
  const fecha = fechaCorta(iso);
  return fecha === null ? null : `${fecha} ${horaCostaRica(iso as string)}`;
}

/** «07/11 19:02» (quién y cuándo del último ajuste, R98). */
export function diaMesHora(iso: string): string {
  const fecha = fechaCorta(iso);
  return fecha === null ? iso : `${fecha.slice(0, 5)} ${horaCostaRica(iso)}`;
}

// ═══ Tarjetas (R25, R27, R30, R93-R95, R98) ═════════════════════════════════════════════════════

export type TarjetaId = "recibido" | "cobro" | "pago" | "fulfillment";
export interface TarjetaFila {
  id: TarjetaId;
  titulo: string;
  /** Vacías → `vacio` («Sin dato», R27): la fuente es nula. */
  lineas: LineaCuenta[];
  vacio?: string;
  /** «de eso, IVA (no es de la empresa)» bajo el total (R93). */
  aparte?: { label: string; monto: string };
  /** Motivo y quién ajustó, separados con raya punteada (R98). */
  notas?: string[];
  /** Borde ámbar (ajustado) o punteado con fondo suave (fulfillment). */
  tono?: "aviso" | "aparte";
  /** Con ajustes: la insignia «Ajustado» junto al título (R98). */
  ajustado?: boolean;
  /** Párrafo al pie (la nota del fulfillment, R94). */
  nota?: string;
}

const partida = (label: string, monto: string, primero: boolean): LineaCuenta => ({
  label,
  monto,
  signo: primero ? "neutro" : "suma",
  tipo: "partida",
});
const total = (label: string, monto: string): LineaCuenta => ({ label, monto, signo: "neutro", tipo: "total" });

function tarjetaRecibido(g: CierreDetalleGestion): TarjetaFila {
  const base = { id: "recibido" as const, titulo: L.RECIBIO_TITULO };
  if (g.montoRecibido === null) return { ...base, lineas: [], vacio: L.SIN_DATO };
  // D4: los métodos en 0 no se muestran.
  const pagos = g.pagos.filter((p) => !esMontoCero(p.monto));
  return {
    ...base,
    lineas: [
      ...pagos.map((p, i) => partida(METODO_LABEL[p.metodo], p.monto, i === 0)),
      total(L.RECIBIO_TOTAL, g.montoRecibido),
    ],
  };
}

function tarjetaCobro(g: CierreDetalleGestion): TarjetaFila {
  const base = { id: "cobro" as const, titulo: L.COBRO_TITULO };
  const ing = g.ingresoEmpresa ?? null;
  if (ing === null) return { ...base, lineas: [], vacio: L.SIN_DATO };
  const conceptos: [string, string | null][] = [
    [FLETE_POR_ENTREGADO_LABEL, ing.fleteConIva],
    [COMISION_COD_LABEL, ing.comisionConIva],
    [fleteDevConIvaDeGestion(g), ing.fleteDevolucionConIva],
  ];
  const presentes = conceptos.filter((c): c is [string, string] => c[1] !== null);
  const ivaIncluido = ing.ivaIncluido ?? null;
  return {
    ...base,
    lineas: [...presentes.map(([label, monto], i) => partida(label, monto, i === 0)), total(L.COBRO_TOTAL, ing.total)],
    ...(ivaIncluido === null ? {} : { aparte: { label: L.DE_ESO_IVA, monto: ivaIncluido } }),
  };
}

function tarjetaPago(g: CierreDetalleGestion, a: AudienciaFila): TarjetaFila {
  const base = { id: "pago" as const, titulo: esMensajero(a) ? TU_GANANCIA_LABEL : L.PAGO_TITULO };
  if (g.pagoMensajero === null) return { ...base, lineas: [], vacio: L.SIN_DATO };
  const lineas: LineaCuenta[] = [];
  const pt = g.pagoPorTarifa ?? null;
  if (pt !== null) {
    lineas.push(partida(L.porTarifa(L.origenDe(pt.nivel, pt)), pt.importe, true));
    // El ajuste es dato de la empresa: el mensajero no lo ve (SLT-56 Q2).
    if (pt.ajuste !== null && !esMensajero(a)) {
      lineas.push({ label: L.AJUSTE_LINEA, monto: pt.ajuste.monto, signo: pt.ajuste.signo, tipo: "partida" });
    }
  }
  lineas.push(total(L.PAGO_TOTAL, g.pagoMensajero));
  const ajustes = esMensajero(a) ? [] : (g.ajustesPago ?? []);
  if (ajustes.length === 0) return { ...base, lineas };
  const ultimo = ajustes[ajustes.length - 1];
  return {
    ...base,
    lineas,
    ajustado: true,
    tono: "aviso",
    notas: [L.motivoAjuste(ultimo.motivo), L.ajusto(ultimo.actorNombre, diaMesHora(ultimo.creadoAt))],
  };
}

/** R25, R30: Fulfillment solo para la central (o solo lectura que mira la central) y con dato. */
export function veFulfillment(a: AudienciaFila, quienMiraEsCentral: boolean): boolean {
  return a === "central" || (a === "solo lectura" && quienMiraEsCentral);
}

function tarjetaFulfillment(ing: IngresoEmpresaDTO): TarjetaFila | null {
  const fulfillment = fulfillmentDeIngreso(ing);
  if (fulfillment === null) return null;
  const lineas: LineaCuenta[] = [partida(FULFILLMENT_COL, fulfillment, true)];
  const pct = ing.ivaPctFulfillment ?? null;
  if (pct !== null && ing.ivaFulfillment !== null) {
    lineas.push(partida(L.ivaConPorcentaje(pct), ing.ivaFulfillment, false));
  }
  const conIva = ing.fulfillmentConIva ?? null;
  if (conIva !== null) lineas.push(total(L.FULFILLMENT_TOTAL, conIva));
  return {
    id: "fulfillment",
    titulo: L.FULFILLMENT_TITULO,
    lineas,
    tono: "aparte",
    nota: L.notaFulfillment(fechaCorta(ing.fulfillmentCargadoAt)),
  };
}

/** Las tarjetas de la fila desplegada, en el orden del canvas (D2). */
export function tarjetasDe(
  g: CierreDetalleGestion,
  a: AudienciaFila,
  quienMiraEsCentral: boolean,
): TarjetaFila[] {
  const tarjetas: TarjetaFila[] = [tarjetaRecibido(g)];
  // El mensajero no ve el dinero de la empresa (R25).
  if (!esMensajero(a)) tarjetas.push(tarjetaCobro(g));
  tarjetas.push(tarjetaPago(g, a));
  const ing = g.ingresoEmpresa ?? null;
  if (ing !== null && veFulfillment(a, quienMiraEsCentral)) {
    const f = tarjetaFulfillment(ing);
    if (f !== null) tarjetas.push(f);
  }
  return tarjetas;
}

// ═══ «Ver cómo se calculó» (R28, R29, R97) ══════════════════════════════════════════════════════

export interface CuentaCalculo {
  titulo: string;
  /** «Tarifa: …» del modelo nuevo (R97). */
  tarifa?: string;
  lineas: LineaCuenta[];
}
export interface CalculoVista {
  cuentas: CuentaCalculo[];
  /** Notas de hoy: sin comisión, pacto especial (R29). */
  notas: string[];
  /** Modelo viejo sin tarifa congelada: solo el aviso de hoy. */
  sinTarifa: boolean;
  /** Distrito especial sin pacto: la nota de hoy, que pide los nombres del país (la pinta el .tsx). */
  faltaPacto: boolean;
  /** La nota de R97 con la fecha y hora del cierre. */
  nota: string;
}

/** Una cuenta de concepto: base, «+ IVA» y total con el nombre del concepto (canvas). */
function cuentaConcepto(
  titulo: string,
  base: [string, string],
  iva: [string, string | null],
  conIva: string | null,
  tarifa?: string,
): CuentaCalculo {
  const lineas: LineaCuenta[] = [partida(base[0], base[1], true)];
  if (iva[1] !== null) lineas.push(partida(iva[0], iva[1], false));
  if (conIva !== null) lineas.push(total(titulo, conIva));
  return tarifa === undefined ? { titulo, lineas } : { titulo, tarifa, lineas };
}

type ConceptoCobro = ConceptoTarifaDTO["concepto"];

function calculoNuevo(g: CierreDetalleGestion, ing: IngresoEmpresaDTO): CuentaCalculo[] {
  const conceptos = ing.conceptosTarifa ?? [];
  const tituloDe: Record<ConceptoCobro, string> = {
    flete: L.FLETE_POR_ENTREGADO,
    comisionCod: COMISION_COD_CONCEPTO,
    fleteDevolucion: fleteNoEntregaLabel(g.resultado),
  };
  const montos: Record<ConceptoCobro, [string | null, string | null, string | null]> = {
    flete: [ing.flete, ing.ivaFlete, ing.fleteConIva],
    comisionCod: [ing.comisionCod, ing.ivaComisionCod, ing.comisionConIva],
    fleteDevolucion: [ing.fleteDevolucion, ing.ivaFleteDevolucion, ing.fleteDevolucionConIva],
  };
  const ivaDe: Record<ConceptoCobro, string> = {
    flete: IVA_FLETE_LABEL,
    comisionCod: IVA_COMISION_LABEL,
    fleteDevolucion: ivaFleteNoEntregaLabel(g.resultado),
  };
  const orden: ConceptoCobro[] = ["flete", "comisionCod", "fleteDevolucion"];
  return orden.flatMap((c) => {
    const [base, iva, conIva] = montos[c];
    if (base === null) return [];
    const t = conceptos.find((x) => x.concepto === c);
    const titulo = tituloDe[c];
    // Sin la tarifa del concepto (un doble anterior a SLT-101): la cuenta sin la línea «Tarifa:».
    if (t === undefined) return [cuentaConcepto(titulo, [titulo, base], [ivaDe[c], iva], conIva)];
    const rotuloBase = t.modo === "monto" ? L.MONTO_FIJO : L.porcentajeDe(t.valor, t.base);
    return [
      cuentaConcepto(
        titulo,
        [rotuloBase, base],
        [L.ivaConPorcentaje(t.ivaPct), iva],
        conIva,
        L.tarifaDe(L.origenDe(t.nivel, t)),
      ),
    ];
  });
}

function calculoViejo(ing: IngresoEmpresaDTO): { cuentas: CuentaCalculo[]; notas: string[] } {
  const t = ing.tarifa;
  if (t === null) return { cuentas: [], notas: [] };
  // La regla de hoy de `DesgloseIngresoEmpresa` (337/338): pacto si salió de él y existe; si no,
  // la columna GAM o no GAM por `esCentral`. Se ELIGE un string congelado; no se calcula nada.
  const variante = ing.esCentral ? "GAM" : "no GAM";
  const fleteEspecial = ing.fleteOrigen === "especial" && t.tarifaEspecial !== null;
  const fleteDevEspecial = ing.fleteDevolucionOrigen === "especial" && t.tarifaEspecialDevuelta !== null;
  const fleteAplicado = fleteEspecial ? (t.tarifaEspecial as string) : ing.esCentral ? t.valorFleteGam : t.valorFlete;
  const fleteDevAplicado = fleteDevEspecial
    ? (t.tarifaEspecialDevuelta as string)
    : ing.esCentral
      ? t.valorFleteDevueltoGam
      : t.valorFleteDevuelto;
  const columna = (especial: boolean) => (especial ? HINT_TARIFA_ESPECIAL : L.tarifaVieja(variante));

  const cuentas: CuentaCalculo[] = [];
  if (ing.flete !== null) {
    cuentas.push(
      cuentaConcepto(
        L.FLETE_POR_ENTREGADO,
        [columna(fleteEspecial), ing.flete],
        [L.conPorcentaje(IVA_FLETE_LABEL, t.ivaFlete, fleteAplicado), ing.ivaFlete],
        ing.fleteConIva,
      ),
    );
  }
  if (ing.comisionCod !== null && ing.montoCobrar !== null) {
    cuentas.push(
      cuentaConcepto(
        COMISION_COD_CONCEPTO,
        [L.conPorcentaje(COMISION_COD_CONCEPTO, t.comisionCod, ing.montoCobrar), ing.comisionCod],
        [L.conPorcentaje(IVA_COMISION_LABEL, t.ivaComisionCod, ing.comisionCod), ing.ivaComisionCod],
        ing.comisionConIva,
      ),
    );
  }
  if (ing.fleteDevolucion !== null) {
    cuentas.push(
      cuentaConcepto(
        FLETE_RECHAZO_LABEL,
        [columna(fleteDevEspecial), ing.fleteDevolucion],
        [L.conPorcentaje(IVA_FLETE_RECHAZO_LABEL, t.ivaFlete, fleteDevAplicado), ing.ivaFleteDevolucion],
        ing.fleteDevolucionConIva,
      ),
    );
  }
  const notas = fleteEspecial || fleteDevEspecial ? [ESPECIAL_BADGE_NOTA] : [];
  return { cuentas, notas };
}

/** Las tarjetas de «Ver cómo se calculó»: una por concepto COBRADO (D2). `null` sin snapshot. */
export function calculoDe(g: CierreDetalleGestion, congeladoAt: string | null): CalculoVista | null {
  const ing = g.ingresoEmpresa ?? null;
  if (ing === null) return null;
  const nota = L.notaCalculo(fechaHoraCorta(congeladoAt));
  const sinComision = ing.cobraComision ? [] : [SIN_COMISION_NOTA];
  if (ing.tarifaModelo === "nuevo") {
    return { cuentas: calculoNuevo(g, ing), notas: sinComision, sinTarifa: false, faltaPacto: false, nota };
  }
  if (ing.tarifa === null) {
    return { cuentas: [], notas: [], sinTarifa: true, faltaPacto: false, nota };
  }
  const viejo = calculoViejo(ing);
  return {
    cuentas: viejo.cuentas,
    notas: [...viejo.notas, ...sinComision],
    sinTarifa: false,
    faltaPacto:
      ing.fleteOrigen === "especial_sin_pacto" || ing.fleteDevolucionOrigen === "especial_sin_pacto",
    nota,
  };
}

// ═══ Acciones (R26) ══════════════════════════════════════════════════════════════════════════════

export type AccionesFila = Partial<{
  corregirMetodos: (g: CierreDetalleGestion) => void;
  ajustarPago: (g: CierreDetalleGestion) => void;
  corregirResultado: (g: CierreDetalleGestion) => void;
  devolver: (g: CierreDetalleGestion) => void;
}>;

export interface AccionesOfrecidas {
  corregirMetodos: boolean;
  ajustarPago: boolean;
  corregirResultado: boolean;
  devolver: boolean;
  /**
   * SLT-109 (R244, feature 237): el motivo por el que «Devolver a gestión» sale deshabilitado; `null`
   * = habilitado. Una gestión de la tienda solo la corrige la tienda.
   */
  devolverDeshabilitado: string | null;
}

/**
 * Qué acción se ofrece: la tabla de R26 por audiencia y, dentro, la regla de hoy de la fila de
 * `cierre-factura.tsx` (corregir métodos solo en una entrega que cobró; corregir el resultado solo
 * en una entrega; ajustar con un pago congelado). Permiso y estado del cierre llegan como la
 * PRESENCIA del callback.
 */
export function accionesDe(g: CierreDetalleGestion, a: AudienciaFila, acciones: AccionesFila): AccionesOfrecidas {
  const entregado = g.resultado === "entregado";
  return {
    corregirMetodos: a === "central" && acciones.corregirMetodos !== undefined && entregado && g.pagos.length > 0,
    corregirResultado: a === "central" && acciones.corregirResultado !== undefined && entregado,
    ajustarPago: esAdministracion(a) && acciones.ajustarPago !== undefined && g.pagoMensajero !== null,
    devolver: a === "mensajero" && acciones.devolver !== undefined,
    devolverDeshabilitado: g.desdeAyudaTienda ? L.DESHACER_BLOQUEO_TIENDA : null,
  };
}
