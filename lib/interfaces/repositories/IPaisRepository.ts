import type { CrearPaisInput, PaisDisponibleDTO, PaisDTO } from "@/lib/types/pais";

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
   * transacción (R23, R33). Los datos llegan ya validados y normalizados por el servicio.
   */
  crear(datos: CrearPaisInput, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado>;

  /** El país de la empresa, o `null` si la empresa no existe o no es visible en este contexto. */
  deLaEmpresa(organizacionId: string): Promise<PaisDTO | null>;
}
