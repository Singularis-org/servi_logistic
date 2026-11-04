"use client";

import { useState, type ComponentProps, type FocusEvent } from "react";

import { Input } from "@/components/ui/input";
import { montoParaCampo } from "@/lib/config/moneda";

type PropsInput = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode">;

export type MontoInputProps = PropsInput & {
  /** El monto como texto decimal (`"500"`, `"500.50"` o lo que el usuario está tecleando). */
  value: string;
  /** Recibe el texto tal cual; nunca se convierte a `number` (sin floats en dinero). */
  onChange: (valor: string) => void;
};

/**
 * SLT-67 — campo de monto compartido: muestra `500` y no `500.00`.
 *
 * - **Fuera del foco** se pinta `montoParaCampo(value)`, así un valor del servidor
 *   (`Decimal.toFixed(2)`) se ve limpio desde el primer render; al enfocar se entrega ese
 *   texto normalizado a `onChange`, para que lo editado sea lo que se veía.
 * - **Con el foco** se pinta `value` tal cual: normalizar en cada tecla le borraría el punto a
 *   quien escribe `500.` o el cero a quien escribe `500.5` camino de `500.50`.
 * - **En `onBlur`** se entrega a `onChange` el texto normalizado si cambió, para que lo que sale
 *   hacia la action sea lo mismo que se ve.
 *
 * Todo lo demás (`id`, `aria-*`, `disabled`, `ref`...) viaja al `Input`, así sirve como hijo de
 * `FormField`, que le clona esas props.
 */
export function MontoInput({ value, onChange, onFocus, onBlur, ...props }: MontoInputProps) {
  const [enfocado, setEnfocado] = useState(false);

  function alEnfocar(ev: FocusEvent<HTMLInputElement>) {
    setEnfocado(true);
    // Lo que se veía fuera del foco es lo que se edita: el `500.00` del servidor no reaparece.
    const normalizado = montoParaCampo(value);
    if (normalizado !== value) onChange(normalizado);
    onFocus?.(ev);
  }

  function alSalir(ev: FocusEvent<HTMLInputElement>) {
    setEnfocado(false);
    const normalizado = montoParaCampo(value);
    if (normalizado !== value) onChange(normalizado);
    onBlur?.(ev);
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={enfocado ? value : montoParaCampo(value)}
      onChange={(ev) => onChange(ev.target.value)}
      onFocus={alEnfocar}
      onBlur={alSalir}
    />
  );
}
