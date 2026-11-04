import { AppPage } from "@/components/shared/AppPage";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { listarArbolGeografico } from "@/lib/actions/geografia";
import { listarZonas } from "@/lib/actions/zonas";

import { DescargarCoberturaButton } from "./_components/DescargarCoberturaButton";
import { ZonasModule } from "./_components/ZonasModule";

/**
 * Página de Zonas (Server Component). SLT-51: las zonas salen de Tarifas a su propia pantalla,
 * sin costos. Autoriza server-side con el mismo gate que Tarifas: SOLO el rol `maestro` (R2); las
 * acciones vuelven a autorizar por su cuenta en `ZonaService` y `lib/actions/cobertura.ts`.
 *
 * Pre-carga el catálogo geográfico global del país (SL-20, R16) y el listado de zonas. Ya no
 * carga vehículos: el formulario no pide pagos.
 *
 * Ficha 465 (R1) — el bloque «Cobertura» vive aquí, antes del listado (SLT-51 R12).
 */
export default async function ZonasPage() {
  const actor = await resolveActorFromSession();

  if (actor?.rol !== "maestro") {
    return (
      <AppPage title="Zonas">
        <p role="alert" className="text-sm text-muted-foreground">
          No tienes permiso para acceder a esta sección.
        </p>
      </AppPage>
    );
  }

  const [arbolRes, zonasRes] = await Promise.all([
    listarArbolGeografico(),
    listarZonas({ page: 1, pageSize: 100 }),
  ]);

  const provincias = arbolRes.status === "ok" ? arbolRes.provincias : [];
  const zonas = zonasRes.status === "ok" ? zonasRes.items : [];

  return (
    <AppPage title="Zonas">
      {arbolRes.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar el catálogo geográfico.
        </p>
      ) : null}

      <section
        aria-labelledby="zonas-cobertura-titulo"
        className="flex flex-col gap-2"
      >
        <h2 id="zonas-cobertura-titulo" className="text-base font-semibold">
          Cobertura
        </h2>
        <DescargarCoberturaButton />
      </section>

      <ZonasModule initialZonas={zonas} provincias={provincias} />
    </AppPage>
  );
}
