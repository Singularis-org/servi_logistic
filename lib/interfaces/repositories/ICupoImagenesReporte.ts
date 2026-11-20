// SLT-98 (design §16.3; R24–R27, R31) — el tope diario de imágenes de los reportes de problema.
//
// En un archivo propio, y no dentro de `IBugReportRepository`, para que los dobles de SLT-97 que
// implementan esa interfaz no tengan que cambiar. `fecha` es siempre `YYYY-MM-DD`, la del día
// calendario en la zona horaria del país de la empresa (la fecha la calcula el servidor); el usuario
// sale de la sesión (R31).

export interface ICupoImagenesReporte {
  /**
   * R24–R26, tope blando: si el conteo del día es menor que `tope` (o no hay fila), suma `n` y devuelve el
   * total nuevo, aunque pase de `tope`. Si ya es `tope` o más, devuelve null y no escribe nada.
   */
  consumir(usuarioId: string, fecha: string, n: number, tope: number): Promise<number | null>;
  /** R27: resta `n` sin bajar de 0. Si no hay fila, no hace nada. */
  devolver(usuarioId: string, fecha: string, n: number): Promise<void>;
}
