import type {
  EmailMessage,
  EmailSendResult,
  IEmailSender,
} from "@/lib/interfaces/external/IEmailSender";

/**
 * TLD reservados que nunca reciben correo (RFC 2606 §2 y RFC 6761 §6): un envio SMTP a ellos
 * rebota siempre y daña la reputacion del remitente. Los usuarios demo de QA viven en
 * `*@example.test`.
 */
const TLD_RESERVADOS: ReadonlySet<string> = new Set(["test", "invalid", "example", "localhost"]);

/**
 * `true` si el dominio del destinatario termina en un TLD reservado. Compara la ULTIMA etiqueta
 * DNS (no un `includes`): `a@x.example.test` y `a@test` lo son; `foo@testing.example.com`, `a@test.example.org` y
 * `a@mytest` no. Sin distinguir mayusculas y tolerando espacios, `<>` y el punto final del FQDN.
 *
 * `to` es una sola direccion (contrato de IEmailSender). Si aun asi llega una lista separada por
 * `,` o `;`, basta con que UNA sea reservada para devolver `true`: ningun reservado sale por SMTP.
 */
export function esDestinoReservado(to: string): boolean {
  return to.split(/[,;]/).some((direccion) => {
    const arroba = direccion.lastIndexOf("@");
    const dominio = direccion
      .slice(arroba + 1)
      .trim()
      .replace(/>+$/, "")
      .trim()
      .replace(/\.+$/, "")
      .toLowerCase();
    const etiquetas = dominio.split(".");
    return TLD_RESERVADOS.has(etiquetas[etiquetas.length - 1]);
  });
}

/**
 * Emisor que enruta por destinatario: los dominios reservados van SIEMPRE al emisor de consola
 * (que imprime el cuerpo solo si `otpDebugLogHabilitado()` lo permite); el resto, al SMTP. Lo
 * compone `crearEmailSender()` cuando hay SMTP configurado; asi aplica a todos los correos sin
 * tocar las actions.
 */
export class EnrutadorEmailSender implements IEmailSender {
  constructor(
    private readonly smtp: IEmailSender,
    private readonly consola: IEmailSender,
  ) {}

  enviar(mensaje: EmailMessage): Promise<EmailSendResult> {
    return esDestinoReservado(mensaje.to) ? this.consola.enviar(mensaje) : this.smtp.enviar(mensaje);
  }
}
