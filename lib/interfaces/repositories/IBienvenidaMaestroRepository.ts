/** SL-41 (design §6.2): a quien va la bienvenida de una empresa, y con que nombre de empresa. */
export interface MaestroParaBienvenida {
  usuarioId: string;
  nombre: string;
  email: string;
  empresaNombre: string;
}

/**
 * SL-41 — lecturas de plataforma para la bienvenida del primer maestro. Las dos corren dentro del
 * `comoPlataforma` que abre la action (el superadmin no tiene empresa), asi que la empresa va
 * EXPLICITA en el `where`: la extension del cliente no la pone en ese contexto.
 */
export interface IBienvenidaMaestroRepository {
  /**
   * El primer maestro de la empresa: el mas antiguo por `created_at` y, a igualdad, por `id`.
   * `null` si la empresa no tiene ninguno.
   */
  maestroParaBienvenida(organizacionId: string): Promise<MaestroParaBienvenida | null>;
  /**
   * SL-41/R38 (design §16.2): las empresas cuyo PRIMER maestro (mismo criterio que
   * `maestroParaBienvenida`) aun no fijo su contrasena (`contrasena_definida_at IS NULL`).
   */
  organizacionesConBienvenidaPendiente(): Promise<string[]>;
}
