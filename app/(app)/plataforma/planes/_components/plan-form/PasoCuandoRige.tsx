"use client";

import { FormField } from "@/components/shared/FormField";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";

import type { PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoCuandoRigeProps = PropsDelPaso & {
  /** SLT-86 (R22, R23): si el costo base o un descuento cambian; entonces se pide «Rige desde». */
  cambiaPrecio: boolean;
};

/**
 * SLT-130 (R17) — paso «Cuándo rige», solo al editar: «Rige desde» si cambia el precio (SLT-86 R22/R23);
 * si no, «Aplicar», de inmediato o a partir de una fecha (SLT-58).
 */
export function PasoCuandoRige({ form, cambiar, idDe, errorDe, cambiaPrecio }: PasoCuandoRigeProps) {
  // SLT-86 (R22, R23): un cambio de precio no se aplica «de inmediato»: lleva su fecha, mañana por defecto.
  if (cambiaPrecio) {
    return (
      <FormField
        id={idDe("vigenteDesde")}
        label={TEXTOS_TIPO_COBRO.rigeDesde}
        hint={TEXTOS_TIPO_COBRO.ayudaCambioDePrecio}
        error={errorDe("vigenteDesde")}
      >
        <Input type="date" value={form.precioDesde} onChange={(ev) => cambiar("precioDesde", ev.target.value)} />
      </FormField>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.aplicar}</legend>
      <RadioGroup
        aria-label={TEXTOS_PLAN_FORM.aplicar}
        value={form.aplicar}
        onValueChange={(v) => cambiar("aplicar", v === "programado" ? "programado" : "inmediato")}
        options={[
          { value: "inmediato", label: TEXTOS_PLAN_FORM.inmediato },
          { value: "programado", label: TEXTOS_PLAN_FORM.programado },
        ]}
      />
      {form.aplicar === "programado" ? (
        <FormField
          id={idDe("vigenteDesde")}
          label={TEXTOS_PLAN_FORM.fecha}
          hint={TEXTOS_PLAN_FORM.fechaAyuda}
          error={errorDe("vigenteDesde")}
        >
          <Input type="date" value={form.vigenteDesde} onChange={(ev) => cambiar("vigenteDesde", ev.target.value)} />
        </FormField>
      ) : null}
    </fieldset>
  );
}
