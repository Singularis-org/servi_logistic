import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { listarReportesBugAction } from "@/lib/actions/reportes-bug-plataforma";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { type FiltrosVista, ReportesModule, type ResultadoListado } from "./_components/ReportesModule";
import { TEXTOS_REPORTES } from "./_components/reportes-textos";

type SearchParams = Record<string, string | string[] | undefined>;

/** Las claves de la dirección que el listado entiende (R10); cualquier otra se ignora. */
const CLAVES = ["estado", "empresa", "desde", "hasta", "pagina"] as const;

/**
 * Dependencias inyectables. Viajan por el segundo parámetro, que Next nunca pasa, igual que en
 * `HistorialAccionesPage`: el test afirma sobre las llamadas sin mockear módulos enteros.
 */
export interface ReportesPageDeps {
  getActor?: typeof resolveActorFromSession;
  listar?: typeof listarReportesBugAction;
  listarEmpresas?: typeof listarEmpresasPlataforma;
}

/** Design §6: solo las claves conocidas, la primera si vienen repetidas, y las vacías se omiten. */
function filtrosDeLaDireccion(sp: SearchParams): Partial<Record<(typeof CLAVES)[number], string>> {
  const filtros: Partial<Record<(typeof CLAVES)[number], string>> = {};
  for (const clave of CLAVES) {
    const crudo = sp[clave];
    const valor = Array.isArray(crudo) ? crudo[0] : crudo;
    if (valor !== undefined && valor !== "") filtros[clave] = valor;
  }
  return filtros;
}

/**
 * SLT-97 (design §8.2; R2, R5–R12) — el listado de reportes del superadmin (Server Component).
 *
 * R2: sin sesión o con un rol de empresa, `notFound()` ANTES de leer nada. La action vuelve a mirar la
 * puerta; esta es la primera, no la única.
 *
 * El listado y las empresas del filtro se leen en paralelo. Si las empresas fallan, el filtro queda con
 * solo «Todas las empresas» y el listado sigue funcionando.
 */
export default async function ReportesPage(
  { searchParams }: { searchParams: Promise<SearchParams> },
  deps: ReportesPageDeps = {},
) {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const entrada = filtrosDeLaDireccion(await searchParams);
  const [listado, empresasRes] = await Promise.all([
    (deps.listar ?? listarReportesBugAction)(entrada),
    (deps.listarEmpresas ?? listarEmpresasPlataforma)(actor),
  ]);

  const resultado: ResultadoListado =
    listado.status === "ok"
      ? { status: "ok", items: listado.items, total: listado.total }
      : { status: listado.status === "validation_error" ? "validation_error" : "error" };

  const filtros: FiltrosVista = {
    estado: entrada.estado ?? "pendientes",
    empresa: entrada.empresa ?? "",
    desde: entrada.desde ?? "",
    hasta: entrada.hasta ?? "",
    pagina: listado.status === "ok" ? listado.pagina : 1,
  };

  const empresas =
    empresasRes.status === "ok"
      ? empresasRes.empresas
          .map((e) => ({ id: e.id, nombre: e.nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      : [];

  return (
    <AppPage title={TEXTOS_REPORTES.titulo} description={TEXTOS_REPORTES.descripcion}>
      {/* La `key` monta de nuevo el módulo con cada dirección: así las fechas que se escriben a mano
          vuelven a las de la URL tras «Limpiar filtros» o la navegación del navegador. */}
      <ReportesModule key={JSON.stringify(filtros)} filtros={filtros} resultado={resultado} empresas={empresas} />
    </AppPage>
  );
}
