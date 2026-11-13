import type { Browser, Locator, Page } from "@playwright/test";

import { conEmpresa } from "../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../lib/db/prisma-client";
import type { Actor } from "../../lib/interfaces/services/IOrdenService";
import { CierreBodegaRepository } from "../../lib/repositories/CierreBodegaRepository";
import { OrdenRepository } from "../../lib/repositories/OrdenRepository";
import { CierreBodegaService } from "../../lib/services/CierreBodegaService";
import { construirReglasPaisEmpresa } from "../../lib/services/ReglasPaisEmpresaService";
import {
  cierresAdmin,
  escenarioCierres,
  solicitarCierre as solicitarCierreNucleo,
} from "../../tests/fabricas/escenarios/cierres";
import { fijarEmpresa } from "../../tests/fabricas/organizaciones";

import { abrirTarifas, activarConFaltantes, digitarYGuardar, irAZona, type Digitado } from "../_tarifas-activacion-fixture";

import {
  baseReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./reparto";

/**
 * SL-44 T3.2 (design D4; R8) — EL CIERRE DEL DÍA, lo mínimo que el grupo `reparto` necesita para
 * que una gestión llegue a su estado: la gestión deja la orden `en_reparto` y es la APROBACIÓN del
 * cierre la que la mueve (ficha 454). Los servicios, montados como en `lib/actions/cierre-dia.ts` y
 * `lib/actions/cierres-admin.ts`, con sus notificadores reales y la liberación al aprobar.
 *
 * ── API ──────────────────────────────────────────────────────────────────────────────────────────
 *
 *   solicitarCierre(r, mensajero) → cierreId
 *     `CierreDiaService.solicitarCierre` con el actor del mensajero. Exige un cierre NUEVO.
 *
 *   aprobarCierre(r, cierreId, { quien? }) → void
 *     `CierresAdminService.aprobarCierre`. Aprueba quien tiene el cierre en su alcance: el
 *     `adminSatelite` para un mensajero de la satélite, el maestro para uno de la central (o
 *     `quien` explícito). La confirmación física es la que haría la bodega escaneando cada paquete
 *     que vuelve: las gestiones del cierre cuyo resultado retorna (`RESULTADOS_QUE_VUELVEN`), con su
 *     guía.
 *
 * El grupo `dinero` amplía este archivo: ver «Ampliación del grupo `dinero`» al final.
 */

// SL-43 T5: el núcleo vive en `tests/fabricas/escenarios/cierres.ts`, que comparte con la demo de
// QA. Aquí se monta con el lector del E2E (`baseReparto`). Importar `./reparto` deja puesto el
// doble de Storage antes de que nada hable con él.
const nucleo = escenarioCierres({ lector: baseReparto });

export function solicitarCierre(r: RepartoE2E, m: MensajeroE2E): Promise<string> {
  return solicitarCierreNucleo(r, m);
}

export function aprobarCierre(r: RepartoE2E, cierreId: string, opts: { quien?: Actor } = {}): Promise<void> {
  return nucleo.aprobarCierre(r, cierreId, opts);
}

// ── Ampliación del grupo `dinero` (SL-44 T6.1/T6.2) ─────────────────────────────────────────────
//
//   rechazarCierre(r, cierreId, motivo, { quien? }) → void
//     `CierresAdminService.rechazarCierre`, con el mismo reparto de quién decide que `aprobarCierre`.
//
//   cierresDe(m) → los cierres del día del mensajero (id, estado, destino y totales), del más viejo
//     al más nuevo. Solo LEE lo que dejaron los servicios y los crons.
//
//   anclarDevolucionHaceDias(r, orden, dias) → void
//     ⚠️ EXCEPCIÓN DE R8 (design D4). Mueve al pasado la fila `anclaje_devolucion` del historial de
//     una orden en `novedad` (la que escribe la APROBACIÓN del cierre: el instante en que empieza a
//     correr el plazo del SLA). Motivo: sin reloj falso, el cron `procesar-devueltas-sla` no ve
//     vencida una devolución `wrong_*` hasta 5 días después, y ningún servicio fija ese instante. La
//     vía corta del tope de intentos tampoco sirve: con el tope la gestión `novedad` ya no se admite
//     (feature 276). Solo se toca la FECHA de esa fila, con la empresa fijada; el estado, la gestión
//     y el escalado los producen el servicio y el cron reales.
//
//   importe(n, { solo? }) → RegExp tolerante al símbolo y a los separadores (salen de
//     `lib/config/moneda.ts`); con `solo`, anclada a todo el texto del elemento.

export function rechazarCierre(
  r: RepartoE2E,
  cierreId: string,
  motivo: string,
  opts: { quien?: Actor } = {},
): Promise<void> {
  return nucleo.rechazarCierre(r, cierreId, motivo, opts);
}

export async function cierresDe(m: { id: string }) {
  return baseReparto().cierreDia.findMany({
    where: { mensajeroId: m.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      estado: true,
      destinoTipo: true,
      motivoRechazo: true,
      totalEfectivo: true,
      totalSimpe: true,
      totalTransferencia: true,
      totalGeneral: true,
      totalPagoMensajero: true,
      totalIngresoBodegaRechazos: true,
    },
  });
}

const DIA_MS = 24 * 60 * 60 * 1000;

export async function anclarDevolucionHaceDias(r: RepartoE2E, orden: { id: string }, dias: number): Promise<void> {
  const db = baseReparto();
  const n = await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, r.empresa.organizacionId);
    const res = await tx.ordenHistorialEstado.updateMany({
      where: { ordenId: orden.id, origenTipo: "anclaje_devolucion" },
      data: { createdAt: new Date(Date.now() - dias * DIA_MS) },
    });
    return res.count;
  });
  if (n !== 1) throw new Error(`SL-44 E2E cierres: la orden debía tener UN anclaje de devolución y tiene ${n}.`);
}

export function importe(n: number, opts: { solo?: boolean } = {}): RegExp {
  const miles = Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u0000").split("\u0000");
  const cifra = `${miles.join("[.\\s\\u00a0\\u202f]?")}(?:,\\d{2})?`;
  // `solo`: el texto ENTERO del elemento es el importe (con su símbolo). Sirve donde el importe va
  // pegado a otros números en el texto del contenedor (p. ej. «₡9.0001-1 de 1» de la paginación).
  return opts.solo ? new RegExp(`^\\s*[^\\d\\s]{0,3}\\s?${cifra}\\s*$`) : new RegExp(`(?<![\\d.,])${cifra}(?!\\d)`);
}

// ── Cola única de cierres de mensajeros (SLT-102 T6.1) ──────────────────────────────────────────
//
//   filaDeCola(region, nombre) → Locator
//     La FILA de la cola (`ColaCierres`) del cierre de ese mensajero, dentro de la región de la
//     pestaña: «Pendientes de decisión» o «Histórico». Antes era el comprobante
//     (`region` «Comprobante del cierre de <m>»); la cola pinta una tabla con una fila por cierre.
//
//   pestanaDeCola(page, "Pendientes" | "Resueltos") → Locator
//     La pestaña (`tab`) del `tablist` «Cierres del día por estado». Su nombre lleva el conteo
//     («Resueltos 12»), así que se busca por el comienzo.
//
//   pestanaDeColaBodega(page, "Por conciliar" | "Conciliados") → Locator
//   regionColaBodega(page, "Por conciliar" | "Conciliados") → Locator
//     SLT-127: lo mismo para la cola de bodega de la central (`tablist` «Cierres de bodega por
//     estado»; regiones «Cierres de bodega por conciliar» / «… conciliados»). La fila, con filaDeCola.
//
//   ajustarPagoMensajero(r, gestionId, { anterior, nuevo, motivo }) → void
//     `CierresAdminService.ajustarPagoMensajeroGestion` con el maestro, sobre un cierre abierto
//     (SLT-56). Es lo que hace el diálogo «Ajustar pago» del detalle; aquí siembra la señal
//     «pago ajustado» de la cola.

export function filaDeCola(region: Locator, nombre: string): Locator {
  return region.getByRole("row").filter({ hasText: nombre });
}

export function pestanaDeCola(page: Page, nombre: "Pendientes" | "Resueltos"): Locator {
  return page
    .getByRole("tablist", { name: "Cierres del día por estado" })
    .getByRole("tab", { name: new RegExp(`^${nombre} \\d+$`) });
}

/** SLT-127: la pestaña de la cola de bodega de la central («Por conciliar 3», «Conciliados 21»). */
export function pestanaDeColaBodega(page: Page, nombre: "Por conciliar" | "Conciliados"): Locator {
  return page
    .getByRole("tablist", { name: "Cierres de bodega por estado" })
    .getByRole("tab", { name: new RegExp(`^${nombre} \\d+$`) });
}

/** SLT-127: la región (y la tabla) de la pestaña activa de la cola de bodega. */
export function regionColaBodega(page: Page, nombre: "Por conciliar" | "Conciliados"): Locator {
  return page.getByRole("region", {
    name: nombre === "Por conciliar" ? "Cierres de bodega por conciliar" : "Cierres de bodega conciliados",
  });
}

export async function ajustarPagoMensajero(
  r: RepartoE2E,
  gestionId: string,
  a: { anterior: string; nuevo: string; motivo: string },
): Promise<void> {
  const res = await conEmpresa(r.empresa.organizacionId, () =>
    cierresAdmin().ajustarPagoMensajeroGestion(
      { gestionId, pagoAnterior: a.anterior, pagoNuevo: a.nuevo, motivo: a.motivo },
      r.actores.maestro,
    ),
  );
  if (res.status !== "ok") throw new Error(`SLT-102 E2E: ajustarPagoMensajero no fue ok: ${JSON.stringify(res)}`);
}

// ── Cierre de bodega (SLT-104 T6.1) ─────────────────────────────────────────────────
//
//   solicitarCierreBodega(r, { quien? }) → cierreBodegaId
//     `CierreBodegaService.solicitarCierreBodega` con el `adminSatelite` (o `quien`), montado como en
//     `lib/actions/cierre-bodega.ts`. Consolida los cierres del día APROBADOS de su zona. Es lo que hace
//     el botón «Solicitar cierre de bodega»; aquí evita repetir sus clics donde lo que se prueba es lo
//     que ve la central después (el paso 1 de `cierre-bodega-satelite` sigue recorriendo la pantalla).
//
//   montoDeCuenta(detalle, cuenta, rotulo) → Locator
//     El importe (`data-monto`) de la línea de una cuenta del detalle único (`Cuenta`), por el título de
//     la cuenta y el rótulo EXACTO que se lee, con su operador («− Recibido»).
//
//   filaDeMensajeros(detalle, nombre) → Locator
//     La fila de ese mensajero en la tabla «Mensajeros del cierre de bodega» (pestaña «Mensajeros»).
//     Sus celdas, en orden: Mensajero · Gestiones · Recaudado · Pago · A la central · Señales · enlace.

export function montoDeCuenta(detalle: Locator, cuenta: string, rotulo: string): Locator {
  const exacto = new RegExp(`^${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return detalle
    .getByRole("region", { name: cuenta, exact: true })
    .locator("[data-signo]")
    .filter({ has: detalle.page().locator("[data-rotulo]", { hasText: exacto }) })
    .locator("[data-monto]");
}

export function filaDeMensajeros(detalle: Locator, nombre: string): Locator {
  return detalle
    .getByRole("table", { name: "Mensajeros del cierre de bodega" })
    .getByRole("row")
    .filter({ has: detalle.page().getByRole("cell", { name: nombre, exact: true }) });
}

export async function solicitarCierreBodega(r: RepartoE2E, opts: { quien?: Actor } = {}): Promise<string> {
  const quien = opts.quien ?? r.actores.adminSatelite;
  const prisma = getPrismaClient();
  const res = await conEmpresa(r.empresa.organizacionId, () =>
    new CierreBodegaService(
      new CierreBodegaRepository(prisma),
      new OrdenRepository(prisma),
      construirReglasPaisEmpresa(prisma),
    ).solicitarCierreBodega(quien),
  );
  if (res.status !== "ok") throw new Error(`SLT-104 E2E: solicitarCierreBodega no fue ok: ${JSON.stringify(res)}`);
  return res.cierreBodegaId;
}

// ── Un cierre del modelo nuevo (SLT-140 T5.1) ───────────────────────────────────────────────────
//
//   cierreModeloNuevo(browser, r, { cobro, pago, montoCobrar }) → { m, orden, cierreId }
//     Activa POR LA PANTALLA de Tarifas, como el maestro, el cobro a la tienda y el pago al mensajero
//     digitados en la zona central (`_tarifas-activacion-fixture`); después un mensajero NUEVO de la
//     central entrega UNA orden cobrada entera en efectivo y solicita su cierre, que queda congelado
//     con el modelo nuevo. Los cierres solicitados ANTES de llamarlo siguen siendo del modelo viejo.

export async function cierreModeloNuevo(
  browser: Browser,
  r: RepartoE2E,
  a: { cobro: readonly Digitado[]; pago: readonly Digitado[]; montoCobrar: number },
): Promise<{ m: MensajeroE2E; orden: OrdenE2E; cierreId: string }> {
  const page = await paginaDe(browser, r.empresa.maestro);
  await abrirTarifas(page);
  await irAZona(page, r.zonaCentral.nombre);
  await digitarYGuardar(page, "Cobro a la tienda", a.cobro);
  await digitarYGuardar(page, "Pago al mensajero", a.pago);
  await activarConFaltantes(page);
  await page.context().close();

  const m = await crearMensajero(r, "central");
  const orden = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: a.montoCobrar }), "en_reparto", {
    mensajero: m,
  });
  await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: a.montoCobrar }] });
  return { m, orden, cierreId: await solicitarCierre(r, m) };
}
