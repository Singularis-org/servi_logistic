"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultadoLectura } from "@/hooks/useEntradaEscaneo";
import {
  SESION_VACIA,
  contadores as contar,
  reducirSesion,
  type AccionSesion,
  type ContadoresSesion,
  type DesenlaceRecepcion,
  type FilaLectura,
} from "@/lib/utils/sesion-escaneo";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la sesión de un escaneo continuo
// sobre la entrada de SLT-158: `registrar` (su `alLlegar`) crea la fila al llegar y `procesar`
// (su `procesar`, que la cola llama de una en una y en orden) resuelve esa misma fila.
//
// Las filas pendientes van en una cola FIFO de ids alineada con la de SLT-158: cada lectura
// pasa una vez por `alLlegar` y una vez por `procesar`, en el mismo orden. Las llamadas a la
// acción (las de la cola y los «Reintentar») pasan por UNA cadena de promesas: nunca hay dos
// en vuelo (R587).

/** Motivo de la fila si la acción lanza en vez de responder (p. ej., sin red). */
const MOTIVO_FALLO = "No se pudo procesar la lectura. Intenta de nuevo.";

export interface OpcionesSesionEscaneo {
  /** R592: se llama UNA vez al desmontar si hubo al menos una recibida o ya recibida. */
  alCerrarConRecepcion?: () => void;
}

export interface UseSesionEscaneo {
  filas: readonly FilaLectura[];
  contadores: ContadoresSesion;
  /** `alLlegar` de `useEntradaEscaneo`: crea la fila (R581, R584, R585). */
  registrar: (texto: string) => void;
  /** `procesar` de `useEntradaEscaneo`: resuelve la fila pendiente más antigua. */
  procesar: (texto: string) => Promise<ResultadoLectura>;
  /** R583: la misma fila vuelve a «Recibiendo…» y su guía entra en la cadena. */
  reintentar: (filaId: number) => void;
}

export function useSesionEscaneo(
  recibir: (numGuia: number) => Promise<DesenlaceRecepcion>,
  opciones: OpcionesSesionEscaneo = {},
): UseSesionEscaneo {
  // La sesión vive en una ref (la verdad, para clasificar lecturas que llegan en el mismo tick)
  // y se copia a estado para pintar.
  const sesionRef = useRef(SESION_VACIA);
  const [sesion, setSesion] = useState(SESION_VACIA);
  const pendientes = useRef<number[]>([]);
  const cadena = useRef<Promise<unknown>>(Promise.resolve());
  const huboRecepcion = useRef(false);

  const actual = useRef({ recibir, alCerrarConRecepcion: opciones.alCerrarConRecepcion });
  useEffect(() => {
    actual.current = { recibir, alCerrarConRecepcion: opciones.alCerrarConRecepcion };
  });

  // R592: el refresco del listado, una sola vez y al cerrar. En StrictMode el doble montaje
  // de desarrollo ocurre con la sesión vacía, así que no dispara.
  useEffect(
    () => () => {
      if (huboRecepcion.current) actual.current.alCerrarConRecepcion?.();
    },
    [],
  );

  const aplicar = useCallback((accion: AccionSesion) => {
    sesionRef.current = reducirSesion(sesionRef.current, accion);
    setSesion(sesionRef.current);
  }, []);

  /** Envía una guía por la cadena única y pone el desenlace en SU fila (R587). */
  const enviar = useCallback(
    (filaId: number, numGuia: number): Promise<DesenlaceRecepcion> => {
      const llamada = cadena.current.then(() => actual.current.recibir(numGuia));
      cadena.current = llamada.catch(() => undefined);
      return llamada
        .catch((): DesenlaceRecepcion => ({ tipo: "no_se_pudo", motivo: MOTIVO_FALLO }))
        .then((desenlace) => {
          if (desenlace.tipo === "recibida" || desenlace.tipo === "ya_recibida") {
            huboRecepcion.current = true;
          }
          aplicar({ tipo: "resolver", id: filaId, desenlace });
          return desenlace;
        });
    },
    [aplicar],
  );

  const registrar = useCallback(
    (texto: string) => {
      aplicar({ tipo: "llegar", texto, hora: new Date() });
      pendientes.current.push(sesionRef.current.filas[0].id);
    },
    [aplicar],
  );

  const procesar = useCallback(
    async (): Promise<ResultadoLectura> => {
      const id = pendientes.current.shift();
      const fila = sesionRef.current.filas.find((f) => f.id === id);
      if (!fila) return { tipo: "error", motivo: MOTIVO_FALLO };
      if (fila.estado.tipo === "codigo_invalido" || fila.numGuia === null) {
        return { tipo: "error", motivo: "Código inválido." };
      }
      if (fila.estado.tipo === "repetida_en_sesion") return { tipo: "acierto" };
      const desenlace = await enviar(fila.id, fila.numGuia);
      return desenlace.tipo === "recibida" || desenlace.tipo === "ya_recibida"
        ? { tipo: "acierto" }
        : {
            tipo: "error",
            motivo: desenlace.tipo === "no_se_pudo" ? desenlace.motivo : "Orden no encontrada.",
          };
    },
    [enviar],
  );

  const reintentar = useCallback(
    (filaId: number) => {
      const fila = sesionRef.current.filas.find((f) => f.id === filaId);
      if (!fila || fila.estado.tipo !== "no_se_pudo" || fila.numGuia === null) return;
      aplicar({ tipo: "reintentar", id: filaId });
      void enviar(filaId, fila.numGuia);
    },
    [aplicar, enviar],
  );

  return {
    filas: sesion.filas,
    contadores: contar(sesion.filas),
    registrar,
    procesar,
    reintentar,
  };
}
