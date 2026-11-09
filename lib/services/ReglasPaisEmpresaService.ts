import { contextoActual, EmpresaNoResuelta, memoriaDelMarco } from "@/lib/db/contexto-empresa";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { IReglasPaisEmpresa, ReglasPais } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { PaisRepository, type PaisPrismaClient } from "@/lib/repositories/PaisRepository";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";

// SLT-42 (design §4.2; R11, R28, R30) — las reglas del país de la empresa en curso.
//
// R30, sin caché entre empresas: cada `deLaEmpresa()` es una lectura por clave primaria. Lo único que
// se recuerda es el país leído DENTRO del mismo marco de `conEmpresa` (`memoriaDelMarco`), que muere
// con la petición o con la iteración de `paraCadaEmpresa`. Nada en variables de módulo ni en la
// instancia: el mismo servicio puede atender a dos empresas seguidas.

type RepoDePais = Pick<IPaisRepository, "deLaEmpresa" | "tipoDocumentoDelPais">;

export interface ReglasPaisEmpresaDeps {
  repo: RepoDePais;
  /** La empresa de la sesión cuando no hay contexto explícito. Por defecto, la de la cookie. */
  empresaDeLaSesion?: () => Promise<string | null>;
}

/** Clave del país en la memoria del marco; un `Symbol` propio no choca con la de otro servicio. */
const CLAVE_PAIS = Symbol("SLT-42.pais-de-la-empresa");

// Import perezoso, como en `prisma-client.ts`: la sesión depende de `next/headers`, que no está en
// jobs, scripts ni tests.
async function empresaDeLaPeticionPerezosa(): Promise<string | null> {
  const { empresaDeLaPeticion } = await import("@/lib/auth/empresa-de-la-peticion");
  return empresaDeLaPeticion();
}

export class ReglasPaisEmpresaService implements IReglasPaisEmpresa {
  private readonly repo: RepoDePais;
  private readonly empresaDeLaSesion: () => Promise<string | null>;

  constructor(deps: ReglasPaisEmpresaDeps) {
    this.repo = deps.repo;
    this.empresaDeLaSesion = deps.empresaDeLaSesion ?? empresaDeLaPeticionPerezosa;
  }

  async deLaEmpresa(): Promise<ReglasPais> {
    const pais = await this.paisDeLaEmpresa("deLaEmpresa");
    return {
      paisId: pais.id,
      zonaHoraria: pais.zonaHoraria,
      telefono:
        pais.prefijoTelefonico !== null && pais.telefonoDigitosNacionales !== null
          ? { prefijo: pais.prefijoTelefonico, digitosNacionales: pais.telefonoDigitosNacionales }
          : null,
    };
  }

  /** R28: sin zona no se inventa una; la operación falla antes de escribir nada. */
  async zonaHoraria(): Promise<string> {
    const pais = await this.paisDeLaEmpresa("zonaHoraria");
    if (pais.zonaHoraria === null) throw new PaisSinZonaHoraria(pais.id);
    return pais.zonaHoraria;
  }

  /** R11: el país lo pone la empresa en curso, no quien llama. El inactivo sale con `activo: false`. */
  async tipoDocumento(idOValue: string): Promise<TipoDocumentoDTO | null> {
    const pais = await this.paisDeLaEmpresa("tipoDocumento");
    return this.repo.tipoDocumentoDelPais(pais.id, idOValue);
  }

  /**
   * La empresa: la del contexto explícito o, sin él, la de la sesión. En plataforma no hay empresa
   * de la que leer el país: falla cerrado, como cualquier operación de negocio.
   */
  private async empresaEnCurso(operacion: string): Promise<string> {
    const contexto = contextoActual();
    if (contexto?.tipo === "empresa") return contexto.organizacionId;
    if (contexto?.tipo === "plataforma") throw new EmpresaNoResuelta("Pais", operacion);
    const organizacionId = await this.empresaDeLaSesion();
    if (organizacionId === null) throw new EmpresaNoResuelta("Pais", operacion);
    return organizacionId;
  }

  private async paisDeLaEmpresa(operacion: string): Promise<PaisDTO> {
    const memoria = memoriaDelMarco();
    const recordado = memoria?.get(CLAVE_PAIS) as PaisDTO | undefined;
    if (recordado) return recordado;

    const organizacionId = await this.empresaEnCurso(operacion);
    const pais = await this.repo.deLaEmpresa(organizacionId);
    // La empresa no existe o no es visible en este contexto: no hay país que dar.
    if (pais === null) throw new EmpresaNoResuelta("Pais", operacion);
    memoria?.set(CLAVE_PAIS, pais);
    return pais;
  }
}

/** La implementación real, para el `build*` de cada servicio que la recibe por constructor. */
export function construirReglasPaisEmpresa(prisma: PaisPrismaClient = getPrismaClient()): IReglasPaisEmpresa {
  return new ReglasPaisEmpresaService({ repo: new PaisRepository(prisma) });
}
