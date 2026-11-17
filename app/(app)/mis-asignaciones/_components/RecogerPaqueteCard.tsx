"use client";

import { PackageCheck } from "lucide-react";

import {
  ESCANER_LABEL_GUIA,
  EscanerModal,
} from "@/components/shared/EscanerModal";
import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { TEXTOS_RECOGIDA } from "@/lib/utils/sesion-escaneo";

import { useRecogerPorGuia } from "./useRecogerPorGuia";

// Feature 96 — la recogida del mensajero, en UN solo control: los DOS caminos que antes
// eran dos secciones sueltas (`EscanerRecoger` + `InputRecoger`) viven ahora en la misma
// tarjeta, cada uno a un lado del separador. La logica no cambia: ambos resuelven el
// num_guia contra `porRecoger` (restriccion "asignada a mi") y aceptan con la MISMA
// action via `useRecogerPorGuia`, directo al confirmar (sin modal).
//
// SLT-157: los dos caminos leen con la MISMA `leerGuia`: la camara puede leer el QR (URL
// del paquete) o el CODE128 (digitos), y la pistola teclea cualquiera de los dos. Lo que
// no es guia se rechaza con mensaje por los dos caminos.
//
// SLT-168 «Escaneo continuo en las recogidas del mensajero» (R595, R833): el diálogo es la
// sesión continua de SLT-159. La lectura (`leerGuia`) la hace la sesión, cada guía es una fila
// con su desenlace y la cámara sigue abierta entre lecturas. Desaparece la línea «Guía {n}
// recogida correctamente.»: la lista la sustituye (Carlos, 2026-11-17).

export interface RecogerPaqueteCardProps {
  /** Órdenes en `por_recoger`: resuelven numGuia -> id. */
  porRecoger: MiAsignacionDTO[];
  /**
   * R598: se invoca UNA vez al cerrar el diálogo si hubo al menos una recogida (el módulo lo
   * conecta a router.refresh()). Nunca por lectura.
   */
  onRecogida: () => void;
}

export function RecogerPaqueteCard({
  porRecoger,
  onRecogida,
}: Readonly<RecogerPaqueteCardProps>) {
  const { recoger } = useRecogerPorGuia(porRecoger);

  return (
    /* 2026-07-31 (decisión del humano): la tarjeta vive TRAS su disparador, como en el resto
       de la app — desde el 2026-08-10, en modal. Sin él, `QrScanner` quedaba montado todo el
       tiempo que el mensajero tuviera abierta la pantalla — o sea, la cámara encendida en la
       calle. La sesión vive con el diálogo: cerrarlo la descarta (R591) y refresca una vez.
       El label NO es el de por defecto: SLT-156 (R500) es el disparador único de las pantallas
       del mensajero, de 44 px y a todo el ancho; la tarjeta de dentro conserva «Recoger paquete». */
    <EscanerModal label={ESCANER_LABEL_GUIA} tactil>
      <TarjetaEscaneoContinuo
        recibir={recoger}
        alCerrarConRecepcion={onRecogida}
        textos={TEXTOS_RECOGIDA}
        icono={PackageCheck}
        ariaLabel="Recoger por número de guía o escaneo"
        titulo="Recoger paquete"
        descripcion="Escanea o ingresa el número de guía"
        submitLabel="Recoger"
      />
    </EscanerModal>
  );
}
