import { AppPage } from "@/components/shared/AppPage";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { MI_PLAN_TEXTOS } from "./_components/MiPlanModule";

/**
 * SLT-58 (design §6.4) — `/mi-plan` mientras el servidor lee el plan. La misma forma que la pantalla
 * (dos tarjetas: plan y consumo, en dos columnas desde `lg`) con `Skeleton`, no un texto «Cargando…»
 * (DESIGN.md). Las tarjetas son decorativas (`aria-hidden`); el estado se anuncia con un único
 * `role="status"` oculto, como hace el `DataTable`.
 */
export default function MiPlanLoading() {
  return (
    <AppPage title={MI_PLAN_TEXTOS.titulo}>
      <span role="status" className="sr-only">
        {MI_PLAN_TEXTOS.cargando}
      </span>
      <div aria-hidden="true" data-testid="mi-plan-skeleton" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}
