import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import {
  SIN_LINEAS_DE_CAMBIO,
  TITULO_LINEAS_DE_CAMBIO,
  TITULO_TOPES_PASADOS,
  asuntoCambioPlan,
  asuntoCambioPlanNoAplicado,
  introCambioPlan,
  introCambioPlanNoAplicado,
  lineaNoAplicada,
  lineaReemplazo,
  lineasDeCambioDelPlan,
  mensajeCambioCancelado,
  mensajeTopesPasados,
  type CambioDelPlanParaCorreo,
  type MotivoNoAplicada,
  type TipoCorreoCambioPlan,
  type TopePasado,
} from "@/lib/planes/mensajes";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";
import { fechaCortaEnZona } from "@/lib/whatsapp-envios/informes/formato";


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
  /**
   * SLT-128 (R21, R22): `recordatorio_3` sale cuando entre guardar y la recepción de la empresa hay de 4 a 7
   * días; se compone como los otros recordatorios, con la fecha de SU recepción en `vigenteDesde`.
   */
  tipo: TipoCorreoCambioPlan;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
  /**
   * SLT-42 (R22; decisión del humano tras T5.5): la zona horaria del país de la empresa que cambia de
   * plan. Las fechas del correo se pintan en ella.
   */
  zona: string;
}

/**
 * SL-24 (design §16.4; R41, R42, R45) — el correo del cambio de un plan, sobre la plantilla común,
 * igual que `bienvenida-maestro.ts`. Los textos viven en `lib/planes/mensajes.ts`; la fecha se pinta
 * en la zona del país de la empresa que recibe el correo (`p.zona`, SLT-42).
 *
 * `cancelado` lleva solo el texto de R45. Los demás: saludo, qué plan cambia y desde cuándo, la línea
 * del reemplazo si la hay, las líneas de cambio y, si la empresa ya pasa algún tope nuevo, cuál.
 */
export function plantillaCambioPlan(p: CambioPlanParams): EmailMessage {
  const asunto = asuntoCambioPlan(p.tipo, p.planNombre);
  const saludo: Bloque = { tipo: "parrafo", texto: `Hola, ${p.nombre}:` };
  const fechaCorta = (instante: Date): string => fechaCortaEnZona(instante, p.zona);

  if (p.tipo === "cancelado") {
    // El cambio cancelado siempre tenía fecha; sin ella no hay correo que componer.
    if (p.vigenteDesde === null) throw new Error("plantillaCambioPlan: un cambio cancelado necesita su fecha");
    const texto = mensajeCambioCancelado(p.planNombre, fechaCorta(p.vigenteDesde));
    return componerCorreo({
      to: p.to,
      asunto,
      preheader: texto,
      bloques: [saludo, { tipo: "parrafo", texto }],
      contacto: p.contacto,
    });
  }

  const fecha = p.vigenteDesde === null ? null : fechaCorta(p.vigenteDesde);
  const intro = introCambioPlan(p.tipo, p.planNombre, p.empresaNombre, fecha);
  const lineas = lineasDeCambioDelPlan(p.cambios);
  const bloques: Bloque[] = [saludo, { tipo: "parrafo", texto: intro }];
  if (p.reemplazaA !== null) bloques.push({ tipo: "parrafo", texto: lineaReemplazo(fechaCorta(p.reemplazaA)) });
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

/** SLT-128 (design §14.4; R28): el aviso a la lista de alertas de una recepción que no se pudo aplicar. */
export interface CambioPlanNoAplicadoParams {
  /** Una dirección de `PLAN_CHANGE_ALERT_EMAILS`. */
  to: string;
  empresaNombre: string;
  planNombre: string;
  /** La fecha de la recepción, YA pintada (en la hora de la plataforma: la lista no es de ninguna empresa). */
  fecha: string;
  motivo: MotivoNoAplicada;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
}

/**
 * SLT-128 (design §14.4; R28) — el correo a la lista de alertas cuando el cambio programado de un plan no se pudo
 * aplicar a una empresa: qué plan, qué empresa, para qué fecha, por qué, y que sigue con su versión anterior. Sin
 * saludo personal: la lista no es de personas con nombre.
 */
export function plantillaCambioPlanNoAplicado(p: CambioPlanNoAplicadoParams): EmailMessage {
  const asunto = asuntoCambioPlanNoAplicado(p.planNombre, p.empresaNombre);
  const intro = introCambioPlanNoAplicado(p.planNombre, p.empresaNombre, p.fecha);
  return componerCorreo({
    to: p.to,
    asunto,
    preheader: intro,
    bloques: [
      { tipo: "parrafo", texto: intro },
      { tipo: "parrafo", texto: lineaNoAplicada(p.empresaNombre, p.motivo) },
    ],
    contacto: p.contacto,
  });
}
