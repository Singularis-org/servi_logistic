import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { verDetalleDePlan } from "@/lib/actions/_shared/planes-plataforma";
import { archivarPlanAction, cancelarCambioPlanAction, editarPlanAction } from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { PlanDetalle } from "./_components/PlanDetalle";

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

  return (
    <AppPage title={r.detalle.plan.nombre}>
      <PlanDetalle
        detalle={r.detalle}
        editarPlan={editarPlanAction}
        archivarPlan={archivarPlanAction}
        cancelarCambio={cancelarCambioPlanAction}
      />
    </AppPage>
  );
}
