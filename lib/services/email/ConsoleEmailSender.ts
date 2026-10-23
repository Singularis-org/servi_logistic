import type {
  EmailMessage,
  EmailSendResult,
  IEmailSender,
} from "@/lib/interfaces/external/IEmailSender";
import { otpDebugLogHabilitado } from "@/lib/config/email";

/**
 * Emisor de respaldo para desarrollo y tests: no toca la red. Registra solo
 * metadata (destinatario y asunto). El CUERPO —que en el caso del OTP contiene
 * el codigo en claro— se imprime unicamente con AUTH_OTP_DEBUG_LOG=1, para poder
 * completar el flujo de recuperacion en una maquina sin relay SMTP.
 *
 * La linea de debug es UNA linea y lleva el destinatario: va por `console.warn` (stderr) y la de
 * metadata por `console.info` (stdout), asi que en un log mezclado no hay garantia de que salgan
 * juntas, y quien lee el codigo del log (los E2E) tiene que saber de quien es sin depender del orden.
 * El cuerpo va como literal JSON para que sus saltos de linea no partan la linea.
 */
export class ConsoleEmailSender implements IEmailSender {
  async enviar(mensaje: EmailMessage): Promise<EmailSendResult> {
    console.info(`[email] sin SMTP configurado; no se envia. to=${mensaje.to} asunto="${mensaje.subject}"`);
    if (otpDebugLogHabilitado()) {
      console.warn(`[email][debug] to=${mensaje.to} cuerpo=${JSON.stringify(mensaje.text)}`);
    }
    return { messageId: null };
  }
}
