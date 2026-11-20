// SLT-215 (design §3.5) — contrato del repositorio del cierre mensual de los niveles por volumen. Ningún método
// escribe las tablas de niveles: las escriben solo las funciones del dueño (R36), y esto solo las llama.

export interface INivelesEmpresaRepository {
  /**
   * Las empresas con fila de nivel y algún mes terminado sin cerrar respecto de `ahora` (`cerrado_hasta_at` antes
   * del inicio del mes de la plataforma que contiene `ahora`). Los días sin pendientes, vacía.
   */
  empresasConMesPendiente(ahora: Date): Promise<string[]>;

  /**
   * `plan_nivel_cerrar_meses(organizacionId, ahora)` en su propia transacción: cierra en orden los meses pendientes
   * de la empresa. Idempotente (R29). Devuelve cuántos cerró.
   */
  cerrarMeses(organizacionId: string, ahora: Date): Promise<number>;
}
