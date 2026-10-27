import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Prisma, type PrismaClient, type RolValue } from "@prisma/client";

import { procesarEnChunks } from "@/app/(app)/ordenes/_components/carga-masiva-chunks";
import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleCargaMasivaChunk } from "@/app/api/ordenes/carga-masiva/chunk/route";
import { buildComprobantes } from "@/lib/actions/_shared/comprobante-lateral";
import { cargaMasivaConfig } from "@/lib/config/carga-masiva";
import { gestionConfig } from "@/lib/config/gestion";
import { walletComprobanteConfig } from "@/lib/config/wallet-comprobante";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { EvidenciaArchivo } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { notificarCierreDiaVencidoReal } from "@/lib/notificaciones/notificadores";
import { AbonoTiendaRepository } from "@/lib/repositories/AbonoTiendaRepository";
import { AporteCapitalRepository } from "@/lib/repositories/AporteCapitalRepository";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CobroPlataformaMovimientoRepository } from "@/lib/repositories/CobroPlataformaMovimientoRepository";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { CorteDiarioRepository } from "@/lib/repositories/CorteDiarioRepository";
import { DevolucionTiendaRepository } from "@/lib/repositories/DevolucionTiendaRepository";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { IncidenteAdminRepository } from "@/lib/repositories/IncidenteAdminRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { LiquidacionRepartoRepository } from "@/lib/repositories/LiquidacionRepartoRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { PagoPlataformaRepository } from "@/lib/repositories/PagoPlataformaRepository";
import { RechazoTiendaCobroRepository } from "@/lib/repositories/RechazoTiendaCobroRepository";
import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { AbonoTiendaService } from "@/lib/services/AbonoTiendaService";
import { AporteCapitalService } from "@/lib/services/AporteCapitalService";
import { ApiKeyService } from "@/lib/services/ApiKeyService";
import { AsignabilidadCoordenadasService } from "@/lib/services/AsignabilidadCoordenadasService";
import { CajaAbonoTiendaFeedService } from "@/lib/services/CajaAbonoTiendaFeedService";
import { CajaAporteCapitalFeedService } from "@/lib/services/CajaAporteCapitalFeedService";
import { CajaPagoTiendaFeedService } from "@/lib/services/CajaPagoTiendaFeedService";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CobroPlataformaService } from "@/lib/services/CobroPlataformaService";
import { ConciliacionSatelitesService } from "@/lib/services/ConciliacionSatelitesService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { DevolucionOrigenService } from "@/lib/services/DevolucionOrigenService";
import { DevolucionTiendaService } from "@/lib/services/DevolucionTiendaService";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";
import { EnvioDevolucionCentralService } from "@/lib/services/EnvioDevolucionCentralService";
import { IncidenteAdminService } from "@/lib/services/IncidenteAdminService";
import { LiquidacionService } from "@/lib/services/LiquidacionService";
import { RechazoTiendaService } from "@/lib/services/RechazoTiendaService";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import { RecepcionOrigenService } from "@/lib/services/RecepcionOrigenService";
import { RecoleccionTiendaService } from "@/lib/services/RecoleccionTiendaService";
import { TopePagoPlataformaService } from "@/lib/services/TopePagoPlataformaService";
import { WalletEgresoService } from "@/lib/services/WalletEgresoService";
import { WalletIndemnizacionIncidenteFeedService } from "@/lib/services/WalletIndemnizacionIncidenteFeedService";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider } from "@/lib/storage/SupabaseSignedUrlProvider";
import { registrarAbonoTiendaSchema } from "@/lib/types/abono-tienda";
import { generarApiKeySchema } from "@/lib/types/api-key";
import { registrarAporteCapitalSchema } from "@/lib/types/aporte-capital";
import { fijarCobroEmpresaSchema } from "@/lib/types/cobro-plataforma";
import { marcarConsolidacionRecibidaSchema } from "@/lib/types/conciliacion-satelites";
import { distritosEspecialesSchema } from "@/lib/types/distrito-zona-especial";
import { aprobarIncidenteSchema, reportarIncidenteSchema } from "@/lib/types/incidente";
import { registrarPagoMensajeroSchema } from "@/lib/types/liquidacion";
import { ORDER_STATUS_SEED } from "@/lib/types/order-status";
import { rechazarNovedadSchema } from "@/lib/types/rechazo-tienda";
import { crearTarifaSchema } from "@/lib/types/tarifa";
import { registrarEgresoConLateralesSchema } from "@/lib/types/wallet-laterales";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearEmpresa, crearUsuario, type EmpresaCreada, type UsuarioCreado } from "@/tests/fabricas/empresa-y-usuarios";
import { escenarioCierres, solicitarCierre } from "@/tests/fabricas/escenarios/cierres";
import {
  actorDe,
  escenarioReparto,
  servicios,
  type EscenarioReparto,
  type Geo,
  type MensajeroEscenario,
  type OrdenEscenario,
  type ZonaTipo,
} from "@/tests/fabricas/escenarios/reparto";

import { EMPRESAS_DEMO } from "./borrar";
import { DISTRITOS_DEMO, PAIS_DEMO, claveDeDistritoDemo, type DistritoDemo } from "./geografia";
import {
  cerrarJobsSinEjecutar,
  crearDepsJobsDemo,
  jobsAbiertosPorTipo,
  ubicarOrdenes,
  type DepsJobsDemo,
  type OrdenAUbicar,
} from "./ubicar-y-cerrar-jobs";

// SL-43 (design §5, §6.1, §6.3, §7; R11–R19, R21, R22, R24) — LA RECETA DE UNA EMPRESA DEMO.
//
// Todo dato nace por el servicio que lo produce en la app, montado como en su Server Action o su
// route (el mapa está en `progress/impl_SL-43.md > T1`), dentro de `conEmpresa(<demo>)` y con el
// actor del rol que lo haría allí. La receta no pasa por las actions porque no hay sesión: hace lo
// que hace la action DESPUÉS de resolver la sesión (mismo `schema.parse`, mismo servicio).
//
// Las únicas escrituras directas son las de `design.md > D5.3`: la contraseña del maestro (la hace
// `crearEmpresa`), `organizacion.es_demo` (aquí, como dueño) y las coordenadas y el cierre de jobs
// (`ubicar-y-cerrar-jobs.ts`). El cliente dueño se usa además para LEER lo que dejan los servicios.
//
// El ORDEN de los pasos no es estético; sale de reglas de los servicios (T1 §2):
//   - el cobro de la plataforma se fija ANTES de crear órdenes: el cargo nace con cada orden;
//   - cada lote de órdenes se ubica y cierra su geocodificación ANTES de asignar (D6.1);
//   - el cierre de la bodega satélite va antes de dejar ningún cierre de esa zona solicitado;
//   - las aprobaciones de cierre van ANTES del corte, y lo que el corte barrería (un cierre
//     rechazado, el rechazo de la tienda, las órdenes en reposo en reparto) va DESPUÉS: el corte
//     mira a todos los mensajeros de la empresa (R-b), no solo al suyo;
//   - el rechazo de la tienda va después de la última aprobación de ese mensajero (R-d).

// ─── Decisiones abiertas, detrás de constantes ───────────────────────────────────────────────────

/**
 * B1 (T1 §2): `novedad_interna` solo la produce el corte diario, que cierra el día ANTERIOR. Las
 * asignaciones de la receta son de hoy, así que el corte de hoy no las ve: se llama al servicio del
 * corte con el reloj de MAÑANA (`ejecutarCorte(now)`, parámetro público del método), solo para la
 * empresa demo y nunca por la ruta del cron, que recorre todas las empresas.
 *
 * PENDIENTE DE CONFIRMAR POR CARLOS. Apagada, `novedad_interna` sale como faltante «por decisión»
 * y no hace fallar la comprobación final.
 */
export const NOVEDAD_INTERNA_CON_CORTE_DE_MANANA = true;

/**
 * D19 (design §5.2): si el tiempo del build obliga, la empresa B lleva una orden por estado de
 * reparto y entrega, sin el flujo de devolución ni el incidente. Apagado mientras T12 no mida que
 * hace falta; encendido, la comprobación final lista lo que le falta a B sin fallar por ello.
 */
export const RECORTE_DE_B = false;

/** Lo que el recorte de B deja fuera (R15: la salida lo dice). */
export const ESTADOS_RECORTADOS_DE_B: readonly string[] = [
  "devolucion_a_origen_por_rechazo",
  "por_devolver_a_bodega_central",
  "devolviendo_a_bodega_central",
  "por_devolver_a_tienda",
  "devolviendo_a_tienda",
  "devuelta_a_tienda",
  "incidente",
];

/** Estados desde los que se asigna a un mensajero y que por eso pasan por el gate (R21). */
export const ESTADOS_ASIGNABLES: readonly string[] = ["en_bodega_central", "en_bodega_satelite"];

/** Tablas que una empresa demo no puede tener con filas (R24, D6.3). */
const TABLAS_SIN_FILAS = ["integracion", "webhook_suscripcion", "plantilla_mensaje", "whatsapp_envio"] as const;

// ─── Cifras (D24; redondas y enteras, ficha 305) ────────────────────────────────────────────────

const MONTO_A_COBRAR = 8000;
const EFECTIVO_DEL_PAGO_MIXTO = 1000;
const MONTO_ENTREGA_SATELITE = 1000;
/** Con B recortada: con 4 entregas sin cobro, los fletes superan lo cobrado más el abono (medido en local). */
const ENTREGAS_SIN_COBRO_CON_RECORTE = 4;
const COBRO_PLATAFORMA_POR_ORDEN = "100";
const TARIFA_TIENDA = { valorFlete: 2500, valorFleteDevuelto: 1250 } as const;
const PAGO_MENSAJERO = { cobroEntregado: 1500, cobroRechazado: 164 } as const;
const INDEMNIZACION = "5000";
const APORTE_CAPITAL = "100000";
// Por debajo de lo que le queda por cobrar al mensajero central tras el efectivo que ya tiene, también con B recortada.
const PAGO_A_MENSAJERO = "500";
const ABONO_DE_TIENDA = "2500";
const PAGO_A_LA_PLATAFORMA = "1000";

/** La dirección libre de todas las órdenes: la que el job geocodificaría (D6.1). */
const DIRECCION = "100 m norte de la iglesia";
const TELEFONO = "88880000";

// ─── Tipos públicos ─────────────────────────────────────────────────────────────────────────────

export type ClaveEmpresaDemo = "A" | "B";

export interface ContextoReceta {
  /** Cliente dueño (`DIRECT_URL`), sin la extensión de empresa: lee, y marca `es_demo` (D5.3). */
  dueno: PrismaClient;
}

export interface OpcionesReceta {
  /** La de `DEMO_QA_CONTRASENA`, ya validada por la guardia. Llega por parámetro, nunca de `process.env`. */
  contrasena: string;
  /** Reloj de la receta (`geocoded_at`, el corte de mañana). Por defecto, `new Date()`. */
  ahora?: () => Date;
  /** Bytes de la evidencia y los comprobantes. Por defecto, `e2e/fixtures/evidencia.jpg`. */
  evidencia?: Uint8Array;
  /** Fuerza el recorte de B (D19). Por defecto, `RECORTE_DE_B`. Solo afecta a B. */
  recortarB?: boolean;
}

export interface UsuarioDemo {
  perfil: string;
  correo: string;
}

export interface ComprobacionEmpresaDemo {
  /** Órdenes vivas por estado, con los 20 de `ORDER_STATUS_SEED` (0 si no hay). */
  ordenesPorEstado: Record<string, number>;
  /** Estados vigentes sin órdenes que la receta debía dejar: la demo sale con 1 (R15). */
  estadosFaltantes: string[];
  /** Estados sin órdenes por decisión (recorte de B, corte de mañana apagado): solo se listan. */
  estadosFaltantesPorDecision: string[];
  /** Órdenes en estados asignables a las que el gate no da `asignable` (R21). */
  noAsignables: number;
  /** Jobs de la empresa aún `pending`/`processing`, por tipo (R22). */
  jobsAbiertos: Record<string, number>;
  /** Filas por tabla que debía estar vacía (R24). Solo las que tienen alguna. */
  tablasConFilas: Record<string, number>;
  /** Todo lo de arriba en orden. */
  limpia: boolean;
}

export interface ResumenEmpresaDemo {
  clave: ClaveEmpresaDemo;
  slug: string;
  organizacionId: string;
  recortada: boolean;
  usuarios: UsuarioDemo[];
  /** Jobs de geocodificación cerrados como hechos al ubicar (D6.1) y los cerrados sin ejecutar (D6.2). */
  jobsCerrados: { completados: Record<string, number>; sinEjecutar: Record<string, number> };
  /** Tipos de job que la receta no esperaba (R23): la demo sale con 1 nombrándolos. */
  tiposNoEsperados: string[];
  comprobacion: ComprobacionEmpresaDemo;
  duracionMs: number;
}

// ─── Utilidades ────────────────────────────────────────────────────────────────────────────────

/** Un paso de servicio que no fue `ok` corta la receta: los datos no estarían completos. */
function exigir<T extends { status: string }>(paso: string, r: T): T {
  if (r.status !== "ok") {
    // Solo el estado y los nombres de campo: el detalle de un servicio puede llevar datos de la orden.
    const campos =
      "fieldErrors" in r && r.fieldErrors && typeof r.fieldErrors === "object" ? Object.keys(r.fieldErrors) : [];
    throw new Error(`[demo-qa] «${paso}» no fue ok: ${r.status}${campos.length > 0 ? ` (${campos.join(", ")})` : ""}`);
  }
  return r;
}

function correoDemo(clave: ClaveEmpresaDemo, perfil: string): string {
  return `demo-qa-${clave.toLowerCase()}-${perfil}@example.test`;
}

function evidenciaPorDefecto(): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL("../../e2e/fixtures/evidencia.jpg", import.meta.url))));
}

/**
 * El distrito del catálogo, por su `codigo_dta` (D22) en Costa Rica, en la forma que piden las
 * plantillas de carga.
 */
async function geoDe(dueno: PrismaClient, distrito: DistritoDemo): Promise<Geo> {
  // SL-20 (decisión 3): el código es único por país, no global. Se busca en el país de la demo.
  const fila = await dueno.distrito.findUnique({
    where: claveDeDistritoDemo(distrito),
    select: { id: true, nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
  });
  if (!fila) {
    throw new Error(`[demo-qa] el catálogo no tiene el distrito ${distrito.codigoDta} en ${PAIS_DEMO} (¿base sin migrar?)`);
  }
  return { distritoId: fila.id, provincia: fila.canton.provincia.nombre, canton: fila.canton.nombre, distrito: fila.nombre };
}

/**
 * El cobro de la plataforma lo fija el superadmin, que no tiene empresa (SL-40). Aquí lo fija la
 * demo, no una persona: `CobroPlataformaService` solo mira el rol y no escribe el `usuarioId`.
 */
const ACTOR_PLATAFORMA: Actor = { usuarioId: "demo-qa", rol: "superadmin", zonaId: null, organizacionId: null };

// ─── La receta ──────────────────────────────────────────────────────────────────────────────────

/**
 * Crea una empresa demo entera (alta, marca, datos de R12–R19), cierra su cola y la comprueba
 * (D6.3). Devuelve el resumen sin secretos; decidir el código de salida es del entrypoint (T9).
 * Un paso de servicio que falla lanza: la empresa queda marcada y la siguiente ejecución la borra (R28).
 */
export async function crearEmpresaDemo(
  ctx: ContextoReceta,
  clave: ClaveEmpresaDemo,
  opciones: OpcionesReceta,
): Promise<ResumenEmpresaDemo> {
  const inicio = Date.now();
  const { dueno } = ctx;
  const ahora = opciones.ahora ?? (() => new Date());
  const bytesEvidencia = opciones.evidencia ?? evidenciaPorDefecto();
  const recortada = clave === "B" && (opciones.recortarB ?? RECORTE_DE_B);
  const porEstado = recortada ? 1 : 2;
  const datos = EMPRESAS_DEMO.find((e) => e.clave === clave);
  if (!datos) throw new Error(`[demo-qa] empresa demo desconocida: ${clave}`);
  const nombreEmpresa = datos.nombre;

  const app = getPrismaClient();
  const jobs: DepsJobsDemo = crearDepsJobsDemo(app);
  const usuarios: UsuarioDemo[] = [];
  const completados: Record<string, number> = {};
  const evidencias = (): EvidenciaArchivo[] => [{ contentType: "image/jpeg", bytes: bytesEvidencia }];

  // ── Ubicación (D6.1): cada orden se registra con su distrito al nacer y se ubica en el acto ──
  const distritoDeOrden = new Map<string, DistritoDemo>();
  const ubicadas = new Set<string>();
  const indicePorDistrito = new Map<string, number>();

  async function ubicar(organizacionId: string, ordenIds: readonly string[]): Promise<void> {
    const pendientes = ordenIds.filter((id) => !ubicadas.has(id));
    if (pendientes.length === 0) return;
    // La dirección se lee como quedó guardada: la clave del job sale de ella, no de lo que se mandó.
    const filas = await dueno.orden.findMany({ where: { id: { in: pendientes } }, select: { id: true, direccion: true } });
    const aUbicar: OrdenAUbicar[] = filas.map((f) => {
      const distrito = distritoDeOrden.get(f.id);
      if (!distrito) throw new Error("[demo-qa] una orden sin distrito registrado no se puede ubicar");
      const indice = indicePorDistrito.get(distrito.codigoDta) ?? 0;
      indicePorDistrito.set(distrito.codigoDta, indice + 1);
      return { id: f.id, direccion: f.direccion, distrito, indice };
    });
    const r = await ubicarOrdenes(jobs, organizacionId, aUbicar, ahora());
    completados.geocodificacion = (completados.geocodificacion ?? 0) + r.jobsGeocodificacionCerrados;
    for (const o of aUbicar) ubicadas.add(o.id);
  }

  // ── Alta de la empresa y de sus usuarios, con los correos fijos de D7 ──
  const perfilDe: Record<string, string> = { tienda: "tienda-bodega", "admin-satelite": "satelite" };
  const nucleo = escenarioReparto({
    lector: () => dueno,
    evidencia: () => bytesEvidencia,
    // El nucleo la llama justo antes de asignar: las órdenes ya están ubicadas desde que nacieron,
    // así que solo actúa si alguna se escapó a ese paso.
    prepararAsignacion: (ordenIds) => ubicar(escenario.empresa.organizacionId, ordenIds),
    altas: {
      empresa: async () => {
        const empresa = await crearEmpresa(
          dueno,
          {
            nombre: datos.nombre,
            slug: datos.slug,
            // SL-20 (decisión 3): explícito, aunque la fábrica ya ponga `CR` por defecto.
            paisId: PAIS_DEMO,
            correoMaestro: correoDemo(clave, "maestro"),
            contrasena: opciones.contrasena,
            documentoMaestro: `demo-qa-${clave.toLowerCase()}-maestro`,
            marcarContrasenaDefinida: true,
          },
          { ficha: "SL-43", motivo: "demo de QA: alta de la empresa demo" },
        );
        // Justo después del alta: si el proceso muere aquí, la siguiente ejecución para por R10.
        await marcarDemo(dueno, empresa.organizacionId, datos.slug);
        usuarios.push({ perfil: "maestro", correo: empresa.maestro.email });
        return empresa;
      },
      usuario: async (empresa, perfilNucleo, rol, extra) => {
        const perfil = perfilDe[perfilNucleo] ?? perfilNucleo;
        return altaUsuario(empresa, perfil, rol, extra);
      },
    },
  });

  async function altaUsuario(
    empresa: EmpresaCreada,
    perfil: string,
    rol: RolValue,
    extra: { zonaId?: string; vehiculoId?: string; fulfillment?: boolean } = {},
  ): Promise<UsuarioCreado> {
    const correo = correoDemo(clave, perfil);
    const u = await crearUsuario(dueno, empresa, rol, {
      correo,
      contrasena: opciones.contrasena,
      nombre: `${perfil} ${nombreEmpresa}`,
      ...extra,
    });
    usuarios.push({ perfil, correo });
    return u;
  }

  const [geoCentral, geoSatelite, geoEspecial] = await Promise.all([
    geoDe(dueno, DISTRITOS_DEMO.central),
    geoDe(dueno, DISTRITOS_DEMO.satelite),
    geoDe(dueno, DISTRITOS_DEMO.especial),
  ]);

  const escenario: EscenarioReparto = await nucleo.crearEscenarioReparto(datos.slug, {
    tarifa: TARIFA_TIENDA,
    tarifaMensajero: PAGO_MENSAJERO,
    distritos: { central: geoCentral, satelite: geoSatelite },
    nombresZona: { central: `Central ${datos.nombre}`, satelite: `Satelite ${datos.nombre}` },
    // R13: un distrito de la zona central marcado como zona especial (SL-38). Sin órdenes en él.
    distritosExtra: { central: [geoEspecial.distritoId] },
  });
  const org = escenario.empresa.organizacionId;
  const { maestro, tienda: tiendaBodega, adminSatelite } = escenario.actores;
  const s = servicios();

  // R19: la excepción de cobro va ANTES de la primera orden, porque el cargo se calcula al nacer.
  exigir(
    "CobroPlataformaService.fijarDeEmpresa",
    await new CobroPlataformaService(new CobroPlataformaTarifaRepository(app)).fijarDeEmpresa(
      ACTOR_PLATAFORMA,
      fijarCobroEmpresaSchema.parse({ organizacionId: org, monto: COBRO_PLATAFORMA_POR_ORDEN }),
    ),
  );

  // R12: los demás perfiles. Mensajeros de más por las reglas de T1 §2: recolector (R-c), corte
  // (R-b), un cierre rechazado, un cierre pendiente y las órdenes en reposo (R-a).
  const admin = await altaUsuario(escenario.empresa, "admin", "admin");
  const tiendaSinBodegaUsuario = await altaUsuario(escenario.empresa, "tienda", "adminTienda", { fulfillment: false });
  const tiendaSinBodega = actorDe(escenario.empresa, tiendaSinBodegaUsuario, "adminTienda", null);
  const actorAdmin = actorDe(escenario.empresa, admin, "admin", null);
  const mensajero = (zona: ZonaTipo, perfil: string): Promise<MensajeroEscenario> =>
    nucleo.crearMensajero(escenario, zona, { perfil });
  const mCentral = await mensajero("central", "mensajero-central");
  const mSatelite = await mensajero("satelite", "mensajero-satelite");
  const mRecolector = await mensajero("central", "mensajero-recolector");
  const mCorte = NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? await mensajero("central", "mensajero-corte") : null;
  const mRechazado = await mensajero("central", "mensajero-cierre-rechazado");
  const mPendiente = await mensajero("central", "mensajero-cierre-pendiente");
  const mReposo = await mensajero("central", "mensajero-reposo");

  // R13: la tarifa de la segunda tienda y la zona especial.
  exigir(
    "TarifaService.crear",
    await conEmpresa(org, () =>
      s.tarifa.crear(
        crearTarifaSchema.parse({
          tiendaId: tiendaSinBodegaUsuario.id,
          ...TARIFA_TIENDA,
          valorFleteGam: TARIFA_TIENDA.valorFlete,
          valorFleteDevueltoGam: TARIFA_TIENDA.valorFleteDevuelto,
          comisionCod: 0,
          ivaFlete: 0,
          ivaComisionCod: 0,
        }),
        maestro,
      ),
    ),
  );
  exigir(
    "DistritoZonaEspecialService.actualizar",
    await conEmpresa(org, () =>
      new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(app)).actualizar(
        distritosEspecialesSchema.parse({ marcar: [geoEspecial.distritoId], desmarcar: [] }),
        maestro,
      ),
    ),
  );

  // R12, R14: la API key, por su servicio. Crea su propio usuario `apiKey` (correo sintético y
  // contraseña aleatoria que nadie conoce). Carga a nombre de la tienda sin bodega (feature 302),
  // que tiene tarifa. El secreto vive solo en esta función.
  const apiKey = exigir(
    "ApiKeyService.generar",
    await conEmpresa(org, () =>
      new ApiKeyService(new ApiKeyRepository(app)).generar(
        generarApiKeySchema.parse({
          identificador: `Demo QA ${clave} API`,
          tiendaDestinoId: tiendaSinBodegaUsuario.id,
        }),
        maestro,
      ),
    ),
  );
  if (apiKey.status !== "ok") throw new Error("inalcanzable");
  const usuarioApi = await dueno.usuario.findUniqueOrThrow({ where: { id: apiKey.apiKey.usuarioId }, select: { email: true } });
  usuarios.push({ perfil: "api", correo: usuarioApi.email });

  // ── Órdenes (R14) ───────────────────────────────────────────────────────────────────────────
  let correlativo = 0;
  const siguienteRemision = () => `DEMO-${clave}-${String(++correlativo).padStart(3, "0")}`;
  const distritoDe = (zona: ZonaTipo) => (zona === "central" ? DISTRITOS_DEMO.central : DISTRITOS_DEMO.satelite);

  /**
   * Órdenes de la tienda con bodega propia: nacen `en_preparacion`. Una carga por orden con
   * `BulkOrdenService.cargarMasiva`, montado como en `app/api/ordenes/carga-masiva/chunk/route.ts`.
   */
  async function ordenesDeBodega(zona: ZonaTipo, cantidad: number, montoCobrar = 0): Promise<OrdenEscenario[]> {
    const creadas: OrdenEscenario[] = [];
    for (let i = 0; i < cantidad; i++) {
      const numRemision = siguienteRemision();
      const o = await nucleo.crearOrden(escenario, {
        zona,
        numRemision,
        destinatario: `Cliente ${numRemision}`,
        montoCobrar,
      });
      distritoDeOrden.set(o.id, distritoDe(zona));
      creadas.push(o);
    }
    await ubicar(org, creadas.map((o) => o.id));
    return creadas;
  }

  const n = porEstado;
  await ordenesDeBodega("central", n); // se quedan en `en_preparacion`, donde nacen
  const aBodegaCentral = await ordenesDeBodega("central", n);
  const aRutaSatelite = await ordenesDeBodega("satelite", n);
  const aBodegaSatelite = await ordenesDeBodega("satelite", n);
  // Con monto: la indemnización no puede pasar de lo que vale la orden.
  const aIncidente = recortada ? [] : await ordenesDeBodega("central", n, MONTO_A_COBRAR);
  // Solo la primera entrega cobra: la tienda tiene que terminar DEBIENDO a la empresa (fletes y
  // devoluciones por encima de lo cobrado) para que su abono de R18 tenga deuda que saldar. Sin
  // las devoluciones del recorte, esa deuda la ponen fletes de entregas sin cobro.
  const entregas = [
    ...(await ordenesDeBodega("central", 1, MONTO_A_COBRAR)),
    ...(await ordenesDeBodega("central", recortada ? ENTREGAS_SIN_COBRO_CON_RECORTE : n - 1)),
  ];
  const reprogramadas = await ordenesDeBodega("central", n);
  const novedades = await ordenesDeBodega("central", recortada ? n : 2 * n);
  const rechazosCentral = recortada ? [] : await ordenesDeBodega("central", 2 * n);
  const rechazosSatelite = recortada ? [] : await ordenesDeBodega("satelite", 3 * n);
  // Con monto: la bodega satélite recibe ese efectivo al cerrar (ficha 431 exige un importe > 0).
  const entregaSatelite = await ordenesDeBodega("satelite", 1, MONTO_ENTREGA_SATELITE);
  const aCorte = mCorte ? await ordenesDeBodega("central", n) : [];
  const aCierreRechazado = await ordenesDeBodega("central", 1);
  const aCierrePendiente = await ordenesDeBodega("central", 1);
  const aRecoger = await ordenesDeBodega("central", n);
  const enReparto = await ordenesDeBodega("central", n);

  /**
   * La pantalla de órdenes: el archivo se parsea en el navegador y sus filas viajan por
   * `procesarEnChunks` al route `carga-masiva/chunk`, primero en validación (`dryRun`) y después
   * en firme. Se usa ese mismo orquestador contra el handler real, con el actor de la tienda en
   * lugar de la cookie. Las órdenes de la tienda sin bodega nacen `por_recolectar_en_tienda`.
   */
  async function ordenesPorPantalla(cantidad: number): Promise<{ id: string; numGuia: number }[]> {
    const remisiones = Array.from({ length: cantidad }, siguienteRemision);
    const filas = remisiones.map((num, i) => ({
      linea: i + 1,
      row: {
        num_remision: num,
        destinatario: `Cliente ${num}`,
        telefono: TELEFONO,
        producto: "Paquete demo",
        provincia: geoCentral.provincia,
        canton_distrito: `${geoCentral.canton} (${geoCentral.distrito})`,
        direccion: DIRECCION,
        notas: "",
        monto_cobrar: "",
      },
    }));
    const handler = (input: RequestInfo | URL, init?: RequestInit) =>
      handleCargaMasivaChunk(new Request(new URL(String(input), "http://demo-qa.invalid"), init), {
        getActor: async () => tiendaSinBodega,
      });
    await conEmpresa(org, async () => {
      for (const dryRun of [true, false]) {
        const r = await procesarEnChunks(filas, { dryRun, chunkSize: cargaMasivaConfig.CHUNK_SIZE, fetchImpl: handler });
        const malas = r.filter((x) => x.resultado !== "creada").length;
        if (malas > 0) throw new Error(`[demo-qa] la carga por pantalla dejó ${malas} fila(s) sin crear`);
      }
    });
    return ordenesPorRemision(remisiones, DISTRITOS_DEMO.central);
  }

  /** La API: `handleCargaApi` con una `Request` real y la key en el `Authorization` (D5.1). */
  async function ordenesPorApi(cantidad: number): Promise<{ id: string; numGuia: number }[]> {
    if (apiKey.status !== "ok") throw new Error("inalcanzable");
    const remisiones = Array.from({ length: cantidad }, siguienteRemision);
    const cuerpo = {
      name: `Demo QA ${clave} por API`,
      ordenes: remisiones.map((num) => ({
        num_remision: num,
        destinatario: `Cliente ${num}`,
        telefono: TELEFONO,
        producto: "Paquete demo",
        provincia: geoCentral.provincia,
        canton: geoCentral.canton,
        distrito: geoCentral.distrito,
        direccion: DIRECCION,
        notas: "",
        monto_cobrar: String(MONTO_A_COBRAR),
      })),
    };
    // Fuera de `conEmpresa`: el handler fija él mismo la empresa de la key.
    const res = await handleCargaApi(
      new Request("http://demo-qa.invalid/api/ordenes/api-key/carga", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey.plainKey}`, "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    );
    if (res.status !== 200) throw new Error(`[demo-qa] la carga por API respondió ${res.status}`);
    const json = (await res.json()) as { creadas?: number; etiquetasPdf?: unknown };
    if (json.creadas !== cantidad) throw new Error(`[demo-qa] la carga por API creó ${json.creadas ?? 0} de ${cantidad}`);
    if (json.etiquetasPdf !== null && typeof json.etiquetasPdf === "object" && "error" in json.etiquetasPdf) {
      throw new Error("[demo-qa] la carga por API no pudo generar el PDF de etiquetas");
    }
    return ordenesPorRemision(remisiones, DISTRITOS_DEMO.central);
  }

  async function ordenesPorRemision(remisiones: string[], distrito: DistritoDemo): Promise<{ id: string; numGuia: number }[]> {
    const filas = await dueno.orden.findMany({
      where: { organizacionId: org, numRemision: { in: remisiones } },
      select: { id: true, numGuia: true },
      orderBy: { numRemision: "asc" },
    });
    if (filas.length !== remisiones.length) throw new Error("[demo-qa] faltan órdenes recién cargadas");
    for (const f of filas) distritoDeOrden.set(f.id, distrito);
    await ubicar(org, filas.map((f) => f.id));
    return filas.map((f) => {
      if (f.numGuia === null) throw new Error("[demo-qa] una orden de la tienda sin bodega nació sin guía");
      return { id: f.id, numGuia: f.numGuia };
    });
  }

  const porPantalla = await ordenesPorPantalla(2 * n); // recolectando y en ruta a la central
  await ordenesPorApi(n); // se quedan por recolectar en la tienda

  // ── Bodega central y satélite ───────────────────────────────────────────────────────────────
  for (const o of aBodegaCentral) await nucleo.llevarA(escenario, o, "en_bodega_central");
  for (const o of aRutaSatelite) await nucleo.llevarA(escenario, o, "en_ruta_bodega_satelite");
  for (const o of aBodegaSatelite) await nucleo.llevarA(escenario, o, "en_bodega_satelite");

  // ── Incidente (ficha 158): lo reporta el maestro y lo aprueba el admin (R51: no el mismo) ──
  const incidentes = new IncidenteAdminService(
    new IncidenteAdminRepository(app, new WalletMovimientoRepository(app), new WalletIndemnizacionIncidenteFeedService()),
    new OrdenRepository(app),
    new OrdenHistorialRepository(app),
    new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
    new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
  );
  const incidenteIds: string[] = [];
  for (const o of aIncidente) {
    await nucleo.llevarA(escenario, o, "en_bodega_central");
    const datosReporte = reportarIncidenteSchema.pick({ ordenId: true, causa: true, motivo: true }).parse({
      ordenId: o.id,
      causa: "danado",
      motivo: "Caja golpeada en bodega",
    });
    const r = exigir(
      "IncidenteAdminService.reportar",
      await conEmpresa(org, () => incidentes.reportar({ ...datosReporte, evidencias: evidencias() }, maestro)),
    );
    if (r.status === "ok") incidenteIds.push(r.incidenteId);
  }
  if (incidenteIds.length > 0) {
    const a = aprobarIncidenteSchema.parse({ incidenteId: incidenteIds[0], monto: INDEMNIZACION });
    exigir("IncidenteAdminService.aprobar", await conEmpresa(org, () => incidentes.aprobar(a.incidenteId, a.monto, actorAdmin)));
  }

  // ── Mensajero central: entregas (una con pago mixto), reprogramadas, novedades y rechazos ──
  const cierres = escenarioCierres({ lector: () => dueno });
  const alReparto = async (ordenes: OrdenEscenario[], m: MensajeroEscenario) => {
    for (const o of ordenes) await nucleo.llevarA(escenario, o, "en_reparto", { mensajero: m });
  };
  await alReparto([...entregas, ...reprogramadas, ...novedades, ...rechazosCentral], mCentral);
  for (const [i, o] of entregas.entries()) {
    // R16: la que cobra, con pago mixto. Casi todo electrónico a propósito: el pago al mensajero de
    // R18 es lo que su cierre le debe MENOS el efectivo que ya tiene en la mano (`min(P, E)`); con
    // la entrega en efectivo no quedaría nada que pagarle.
    const pagos =
      i === 0
        ? [
            { metodo: "efectivo" as const, monto: EFECTIVO_DEL_PAGO_MIXTO },
            { metodo: "transferencia" as const, monto: MONTO_A_COBRAR - EFECTIVO_DEL_PAGO_MIXTO },
          ]
        : [];
    await nucleo.gestionar(escenario, o, mCentral, { resultado: "entregado", pagos });
  }
  for (const o of reprogramadas) await nucleo.gestionar(escenario, o, mCentral, { resultado: "reprogramado" });
  for (const o of novedades) await nucleo.gestionar(escenario, o, mCentral, { resultado: "novedad" });
  for (const o of rechazosCentral) {
    await nucleo.gestionar(escenario, o, mCentral, { resultado: "devolucion_a_origen_por_rechazo" });
  }
  const cierreCentral = await solicitarCierre(escenario, mCentral);
  await cierres.aprobarCierre(escenario, cierreCentral); // lo aprueba el maestro (zona central)

  // ── Mensajero satélite: rechazos y una entrega; aprueba el adminSatelite y se cierra la bodega ──
  await alReparto([...rechazosSatelite, ...entregaSatelite], mSatelite);
  for (const o of rechazosSatelite) {
    await nucleo.gestionar(escenario, o, mSatelite, { resultado: "devolucion_a_origen_por_rechazo" });
  }
  for (const o of entregaSatelite) await nucleo.gestionar(escenario, o, mSatelite, { resultado: "entregado" });
  const cierreSatelite = await solicitarCierre(escenario, mSatelite);
  await cierres.aprobarCierre(escenario, cierreSatelite); // lo aprueba el adminSatelite

  // R17: el cierre de la bodega satélite consolida el cierre aprobado de su zona. Lo «aprueba» el
  // maestro marcándolo recibido con el efectivo que trae (ficha 431): es lo que monta
  // `/cierres-admin` en lugar del «Aprobar» retirado. `aprobarCierreBodega` ya no deja la fila
  // coherente con `cierre_bodega_conciliacion_coherente` y la base lo rechaza.
  const cierreBodega = exigir(
    "CierreBodegaService.solicitarCierreBodega",
    await conEmpresa(org, () =>
      new CierreBodegaService(new CierreBodegaRepository(app), new OrdenRepository(app)).solicitarCierreBodega(adminSatelite),
    ),
  );
  if (cierreBodega.status !== "ok") throw new Error("inalcanzable");
  const recibida = marcarConsolidacionRecibidaSchema.parse({
    cierreBodegaId: cierreBodega.cierreBodegaId,
    montoRecibido: cierreBodega.totales.efectivo,
  });
  exigir(
    "ConciliacionSatelitesService.marcarRecibida",
    await conEmpresa(org, () =>
      new ConciliacionSatelitesService(
        new SaldosSatelitesRepository(app),
        new CierresBodegaAdminRepository(app),
      ).marcarRecibida(recibida, maestro),
    ),
  );

  // ── Devoluciones (fichas 139, 48 y 419) ─────────────────────────────────────────────────────
  if (!recortada) {
    const ordenRepo = new OrdenRepository(app);
    // Satélite: 1/3 se queda por devolver a la central, 2/3 salen hacia ella y la mitad de esas llega.
    const haciaCentral = rechazosSatelite.slice(n);
    for (const o of haciaCentral) {
      exigir(
        "EnvioDevolucionCentralService.enviarACentral",
        await conEmpresa(org, () => new EnvioDevolucionCentralService(ordenRepo).enviarACentral(o.id, adminSatelite)),
      );
    }
    for (const o of haciaCentral.slice(n)) {
      exigir(
        "RecepcionBodegaCentralService.recibirEnBodegaCentral",
        await conEmpresa(org, async () =>
          new RecepcionBodegaCentralService(ordenRepo).recibirEnBodegaCentral(await guiaDe(o), maestro),
        ),
      );
    }
    // Central: todas salen hacia la tienda; la mitad llega (una por escáner de la tienda y otra
    // confirmada por la central con su comprobante).
    for (const o of rechazosCentral) {
      exigir(
        "DevolucionOrigenService.devolverATienda",
        await conEmpresa(org, () => new DevolucionOrigenService(ordenRepo).devolverATienda(o.id, maestro)),
      );
    }
    const [porEscaner, porComprobante] = rechazosCentral.slice(n);
    exigir(
      "RecepcionOrigenService.recibirEnOrigen",
      await conEmpresa(org, async () => new RecepcionOrigenService(ordenRepo).recibirEnOrigen(await guiaDe(porEscaner), tiendaBodega)),
    );
    exigir(
      "DevolucionTiendaService.confirmarEntrega",
      await conEmpresa(org, () =>
        new DevolucionTiendaService(
          new DevolucionTiendaRepository(app),
          new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
          new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
        ).confirmarEntrega({ tiendaId: escenario.tienda.id, ordenIds: [porComprobante.id], evidencias: evidencias() }, maestro),
      ),
    );
  }

  async function guiaDe(o: { id: string }): Promise<number> {
    const f = await dueno.orden.findUniqueOrThrow({ where: { id: o.id }, select: { numGuia: true } });
    if (f.numGuia === null) throw new Error("[demo-qa] una orden devuelta sin guía");
    return f.numGuia;
  }

  // ── Dinero (R18, R19) ───────────────────────────────────────────────────────────────────────
  await registrarDinero();

  async function registrarDinero(): Promise<void> {
    const caja = new WalletMovimientoRepository(app);
    // El día calendario de la app: el de las fechas de pago y del aporte.
    const hoy = fechaCalendarioCR(ahora());
    const comprobante = { contentType: "image/jpeg", bytes: bytesEvidencia };

    // Aporte de capital con su comprobante en Storage.
    const aporte = registrarAporteCapitalSchema.parse({
      claveIdempotencia: randomUUID(),
      clase: "aporte",
      monto: APORTE_CAPITAL,
      fecha: hoy,
      motivo: "Capital inicial de la demo",
    });
    const { comprobante: _sinArchivoAporte, ...entradaAporte } = aporte;
    void _sinArchivoAporte;
    exigir(
      "AporteCapitalService.registrar",
      await conEmpresa(org, () =>
        new AporteCapitalService(
          new AporteCapitalRepository(app),
          new CajaAporteCapitalFeedService(caja),
          caja,
          new SupabaseFileStorage(undefined, walletComprobanteConfig.BUCKET),
          new SupabaseSignedUrlProvider(undefined, walletComprobanteConfig.BUCKET),
          (fn) => app.$transaction((tx) => fn(tx)),
        ).registrar(entradaAporte, comprobante, maestro),
      ),
    );

    // Pago al mensajero central, contra su cierre aprobado.
    exigir(
      "LiquidacionService.registrarPagoMensajero",
      await conEmpresa(org, () =>
        new LiquidacionService(
          new LiquidacionPagoRepository(app),
          new WalletTiendaMovimientoRepository(app),
          new PagoMensajeroMovimientoRepository(app),
          (fn) => app.$transaction((tx) => fn(tx)),
          new CajaPagoTiendaFeedService(caja),
          new LiquidacionRepartoRepository(app),
          undefined,
          undefined,
          buildComprobantes(app),
        ).registrarPagoMensajero(
          registrarPagoMensajeroSchema.parse({
            cierreId: cierreCentral,
            claveIdempotencia: randomUUID(),
            monto: PAGO_A_MENSAJERO,
            metodo: "efectivo",
            fechaPago: hoy,
          }),
          maestro,
        ),
      ),
    );

    // Abono de la tienda con bodega.
    const abono = registrarAbonoTiendaSchema.parse({
      claveIdempotencia: randomUUID(),
      tiendaId: escenario.tienda.id,
      monto: ABONO_DE_TIENDA,
      metodo: "efectivo",
      motivo: "Abono de la demo",
      fechaPago: hoy,
    });
    const { comprobante: _sinArchivoAbono, ...entradaAbono } = abono;
    void _sinArchivoAbono;
    exigir(
      "AbonoTiendaService.registrar",
      await conEmpresa(org, () =>
        new AbonoTiendaService(
          new AbonoTiendaRepository(app),
          new WalletTiendaMovimientoRepository(app),
          new LiquidacionPagoRepository(app),
          new UserRepository(app),
          new CajaAbonoTiendaFeedService(caja),
          new SupabaseFileStorage(undefined, walletComprobanteConfig.BUCKET),
          new SupabaseSignedUrlProvider(undefined, walletComprobanteConfig.BUCKET),
          (fn) => app.$transaction((tx) => fn(tx)),
        ).registrar(entradaAbono, comprobante, maestro),
      ),
    );

    // Pago a la plataforma (SL-45): el tope exige que la deuda de cargos ya cubra el monto.
    exigir(
      "WalletEgresoService.registrarEgreso(pago_plataforma)",
      await conEmpresa(org, () =>
        new WalletEgresoService(
          caja,
          app,
          buildComprobantes(app),
          new TopePagoPlataformaService(new CobroPlataformaMovimientoRepository(app), new PagoPlataformaRepository(app)),
        ).registrarEgreso(
          registrarEgresoConLateralesSchema.parse({
            tipoEgreso: "pago_plataforma",
            monto: PAGO_A_LA_PLATAFORMA,
            descripcion: "Pago a la plataforma de la demo",
            claveIdempotencia: randomUUID(),
          }),
          maestro,
        ),
      ),
    );
  }

  // ── Recolección en tienda (ficha 157), con su mensajero propio (R-c) ────────────────────────
  exigir(
    "GuiaAsignacionService.asignarRecoleccion",
    await conEmpresa(org, () =>
      s.guia.asignarRecoleccion({ ordenIds: porPantalla.map((o) => o.id), mensajeroId: mRecolector.id }, maestro),
    ),
  );
  const recoleccion = new RecoleccionTiendaService(
    new OrdenRepository(app),
    new GestionOrdenRepository(app),
    new OrdenHistorialRepository(app),
  );
  for (const o of porPantalla.slice(n)) {
    exigir(
      "RecoleccionTiendaService.recolectarEnTienda",
      await conEmpresa(org, () => recoleccion.recolectarEnTienda(o.numGuia, mRecolector.actor)),
    );
  }

  // ── Novedad interna (B1): el corte de mañana, solo para esta empresa ───────────────────────
  if (mCorte) {
    await alReparto(aCorte, mCorte);
    await corteDeManana(aCorte.map((o) => o.id));
  }

  async function corteDeManana(esperadas: string[]): Promise<void> {
    const antes = await estadosDeEmpresa();
    const corte = new CorteDiarioService(
      new CorteDiarioRepository(app),
      new CierreDiaRepository(app, new TarifaVigenteRepository(app)),
      new ZonaRepository(app),
      new OrdenRepository(app),
      new TarifaZonaMensajeroRepository(app),
      { warn: (m: string) => console.warn(m) },
      notificarCierreDiaVencidoReal,
    );
    const manana = new Date(ahora().getTime() + 24 * 60 * 60 * 1000);
    exigirUnVencido(await conEmpresa(org, () => corte.ejecutarCorte(manana)));
    const despues = await estadosDeEmpresa();
    // El corte mira a todos los mensajeros de la empresa: comprueba que solo movió las del corte.
    const cambiadas = [...despues].filter(([id, estado]) => antes.get(id) !== estado).map(([id]) => id);
    const esperado = new Set(esperadas);
    if (cambiadas.length !== esperadas.length || cambiadas.some((id) => !esperado.has(id))) {
      throw new Error(`[demo-qa] el corte de mañana movió ${cambiadas.length} orden(es); se esperaban ${esperadas.length}`);
    }
    if (esperadas.some((id) => despues.get(id) !== "novedad_interna")) {
      throw new Error("[demo-qa] el corte de mañana no dejó sus órdenes en novedad_interna");
    }
  }

  function exigirUnVencido(r: { vencidosCreados: number }): void {
    if (r.vencidosCreados !== 1) throw new Error(`[demo-qa] el corte creó ${r.vencidosCreados} cierre(s) vencido(s); se esperaba 1`);
  }

  async function estadosDeEmpresa(): Promise<Map<string, string>> {
    const filas = await dueno.orden.findMany({
      where: { organizacionId: org, deletedAt: null },
      select: { id: true, estatus: { select: { value: true } } },
    });
    return new Map(filas.map((f) => [f.id, f.estatus.value]));
  }

  // ── Después del corte: el rechazo de la tienda, los cierres sin aprobar y lo que queda en reposo ──
  if (!recortada) {
    // Ficha 240: la tienda dueña rechaza una novedad; la orden queda devolviéndose a origen.
    const rechazo = new RechazoTiendaService(
      new OrdenRepository(app),
      new GestionOrdenRepository(app),
      new TarifaVigenteRepository(app),
      new RechazoTiendaCobroRepository(app),
    );
    for (const o of novedades.slice(n)) {
      const r = rechazarNovedadSchema.parse({ ordenId: o.id, motivo: "La tienda no la reintenta" });
      exigir("RechazoTiendaService.rechazar", await conEmpresa(org, () => rechazo.rechazar(r.ordenId, r.motivo, tiendaBodega)));
    }
  }

  // R17: un cierre rechazado y uno solicitado sin decidir. Sus órdenes quedan en reparto.
  await alReparto(aCierreRechazado, mRechazado);
  for (const o of aCierreRechazado) await nucleo.gestionar(escenario, o, mRechazado, { resultado: "entregado" });
  await cierres.rechazarCierre(escenario, await solicitarCierre(escenario, mRechazado), "Falta el efectivo de una entrega");
  await alReparto(aCierrePendiente, mPendiente);
  for (const o of aCierrePendiente) await nucleo.gestionar(escenario, o, mPendiente, { resultado: "entregado" });
  await solicitarCierre(escenario, mPendiente);

  // Órdenes en reposo: recogiendo en bodega y en reparto (su mensajero no cierra: R-a).
  for (const o of aRecoger) await nucleo.llevarA(escenario, o, "mensajero_recogiendo_en_bodega", { mensajero: mReposo });
  await alReparto(enReparto, mReposo);

  // ── Cola y comprobación final ───────────────────────────────────────────────────────────────
  const cierre = await cerrarJobsSinEjecutar(jobs, org);
  const porDecision = [
    ...(recortada ? ESTADOS_RECORTADOS_DE_B : []),
    ...(NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? [] : ["novedad_interna"]),
  ];
  const comprobacion = await comprobarEmpresaDemo(ctx, org, { estadosPorDecision: porDecision });

  return {
    clave,
    slug: datos.slug,
    organizacionId: org,
    recortada,
    usuarios,
    jobsCerrados: { completados, sinEjecutar: cierre.cerradosPorTipo },
    tiposNoEsperados: cierre.tiposNoEsperados,
    comprobacion,
    duracionMs: Date.now() - inicio,
  };
}

/** D3.2: la marca de la demo, como dueño, sobre la empresa recién creada y solo esa. */
async function marcarDemo(dueno: PrismaClient, organizacionId: string, slug: string): Promise<void> {
  const filas = await dueno.$executeRaw(
    Prisma.sql`UPDATE "organizacion" SET "es_demo" = true WHERE "id" = ${organizacionId} AND "slug" = ${slug}`,
  );
  if (filas !== 1) throw new Error(`[demo-qa] marcar la empresa demo tocó ${filas} fila(s); se esperaba 1`);
}

// ─── Comprobación final (D6.3) ──────────────────────────────────────────────────────────────────

/**
 * D6.3 (R15, R21, R22, R24): recuento por estado contra los 20 vigentes, el gate real sobre las
 * asignables, la cola de la empresa cerrada y ninguna integración. `estadosPorDecision` son los que
 * pueden faltar sin que la demo falle (recorte de B, corte de mañana apagado): solo se listan.
 */
export async function comprobarEmpresaDemo(
  ctx: ContextoReceta,
  organizacionId: string,
  opciones: { estadosPorDecision?: readonly string[] } = {},
): Promise<ComprobacionEmpresaDemo> {
  const { dueno } = ctx;
  const app = getPrismaClient();
  const porDecision = new Set(opciones.estadosPorDecision ?? []);

  const grupos = await dueno.orden.groupBy({
    by: ["estatusId"],
    where: { organizacionId, deletedAt: null },
    _count: { _all: true },
  });
  const catalogo = await dueno.orderStatus.findMany({ select: { id: true, value: true } });
  const valorDe = new Map(catalogo.map((c) => [c.id, c.value]));
  const ordenesPorEstado: Record<string, number> = Object.fromEntries(ORDER_STATUS_SEED.map((e) => [e, 0]));
  for (const g of grupos) {
    const valor = valorDe.get(g.estatusId) ?? "desconocido";
    ordenesPorEstado[valor] = (ordenesPorEstado[valor] ?? 0) + g._count._all;
  }
  const vacios = ORDER_STATUS_SEED.filter((e) => ordenesPorEstado[e] === 0);
  const estadosFaltantes = vacios.filter((e) => !porDecision.has(e));
  const estadosFaltantesPorDecision = vacios.filter((e) => porDecision.has(e));

  // R21: el gate real, con la cola de la empresa en contexto.
  const asignables = await dueno.orden.findMany({
    where: { organizacionId, deletedAt: null, estatus: { value: { in: [...ESTADOS_ASIGNABLES] } } },
    select: { id: true, direccion: true, latitud: true, longitud: true, geocodeStatus: true },
  });
  const estados = await conEmpresa(organizacionId, () =>
    new AsignabilidadCoordenadasService(new JobRepository(app)).evaluar(
      asignables.map((o) => ({
        id: o.id,
        direccion: o.direccion,
        latitud: o.latitud === null ? null : o.latitud.toNumber(),
        longitud: o.longitud === null ? null : o.longitud.toNumber(),
        geocodeStatus: o.geocodeStatus,
      })),
    ),
  );
  const noAsignables = asignables.filter((o) => estados.get(o.id) !== "asignable").length;

  const jobsAbiertos = await jobsAbiertosPorTipo(crearDepsJobsDemo(app), organizacionId);

  const tablasConFilas: Record<string, number> = {};
  for (const tabla of TABLAS_SIN_FILAS) {
    // El nombre sale de una lista fija de este archivo, nunca de una entrada.
    const [fila] = await dueno.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*) AS n FROM ${Prisma.raw(`"${tabla}"`)} WHERE "organizacion_id" = ${organizacionId}`,
    );
    const filas = Number(fila?.n ?? 0);
    if (filas > 0) tablasConFilas[tabla] = filas;
  }

  const limpia =
    estadosFaltantes.length === 0 &&
    noAsignables === 0 &&
    asignables.length > 0 &&
    Object.keys(jobsAbiertos).length === 0 &&
    Object.keys(tablasConFilas).length === 0;
  return { ordenesPorEstado, estadosFaltantes, estadosFaltantesPorDecision, noAsignables, jobsAbiertos, tablasConFilas, limpia };
}
