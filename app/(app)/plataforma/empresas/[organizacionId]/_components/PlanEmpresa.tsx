"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { AvisosDeTopes, textoDelAvisoDeTope } from "@/components/shared/AvisosDeTopes";
import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { TipoCobroCampo } from "@/components/shared/TipoCobroCampo";
import { primerPeriodoDelCambio, TEXTOS_TIPO_COBRO, textoDelPeriodo } from "@/components/shared/tipo-cobro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import {
  lineasDeCambioDelPlan,
  rangoInicioCiclo as textoRangoInicioCiclo,
  SIN_LINEAS_DE_CAMBIO,
  textoCambioProgramado,
  textoDelCambioCancelado,
  TITULO_LINEAS_DE_CAMBIO,
  type CambioDelPlanParaCorreo,
} from "@/lib/planes/mensajes";
import { precioQueRigeEn } from "@/lib/planes/precio-que-rige";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import {
  precioPlanSchema,
  type AsignacionDePlan,
  type CambiarTipoCobroResult,
  type CancelarCambioEmpresaResult,
  type PlanDeEmpresaVista,
  type PlanDTO,
  type PlanResult,
  type PrecioDesde,
  type PrecioPlan,
  type PreciosQueRigen,
  type TipoCobro,
  type TopeExcedido,
  type VistaPreviaAsignacionResult,
} from "@/lib/types/planes";
import { esFechaCalendarioValida, fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { RECHAZO_GENERICO } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { horaCostaRica } from "@/lib/utils/hora-cr";
import { lineasDeCosto, lineasDeTopes } from "@/app/(app)/plataforma/planes/_components/plan-vista";

/** Textos de la sección, en un solo sitio para cuando llegue la i18n (design §6.5). */
const TEXTOS = {
  titulo: "Plan",
  sinPlan: "Sin plan: sin límites",
  noSeCargo: "No se pudo cargar el plan.",
  archivado: "Archivado",
  planArchivado: "El plan actual está archivado: sigue rigiendo, pero no se puede volver a asignar.",
  elegirPlan: "Plan a asignar",
  placeholder: "Elige un plan",
  sinAsignables: "No hay otros planes que asignar a esta empresa.",
  /** SLT-66 (design §6.5, R20): el plan actual no tiene costo base «monto» o le falta el costo por orden. */
  planSinCosto:
    "Plan sin costo concreto: complétalo en «Planes» o asígnale otro con costo base y costo por orden.",
  asignablesNoCargaron: "No se pudieron cargar los planes que se pueden asignar.",
  asignar: "Asignar plan",
  cambiar: "Cambiar plan",
  asignado: "Plan asignado.",
  /** SLT-86 (R17): un cambio con fecha futura queda pendiente; el texto único del cambio programado. */
  programado: (fecha: string) => `${textoCambioProgramado(fecha)}.`,
  validacion: "Revisa el plan elegido.",
  fallo: "No se pudo asignar el plan. Inténtalo de nuevo.",
  confirmarTitulo: "¿Cambiar el plan de esta empresa?",
  // SLT-86 (R17): sin «Sus topes y módulos cambian en cuanto confirmes»: cambian desde «Rige desde».
  confirmarTexto: (actual: string, nuevo: string) => `La empresa pasa de «${actual}» a «${nuevo}».`,
  /** Decisión del 2026-10-29: sin el plan actual no hay resumen, y sin resumen no se confirma. */
  actualNoSeCargo: "No se pudo cargar el plan actual",
  reintentar: "Reintentar",
  /** Primera asignación (decisión del 2026-10-29): el mismo modal, con lo que tendrá la empresa. */
  primeraTitulo: "¿Asignar este plan a la empresa?",
  primeraTexto: (plan: string, empresa: string) => `Asignar ${plan} a ${empresa}: desde ahora tendrá:`,
  primeraLista: "Lo que tendrá la empresa",
  modulosIncluidos: (modulos: string) => `Módulos incluidos: ${modulos}`,
  sinModulos: "Ninguno",
  /** SLT-86 (design §7.1): sustituye a «El ciclo de órdenes empieza el {fecha}.» de SLT-58 R38. */
  empiezaARegir: (fecha: string) => `El plan empieza a regir el ${fecha}.`,
  /** P13 (aprobado el 2026-10-29). */
  inicioCiclo: "Inicio del período",
  /** P11 (aprobada el 2026-10-29): sin la vista previa no se confirma. */
  vistaPreviaNoCargo: "No se pudo comprobar el consumo de la empresa",
  volver: "Volver",
  historial: "Historial de asignaciones",
  sinHistorial: "Esta empresa todavía no tiene asignaciones de plan.",
  fecha: "Fecha",
  quien: "Quién",
  planAsignado: "Plan asignado",
  publico: "Público",
  custom: "Custom",
  /** Ajuste planes-custom (D14): el tipo de cobro de cada fila del historial. */
  tipoCobro: TEXTOS_TIPO_COBRO.campo,
  sinTipoCobro: "—",
  /** SLT-86 (R30): la fecha de efecto de cada fila, con el rótulo del campo. */
  rigeDesde: TEXTOS_TIPO_COBRO.rigeDesde,
  cambioDeTipoCobro: (antes: string | null, despues: string) =>
    antes === null ? `Cambió a ${despues}` : `Cambió de ${antes} a ${despues}`,
  /** Ajuste planes-custom (D10): cambiar solo el tipo de cobro del plan actual. */
  cambiarTipoCobro: "Cambiar tipo de cobro",
  cambiarTipoCobroTitulo: "¿Cambiar el tipo de cobro?",
  // SLT-86 (R17): sin «ni su ciclo de órdenes»: el período sí cambia desde «Rige desde».
  cambiarTipoCobroTexto: (plan: string) => `La empresa sigue con «${plan}»: no cambian sus topes ni sus módulos.`,
  tipoCobroCambiado: "Tipo de cobro cambiado.",
  tipoCobroSinCambio: "La empresa ya tenía ese tipo de cobro.",
  tipoCobroValidacion: "Revisa el tipo de cobro elegido.",
  tipoCobroFallo: "No se pudo cambiar el tipo de cobro. Inténtalo de nuevo.",
  /** SLT-86 (R19, R26): «Cancelar cambio» del pendiente; el mismo texto que el detalle del plan. */
  cambioCancelado: "Cambio programado cancelado.",
  /** Decisión del 2026-11-06: «Cancelar cambio» pide confirmación con el plan y la fecha de efecto. */
  confirmarCancelar: (plan: string, fecha: string) => `¿Cancelar el cambio a ${plan} programado para el ${fecha}?`,
} as const;

/** Ajuste planes-custom (D10): el texto de cada rechazo de `cambiarTipoCobroAction`. */
const RECHAZOS_TIPO_COBRO: Record<Exclude<CambiarTipoCobroResult["estado"], "ok" | "validation_error">, string> = {
  forbidden: "No tienes permiso para esto.",
  not_found: "Esa empresa ya no existe.",
  sin_plan: "La empresa ya no tiene plan: el tipo de cobro se elige al asignarle uno.",
};

/**
 * D14: la celda «Tipo de cobro» de una fila del historial de asignaciones. SLT-86 (R19, R26): un cambio
 * cancelado dice cuál era, con su fecha; el plan va en su columna.
 */
function textoDelTipoCobroDeLaFila(a: AsignacionDePlan): string {
  if (a.tipoCobro === null) return TEXTOS.sinTipoCobro;
  const despues = TEXTOS_TIPO_COBRO.tipo[a.tipoCobro];
  if (a.tipo === "cambio_cancelado") return textoDelCambioCancelado(despues, a.desde);
  if (a.tipo === "asignacion") return despues;
  return TEXTOS.cambioDeTipoCobro(
    a.tipoCobroAnterior === null ? null : TEXTOS_TIPO_COBRO.tipo[a.tipoCobroAnterior],
    despues,
  );
}

/**
 * SLT-86 (R30): la celda «Rige desde» de una fila: la fecha de efecto o de inicio que guardó. Un cambio
 * cancelado no llegó a regir; su fecha va en el texto de la celda del tipo.
 */
function rigeDesdeDeLaFila(a: AsignacionDePlan): string {
  return a.tipo === "cambio_cancelado" || a.desde === null ? TEXTOS.sinTipoCobro : a.desde;
}

/**
 * SLT-86 (R25): el costo base del primer período o tramo que abriría el cambio, con el precio, el tipo y
 * la fecha elegidos. `null` sin precio legible o sin fecha válida: no se muestra.
 *
 * Review m4: el precio es el que regirá en `fecha` según el historial del plan (`precioQueRigeEn`), que
 * puede traer una edición programada antes de esa fecha; sin historial, el vigente (`precio`).
 */
function lineasDelPrimerPeriodo(
  precio: PrecioPlan | undefined,
  historial: readonly PrecioDesde[],
  tipo: TipoCobro,
  fecha: string,
): string[] | null {
  if (precio === undefined || !esFechaCalendarioValida(fecha)) return null;
  const valido = precioPlanSchema.safeParse(precioQueRigeEn(historial, fecha) ?? precio);
  if (!valido.success) return null;
  const { periodo, costo } = primerPeriodoDelCambio(valido.data, tipo, fecha);
  return [TEXTOS_TIPO_COBRO.costoBase(tipo, costo), textoDelPeriodo(tipo, periodo)];
}

/** SLT-86 (R19, R26): el texto de cada rechazo de `cancelarCambioEmpresaAction`. */
const RECHAZOS_CANCELAR: Record<Exclude<CancelarCambioEmpresaResult["estado"], "ok">, string> = {
  forbidden: "No tienes permiso para esto.",
  not_found: "Esa empresa ya no existe.",
  sin_cambio_programado: "La empresa ya no tiene un cambio pendiente.",
  validation_error: RECHAZO_GENERICO,
};

/** design §6.5: el texto de cada rechazo de `asignarPlanAction` (R18). `tope_excedido` trae el suyo. */
const RECHAZOS: Record<Exclude<PlanResult["estado"], "ok" | "tope_excedido" | "validation_error">, string> = {
  forbidden: "No tienes permiso para esto.",
  not_found: "El plan o la empresa ya no existe.",
  archivado: "El plan está archivado.",
  custom_de_otra_empresa: "Ese plan es de otra empresa.",
  sin_cambio_programado: "La empresa ya no tiene un cambio pendiente.",
};

export interface PlanEmpresaProps {
  organizacionId: string;
  /** El nombre de la empresa, para la confirmación de la primera asignación. */
  empresaNombre: string;
  /** La lectura del plan de la empresa; `null` = la lectura falló (la sección lo dice y no tumba la página). */
  vista: PlanDeEmpresaVista | null;
  /** Lo que devolvió `listarPlanesAsignablesAction`; `null` = no se pudo leer. */
  asignables: PlanDTO[] | null;
  /**
   * La versión vigente del plan actual como `PlanDTO`, para resumir qué cambia antes de confirmar
   * (decisión cerrada del 2026-10-29). Si no llega, se busca entre los asignables; `null` = no se pudo
   * leer, y la confirmación lo dice y no deja confirmar: solo «Reintentar» (relee) y «Volver».
   */
  planActual?: PlanDTO | null;
  /**
   * `asignarPlanAction`, inyectada desde la página para poder probarla. `inicioCiclo` solo viaja en la
   * primera asignación (R29); «Cambiar plan» nunca lo manda (R31) y lleva `vigenteDesde` (SLT-86 R16).
   * `tipoCobro` viaja siempre (D6).
   */
  asignarPlan: (input: {
    organizacionId: string;
    planId: string;
    inicioCiclo?: string;
    vigenteDesde?: string;
    tipoCobro: TipoCobro;
  }) => Promise<PlanResult>;
  /**
   * SLT-58 §11.5 (R30): el rango de la fecha de inicio del ciclo, calculado en el servidor para no
   * depender del reloj del navegador. `hoy` es el valor por defecto del campo.
   */
  rangoInicioCiclo: RangoDelInicioDelCiclo;
  /**
   * Ajuste planes-custom (D5): el valor por defecto de «Inicio del ciclo» en la primera asignación,
   * MAÑANA en la hora de la plataforma (`inicioDelCicloPorDefecto`, del reloj del servidor).
   */
  inicioCicloPorDefecto: string;
  /** SLT-86 (R16): el `min`/`max` de «Rige desde» de un cambio, del reloj del servidor. */
  rangoFechaDeEfecto: RangoDelInicioDelCiclo;
  /**
   * SLT-86 (R25): «Rige desde» por defecto de un cambio: el primer día del siguiente período de calendario
   * con el tipo vigente (`fechaDeEfectoPorDefecto`, del reloj del servidor). `null` sin plan.
   */
  fechaDeEfectoPorDefecto: string | null;
  /**
   * SLT-86 (R25; review m4): por plan, los precios que pueden regir de hoy en adelante
   * (`verPreciosQueRigen`), para que el costo del primer período use el que regirá en la fecha elegida.
   * Sin él (o sin el plan) se usa el precio vigente.
   */
  preciosQueRigen?: PreciosQueRigen | null;
  /** `previsualizarAsignacionPlanAction` (R37), inyectada desde la página para poder probarla. */
  previsualizarAsignacion: (input: {
    organizacionId: string;
    planId: string;
    inicioCiclo: string;
  }) => Promise<VistaPreviaAsignacionResult>;
  /**
   * SLT-66 (design §6.6; R33): el plan con que arranca el selector, cuando se llega desde «Asignar a una
   * empresa» del detalle del plan (`?plan=…`). La página ya lo valida contra los asignables; aquí se
   * vuelve a mirar contra lo que el selector ofrece y, si no está, se ignora. No asigna nada: confirmar
   * sigue siendo el clic y el modal.
   */
  planPreseleccionado?: string;
  /**
   * Ajuste planes-custom (D10): `cambiarTipoCobroAction`, inyectada desde la página para poder probarla.
   * Solo se ofrece si la empresa tiene plan; no toca el plan ni los módulos. SLT-86 (R16, R17): con su
   * fecha de efecto, desde la que cambia el período.
   */
  cambiarTipoCobro: (input: {
    organizacionId: string;
    tipoCobro: TipoCobro;
    vigenteDesde: string;
  }) => Promise<CambiarTipoCobroResult>;
  /** SLT-86 (R19, R26): `cancelarCambioEmpresaAction`, inyectada desde la página para poder probarla. */
  cancelarCambioEmpresa: (input: { organizacionId: string }) => Promise<CancelarCambioEmpresaResult>;
}

/**
 * La vista previa de la primera asignación (R37). `invalida` = la fecha no vale (su error va junto al
 * campo); `fallo` = no se pudo leer (P11), con el rechazo del servicio si lo hubo.
 */
type VistaPrevia =
  | { fase: "cargando" }
  | { fase: "ok"; avisos: TopeExcedido[] }
  | { fase: "invalida" }
  | { fase: "fallo"; motivo: string | null };

/**
 * R20: si el selector ofrece el plan a ESTA empresa (público o custom suyo, no archivado y distinto del
 * que ya tiene). El servicio ya filtra; se vuelve a mirar para no ofrecer uno que la base rechazaría.
 */
function ofrecible(p: PlanDTO, organizacionId: string, planActualId: string | null): boolean {
  return (
    !p.archivado && (p.visibilidad === "publico" || p.organizacionId === organizacionId) && p.id !== planActualId
  );
}

/** Un instante ISO como «AAAA-MM-DD HH:mm» en la hora de la plataforma. */
function fechaHoraPlataforma(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return iso;
  return `${fechaCalendarioCR(instante)} ${horaCostaRica(iso)}`;
}

/**
 * SLT-58 (design §6.3; R18–R21) — el plan de una empresa en su detalle del superadmin: el plan y su
 * consumo (o «Sin plan: sin límites»), el selector para asignarlo o cambiarlo y el historial de
 * asignaciones. Tras un `ok` relee la página (`router.refresh()`); ante un rechazo lo explica y no da
 * el cambio por hecho: la empresa sigue con su plan.
 */
export function PlanEmpresa({
  organizacionId,
  empresaNombre,
  vista,
  asignables,
  planActual,
  asignarPlan,
  rangoInicioCiclo,
  inicioCicloPorDefecto,
  rangoFechaDeEfecto,
  fechaDeEfectoPorDefecto,
  preciosQueRigen,
  previsualizarAsignacion,
  planPreseleccionado,
  cambiarTipoCobro,
  cancelarCambioEmpresa,
}: PlanEmpresaProps) {
  const tituloId = useId();
  const historialId = useId();
  const campoId = useId();
  const fechaId = useId();
  const tipoCobroId = useId();
  const nuevoTipoCobroId = useId();
  const efectoId = useId();
  const efectoTipoId = useId();
  const router = useRouter();
  const toast = useToast();
  const planActualId = vista?.plan?.planId ?? null;
  const [planId, setPlanId] = useState(() =>
    planPreseleccionado !== undefined &&
    (asignables ?? []).some((p) => p.id === planPreseleccionado && ofrecible(p, organizacionId, planActualId))
      ? planPreseleccionado
      : "",
  );
  const [enVuelo, setEnVuelo] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [errorDeCampo, setErrorDeCampo] = useState<string[] | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [inicioCiclo, setInicioCiclo] = useState(inicioCicloPorDefecto);
  /** D6: el tipo de cobro de esta asignación; cada apertura del modal empieza en «mensual». */
  const [tipoCobro, setTipoCobro] = useState<TipoCobro>("mensual");
  const [errorDeTipoCobro, setErrorDeTipoCobro] = useState<string[] | undefined>(undefined);
  const [vistaPrevia, setVistaPrevia] = useState<VistaPrevia>({ fase: "cargando" });
  const [errorDeFecha, setErrorDeFecha] = useState<string[] | undefined>(undefined);
  /** SLT-86 (R16, R25): «Rige desde» de «Cambiar plan» y de «Cambiar tipo de cobro». */
  const [vigenteDesde, setVigenteDesde] = useState(fechaDeEfectoPorDefecto ?? "");
  const [errorDeEfecto, setErrorDeEfecto] = useState<string[] | undefined>(undefined);
  const [cancelando, setCancelando] = useState(false);
  /** Decisión del 2026-11-06: el modal que confirma «Cancelar cambio». */
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  /** Los avisos del `ok` de la primera asignación (§11.5), bajo la sección y con el texto del modal. */
  const [avisosAsignados, setAvisosAsignados] = useState<string[]>([]);
  // Cada lectura de la vista previa lleva su número: si el superadmin cambia la fecha antes de que
  // vuelva la anterior, la respuesta vieja se descarta y no pisa los avisos de la fecha nueva.
  const lecturaRef = useRef(0);
  /** D10: el modal de «Cambiar tipo de cobro», con el tipo elegido (arranca en el actual). */
  const [cambiandoTipo, setCambiandoTipo] = useState(false);
  const [nuevoTipoCobro, setNuevoTipoCobro] = useState<TipoCobro>("mensual");
  const [errorDeNuevoTipo, setErrorDeNuevoTipo] = useState<string[] | undefined>(undefined);
  const [tipoEnVuelo, setTipoEnVuelo] = useState(false);

  // R20: solo los asignables a ESTA empresa (públicos y customs suyos, no archivados). El servicio ya
  // filtra; se vuelve a mirar aquí para que la pantalla nunca ofrezca uno que la base rechazaría. El
  // plan que ya tiene no se ofrece: «cambiar» a él no cambia nada.
  const opciones: SelectOption[] = useMemo(
    () =>
      (asignables ?? [])
        .filter((p) => ofrecible(p, organizacionId, planActualId))
        .map((p) => ({
          value: p.id,
          label: `${p.nombre} (${p.visibilidad === "publico" ? TEXTOS.publico : TEXTOS.custom})`,
        })),
    [asignables, organizacionId, planActualId],
  );

  // Decisión cerrada del 2026-10-29: el resumen de «qué cambia» sale de `diferenciasDelPlan` y
  // `lineasDeCambioDelPlan` (las mismas líneas que el correo de SL-24), no se calcula aparte.
  const elegido = useMemo(() => (asignables ?? []).find((p) => p.id === planId) ?? null, [asignables, planId]);
  const actual = useMemo(
    () => planActual ?? (asignables ?? []).find((p) => p.id === planActualId) ?? null,
    [planActual, asignables, planActualId],
  );
  const lineasDeCambio = useMemo(() => {
    if (actual === null || elegido === null) return null;
    // Mismo molde que `cambioPendienteDelPlan`: `diferenciasDelPlan` deja `{ antes, despues }` como `unknown`.
    return lineasDeCambioDelPlan(diferenciasDelPlan(actual, elegido) as CambioDelPlanParaCorreo);
  }, [actual, elegido]);

  // Primera asignación (decisión del 2026-10-29): lo que tendrá la empresa con el plan elegido. Los
  // topes con `lineasDeTopes` (los mismos textos que el catálogo; lo que no tiene tope, «sin límite»).
  const lineasDePrimera = useMemo(() => {
    if (elegido === null) return null;
    const modulos = elegido.modulos.length === 0 ? TEXTOS.sinModulos : elegido.modulos.map(nombreDelModulo).join(", ");
    // SLT-66 (design §6.2, R24): también el costo base y el costo por orden del plan.
    return [...lineasDeTopes(elegido.topes), ...lineasDeCosto(elegido), TEXTOS.modulosIncluidos(modulos)];
  }, [elegido]);

  /**
   * «Cambiar plan» y «Asignar plan» piden confirmación (decisiones del 2026-10-29): la primera con qué
   * cambia, la segunda con lo que tendrá la empresa. La action solo se llama desde el modal.
   */
  function pulsar() {
    if (planId === "" || enVuelo) return;
    setRechazo(null);
    setAvisosAsignados([]);
    setTipoCobro("mensual");
    setErrorDeTipoCobro(undefined);
    setVigenteDesde(fechaDeEfectoPorDefecto ?? "");
    setErrorDeEfecto(undefined);
    if (vista?.plan === null) {
      // D5: cada apertura empieza en «mañana» (antes, R29: «hoy»); R37: y lee la vista previa de esa fecha.
      setInicioCiclo(inicioCicloPorDefecto);
      void leerVistaPrevia(inicioCicloPorDefecto);
    }
    setConfirmando(true);
  }

  /** R37: qué topes pasaría la empresa con esa fecha. Mientras no vuelve con `ok`, no se confirma. */
  async function leerVistaPrevia(fecha: string) {
    const lectura = ++lecturaRef.current;
    setErrorDeFecha(undefined);
    if (fecha === "") {
      // Un campo vaciado no se manda: el servicio lo rechazaría con este mismo texto (R30).
      setVistaPrevia({ fase: "invalida" });
      setErrorDeFecha([textoRangoInicioCiclo(rangoInicioCiclo.min, rangoInicioCiclo.max)]);
      return;
    }
    setVistaPrevia({ fase: "cargando" });
    try {
      const r = await previsualizarAsignacion({ organizacionId, planId, inicioCiclo: fecha });
      if (lectura !== lecturaRef.current) return;
      if (r.estado === "ok") {
        setVistaPrevia({ fase: "ok", avisos: r.avisos });
      } else if (r.estado === "validation_error" && r.fieldErrors.inicioCiclo) {
        setVistaPrevia({ fase: "invalida" });
        setErrorDeFecha(r.fieldErrors.inicioCiclo);
      } else {
        setVistaPrevia({ fase: "fallo", motivo: r.estado === "validation_error" ? null : RECHAZOS[r.estado] });
      }
    } catch (error) {
      if (lectura !== lecturaRef.current) return;
      console.error("[PlanEmpresa] previsualizarAsignacion lanzó", error);
      setVistaPrevia({ fase: "fallo", motivo: null });
    }
  }

  function cambiarFecha(fecha: string) {
    setInicioCiclo(fecha);
    void leerVistaPrevia(fecha);
  }

  /** D10: abre el modal con el tipo que la empresa ya tiene. */
  function abrirCambioDeTipo() {
    if (!vista?.plan || tipoEnVuelo) return;
    setRechazo(null);
    setAvisosAsignados([]);
    setErrorDeNuevoTipo(undefined);
    setNuevoTipoCobro(vista.plan.cobro.tipo);
    setVigenteDesde(fechaDeEfectoPorDefecto ?? "");
    setErrorDeEfecto(undefined);
    setCambiandoTipo(true);
  }

  /**
   * D10: guarda solo el tipo de cobro. Con `cambio: true` relee la página (tipo, monto del período y
   * siguiente cobro salen recalculados del servidor); con `cambio: false` no había nada que cambiar.
   * Un rechazo se explica y no da el cambio por hecho.
   */
  async function guardarTipoCobro() {
    if (tipoEnVuelo) return;
    setTipoEnVuelo(true);
    setRechazo(null);
    setErrorDeNuevoTipo(undefined);
    setErrorDeEfecto(undefined);
    let seguirAbierto = false;
    try {
      const r = await cambiarTipoCobro({ organizacionId, tipoCobro: nuevoTipoCobro, vigenteDesde });
      if (r.estado === "ok") {
        if (r.cambio) {
          // SLT-118 (R32, P11): si quedó pendiente, la fecha real que devuelve el servidor, no la elegida.
          toast.success(r.vigenteDesde === null ? TEXTOS.tipoCobroCambiado : TEXTOS.programado(r.vigenteDesde));
          router.refresh();
        } else {
          toast.info(TEXTOS.tipoCobroSinCambio);
        }
      } else if (r.estado === "validation_error" && r.fieldErrors.tipoCobro) {
        // El error del tipo junto a su campo, con el modal abierto para elegir otro.
        seguirAbierto = true;
        setErrorDeNuevoTipo(r.fieldErrors.tipoCobro);
      } else if (r.estado === "validation_error" && r.fieldErrors.vigenteDesde) {
        // SLT-86 (R16): la fecha de efecto junto a su campo, con el modal abierto para elegir otra.
        seguirAbierto = true;
        setErrorDeEfecto(r.fieldErrors.vigenteDesde);
      } else if (r.estado === "validation_error") {
        setRechazo(TEXTOS.tipoCobroValidacion);
      } else {
        setRechazo(RECHAZOS_TIPO_COBRO[r.estado]);
      }
    } catch (error) {
      console.error("[PlanEmpresa] cambiarTipoCobro lanzó", error);
      setRechazo(TEXTOS.tipoCobroFallo);
    } finally {
      setTipoEnVuelo(false);
      if (!seguirAbierto) setCambiandoTipo(false);
    }
  }

  /**
   * SLT-86 (R19, R26): «Cancelar cambio» del pendiente de la empresa, con o sin plan. Tras un `ok` relee la
   * página (el pendiente desaparece y el historial gana su fila); un rechazo se explica.
   */
  async function cancelarCambio() {
    if (cancelando) return;
    setCancelando(true);
    setRechazo(null);
    setAvisosAsignados([]);
    try {
      const r = await cancelarCambioEmpresa({ organizacionId });
      if (r.estado === "ok") {
        toast.success(TEXTOS.cambioCancelado);
        router.refresh();
      } else {
        setRechazo(RECHAZOS_CANCELAR[r.estado]);
      }
    } catch (error) {
      console.error("[PlanEmpresa] cancelarCambioEmpresa lanzó", error);
      setRechazo(RECHAZO_GENERICO);
    } finally {
      setCancelando(false);
    }
  }

  /** SLT-86 (R26): el pendiente de la empresa: con plan, en su cobro; sin plan, la primera asignación. */
  const pendiente = vista?.plan ? vista.plan.cobro.pendiente : (vista?.pendienteSinPlan ?? null);
  /**
   * SLT-86 (R25): el costo del primer período de cada modal, con lo elegido en él y el precio que regirá
   * en esa fecha (review m4): el del plan elegido o, al cambiar solo el tipo, el del plan actual.
   */
  const historialDe = (id: string | undefined): readonly PrecioDesde[] =>
    id === undefined ? [] : (preciosQueRigen?.[id] ?? []);
  const primerPeriodoDelCambioDePlan =
    elegido === null ? null : lineasDelPrimerPeriodo(elegido.precio, historialDe(elegido.id), tipoCobro, vigenteDesde);
  const primerPeriodoDeLaPrimera =
    elegido === null ? null : lineasDelPrimerPeriodo(elegido.precio, historialDe(elegido.id), tipoCobro, inicioCiclo);
  const primerPeriodoDelCambioDeTipo = lineasDelPrimerPeriodo(
    actual?.precio,
    historialDe(actual?.id),
    nuevoTipoCobro,
    vigenteDesde,
  );

  /** Con el plan actual ilegible no hay resumen: se ofrece releer la página, nunca confirmar. */
  const sinResumen = Boolean(vista?.plan) && lineasDeCambio === null;

  async function asignar() {
    const primera = vista?.plan === null;
    if (planId === "" || enVuelo || sinResumen) return;
    // P11: la primera asignación solo se confirma con la vista previa leída.
    if (primera && vistaPrevia.fase !== "ok") return;
    setEnVuelo(true);
    setRechazo(null);
    setErrorDeCampo(undefined);
    let seguirAbierto = false;
    try {
      const r = await asignarPlan(
        primera
          ? { organizacionId, planId, inicioCiclo, tipoCobro }
          : { organizacionId, planId, vigenteDesde, tipoCobro },
      );
      if (r.estado === "ok") {
        setPlanId("");
        // §11.5 y SLT-86 (R18): los topes ya pasados que no rechazaron, con el texto del modal.
        setAvisosAsignados(r.avisos.map((a) => textoDelAvisoDeTope(a)));
        // SLT-86 (R17): con fecha futura el cambio queda pendiente hasta su fecha. SLT-118 (R32): la fecha
        // real del servidor (llevada al inicio del próximo período), no la elegida.
        toast.success(r.vigenteDesde === null ? TEXTOS.asignado : TEXTOS.programado(r.vigenteDesde));
        router.refresh();
      } else if (primera && r.estado === "validation_error" && r.fieldErrors.inicioCiclo) {
        // §11.5: el error de la fecha junto a su campo, con el modal abierto para elegir otra.
        seguirAbierto = true;
        setVistaPrevia({ fase: "invalida" });
        setErrorDeFecha(r.fieldErrors.inicioCiclo);
      } else if (!primera && r.estado === "validation_error" && r.fieldErrors.vigenteDesde) {
        // SLT-86 (R16): la fecha de efecto junto a su campo, con el modal abierto.
        seguirAbierto = true;
        setErrorDeEfecto(r.fieldErrors.vigenteDesde);
      } else if (r.estado === "validation_error" && r.fieldErrors.tipoCobro) {
        // D6: el error del tipo de cobro junto a su campo, con el modal abierto.
        seguirAbierto = true;
        setErrorDeTipoCobro(r.fieldErrors.tipoCobro);
      } else if (r.estado === "tope_excedido") {
        // R20: qué tope se pasa, con el uso y el tope; el texto ya viene redactado del servicio.
        setRechazo(r.mensaje);
      } else if (r.estado === "validation_error") {
        // R18: el error de validación junto a su campo (el único que la pantalla deja elegir).
        setErrorDeCampo(
          r.fieldErrors.planId ?? r.fieldErrors.organizacionId ?? r.fieldErrors.tipoCobro ?? [TEXTOS.validacion],
        );
      } else {
        setRechazo(RECHAZOS[r.estado]);
      }
    } catch (error) {
      // Un fallo de red o del servidor no da el cambio por hecho (R18).
      console.error("[PlanEmpresa] asignarPlan lanzó", error);
      setRechazo(TEXTOS.fallo);
    } finally {
      setEnVuelo(false);
      // Con `ok` el modal se desmonta (ya no hay plan elegido) antes de poder cerrarse solo.
      if (!seguirAbierto) setConfirmando(false);
    }
  }

  return (
    // SLT-66 (design §6.4, R32): `id="plan"` es el ancla del listado de «Empresas» («Asignar plan»).
    <section id="plan" aria-labelledby={tituloId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={tituloId} className="text-base font-semibold">
          {TEXTOS.titulo}
        </h2>
        {vista?.plan?.archivado && <Badge variant="secondary">{TEXTOS.archivado}</Badge>}
      </div>

      {vista === null ? (
        <AvisoDeError>{TEXTOS.noSeCargo}</AvisoDeError>
      ) : (
        <>
          <ConsumoDelPlan
            plan={vista.plan}
            textoSinPlan={TEXTOS.sinPlan}
            pendienteSinPlan={vista.pendienteSinPlan}
            nivelDeTitulo={3}
          />
          {pendiente !== null && (
            // SLT-86 (R19, R26): el pendiente con plan dice qué entra y desde cuándo (sin plan ya lo dice
            // el estado vacío de arriba); en los dos casos se puede cancelar.
            <div className="flex flex-wrap items-center gap-3">
              {vista.plan !== null && <p className="text-sm font-medium">{TEXTOS_TIPO_COBRO.pendiente(pendiente)}</p>}
              <Button
                type="button"
                variant="outline"
                loading={cancelando}
                onClick={() => {
                  setRechazo(null);
                  setConfirmandoCancelar(true);
                }}
              >
                {TEXTOS_TIPO_COBRO.cancelarCambio}
              </Button>
            </div>
          )}
          {vista.plan !== null && (
            // D10: cambia solo el tipo de cobro del plan que la empresa ya tiene.
            <div>
              <Button type="button" variant="outline" loading={tipoEnVuelo} onClick={abrirCambioDeTipo}>
                {TEXTOS.cambiarTipoCobro}
              </Button>
            </div>
          )}
          {vista.plan?.archivado && <p className="text-sm text-muted-foreground">{TEXTOS.planArchivado}</p>}
          {vista.plan?.costeo.sinCostoConcreto && (
            // Un estado fijo del plan, no un aviso que llega: `note` y no el `alert` de la primitiva.
            <Alert role="note" className="border-warning/40 text-warning-strong">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="text-warning-strong">{TEXTOS.planSinCosto}</AlertDescription>
            </Alert>
          )}

          {asignables === null ? (
            <AvisoDeError>{TEXTOS.asignablesNoCargaron}</AvisoDeError>
          ) : opciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TEXTOS.sinAsignables}</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormField id={campoId} label={TEXTOS.elegirPlan} error={errorDeCampo} className="sm:w-80">
                {(control) => (
                  <Select
                    {...control}
                    aria-label={TEXTOS.elegirPlan}
                    value={planId}
                    onValueChange={(v) => {
                      setPlanId(v);
                      setRechazo(null);
                      setAvisosAsignados([]);
                      setErrorDeCampo(undefined);
                    }}
                    options={opciones}
                    placeholder={TEXTOS.placeholder}
                    disabled={enVuelo}
                  />
                )}
              </FormField>
              <Button type="button" loading={enVuelo} disabled={planId === ""} onClick={pulsar}>
                {vista.plan === null ? TEXTOS.asignar : TEXTOS.cambiar}
              </Button>
            </div>
          )}

          {rechazo !== null && <AvisoDeError>{rechazo}</AvisoDeError>}
          {avisosAsignados.length > 0 && <AvisosDeTopes avisos={avisosAsignados} />}

          <div className="flex flex-col gap-2">
            <h3 id={historialId} className="text-sm font-semibold">
              {TEXTOS.historial}
            </h3>
            {vista.asignaciones.length === 0 ? (
              <div className="rounded-md border border-border">
                <EmptyState title={TEXTOS.sinHistorial} />
              </div>
            ) : (
              <Table aria-labelledby={historialId}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{TEXTOS.fecha}</TableHead>
                    <TableHead>{TEXTOS.quien}</TableHead>
                    <TableHead>{TEXTOS.planAsignado}</TableHead>
                    <TableHead>{TEXTOS.tipoCobro}</TableHead>
                    <TableHead>{TEXTOS.rigeDesde}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* R21: ya llegan del más reciente al más antiguo; se respeta ese orden. */}
                  {vista.asignaciones.map((a, i) => (
                    <TableRow key={`${a.creadoAt}-${i}`}>
                      <TableCell>
                        <time dateTime={a.creadoAt}>{fechaHoraPlataforma(a.creadoAt)}</time>
                      </TableCell>
                      <TableCell>{a.actorNombre}</TableCell>
                      <TableCell>{a.planNombre}</TableCell>
                      {/* D14: el tipo de cobro de la fila; un cambio de solo el tipo (D10) dice de cuál a cuál. */}
                      <TableCell>{textoDelTipoCobroDeLaFila(a)}</TableCell>
                      <TableCell className="tabular-nums">{rigeDesdeDeLaFila(a)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {vista?.plan && elegido !== null ? (
        sinResumen ? (
          // Decisión del 2026-10-29: sin el resumen no se confirma. «Reintentar» relee la página y el
          // modal sigue abierto: si la lectura vuelve, el resumen aparece en su sitio.
          <Modal
            open={confirmando}
            onOpenChange={setConfirmando}
            title={TEXTOS.confirmarTitulo}
            confirmLabel={TEXTOS.reintentar}
            cancelLabel={TEXTOS.volver}
            closeOnConfirm={false}
            size="md"
            onConfirm={() => router.refresh()}
          >
            <AvisoDeError>{TEXTOS.actualNoSeCargo}</AvisoDeError>
          </Modal>
        ) : (
          <Modal
            open={confirmando}
            onOpenChange={setConfirmando}
            title={TEXTOS.confirmarTitulo}
            description={TEXTOS.confirmarTexto(vista.plan.nombre, elegido.nombre)}
            confirmLabel={TEXTOS.cambiar}
            confirmDisabled={enVuelo}
            cancelLabel={TEXTOS.volver}
            // SLT-86 (R16): un error de «Rige desde» deja el modal abierto con el error junto al campo.
            closeOnConfirm={false}
            size="md"
            onConfirm={() => asignar()}
          >
            {lineasDeCambio === null || lineasDeCambio.length === 0 ? (
              <p className="text-sm">{SIN_LINEAS_DE_CAMBIO}</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <p>{TITULO_LINEAS_DE_CAMBIO}</p>
                <ul aria-label={TITULO_LINEAS_DE_CAMBIO} className="flex list-disc flex-col gap-1 pl-5">
                  {lineasDeCambio.map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* SLT-66 (R24): el costo del plan nuevo se ve aunque no cambie respecto del actual. */}
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {lineasDeCosto(elegido).map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
            {/* D6: el tipo de cobro se elige también en un cambio de plan. SLT-86 (R16, R25): con su fecha
                de efecto y el costo del primer período o tramo que abrirá. */}
            <div className="mt-3 flex flex-col gap-3">
              <TipoCobroCampo
                id={tipoCobroId}
                value={tipoCobro}
                onValueChange={(t) => {
                  setTipoCobro(t);
                  setErrorDeTipoCobro(undefined);
                }}
                error={errorDeTipoCobro}
                disabled={enVuelo}
              />
              <CampoRigeDesde
                id={efectoId}
                valor={vigenteDesde}
                rango={rangoFechaDeEfecto}
                error={errorDeEfecto}
                disabled={enVuelo}
                onCambio={(f) => {
                  setVigenteDesde(f);
                  setErrorDeEfecto(undefined);
                }}
              />
              {primerPeriodoDelCambioDePlan !== null && <LineasDelPrimerPeriodo lineas={primerPeriodoDelCambioDePlan} />}
            </div>
          </Modal>
        )
      ) : null}

      {pendiente !== null ? (
        // Decisión del 2026-11-06: la action solo se llama desde este modal; cerrarlo no cancela nada.
        // Botones como en el detalle del plan: «Cancelar cambio» (destructivo) y «Volver».
        <Modal
          open={confirmandoCancelar}
          onOpenChange={setConfirmandoCancelar}
          title={TEXTOS.confirmarCancelar(pendiente.planNombre, pendiente.desde)}
          confirmLabel={TEXTOS_TIPO_COBRO.cancelarCambio}
          cancelLabel={TEXTOS.volver}
          confirmVariant="destructive"
          size="md"
          onConfirm={() => cancelarCambio()}
        />
      ) : null}

      {vista?.plan ? (
        // D10: el tipo de cobro nuevo; el plan, el ancla y los módulos no cambian.
        <Modal
          open={cambiandoTipo}
          onOpenChange={setCambiandoTipo}
          title={TEXTOS.cambiarTipoCobroTitulo}
          description={TEXTOS.cambiarTipoCobroTexto(vista.plan.nombre)}
          confirmLabel={TEXTOS.cambiarTipoCobro}
          confirmDisabled={tipoEnVuelo}
          cancelLabel={TEXTOS.volver}
          closeOnConfirm={false}
          size="md"
          onConfirm={() => guardarTipoCobro()}
        >
          <div className="flex flex-col gap-3">
            <TipoCobroCampo
              id={nuevoTipoCobroId}
              value={nuevoTipoCobro}
              onValueChange={(t) => {
                setNuevoTipoCobro(t);
                setErrorDeNuevoTipo(undefined);
              }}
              error={errorDeNuevoTipo}
              disabled={tipoEnVuelo}
            />
            {/* SLT-86 (R16, R25): desde cuándo y cuánto cuesta el primer período o tramo con el tipo nuevo. */}
            <CampoRigeDesde
              id={efectoTipoId}
              valor={vigenteDesde}
              rango={rangoFechaDeEfecto}
              error={errorDeEfecto}
              disabled={tipoEnVuelo}
              onCambio={(f) => {
                setVigenteDesde(f);
                setErrorDeEfecto(undefined);
              }}
            />
            {primerPeriodoDelCambioDeTipo !== null && <LineasDelPrimerPeriodo lineas={primerPeriodoDelCambioDeTipo} />}
          </div>
        </Modal>
      ) : null}

      {vista && vista.plan === null && elegido !== null && lineasDePrimera !== null ? (
        // §11.5: sin vista previa no se confirma (P11). Si la lectura falla, el botón de confirmar pasa
        // a ser «Reintentar» (relee con la misma fecha) y «Asignar plan» no se ofrece.
        <Modal
          open={confirmando}
          onOpenChange={setConfirmando}
          title={TEXTOS.primeraTitulo}
          description={TEXTOS.primeraTexto(elegido.nombre, empresaNombre)}
          confirmLabel={vistaPrevia.fase === "fallo" ? TEXTOS.reintentar : TEXTOS.asignar}
          confirmDisabled={vistaPrevia.fase === "cargando" || vistaPrevia.fase === "invalida"}
          cancelLabel={TEXTOS.volver}
          closeOnConfirm={false}
          size="md"
          onConfirm={() => (vistaPrevia.fase === "fallo" ? leerVistaPrevia(inicioCiclo) : asignar())}
        >
          <div className="flex flex-col gap-3 text-sm">
            <ul aria-label={TEXTOS.primeraLista} className="flex list-disc flex-col gap-1 pl-5">
              {lineasDePrimera.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
            <FormField id={fechaId} label={TEXTOS.inicioCiclo} error={errorDeFecha}>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={inicioCiclo}
                  min={rangoInicioCiclo.min}
                  max={rangoInicioCiclo.max}
                  disabled={enVuelo}
                  onChange={(ev) => cambiarFecha(ev.target.value)}
                />
              )}
            </FormField>
            {inicioCiclo !== "" && <p>{TEXTOS.empiezaARegir(inicioCiclo)}</p>}
            {/* D6: el tipo de cobro de la primera asignación. */}
            <TipoCobroCampo
              id={tipoCobroId}
              value={tipoCobro}
              onValueChange={(t) => {
                setTipoCobro(t);
                setErrorDeTipoCobro(undefined);
              }}
              error={errorDeTipoCobro}
              disabled={enVuelo}
            />
            {/* SLT-86 (R25): el costo base del primer período o tramo, con el tipo y la fecha elegidos. */}
            {primerPeriodoDeLaPrimera !== null && <LineasDelPrimerPeriodo lineas={primerPeriodoDeLaPrimera} />}
            {vistaPrevia.fase === "fallo" ? (
              <AvisoDeError>
                {vistaPrevia.motivo === null
                  ? TEXTOS.vistaPreviaNoCargo
                  : `${TEXTOS.vistaPreviaNoCargo}\n${vistaPrevia.motivo}`}
              </AvisoDeError>
            ) : vistaPrevia.fase === "ok" && vistaPrevia.avisos.length > 0 ? (
              <AvisosDeTopes avisos={vistaPrevia.avisos.map((a) => textoDelAvisoDeTope(a))} />
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

interface CampoRigeDesdeProps {
  id: string;
  valor: string;
  rango: RangoDelInicioDelCiclo;
  error: string[] | undefined;
  disabled: boolean;
  onCambio: (fecha: string) => void;
}

/** SLT-86 (R16, R25; design §7.1): la fecha de efecto de un cambio de empresa, con su rango y su ayuda. */
function CampoRigeDesde({ id, valor, rango, error, disabled, onCambio }: CampoRigeDesdeProps) {
  return (
    <FormField id={id} label={TEXTOS_TIPO_COBRO.rigeDesde} hint={TEXTOS_TIPO_COBRO.ayudaCambioDeEmpresa} error={error}>
      {(control) => (
        <Input
          {...control}
          type="date"
          value={valor}
          min={rango.min}
          max={rango.max}
          disabled={disabled}
          onChange={(ev) => onCambio(ev.target.value)}
        />
      )}
    </FormField>
  );
}

/** SLT-86 (R25): «Costo base {tipo}: …» y «Período: … (tramo de d de D días)». */
function LineasDelPrimerPeriodo({ lineas }: { lineas: string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {lineas.map((linea) => (
        <li key={linea}>{linea}</li>
      ))}
    </ul>
  );
}

/**
 * Un fallo de lectura o un rechazo (R18, R20). `Alert` destructivo como `PlanForm`/`PlanDetalle`, con el
 * texto en `danger-strong` (6,47:1 sobre la tarjeta): el `destructive` del variant se queda en 3,76:1.
 */
function AvisoDeError({ children }: { children: string }) {
  return (
    <Alert variant="destructive" className="text-danger-strong *:data-[slot=alert-description]:text-danger-strong">
      <AlertDescription className="whitespace-pre-line">{children}</AlertDescription>
    </Alert>
  );
}
