import type { AsignacionesDeLaEmpresa, CatalogoGeografico } from "@/lib/services/geografia-dominio";

// SLT-44 (design §3) — la carga del catalogo geografico de un pais y de las asignaciones de una
// empresa, para el dominio en memoria (`lib/services/geografia-dominio.ts`).

export interface CatalogoYAsignaciones {
  catalogo: CatalogoGeografico;
  asignaciones: AsignacionesDeLaEmpresa;
}

export interface ICatalogoGeograficoRepository {
  /**
   * El catalogo del pais de la empresa del contexto (sesion o `conEmpresa`) y sus asignaciones de
   * zona y marcas. En plataforma o sin empresa lanza `EmpresaNoResuelta` (R10). Se lee como mucho
   * una vez por instancia y por empresa (R11).
   */
  deLaEmpresa(): Promise<CatalogoYAsignaciones>;
  /** El catalogo de un pais explicito, sin asignaciones: la lectura del superadmin (R10, R17). */
  dePais(paisId: string): Promise<CatalogoGeografico>;
}
