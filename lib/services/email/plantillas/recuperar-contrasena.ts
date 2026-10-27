import { MARCA } from "@/lib/config/marca";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { NOMBRE_EMPRESA_PLATAFORMA } from "@/lib/types/auth";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";

/** Una cuenta del email y el enlace que restablece SOLO su contraseña (SL-18 R16, R18). */
export interface EnlaceDeCuenta {
  /** Nombre de la empresa de la cuenta; `null` es la cuenta de plataforma. */
  empresaNombre: string | null;
  /** Enlace completo, con el secreto solo en el fragmento `#enlace=` (R21). */
  url: string;
}

export interface RecuperarContrasenaParams {
  to: string;
  /** Al menos uno: sin enlaces el servicio no envía correo (R17). */
  enlaces: EnlaceDeCuenta[];
  ttlMinutos: number;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
}

/**
 * El correo de «recuperar contraseña» (SL-18, design §4.1), sobre la plantilla común: un solo
 * correo por email, con una línea por cuenta. Cada línea nombra su empresa, porque el mismo email
 * puede tener una contraseña distinta en cada una y el enlace solo cambia la de esa cuenta (R18).
 *
 * Ni el asunto ni el preheader llevan enlaces ni la palabra «contraseña»: los muestran las
 * notificaciones del móvil y la línea de metadata del `ConsoleEmailSender` (SL-41 R11).
 */
export function plantillaRecuperarContrasena(p: RecuperarContrasenaParams): EmailMessage {
  const varias = p.enlaces.length > 1;
  const botones: Bloque[] = p.enlaces.map((e) => ({
    tipo: "boton",
    texto: e.empresaNombre ?? NOMBRE_EMPRESA_PLATAFORMA,
    url: e.url,
  }));
  return componerCorreo({
    to: p.to,
    asunto: `Recupera tu acceso a ${MARCA.nombre}`,
    preheader: varias
      ? "Elige la empresa en la que quieres cambiar tu contraseña."
      : "Crea una contraseña nueva para tu cuenta.",
    bloques: [
      {
        tipo: "parrafo",
        texto: `Recibimos una solicitud para cambiar la contraseña de ${p.to} en ${MARCA.nombre}.`,
      },
      {
        tipo: "parrafo",
        texto: varias
          ? "Este correo tiene una cuenta en cada empresa de abajo, cada una con su contraseña. " +
            "Abre el enlace de la empresa donde quieres cambiarla; las demás no cambian."
          : "Abre este enlace para crear una contraseña nueva:",
      },
      ...botones,
      {
        tipo: "nota",
        texto:
          `Cada enlace vence en ${p.ttlMinutos} minutos y sirve una sola vez. Si pides otro, ` +
          "el anterior de esa cuenta deja de valer.",
      },
      {
        tipo: "nota",
        texto: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
      },
    ],
    contacto: p.contacto,
  });
}
