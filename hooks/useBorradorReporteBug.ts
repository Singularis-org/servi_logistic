"use client";

import { useCallback, useSyncExternalStore } from "react";

// SLT-87 (design §8.3; R6, R7, R8) — el borrador del reporte de problemas, en el almacenamiento local.
//
// Una clave por usuario (R7): otra cuenta que entre en el mismo navegador lee su propia clave y no ve
// el borrador ajeno. Solo se guarda el texto, nunca el contexto.
//
// Se lee con `useSyncExternalStore` y no con `useState` + efecto: el design pide no leer en el primer
// render (el servidor no tiene `localStorage` y rompería la hidratación), y un `setState` dentro de un
// efecto es error en este repo (`react-hooks/set-state-in-effect`). La instantánea del servidor es el
// texto vacío, que es lo que pinta el panel antes de hidratar. Mismo precedente:
// `hooks/usePreferenciaSonido.ts`.

const PREFIJO_CLAVE = "servi:reporte-bug:borrador:";

/** Evento propio: `storage` no se dispara en la pestaña que escribió. */
const EVENTO_CAMBIO = "servi-logistic:reporte-bug-borrador-cambio";

/**
 * Copia en memoria para cuando `localStorage` no está (Safari privado, cuota llena): el panel sigue
 * funcionando mientras dure la carga, aunque el borrador no sobreviva a recargar.
 */
const enMemoria = new Map<string, string>();

export function claveBorradorReporteBug(usuarioId: string): string {
  return `${PREFIJO_CLAVE}${usuarioId}`;
}

function leer(clave: string): string {
  const copia = enMemoria.get(clave);
  if (copia !== undefined) return copia;
  try {
    return window.localStorage.getItem(clave) ?? "";
  } catch {
    // Fallo manejado: sin almacenamiento no hay borrador guardado que leer. No va al log, porque sería
    // ruido en el navegador de cada usuario con el modo privado puesto.
    return "";
  }
}

function escribir(clave: string, texto: string): void {
  try {
    if (texto === "") window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, texto);
    enMemoria.delete(clave);
  } catch {
    // Fallo manejado: el texto queda en la copia en memoria, que `leer` mira antes que el almacenamiento.
    enMemoria.set(clave, texto);
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_CAMBIO, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

function instantaneaServidor(): string {
  return "";
}

export interface UseBorradorReporteBugResult {
  texto: string;
  /** Guarda en cada cambio; un texto vacío borra la clave. */
  cambiar: (texto: string) => void;
  /** Borra el borrador: lo llaman «Descartar» (R8) y el envío bueno (R9). */
  limpiar: () => void;
}

export function useBorradorReporteBug(usuarioId: string): UseBorradorReporteBugResult {
  const clave = claveBorradorReporteBug(usuarioId);
  const texto = useSyncExternalStore(suscribir, () => leer(clave), instantaneaServidor);
  const cambiar = useCallback((siguiente: string) => escribir(clave, siguiente), [clave]);
  const limpiar = useCallback(() => escribir(clave, ""), [clave]);
  return { texto, cambiar, limpiar };
}
