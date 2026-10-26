import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CodigoPruebaFallida,
  EstadoVisibleIntegracion,
  MarcaIntegracion,
  ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §4; R6-R18) — contrato de la configuración de integraciones que usa la pantalla del
// maestro. Cada operación devuelve un resultado y no lanza por un caso de negocio; lo que sí lanza
// (base caída, bóveda sin configurar, R4) lo traduce la action a `unexpected` con referencia.

export type { Actor };

/**
 * Lo único que llega a la pantalla (R5, R34). Se arma campo a campo: nunca lleva secretos, sus
 * cifrados ni el resumen del token. En WhatsApp, `datosPublicos.numeroId` sale de su columna para
 * que el formulario de edición pueda conservarlo (R36).
 */
export interface VistaIntegracion {
  /** `null` si el servicio está sin configurar. */
  id: string | null;
  servicio: ServicioIntegracion;
  marca: MarcaIntegracion;
  estado: EstadoVisibleIntegracion;
  datosPublicos: Readonly<Record<string, string>>;
  /** Texto del catálogo, solo en `error`; nunca el del proveedor. */
  ultimoErrorTexto: string | null;
  ultimaPruebaAt: string | null;
  ultimoWebhookAt: string | null;
}

/** El token en claro de R18: viaja en esta respuesta y en ninguna otra. */
export interface VerificacionWebhook {
  token: string;
  urlWebhook: string;
}

type Forbidden = { status: "forbidden" };
type NoEncontrada = { status: "no_encontrada" };
type Limite = { status: "limite"; reintentarEnS: number };
type InvalidInput = { status: "invalid_input"; fieldErrors: Record<string, string[]> };
/** `texto` es el del catálogo para ese código (R13): la pantalla no tiene que resolverlo. */
type PruebaFallida = { status: "prueba_fallida"; codigo: CodigoPruebaFallida; texto: string };

export type ListarIntegracionesResultado = { status: "ok"; servicios: VistaIntegracion[] } | Forbidden;

export type AltaIntegracionResultado =
  | { status: "creada"; vista: VistaIntegracion; verificacion?: VerificacionWebhook }
  | PruebaFallida
  | { status: "ya_existe" }
  | { status: "numero_ocupado" }
  | Limite
  | InvalidInput
  | Forbidden;

export type EditarIntegracionResultado =
  | { status: "guardada"; vista: VistaIntegracion }
  | PruebaFallida
  /** Hacía falta probar con un secreto conservado y no se pudo leer: hay que volver a escribirlo. */
  | { status: "credencial_ilegible" }
  | NoEncontrada
  | { status: "numero_ocupado" }
  | Limite
  | InvalidInput
  | Forbidden;

export type ProbarIntegracionResultado =
  | { status: "probada"; ok: true }
  | { status: "probada"; ok: false; codigo: string; texto: string }
  | NoEncontrada
  | Limite
  | Forbidden;

export type RegenerarTokenResultado = ({ status: "regenerado" } & VerificacionWebhook) | NoEncontrada | Forbidden;

export type DesconectarIntegracionResultado = { status: "desconectada"; servicio: ServicioIntegracion } | NoEncontrada | Forbidden;

/**
 * Todas las operaciones exigen al maestro de una empresa (R6) y toman la empresa del actor, nunca
 * de la entrada (R7). `actor` es `null` cuando no hay sesión. `campos` llega sin validar: el service
 * aplica el esquema del servicio y responde `invalid_input`.
 */
export interface IIntegracionesService {
  listar(actor: Actor | null): Promise<ListarIntegracionesResultado>;
  alta(actor: Actor | null, servicio: ServicioIntegracion, campos: unknown): Promise<AltaIntegracionResultado>;
  editar(actor: Actor | null, id: string, campos: unknown): Promise<EditarIntegracionResultado>;
  probar(actor: Actor | null, id: string): Promise<ProbarIntegracionResultado>;
  regenerarToken(actor: Actor | null, id: string): Promise<RegenerarTokenResultado>;
  desconectar(actor: Actor | null, id: string): Promise<DesconectarIntegracionResultado>;
}
