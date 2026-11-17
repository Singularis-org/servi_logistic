"use client";

import type { Ref } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PlanDTO } from "@/lib/types/planes";

import { versionDe, type PropsDelPaso } from "./estado";
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
};

/**
 * SLT-130 (R22, R23, R26, R28) — el último paso. Al crear lista los valores finales; al editar, solo lo
 * que cambia («antes → después») y cuándo rige. No valida: lo hace el botón final. Debajo, el aviso
 * general y, si la vista previa del custom bloquea el botón, el motivo con un enlace al paso Topes.
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
}: PasoRevisarProps) {
  const despues: PlanDTO =
    plan !== null
      ? { ...plan, ...versionDe(form) }
      : { id: "", visibilidad: form.visibilidad, organizacionId: null, archivado: false, ...versionDe(form) };
  const filas = filasDeRevision({ modo, plan, despues, extras, escrito: form });
  const sinCambios = modo === "editar" && haySoloExtras(filas, extras);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {modo === "crear" ? TEXTOS_PLAN_FORM.revisarAlCrear(textoEnviar) : TEXTOS_PLAN_FORM.revisarAlEditar(textoEnviar)}
      </p>
      {sinCambios ? <p className="text-sm">{TEXTOS_PLAN_FORM.sinCambios}</p> : null}
      <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {filas.map((f) => (
          <div key={f.clave} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:gap-4">
            <dt className="font-semibold sm:w-48 sm:flex-none">{f.clave}</dt>
            <dd className="min-w-0 break-words">{f.valor}</dd>
          </div>
        ))}
      </dl>
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
