import type {
  GeografiaFiltrosDTO,
  LugaresDeFiltroDTO,
  OpcionGeografica,
  OpcionGeograficaConPadre,
} from "@/lib/types/filtros-ordenes";
import type {
  ArbolDeZonasDTO,
  NodoArbolPlataformaDTO,
  ProvinciaArbolDTO,
  TipoNivelDTO,
} from "@/lib/types/geografia-nodo";
import type {
  NodoExistenteConProfundidad,
  PlanDivisionPorProfundidad,
  ResumenCargaPorProfundidad,
} from "@/lib/types/division-csv";

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
  /**
   * El tipo del padre (`null` en una raiz): lo nombra el rechazo de R15, «Este país no tiene un nivel
   * por debajo de <tipo del padre>». Sale de la misma lectura de los tipos del pais.
   */
  tipoDelPadre: TipoNivelDTO | null;
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

/**
 * Los desenlaces de un cambio de un nodo: solo el último escribe y audita. SLT-46 (2026-11-09, design
 * §4.7; R61): en el renombre, `cambio_concurrente` es que el nombre de la base ya no era el
 * `nombreAnterior` que mostró la pantalla (otra persona lo cambió); no se escribió nada.
 */
export type DesenlaceDeRenombre = "no_existe" | "sin_cambio" | "cambio_concurrente" | "renombrado";
export type DesenlaceDeActivacion = "no_existe" | "sin_cambio" | "cambiado";

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

  /**
   * SLT-47 (design §3.3; R1, R36): los niveles del pais de la empresa y sus lugares a cualquier
   * profundidad, en el orden del catalogo. Sin `zonaId`, el catalogo entero; con `zonaId`, el mismo
   * conjunto que `listGeografiaLitePorZona` (los nodos que la zona cubre, sin las excepciones de otra
   * zona, y sus ancestros) sin cortar en la profundidad 3.
   */
  listLugaresDeFiltro(zonaId?: string): Promise<LugaresDeFiltroDTO>;

  // --- FICHA 374: la administracion del catalogo ---

  /**
   * El arbol COMPLETO (R26): provincia -> canton -> distrito, activos E INACTIVOS, con el flag
   * PROPIO de cada nivel y la zona UTILIZABLE de cada distrito (colapso 1/0/>1).
   *
   * NO recorta por disponibilidad, y no puede: si escondiera lo inactivo no habria forma de
   * reactivarlo desde la pantalla que existe para eso.
   */
  listArbol(): Promise<ProvinciaArbolDTO[]>;

  /**
   * SLT-89 (design §4.2; R24–R27): el arbol del pais de la empresa a TODAS sus profundidades, con la
   * asignacion directa de cada nodo y la zona que hereda de un ancestro. Desde el catalogo en
   * memoria, sin CTE. `listArbol` (3 niveles) se queda para sus consumidores de hoy.
   */
  arbolDeZonas(): Promise<ArbolDeZonasDTO>;

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

  /**
   * Los hermanos del nodo `id` —TODOS, activos e inactivos, INCLUIDO EL PROPIO NODO—, o `null` si no
   * existe; los de una raiz son las raices de SU pais.
   *
   * ES DISTINTO DE `contextoDeAlta`: aquel parte del PADRE (lo que sabe un alta) y este del PROPIO
   * NODO (lo que sabe un renombrado). Se devuelve el nodo dentro a proposito: quien compara necesita
   * poder EXCLUIRLO por su `id` —renombrar un nodo a su propio nombre no es un conflicto—.
   */
  hermanosDeNodo(id: string): Promise<{ id: string; nombre: string }[] | null>;

  /**
   * Cambia SOLO el `nombre` del nodo y lo registra en la misma transaccion (R18, R35).
   *
   * ⚠️ NO TOCA `codigo_oficial`: es la clave estable, y renombrar existe PORQUE el nombre no lo es.
   * CUATRO desenlaces: «no existe» != «ya se llamaba asi» != «otro lo cambio» != «cambio», y SOLO EL
   * ULTIMO escribe y audita. «Ya se llamaba asi» se mira ANTES que `nombreAnterior` (R18); despues,
   * el nombre se escribe solo si sigue siendo `nombreAnterior`, en la misma sentencia (R61).
   * DEJA ESCAPAR la violacion de UNIQUE: el borde la traduce a `conflict`.
   */
  renombrar(
    id: string,
    nombre: string,
    nombreAnterior: string,
    actorUsuarioId: string | null,
  ): Promise<DesenlaceDeRenombre>;

  /**
   * Cambia SOLO el `activo` del nodo, sin tocar descendientes, y lo registra (R19, R35). Los mismos
   * tres desenlaces que `renombrar`: pedir el estado que ya tiene no escribe ni el `update` ni la fila
   * de registro. NO TOCA A LOS DESCENDIENTES: es lo que hace que reactivar sea reversible.
   */
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
}
