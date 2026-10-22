import type { Escenario } from "./454/_escenario";

/**
 * FICHA 484 — utilidades compartidas por los `484-puntero-*` (Postgres real, tx revertida).
 *
 * El puntero es `usuario.orden_en_gestion_id`. Aqui se PLANTA a mano —como lo dejo el incidente
 * BLST-765, o un puntero heredado de antes del despliegue— y se LEE de la misma transaccion.
 */

export async function plantarPuntero(e: Escenario, usuarioId: string, ordenId: string | null) {
  await e.tx.usuario.update({ where: { id: usuarioId }, data: { ordenEnGestionId: ordenId } });
}

export async function punteroDe(e: Escenario, usuarioId: string): Promise<string | null> {
  const u = await e.tx.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { ordenEnGestionId: true },
  });
  return u.ordenEnGestionId;
}

/** La fila COMPLETA del usuario (todas las columnas escalares), para medir neutralidad (R8). */
export async function filaUsuario(e: Escenario, usuarioId: string): Promise<Record<string, unknown>> {
  const u = await e.tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  return JSON.parse(JSON.stringify(u)) as Record<string, unknown>;
}

/**
 * La fila sin las dos columnas que la limpieza PUEDE tocar: el puntero y `updated_at`. Este ultimo
 * lo sella Prisma (`@updatedAt`) en todo `updateMany` sobre `usuario`; es el mismo sello que ya
 * ponen los otros dos escritores del puntero (`liberarOrdenEnGestion`, `registrarGestionPendiente`).
 */
export function sinPunteroNiSello(fila: Record<string, unknown>): Record<string, unknown> {
  const { ordenEnGestionId: _p, updatedAt: _u, ...resto } = fila;
  void _p;
  void _u;
  return resto;
}

/**
 * Recuentos de los tres libros de dinero ACOTADOS A ESTE ESCENARIO, para medir deltas dentro de la
 * tx (R8): la tienda y el mensajero son personas creadas por el escenario, y la caja se cuenta por
 * origen (los cierres del mensajero y las gestiones de las ordenes del corpus).
 *
 * ⚠️ NO recuentos globales: la gate corre `tests/integration/db` en paralelo y otras suites
 * confirman y borran filas de estos libros fuera del candado de aviso. Medido: un `count()` global
 * dio `tienda: -1` en la corrida en paralelo de `--rapido` y verde aislado.
 */
export async function librosDeDinero(e: Escenario, ordenIds: string[]) {
  const cierres = (
    await e.tx.cierreDia.findMany({ where: { mensajeroId: e.mensajeroId }, select: { id: true } })
  ).map((c) => c.id);
  const gestiones = (
    await e.tx.gestionOrden.findMany({ where: { ordenId: { in: ordenIds } }, select: { id: true } })
  ).map((g) => g.id);
  return {
    caja: await e.tx.walletMovimiento.count({
      where: { origenId: { in: [...cierres, ...gestiones, ...ordenIds] } },
    }),
    tienda: await e.tx.walletTiendaMovimiento.count({ where: { tiendaId: e.tiendaId } }),
    mensajero: await e.tx.pagoMensajeroMovimiento.count({ where: { mensajeroId: e.mensajeroId } }),
  };
}
