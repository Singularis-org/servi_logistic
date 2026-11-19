"use client";

import { FormField } from "@/components/shared/FormField";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Input } from "@/components/ui/input";

import type { PropsDelPaso } from "./estado";
import { FechasPorEmpresa, type FechasDelCambio } from "./FechasPorEmpresa";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoCuandoRigeProps = PropsDelPaso & {
  /** SLT-86 (R22, R23): si el costo base o un descuento cambian; entonces se pide «Rige desde». */
  cambiaPrecio: boolean;
};

/**
 * SLT-130 (R17) — paso «Cuándo rige», solo al editar: «Rige desde» si cambia el precio (SLT-86 R22/R23);
 * si no, «A partir de» (SLT-58). SLT-135 (R14): un solo campo de fecha; editar ya no se aplica en el acto.
 */
export function PasoCuandoRige({ form, cambiar, idDe, errorDe, cambiaPrecio }: PasoCuandoRigeProps) {
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
    <FormField
      id={idDe("vigenteDesde")}
      label={TEXTOS_PLAN_FORM.programado}
      hint={TEXTOS_PLAN_FORM.fechaAyuda}
      error={errorDe("vigenteDesde")}
    >
      <Input type="date" value={form.vigenteDesde} onChange={(ev) => cambiar("vigenteDesde", ev.target.value)} />
    </FormField>
  );
}

export type PasoCuandoRigeConFechasProps = PasoCuandoRigeProps & {
  /** SLT-144 (R17–R20): la lectura de la fecha de cada empresa que guarda `PlanForm`. */
  fechas: FechasDelCambio | null;
  onReintentarFechas: () => void;
};

/**
 * SLT-144 (design §5.3) — «Cuándo rige» con la fecha de cada empresa debajo de los controles de hoy. Va aparte
 * para no tocar esos controles.
 */
export function PasoCuandoRigeConFechas({ fechas, onReintentarFechas, ...paso }: PasoCuandoRigeConFechasProps) {
  return (
    <div className="flex flex-col gap-4">
      <PasoCuandoRige {...paso} />
      <FechasPorEmpresa fechas={fechas} onReintentar={onReintentarFechas} />
    </div>
  );
}
