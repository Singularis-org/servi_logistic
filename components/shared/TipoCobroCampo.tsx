"use client";

import { FormField } from "@/components/shared/FormField";
import { RadioGroup } from "@/components/ui/radio-group";
import { TIPOS_COBRO, type TipoCobro } from "@/lib/types/planes";

import { TEXTOS_TIPO_COBRO } from "./tipo-cobro";

export interface TipoCobroCampoProps {
  /** Id del campo: el error y el foco del formulario lo buscan por él. */
  id: string;
  value: TipoCobro;
  onValueChange: (tipo: TipoCobro) => void;
  error?: string[];
  disabled?: boolean;
}

/**
 * Ajuste planes-custom (D6) — el tipo de cobro de una asignación. Lo comparten el modal de asignación
 * (primera y cambio), «Cambiar tipo de cobro» y el formulario del plan custom. SLT-86 (R1, R25): los
 * cuatro períodos de calendario, siempre todos: el costo de cada uno sale del plan.
 */
export function TipoCobroCampo({ id, value, onValueChange, error, disabled = false }: TipoCobroCampoProps) {
  return (
    <FormField id={id} label={TEXTOS_TIPO_COBRO.campo} error={error}>
      {(control) => (
        // El `id` va en el contenedor para poder llevar el foco al grupo si tiene error.
        <div id={control.id}>
          <RadioGroup
            aria-label={TEXTOS_TIPO_COBRO.campo}
            aria-invalid={control["aria-invalid"]}
            aria-describedby={control["aria-describedby"]}
            value={value}
            disabled={disabled}
            onValueChange={(v) => {
              const tipo = TIPOS_COBRO.find((t) => t === v);
              if (tipo !== undefined) onValueChange(tipo);
            }}
            options={TIPOS_COBRO.map((t) => ({ value: t, label: TEXTOS_TIPO_COBRO.tipo[t] }))}
          />
        </div>
      )}
    </FormField>
  );
}
