// «5 oct 2026» del día calendario de una zona. Nació en el pie del PDF de picking (476) dentro de
// `lib/whatsapp-envios/informes/formato.ts`, que lo reexporta; vive aquí para que la UI compartida
// (`components/shared/planes/DetalleDePlan`, SLT-99) y los correos no dependan del módulo de WhatsApp.
// Tablas fijas, sin `Intl` (determinista); la aritmética de zona la hace `calendario-zona`.
import { fechaCalendario } from "@/lib/utils/calendario-zona";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «5 oct 2026», del dia calendario de `zona`. */
export function fechaCortaEnZona(instante: Date, zona: string): string {
  const [anio, mes, dia] = fechaCalendario(instante, zona).split("-").map((n) => Number.parseInt(n, 10));
  return `${dia} ${MESES_CORTOS[mes - 1]} ${anio}`;
}
