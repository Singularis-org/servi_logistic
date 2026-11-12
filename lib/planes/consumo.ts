import { ROL_LABELS } from "@/lib/auth/rol-label";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { finDelPeriodoCalendario } from "@/lib/planes/ciclo";
import { cobroDelPlan } from "@/lib/planes/cobro";
import { costeoDelCiclo } from "@/lib/planes/costeo";
import { lineasDeCambioDelPlan, SIN_LIMITE, textoDelPrecio, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import type {
  CambioPendienteVista,
  CobroDelCiclo,
  CostoVigente,
  EstadoFila,
  FilaConsumo,
  PendienteDeEmpresa,
  PlanConConsumo,
  ReinicioDelCiclo,
  UsoDelPlan,
} from "@/lib/types/consumo-plan";
import {
  ROLES_CON_TOPE,
  type PendienteDelDetalle,
  type PlanDTO,
  type PrecioPlan,
  type TipoCobro,
  type TopesPlan,
  type VersionPlan,
} from "@/lib/types/planes";
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

/**
 * R2, R3: un rol por cada uno de `ROLES_CON_TOPE` (en ese orden) y API keys. SLT-86 (R8): sin fila de
 * órdenes, que ya no tienen tope; su conteo va aparte (`ordenesDelPeriodo`).
 */
export function filasDeConsumo(topes: TopesPlan, uso: UsoDelPlan): FilaConsumo[] {
  return [
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
  /**
   * SLT-86 (R5): la entrada de la empresa (`organizacion.plan_ciclo_ancla_at`), siempre las 00:00 de un
   * día y nunca futura. Recorta el primer período de calendario a un tramo.
   */
  entrada: Date;
  /**
   * SLT-86 (R15): el precio vigente al EMPEZAR el período en curso (`precio_del_periodo` de
   * `plan_de_la_empresa`, la fila del historial de precio). Puede no ser `vigente.precio`: una edición
   * de precio rige desde el primer período que empiece en su fecha o después.
   */
  precioDelPeriodo: PrecioPlan;
  /** SLT-86 (R26, R27): el cambio pendiente de la empresa, sin el actor (R32). */
  pendiente: PendienteDeEmpresa | null;
  /** SLT-86 (R7): `ordenes` son las vivas desde el inicio del período en curso. */
  uso: UsoDelPlan;
  cambio: CambioDelPlanLeido | null;
  /** SLT-66 (R18, §3.2): el de `cobro_plataforma_tarifa_de`, el mismo que usará el próximo cargo. SLT-83: fijo o porcentual. */
  costoVigente: CostoVigente;
  /** SLT-83 (R24): el de `plan_cobro_del_ciclo`; SLT-86 (R28): con el inicio del período en curso. */
  cobroCiclo: CobroDelCiclo;
  /** Ajuste planes-custom (D6): `organizacion.plan_tipo_cobro`. */
  tipoCobro: TipoCobro;
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

/**
 * SLT-128 (design §7; R11): el cambio programado del detalle del plan, con lo mismo que `cambioPendienteDelPlan`
 * y el conteo de recepciones que pinta «N de M empresas ya lo recibieron».
 */
export function pendienteDelDetalle(
  vigente: VersionPlan,
  cambio: CambioDelPlanLeido & { recibidas: number; total: number },
): PendienteDelDetalle {
  return { ...cambioPendienteDelPlan(vigente, cambio), recibidas: cambio.recibidas, total: cambio.total };
}

/** R1–R7, R19: el plan como se pinta, el mismo en «Mi plan» y en el detalle de empresa del superadmin. */
export function planConConsumo(leido: PlanConUsoLeido, ahora: Date): PlanConConsumo {
  const { vigente } = leido;
  // D7–D9, SLT-86 (R12, R15, R27): el período en curso con el precio de cuando empezó.
  const cobro = cobroDelPlan(leido.precioDelPeriodo, leido.tipoCobro, leido.entrada, ahora, leido.pendiente);
  return {
    nombre: vigente.nombre,
    // SLT-99 (R8): la entrada ya leída para el tramo, en la fecha de la plataforma.
    activoDesde: fechaCalendarioCR(leido.entrada),
    precioTexto: textoDelPrecio(vigente.precio),
    modulos: ORDEN_MODULOS.filter((m) => vigente.modulos.includes(m)).map((clave) => ({
      clave,
      nombre: nombreDelModulo(clave),
    })),
    filas: filasDeConsumo(vigente.topes, leido.uso),
    ordenesDelPeriodo: leido.uso.ordenes,
    reinicio: reinicioDelCiclo(leido.tipoCobro, ahora),
    cambioPendiente: leido.cambio === null ? null : cambioPendienteDelPlan(vigente, leido.cambio),
    // SLT-66 (R18, R19), SLT-86 (R7, R28): la base es el costo del período en curso o de su tramo, y
    // las órdenes del total son las mismas que se muestran como órdenes del período.
    costeo: costeoDelCiclo(vigente, cobro.costo, leido.costoVigente, leido.uso.ordenes, leido.cobroCiclo),
    cobro,
  };
}

/**
 * R5 de SLT-58, SLT-86 (R27): días hasta el inicio del siguiente período de calendario, redondeando la
 * fracción hacia arriba y nunca menos de 1 (en la frontera exacta ya empezó un período nuevo y faltan
 * los días de ese). El fin no depende de la entrada: el tramo solo recorta el inicio.
 */
export function reinicioDelCiclo(tipo: TipoCobro, ahora: Date): ReinicioDelCiclo {
  const siguiente = finDelPeriodoCalendario(tipo, ahora);
  const dias = Math.max(1, Math.ceil((siguiente.getTime() - ahora.getTime()) / UN_DIA_MS));
  return { dias, fecha: fechaCalendarioCR(siguiente) };
}
