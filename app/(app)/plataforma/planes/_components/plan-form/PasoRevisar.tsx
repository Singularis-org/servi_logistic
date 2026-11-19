"use client";

import type { Ref } from "react";

import { ListaDeBeneficios } from "@/components/shared/planes/BeneficiosDelPlan";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

import { versionDe, type PropsDelPaso } from "./estado";
import { FechasPorEmpresa, type FechasDelCambio } from "./FechasPorEmpresa";
import { ListaDelPrimerPeriodo } from "./PasoGeneral";
import { filasDeRevision, haySoloExtras, type FilaDeRevision } from "./revision";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoRevisarProps = PropsDelPaso & {
  /** Las filas que no son del plan: las de General al crear, o la de cuándo rige al editar (design §6). */
  extras: readonly FilaDeRevision[];
  /** R22: al crear un custom, las dos líneas del primer período, las mismas que General. */
  lineasDelPrimerPeriodo: readonly string[];
  /** El texto vigente del botón final, para el subtítulo. */
  textoEnviar: string;
  /** R26: el rechazo de la action y los errores sin campo visible, en el aviso general. */
  rechazo: string | null;
  sueltos: readonly string[];
  avisoRef: Ref<HTMLDivElement>;
  /** R28: por qué el botón final está bloqueado por la vista previa del custom; `null` si no lo está. */
  bloqueo: "cargando" | "fallo" | null;
  /** Id del motivo del bloqueo, para que el botón final lo enlace con `aria-describedby`. */
  idMotivo: string;
  onIrATopes: () => void;
  /**
   * SLT-144 (R8): los títulos, en orden, de los pasos que faltan por guardar o están «Sin guardar». Con
   * alguno, el botón final está deshabilitado y aquí se dice por qué, con un enlace al primero.
   */
  faltan: readonly string[];
  /** Id del motivo de `faltan`, para el `aria-describedby` del botón final. */
  idFaltan: string;
  onIrAlPrimeroQueFalta: () => void;
  /** SLT-144 (R17–R20): al editar, la fecha de cada empresa; `null` al crear o sin una entrada válida. */
  fechas: FechasDelCambio | null;
  onReintentarFechas: () => void;
};

/**
 * SLT-130 (R22, R23, R26, R28) — el último paso. Al crear lista los valores finales; al editar, solo lo
 * que cambia («antes → después») y cuándo rige. No valida: lo hace el botón final. Debajo, el aviso
 * general y, si la vista previa del custom bloquea el botón, el motivo con un enlace al paso Topes.
 * SLT-144 (R8): y, si faltan pasos por guardar, cuáles, con un enlace al primero. Al editar (R17–R20), la fecha
 * en que cada empresa recibe el cambio y los topes que ya pasa.
 */
export function PasoRevisar({
  modo,
  form,
  plan,
  extras,
  lineasDelPrimerPeriodo,
  textoEnviar,
  rechazo,
  sueltos,
  avisoRef,
  bloqueo,
  idMotivo,
  onIrATopes,
  faltan,
  idFaltan,
  onIrAlPrimeroQueFalta,
  fechas,
  onReintentarFechas,
}: PasoRevisarProps) {
  const despues: PlanDTO =
    plan !== null
      ? { ...plan, ...versionDe(form) }
      : { id: "", visibilidad: form.visibilidad, organizacionId: null, archivado: false, ...versionDe(form) };
  const filas = filasDeRevision({ modo, plan, despues, extras, escrito: form });
  // SLT-214 (R14): la fila «Beneficios» pinta cada ícono, así que no es una fila de texto de `filasDeRevision`. Va
  // tras las del plan (después de «Módulos»): al crear, siempre; al editar, solo si cambian, antes de cuándo rige.
  const cambianBeneficios = plan !== null && diferenciasDelPlan(plan, despues).beneficios !== undefined;
  const conBeneficios = modo === "crear" || plan === null || cambianBeneficios;
  const sinCambios = modo === "editar" && haySoloExtras(filas, extras) && !cambianBeneficios;
  // Al crear, las del plan van al final; al editar, los `extras` (cuándo rige) van al final.
  const corte = modo === "crear" || plan === null ? filas.length : filas.length - extras.length;
  const fila = (f: { clave: string; valor: string }) => (
    <div key={f.clave} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:gap-4">
      <dt className="font-semibold sm:w-48 sm:flex-none">{f.clave}</dt>
      <dd className="min-w-0 break-words">{f.valor}</dd>
    </div>
  );
  const lista = (beneficios: PlanDTO["beneficios"]) => (
    <ListaDeBeneficios beneficios={beneficios ?? []} vacio={TEXTOS_PLAN_FORM.sinBeneficios} />
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {modo === "crear" ? TEXTOS_PLAN_FORM.revisarAlCrear(textoEnviar) : TEXTOS_PLAN_FORM.revisarAlEditar(textoEnviar)}
      </p>
      {sinCambios ? <p className="text-sm">{TEXTOS_PLAN_FORM.sinCambios}</p> : null}
      <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {filas.slice(0, corte).map(fila)}
        {conBeneficios ? (
          <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:gap-4">
            <dt className="font-semibold sm:w-48 sm:flex-none">{TEXTOS_PLAN_FORM.beneficios}</dt>
            <dd className="min-w-0 break-words">
              {modo === "editar" && plan !== null ? (
                // Como las demás filas al editar: «antes → después».
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                  {lista(plan.beneficios)}
                  <span aria-hidden="true">→</span>
                  {lista(despues.beneficios)}
                </div>
              ) : (
                lista(despues.beneficios)
              )}
            </dd>
          </div>
        ) : null}
        {filas.slice(corte).map(fila)}
      </dl>
      {/* SLT-144 (design §5.3): al editar, debajo de la fila de cuándo rige (la última), la fecha de cada empresa. */}
      {modo === "editar" ? <FechasPorEmpresa fechas={fechas} onReintentar={onReintentarFechas} /> : null}
      {/* R22 (design §6): al crear un custom, el primer período que abre, como en General. */}
      {modo === "crear" && lineasDelPrimerPeriodo.length > 0 ? (
        <ListaDelPrimerPeriodo lineas={lineasDelPrimerPeriodo} />
      ) : null}

      {rechazo !== null || sueltos.length > 0 ? (
        <Alert
          ref={avisoRef}
          tabIndex={-1}
          variant="destructive"
          className="focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <AlertDescription>
            {rechazo !== null ? <p>{rechazo}</p> : null}
            {sueltos.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* SLT-144 (R8): sin todos los pasos guardados no se confirma; aquí, cuáles faltan y un enlace al primero. */}
      {faltan.length > 0 ? (
        <div id={idFaltan} className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{TEXTOS_PLAN_FORM.faltanPasos(faltan.join(", "))}</span>
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onIrAlPrimeroQueFalta}>
            {TEXTOS_PLAN_FORM.irAPaso(faltan[0]!)}
          </Button>
        </div>
      ) : null}

      {/* R28: el botón final no se puede pulsar sin la vista previa del custom; aquí, por qué y adónde ir. */}
      {bloqueo !== null ? (
        <div id={idMotivo} className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{bloqueo === "cargando" ? TEXTOS_PLAN_FORM.comprobandoConsumo : TEXTOS_PLAN_FORM.vistaPreviaNoCargo}</span>
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onIrATopes}>
            {TEXTOS_PLAN_FORM.irATopes}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
