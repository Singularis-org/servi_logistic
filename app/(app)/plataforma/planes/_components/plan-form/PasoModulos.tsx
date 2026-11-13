"use client";

import type { ModuloApagable } from "@prisma/client";

import { FieldError } from "@/components/shared/FieldError";
import { Checkbox } from "@/components/ui/checkbox";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";

import type { PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

/** SLT-130 (R15) — paso Módulos: las casillas de los módulos incluidos, como hoy. */
export function PasoModulos({ form, setForm, idDe, errorDe }: PropsDelPaso) {
  function alternarModulo(modulo: ModuloApagable, marcado: boolean) {
    setForm((f) => ({
      ...f,
      modulos: marcado ? [...f.modulos, modulo] : f.modulos.filter((m) => m !== modulo),
    }));
  }

  return (
    <fieldset
      id={idDe("modulos")}
      className="flex flex-col gap-3"
      aria-describedby={errorDe("modulos") ? `${idDe("modulos")}-error` : undefined}
    >
      <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.modulos}</legend>
      <ul className="flex flex-col gap-2">
        {ORDEN_MODULOS.map((modulo) => {
          const id = idDe(`modulo-${modulo}`);
          return (
            <li key={modulo} className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox
                id={id}
                checked={form.modulos.includes(modulo)}
                onCheckedChange={(marcado) => alternarModulo(modulo, marcado === true)}
              />
              <label htmlFor={id} className="cursor-pointer">
                {nombreDelModulo(modulo)}
              </label>
            </li>
          );
        })}
      </ul>
      <FieldError id={`${idDe("modulos")}-error`} messages={errorDe("modulos")} />
    </fieldset>
  );
}
