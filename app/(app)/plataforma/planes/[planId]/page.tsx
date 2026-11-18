import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { verDetalleDePlan } from "@/lib/actions/_shared/planes-plataforma";
import {
  confirmarBorradorAction,
  descartarBorradorAction,
  guardarPasoBorradorAction,
  leerBorradorAction,
} from "@/lib/actions/plan-borrador";
import { archivarPlanAction, cancelarCambioPlanAction, previsualizarCambioPlanAction } from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { PlanDTO } from "@/lib/types/planes";
import { mananaCalendarioPlataforma } from "@/lib/planes/ciclo";

import { PlanDetalle } from "./_components/PlanDetalle";

/**
 * SLT-66 (design §6.6; R33) — las empresas a las que ofrecer el plan: un público, las que no lo tienen
 * ya; un custom, solo su empresa si aún no lo tiene. Aislada: `null` = no se pudieron leer, y el
 * detalle lo dice sin tumbar la página.
 */
async function leerEmpresasCandidatas(actor: Actor, plan: PlanDTO): Promise<{ id: string; nombre: string }[] | null> {
  try {
    const listado = await listarEmpresasPlataforma(actor);
    if (listado.status !== "ok") return null;
    return listado.empresas
      .filter((e) => e.plan?.id !== plan.id)
      .filter((e) => plan.visibilidad === "publico" || e.id === plan.organizacionId)
      .map((e) => ({ id: e.id, nombre: e.nombre }));
  } catch (error) {
    console.error("[PlanDetallePage] listarEmpresasPlataforma lanzó", error);
    return null;
  }
}

/**
 * SLT-58 (design §4.2, §6.3; R15–R17, R22) — el detalle de un plan para el superadmin (Server
 * Component). Cualquier rol de empresa, o sin sesión, recibe `notFound()` ANTES de leer nada. Un
 * `planId` que no es uuid o que no existe responde lo mismo: «no encontrado». Las escrituras son las
 * actions de SL-24, que bajan por props sin cambios (R25).
 *
 * SLT-144 (design §6; R26, R28): editar guarda por pasos en el borrador de cambio del plan y lo confirma, con las
 * actions de `lib/actions/plan-borrador.ts`; `editarPlanAction` ya no baja. La página no lee el borrador: lo lee el
 * panel al abrirse, así que antes del `notFound()` no se lee nada. `?editar=1` (Retomar un borrador de cambio en la
 * lista) abre el panel de editar al cargar.
 */
export default async function PlanDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  // Opcional: los tests de integración de SLT-58 llaman a la página solo con `params`.
  searchParams?: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const { planId } = await params;
  const editar = (await searchParams)?.editar;
  const r = await verDetalleDePlan(actor, { planId });
  if (r.estado !== "ok") notFound();
  // Solo se ofrecen si el plan se puede asignar (no archivado): si no, ni se leen. SLT-99 (decisión del
  // 2026-11-10, modifica SLT-66 R28): ya no hace falta costo concreto.
  const { plan } = r.detalle;
  const empresasCandidatas =
    !plan.archivado ? await leerEmpresasCandidatas(actor, plan) : [];

  return (
    <AppPage title={r.detalle.plan.nombre}>
      <PlanDetalle
        detalle={r.detalle}
        borrador={{
          guardarPaso: guardarPasoBorradorAction,
          leer: leerBorradorAction,
          descartar: descartarBorradorAction,
          confirmar: confirmarBorradorAction,
        }}
        previsualizarCambio={previsualizarCambioPlanAction}
        abrirEditar={editar === "1"}
        archivarPlan={archivarPlanAction}
        cancelarCambio={cancelarCambioPlanAction}
        empresasCandidatas={empresasCandidatas}
        // SLT-86 (R23): «Rige desde» de un cambio de precio propone mañana, con el reloj del servidor.
        precioDesdePorDefecto={mananaCalendarioPlataforma(new Date())}
      />
    </AppPage>
  );
}
