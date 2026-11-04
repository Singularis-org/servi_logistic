import type { DatosDeAltaDePais, PaisDisponibleDTO, PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";

// SL-20 (design §5) — persistencia de los países. La tabla es de plataforma: `listar`, `porId` y
// `crear` corren como dueño (`comoPlataforma`, lo pone la action); `deLaEmpresa` corre en el
// contexto de la empresa, que puede leer `pais` y su propia `organizacion` (R3). `listarDisponibles`
// la llama la página «Empresas» del superadmin sin contexto (lectura de plataforma, `pais_lectura`).

/** Quién da de alta el país: su nombre se congela en `historial_plataforma` (R33). */
export interface ActorDeAltaDePais {
  usuarioId: string;
}

export type CrearPaisRepoResultado =
  | { estado: "creado"; pais: PaisDTO }
  /** El único de la base rechazó el alta (una carrera con otra alta igual): no se escribió nada. */
  | { estado: "duplicado"; campo: "id" | "nombre" };

export interface IPaisRepository {
  /** Todos los países, por nombre. */
  listar(): Promise<PaisDTO[]>;

  /** Solo los países con `disponible = true`, por nombre: los que ofrece el alta de empresa (R9, R45). */
  listarDisponibles(): Promise<PaisDisponibleDTO[]>;

  porId(id: string): Promise<PaisDTO | null>;

  /**
   * Crea el país sin geografía y escribe `pais_creado` en `historial_plataforma`, en la misma
   * transacción (R23, R33). Los datos llegan ya validados y normalizados por el servicio, con el
   * nombre del catálogo ISO 3166-1 (R23).
   */
  crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado>;

  /**
   * R47: fija `disponible` y, solo si la fila cambió, escribe `pais_disponibilidad_activada` o
   * `_desactivada` en `historial_plataforma` en la misma transacción. Pedir el estado que ya tiene
   * no escribe nada (`sin_cambio`).
   */
  cambiarDisponible(
    id: string,
    disponible: boolean,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "cambiado">;

  /** El país de la empresa, o `null` si la empresa no existe o no es visible en este contexto. */
  deLaEmpresa(organizacionId: string): Promise<PaisDTO | null>;

  /**
   * SLT-42 (R11; design §4.2): el tipo de documento `idOValue` (su `id` o su `value`) SOLO si es del
   * país `paisId`; un tipo de otro país es `null`, igual que uno que no existe. Lo trae aunque esté
   * inactivo, con su `activo`: el filtro de inactivos es de quien lo usa. Corre en el contexto de la
   * empresa: la RLS `tipo_identificacion_del_pais` acota además al país de esa empresa.
   */
  tipoDocumentoDelPais(paisId: string, idOValue: string): Promise<TipoDocumentoDTO | null>;

  /**
   * SLT-42 (R25; design §6.1): las zonas horarias distintas de los países que tienen al menos una
   * empresa, sin los `NULL`, por orden alfabético. Lectura de plataforma: abre `comoPlataforma` por
   * su cuenta (la llama la cola de jobs, que no tiene empresa).
   */
  zonasConEmpresas(): Promise<string[]>;
}
