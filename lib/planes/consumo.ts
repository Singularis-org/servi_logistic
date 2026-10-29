import { ROL_LABELS } from "@/lib/auth/rol-label";
import { inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";
import { SIN_LIMITE } from "@/lib/planes/mensajes";
import type { EstadoFila, FilaConsumo, ReinicioDelCiclo, UsoDelPlan } from "@/lib/types/consumo-plan";
import { ROLES_CON_TOPE, type TopesPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// SLT-58 (design §6.1) — el consumo del plan tal como se pinta, sin React ni base: lo comparten «Mi
// plan» y el detalle de empresa del superadmin, así que las dos muestran las mismas filas y marcas.

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * R3, R4. En enteros (`usados * 100 >= maximo * 80`) para que 79 de 99 no cuente como «cerca» por
 * redondeo. Un tope 0 está lleno desde el primer momento.
 */
export function estadoDeLaFila(usados: number, maximo: number | null): EstadoFila {
  if (maximo === null) return "sin_limite";
  if (usados >= maximo) return "lleno";
  if (usados * 100 >= maximo * 80) return "cerca";
  return "normal";
}

/**
 * Miles con punto («1.000»). Sin `Intl`: el locale de la plataforma agrupa con espacio fino, y el de
 * cada navegador podría pintar otra cosa en el cliente que en el servidor (feature 201).
 */
export function formatearConteo(n: number): string {
  const entero = Math.trunc(n);
  const digitos = String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return entero < 0 ? `-${digitos}` : digitos;
}

function fila(clave: FilaConsumo["clave"], etiqueta: string, usados: number, maximo: number | null): FilaConsumo {
  const texto =
    maximo === null
      ? `${formatearConteo(usados)} ${etiqueta} · ${SIN_LIMITE}`
      : `${formatearConteo(usados)} de ${formatearConteo(maximo)} ${etiqueta}`;
  return { clave, etiqueta, usados, maximo, estado: estadoDeLaFila(usados, maximo), texto };
}

/** R2, R3: órdenes, un rol por cada uno de `ROLES_CON_TOPE` (en ese orden) y API keys. */
export function filasDeConsumo(topes: TopesPlan, uso: UsoDelPlan): FilaConsumo[] {
  return [
    fila("ordenes", "órdenes del ciclo", uso.ordenes, topes.ordenesPorCiclo),
    ...ROLES_CON_TOPE.map((rol) => fila(rol, ROL_LABELS[rol], uso.porRol[rol], topes.porRol[rol] ?? null)),
    fila("api_keys", "API keys", uso.apiKeys, topes.apiKeys),
  ];
}

/**
 * R5: días hasta el inicio del ciclo siguiente, redondeando la fracción hacia arriba y nunca menos de
 * 1 (en la frontera exacta ya empezó un ciclo nuevo y faltan los días de ese). El ciclo se cuenta en
 * UTC como en la base; solo la fecha visible pasa a la hora de la plataforma.
 */
export function reinicioDelCiclo(ancla: Date, ahora: Date): ReinicioDelCiclo {
  const siguiente = inicioDelSiguienteCiclo(ancla, ahora);
  const dias = Math.max(1, Math.ceil((siguiente.getTime() - ahora.getTime()) / UN_DIA_MS));
  return { dias, fecha: fechaCalendarioCR(siguiente) };
}
