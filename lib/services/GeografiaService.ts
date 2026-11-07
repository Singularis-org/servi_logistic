import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { IGeoRepository } from "@/lib/interfaces/repositories/IGeoRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type {
  CambiarActivacionGeograficaServiceResult,
  ContarOrdenesSinEntregarServiceResult,
  CrearNodoGeograficoServiceResult,
  IGeografiaService,
  ListarArbolDePaisServiceResult,
  ListarArbolGeograficoServiceResult,
  RenombrarNodoGeograficoServiceResult,
} from "@/lib/interfaces/services/IGeografiaService";
import {
  NIVELES_GEOGRAFICOS,
  type AltaDeNodoInput,
  type CambiarActivacionNodoInput,
  type NodoPorIdInput,
  type RenombrarNodoInput,
} from "@/lib/types/geografia-nodo";
import { validarCodigoDeTipo } from "@/lib/utils/codigo-geografico";
import { rechazoDeNombreDeEtiqueta } from "@/lib/utils/nombre-imprimible-etiqueta";
import { normalizeName } from "@/lib/utils/normalize";

// FICHA 374 (design §5.2) — la administracion del catalogo geografico.
//
// Autz (SL-32, R24/R25): el catalogo es de la plataforma, y lo gestiona ella. El `maestro` solo
// conserva `listarArbol`, porque Tarifas lo lee para armar zonas, y quitarselo le romperia esa
// pantalla. El conteo de ordenes va con la gestion: solo lo pide la confirmacion de un retiro.
// Desde SL-17 la geografia es de solo lectura para una empresa, asi que dejar al `maestro` en la
// gestion no le daria nada: su escritura fallaria en la base con un error crudo, en vez de con
// este `forbidden`. Los dos conjuntos leen `ROLES_PLATAFORMA` por import: la guardia
// `superadmin-fuera-de-empresa` rechaza el literal. La ausencia de sesion (`unauthenticated`) se
// resuelve antes, en la Server Action.
//
// SLT-46 (design §4.3; R14–R20, R39): todo va por NODO, a cualquier profundidad. La entrada nombra
// el nodo por su id (o el pais o el padre en un alta) y la profundidad la dice la base. El rol se
// mira en cada metodo ANTES de leer o escribir nada (R39).
const READ_ROLES = new Set<string>(["maestro", ...ROLES_PLATAFORMA]);
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

/**
 * El SEGUNDO repositorio, por `Pick` de la interfaz de ordenes — patron de
 * `CorregirDatosClienteRepo`.
 *
 * POR QUE ENTRA UN REPOSITORIO DE ORDENES EN UN SERVICIO DE GEOGRAFIA: el conteo de R60 es una
 * lectura de ORDENES y vive donde viven las ordenes. Traerlo aqui por `Pick` deja el acoplamiento
 * escrito y acotado a UN metodo.
 *
 * ⚠️ Un servicio que lo recibe `undefined` COMPILA IGUAL y muere en produccion. Por eso hay un
 * test que comprueba que el composition root lo PASA, no solo que lo importa.
 */
export type GeografiaOrdenesRepo = Pick<IOrdenRepository, "contarSinEntregarPorNodoGeografico">;

export class GeografiaService implements IGeografiaService {
  constructor(
    private readonly repo: IGeoRepository,
    private readonly ordenes: GeografiaOrdenesRepo,
  ) {}

  async listarArbol(actor: Actor): Promise<ListarArbolGeograficoServiceResult> {
    if (!READ_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", provincias: await this.repo.listArbol() };
  }

  /**
   * SL-20 — el arbol de un pais para el superadmin. La empresa lee el suyo con `listarArbol`.
   * SLT-46 (R21): a cualquier profundidad, con los tipos. Un pais que no existe da el arbol vacio que
   * daba SL-20 (R12): el selector de la pagina solo ofrece paises dados de alta.
   */
  async listarArbolDePais(paisId: string, actor: Actor): Promise<ListarArbolDePaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    const arbol = await this.repo.arbolDePais(paisId);
    return { status: "ok", tipos: arbol?.tipos ?? [], raices: arbol?.raices ?? [] };
  }

  /**
   * El alta, en los pasos donde vive TODA la regla:
   *
   *   1. el rol, ANTES de tocar la base (R39);
   *   2. el nombre imprimible (ficha 392), antes de la primera consulta;
   *   3. `contextoDeAlta` — UNA consulta que resuelve las preguntas: `null` significa «el padre (o el
   *      pais, en una raiz) no existe» (R16), y trae los hermanos, el tipo de la profundidad del alta
   *      y el codigo del padre;
   *   4. el tipo de la profundidad (P1, R14): si el pais no lo tiene, `validation_error` (R15). Va
   *      antes que el nombre porque sin tipo no hay nivel donde competir por el nombre;
   *   5. la comparacion por `normalizeName` (R16). ⚠️ AQUI ESTA LA DIFERENCIA CON VEHICULOS: alli
   *      basta el `trim` + colapso porque el UNIQUE compara literales. Aqui el UNIQUE literal NO
   *      BASTA, porque `resolveGeo` indexa por `normalizeName` —minusculas Y sin acentos—, asi que
   *      «San José» y «San Jose» serian dos filas legales para la base y UNA SOLA COSA AMBIGUA
   *      para la carga masiva. La base sigue siendo la ultima palabra ante una carrera;
   *   6. el codigo, si lo trae, con la regla del TIPO (R17) y el codigo del padre como prefijo. La
   *      MISMA funcion que la carga CSV;
   *   7. el alta, con el nombre recortado y colapsado pero con SUS mayusculas y SUS acentos. La
   *      unicidad del codigo es del UNIQUE de la base: el borde la traduce a `conflict`.
   *
   * Se comparan los hermanos EN MEMORIA en vez de con un `findFirst({ where: { nombre } })`, que
   * compararia literales y dejaria pasar justo el caso que esto viene a impedir.
   *
   * Un hermano INACTIVO tambien produce `conflict`: el nombre sigue ocupado para el UNIQUE, y
   * reactivar el viejo despues chocaria con el nuevo.
   */
  async crear(input: AltaDeNodoInput, actor: Actor): Promise<CrearNodoGeograficoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    // ⭑ FICHA 392 — el nombre de este nodo SE IMPRIME en la etiqueta (`geografiaLegible` lo une
    // en el dato `ubicacion`), asi que uno que la fuente no cubra tumba el LOTE ENTERO de un
    // golpe. Va ANTES de la primera consulta y por tanto muy antes de escribir: si se rechaza,
    // no se ha leido ni se ha tocado nada.
    const rechazo = rechazoDeNombreDeEtiqueta(input.nombre);
    if (rechazo) return { status: "validation_error", fieldErrors: rechazo };

    const destino = "padreId" in input ? { padreId: input.padreId } : { paisId: input.paisId };
    const contexto = await this.repo.contextoDeAlta(destino);
    if (contexto === null) return { status: "not_found" }; // R16: el padre (o el pais) no existe

    if (contexto.tipo === null) return { status: "validation_error", fieldErrors: sinTipo(contexto) };

    const clave = normalizeName(input.nombre);
    if (contexto.hermanos.some((h) => normalizeName(h.nombre) === clave)) {
      return { status: "conflict" }; // 374/R17, SL-20/R15, SLT-46/R16
    }

    const codigo = input.codigo ?? null;
    if (codigo !== null) {
      const motivo = validarCodigoDeTipo(contexto.tipo, codigo, contexto.codigoPadre);
      if (motivo !== null) return { status: "validation_error", fieldErrors: { codigo: [motivo] } };
    }

    const id = await this.repo.crear(
      {
        paisId: contexto.paisId,
        padreId: "padreId" in input ? input.padreId : null,
        profundidad: contexto.profundidad,
        tipoId: contexto.tipo.id,
        nombre: input.nombre,
        codigo,
      },
      actor.usuarioId,
    );
    return { status: "ok", id };
  }

  /**
   * Desactivar o reactivar UN nodo, de cualquier profundidad (R19). Los tres desenlaces del
   * repositorio se traducen aqui:
   *
   *   `no_existe`  -> `not_found`, sin escrituras;
   *   `sin_cambio` -> `ok` con el estado pedido: pedir lo que ya esta es exito, y no ha escrito ni el
   *                   `update` ni la fila de registro;
   *   `cambiado`   -> `ok`, y esa es la unica rama que audita.
   */
  async cambiarActivacion(
    input: CambiarActivacionNodoInput,
    actor: Actor,
  ): Promise<CambiarActivacionGeograficaServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const desenlace = await this.repo.cambiarActivacion(input.id, input.activo, actor.usuarioId);
    if (desenlace === "no_existe") return { status: "not_found" };
    return { status: "ok", id: input.id, activo: input.activo };
  }

  /**
   * FICHA 375 — el renombrado, en los pasos donde vive TODA la regla (SLT-46 R18: a cualquier
   * profundidad):
   *
   *   1. el rol, ANTES de tocar la base;
   *   2. `hermanosDeNodo` — UNA consulta que resuelve las DOS preguntas: `null` significa «el
   *      nodo no existe» (`not_found`), y la lista es contra la que se compara el nombre nuevo;
   *   3. la comparacion por `normalizeName`, EXCLUYENDO AL PROPIO NODO. Las dos mitades importan:
   *        - se excluye el nodo porque renombrarlo a su propio nombre —o a una variante que se
   *          normaliza igual, «san jose» -> «San José»— NO es un conflicto: guardar sin cambios
   *          tiene que seguir funcionando;
   *        - se compara NORMALIZADO, y no literal, por lo mismo que el alta: el UNIQUE literal de la
   *          base dejaria entrar «San Jose» junto a «San José», que para `resolveGeo` son una sola
   *          cosa AMBIGUA;
   *   4. el renombrado, con el nombre recortado y colapsado pero con SUS mayusculas y SUS acentos.
   *
   * Se reusa `normalizeName` —la MISMA funcion con la que indexa la carga masiva— en vez de
   * declarar una segunda normalizacion: dos claves son dos reglas que un dia divergen.
   */
  async renombrar(
    input: RenombrarNodoInput,
    actor: Actor,
  ): Promise<RenombrarNodoGeograficoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    // ⭑ FICHA 392 — el renombrado es LA puerta que abrio la 375, y por aqui entra el mismo
    // caracter que la 383 cerro por el lado de la orden. Se comprueba ANTES de leer los hermanos:
    // un nombre que no se puede imprimir no llega a competir por el UNIQUE.
    const rechazo = rechazoDeNombreDeEtiqueta(input.nombre);
    if (rechazo) return { status: "validation_error", fieldErrors: rechazo };

    const hermanos = await this.repo.hermanosDeNodo(input.id);
    if (hermanos === null) return { status: "not_found" };

    const clave = normalizeName(input.nombre);
    const chocaConOtro = hermanos.some(
      (h) => h.id !== input.id && normalizeName(h.nombre) === clave,
    );
    if (chocaConOtro) return { status: "conflict" };

    const desenlace = await this.repo.renombrar(input.id, input.nombre, actor.usuarioId);
    // `no_existe` solo puede llegar aqui por una carrera: el nodo estaba al leer los hermanos y ya
    // no esta al escribir. Se traduce igual que arriba en vez de inventar un desenlace nuevo.
    if (desenlace === "no_existe") return { status: "not_found" };
    return { status: "ok", id: input.id, nombre: input.nombre };
  }

  /**
   * SOLO LECTURA (R60). El conteo de ordenes (SLT-65) sigue por nivel: las ordenes solo guardan su
   * lugar en las profundidades 1–3. Por eso se lee antes la profundidad del nodo: 1/2/3 pasan a
   * provincia/canton/distrito, y un nodo mas profundo —o uno que no existe— no tiene ordenes que
   * colgar y cuenta 0 sin preguntar (R20). La confirmacion usa el numero para INFORMAR, no para
   * decidir si la operacion procede.
   */
  async contarOrdenesSinEntregar(
    input: NodoPorIdInput,
    actor: Actor,
  ): Promise<ContarOrdenesSinEntregarServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    const profundidad = await this.repo.profundidadDeNodo(input.id);
    const nivel = profundidad === null ? undefined : NIVELES_GEOGRAFICOS[profundidad - 1];
    if (nivel === undefined) return { status: "ok", ordenes: 0 };
    const ordenes = await this.ordenes.contarSinEntregarPorNodoGeografico(nivel, input.id);
    return { status: "ok", ordenes };
  }
}

/**
 * R15: el pais no tiene tipo para la profundidad del alta. El campo es `padreId` porque es donde la
 * pantalla ofrecio «agregar hijo». Una raiz sin tipo de nivel 1 solo puede venir de un pais con los
 * tipos rotos (todo pais nace con al menos dos); se responde igual, en `paisId`.
 */
function sinTipo(contexto: {
  tipoDelPadre: { nombreSingular: string } | null;
}): Record<string, string[]> {
  if (contexto.tipoDelPadre === null) return { paisId: ["Este país no tiene ningún nivel."] };
  return { padreId: [`Este país no tiene un nivel por debajo de ${contexto.tipoDelPadre.nombreSingular}`] };
}
