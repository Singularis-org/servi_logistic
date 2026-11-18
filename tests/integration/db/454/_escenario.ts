import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { ICorteDiarioRepository } from "@/lib/interfaces/repositories/ICorteDiarioRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { GestionarInput } from "@/lib/interfaces/services/IMisAsignacionesService";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CorteDiarioRepository } from "@/lib/repositories/CorteDiarioRepository";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenMensajeroMetaRepository } from "@/lib/repositories/OrdenMensajeroMetaRepository";
import { OrdenNotaRepository } from "@/lib/repositories/OrdenNotaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { RutaOptimizadaRepository } from "@/lib/repositories/RutaOptimizadaRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { MisAsignacionesService } from "@/lib/services/MisAsignacionesService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { OrdenNotaService } from "@/lib/services/OrdenNotaService";
import { buildReprogramadasRetenidasService } from "@/lib/services/reprogramadas-retenidas-composicion";
import { SolicitudAyudaService } from "@/lib/services/SolicitudAyudaService";
import { GestionDesdeAyudaService } from "@/lib/services/GestionDesdeAyudaService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";

import {
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "../_postgres-real";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";

/**
 * FEATURE 454 (T0.1) — EL ESCENARIO COMPARTIDO DE LA FASE 0.
 *
 * Construye, DENTRO de una transaccion que SIEMPRE se revierte, un mundo propio (tienda, zona
 * satelite con su tarifa, dos mensajeros, un adminSatelite y un maestro) y expone VERBOS que llaman a
 * los SERVICIOS REALES —no a Prisma—: gestionar, solicitar el cierre, correr el corte, aprobar,
 * rechazar, deshacer, corregir. Asi el mismo test de caracterizacion ejercita el codigo nuevo en la
 * Fase 1 sin reescribirse.
 *
 * La base local es COMPARTIDA: todo lo que se siembra aqui nace y muere en la transaccion revertida.
 * Lo unico que lee de fuera es el catalogo (`order_status`, `rol`) y las FKs geograficas de una orden
 * cualquiera. Si falta algo, FALLA RUIDOSAMENTE: sin base alcanzable la suite se salta con
 * `describe.skip` (visible), nunca con un `return` silencioso.
 */

export const ESTATUS_454 = [
  "mensajero_recogiendo_en_bodega",
  "en_reparto",
  "ayuda_tienda",
  "entregado",
  "reprogramado",
  "devolucion_a_origen_por_rechazo",
  "novedad",
  "devolucion_por_confirmar",
  "incidente",
  "novedad_interna",
  "en_bodega_central",
  "en_bodega_satelite",
  "por_devolver_a_bodega_central",
  "por_devolver_a_tienda",
] as const;
export type Estatus454 = (typeof ESTATUS_454)[number];

/**
 * REVISION 454 (m4, 2026-09-24): los dos estados que la M3 RETIRA del catalogo. En la base local
 * compartida siguen existiendo (el historial los referencia y el retiro es condicional), pero en una
 * base NUEVA —`migrate reset`, CI con base limpia— la M3 los borra, y exigirlos en `prepararMundo`
 * tumbaba las 47 suites de la carpeta antes de medir nada.
 *
 * Ya no se exigen: si faltan, el escenario los SIEMBRA dentro de SU transaccion revertida, y solo
 * cuando un fixture los pide (`sembrarOrden` con uno de ellos, `sembrarIntentoPasado` de una
 * `devuelta`, o `asegurarRetirados()` explicito antes de `id()`). Perezoso a proposito: la columna
 * `value` es UNIQUE, y un INSERT sin confirmar hace esperar a cualquier otra transaccion que inserte
 * el mismo valor; sembrarlos en TODOS los escenarios serializaria la carpeta entera en una base nueva.
 *
 * Nunca en un escenario COMPROMETIDO (`sembrarComprometido`): alli el INSERT se confirmaria y
 * devolveria al catalogo lo que la M3 retiro. Si un escenario comprometido los pide, falla ruidosamente.
 */
export const ESTATUS_RETIRADOS_454 = ["ayuda_tienda", "devolucion_por_confirmar"] as const;
const RETIRADOS = new Set<string>(ESTATUS_RETIRADOS_454);

export interface Mundo {
  prisma: PrismaClient;
  // `tiendaId` y `zonaId` ya no salen de la base (SLT-177); quedan opcionales para los Mundo armados a mano.
  fks: { tiendaId?: string; zonaId?: string; provinciaId: string; cantonId: string };
  tipoIdentificacionId: string;
  rolId: Map<string, string>;
  estatus: Map<string, string>;
  valorDeEstatus: Map<string, string>;
  centralZonaId: string;
  /** SLT-177: `true` en el Mundo de `prepararMundo`: `crearEscenario` siembra la central en su tx. */
  sembrarCentral?: boolean;
}

let secuencia = 0;
// Cada archivo corre en su propio worker y varios arrancan en el MISMO milisegundo: sin la parte
// aleatoria, dos archivos generaban el mismo nombre de zona y la misma guia (medido: `Unique
// constraint failed` en `zona.create` al correr las 28 suites juntas).
const ALEATORIO = randomUUID().replace(/-/g, "").slice(0, 8);
const SUFIJO = `454f0${Date.now().toString(36)}${ALEATORIO}`;
const GUIA_BASE = 454_000_000 + ((Date.now() + parseInt(ALEATORIO.slice(0, 6), 16)) % 40_000_000);

export function claveUnica(): string {
  secuencia += 1;
  return `${SUFIJO}${secuencia}`;
}
export function guiaUnica(): number {
  secuencia += 1;
  return GUIA_BASE + secuencia;
}

/** Carga el catalogo y las FKs. Falla ruidosamente si la base no esta sembrada. */
export async function prepararMundo(): Promise<Mundo> {
  const prisma = crearPrismaDeTest();
  // SLT-177 (R737): del `beforeAll` solo se leen catalogos y geografia por su clave. La tienda y las
  // zonas (central incluida) son datos de negocio: las crea `crearEscenario` en la tx de cada caso.
  const canton = await prisma.canton.findFirst({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
    select: { id: true, provinciaId: true },
  });
  if (canton === null) throw new Error("falta la geografia Cartago/Cartago: aplica las migraciones.");
  const tipo = await prisma.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
  if (tipo === null) throw new Error("falta el tipo de identificacion «cedula»: aplica las migraciones.");
  const roles = await prisma.rol.findMany({ select: { id: true, value: true } });
  const rolId = new Map(roles.map((r) => [r.value as string, r.id]));
  for (const r of ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite"]) {
    if (!rolId.has(r)) throw new Error(`falta el rol «${r}» en la base`);
  }
  const catalogo = await prisma.orderStatus.findMany({ select: { id: true, value: true } });
  const estatus = new Map(catalogo.map((c) => [c.value, c.id]));
  const valorDeEstatus = new Map(catalogo.map((c) => [c.id, c.value]));
  for (const v of ESTATUS_454) {
    if (RETIRADOS.has(v)) continue; // m4: los siembra el escenario, si hacen falta
    if (!estatus.has(v)) throw new Error(`falta el estatus «${v}» en \`order_status\``);
  }
  return {
    prisma,
    fks: { provinciaId: canton.provinciaId, cantonId: canton.id },
    tipoIdentificacionId: tipo.id,
    rolId,
    estatus,
    valorDeEstatus,
    sembrarCentral: true,
    get centralZonaId(): string {
      if (centralActual454 === null) {
        throw new Error("454: no hay zona central sembrada: se lee dentro de un escenario (crearEscenario)");
      }
      return centralActual454;
    },
  };
}

/** SLT-177 (R737): la zona central del escenario en curso; la crea `crearEscenario` en su tx. */
let centralActual454: string | null = null;

const URLS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};
const STORAGE: IFileStorage = {
  upload: async (input) => input.path,
  remove: async () => {},
};
const FOTO = [{ contentType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }];

export type ResultadoGestion = "entregado" | "reprogramado" | "devolucion_a_origen_por_rechazo" | "novedad" | "incidente";

/** Monta los servicios REALES sobre el cliente dado (la tx del test o un cliente propio). */
export function montarServicios(cliente: PrismaClient) {
  const zonaRepo = new ZonaRepository(cliente);
  const ordenRepo = new OrdenRepository(cliente);
  const tarifaZonaRepo = new TarifaZonaMensajeroRepository(cliente);
  const cierreDiaRepo = new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente));
  const adminRepo = new CierresAdminRepository(
    cliente,
    new WalletMovimientoRepository(cliente),
    new WalletFeedService(),
    new WalletTiendaMovimientoRepository(cliente),
    new WalletTiendaFeedService(),
    new PagoMensajeroMovimientoRepository(cliente),
    new WalletMensajeroFeedService(),
    new WalletIndemnizacionFeedService(),
  );
  const historialService = new OrdenHistorialService(
    ordenRepo,
    new OrdenHistorialRepository(cliente),
    new OrdenDiaRepartoCambioRepository(cliente),
    new OrdenTraspasoRepository(cliente),
  );
  const gestionRepo = new GestionOrdenRepository(cliente);
  const corteReal = new CorteDiarioRepository(cliente);
  const notaRepo = new OrdenNotaRepository(cliente);
  return {
    notaRepo,
    gestionDesdeAyuda: new GestionDesdeAyudaService({
      reglasPais: reglasPaisFijas(),
      notaRepo,
      ordenRepo,
      gestionRepo,
      historial: historialService,
      storage: STORAGE,
    }),
    solicitudAyuda: new SolicitudAyudaService(
      new OrdenNotaService(notaRepo),
      ordenRepo,
      notaRepo,
      gestionRepo,
    ),
    zonaRepo,
    ordenRepo,
    tarifaZonaRepo,
    cierreDiaRepo,
    adminRepo,
    gestionRepo,
    corteReal,
    historialService,
    misAsignaciones: new MisAsignacionesService(
      gestionRepo,
      ordenRepo,
      STORAGE,
      URLS,
      new RutaOptimizadaRepository(cliente),
      new OrdenMensajeroMetaRepository(cliente),
      historialService,
      reglasPaisFijas(),
    ),
    cierreDia: new CierreDiaService(cierreDiaRepo, zonaRepo, ordenRepo, URLS, tarifaZonaRepo, undefined, undefined, reglasPaisFijas()),
    cierresAdmin: new CierresAdminService(
      adminRepo,
      zonaRepo,
      ordenRepo,
      URLS,
      new LiquidacionPagoRepository(cliente),
      new PagoMensajeroMovimientoRepository(cliente),
      // FICHA 462: el conteo REAL de retenidas, sobre la misma tx (la marca de S3 con datos reales).
      buildReprogramadasRetenidasService(cliente),
      undefined,
      undefined,
      undefined,
      undefined,
      reglasPaisFijas(),
    ),
    /** El corte REAL, con la seleccion REAL recortada a los mensajeros de ESTE escenario. */
    corteDe: (mensajeros: string[]) =>
      new CorteDiarioService(
        {
          findMensajerosConActividadSinCierre: async (dia: Date) =>
            (await corteReal.findMensajerosConActividadSinCierre(dia)).filter((m) =>
              mensajeros.includes(m.mensajeroId),
            ),
        } as ICorteDiarioRepository,
        cierreDiaRepo,
        zonaRepo,
        ordenRepo,
        tarifaZonaRepo,
        { warn: () => {} },
        undefined,
        reglasPaisFijas(),
      ),
  };
}

export type Servicios = ReturnType<typeof montarServicios>;

/** Construye la entrada de `gestionar` para un resultado, con evidencia y datos minimos validos. */
export function entradaGestion(
  ordenId: string,
  resultado: ResultadoGestion,
  opts: {
    monto?: number;
    pagos?: { metodo: "efectivo" | "SINPE" | "transferencia"; monto: number }[];
    fechaReprogramacion?: string;
    causaDevolucion?: "not_found" | "wrong_number" | "wrong_address";
  } = {},
): GestionarInput {
  switch (resultado) {
    case "entregado": {
      const monto = opts.monto ?? 0;
      const pagos = opts.pagos ?? (monto > 0 ? [{ metodo: "efectivo" as const, monto }] : []);
      return {
        ordenId,
        resultado,
        montoRecibido: monto,
        metodoPago: pagos.length === 1 ? pagos[0].metodo : null,
        pagos,
        evidencias: FOTO,
        ubicacionAusencia: "no_disponible",
      } as GestionarInput;
    }
    case "reprogramado":
      return {
        ordenId,
        resultado,
        fechaReprogramacion: opts.fechaReprogramacion ?? "2026-12-31",
        motivo: "No estaba",
        ubicacionAusencia: "no_disponible",
      } as GestionarInput;
    case "devolucion_a_origen_por_rechazo":
      return { ordenId, resultado, motivo: "No la quiere", evidencias: FOTO, ubicacionAusencia: "no_disponible" } as GestionarInput;
    case "novedad":
      return {
        ordenId,
        resultado,
        causaDevolucion: opts.causaDevolucion ?? "not_found",
        motivo: "No aparece",
        evidencias: FOTO,
        ubicacionAusencia: "no_disponible",
      } as GestionarInput;
    case "incidente":
      return {
        ordenId,
        resultado,
        causaIncidente: "danado",
        motivo: "Se rompio",
        evidencias: FOTO,
        ubicacionAusencia: "no_disponible",
      } as GestionarInput;
  }
}

export interface OrdenSembrada {
  ordenId: string;
  numGuia: number;
}

/**
 * El escenario: personas propias + verbos sobre los servicios reales + lecturas.
 * `cliente` es la tx del test envuelta para que los repos puedan abrir su `$transaction`.
 */
export async function crearEscenario(
  mundo: Mundo,
  tx: TxDeTest,
  cliente: PrismaClient,
  opts: { comprometido?: boolean } = {},
) {
  const s = montarServicios(cliente);

  // m4: los estados retirados sembrados en ESTA transaccion (vacio si el catalogo ya los tiene).
  const retiradosLocales = new Map<string, string>();
  const valorRetiradoLocal = new Map<string, string>();

  /** Garantiza, dentro de la tx del escenario, que los dos estados retirados esten en el catalogo. */
  async function asegurarRetirados(): Promise<void> {
    for (const v of ESTATUS_RETIRADOS_454) {
      if (mundo.estatus.has(v) || retiradosLocales.has(v)) continue;
      if (opts.comprometido) {
        throw new Error(
          `el estatus retirado «${v}» no esta en el catalogo y un escenario COMPROMETIDO no lo puede sembrar`,
        );
      }
      // SLT-177: el catalogo es de plataforma y `servi_app` no puede escribirlo; la fila de m4 se
      // inserta con el rol del dueno y se vuelve al de la app si el escenario lo tenia.
      const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(`SELECT current_setting('role') AS rol`);
      if (rol === "servi_app") await tx.$executeRawUnsafe("RESET ROLE");
      await tx.$executeRaw`INSERT INTO "order_status" ("id", "value")
        SELECT gen_random_uuid()::text, ${v}
         WHERE NOT EXISTS (SELECT 1 FROM "order_status" WHERE "value" = ${v})`;
      if (rol === "servi_app") await tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);
      const fila = await tx.orderStatus.findUniqueOrThrow({ where: { value: v }, select: { id: true } });
      retiradosLocales.set(v, fila.id);
      valorRetiradoLocal.set(fila.id, v);
    }
  }

  const valorDe = (estatusId: string): string | undefined =>
    mundo.valorDeEstatus.get(estatusId) ?? valorRetiradoLocal.get(estatusId);

  async function crearUsuario(rol: string, zonaId: string | null): Promise<string> {
    const clave = claveUnica();
    const u = await tx.usuario.create({
      data: {
        nombre: `${rol} 454 ${clave}`,
        email: `${rol.toLowerCase()}454-${clave}@example.test`,
        telefono: "88880000",
        passwordHash: "no-se-usa",
        cedula: `C454${clave}`,
        tipoIdentificacionId: mundo.tipoIdentificacionId,
        rolId: mundo.rolId.get(rol) as string,
        zonaId,
        estado: "activo",
      },
      select: { id: true },
    });
    return u.id;
  }

  const clave = claveUnica();
  // SLT-177 (R737): con el Mundo de `prepararMundo`, la zona central es propia del escenario (una por
  // empresa; la tx tiene la suya). Un Mundo armado a mano trae ya su central y no se toca.
  if (mundo.sembrarCentral === true) {
    const central = await tx.zona.create({
      data: { sinpeNumero: "80000000", sinpeNombre: "Titular 454", nombre: `Central 454 ${clave}`, esCentral: true },
      select: { id: true },
    });
    // Control positivo (R739): la central sembrada se lee de vuelta, exactamente una.
    const centrales = await tx.zona.count({ where: { id: central.id, esCentral: true } });
    if (centrales !== 1) throw new Error(`454: la zona central sembrada no esta en la base (${centrales})`);
    centralActual454 = central.id;
  }
  const zona = await tx.zona.create({
    data: { sinpeNumero: "80000000", sinpeNombre: "Titular 454", nombre: `Zona 454 ${clave}` },
    select: { id: true },
  });
  const zonaSateliteId = zona.id;
  // Tarifa por defecto de la zona satelite: 1500 por entrega, 164 por rechazo.
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: zonaSateliteId, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "164.00" },
  });
  const tiendaId = await crearUsuario("adminTienda", null);
  const mensajeroId = await crearUsuario("mensajero", zonaSateliteId);
  const mensajero2Id = await crearUsuario("mensajero", zonaSateliteId);
  const adminSateliteId = await crearUsuario("adminSatelite", zonaSateliteId);
  const maestroId = await crearUsuario("maestro", null);

  const actorMensajero: Actor = { usuarioId: mensajeroId, rol: "mensajero", zonaId: zonaSateliteId };
  const actorMensajero2: Actor = { usuarioId: mensajero2Id, rol: "mensajero", zonaId: zonaSateliteId };
  const actorAdminSatelite: Actor = { usuarioId: adminSateliteId, rol: "adminSatelite", zonaId: zonaSateliteId };
  const actorMaestro: Actor = { usuarioId: maestroId, rol: "maestro", zonaId: null };
  const actorTienda: Actor = { usuarioId: tiendaId, rol: "adminTienda", zonaId: null };

  const id = (v: Estatus454 | string): string => {
    const r = mundo.estatus.get(v) ?? retiradosLocales.get(v);
    if (r === undefined) {
      throw new Error(
        RETIRADOS.has(v)
          ? `estatus retirado «${v}»: llama antes a \`await e.asegurarRetirados()\``
          : `estatus «${v}» no esta en el catalogo`,
      );
    }
    return r;
  };

  async function sembrarOrden(o: {
    estatus: Estatus454;
    mensajeroId?: string | null;
    zona?: "central" | "satelite";
    montoCobrar?: number;
    fechaReparto?: Date | null;
  }): Promise<OrdenSembrada> {
    if (RETIRADOS.has(o.estatus)) await asegurarRetirados();
    const k = claveUnica();
    const numGuia = guiaUnica();
    const orden = await tx.orden.create({
      data: {
        numGuia,
        numRemision: `R-${k}`,
        destinatario: `Dest ${k}`,
        telefonoDest: "88880000",
        producto: `Prod ${k}`,
        estatusId: id(o.estatus),
        mensajeroAsignadoId: o.mensajeroId === undefined ? mensajeroId : o.mensajeroId,
        asignadoAt: new Date(),
        montoCobrar: o.montoCobrar ?? 0,
        fechaReparto: o.fechaReparto ?? null,
        tiendaId,
        zonaId: (o.zona ?? "central") === "central" ? mundo.centralZonaId : zonaSateliteId,
        provinciaId: mundo.fks.provinciaId,
        cantonId: mundo.fks.cantonId,
      },
      select: { id: true },
    });
    return { ordenId: orden.id, numGuia };
  }

  /** `gestionar` REAL del portal del mensajero (escoge la orden antes, como la pantalla). */
  async function gestionar(
    ordenId: string,
    resultado: ResultadoGestion,
    opts: Parameters<typeof entradaGestion>[2] & { actor?: Actor; now?: Date; escoger?: boolean } = {},
  ) {
    const actor = opts.actor ?? actorMensajero;
    if (opts.escoger !== false) await s.misAsignaciones.escogerParaGestion(ordenId, actor, opts.now);
    return s.misAsignaciones.gestionar(entradaGestion(ordenId, resultado, opts), actor, opts.now);
  }

  /** Gestiona y devuelve el id de la gestion creada; lanza si no fue `ok`. */
  async function gestionarOk(
    ordenId: string,
    resultado: ResultadoGestion,
    opts: Parameters<typeof gestionar>[2] = {},
  ): Promise<string> {
    const r = await gestionar(ordenId, resultado, opts);
    if (r.status !== "ok") throw new Error(`gestionar(${resultado}) no fue ok: ${JSON.stringify(r)}`);
    const g = await tx.gestionOrden.findFirst({
      where: { ordenId, anuladaAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (g === null) throw new Error("gestionar fue ok y no dejo gestion");
    return g.id;
  }

  async function solicitarCierre(actor: Actor = actorMensajero, now?: Date) {
    return s.cierreDia.solicitarCierre(actor, now);
  }

  async function solicitarCierreOk(actor: Actor = actorMensajero): Promise<string> {
    const r = await solicitarCierre(actor);
    if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
      throw new Error(`solicitarCierre no creo el cierre: ${JSON.stringify(r)}`);
    }
    return r.cierreId;
  }

  async function correrCorte(now: Date = new Date(), mensajeros: string[] = [mensajeroId, mensajero2Id]) {
    return s.corteDe(mensajeros).ejecutarCorte(now);
  }

  /**
   * La confirmacion fisica EXACTA que el servicio exige: todas las retornables del cierre (238) y,
   * desde la 451 / SLT-72, tambien todas las ordenes que ese cierre barrio sin gestionar.
   */
  async function confirmacionDe(cierreId: string, alcance: Parameters<CierresAdminRepository["findGestionesRetornablesDelCierre"]>[1]) {
    const retornables = await s.adminRepo.findGestionesRetornablesDelCierre(cierreId, alcance);
    const barridas = await s.adminRepo.findBarridasDelCierre(cierreId, alcance);
    return [
      ...retornables.map((r) => ({ origen: "gestion" as const, gestionId: r.gestionId, numGuia: r.numGuia as number })),
      ...barridas.map((b) => ({ origen: "barrida" as const, ordenId: b.ordenId, numGuia: b.numGuia as number })),
    ];
  }

  /** Aprueba por el SERVICIO real, confirmando exactamente lo que vuelve. */
  async function aprobar(
    cierreId: string,
    actor: Actor = actorAdminSatelite,
    indemnizaciones: { gestionId: string; monto: string }[] = [],
  ) {
    const alcance =
      actor.rol === "adminSatelite"
        ? { destinoTipo: "bodega_satelite" as const, destinoZonaId: zonaSateliteId }
        : { destinoTipo: "bodega_central" as const, destinoZonaId: null };
    const confirmacion = await confirmacionDe(cierreId, alcance);
    return s.cierresAdmin.aprobarCierre(cierreId, actor, indemnizaciones, confirmacion);
  }

  async function rechazar(cierreId: string, actor: Actor = actorAdminSatelite) {
    return s.cierresAdmin.rechazarCierre(cierreId, "No cuadra", actor);
  }

  /** Pedir ayuda a la tienda, por el servicio REAL (nota + transicion). */
  async function pedirAyuda(ordenId: string, actor: Actor = actorMensajero) {
    const r = await s.solicitudAyuda.solicitar({ ordenId, motivo: "No contesta, ayuda" }, actor);
    return r;
  }

  /** La TIENDA registra reprogramar/rechazar desde la pestaña de ayuda (237), por el servicio real. */
  async function gestionarDesdeAyuda(
    ordenId: string,
    resultado: "reprogramado" | "devolucion_a_origen_por_rechazo",
    opts: { fechaReprogramacion?: string; actor?: Actor; now?: Date } = {},
  ) {
    const input =
      resultado === "devolucion_a_origen_por_rechazo"
        ? { ordenId, resultado, motivo: "El cliente no la quiere", evidencias: FOTO }
        : {
            ordenId,
            resultado,
            fechaReprogramacion: opts.fechaReprogramacion ?? "2026-12-31",
            motivo: "El cliente pide otro dia",
            evidencias: FOTO,
          };
    return s.gestionDesdeAyuda.gestionar(input as never, opts.actor ?? actorTienda, opts.now);
  }

  /** «Recuperar» del mensajero sobre una orden con ayuda. */
  async function recuperar(ordenId: string, actor: Actor = actorMensajero) {
    return s.solicitudAyuda.recuperar({ ordenId }, actor);
  }

  /**
   * FIXTURE de un intento PASADO: gestion en un cierre YA APROBADO + su fila de historial (lo que
   * lee `whereIntentosVigentes`). Para montar ordenes con N intentos sin recorrer N jornadas.
   */
  async function sembrarIntentoPasado(
    ordenId: string,
    g: {
      resultado?: "novedad" | "reprogramado" | "devolucion_a_origen_por_rechazo";
      origenTipo?: "gestion" | "escalado_devuelta_sla";
      anulada?: boolean;
      cierreEstado?: "aprobado" | "solicitado";
      en?: Date;
    } = {},
  ): Promise<{ gestionId: string; cierreId: string }> {
    const en = g.en ?? new Date("2026-09-01T10:00:00.000Z");
    const resultado = g.resultado ?? "novedad";
    if (resultado === "novedad") await asegurarRetirados();
    const cierre = await tx.cierreDia.create({
      data: {
        mensajeroId,
        estado: g.cierreEstado ?? "aprobado",
        destinoTipo: "bodega_satelite",
        destinoZonaId: zonaSateliteId,
        solicitadoAt: en,
      },
      select: { id: true },
    });
    const gestion = await tx.gestionOrden.create({
      data: {
        ordenId,
        mensajeroId,
        resultado,
        cierreId: cierre.id,
        anuladaAt: g.anulada ? new Date(en.getTime() + 3600_000) : null,
        createdAt: en,
      },
      select: { id: true },
    });
    await tx.ordenHistorialEstado.create({
      data: {
        ordenId,
        estatusDestinoId: id(resultado === "novedad" ? "devolucion_por_confirmar" : resultado),
        origenTipo: g.origenTipo ?? "gestion",
        gestionOrdenId: gestion.id,
        createdAt: en,
      },
    });
    return { gestionId: gestion.id, cierreId: cierre.id };
  }

  /**
   * Un mensajero de la zona CENTRAL (sus cierres van a `bodega_central`, alcance de maestro/admin) y
   * una tarifa por defecto de la central fijada DENTRO de la tx a 1500/164, para que los importes del
   * test no dependan de lo que la base compartida tenga sembrado.
   */
  async function mensajeroCentral(): Promise<{ mensajeroId: string; actor: Actor }> {
    const existente = await tx.tarifaZonaMensajero.findFirst({
      where: { zonaId: mundo.centralZonaId, vehiculoId: null },
      select: { id: true },
    });
    if (existente) {
      await tx.tarifaZonaMensajero.update({
        where: { id: existente.id },
        data: { cobroEntregado: "1500.00", cobroRechazado: "164.00" },
      });
    } else {
      await tx.tarifaZonaMensajero.create({
        data: { zonaId: mundo.centralZonaId, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "164.00" },
      });
    }
    const idCentral = await crearUsuario("mensajero", mundo.centralZonaId);
    return { mensajeroId: idCentral, actor: { usuarioId: idCentral, rol: "mensajero", zonaId: mundo.centralZonaId } };
  }

  async function estadoDe(ordenId: string): Promise<string> {
    const o = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { estatusId: true } });
    return valorDe(o.estatusId) as string;
  }

  async function ordenDe(ordenId: string) {
    return tx.orden.findUniqueOrThrow({
      where: { id: ordenId },
      select: { estatusId: true, mensajeroAsignadoId: true, prioridad: true, fechaReparto: true },
    });
  }

  async function gestionesDe(ordenId: string) {
    return tx.gestionOrden.findMany({
      where: { ordenId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        resultado: true,
        cierreId: true,
        anuladaAt: true,
        mensajeroId: true,
        motivo: true,
        pagoMensajero: true,
        ingresoBodegaRechazo: true,
      },
    });
  }

  async function historialDe(ordenId: string) {
    const filas = await tx.ordenHistorialEstado.findMany({
      where: { ordenId },
      orderBy: { createdAt: "asc" },
      select: {
        origenTipo: true,
        estatusOrigenId: true,
        estatusDestinoId: true,
        actorUsuarioId: true,
        gestionOrdenId: true,
      },
    });
    return filas.map((f) => ({
      ...f,
      origen: f.estatusOrigenId ? (valorDe(f.estatusOrigenId) as string) : null,
      destino: valorDe(f.estatusDestinoId) as string,
    }));
  }

  return {
    tx,
    cliente,
    s,
    mundo,
    id,
    asegurarRetirados,
    zonaSateliteId,
    tiendaId,
    mensajeroId,
    mensajero2Id,
    adminSateliteId,
    maestroId,
    actorMensajero,
    actorMensajero2,
    actorAdminSatelite,
    actorMaestro,
    actorTienda,
    crearUsuario,
    sembrarOrden,
    gestionar,
    gestionarOk,
    solicitarCierre,
    solicitarCierreOk,
    correrCorte,
    confirmacionDe,
    pedirAyuda,
    gestionarDesdeAyuda,
    sembrarIntentoPasado,
    mensajeroCentral,
    recuperar,
    aprobar,
    rechazar,
    estadoDe,
    ordenDe,
    gestionesDe,
    historialDe,
  };
}

export type Escenario = Awaited<ReturnType<typeof crearEscenario>>;

/** Corre `fn` sobre un escenario nuevo, en una transaccion que SIEMPRE se revierte. */
/**
 * `opciones.rolDeLaApp` (por defecto `true`): el escenario corre como `servi_app` con RLS. Lo apagan
 * solo los tests de migracion que hacen DDL o escriben el catalogo dentro del escenario (eso es del
 * dueno de las tablas); esos no llaman a lecturas globales del codigo bajo test.
 */
export function conEscenario<T>(
  mundo: Mundo,
  fn: (e: Escenario) => Promise<T>,
  opciones: { rolDeLaApp?: boolean } = {},
): Promise<T> {
  return enTransaccionRevertida(mundo.prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    // SLT-177: el escenario corre con el rol de la app (`servi_app`, sin BYPASSRLS) y la empresa de
    // la tx, como en produccion. Sin esto el `tx` es el del dueno de las tablas y una lectura global
    // del codigo bajo test (p. ej. `ZonaRepository.findCentralZonaId`, `findFirst({ esCentral })`)
    // devolvia la central de OTRA empresa en una base con datos: la aprobacion mandaba a satelite.
    const [{ org }] = await tx.$queryRawUnsafe<{ org: string | null }[]>(
      `SELECT current_setting('app.organizacion_id', true) AS org`,
    );
    if (!org) throw new Error("454: la transaccion del escenario no tiene empresa fijada");
    if (opciones.rolDeLaApp !== false) await comoApp(tx, org);
    const cliente = clienteConTransaccionAnidada(tx);
    const e = await crearEscenario(mundo, tx, cliente);
    return fn(e);
  });
}

/** Hoy en Costa Rica como fecha `@db.Date` (medianoche UTC del dia CR) mas `dias`. */
export function diaCR(dias = 0, now: Date = new Date()): Date {
  const cr = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate() + dias));
}

export interface Comprometido {
  /** SLT-185 (R1144): la empresa propia del escenario confirmado; la borra `limpiarComprometido`, la ultima. */
  organizacionId: string;
  /** SLT-185 (R1145): la zona central propia del escenario (SLT-177), que tambien se borra. */
  centralZonaId: string | null;
  usuarios: string[];
  zonaId: string;
  ordenIds: string[];
  mensajeroId: string;
  mensajero2Id: string;
  tiendaId: string;
  actorMensajero: Actor;
  actorTienda: Actor;
}

/**
 * Para los DOS unicos tests que necesitan dos conexiones (C02, C07-concurrente): siembra un
 * escenario CONFIRMADO (commit real) y devuelve los ids para limpiarlo despues con
 * `limpiarComprometido`. Todo lo demas de la Fase 0 corre en transacciones revertidas.
 */
export async function sembrarComprometido(
  mundo: Mundo,
  fn: (e: Escenario) => Promise<{ ordenIds: string[] }>,
): Promise<Comprometido> {
  // SLT-185 (R1144): el escenario confirmado crea y fija SU empresa, como `conEscenario`: sin ella el
  // `zona.create` de la central viola `organizacion_id NOT NULL` (SL-17). La organizacion se confirma
  // aparte; si la siembra falla, se borra aqui mismo (R1145).
  const organizacionId = (await crearOrganizacion(mundo.prisma)).id;
  try {
    return await conEmpresa(organizacionId, () =>
      mundo.prisma.$transaction(
        async (tx) => {
          await comoApp(tx, organizacionId);
          const e = await crearEscenario(mundo, tx, clienteConTransaccionAnidada(tx), { comprometido: true });
          const { ordenIds } = await fn(e);
          return {
            organizacionId,
            centralZonaId: mundo.sembrarCentral === true ? mundo.centralZonaId : null,
            usuarios: [e.tiendaId, e.mensajeroId, e.mensajero2Id, e.adminSateliteId, e.maestroId],
        zonaId: e.zonaSateliteId,
        ordenIds,
        mensajeroId: e.mensajeroId,
        mensajero2Id: e.mensajero2Id,
        tiendaId: e.tiendaId,
            actorMensajero: e.actorMensajero,
            actorTienda: e.actorTienda,
          };
        },
        { timeout: 30_000, maxWait: 15_000 },
      ),
    );
  } catch (error) {
    await mundo.prisma.organizacion.delete({ where: { id: organizacionId } }).catch(() => {});
    throw error;
  }
}

/**
 * SLT-185 (R1144): un cliente propio de un test de concurrencia con la MISMA envoltura que
 * `getPrismaClient()`: sus transacciones fijan la empresa del contexto y bajan a `servi_app` (RLS y
 * triggers de misma empresa activos), como en produccion. La empresa sale de `enEmpresaDe`.
 */
export function clienteDeLaApp454(base: PrismaClient): PrismaClient {
  return conAislamientoPorEmpresa(base, async () => null);
}

/** SLT-185 (R1144): corre `fn` con la empresa del escenario confirmado en contexto, como una peticion. */
export function enEmpresaDe<T>(s: Pick<Comprometido, "organizacionId">, fn: () => Promise<T>): Promise<T> {
  return conEmpresa(s.organizacionId, fn);
}

/** Borra, en orden de FKs, todo lo que un escenario CONFIRMADO pudo dejar. */
export async function limpiarComprometido(
  prisma: PrismaClient,
  s: { usuarios: string[]; zonaId: string; ordenIds: string[]; organizacionId?: string; centralZonaId?: string | null },
): Promise<void> {
  const cierres = (
    await prisma.cierreDia.findMany({ where: { mensajeroId: { in: s.usuarios } }, select: { id: true } })
  ).map((c) => c.id);
  const gestiones = (
    await prisma.gestionOrden.findMany({ where: { ordenId: { in: s.ordenIds } }, select: { id: true } })
  ).map((g) => g.id);
  // FICHA 454 (T1.4, 2026-09-23, cambio autorizado #5 de la bitacora del backend): desde la Fase 1
  // registrar una gestion escribe `orden_evento` (FK RESTRICT a orden, gestion y usuario) y puede
  // encolar su job `webhook_evento`. Se borran PRIMERO, o el resto de la limpieza choca con la FK.
  const eventos = (
    await prisma.ordenEvento.findMany({ where: { ordenId: { in: s.ordenIds } }, select: { id: true } })
  ).map((e) => e.id);
  for (const ordenEventoId of eventos) {
    await prisma.job.deleteMany({
      where: { tipo: "webhook_evento", payload: { path: ["ordenEventoId"], equals: ordenEventoId } },
    });
  }
  await prisma.ordenEvento.deleteMany({ where: { ordenId: { in: s.ordenIds } } });
  await prisma.ordenHistorialEstado.deleteMany({ where: { ordenId: { in: s.ordenIds } } });
  await prisma.cierreSinGestion.deleteMany({ where: { cierreId: { in: cierres } } });
  await prisma.cierreDetail.deleteMany({ where: { cierreId: { in: cierres } } });
  await prisma.gestionOrdenEvidencia.deleteMany({ where: { gestionId: { in: gestiones } } });
  await prisma.gestionOrdenPago.deleteMany({ where: { gestionId: { in: gestiones } } });
  await prisma.usuario.updateMany({ where: { id: { in: s.usuarios } }, data: { ordenEnGestionId: null } });
  await prisma.gestionOrden.deleteMany({ where: { id: { in: gestiones } } });
  await prisma.cierreDia.deleteMany({ where: { id: { in: cierres } } });
  for (const m of s.usuarios) {
    await prisma.job.deleteMany({ where: { payload: { path: ["mensajeroId"], equals: m } } });
  }
  await prisma.orden.deleteMany({ where: { id: { in: s.ordenIds } } });
  await prisma.notificacion.deleteMany({
    where: { OR: [{ destinatarioUsuarioId: { in: s.usuarios } }, { tiendaId: { in: s.usuarios } }] },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: s.usuarios } } });
  await prisma.tarifaZonaMensajero.deleteMany({ where: { zonaId: s.zonaId } });
  await prisma.zona.deleteMany({ where: { id: s.zonaId } });
  // SLT-185 (R1145): la central propia (SLT-177) y la empresa, la ULTIMA: las tablas de negocio la
  // referencian con RESTRICT, asi que una fila olvidada hace fallar el borrado en vez de quedar muda.
  if (s.centralZonaId) {
    await prisma.tarifaZonaMensajero.deleteMany({ where: { zonaId: s.centralZonaId } });
    await prisma.zona.deleteMany({ where: { id: s.centralZonaId } });
  }
  if (s.organizacionId) await prisma.organizacion.delete({ where: { id: s.organizacionId } });
}
