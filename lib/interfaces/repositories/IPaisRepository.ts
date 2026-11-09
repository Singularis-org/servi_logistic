import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import type { DatosDeAltaDePais, PaisDisponibleDTO, PaisDTO } from "@/lib/types/pais";

// SL-20 (design §5) — persistencia de los países. La tabla es de plataforma: `listar`, `porId` y
// `crear` corren como dueño (`comoPlataforma`, lo pone la action); `deLaEmpresa` corre en el
// contexto de la empresa, que puede leer `pais` y su propia `organizacion` (R3). `listarDisponibles`
// la llama la página «Empresas» del superadmin sin contexto (lectura de plataforma, `pais_lectura`).
//
// SLT-46 (design §2.4, §4.4) — también es el ESCRITOR ÚNICO de `tipo_nivel_geografico` (R43): el
// alta con su lista de tipos, el renombre de un tipo, agregar un nivel al final y reordenar los
// nombres de los niveles. Nada borra un tipo (R50).
//
// SLT-46 (2026-11-09, design §4.7; R57, R61) — las tres escrituras de tipos de un país ya creado
// reciben el «antes» que la pantalla mostró en su modal de confirmación y lo comparan, bajo el
// candado `FOR UPDATE` de la fila `pais`, con lo que hay en la base: si otra persona lo cambió
// mientras tanto, responden `cambio_concurrente` sin escribir nada.

/** Quién da de alta el país: su nombre se congela en `historial_plataforma` (R33). */
export interface ActorDeAltaDePais {
  usuarioId: string;
}

export type CrearPaisRepoResultado =
  /** `tipos`: los P tipos creados, por profundidad. */
  | { estado: "creado"; pais: PaisDTO; tipos: TipoNivelDTO[] }
  /** El único de la base rechazó el alta (una carrera con otra alta igual): no se escribió nada. */
  | { estado: "duplicado"; campo: "id" | "nombre" };

/** Los dos nombres de un tipo de nivel. */
export interface NombresDeTipo {
  nombreSingular: string;
  nombrePlural: string;
}

/** Un elemento de la lista de `reordenarTipos`: el tipo y los nombres que el modal mostró como «antes». */
export interface NivelReordenado extends NombresDeTipo {
  tipoId: string;
}

export interface IPaisRepository {
  /** Todos los países, por nombre. */
  listar(): Promise<PaisDTO[]>;

  /** Solo los países con `disponible = true`, por nombre: los que ofrece el alta de empresa (R9, R45). */
  listarDisponibles(): Promise<PaisDisponibleDTO[]>;

  porId(id: string): Promise<PaisDTO | null>;

  /**
   * SLT-46 (R23, R33, R37, R46): crea el país con exactamente sus P tipos (2–10, ya validados), con
   * las claves `nivel_1`…`nivel_P` en el orden de la lista, y escribe `pais_creado` más una fila
   * `tipo_nivel_geografico_creado` por tipo, todo en una transacción. Un país de 2 tipos guarda
   * `''` en `pais.nivel_3_*` (design §2.4) y no tiene tipo `nivel_3`. Los datos llegan validados y
   * con el nombre del catálogo ISO 3166-1 (R23).
   */
  crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado>;

  /**
   * SLT-46 (R25, R26, R37, R61): cambia los dos nombres de un tipo y, si su clave es `nivel_1..3`,
   * los copia a `pais.nivel_N_*` en la misma transacción. Una fila `tipo_nivel_geografico_renombrado`
   * por nombre cambiado. Los nombres pedidos que ya tiene son `sin_cambio` (se mira ANTES que el
   * «antes»: pedir lo que ya hay es éxito, R26); si los actuales no son `anterior`,
   * `cambio_concurrente` sin escribir.
   */
  renombrarTipo(
    tipoId: string,
    nombres: NombresDeTipo,
    anterior: NombresDeTipo,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "cambio_concurrente" | "renombrado">;

  /**
   * SLT-46 (P3; R37, R48, R49, R61): crea el tipo `nivel_<P+1>` al final; si P+1 es 3, copia sus
   * nombres a `pais.nivel_3_*`. Con 10 tipos, `tope` (se mira antes que la profundidad); si P+1 no es
   * la `profundidad` que la pantalla mostró, `cambio_concurrente`. El único `(pais_id, clave)` sigue
   * de respaldo: si salta (`P2002`), sube tal cual y la action lo traduce a `conflict`.
   */
  agregarNivel(
    paisId: string,
    nombres: NombresDeTipo,
    profundidad: number,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "tope" | "cambio_concurrente" | TipoNivelDTO>;

  /**
   * SLT-46 (2026-11-09, design §2.4 «Reordenar niveles»; R55, R56, R57): `niveles` es la lista en el
   * orden nuevo, cada uno con los nombres que tenía al abrir el modal. El tipo de la profundidad k
   * toma los nombres de `niveles[k-1]` (y, si k ≤ 3, también `pais.nivel_k_*`); ids, claves, reglas
   * de código y nodos no cambian. Si la lista no es exactamente el conjunto de tipos del país o algún
   * nombre no es el actual, `cambio_concurrente`; el orden actual es `sin_cambio`. Una fila
   * `tipo_nivel_geografico_renombrado` por nombre cambiado con `detalle.origen = "reordenado"`.
   */
  reordenarTipos(
    paisId: string,
    niveles: NivelReordenado[],
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "cambio_concurrente" | "sin_cambio" | "reordenado">;

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
