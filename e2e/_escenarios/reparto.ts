import fs from "node:fs";
import path from "node:path";

import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import {
  escenarioReparto,
  type DestinoReparto,
  type Geo,
  type GestionEscenario,
  type MensajeroEscenario,
  type OpcionesReparto,
  type OrdenEscenario,
  type EscenarioReparto,
  type TarifaTienda,
  type ZonaReparto,
} from "../../tests/fabricas/escenarios/reparto";
import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E, sesionDe, type UsuarioE2E } from "../../tests/fabricas/e2e";

import { drenarGeocodificacion } from "./crons";

/**
 * SL-44 T3.2 (design D4; R7, R8) — EL ESCENARIO DE REPARTO. Lleva órdenes de una empresa recién
 * creada por el camino de la app, servicio a servicio, hasta el punto que el spec necesita. Nada se
 * escribe a mano: cada estado lo produce el servicio que lo produce en la app, montado como lo monta
 * su Server Action (`lib/actions/*`), dentro de `conEmpresa` y con el actor que la sesión le daría.
 *
 * ── API ──────────────────────────────────────────────────────────────────────────────────────────
 *
 *   crearEscenarioReparto(etiqueta, opts?) → RepartoE2E
 *     Empresa nueva (`crearEmpresaE2E`) con su maestro; zona CENTRAL y zona SATÉLITE
 *     (`ZonaService.crear`, un distrito propio cada una, tarifa de pago al mensajero por defecto
 *     `opts.tarifaMensajero`, por defecto 1500 entregada / 164 rechazada); SINPE de las dos
 *     confirmado (`SinpeBodegaService.confirmar`: sin él la pantalla abre «Confirmá el SINPE»);
 *     una tienda CON bodega propia (`fulfillment`: sus órdenes nacen en `en_preparacion`); su
 *     tarifa (`TarifaService.crear`, `opts.tarifa`); y el `adminSatelite` de la satélite.
 *
 *   crearMensajero(r, "central" | "satelite") → MensajeroE2E
 *     Un mensajero de esa zona (con el vehículo por defecto del catálogo).
 *
 *   crearOrden(r, { zona, montoCobrar?, destinatario?, numRemision? }) → OrdenE2E
 *     Una orden de la tienda por la carga masiva (`BulkOrdenService.cargarMasiva`), en el distrito de
 *     la zona pedida. Nace `en_preparacion`, sin guía. Siempre lleva dirección (la geocodificación
 *     se encola: ver `drenarGeocodificacion`).
 *
 *   llevarA(r, orden, destino, { mensajero? }) → OrdenE2E (con `numGuia`)
 *     Avanza la orden desde su estado ACTUAL hasta `destino`, paso a paso:
 *       en_preparacion --generarGuia (maestro)--> en_bodega_central
 *       · satélite: --rutearABodegaSatelite (maestro)--> en_ruta_bodega_satelite
 *                   --recibir (adminSatelite)--> en_bodega_satelite
 *                   --asignar (adminSatelite)--> mensajero_recogiendo_en_bodega
 *       · central:  --asignarDesdeBodega (maestro)--> mensajero_recogiendo_en_bodega
 *       --recogerAsignaciones (mensajero)--> en_reparto
 *     Las dos asignaciones necesitan `mensajero` (de la zona de la orden) y antes drenan la
 *     geocodificación de la orden con el cron real. Sirve también para una orden que VOLVIÓ a la
 *     bodega (reprogramada liberada): sigue desde `en_bodega_satelite` / `en_bodega_central`.
 *
 *   gestionar(r, orden, mensajero, gestion) → gestionId
 *     `escogerParaGestion` + `gestionar` del portal del mensajero (`MisAsignacionesService`), con
 *     la evidencia `e2e/fixtures/evidencia.jpg` subida al doble de Storage (D2). `gestion`:
 *       { resultado: "entregado", pagos?: [{ metodo, monto }] }   // sin pagos: una línea en efectivo por el monto
 *       { resultado: "devolucion_a_origen_por_rechazo", motivo? }
 *       { resultado: "reprogramado", fecha?: "YYYY-MM-DD", motivo? } // por defecto, mañana en la zona de la app
 *       { resultado: "novedad", causa?, motivo? }
 *     La orden NO cambia de estado (ficha 454): queda `en_reparto` con la gestión pendiente hasta
 *     que se APRUEBA el cierre (`./cierres.ts`).
 *
 *   corregirFechaReprogramacion(r, orden, fecha = hoyDeLaApp()) → void
 *     El maestro corrige la fecha de una reprogramada (`CorreccionFechaReprogramacionService`), con
 *     el liberador POR DEFECTO del servicio (no-op): la orden queda `reprogramado` con la fecha ya
 *     llegada y la libera el cron `liberar-reprogramadas`, que es lo que pasa en la app cuando el
 *     día llega solo. La Server Action inyecta el liberador real y la soltaría en el acto; aquí no
 *     se inyecta porque el estado que se quiere es «vencida, esperando al cron».
 *
 *   estadoDe(orden) → value del estado; gestionesDe(orden) → gestiones de la orden; hoyDeLaApp(), mananaDeLaApp().
 *
 *   paginaDe(browser, usuario, opcionesDeContexto?) → Page
 *     Un contexto nuevo con la sesión de `usuario` (`sesionDe`: `/login` real, sin OTP). Las
 *     opciones son las de `browser.newContext` (p. ej. la geolocalización del mensajero).
 *
 * Para llevar una orden hasta GESTIONADA (lo que piden los specs de dinero):
 *   const o = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 8000 }), "en_reparto", { mensajero: m });
 *   await gestionar(r, o, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 8000 }] });
 *   // rechazada con evidencia: { resultado: "devolucion_a_origen_por_rechazo" }; reprogramada: { resultado: "reprogramado" }
 *   const cierreId = await solicitarCierre(r, m);  // ./cierres.ts
 *   await aprobarCierre(r, cierreId);              // ./cierres.ts (adminSatelite o maestro según la zona)
 *
 * Cada mensajero solo puede tener abiertas las órdenes de su escenario: crea un mensajero por
 * caso cuando el spec cuente cosas del portal del mensajero.
 */

// ── Storage: el doble de D2 ─────────────────────────────────────────────────────────────────────
// La app habla con el doble por `SUPABASE_URL` (webServer.env). El worker tiene que hablar con el
// MISMO, o la evidencia que sube la fixture no existiría para la app. Se PISA (no `||=`): un `.env`
// local con el Supabase real no debe recibir fotos de prueba.
process.env.SUPABASE_URL = `http://127.0.0.1:${Number(process.env.E2E_STORAGE_PUERTO || 54329)}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-falsa-e2e";

// SL-43 T5: el núcleo vive en `tests/fabricas/escenarios/reparto.ts`, que comparte con la demo de
// QA. Aquí se monta con lo del E2E: el lector `abrirBaseE2E` (solo base local), la evidencia de la
// fixture, el cron real de geocodificación como `prepararAsignacion` y las altas con correos
// aleatorios. El doble de Storage se pisa aquí y solo aquí.

const EVIDENCIA = path.join(__dirname, "..", "fixtures", "evidencia.jpg");

export type { DestinoReparto, OpcionesReparto, ZonaTipo } from "../../tests/fabricas/escenarios/reparto";
export type GeoE2E = Geo;
export type ZonaRepartoE2E = ZonaReparto;
export type MensajeroE2E = MensajeroEscenario;
export type RepartoE2E = EscenarioReparto;
export type OrdenE2E = OrdenEscenario;
export type TarifaTiendaE2E = TarifaTienda;
export type GestionE2E = GestionEscenario;

let duenoCompartido: PrismaClient | undefined;
/** Cliente dueño (sin empresa), SOLO para leer lo que los servicios dejaron. */
export function baseReparto(): PrismaClient {
  return (duenoCompartido ??= abrirBaseE2E());
}

let evidenciaBytes: Uint8Array | undefined;

const nucleo = escenarioReparto({
  lector: baseReparto,
  evidencia: () => (evidenciaBytes ??= new Uint8Array(fs.readFileSync(EVIDENCIA))),
  prepararAsignacion: (ordenIds) => drenarGeocodificacion(ordenIds),
  altas: {
    empresa: crearEmpresaE2E,
    // El perfil no cuenta en el E2E: el correo es aleatorio.
    usuario: (empresa, _perfil, rol, extra) => crearUsuarioE2E(empresa, rol, extra),
  },
});

export { corregirFechaReprogramacion, hoyDeLaApp, mananaDeLaApp } from "../../tests/fabricas/escenarios/reparto";

export function crearEscenarioReparto(etiqueta: string, opts: OpcionesReparto = {}): Promise<RepartoE2E> {
  return nucleo.crearEscenarioReparto(etiqueta, opts);
}

export function crearMensajero(r: RepartoE2E, zona: "central" | "satelite"): Promise<MensajeroE2E> {
  return nucleo.crearMensajero(r, zona);
}

export function crearOrden(
  r: RepartoE2E,
  o: { zona: "central" | "satelite"; montoCobrar?: number; destinatario?: string; numRemision?: string },
): Promise<OrdenE2E> {
  return nucleo.crearOrden(r, o);
}

export const estadoDe = nucleo.estadoDe;
export const gestionesDe = nucleo.gestionesDe;

export function llevarA(
  r: RepartoE2E,
  orden: OrdenE2E,
  destino: DestinoReparto,
  opts: { mensajero?: MensajeroE2E } = {},
): Promise<OrdenE2E> {
  return nucleo.llevarA(r, orden, destino, opts);
}

export function gestionar(r: RepartoE2E, orden: OrdenE2E, m: MensajeroE2E, g: GestionE2E): Promise<string> {
  return nucleo.gestionar(r, orden, m, g);
}

export async function paginaDe(browser: Browser, u: UsuarioE2E, opts: BrowserContextOptions = {}): Promise<Page> {
  const cookies = await sesionDe(browser, u);
  const ctx = await browser.newContext(opts);
  await ctx.addCookies(cookies);
  return ctx.newPage();
}
