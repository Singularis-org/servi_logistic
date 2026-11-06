import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IReglasPaisEmpresa, ReglasPais } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { PaisesDelAlta } from "@/lib/services/OrganizacionService";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";
import { fechaCalendario, inicioDelDiaEnUtc, inicioDelDiaSiguienteEnUtc } from "@/lib/utils/calendario-zona";

// SLT-42 (design §4.2) — doble de `IReglasPaisEmpresa` para los tests unitarios de los servicios que
// lo reciben por constructor. Devuelve siempre el mismo país, sin base ni contexto de empresa, y
// cumple el contrato del puerto: `zonaHoraria()` lanza `PaisSinZonaHoraria` sin zona (R28) y
// `tipoDocumento` solo encuentra los tipos de ESE país, por `id` o por `value` (R11).

export interface ReglasPaisFijas {
  paisId: string;
  zonaHoraria: string | null;
  telefono: ReglasPais["telefono"];
  tiposDocumento: readonly TipoDocumentoDTO[];
}

/** Los cinco tipos de Costa Rica de la migración `20261106120100` (R3), con ids fijos de test. */
const TIPOS_CR: readonly TipoDocumentoDTO[] = [
  { id: "tipo-cr-cedula", value: "cedula", paisId: "CR", clave: "cedula_fisica", nombre: "Cédula física", caracteres: "digitos", largoMin: 9, largoMax: 9, activo: true },
  { id: "tipo-cr-ruc", value: "ruc", paisId: "CR", clave: "cedula_juridica", nombre: "Cédula jurídica", caracteres: "digitos", largoMin: 10, largoMax: 10, activo: true },
  { id: "tipo-cr-dimex", value: "dimex", paisId: "CR", clave: "dimex", nombre: "DIMEX", caracteres: "digitos", largoMin: 11, largoMax: 12, activo: true },
  { id: "tipo-cr-nite", value: "nite", paisId: "CR", clave: "nite", nombre: "NITE", caracteres: "digitos", largoMin: 10, largoMax: 10, activo: true },
  { id: "tipo-cr-pasaporte", value: "pasaporte", paisId: "CR", clave: "pasaporte", nombre: "Pasaporte", caracteres: "alfanumerico", largoMin: 6, largoMax: 20, activo: true },
];

/** Costa Rica tal como la deja la migración de SLT-42 (R3): `reglasPaisFijas(CR)`. */
export const CR: ReglasPaisFijas = {
  paisId: "CR",
  zonaHoraria: "America/Costa_Rica",
  telefono: { prefijo: "506", digitosNacionales: 8 },
  tiposDocumento: TIPOS_CR,
};

/**
 * La zona IANA de Costa Rica, para los tests de repositorio que reciben la zona ya resuelta (la
 * calcula el servicio con `IReglasPaisEmpresa`; aquí, la de CR para que el resultado sea el de antes).
 */
export const ZONA_DE_CR: string = CR.zonaHoraria as string;

/** Un doble del puerto con el país fijo `datos`. Sin argumento, Costa Rica. */
export function reglasPaisFijas(datos: Partial<ReglasPaisFijas> = {}): IReglasPaisEmpresa {
  const r: ReglasPaisFijas = { ...CR, ...datos };
  return {
    deLaEmpresa: () => Promise.resolve({ paisId: r.paisId, zonaHoraria: r.zonaHoraria, telefono: r.telefono }),
    zonaHoraria: () =>
      r.zonaHoraria === null ? Promise.reject(new PaisSinZonaHoraria(r.paisId)) : Promise.resolve(r.zonaHoraria),
    tipoDocumento: (idOValue) => {
      const delPais = r.tiposDocumento.filter((t) => t.paisId === r.paisId);
      const tipo = delPais.find((t) => t.id === idOValue) ?? delPais.find((t) => t.value === idOValue) ?? null;
      return Promise.resolve(tipo);
    },
  };
}

/**
 * SLT-42 (T4.3) — un país tal como lo lee el alta de empresa (`PaisesDelAlta`): `PaisDTO` y sus tipos.
 * Sin `datos`, Costa Rica como la deja la migración (R3).
 */
export interface PaisDelAltaFijo {
  pais: PaisDTO;
  tiposDocumento: readonly TipoDocumentoDTO[];
}

export function paisDelAltaFijo(datos: Partial<PaisDTO> = {}, tiposDocumento: readonly TipoDocumentoDTO[] = TIPOS_CR): PaisDelAltaFijo {
  return {
    pais: {
      id: "CR",
      nombre: "Costa Rica",
      nivel1Singular: "Provincia",
      nivel1Plural: "Provincias",
      nivel2Singular: "Cantón",
      nivel2Plural: "Cantones",
      nivel3Singular: "Distrito",
      nivel3Plural: "Distritos",
      digitosCodigoNivel1: null,
      digitosCodigoNivel2: null,
      digitosCodigoNivel3: null,
      disponible: true,
      prefijoTelefonico: CR.telefono?.prefijo ?? null,
      telefonoDigitosNacionales: CR.telefono?.digitosNacionales ?? null,
      zonaHoraria: CR.zonaHoraria,
      ...datos,
    },
    tiposDocumento,
  };
}

/**
 * Doble de `PaisesDelAlta` con los países `paises` (por defecto, solo CR). Cumple el contrato del
 * repositorio: `tipoDocumentoDelPais` solo encuentra tipos de ESE país, por `id` o por `value`, y
 * trae también los inactivos; `tieneTipoDocumentoActivo` cuenta solo los activos.
 */
export function paisesDelAltaFijos(paises: readonly PaisDelAltaFijo[] = [paisDelAltaFijo()]): PaisesDelAlta {
  const de = (paisId: string) => paises.find((p) => p.pais.id === paisId);
  return {
    porId: (id) => Promise.resolve(de(id)?.pais ?? null),
    tipoDocumentoDelPais: (paisId, idOValue) => {
      const tipos = (de(paisId)?.tiposDocumento ?? []).filter((t) => t.paisId === paisId);
      return Promise.resolve(tipos.find((t) => t.id === idOValue) ?? tipos.find((t) => t.value === idOValue) ?? null);
    },
    tieneTipoDocumentoActivo: (paisId) =>
      Promise.resolve((de(paisId)?.tiposDocumento ?? []).some((t) => t.paisId === paisId && t.activo)),
  };
}

/**
 * SLT-42 (design §4.3) — el INSTANTE en que empieza el dia de `now` en la zona de Costa Rica. Es el
 * `inicioDelDia` que antes calculaba el repositorio por su cuenta con `fecha-cr`; ahora lo calcula
 * el servicio con la zona de la empresa y los tests de repositorio lo pasan con esto.
 */
export function inicioDelDiaCR(now: Date = new Date()): Date {
  const zona = CR.zonaHoraria as string;
  return inicioDelDiaEnUtc(fechaCalendario(now, zona), zona);
}

/**
 * SLT-42 — la ventana `[00:00, 00:00 del dia siguiente)` del dia `hoy` (convencion `@db.Date`,
 * medianoche UTC de la fecha local) en la zona de Costa Rica: la que antes calculaba
 * `findLiberadasHoy` por su cuenta y ahora le pasa quien llama.
 */
export function ventanaDelDiaCR(hoy: Date): { desde: Date; hasta: Date } {
  const zona = CR.zonaHoraria as string;
  const fecha = hoy.toISOString().slice(0, 10);
  return { desde: inicioDelDiaEnUtc(fecha, zona), hasta: inicioDelDiaSiguienteEnUtc(fecha, zona) };
}
