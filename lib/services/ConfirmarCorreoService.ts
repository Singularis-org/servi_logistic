import type { ICambioCorreoRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type {
  EnlaceDeCambioCorreoInput,
  IConfirmarCorreoService,
} from "@/lib/interfaces/services/IConfirmarCorreoService";
import type { AuthConfig } from "@/lib/config/auth";
import { authConfig } from "@/lib/config/auth";
import type { ConfirmarCambioCorreoResult } from "@/lib/types/usuario";
import { partirEnlace } from "@/lib/utils/enlace-de-un-uso";
import { verifyPassword } from "@/lib/utils/password";
import { ResetRateLimiter, buildResetRateKey } from "@/lib/utils/reset-rate-limit";

type CanjeRepo = Pick<
  ICambioCorreoRepository,
  "empresaDelCambioCorreo" | "cambioCorreoParaCanje" | "aplicarCambioCorreo"
>;

const INVALIDO: ConfirmarCambioCorreoResult = { status: "invalid_or_expired" };

/**
 * SLT-221 (design §4.3; R1622-R1629): el canje del cambio de correo. No toca `Session` (R1627) ni
 * pide contraseña (R1628). No registra el enlace ni el secreto.
 */
export class ConfirmarCorreoService implements IConfirmarCorreoService {
  constructor(
    private readonly repo: CanjeRepo,
    private readonly limitador: ResetRateLimiter = new ResetRateLimiter(),
    private readonly config: AuthConfig = authConfig,
  ) {}

  async empresaDelEnlace(input: EnlaceDeCambioCorreoInput): Promise<string | null> {
    const partes = partirEnlace(input.enlace);
    if (!partes) return null;
    // R1629: el límite se mira ANTES de leer nada y de evaluar el secreto.
    const clave = buildResetRateKey(partes.id, input.ipAddress);
    const superado = this.limitador.superaLimite(
      clave,
      this.config.RESET_MAX_VERIFY_ATTEMPTS,
      this.config.RESET_VERIFY_WINDOW_MINUTES * 60_000,
    );
    if (superado) return null;
    this.limitador.registrar(clave);
    return this.repo.empresaDelCambioCorreo(partes.id);
  }

  async confirmar(input: EnlaceDeCambioCorreoInput): Promise<ConfirmarCambioCorreoResult> {
    const partes = partirEnlace(input.enlace);
    if (!partes) return INVALIDO;
    // Anulado, usado, vencido o inexistente: la misma respuesta (R1623).
    const pendiente = await this.repo.cambioCorreoParaCanje(partes.id);
    if (!pendiente) return INVALIDO;
    if (!(await verifyPassword(partes.secreto, pendiente.secretoHash))) return INVALIDO;

    const resultado = await this.repo.aplicarCambioCorreo(pendiente.id);
    if (resultado === "correo_en_uso") return { status: "correo_en_uso" }; // R1624
    if (resultado === "invalido") return INVALIDO; // R1625: otro canje ganó la carrera
    return { status: "ok" };
  }
}
