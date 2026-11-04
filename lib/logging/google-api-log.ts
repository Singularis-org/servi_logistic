// SLT-59 (D27, R69, R74; design §13.0) — el canal por defecto de la línea `[google-api]`.
//
// Vive aquí y no en `lib/clients/` porque esa carpeta no escribe en la consola directamente
// (guardia `credenciales-sin-consola-cruda`): los clientes reciben un logger inyectable y este es
// el real. Va por `console.info`, el mismo `console` que acaba en los logs de Vercel. Nunca se
// escribe en base (R74).
//
// A diferencia de `optlog`, esta línea NO depende de `RUTA_DEBUG_LOG`: cuenta llamadas facturadas
// y tiene que salir siempre. Por eso solo lleva ids, conteos y códigos (R71), nunca coordenadas.

/** Sink de una línea ya compuesta. Los tests lo sustituyen por un doble. */
export interface RegistroLlamadaLogger {
  info(linea: string): void;
}

export const registroGoogleApiEnConsola: RegistroLlamadaLogger = {
  info: (linea) => console.info(linea),
};
