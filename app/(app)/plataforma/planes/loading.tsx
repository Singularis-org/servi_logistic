import { AppPage } from "@/components/shared/AppPage";
import { Skeleton } from "@/components/ui/skeleton";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  titulo: "Planes",
  cargando: "Cargando el catálogo de planes",
} as const;

const FILAS = 4;

/**
 * SLT-58 (DESIGN.md: skeleton, no «Cargando…») — mientras la página lee el catálogo y las empresas.
 * Mantiene la forma de la barra de acciones y de la tabla para que no salte al llegar los datos; el
 * estado se anuncia una vez con una región `status` solo para lectores de pantalla.
 */
export default function PlanesLoading() {
  return (
    <AppPage title={TEXTOS.titulo}>
      <span role="status" className="sr-only">
        {TEXTOS.cargando}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex flex-col rounded-md border border-border">
          {Array.from({ length: FILAS }).map((_, fila) => (
            <div key={fila} className="flex items-center gap-6 border-b border-border px-3 py-4 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="hidden h-4 w-24 md:block" />
            </div>
          ))}
        </div>
      </div>
    </AppPage>
  );
}
