import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppPage } from "@/components/shared/AppPage";
import { cambiarEstadoReporteBugAction, verReporteBugAction } from "@/lib/actions/reportes-bug-plataforma";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { TEXTOS_REPORTE_DETALLE } from "../_components/reportes-textos";
import { ReporteDetalle } from "./_components/ReporteDetalle";

/** Dependencias inyectables por el segundo parámetro, que Next nunca pasa (como en el listado). */
export interface ReporteDetallePageDeps {
  getActor?: typeof resolveActorFromSession;
  ver?: typeof verReporteBugAction;
}

/**
 * SLT-97 (design §8.3; R2, R14, R15) — el detalle de un reporte (Server Component).
 *
 * R2: sin sesión o con un rol de empresa, `notFound()` ANTES de leer nada.
 * R15: un id que no es uuid (`validation_error`), uno que no existe o uno borrado (`not_found`) también
 * son «no encontrado»: la pantalla no distingue entre ellos.
 */
export default async function ReporteDetallePage(
  { params }: { params: Promise<{ reporteId: string }> },
  deps: ReporteDetallePageDeps = {},
) {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const { reporteId } = await params;
  const res = await (deps.ver ?? verReporteBugAction)({ reporteId });
  // (propuesta) un fallo de lectura no es «no encontrado»: se lanza y lo pinta el `error.tsx` de la app,
  // que ofrece reintentar. El spec solo fija `validation_error` y `not_found`.
  if (res.status === "error") throw new Error("No se pudo leer el reporte.");
  if (res.status !== "ok") notFound();

  return (
    <AppPage title={TEXTOS_REPORTE_DETALLE.titulo}>
      <Link
        href="/plataforma/reportes"
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {TEXTOS_REPORTE_DETALLE.volver}
      </Link>
      <ReporteDetalle reporte={res.reporte} historial={res.historial} cambiarEstado={cambiarEstadoReporteBugAction} />
    </AppPage>
  );
}
