"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import {
  lineasDeCambioDelPlan,
  SIN_LINEAS_DE_CAMBIO,
  TITULO_LINEAS_DE_CAMBIO,
  type CambioDelPlanParaCorreo,
} from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import type { PlanDeEmpresaVista, PlanDTO, PlanResult } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";
import { lineasDeTopes } from "@/app/(app)/plataforma/planes/_components/plan-vista";

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
  cicloEmpiezaHoy: "El ciclo de órdenes empieza hoy.",
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
  /** `asignarPlanAction`, inyectada desde la página para poder probarla. */
  asignarPlan: (input: { organizacionId: string; planId: string }) => Promise<PlanResult>;
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
}: PlanEmpresaProps) {
  const tituloId = useId();
  const historialId = useId();
  const campoId = useId();
  const router = useRouter();
  const toast = useToast();
  const [planId, setPlanId] = useState("");
  const [enVuelo, setEnVuelo] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [errorDeCampo, setErrorDeCampo] = useState<string[] | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);

  const planActualId = vista?.plan?.planId ?? null;

  // R20: solo los asignables a ESTA empresa (públicos y customs suyos, no archivados). El servicio ya
  // filtra; se vuelve a mirar aquí para que la pantalla nunca ofrezca uno que la base rechazaría. El
  // plan que ya tiene no se ofrece: «cambiar» a él no cambia nada.
  const opciones: SelectOption[] = useMemo(
    () =>
      (asignables ?? [])
        .filter(
          (p) =>
            !p.archivado &&
            (p.visibilidad === "publico" || p.organizacionId === organizacionId) &&
            p.id !== planActualId,
        )
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
    return [...lineasDeTopes(elegido.topes), TEXTOS.modulosIncluidos(modulos)];
  }, [elegido]);

  /**
   * «Cambiar plan» y «Asignar plan» piden confirmación (decisiones del 2026-10-29): la primera con qué
   * cambia, la segunda con lo que tendrá la empresa. La action solo se llama desde el modal.
   */
  function pulsar() {
    if (planId === "" || enVuelo) return;
    setRechazo(null);
    setConfirmando(true);
  }

  /** Con el plan actual ilegible no hay resumen: se ofrece releer la página, nunca confirmar. */
  const sinResumen = Boolean(vista?.plan) && lineasDeCambio === null;

  async function asignar() {
    if (planId === "" || enVuelo || sinResumen) return;
    setEnVuelo(true);
    setRechazo(null);
    setErrorDeCampo(undefined);
    try {
      const r = await asignarPlan({ organizacionId, planId });
      if (r.estado === "ok") {
        setPlanId("");
        toast.success(TEXTOS.asignado);
        router.refresh();
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
      setConfirmando(false);
    }
  }

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-4">
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
          </Modal>
        )
      ) : null}

      {vista && vista.plan === null && elegido !== null && lineasDePrimera !== null ? (
        <Modal
          open={confirmando}
          onOpenChange={setConfirmando}
          title={TEXTOS.primeraTitulo}
          description={TEXTOS.primeraTexto(elegido.nombre, empresaNombre)}
          confirmLabel={TEXTOS.asignar}
          cancelLabel={TEXTOS.volver}
          size="md"
          onConfirm={() => asignar()}
        >
          <div className="flex flex-col gap-2 text-sm">
            <ul aria-label={TEXTOS.primeraLista} className="flex list-disc flex-col gap-1 pl-5">
              {lineasDePrimera.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
            <p>{TEXTOS.cicloEmpiezaHoy}</p>
          </div>
        </Modal>
      ) : null}
    </section>
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
