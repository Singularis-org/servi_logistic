import { z } from "zod";

import { pruebasPorMinuto } from "@/lib/config/integraciones";
import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IFuenteAleatoria } from "@/lib/interfaces/external/IFuenteAleatoria";
import type { ProbadoresPorServicio, ResultadoPrueba } from "@/lib/interfaces/external/IProbadorIntegracion";
import type { IResumenSecreto } from "@/lib/interfaces/external/IResumenSecreto";
import type {
  CambiosIntegracion,
  IIntegracionRepository,
  IntegracionConSecretos,
  IntegracionGuardada,
  NuevaIntegracion,
  ResultadoPruebaGuardado,
} from "@/lib/interfaces/repositories/IIntegracionRepository";
import type { IIntegracionPruebaMinutoRepository } from "@/lib/interfaces/repositories/IIntegracionPruebaMinutoRepository";
import type {
  Actor,
  AltaIntegracionResultado,
  DesconectarIntegracionResultado,
  EditarIntegracionResultado,
  IIntegracionesService,
  ListarIntegracionesResultado,
  ProbarIntegracionResultado,
  RegenerarTokenResultado,
  VistaIntegracion,
} from "@/lib/interfaces/services/IIntegracionesService";
import {
  CAMPOS_SECRETOS,
  codigoPruebaFallida,
  esServicioIntegracion,
  MARCAS_INTEGRACION,
  SECRETO_MAX,
  SECRETO_MIN,
  SERVICIOS_INTEGRACION,
  TEXTO_ERROR_DESCONOCIDO,
  textoDelUltimoError,
  type CodigoPruebaFallida,
  type CredencialPorServicio,
  type DatosPruebaPorServicio,
  type DatosPublicosPorServicio,
  type ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §1, §4, §6; R6-R18) — la configuración de las integraciones por el maestro.
//
// R6 es la PRIMERA línea de cada operación, antes de validar, de abrir el contexto y de tocar un
// repositorio o un probador: un rechazo que llega tarde ya consultó la base o gastó una llamada al
// proveedor con datos de quien no debía.
//
// R7: la empresa sale del actor y de ningún otro sitio. Cada operación abre `conEmpresa` con ella,
// aunque quien llama ya esté en otro contexto, y es la misma que va a los datos asociados del
// cifrado. La entrada pasa por un esquema que descarta lo que no es un campo del servicio.

const FORBIDDEN = { status: "forbidden" } as const;
const NO_ENCONTRADA = { status: "no_encontrada" } as const;

/**
 * R9: un id sin forma de UUID es «no encontrada» sin consultar. Regex de forma y no de versión: los
 * ids los genera `randomUUID`, pero una fila sembrada con otra versión no debe volverse invisible.
 */
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Entrada del formulario                                                       */
/* -------------------------------------------------------------------------- */

// Los secretos se recortan: un token pegado con un salto de línea al final fallaría la prueba y el
// maestro no vería por qué. El tope de 255 de lo público es el del esquema de `datos_publicos`.
const secretoAlta = z.string().trim().min(SECRETO_MIN).max(SECRETO_MAX);
/** R14: vacío o ausente = conservar el guardado. */
const secretoEdicion = z.string().trim().max(SECRETO_MAX).optional();
const textoPublico = z.string().trim().min(1).max(255);

/**
 * `z.object` y no `strictObject`: una clave de más (p. ej. un `organizacionId` que alguien añade a
 * la petición) se descarta y no llega a ninguna parte (R7). La red contra secretos en lo público
 * está en el esquema de `datos_publicos`, que sí es estricto.
 */
export const ESQUEMAS_ENTRADA_ALTA = {
  whatsapp: z.object({
    nombreVisible: textoPublico,
    numeroId: textoPublico,
    wabaId: textoPublico,
    token_acceso: secretoAlta,
    app_secret: secretoAlta,
  }),
  google_maps: z.object({ clave_api: secretoAlta }),
  optimizacion_rutas: z.object({ clave_cuenta_servicio: secretoAlta }),
  asistente: z.object({ clave_api: secretoAlta }),
} as const satisfies Record<ServicioIntegracion, z.ZodType>;

export const ESQUEMAS_ENTRADA_EDICION = {
  whatsapp: z.object({
    nombreVisible: textoPublico.optional(),
    numeroId: textoPublico.optional(),
    wabaId: textoPublico.optional(),
    token_acceso: secretoEdicion,
    app_secret: secretoEdicion,
  }),
  google_maps: z.object({ clave_api: secretoEdicion }),
  optimizacion_rutas: z.object({ clave_cuenta_servicio: secretoEdicion }),
  asistente: z.object({ clave_api: secretoEdicion }),
} as const satisfies Record<ServicioIntegracion, z.ZodType>;

/** Lo que el formulario manda de un lado y del otro, ya validado. */
type EntradaPlana = Readonly<Record<string, string | undefined>>;

/** Un texto propio por campo: el mensaje de zod podría citar lo escrito, y lo escrito puede ser un secreto. */
function invalidInput(error: z.ZodError): { status: "invalid_input"; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = typeof issue.path[0] === "string" ? issue.path[0] : "_";
    fieldErrors[campo] = ["Revisa este campo."];
  }
  return { status: "invalid_input", fieldErrors };
}

/* -------------------------------------------------------------------------- */
/* Vista (R5, R34)                                                              */
/* -------------------------------------------------------------------------- */

/** Campo a campo, sin spread (QC inv. 6): lo que no se nombra aquí no llega a la pantalla. */
function datosPublicosVista(fila: IntegracionGuardada): Record<string, string> {
  if (fila.servicio === "whatsapp") {
    return {
      nombreVisible: fila.datosPublicos.nombreVisible,
      numeroId: fila.whatsappNumeroId ?? "",
      wabaId: fila.datosPublicos.wabaId,
      telefonoVisible: fila.datosPublicos.telefonoVisible,
      nombreVerificado: fila.datosPublicos.nombreVerificado,
    };
  }
  if (fila.servicio === "optimizacion_rutas") {
    return { proyectoId: fila.datosPublicos.proyectoId, cuentaServicio: fila.datosPublicos.cuentaServicio };
  }
  return {};
}

function vistaDe(fila: IntegracionGuardada): VistaIntegracion {
  return {
    id: fila.id,
    servicio: fila.servicio,
    marca: MARCAS_INTEGRACION[fila.servicio],
    estado: fila.estado,
    datosPublicos: datosPublicosVista(fila),
    ultimoErrorTexto: fila.estado === "error" ? (textoDelUltimoError(fila.ultimoErrorCodigo) ?? TEXTO_ERROR_DESCONOCIDO) : null,
    ultimaPruebaAt: fila.ultimaPruebaAt?.toISOString() ?? null,
    ultimoWebhookAt: fila.ultimoWebhookAt?.toISOString() ?? null,
  };
}

function vistaSinConfigurar(servicio: ServicioIntegracion): VistaIntegracion {
  return {
    id: null,
    servicio,
    marca: MARCAS_INTEGRACION[servicio],
    estado: "sin_configurar",
    datosPublicos: {},
    ultimoErrorTexto: null,
    ultimaPruebaAt: null,
    ultimoWebhookAt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Piezas por servicio                                                          */
/* -------------------------------------------------------------------------- */

function camposSecretos(servicio: ServicioIntegracion): readonly string[] {
  return CAMPOS_SECRETOS[servicio];
}

/** Lo que la prueba necesita además del secreto (R12, R17). Solo WhatsApp tiene datos que probar. */
function datosPruebaDe(
  servicio: ServicioIntegracion,
  publicos: { numeroId: string; wabaId: string; nombreVisible: string } | null,
): DatosPruebaPorServicio[ServicioIntegracion] {
  return servicio === "whatsapp" && publicos !== null ? publicos : {};
}

/**
 * Los `datos_publicos` que se guardan tras una prueba buena: los del proveedor (R12). En WhatsApp el
 * número va a su columna y no al JSON (el esquema estricto lo rechazaría).
 */
function datosPublicosGuardables(
  servicio: ServicioIntegracion,
  prueba: DatosPublicosPorServicio[ServicioIntegracion],
): { datosPublicos: Record<string, string>; numeroId: string | null } {
  if (servicio === "whatsapp") {
    const p = prueba as DatosPublicosPorServicio["whatsapp"];
    return {
      datosPublicos: {
        nombreVisible: p.nombreVisible,
        wabaId: p.wabaId,
        telefonoVisible: p.telefonoVisible,
        nombreVerificado: p.nombreVerificado,
      },
      numeroId: p.numeroId,
    };
  }
  if (servicio === "optimizacion_rutas") {
    const p = prueba as DatosPublicosPorServicio["optimizacion_rutas"];
    return { datosPublicos: { proyectoId: p.proyectoId, cuentaServicio: p.cuentaServicio }, numeroId: null };
  }
  return { datosPublicos: {}, numeroId: null };
}

/* -------------------------------------------------------------------------- */
/* El service                                                                   */
/* -------------------------------------------------------------------------- */

export interface IntegracionesServiceDeps {
  repo: IIntegracionRepository;
  pruebas: IIntegracionPruebaMinutoRepository;
  probadores: ProbadoresPorServicio;
  cifrador: ICifradorSecretos;
  resumen: IResumenSecreto;
  aleatoria: IFuenteAleatoria;
  /** URL pública del webhook único (design §10); la arma el composition root, el service no lee el entorno. */
  urlWebhook: string;
  /** R16, design §6. Se pide en cada prueba para que un cambio de la variable no exija reiniciar. */
  limitePorMinuto?: () => number;
  reloj?: () => Date;
}

type Limite = { status: "limite"; reintentarEnS: number };
type PruebaFallida = { status: "prueba_fallida"; codigo: CodigoPruebaFallida; texto: string };

function pruebaFallida(codigo: CodigoPruebaFallida): PruebaFallida {
  return { status: "prueba_fallida", codigo, texto: textoDelUltimoError(codigo) ?? TEXTO_ERROR_DESCONOCIDO };
}

export class IntegracionesService implements IIntegracionesService {
  private readonly limitePorMinuto: () => number;
  private readonly reloj: () => Date;

  constructor(private readonly deps: IntegracionesServiceDeps) {
    this.limitePorMinuto = deps.limitePorMinuto ?? (() => pruebasPorMinuto());
    this.reloj = deps.reloj ?? (() => new Date());
  }

  async listar(actor: Actor | null): Promise<ListarIntegracionesResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    return conEmpresa(actor.organizacionId, async () => {
      const filas = await this.deps.repo.listar();
      const servicios = SERVICIOS_INTEGRACION.map((servicio) => {
        const fila = filas.find((f) => f.servicio === servicio);
        return fila === undefined ? vistaSinConfigurar(servicio) : vistaDe(fila);
      });
      return { status: "ok" as const, servicios };
    });
  }

  async alta(actor: Actor | null, servicio: ServicioIntegracion, campos: unknown): Promise<AltaIntegracionResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    const organizacionId = actor.organizacionId;
    if (!esServicioIntegracion(servicio)) return { status: "invalid_input", fieldErrors: { servicio: ["Revisa este campo."] } };
    const parseo = ESQUEMAS_ENTRADA_ALTA[servicio].safeParse(campos);
    if (!parseo.success) return invalidInput(parseo.error);
    const entrada: EntradaPlana = parseo.data;

    return conEmpresa(organizacionId, async (): Promise<AltaIntegracionResultado> => {
      // Orden del design §4: el límite cuenta también el alta que va a chocar con `ya_existe`; así una
      // ráfaga de altas repetidas tampoco es gratis.
      const limite = await this.revisarLimite();
      if (limite !== null) return limite;
      if ((await this.deps.repo.porServicio(servicio)) !== null) return { status: "ya_existe" };

      const credencial = this.credencialDeEntrada(servicio, entrada);
      const publicos = servicio === "whatsapp" ? publicosWhatsappDeEntrada(entrada) : null;
      // R12: la prueba va ANTES de generar el id y de cifrar; si falla no hay nada que deshacer (R13).
      const prueba = await this.probarCon(servicio, credencial, datosPruebaDe(servicio, publicos));
      if (!prueba.ok) return pruebaFallida(codigoPruebaFallida(servicio, prueba.motivo as never));

      const id = this.deps.aleatoria.nuevoId();
      const secretos = await this.cifrar(credencial, organizacionId, id);
      const { datosPublicos, numeroId } = datosPublicosGuardables(servicio, prueba.datosPublicos);
      const token = servicio === "whatsapp" ? this.deps.aleatoria.nuevoTokenVerificacion() : null;
      const nueva = {
        id,
        servicio,
        datosPublicos,
        secretos,
        probadaAt: this.reloj(),
        // R18: a la base va SOLO el resumen; el token en claro vuelve en esta respuesta y nunca más.
        ...(token === null ? {} : { whatsappNumeroId: numeroId, whatsappResumenVerificacion: this.deps.resumen.resumen(token) }),
      } as NuevaIntegracion;

      const creada = await this.deps.repo.crear(nueva, actor.usuarioId);
      if (creada.status !== "creada") return creada;
      const vista = vistaDe(creada.integracion);
      return token === null
        ? { status: "creada", vista }
        : { status: "creada", vista, verificacion: { token, urlWebhook: this.deps.urlWebhook } };
    });
  }

  async editar(actor: Actor | null, id: string, campos: unknown): Promise<EditarIntegracionResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    const organizacionId = actor.organizacionId;
    if (!FORMA_UUID.test(id)) return NO_ENCONTRADA;

    return conEmpresa(organizacionId, async (): Promise<EditarIntegracionResultado> => {
      const actual = await this.deps.repo.porId(id);
      if (actual === null) return NO_ENCONTRADA;
      const servicio = actual.servicio;
      const parseo = ESQUEMAS_ENTRADA_EDICION[servicio].safeParse(campos);
      if (!parseo.success) return invalidInput(parseo.error);
      const entrada: EntradaPlana = parseo.data;

      const nuevosSecretos = secretosNuevos(servicio, entrada);
      const publicos = publicosEditados(actual, entrada);
      // R14: se prueba si cambia un secreto o lo que la prueba verifica (en WhatsApp, número y WABA).
      // El nombre visible no lo verifica nadie: cambiarlo solo guarda, sin probar ni tocar el estado.
      const hayQueProbar = Object.keys(nuevosSecretos).length > 0 || publicos.cambiaVerificado;
      if (!hayQueProbar) return this.guardarSinProbar(actual, publicos, actor.usuarioId);

      const limite = await this.revisarLimite();
      if (limite !== null) return limite;
      // Los secretos que no llegaron se descifran SOLO para la prueba; a la base no vuelven (el
      // repositorio conserva su cifrado tal cual), así que no se recifran.
      const credencial = await this.credencialEditada(actual, nuevosSecretos, organizacionId);
      if (credencial === null) return { status: "credencial_ilegible" };
      const prueba = await this.probarCon(servicio, credencial, datosPruebaDe(servicio, publicos.whatsapp));
      // R13 y QC §5: una edición con prueba fallida no escribe NADA, tampoco el estado. «Probar» sí lo
      // escribe; la asimetría es a propósito: un token mal pegado no tumba una conexión que funciona.
      if (!prueba.ok) return pruebaFallida(codigoPruebaFallida(servicio, prueba.motivo as never));

      const { datosPublicos, numeroId } = datosPublicosGuardables(servicio, prueba.datosPublicos);
      const cambios: CambiosIntegracion = {
        datosPublicos,
        probadaAt: this.reloj(),
        ...(Object.keys(nuevosSecretos).length > 0 ? { secretos: await this.cifrar(nuevosSecretos, organizacionId, actual.id) } : {}),
        ...(numeroId !== null && numeroId !== actual.whatsappNumeroId ? { whatsappNumeroId: numeroId } : {}),
      };
      const r = await this.deps.repo.actualizar(actual.id, cambios, actor.usuarioId);
      return r.status === "guardada" ? { status: "guardada", vista: vistaDe(r.integracion) } : r;
    });
  }

  async probar(actor: Actor | null, id: string): Promise<ProbarIntegracionResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    const organizacionId = actor.organizacionId;
    if (!FORMA_UUID.test(id)) return NO_ENCONTRADA;

    return conEmpresa(organizacionId, async (): Promise<ProbarIntegracionResultado> => {
      const actual = await this.deps.repo.porId(id);
      if (actual === null) return NO_ENCONTRADA;
      const limite = await this.revisarLimite();
      if (limite !== null) return limite;

      const credencial = await this.credencialEditada(actual, {}, organizacionId);
      // Ilegible: no hay nada que mandar al proveedor. Se registra como prueba mala con su código,
      // para que la tarjeta diga «vuelve a escribir la credencial» (R15, R29).
      const resultado: ResultadoPruebaGuardado =
        credencial === null
          ? { ok: false, codigo: "credencial_ilegible" }
          : resultadoGuardable(
              actual.servicio,
              await this.probarCon(actual.servicio, credencial, datosPruebaDe(actual.servicio, publicosWhatsappDeFila(actual))),
            );

      const registrada = await this.deps.repo.registrarPrueba(actual.id, resultado, this.reloj(), actor.usuarioId);
      if (!registrada) return NO_ENCONTRADA;
      return resultado.ok
        ? { status: "probada", ok: true }
        : {
            status: "probada",
            ok: false,
            codigo: resultado.codigo,
            texto: textoDelUltimoError(resultado.codigo) ?? TEXTO_ERROR_DESCONOCIDO,
          };
    });
  }

  async regenerarToken(actor: Actor | null, id: string): Promise<RegenerarTokenResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    const organizacionId = actor.organizacionId;
    if (!FORMA_UUID.test(id)) return NO_ENCONTRADA;

    return conEmpresa(organizacionId, async (): Promise<RegenerarTokenResultado> => {
      const token = this.deps.aleatoria.nuevoTokenVerificacion();
      // R18: el repositorio recibe el resumen; el token en claro solo sale en esta respuesta. El
      // anterior deja de valer en el mismo `UPDATE`.
      const ok = await this.deps.repo.regenerarToken(id, this.deps.resumen.resumen(token), actor.usuarioId);
      return ok ? { status: "regenerado", token, urlWebhook: this.deps.urlWebhook } : NO_ENCONTRADA;
    });
  }

  async desconectar(actor: Actor | null, id: string): Promise<DesconectarIntegracionResultado> {
    if (actor?.rol !== "maestro" || !actor.organizacionId) return FORBIDDEN;
    const organizacionId = actor.organizacionId;
    if (!FORMA_UUID.test(id)) return NO_ENCONTRADA;

    return conEmpresa(organizacionId, async (): Promise<DesconectarIntegracionResultado> => {
      const servicio = await this.deps.repo.borrar(id, actor.usuarioId);
      return servicio === null ? NO_ENCONTRADA : { status: "desconectada", servicio };
    });
  }

  /* ------------------------------------------------------------------------ */

  /**
   * R16: el contador sube ANTES de llamar al proveedor (design §6). Al revés, una ráfaga se colaría
   * entera antes de que la primera terminara de contar.
   */
  private async revisarLimite(): Promise<Limite | null> {
    const { intentos, minuto } = await this.deps.pruebas.sumarPrueba();
    if (intentos <= this.limitePorMinuto()) return null;
    // El minuto lo fija la base; el reloj de la instancia puede ir desfasado, de ahí el 1..60.
    const restanteS = Math.ceil((minuto.getTime() + 60_000 - this.reloj().getTime()) / 1000);
    return { status: "limite", reintentarEnS: Math.min(60, Math.max(1, restanteS)) };
  }

  private async probarCon(
    servicio: ServicioIntegracion,
    credencial: Readonly<Record<string, string>>,
    datos: DatosPruebaPorServicio[ServicioIntegracion],
  ): Promise<ResultadoPrueba<ServicioIntegracion>> {
    // El catálogo garantiza que `credencial` trae los campos de ese servicio; TypeScript no puede
    // correlacionar el índice del mapa de probadores con el de la credencial.
    const probador = this.deps.probadores[servicio] as unknown as {
      probar(c: unknown, d: unknown): Promise<ResultadoPrueba<ServicioIntegracion>>;
    };
    return probador.probar(credencial, datos);
  }

  private credencialDeEntrada(servicio: ServicioIntegracion, entrada: EntradaPlana): Record<string, string> {
    const credencial: Record<string, string> = {};
    for (const campo of camposSecretos(servicio)) credencial[campo] = entrada[campo] ?? "";
    return credencial;
  }

  /**
   * La credencial completa para probar: lo nuevo de la entrada y, para lo demás, lo guardado
   * descifrado con el contexto de ESTA empresa. `null` si algo guardado no se lee.
   */
  private async credencialEditada(
    actual: IntegracionConSecretos,
    nuevos: Readonly<Record<string, string>>,
    organizacionId: string,
  ): Promise<CredencialPorServicio[ServicioIntegracion] | null> {
    const credencial: Record<string, string> = {};
    for (const campo of camposSecretos(actual.servicio)) {
      const nuevo = nuevos[campo];
      if (nuevo !== undefined) {
        credencial[campo] = nuevo;
        continue;
      }
      const guardado = actual.secretos[campo];
      if (guardado === undefined) return null;
      try {
        credencial[campo] = await this.deps.cifrador.descifrar(guardado, { organizacionId, integracionId: actual.id, campo });
      } catch (error) {
        // Solo lo ilegible es un caso de negocio; una bóveda sin configurar (R4) se propaga.
        if (error instanceof CredencialIlegibleError) return null;
        throw error;
      }
    }
    return credencial as CredencialPorServicio[ServicioIntegracion];
  }

  /** Cada secreto ligado a `{empresa del actor, id de la fila, campo}` (R1, R7). */
  private async cifrar(
    secretos: Readonly<Record<string, string>>,
    organizacionId: string,
    integracionId: string,
  ): Promise<Record<string, string>> {
    const cifrados: Record<string, string> = {};
    for (const [campo, texto] of Object.entries(secretos)) {
      cifrados[campo] = await this.deps.cifrador.cifrar(texto, { organizacionId, integracionId, campo });
    }
    return cifrados;
  }

  private async guardarSinProbar(
    actual: IntegracionConSecretos,
    publicos: PublicosEditados,
    usuarioId: string,
  ): Promise<EditarIntegracionResultado> {
    // Nada cambia: no se escribe ni se deja una fila de historial que no cuenta nada.
    if (!publicos.cambiaNombre || actual.servicio !== "whatsapp" || publicos.whatsapp === null) {
      return { status: "guardada", vista: vistaDe(actual) };
    }
    const datosPublicos = {
      nombreVisible: publicos.whatsapp.nombreVisible,
      wabaId: actual.datosPublicos.wabaId,
      telefonoVisible: actual.datosPublicos.telefonoVisible,
      nombreVerificado: actual.datosPublicos.nombreVerificado,
    };
    const r = await this.deps.repo.actualizar(actual.id, { datosPublicos }, usuarioId);
    return r.status === "guardada" ? { status: "guardada", vista: vistaDe(r.integracion) } : r;
  }
}

/* -------------------------------------------------------------------------- */
/* Ayudas de la edición                                                         */
/* -------------------------------------------------------------------------- */

interface PublicosEditados {
  /** Los datos de WhatsApp tras aplicar la entrada sobre lo guardado; `null` en otro servicio. */
  whatsapp: { numeroId: string; wabaId: string; nombreVisible: string } | null;
  cambiaVerificado: boolean;
  cambiaNombre: boolean;
}

function publicosWhatsappDeEntrada(entrada: EntradaPlana): { numeroId: string; wabaId: string; nombreVisible: string } {
  return { numeroId: entrada.numeroId ?? "", wabaId: entrada.wabaId ?? "", nombreVisible: entrada.nombreVisible ?? "" };
}

function publicosWhatsappDeFila(fila: IntegracionGuardada): { numeroId: string; wabaId: string; nombreVisible: string } | null {
  if (fila.servicio !== "whatsapp") return null;
  return { numeroId: fila.whatsappNumeroId ?? "", wabaId: fila.datosPublicos.wabaId, nombreVisible: fila.datosPublicos.nombreVisible };
}

function publicosEditados(actual: IntegracionGuardada, entrada: EntradaPlana): PublicosEditados {
  const guardados = publicosWhatsappDeFila(actual);
  if (guardados === null) return { whatsapp: null, cambiaVerificado: false, cambiaNombre: false };
  const whatsapp = {
    numeroId: entrada.numeroId ?? guardados.numeroId,
    wabaId: entrada.wabaId ?? guardados.wabaId,
    nombreVisible: entrada.nombreVisible ?? guardados.nombreVisible,
  };
  return {
    whatsapp,
    cambiaVerificado: whatsapp.numeroId !== guardados.numeroId || whatsapp.wabaId !== guardados.wabaId,
    cambiaNombre: whatsapp.nombreVisible !== guardados.nombreVisible,
  };
}

/** R14: solo los secretos que llegaron con texto; vacío o ausente se conserva. */
function secretosNuevos(servicio: ServicioIntegracion, entrada: EntradaPlana): Record<string, string> {
  const nuevos: Record<string, string> = {};
  for (const campo of camposSecretos(servicio)) {
    const valor = entrada[campo];
    if (valor !== undefined && valor !== "") nuevos[campo] = valor;
  }
  return nuevos;
}

function resultadoGuardable(
  servicio: ServicioIntegracion,
  prueba: ResultadoPrueba<ServicioIntegracion>,
): ResultadoPruebaGuardado {
  if (prueba.ok) return { ok: true };
  return { ok: false, codigo: codigoPruebaFallida(servicio, prueba.motivo as never) };
}
