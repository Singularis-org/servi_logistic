"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (R497-R499) — los botones flotantes
 * («Reportar un problema» y el chat) se achican a 44 px al bajar por la página y vuelven a su
 * tamaño al subir o al llegar arriba, para no tapar la lista en el teléfono.
 */

/** Píxeles que hay que desplazarse desde el último cambio para que el estado cambie. */
export const UMBRAL_FLOTANTE_PX = 8;

/**
 * El siguiente estado, puro. `yAnterior` es la posición de referencia (la del último cambio, o el
 * punto más lejano alcanzado en la dirección del estado vigente); `yActual`, la de ahora.
 *
 * - arriba del todo (`yActual <= 0`) → `false`, siempre;
 * - bajar MÁS de `UMBRAL_FLOTANTE_PX` → `true`;
 * - subir MÁS de `UMBRAL_FLOTANTE_PX` → `false`;
 * - lo demás no cambia el estado (un temblor del dedo no hace parpadear el botón).
 */
export function siguienteCompacto(previo: boolean, yAnterior: number, yActual: number): boolean {
  if (yActual <= 0) return false;
  const delta = yActual - yAnterior;
  if (delta > UMBRAL_FLOTANTE_PX) return true;
  if (delta < -UMBRAL_FLOTANTE_PX) return false;
  return previo;
}

/**
 * `true` mientras el flotante deba ir reducido. Escucha el `scroll` de `window` (pasivo) y calcula
 * una vez por fotograma. En el servidor y en el primer render vale `false` (el tamaño de hoy).
 */
export function useFlotanteCompacto(): boolean {
  const [compacto, setCompacto] = useState(false);
  const compactoRef = useRef(false);
  const referenciaRef = useRef(0);

  useEffect(() => {
    referenciaRef.current = window.scrollY;
    let marco: number | null = null;
    let pendiente = false;

    function medir() {
      pendiente = false;
      const y = window.scrollY;
      const previo = compactoRef.current;
      const siguiente = siguienteCompacto(previo, referenciaRef.current, y);
      if (siguiente !== previo) {
        referenciaRef.current = y;
        compactoRef.current = siguiente;
        setCompacto(siguiente);
        return;
      }
      // Sin cambio: la referencia sigue al punto más lejano en la dirección del estado, así el
      // cambio contrario siempre se mide desde donde el usuario dio la vuelta.
      referenciaRef.current = previo ? Math.max(referenciaRef.current, y) : Math.min(referenciaRef.current, y);
    }

    function alDesplazar() {
      if (pendiente) return;
      pendiente = true;
      marco = window.requestAnimationFrame(medir);
    }

    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      window.removeEventListener("scroll", alDesplazar);
      if (pendiente && marco !== null) window.cancelAnimationFrame(marco);
    };
  }, []);

  return compacto;
}

/**
 * La distancia al borde inferior de un flotante: la de hoy más el alto de la barra fija inferior
 * de la pantalla, si la hay (`--alto-barra-inferior`, `design.md §6`). Sin barra, la de hoy.
 */
export const BOTTOM_FLOTANTE_ESQUINA = "bottom-[calc(1.25rem+var(--alto-barra-inferior,0px))]";
export const BOTTOM_FLOTANTE_SOBRE_CHAT = "bottom-[calc(6rem+var(--alto-barra-inferior,0px))]";
