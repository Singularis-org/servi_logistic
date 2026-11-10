import type { AntesDeBorrar, AntesDeMiembros, GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";

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
  /** SLT-89 (R17): todos los miembros pedidos, distritos y demas nodos; el repositorio los reparte. */
  distritoIds: readonly string[];
}

export interface IGrupoDistritosRepository {
  existeZona(zonaId: string): Promise<boolean>;
  buscar(id: string): Promise<GrupoDistritosFila | null>;
  /** Otro grupo de la zona ya se llama asi. `exceptoId` = el propio grupo al renombrar. */
  nombreOcupado(zonaId: string, nombre: string, exceptoId: string | null): Promise<boolean>;
  /**
   * De `distritoIds`, los que la zona CUBRE (SLT-89 R17, design §4.4: asignados en `zona_distrito` o
   * heredados de un nodo asignado, a cualquier profundidad). Con asignaciones solo a distritos, los de
   * `zona_distrito`, como hoy.
   */
  distritosDeLaZona(zonaId: string, distritoIds: readonly string[]): Promise<string[]>;
  /** El nombre de cada distrito del catalogo (o del nodo, si no es distrito) para el error (R11, R18). */
  nombresDeDistritos(distritoIds: readonly string[]): Promise<Map<string, string>>;
  /** De `distritoIds`, los que ya estan en un grupo de la zona distinto de `exceptoGrupoId` (las dos tablas). */
  distritosEnOtroGrupo(
    zonaId: string,
    distritoIds: readonly string[],
    exceptoGrupoId: string | null,
  ): Promise<DistritoEnOtroGrupo[]>;
  crear(datos: CrearGrupoDatos, actorUsuarioId: string | null): Promise<CrearGrupoResultado>;
  /**
   * SLT-89 (R44, design §5.4): `nombreAnterior` (obligatorio) es el que el modal mostro; si el de la
   * base no es ni ese ni el pedido, `cambio_concurrente` sin escribir.
   */
  renombrar(
    id: string,
    nombre: string,
    nombreAnterior: string,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "nombre_repetido" | "cambio_concurrente">;
  /**
   * Reemplaza el conjunto: saca los que no vienen y mete los nuevos. SLT-89 (R43): `antes`
   * (obligatorio) son los miembros que el modal mostro; si no son los de la base, `cambio_concurrente`.
   */
  fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    antes: AntesDeMiembros,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "distrito_rechazado" | "cambio_concurrente">;
  /**
   * Borra el grupo; sus miembros y valores se van por CASCADE (R12) y el historial lo cuenta. SLT-89
   * (R45): `antes` (obligatorio) es lo que el modal mostro; si no coincide, `cambio_concurrente`.
   */
  borrar(id: string, antes: AntesDeBorrar, actorUsuarioId: string | null): Promise<"ok" | "not_found" | "cambio_concurrente">;
  listar(zonaId: string): Promise<GrupoDistritosDTO[]>;
}
