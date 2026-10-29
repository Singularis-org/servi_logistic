import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { verCatalogoDePlanes } from "@/lib/actions/_shared/planes-plataforma";
import { crearPlanAction } from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { PlanesModule } from "./_components/PlanesModule";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  titulo: "Planes",
  sinCatalogo: "No se pudo cargar el catálogo de planes.",
} as const;

/**
 * SLT-58 (design §4.2, §6.3; R13, R22) — «Planes» del superadmin (Server Component). Cualquier rol de
 * empresa, o sin sesión, recibe `notFound()` ANTES de leer nada, igual que «Empresas» (SL-32 R35). Lee
 * el catálogo y las empresas (para el `Select` de un plan custom) en paralelo, y baja por props la
 * action de alta de SL-24, sin cambiar su lógica (R25).
 */
export default async function PlanesPage() {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const [catalogo, listado] = await Promise.all([verCatalogoDePlanes(actor), listarEmpresasPlataforma(actor)]);
  const empresas =
    listado.status === "ok" ? listado.empresas.map((e) => ({ id: e.id, nombre: e.nombre })) : [];

  return (
    <AppPage title={TEXTOS.titulo}>
      {catalogo.estado !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {TEXTOS.sinCatalogo}
        </p>
      ) : null}
      <PlanesModule
        planes={catalogo.estado === "ok" ? catalogo.planes : []}
        empresas={empresas}
        crearPlan={crearPlanAction}
      />
    </AppPage>
  );
}
