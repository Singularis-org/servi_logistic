"use client";

import { FormField } from "@/components/shared/FormField";
import { MontoInput } from "@/components/shared/MontoInput";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { PERIODICIDADES_ORDENES } from "@/lib/types/planes";

import type { PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

/**
 * SLT-130 (R14) — paso Cobro por orden: los dos modos de hoy, «Fijo» y «Porcentual», con sus campos (en
 * «Fijo», vacío = el valor global), y «Facturación de órdenes» (SLT-118 R35).
 */
export function PasoCobroPorOrden({ form, cambiar, idDe, errorDe }: PropsDelPaso) {
  return (
    <div className="flex flex-col gap-6">
      {/* SLT-66 (R7, R23): fuera del grupo «Costo base», porque no depende de su forma. SLT-83 (R20): con
          su modo, «Fijo» o «Porcentual». La leyenda repite el título del paso: solo para lectores. */}
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">{TEXTOS_PLAN_FORM.cobroPorOrden}</legend>
        <RadioGroup
          aria-label={TEXTOS_PLAN_FORM.cobroPorOrden}
          value={form.modoCosto}
          onValueChange={(v) => cambiar("modoCosto", v === "porcentual" ? "porcentual" : "fijo")}
          options={[
            { value: "fijo", label: TEXTOS_PLAN_FORM.cobroFijo },
            { value: "porcentual", label: TEXTOS_PLAN_FORM.cobroPorcentual },
          ]}
        />
        {form.modoCosto === "fijo" ? (
          <FormField
            id={idDe("costoPorOrden")}
            label={TEXTOS_PLAN_FORM.costoPorOrden}
            hint={TEXTOS_PLAN_FORM.costoPorOrdenAyuda}
            error={errorDe("costoPorOrden")}
          >
            <MontoInput value={form.costoPorOrden} onChange={(v) => cambiar("costoPorOrden", v)} />
          </FormField>
        ) : (
          <div className="flex flex-col gap-4">
            <FormField
              id={idDe("costoPorOrdenPorcentual.porcentaje")}
              label={TEXTOS_PLAN_FORM.porcentajePorOrden}
              error={errorDe("costoPorOrdenPorcentual.porcentaje")}
              required
            >
              {(control) => (
                <div className="flex items-center gap-2">
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={form.porcentajePorOrden}
                    onChange={(ev) => cambiar("porcentajePorOrden", ev.target.value)}
                  />
                  {/* El sufijo es visual: la etiqueta ya dice «Porcentaje». */}
                  <span aria-hidden="true" className="text-sm text-muted-foreground">
                    {TEXTOS_PLAN_FORM.sufijoPorcentaje}
                  </span>
                </div>
              )}
            </FormField>
            <FormField
              id={idDe("costoPorOrdenPorcentual.minimo")}
              label={TEXTOS_PLAN_FORM.minimoPorOrden}
              error={errorDe("costoPorOrdenPorcentual.minimo")}
            >
              <MontoInput value={form.minimoPorOrden} onChange={(v) => cambiar("minimoPorOrden", v)} />
            </FormField>
          </div>
        )}
      </fieldset>

      {/* SLT-118 (R35): la periodicidad de las facturas de órdenes, al crear y al editar. */}
      <FormField
        id={idDe("periodicidadOrdenes")}
        label={TEXTOS_PLAN_FORM.periodicidadOrdenes}
        error={errorDe("periodicidadOrdenes")}
      >
        {(control) => (
          // El `id` va en el contenedor para poder llevar el foco al grupo si tiene error.
          <div id={control.id}>
            <RadioGroup
              aria-label={TEXTOS_PLAN_FORM.periodicidadOrdenes}
              aria-invalid={control["aria-invalid"]}
              aria-describedby={control["aria-describedby"]}
              value={form.periodicidadOrdenes}
              onValueChange={(v) => {
                const periodicidad = PERIODICIDADES_ORDENES.find((p) => p === v);
                if (periodicidad !== undefined) cambiar("periodicidadOrdenes", periodicidad);
              }}
              options={PERIODICIDADES_ORDENES.map((p) => ({ value: p, label: TEXTOS_TIPO_COBRO.tipo[p] }))}
            />
          </div>
        )}
      </FormField>
    </div>
  );
}
