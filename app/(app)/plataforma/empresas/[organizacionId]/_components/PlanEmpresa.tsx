"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { formatearConteo } from "@/lib/planes/consumo";
import {
  apiKeysYaPasadas,
  lineasDeCambioDelPlan,
  ordenesYaPasadas,
  rangoInicioCiclo as textoRangoInicioCiclo,
  rolYaPasado,
  SIN_LINEAS_DE_CAMBIO,
  TITULO_LINEAS_DE_CAMBIO,
  type CambioDelPlanParaCorreo,
} from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import type {
  PlanDeEmpresaVista,
  PlanDTO,
  PlanResult,
  TopeExcedido,
  VistaPreviaAsignacionResult,
} from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
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
  /**
   * SLT-66 (design §6.5, R29): el servicio ya no trae ningún plan con costo concreto. Va en piezas para
   * enlazar «Planes»: «No hay planes con costo concreto para esta empresa. Crea un custom con sus precios
   * en «Planes».».
   */
  sinPlanesConCosto: {
    antes: "No hay planes con costo concreto para esta empresa. Crea un custom con sus precios en «",
    enlace: "Planes",
    despues: "».",
  },
  /** SLT-66 (design §6.5, R20): el plan actual no tiene costo base «monto» o le falta el costo por orden. */
  planSinCosto:
    "Plan sin costo concreto: complétalo en «Planes» o asígnale otro con costo base y costo por orden.",
  asignablesNoCargaron: "No se pudieron cargar los planes que se pueden asignar.",
  asignar: "Asignar plan",
  cambiar: "Cambiar plan",
  asignado: "Plan asignado.",
  validacion: "Revisa el plan elegido.",
  fallo: "No se pudo asignar el plan. Inténtalo de nuevo.",
  confirmarTitulo: "¿Cambiar el plan de esta empresa?",
  confirmarTexto: (actual: string, nuevo: string) =>
    `La empresa pasa de «${actual}» a «${nuevo}». Sus topes y módulos cambian en cuanto confirmes.`,
  /** Decisión del 2026-10-29: sin el plan actual no hay resumen, y sin resumen no se confirma. */
  actualNoSeCargo: "No se pudo cargar el plan actual",
  reintentar: "Reintentar",
  /** Primera asignación (decisión del 2026-10-29): el mismo modal, con lo que tendrá la empresa. */
  primeraTitulo: "¿Asignar este plan a la empresa?",
  primeraTexto: (plan: string, empresa: string) => `Asignar ${plan} a ${empresa}: desde ahora tendrá:`,
  primeraLista: "Lo que tendrá la empresa",
  modulosIncluidos: (modulos: string) => `Módulos incluidos: ${modulos}`,
  sinModulos: "Ninguno",
  /** R38 (aprobado el 2026-10-29): sustituye a «El ciclo de órdenes empieza hoy.». */
  cicloEmpiezaEl: (fecha: string) => `El ciclo de órdenes empieza el ${fecha}.`,
  /** P13 (aprobado el 2026-10-29). */
  inicioCiclo: "Inicio del ciclo de órdenes",
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
} as const;

/** design §6.5: el texto de cada rechazo de `asignarPlanAction` (R18). `tope_excedido` trae el suyo. */
const RECHAZOS: Record<Exclude<PlanResult["estado"], "ok" | "tope_excedido" | "validation_error">, string> = {
  forbidden: "No tienes permiso para esto.",
  not_found: "El plan o la empresa ya no existe.",
  archivado: "El plan está archivado.",
  custom_de_otra_empresa: "Ese plan es de otra empresa.",
  sin_cambio_programado: "El plan ya no tiene un cambio pendiente.",
  plan_sin_costo: "Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios para asignarlo.",
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
   * primera asignación (R29); «Cambiar plan» nunca lo manda (R31).
   */
  asignarPlan: (input: { organizacionId: string; planId: string; inicioCiclo?: string }) => Promise<PlanResult>;
  /**
   * SLT-58 §11.5 (R30): el rango de la fecha de inicio del ciclo, calculado en el servidor para no
   * depender del reloj del navegador. `hoy` es el valor por defecto del campo.
   */
  rangoInicioCiclo: RangoDelInicioDelCiclo;
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
}

/**
 * La vista previa de la primera asignación (R37). `invalida` = la fecha no vale (su error va junto al
 * campo); `fallo` = no se pudo leer (P11), con el rechazo del servicio si lo hubo.
 */
type VistaPrevia =
  | { fase: "cargando" }
  | { fase: "ok"; avisos: TopeExcedido[]; siguienteCiclo: string }
  | { fase: "invalida" }
  | { fase: "fallo"; motivo: string | null };

/** R37/R42: el texto de un tope que la empresa ya pasa; `siguienteCiclo` es la fecha de P10. */
function textoDelAviso(aviso: TopeExcedido, siguienteCiclo: string): string {
  const usados = formatearConteo(aviso.usados);
  const maximo = formatearConteo(aviso.maximo);
  if (aviso.tope === "ordenes") return ordenesYaPasadas(usados, maximo, siguienteCiclo);
  if (aviso.tope === "api_keys") return apiKeysYaPasadas(usados, maximo);
  return rolYaPasado(usados, maximo, aviso.tope);
}

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
  previsualizarAsignacion,
  planPreseleccionado,
}: PlanEmpresaProps) {
  const tituloId = useId();
  const historialId = useId();
  const campoId = useId();
  const fechaId = useId();
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
  const [inicioCiclo, setInicioCiclo] = useState(rangoInicioCiclo.hoy);
  const [vistaPrevia, setVistaPrevia] = useState<VistaPrevia>({ fase: "cargando" });
  const [errorDeFecha, setErrorDeFecha] = useState<string[] | undefined>(undefined);
  /** Los avisos del `ok` de la primera asignación (§11.5), bajo la sección y con el texto del modal. */
  const [avisosAsignados, setAvisosAsignados] = useState<string[]>([]);
  // Cada lectura de la vista previa lleva su número: si el superadmin cambia la fecha antes de que
  // vuelva la anterior, la respuesta vieja se descarta y no pisa los avisos de la fecha nueva.
  const lecturaRef = useRef(0);

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
    if (vista?.plan === null) {
      // R29: cada apertura empieza en «hoy»; R37: y lee la vista previa de esa fecha.
      setInicioCiclo(rangoInicioCiclo.hoy);
      void leerVistaPrevia(rangoInicioCiclo.hoy);
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
        setVistaPrevia({ fase: "ok", avisos: r.avisos, siguienteCiclo: r.siguienteCiclo });
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
      const r = await asignarPlan(primera ? { organizacionId, planId, inicioCiclo } : { organizacionId, planId });
      if (r.estado === "ok") {
        setPlanId("");
        if (primera && vistaPrevia.fase === "ok") {
          setAvisosAsignados(r.avisos.map((a) => textoDelAviso(a, vistaPrevia.siguienteCiclo)));
        }
        toast.success(TEXTOS.asignado);
        router.refresh();
      } else if (primera && r.estado === "validation_error" && r.fieldErrors.inicioCiclo) {
        // §11.5: el error de la fecha junto a su campo, con el modal abierto para elegir otra.
        seguirAbierto = true;
        setVistaPrevia({ fase: "invalida" });
        setErrorDeFecha(r.fieldErrors.inicioCiclo);
      } else if (r.estado === "tope_excedido") {
        // R20: qué tope se pasa, con el uso y el tope; el texto ya viene redactado del servicio.
        setRechazo(r.mensaje);
      } else if (r.estado === "validation_error") {
        // R18: el error de validación junto a su campo (el único que la pantalla deja elegir).
        setErrorDeCampo(r.fieldErrors.planId ?? r.fieldErrors.organizacionId ?? [TEXTOS.validacion]);
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
          <ConsumoDelPlan plan={vista.plan} textoSinPlan={TEXTOS.sinPlan} nivelDeTitulo={3} />
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
          ) : asignables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {TEXTOS.sinPlanesConCosto.antes}
              <Link
                href="/plataforma/planes"
                className="rounded-sm text-primary-strong underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
              >
                {TEXTOS.sinPlanesConCosto.enlace}
              </Link>
              {TEXTOS.sinPlanesConCosto.despues}
            </p>
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
            cancelLabel={TEXTOS.volver}
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
          </Modal>
        )
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
            {inicioCiclo !== "" && <p>{TEXTOS.cicloEmpiezaEl(inicioCiclo)}</p>}
            {vistaPrevia.fase === "fallo" ? (
              <AvisoDeError>
                {vistaPrevia.motivo === null
                  ? TEXTOS.vistaPreviaNoCargo
                  : `${TEXTOS.vistaPreviaNoCargo}\n${vistaPrevia.motivo}`}
              </AvisoDeError>
            ) : vistaPrevia.fase === "ok" && vistaPrevia.avisos.length > 0 ? (
              <AvisosDeTopes avisos={vistaPrevia.avisos.map((a) => textoDelAviso(a, vistaPrevia.siguienteCiclo))} />
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

/**
 * R37/R42: los topes que la empresa ya pasa con el plan. No es un error (el plan se asigna igual), así
 * que va en el `Alert` normal; uno por tope, con el mismo texto antes y después de confirmar.
 */
function AvisosDeTopes({ avisos }: { avisos: string[] }) {
  return (
    <Alert>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
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
