import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
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
 */

export interface AlcanceReconciliacion {
  /** Distritos a re-evaluar. Siempre presente: la regla parte del mapa `zona_distrito`. */
  distritoIds: string[];
  /** Si viene, acota ademas a estas ordenes (la recepcion pasa la suya). Ausente = todas las del distrito. */
  ordenIds?: string[];
}

export interface ResultadoReconciliacion {
  ordenesReconciliadas: number;
  ordenesRetenidasEnBodegaSatelite: number;
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
 *     sin aprobar). Una `reprogramada` o una `devuelta` vigentes NO excluyen por aqui.
 *
 * ⭑ FICHA 377 (design §3.3) — POR QUE ES UNA FUNCION Y NO DOS `where` ESCRITOS DOS VECES. La 377
 * lo lee DOS veces en cada grupo: una para las ordenes que SE MUEVEN (`notIn` estante) y otra
 * para CONTAR las que se quedan (`in` estante). Si las dos copiaran el corte, el dia que cambie
 * uno de los cuatro cortes de arriba el conteo se quedaria contando otra cosa y nada fallaria —
 * es la misma leccion que `OrdenRepository`/184-R16, donde el `WHERE` de la pagina y el del
 * conjunto no pueden despegarse.
 *
 * El estado NO entra aqui: cada consumidor le añade su clausula COMPLEMENTARIA, y esa
 * complementariedad es lo que hace que los dos conjuntos sean disjuntos por construccion.
 *
 * SLT-224: `ordenIds` acota ademas a unas ordenes concretas (la recepcion pasa la suya). Sin el,
 * el `where` es exactamente el de la 366/377: el campo no se añade, ni siquiera como `undefined`.
 */
function whereBaseElegible(
  distritoIds: string[],
  zonaResueltaId: string,
  ordenIds: string[] | undefined,
): Prisma.OrdenWhereInput {
  return {
    ...(ordenIds !== undefined ? { id: { in: ordenIds } } : {}),
    distritoId: { in: distritoIds },
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
 * Re-deriva la zona de las ordenes de `alcance.distritoIds` desde `zona_distrito`, con el colapso
 * 1/0/>1, el corte de `whereBaseElegible`, la retencion del estante (377) y una accion
 * `orden_zona_reconciliada` por orden movida, todo con UN lote por llamada.
 *
 * Recibe la `tx` y nunca abre la suya: la atomicidad con el guardado de la zona, con la recepcion
 * o con el boton la da quien llama. Lee `zona_distrito` y `orden` por la `tx`, asi que la empresa
 * la acota el cliente con la empresa en contexto (RLS).
 */
export async function reconciliarZonaDeOrdenes(
  tx: Prisma.TransactionClient,
  alcance: AlcanceReconciliacion,
  actorUsuarioId: string | null,
): Promise<ResultadoReconciliacion> {
  const { distritoIds: distritosAfectados, ordenIds } = alcance;
  let ordenesReconciliadas = 0;
  // 377/R8: las que HABRIAN cambiado de zona y no lo hacen porque su paquete ya esta en el
  // estante de una satelite. Se devuelve en la misma respuesta del guardado (R8/R10).
  let ordenesRetenidasEnBodegaSatelite = 0;
  if (distritosAfectados.length === 0) {
    return { ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite };
  }

  // El estado YA reemplazado de la N:M: es el que decide cual es la zona correcta.
  const filas = await tx.zonaDistrito.findMany({
    where: { distritoId: { in: distritosAfectados } },
    select: { distritoId: true, zonaId: true },
  });

  const zonasPorDistrito = new Map<string, string[]>();
  for (const fila of filas) {
    const bucket = zonasPorDistrito.get(fila.distritoId);
    if (bucket) bucket.push(fila.zonaId);
    else zonasPorDistrito.set(fila.distritoId, [fila.zonaId]);
  }

  // 366/R2/R3: el colapso 1/0/>1 es EL MISMO que usan la carga masiva y la correccion
  // manual (`_shared/zona-colapso`). Un distrito con 0 o con >1 zonas resuelve `null` y NO
  // mueve ninguna orden: no se inventa una zona eligiendo la primera.
  const distritosPorZonaResuelta = new Map<string, string[]>();
  for (const distritoId of distritosAfectados) {
    const zonaResuelta = zonaUnicaDeDistrito(zonasPorDistrito.get(distritoId) ?? []);
    if (zonaResuelta === null) continue;
    const bucket = distritosPorZonaResuelta.get(zonaResuelta);
    if (bucket) bucket.push(distritoId);
    else distritosPorZonaResuelta.set(zonaResuelta, [distritoId]);
  }

  if (distritosPorZonaResuelta.size === 0) {
    return { ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite };
  }

  // 366/R11: UN lote por LLAMADA (un guardado, una recepcion, una confirmacion del boton), aunque
  // toque varias zonas resueltas. Y UN solo `resolverActorCongelado` para todas sus filas
  // (362/design §2.4).
  const loteId = randomUUID();
  const actor = await resolverActorCongelado(tx, actorUsuarioId);

  // R1721/R1723: lo que el `findMany` de elegibles NO mueve por su estado: todo lo que la
  // clasificacion no marca `se_mueve` (estante, finalizadas, devoluciones, por liberar). Los tres
  // llamadores excluyen lo mismo (R1706).
  const noSeMueven = [...ESTADOS_QUE_NO_SE_MUEVEN];

  for (const [zonaResueltaId, distritoIds] of distritosPorZonaResuelta) {
    // El corte de elegibilidad (los cortes que NO miran el estado) vive en
    // `whereBaseElegible`, arriba, y lo leen las DOS consultas de este bloque (R1724).
    const base = whereBaseElegible(distritoIds, zonaResueltaId, ordenIds);

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
    ordenesRetenidasEnBodegaSatelite += await tx.orden.count({
      where: { ...base, estatus: { value: { in: [...ESTADOS_PAQUETE_EN_ESTANTE] } } },
    });

    const elegibles = await tx.orden.findMany({
      where: { ...base, estatus: { value: { notIn: noSeMueven } } },
      select: { id: true, numGuia: true, numRemision: true },
    });
    if (elegibles.length === 0) continue;

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
