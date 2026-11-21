import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  CatalogoGeograficoRepository,
  type CatalogoPrismaClient,
} from "@/lib/repositories/CatalogoGeograficoRepository";
import { whereLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { sinTransaccionAnidada } from "@/lib/repositories/_shared/sin-transaccion-anidada";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { nodosBajo, zonaQueCubre } from "@/lib/services/geografia-dominio";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import {
  ESTADOS_PAQUETE_EN_ESTANTE,
  ESTADOS_QUE_NO_SE_MUEVEN,
} from "@/lib/utils/estados-bodega-satelite";

/**
 * SLT-224 (design §2) — LA RECONCILIACION DE `orden.zona_id`, EN UN SOLO SITIO DEL ARBOL.
 *
 * Nacio en `ZonaRepository.update` (fichas 366/377) y se movio aqui SIN cambiar su logica cuando
 * aparecieron dos llamadores mas: la recepcion en la central (`OrdenRepository.recibirEnBodegaCentral`)
 * y el boton «Actualizar zonas» (`ActualizacionZonasRepository.actualizar`). Tres copias del corte
 * de dinero serian tres reglas que un dia divergen sin que falle nada (R1706). Lo vigila
 * `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`.
 *
 * PR 2 (D6, R1720-R1725): «las vivas se mueven aunque tengan un cierre anterior; las finalizadas
 * no». El corte deja de excluir todo cierre y toda gestion: solo protege el dinero EN CURSO (un
 * cierre sin aprobar, o una gestion que decidio dinero y aun no tiene cierre aprobado), y el estado
 * lo decide `CLASE_RECONCILIACION_ZONA`. Los tres llamadores heredan el corte sin cambio.
 *
 * SLT-65 (design §6.1, §6.3): la zona de cada lugar sale del catalogo jerarquico de SLT-44
 * (`zonaQueCubre`, la asignacion mas especifica) y la orden entra por su LUGAR (`whereLugarEn`), no
 * por `distrito_id`. La parte que SOLO LEE es `planificarReconciliacion`, exportada para que el
 * script de equivalencia la pregunte sobre una conexion de solo lectura;
 * `reconciliarZonaDeOrdenes` la llama y aplica el plan.
 */

export interface AlcanceReconciliacion {
  /**
   * Nodos a re-evaluar (distritos, o cantones con lo que cuelga de ellos: SLT-65 R13). Siempre
   * presente: la regla parte de las asignaciones de zona.
   */
  distritoIds: string[];
  /** Si viene, acota ademas a estas ordenes (la recepcion pasa la suya). Ausente = todas las del distrito. */
  ordenIds?: string[];
}

export interface ResultadoReconciliacion {
  ordenesReconciliadas: number;
  ordenesRetenidasEnBodegaSatelite: number;
}

/**
 * SLT-65 (design §6.3) — lo que el plan de la reconciliacion lee del cliente de la transaccion: las
 * ordenes y los modelos del catalogo (`CatalogoPrismaClient`).
 */
export type TxDeReconciliacion = Pick<Prisma.TransactionClient, "orden"> & CatalogoPrismaClient;

/** SLT-65 (design §6.1): lo que movera un guardado, calculado sin escribir. */
export interface PlanDeReconciliacion {
  /** Por zona destino: las ordenes que se mueven (id, guia, remision). Sin zonas vacias. */
  porZona: Map<string, { id: string; numGuia: number | null; numRemision: string | null }[]>;
  retenidasEnBodegaSatelite: number;
}

/**
 * ⭑ EL CORTE DE ELEGIBILIDAD DE LA RECONCILIACION (366/R6/R7/R8 → SLT-224 PR 2, D6), EN UNA SOLA
 * DECLARACION.
 *
 * Vive en el `WHERE` a proposito: son condiciones sobre filas de OTRAS tablas (`cierre_detail`,
 * `cierre_dia` y `gestion_orden`), no `if`s que un doble pueda esquivar. Sus cortes, sin ninguno
 * de estado:
 *   · `deletedAt: null`       — una orden borrada no se re-estampa;
 *   · `cierreDetalles: none {cierre sin aprobar}` — R1722: el detalle de un cierre `solicitado`,
 *     `rechazado` o `vencido` es dinero EN CURSO: la resolicitud, la correccion de la 398 y el ruteo
 *     de la aprobacion leen la zona VIVA (design §4b). Uno `aprobado` ya es pasado e inmutable
 *     (69/R10) y no impide mover la zona (R1720): el proximo cierre cobra con la zona nueva;
 *   · `gestiones: none {...}` — R1722: una gestion VIGENTE cuyo resultado ya decidio dinero
 *     (`entregado`, rechazo, `incidente`) y que aun NO tiene cierre aprobado (sin cierre, o con uno
 *     sin aprobar). Una `reprogramada` o una `devuelta` vigentes NO excluyen por aqui: las dos se
 *     rutean HACIA ADELANTE por `orden.zonaId` (`LiberacionReprogramadaService`,
 *     `DevolucionSlaService`), asi que dejarlas con la zona vieja las liberaria a la bodega
 *     equivocada — el mismo atasco que la 366 vino a arreglar.
 *
 * ⭑ FICHA 377 (design §3.3) — POR QUE ES UNA FUNCION Y NO DOS `where` ESCRITOS DOS VECES. La 377
 * lo lee DOS veces en cada grupo: una para las ordenes que SE MUEVEN (`notIn` de lo que no se
 * mueve) y otra para CONTAR las que se quedan en el estante (`in` estante). Si las dos copiaran el
 * corte, el dia que cambie uno de los cortes de arriba el conteo se quedaria contando otra cosa y
 * nada fallaria — es la misma leccion que `OrdenRepository`/184-R16, donde el `WHERE` de la pagina
 * y el del conjunto no pueden despegarse.
 *
 * El estado NO entra aqui: cada consumidor le añade su clausula de estado.
 *
 * SLT-65 (design §6.1, paso 4): la orden entra por su LUGAR (`whereLugarEn`), no por `distrito_id`.
 * Con lugares que son solo distritos, la rama del canton no casa con nada y el corte es el de antes.
 *
 * SLT-224: `ordenIds` acota ademas a unas ordenes concretas (la recepcion pasa la suya). Sin el,
 * el `where` es exactamente el de la 366/377: el campo no se añade, ni siquiera como `undefined`.
 */
function whereBaseElegible(
  lugares: readonly string[],
  zonaResueltaId: string,
  ordenIds: readonly string[] | undefined,
): Prisma.OrdenWhereInput {
  return {
    ...(ordenIds !== undefined ? { id: { in: [...ordenIds] } } : {}),
    ...whereLugarEn(lugares),
    zonaId: { not: zonaResueltaId },
    deletedAt: null,
    // R1722: solo el detalle de un cierre SIN APROBAR protege.
    cierreDetalles: { none: { cierre: { estado: { not: "aprobado" } } } },
    // R1722: la gestion que decidio dinero y aun no tiene cierre aprobado.
    gestiones: {
      none: {
        anuladaAt: null,
        resultado: { in: ["entregado", "devolucion_a_origen_por_rechazo", "incidente"] },
        OR: [{ cierreId: null }, { cierre: { estado: { not: "aprobado" } } }],
      },
    },
  };
}

/**
 * ⭑ SLT-65 (design §6.1; R13–R15, R17) — QUE MOVERIA UNA RECONCILIACION, SIN ESCRIBIR NADA.
 *
 * Se extrajo de `ZonaRepository.update` para que el script de equivalencia (design §9) pueda
 * preguntarlo sobre una conexion de solo lectura. `reconciliarZonaDeOrdenes` lo llama y aplica el
 * plan con las mismas escrituras de siempre.
 *
 * 1. El catalogo y las asignaciones salen de `deLaEmpresa()` SOBRE `tx`: no abre otra transaccion,
 *    lee en serie en la del llamador y ve el `zona_distrito` que este acaba de reescribir (R17).
 * 2. Los lugares son los nodos afectados y todo lo que cuelga de ellos (R13).
 * 3. La zona de cada lugar es `zonaQueCubre`: la asignacion mas especifica, con el colapso 1/0/>1 de
 *    la 366 (R2/R3). `null` (0 o >1 zonas) no mueve nada: no se inventa una zona eligiendo la primera.
 * 4. Por zona, las dos consultas de la 377 sobre el MISMO `whereBaseElegible`: el conteo de las del
 *    estante y las elegibles. Una zona sin elegibles no entra en `porZona`.
 */
export async function planificarReconciliacion(
  tx: TxDeReconciliacion,
  nodosAfectados: readonly string[],
  ordenIds?: readonly string[],
): Promise<PlanDeReconciliacion> {
  const porZona: PlanDeReconciliacion["porZona"] = new Map();
  let retenidasEnBodegaSatelite = 0;
  if (nodosAfectados.length === 0) return { porZona, retenidasEnBodegaSatelite };

  const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(tx).deLaEmpresa();

  // En el orden de los nodos afectados, cada uno seguido de lo que cuelga de el, sin repetidos.
  const lugares = new Set<string>();
  for (const n of nodosAfectados) {
    lugares.add(n);
    for (const bajo of nodosBajo(catalogo, n)) lugares.add(bajo.id);
  }

  const lugaresPorZona = new Map<string, string[]>();
  for (const lugar of lugares) {
    const zonaId = zonaQueCubre(catalogo, asignaciones, lugar)?.id;
    if (zonaId === undefined) continue;
    const bucket = lugaresPorZona.get(zonaId);
    if (bucket) bucket.push(lugar);
    else lugaresPorZona.set(zonaId, [lugar]);
  }

  // R1721/R1723: lo que el `findMany` de elegibles NO mueve por su estado: todo lo que la
  // clasificacion no marca `se_mueve` (estante, finalizadas, devoluciones, por liberar). Los tres
  // llamadores excluyen lo mismo (R1706).
  const noSeMueven = [...ESTADOS_QUE_NO_SE_MUEVEN];

  for (const [zonaResueltaId, lugaresDeLaZona] of lugaresPorZona) {
    // El corte de elegibilidad (los cortes que NO miran el estado) vive en `whereBaseElegible`,
    // arriba, y lo leen las DOS consultas de este bloque (R1724).
    const base = whereBaseElegible(lugaresDeLaZona, zonaResueltaId, ordenIds);

    // ══════════════════════════════════════════════════════════════════════════════
    // ⭑ FICHA 377 (R2/R8) — LO QUE SE QUEDA, Y POR QUE SE CUENTA
    // ══════════════════════════════════════════════════════════════════════════════
    //
    // EN TRANSITO SI, EN EL ESTANTE NO. `orden.zona_id` hace dos trabajos a la vez
    // (377/design §1): dice a que zona GEOGRAFICA pertenece la direccion —de ahi la
    // tarifa— y dice QUE BODEGA tiene el paquete —de ahi el permiso: el listado
    // (`OrdenRepository.condicionesSatelite`), la asignacion
    // (`AsignacionSateliteService`, motivo `zona_ajena`) y el deshacer—. El estado dice
    // cual de los dos manda:
    //
    //   · `en_ruta_bodega_satelite` — el paquete lo tiene la CENTRAL, que aun decide
    //     adonde lo manda. Reconciliar es CORRECTO y ademas DESBLOQUEA la recepcion,
    //     porque `recibirEnSatelite` acota su guarda por `zonaId` (366/design §8: 41 de
    //     42 ordenes represadas el 2026-09-03). NO SE TOCA.
    //   · `en_bodega_satelite` — el paquete esta en el estante de una bodega concreta,
    //     que lo recibio con su propia transicion. Moverle la zona le quita el permiso a
    //     quien LO TIENE sin darselo a nadie que pueda usarlo. Por eso se queda como esta.
    //     (SLT-197 añadio despues el retiro a la central; la recepcion alli la reconcilia.)
    //
    // El conteo se hace SIEMPRE, tambien cuando no haya nada que mover: R8 no depende de
    // que este guardado reconcilie algo. Y se hace en SQL —no filtrando en JS lo que ya
    // se trajo— porque un corte que decide quien se mueve tiene que poder matarse con
    // una mutacion y que un test contra Postgres lo note (design §3.2).
    retenidasEnBodegaSatelite += await tx.orden.count({
      where: { ...base, estatus: { value: { in: [...ESTADOS_PAQUETE_EN_ESTANTE] } } },
    });

    const elegibles = await tx.orden.findMany({
      where: { ...base, estatus: { value: { notIn: noSeMueven } } },
      select: { id: true, numGuia: true, numRemision: true },
    });
    if (elegibles.length > 0) porZona.set(zonaResueltaId, elegibles);
  }
  return { porZona, retenidasEnBodegaSatelite };
}

/**
 * Re-deriva la zona de las ordenes de los nodos de `alcance.distritoIds` (y lo que cuelga de ellos)
 * desde las asignaciones de zona: calcula el plan (`planificarReconciliacion`) y lo aplica con una
 * accion `orden_zona_reconciliada` por orden movida, todo con UN lote por llamada.
 *
 * Recibe la `tx` y nunca abre la suya: la atomicidad con el guardado de la zona, con la recepcion
 * o con el boton la da quien llama. Lee el catalogo y `orden` por la `tx`, asi que la empresa la
 * acota el cliente con la empresa en contexto (RLS).
 */
export async function reconciliarZonaDeOrdenes(
  tx: Prisma.TransactionClient,
  alcance: AlcanceReconciliacion,
  actorUsuarioId: string | null,
): Promise<ResultadoReconciliacion> {
  const { distritoIds: distritosAfectados, ordenIds } = alcance;
  if (distritosAfectados.length === 0) {
    return { ordenesReconciliadas: 0, ordenesRetenidasEnBodegaSatelite: 0 };
  }

  // El `tx` va SIN `$transaction` (`sinTransaccionAnidada`, ahi el porque): con el, la carga del
  // catalogo abriria una transaccion anidada y dejaria rota la siguiente que se abra fuera de
  // esta. Sin el, lee en serie en la del llamador.
  const plan = await planificarReconciliacion(sinTransaccionAnidada(tx), distritosAfectados, ordenIds);
  let ordenesReconciliadas = 0;
  // 377/R8: las que HABRIAN cambiado de zona y no lo hacen porque su paquete ya esta en el
  // estante de una satelite. Se devuelve en la misma respuesta del guardado (R8/R10).
  const ordenesRetenidasEnBodegaSatelite = plan.retenidasEnBodegaSatelite;
  if (plan.porZona.size === 0) return { ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite };

  // 366/R11: UN lote por LLAMADA (un guardado, una recepcion, una confirmacion del boton), aunque
  // toque varias zonas resueltas. Y UN solo `resolverActorCongelado` para todas sus filas
  // (362/design §2.4).
  const loteId = randomUUID();
  const actor = await resolverActorCongelado(tx, actorUsuarioId);

  for (const [zonaResueltaId, elegibles] of plan.porZona) {
    // 366/R9: SOLO `zonaId`. Ni el estado, ni el mensajero, ni el monto, ni la
    // ubicacion: esta regla corrige la zona y nada mas.
    await tx.orden.updateMany({
      where: { id: { in: elegibles.map((o) => o.id) } },
      data: { zonaId: zonaResueltaId },
    });

    // 362/R9 + 366/R10: una fila POR ORDEN ALCANZADA (no por orden candidata) y en la
    // MISMA transaccion. La etiqueta es la guia —o la remision si no hay guia—, que es
    // un identificador de envio de la empresa; `valorAnterior`/`valorNuevo`/`monto` van
    // NULL a proposito: ahi irian la zona vieja y la nueva, que R10 deja fuera.
    await appendAccion(
      tx,
      elegibles.map((o) => ({
        accion: "orden_zona_reconciliada" as const,
        entidadTipo: "orden" as const,
        entidadId: o.id,
        entidadEtiqueta: etiquetaDeEntidad("orden", {
          numGuia: o.numGuia,
          numRemision: o.numRemision,
        }),
        ...actor,
      })),
      loteId,
    );

    ordenesReconciliadas += elegibles.length;
  }

  return { ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite };
}
