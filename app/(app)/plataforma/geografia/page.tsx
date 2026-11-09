import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import {
  arbolDePaisAction,
  listarPaisesAction,
  listarTiposDocumentoAction,
} from "@/lib/actions/geografia-plataforma";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { PAISES_ISO_3166_1 } from "@/lib/constants/paises-iso-3166-1";
import type { PaisDTO } from "@/lib/types/pais";
import { prefijoOficial } from "@/lib/utils/prefijo-oficial";
import { zonasIana } from "@/lib/utils/zonas-iana";

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
 *
 * SLT-81 (design §5, §6): también los tipos de documento del país elegido, y la lista de zonas IANA
 * y los prefijos oficiales, calculados aquí para que la pantalla ofrezca lo mismo que acepta el
 * servidor (R8, R26).
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

  const [arbol, tipos] =
    elegido === null
      ? [null, null]
      : await Promise.all([
          arbolDePaisAction({ paisId: elegido.id }),
          listarTiposDocumentoAction({ paisId: elegido.id }),
        ]);

  const prefijosOficiales: Record<string, string | null> = Object.fromEntries(
    PAISES_ISO_3166_1.map((p) => [p.id, prefijoOficial(p.id)]),
  );

  return (
    <AppPage title="Geografía">
      <GeografiaPlataformaModule
        paises={paises}
        paisElegido={elegido}
        provincias={arbol?.status === "ok" ? arbol.provincias : []}
        paisesError={listado.status !== "ok"}
        divisionError={arbol !== null && arbol.status !== "ok"}
        tiposDocumento={tipos?.status === "ok" ? tipos.tipos : []}
        tiposError={tipos !== null && tipos.status !== "ok"}
        zonas={zonasIana()}
        prefijosOficiales={prefijosOficiales}
      />
    </AppPage>
  );
}
