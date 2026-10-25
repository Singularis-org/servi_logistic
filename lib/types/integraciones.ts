import { z } from "zod";

// SL-36 (design §7, §8; R13, R31, R34, R35) — el CATÁLOGO de servicios: la única fuente de los
// campos, los secretos, la marca, «qué deja de funcionar», la guía y los textos de error de cada
// una de las cuatro integraciones.
//
// Por qué una sola fuente: la pantalla, el aviso de desconexión, el service y los tests leen de
// aquí. Un texto copiado en un componente divergiría del que el test de R31 compara con el design.
//
// Por qué los textos son propios y no del proveedor (D3): el mensaje de Meta, Google o Anthropic
// puede traer ids, la URL con la clave o detalles internos. A la pantalla solo llega el código del
// catálogo; el detalle va al log del probador.

/* -------------------------------------------------------------------------- */
/* Servicios, estados y marcas                                                  */
/* -------------------------------------------------------------------------- */

/** El orden es el de la pantalla y el de la lectura de estado del superadmin (design §11). */
export const SERVICIOS_INTEGRACION = ["whatsapp", "google_maps", "optimizacion_rutas", "asistente"] as const;

export type ServicioIntegracion = (typeof SERVICIOS_INTEGRACION)[number];

export function esServicioIntegracion(valor: unknown): valor is ServicioIntegracion {
  return typeof valor === "string" && (SERVICIOS_INTEGRACION as readonly string[]).includes(valor);
}

/** Lo que guarda la fila. «Sin configurar» no se guarda: es la ausencia de fila (D7). */
export type EstadoIntegracion = "conectada" | "error";

/** Lo que ve el maestro y el superadmin (R34, R37). */
export type EstadoVisibleIntegracion = EstadoIntegracion | "sin_configurar";

export type MarcaIntegracion = "requerido" | "recomendado";

/**
 * PROVISIONAL (requirements.md, pregunta abierta 1; leader, 2026-10-24): la propuesta conservadora
 * mientras Carlos no la confirme en el PR. Es una constante a propósito: cambiar la marca es cambiar
 * esta tabla y nada más.
 */
export const MARCAS_INTEGRACION: Readonly<Record<ServicioIntegracion, MarcaIntegracion>> = {
  whatsapp: "requerido",
  google_maps: "requerido",
  optimizacion_rutas: "recomendado",
  asistente: "recomendado",
};

/* -------------------------------------------------------------------------- */
/* Secretos, datos de prueba y datos públicos                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de cada secreto tal como se cifra: va en los datos asociados de la bóveda (R1), así que
 * renombrar uno deja ilegible lo ya guardado.
 */
export const CAMPOS_SECRETOS = {
  whatsapp: ["token_acceso", "app_secret"],
  google_maps: ["clave_api"],
  optimizacion_rutas: ["clave_cuenta_servicio"],
  asistente: ["clave_api"],
} as const satisfies Record<ServicioIntegracion, readonly string[]>;

export type CampoSecreto<S extends ServicioIntegracion> = (typeof CAMPOS_SECRETOS)[S][number];

/** Secretos en claro por servicio: lo que recibe el probador y lo que cifra el service. */
export type CredencialPorServicio = { [S in ServicioIntegracion]: Record<CampoSecreto<S>, string> };

/** Lo que la prueba necesita además del secreto: lo que el maestro escribe en claro. */
export interface DatosPruebaPorServicio {
  whatsapp: { numeroId: string; wabaId: string; nombreVisible: string };
  google_maps: Record<string, never>;
  optimizacion_rutas: Record<string, never>;
  asistente: Record<string, never>;
}

/**
 * Lo que devuelve una prueba buena. En WhatsApp trae el `numeroId`, que al guardarse va a su
 * columna (`whatsapp_numero_id`, único entre empresas, R11) y no al JSON.
 */
export interface DatosPublicosPorServicio {
  whatsapp: {
    numeroId: string;
    wabaId: string;
    nombreVisible: string;
    telefonoVisible: string;
    nombreVerificado: string;
  };
  google_maps: Record<string, never>;
  optimizacion_rutas: { proyectoId: string; cuentaServicio: string };
  asistente: Record<string, never>;
}

/**
 * El zod de `datos_publicos` por servicio (design §2.1, §8): el repositorio lo aplica al escribir y
 * al leer, para que la columna JSON no sea «JSON sin esquema».
 *
 * `strictObject` a propósito: una clave de más no se descarta en silencio, se rechaza. Es la red
 * contra un secreto que alguien metiera por error en lo que la pantalla sí muestra (R5).
 */
const texto = z.string().min(1).max(255);

export const ESQUEMAS_DATOS_PUBLICOS = {
  whatsapp: z.strictObject({
    nombreVisible: texto,
    wabaId: texto,
    telefonoVisible: texto,
    nombreVerificado: z.string().max(255),
  }),
  google_maps: z.strictObject({}),
  optimizacion_rutas: z.strictObject({ proyectoId: texto, cuentaServicio: texto }),
  asistente: z.strictObject({}),
} as const satisfies Record<ServicioIntegracion, z.ZodType>;

/** Lo que guarda `datos_publicos` de cada servicio. */
export type DatosPublicosGuardados<S extends ServicioIntegracion> = z.infer<(typeof ESQUEMAS_DATOS_PUBLICOS)[S]>;

/* -------------------------------------------------------------------------- */
/* Motivos de una prueba fallida                                                */
/* -------------------------------------------------------------------------- */

/**
 * Motivos compartidos. `sin_respuesta` junta red y timeout porque para el maestro son lo mismo
 * («no contestó, vuelve a intentar»); el log sí los distingue.
 */
export const MOTIVOS_PRUEBA_COMUNES = ["credencial_rechazada", "sin_respuesta", "proveedor", "respuesta_invalida"] as const;

export type MotivoPruebaComun = (typeof MOTIVOS_PRUEBA_COMUNES)[number];

export const MOTIVOS_PRUEBA = {
  whatsapp: [...MOTIVOS_PRUEBA_COMUNES, "sin_permiso", "numero_no_encontrado", "waba_no_encontrada"],
  google_maps: [...MOTIVOS_PRUEBA_COMUNES],
  optimizacion_rutas: [...MOTIVOS_PRUEBA_COMUNES, "clave_mal_formada"],
  asistente: [...MOTIVOS_PRUEBA_COMUNES],
} as const satisfies Record<ServicioIntegracion, readonly string[]>;

export type MotivoPruebaPorServicio = { [S in ServicioIntegracion]: (typeof MOTIVOS_PRUEBA)[S][number] };

/** `prueba_fallida.<servicio>.<motivo>` (design §4): lo que se guarda en `ultimo_error_codigo`. */
export type CodigoPruebaFallida = {
  [S in ServicioIntegracion]: `prueba_fallida.${S}.${MotivoPruebaPorServicio[S]}`;
}[ServicioIntegracion];

export function codigoPruebaFallida<S extends ServicioIntegracion>(
  servicio: S,
  motivo: MotivoPruebaPorServicio[S],
): CodigoPruebaFallida {
  return `prueba_fallida.${servicio}.${motivo}` as CodigoPruebaFallida;
}

/* -------------------------------------------------------------------------- */
/* Rechazo durante el USO (R29, R30)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Lo que un consumidor deja en la integración cuando el proveedor rechaza la credencial en un uso
 * real (R30). Rutas tiene además `permiso`: la prueba no verifica que la API esté habilitada ni el
 * rol de la cuenta, y eso solo aparece en la primera optimización (design §5).
 */
export const CODIGOS_RECHAZO_USO = [
  "whatsapp.credencial_rechazada",
  "google_maps.credencial_rechazada",
  "optimizacion_rutas.credencial_rechazada",
  "optimizacion_rutas.permiso",
  "asistente.credencial_rechazada",
] as const;

export type CodigoRechazoUso = (typeof CODIGOS_RECHAZO_USO)[number];

/* -------------------------------------------------------------------------- */
/* Formulario                                                                   */
/* -------------------------------------------------------------------------- */

/** Medidas de un secreto (design §4): la clave de una cuenta de servicio es un JSON de ~2,3 KB. */
export const SECRETO_MIN = 1;
export const SECRETO_MAX = 4096;

export interface CampoFormularioIntegracion {
  /** Nombre del campo en el formulario y en la entrada de la action. */
  readonly nombre: string;
  readonly etiqueta: string;
  /** Un secreto se pinta como contraseña, sin valor inicial, y no vuelve al formulario (R36). */
  readonly secreto: boolean;
  /** Varias líneas: el JSON de la clave de la cuenta de servicio. */
  readonly multilinea?: boolean;
}

/* -------------------------------------------------------------------------- */
/* El catálogo                                                                  */
/* -------------------------------------------------------------------------- */

export interface EntradaCatalogoIntegracion<S extends ServicioIntegracion> {
  readonly servicio: S;
  readonly nombre: string;
  readonly marca: MarcaIntegracion;
  /** El aviso de R31, antes de confirmar la desconexión. Literal del design §7. */
  readonly queDejaDeFuncionar: string;
  /** Ruta de su guía paso a paso en la ayuda de la app (R35). */
  readonly guia: string;
  readonly campos: readonly CampoFormularioIntegracion[];
  readonly secretos: readonly CampoSecreto<S>[];
  /** El texto de cada motivo de prueba fallida (R13). */
  readonly textosPruebaFallida: Readonly<Record<MotivoPruebaPorServicio[S], string>>;
}

export type CatalogoIntegraciones = { readonly [S in ServicioIntegracion]: EntradaCatalogoIntegracion<S> };

/** Los textos comunes; cada servicio los repite con su nombre para que el maestro sepa cuál falló. */
function textosComunes(nombre: string, dondeSeRevisa: string): Record<MotivoPruebaComun, string> {
  return {
    credencial_rechazada: `${nombre} rechazó la credencial. Revisa que la copiaste entera y que sigue vigente en ${dondeSeRevisa}.`,
    sin_respuesta: `${nombre} no respondió a tiempo. Vuelve a intentarlo en unos minutos.`,
    proveedor: `${nombre} respondió con un error de su lado. Vuelve a intentarlo más tarde.`,
    respuesta_invalida: `${nombre} respondió algo que no esperábamos. Vuelve a intentarlo; si se repite, revisa la guía.`,
  };
}

export const CATALOGO_INTEGRACIONES: CatalogoIntegraciones = {
  whatsapp: {
    servicio: "whatsapp",
    nombre: "WhatsApp Business",
    marca: MARCAS_INTEGRACION.whatsapp,
    queDejaDeFuncionar:
      "No salen los avisos automáticos a los clientes, no hay chat con ellos, no se envía el mensaje de bienvenida y no se pueden crear ni sincronizar plantillas.",
    guia: "/ayuda/oficina/integracion-whatsapp",
    campos: [
      { nombre: "nombreVisible", etiqueta: "Nombre visible", secreto: false },
      { nombre: "numeroId", etiqueta: "Phone Number ID", secreto: false },
      { nombre: "wabaId", etiqueta: "WABA ID", secreto: false },
      { nombre: "token_acceso", etiqueta: "Token de acceso", secreto: true },
      { nombre: "app_secret", etiqueta: "App Secret", secreto: true },
    ],
    secretos: CAMPOS_SECRETOS.whatsapp,
    textosPruebaFallida: {
      ...textosComunes("WhatsApp", "el panel de Meta"),
      sin_permiso:
        "El token no tiene permiso sobre ese número o esa cuenta de WhatsApp Business. Revisa los permisos del usuario del sistema en Meta.",
      numero_no_encontrado:
        "Meta no encuentra ese Phone Number ID con este token. Revisa que copiaste el identificador del número, no el número de teléfono.",
      waba_no_encontrada:
        "Meta no encuentra ese WABA ID con este token. Revisa el identificador de la cuenta de WhatsApp Business.",
    },
  },
  google_maps: {
    servicio: "google_maps",
    nombre: "Google Maps",
    marca: MARCAS_INTEGRACION.google_maps,
    queDejaDeFuncionar:
      "Las órdenes nuevas se quedan sin ubicación. Se pueden asignar igual, pero no aparecen en el mapa y la ruta del mensajero no las ordena por cercanía. Las direcciones que la app ya conocía siguen ubicándose.",
    guia: "/ayuda/oficina/integracion-google-maps",
    campos: [{ nombre: "clave_api", etiqueta: "Clave de API", secreto: true }],
    secretos: CAMPOS_SECRETOS.google_maps,
    textosPruebaFallida: textosComunes("Google Maps", "Google Cloud (y que la Geocoding API está habilitada)"),
  },
  optimizacion_rutas: {
    servicio: "optimizacion_rutas",
    nombre: "Optimización de rutas",
    marca: MARCAS_INTEGRACION.optimizacion_rutas,
    queDejaDeFuncionar:
      "La ruta de cada mensajero se ordena con un cálculo aproximado en línea recta, sin calles ni tráfico, y el mapa no dibuja el trazado.",
    guia: "/ayuda/oficina/integracion-optimizacion-rutas",
    campos: [
      {
        nombre: "clave_cuenta_servicio",
        etiqueta: "JSON de la clave de la cuenta de servicio",
        secreto: true,
        multilinea: true,
      },
    ],
    secretos: CAMPOS_SECRETOS.optimizacion_rutas,
    textosPruebaFallida: {
      ...textosComunes("Google", "Google Cloud (la cuenta de servicio y su clave)"),
      clave_mal_formada:
        "Lo pegado no es el JSON de la clave de una cuenta de servicio. Pega el archivo entero que descargaste de Google Cloud.",
    },
  },
  asistente: {
    servicio: "asistente",
    nombre: "Asistente IA",
    marca: MARCAS_INTEGRACION.asistente,
    queDejaDeFuncionar:
      "El panel del asistente dice que no está configurado. La ayuda escrita de cada pantalla sigue disponible.",
    guia: "/ayuda/oficina/integracion-asistente",
    campos: [{ nombre: "clave_api", etiqueta: "Clave de API", secreto: true }],
    secretos: CAMPOS_SECRETOS.asistente,
    textosPruebaFallida: textosComunes("Anthropic", "la consola de Anthropic"),
  },
};

/* -------------------------------------------------------------------------- */
/* Errores de las operaciones (design §4)                                       */
/* -------------------------------------------------------------------------- */

export const CODIGOS_ERROR_INTEGRACION = [
  "forbidden",
  "invalid_input",
  "no_encontrada",
  "ya_existe",
  "numero_ocupado",
  "limite",
  "credencial_ilegible",
  "unexpected",
] as const;

export type CodigoErrorIntegracion = (typeof CODIGOS_ERROR_INTEGRACION)[number];

/**
 * El texto de cada error. `no_encontrada` es UNO para «no existe», «es de otra empresa» y «id sin
 * forma» (R9): distinguirlos diría a otra empresa qué ids existen. `numero_ocupado` no dice qué
 * empresa tiene el número (R11).
 */
export const TEXTOS_ERROR_INTEGRACION: Readonly<Record<CodigoErrorIntegracion, string>> = {
  forbidden: "Solo el maestro de la empresa puede configurar las integraciones.",
  invalid_input: "Revisa los campos marcados.",
  no_encontrada: "No encontramos esa integración. Recarga la página.",
  ya_existe: "Tu empresa ya tiene configurado este servicio. Edítalo o desconéctalo primero.",
  numero_ocupado: "Ese número de WhatsApp ya está conectado en otra cuenta. Usa otro número o desconéctalo allí primero.",
  limite: "Hiciste muchas pruebas seguidas. Espera un momento y vuelve a intentarlo.",
  credencial_ilegible: "No pudimos leer la credencial guardada. Vuelve a escribir la credencial.",
  unexpected: "Algo falló al guardar. Si se repite, comparte la referencia con soporte.",
};

/** El texto del rechazo de una credencial durante el uso (R30). */
export const TEXTOS_RECHAZO_USO: Readonly<Record<CodigoRechazoUso, string>> = {
  "whatsapp.credencial_rechazada": "Meta rechazó el token al enviar un mensaje. Vuelve a escribir el token de acceso.",
  "google_maps.credencial_rechazada": "Google rechazó la clave al ubicar una dirección. Revisa la clave de API.",
  "optimizacion_rutas.credencial_rechazada":
    "Google rechazó la clave de la cuenta de servicio al ordenar una ruta. Vuelve a pegar el JSON de la clave.",
  "optimizacion_rutas.permiso":
    "La cuenta de servicio no tiene permiso para optimizar rutas. Habilita la Route Optimization API y dale el rol a la cuenta.",
  "asistente.credencial_rechazada": "Anthropic rechazó la clave al responder una consulta. Vuelve a escribir la clave de API.",
};

/** Último recurso para un código guardado que el catálogo ya no conoce: nunca se pinta el código. */
export const TEXTO_ERROR_DESCONOCIDO = "La integración tiene un error. Prueba la conexión otra vez.";

/**
 * El texto del último error de una integración (R34), a partir del código guardado. Nunca devuelve
 * el código ni texto del proveedor: lo que no está en el catálogo sale con el texto genérico.
 */
export function textoDelUltimoError(codigo: string | null): string | null {
  if (codigo === null) return null;
  if (codigo === "credencial_ilegible") return TEXTOS_ERROR_INTEGRACION.credencial_ilegible;
  if ((CODIGOS_RECHAZO_USO as readonly string[]).includes(codigo)) {
    return TEXTOS_RECHAZO_USO[codigo as CodigoRechazoUso];
  }
  const partes = /^prueba_fallida\.([a-z_]+)\.([a-z_]+)$/.exec(codigo);
  const servicio = partes?.[1];
  const motivo = partes?.[2];
  if (esServicioIntegracion(servicio) && motivo !== undefined) {
    const textos = CATALOGO_INTEGRACIONES[servicio].textosPruebaFallida as Readonly<Record<string, string>>;
    // `hasOwn` y no `in`: un motivo como `toString` no puede resolver a algo del prototipo.
    return Object.hasOwn(textos, motivo) ? textos[motivo] : TEXTO_ERROR_DESCONOCIDO;
  }
  return TEXTO_ERROR_DESCONOCIDO;
}
