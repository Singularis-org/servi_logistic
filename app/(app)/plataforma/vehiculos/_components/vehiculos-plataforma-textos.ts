// SL-42 (design §5; R2, R13) — los textos de la pantalla `/plataforma/vehiculos`, en un solo sitio
// para que una pasada de i18n tenga uno que tocar.
//
// R13: cada desenlace de una operación tiene su mensaje, y solo `conflict` dice «ya existe». El
// mensaje del `validation_error` y el del `conflict` van además junto al campo (los pinta el módulo).

export const TEXTOS_VEHICULOS = {
  titulo: "Vehículos",
  encabezado: "Tipos de vehículo",
  descripcion:
    "Catálogo único de la plataforma. Las empresas lo usan al dar de alta mensajeros y en la postulación pública. Un tipo desactivado deja de ofrecerse para elecciones nuevas; quien ya lo tiene lo conserva.",
  crear: "Crear vehículo",
  renombrar: "Renombrar",
  desactivar: "Desactivar",
  activar: "Activar",
  guardar: "Guardar",
  guardando: "Guardando…",
  cancelar: "Cancelar",
  tituloAlta: "Nuevo vehículo",
  tituloRenombre: "Renombrar vehículo",
  campoNombre: "Nombre",
  placeholderNombre: "Moto, carro, camión…",
  columnaNombre: "Nombre",
  columnaEstado: "Estado",
  columnaAcciones: "Acciones",
  estadoActivo: "Activo",
  estadoInactivo: "Inactivo",
  vacio: "Aún no hay tipos de vehículo. Crea el primero con «Crear vehículo».",
  // R2: un fallo de carga se dice; nunca se pinta como catálogo vacío.
  cargaError: "No se pudo cargar el catálogo de vehículos.",
  nombreObligatorio: "Este campo es obligatorio.",
} as const;

/** Etiqueta accesible de los botones de fila: nombra el vehículo para que el lector de pantalla no lea «Renombrar» cinco veces. */
export function etiquetaAccion(accion: string, nombre: string): string {
  return `${accion} ${nombre}`;
}

export type OperacionVehiculo = "alta" | "renombre" | "activacion" | "desactivacion";

/** R13: el mensaje de éxito de cada operación. */
export const MENSAJE_EXITO: Readonly<Record<OperacionVehiculo, string>> = {
  alta: "Vehículo creado.",
  renombre: "Vehículo renombrado.",
  activacion: "Vehículo activado.",
  desactivacion: "Vehículo desactivado.",
};

/** R13: un mensaje por desenlace de error. Solo `conflict` dice «ya existe». */
export const MENSAJE_ERROR = {
  validation_error: "El nombre no es válido. Revisa el campo.",
  conflict: "Ya existe un vehículo con ese nombre.",
  not_found: "Ese vehículo ya no existe. Recarga la página.",
  forbidden: "No tienes permiso para gestionar el catálogo de vehículos.",
  unauthenticated: "Tu sesión expiró. Vuelve a entrar.",
  error: "No se pudo completar la acción. Inténtalo de nuevo.",
} as const;

export type DesenlaceError = keyof typeof MENSAJE_ERROR;

/** Cualquier estado que no sea uno conocido cae en el genérico: nunca en «ya existe». */
export function mensajeDeError(status: string): string {
  return status in MENSAJE_ERROR ? MENSAJE_ERROR[status as DesenlaceError] : MENSAJE_ERROR.error;
}
