import { AppPage } from "@/components/shared/AppPage";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { listarZonas } from "@/lib/actions/zonas";

import { TiendasModule } from "./_components/TiendasModule";

/**
 * Página de Tarifas (Server Component). Autoriza server-side igual que
 * `/configuracion`: SOLO el rol `maestro`.
 *
 * SLT-51 (R12/R13): las zonas, su formulario y el bloque «Cobertura» se mudaron a
 * `/configuracion/zonas`. Aquí quedan las tarifas por tienda, que necesitan el listado de
 * zonas para su selector; antes se lo pasaba el módulo de zonas, ahora lo pre-carga la página.
 */
export default async function TarifasPage() {
  const actor = await resolveActorFromSession();

  if (actor?.rol !== "maestro") {
    return (
      <AppPage title="Tarifas">
        <p role="alert" className="text-sm text-muted-foreground">
          No tienes permiso para acceder a esta sección.
        </p>
      </AppPage>
    );
  }

  const zonasRes = await listarZonas({ page: 1, pageSize: 100 });
  const zonas = zonasRes.status === "ok" ? zonasRes.items : [];

  return (
    <AppPage title="Tarifas">
      <TiendasModule zonas={zonas} />
    </AppPage>
  );
}
