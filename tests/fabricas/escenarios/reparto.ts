import { randomUUID } from "node:crypto";

import type { PrismaClient, RolValue } from "@prisma/client";

import { conEmpresa } from "../../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../../lib/db/prisma-client";
import { gestionConfig } from "../../../lib/config/gestion";
import type { Actor } from "../../../lib/interfaces/services/IOrdenService";
import type { EvidenciaArchivo, GestionarInput } from "../../../lib/interfaces/services/IMisAsignacionesService";
import { CorreccionFechaReprogramacionRepository } from "../../../lib/repositories/CorreccionFechaReprogramacionRepository";
import { GestionOrdenRepository } from "../../../lib/repositories/GestionOrdenRepository";
import { JobRepository } from "../../../lib/repositories/JobRepository";
import { OrdenDiaRepartoCambioRepository } from "../../../lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "../../../lib/repositories/OrdenHistorialRepository";
import { OrdenMensajeroMetaRepository } from "../../../lib/repositories/OrdenMensajeroMetaRepository";
import { OrdenRepository } from "../../../lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "../../../lib/repositories/OrdenTraspasoRepository";
import { RutaOptimizadaRepository } from "../../../lib/repositories/RutaOptimizadaRepository";
import { TarifaRepository } from "../../../lib/repositories/TarifaRepository";
import { TarifaVigenteRepository } from "../../../lib/repositories/TarifaVigenteRepository";
import { ZonaRepository } from "../../../lib/repositories/ZonaRepository";
import { AsignabilidadCoordenadasService } from "../../../lib/services/AsignabilidadCoordenadasService";
import { AsignacionSateliteService } from "../../../lib/services/AsignacionSateliteService";
import { BulkOrdenService } from "../../../lib/services/BulkOrdenService";
import { CorreccionFechaReprogramacionService } from "../../../lib/services/CorreccionFechaReprogramacionService";
import { GuiaAsignacionService } from "../../../lib/services/GuiaAsignacionService";
import { MisAsignacionesService } from "../../../lib/services/MisAsignacionesService";
import { OrdenHistorialService } from "../../../lib/services/OrdenHistorialService";
import { RecepcionSateliteService } from "../../../lib/services/RecepcionSateliteService";
import { SinpeBodegaService } from "../../../lib/services/SinpeBodegaService";
import { TarifaService } from "../../../lib/services/TarifaService";
import { ZonaService } from "../../../lib/services/ZonaService";
import { SupabaseFileStorage } from "../../../lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider } from "../../../lib/storage/SupabaseSignedUrlProvider";
import { crearTarifaSchema } from "../../../lib/types/tarifa";
import { crearZonaSchema } from "../../../lib/types/zona";
import { fechaCalendarioCR, mananaCalendarioCR } from "../../../lib/utils/fecha-cr";
import type { EmpresaCreada, UsuarioCreado } from "../empresa-y-usuarios";

/**
 * SL-43 T5 (design D1.2; R11, R15–R17) — EL NÚCLEO DEL ESCENARIO DE REPARTO, sacado de
 * `e2e/_escenarios/reparto.ts` (SL-44) para que lo compartan el E2E y la demo de QA. Lleva órdenes
 * de una empresa por el camino de la app, servicio a servicio, montado como en su Server Action,
 * dentro de `conEmpresa` y con el actor que la sesión le daría. Nada se escribe a mano.
 *
 * No lee `process.env` ni importa Playwright. Lo que cambia entre el E2E y la demo entra por
 * `DepsEscenarioReparto` (`escenarioReparto(deps)`):
 *   - `lector()`: el cliente dueño, SOLO para leer lo que dejaron los servicios;
 *   - `evidencia()`: los bytes del JPEG que sube `gestionar`;
 *   - `prepararAsignacion(ordenIds)`: deja las órdenes asignables antes de asignarlas (el E2E
 *     drena la geocodificación con el cron; la demo las ubica y cierra sus jobs);
 *   - `altas`: cómo se da de alta la empresa y cada usuario (el E2E, con correos aleatorios; la
 *     demo, con los suyos fijos). `perfil` nombra al usuario dentro del escenario.
 * El Storage al que sube la evidencia es el que diga el entorno: no se decide aquí.
 *
 * La documentación de cada paso (camino de `llevarA`, formas de `GestionEscenario`) está en la
 * cabecera de `e2e/_escenarios/reparto.ts`, que sigue siendo la API de los specs.
 */

export type ZonaTipo = "central" | "satelite";

export interface Geo {
  distritoId: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface ZonaReparto {
  id: string;
  nombre: string;
  geo: Geo;
}

export interface MensajeroEscenario extends UsuarioCreado {
  zona: ZonaTipo;
  zonaId: string;
  actor: Actor;
}

export interface EscenarioReparto {
  empresa: EmpresaCreada;
  /** La tienda (adminTienda con bodega propia): dueña de las órdenes. */
  tienda: UsuarioCreado;
  adminSatelite: UsuarioCreado;
  zonaCentral: ZonaReparto;
  zonaSatelite: ZonaReparto;
  actores: { maestro: Actor; tienda: Actor; adminSatelite: Actor };
}

export interface OrdenEscenario {
  id: string;
  numRemision: string;
  destinatario: string;
  montoCobrar: number;
  zona: ZonaTipo;
  /** `null` hasta que `generarGuia` la numera (`llevarA`). */
  numGuia: number | null;
}

export interface TarifaTienda {
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
  tarifa?: Partial<TarifaTienda>;
  /** Pago al mensajero por zona (las dos zonas). */
  tarifaMensajero?: { cobroEntregado: number; cobroRechazado: number };
  /** Distritos de la central y de la satélite. Por defecto, dos del catálogo de cantones distintos. */
  distritos?: { central: Geo; satelite: Geo };
  /** Nombres de las zonas. Por defecto, «Central/Satelite E2E <sufijo>». */
  nombresZona?: { central: string; satelite: string };
}

/** Datos extra del alta de un usuario (los que pide `crearUsuario`). */
export interface ExtraUsuario {
  zonaId?: string;
  vehiculoId?: string;
  fulfillment?: boolean;
}

export interface AltasEscenario {
  empresa(etiqueta: string): Promise<EmpresaCreada>;
  usuario(empresa: EmpresaCreada, perfil: string, rol: RolValue, extra: ExtraUsuario): Promise<UsuarioCreado>;
}

export interface DepsEscenarioReparto {
  lector: () => PrismaClient;
  evidencia: () => Uint8Array;
  prepararAsignacion: (ordenIds: string[]) => Promise<void>;
  altas: AltasEscenario;
}

export type GestionEscenario =
  | { resultado: "entregado"; pagos?: { metodo: "efectivo" | "SINPE" | "transferencia"; monto: number }[] }
  | { resultado: "devolucion_a_origen_por_rechazo"; motivo?: string }
  | { resultado: "reprogramado"; fecha?: string; motivo?: string }
  | { resultado: "novedad"; causa?: "not_found" | "wrong_number" | "wrong_address"; motivo?: string };

export type DestinoReparto =
  | "en_bodega_central"
  | "en_ruta_bodega_satelite"
  | "en_bodega_satelite"
  | "mensajero_recogiendo_en_bodega"
  | "en_reparto";

const TARIFA_POR_DEFECTO: TarifaTienda = {
  valorFlete: 2500,
  valorFleteDevuelto: 1250,
  valorFleteGam: 2000,
  valorFleteDevueltoGam: 1000,
  comisionCod: 0,
  ivaFlete: 0,
  ivaComisionCod: 0,
};

const TARIFA_MENSAJERO_POR_DEFECTO = { cobroEntregado: 1500, cobroRechazado: 164 };

/**
 * El SINPE de la bodega, obligatorio al crear la zona (ficha 429). En una constante y no como
 * literal en el objeto: `sinpe-en-toda-superficie.guardia` vigila que nadie arme a mano el bloque
 * `negocio` de WhatsApp con un `sinpeNumero: "…"`, y esto no es ese bloque.
 */
const SINPE_BODEGA = { numero: "80000000", nombre: "Titular E2E" } as const;

const CAMINO: Record<ZonaTipo, DestinoReparto[]> = {
  satelite: ["en_bodega_central", "en_ruta_bodega_satelite", "en_bodega_satelite", "mensajero_recogiendo_en_bodega", "en_reparto"],
  central: ["en_bodega_central", "mensajero_recogiendo_en_bodega", "en_reparto"],
};

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

export function actorDe(e: EmpresaCreada, u: { id: string }, rol: Actor["rol"], zonaId: string | null): Actor {
  return { usuarioId: u.id, rol, zonaId, organizacionId: e.organizacionId };
}

export function exigirOk<T extends { status: string }>(paso: string, r: T, validos: string[] = ["ok"]): T {
  if (!validos.includes(r.status)) {
    throw new Error(`escenario reparto: «${paso}» no fue ok: ${JSON.stringify(r)}`);
  }
  return r;
}

// ── Fechas calendario de la app ─────────────────────────────────────────────────────────────────
// Las da la MISMA función con la que la app decide «hoy» (`lib/utils/fecha-cr.ts`), no un desfase
// propio: si la zona de la app cambia, el escenario la sigue sin tocarse (review m2 de SL-44).
export const hoyDeLaApp = (): string => fechaCalendarioCR();
export const mananaDeLaApp = (): string => mananaCalendarioCR();

// ── Servicios, montados como en su Server Action ────────────────────────────────────────────────
function historial(prisma: PrismaClient, ordenRepo: OrdenRepository): OrdenHistorialService {
  return new OrdenHistorialService(
    ordenRepo,
    new OrdenHistorialRepository(prisma),
    new OrdenDiaRepartoCambioRepository(prisma),
    new OrdenTraspasoRepository(prisma),
  );
}

export function servicios() {
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
    // lib/actions/mis-asignaciones.ts, con la evidencia contra el Storage que diga el entorno
    misAsignaciones: new MisAsignacionesService(
      new GestionOrdenRepository(prisma),
      ordenRepo,
      new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
      new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
      new RutaOptimizadaRepository(prisma),
      new OrdenMensajeroMetaRepository(prisma),
      historial(prisma, ordenRepo),
    ),
    // lib/actions/corregir-fecha-reprogramacion.ts, SIN su liberador (ver `corregirFechaReprogramacion`)
    correccionFecha: new CorreccionFechaReprogramacionService(
      new CorreccionFechaReprogramacionRepository(prisma),
      ordenRepo,
    ),
  };
}

/** Dos distritos del catálogo, de cantones distintos, nombrables en la plantilla de carga. */
async function dosDistritos(db: PrismaClient): Promise<[Geo, Geo]> {
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
  if (elegidos.length < 2) throw new Error("escenario reparto: el catálogo no tiene dos distritos de cantones distintos (¿base sin migrar?).");
  const geo = (f: (typeof filas)[number]): Geo => ({
    distritoId: f.id,
    provincia: f.canton.provincia.nombre,
    canton: f.canton.nombre,
    distrito: f.nombre,
  });
  return [geo(elegidos[0]), geo(elegidos[1])];
}

/** Una zona con su distrito, su pago al mensajero y el SINPE confirmado, por el maestro. */
export async function crearZona(
  e: EmpresaCreada,
  maestro: Actor,
  geo: Geo,
  esCentral: boolean,
  tarifaMensajero: { cobroEntregado: number; cobroRechazado: number },
  nombre: string = `${esCentral ? "Central" : "Satelite"} E2E ${sufijo()}`,
): Promise<ZonaReparto> {
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

/**
 * El maestro corrige la fecha de una reprogramada (`CorreccionFechaReprogramacionService`), con el
 * liberador POR DEFECTO del servicio (no-op): la orden queda `reprogramado` con la fecha ya llegada
 * y la libera el cron `liberar-reprogramadas`.
 */
export async function corregirFechaReprogramacion(
  r: EscenarioReparto,
  orden: { id: string },
  fecha: string = hoyDeLaApp(),
): Promise<void> {
  const s = servicios();
  exigirOk(
    "CorreccionFechaReprogramacionService.corregir",
    await conEmpresa(r.empresa.organizacionId, () =>
      s.correccionFecha.corregir({ ordenId: orden.id, fecha, motivo: "El cliente la pide antes" }, r.actores.maestro),
    ),
  );
}

/** Los pasos que necesitan lo inyectado. Ver la cabecera. */
export function escenarioReparto(deps: DepsEscenarioReparto) {
  async function crearEscenarioReparto(etiqueta: string, opts: OpcionesReparto = {}): Promise<EscenarioReparto> {
    const empresa = await deps.altas.empresa(etiqueta);
    const maestro = actorDe(empresa, empresa.maestro, "maestro", null);
    const [geoCentral, geoSatelite] = opts.distritos
      ? [opts.distritos.central, opts.distritos.satelite]
      : await dosDistritos(deps.lector());
    const tarifaMensajero = opts.tarifaMensajero ?? TARIFA_MENSAJERO_POR_DEFECTO;
    const zonaCentral = await crearZona(empresa, maestro, geoCentral, true, tarifaMensajero, opts.nombresZona?.central);
    const zonaSatelite = await crearZona(empresa, maestro, geoSatelite, false, tarifaMensajero, opts.nombresZona?.satelite);

    const tienda = await deps.altas.usuario(empresa, "tienda", "adminTienda", { fulfillment: true });
    const adminSatelite = await deps.altas.usuario(empresa, "admin-satelite", "adminSatelite", { zonaId: zonaSatelite.id });

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

  /** Un mensajero de esa zona. `perfil`, por defecto `mensajero-<zona>`, lo nombra en `altas`. */
  async function crearMensajero(
    r: EscenarioReparto,
    zona: ZonaTipo,
    opts: { perfil?: string } = {},
  ): Promise<MensajeroEscenario> {
    const zonaId = zona === "central" ? r.zonaCentral.id : r.zonaSatelite.id;
    const u = await deps.altas.usuario(r.empresa, opts.perfil ?? `mensajero-${zona}`, "mensajero", { zonaId });
    return { ...u, zona, zonaId, actor: actorDe(r.empresa, u, "mensajero", zonaId) };
  }

  async function crearOrden(
    r: EscenarioReparto,
    o: { zona: ZonaTipo; montoCobrar?: number; destinatario?: string; numRemision?: string },
  ): Promise<OrdenEscenario> {
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
      throw new Error(`escenario reparto: la carga no creó la orden: ${JSON.stringify(res)}`);
    }
    const fila = await deps.lector().orden.findFirst({
      where: { numRemision, organizacionId: r.empresa.organizacionId },
      select: { id: true, numGuia: true },
    });
    if (!fila) throw new Error("escenario reparto: la orden cargada no aparece.");
    return { id: fila.id, numRemision, destinatario, montoCobrar, zona: o.zona, numGuia: fila.numGuia };
  }

  async function estadoDe(orden: { id: string }): Promise<string> {
    const o = await deps.lector().orden.findUniqueOrThrow({
      where: { id: orden.id },
      select: { estatus: { select: { value: true } } },
    });
    return o.estatus.value;
  }

  async function gestionesDe(orden: { id: string }) {
    return deps.lector().gestionOrden.findMany({
      where: { ordenId: orden.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, resultado: true, cierreId: true, anuladaAt: true, motivo: true, fechaReprogramacion: true },
    });
  }

  async function guiaDe(orden: { id: string; numRemision: string }): Promise<number> {
    const o = await deps.lector().orden.findUniqueOrThrow({ where: { id: orden.id }, select: { numGuia: true } });
    if (o.numGuia === null) throw new Error(`escenario reparto: la orden ${orden.numRemision} no tiene guía.`);
    return o.numGuia;
  }

  function exigirMensajero(orden: OrdenEscenario, m: MensajeroEscenario | undefined): MensajeroEscenario {
    if (!m) throw new Error(`escenario reparto: asignar la orden ${orden.numRemision} exige \`mensajero\`.`);
    if (m.zona !== orden.zona) throw new Error(`escenario reparto: el mensajero es de la zona ${m.zona} y la orden de la ${orden.zona}.`);
    return m;
  }

  async function llevarA(
    r: EscenarioReparto,
    orden: OrdenEscenario,
    destino: DestinoReparto,
    opts: { mensajero?: MensajeroEscenario } = {},
  ): Promise<OrdenEscenario> {
    const camino = CAMINO[orden.zona];
    const meta = camino.indexOf(destino);
    if (meta < 0) throw new Error(`escenario reparto: «${destino}» no está en el camino de una orden ${orden.zona}.`);
    const s = servicios();
    const org = r.empresa.organizacionId;
    const { maestro, adminSatelite } = r.actores;

    for (;;) {
      const actual = await estadoDe(orden);
      const pos = actual === "en_preparacion" ? -1 : camino.indexOf(actual as DestinoReparto);
      if (pos === meta) break;
      if (pos < -1 || pos > meta) {
        throw new Error(`escenario reparto: la orden ${orden.numRemision} está en «${actual}», no se puede llevar a «${destino}».`);
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
          await deps.prepararAsignacion([orden.id]);
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

  function evidencia(): EvidenciaArchivo[] {
    return [{ contentType: "image/jpeg", bytes: deps.evidencia() }];
  }

  function entradaGestion(orden: OrdenEscenario, g: GestionEscenario): GestionarInput {
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
        return { ...base, resultado: g.resultado, fechaReprogramacion: g.fecha ?? mananaDeLaApp(), motivo: g.motivo ?? "Cliente ausente" };
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

  /** `escogerParaGestion` + `gestionar` del portal del mensajero. Devuelve el id de la gestión. */
  async function gestionar(
    r: EscenarioReparto,
    orden: OrdenEscenario,
    m: MensajeroEscenario,
    g: GestionEscenario,
  ): Promise<string> {
    const s = servicios();
    const org = r.empresa.organizacionId;
    exigirOk("escogerParaGestion", await conEmpresa(org, () => s.misAsignaciones.escogerParaGestion(orden.id, m.actor)));
    exigirOk(`gestionar(${g.resultado})`, await conEmpresa(org, () => s.misAsignaciones.gestionar(entradaGestion(orden, g), m.actor)));
    const ultima = await deps.lector().gestionOrden.findFirst({
      where: { ordenId: orden.id, anuladaAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!ultima) throw new Error("escenario reparto: gestionar fue ok y no dejó gestión.");
    return ultima.id;
  }

  return {
    crearEscenarioReparto,
    crearMensajero,
    crearOrden,
    estadoDe,
    gestionesDe,
    llevarA,
    gestionar,
    corregirFechaReprogramacion,
  };
}

export type NucleoReparto = ReturnType<typeof escenarioReparto>;
