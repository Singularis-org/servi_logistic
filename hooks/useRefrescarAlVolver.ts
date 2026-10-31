"use client";

import { useEffect, useRef } from "react";

// SLT-69 (hotfix 2026-10-30, R6-R8) — releer los datos de una pantalla cuando el usuario VUELVE a
// ella: la pestaña vuelve a estar visible o la ventana recupera el foco. En el teléfono del
// mensajero la pantalla se queda abierta horas; sin esto la lista era la de cuando se abrió.
//
// No es polling (descartado en el spec): solo reacciona al regreso, y con un intervalo mínimo
// entre relecturas, porque un mismo regreso suele disparar `visibilitychange` Y `focus` (y en
// móvil el diálogo de permiso de cámara también provoca `blur`/`focus`).
//
// Qué se relee lo decide el llamador (`alVolver`, p. ej. `router.refresh()`): el hook solo dice
// CUÁNDO.

/** Intervalo mínimo por defecto entre dos relecturas por volver a la pantalla (SLT-69/P2). */
export const INTERVALO_MINIMO_REFRESCO_MS = 30_000;

export interface OpcionesRefrescarAlVolver {
  /** No se vuelve a llamar a `alVolver` antes de que pase este tiempo desde la última vez. */
  intervaloMinimoMs?: number;
}

export function useRefrescarAlVolver(
  alVolver: () => void,
  { intervaloMinimoMs = INTERVALO_MINIMO_REFRESCO_MS }: OpcionesRefrescarAlVolver = {},
): void {
  // El callback va en una ref para no re-suscribir los listeners en cada render.
  const alVolverRef = useRef(alVolver);
  useEffect(() => {
    alVolverRef.current = alVolver;
  }, [alVolver]);

  useEffect(() => {
    // La marca arranca en el montaje: la página acaba de leer del servidor, así que un `focus`
    // inmediato no relee.
    let ultima = Date.now();

    const manejar = () => {
      // R8: un evento que deja la pantalla oculta no relee.
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      // R7: dentro del intervalo mínimo no se relee otra vez.
      if (ahora - ultima < intervaloMinimoMs) return;
      ultima = ahora;
      alVolverRef.current();
    };

    document.addEventListener("visibilitychange", manejar);
    window.addEventListener("focus", manejar);
    // R8: tras desmontar no reacciona a nada.
    return () => {
      document.removeEventListener("visibilitychange", manejar);
      window.removeEventListener("focus", manejar);
    };
  }, [intervaloMinimoMs]);
}
