"use client";

import { ScanLine } from "lucide-react";

import { EscanerModal, ESCANER_LABEL_GUIA } from "@/components/shared/EscanerModal";
import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { useToast } from "@/hooks/useToast";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { avisoReservaParaOtroDia } from "@/lib/utils/dia-reparto-textos";
import { leerGuia } from "@/lib/utils/paquete-url";

import { ordenPorGuia } from "./reparto-escaner";

// SLT-156 (R500, R514, R515; design §7): el escáner de la LISTA de Reparto. El mismo disparador
// «Escanear o escribir guía» que Recoger en bodega y Recolección, con la tarjeta de escaneo de
// siempre (`EscanerGuiaCard`: cámara, número tecleado o pistola). Leer una guía no gestiona nada:
// si es de una orden por gestionar, cierra el modal y la entrega al módulo, que pide «¿Gestionar
// esta orden?» con el mismo diálogo que el botón de la tarjeta. Si no, avisa y no cambia de vista.
// Con el mensajero bloqueado el módulo no lo monta (R516).

const TITULO = "Abrir orden por guía";
const DESCRIPCION = "Escanea o ingresa el número de guía de una orden de tu reparto.";
const BOTON = "Abrir orden";
const CODIGO_INVALIDO = "Código inválido.";

export function avisoGuiaFueraDeReparto(numGuia: number): string {
  return `La guía ${numGuia} no está en tu lista de reparto.`;
}

export interface EscanerGuiaRepartoProps {
  /** Las órdenes por gestionar del mensajero (sin filtrar por la búsqueda). */
  porGestionar: readonly MiAsignacionDTO[];
  /** Las que tienen ayuda solicitada: su guía no abre nada aquí. */
  conAyuda: readonly MiAsignacionDTO[];
  /** La guía es de esta orden: el modal ya se cerró cuando llega aquí. */
  onOrdenEncontrada: (orden: MiAsignacionDTO) => void;
}

export function EscanerGuiaReparto({
  porGestionar,
  conAyuda,
  onOrdenEncontrada,
}: Readonly<EscanerGuiaRepartoProps>) {
  const toast = useToast();

  function rechazar(motivo: string): ResultadoLectura {
    toast.error(motivo);
    return { tipo: "error", motivo };
  }

  function procesar(texto: string, cerrar: () => void): ResultadoLectura {
    const numGuia = leerGuia(texto);
    if (numGuia === null) return rechazar(CODIGO_INVALIDO);
    const orden = ordenPorGuia(porGestionar, conAyuda, numGuia);
    if (orden === null) return rechazar(avisoGuiaFueraDeReparto(numGuia));
    // Feature 261 (R12, R15): la reservada para otro día no se gestiona hoy; se dice por qué.
    if (orden.esParaManana) return rechazar(avisoReservaParaOtroDia(orden.fechaRepartoISO));
    cerrar();
    onOrdenEncontrada(orden);
    return { tipo: "acierto" };
  }

  return (
    <EscanerModal label={ESCANER_LABEL_GUIA}>
      {(cerrar) => (
        <EscanerGuiaCard
          titulo={TITULO}
          descripcion={DESCRIPCION}
          icono={ScanLine}
          onDecoded={(texto) => procesar(texto, cerrar)}
          mensajeErrorCamara="No se pudo abrir la cámara."
          manual={{ onSubmit: (texto) => procesar(texto, cerrar), submitLabel: BOTON }}
        />
      )}
    </EscanerModal>
  );
}
