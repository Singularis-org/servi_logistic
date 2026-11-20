"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { IconoDeBeneficio } from "@/components/shared/planes/BeneficiosDelPlan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ICONOS_DE_BENEFICIO, NOMBRE_DEL_ICONO } from "@/lib/planes/beneficios";

import { nuevaClaveDeBeneficio, type BeneficioEnPantalla, type PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

/** R2: el largo máximo del texto de un beneficio (el mismo que el esquema y el CHECK de la base). */
const LARGO_MAXIMO = 120;

/** R5: las opciones del selector, en el orden del catálogo, con su ícono y su nombre. */
const OPCIONES_DE_ICONO = ICONOS_DE_BENEFICIO.map((icono) => ({
  value: icono,
  label: NOMBRE_DEL_ICONO[icono],
  icon: <IconoDeBeneficio icono={icono} />,
}));

export type PasoBeneficiosProps = PropsDelPaso & {
  /**
   * Descarta los errores pendientes cuyas claves empiezan por `prefijo`. Los errores de un beneficio van por su
   * posición (`beneficios.<i>.texto`): subir, bajar o quitar uno los dejaría junto a otra fila.
   */
  descartarErrores: (prefijo: string) => void;
};

/**
 * SLT-214 (design §4.3; R8–R10) — paso Beneficios: la lista editable de beneficios del plan. Cada fila tiene su
 * ícono, su texto y los botones para subirla, bajarla y quitarla; «Agregar beneficio» añade una al final con el
 * ícono «Check». El orden en pantalla es el que se guarda. Sin beneficios, se guarda y se continúa igual (R9).
 */
export function PasoBeneficios({ form, setForm, idDe, errorDe, descartarErrores }: PasoBeneficiosProps) {
  const beneficios = form.beneficios;
  /** R8: tras «Agregar beneficio», el foco va al texto de la fila nueva (cuando ya está en el DOM). */
  const enfocarFila = useRef<number | null>(null);

  useEffect(() => {
    const fila = enfocarFila.current;
    if (fila === null) return;
    enfocarFila.current = null;
    document.getElementById(idDe(`beneficios.${fila}.texto`))?.focus();
  }, [beneficios.length, idDe]);

  function cambiarFila(indice: number, cambio: Partial<BeneficioEnPantalla>) {
    setForm((f) => ({ ...f, beneficios: f.beneficios.map((b, i) => (i === indice ? { ...b, ...cambio } : b)) }));
  }

  function agregar() {
    enfocarFila.current = beneficios.length;
    setForm((f) => ({
      ...f,
      beneficios: [...f.beneficios, { clave: nuevaClaveDeBeneficio(), icono: "check", texto: "" }],
    }));
  }

  function quitar(indice: number) {
    descartarErrores("beneficios");
    setForm((f) => ({ ...f, beneficios: f.beneficios.filter((_b, i) => i !== indice) }));
  }

  /** Cambia de sitio la fila `indice` con la de `indice + delta`. */
  function mover(indice: number, delta: -1 | 1) {
    const destino = indice + delta;
    if (destino < 0 || destino >= beneficios.length) return;
    descartarErrores("beneficios");
    setForm((f) => {
      const lista = [...f.beneficios];
      [lista[indice], lista[destino]] = [lista[destino]!, lista[indice]!];
      return { ...f, beneficios: lista };
    });
  }

  return (
    <fieldset className="flex flex-col gap-4">
      {/* La leyenda repite el título del paso: solo para lectores. */}
      <legend className="sr-only">{TEXTOS_PLAN_FORM.beneficios}</legend>
      {beneficios.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {TEXTOS_PLAN_FORM.sinBeneficiosEnElPaso}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {beneficios.map((b, i) => (
            <li key={b.clave}>
              <FilaDelBeneficio
                beneficio={b}
                indice={i}
                esPrimero={i === 0}
                esUltimo={i === beneficios.length - 1}
                onCambio={(cambio) => cambiarFila(i, cambio)}
                onSubir={() => mover(i, -1)}
                onBajar={() => mover(i, 1)}
                onQuitar={() => quitar(i)}
                idDe={idDe}
                errorDe={errorDe}
              />
            </li>
          ))}
        </ol>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={agregar}>
          <Plus aria-hidden="true" />
          {TEXTOS_PLAN_FORM.agregarBeneficio}
        </Button>
      </div>
    </fieldset>
  );
}

interface FilaDelBeneficioProps {
  beneficio: BeneficioEnPantalla;
  indice: number;
  esPrimero: boolean;
  esUltimo: boolean;
  onCambio: (cambio: Partial<BeneficioEnPantalla>) => void;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
  idDe: (clave: string) => string;
  errorDe: (clave: string) => string[] | undefined;
}

/**
 * Una fila: ícono, texto y los tres botones. Cada control se nombra con el número de la fila («Texto del
 * beneficio 2»), y cada error va bajo su campo (`beneficios.<i>.icono`, `beneficios.<i>.texto`; R10).
 */
function FilaDelBeneficio({
  beneficio,
  indice,
  esPrimero,
  esUltimo,
  onCambio,
  onSubir,
  onBajar,
  onQuitar,
  idDe,
  errorDe,
}: FilaDelBeneficioProps) {
  const n = indice + 1;
  const claveIcono = `beneficios.${indice}.icono`;
  const claveTexto = `beneficios.${indice}.texto`;
  const errorIcono = errorDe(claveIcono);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-col gap-1 sm:w-52 sm:flex-none">
        <div className="flex items-center gap-2">
          <IconoDeBeneficio icono={beneficio.icono} />
          <Select
            id={idDe(claveIcono)}
            aria-label={TEXTOS_PLAN_FORM.iconoDelBeneficio(n)}
            aria-invalid={errorIcono ? true : undefined}
            aria-describedby={errorIcono ? `${idDe(claveIcono)}-error` : undefined}
            value={beneficio.icono}
            options={OPCIONES_DE_ICONO}
            onValueChange={(v) => {
              const icono = ICONOS_DE_BENEFICIO.find((c) => c === v);
              if (icono !== undefined) onCambio({ icono });
            }}
          />
        </div>
        <FieldError id={`${idDe(claveIcono)}-error`} messages={errorIcono} />
      </div>
      <FormField
        id={idDe(claveTexto)}
        label={TEXTOS_PLAN_FORM.textoDelBeneficio(n)}
        labelClassName="sr-only"
        error={errorDe(claveTexto)}
        className="min-w-0 flex-1"
      >
        <Input
          maxLength={LARGO_MAXIMO}
          value={beneficio.texto}
          onChange={(ev) => onCambio({ texto: ev.target.value })}
        />
      </FormField>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={TEXTOS_PLAN_FORM.subirBeneficio(n)}
          disabled={esPrimero}
          onClick={onSubir}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={TEXTOS_PLAN_FORM.bajarBeneficio(n)}
          disabled={esUltimo}
          onClick={onBajar}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={TEXTOS_PLAN_FORM.quitarBeneficio(n)} onClick={onQuitar}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
