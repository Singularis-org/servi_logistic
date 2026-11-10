// SLT-118 (design §3, §4) — contrato del repositorio de las facturas de la plataforma. Ningún método
// escribe la tabla: la escriben solo las funciones del dueño en la base (R22), y esto solo las llama.
// Lo vigila `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.
//
// Las lecturas (`deLaEmpresa`, `deEmpresaParaPlataforma`) llegan con T8.1.

export interface IFacturaPlataformaRepository {
  /**
   * Las empresas que recorre el cierre: todas. `factura_plataforma_cerrar` también abre la primera factura
   * de una empresa sin ninguna (R26) y deja la en curso alineada con el calendario (R2), así que no basta
   * con las que tienen una factura por cerrar. Por fecha de alta, como `paraCadaEmpresa`.
   */
  empresasACerrar(): Promise<string[]>;

  /**
   * `factura_plataforma_cerrar(organizacionId, ahora)` en su propia transacción (design §2.5): avanza la
   * factura en curso hasta `ahora` y cierra cada por cerrar con fin ≤ `ahora` − 5 minutos, salvo la espera
   * de R39. Idempotente (R11). Devuelve cuántas cerró; una en espera no es un fallo.
   */
  cerrar(organizacionId: string, ahora: Date): Promise<number>;
}
