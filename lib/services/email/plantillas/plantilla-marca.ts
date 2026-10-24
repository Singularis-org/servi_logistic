import { MARCA } from "@/lib/config/marca";
import type { EmailMessage, ImagenEnLinea } from "@/lib/interfaces/external/IEmailSender";
import { LOGO_CORREO_PNG_BASE64 } from "@/lib/services/email/plantillas/logo-correo";

// SL-41 (design §3, R1–R6, R39) — LA plantilla de todos los correos de la app.
//
// Cada correo monta una lista de bloques y llama a `componerCorreo`: el texto plano y el HTML
// salen de la misma lista, así que no pueden decir cosas distintas (R5), y ningún correo puede
// escribirse fuera de la marca (R1).
//
// El HTML es el de un cliente de correo, no el de un navegador: maquetación por tablas, ancho
// máximo de 600 px y todos los estilos en línea. Gmail y Outlook quitan `<style>` y las hojas
// externas, y Outlook ignora el `padding` de los `<p>`; por eso los rellenos van en celdas.
//
// Paleta (docs/marca.md): #111111 (Negro Servi), #FFD000 (Amarillo Señal, solo como franja),
// #F7F7F5 (fondo claro) y #FFFFFF. El texto secundario es #585858 = componer(#111111, #FFFFFF,
// 0.70), una mezcla declarada (R3). El amarillo NUNCA es color de texto: sobre blanco da 1.47:1.

export type Bloque =
  | { tipo: "parrafo"; texto: string }
  /** El OTP, solo en su propia línea del texto plano (R10): el E2E lo lee así del log. */
  | { tipo: "codigo"; codigo: string }
  /** HTML: botón y la URL visible debajo. Texto plano: `<texto>: <url>`. */
  | { tipo: "boton"; texto: string; url: string }
  /** Texto secundario, sobre fondo claro: avisos de seguridad y de caducidad. */
  | { tipo: "nota"; texto: string };

export interface CorreoDeMarca {
  to: string;
  asunto: string;
  /** Línea de vista previa que muestran los clientes de correo; no se ve en el cuerpo. */
  preheader: string;
  bloques: Bloque[];
  /**
   * URL base de la app, sin barra final. `null`: cabecera de texto, sin imagen (R4). El logo ya no
   * se carga desde esta URL (va en línea), pero R4 sigue atando la cabecera a ella.
   */
  baseUrl: string | null;
  /** Dirección de contacto del pie (R39). `null`: el pie no muestra ninguna. */
  contacto: string | null;
}

const COLOR = {
  tinta: "#111111",
  acento: "#FFD000",
  fondoClaro: "#F7F7F5",
  blanco: "#FFFFFF",
  /** componer(#111111, #FFFFFF, 0.70): 7.11:1 sobre blanco y 6.63:1 sobre #F7F7F5. */
  tintaSecundaria: "#585858",
} as const;

/** Archivo no carga en casi ningún cliente de correo: el respaldo tiene que ser legible. */
const FUENTE = "Archivo, Arial, Helvetica, sans-serif";

/**
 * El logo viaja DENTRO del correo, como imagen en línea, y el HTML lo pinta con `cid:` (decisión de
 * Carlos, 2026-10-24). Con un `src` absoluto no se veía en local y dependía de que la URL
 * resolviera y de que el cliente cargara imágenes remotas. PNG de 360 px (el doble del ancho
 * pintado), generado por `scripts/generar-logo-correo.mjs`: los clientes de correo no pintan SVG.
 */
export const CID_LOGO = "logo@servilogistic";

const IMAGEN_LOGO: ImagenEnLinea = {
  cid: CID_LOGO,
  nombreArchivo: "servi-logistic.png",
  tipoContenido: "image/png",
  contenidoBase64: LOGO_CORREO_PNG_BASE64,
};

/** 180 px: por encima de los 140 px por debajo de los cuales docs/marca.md pide el isotipo. */
const ANCHO_LOGO = 180;

const PIE_AUTOMATICO = `${MARCA.nombre} · Este correo se envió automáticamente; no lo respondas.`;

/** No escapa: el HTML le pasa el enlace `mailto:` ya escapado, y el texto plano, el email tal cual. */
function lineaDeContacto(contacto: string): string {
  return `¿Dudas? Escríbenos a ${contacto}.`;
}

/**
 * Escapa un texto para interpolarlo en el HTML, como contenido o como valor de un atributo entre
 * comillas dobles. Todo dato variable pasa por aquí (R6): el nombre del maestro, la empresa, el
 * email, el código, las URLs y el contacto.
 */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TABLA = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function cabeceraHtml(baseUrl: string | null): string {
  const contenido =
    baseUrl === null
      ? `<p style="margin:0;font-family:${FUENTE};font-size:22px;line-height:28px;font-weight:700;color:${COLOR.tinta};">${escaparHtml(MARCA.nombre)}</p>`
      : // El estilo de texto del <img> es para el `alt`: con las imágenes bloqueadas, el cliente
        // pinta el nombre con la tinta de la marca en vez del azul de un enlace.
        `<img src="cid:${CID_LOGO}" alt="${escaparHtml(MARCA.nombre)}" width="${ANCHO_LOGO}" style="display:block;width:${ANCHO_LOGO}px;max-width:${ANCHO_LOGO}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FUENTE};font-size:20px;font-weight:700;color:${COLOR.tinta};">`;
  return [
    `<tr><td data-zona="cabecera" style="padding:24px 32px;background-color:${COLOR.blanco};">${contenido}</td></tr>`,
    `<tr><td style="height:4px;line-height:4px;font-size:0;background-color:${COLOR.acento};">&nbsp;</td></tr>`,
  ].join("");
}

function parrafoHtml(texto: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FUENTE};font-size:16px;line-height:24px;color:${COLOR.tinta};">${escaparHtml(texto)}</p>`;
}

function codigoHtml(codigo: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FUENTE};font-size:28px;line-height:36px;font-weight:700;letter-spacing:6px;color:${COLOR.tinta};">${escaparHtml(codigo)}</p>`;
}

/**
 * Botón «bulletproof»: el fondo va en la celda (con `bgcolor`, que es lo que respeta Outlook) y el
 * `<a>` lleva relleno y color. Debajo, la URL completa como texto: hay clientes que no dejan
 * pulsar el botón, y el maestro tiene que poder copiar el enlace (R13).
 */
function botonHtml(texto: string, url: string): string {
  const href = escaparHtml(url);
  return [
    `<table ${TABLA} style="margin:8px 0 16px 0;"><tr>`,
    `<td align="center" bgcolor="${COLOR.tinta}" style="background-color:${COLOR.tinta};border-radius:4px;">`,
    `<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:16px;line-height:20px;font-weight:700;color:${COLOR.blanco};text-decoration:none;border-radius:4px;">${escaparHtml(texto)}</a>`,
    `</td></tr></table>`,
    `<p style="margin:0 0 16px 0;font-family:${FUENTE};font-size:13px;line-height:20px;color:${COLOR.tintaSecundaria};">Si el botón no funciona, copia este enlace en tu navegador:<br>`,
    `<a href="${href}" target="_blank" style="color:${COLOR.tinta};text-decoration:underline;word-break:break-all;">${href}</a></p>`,
  ].join("");
}

function notaHtml(texto: string): string {
  return `<table ${TABLA} width="100%" style="margin:0 0 12px 0;"><tr><td style="padding:12px 16px;background-color:${COLOR.fondoClaro};font-family:${FUENTE};font-size:14px;line-height:20px;color:${COLOR.tintaSecundaria};">${escaparHtml(texto)}</td></tr></table>`;
}

function bloqueHtml(b: Bloque): string {
  switch (b.tipo) {
    case "parrafo":
      return parrafoHtml(b.texto);
    case "codigo":
      return codigoHtml(b.codigo);
    case "boton":
      return botonHtml(b.texto, b.url);
    case "nota":
      return notaHtml(b.texto);
  }
}

function pieHtml(contacto: string | null): string {
  const lineas = [escaparHtml(PIE_AUTOMATICO)];
  if (contacto !== null) {
    const c = escaparHtml(contacto);
    lineas.push(
      lineaDeContacto(
        `<a href="mailto:${c}" style="color:${COLOR.tintaSecundaria};text-decoration:underline;">${c}</a>`,
      ),
    );
  }
  return `<tr><td data-zona="pie" style="padding:24px 32px;background-color:${COLOR.fondoClaro};font-family:${FUENTE};font-size:13px;line-height:20px;color:${COLOR.tintaSecundaria};">${lineas.join("<br>")}</td></tr>`;
}

function html(c: CorreoDeMarca): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escaparHtml(c.asunto)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${COLOR.fondoClaro};">`,
    // El preheader va oculto en el cuerpo: lo leen las bandejas como vista previa.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(c.preheader)}</div>`,
    `<table ${TABLA} width="100%" style="background-color:${COLOR.fondoClaro};"><tr><td align="center" style="padding:24px 12px;">`,
    `<table ${TABLA} width="600" style="width:100%;max-width:600px;background-color:${COLOR.blanco};">`,
    cabeceraHtml(c.baseUrl),
    `<tr><td data-zona="contenido" style="padding:32px;background-color:${COLOR.blanco};">`,
    ...c.bloques.map(bloqueHtml),
    "</td></tr>",
    pieHtml(c.contacto),
    "</table>",
    "</td></tr></table>",
    "</body></html>",
  ].join("");
}

function bloqueTexto(b: Bloque): string {
  switch (b.tipo) {
    case "parrafo":
    case "nota":
      return b.texto;
    case "codigo":
      return b.codigo;
    case "boton":
      return `${b.texto}: ${b.url}`;
  }
}

/** Texto plano (§3.3): nombre, bloques y pie, separados por una línea en blanco. */
function texto(c: CorreoDeMarca): string {
  const pie = [PIE_AUTOMATICO];
  if (c.contacto !== null) pie.push(lineaDeContacto(c.contacto));
  return [MARCA.nombre.toUpperCase(), ...c.bloques.map(bloqueTexto), pie.join("\n")].join("\n\n");
}

/**
 * Compone el mensaje completo. Función pura: depende solo de `MARCA` y de lo que recibe, así que
 * cada correo se afirma en un test sin red y sin entorno. `baseUrl` y `contacto` los pasa quien
 * llama, por la misma razón.
 */
export function componerCorreo(c: CorreoDeMarca): EmailMessage {
  const mensaje: EmailMessage = { to: c.to, subject: c.asunto, text: texto(c), html: html(c) };
  // Solo cuando la cabecera pinta el logo: un adjunto que el HTML no referencia aparece como
  // archivo suelto en algunos clientes.
  if (c.baseUrl !== null) mensaje.imagenesEnLinea = [IMAGEN_LOGO];
  return mensaje;
}
