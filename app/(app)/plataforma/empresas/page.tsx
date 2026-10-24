import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { altaEmpresaAction } from "@/lib/actions/organizaciones";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { UserRepository } from "@/lib/repositories/UserRepository";

import { EmpresasModule } from "./_components/EmpresasModule";

/**
 * SL-32 (R29–R35) — la pantalla «Empresas» del superadmin (Server Component). Lee el listado y el
 * catálogo de tipos de documento, y se los pasa por props al módulo cliente con la action de alta
 * de SL-17.
 *
 * Fuera de `/configuracion` a propósito: aquello es del `maestro` y le da 404 al superadmin (R5).
 * Cualquier rol de empresa recibe aquí `notFound()` ANTES de leer nada (R35): ni siquiera sabe que
 * la pantalla existe.
 *
 * El catálogo se lee del repositorio y no con `listarTiposIdentificacion` (la de Usuarios): esa
 * action solo responde al `maestro`. `tipo_identificacion` es de plataforma y se lee sin empresa.
 */
export default async function EmpresasPage() {
  const actor = await resolveActorFromSession();

  if (!actor || !esPlataforma(actor.rol)) notFound();

  const [listado, tiposDocumento] = await Promise.all([
    listarEmpresasPlataforma(actor),
    new UserRepository(getPrismaClient()).listTiposIdentificacion(),
  ]);

  return (
    <AppPage title="Empresas">
      {listado.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar el listado de empresas.
        </p>
      ) : null}

      <EmpresasModule
        empresas={listado.status === "ok" ? listado.empresas : []}
        tiposDocumento={tiposDocumento}
        altaEmpresa={altaEmpresaAction}
      />
    </AppPage>
  );
}
