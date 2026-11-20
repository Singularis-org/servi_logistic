"use client";

import { useState, useTransition, type ReactNode } from "react";
import useSWR from "swr";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import {
  cancelarCambioCorreoUsuario,
  obtenerCambioCorreoPendiente,
  solicitarCambioCorreoUsuario,
} from "@/lib/actions/usuarios";
import {
  solicitarCambioCorreoSchema,
  type CambioCorreoPendienteDTO,
  type SolicitarCambioCorreoResult,
} from "@/lib/types/usuario";
import { formatFechaHoraLegible } from "../api/_components/fecha-legible";

// Textos de la pantalla en un solo sitio: el test los afirma tal cual y una traducción futura los
// toma de aquí.
export const TEXTOS_CAMBIO_CORREO = {
  cambiar: "Cambiar correo",
  campo: "Correo nuevo",
  ayuda:
    "Le enviaremos un enlace a ese correo. La cuenta sigue entrando con el correo de ahora hasta que la persona lo confirme.",
  enviar: "Enviar confirmación",
  descartar: "No cambiar",
  pendiente: "Pendiente de confirmar:",
  vence: "El enlace vence el",
  vencido: "Vencido",
  vencidoAyuda: "El enlace ya no sirve. Puedes reenviarlo.",
  reenviar: "Reenviar",
  cancelar: "Cancelar",
  enviado: "Enviamos el enlace de confirmación al correo nuevo.",
  cancelado: "Se canceló el cambio de correo. El enlace ya no sirve.",
  correoInvalido: "Escribe un correo válido.",
  // design §7: `conflict` → este texto; R1617: `envio_fallido` → el suyo.
  enUso: "Ya está en uso por otro usuario",
  envioFallido: "No se pudo enviar el correo de confirmación. Inténtalo de nuevo.",
  errorGeneral: "No se pudo completar la acción. Inténtalo de nuevo.",
  errorCarga: "No se pudo consultar si hay un cambio de correo pendiente.",
} as const;

const T = TEXTOS_CAMBIO_CORREO;

export interface CambioCorreoUsuarioProps {
  /** Id del usuario que se edita. */
  usuarioId: string;
}

type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/** Mensaje de error para el resultado de pedir (o reenviar) un cambio; `null` si fue bien. */
function errorDeSolicitud(res: SolicitarCambioCorreoResult): string | null {
  switch (res.status) {
    case "ok":
      return null;
    case "conflict":
      // Review PR 2 (m5): si el servidor redacta el motivo (dos pedidos a la vez), se muestra tal
      // cual; sin él, el correo está en uso (R1611).
      return ("mensaje" in res && res.mensaje) || T.enUso;
    case "envio_fallido":
      return T.envioFallido;
    case "validation_error":
      // El servidor redacta el motivo (igual al actual, cuenta de API key): se muestra tal cual.
      return res.fieldErrors.email?.[0] ?? T.correoInvalido;
    default:
      return T.errorGeneral;
  }
}

/**
 * SLT-221 (design §7; R1617-R1620): el bloque «Cambiar correo» de «Editar usuario». El correo de la
 * cuenta no cambia aquí: se manda un enlace al correo nuevo y cambia cuando la persona lo confirma.
 * Lo monta `UsuarioForm` en modo edición, debajo del campo «Email».
 */
export function CambioCorreoUsuario({ usuarioId }: CambioCorreoUsuarioProps) {
  const [isPending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [emailNuevo, setEmailNuevo] = useState("");
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  const { data, error, mutate } = useSWR<CambioCorreoPendienteDTO | null>(
    ["usuarios:cambio-correo", usuarioId],
    async () => {
      const res = await obtenerCambioCorreoPendiente(usuarioId);
      if (res.status !== "ok") throw new Error(res.status);
      return res.pendiente;
    },
  );

  // Tras cualquier acción se vuelve a leer el pendiente: un envío fallido deja la cuenta sin
  // ninguno (R1617), aunque antes hubiera uno.
  function aplicarSolicitud(res: SolicitarCambioCorreoResult, alAcertar: () => void) {
    const mensaje = errorDeSolicitud(res);
    if (res.status === "ok") {
      void mutate(res.pendiente, { revalidate: false });
      alAcertar();
      setAviso({ tipo: "ok", texto: T.enviado });
      return;
    }
    void mutate();
    setAviso(mensaje ? { tipo: "error", texto: mensaje } : null);
  }

  function enviar() {
    setAviso(null);
    setErrorCampo(null);
    const parsed = solicitarCambioCorreoSchema.safeParse({ email: emailNuevo.trim() });
    if (!parsed.success) {
      setErrorCampo(T.correoInvalido);
      return;
    }
    startTransition(async () => {
      const res = await solicitarCambioCorreoUsuario(usuarioId, parsed.data);
      startTransition(() => {
        // Los rechazos del correo escrito van junto al campo; el resto, en el aviso del bloque.
        if (res.status === "conflict" || res.status === "validation_error") {
          setErrorCampo(errorDeSolicitud(res));
          return;
        }
        aplicarSolicitud(res, () => {
          setAbierto(false);
          setEmailNuevo("");
        });
      });
    });
  }

  function reenviar(pendiente: CambioCorreoPendienteDTO) {
    setAviso(null);
    startTransition(async () => {
      // «Reenviar» es pedir de nuevo el mismo correo (design §3.2): un solo camino de emisión.
      const res = await solicitarCambioCorreoUsuario(usuarioId, { email: pendiente.emailNuevo });
      startTransition(() => aplicarSolicitud(res, () => {}));
    });
  }

  function cancelar() {
    setAviso(null);
    startTransition(async () => {
      const res = await cancelarCambioCorreoUsuario(usuarioId);
      startTransition(() => {
        if (res.status === "ok") {
          void mutate(null, { revalidate: false });
          setAviso({ tipo: "ok", texto: T.cancelado });
          return;
        }
        void mutate();
        setAviso({ tipo: "error", texto: T.errorGeneral });
      });
    });
  }

  function abrir() {
    setAviso(null);
    setErrorCampo(null);
    setAbierto(true);
  }

  function descartar() {
    setAbierto(false);
    setEmailNuevo("");
    setErrorCampo(null);
  }

  let cuerpo: ReactNode;
  if (error) {
    cuerpo = <p className="text-sm text-muted-foreground">{T.errorCarga}</p>;
  } else if (data === undefined) {
    // Cargando: sin botones, para no ofrecer «Cambiar correo» a quien ya tiene uno pendiente.
    cuerpo = null;
  } else if (data) {
    const vence = formatFechaHoraLegible(data.expiraAt);
    cuerpo = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">
          {T.pendiente} <strong className="break-all font-medium">{data.emailNuevo}</strong>
        </p>
        {data.vencido ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="warning">{T.vencido}</Badge>
            {T.vencidoAyuda}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {T.vence} {vence ?? data.expiraAt}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isPending}
            onClick={() => reenviar(data)}
          >
            {T.reenviar}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={cancelar}
          >
            {T.cancelar}
          </Button>
        </div>
      </div>
    );
  } else if (abierto) {
    cuerpo = (
      <div className="flex flex-col gap-2">
        <FormField id="email-nuevo" label={T.campo} hint={T.ayuda} error={errorCampo ?? undefined}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              value={emailNuevo}
              disabled={isPending}
              onChange={(e) => setEmailNuevo(e.target.value)}
              onKeyDown={(e) => {
                // Enter envía este bloque, no el formulario de edición que lo contiene.
                if (e.key === "Enter") {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
          )}
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" loading={isPending} onClick={enviar}>
            {T.enviar}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={descartar}
          >
            {T.descartar}
          </Button>
        </div>
      </div>
    );
  } else {
    cuerpo = (
      <div>
        <Button type="button" variant="outline" size="sm" onClick={abrir}>
          {T.cambiar}
        </Button>
      </div>
    );
  }

  return (
    <section aria-label={T.cambiar} className="flex flex-col gap-2">
      {cuerpo}
      {aviso?.tipo === "ok" && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {aviso.texto}
        </p>
      )}
      {aviso?.tipo === "error" && (
        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{aviso.texto}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
