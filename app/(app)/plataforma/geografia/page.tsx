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
 *
 * Los fallos de lectura bajan como banderas y los pinta el módulo en su sitio (revisión de diseño,
 * decisión 13): pintados aquí, el módulo recibía `[]` y debajo del error decía además «aún no hay
 * ningún país» o «aún no tiene división», o sea un fallo disfrazado de estado vacío.
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
      <GeografiaPlataformaModule
        paises={paises}
        paisElegido={elegido}
        provincias={arbol?.status === "ok" ? arbol.provincias : []}
        paisesError={listado.status !== "ok"}
        divisionError={arbol !== null && arbol.status !== "ok"}
      />
    </AppPage>
  );
}
