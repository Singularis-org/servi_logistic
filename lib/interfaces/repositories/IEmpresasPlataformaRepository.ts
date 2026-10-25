import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

// SL-32 — contrato del repositorio del listado de empresas (R29). Sin tipos de Prisma a proposito:
// el servicio se escribe y se prueba (T14a) antes de que exista la implementacion (T14b).

export interface IEmpresasPlataformaRepository {
  /**
   * Todas las organizaciones, la mas reciente primero (`created_at` descendente). Cada una con
   * sus usuarios de rol `maestro`, por orden de alta (`created_at` ascendente), y de ellos solo
   * `nombre` y `email`. Sin organizaciones, `[]`. SL-45 (R28): cada una con su deuda con la
   * plataforma y lo que ha pagado (`deudaPlataforma`, `pagadoPlataforma`).
   *
   * No filtra por `organizacion_id`: es una lectura de plataforma, y la implementacion corre
   * dentro de `comoPlataforma` (T14b). Quien comprueba que el actor puede leerla es el servicio.
   */
  listar(): Promise<EmpresaListada[]>;
}
