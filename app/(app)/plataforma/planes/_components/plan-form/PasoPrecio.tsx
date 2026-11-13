"use client";

import { Plus, Trash2 } from "lucide-react";

import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { MontoInput } from "@/components/shared/MontoInput";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import { TIPOS_COBRO, type TipoCobro } from "@/lib/types/planes";

import { precioDe, primerPeriodoLibre, type LineaDeDescuento, type PropsDelPaso } from "./estado";
import { textoDeHoy } from "./revision";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoPrecioProps = PropsDelPaso & {
  /**
   * Descarta los errores pendientes cuyas claves empiezan por `prefijo`. Una línea que cambia de período o
   * se quita deja de tener campo para sus errores: sin esto caerían al aviso general de «Revisar».
   */
  descartarErrores: (prefijo: string) => void;
};

/**
 * SLT-130 (R10–R13, R16) — paso Precio y descuentos: «Sin precio» o «Con monto» con el costo base
 * mensual, y la lista de descuentos, una línea por período. Al editar, «Hoy» bajo el costo base si cambia.
 */
export function PasoPrecio({ modo, form, cambiar, setForm, idDe, errorDe, plan, descartarErrores }: PasoPrecioProps) {
  // R16: el costo base del plan guardado, solo al editar y si el del formulario difiere (forma canónica).
  const hoy =
    modo === "editar" && plan !== null && diferenciasDelPlan(plan, { ...plan, precio: precioDe(form) }).precio !== undefined
      ? textoDeHoy({ precio: plan.precio })
      : null;
  const libre = primerPeriodoLibre(form.descuentos);

  function cambiarLinea(indice: number, linea: LineaDeDescuento) {
    setForm((f) => ({ ...f, descuentos: f.descuentos.map((l, i) => (i === indice ? linea : l)) }));
  }

  function cambiarPeriodo(indice: number, periodo: TipoCobro) {
    const linea = form.descuentos[indice];
    if (linea === undefined || linea.periodo === periodo) return;
    descartarErrores(`precio.descuentos.${linea.periodo}`);
    cambiarLinea(indice, { ...linea, periodo });
  }

  function quitar(indice: number) {
    const linea = form.descuentos[indice];
    if (linea !== undefined) descartarErrores(`precio.descuentos.${linea.periodo}`);
    setForm((f) => ({ ...f, descuentos: f.descuentos.filter((_, i) => i !== indice) }));
  }

  function agregar() {
    if (libre === null) return;
    setForm((f) => ({ ...f, descuentos: [...f.descuentos, { periodo: libre, forma: "porcentaje", valor: "" }] }));
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.precio}</legend>
        <div id={idDe("precio")}>
          <RadioGroup
            aria-label={TEXTOS_PLAN_FORM.precio}
            aria-invalid={Boolean(errorDe("precio"))}
            aria-describedby={errorDe("precio") ? `${idDe("precio")}-error` : undefined}
            value={form.precio}
            onValueChange={(v) => cambiar("precio", v === "monto" ? "monto" : "sin_precio")}
            options={[
              { value: "sin_precio", label: TEXTOS_PLAN_FORM.sinPrecio },
              { value: "monto", label: TEXTOS_PLAN_FORM.monto },
            ]}
          />
        </div>
        <FieldError id={`${idDe("precio")}-error`} messages={errorDe("precio")} />
        {form.precio === "monto" ? (
          <FormField id={idDe("precio.mensual")} label={TEXTOS_PLAN_FORM.mensual} error={errorDe("precio.mensual")}>
            <MontoInput value={form.mensual} onChange={(v) => cambiar("mensual", v)} />
          </FormField>
        ) : null}
        {hoy !== null ? <p className="text-sm text-muted-foreground">{hoy}</p> : null}
      </fieldset>

      {form.precio === "monto" ? (
        <section className="flex flex-col gap-3" aria-labelledby={idDe("descuentos-titulo")}>
          <h4 id={idDe("descuentos-titulo")} className="text-sm font-medium">
            {TEXTOS_PLAN_FORM.descuentos}
          </h4>
          {form.descuentos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              {TEXTOS_PLAN_FORM.sinDescuentos}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {form.descuentos.map((linea, i) => (
                // Por posición: al cambiar el período, la línea no se vuelve a montar y el foco sigue en ella.
                <li key={i}>
                  <LineaDelDescuento
                    linea={linea}
                    // R11: el selector no ofrece los períodos que ya usa otra línea.
                    periodos={TIPOS_COBRO.filter(
                      (t) => t === linea.periodo || !form.descuentos.some((l) => l.periodo === t),
                    )}
                    onPeriodo={(p) => cambiarPeriodo(i, p)}
                    onCambio={(l) => cambiarLinea(i, l)}
                    onQuitar={() => quitar(i)}
                    idDe={idDe}
                    errorDe={errorDe}
                  />
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={agregar} disabled={libre === null}>
              <Plus aria-hidden="true" />
              {TEXTOS_PLAN_FORM.agregarDescuento}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface LineaDelDescuentoProps {
  linea: LineaDeDescuento;
  periodos: readonly TipoCobro[];
  onPeriodo: (periodo: TipoCobro) => void;
  onCambio: (linea: LineaDeDescuento) => void;
  onQuitar: () => void;
  idDe: (clave: string) => string;
  errorDe: (clave: string) => string[] | undefined;
}

/**
 * SLT-130 (R10, R11; design §5) — una línea de descuento: período, valor, tipo («Fijo» o «%») y el botón
 * para quitarla. El error de la action cae en el valor (`precio.descuentos.<período>.<forma>`) o en la
 * línea (`precio.descuentos.<período>`).
 */
function LineaDelDescuento({ linea, periodos, onPeriodo, onCambio, onQuitar, idDe, errorDe }: LineaDelDescuentoProps) {
  const clave = `precio.descuentos.${linea.periodo}`;
  const claveValor = `${clave}.${linea.forma}`;
  const errorLinea = errorDe(clave);
  return (
    <fieldset
      id={idDe(clave)}
      className="flex flex-col gap-2"
      aria-describedby={errorLinea ? `${idDe(clave)}-error` : undefined}
    >
      <legend className="sr-only">{TEXTOS_PLAN_FORM.descuento(linea.periodo)}</legend>
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-36">
          <Select
            aria-label={TEXTOS_PLAN_FORM.periodoDelDescuento}
            value={linea.periodo}
            options={periodos.map((t) => ({ value: t, label: TEXTOS_TIPO_COBRO.tipo[t] }))}
            onValueChange={(v) => {
              const periodo = TIPOS_COBRO.find((t) => t === v);
              if (periodo !== undefined) onPeriodo(periodo);
            }}
          />
        </div>
        <FormField
          id={idDe(claveValor)}
          label={TEXTOS_PLAN_FORM.valorDelDescuento}
          labelClassName="sr-only"
          error={errorDe(claveValor)}
          className="w-32"
        >
          {(control) =>
            linea.forma === "monto" ? (
              <MontoInput {...control} value={linea.valor} onChange={(v) => onCambio({ ...linea, valor: v })} />
            ) : (
              <Input
                {...control}
                inputMode="decimal"
                value={linea.valor}
                onChange={(ev) => onCambio({ ...linea, valor: ev.target.value })}
              />
            )
          }
        </FormField>
        <RadioGroup
          aria-label={TEXTOS_PLAN_FORM.tipoDelDescuento}
          aria-invalid={Boolean(errorLinea)}
          value={linea.forma}
          // R10: cambiar el tipo conserva el valor escrito.
          onValueChange={(v) => onCambio({ ...linea, forma: v === "monto" ? "monto" : "porcentaje" })}
          options={[
            { value: "monto", label: TEXTOS_PLAN_FORM.descuentoFijo },
            { value: "porcentaje", label: TEXTOS_PLAN_FORM.descuentoPorciento },
          ]}
          className="flex-row"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={TEXTOS_PLAN_FORM.quitarDescuento(linea.periodo)}
          onClick={onQuitar}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <FieldError id={`${idDe(clave)}-error`} messages={errorLinea} />
    </fieldset>
  );
}
