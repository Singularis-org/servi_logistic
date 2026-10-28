import Link from "next/link";
import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { verModulosEmpresa } from "@/lib/actions/_shared/modulos-empresa";
import { fijarModuloEmpresaAction } from "@/lib/actions/modulos-empresa";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { NUCLEO } from "@/lib/modulos/catalogo";

import { ModulosEmpresa } from "./_components/ModulosEmpresa";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  volver: "Volver a Empresas",
  nucleo: "Núcleo (siempre activo)",
} as const;

/**
 * SL-23 (design §7; R8, R14) — el detalle de una empresa para el superadmin: qué módulos tiene
 * encendidos. Server Component.
 *
 * Cualquier rol de empresa (o sin sesión) recibe `notFound()` ANTES de leer nada (R14), igual que el
 * listado (SL-32, R35): ni siquiera sabe que la pantalla existe. Una empresa inexistente y un segmento
 * que no es un uuid responden lo mismo.
 */
export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ organizacionId: string }>;
}) {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const { organizacionId } = await params;
  const r = await verModulosEmpresa(actor, { organizacionId });
  if (r.estado !== "ok") notFound();

  const { empresa } = r;
  return (
    <AppPage title={empresa.nombre}>
      <div className="flex flex-col gap-6">
        <Link
          href="/plataforma/empresas"
          className="w-fit rounded-sm text-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          {TEXTOS.volver}
        </Link>

        <section aria-labelledby="nucleo-titulo" className="flex flex-col gap-3">
          <h2 id="nucleo-titulo" className="text-base font-semibold">
            {TEXTOS.nucleo}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {NUCLEO.map((nombre) => (
              <li
                key={nombre}
                className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm"
              >
                {nombre}
              </li>
            ))}
          </ul>
        </section>

        <ModulosEmpresa
          organizacionId={empresa.organizacionId}
          modulos={empresa.modulos}
          fijarModulo={fijarModuloEmpresaAction}
        />
      </div>
    </AppPage>
  );
}
