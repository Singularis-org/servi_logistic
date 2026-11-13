"use client";

import type { ReactNode } from "react";

import { AvisosDeTopes, textosDeLosAvisosDeTopes } from "@/components/shared/AvisosDeTopes";
import { FormField } from "@/components/shared/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES_CON_TOPE, type TopeExcedido } from "@/lib/types/planes";

import { tope, type PropsDelPaso } from "./estado";
import { textoDeHoy } from "./revision";
import { TEXTOS_PLAN_FORM } from "./textos";

/** Ajuste planes-custom (D13, D17): lo que se pinta de la vista previa del custom en este paso. */
export type VistaPreviaDelPaso =
  | { fase: "cargando" }
  | { fase: "ok"; avisos: TopeExcedido[] }
  | { fase: "fallo"; motivo: string[] | null };

export type PasoTopesProps = PropsDelPaso & {
  /**
   * R27: `undefined` si este formulario no lee vista previa (no es un custom para una empresa sin plan);
   * `null` si la lee pero aún no hay lectura de esta entrada.
   */
  vistaPrevia: VistaPreviaDelPaso | null | undefined;
  onReintentar: () => void;
};

/**
 * SLT-130 (R15, R16, R27) — paso Topes: un tope por rol y el de API keys (vacío = sin límite). Al editar,
 * «Hoy» bajo cada tope que cambia. Al crear un custom para una empresa sin plan, la vista previa del uso
 * contra los topes, con «Reintentar» si falla.
 */
export function PasoTopes({ modo, form, cambiar, setForm, idDe, errorDe, plan, vistaPrevia, onReintentar }: PasoTopesProps) {
  const idAyudaTopes = idDe("topes-ayuda");
  /** R16: «Hoy» solo al editar y si el valor del formulario difiere del del plan guardado. */
  const hoyDe = (valor: string, delPlan: number | null | undefined) =>
    modo === "editar" && plan !== null && tope(valor) !== (delPlan ?? null) ? textoDeHoy({ tope: delPlan }) : null;
  // Cada tope enlaza la ayuda «Vacío = sin límite» (además del placeholder): el lector de pantalla la
  // oye en el propio campo, no solo al pasar por el párrafo.
  const campoTope = (clave: string, label: ReactNode, valor: string, hoy: string | null, onCambio: (v: string) => void) => (
    <>
      <FormField id={idDe(clave)} label={label} error={errorDe(clave)}>
        <Input
          inputMode="numeric"
          placeholder={TEXTOS_PLAN_FORM.topeVacio}
          aria-describedby={idAyudaTopes}
          value={valor}
          onChange={(ev) => onCambio(ev.target.value)}
        />
      </FormField>
      {hoy !== null ? <p className="mt-1 text-sm text-muted-foreground">{hoy}</p> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        {/* La leyenda repite el título del paso: solo para lectores. */}
        <legend className="sr-only">{TEXTOS_PLAN_FORM.topes}</legend>
        <p id={idAyudaTopes} className="text-sm text-muted-foreground">
          {TEXTOS_PLAN_FORM.topesAyuda}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ROLES_CON_TOPE.map((rol) => (
            <div key={rol}>
              {campoTope(
                `topes.porRol.${rol}`,
                TEXTOS_PLAN_FORM.rol(rol),
                form.porRol[rol],
                hoyDe(form.porRol[rol], plan?.topes.porRol[rol]),
                (v) => setForm((f) => ({ ...f, porRol: { ...f.porRol, [rol]: v } })),
              )}
            </div>
          ))}
          <div>
            {campoTope("topes.apiKeys", TEXTOS_PLAN_FORM.apiKeys, form.apiKeys, hoyDe(form.apiKeys, plan?.topes.apiKeys), (v) =>
              cambiar("apiKeys", v),
            )}
          </div>
        </div>
      </fieldset>

      {/* D13: la vista previa de SLT-58 R37 con los topes del formulario. D17: si no carga, bloquea el botón
          final y ofrece «Reintentar», como el modal de primera asignación (P11). */}
      {vistaPrevia !== undefined ? (
        <div aria-live="polite" aria-busy={vistaPrevia?.fase === "cargando"}>
          {vistaPrevia?.fase === "ok" && vistaPrevia.avisos.length > 0 ? (
            <AvisosDeTopes avisos={textosDeLosAvisosDeTopes(vistaPrevia.avisos)} />
          ) : vistaPrevia?.fase === "fallo" ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>{TEXTOS_PLAN_FORM.vistaPreviaNoCargo}</p>
                {(vistaPrevia.motivo ?? []).map((m) => (
                  <p key={m}>{m}</p>
                ))}
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onReintentar}>
                  {TEXTOS_PLAN_FORM.reintentar}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
