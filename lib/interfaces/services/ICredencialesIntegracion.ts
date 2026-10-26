import type {
  CodigoRechazoUso,
  CredencialPorServicio,
  DatosPublicosPorServicio,
  ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §4 «Lectura para uso», §9; R23, R29, R30) — lo que usan WhatsApp, Maps, rutas y el
// asistente para obtener la credencial de la empresa EN CURSO. Sin actor: el consumidor ya abrió el
// contexto de empresa (sesión, job o webhook). Sin contexto, falla con `EmpresaNoResuelta`, y eso es
// lo que impide leer una credencial en plataforma por error.

export type LecturaCredencial<S extends ServicioIntegracion> =
  | { estado: "sin_configurar" }
  /** Ya dejó la integración en `error` con `credencial_ilegible` (R29). No se llama al proveedor. */
  | { estado: "ilegible" }
  | {
      estado: "lista";
      integracionId: string;
      credencial: CredencialPorServicio[S];
      /** En WhatsApp incluye `numeroId`, sacado de su columna. */
      datosPublicos: DatosPublicosPorServicio[S];
    };

/** Los códigos de rechazo (R30) que corresponden a un servicio: un consumidor no marca otro. */
export type CodigoRechazoDe<S extends ServicioIntegracion> = Extract<CodigoRechazoUso, `${S}.${string}`>;

export interface ICredencialesIntegracion {
  /** No lanza en los casos de negocio; sí con `EmpresaNoResuelta` sin contexto o si la bóveda no está configurada (R4). */
  leer<S extends ServicioIntegracion>(servicio: S): Promise<LecturaCredencial<S>>;
  /** R30: el proveedor rechazó la credencial en un uso real. Sin integración del servicio, no hace nada. */
  marcarRechazo<S extends ServicioIntegracion>(servicio: S, codigo: CodigoRechazoDe<S>): Promise<void>;
}
