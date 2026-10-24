import { MARCA } from "@/lib/config/marca";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { componerCorreo } from "@/lib/services/email/plantillas/plantilla-marca";

export interface BienvenidaMaestroParams {
  /** Email del maestro: es también su usuario para entrar (R13). */
  to: string;
  nombre: string;
  empresaNombre: string;
  /** Enlace completo para crear la contraseña, con el secreto en el fragmento (R16). */
  url: string;
  ttlHoras: number;
  /**
   * URL base de la app. No admite `null`, a diferencia del OTP: sin URL base no hay enlace que
   * mandar, y el servicio devuelve `no_enviada` antes de llegar aquí (R23, R40).
   */
  baseUrl: string;
  /** Dirección de contacto del pie (R39), o `null`. */
  contacto: string | null;
}

/**
 * El correo de bienvenida del maestro (SL-41, design §6.4), sobre la plantilla común.
 *
 * Lleva el enlace y nada más que lo sustituya: ni contraseña, ni hash, ni código de 6 dígitos
 * (R14). El enlace va solo en el cuerpo; el asunto lo ven las notificaciones del móvil y la línea
 * de metadata del `ConsoleEmailSender` (R11).
 */
export function plantillaBienvenidaMaestro(p: BienvenidaMaestroParams): EmailMessage {
  return componerCorreo({
    to: p.to,
    asunto: `Te damos la bienvenida a ${MARCA.nombre}`,
    preheader: `Crea tu contraseña para entrar a ${p.empresaNombre}.`,
    bloques: [
      { tipo: "parrafo", texto: `Hola, ${p.nombre}:` },
      {
        tipo: "parrafo",
        texto: `Se creó la cuenta de ${p.empresaNombre} en ${MARCA.nombre} y tú eres su maestro.`,
      },
      {
        tipo: "parrafo",
        texto: `Para entrar, crea tu contraseña. Tu usuario es este correo: ${p.to}.`,
      },
      { tipo: "boton", texto: "Crear mi contraseña", url: p.url },
      {
        tipo: "nota",
        texto:
          `El enlace vence en ${p.ttlHoras} horas y sirve una sola vez. Si venció, pide al equipo ` +
          `de ${MARCA.nombre} que te lo reenvíe, o entra en ${p.baseUrl}/recuperar-contrasena y ` +
          "pide un código con tu correo.",
      },
      {
        tipo: "nota",
        texto:
          "Si no esperabas este correo, ignóralo: sin la contraseña nadie puede entrar a tu cuenta.",
      },
    ],
    contacto: p.contacto,
  });
}
