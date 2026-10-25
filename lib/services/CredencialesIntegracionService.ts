import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IIntegracionRepository, IntegracionConSecretos } from "@/lib/interfaces/repositories/IIntegracionRepository";
import type {
  CodigoRechazoDe,
  ICredencialesIntegracion,
  LecturaCredencial,
} from "@/lib/interfaces/services/ICredencialesIntegracion";
import {
  CAMPOS_SECRETOS,
  type CredencialPorServicio,
  type DatosPublicosPorServicio,
  type ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §4, §9; R23, R29, R30) — la credencial de la empresa en curso, para USARLA. La
// consumen los jobs, las actions, el webhook y el asistente (T6). No hay actor: quien llama ya está
// dentro de `conEmpresa` y es la empresa de ese contexto la única que se lee.

/** Lo que se escribe en `ultimo_error_codigo` cuando un secreto guardado no se puede descifrar (R29). */
export const CODIGO_CREDENCIAL_ILEGIBLE = "credencial_ilegible";

interface Registro {
  warn(mensaje: string): void;
}

export interface CredencialesIntegracionDeps {
  repo: Pick<IIntegracionRepository, "porServicio" | "marcarError">;
  cifrador: Pick<ICifradorSecretos, "descifrar">;
  log?: Registro;
}

/**
 * La empresa del contexto, leída aquí y no solo en el repositorio: hace falta para el contexto del
 * descifrado, y sacarla de otro sitio (la fila, un parámetro) abriría la puerta a descifrar con la
 * empresa equivocada.
 */
function empresaEnCurso(): string {
  const contexto = contextoActual();
  if (contexto?.tipo !== "empresa") throw new EmpresaNoResuelta("Integracion", "leer");
  return contexto.organizacionId;
}

/** WhatsApp guarda el número en su columna, no en el JSON; el consumidor lo necesita para enviar. */
function datosPublicosDe<S extends ServicioIntegracion>(fila: IntegracionConSecretos): DatosPublicosPorServicio[S] {
  if (fila.servicio === "whatsapp") {
    return {
      numeroId: fila.whatsappNumeroId ?? "",
      wabaId: fila.datosPublicos.wabaId,
      nombreVisible: fila.datosPublicos.nombreVisible,
      telefonoVisible: fila.datosPublicos.telefonoVisible,
      nombreVerificado: fila.datosPublicos.nombreVerificado,
    } as DatosPublicosPorServicio[S];
  }
  if (fila.servicio === "optimizacion_rutas") {
    return {
      proyectoId: fila.datosPublicos.proyectoId,
      cuentaServicio: fila.datosPublicos.cuentaServicio,
    } as DatosPublicosPorServicio[S];
  }
  return {} as DatosPublicosPorServicio[S];
}

export class CredencialesIntegracionService implements ICredencialesIntegracion {
  private readonly log: Registro;

  constructor(private readonly deps: CredencialesIntegracionDeps) {
    this.log = deps.log ?? console;
  }

  async leer<S extends ServicioIntegracion>(servicio: S): Promise<LecturaCredencial<S>> {
    const organizacionId = empresaEnCurso();
    const fila = await this.deps.repo.porServicio(servicio);
    if (fila === null) return { estado: "sin_configurar" };

    const credencial = await this.descifrarTodo(servicio, fila, organizacionId);
    if (credencial === null) {
      // R29: se deja la marca ANTES de responder, para que la pantalla diga qué hacer aunque el
      // consumidor se trague el desenlace. El proveedor no se llama: con una credencial que no se
      // lee no hay nada que mandarle.
      await this.deps.repo.marcarError(servicio, CODIGO_CREDENCIAL_ILEGIBLE);
      return { estado: "ilegible" };
    }
    return { estado: "lista", integracionId: fila.id, credencial, datosPublicos: datosPublicosDe<S>(fila) };
  }

  async marcarRechazo<S extends ServicioIntegracion>(servicio: S, codigo: CodigoRechazoDe<S>): Promise<void> {
    // Se comprueba aquí y no solo en el repositorio: el contrato de T6 no debe depender de qué
    // repositorio se inyecte.
    empresaEnCurso();
    // El tipo ya lo impide; en ejecución se repite porque un código de otro servicio pintaría en la
    // tarjeta de WhatsApp el texto de Google.
    if (!codigo.startsWith(`${servicio}.`)) {
      throw new TypeError(`marcarRechazo: el codigo no corresponde al servicio ${servicio}`);
    }
    await this.deps.repo.marcarError(servicio, codigo);
  }

  /**
   * `null` si falta un campo o alguno no se descifra. Solo `CredencialIlegibleError` es «ilegible»:
   * una bóveda sin configurar (R4) es un fallo de la plataforma, no de la empresa, y se propaga sin
   * marcar la fila.
   */
  private async descifrarTodo<S extends ServicioIntegracion>(
    servicio: S,
    fila: IntegracionConSecretos,
    organizacionId: string,
  ): Promise<CredencialPorServicio[S] | null> {
    const credencial: Record<string, string> = {};
    for (const campo of CAMPOS_SECRETOS[servicio] as readonly string[]) {
      const guardado = fila.secretos[campo];
      if (guardado === undefined) {
        this.log.warn(`[integraciones] credencial ilegible servicio=${servicio} campo=${campo} diagnostico=ausente`);
        return null;
      }
      try {
        credencial[campo] = await this.deps.cifrador.descifrar(guardado, {
          organizacionId,
          integracionId: fila.id,
          campo,
        });
      } catch (error) {
        if (!(error instanceof CredencialIlegibleError)) throw error;
        // Solo el diagnóstico interno de la bóveda: ni el valor guardado ni trozos de él.
        this.log.warn(
          `[integraciones] credencial ilegible servicio=${servicio} campo=${campo} diagnostico=${error.diagnostico}`,
        );
        return null;
      }
    }
    return credencial as CredencialPorServicio[S];
  }
}
