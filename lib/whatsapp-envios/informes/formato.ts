// Ficha 474 — fecha y hora de PARED tal como las leen los informes («05/10/2026», «05:00»). Sin
// aritmetica horaria propia: se delega en `calendario-zona`. SLT-42 (R22): `zona` es la del pais
// de la empresa del envio (la pone `EjecucionEnvioService` en el contexto del informe).
import { fechaCalendario, horaDePared } from "@/lib/utils/calendario-zona";

/** `DD/MM/YYYY` del dia calendario de `zona` en `instante`. */
export function fechaLegibleEnZona(instante: Date, zona: string): string {
  const [anio, mes, dia] = fechaCalendario(instante, zona).split("-");
  return `${dia}/${mes}/${anio}`;
}

/** `HH:mm` de pared de `zona` en `instante`. */
export function horaLegibleEnZona(instante: Date, zona: string): string {
  return horaDePared(instante, zona);
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * «Lunes 5 de octubre de 2026», del dia calendario de `zona`. Tablas fijas, sin `Intl`
 * (determinista). Nacio en el PDF de transito (475); la 476 la comparte.
 */
export function fechaLargaEnZona(instante: Date, zona: string): string {
  const [anio, mes, dia] = fechaCalendario(instante, zona).split("-").map((n) => Number.parseInt(n, 10));
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS_SEMANA[semana]} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** «5 oct 2026» (pie del PDF de picking, 476). Vive en `lib/utils/fecha-corta` (SLT-99, m2); aquí se reexporta. */
export { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
