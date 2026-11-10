import type {
  DatosDeAltaDePais,
  DatosDeTipoDocumentoNuevo,
  DatosTelefonoYZona,
  PaisDisponibleDTO,
  PaisDTO,
  PaisParaAltaDTO,
  TipoDocumentoDTO,
  TipoDocumentoNuevoInput,
} from "@/lib/types/pais";

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
  /**
   * El único de la base rechazó el alta (una carrera con otra alta igual, o SLT-81 R6: dos tipos con
   * la misma clave o el mismo `value`): no se escribió nada, ni el país ni ningún tipo.
   */
  | { estado: "duplicado"; campo: "id" | "nombre" | "tiposDocumento" };

/** SLT-81 (R10, R12, R17): el cambio de prefijo, dígitos o zona. */
export type ActualizarDatosPaisRepoResultado =
  | { estado: "no_existe" }
  | { estado: "sin_cambio" | "cambiado"; pais: PaisDTO };

/** SLT-81 (R13): un tipo nuevo en un país existente. */
export type CrearTipoDocumentoRepoResultado =
  | { estado: "creado"; tipo: TipoDocumentoDTO }
  | { estado: "no_existe" }
  /** El único `(pais_id, clave)` o el de `value` rechazó el alta: no se escribió nada. */
  | { estado: "duplicado" };

/** SLT-81 (R13, R14): nombre y regla de formato de un tipo. */
export type EditarTipoDocumentoRepoResultado =
  | { estado: "no_existe" }
  | { estado: "sin_cambio" | "cambiado"; tipo: TipoDocumentoDTO };

/** SLT-81 (R13, R15): activar o desactivar un tipo. */
export type CambiarActivoTipoDocumentoRepoResultado =
  | { estado: "no_existe" }
  /** R15: era el único activo de su país; sigue activo. */
  | { estado: "ultimo_activo" }
  | { estado: "sin_cambio" | "cambiado"; tipo: TipoDocumentoDTO };

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
   *
   * SLT-81 (R6, R17): en esa misma transacción, el prefijo, los dígitos, la zona y todos sus tipos de
   * documento (con `orden` 1..n en el orden recibido), más un `tipo_documento_creado` por tipo.
   */
  crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado>;

  /**
   * SLT-81 (R10, R12, R17): fija prefijo, dígitos y zona. Solo si alguno cambia escribe
   * `pais_datos_cambiados` con `antes`, `despues` y `empresas` (el número que confirmó el
   * superadmin), en la misma transacción. No toca ninguna otra tabla (R12).
   */
  actualizarDatos(
    id: string,
    datos: DatosTelefonoYZona,
    empresas: number,
    actor: ActorDeAltaDePais,
  ): Promise<ActualizarDatosPaisRepoResultado>;

  /**
   * SLT-81 (R10): cuántas empresas tienen este país. Debe correr en `comoPlataforma` (lo pone la
   * action): en contexto de empresa la RLS de `organizacion` solo dejaría contar la propia.
   */
  contarEmpresas(paisId: string): Promise<number>;

  /** SLT-81 (R2): todos los tipos del país, activos e inactivos, por `orden`. */
  listarTiposDocumento(paisId: string): Promise<TipoDocumentoDTO[]>;

  /** SLT-81 (R13): un tipo por su `id`, de cualquier país, o `null`. */
  tipoDocumentoPorId(id: string): Promise<TipoDocumentoDTO | null>;

  /**
   * SLT-81 (R13, R17): crea el tipo con `orden` = el mayor del país + 1 y escribe
   * `tipo_documento_creado`, en la misma transacción.
   */
  crearTipoDocumento(
    paisId: string,
    datos: DatosDeTipoDocumentoNuevo,
    actor: ActorDeAltaDePais,
  ): Promise<CrearTipoDocumentoRepoResultado>;

  /**
   * SLT-81 (R13, R14, R17): solo `nombre`, `caracteres`, `largoMin` y `largoMax`; la clave y el
   * `value` no cambian. Solo si algo cambia escribe `tipo_documento_editado`. No revalida ni toca los
   * documentos ya guardados (R14).
   */
  editarTipoDocumento(
    id: string,
    datos: TipoDocumentoNuevoInput,
    actor: ActorDeAltaDePais,
  ): Promise<EditarTipoDocumentoRepoResultado>;

  /**
   * SLT-81 (R13, R15, R16, R17): bloquea la fila del país antes de contar los activos, así que dos
   * desactivaciones a la vez no dejan el país sin tipos. No toca `usuario` (R16).
   */
  cambiarActivoTipoDocumento(
    id: string,
    activo: boolean,
    actor: ActorDeAltaDePais,
  ): Promise<CambiarActivoTipoDocumentoRepoResultado>;

  /** SLT-81 (R20): los países `disponible = true`, por nombre, con su prefijo y sus tipos activos por `orden`. */
  listarDisponiblesParaAlta(): Promise<PaisParaAltaDTO[]>;

  /** SLT-81 (R8): si Postgres reconoce `zona` (`pg_timezone_names`). */
  zonaConocidaPorLaBase(zona: string): Promise<boolean>;

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
   * SLT-42 (R6; design §4.2): si el país tiene al menos un tipo de documento activo. Lo usa el alta
   * de empresa, en plataforma, para no dejar nacer una empresa con la que no se podría dar de alta a
   * nadie.
   */
  tieneTipoDocumentoActivo(paisId: string): Promise<boolean>;

  /**
   * SLT-42 (R25; design §6.1): las zonas horarias distintas de los países que tienen al menos una
   * empresa, sin los `NULL`, por orden alfabético. Lectura de plataforma: abre `comoPlataforma` por
   * su cuenta (la llama la cola de jobs, que no tiene empresa).
   */
  zonasConEmpresas(): Promise<string[]>;
}
