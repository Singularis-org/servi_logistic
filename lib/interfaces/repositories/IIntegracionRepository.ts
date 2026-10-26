import type {
  CampoSecreto,
  DatosPublicosGuardados,
  EstadoIntegracion,
  ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §1, §4, §13) — contrato del repositorio de integraciones. Sin tipos de Prisma a
// propósito: el service (T5) se prueba con un doble de esta interfaz.
//
// LA EMPRESA NO ES UN PARÁMETRO. Sale del contexto (`conEmpresa`) y va al `where` de cada consulta
// (R7, R8): ni la fila ni la entrada pueden elegirla. Sin contexto de empresa, cada método falla con
// `EmpresaNoResuelta` sin consultar.

type PorServicio<T> = { [S in ServicioIntegracion]: T & { servicio: S; datosPublicos: DatosPublicosGuardados<S> } }[ServicioIntegracion];

interface ComunGuardada {
  id: string;
  estado: EstadoIntegracion;
  /** Solo en WhatsApp; `null` en el resto (CHECK de la migración). */
  whatsappNumeroId: string | null;
  ultimoErrorCodigo: string | null;
  ultimaPruebaAt: Date | null;
  ultimoWebhookAt: Date | null;
}

/**
 * Una integración de la empresa en curso, SIN secretos ni resumen del token: es lo que sirve para
 * armar la vista (R5). El resumen del token de verificación no sale nunca de este repositorio.
 */
export type IntegracionGuardada = PorServicio<ComunGuardada>;

/** La misma fila con sus secretos CIFRADOS (`{ campo: "v<n>:…" }`), para descifrar en el service. */
export type IntegracionConSecretos = PorServicio<ComunGuardada & { secretos: Readonly<Record<string, string>> }>;

/** Secretos ya cifrados por el service con `{ organizacionId, integracionId, campo }`. */
type SecretosCifrados<S extends ServicioIntegracion> = Record<CampoSecreto<S>, string>;

/** Un alta (R12): siempre nace `conectada`, porque solo se escribe tras una prueba buena. */
export type NuevaIntegracion = {
  [S in ServicioIntegracion]: {
    /** Generado por el service ANTES de cifrar: va en los datos asociados (QC inv. 3). */
    id: string;
    servicio: S;
    datosPublicos: DatosPublicosGuardados<S>;
    secretos: SecretosCifrados<S>;
    /** Hora de la prueba buena que autorizó el alta. */
    probadaAt: Date;
  } & (S extends "whatsapp"
    ? { whatsappNumeroId: string; whatsappResumenVerificacion: string }
    : { whatsappNumeroId?: never; whatsappResumenVerificacion?: never });
}[ServicioIntegracion];

export type ResultadoCrearIntegracion =
  | { status: "creada"; integracion: IntegracionGuardada }
  | { status: "ya_existe" }
  | { status: "numero_ocupado" };

/**
 * Una edición (R14). Lo ausente se conserva. `secretos` trae SOLO los que cambian: los demás se
 * quedan como están, sin descifrarse ni volver a cifrarse. `probadaAt` presente = la edición pasó
 * una prueba buena: la integración queda `conectada` y sin error; ausente = no se tocó el estado.
 */
export interface CambiosIntegracion {
  datosPublicos?: Readonly<Record<string, unknown>>;
  secretos?: Readonly<Record<string, string>>;
  whatsappNumeroId?: string;
  probadaAt?: Date;
}

export type ResultadoActualizarIntegracion =
  | { status: "guardada"; integracion: IntegracionGuardada }
  | { status: "no_encontrada" }
  | { status: "numero_ocupado" };

/** El resultado de «Probar conexión» (R15): `codigo` es el del catálogo, nunca texto del proveedor. */
export type ResultadoPruebaGuardado = { ok: true } | { ok: false; codigo: string };

export interface IIntegracionRepository {
  /** Las integraciones de la empresa en curso (como mucho una por servicio). */
  listar(): Promise<IntegracionGuardada[]>;

  /** `null` si no existe o es de otra empresa: el mismo `null` para los dos casos (R9). */
  porId(id: string): Promise<IntegracionConSecretos | null>;

  /** La del servicio en la empresa en curso, o `null` («sin configurar»). */
  porServicio(servicio: ServicioIntegracion): Promise<IntegracionConSecretos | null>;

  /**
   * Alta con su `integracion_conectada` en la misma transacción (R33). `ya_existe` si la empresa ya
   * tiene ese servicio, también con dos altas a la vez (R10); `numero_ocupado` si el número de
   * WhatsApp está en otra empresa (R11). Otra violación de unicidad se propaga.
   */
  crear(nueva: NuevaIntegracion, actorUsuarioId: string | null): Promise<ResultadoCrearIntegracion>;

  /** Edición con su `integracion_actualizada` en la misma transacción (R14, R33). */
  actualizar(
    id: string,
    cambios: CambiosIntegracion,
    actorUsuarioId: string | null,
  ): Promise<ResultadoActualizarIntegracion>;

  /**
   * «Probar conexión» (R15): buena deja `conectada` sin error; mala deja `error` con el código. Las
   * dos fijan la hora de la prueba y registran `integracion_probada` («ok» o el código). `false` si
   * no existe en la empresa en curso. La hora llega del service: el repositorio no tiene reloj.
   */
  registrarPrueba(
    id: string,
    resultado: ResultadoPruebaGuardado,
    probadaAt: Date,
    actorUsuarioId: string | null,
  ): Promise<boolean>;

  /**
   * Cambia el resumen del token de verificación de una integración de WhatsApp (R18) y registra
   * `integracion_token_regenerado`. `false` si no existe en la empresa en curso o no es de WhatsApp.
   */
  regenerarToken(id: string, resumenVerificacion: string, actorUsuarioId: string | null): Promise<boolean>;

  /**
   * Borrado FÍSICO (D7, R32) con su `integracion_desconectada`, que sobrevive a la fila. Devuelve el
   * servicio desconectado, o `null` si no existe en la empresa en curso.
   */
  borrar(id: string, actorUsuarioId: string | null): Promise<ServicioIntegracion | null>;

  /**
   * R29, R30: un consumidor deja la integración del servicio en `error` con el código del catálogo.
   * No es una acción del maestro: no deja historial. Sin integración de ese servicio, no hace nada.
   */
  marcarError(servicio: ServicioIntegracion, codigo: string): Promise<void>;

  /** R19, R20: la hora del último contacto válido del webhook. */
  anotarWebhook(id: string, at: Date): Promise<void>;
}
