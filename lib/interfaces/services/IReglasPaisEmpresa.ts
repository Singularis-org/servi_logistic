import type { TipoDocumentoDTO } from "@/lib/types/pais";
import type { ReglasTelefono } from "@/lib/utils/telefono-pais";

// SLT-42 (design §4.2; R11, R28, R30) — el puerto por el que un servicio lee las reglas del país de
// la empresa EN CURSO: zona horaria, teléfono y tipos de documento. Sin argumento de empresa: la
// empresa sale del contexto (`conEmpresa`) o de la sesión, nunca de quien llama.
//
// Los servicios lo reciben por constructor; los tests unitarios inyectan `reglasPaisFijas({...})`
// (`tests/fabricas/reglas-pais.ts`).

export interface ReglasPais {
  paisId: string;
  zonaHoraria: string | null;
  /** `null` si al país le falta el prefijo o los dígitos nacionales. */
  telefono: ReglasTelefono | null;
}

export interface IReglasPaisEmpresa {
  /** País de la empresa del contexto. Lanza EmpresaNoResuelta sin empresa. */
  deLaEmpresa(): Promise<ReglasPais>;
  /** Igual, pero lanza PaisSinZonaHoraria si falta la zona (R28). */
  zonaHoraria(): Promise<string>;
  /** Solo del país de la empresa (R11). */
  tipoDocumento(idOValue: string): Promise<TipoDocumentoDTO | null>;
}
