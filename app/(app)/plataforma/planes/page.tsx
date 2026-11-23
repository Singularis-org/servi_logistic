import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { verBorradoresDePlanes, verCatalogoDePlanes } from "@/lib/actions/_shared/planes-plataforma";
import {
  confirmarBorradorAction,
  descartarBorradorAction,
  guardarPasoBorradorAction,
  leerBorradorAction,
} from "@/lib/actions/plan-borrador";
import { previsualizarCustomAction } from "@/lib/actions/planes";
import { esPlataforma } from "@/lib/auth/plataforma";
import {
  fechaDeEfectoPorDefecto,
  inicioDelCicloPorDefecto,
  rangoDeLaFechaDeEfecto,
  rangoDelInicioDelCiclo,
} from "@/lib/planes/ciclo";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { PlanesModule } from "./_components/PlanesModule";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  titulo: "Planes",
} as const;

/**
 * SLT-58 (design §4.2, §6.3; R13, R22) — «Planes» del superadmin (Server Component). Cualquier rol de
 * empresa, o sin sesión, recibe `notFound()` ANTES de leer nada, igual que «Empresas» (SL-32 R35). Lee
 * el catálogo y las empresas (para el `Select` de un plan custom) en paralelo, y baja por props la
 * action de alta de SL-24, sin cambiar su lógica (R25).
 *
 * SLT-144 (design §3.3, §6; R24, R28): también lee los borradores, en el mismo `Promise.all` y después del
 * `notFound()`. Un fallo al leerlos no tumba el catálogo. El alta ya no baja: el formulario crea al confirmar
 * el borrador, con las actions de `lib/actions/plan-borrador.ts`.
 */
export default async function PlanesPage() {
  const actor = await resolveActorFromSession();
  if (!actor || !esPlataforma(actor.rol)) notFound();

  const [catalogo, listado, borradores] = await Promise.all([
    verCatalogoDePlanes(actor),
    listarEmpresasPlataforma(actor),
    verBorradoresDePlanes(actor).then(
      (r) => (r.estado === "ok" ? r.borradores : null),
      (error: unknown) => {
        console.error("[PlanesPage] leer los borradores lanzó", error);
        return null;
      },
    ),
  ]);
  // `null` (no una lista vacía) si no se pudieron leer: el formulario lo dice junto al campo «Empresa»
  // en vez de ofrecer un selector vacío sin explicación.
  // D5 y R30: la fecha por defecto (mañana) y el rango salen del reloj del servidor, el que valida.
  const ahora = new Date();
  // Ajuste planes-custom (D4): si la empresa ya tiene plan, el formulario no pide el inicio del ciclo.
  // SLT-86 (R25): pide su fecha de efecto, por defecto el inicio de su siguiente período de calendario.
  const empresas =
    listado.status === "ok"
      ? listado.empresas.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          tienePlan: e.plan !== null,
          fechaDeEfectoPorDefecto: e.plan === null ? null : fechaDeEfectoPorDefecto(e.plan.tipoCobro, ahora),
        }))
      : null;

  return (
    <AppPage title={TEXTOS.titulo}>
      <PlanesModule
        errorDeCarga={catalogo.estado !== "ok"}
        planes={catalogo.estado === "ok" ? catalogo.planes : []}
        empresas={empresas}
        inicioCicloPorDefecto={inicioDelCicloPorDefecto(ahora)}
        rangoInicioCiclo={rangoDelInicioDelCiclo(ahora)}
        rangoFechaDeEfecto={rangoDeLaFechaDeEfecto(ahora)}
        borradores={borradores}
        borrador={{
          guardarPaso: guardarPasoBorradorAction,
          leer: leerBorradorAction,
          descartar: descartarBorradorAction,
          confirmar: confirmarBorradorAction,
        }}
        previsualizarCustom={previsualizarCustomAction}
      />
    </AppPage>
  );
}
