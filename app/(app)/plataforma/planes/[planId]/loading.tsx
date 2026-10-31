import { Container } from "@/components/shared/Container";
import { Skeleton } from "@/components/ui/skeleton";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  cargando: "Cargando el plan",
} as const;

/**
 * SLT-58 (DESIGN.md: skeleton, no «Cargando…») — mientras la página lee el detalle del plan. El título
 * es el nombre del plan y aún no se conoce, así que también va en skeleton. El estado se anuncia una
 * vez con una región `status` solo para lectores de pantalla.
 */
export default function PlanDetalleLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <span role="status" className="sr-only">
        {TEXTOS.cargando}
      </span>
      <div aria-hidden="true" className="border-b border-border px-6 py-4">
        <Skeleton className="h-7 w-48" />
      </div>
      <Container>
        <div aria-hidden="true" className="flex flex-col gap-6">
          {Array.from({ length: 3 }).map((_, bloque) => (
            <div key={bloque} className="flex flex-col gap-3 rounded-md border border-border p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
