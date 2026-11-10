import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { verMiPlan, verPlanesDeMiPlan } from "@/lib/actions/_shared/mi-plan";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { MI_PLAN_TEXTOS, MiPlanModule } from "./_components/MiPlanModule";

/**
 * SLT-58 (design §3.1, §6.4; R8) — `/mi-plan`. Server Component.
 *
 * La página no decide quién entra: se lo pregunta al servicio (R8, «la comprobación vive en el
 * servicio»), que responde `forbidden` sin tocar la base para cualquier rol fuera de `ROLES_MI_PLAN` o
 * sin sesión. Aquí `forbidden` se vuelve «no encontrado», sin revelar que la pantalla existe.
 * La empresa la pone la sesión, nunca la URL (R9): no hay ningún parámetro que leer.
 *
 * SLT-99 (design §4; R1): el plan y los planes disponibles se leen en paralelo; `forbidden` en cualquiera de las
 * dos es «no encontrado».
 */
export default async function MiPlanPage() {
  const actor = await resolveActorFromSession();
  const [r, planes] = await Promise.all([verMiPlan(actor), verPlanesDeMiPlan(actor)]);
  if (r.estado !== "ok" || planes.estado !== "ok") notFound();

  return (
    <AppPage title={MI_PLAN_TEXTOS.titulo}>
      <MiPlanModule plan={r.plan} pendienteSinPlan={r.pendienteSinPlan} planes={planes} />
    </AppPage>
  );
}
