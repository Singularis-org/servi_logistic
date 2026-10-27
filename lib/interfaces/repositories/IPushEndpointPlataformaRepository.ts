// SL-18 (design §7, R26–R28) — el único paso del alta de push que corre en plataforma: soltar un
// endpoint que hoy es de OTRA empresa para que la empresa de la sesión pueda registrarlo.

export interface IPushEndpointPlataformaRepository {
  /**
   * Borra la suscripción con ESE endpoint si es de una empresa distinta de `organizacionIdActual`.
   * Las de la propia empresa y las de cualquier otro endpoint no se tocan (R28). Devuelve cuántas
   * filas borró (0 o 1: el endpoint es único en toda la plataforma).
   */
  liberarDeOtrasEmpresas(endpoint: string, organizacionIdActual: string): Promise<number>;
}
