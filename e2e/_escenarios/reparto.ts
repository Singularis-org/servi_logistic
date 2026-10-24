import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../lib/db/prisma-client";
import { gestionConfig } from "../../lib/config/gestion";
import type { Actor } from "../../lib/interfaces/services/IOrdenService";
import type { EvidenciaArchivo, GestionarInput } from "../../lib/interfaces/services/IMisAsignacionesService";
import { CorreccionFechaReprogramacionRepository } from "../../lib/repositories/CorreccionFechaReprogramacionRepository";
import { GestionOrdenRepository } from "../../lib/repositories/GestionOrdenRepository";
import { JobRepository } from "../../lib/repositories/JobRepository";
import { OrdenDiaRepartoCambioRepository } from "../../lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "../../lib/repositories/OrdenHistorialRepository";
import { OrdenMensajeroMetaRepository } from "../../lib/repositories/OrdenMensajeroMetaRepository";
import { OrdenRepository } from "../../lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "../../lib/repositories/OrdenTraspasoRepository";
import { RutaOptimizadaRepository } from "../../lib/repositories/RutaOptimizadaRepository";
import { TarifaRepository } from "../../lib/repositories/TarifaRepository";
import { TarifaVigenteRepository } from "../../lib/repositories/TarifaVigenteRepository";
import { ZonaRepository } from "../../lib/repositories/ZonaRepository";
import { AsignabilidadCoordenadasService } from "../../lib/services/AsignabilidadCoordenadasService";
import { AsignacionSateliteService } from "../../lib/services/AsignacionSateliteService";
import { BulkOrdenService } from "../../lib/services/BulkOrdenService";
import { CorreccionFechaReprogramacionService } from "../../lib/services/CorreccionFechaReprogramacionService";
import { GuiaAsignacionService } from "../../lib/services/GuiaAsignacionService";
import { MisAsignacionesService } from "../../lib/services/MisAsignacionesService";
import { OrdenHistorialService } from "../../lib/services/OrdenHistorialService";
import { RecepcionSateliteService } from "../../lib/services/RecepcionSateliteService";
import { SinpeBodegaService } from "../../lib/services/SinpeBodegaService";
import { TarifaService } from "../../lib/services/TarifaService";
import { ZonaService } from "../../lib/services/ZonaService";
import { SupabaseFileStorage } from "../../lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider } from "../../lib/storage/SupabaseSignedUrlProvider";
import { crearTarifaSchema } from "../../lib/types/tarifa";
import { crearZonaSchema } from "../../lib/types/zona";
import {
  abrirBaseE2E,
  crearEmpresaE2E,
  crearUsuarioE2E,
  sesionDe,
  type EmpresaE2E,
  type UsuarioE2E,
} from "../../tests/fabricas/e2e";

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
 *       { resultado: "reprogramado", fecha?: "YYYY-MM-DD", motivo? } // por defecto, mañana en CR
 *       { resultado: "novedad", causa?, motivo? }
 *     La orden NO cambia de estado (ficha 454): queda `en_reparto` con la gestión pendiente hasta
 *     que se APRUEBA el cierre (`./cierres.ts`).
 *
 *   corregirFechaReprogramacion(r, orden, fecha = hoyCR()) → void
 *     El maestro corrige la fecha de una reprogramada (`CorreccionFechaReprogramacionService`), con
 *     el liberador POR DEFECTO del servicio (no-op): la orden queda `reprogramado` con la fecha ya
 *     llegada y la libera el cron `liberar-reprogramadas`, que es lo que pasa en la app cuando el
 *     día llega solo. La Server Action inyecta el liberador real y la soltaría en el acto; aquí no
 *     se inyecta porque el estado que se quiere es «vencida, esperando al cron».
 *
 *   estadoDe(orden) → value del estado; gestionesDe(orden) → gestiones de la orden; hoyCR(), mananaCR().
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

const EVIDENCIA = path.join(__dirname, "..", "fixtures", "evidencia.jpg");

export type ZonaTipo = "central" | "satelite";

export interface GeoE2E {
  distritoId: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface ZonaRepartoE2E {
  id: string;
  nombre: string;
  geo: GeoE2E;
}

export interface MensajeroE2E extends UsuarioE2E {
  zona: ZonaTipo;
  zonaId: string;
  actor: Actor;
}

export interface RepartoE2E {
  empresa: EmpresaE2E;
  /** La tienda (adminTienda con bodega propia): dueña de las órdenes. */
  tienda: UsuarioE2E;
  adminSatelite: UsuarioE2E;
  zonaCentral: ZonaRepartoE2E;
  zonaSatelite: ZonaRepartoE2E;
  actores: { maestro: Actor; tienda: Actor; adminSatelite: Actor };
}

export interface OrdenE2E {
  id: string;
  numRemision: string;
  destinatario: string;
  montoCobrar: number;
  zona: ZonaTipo;
  /** `null` hasta que `generarGuia` la numera (`llevarA`). */
  numGuia: number | null;
}

export interface TarifaTiendaE2E {
  valorFlete: number;
  valorFleteDevuelto: number;
  valorFleteGam: number;
  valorFleteDevueltoGam: number;
  comisionCod: number;
  ivaFlete: number;
  ivaComisionCod: number;
}

export interface OpcionesReparto {
  /** Tarifa de la tienda (flete). Por defecto, valores redondos sin IVA ni comisión. */
  tarifa?: Partial<TarifaTiendaE2E>;
  /** Pago al mensajero por zona (las dos zonas). */
  tarifaMensajero?: { cobroEntregado: number; cobroRechazado: number };
}

const TARIFA_POR_DEFECTO: TarifaTiendaE2E = {
  valorFlete: 2500,
  valorFleteDevuelto: 1250,
  valorFleteGam: 2000,
  valorFleteDevueltoGam: 1000,
  comisionCod: 0,
  ivaFlete: 0,
  ivaComisionCod: 0,
};

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

let duenoCompartido: PrismaClient | undefined;
/** Cliente dueño (sin empresa), SOLO para leer lo que los servicios dejaron. */
export function baseReparto(): PrismaClient {
  return (duenoCompartido ??= abrirBaseE2E());
}

function actorDe(e: EmpresaE2E, u: { id: string }, rol: Actor["rol"], zonaId: string | null): Actor {
  return { usuarioId: u.id, rol, zonaId, organizacionId: e.organizacionId };
}

function exigirOk<T extends { status: string }>(paso: string, r: T, validos: string[] = ["ok"]): T {
  if (!validos.includes(r.status)) {
    throw new Error(`SL-44 E2E reparto: «${paso}» no fue ok: ${JSON.stringify(r)}`);
  }
  return r;
}

// ── Fechas de Costa Rica (UTC-6 fijo, sin horario de verano) ────────────────────────────────────
function fechaCR(diasDesdeHoy: number): string {
  const cr = new Date(Date.now() - 6 * 60 * 60 * 1000);
  cr.setUTCDate(cr.getUTCDate() + diasDesdeHoy);
  return cr.toISOString().slice(0, 10);
}
export const hoyCR = (): string => fechaCR(0);
export const mananaCR = (): string => fechaCR(1);

// ── Servicios, montados como en su Server Action ────────────────────────────────────────────────
function historial(prisma: PrismaClient, ordenRepo: OrdenRepository): OrdenHistorialService {
  return new OrdenHistorialService(
    ordenRepo,
    new OrdenHistorialRepository(prisma),
    new OrdenDiaRepartoCambioRepository(prisma),
    new OrdenTraspasoRepository(prisma),
  );
}

function servicios() {
  const prisma = getPrismaClient();
  const ordenRepo = new OrdenRepository(prisma);
  return {
    zona: new ZonaService(new ZonaRepository(prisma)), // lib/actions/zonas.ts
    tarifa: new TarifaService(new TarifaRepository(prisma)), // lib/actions/tarifas.ts
    sinpe: new SinpeBodegaService(new ZonaRepository(prisma)), // lib/actions/sinpe-bodega.ts
    // app/api/ordenes/carga-masiva/chunk/route.ts
    carga: new BulkOrdenService(ordenRepo, new TarifaVigenteRepository(prisma)),
    // lib/actions/ordenes-guia.ts
    guia: new GuiaAsignacionService(
      ordenRepo,
      new ZonaRepository(prisma),
      new AsignabilidadCoordenadasService(new JobRepository(prisma)),
      historial(prisma, ordenRepo),
    ),
    // lib/actions/recepcion-satelite.ts
    recepcion: new RecepcionSateliteService(ordenRepo, historial(prisma, ordenRepo)),
    asignacion: new AsignacionSateliteService(
      ordenRepo,
      new AsignabilidadCoordenadasService(new JobRepository(prisma)),
      historial(prisma, ordenRepo),
    ),
    // lib/actions/mis-asignaciones.ts, con la evidencia contra el doble de Storage (D2)
    misAsignaciones: new MisAsignacionesService(
      new GestionOrdenRepository(prisma),
      ordenRepo,
      new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
      new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
      new RutaOptimizadaRepository(prisma),
      new OrdenMensajeroMetaRepository(prisma),
      historial(prisma, ordenRepo),
    ),
    // lib/actions/corregir-fecha-reprogramacion.ts, SIN su liberador (ver la cabecera)
    correccionFecha: new CorreccionFechaReprogramacionService(
      new CorreccionFechaReprogramacionRepository(prisma),
      ordenRepo,
    ),
  };
}

// ── Escenario ───────────────────────────────────────────────────────────────────────────────────

/** Dos distritos del catálogo, de cantones distintos, nombrables en la plantilla de carga. */
async function dosDistritos(db: PrismaClient): Promise<[GeoE2E, GeoE2E]> {
  const filas = await db.distrito.findMany({
    where: {
      activo: true,
      NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
      canton: { activo: true, provincia: { activo: true } },
    },
    select: { id: true, nombre: true, cantonId: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
    orderBy: { id: "asc" },
    take: 50,
  });
  const elegidos: typeof filas = [];
  for (const f of filas) {
    if (elegidos.every((e) => e.cantonId !== f.cantonId)) elegidos.push(f);
    if (elegidos.length === 2) break;
  }
  if (elegidos.length < 2) throw new Error("SL-44 E2E reparto: el catálogo no tiene dos distritos de cantones distintos (¿base sin migrar?).");
  const geo = (f: (typeof filas)[number]): GeoE2E => ({
    distritoId: f.id,
    provincia: f.canton.provincia.nombre,
    canton: f.canton.nombre,
    distrito: f.nombre,
  });
  return [geo(elegidos[0]), geo(elegidos[1])];
}

/**
 * El SINPE de la bodega, obligatorio al crear la zona (ficha 429). En una constante y no como
 * literal en el objeto: `sinpe-en-toda-superficie.guardia` vigila que nadie arme a mano el bloque
 * `negocio` de WhatsApp con un `sinpeNumero: "…"`, y esto no es ese bloque.
 */
const SINPE_BODEGA = { numero: "80000000", nombre: "Titular E2E" } as const;

async function crearZona(
  e: EmpresaE2E,
  maestro: Actor,
  geo: GeoE2E,
  esCentral: boolean,
  tarifaMensajero: { cobroEntregado: number; cobroRechazado: number },
): Promise<ZonaRepartoE2E> {
  const nombre = `${esCentral ? "Central" : "Satelite"} E2E ${sufijo()}`;
  // El mismo esquema del borde que la action: pone los `default` que el servicio espera.
  const input = crearZonaSchema.parse({
    nombre,
    cobroVehiculo: false,
    distritoIds: [geo.distritoId],
    esCentral,
    tarifas: [tarifaMensajero],
    sinpeNumero: SINPE_BODEGA.numero,
    sinpeNombre: SINPE_BODEGA.nombre,
  });
  const s = servicios();
  const r = exigirOk("ZonaService.crear", await conEmpresa(e.organizacionId, () => s.zona.crear(input, maestro)));
  if (r.status !== "ok") throw new Error("inalcanzable");
  // FICHA 429: sin la revisión del SINPE, la pantalla del maestro y la del adminSatelite abren el
  // aviso «Confirmá el SINPE» encima de todo. Lo confirma el maestro, como en la app.
  exigirOk("SinpeBodegaService.confirmar", await conEmpresa(e.organizacionId, () => s.sinpe.confirmar(r.zona.id, maestro)));
  return { id: r.zona.id, nombre, geo };
}

export async function crearEscenarioReparto(etiqueta: string, opts: OpcionesReparto = {}): Promise<RepartoE2E> {
  const empresa = await crearEmpresaE2E(etiqueta);
  const maestro = actorDe(empresa, empresa.maestro, "maestro", null);
  const [geoCentral, geoSatelite] = await dosDistritos(baseReparto());
  const tarifaMensajero = opts.tarifaMensajero ?? { cobroEntregado: 1500, cobroRechazado: 164 };
  const zonaCentral = await crearZona(empresa, maestro, geoCentral, true, tarifaMensajero);
  const zonaSatelite = await crearZona(empresa, maestro, geoSatelite, false, tarifaMensajero);

  const tienda = await crearUsuarioE2E(empresa, "adminTienda", { fulfillment: true });
  const adminSatelite = await crearUsuarioE2E(empresa, "adminSatelite", { zonaId: zonaSatelite.id });

  const tarifa = crearTarifaSchema.parse({ tiendaId: tienda.id, ...TARIFA_POR_DEFECTO, ...opts.tarifa });
  const s = servicios();
  exigirOk("TarifaService.crear", await conEmpresa(empresa.organizacionId, () => s.tarifa.crear(tarifa, maestro)));

  return {
    empresa,
    tienda,
    adminSatelite,
    zonaCentral,
    zonaSatelite,
    actores: {
      maestro,
      tienda: actorDe(empresa, tienda, "adminTienda", null),
      adminSatelite: actorDe(empresa, adminSatelite, "adminSatelite", zonaSatelite.id),
    },
  };
}

export async function crearMensajero(r: RepartoE2E, zona: ZonaTipo): Promise<MensajeroE2E> {
  const zonaId = zona === "central" ? r.zonaCentral.id : r.zonaSatelite.id;
  const u = await crearUsuarioE2E(r.empresa, "mensajero", { zonaId });
  return { ...u, zona, zonaId, actor: actorDe(r.empresa, u, "mensajero", zonaId) };
}

export async function crearOrden(
  r: RepartoE2E,
  o: { zona: ZonaTipo; montoCobrar?: number; destinatario?: string; numRemision?: string },
): Promise<OrdenE2E> {
  const geo = o.zona === "central" ? r.zonaCentral.geo : r.zonaSatelite.geo;
  const numRemision = o.numRemision ?? `E2E-${sufijo()}`;
  const destinatario = o.destinatario ?? `Destinatario E2E ${sufijo()}`;
  const montoCobrar = o.montoCobrar ?? 0;
  const s = servicios();
  const res = await conEmpresa(r.empresa.organizacionId, () =>
    s.carga.cargarMasiva(
      [
        {
          num_remision: numRemision,
          destinatario,
          telefono: "88880000",
          producto: "Caja E2E",
          provincia: geo.provincia,
          canton_distrito: `${geo.canton} (${geo.distrito})`,
          // Con dirección: la carga encola su geocodificación, que es lo que la asignación mira.
          direccion: "100 m norte de la iglesia",
          notas: "",
          monto_cobrar: montoCobrar > 0 ? String(montoCobrar) : "",
        },
      ],
      r.actores.tienda,
    ),
  );
  if (res.status !== "ok" || res.summary.creadas !== 1) {
    throw new Error(`SL-44 E2E reparto: la carga no creó la orden: ${JSON.stringify(res)}`);
  }
  const fila = await baseReparto().orden.findFirst({
    where: { numRemision, organizacionId: r.empresa.organizacionId },
    select: { id: true, numGuia: true },
  });
  if (!fila) throw new Error("SL-44 E2E reparto: la orden cargada no aparece.");
  return { id: fila.id, numRemision, destinatario, montoCobrar, zona: o.zona, numGuia: fila.numGuia };
}

export async function estadoDe(orden: { id: string }): Promise<string> {
  const o = await baseReparto().orden.findUniqueOrThrow({
    where: { id: orden.id },
    select: { estatus: { select: { value: true } } },
  });
  return o.estatus.value;
}

export async function gestionesDe(orden: { id: string }) {
  return baseReparto().gestionOrden.findMany({
    where: { ordenId: orden.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, resultado: true, cierreId: true, anuladaAt: true, motivo: true, fechaReprogramacion: true },
  });
}

export type DestinoReparto =
  | "en_bodega_central"
  | "en_ruta_bodega_satelite"
  | "en_bodega_satelite"
  | "mensajero_recogiendo_en_bodega"
  | "en_reparto";

const CAMINO: Record<ZonaTipo, DestinoReparto[]> = {
  satelite: ["en_bodega_central", "en_ruta_bodega_satelite", "en_bodega_satelite", "mensajero_recogiendo_en_bodega", "en_reparto"],
  central: ["en_bodega_central", "mensajero_recogiendo_en_bodega", "en_reparto"],
};

export async function llevarA(
  r: RepartoE2E,
  orden: OrdenE2E,
  destino: DestinoReparto,
  opts: { mensajero?: MensajeroE2E } = {},
): Promise<OrdenE2E> {
  const camino = CAMINO[orden.zona];
  const meta = camino.indexOf(destino);
  if (meta < 0) throw new Error(`SL-44 E2E reparto: «${destino}» no está en el camino de una orden ${orden.zona}.`);
  const s = servicios();
  const org = r.empresa.organizacionId;
  const { maestro, adminSatelite } = r.actores;

  for (;;) {
    const actual = await estadoDe(orden);
    const pos = actual === "en_preparacion" ? -1 : camino.indexOf(actual as DestinoReparto);
    if (pos === meta) break;
    if (pos < -1 || pos > meta) {
      throw new Error(`SL-44 E2E reparto: la orden ${orden.numRemision} está en «${actual}», no se puede llevar a «${destino}».`);
    }
    const siguiente = camino[pos + 1];
    switch (siguiente) {
      case "en_bodega_central":
        exigirOk("generarGuia", await conEmpresa(org, () => s.guia.generarGuia({ ordenIds: [orden.id] }, maestro)));
        break;
      case "en_ruta_bodega_satelite":
        exigirOk("rutearABodegaSatelite", await conEmpresa(org, () => s.guia.rutearABodegaSatelite({ ordenIds: [orden.id] }, maestro)));
        break;
      case "en_bodega_satelite": {
        const numGuia = await guiaDe(orden);
        exigirOk("RecepcionSateliteService.recibir", await conEmpresa(org, () => s.recepcion.recibir(numGuia, adminSatelite)));
        break;
      }
      case "mensajero_recogiendo_en_bodega": {
        const m = exigirMensajero(orden, opts.mensajero);
        await drenarGeocodificacion([orden.id]);
        const res =
          orden.zona === "satelite"
            ? await conEmpresa(org, () => s.asignacion.asignar({ ordenIds: [orden.id], mensajeroId: m.id, dia: "hoy" }, adminSatelite))
            : await conEmpresa(org, () => s.guia.asignarDesdeBodega({ ordenIds: [orden.id], mensajeroId: m.id, dia: "hoy" }, maestro));
        exigirOk("asignar", res);
        break;
      }
      case "en_reparto": {
        const m = exigirMensajero(orden, opts.mensajero);
        exigirOk("recogerAsignaciones", await conEmpresa(org, () => s.misAsignaciones.recogerAsignaciones({ ordenIds: [orden.id] }, m.actor)));
        break;
      }
    }
  }
  return { ...orden, numGuia: await guiaDe(orden).catch(() => null) };
}

function exigirMensajero(orden: OrdenE2E, m: MensajeroE2E | undefined): MensajeroE2E {
  if (!m) throw new Error(`SL-44 E2E reparto: asignar la orden ${orden.numRemision} exige \`mensajero\`.`);
  if (m.zona !== orden.zona) throw new Error(`SL-44 E2E reparto: el mensajero es de la zona ${m.zona} y la orden de la ${orden.zona}.`);
  return m;
}

async function guiaDe(orden: { id: string; numRemision: string }): Promise<number> {
  const o = await baseReparto().orden.findUniqueOrThrow({ where: { id: orden.id }, select: { numGuia: true } });
  if (o.numGuia === null) throw new Error(`SL-44 E2E reparto: la orden ${orden.numRemision} no tiene guía.`);
  return o.numGuia;
}

let evidenciaBytes: Uint8Array | undefined;
function evidencia(): EvidenciaArchivo[] {
  evidenciaBytes ??= new Uint8Array(fs.readFileSync(EVIDENCIA));
  return [{ contentType: "image/jpeg", bytes: evidenciaBytes }];
}

export type GestionE2E =
  | { resultado: "entregado"; pagos?: { metodo: "efectivo" | "SINPE" | "transferencia"; monto: number }[] }
  | { resultado: "devolucion_a_origen_por_rechazo"; motivo?: string }
  | { resultado: "reprogramado"; fecha?: string; motivo?: string }
  | { resultado: "novedad"; causa?: "not_found" | "wrong_number" | "wrong_address"; motivo?: string };

function entradaGestion(orden: OrdenE2E, g: GestionE2E): GestionarInput {
  const base = { ordenId: orden.id, ubicacionAusencia: "no_disponible" as const };
  switch (g.resultado) {
    case "entregado": {
      const pagos = g.pagos ?? (orden.montoCobrar > 0 ? [{ metodo: "efectivo" as const, monto: orden.montoCobrar }] : []);
      return {
        ...base,
        resultado: "entregado",
        montoRecibido: orden.montoCobrar,
        metodoPago: pagos.length === 1 ? pagos[0].metodo : null,
        pagos,
        evidencias: evidencia(),
      };
    }
    case "devolucion_a_origen_por_rechazo":
      return { ...base, resultado: g.resultado, motivo: g.motivo ?? "No la quiere", evidencias: evidencia() };
    case "reprogramado":
      return { ...base, resultado: g.resultado, fechaReprogramacion: g.fecha ?? mananaCR(), motivo: g.motivo ?? "Cliente ausente" };
    case "novedad":
      return {
        ...base,
        resultado: g.resultado,
        causaDevolucion: g.causa ?? "not_found",
        motivo: g.motivo ?? "No aparece",
        evidencias: evidencia(),
      };
  }
}

export async function gestionar(r: RepartoE2E, orden: OrdenE2E, m: MensajeroE2E, g: GestionE2E): Promise<string> {
  const s = servicios();
  const org = r.empresa.organizacionId;
  exigirOk("escogerParaGestion", await conEmpresa(org, () => s.misAsignaciones.escogerParaGestion(orden.id, m.actor)));
  exigirOk(`gestionar(${g.resultado})`, await conEmpresa(org, () => s.misAsignaciones.gestionar(entradaGestion(orden, g), m.actor)));
  const ultima = await baseReparto().gestionOrden.findFirst({
    where: { ordenId: orden.id, anuladaAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ultima) throw new Error("SL-44 E2E reparto: gestionar fue ok y no dejó gestión.");
  return ultima.id;
}

export async function paginaDe(browser: Browser, u: UsuarioE2E, opts: BrowserContextOptions = {}): Promise<Page> {
  const cookies = await sesionDe(browser, u);
  const ctx = await browser.newContext(opts);
  await ctx.addCookies(cookies);
  return ctx.newPage();
}

export async function corregirFechaReprogramacion(r: RepartoE2E, orden: OrdenE2E, fecha: string = hoyCR()): Promise<void> {
  const s = servicios();
  exigirOk(
    "CorreccionFechaReprogramacionService.corregir",
    await conEmpresa(r.empresa.organizacionId, () =>
      s.correccionFecha.corregir({ ordenId: orden.id, fecha, motivo: "El cliente la pide antes" }, r.actores.maestro),
    ),
  );
}
