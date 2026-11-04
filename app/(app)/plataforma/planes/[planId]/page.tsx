import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { verDetalleDePlan } from "@/lib/actions/_shared/planes-plataforma";
import { archivarPlanAction, cancelarCambioPlanAction, editarPlanAction } from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import type { PlanDTO } from "@/lib/types/planes";

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
 */
export default async function PlanDetallePage({ params }: { params: Promise<{ planId: string }> }) {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const { planId } = await params;
  const r = await verDetalleDePlan(actor, { planId });
  if (r.estado !== "ok") notFound();
  // Solo se ofrecen si el plan se puede asignar (no archivado y con costo concreto): si no, ni se leen.
  const { plan } = r.detalle;
  const empresasCandidatas =
    !plan.archivado && tieneCostoConcreto(plan) ? await leerEmpresasCandidatas(actor, plan) : [];

  return (
    <AppPage title={r.detalle.plan.nombre}>
      <PlanDetalle
        detalle={r.detalle}
        editarPlan={editarPlanAction}
        archivarPlan={archivarPlanAction}
        cancelarCambio={cancelarCambioPlanAction}
        empresasCandidatas={empresasCandidatas}
      />
    </AppPage>
  );
}
