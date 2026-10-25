// SL-36 (design §6, R16) — el contador de pruebas por minuto y por empresa.

export interface ConteoPruebaMinuto {
  /** Cuántas pruebas lleva la empresa en este minuto, contando la que se acaba de sumar. */
  intentos: number;
  /** El minuto que cuenta (`date_trunc('minute', now())` de la base), para calcular cuándo reintentar. */
  minuto: Date;
}

export interface IIntegracionPruebaMinutoRepository {
  /**
   * Suma una prueba a la empresa en curso y devuelve el total del minuto, en una sola sentencia
   * atómica. Se llama ANTES de llamar al proveedor; el service decide si el total supera el límite.
   * Suma también las que se van a rechazar: el límite cuenta intentos, no pruebas atendidas.
   */
  sumarPrueba(): Promise<ConteoPruebaMinuto>;
}
