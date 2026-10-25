"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, Loader2 } from "lucide-react";

import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOGO_INTEGRACIONES, type ServicioIntegracion } from "@/lib/types/integraciones";

import { TEXTOS_PANTALLA } from "./integraciones-textos";

/** Lo que el módulo responde al envío: o salió bien, o el texto y los errores por campo. */
export type RespuestaFormularioIntegracion =
  | { ok: true }
  | { ok: false; mensaje: string; fieldErrors?: Record<string, string[]> };

export interface FormularioIntegracionProps {
  servicio: ServicioIntegracion;
  /** `alta` exige todos los campos; `edicion` acepta secretos vacíos = conservar el guardado (R14). */
  modo: "alta" | "edicion";
  /** Lo no secreto ya guardado, para precargar la edición. Nunca trae secretos (R5). */
  valoresIniciales?: Readonly<Record<string, string>>;
  onEnviar: (campos: Record<string, string>) => Promise<RespuestaFormularioIntegracion>;
  onCancelar: () => void;
}

/**
 * SL-36 (R35, R36) — alta o edición manual de un servicio, con los campos del catálogo.
 *
 * R36: los secretos son contraseñas SIN valor inicial y, tras un rechazo, se vacían; lo no secreto
 * se conserva para no hacer reescribir ids largos. Los secretos van sin controlar y con una `key`
 * que cambia en cada rechazo: remontarlos es la única forma de que el valor no sobreviva en el DOM.
 *
 * El JSON de la cuenta de servicio (`multilinea`) también va como contraseña y no como `textarea`:
 * un `textarea` lo mostraría en claro, y R36 manda. Pegarlo en una línea solo quita los saltos de
 * línea entre claves, que en JSON son espacio en blanco; los de la clave privada van escapados
 * (`\n`) dentro del texto y no se tocan.
 */
export function FormularioIntegracion({
  servicio,
  modo,
  valoresIniciales = {},
  onEnviar,
  onCancelar,
}: FormularioIntegracionProps) {
  const entrada = CATALOGO_INTEGRACIONES[servicio];
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [intento, setIntento] = useState(0);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    const datos = new FormData(evento.currentTarget);
    const campos: Record<string, string> = {};
    for (const campo of entrada.campos) {
      const valor = String(datos.get(campo.nombre) ?? "");
      // En edición, un secreto vacío no se manda: el service lo lee como «conservar» (R14).
      if (campo.secreto && modo === "edicion" && valor === "") continue;
      campos[campo.nombre] = campo.secreto ? valor : valor.trim();
    }
    setEnviando(true);
    try {
      const respuesta = await onEnviar(campos);
      if (!respuesta.ok) {
        setMensaje(respuesta.mensaje);
        setFieldErrors(respuesta.fieldErrors ?? {});
        setIntento((n) => n + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  const idForm = `formulario-${servicio}`;

  return (
    <form
      id={idForm}
      aria-label={entrada.nombre}
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      {/* R35: la guía dice dónde sacar cada dato y en qué campo pegarlo; se lee al llenar. */}
      <Link href={entrada.guia} className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
        <BookOpen aria-hidden="true" className="size-4" />
        {TEXTOS_PANTALLA.guia}
      </Link>

      {mensaje ? (
        <p role="alert" className="text-sm text-destructive">
          {mensaje}
        </p>
      ) : null}

      {entrada.campos.map((campo) => {
        const id = `${idForm}-${campo.nombre}`;
        const requerido = modo === "alta" || !campo.secreto;
        return (
          <FormField
            key={campo.secreto ? `${campo.nombre}-${intento}` : campo.nombre}
            id={id}
            label={campo.etiqueta}
            required={requerido}
            hint={campo.secreto && modo === "edicion" ? TEXTOS_PANTALLA.secretoConservar : undefined}
            error={fieldErrors[campo.nombre]}
          >
            {campo.secreto ? (
              <PasswordInput
                name={campo.nombre}
                etiqueta={campo.etiqueta}
                autoComplete="off"
                spellCheck={false}
                disabled={enviando}
              />
            ) : (
              <Input
                type="text"
                name={campo.nombre}
                defaultValue={valoresIniciales[campo.nombre] ?? ""}
                autoComplete="off"
                spellCheck={false}
                disabled={enviando}
              />
            )}
          </FormField>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {TEXTOS_PANTALLA.guardar}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>
          {TEXTOS_PANTALLA.cancelar}
        </Button>
      </div>
    </form>
  );
}
