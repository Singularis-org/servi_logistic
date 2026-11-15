import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { verFacturasDeMiPlan } from "@/lib/actions/_shared/facturas-plataforma";
import { verMiPlan, verPlanesDeMiPlan } from "@/lib/actions/_shared/mi-plan";
import { verDetalleFacturaMiPlanAction } from "@/lib/actions/facturas-plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

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
 *
 * SLT-119 (design §6.2; R1, R17): las facturas de la empresa se leen en el mismo `Promise.all`, AISLADAS: un throw o
 * un estado distinto de `ok` deja la sección en «No se pudieron cargar las facturas» y el resto de «Mi plan» se
 * pinta igual. Quién entra lo siguen decidiendo las dos lecturas de arriba.
 */
export default async function MiPlanPage() {
  const actor = await resolveActorFromSession();
  const [r, planes, facturas] = await Promise.all([
    verMiPlan(actor),
    verPlanesDeMiPlan(actor),
    leerFacturas(actor),
  ]);
  if (r.estado !== "ok" || planes.estado !== "ok") notFound();

  return (
    <AppPage title={MI_PLAN_TEXTOS.titulo}>
      <MiPlanModule
        plan={r.plan}
        pendienteSinPlan={r.pendienteSinPlan}
        planes={planes}
        facturas={{ lista: facturas, cargarDetalle: verDetalleFacturaMiPlanAction }}
      />
    </AppPage>
  );
}

/** SLT-119 (R17): `null` = no se pudieron leer; la sección lo dice sin tumbar la página. */
async function leerFacturas(actor: Actor | null): Promise<FacturaPlataformaDTO[] | null> {
  try {
    const r = await verFacturasDeMiPlan(actor);
    return r.estado === "ok" ? r.facturas : null;
  } catch (error) {
    console.error("[MiPlanPage] verFacturasDeMiPlan lanzó", error);
    return null;
  }
}
