import type { CambioConcurrenteResult } from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type {
  CambiarActivacionGeograficaInput,
  CrearNodoGeograficoInput,
  NodoArbolPlataformaDTO,
  NodoGeograficoInput,
  ProvinciaArbolDTO,
  RenombrarNodoGeograficoInput,
  TipoNivelDTO,
} from "@/lib/types/geografia-nodo";

// FICHA 374 (design §5.2) — el contrato del servicio que administra el catalogo geografico.
//
// `Actor` se IMPORTA de `IVehiculoService` y no se redeclara: es el mismo objeto de sesion
// (`usuarioId` + `rol`) que resuelve `resolveActorFromSession`, y dos declaraciones del actor
// serian dos definiciones de «quien puede» que un dia divergen. Es lo que ya hacen los demas
// servicios del catalogo.
//
// `unauthenticated` NO aparece en ningun resultado de aqui: lo resuelve la Server Action ANTES de
// instanciar el servicio (R23), igual que en vehiculos.
//
// ⚠️ NINGUN METODO BORRA (R5): quitar un nodo es DESACTIVARLO. Ver el porque en `IGeoRepository`.
// El RENOMBRADO si existe desde la ficha 375, y solo porque `codigo_dta` le dio al catalogo una
// clave estable: sin ella, renombrar duplicaba el nodo en la siguiente corrida del seed.

export type ListarArbolGeograficoServiceResult =
  | { status: "ok"; provincias: ProvinciaArbolDTO[] }
  | { status: "forbidden" };

/**
 * SL-20 — el arbol de un pais para el superadmin: sin zonas, con el codigo. SLT-46 (R21): a cualquier
 * profundidad, con los tipos del pais. Un pais que no existe da un arbol vacio, como en SL-20 (R12).
 */
export type ListarArbolDePaisServiceResult =
  | { status: "ok"; tipos: TipoNivelDTO[]; raices: NodoArbolPlataformaDTO[] }
  | { status: "forbidden" };

// SLT-46: los `ok` ya no repiten el `nivel` de la entrada, que deja de viajar (el nodo se nombra por
// su id y su profundidad la dice la base).
export type CrearNodoGeograficoServiceResult =
  | { status: "ok"; id: string }
  /**
   * ⭑ FICHA 392 — el nombre lleva un caracter que la ETIQUETA no puede imprimir.
   *
   * Sale del SERVICIO y no del zod del borde a proposito: la decision de «que es imprimible» se
   * toma con la cobertura de la fuente del PDF, y `lib/types/geografia-nodo.ts` viaja al
   * navegador (mismo criterio que la 383 aplico a `filaCargaSchema`, design §5.1).
   *
   * La forma es la MISMA que ya produce el borde ante un ZodError, asi que la Server Action no
   * cambia una linea y la pantalla lo pinta bajo el campo `nombre` con el codigo que ya tiene.
   *
   * SLT-46 (R15): tambien en `padreId` cuando el pais no tiene tipo para la profundidad del alta.
   */
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  /** El nombre ya existe bajo ese padre, comparado por su forma NORMALIZADA (R17). */
  | { status: "conflict" }
  /** El padre indicado no existe (R14). No se crea ninguna fila. */
  | { status: "not_found" }
  | { status: "forbidden" };

export type CambiarActivacionGeograficaServiceResult =
  | { status: "ok"; id: string; activo: boolean }
  /** El nodo indicado no existe (R22). No se modifica ninguna fila. */
  | { status: "not_found" }
  | { status: "forbidden" };

export type RenombrarNodoGeograficoServiceResult =
  | { status: "ok"; id: string; nombre: string }
  /**
   * ⭑ FICHA 392 — el nombre NUEVO lleva un caracter que la ETIQUETA no puede imprimir.
   *
   * Esta rama es la que cierra el agujero que abrio la 375: hasta ella el catalogo no se podia
   * renombrar, asi que sus nombres eran los del seed oficial. Desde que se puede renombrar, la
   * unica cosa que separa al catalogo de un caracter no imprimible es esta comprobacion.
   */
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  /** Otro HERMANO ya se llama asi, comparado por su forma NORMALIZADA. Nunca el nodo consigo mismo. */
  | { status: "conflict" }
  /**
   * SLT-46 (R61): el nombre de la base ya no era el `nombreAnterior` que mostro la pantalla. Variante
   * NUEVA: el `conflict` de arriba (hermano) sigue sin `motivo` (R12).
   */
  | CambioConcurrenteResult
  /** El nodo indicado no existe. No se modifica ninguna fila. */
  | { status: "not_found" }
  | { status: "forbidden" };

export type ContarOrdenesSinEntregarServiceResult =
  | { status: "ok"; ordenes: number }
  | { status: "not_found" }
  | { status: "forbidden" };

export interface IGeografiaService {
  /** El arbol COMPLETO, activos e inactivos (R26). Solo `maestro`. */
  listarArbol(actor: Actor): Promise<ListarArbolGeograficoServiceResult>;

  /**
   * SL-20 (R20, R29, R30) — el arbol de UN pais, activos e inactivos, sin zonas. Solo plataforma.
   * SLT-46 (R21): a cualquier profundidad, con los tipos del pais.
   */
  listarArbolDePais(paisId: string, actor: Actor): Promise<ListarArbolDePaisServiceResult>;

  /**
   * SLT-46 (R14–R17) — alta de un nodo como raiz de un pais (`paisId`) o hijo de cualquier nodo
   * (`padreId`), con el tipo de su profundidad (P1) y codigo opcional que cumple la regla de ese tipo;
   * un codigo que no la cumple es `validation_error` en `codigo`, y un pais sin tipo para esa
   * profundidad, `validation_error` en `padreId` (R15). El nodo nace ACTIVO, incluso si su padre esta
   * retirado: su flag propio es `true` y su disponibilidad efectiva es falsa. No es una
   * inconsistencia, es la cascada evaluandose.
   */
  crear(
    input: CrearNodoGeograficoInput,
    actor: Actor,
  ): Promise<CrearNodoGeograficoServiceResult>;

  /**
   * Desactiva o reactiva UN nodo (R20). Escribe el flag de ESA SOLA FILA y NO toca a ningun
   * descendiente (R8): por eso reactivar devuelve el arbol exactamente como estaba (R9).
   *
   * Pedir el estado en el que el nodo ya esta devuelve `ok` sin escribir nada (R21/R53).
   */
  cambiarActivacion(
    input: CambiarActivacionGeograficaInput,
    actor: Actor,
  ): Promise<CambiarActivacionGeograficaServiceResult>;

  /**
   * FICHA 375 — cambia el NOMBRE de un nodo, de cualquier profundidad (SLT-46, R18). Solo plataforma.
   *
   * NO toca `codigo_dta`, que es la clave estable: el nombre es una etiqueta y el codigo es la
   * identidad. Esa separacion es lo que hace que el seed no duplique el nodo despues.
   *
   * Renombrarlo a SU PROPIO nombre devuelve `ok` (guardar sin cambios tiene que seguir
   * funcionando); renombrarlo al de un HERMANO devuelve `conflict`, comparado por la clave
   * normalizada —sin mayusculas ni acentos— porque es la que usa `resolveGeo` y el UNIQUE literal
   * de la base dejaria entrar «San Jose» junto a «San José».
   */
  renombrar(
    input: RenombrarNodoGeograficoInput,
    actor: Actor,
  ): Promise<RenombrarNodoGeograficoServiceResult>;

  /**
   * SOLO LECTURA — cuantas ordenes SIN ENTREGAR cuelgan del nodo (R60). Alimenta la confirmacion
   * de desactivar y no condiciona la operacion: si falla, la pantalla lo dice y no bloquea (R62).
   * SLT-46 (R20): un nodo de profundidad 4 o mas, o uno que no existe, cuenta 0.
   */
  contarOrdenesSinEntregar(
    input: NodoGeograficoInput,
    actor: Actor,
  ): Promise<ContarOrdenesSinEntregarServiceResult>;
}
