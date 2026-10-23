import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarArbolGeografico } from "@/lib/actions/geografia";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { GeografiaAdminModule } from "./_components/GeografiaAdminModule";

/**
 * FICHA 374 (design §7.1 · R38) — administracion del catalogo geografico (Server Component).
 *
 * Pre-carga el arbol y se lo pasa por props al modulo cliente, que hace el alta y la activacion.
 *
 * SL-32 (R24, R26): gestionar la geografia es de la plataforma, no de una empresa. La puerta es
 * `esPlataforma` y al `maestro` le responde `notFound()`: si viera la pantalla, cada boton le daria
 * `forbidden`. Tarifas sigue leyendo el arbol por su lado (R25).
 *
 * El rol se niega ANTES de leer nada: sin permiso no se consulta la base.
 */
export default async function GeografiaPage() {
  const actor = await resolveActorFromSession();

  if (!actor || !esPlataforma(actor.rol)) notFound();

  const res = await listarArbolGeografico();
  const provincias = res.status === "ok" ? res.provincias : [];

  return (
    <AppPage title="Geografía">
      {res.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar el catálogo geográfico.
        </p>
      ) : null}

      <GeografiaAdminModule initialProvincias={provincias} />
    </AppPage>
  );
}
