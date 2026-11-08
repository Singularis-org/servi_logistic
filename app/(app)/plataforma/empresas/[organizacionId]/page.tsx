import Link from "next/link";
import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { verModulosEmpresa } from "@/lib/actions/_shared/modulos-empresa";
import { verDetalleDePlan, verPlanDeEmpresa, verPreciosQueRigen } from "@/lib/actions/_shared/planes-plataforma";
import { fijarModuloEmpresaAction } from "@/lib/actions/modulos-empresa";
import {
  asignarPlanAction,
  cambiarTipoCobroAction,
  cancelarCambioEmpresaAction,
  listarPlanesAsignablesAction,
  previsualizarAsignacionPlanAction,
} from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { NUCLEO } from "@/lib/modulos/catalogo";
import {
  fechaDeEfectoPorDefecto,
  inicioDelCicloPorDefecto,
  rangoDeLaFechaDeEfecto,
  rangoDelInicioDelCiclo,
} from "@/lib/planes/ciclo";
import type { PlanDeEmpresaVista, PlanDTO, PreciosQueRigen } from "@/lib/types/planes";

import { ModulosEmpresa } from "./_components/ModulosEmpresa";
import { PlanEmpresa } from "./_components/PlanEmpresa";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  volver: "Volver a Empresas",
  nucleo: "Núcleo (siempre activo)",
} as const;

/**
 * SLT-58 (design §6.3) — la lectura del plan, AISLADA: un rechazo o un throw devuelve `null` y la
 * sección dice «No se pudo cargar el plan», pero los módulos de la empresa se pintan igual.
 */
async function leerPlan(actor: Actor, organizacionId: string): Promise<PlanDeEmpresaVista | null> {
  try {
    const r = await verPlanDeEmpresa(actor, { organizacionId });
    return r.estado === "ok" ? r.vista : null;
  } catch (error) {
    console.error("[EmpresaDetallePage] verPlanDeEmpresa lanzó", error);
    return null;
  }
}

/** R20: los planes asignables a la empresa, aislados igual que el plan; `null` = no se pudieron leer. */
async function leerAsignables(organizacionId: string): Promise<PlanDTO[] | null> {
  try {
    const r = await listarPlanesAsignablesAction({ organizacionId });
    return r.estado === "ok" ? r.planes : null;
  } catch (error) {
    console.error("[EmpresaDetallePage] listarPlanesAsignablesAction lanzó", error);
    return null;
  }
}

/**
 * SLT-58 (decisión cerrada del 2026-10-29) — la versión vigente del plan actual como `PlanDTO`, para
 * que la confirmación de «Cambiar plan» resuma qué cambia con `diferenciasDelPlan`. Casi siempre ya
 * viene entre los asignables; solo si no está (un plan archivado no es asignable) se lee su detalle.
 * Aislada como las demás: `null` = no se pudo leer, y la confirmación lo dice.
 */
async function leerPlanActual(
  actor: Actor,
  vista: PlanDeEmpresaVista | null,
  asignables: PlanDTO[] | null,
): Promise<PlanDTO | null> {
  const planId = vista?.plan?.planId;
  if (planId === undefined) return null;
  const entreAsignables = asignables?.find((p) => p.id === planId);
  if (entreAsignables !== undefined) return entreAsignables;
  try {
    const r = await verDetalleDePlan(actor, { planId });
    return r.estado === "ok" ? r.detalle.plan : null;
  } catch (error) {
    console.error("[EmpresaDetallePage] verDetalleDePlan lanzó", error);
    return null;
  }
}

/**
 * SLT-86 (R25; review m4) — por plan, los precios que pueden regir de hoy en adelante: los asignables y el
 * actual. El costo del primer período de cada modal usa el que regirá en la fecha elegida. Aislada como
 * las demás: si falla, `{}` y el modal usa el precio vigente.
 */
async function leerPreciosQueRigen(
  actor: Actor,
  asignables: PlanDTO[] | null,
  planActual: PlanDTO | null,
): Promise<PreciosQueRigen> {
  const planIds = [...new Set([...(asignables ?? []).map((p) => p.id), ...(planActual ? [planActual.id] : [])])];
  try {
    const r = await verPreciosQueRigen(actor, { planIds });
    return r.estado === "ok" ? r.precios : {};
  } catch (error) {
    console.error("[EmpresaDetallePage] verPreciosQueRigen lanzó", error);
    return {};
  }
}

/**
 * SL-23 (design §7; R8, R14) — el detalle de una empresa para el superadmin: qué módulos tiene
 * encendidos. Server Component.
 *
 * Cualquier rol de empresa (o sin sesión) recibe `notFound()` ANTES de leer nada (R14), igual que el
 * listado (SL-32, R35): ni siquiera sabe que la pantalla existe. Una empresa inexistente y un segmento
 * que no es un uuid responden lo mismo.
 *
 * SLT-58 (design §6.3; R19–R21): el plan de la empresa se lee en paralelo con los módulos y su
 * sección va antes de ellos. Su fallo no tumba la página.
 */
export default async function EmpresaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizacionId: string }>;
  /** SLT-66 (design §6.6; R33): `?plan=…` llega desde «Asignar a una empresa» del detalle del plan. */
  searchParams?: Promise<{ plan?: string | string[] }>;
}) {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const { organizacionId } = await params;
  const [r, plan, asignables] = await Promise.all([
    verModulosEmpresa(actor, { organizacionId }),
    leerPlan(actor, organizacionId),
    leerAsignables(organizacionId),
  ]);
  if (r.estado !== "ok") notFound();
  const planActual = await leerPlanActual(actor, plan, asignables);
  const preciosQueRigen = await leerPreciosQueRigen(actor, asignables, planActual);
  // R33: solo un plan de la lista de asignables; cualquier otro valor se ignora.
  const planPedido = (await searchParams)?.plan;
  const planPreseleccionado =
    typeof planPedido === "string" && asignables?.some((p) => p.id === planPedido) ? planPedido : undefined;

  const { empresa } = r;
  const ahora = new Date();
  return (
    <AppPage title={empresa.nombre}>
      <div className="flex flex-col gap-6">
        <Link
          href="/plataforma/empresas"
          className="w-fit rounded-sm text-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          {TEXTOS.volver}
        </Link>

        <PlanEmpresa
          organizacionId={empresa.organizacionId}
          empresaNombre={empresa.nombre}
          vista={plan}
          asignables={asignables}
          planActual={planActual}
          asignarPlan={asignarPlanAction}
          // SLT-58 §11.5: el rango sale del reloj del servidor, el mismo que valida el servicio (R30).
          rangoInicioCiclo={rangoDelInicioDelCiclo(ahora)}
          // Ajuste planes-custom (D5): la primera asignación propone MAÑANA, del mismo reloj.
          inicioCicloPorDefecto={inicioDelCicloPorDefecto(ahora)}
          // SLT-86 (R16, R25): «Rige desde» de un cambio, con su rango y el inicio del siguiente período.
          rangoFechaDeEfecto={rangoDeLaFechaDeEfecto(ahora)}
          fechaDeEfectoPorDefecto={plan?.plan ? fechaDeEfectoPorDefecto(plan.plan.cobro.tipo, ahora) : null}
          // Review m4: el costo del primer período, con el precio que regirá en la fecha elegida.
          preciosQueRigen={preciosQueRigen}
          previsualizarAsignacion={previsualizarAsignacionPlanAction}
          planPreseleccionado={planPreseleccionado}
          cambiarTipoCobro={cambiarTipoCobroAction}
          cancelarCambioEmpresa={cancelarCambioEmpresaAction}
        />

        <section aria-labelledby="nucleo-titulo" className="flex flex-col gap-3">
          <h2 id="nucleo-titulo" className="text-base font-semibold">
            {TEXTOS.nucleo}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {NUCLEO.map((nombre) => (
              <li
                key={nombre}
                className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm"
              >
                {nombre}
              </li>
            ))}
          </ul>
        </section>

        <ModulosEmpresa
          organizacionId={empresa.organizacionId}
          modulos={empresa.modulos}
          fijarModulo={fijarModuloEmpresaAction}
        />
      </div>
    </AppPage>
  );
}
