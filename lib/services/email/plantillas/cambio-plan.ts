import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import {
  SIN_LINEAS_DE_CAMBIO,
  TITULO_LINEAS_DE_CAMBIO,
  TITULO_TOPES_PASADOS,
  asuntoCambioPlan,
  introCambioPlan,
  lineaReemplazo,
  lineasDeCambioDelPlan,
  mensajeCambioCancelado,
  mensajeTopesPasados,
  type CambioDelPlanParaCorreo,
  type TipoCorreoCambioPlan,
  type TopePasado,
} from "@/lib/planes/mensajes";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";
import { fechaCortaCR } from "@/lib/whatsapp-envios/informes/formato";

export interface CambioPlanParams {
  /** Email de un maestro activo de la empresa (P7). */
  to: string;
  nombre: string;
  empresaNombre: string;
  planNombre: string;
  /** Lo que cambia, tal como sale de `diferenciasDelPlan` (vacío en `cancelado`). */
  cambios: CambioDelPlanParaCorreo;
  /** Desde cuándo rige; `null` = edición inmediata (solo en `guardado`). */
  vigenteDesde: Date | null;
  /** La fecha del cambio al que reemplaza (§16.2), o `null`. Solo en `guardado`. */
  reemplazaA: Date | null;
  /** Los topes que la empresa ya pasa con la versión nueva (R41, R42). */
  topesPasados: readonly TopePasado[];
  tipo: TipoCorreoCambioPlan;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
}

/**
 * SL-24 (design §16.4; R41, R42, R45) — el correo del cambio de un plan, sobre la plantilla común,
 * igual que `bienvenida-maestro.ts`. Los textos viven en `lib/planes/mensajes.ts`; la fecha se pinta
 * con `fechaCortaCR` (día calendario de la plataforma: `vigente_desde` es las 00:00 a −06:00).
 *
 * `cancelado` lleva solo el texto de R45. Los demás: saludo, qué plan cambia y desde cuándo, la línea
 * del reemplazo si la hay, las líneas de cambio y, si la empresa ya pasa algún tope nuevo, cuál.
 */
export function plantillaCambioPlan(p: CambioPlanParams): EmailMessage {
  const asunto = asuntoCambioPlan(p.tipo, p.planNombre);
  const saludo: Bloque = { tipo: "parrafo", texto: `Hola, ${p.nombre}:` };

  if (p.tipo === "cancelado") {
    // El cambio cancelado siempre tenía fecha; sin ella no hay correo que componer.
    if (p.vigenteDesde === null) throw new Error("plantillaCambioPlan: un cambio cancelado necesita su fecha");
    const texto = mensajeCambioCancelado(p.planNombre, fechaCortaCR(p.vigenteDesde));
    return componerCorreo({
      to: p.to,
      asunto,
      preheader: texto,
      bloques: [saludo, { tipo: "parrafo", texto }],
      contacto: p.contacto,
    });
  }

  const fecha = p.vigenteDesde === null ? null : fechaCortaCR(p.vigenteDesde);
  const intro = introCambioPlan(p.tipo, p.planNombre, p.empresaNombre, fecha);
  const lineas = lineasDeCambioDelPlan(p.cambios);
  const bloques: Bloque[] = [saludo, { tipo: "parrafo", texto: intro }];
  if (p.reemplazaA !== null) bloques.push({ tipo: "parrafo", texto: lineaReemplazo(fechaCortaCR(p.reemplazaA)) });
  if (lineas.length === 0) {
    bloques.push({ tipo: "parrafo", texto: SIN_LINEAS_DE_CAMBIO });
  } else {
    bloques.push({ tipo: "parrafo", texto: TITULO_LINEAS_DE_CAMBIO });
    for (const linea of lineas) bloques.push({ tipo: "parrafo", texto: linea });
  }
  if (p.topesPasados.length > 0) {
    bloques.push({ tipo: "parrafo", texto: TITULO_TOPES_PASADOS });
    for (const linea of mensajeTopesPasados(p.topesPasados).split("\n")) bloques.push({ tipo: "nota", texto: linea });
  }
  return componerCorreo({ to: p.to, asunto, preheader: intro, bloques, contacto: p.contacto });
}
