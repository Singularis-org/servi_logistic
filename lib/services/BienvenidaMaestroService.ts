import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IBienvenidaMaestroRepository } from "@/lib/interfaces/repositories/IBienvenidaMaestroRepository";
import type {
  EnviarBienvenidaInput,
  EnviarBienvenidaResultado,
  IBienvenidaMaestroService,
} from "@/lib/interfaces/services/IBienvenidaMaestroService";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";
import { plantillaBienvenidaMaestro } from "@/lib/services/email/plantillas/bienvenida-maestro";

/**
 * La ruta que canjea el enlace. Es la de «recuperar contraseña» y no una nueva: `PUBLIC_ROUTES`
 * esta firmada por una guardia, y el formulario de la contraseña nueva ya vive ahi (design §12, A4).
 */
const RUTA_CANJE = "/recuperar-contrasena";

/**
 * El secreto va en el fragmento (R16): el navegador no lo manda al servidor, asi que no queda en
 * los logs de acceso ni en el `Referer`, como si quedaria en la ruta o en la query (design §12, A5).
 */
export function urlDelEnlace(baseUrl: string, enlace: string): string {
  return `${baseUrl}${RUTA_CANJE}#enlace=${enlace}`;
}

/**
 * Solo el nombre del error. El `message` no: el de `EmailEnvioError` lleva el destinatario, y el
 * de cualquier otro podria arrastrar lo que su autor quisiera (R34).
 */
function causaDe(error: unknown): string {
  return error instanceof Error ? error.name : "desconocido";
}

/**
 * SL-41 (design §6.3). Emite el enlace, compone el correo y lo entrega. NUNCA lanza: el alta de la
 * empresa ya se confirmo cuando esto corre, y un correo que no sale no puede tumbarla (D4, R23).
 */
export class BienvenidaMaestroService implements IBienvenidaMaestroService {
  constructor(
    private readonly repo: IBienvenidaMaestroRepository,
    private readonly passwordReset: Pick<IPasswordResetService, "emitirEnlaceBienvenida">,
    private readonly sender: IEmailSender,
    private readonly baseUrl: string | null,
    /**
     * Llega del composition root (`emailSmtpConfigurado()`) y no se deduce de `messageId === null`:
     * eso ataria el estado a un detalle del transporte (design §6.3).
     */
    private readonly smtpConfigurado: boolean,
    /** El contacto del pie (R39): lo decide quien llama, para que la plantilla siga siendo pura. */
    private readonly contacto: string | null = null,
  ) {}

  async enviar(input: EnviarBienvenidaInput): Promise<EnviarBienvenidaResultado> {
    let usuarioId: string | null = null;
    let email: string | null = null;
    try {
      const maestro = await this.repo.maestroParaBienvenida(input.organizacionId);
      if (!maestro) return { estado: "sin_maestro" };
      usuarioId = maestro.usuarioId;
      email = maestro.email;

      // Sin URL base el enlace no lleva a ninguna parte. Se corta ANTES de emitir, para no dejar un
      // desafio vivo que nadie puede abrir (R23). El aviso nombra la variable y no su valor (R40).
      if (this.baseUrl === null) {
        console.warn(
          `[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL organizacion=${input.organizacionId}`,
        );
        return { estado: "no_enviada", email };
      }

      const { enlace, ttlHoras } = await this.passwordReset.emitirEnlaceBienvenida({
        usuarioId: maestro.usuarioId,
        ipAddress: input.ipAddress,
      });
      await this.sender.enviar(
        plantillaBienvenidaMaestro({
          to: maestro.email,
          nombre: maestro.nombre,
          empresaNombre: maestro.empresaNombre,
          url: urlDelEnlace(this.baseUrl, enlace),
          ttlHoras,
          baseUrl: this.baseUrl,
          contacto: this.contacto,
        }),
      );
      // Sin SMTP el emisor es el de consola: no fallo nada, pero el correo tampoco salio (R24).
      return { estado: this.smtpConfigurado ? "enviada" : "sin_correo", email };
    } catch (error) {
      console.error(
        `[bienvenida] no se envio organizacion=${input.organizacionId} ` +
          `usuario=${usuarioId ?? "-"} causa=${causaDe(error)}`,
      );
      return { estado: "no_enviada", email };
    }
  }
}
