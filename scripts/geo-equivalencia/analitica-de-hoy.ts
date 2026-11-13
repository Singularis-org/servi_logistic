import { Prisma } from "@prisma/client";
import type {
  GestionResultado,
  PrismaClient,
  TarifaConcepto,
  TarifaModelo,
  TarifaModo,
  TarifaNivel,
} from "@prisma/client";

import type { AlcanceDatos } from "@/lib/analytics/alcance";
import type { ConsultaConteoEntregas, RecorteDeOrdenes } from "@/lib/analytics/entregas-conteo";
import type { ConsultaProductos } from "@/lib/analytics/productos-consulta";
import type { RangoResuelto } from "@/lib/analytics/types";
import { descargaConfig } from "@/lib/config/descarga";
import type { CicloCrudo } from "@/lib/interfaces/repositories/ICicloVidaRepository";
import type { CohorteCuboCrudo } from "@/lib/interfaces/repositories/ICohorteCargaRepository";
import type { CausaCruda } from "@/lib/interfaces/repositories/IConteoDevolucionesRepository";
import type { ConteoHoyCrudo } from "@/lib/interfaces/repositories/IConteoHoyGestionRepository";
import type { FilaProductoCruda } from "@/lib/interfaces/repositories/IConteoProductosRepository";
import type {
  FilaDineroCruda,
  LecturaDineroProductos,
} from "@/lib/interfaces/repositories/IDineroProductosRepository";
import { DIA_CR } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { ventanaDeCarga } from "@/lib/repositories/ventana-de-carga";
import type { CohorteDesenlace } from "@/lib/types/cohorte-carga";
import { RESULTADOS_DE_CIERRE } from "@/lib/types/conteo-ciclo-vida";
import type { ConteoDeDia } from "@/lib/types/conteo-cargadas";
import { CAUSA_SIN_TIPIFICAR } from "@/lib/types/conteo-devoluciones";
import type { ConteoDeStatus } from "@/lib/types/conteo-por-status";
import { ESTADOS_TERMINALES } from "@/lib/types/order-status-transiciones";
import type { OrdenCongelada } from "@/lib/utils/aporte-por-orden";
import { tarifaDe, type ConceptoCongeladoRow, type TarifaCongelada } from "@/lib/utils/cierre-detalle";
import { RESULTADOS_QUE_APORTAN } from "@/lib/utils/dinero-por-producto";
import { fulfillmentCongeladoDe } from "@/lib/utils/fulfillment-congelado";
import type { Hito } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito, FilaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";

// SLT-71 (design §7; T1.2) — LA LECTURA DE HOY, CONGELADA. NO SE EDITA.
//
// Copia literal de las lecturas de analitica y de transito que SLT-71 pasa al catalogo
// (`nodo_geografico`), tal como estaban en `origin/dev` c301fc87 —con SLT-64 ya mergeada (PR #77)—,
// ANTES de tocar los repositorios. Es «el antes» contra el que se comparan las lecturas nuevas: los
// tests de integracion, el script de equivalencia (`scripts/geo-equivalencia-analitica.ts`) y el de
// rendimiento (`scripts/geo-explain-analitica.ts`). Si se tocara para que un test pase, la comparacion
// dejaria de probar nada.
//
// Unicos cambios respecto del original:
// - cada metodo es una funcion libre que recibe el cliente (`this.prisma` -> `cliente`);
// - las funciones del `where` y las lecturas llevan el sufijo `DeHoy` (`condicionDeAlcance` no: es la
//   unica sin geografia que el design nombra igual), y `condicionesDeHoy` de `ConteoHoyGestion` pasa a
//   `condicionesDelDiaDeHoy`. Las llamadas entre ellas apuntan a las copias, nunca a `lib/`;
// - las tres `FilaCruda` privadas se renombran (`FilaCrudaTransito`, `FilaCrudaProductos`,
//   `FilaCrudaDinero`) para convivir en un solo modulo;
// - `comoParametros` y `enLista`, identicas byte a byte en los cuatro repositorios de origen, se
//   copian una sola vez.
// Los cuerpos —SQL, condiciones, orden, mapeo—, comentarios incluidos, son los de entonces. Los
// helpers y constantes exportados de `lib/` que no leen geografia se importan (`DIA_CR`,
// `ventanaDeCarga`, `tarifaDe`, ...). Cada bloque cita el archivo y las lineas de c301fc87.
//
// `plegarEnDesenlaces` (`ConteoEntregasRepository`) no se copia: no lee geografia. Se re-exporta de
// `lib/` para que «entregas de hoy» sea `plegarEnDesenlaces(await contarPorStatusDeHoy(...))`.
//
// La tabla de design §7 nombraba `condicionDeVentanaTerminal`, de antes de SLT-64; con SLT-64 esa
// funcion es `condicionDeVentanaDeCierre` y asi se copia (`condicionDeVentanaDeCierreDeHoy`).
//
// Vive en `scripts/` y no en `lib/` porque filtra por las columnas viejas (`provincia_id`,
// `canton_id`, `distrito_id`) y une con `canton` y `distrito`, que las guardias de `lib/` vigilan.
//
// Se borra con SLT-48.

export { plegarEnDesenlaces } from "@/lib/repositories/ConteoEntregasRepository";

// SLT-47 (design §7) — LAS TRES FACETAS DE HOY, CONGELADAS AQUI. El contrato (`FiltroConteoEntregas`)
// ya no las tiene: lleva `lugar_id`. El lado «hoy» de la equivalencia las sigue leyendo, por columna,
// de un filtro al que se le añaden con `conFacetasDeHoy`; el lado «nuevo» usa `lugar_id`.

/** `provincia_id`, `canton_id` y `distrito_id` como las recibia el filtro antes de SLT-47. */
export interface FacetasDeHoy {
  readonly provincia_id?: readonly string[];
  readonly canton_id?: readonly string[];
  readonly distrito_id?: readonly string[];
}

/** Las facetas de hoy del filtro (las que le puso `conFacetasDeHoy`; ninguna si no se le puso nada). */
function facetasDeHoy(filtro: object): FacetasDeHoy {
  return filtro as FacetasDeHoy;
}

/**
 * La misma consulta preparada (con su alcance y su rango) con las facetas de hoy en el filtro. Solo
 * para el lado «hoy»: los repositorios no las leen. Sin `lugar_id`, para que el «hoy» filtre solo por
 * columna.
 */
export function conFacetasDeHoy<C extends { readonly filtro: object }>(consulta: C, facetas: FacetasDeHoy): C {
  const { lugar_id: _nuevo, ...resto } = consulta.filtro as { lugar_id?: unknown };
  return { ...consulta, filtro: { ...resto, ...facetas } } as C;
}

// =================================================================================================
// ConteoPorStatusRepository (lib/repositories/ConteoPorStatusRepository.ts)
// =================================================================================================

// Copia de ConteoPorStatusRepository.ts:60–66 en c301fc87.
/** Cliente MINIMO consumido (patron `AnaliticaRollupRepository`): una sola consulta cruda. */
type ConteoPorStatusPrismaClient = Pick<PrismaClient, "$queryRaw">;

interface FilaConteo {
  readonly status: string;
  readonly n: number;
}

// Copia de ConteoPorStatusRepository.ts:68–173 en c301fc87. `comoParametros` y `enLista` son identicas, byte a byte, en
// ConteoCargadasPorDia, ConteoDevoluciones y CicloVida: se copian una vez, aqui.
/**
 * El recorte por ROL, en SQL.
 *
 * ⚠ FRONTERA MULTI-TENANT. Sin policies RLS debajo (Prisma se conecta con credenciales de
 * servicio) esta condicion es la UNICA separacion entre inquilinos de esta consulta: un fallo
 * aqui no da una cifra equivocada, filtra las ordenes de una tienda a otra.
 *
 * Las columnas son las MISMAS que `lib/analytics/alcance-columnas.ts` declara como canonicas
 * (`orden.zona_id`, `orden.tienda_id`): no se elige otra aqui. No se puede reusar `whereOrden`
 * porque devuelve un objeto de Prisma y esto es SQL — ese es exactamente el coste declarado
 * en la cabecera.
 *
 * `switch` EXHAUSTIVO sin `default`: una quinta variante de `AlcanceDatos` no compila, en vez
 * de colarse por una rama permisiva.
 */
export function condicionDeAlcance(alcance: AlcanceDatos): Prisma.Sql {
  switch (alcance.tipo) {
    case "global":
      // `TRUE` y no un fragmento vacio: esto se une con `AND` y un hueco romperia el SQL.
      return Prisma.sql`TRUE`;
    case "zona":
      return Prisma.sql`o."zona_id" = ${alcance.zonaId}`;
    case "tienda":
      return Prisma.sql`o."tienda_id" = ${alcance.tiendaId}`;
    case "mensajero":
      return Prisma.sql`o."mensajero_asignado_id" = ${alcance.mensajeroId}`;
  }
}

/** Lista de ids como parametros, nunca interpolada: cada uno entra como `$n`. */
function comoParametros(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}`));
}

/** `col IN (...)` solo si la dimension se filtro. `null` = sin recorte por esa faceta. */
function enLista(columna: Prisma.Sql, ids: readonly string[] | undefined): Prisma.Sql | null {
  if (ids === undefined || ids.length === 0) return null;
  return Prisma.sql`${columna} IN (${comoParametros(ids)})`;
}

/**
 * TODAS las condiciones del `where`, en orden. Funcion PURA y exportada: es donde vive la
 * semantica y se comprueba sin base de datos.
 *
 * El orden NO es cosmetico: el alcance va PRIMERO para que se lea de un vistazo que la
 * consulta esta recortada por rol antes que por nada que haya pedido el cliente.
 *
 * ⚠ FICHA 345 — EL PARAMETRO SE ENSANCHO A `RecorteDeOrdenes`, y el cuerpo NO se toco. Motivo:
 * la lectura de PRODUCTOS necesita EXACTAMENTE este `where` (mismo universo, mismas facetas,
 * misma ventana) pero viaja en un tipo opaco propio (`ConsultaProductos`), porque su alcance
 * DIVERGE —un `adminSatelite` obtiene `{tipo:"zona"}` en el conteo de entregas y esta PROHIBIDO
 * en productos—. Con el parametro estrecho solo habia dos salidas, y las dos peores: FORJAR el
 * tipo opaco del conteo con un cast dentro del repositorio nuevo (que es literalmente lo que
 * detecta `FORJA_LA_CONSULTA` en `alcance-obligatorio.guardia.test.ts`) o una TERCERA copia de
 * estas condiciones. `RecorteDeOrdenes` es el tipo estructural que las dos consultas preparadas
 * cumplen; la opacidad se sigue exigiendo en la firma de cada metodo de repositorio.
 */
export function condicionesDeConsultaDeHoy(consulta: RecorteDeOrdenes): Prisma.Sql[] {
  const { filtro, rango, alcance } = consulta;

  const condiciones: Prisma.Sql[] = [
    condicionDeAlcance(alcance),
    // Soft delete: una orden borrada no cuenta en ningun bucket.
    Prisma.sql`o."deleted_at" IS NULL`,
  ];

  const facetas: [Prisma.Sql, readonly string[] | undefined][] = [
    [Prisma.sql`o."zona_id"`, filtro.zona_id],
    [Prisma.sql`o."provincia_id"`, facetasDeHoy(filtro).provincia_id],
    [Prisma.sql`o."canton_id"`, facetasDeHoy(filtro).canton_id],
    [Prisma.sql`o."distrito_id"`, facetasDeHoy(filtro).distrito_id],
    [Prisma.sql`o."tienda_id"`, filtro.tienda_id],
  ];
  for (const [columna, ids] of facetas) {
    const fragmento = enLista(columna, ids);
    if (fragmento) condiciones.push(fragmento);
  }

  // Mensajero: quien REGISTRO la gestion, no `orden.mensajero_asignado_id`. Mismo criterio
  // que el otro endpoint —el asignado es el actual y pudo cambiar tras la entrega— y misma
  // independencia respecto de la fecha: la orden entra si ese mensajero la gestiono alguna
  // vez (vigente), aunque la gestion que fija su bucket sea de otro.
  if (filtro.mensajero_id !== undefined && filtro.mensajero_id.length > 0) {
    condiciones.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "gestion_orden" gm
      WHERE gm."orden_id" = o."id"
        AND gm."anulada_at" IS NULL
        AND gm."mensajero_id" IN (${comoParametros(filtro.mensajero_id)})
    )`);
  }

  // ⚠ FICHA 441 — LA VENTANA CAE SOBRE `o."created_at"`, LA FECHA DE CARGA. Ni una linea de
  // fecha escrita aqui: se IMPORTA `ventanaDeCarga`, la misma que ya usaban la serie de
  // cargadas por dia y la tabla de cohortes. Sin rango no aporta ninguna condicion.
  //
  // LO QUE HABIA ANTES, para que nadie lo reponga sin saber que hace: la ventana comparaba
  // `COALESCE(u."created_at", o."created_at")` —la ULTIMA GESTION VIGENTE, y solo la creacion
  // si nunca se gestiono—. Con eso, una orden cargada en enero y gestionada ayer contaba como
  // orden de AYER. Medido en produccion el 2026-09-17: 152 de las 210 ordenes que el KPI
  // atribuia a «ayer» se habian cargado antes. La mutacion «devolver la ventana al `COALESCE`»
  // la caza `tests/integration/db/conteo-por-status-cohorte.int.test.ts` contra Postgres real,
  // con una orden cargada FUERA de la ventana y gestionada DENTRO — el caso exacto de las 152.
  condiciones.push(...ventanaDeCarga(rango));

  return condiciones;
}

// Copia de ConteoPorStatusRepository.ts:178–212 en c301fc87.
export async function contarPorStatusDeHoy(
  cliente: ConteoPorStatusPrismaClient,
  consulta: ConsultaConteoEntregas,
): Promise<readonly ConteoDeStatus[]> {
  const where = Prisma.join(condicionesDeConsultaDeHoy(consulta), " AND ");

  // `LEFT JOIN LATERAL` y no un `DISTINCT ON` sobre toda `gestion_orden`: el lateral se
  // evalua por orden YA filtrada y usa el indice `gestion_orden(orden_id)`, en vez de
  // deduplicar el historial entero para luego tirar casi todo.
  //
  // El desempate `created_at DESC, id DESC` NO sobra: dos gestiones de la misma orden pueden
  // compartir `created_at`, y sin el segundo criterio Postgres podria elegir una u otra
  // entre ejecuciones — la misma consulta daria dos desgloses distintos sin que nada hubiera
  // cambiado.
  //
  // `LEFT` y no `INNER`: las ordenes SIN gestion tienen que entrar igual, y son justamente
  // las que caen del lado de `s.value` en el `COALESCE`.
  const filas = await cliente.$queryRaw<FilaConteo[]>`
    SELECT COALESCE(u."resultado"::text, s."value") AS status,
           COUNT(*)::int                            AS n
    FROM "orden" o
    JOIN "order_status" s ON s."id" = o."estatus_id"
    LEFT JOIN LATERAL (
      SELECT g."resultado", g."created_at"
      FROM "gestion_orden" g
      WHERE g."orden_id" = o."id"
        AND g."anulada_at" IS NULL
      ORDER BY g."created_at" DESC, g."id" DESC
      LIMIT 1
    ) u ON TRUE
    WHERE ${where}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC`;

  // `GROUP BY` no emite filas para los buckets vacios, asi que los status sin ninguna orden
  // no vienen — que es exactamente lo pedido. No hay nada que filtrar aqui.
  return filas.map((f) => ({ status: f.status, conteo: Number(f.n) }));
}

// =================================================================================================
// ConteoCargadasPorDiaRepository (lib/repositories/ConteoCargadasPorDiaRepository.ts)
// =================================================================================================

// Copia de ConteoCargadasPorDiaRepository.ts:63–66 en c301fc87. `DIA_CR` se importa: es exportado y no lee geografia.
/** Cliente MINIMO consumido (patron `ConteoPorStatusRepository`): una sola consulta cruda.
 *  `$queryRawUnsafe` NO esta y no puede estar: el tipo del cliente es la primera barrera
 *  contra la interpolacion de strings. */
type ConteoCargadasPrismaClient = Pick<PrismaClient, "$queryRaw">;

// Copia de ConteoCargadasPorDiaRepository.ts:107–110 en c301fc87.
interface FilaCargadas {
  readonly dia: string;
  readonly n: number;
}

// Copia de ConteoCargadasPorDiaRepository.ts:123–201 en c301fc87.
/**
 * El recorte de la consulta SIN su ventana temporal. Funcion PURA y exportada: es donde vive la
 * semantica y se comprueba sin base de datos.
 *
 * El alcance, el soft delete y las cinco facetas de recorte son los MISMOS que los de las otras
 * lecturas de la vertical —mismo filtro, misma barra, cifras comparables— y el orden tampoco es
 * cosmetico: el alcance va PRIMERO para que se lea de un vistazo que la consulta esta recortada
 * por rol antes que por nada que haya pedido el cliente.
 *
 * LA FECHA SE QUEDA FUERA A PROPOSITO, y por eso esta funcion existe separada: las dos lecturas
 * que la usan ponen ventanas DISTINTAS sobre la misma columna —esta, la que pida el filtro; la
 * del contador de hoy (`ConteoHoyGestionRepository`), el dia CR en curso y solo ese— y compartir
 * el resto del `where` es lo que impide que se separen en todo lo demas.
 */
export function condicionesSinFechaDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql[] {
  const { filtro, alcance } = consulta;

  const condiciones: Prisma.Sql[] = [
    // ⚠ FRONTERA MULTI-TENANT. Se REUSA `condicionDeAlcance` en vez de reescribirla: sin
    // policies RLS debajo, esta condicion es la unica separacion entre inquilinos, y una
    // segunda copia es una copia que puede quedarse atras.
    condicionDeAlcance(alcance),
    // Soft delete: una orden borrada no cuenta en ningun dia.
    Prisma.sql`o."deleted_at" IS NULL`,
  ];

  const facetas: [Prisma.Sql, readonly string[] | undefined][] = [
    [Prisma.sql`o."zona_id"`, filtro.zona_id],
    [Prisma.sql`o."provincia_id"`, facetasDeHoy(filtro).provincia_id],
    [Prisma.sql`o."canton_id"`, facetasDeHoy(filtro).canton_id],
    [Prisma.sql`o."distrito_id"`, facetasDeHoy(filtro).distrito_id],
    [Prisma.sql`o."tienda_id"`, filtro.tienda_id],
  ];
  for (const [columna, ids] of facetas) {
    const fragmento = enLista(columna, ids);
    if (fragmento) condiciones.push(fragmento);
  }

  // ⚠ MENSAJERO: ESTA LECTURA NO ADMITE ESA FACETA (decision humana del 2026-08-18), y por eso
  // AQUI NO HAY NINGUN `EXISTS` sobre `gestion_orden` — es la unica de las seis dimensiones del
  // filtro que este `where` deja fuera, y la ausencia es deliberada.
  //
  // POR QUE: la pregunta es «cuantas ordenes ENTRARON cada dia», y una orden no la carga un
  // mensajero. Las otras dos lecturas si aplican la faceta porque su bucket sale de la GESTION
  // —«quien la gestiono» es parte de lo que preguntan—; aqui recortar por mensajero contestaria
  // otra cosa: «de las cargadas ese dia, cuantas acabo tocando este mensajero», que no es una
  // curva de carga y se leeria como si lo fuera.
  //
  // CONSECUENCIA QUE HAY QUE SABER, porque la barra de filtros es UNA sola: con un mensajero
  // seleccionado, esta serie NO se recorta y las otras dos SI. La pantalla tiene que decirlo
  // —el grafico de carga ignora ese filtro—; si no lo dice, el usuario lee tres graficos y
  // supone que los tres responden a lo mismo. Se prefirio esto a rechazar la consulta: un
  // `validation_error` dejaria la pantalla entera rota en cuanto alguien tocase el selector.
  //
  // `filtro.mensajero_id` SI sigue entrando en la clave de cache (`claveConPrefijo`, componente
  // `x=`). Es redundante —dos consultas que solo difieren en esa faceta dan el mismo resultado y
  // ocupan dos entradas— y se acepta: sacarlo de la clave obligaria a una clave propia para esta
  // lectura, y una clave que ignora un componente del filtro es la clase de atajo que un dia
  // sirve datos de un recorte en otro.

  return condiciones;
}

/**
 * El `where` completo de la serie: el recorte comun MAS su ventana. Pura y exportada por el
 * mismo motivo que la anterior.
 */
export function condicionesDeCargadasDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql[] {
  const { rango } = consulta;
  const condiciones = condicionesSinFechaDeHoy(consulta);

  // La ventana cae sobre `o."created_at"` — la fecha de CARGA, la misma por la que se agrupa.
  // Se IMPORTA (`ventanaDeCarga`) y no se escribe aqui: desde la ficha 441 es la MISMA ventana
  // que usan el desglose por status y la tabla de cohortes, y una sola definicion es lo que
  // impide que una de las tres se mueva sola. Sin rango no aporta ninguna condicion.
  condiciones.push(...ventanaDeCarga(rango));

  return condiciones;
}

// Copia de ConteoCargadasPorDiaRepository.ts:206–230 en c301fc87.
export async function contarCargadasPorDiaDeHoy(
  cliente: ConteoCargadasPrismaClient,
  consulta: ConsultaConteoEntregas,
): Promise<readonly ConteoDeDia[]> {
  const where = Prisma.join(condicionesDeCargadasDeHoy(consulta), " AND ");

  // Ni un JOIN: el dia de carga esta en la propia fila de `orden`, asi que esta consulta no
  // necesita el `LEFT JOIN LATERAL` sobre la ultima gestion vigente que si necesitan las
  // otras dos. La unica excepcion es el `EXISTS` del filtro por mensajero, y solo cuando ese
  // filtro viene puesto.
  //
  // `ORDER BY 1 ASC` es CONTRATO, no presentacion: `ConteoCargadasPorDiaDTO.porDia` promete
  // orden cronologico ascendente, y ordenar aqui —donde ya estan las filas— evita que cada
  // consumidor lo rehaga. Como la clave es `YYYY-MM-DD`, el orden lexicografico ES el
  // cronologico.
  const filas = await cliente.$queryRaw<FilaCargadas[]>`
    SELECT ${DIA_CR}     AS dia,
           COUNT(*)::int AS n
    FROM "orden" o
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1 ASC`;

  // `GROUP BY` no emite filas para los dias vacios, asi que un dia sin cargas no viene — que
  // es exactamente lo pedido (ver `ConteoCargadasPorDiaDTO`: el hueco significa cero). No hay
  // nada que filtrar aqui.
  return filas.map((f) => ({ fecha: f.dia, conteo: Number(f.n) }));
}

// =================================================================================================
// ConteoDevolucionesRepository (lib/repositories/ConteoDevolucionesRepository.ts)
// =================================================================================================

// Copia de ConteoDevolucionesRepository.ts:41–53 en c301fc87.
/** Cliente MINIMO consumido (patron `ConteoPorStatusRepository`): una sola consulta cruda. */
type ConteoDevolucionesPrismaClient = Pick<PrismaClient, "$queryRaw">;

interface FilaCausa {
  readonly causa: string;
  readonly n: number;
}

/**
 * El resultado que define el universo. Se escribe una vez y se compara contra el enum del
 * esquema en el test, no contra una cadena suelta repetida por el archivo.
 */
const RESULTADO_DEVUELTA = "novedad";

// Copia de ConteoDevolucionesRepository.ts:66–119 en c301fc87.
/**
 * TODAS las condiciones del `where`, en orden. Funcion PURA y exportada: es donde vive la
 * semantica y se comprueba sin base de datos.
 *
 * El alias `o` es el de la tabla `orden` unida a la gestion, y NO es cosmetico: es lo que
 * permite reusar `condicionDeAlcance` tal cual, que escribe `o."zona_id"` / `o."tienda_id"`.
 * Recortar la gestion por columnas propias daria un recorte DISTINTO al de la orden, que es
 * exactamente lo que `lib/analytics/alcance-columnas.ts` prohibe: «los TRES recortes de
 * `gestion_orden` pasan por la relacion `orden`».
 */
export function condicionesDeDevolucionesDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql[] {
  const { filtro, rango, alcance } = consulta;

  const condiciones: Prisma.Sql[] = [
    // El recorte por ROL, primero y siempre. Frontera multi-tenant.
    condicionDeAlcance(alcance),
    // Una gestion anulada (feature 67) no es una devolucion: es una devolucion DESHECHA.
    Prisma.sql`g."anulada_at" IS NULL`,
    Prisma.sql`g."resultado" = ${RESULTADO_DEVUELTA}::"gestion_resultado"`,
    // La orden borrada no cuenta, aunque su gestion siga en la tabla.
    Prisma.sql`o."deleted_at" IS NULL`,
  ];

  // Las cinco facetas geograficas y de tienda van sobre la ORDEN: la gestion no las tiene.
  const facetas: [Prisma.Sql, readonly string[] | undefined][] = [
    [Prisma.sql`o."zona_id"`, filtro.zona_id],
    [Prisma.sql`o."provincia_id"`, facetasDeHoy(filtro).provincia_id],
    [Prisma.sql`o."canton_id"`, facetasDeHoy(filtro).canton_id],
    [Prisma.sql`o."distrito_id"`, facetasDeHoy(filtro).distrito_id],
    [Prisma.sql`o."tienda_id"`, filtro.tienda_id],
  ];
  for (const [columna, ids] of facetas) {
    const fragmento = enLista(columna, ids);
    if (fragmento) condiciones.push(fragmento);
  }

  // El mensajero, en cambio, SI es columna propia de la gestion, y aqui es ademas la lectura
  // natural: quien registro ESTA devolucion. En las otras lecturas hacia falta un `EXISTS`
  // correlacionado porque la fila contada era la orden; aqui la fila contada es la gestion.
  const mensajero = enLista(Prisma.sql`g."mensajero_id"`, filtro.mensajero_id);
  if (mensajero) condiciones.push(mensajero);

  // La ventana, sobre la fecha de la GESTION (ver la cabecera). Semiabierta `[desde, hasta)`:
  // `resolverRango` devuelve `hasta` como las 00:00 CR del dia SIGUIENTE, para que `hastaFecha`
  // sea inclusiva. Sin rango no se anade condicion: «sin filtrar» cuenta todas las devoluciones.
  if (rango !== null) {
    condiciones.push(
      Prisma.sql`g."created_at" >= ${rango.desde}`,
      Prisma.sql`g."created_at" <  ${rango.hasta}`,
    );
  }

  return condiciones;
}

// Copia de ConteoDevolucionesRepository.ts:124–147 en c301fc87.
export async function contarDevolucionesPorCausaDeHoy(
  cliente: ConteoDevolucionesPrismaClient,
  consulta: ConsultaConteoEntregas,
): Promise<readonly CausaCruda[]> {
  const where = Prisma.join(condicionesDeDevolucionesDeHoy(consulta), " AND ");

  // `COALESCE(causa::text, 'sin_causa')`: el `NULL` de `causa_devolucion` tiene significado
  // de dominio —una devolucion anterior a la feature 73, que NO se backfilleo— y sin el
  // centinela `GROUP BY` lo devolveria como una fila con `null` que el DTO tendria que
  // interpretar. Se nombra aqui, una vez, con la constante que ya usa el tipo.
  //
  // `JOIN orden` y no `LEFT JOIN`: `gestion_orden.orden_id` es NOT NULL con FK, asi que no
  // hay gestion huerfana posible; un `LEFT` sugeriria que si y dejaria pasar filas sin
  // recorte de alcance, que es justo lo que no puede ocurrir.
  const filas = await cliente.$queryRaw<FilaCausa[]>`
    SELECT COALESCE(g."causa_devolucion"::text, ${CAUSA_SIN_TIPIFICAR}) AS causa,
           COUNT(*)::int                                                AS n
    FROM "gestion_orden" g
    JOIN "orden" o ON o."id" = g."orden_id"
    WHERE ${where}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC`;

  return filas.map((f) => ({ causa: f.causa, conteo: Number(f.n) }));
}

// =================================================================================================
// CicloVidaRepository (lib/repositories/CicloVidaRepository.ts), ya con SLT-64
// =================================================================================================

// Copia de CicloVidaRepository.ts:46–55 en c301fc87.
/** Cliente MINIMO consumido (patron del resto de la vertical): una sola consulta cruda. */
type CicloVidaPrismaClient = Pick<PrismaClient, "$queryRaw">;

interface FilaCiclo {
  readonly seg: string | number | null;
  readonly n: number;
}

/** Los resultados que cierran una orden, como lista SQL. Se importan: la lista vive en un solo sitio (R10). */
const RESULTADOS = Prisma.join([...RESULTADOS_DE_CIERRE]);

// Copia de CicloVidaRepository.ts:68–121 en c301fc87.
/**
 * Las condiciones que se aplican sobre la ORDEN ya emparejada con su gestion final. Funcion PURA
 * y exportada: es donde vive la semantica y se comprueba sin base de datos.
 *
 * La ventana NO esta aqui porque fecha la gestion, no la orden: ver
 * `condicionDeVentanaDeCierre`.
 */
export function condicionesDeCicloDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql[] {
  const { filtro, alcance } = consulta;

  const condiciones: Prisma.Sql[] = [
    // El recorte por ROL, primero y siempre. Frontera multi-tenant.
    condicionDeAlcance(alcance),
    Prisma.sql`o."deleted_at" IS NULL`,
  ];

  const facetas: [Prisma.Sql, readonly string[] | undefined][] = [
    [Prisma.sql`o."zona_id"`, filtro.zona_id],
    [Prisma.sql`o."provincia_id"`, facetasDeHoy(filtro).provincia_id],
    [Prisma.sql`o."canton_id"`, facetasDeHoy(filtro).canton_id],
    [Prisma.sql`o."distrito_id"`, facetasDeHoy(filtro).distrito_id],
    [Prisma.sql`o."tienda_id"`, filtro.tienda_id],
  ];
  for (const [columna, ids] of facetas) {
    const fragmento = enLista(columna, ids);
    if (fragmento) condiciones.push(fragmento);
  }

  // Mensajero: quien REGISTRO alguna gestion vigente de la orden, igual que en las lecturas
  // cuyo universo es la orden. `orden.mensajero_asignado_id` seria el asignado ACTUAL, que
  // pudo cambiar despues del cierre.
  if (filtro.mensajero_id !== undefined && filtro.mensajero_id.length > 0) {
    condiciones.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "gestion_orden" gm
      WHERE gm."orden_id" = o."id"
        AND gm."anulada_at" IS NULL
        AND gm."mensajero_id" IN (${comoParametros(filtro.mensajero_id)})
    )`);
  }

  return condiciones;
}

/**
 * La ventana: sobre la gestion final. Sin rango no se anade nada y entran todas las cerradas del
 * recorte — «sin filtrar» significa todo, tambien aqui.
 */
export function condicionDeVentanaDeCierreDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql {
  const { rango } = consulta;
  if (rango === null) return Prisma.sql`TRUE`;
  // Semiabierta `[desde, hasta)`: `resolverRango` devuelve `hasta` como las 00:00 CR del dia
  // SIGUIENTE, para que `hastaFecha` sea inclusiva.
  return Prisma.sql`g."created_at" >= ${rango.desde} AND g."created_at" < ${rango.hasta}`;
}

// Copia de CicloVidaRepository.ts:126–153 en c301fc87.
export async function acumularCiclosDeHoy(
  cliente: CicloVidaPrismaClient,
  consulta: ConsultaConteoEntregas,
): Promise<CicloCrudo> {
  const where = Prisma.join(condicionesDeCicloDeHoy(consulta), " AND ");
  const ventana = condicionDeVentanaDeCierreDeHoy(consulta);

  // `SUM(...)::bigint` llega como STRING por el driver cuando el tipo es `bigint`, y como
  // `null` si no hubo ninguna fila. Las dos cosas se normalizan abajo: un `Number(null)` es
  // `0`, que aqui es correcto —cero filas, cero segundos— pero conviene que sea explicito y
  // no un accidente de coercion.
  const filas = await cliente.$queryRaw<FilaCiclo[]>`
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (g."created_at" - o."created_at"))::bigint), 0)::bigint AS seg,
           COUNT(*)::int AS n
    FROM "gestion_orden" g
    JOIN "orden" o ON o."id" = g."orden_id"
    WHERE g."anulada_at" IS NULL
      AND g."resultado"::text IN (${RESULTADOS})
      AND ${ventana}
      AND NOT EXISTS (
        SELECT 1 FROM "gestion_orden" g2
        WHERE g2."orden_id" = g."orden_id"
          AND g2."anulada_at" IS NULL
          AND (g2."created_at", g2."id") > (g."created_at", g."id")
      )
      AND ${where}`;

  const fila = filas[0];
  if (!fila) return { segundosAcum: 0, n: 0 };
  return { segundosAcum: Number(fila.seg ?? 0), n: Number(fila.n) };
}

// =================================================================================================
// InformeTransitoRepository (lib/repositories/InformeTransitoRepository.ts)
// =================================================================================================

// Copia de InformeTransitoRepository.ts:23–85 en c301fc87.
/** Cliente minimo: solo lecturas crudas. Sin `$executeRaw`: este repo no puede escribir (R39). */
export type InformeTransitoPrismaClient = Pick<PrismaClient, "$queryRaw">;

/**
 * El instante del hito de la orden `c` (design §1). Mapa CERRADO: el hito elige un fragmento fijo.
 *
 * - entrada a bodega central (R11): la PRIMERA transicion cuyo DESTINO es `en_bodega_central`. Por
 *   destino y no por `origen_tipo`: una via nueva hacia la central queda cubierta sola. `MIN`: un
 *   reingreso no reinicia el conteo.
 * - creacion (R12): `orden.created_at`.
 * - generacion de guia (R13): la mas antigua de `generacion_guia`, `ruteo_satelite` y la creacion
 *   en `por_recolectar_en_tienda` (nace con guia). Exige `num_guia`: no hay columna con el instante
 *   de la guia, y esos tres eventos son los unicos que la asignan.
 */
const FRAGMENTO_HITO: Record<Hito, Prisma.Sql> = {
  entrada_bodega_central: Prisma.sql`
    SELECT MIN(h."created_at") AS "at"
      FROM "orden_historial_estado" h
      JOIN "order_status" sd ON sd."id" = h."estatus_destino_id"
     WHERE h."orden_id" = c."id" AND sd."value" = 'en_bodega_central'`,
  creacion: Prisma.sql`SELECT c."created_at" AS "at"`,
  generacion_guia: Prisma.sql`
    SELECT MIN(h."created_at") AS "at"
      FROM "orden_historial_estado" h
      JOIN "order_status" sd ON sd."id" = h."estatus_destino_id"
     WHERE h."orden_id" = c."id"
       AND c."num_guia" IS NOT NULL
       AND (h."origen_tipo" IN ('generacion_guia', 'ruteo_satelite')
            OR (h."estatus_origen_id" IS NULL AND sd."value" = 'por_recolectar_en_tienda'))`,
};

/** `cand`: ordenes vivas en un estado incluido, NUNCA de cierre logistico (R9/R10). */
function candidatas(consulta: ConsultaTransito): Prisma.Sql {
  return Prisma.sql`
    SELECT o."id", o."zona_id", o."num_remision", o."num_guia", o."destinatario",
           o."monto_cobrar", o."created_at", o."canton_id", o."distrito_id", s."value" AS "estado"
      FROM "orden" o
      JOIN "order_status" s ON s."id" = o."estatus_id"
     WHERE o."deleted_at" IS NULL
       AND s."value" IN (${Prisma.join([...consulta.estados])})
       AND s."value" NOT IN ('entregado', 'devuelta_a_tienda')`;
}

/** `cortes(zona_id, corte)` como VALUES parametrizado. */
function valoresDeCortes(consulta: ConsultaTransito): Prisma.Sql {
  return Prisma.join(
    consulta.cortes.map((c) => Prisma.sql`(${c.zonaId}::text, ${c.corte}::timestamp)`),
  );
}

interface FilaCrudaTransito {
  orden_id: string;
  num_remision: string;
  num_guia: number | null;
  estado: string;
  zona_id: string;
  destinatario: string;
  canton: string;
  distrito: string | null;
  monto_cobrar: string | null;
  hito_at: Date;
  ultima_at: Date | null;
}

// Copia de InformeTransitoRepository.ts:96–132 en c301fc87.
export async function filasEnAlertaDeHoy(
  cliente: InformeTransitoPrismaClient,
  consulta: ConsultaTransito,
): Promise<FilaTransito[]> {
  if (consulta.cortes.length === 0 || consulta.estados.length === 0) return [];
  const filas = await cliente.$queryRaw<FilaCrudaTransito[]>`
    WITH "cortes"("zona_id", "corte") AS (VALUES ${valoresDeCortes(consulta)}),
    "cand" AS (${candidatas(consulta)})
    SELECT c."id" AS "orden_id", c."num_remision", c."num_guia", c."estado", c."zona_id",
           c."destinatario", c."monto_cobrar"::text AS "monto_cobrar",
           k."nombre" AS "canton", d."nombre" AS "distrito",
           hito."at" AS "hito_at", ult."at" AS "ultima_at"
      FROM "cand" c
      JOIN "cortes" z ON z."zona_id" = c."zona_id"
      JOIN "canton" k ON k."id" = c."canton_id"
      LEFT JOIN "distrito" d ON d."id" = c."distrito_id"
      CROSS JOIN LATERAL (${FRAGMENTO_HITO[consulta.hito]}) hito
      LEFT JOIN LATERAL (
        SELECT h."created_at" AS "at"
          FROM "orden_historial_estado" h
         WHERE h."orden_id" = c."id"
         ORDER BY h."created_at" DESC, h."id" DESC
         LIMIT 1
      ) ult ON true
     WHERE hito."at" IS NOT NULL
       AND hito."at" < z."corte"`;
  return filas.map((f) => ({
    ordenId: f.orden_id,
    numRemision: f.num_remision,
    numGuia: f.num_guia === null ? null : Number(f.num_guia),
    estado: f.estado,
    zonaId: f.zona_id,
    destinatario: f.destinatario,
    canton: f.canton,
    distrito: f.distrito,
    // SLT-125 (A10): `FilaTransito` gano `ruta` y `niveles`, que hoy no existian. Van vacios solo para
    // cumplir el tipo; la comparacion con la lectura nueva los excluye y compara todo lo demas.
    ruta: [],
    niveles: [],
    montoCobrar: f.monto_cobrar,
    hitoAt: f.hito_at,
    ultimaTransicionAt: f.ultima_at,
  }));
}

// =================================================================================================
// ConteoProductosRepository (lib/repositories/ConteoProductosRepository.ts)
// =================================================================================================

// Copia de ConteoProductosRepository.ts:49–59 en c301fc87.
/** Cliente MINIMO consumido (patron `ConteoPorStatusRepository`): una sola consulta cruda. */
type ConteoProductosPrismaClient = Pick<PrismaClient, "$queryRaw">;

/** La fila tal como la devuelve Postgres, antes de normalizar `n`. */
interface FilaCrudaProductos {
  readonly tienda_id: string;
  readonly tienda_nombre: string;
  readonly producto: string;
  readonly status: string;
  readonly n: number;
}

// Copia de ConteoProductosRepository.ts:64–107 en c301fc87.
export async function contarProductosDeHoy(
  cliente: ConteoProductosPrismaClient,
  consulta: ConsultaProductos,
): Promise<readonly FilaProductoCruda[]> {
  const where = Prisma.join(condicionesDeConsultaDeHoy(consulta), " AND ");

  // `JOIN "usuario"` es INNER y sin riesgo: `orden.tienda_id` es NOT NULL con FK
  // (`db/schema.prisma:573`). Se une aqui —y no se resuelve en Node con una segunda
  // consulta— para que la fila salga ya con el nombre de su tienda: R39 exige que dos
  // tiendas distintas NUNCA compartan fila, y la unica forma barata de garantizarlo es que
  // la tienda sea parte de la clave de agrupacion en la BASE.
  //
  // `GROUP BY` sobre el texto CRUDO (R57), no sobre nada parseado: la base no interpreta.
  // El `ORDER BY` es determinista y sirve al test, no a la pantalla: el orden de presentacion
  // lo fija el servicio sobre las filas ya fundidas.
  const filas = await cliente.$queryRaw<FilaCrudaProductos[]>`
    SELECT o."tienda_id"                            AS tienda_id,
           t."nombre"                               AS tienda_nombre,
           o."producto"                             AS producto,
           COALESCE(u."resultado"::text, s."value") AS status,
           COUNT(*)::int                            AS n
    FROM "orden" o
    JOIN "order_status" s ON s."id" = o."estatus_id"
    JOIN "usuario"      t ON t."id" = o."tienda_id"
    LEFT JOIN LATERAL (
      SELECT g."resultado", g."created_at"
      FROM "gestion_orden" g
      WHERE g."orden_id" = o."id"
        AND g."anulada_at" IS NULL
      ORDER BY g."created_at" DESC, g."id" DESC
      LIMIT 1
    ) u ON TRUE
    WHERE ${where}
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 3, 4`;

  // `n` es un CONTEO —un entero— y no un importe: esta lectura no emite ninguna cifra de
  // dinero por producto (limite innegociable de la ficha). `COUNT(*)::int` ya llega como
  // numero; el `Number()` es el mismo saneo defensivo que hace el desglose por estado.
  return filas.map((f) => ({
    tiendaId: f.tienda_id,
    tiendaNombre: f.tienda_nombre,
    producto: f.producto,
    status: f.status,
    n: Number(f.n),
  }));
}

// =================================================================================================
// DineroProductosRepository (lib/repositories/DineroProductosRepository.ts)
// =================================================================================================

// Copia de DineroProductosRepository.ts:97–258 en c301fc87.
/** Cliente MINIMO consumido (patron `ConteoProductosRepository`): una sola consulta cruda. */
type DineroProductosPrismaClient = Pick<PrismaClient, "$queryRaw">;

/**
 * EL TOPE DE ORDENES DE ESTA LECTURA (R76), y por que NO es un numero nuevo.
 *
 * ⟨Q4⟩ pedia un numero y la decision del humano fue: se REUSA la configuracion de la 344, no se
 * inventa una constante. El tope con el que aquella ficha dice `limite_excedido` es
 * `descargaConfig.MAX_FILAS` (`DESCARGA_MAX_FILAS`, 5.000 por defecto), y es el mismo criterio
 * —«o van todas, o no va ninguna»— aplicado al mismo tipo de conjunto: un derivado por orden que
 * no se puede truncar sin mentir. Un segundo numero seria un segundo sitio donde ajustarlo, y el
 * dia que se moviera uno el otro se quedaria quieto.
 *
 * Referencia de tamano, MEDIDO el 2026-09-01: en produccion hay 768 ordenes; la base local
 * devuelve 18 filas de dinero sobre 67 ordenes vivas. El tope no roza el caso real ni de lejos.
 */
function topeDeOrdenes(): number {
  return descargaConfig.MAX_FILAS;
}

/** La fila tal como la devuelve Postgres. Los `numeric` llegan como `Prisma.Decimal`. */
interface FilaCrudaDinero {
  readonly orden_id: string;
  readonly tienda_id: string;
  readonly tienda_nombre: string;
  readonly producto: string;
  readonly num_guia: number | null;
  readonly num_remision: string;
  readonly destinatario: string;
  readonly gestion_id: string;
  readonly resultado: GestionResultado;
  readonly monto_recibido: Prisma.Decimal | null;
  readonly cierre_estado: string | null;
  readonly detalle_id: string | null;
  readonly monto_cobrar: Prisma.Decimal | null;
  readonly cobra_comision: boolean | null;
  readonly es_central: boolean | null;
  readonly es_zona_especial: boolean | null;
  readonly tarifa_id: string | null;
  readonly tarifa_valor_flete: Prisma.Decimal | null;
  readonly tarifa_valor_flete_gam: Prisma.Decimal | null;
  readonly tarifa_valor_flete_devuelto: Prisma.Decimal | null;
  readonly tarifa_valor_flete_devuelto_gam: Prisma.Decimal | null;
  readonly tarifa_comision_cod: Prisma.Decimal | null;
  readonly tarifa_iva_flete: Prisma.Decimal | null;
  readonly tarifa_iva_comision_cod: Prisma.Decimal | null;
  readonly tarifa_especial: Prisma.Decimal | null;
  readonly tarifa_especial_devuelta: Prisma.Decimal | null;
  /**
   * FICHA 449 — la DECIMA columna de tarifa que se proyecta, y la unica que NO pasa por
   * `tarifaDe`. Ver `fulfillmentDe` mas abajo: no es una entrada de la formula y no puede
   * entrar en `TarifaVigente`.
   */
  readonly tarifa_fulfillment: Prisma.Decimal | null;
  /** SLT-52 (R42): `viejo` en todo detalle anterior a la ficha; `null` sin fila de snapshot. */
  readonly tarifa_modelo: TarifaModelo | null;
  /**
   * SLT-52 (R41): las filas de `cierre_detail_concepto` de ESE detalle y de SU empresa, como
   * `json_agg` (`[]` sin filas o sin detalle). Importes como texto: el JSON no lleva `numeric`.
   */
  readonly conceptos: readonly ConceptoCongeladoJson[] | string;
}

/** Una fila de `cierre_detail_concepto` tal como la arma el `json_build_object` de la consulta. */
interface ConceptoCongeladoJson {
  readonly concepto: TarifaConcepto;
  readonly modo: TarifaModo;
  readonly valor: string;
  readonly ivaPct: string;
  readonly nivel: TarifaNivel;
  readonly tarifaValorId: string | null;
}

/** El `json_agg` -> las filas que `tarifaDe` sabe leer (texto -> `Decimal`, money-safe). */
function conceptosDe(f: FilaCrudaDinero): ConceptoCongeladoRow[] {
  const crudos: readonly ConceptoCongeladoJson[] =
    typeof f.conceptos === "string" ? (JSON.parse(f.conceptos) as ConceptoCongeladoJson[]) : f.conceptos;
  return crudos.map((c) => ({
    concepto: c.concepto,
    modo: c.modo,
    valor: new Prisma.Decimal(c.valor),
    ivaPct: new Prisma.Decimal(c.ivaPct),
    nivel: c.nivel,
    tarifaValorId: c.tarifaValorId,
  }));
}

/**
 * La tarifa CONGELADA de la fila (los dos modelos), por la reconstruccion unica. La comparten
 * `congeladaDe` y `fulfillmentDe` para que la orden y su fulfillment no puedan leer dos cosas.
 */
function tarifaCongeladaDeFila(f: FilaCrudaDinero): TarifaCongelada | null {
  return tarifaDe(
    {
      tarifaModelo: f.tarifa_modelo ?? "viejo",
      tarifaId: f.tarifa_id,
      tarifaValorFlete: f.tarifa_valor_flete,
      tarifaValorFleteGam: f.tarifa_valor_flete_gam,
      tarifaValorFleteDevuelto: f.tarifa_valor_flete_devuelto,
      tarifaValorFleteDevueltoGam: f.tarifa_valor_flete_devuelto_gam,
      tarifaComisionCod: f.tarifa_comision_cod,
      tarifaIvaFlete: f.tarifa_iva_flete,
      tarifaIvaComisionCod: f.tarifa_iva_comision_cod,
      tarifaEspecial: f.tarifa_especial,
      tarifaEspecialDevuelta: f.tarifa_especial_devuelta,
    },
    conceptosDe(f),
  );
}

/** Los resultados que aportan, como parametros. DERIVADOS del criterio (R24), nunca escritos. */
function resultadosQueAportan(): Prisma.Sql {
  return Prisma.join(RESULTADOS_QUE_APORTAN.map((r) => Prisma.sql`${r}`));
}

/**
 * Las ENTRADAS CONGELADAS de esa orden en ese cierre, o `null` si no hay fila de snapshot.
 *
 * `tarifaDe` es la MISMA reconstruccion que usan los dos feeds del cierre y el detalle de la
 * 344: `null` cuando `tarifa_id IS NULL` (gap R9 preservado, esa orden no deriva nada).
 * Money-safe: `Decimal -> STRING escala 2`, nunca `number`.
 */
function congeladaDe(f: FilaCrudaDinero): OrdenCongelada | null {
  if (f.detalle_id === null) return null;
  return {
    esCentral: f.es_central === true,
    esZonaEspecial: f.es_zona_especial === true,
    montoCobrar: f.monto_cobrar === null ? null : f.monto_cobrar.toFixed(2),
    cobraComision: f.cobra_comision === true,
    tarifa: tarifaCongeladaDeFila(f),
  };
}

/**
 * FICHA 449 — EL FULFILLMENT CONGELADO, LEIDO DE SU COLUMNA Y NO DE LA TARIFA.
 *
 * ⚠ ESTA FUNCION EXISTE PARA NO PODER METERLO EN `tarifaDe`. `congeladaDe` (justo arriba)
 * reconstruye la `TarifaVigente` que consume `derivarIngresoOrden`, la funcion que decide dinero
 * que se liquida; `ITarifaVigenteRepository` prohibe por escrito que el fulfillment llegue ahi.
 * Asi que el monto se lee APARTE, de `cierre_detail.tarifa_fulfillment`, y sube por un campo
 * propio de `FilaDineroCruda`. Mismo criterio que ya aplica `CierresAdminRepository`.
 *
 * ⚠ LOS DOS `null` QUE NO SON EL MISMO (contrato completo en `IDineroProductosRepository`):
 *
 *   - SIN FILA DE SNAPSHOT (`detalle_id IS NULL`) -> `null`. No se sabe: no se afirma un cero.
 *   - CON FILA y columna `NULL` o `0` -> `"0.00"`. Las dos significan «no hay fulfillment»: la
 *     columna nacio el 2026-08-19 y las filas anteriores no tienen backfill posible, porque no
 *     existe un monto correcto que inventar hacia atras. Para un SUMANDO las dos valen cero.
 *
 * Money-safe: `Decimal -> STRING escala 2`, igual que `montoRecibido`. Nunca `number`.
 */
function fulfillmentDe(f: FilaCrudaDinero): string | null {
  if (f.detalle_id === null) return null;
  // `== null` y NO `=== null` (dentro de `fulfillmentCongeladoDe`), por el mismo motivo escrito en
  // `tarifaDe` para `tarifa_especial`: una fila que no proyecte la columna llega como `undefined`,
  // significa lo mismo que `NULL` —no hay fulfillment— y ninguno de los dos puede REVENTAR en un
  // camino de dinero.
  // SLT-52 (R46): en el nuevo la columna va NULL y el monto sale del concepto congelado; misma
  // funcion que el `costoReal` de la API y el detalle del cierre.
  const montoCobrar = f.monto_cobrar === null ? null : f.monto_cobrar.toFixed(2);
  return fulfillmentCongeladoDe(tarifaCongeladaDeFila(f), f.tarifa_fulfillment, montoCobrar).fulfillment;
}

// Copia de DineroProductosRepository.ts:263–361 en c301fc87.
export async function dineroProductosDeHoy(
  cliente: DineroProductosPrismaClient,
  consulta: ConsultaProductos,
): Promise<LecturaDineroProductos> {
  const where = Prisma.join(condicionesDeConsultaDeHoy(consulta), " AND ");
  const limite = topeDeOrdenes();

  // `LIMIT tope + 1`: el `+1` es lo que permite detectar el desbordamiento SIN un `COUNT`
  // aparte (patron `rangoDeArchivo` de la 344). Si vuelven `tope + 1` filas, el recorte
  // supera el tope y no se sirve ninguna cifra.
  //
  // `ORDER BY o."id", g."id"` es TOTAL y ESTABLE: sin el, el `LIMIT` cortaria un conjunto
  // distinto entre dos lecturas iguales y la misma pantalla daria dos cifras (R25).
  //
  // `LEFT JOIN` a cierre y a detalle, no `INNER`: las gestiones entregadas SIN cierre
  // aprobado tienen que entrar — son justamente el «pendiente» (R28).
  const filas = await cliente.$queryRaw<FilaCrudaDinero[]>`
    SELECT o."id"             AS orden_id,
           o."tienda_id"      AS tienda_id,
           t."nombre"         AS tienda_nombre,
           o."producto"       AS producto,
           o."num_guia"       AS num_guia,
           o."num_remision"   AS num_remision,
           o."destinatario"   AS destinatario,
           g."id"             AS gestion_id,
           g."resultado"      AS resultado,
           g."monto_recibido" AS monto_recibido,
           c."estado"::text   AS cierre_estado,
           d."id"             AS detalle_id,
           d."monto_cobrar"                    AS monto_cobrar,
           d."cobra_comision"                  AS cobra_comision,
           d."es_central"                      AS es_central,
           d."es_zona_especial"                AS es_zona_especial,
           d."tarifa_id"                       AS tarifa_id,
           d."tarifa_valor_flete"              AS tarifa_valor_flete,
           d."tarifa_valor_flete_gam"          AS tarifa_valor_flete_gam,
           d."tarifa_valor_flete_devuelto"     AS tarifa_valor_flete_devuelto,
           d."tarifa_valor_flete_devuelto_gam" AS tarifa_valor_flete_devuelto_gam,
           d."tarifa_comision_cod"             AS tarifa_comision_cod,
           d."tarifa_iva_flete"                AS tarifa_iva_flete,
           d."tarifa_iva_comision_cod"         AS tarifa_iva_comision_cod,
           d."tarifa_especial"                 AS tarifa_especial,
           d."tarifa_especial_devuelta"        AS tarifa_especial_devuelta,
           -- FICHA 449: se proyecta, pero NO entra en tarifaDe. Ver fulfillmentDe.
           d."tarifa_fulfillment"              AS tarifa_fulfillment,
           d."tarifa_modelo"::text             AS tarifa_modelo,
           -- SLT-52 (R41): el cobro congelado por concepto de ESTE detalle. La empresa se exige
           -- aqui ademas de la RLS y del trigger de misma empresa: una fila hija de otra empresa
           -- colgada de este detalle no puede entrar en el dinero de esta.
           (SELECT COALESCE(
                     json_agg(json_build_object(
                       'concepto',      dc."concepto",
                       'modo',          dc."modo",
                       'valor',         dc."valor"::text,
                       'ivaPct',        dc."iva_pct"::text,
                       'nivel',         dc."nivel",
                       'tarifaValorId', dc."tarifa_valor_id")),
                     '[]'::json)
              FROM "cierre_detail_concepto" dc
             WHERE dc."cierre_detail_id" = d."id"
               AND dc."organizacion_id" = d."organizacion_id") AS conceptos
    FROM "orden" o
    JOIN "order_status" s ON s."id" = o."estatus_id"
    JOIN "usuario"      t ON t."id" = o."tienda_id"
    JOIN "gestion_orden" g ON g."orden_id" = o."id"
                          AND g."anulada_at" IS NULL
                          AND g."resultado"::text IN (${resultadosQueAportan()})
    LEFT JOIN "cierre_dia"    c ON c."id" = g."cierre_id"
    LEFT JOIN "cierre_detail" d ON d."cierre_id" = g."cierre_id" AND d."orden_id" = o."id"
    WHERE ${where}
    ORDER BY o."id", g."id"
    LIMIT ${limite + 1}`;

  if (filas.length > limite) return { estado: "limite_excedido", limite };

  return {
    estado: "ok",
    filas: filas.map(
      (f): FilaDineroCruda => ({
        ordenId: f.orden_id,
        tiendaId: f.tienda_id,
        tiendaNombre: f.tienda_nombre,
        producto: f.producto,
        // El numero VISIBLE con el que se habla de la orden (R36): la guia si la tiene, si no
        // la remision. `String(...)` sobre un ENTERO de identificacion, que no es dinero.
        guia: f.num_guia === null ? f.num_remision : String(f.num_guia),
        numGuia: f.num_guia,
        destinatario: f.destinatario,
        gestionId: f.gestion_id,
        resultado: f.resultado,
        // Money-safe: `Decimal -> STRING escala 2` YA en el repositorio, mismo criterio que
        // `CierreAporteRepository`. Ningun importe sale de aqui como `number`.
        montoRecibido: f.monto_recibido === null ? null : f.monto_recibido.toFixed(2),
        cierreEstado: f.cierre_estado,
        congelada: congeladaDe(f),
        // FICHA 449 — APARTE de `congelada`, y a proposito: el fulfillment no es una entrada
        // de la formula y no puede viajar dentro de la `TarifaVigente` que va ahi dentro.
        fulfillment: fulfillmentDe(f),
      }),
    ),
  };
}

// =================================================================================================
// CohorteCargaRepository (lib/repositories/CohorteCargaRepository.ts)
// =================================================================================================

// Copia de CohorteCargaRepository.ts:61–132 en c301fc87.
/** Cliente MINIMO consumido (patron del resto de la vertical): una sola consulta cruda.
 *  `$queryRawUnsafe` NO esta y no puede estar: el tipo del cliente es la primera barrera
 *  contra la interpolacion de strings. */
type CohorteCargaPrismaClient = Pick<PrismaClient, "$queryRaw">;

/**
 * Los `value` TERMINALES del catalogo, como lista SQL.
 *
 * Se IMPORTAN del dominio y no se reescriben: misma constante y MISMA LINEA que
 * `AnaliticaOperativaVivaRepository` y `AnaliticaRollupRepository`, que rinden esa lista a SQL asi
 * desde antes. No se importa la de ninguno de los dos porque las dos son privadas de su modulo
 * y cruzar hacia alli meteria este archivo en censos de otra vertical; lo que impide que nazca
 * una TERCERA lista no es el parecido sino el censo de
 * `tests/unit/analytics/cohorte-terminales.guardia.test.ts`, que prohibe escribir aqui los
 * `value` a mano. Un cuarto estado terminal entra solo en las tres consultas.
 */
const TERMINALES = Prisma.join([...ESTADOS_TERMINALES]);

/** El cubo de las ordenes que NO han llegado a ningun estado terminal. */
const CUBO_VIVA: CohorteDesenlace = "viva";

interface FilaCohorte {
  readonly dia: string;
  readonly desenlace: CohorteDesenlace;
  readonly n: number;
  readonly seg: string | number | null;
}

/**
 * El `where` de la cohorte: el recorte comun de la vertical MAS su ventana, que aqui esta
 * SIEMPRE. Funcion PURA y exportada: es donde vive la semantica y se comprueba sin base de
 * datos.
 *
 * ⚠ LA VENTANA ES OBLIGATORIA, y por eso no hay rama «sin rango». Las otras siete lecturas
 * aceptan `rango: null` («sin filtrar significa TODO», decision del 2026-08-18); esta no puede:
 * una tabla con una fila por cada dia que alguna vez tuvo carga crece sin techo y deja de ser
 * una herramienta. El borde responde `sin_rango` ANTES de llegar hasta aqui, asi que un `null`
 * en este punto es un fallo de programacion y se dice en voz alta: dejar caer la condicion en
 * silencio volcaria la historia entera.
 *
 * La ventana cae sobre `o."created_at"` —la fecha de CARGA, la misma por la que se agrupa— y es
 * SEMIABIERTA `[desde, hasta)`: `resolverRango` devuelve `hasta` como las 00:00 CR del dia
 * SIGUIENTE, justamente para que `hastaFecha` sea inclusiva. Un `<=` meteria el dia siguiente
 * entero.
 */
export function condicionesDeCohorteDeHoy(consulta: ConsultaConteoEntregas): Prisma.Sql[] {
  const { rango } = consulta;
  if (rango === null) {
    throw new Error(
      "CohorteCargaRepository: la cohorte de carga EXIGE rango y la consulta llego sin el. " +
        "El borde debe responder `sin_rango` antes de consultar.",
    );
  }

  return [
    // `condicionesSinFecha` ya pone el ALCANCE como PRIMERA condicion (frontera multi-tenant)
    // y detras el soft delete y las cinco facetas de recorte. No se reescribe aqui: sin
    // policies RLS debajo, ese fragmento es la unica separacion entre inquilinos, y una segunda
    // copia es una copia que puede quedarse atras.
    //
    // De sus seis dimensiones, la de MENSAJERO queda fuera —alli no se escribe ningun `EXISTS`
    // sobre `gestion_orden`— y aqui eso es lo correcto y no una omision: una orden no la carga
    // un mensajero. Consecuencia declarada: con un mensajero seleccionado, esta seccion NO se
    // recorta y otras si, asi que la pantalla tiene que decirlo.
    ...condicionesSinFechaDeHoy(consulta),
    // FICHA 441 — la ventana se IMPORTA (`ventanaDeCarga`) y ya no se escribe aqui. Es la
    // MISMA que aplican la serie de cargadas por dia y el desglose por status desde que aquel
    // dejo de preguntar por la fecha de la ultima gestion. El `rango` nunca es `null` en este
    // punto (lo acaba de comprobar el guardia de arriba), asi que la lista nunca sale vacia.
    ...ventanaDeCarga(rango),
  ];
}

// Copia de CohorteCargaRepository.ts:137–198 en c301fc87.
export async function cohorteCargaDeHoy(
  cliente: CohorteCargaPrismaClient,
  consulta: ConsultaConteoEntregas,
): Promise<readonly CohorteCuboCrudo[]> {
  const where = Prisma.join(condicionesDeCohorteDeHoy(consulta), " AND ");

  // UNA sola consulta por lectura (R38), nunca una por dia del rango.
  //
  // Lo que compra cada pieza, y por que no se escribe de otra manera:
  //
  //  - `cohorte` PRIMERO, y el historial JOINeado CONTRA ella. No se deduplica el historial
  //    entero para tirar casi todo: `cierre` solo visita las ordenes ya recortadas, y por eso
  //    el indice `(orden_id, created_at)` es aplicable.
  //  - `DISTINCT ON ... ORDER BY orden_id, created_at DESC, id DESC` — la ULTIMA transicion
  //    terminal (R9), no la primera: una orden puede entrar a terminal, deshacerse y volver a
  //    entrar. El desempate por `id` no es defensivo: sin el, dos filas con el mismo
  //    `created_at` harian el resultado no determinista entre ejecuciones.
  //  - `LEFT JOIN` + `COALESCE(..., 'viva')` — el cubo de las vivas sale del propio `LEFT`, no
  //    de una segunda consulta ni de una resta en memoria. Por construccion los cubos SUMAN
  //    exactamente las cargadas del dia (R11).
  //  - `SUM(...)` SIN `COALESCE` — en el grupo de las vivas todos los sumandos son `NULL`, asi
  //    que `SUM` devuelve `NULL`: el numerador queda AUSENTE y no cero (R16), sin escribir un
  //    `CASE`. Cero segundos seria una afirmacion; aqui no hay reloj que parar.
  //  - `ORDER BY 1 DESC` es CONTRATO (R6): la cohorte mas reciente primero, que es lo que se
  //    viene a mirar. Como la clave es `YYYY-MM-DD`, el orden lexicografico ES el cronologico.
  //    Diverge a proposito de la serie hermana (ascendente, porque pinta un eje temporal) y
  //    se decide AQUI, en un solo sitio: la pantalla no reordena.
  const filas = await cliente.$queryRaw<FilaCohorte[]>`
    WITH cohorte AS (
      SELECT o."id"         AS orden_id,
             o."created_at" AS cargada_at,
             ${DIA_CR}      AS dia
      FROM "orden" o
      WHERE ${where}
    ),
    cierre AS (
      SELECT DISTINCT ON (h."orden_id")
             h."orden_id"   AS orden_id,
             h."created_at" AS cerrado_at,
             s."value"      AS desenlace
      FROM "orden_historial_estado" h
      JOIN "cohorte" c      ON c.orden_id = h."orden_id"
      JOIN "order_status" s ON s."id" = h."estatus_destino_id"
      WHERE s."value" IN (${TERMINALES})
      ORDER BY h."orden_id", h."created_at" DESC, h."id" DESC
    )
    SELECT c.dia                                AS dia,
           COALESCE(x.desenlace, ${CUBO_VIVA})  AS desenlace,
           COUNT(*)::int                        AS n,
           SUM(EXTRACT(EPOCH FROM (x.cerrado_at - c.cargada_at))::bigint)::bigint AS seg
    FROM cohorte c
    LEFT JOIN cierre x ON x.orden_id = c.orden_id
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 ASC`;

  // `SUM(...)::bigint` llega como STRING por el driver, y como `null` cuando todos los
  // sumandos lo eran. El `null` se CONSERVA —no se colapsa a 0— porque es la diferencia
  // entre «cerraron al instante» y «no hay cierre que medir».
  return filas.map((f) => ({
    fecha: f.dia,
    desenlace: f.desenlace,
    n: Number(f.n),
    segundosAcum: f.seg === null ? null : Number(f.seg),
  }));
}

// =================================================================================================
// ConteoHoyGestionRepository (lib/repositories/ConteoHoyGestionRepository.ts)
// =================================================================================================

// Copia de ConteoHoyGestionRepository.ts:46–77 en c301fc87.
/** Cliente MINIMO consumido: una sola consulta cruda. `$queryRawUnsafe` NO esta y no puede
 *  estar — el tipo del cliente es la primera barrera contra la interpolacion de strings. */
type ConteoHoyPrismaClient = Pick<PrismaClient, "$queryRaw">;

interface FilaHoy {
  readonly sin_gestion: number;
  readonly con_gestion: number;
}

/**
 * TODAS las condiciones del `where`, en orden. Funcion PURA y exportada: es donde vive la
 * semantica y se comprueba sin base de datos.
 *
 * El recorte comun se REUSA; lo unico propio es la ventana, y cae sobre `o."created_at"` porque
 * la pregunta es por las ordenes CARGADAS hoy, no por las que hoy tuvieron movimiento.
 *
 * SEMIABIERTA `[desde, hasta)`: `resolverRango` devuelve `hasta` como las 00:00 CR del dia
 * SIGUIENTE, justamente para que `hastaFecha` sea inclusiva. Un `<=` meteria manana entero.
 *
 * Y aqui la ventana NO es opcional: `dia` es siempre un rango real. La rama «sin fecha» que si
 * tienen las otras lecturas no existe en esta, porque un contador de hoy sin dia no es nada.
 */
export function condicionesDelDiaDeHoy(
  consulta: ConsultaConteoEntregas,
  dia: RangoResuelto,
): Prisma.Sql[] {
  return [
    ...condicionesSinFechaDeHoy(consulta),
    Prisma.sql`o."created_at" >= ${dia.desde}`,
    Prisma.sql`o."created_at" <  ${dia.hasta}`,
  ];
}

// Copia de ConteoHoyGestionRepository.ts:82–118 en c301fc87.
export async function conteoHoyGestionDeHoy(
  cliente: ConteoHoyPrismaClient,
  consulta: ConsultaConteoEntregas,
  dia: RangoResuelto,
): Promise<ConteoHoyCrudo> {
  const where = Prisma.join(condicionesDelDiaDeHoy(consulta, dia), " AND ");

  // `LIMIT 1` en el lateral: no interesa CUANTAS gestiones tiene la orden ni cual es la
  // ultima —eso es la pregunta del desglose por status—, solo si hay alguna. En cuanto
  // encuentra una, para.
  //
  // `anulada_at IS NULL` es la misma regla de vigencia que el resto de la vertical: una
  // gestion anulada no cuenta como «tocada», porque anularla es exactamente deshacerla.
  //
  // `COALESCE(..., 0)`: sin filas, los `COUNT` de una agregacion sin `GROUP BY` devuelven 0 y
  // la fila SI viene — pero el `COALESCE` deja escrito que dos ceros son una respuesta y no
  // una ausencia, y protege del caso en que alguien anada un `GROUP BY` mas adelante.
  const filas = await cliente.$queryRaw<FilaHoy[]>`
    SELECT COALESCE(COUNT(*) FILTER (WHERE u."id" IS NULL), 0)::int     AS sin_gestion,
           COALESCE(COUNT(*) FILTER (WHERE u."id" IS NOT NULL), 0)::int AS con_gestion
    FROM "orden" o
    LEFT JOIN LATERAL (
      SELECT g."id"
      FROM "gestion_orden" g
      WHERE g."orden_id" = o."id"
        AND g."anulada_at" IS NULL
      LIMIT 1
    ) u ON TRUE
    WHERE ${where}`;

  // Una agregacion sin `GROUP BY` devuelve SIEMPRE exactamente una fila; el `?? 0` es la
  // defensa contra un doble que devuelva `[]` en un test, no contra Postgres.
  const fila = filas[0];
  return {
    sinGestion: Number(fila?.sin_gestion ?? 0),
    conGestion: Number(fila?.con_gestion ?? 0),
  };
}
