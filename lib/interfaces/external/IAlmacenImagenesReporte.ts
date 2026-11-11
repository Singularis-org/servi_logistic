// SLT-98 (design §3.2; R9, R10, R11, R16, R20-R23) — contrato del almacén de las imágenes de los reportes
// de problema. Abstrae Supabase Storage para que el servicio se pruebe con dobles, sin red.
// SL-19: toda ruta es RELATIVA a la carpeta de la empresa en curso (`<organizacion_id>/`), que pone el
// adaptador; aquí la ruta es `<usuario_id>/<imagen_id>.<ext>`.

export interface IAlmacenImagenesReporte {
  /** R9, R16: URL firmada de subida (sin upsert) para `ruta`; crea el bucket si falta. */
  prepararSubida(ruta: string): Promise<{ url: string }>;
  /** R10: los bytes, o `null` si el objeto (o el bucket) no existe. Otro error se propaga. */
  leer(ruta: string): Promise<Uint8Array | null>;
  /** R20–R23: URL firmada de lectura por ruta. Parcial: omite la que no pudo firmar. */
  firmar(rutas: string[], ttlSegundos: number): Promise<Record<string, string>>;
  /** R11: borra lo que el envío rechazó. Propaga el error; el servicio lo trata como mejor esfuerzo. */
  borrar(rutas: string[]): Promise<void>;
}
