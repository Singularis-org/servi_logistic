import type {
  GeografiaFiltrosDTO,
  OpcionGeografica,
  OpcionGeograficaConPadre,
} from "@/lib/types/filtros-ordenes";
import type {
  NivelGeografico,
  NodoArbolPlataformaDTO,
  ProvinciaArbolDTO,
  ProvinciaPlataformaDTO,
  TipoNivelDTO,
} from "@/lib/types/geografia-nodo";
import type {
  ArbolExistente,
  NodoExistenteConProfundidad,
  PlanDivision,
  PlanDivisionPorProfundidad,
  ResumenCarga,
  ResumenCargaPorProfundidad,
} from "@/lib/types/division-csv";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";

// ── SLT-46 (design §4.4): los contratos por NODO, a cualquier profundidad ────────────────────

/** El arbol de un pais para el superadmin (R21): sus tipos y sus raices, con los hijos dentro. */
export interface ArbolDePais {
  tipos: TipoNivelDTO[];
  raices: NodoArbolPlataformaDTO[];
}

/** Donde cuelga un alta: la raiz de un pais o el hijo de un nodo. */
export type DestinoDeAlta = { paisId: string } | { padreId: string };

/**
 * Lo que el alta necesita saber de donde cuelga el nodo, leido de una vez (§4.3): su pais, la
 * profundidad que tendra, el tipo de esa profundidad (`null` si el pais no lo tiene, R15), el codigo
 * del padre (el prefijo de R17) y los hermanos con su nombre CRUDO (R16).
 */
export interface ContextoDeAltaDeNodo {
  paisId: string;
  profundidad: number;
  tipo: TipoNivelDTO | null;
  /** `null` en una raiz o si el padre no tiene codigo. */
  codigoPadre: string | null;
  hermanos: { id: string; nombre: string }[];
}

/** El alta ya decidida por el service: el tipo es el de la profundidad (P1, R14). */
export interface DatosDeAltaDeNodo {
  paisId: string;
  /** `null` en una raiz. */
  padreId: string | null;
  profundidad: number;
  tipoId: string;
  nombre: string;
  codigo: string | null;
}

/** La geografia de un pais tal como la necesita `planificarDivision` a P profundidades (§5). */
export interface DivisionPorProfundidadDePais {
  tipos: TipoNivelDTO[];
  nodos: NodoExistenteConProfundidad[];
}

/** Los tres desenlaces de un cambio de un nodo: solo el tercero escribe y audita. */
export type DesenlaceDeRenombre = "no_existe" | "sin_cambio" | "renombrado";
export type DesenlaceDeActivacion = "no_existe" | "sin_cambio" | "cambiado";

// ── SL-20: los contratos por NIVEL (provincia/canton/distrito) ────────────────────────────────
//
// Siguen solo hasta T4, que pasa `GeografiaService` y `CargaDivisionService` a los de arriba. Desde
// SLT-46 la clase los resuelve sobre `nodo_geografico` (R1): ya no escriben la geografia vieja.

/**
 * SL-20 — lo que el alta necesita saber de DONDE cuelga el nodo, leido de una vez: el pais, su
 * regla de codigo (R17), el codigo del padre (el prefijo que exige esa regla) y los hermanos con su
 * nombre CRUDO (R15).
 */
export interface ContextoDeAlta {
  paisId: string;
  regla: ReglaDeCodigoDePais;
  /** `null` en la provincia (no tiene padre) o si el padre no tiene codigo. */
  codigoPadre: string | null;
  hermanos: { id: string; nombre: string }[];
}

/** SL-20 — la geografia de un pais tal como la necesita `planificarDivision`, con su regla. */
export interface DivisionDePais {
  regla: ReglaDeCodigoDePais;
  arbol: ArbolExistente;
}

/** SL-20 — el resto del alta: el pais del nodo (para el historial) y su codigo opcional. */
export interface OpcionesDeAlta {
  /** El pais del contenedor: el de la provincia en su alta, el del padre en los demas niveles. */
  paisId: string;
  codigo: string | null;
}

/**
 * SL-20 — lo que `CargaDivisionService` usa hoy de la carga, por nivel. T4 lo pasa a
 * `IGeoRepository.leerDivisionDePais`/`importarDivision` por profundidad y lo retira.
 */
export interface IGeoRepositoryDivisionPorNivel {
  leerDivisionDePais(paisId: string): Promise<DivisionDePais | null>;
  importarDivision(
    paisId: string,
    plan: PlanDivision,
    actorUsuarioId: string | null,
  ): Promise<ResumenCarga>;
}

// El catalogo geografico global.
//
// Tenia ademas `listProvincias()`, `listCantones(provinciaId)` y `listDistritos(cantonId)`
// (feature 24/R14), la navegacion por niveles que alimentaba a `GeoService` -> `geo.ts` ->
// `ZonaForm`. Toda esa cadena se borro el 2026-08-07 por decision humana.
//
// ⚠️ FICHA 374 — DEJA DE SER SOLO LECTURA. Hasta hoy este contrato solo leia; con la
// administracion del catalogo desde la app gana el arbol completo y las tres escrituras.
//
// ⚠️ NO DECLARA `delete` NI `deleteMany` PARA NINGUNA DE LAS TRES TABLAS, Y ESO ES UNA DECISION
// ESTRUCTURAL, NO UNA PROMESA (R5). Quitar un nodo del catalogo es DESACTIVARLO. El borrado fisico
// esta fuera de alcance en cualquier condicion: `orden` congela su terna geografica y un borrado
// dejaria ordenes historicas apuntando a la nada —o, con `ON DELETE SET NULL`, vaciaria su
// `distrito_id` en silencio—. La interfaz no lo declara, la clase no lo implementa, y
// `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` recorre `lib/` para que nadie
// lo añada por otro camino.
//
// ⚠️ FICHA 375 — YA SI DECLARA EL RENOMBRADO, y solo porque la clave estable existe. La 374 lo
// dejo fuera con un motivo medido: `scripts/seed-zonas.ts` resolvia la geografia por NOMBRE y, si
// no la encontraba, CREABA, asi que renombrar habria hecho que la siguiente corrida del seed creara
// un duplicado ACTIVO con el nombre viejo —y a partir de ahi `resolveGeo` responderia «distrito
// ambiguo en el canton» a toda carga que lo mencione—. El `@@unique` no lo atrapaba: los nombres
// difieren. Con `codigo_dta` el seed cruza por CODIGO y el nombre pasa a ser una ETIQUETA MUTABLE.
// El renombrado NO se puede reactivar sin esa columna: son la misma decision.
export interface IGeoRepository {
  // --- Feature 144/B2: proyecciones PLANAS para el catalogo de filtros de ordenes ---
  //
  // No se reusa `listarArbolGeografico()` (es `maestro`-only, anida y arrastra la zona
  // del distrito): el catalogo se precarga ENTERO en una sola entrega y el encadenamiento
  // se resuelve en el cliente, asi que se necesita el catalogo COMPLETO, no el de un
  // padre. Campos minimos (R54).
  //
  // FICHA 374: las tres siguen devolviendo TODOS los nodos —activos e inactivos— y añaden
  // `disponible`, la disponibilidad EFECTIVA. NO se recorta en el `WHERE` (R28): ocultar un
  // distrito retirado dejaria infiltrables las ordenes historicas de ese distrito.

  /** Todas las provincias `{id, nombre, disponible}`, orden determinista por nombre (R48/R49). */
  listProvinciasLite(): Promise<OpcionGeografica[]>;
  /** Todos los cantones `{id, nombre, padreId=provinciaId, disponible}`, por nombre (R48/R49). */
  listCantonesLite(): Promise<OpcionGeograficaConPadre[]>;
  /** Todos los distritos `{id, nombre, padreId=cantonId, disponible}`, por nombre (R48/R49). */
  listDistritosLite(): Promise<OpcionGeograficaConPadre[]>;

  /**
   * La cadena geografica ACOTADA a una zona: los distritos que la tabla puente
   * `zona_distrito` asocia a `zonaId`, mas sus cantones y provincias ascendientes.
   *
   * No es una optimizacion del catalogo completo: es OTRO catalogo. El adminSatelite solo
   * opera su zona, y ofrecerle las 494 filas del pais le deja elegir un canton que su
   * bodega no puede tener — un filtro que siempre devuelve cero y no dice por que.
   *
   * La zona sale del ACTOR, nunca de la peticion. La asociacion se lee de la N:M (feature
   * 24), que es la unica fuente de verdad desde que `distrito.zona_id` se elimino.
   */
  listGeografiaLitePorZona(zonaId: string): Promise<GeografiaFiltrosDTO>;

  // --- FICHA 374: la administracion del catalogo ---

  /**
   * El arbol COMPLETO (R26): provincia -> canton -> distrito, activos E INACTIVOS, con el flag
   * PROPIO de cada nivel y la zona UTILIZABLE de cada distrito (colapso 1/0/>1).
   *
   * NO recorta por disponibilidad, y no puede: si escondiera lo inactivo no habria forma de
   * reactivarlo desde la pantalla que existe para eso.
   */
  listArbol(): Promise<ProvinciaArbolDTO[]>;

  // --- SLT-46 (design §4.4): la administracion sobre `nodo_geografico` ---
  //
  // `GeoRepository` es el UNICO escritor del nodo (R43) y ya no escribe `provincia`, `canton` ni
  // `distrito` (R1): la copia a esas tablas la hace el trigger de T2.2 en la misma sentencia.

  /**
   * El arbol de N niveles de un pais (R21), activos e inactivos, con sus tipos; `null` si el pais no
   * existe. Desde el catalogo en memoria, sin CTE recursiva.
   */
  arbolDePais(paisId: string): Promise<ArbolDePais | null>;

  /** El contexto del alta (`ContextoDeAltaDeNodo`), o `null` si el pais o el padre no existen. */
  contextoDeAlta(destino: DestinoDeAlta): Promise<ContextoDeAltaDeNodo | null>;

  /**
   * Crea el nodo ACTIVO y escribe `nodo_geografico_creado` (entidad `nodo_geografico`, R35) en la
   * MISMA transaccion. Devuelve el id. Deja escapar la violacion de UNIQUE: el borde la traduce.
   */
  crear(datos: DatosDeAltaDeNodo, actorUsuarioId: string | null): Promise<string>;

  /** Los hermanos del nodo `id` —incluido el—, activos e inactivos, o `null` si no existe. */
  hermanosDeNodo(id: string): Promise<{ id: string; nombre: string }[] | null>;

  /** Cambia SOLO el `nombre` del nodo y lo registra en la misma transaccion (R18, R35). */
  renombrar(id: string, nombre: string, actorUsuarioId: string | null): Promise<DesenlaceDeRenombre>;

  /** Cambia SOLO el `activo` del nodo, sin tocar descendientes, y lo registra (R19, R35). */
  cambiarActivacion(
    id: string,
    activo: boolean,
    actorUsuarioId: string | null,
  ): Promise<DesenlaceDeActivacion>;

  /** La profundidad del nodo, o `null` si no existe (el conteo de R20). */
  profundidadDeNodo(id: string): Promise<number | null>;

  /** Los tipos y los nodos del pais con su profundidad, ordenados por `id`; `null` sin pais. */
  leerDivisionDePais(paisId: string): Promise<DivisionPorProfundidadDePais | null>;

  /**
   * Escribe un plan ya validado en UNA transaccion: un `createMany` de nodos por profundidad, de
   * arriba abajo, con el tipo de cada una; los codigos vacios; y `division_cargada` (con `creados`
   * por profundidad) si escribio algo (R33, R36).
   */
  importarDivision(
    paisId: string,
    plan: PlanDivisionPorProfundidad,
    actorUsuarioId: string | null,
  ): Promise<ResumenCargaPorProfundidad>;

  // --- SL-20 por nivel: las formas que `GeografiaService` usa hasta T4 ---
  //
  // Mismos desenlaces que antes de SLT-46 (R12), resueltos sobre el nodo: un `id` que no es de la
  // profundidad del `nivel` pedido es «no existe», como cuando cada nivel era su tabla.

  /**
   * SL-20 — el arbol de UN pais para el superadmin (R20, R29, R30): activos e inactivos, con el
   * codigo, SIN zonas. Filtra por `paisId` de forma explicita porque corre como dueño, sin RLS.
   */
  listArbolDePais(paisId: string): Promise<ProvinciaPlataformaDTO[]>;

  /**
   * El contexto del alta (`ContextoDeAlta`), o `null` si el contenedor NO EXISTE. Una sola consulta
   * resuelve las preguntas del alta: si el contenedor existe (R14), si el nombre ya esta cogido
   * (R15) y con que regla se valida el codigo (R17).
   *
   * `contenedorId` es el PADRE en cantón y distrito, y el PAIS en la provincia (SL-20): las
   * hermanas de una provincia son las de su pais, no todas las de la tabla.
   *
   * Los hermanos van TODOS, activos e inactivos, y con el nombre CRUDO: la comparacion por
   * `normalizeName` es del service, no del `WHERE`. Un `findFirst({ where: { nombre } })`
   * compararia LITERALES y dejaria entrar «San Jose» junto a «San José», que para `resolveGeo` son
   * una sola cosa AMBIGUA (design §9, A8).
   */
  findHermanos(nivel: NivelGeografico, contenedorId: string): Promise<ContextoDeAlta | null>;

  /**
   * Crea el nodo ACTIVO (R13, R29) y escribe `nodo_geografico_creado` en el historial de
   * plataforma en la MISMA transaccion (R33). Devuelve el id.
   *
   * DEJA ESCAPAR la violacion de UNIQUE a proposito: la traduce el borde a `conflict`. La base es
   * la ultima palabra ante una carrera; la regla de normalizacion y la del codigo son del service.
   */
  crear(
    nivel: NivelGeografico,
    nombre: string,
    padreId: string | null,
    opciones: OpcionesDeAlta,
    actorUsuarioId: string | null,
  ): Promise<string>;

  /**
   * Cambia el flag `activo` de UNA fila Y registra la accion en la MISMA transaccion. Desde SL-20 la
   * registra en el historial de PLATAFORMA, no en `historial_accion` (R33, R35).
   *
   * TRES desenlaces, y son tres a proposito: «no existe» != «ya estaba asi» != «cambio», porque
   * SOLO EL TERCERO audita. Pedir desactivar lo ya inactivo no escribe ni el `update` ni la fila
   * de registro (R21/R53): «se pidio» y «se hizo» son cosas distintas, que es el precedente
   * literal de `VehiculoRepository.delete`.
   *
   * NO TOCA NINGUNA FILA DE LOS DESCENDIENTES (R8). Es lo que hace que reactivar sea reversible.
   */
  cambiarActivacion(
    nivel: NivelGeografico,
    id: string,
    activo: boolean,
    actorUsuarioId: string | null,
  ): Promise<"no_existe" | "sin_cambio" | "cambiado">;

  // --- FICHA 375: el renombrado ---

  /**
   * Los hermanos del nodo `id` —TODOS, activos e inactivos, INCLUIDO EL PROPIO NODO—, o `null` si
   * el nodo NO EXISTE. Las hermanas de una provincia son las de SU pais (SL-20, R15).
   *
   * ES DISTINTO DE `findHermanos`, y por eso son dos metodos y no uno: aquel parte del PADRE (lo
   * que sabe un alta) y este del PROPIO NODO (lo que sabe un renombrado, que no recibe el padre).
   * Con una sola consulta se resuelven las dos preguntas del renombrado: si el nodo existe (R22) y
   * si el nombre nuevo ya esta cogido por un hermano.
   *
   * SE DEVUELVE EL NODO DENTRO de la lista a proposito: quien compara necesita poder EXCLUIRLO por
   * su `id` —renombrar un nodo a su propio nombre no es un conflicto—, y filtrarlo aqui dejaria al
   * service sin forma de distinguir «choca consigo mismo» de «choca con otro».
   */
  findHermanosDeNodo(
    nivel: NivelGeografico,
    id: string,
  ): Promise<{ id: string; nombre: string }[] | null>;

  /**
   * Cambia el `nombre` de UNA fila Y registra la accion en la MISMA transaccion, en el historial de
   * PLATAFORMA desde SL-20 (R33, R35).
   *
   * ⚠️ NO TOCA `codigo_dta`: es la clave estable y renombrar es justo la operacion que existe
   * PORQUE el nombre no lo es. Si esta escritura tocara el codigo, la siguiente corrida del seed
   * volveria a duplicar el nodo y la ficha entera no serviria para nada.
   *
   * TRES desenlaces, por el mismo motivo que `cambiarActivacion`: «no existe» != «ya se llamaba
   * asi» != «cambio», porque SOLO EL TERCERO audita. Guardar sin cambios devuelve `sin_cambio` y no
   * escribe ni el `update` ni la fila de registro.
   *
   * DEJA ESCAPAR la violacion de UNIQUE: la traduce el borde a `conflict`. La comprobacion por
   * clave NORMALIZADA es del service; la base es la ultima palabra ante una carrera.
   */
  renombrar(
    nivel: NivelGeografico,
    id: string,
    nombre: string,
    actorUsuarioId: string | null,
  ): Promise<"no_existe" | "sin_cambio" | "renombrado">;
}
