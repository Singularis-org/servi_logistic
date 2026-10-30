import { ROL_LABELS } from "@/lib/auth/rol-label";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";
import { lineasDeCambioDelPlan, SIN_LIMITE, textoDelPrecio, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import type {
  CambioPendienteVista,
  EstadoFila,
  FilaConsumo,
  PlanConConsumo,
  ReinicioDelCiclo,
  UsoDelPlan,
} from "@/lib/types/consumo-plan";
import { ROLES_CON_TOPE, type PlanDTO, type TopesPlan, type VersionPlan } from "@/lib/types/planes";
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

/** Un cambio programado leído de la base: el instante en que rige y la versión ya validada. */
export interface CambioDelPlanLeido {
  vigenteDesde: Date;
  version: VersionPlan;
}

/** Lo que hace falta para pintar un plan con su consumo (R1–R7, R19). */
export interface PlanConUsoLeido {
  vigente: VersionPlan;
  /** El ancla del ciclo de órdenes. */
  ancla: Date;
  /**
   * SLT-58 (§11.3, R34): el inicio del ciclo corto (`plan_ciclo_corto_desde_at`), `null` fuera de él.
   * Opcional: el reinicio ya sale bien del ancla sola (`inicioDelSiguienteCiclo`), así que el armado de
   * la pantalla no lo usa; lo llevan las lecturas para no perder el dato.
   */
  cortoDesde?: Date | null;
  uso: UsoDelPlan;
  cambio: CambioDelPlanLeido | null;
}

/**
 * `diferenciasDelPlan` compara `PlanDTO` enteros y `plan_de_la_empresa` no devuelve id, visibilidad,
 * empresa ni archivado: las dos versiones llevan este mismo relleno fijo, así que nunca salen como cambio.
 */
function comoPlanDTO(version: VersionPlan): PlanDTO {
  return { id: "", visibilidad: "publico", organizacionId: null, archivado: false, ...version };
}

/** R7, R16, R19: la fecha (hora de la plataforma) y las mismas líneas de «qué cambia» que el correo de SL-24. */
export function cambioPendienteDelPlan(vigente: VersionPlan, cambio: CambioDelPlanLeido): CambioPendienteVista {
  const antes = comoPlanDTO(vigente);
  const diferencias = diferenciasDelPlan(antes, { ...antes, ...cambio.version });
  return {
    vigenteDesde: fechaCalendarioCR(cambio.vigenteDesde),
    // Mismo molde que el job del correo: `diferenciasDelPlan` deja `{ antes, despues }` como `unknown`.
    lineas: lineasDeCambioDelPlan(diferencias as CambioDelPlanParaCorreo),
  };
}

/** R1–R7, R19: el plan como se pinta, el mismo en «Mi plan» y en el detalle de empresa del superadmin. */
export function planConConsumo(leido: PlanConUsoLeido, ahora: Date): PlanConConsumo {
  const { vigente } = leido;
  return {
    nombre: vigente.nombre,
    precioTexto: textoDelPrecio(vigente.precio),
    modulos: ORDEN_MODULOS.filter((m) => vigente.modulos.includes(m)).map((clave) => ({
      clave,
      nombre: nombreDelModulo(clave),
    })),
    filas: filasDeConsumo(vigente.topes, leido.uso),
    reinicio: reinicioDelCiclo(leido.ancla, ahora),
    cambioPendiente: leido.cambio === null ? null : cambioPendienteDelPlan(vigente, leido.cambio),
  };
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
