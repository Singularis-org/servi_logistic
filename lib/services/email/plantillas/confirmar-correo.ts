import { MARCA } from "@/lib/config/marca";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { componerCorreo } from "@/lib/services/email/plantillas/plantilla-marca";

export interface ConfirmarCorreoParams {
  /** El correo NUEVO: al anterior no se escribe nunca (R1614). */
  to: string;
  /** Enlace completo, con el secreto solo en el fragmento `#enlace=` (R1632). */
  url: string;
  ttlHoras: number;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
}

/**
 * SLT-221 (design §8): el correo que confirma un cambio de correo pedido por el maestro. Ni el
 * asunto ni el preheader llevan el enlace: los muestran el móvil y la línea de metadata del
 * `ConsoleEmailSender` (criterio de SL-41 R11).
 */
export function plantillaConfirmarCorreo(p: ConfirmarCorreoParams): EmailMessage {
  return componerCorreo({
    to: p.to,
    asunto: `Confirma tu correo en ${MARCA.nombre}`,
    preheader: "Confirma este correo para empezar a entrar con él.",
    bloques: [
      {
        tipo: "parrafo",
        texto:
          "Tu administrador cambió el correo de tu cuenta a este. Confírmalo para empezar a entrar con él.",
      },
      { tipo: "boton", texto: "Confirmar correo", url: p.url },
      {
        tipo: "nota",
        texto: `El enlace vence en ${p.ttlHoras} horas y sirve una sola vez.`,
      },
      {
        tipo: "nota",
        texto: "Si no esperabas este cambio, ignora este correo: tu cuenta no cambia.",
      },
    ],
    contacto: p.contacto,
  });
}

/**
 * R1617/R1632: el aviso de un envío fallido. Recibe SOLO el nombre del error: ni el destinatario ni
 * la URL (el `message` de `EmailEnvioError` lleva el destinatario). Vive aquí y no en `UsuarioService`
 * porque por ese archivo pasa una contraseña en claro y la guardia de la 287 le prohíbe todo `console`.
 */
export function avisarEnvioFallidoCambioCorreo(causa: string): void {
  console.error(`[cambio-correo] no se envio causa=${causa}`);
}
