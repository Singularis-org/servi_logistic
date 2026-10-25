import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import type { EstadoVisibleIntegracion, MarcaIntegracion } from "@/lib/types/integraciones";
import { TEXTOS_ERROR_INTEGRACION } from "@/lib/types/integraciones";

type VarianteBadge = VariantProps<typeof badgeVariants>["variant"];

// SL-36 (R34) — los textos de la pantalla que NO son del catálogo: etiquetas de estado, de marca y
// de los datos públicos que pinta la tarjeta. Agrupados aquí para que una pasada de i18n tenga un
// solo sitio que tocar. Lo que es de cada servicio (nombre, «qué deja de funcionar», guía, campos,
// errores) sigue saliendo de `CATALOGO_INTEGRACIONES`: copiarlo aquí lo haría divergir.

export const ETIQUETA_ESTADO: Readonly<Record<EstadoVisibleIntegracion, string>> = {
  conectada: "Conectada",
  error: "Error",
  sin_configurar: "Sin configurar",
};

export const VARIANTE_ESTADO: Readonly<Record<EstadoVisibleIntegracion, NonNullable<VarianteBadge>>> = {
  conectada: "success",
  error: "danger",
  sin_configurar: "outline",
};

export const ETIQUETA_MARCA: Readonly<Record<MarcaIntegracion, string>> = {
  requerido: "Requerido",
  recomendado: "Recomendado",
};

/**
 * Etiqueta de cada dato público que puede traer la vista. Solo se pinta lo que está aquí: una clave
 * nueva en `datosPublicos` no aparece hasta que alguien decide cómo se llama en pantalla.
 */
export const ETIQUETA_DATO_PUBLICO: Readonly<Record<string, string>> = {
  nombreVisible: "Nombre visible",
  telefonoVisible: "Teléfono",
  nombreVerificado: "Nombre verificado por Meta",
  numeroId: "Phone Number ID",
  wabaId: "WABA ID",
  proyectoId: "Proyecto de Google Cloud",
  cuentaServicio: "Cuenta de servicio",
};

export const TEXTOS_PANTALLA = {
  ultimaPrueba: "Última prueba",
  sinPrueba: "Todavía no se ha probado",
  ultimoWebhook: "Último contacto del webhook",
  sinWebhook: "El webhook todavía no ha contactado",
  guia: "Ver la guía paso a paso",
  configurar: "Configurar",
  editar: "Editar",
  probar: "Probar conexión",
  regenerar: "Regenerar token del webhook",
  desconectar: "Desconectar",
  guardar: "Probar y guardar",
  cancelar: "Cancelar",
  secretoConservar: "Déjalo vacío para conservar el que ya está guardado.",
  pruebaCorrecta: "La conexión funciona.",
  desconectada: "Servicio desconectado.",
  referencia: "Referencia",
} as const;

/** Lo mínimo que la pantalla necesita de cualquier resultado de una action para decir qué pasó. */
export type ResultadoConMensaje =
  | { status: "prueba_fallida"; texto: string }
  | { status: "probada"; ok: false; texto: string }
  | { status: "limite"; reintentarEnS: number }
  | { status: "unexpected"; referencia: string; texto: string }
  | { status: "invalid_input" }
  | { status: "forbidden" | "no_encontrada" | "ya_existe" | "numero_ocupado" | "credencial_ilegible" };

/**
 * El texto que ve el maestro para un resultado que no salió bien. Nunca pinta un código: cada
 * rama resuelve a un texto del catálogo o al que ya trae la action (que viene del catálogo, R13).
 */
export function mensajeDeResultado(r: ResultadoConMensaje): string {
  switch (r.status) {
    case "prueba_fallida":
    case "probada":
      return r.texto;
    case "limite":
      return `${TEXTOS_ERROR_INTEGRACION.limite} Puedes volver a intentarlo en ${r.reintentarEnS} s.`;
    case "unexpected":
      // La referencia es lo único que une esta pantalla con la línea del log (T7.1, desviación 3).
      return `${r.texto} ${TEXTOS_PANTALLA.referencia}: ${r.referencia}`;
    default:
      return TEXTOS_ERROR_INTEGRACION[r.status];
  }
}
