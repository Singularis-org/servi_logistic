import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import type {
  DatosDeAltaDePais,
  DatosDeAltaDePaisConTipos,
  PaisDisponibleDTO,
  PaisDTO,
} from "@/lib/types/pais";

// SL-20 (design §5) — persistencia de los países. La tabla es de plataforma: `listar`, `porId` y
// `crear` corren como dueño (`comoPlataforma`, lo pone la action); `deLaEmpresa` corre en el
// contexto de la empresa, que puede leer `pais` y su propia `organizacion` (R3). `listarDisponibles`
// la llama la página «Empresas» del superadmin sin contexto (lectura de plataforma, `pais_lectura`).
//
// SLT-46 (design §2.4, §4.4) — también es el ESCRITOR ÚNICO de `tipo_nivel_geografico` (R43): el
// alta con su lista de tipos, el renombre de un tipo y agregar un nivel al final. Nada borra un
// tipo (R50).

/** Quién da de alta el país: su nombre se congela en `historial_plataforma` (R33). */
export interface ActorDeAltaDePais {
  usuarioId: string;
}

export type CrearPaisRepoResultado =
  | { estado: "creado"; pais: PaisDTO }
  /** El único de la base rechazó el alta (una carrera con otra alta igual): no se escribió nada. */
  | { estado: "duplicado"; campo: "id" | "nombre" };

export type CrearPaisConTiposRepoResultado =
  /** `tipos`: los P tipos creados, por profundidad. */
  | { estado: "creado"; pais: PaisDTO; tipos: TipoNivelDTO[] }
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
   *
   * El alta de SL-20 (seis nombres fijos, tres tipos que pone el trigger). Desde SLT-46 (T4.3) no
   * tiene llamador de la app: `PaisService.crear` usa `crearConTipos`. Se queda porque
   * `tests/integration/db/pais-repositorio.test.ts` la usa directamente (único `duplicado`) y
   * retirarla obligaría a cambiar ese test; su retiro está pendiente de decisión.
   */
  crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado>;

  /**
   * SLT-46 (R23, R37, R46): crea el país con exactamente sus P tipos (2–10, ya validados), con las
   * claves `nivel_1`…`nivel_P` en el orden de la lista, y escribe `pais_creado` más una fila
   * `tipo_nivel_geografico_creado` por tipo, todo en una transacción. Un país de 2 tipos guarda
   * `''` en `pais.nivel_3_*` (design §2.4) y no tiene tipo `nivel_3`.
   */
  crearConTipos(
    datos: DatosDeAltaDePaisConTipos,
    actor: ActorDeAltaDePais,
  ): Promise<CrearPaisConTiposRepoResultado>;

  /**
   * SLT-46 (R25, R26, R37): cambia los dos nombres de un tipo y, si su clave es `nivel_1..3`, los
   * copia a `pais.nivel_N_*` en la misma transacción. Una fila `tipo_nivel_geografico_renombrado`
   * por nombre cambiado. Los mismos nombres que ya tiene no escriben nada (`sin_cambio`).
   */
  renombrarTipo(
    tipoId: string,
    nombreSingular: string,
    nombrePlural: string,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "renombrado">;

  /**
   * SLT-46 (P3; R37, R48, R49): crea el tipo `nivel_<P+1>` al final; si P+1 es 3, copia sus nombres
   * a `pais.nivel_3_*`. Con 10 tipos, `tope`. Si otra alta en paralelo ya creó ese tipo, deja
   * escapar el único (`P2002`): lo traduce la action a `conflict`. No toca nodos ni otros tipos.
   */
  agregarNivel(
    paisId: string,
    nombreSingular: string,
    nombrePlural: string,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "tope" | TipoNivelDTO>;

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
}
