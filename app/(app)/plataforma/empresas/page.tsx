import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { listarPaisesParaAlta } from "@/lib/actions/_shared/paises-plataforma";
import {
  fijarCobroEmpresaAction,
  fijarCobroGlobalAction,
  verCobroGlobalAction,
} from "@/lib/actions/cobro-plataforma";
import {
  altaEmpresaAction,
  bienvenidasPendientesAction,
  reenviarBienvenidaAction,
} from "@/lib/actions/organizaciones";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { EmpresasModule } from "./_components/EmpresasModule";

/**
 * SL-32 (R29–R35) — la pantalla «Empresas» del superadmin (Server Component). Lee el listado y se
 * lo pasa por props al módulo cliente con la action de alta de SL-17.
 *
 * Fuera de `/configuracion` a propósito: aquello es del `maestro` y le da 404 al superadmin (R5).
 * Cualquier rol de empresa recibe aquí `notFound()` ANTES de leer nada (R35): ni siquiera sabe que
 * la pantalla existe.
 *
 * SL-40 (R9–R11, design §9.1): el valor global del cobro por orden se lee en el mismo `Promise.all`,
 * y las dos actions de guardado bajan por props. Si no se pudo leer, el módulo lo dice en su bloque.
 *
 * SL-20 (R9, R45, design §8): los países del `Select` del alta, solo los disponibles, en el mismo
 * `Promise.all`. Un `forbidden` deja la lista vacía: el alta no sale sin país, y el servidor manda.
 * SLT-81 (R20): cada país trae su prefijo y sus tipos activos (`listarPaisesParaAlta`); el catálogo
 * entero de tipos ya no se lee aquí.
 */
export default async function EmpresasPage() {
  const actor = await resolveActorFromSession();

  if (!actor || !esPlataforma(actor.rol)) notFound();

  const [listado, pendientes, cobro, paises] = await Promise.all([
    listarEmpresasPlataforma(actor),
    bienvenidasPendientesAction(),
    verCobroGlobalAction(),
    listarPaisesParaAlta(actor),
  ]);
  // SL-41 (R38): si no se pudo saber qué bienvenidas siguen pendientes, `null`, y el módulo
  // vuelve a R29 (el botón en toda fila con maestros) en vez de esconderlo por error.
  const bienvenidaPendiente = pendientes.estado === "ok" ? pendientes.organizacionIds : null;

  return (
    <AppPage title="Empresas">
      {listado.status !== "ok" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar el listado de empresas.
        </p>
      ) : null}

      <EmpresasModule
        empresas={listado.status === "ok" ? listado.empresas : []}
        paises={paises.status === "ok" ? paises.paises : []}
        altaEmpresa={altaEmpresaAction}
        reenviarBienvenida={reenviarBienvenidaAction}
        bienvenidaPendiente={bienvenidaPendiente}
        cobroGlobal={cobro.status === "ok" ? cobro.cobroGlobal : null}
        fijarCobroGlobal={fijarCobroGlobalAction}
        fijarCobroEmpresa={fijarCobroEmpresaAction}
      />
    </AppPage>
  );
}
