import { emailContacto } from "@/lib/config/email";
import { MARCA } from "@/lib/config/marca";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { componerCorreo } from "@/lib/services/email/plantillas/plantilla-marca";

export interface OtpPlantillaParams {
  to: string;
  code: string;
  expiresInMinutes: number;
}

/**
 * El correo del código de verificación, sobre la plantilla común (SL-41, design §4). Lo envían el
 * login de riesgo alto y «recuperar contraseña» por el mismo `OtpChallengeIssuer`, así que los dos
 * reciben este mismo correo (R9): «código de verificación» vale para ambos, y separarlos obligaría
 * a cambiar la firma del emisor sin que nadie lo haya pedido.
 *
 * La firma no cambia desde la feature 80: `EmailNotificacionProvider` sigue llamándola igual. El
 * contacto se lee aquí, del entorno, y se pasa a `componerCorreo`, que sigue pura. El OTP lleva el
 * logo por CID siempre, con o sin URL base (R4, decisión del leader del 2026-10-24).
 */
export function plantillaOtpCodigo(params: OtpPlantillaParams): EmailMessage {
  const { code, expiresInMinutes } = params;
  // El asunto NO lleva el código (SL-32 m4, R11): `ConsoleEmailSender` registra siempre el asunto,
  // y lo muestran también las notificaciones del móvil con la pantalla bloqueada.
  return componerCorreo({
    to: params.to,
    asunto: `Tu código de verificación de ${MARCA.nombre}`,
    preheader: `Tu código vence en ${expiresInMinutes} minutos.`,
    bloques: [
      { tipo: "parrafo", texto: `Tu código de verificación de ${MARCA.nombre} es:` },
      { tipo: "codigo", codigo: code },
      { tipo: "parrafo", texto: `Vence en ${expiresInMinutes} minutos y solo sirve una vez.` },
      {
        tipo: "nota",
        texto: "Si no lo pediste, ignora este correo y no compartas el código con nadie.",
      },
    ],
    contacto: emailContacto(),
  });
}
