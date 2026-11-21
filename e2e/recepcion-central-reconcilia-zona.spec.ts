import { expect, test, type Page } from "@playwright/test";

import { conEmpresa } from "../lib/db/contexto-empresa";
import { getPrismaClient } from "../lib/db/prisma-client";
import { OrdenRepository } from "../lib/repositories/OrdenRepository";
import { EnvioDevolucionCentralService } from "../lib/services/EnvioDevolucionCentralService";
import { actualizarZonaSchema } from "../lib/types/zona";
import { exigirOk, servicios } from "../tests/fabricas/escenarios/reparto";

import { aprobarCierre, solicitarCierre } from "./_escenarios/cierres";
import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
  type ZonaRepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — la recepción en la bodega central por QR re-deriva la zona de la orden.
 * SLT-224 «Retiro a central: recalcular la zona de la orden» (R1700, R1702, R1703, R1704, R1705,
 * R1707, R1723) sobre la reconciliación de SLT-65 «geo jerárquica: consultas» (R13–R15:
 * `lib/repositories/_shared/reconciliar-zona-ordenes.ts`).
 *
 * El defecto de prod que cierra SLT-224, contado de punta a punta:
 *   1. órdenes de la tienda en el distrito de la satélite llegan a su estante (`en_bodega_satelite`);
 *   2. el maestro vacía la satélite y pasa su distrito a la central (`ZonaService.actualizar`, SLT-198):
 *      el guardado las RETIENE con la zona vieja (377: el paquete está en el estante);
 *   3. el maestro las retira a la central (SLT-197): siguen con la zona de la satélite (R1705);
 *   4. la central las recibe con la pistola en «Recibir paquetes» — ESTO es lo que prueba el E2E.
 *
 * Casos:
 *   · R1700/R1703/R1707: la orden con distrito toma la zona del distrito (la central), deja UNA acción
 *     `orden_zona_reconciliada` con el maestro como actor, y ninguna otra columna de la orden ni
 *     ninguna tarifa cambia (la tarifa NO se recalcula: la orden no guarda tarifa; se comprueba la
 *     fila entera de la orden y las tarifas de la empresa).
 *   · R1704/R1723: una orden en `devolviendo_a_bodega_central` (estado de `ESTADOS_QUE_NO_SE_MUEVEN`,
 *     y el único de ellos que la recepción central acepta) se recibe y queda `por_devolver_a_tienda`
 *     con su zona vieja.
 *   · R1702: una orden con cantón y SIN distrito se recibe y conserva su zona. COMPORTAMIENTO CONOCIDO
 *     ABIERTO PARA REVISIÓN: la recepción salta la reconciliación cuando `distrito_id` es nulo
 *     (`OrdenRepository.recibirEnBodegaCentral`), aunque desde SLT-65 el lugar de una orden es
 *     `COALESCE(distrito_id, canton_id)` y una zona asignada a su cantón podría cubrirla. Hoy las
 *     zonas solo se asignan por distrito (SLT-65 R16), así que el test fija lo que pasa, no lo que
 *     debería pasar si eso cambia.
 *
 * FUERA (sin spec que lo defina): recibir una orden cuyo distrito cuelga de un cantón desactivado en
 * el catálogo. Ni SLT-65 ni SLT-224 dicen qué zona le toca; queda abierto, no se prueba.
 *
 * DATOS (R7, R8): una empresa nueva por corrida (`crearEscenarioReparto`), con sus propias zonas;
 * todo por los servicios reales, salvo UNA excepción de R8 marcada abajo (la orden sin distrito: la
 * carga exige distrito y ningún servicio lo quita). No se toca ningún nodo del catálogo compartido.
 * Sin `waitForTimeout`: todo espera condiciones. FUERA: la cámara (html5-qrcode necesita una real).
 */

let r: RepartoE2E;
/** Caso 1: distrito movido de la satélite a la central, retirada del estante, en ruta a la central. */
let conDistrito: OrdenE2E;
/** Caso 2: rechazada, enviada por la satélite a la central (`devolviendo_a_bodega_central`). */
let enDevolucion: OrdenE2E;
/** Caso 3: cantón sin distrito, retirada del estante, en ruta a la central. */
let sinDistrito: OrdenE2E;

/** Columnas que la recepción escribe por sí misma (feature 138 + SLT-63) o que R1707 permite. */
const ESCRITAS_POR_LA_RECEPCION = [
  "estatusId",
  "zonaId",
  "updatedAt",
  "mensajeroAsignadoId",
  "asignadoAt",
  "fechaReparto",
] as const;

async function zonaDe(o: { id: string }): Promise<string> {
  return (await baseReparto().orden.findUniqueOrThrow({ where: { id: o.id }, select: { zonaId: true } })).zonaId;
}

async function accionesDeZona(o: { id: string }) {
  return baseReparto().historialAccion.findMany({
    where: { accion: "orden_zona_reconciliada", entidadId: o.id },
    select: { actorUsuarioId: true },
  });
}

/** La fila de la orden sin lo que la recepción escribe: lo que R1707 exige intacto. */
async function filaSinLoDeLaRecepcion(o: { id: string }): Promise<string> {
  const fila: Record<string, unknown> = { ...(await baseReparto().orden.findUniqueOrThrow({ where: { id: o.id } })) };
  for (const c of ESCRITAS_POR_LA_RECEPCION) delete fila[c];
  return JSON.stringify(fila);
}

/** Las tablas de tarifa de la empresa (tienda y pago al mensajero por zona): R1707 no las toca. */
async function tarifasDeLaEmpresa(): Promise<string> {
  const org = r.empresa.organizacionId;
  const [tarifas, pagos, valores] = await Promise.all([
    baseReparto().tarifa.findMany({ where: { organizacionId: org }, orderBy: { id: "asc" } }),
    baseReparto().tarifaZonaMensajero.findMany({
      where: { zonaId: { in: [r.zonaCentral.id, r.zonaSatelite.id] } },
      orderBy: { id: "asc" },
    }),
    baseReparto().tarifaValor.findMany({ where: { organizacionId: org }, orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ tarifas, pagos, valores });
}

/** `ZonaService.actualizar` con el maestro, como `lib/actions/zonas.ts`: solo nombre y distritos. */
async function guardarDistritos(zona: ZonaRepartoE2E, distritoIds: string[]) {
  const input = actualizarZonaSchema.parse({ nombre: zona.nombre, distritoIds });
  const res = exigirOk(
    "ZonaService.actualizar",
    await conEmpresa(r.empresa.organizacionId, () => servicios().zona.actualizar(zona.id, input, r.actores.maestro)),
  );
  if (res.status !== "ok") throw new Error("inalcanzable");
  return res;
}

/** La central lee las guías con la pistola en «Recibir paquetes» y espera la fila de cada una. */
async function recibirConPistola(page: Page, o: OrdenE2E) {
  await page.goto("/ordenes/recibir");
  await expect(page.getByText("Bodega central", { exact: true })).toBeVisible();
  const campo = page.getByLabel("Escanea la guía con la pistola");
  await expect(campo).toBeFocused();
  await page.keyboard.type(String(o.numGuia));
  await page.keyboard.press("Enter");
  return page.getByRole("log", { name: "Lecturas" }).getByRole("row", { name: new RegExp(String(o.numGuia)) });
}

test.describe.serial("Recepción en la central — la zona se re-deriva al recibir por QR", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    r = await crearEscenarioReparto("recepcion-reconcilia-zona");
    const mensajero = await crearMensajero(r, "satelite");

    // Las tres nacen en el distrito de la satélite.
    conDistrito = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite");
    sinDistrito = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite");
    enDevolucion = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero });
    await gestionar(r, enDevolucion, mensajero, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    await aprobarCierre(r, await solicitarCierre(r, mensajero));
    expect(await estadoDe(enDevolucion)).toBe("por_devolver_a_bodega_central");
    // `lib/actions/envio-devolucion-central.ts`: la envía el adminSatelite de la zona de la orden.
    exigirOk(
      "EnvioDevolucionCentralService.enviarACentral",
      await conEmpresa(r.empresa.organizacionId, () =>
        new EnvioDevolucionCentralService(new OrdenRepository(getPrismaClient())).enviarACentral(
          enDevolucion.id,
          r.actores.adminSatelite,
        ),
      ),
    );
    expect(await estadoDe(enDevolucion)).toBe("devolviendo_a_bodega_central");

    // ⚠️ EXCEPCIÓN DE R8: una orden con cantón y sin distrito. La carga masiva y la API exigen
    // distrito (`geo-resolucion.ts`) y ningún servicio lo quita; en prod existen por órdenes viejas.
    // Se quita a mano SOLO el distrito de una orden de esta empresa: el cantón sigue siendo el de su
    // distrito, y el trigger `orden_nodo_geografico` deja su nodo en el cantón.
    await baseReparto().orden.update({ where: { id: sinDistrito.id }, data: { distritoId: null } });

    // El maestro vacía la satélite y pasa su distrito a la central (SLT-198): la del estante queda
    // retenida con la zona vieja (377) y la devolución no se mueve (R1723).
    await guardarDistritos(r.zonaSatelite, []);
    const guardado = await guardarDistritos(r.zonaCentral, [r.zonaCentral.geo.distritoId, r.zonaSatelite.geo.distritoId]);
    expect(guardado.ordenesReconciliadas).toBe(0);
    expect(guardado.ordenesRetenidasEnBodegaSatelite).toBe(1);

    // SLT-197: el maestro retira del estante a la central las dos que esperan allí (R1705: sin cambiar la zona).
    exigirOk(
      "GuiaAsignacionService.retirarABodegaCentral",
      await conEmpresa(r.empresa.organizacionId, () =>
        servicios().guia.retirarABodegaCentral({ ordenIds: [conDistrito.id, sinDistrito.id] }, r.actores.maestro),
      ),
    );
    for (const o of [conDistrito, sinDistrito, enDevolucion]) expect(await zonaDe(o)).toBe(r.zonaSatelite.id);
    expect(await estadoDe(conDistrito)).toBe("en_ruta_bodega_central");
    expect(await estadoDe(sinDistrito)).toBe("en_ruta_bodega_central");
  });

  test("R1700/R1703/R1707: la orden con distrito toma la zona de su distrito y no cambia nada más", async ({ browser }) => {
    const filaAntes = await filaSinLoDeLaRecepcion(conDistrito);
    const tarifasAntes = await tarifasDeLaEmpresa();

    const page = await paginaDe(browser, r.empresa.maestro);
    const lectura = await recibirConPistola(page, conDistrito);
    await expect(lectura.getByText("Recibida", { exact: true })).toBeVisible();

    await expect.poll(() => estadoDe(conDistrito)).toBe("en_bodega_central");
    expect(await zonaDe(conDistrito)).toBe(r.zonaCentral.id);
    expect(await accionesDeZona(conDistrito)).toEqual([{ actorUsuarioId: r.empresa.maestro.id }]);
    // R1707: la tarifa no se recalcula. La orden no guarda tarifa (sale de tienda + zona + distrito
    // al cerrar): la fila de la orden queda igual salvo lo que escribe la recepción, y las tarifas
    // de la empresa no se tocan.
    expect(await filaSinLoDeLaRecepcion(conDistrito)).toBe(filaAntes);
    expect(await tarifasDeLaEmpresa()).toBe(tarifasAntes);
  });

  test("R1704/R1723: la devolución que vuelve a la central se recibe y conserva su zona", async ({ browser }) => {
    const filaAntes = await filaSinLoDeLaRecepcion(enDevolucion);

    const page = await paginaDe(browser, r.empresa.maestro);
    const lectura = await recibirConPistola(page, enDevolucion);
    await expect(lectura.getByText("Recibida", { exact: true })).toBeVisible();
    await expect(lectura.getByText("Queda por devolver a la tienda.")).toBeVisible();

    await expect.poll(() => estadoDe(enDevolucion)).toBe("por_devolver_a_tienda");
    expect(await zonaDe(enDevolucion)).toBe(r.zonaSatelite.id);
    expect(await accionesDeZona(enDevolucion)).toEqual([]);
    expect(await filaSinLoDeLaRecepcion(enDevolucion)).toBe(filaAntes);
  });

  test("R1702: la orden con cantón y sin distrito se recibe y conserva su zona (comportamiento conocido, abierto)", async ({ browser }) => {
    // COMPORTAMIENTO CONOCIDO ABIERTO PARA REVISIÓN (ver la cabecera): sin distrito, la recepción no
    // re-deriva la zona aunque el lugar de la orden (su cantón) exista en el catálogo de SLT-65.
    const page = await paginaDe(browser, r.empresa.maestro);
    const lectura = await recibirConPistola(page, sinDistrito);
    await expect(lectura.getByText("Recibida", { exact: true })).toBeVisible();

    await expect.poll(() => estadoDe(sinDistrito)).toBe("en_bodega_central");
    expect(await zonaDe(sinDistrito)).toBe(r.zonaSatelite.id);
    expect(await accionesDeZona(sinDistrito)).toEqual([]);
  });
});
