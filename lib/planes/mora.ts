// SLT-121 (design §3.2; R1, R6, R8, R24) — la gemela TS de la mora: el plazo de pago de una factura de la
// plataforma, cuándo está vencida, la franja de madrugada y el estado que pinta el banner. Pura, sin E/S.
//
// La autoridad es la base (`factura_plataforma_mora`, `organizacion_mora_congelar`). Esta copia sirve para los
// textos, los correos y los consumidores de §9 (SLT-230 lee `venceEn(fechaLimiteDePago(…))`, SLT-231
// `estaVencida`). Para que no se separen, las dos pasan la misma tabla de casos
// (`tests/integration/db/_fixtures/fecha-limite-pago.ts`).
//
// La hora es la de la plataforma, por `lib/planes/ciclo.ts` (excepción de país a cargo de SLT-90): este archivo
// no escribe la zona, así que no necesita su propia excepción. Cuando SLT-90 lleve el ciclo a la zona de cada
// empresa, esto cambia con él.

import { aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { fechaCalendarioPlataforma, horaDeParedPlataforma, inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { sumarDiasCalendario } from "@/lib/utils/calendario-zona";

export const GRACIA_MIN = 1;
export const GRACIA_MAX = 60;
export const MOTIVO_MAX = 200;
export const HASTA_MAX_DIAS = 60;
/** [00:00, 06:00) de la plataforma: la única franja en que se congela (R8). */
export const FRANJA_MADRUGADA = { desde: 0, hasta: 6 } as const;

/** Una fila de `factura_plataforma_mora`: factura cerrada con saldo > 0. */
export interface FilaMora {
  facturaId: string;
  numero: number;
  hastaAt: Date;
  /** Importe en texto, con dos decimales. */
  saldo: string;
  /** `AAAA-MM-DD`, calendario de la plataforma. */
  fechaLimite: string;
  venceAt: Date;
  vencida: boolean;
}

export interface FacturaVencida {
  facturaId: string;
  numero: number;
  fechaLimite: string;
  saldo: string;
}

/** Las columnas de la mora de `organizacion`. */
export interface OrganizacionMora {
  congeladaAt: Date | null;
  /** `AAAA-MM-DD` o `null`. */
  descongeladaHasta: string | null;
}

export type EstadoMora =
  | { estado: "al_dia" }
  | { estado: "en_plazo"; fechaLimite: string }
  | { estado: "vencida"; facturas: FacturaVencida[]; saldoVencido: string }
  | { estado: "congelada"; desde: Date; facturas: FacturaVencida[]; saldoVencido: string }
  // SLT-255 (R11): reemplaza al `descongelada_a_mano` de SLT-121. El plazo es el mismo, venga de un
  // descongelamiento a mano o de una prórroga: la base no los distingue (design §1.1).
  | { estado: "con_plazo"; hasta: string };

/** R1: el día de emisión (el de la plataforma en que empieza `hasta`) más la gracia, en días corridos. */
export function fechaLimiteDePago(hasta: Date, gracia: number): string {
  return sumarDiasCalendario(fechaCalendarioPlataforma(hasta), gracia);
}

/** Las 00:00 de la plataforma del día siguiente a la fecha límite, en UTC: desde ahí está vencida (R6). */
export function venceEn(fechaLimite: string): Date {
  return inicioDelDiaPlataforma(sumarDiasCalendario(fechaLimite, 1));
}

/** R6: saldo mayor que 0 y ya empezó el día siguiente a la fecha límite. */
export function estaVencida(f: { saldo: string; fechaLimite: string }, ahora: Date): boolean {
  return aCentimosConSigno(f.saldo) > BigInt(0) && ahora.getTime() >= venceEn(f.fechaLimite).getTime();
}

/** R8: de 00:00 a 05:59 de la plataforma. */
export function enFranjaDeMadrugada(ahora: Date): boolean {
  const hora = Number.parseInt(horaDeParedPlataforma(ahora).slice(0, 2), 10);
  return hora >= FRANJA_MADRUGADA.desde && hora < FRANJA_MADRUGADA.hasta;
}

function vencidas(facturas: readonly FilaMora[], ahora: Date): FacturaVencida[] {
  return facturas
    .filter((f) => estaVencida(f, ahora))
    .map((f) => ({ facturaId: f.facturaId, numero: f.numero, fechaLimite: f.fechaLimite, saldo: f.saldo }));
}

function sumaDeSaldos(facturas: readonly FacturaVencida[]): string {
  return aTexto(facturas.reduce((total, f) => total + aCentimosConSigno(f.saldo), BigInt(0)));
}

/**
 * SLT-255 R1: el plazo vigente (`AAAA-MM-DD`) o `null`. Vale hasta las 23:59:59 de su día en la hora de la
 * plataforma, como lo mira `organizacion_mora_congelar`. Una congelada no tiene plazo vigente (design §1.1).
 */
export function plazoVigente(o: OrganizacionMora, ahora: Date): string | null {
  if (o.congeladaAt !== null || o.descongeladaHasta === null) return null;
  return o.descongeladaHasta >= fechaCalendarioPlataforma(ahora) ? o.descongeladaHasta : null;
}

/**
 * SLT-121 R24, R32 y SLT-255 R11, R12: el estado que ven el banner y el superadmin. Congelada manda. Después, el
 * plazo vigente, si alguna factura con saldo vence dentro de él (una vencida siempre cumple). Si no, vencida, en
 * plazo con la fecha límite más próxima, o al día.
 */
export function estadoDeMora(o: OrganizacionMora, facturas: readonly FilaMora[], ahora: Date): EstadoMora {
  const lasVencidas = vencidas(facturas, ahora);
  if (o.congeladaAt !== null) {
    return { estado: "congelada", desde: o.congeladaAt, facturas: lasVencidas, saldoVencido: sumaDeSaldos(lasVencidas) };
  }
  const conSaldo = facturas.filter((f) => aCentimosConSigno(f.saldo) > BigInt(0));
  const plazo = plazoVigente(o, ahora);
  if (plazo !== null && conSaldo.some((f) => f.fechaLimite <= plazo)) {
    return { estado: "con_plazo", hasta: plazo };
  }
  if (lasVencidas.length > 0) {
    return { estado: "vencida", facturas: lasVencidas, saldoVencido: sumaDeSaldos(lasVencidas) };
  }
  if (conSaldo.length > 0) {
    const fechaLimite = conSaldo.map((f) => f.fechaLimite).sort()[0];
    return { estado: "en_plazo", fechaLimite };
  }
  return { estado: "al_dia" };
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sin pasar por `Date`. */
export function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export const MENSAJE_EMPRESA_CONGELADA = "Empresa suspendida por falta de pago.";

export const MORA_TEXTOS = {
  banner: {
    enPlazo: (fechaLimite: string) =>
      `Tienes una factura de la plataforma por pagar. Fecha límite: ${fechaLegible(fechaLimite)}.`,
    vencida: "Tienes facturas vencidas. Si no se pagan, la operación se congela esta madrugada.",
    congelada:
      "Empresa congelada por falta de pago. Puedes ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet.",
    conPlazo: (hasta: string) =>
      `Tienes prórroga de pago hasta el ${fechaLegible(hasta)}. Si no pagas, la operación se congela la madrugada siguiente.`,
    verFacturas: "Ver facturas",
  },
  // La sección de la ficha de la empresa en plataforma (design §7.2). La clave no es `superadmin`: ese literal solo
  // vive en los archivos de `superadmin-fuera-de-empresa.guardia`.
  plataforma: {
    titulo: "Plazo de pago y mora",
    sinCargar: "No se pudo cargar la mora",
    graciaPropia: (dias: number) => `${dias} días (propia)`,
    graciaGlobal: (dias: number) => `${dias} días (global)`,
    estado: {
      al_dia: "Al día",
      en_plazo: "En plazo",
      vencida: "Vencida",
      congelada: "Congelada",
      con_plazo: "Con prórroga",
    } satisfies Record<EstadoMora["estado"], string>,
    // Los rechazos de `MoraEmpresaService` (design §5.3), por campo; la pantalla los pinta bajo el suyo.
    errores: {
      dias: `La gracia debe ser un número entero de ${GRACIA_MIN} a ${GRACIA_MAX} días.`,
      motivo: `El motivo es obligatorio y tiene como máximo ${MOTIVO_MAX} caracteres.`,
      hasta: `La fecha hasta debe estar entre hoy y dentro de ${HASTA_MAX_DIAS} días.`,
      sinPlazo: "La empresa no tiene una prórroga vigente.",
      noEncontrada: "La empresa no existe.",
      sinPermiso: "No tienes permiso para cambiar la mora de una empresa.",
    },
  },
  error: MENSAJE_EMPRESA_CONGELADA,
} as const;
