"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Modal } from "@/components/shared/Modal";
import { CarruselDePlanes } from "@/components/shared/planes/CarruselDePlanes";
import { DetalleDePlan, type ActivoDelDetalle } from "@/components/shared/planes/DetalleDePlan";
import { usoDeLasFilas, type VistaDePrecio } from "@/components/shared/planes/planes-vista";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cambiarMiPlanAction, cancelarCambioMiPlanAction } from "@/lib/actions/mi-plan";
import type { PendienteDeEmpresa, PlanConConsumo } from "@/lib/types/consumo-plan";
import type { CambiarMiPlanResult, PlanesDeMiPlanResult, PlanVista, PrimerPeriodo } from "@/lib/types/planes";

// SLT-99 (design §4, §5, §6; R8, R16–R20) — el cambio de plan del maestro en «Mi plan»: el carrusel y el detalle
// compartidos, la confirmación (sin elegir fecha: rige en el corte) y «Cancelar cambio» del pendiente, sea de quien
// sea (P3). Tras un `ok` relee la página con `router.refresh()`: las actions no revalidan la ruta (guardia de SLT-91).

export type PlanesDeMiPlan = Extract<PlanesDeMiPlanResult, { estado: "ok" }>;

/** Textos de la pantalla del cambio, aprobados con el spec (design §6). */
export const TEXTOS_CAMBIO = {
  planesDisponibles: "Planes disponibles",
  confirmarTitulo: (plan: string) => `¿Cambiar a ${plan}?`,
  cuandoCambia: (plan: string, corte: string, activo: string) =>
    `Tu plan cambia a ${plan} el ${corte}. Hasta entonces sigues con ${activo}.`,
  primerPeriodo: (plan: string, desde: string, hasta: string, costo: string) =>
    `Tu primer período con ${plan}: ${desde} – ${hasta}, costo base ${costo}.`,
  primerPeriodoSinCuota: (plan: string, desde: string, hasta: string) =>
    `Tu primer período con ${plan}: ${desde} – ${hasta}, Sin cuota.`,
  reemplaza: (p: PendienteDeEmpresa) => `Esto reemplaza el cambio programado: ${TEXTOS_TIPO_COBRO.pendiente(p)}.`,
  dejasCustom: "Si dejas tu plan a la medida, solo la plataforma puede volver a asignártelo.",
  porDefinir: "por definir",
  confirmarCambio: "Confirmar cambio",
  volver: "Volver",
  hecho: (plan: string, corte: string) => `Listo: tu plan cambia a ${plan} el ${corte}.`,
  confirmarCancelar: (p: PendienteDeEmpresa) => `¿Cancelar el cambio a ${p.planNombre} programado para el ${p.desde}?`,
  rechazos: {
    no_disponible: "Ese plan ya no está disponible.",
    sin_plan: "Tu empresa no tiene plan: pide uno a la plataforma.",
    sin_cambio_programado: "Tu empresa ya no tiene un cambio pendiente.",
    generico: "No se pudo guardar. Inténtalo de nuevo.",
  },
} as const;

/** R20: el texto de cada rechazo del cambio; el de `tope_excedido` lo trae el servicio (una línea por tope). */
function textoDelRechazo(r: Exclude<CambiarMiPlanResult, { estado: "ok" }>): string {
  switch (r.estado) {
    case "tope_excedido":
      return r.mensaje;
    case "no_disponible":
    case "sin_plan":
      return TEXTOS_CAMBIO.rechazos[r.estado];
    default:
      return TEXTOS_CAMBIO.rechazos.generico;
  }
}

function Rechazo({ texto }: { texto: string }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {/* El de `tope_excedido` trae una línea por tope pasado (P4). */}
        <div className="flex flex-col gap-1">
          {texto.split("\n").map((linea) => (
            <p key={linea}>{linea}</p>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export interface CambioDePlanProps {
  readonly planes: PlanesDeMiPlan;
  /** El plan activo con su uso y su cobro (`verMiPlan`); `null` sin plan. */
  readonly plan: PlanConConsumo | null;
  /** R17: el pendiente de la empresa, para avisar en la confirmación que se reemplaza. */
  readonly pendiente: PendienteDeEmpresa | null;
}

export function CambioDePlan({ planes, plan, pendiente }: CambioDePlanProps) {
  const router = useRouter();
  const [vista, setVista] = useState<VistaDePrecio>("mensual");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<string | null>(null);

  const activoVista = planes.planes.find((p) => p.id === planes.activoId) ?? planes.customActivo;
  const activo: ActivoDelDetalle | null =
    plan !== null && planes.tipoCobro !== null
      ? {
          plan: activoVista,
          uso: usoDeLasFilas(plan.filas, plan.ordenesDelPeriodo),
          tipoCobro: planes.tipoCobro,
          periodo: plan.cobro.periodo,
          siguienteCobro: plan.cobro.siguienteCobro,
          activoDesde: plan.activoDesde,
        }
      : null;
  const elegido: PlanVista | null =
    planes.planes.find((p) => p.id === seleccionado) ??
    (planes.customActivo?.id === seleccionado ? planes.customActivo : null);

  function seleccionar(planId: string) {
    setSeleccionado(planId);
    setHecho(null);
    setRechazo(null);
  }

  async function cambiar(destino: PlanVista) {
    setHecho(null);
    setRechazo(null);
    try {
      const r = await cambiarMiPlanAction({ planId: destino.id });
      if (r.estado !== "ok") {
        setRechazo(textoDelRechazo(r));
        return;
      }
      if (r.vigenteDesde !== null) setHecho(TEXTOS_CAMBIO.hecho(destino.nombre, r.vigenteDesde));
      router.refresh();
    } catch (error) {
      console.error("[CambioDePlan] cambiarMiPlanAction lanzó", error);
      setRechazo(TEXTOS_CAMBIO.rechazos.generico);
    }
  }

  return (
    <section aria-labelledby="planes-disponibles" className="flex flex-col gap-4">
      <h2 id="planes-disponibles" className="text-lg font-semibold">
        {TEXTOS_CAMBIO.planesDisponibles}
      </h2>
      <CarruselDePlanes
        planes={planes.planes}
        vista={vista}
        onCambiarVista={setVista}
        activoId={planes.activoId}
        customActivo={planes.customActivo}
        seleccionado={seleccionado}
        onSeleccionar={seleccionar}
      />

      {hecho !== null && (
        <p role="status" className="text-sm font-medium">
          {hecho}
        </p>
      )}
      {rechazo !== null && <Rechazo texto={rechazo} />}

      {elegido !== null && (
        <DetalleDePlan
          plan={elegido}
          vista={vista}
          activo={activo}
          // R18 (P5): sin plan no hay «Cambiar a».
          onCambiar={planes.puedeCambiar ? () => setConfirmando(true) : undefined}
        />
      )}

      {elegido !== null && planes.corte !== null && (
        <Modal
          open={confirmando}
          onOpenChange={setConfirmando}
          title={TEXTOS_CAMBIO.confirmarTitulo(elegido.nombre)}
          confirmLabel={TEXTOS_CAMBIO.confirmarCambio}
          cancelLabel={TEXTOS_CAMBIO.volver}
          size="md"
          onConfirm={() => cambiar(elegido)}
        >
          <CuerpoDeLaConfirmacion
            destino={elegido}
            corte={planes.corte}
            activo={plan?.nombre ?? ""}
            primerPeriodo={planes.primerPeriodo[elegido.id]}
            pendiente={pendiente}
            activoEsCustom={planes.activoEsCustom}
          />
        </Modal>
      )}
    </section>
  );
}

interface CuerpoProps {
  destino: PlanVista;
  corte: string;
  activo: string;
  primerPeriodo: PrimerPeriodo | undefined;
  pendiente: PendienteDeEmpresa | null;
  activoEsCustom: boolean;
}

/** R19: el corte y el primer período con su costo base, sin opción de fecha; el reemplazo (R17) y el aviso de P6. */
function CuerpoDeLaConfirmacion({ destino, corte, activo, primerPeriodo, pendiente, activoEsCustom }: CuerpoProps) {
  const { nombre } = destino;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{TEXTOS_CAMBIO.cuandoCambia(nombre, corte, activo)}</p>
      {primerPeriodo !== undefined && (
        <p>
          {primerPeriodo.costo === "0.00"
            ? TEXTOS_CAMBIO.primerPeriodoSinCuota(nombre, primerPeriodo.periodo.desde, primerPeriodo.periodo.hasta)
            : TEXTOS_CAMBIO.primerPeriodo(
                nombre,
                primerPeriodo.periodo.desde,
                primerPeriodo.periodo.hasta,
                primerPeriodo.costo ?? TEXTOS_CAMBIO.porDefinir,
              )}
        </p>
      )}
      {pendiente !== null && <p>{TEXTOS_CAMBIO.reemplaza(pendiente)}</p>}
      {activoEsCustom && <p className="font-medium">{TEXTOS_CAMBIO.dejasCustom}</p>}
    </div>
  );
}

/** R16, R17 (P3): el pendiente de la empresa, lo haya programado el maestro o el superadmin, con «Cancelar cambio». */
export function PendienteDelPlan({ pendiente }: { readonly pendiente: PendienteDeEmpresa }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);

  async function cancelar() {
    setRechazo(null);
    try {
      const r = await cancelarCambioMiPlanAction({});
      if (r.estado === "ok") {
        router.refresh();
        return;
      }
      setRechazo(
        r.estado === "sin_cambio_programado" || r.estado === "sin_plan"
          ? TEXTOS_CAMBIO.rechazos[r.estado]
          : TEXTOS_CAMBIO.rechazos.generico,
      );
    } catch (error) {
      console.error("[PendienteDelPlan] cancelarCambioMiPlanAction lanzó", error);
      setRechazo(TEXTOS_CAMBIO.rechazos.generico);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">{TEXTOS_TIPO_COBRO.pendiente(pendiente)}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(true)}>
          {TEXTOS_TIPO_COBRO.cancelarCambio}
        </Button>
      </div>
      {rechazo !== null && <Rechazo texto={rechazo} />}
      <Modal
        open={confirmando}
        onOpenChange={setConfirmando}
        title={TEXTOS_CAMBIO.confirmarCancelar(pendiente)}
        confirmLabel={TEXTOS_TIPO_COBRO.cancelarCambio}
        cancelLabel={TEXTOS_CAMBIO.volver}
        confirmVariant="destructive"
        size="md"
        onConfirm={() => cancelar()}
      />
    </div>
  );
}
