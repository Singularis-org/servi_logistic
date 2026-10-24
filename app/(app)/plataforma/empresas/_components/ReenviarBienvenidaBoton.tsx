"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ReenviarBienvenidaResultado } from "@/lib/actions/organizaciones";

export interface ReenviarBienvenidaBotonProps {
  /** La empresa de la fila. La action elige a su primer maestro (R30). */
  organizacionId: string;
  /** `reenviarBienvenidaAction`, inyectada como `altaEmpresa` para poder probarla. */
  reenviarBienvenida: (input: { organizacionId: string }) => Promise<ReenviarBienvenidaResultado>;
}

/** Textos del botón, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  boton: "Reenviar bienvenida",
  enviada: (email: string) => `Enviada a ${email}.`,
  noSalio: "No salió. Inténtalo de nuevo.",
  sinCorreo: "No salió: el correo no está configurado.",
  sinMaestro: "Esta empresa no tiene maestro.",
} as const;

/**
 * Traduce la respuesta a la línea que ve el superadmin (R31). Lee `unknown` a propósito, como
 * `desenlaceDe` del módulo: la respuesta cruza la red, y una fuera del contrato (o los
 * `no_autorizado` / `invalida`, que esta pantalla no debería ver nunca) se pinta como «No salió»:
 * ante la duda, que se pueda reintentar.
 */
function mensajeDe(respuesta: unknown): string {
  if (typeof respuesta !== "object" || respuesta === null) return TEXTOS.noSalio;
  const r = respuesta as { estado?: unknown; email?: unknown };
  if (r.estado === "enviada" && typeof r.email === "string") return TEXTOS.enviada(r.email);
  if (r.estado === "sin_correo") return TEXTOS.sinCorreo;
  if (r.estado === "sin_maestro") return TEXTOS.sinMaestro;
  return TEXTOS.noSalio;
}

/**
 * «Reenviar bienvenida» de una fila de «Empresas» (SL-41, R29–R31). Vive junto a la pantalla
 * porque solo se usa aquí. La región `role="status"` existe siempre, vacía hasta el primer
 * resultado: un lector de pantalla anuncia los cambios de una región viva que ya estaba, y no
 * siempre los de una que aparece de golpe.
 */
export function ReenviarBienvenidaBoton({
  organizacionId,
  reenviarBienvenida,
}: ReenviarBienvenidaBotonProps) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function reenviar() {
    setEnviando(true);
    setMensaje("");
    let siguiente: string;
    try {
      siguiente = mensajeDe(await reenviarBienvenida({ organizacionId }));
    } catch {
      // Una excepción de red no dice si el correo salió: se trata como que no, sin su detalle.
      siguiente = TEXTOS.noSalio;
    }
    setMensaje(siguiente);
    setEnviando(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" loading={enviando} onClick={reenviar}>
        {TEXTOS.boton}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {mensaje}
      </p>
    </div>
  );
}
