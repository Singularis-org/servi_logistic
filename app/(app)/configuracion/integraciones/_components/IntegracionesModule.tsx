"use client";

import { useState } from "react";

import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import {
  altaIntegracion,
  desconectarIntegracion,
  editarIntegracion,
  probarIntegracion,
  regenerarTokenIntegracion,
} from "@/lib/actions/integraciones";
import type { VerificacionWebhook, VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";
import { TEXTOS_ERROR_INTEGRACION, type ServicioIntegracion } from "@/lib/types/integraciones";

import { DesconectarDialogo } from "./DesconectarDialogo";
import { FormularioIntegracion, type RespuestaFormularioIntegracion } from "./FormularioIntegracion";
import { mensajeDeResultado, TEXTOS_PANTALLA } from "./integraciones-textos";
import { RevelarTokenWebhookModal } from "./RevelarTokenWebhookModal";
import { TarjetaIntegracion } from "./TarjetaIntegracion";

export interface IntegracionesModuleProps {
  /** Los cuatro servicios, en el orden del catálogo, tal como los lee el Server Component. */
  servicios: readonly VistaIntegracion[];
}

const TEXTOS_REGENERAR = {
  titulo: "¿Regenerar el token del webhook?",
  cuerpo:
    "El token actual deja de valer. Tendrás que pegar el nuevo en la configuración del webhook en Meta para que pueda volver a verificarlo.",
  confirmar: "Regenerar",
} as const;

/**
 * SL-36 (R18, R31, R34-R36) — la pantalla de integraciones: una tarjeta por servicio y las
 * operaciones sobre ellas.
 *
 * Los datos llegan por props del Server Component; las actions que cambian el estado revalidan la
 * ruta y el servidor vuelve a pasar las vistas. Lo único que NO viaja por props es el token del
 * webhook (R18): vive en `verificacion`, estado local de este módulo, que sobrevive al re-render
 * del alta y desaparece al cerrar el diálogo o al recargar.
 */
export function IntegracionesModule({ servicios }: IntegracionesModuleProps) {
  const toast = useToast();
  const [abierto, setAbierto] = useState<ServicioIntegracion | null>(null);
  const [ocupado, setOcupado] = useState<ServicioIntegracion | null>(null);
  const [aDesconectar, setADesconectar] = useState<VistaIntegracion | null>(null);
  const [aRegenerar, setARegenerar] = useState<VistaIntegracion | null>(null);
  const [verificacion, setVerificacion] = useState<VerificacionWebhook | null>(null);

  // Las actions ya convierten en `unexpected` lo que falla en el servidor; esto solo ve un fallo de
  // red de la propia llamada, que el Modal deja con el diálogo abierto para reintentar.
  const avisarFallo = () => toast.error(TEXTOS_ERROR_INTEGRACION.unexpected);

  async function guardar(vista: VistaIntegracion, campos: Record<string, string>): Promise<RespuestaFormularioIntegracion> {
    setOcupado(vista.servicio);
    try {
      if (vista.id === null) {
        const r = await altaIntegracion({ servicio: vista.servicio, campos });
        if (r.status === "creada") {
          setAbierto(null);
          if (r.verificacion) setVerificacion(r.verificacion);
          return { ok: true };
        }
        if (r.status === "invalid_input") return { ok: false, mensaje: mensajeDeResultado(r), fieldErrors: r.fieldErrors };
        return { ok: false, mensaje: mensajeDeResultado(r) };
      }
      const r = await editarIntegracion({ id: vista.id, campos });
      if (r.status === "guardada") {
        setAbierto(null);
        return { ok: true };
      }
      if (r.status === "invalid_input") return { ok: false, mensaje: mensajeDeResultado(r), fieldErrors: r.fieldErrors };
      return { ok: false, mensaje: mensajeDeResultado(r) };
    } catch {
      return { ok: false, mensaje: TEXTOS_ERROR_INTEGRACION.unexpected };
    } finally {
      setOcupado(null);
    }
  }

  async function probar(vista: VistaIntegracion) {
    if (vista.id === null) return;
    setOcupado(vista.servicio);
    try {
      const r = await probarIntegracion({ id: vista.id });
      if (r.status === "probada" && r.ok) toast.success(TEXTOS_PANTALLA.pruebaCorrecta);
      else toast.error(mensajeDeResultado(r));
    } catch {
      avisarFallo();
    } finally {
      setOcupado(null);
    }
  }

  async function regenerar() {
    const vista = aRegenerar;
    if (vista?.id == null) return;
    setOcupado(vista.servicio);
    try {
      const r = await regenerarTokenIntegracion({ id: vista.id });
      if (r.status === "regenerado") setVerificacion({ token: r.token, urlWebhook: r.urlWebhook });
      else toast.error(mensajeDeResultado(r));
    } finally {
      setOcupado(null);
    }
  }

  async function desconectar() {
    const vista = aDesconectar;
    if (vista?.id == null) return;
    setOcupado(vista.servicio);
    try {
      const r = await desconectarIntegracion({ id: vista.id });
      if (r.status === "desconectada") toast.success(TEXTOS_PANTALLA.desconectada);
      else toast.error(mensajeDeResultado(r));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {servicios.map((vista) => {
        const estaAbierto = abierto === vista.servicio;
        return (
          <TarjetaIntegracion
            key={vista.servicio}
            vista={vista}
            ocupado={ocupado === vista.servicio}
            formularioAbierto={estaAbierto}
            onConfigurar={() => setAbierto(vista.servicio)}
            onProbar={() => void probar(vista)}
            onRegenerarToken={() => setARegenerar(vista)}
            onDesconectar={() => setADesconectar(vista)}
          >
            {estaAbierto ? (
              <FormularioIntegracion
                servicio={vista.servicio}
                modo={vista.id === null ? "alta" : "edicion"}
                valoresIniciales={vista.datosPublicos}
                onEnviar={(campos) => guardar(vista, campos)}
                onCancelar={() => setAbierto(null)}
              />
            ) : null}
          </TarjetaIntegracion>
        );
      })}

      {aDesconectar ? (
        <DesconectarDialogo
          servicio={aDesconectar.servicio}
          open
          onOpenChange={(open) => {
            if (!open) setADesconectar(null);
          }}
          onConfirmar={desconectar}
          onError={avisarFallo}
        />
      ) : null}

      <Modal
        open={aRegenerar !== null}
        onOpenChange={(open) => {
          if (!open) setARegenerar(null);
        }}
        title={TEXTOS_REGENERAR.titulo}
        confirmLabel={TEXTOS_REGENERAR.confirmar}
        onConfirm={regenerar}
        onError={avisarFallo}
        size="md"
      >
        <p className="text-sm">{TEXTOS_REGENERAR.cuerpo}</p>
      </Modal>

      {verificacion ? <RevelarTokenWebhookModal verificacion={verificacion} onClose={() => setVerificacion(null)} /> : null}
    </div>
  );
}
