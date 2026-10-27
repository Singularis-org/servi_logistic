import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { arbolDePaisAction, listarPaisesAction } from "@/lib/actions/geografia-plataforma";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { PaisDTO } from "@/lib/types/pais";

import { GeografiaPlataformaModule } from "./_components/GeografiaPlataformaModule";

/**
 * SL-20 (design §8; R20, R21) — la geografía del superadmin (Server Component): los países dados de
 * alta y la división del país elegido.
 *
 * R21: cualquier rol de empresa recibe `notFound()` ANTES de leer nada, igual que «Empresas».
 *
 * El país elegido sale de `?pais=<id>`; sin él, o con uno que no está dado de alta, el primero por
 * nombre. El árbol se lee solo para ese país.
 */
export default async function GeografiaPlataformaPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ pais?: string | string[] }>;
}>) {
  const actor = await resolveActorFromSession();

  if (!actor || !esPlataforma(actor.rol)) notFound();

  const listado = await listarPaisesAction();
  const paises: PaisDTO[] =
    listado.status === "ok"
      ? [...listado.paises].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      : [];

  const { pais: pedido } = await searchParams;
  const elegido = paises.find((p) => p.id === pedido) ?? paises[0] ?? null;

  const arbol = elegido === null ? null : await arbolDePaisAction({ paisId: elegido.id });

  return (
    <AppPage title="Geografía">
      {listado.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar la lista de países.
        </p>
      ) : null}
      {arbol !== null && arbol.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar la división del país.
        </p>
      ) : null}

      <GeografiaPlataformaModule
        paises={paises}
        paisElegido={elegido}
        provincias={arbol?.status === "ok" ? arbol.provincias : []}
      />
    </AppPage>
  );
}
