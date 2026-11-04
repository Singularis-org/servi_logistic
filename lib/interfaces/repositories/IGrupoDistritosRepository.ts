import type { GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 (design §8, R10-R12, R14) — escritura y lectura de los grupos de distritos.
 *
 * La empresa NO viaja: la pone la extension del cliente en cada consulta (R15).
 */

export interface GrupoDistritosFila {
  id: string;
  zonaId: string;
  nombre: string;
}

/** Un distrito pedido que ya esta en OTRO grupo de la misma zona (R11). */
export interface DistritoEnOtroGrupo {
  distritoId: string;
  distritoNombre: string;
  grupoNombre: string;
}

/**
 * Lo que la base rechazo aunque el service ya lo hubiera comprobado (carrera): el unico del nombre
 * (R10), o el unico / la FK de los distritos (R11). El service lo traduce al mismo error que su
 * propia comprobacion.
 */
export type RechazoDeLaBase = "nombre_repetido" | "distrito_rechazado";

export type CrearGrupoResultado = { status: "ok"; id: string } | { status: RechazoDeLaBase };

export interface CrearGrupoDatos {
  zonaId: string;
  nombre: string;
  distritoIds: readonly string[];
}

export interface IGrupoDistritosRepository {
  existeZona(zonaId: string): Promise<boolean>;
  buscar(id: string): Promise<GrupoDistritosFila | null>;
  /** Otro grupo de la zona ya se llama asi. `exceptoId` = el propio grupo al renombrar. */
  nombreOcupado(zonaId: string, nombre: string, exceptoId: string | null): Promise<boolean>;
  /** De `distritoIds`, los que SI pertenecen a la zona (`zona_distrito`). */
  distritosDeLaZona(zonaId: string, distritoIds: readonly string[]): Promise<string[]>;
  /** El nombre de cada distrito del catalogo, para nombrarlo en el error (R11). */
  nombresDeDistritos(distritoIds: readonly string[]): Promise<Map<string, string>>;
  /** De `distritoIds`, los que ya estan en un grupo de la zona distinto de `exceptoGrupoId`. */
  distritosEnOtroGrupo(
    zonaId: string,
    distritoIds: readonly string[],
    exceptoGrupoId: string | null,
  ): Promise<DistritoEnOtroGrupo[]>;
  crear(datos: CrearGrupoDatos, actorUsuarioId: string | null): Promise<CrearGrupoResultado>;
  renombrar(
    id: string,
    nombre: string,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "nombre_repetido">;
  /** Reemplaza el conjunto: saca los que no vienen y mete los nuevos. */
  fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "distrito_rechazado">;
  /** Borra el grupo; sus distritos y valores se van por CASCADE (R12) y el historial lo cuenta. */
  borrar(id: string, actorUsuarioId: string | null): Promise<"ok" | "not_found">;
  listar(zonaId: string): Promise<GrupoDistritosDTO[]>;
}
