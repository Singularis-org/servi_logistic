"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { MontoInput } from "@/components/shared/MontoInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { MAX_NIVELES } from "@/lib/planes/niveles";

import { nuevaClaveDeNivel, type NivelEnPantalla, type PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoNivelesProps = PropsDelPaso & {
  /**
   * Descarta los errores pendientes cuyas claves empiezan por `prefijo`. Los errores de un nivel van por su
   * posición (`niveles.<i>.meta`): quitar uno los dejaría junto a otra fila.
   */
  descartarErrores: (prefijo: string) => void;
};

/**
 * SLT-215 (design §4.2; R8–R10) — paso Niveles: la lista editable de niveles por volumen del plan. Cada fila,
 * rotulada «Nivel n», tiene su meta, el tipo de descuento (porcentaje o monto fijo), su valor y el botón para
 * quitarla; «Agregar nivel» añade una al final en porcentaje y se deshabilita con 10. Sin subir ni bajar: el orden
 * lo fijan las metas, que deben crecer (R3). Sin niveles, se guarda y se continúa igual (R9).
 */
export function PasoNiveles({ form, setForm, idDe, errorDe, descartarErrores }: PasoNivelesProps) {
  const niveles = form.niveles;
  const lleno = niveles.length >= MAX_NIVELES;
  /** R8: tras «Agregar nivel», el foco va a la meta de la fila nueva (cuando ya está en el DOM). */
  const enfocarFila = useRef<number | null>(null);

  useEffect(() => {
    const fila = enfocarFila.current;
    if (fila === null) return;
    enfocarFila.current = null;
    document.getElementById(idDe(`niveles.${fila}.meta`))?.focus();
  }, [niveles.length, idDe]);

  function cambiarFila(indice: number, cambio: Partial<NivelEnPantalla>) {
    setForm((f) => ({ ...f, niveles: f.niveles.map((n, i) => (i === indice ? { ...n, ...cambio } : n)) }));
  }

  function agregar() {
    if (lleno) return;
    enfocarFila.current = niveles.length;
    setForm((f) => ({
      ...f,
      niveles: [...f.niveles, { clave: nuevaClaveDeNivel(), meta: "", tipo: "porcentaje", valor: "" }],
    }));
  }

  function quitar(indice: number) {
    descartarErrores("niveles");
    setForm((f) => ({ ...f, niveles: f.niveles.filter((_n, i) => i !== indice) }));
  }

  const errorDeLaLista = errorDe("niveles");

  return (
    <fieldset
      id={idDe("niveles")}
      className="flex flex-col gap-4"
      aria-describedby={errorDeLaLista ? `${idDe("niveles")}-error` : undefined}
    >
      {/* La leyenda repite el título del paso: solo para lectores. */}
      <legend className="sr-only">{TEXTOS_PLAN_FORM.niveles}</legend>
      {niveles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {TEXTOS_PLAN_FORM.sinNivelesEnElPaso}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {niveles.map((n, i) => (
            <li key={n.clave}>
              <FilaDelNivel
                nivel={n}
                indice={i}
                onCambio={(cambio) => cambiarFila(i, cambio)}
                onTipo={(tipo) => {
                  // El error del valor va por la forma (`…descuento.porcentaje`): con otra forma ya no tiene campo.
                  descartarErrores(`niveles.${i}.descuento`);
                  cambiarFila(i, { tipo });
                }}
                onQuitar={() => quitar(i)}
                idDe={idDe}
                errorDe={errorDe}
              />
            </li>
          ))}
        </ol>
      )}
      <FieldError id={`${idDe("niveles")}-error`} messages={errorDeLaLista} />
      <div>
        <Button type="button" variant="outline" size="sm" onClick={agregar} disabled={lleno}>
          <Plus aria-hidden="true" />
          {TEXTOS_PLAN_FORM.agregarNivel}
        </Button>
      </div>
    </fieldset>
  );
}

interface FilaDelNivelProps {
  nivel: NivelEnPantalla;
  indice: number;
  onCambio: (cambio: Partial<NivelEnPantalla>) => void;
  onTipo: (tipo: NivelEnPantalla["tipo"]) => void;
  onQuitar: () => void;
  idDe: (clave: string) => string;
  errorDe: (clave: string) => string[] | undefined;
}

/**
 * Una fila: «Nivel n», meta, tipo y valor del descuento, y el botón para quitarla. Cada control se nombra con el
 * número de la fila («Meta de órdenes al mes del nivel 2»), y cada error va bajo su campo (`niveles.<i>.meta`,
 * `niveles.<i>.descuento.<tipo>`; R10).
 */
function FilaDelNivel({ nivel, indice, onCambio, onTipo, onQuitar, idDe, errorDe }: FilaDelNivelProps) {
  const n = indice + 1;
  const claveMeta = `niveles.${indice}.meta`;
  const claveValor = `niveles.${indice}.descuento.${nivel.tipo}`;
  const idTitulo = idDe(`niveles.${indice}.titulo`);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-labelledby={idTitulo}>
      <div className="flex items-center justify-between gap-2">
        <h4 id={idTitulo} className="text-sm font-medium">
          {TEXTOS_PLAN_FORM.nivel(n)}
        </h4>
        <Button type="button" variant="outline" size="icon" aria-label={TEXTOS_PLAN_FORM.quitarNivel(n)} onClick={onQuitar}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <FormField
          id={idDe(claveMeta)}
          label={TEXTOS_PLAN_FORM.metaDelNivel(n)}
          error={errorDe(claveMeta)}
          className="sm:w-56 sm:flex-none"
        >
          <Input inputMode="numeric" value={nivel.meta} onChange={(ev) => onCambio({ meta: ev.target.value })} />
        </FormField>
        <div className="flex flex-col gap-2">
          <RadioGroup
            aria-label={TEXTOS_PLAN_FORM.tipoDeDescuentoDelNivel(n)}
            value={nivel.tipo}
            // Cambiar el tipo conserva el valor escrito.
            onValueChange={(v) => onTipo(v === "monto" ? "monto" : "porcentaje")}
            options={[
              { value: "porcentaje", label: TEXTOS_PLAN_FORM.porcentaje },
              { value: "monto", label: TEXTOS_PLAN_FORM.montoFijo },
            ]}
            className="flex-row"
          />
          <FormField
            id={idDe(claveValor)}
            label={TEXTOS_PLAN_FORM.descuentoDelNivel(n)}
            error={errorDe(claveValor)}
            className="sm:w-48"
          >
            {(control) =>
              nivel.tipo === "monto" ? (
                <MontoInput {...control} value={nivel.valor} onChange={(v) => onCambio({ valor: v })} />
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={nivel.valor}
                    onChange={(ev) => onCambio({ valor: ev.target.value })}
                  />
                  {/* El sufijo es visual: el tipo elegido ya dice «Porcentaje». */}
                  <span aria-hidden="true" className="text-sm text-muted-foreground">
                    {TEXTOS_PLAN_FORM.sufijoPorcentaje}
                  </span>
                </div>
              )
            }
          </FormField>
        </div>
      </div>
    </section>
  );
}
