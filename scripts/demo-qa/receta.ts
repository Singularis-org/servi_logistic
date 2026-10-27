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
  type DestinoReparto,
  type EscenarioReparto,
  type GestionEscenario,
  type Geo,
  type MensajeroEscenario,
  type NuevaOrden,
  type OrdenEscenario,
  type ZonaTipo,
} from "@/tests/fabricas/escenarios/reparto";

import { EMPRESAS_DEMO } from "./borrar";
import { PERFILES_DEMO, correoDemo, correosDemoDe } from "./correos";
import { DISTRITOS_DEMO, type DistritoDemo } from "./geografia";
import { enParalelo, enTandas } from "./paralelo";
import { enPaso } from "./paso";
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
//
// LO QUE VA A LA VEZ (medición del build, 2026-10-26). El build de QA va contra una base a ~50–90 ms
// por ida y vuelta, y cada consulta de la app en contexto de empresa son cuatro (BEGIN, `set_config`,
// la consulta, COMMIT: `extension-empresa.ts`). En serie, una empresa eran ~9.000 idas y vueltas y
// el build pasaba del tope. Por eso, sin cambiar ningún servicio ni ningún dato:
//   - los servicios de varias órdenes reciben varias (por lotes de `LOTE_POR_LLAMADA`), como la
//     pantalla con varias seleccionadas; la carga de la tienda con bodega es UNA carga masiva;
//   - lo que no depende entre sí va a la vez (`enParalelo`, `enTandas`): las altas de usuarios, las
//     tres vías de carga, la ubicación, y después los tramos de cada mensajero (central, satélite,
//     incidente, recolección, el reparto del corte). Lo de un mismo mensajero sigue de una en una;
//   - las barreras de arriba se respetan: los tramos terminan (cierres aprobados) antes del corte y
//     del dinero; el corte no comparte su ventana con nada que mueva órdenes; lo de después del
//     corte espera al corte.

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

/**
 * Órdenes por llamada a un servicio de varias (`generarGuia`, asignar, recoger…). Cada uno trabaja en
 * una transacción con el tiempo máximo por defecto de Prisma (5 s), unas ~6 idas y vueltas por orden:
 * con 90 ms por ida y vuelta (el build de QA), 33 órdenes en una sola llamada cayeron con P2028.
 * La demo ya corre con un `timeout` holgado (`TRANSACCION_DE_LA_DEMO` en `demo-qa.ts`), pero el lote
 * sigue: es también el tope de gestiones de cada mensajero (ver «Los tramos»).
 */
const LOTE_POR_LLAMADA = 4;

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

/**
 * Un servicio como paso con nombre (`paso.ts`): si lanza o no es `ok`, la salida dice cuál fue y en
 * qué tramo. Es el que diagnostica un P2028 del build de QA.
 */
function llamar<T extends { status: string }>(paso: string, trabajo: () => Promise<T>): Promise<T> {
  return enPaso(paso, async () => exigir(paso, await trabajo()));
}

function evidenciaPorDefecto(): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL("../../e2e/fixtures/evidencia.jpg", import.meta.url))));
}

/** El distrito del catálogo, por su `codigo_dta` (D22), en la forma que piden las plantillas de carga. */
async function geoDe(dueno: PrismaClient, distrito: DistritoDemo): Promise<Geo> {
  const fila = await dueno.distrito.findUnique({
    where: { codigoDta: distrito.codigoDta },
    select: { id: true, nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
  });
  if (!fila) throw new Error(`[demo-qa] el catálogo no tiene el distrito ${distrito.codigoDta} (¿base sin migrar?)`);
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
  const slugEmpresa = datos.slug;
  // R12: un correo que pasa del tope de 64 para aquí, antes de dar de alta a nadie.
  correosDemoDe(slugEmpresa);

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
            correoMaestro: correoDemo(slugEmpresa, "maestro"),
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
    const correo = correoDemo(slugEmpresa, perfil);
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

  const escenario: EscenarioReparto = await enPaso("alta de la empresa, sus zonas y la tienda con bodega", () =>
    nucleo.crearEscenarioReparto(datos.slug, {
      tarifa: TARIFA_TIENDA,
      tarifaMensajero: PAGO_MENSAJERO,
      distritos: { central: geoCentral, satelite: geoSatelite },
      nombresZona: { central: `Central ${datos.nombre}`, satelite: `Satelite ${datos.nombre}` },
      // R13: un distrito de la zona central marcado como zona especial (SL-38). Sin órdenes en él.
      distritosExtra: { central: [geoEspecial.distritoId] },
    }),
  );
  const org = escenario.empresa.organizacionId;
  const { maestro, tienda: tiendaBodega, adminSatelite } = escenario.actores;
  const s = servicios();

  // R12: los demás perfiles, por tandas a la vez (`enTandas`), los primeros con la excepción de
  // cobro. Mensajeros de más por las reglas de T1 §2: recolector (R-c), corte (R-b), un cierre
  // rechazado, un cierre pendiente y las órdenes en reposo (R-a). Y por tiempo: las gestiones de la
  // central y de la satélite se reparten entre varios (novedades, rechazos, satélite 2), porque las
  // de un mismo mensajero van de una en una (ver «Los tramos»).
  const mensajero = (zona: ZonaTipo, perfil: string): Promise<MensajeroEscenario> =>
    enPaso(`alta de ${perfil}`, () => nucleo.crearMensajero(escenario, zona, { perfil }));
  const [, admin, tiendaSinBodegaUsuario] = await enParalelo([
    // R19: la excepción de cobro va ANTES de la primera orden, porque el cargo se calcula al nacer.
    llamar("CobroPlataformaService.fijarDeEmpresa", () =>
      new CobroPlataformaService(new CobroPlataformaTarifaRepository(app)).fijarDeEmpresa(
        ACTOR_PLATAFORMA,
        fijarCobroEmpresaSchema.parse({ organizacionId: org, monto: COBRO_PLATAFORMA_POR_ORDEN }),
      ),
    ),
    enPaso("alta de admin", () => altaUsuario(escenario.empresa, "admin", "admin")),
    enPaso("alta de tienda", () => altaUsuario(escenario.empresa, "tienda", "adminTienda", { fulfillment: false })),
  ]);
  const perfilesDeMensajero: [ZonaTipo, string][] = [
    ["central", "mensajero-central"],
    ["central", "mensajero-novedades"],
    ["central", "mensajero-rechazos"],
    ["satelite", "mensajero-satelite"],
    ["satelite", "mensajero-satelite-2"],
    ["central", "mensajero-recolector"],
    ...(NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? ([["central", "mensajero-corte"]] as [ZonaTipo, string][]) : []),
    ["central", "mensajero-cierre-rechazado"],
    ["central", "mensajero-cierre-pendiente"],
    ["central", "mensajero-reposo"],
  ];
  // Los mensajeros no hacen falta hasta los tramos: se dan de alta mientras nacen las órdenes.
  const altaDeMensajeros = async () =>
    new Map(await enTandas(perfilesDeMensajero, async ([zona, perfil]) => [perfil, await mensajero(zona, perfil)] as const, 2));
  const tiendaSinBodega = actorDe(escenario.empresa, tiendaSinBodegaUsuario, "adminTienda", null);
  const actorAdmin = actorDe(escenario.empresa, admin, "admin", null);

  // R13: la tarifa de la segunda tienda y la zona especial; R12, R14: la API key, por su servicio.
  // La key crea su propio usuario `apiKey` (correo sintético y contraseña aleatoria que nadie
  // conoce) y carga a nombre de la tienda sin bodega (feature 302), que tiene tarifa. El secreto
  // vive solo en esta función.
  const [, , apiKey] = await enParalelo([
    llamar("TarifaService.crear", () => conEmpresa(org, () =>
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
    )),
    llamar("DistritoZonaEspecialService.actualizar", () => conEmpresa(org, () =>
      new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(app)).actualizar(
        distritosEspecialesSchema.parse({ marcar: [geoEspecial.distritoId], desmarcar: [] }),
        maestro,
      ),
    )),
    llamar("ApiKeyService.generar", () => conEmpresa(org, () =>
      new ApiKeyService(new ApiKeyRepository(app)).generar(
        generarApiKeySchema.parse({
          identificador: `Demo QA ${clave} API`,
          tiendaDestinoId: tiendaSinBodegaUsuario.id,
        }),
        maestro,
      ),
    )),
  ]);
  if (apiKey.status !== "ok") throw new Error("inalcanzable");
  const usuarioApi = await dueno.usuario.findUniqueOrThrow({ where: { id: apiKey.apiKey.usuarioId }, select: { email: true } });
  usuarios.push({ perfil: "api", correo: usuarioApi.email });

  // ── Órdenes (R14) ───────────────────────────────────────────────────────────────────────────
  let correlativo = 0;
  const siguienteRemision = () => `DEMO-${clave}-${String(++correlativo).padStart(3, "0")}`;

  /**
   * Las órdenes de la tienda con bodega propia, por grupo: nacen `en_preparacion`. Se piden todas
   * antes de crear ninguna, en el orden de este objeto (el de las remisiones), y nacen en UNA carga
   * de `BulkOrdenService.cargarMasiva`, montado como en `app/api/ordenes/carga-masiva/chunk/route.ts`.
   */
  const plan = (zona: ZonaTipo, cantidad: number, montoCobrar = 0): NuevaOrden[] =>
    Array.from({ length: cantidad }, () => {
      const numRemision = siguienteRemision();
      return { zona, numRemision, destinatario: `Cliente ${numRemision}`, montoCobrar };
    });
  const n = porEstado;
  const pedidas = {
    enPreparacion: plan("central", n), // se quedan en `en_preparacion`, donde nacen
    aBodegaCentral: plan("central", n),
    aRutaSatelite: plan("satelite", n),
    aBodegaSatelite: plan("satelite", n),
    // Con monto: la indemnización no puede pasar de lo que vale la orden.
    aIncidente: recortada ? [] : plan("central", n, MONTO_A_COBRAR),
    // Solo la primera entrega cobra: la tienda tiene que terminar DEBIENDO a la empresa (fletes y
    // devoluciones por encima de lo cobrado) para que su abono de R18 tenga deuda que saldar. Sin
    // las devoluciones del recorte, esa deuda la ponen fletes de entregas sin cobro.
    entregas: [
      ...plan("central", 1, MONTO_A_COBRAR),
      ...plan("central", recortada ? ENTREGAS_SIN_COBRO_CON_RECORTE : n - 1),
    ],
    reprogramadas: plan("central", n),
    novedades: plan("central", recortada ? n : 2 * n),
    rechazosCentral: recortada ? [] : plan("central", 2 * n),
    rechazosSatelite: recortada ? [] : plan("satelite", 3 * n),
    // Con monto: la bodega satélite recibe ese efectivo al cerrar (ficha 431 exige un importe > 0).
    entregaSatelite: plan("satelite", 1, MONTO_ENTREGA_SATELITE),
    aCorte: NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? plan("central", n) : [],
    aCierreRechazado: plan("central", 1),
    aCierrePendiente: plan("central", 1),
    aRecoger: plan("central", n),
    enReparto: plan("central", n),
  };

  /** Las órdenes de la tienda con bodega, por remisión. Las llena `ordenesDeBodega`. */
  const deBodega = new Map<string, OrdenEscenario>();
  async function ordenesDeBodega(): Promise<void> {
    const creadas = await nucleo.crearOrdenes(escenario, Object.values(pedidas).flat());
    for (const o of creadas) {
      distritoDeOrden.set(o.id, o.zona === "central" ? DISTRITOS_DEMO.central : DISTRITOS_DEMO.satelite);
      deBodega.set(o.numRemision, o);
    }
  }
  const creadas = (pedidasDeUnGrupo: readonly NuevaOrden[]): OrdenEscenario[] =>
    pedidasDeUnGrupo.map((p) => {
      const o = deBodega.get(p.numRemision ?? "");
      if (!o) throw new Error("[demo-qa] una orden pedida no aparece entre las creadas");
      return o;
    });

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

  /**
   * Las tres vías a la vez (son tiendas y caminos distintos; las remisiones de las dos últimas se
   * toman al empezar cada una, antes de su primer `await`, en el orden de este arreglo). Después,
   * a la vez, se ubican las de la bodega (D6.1) y las de la bodega central y la satélite llegan a su
   * sitio: llevarlas hasta la bodega no asigna, y el gate solo mira al asignar.
   */
  async function ordenesYBodegas(): Promise<{ id: string; numGuia: number }[]> {
    const [, porPantalla] = await enParalelo([
      enPaso("carga masiva de la tienda con bodega", ordenesDeBodega),
      enPaso("carga por pantalla de la tienda sin bodega", () => ordenesPorPantalla(2 * n)),
      enPaso("carga por API", () => ordenesPorApi(n)),
    ]);
    const aRutaSatelite = creadas(pedidas.aRutaSatelite);
    const aBodegaSatelite = creadas(pedidas.aBodegaSatelite);
    await enParalelo([
      enPaso("ubicar las órdenes de la tienda con bodega", () => ubicar(org, [...deBodega.values()].map((o) => o.id))),
      // Con las de la bodega central van las que se asignan después del corte: en la bodega, sin
      // mensajero, el corte no las mira (como las que se quedan allí).
      llevarA(
        creadas([...pedidas.aBodegaCentral, ...pedidas.aCierreRechazado, ...pedidas.aCierrePendiente, ...pedidas.aRecoger, ...pedidas.enReparto]),
        "en_bodega_central",
      ),
      (async () => {
        await llevarA([...aRutaSatelite, ...aBodegaSatelite], "en_ruta_bodega_satelite");
        await llevarA(aBodegaSatelite, "en_bodega_satelite");
      })(),
    ]);
    return porPantalla;
  }

  /** `llevarVariasA` del núcleo como paso con nombre, por lotes (`LOTE_POR_LLAMADA`). */
  const llevarA = (ordenes: OrdenEscenario[], destino: DestinoReparto, m?: MensajeroEscenario) =>
    enPaso(`llevar a ${destino}`, () => nucleo.llevarVariasA(escenario, ordenes, destino, { mensajero: m, lote: LOTE_POR_LLAMADA }));

  const [mensajeros, porPantalla] = await enPaso("órdenes y altas de mensajeros", () =>
    enParalelo([altaDeMensajeros(), ordenesYBodegas()]),
  );
  const elMensajero = (perfil: string): MensajeroEscenario => {
    const m = mensajeros.get(perfil);
    if (!m) throw new Error(`[demo-qa] falta el ${perfil}`);
    return m;
  };
  const mCentral = elMensajero("mensajero-central");
  const mNovedades = elMensajero("mensajero-novedades");
  const mRechazos = elMensajero("mensajero-rechazos");
  const mSatelite = elMensajero("mensajero-satelite");
  const mSatelite2 = elMensajero("mensajero-satelite-2");
  const mRecolector = elMensajero("mensajero-recolector");
  const mCorte = NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? elMensajero("mensajero-corte") : null;
  const mRechazado = elMensajero("mensajero-cierre-rechazado");
  const mPendiente = elMensajero("mensajero-cierre-pendiente");
  const mReposo = elMensajero("mensajero-reposo");

  const aIncidente = creadas(pedidas.aIncidente);
  const entregas = creadas(pedidas.entregas);
  const reprogramadas = creadas(pedidas.reprogramadas);
  const novedades = creadas(pedidas.novedades);
  const rechazosCentral = creadas(pedidas.rechazosCentral);
  const rechazosSatelite = creadas(pedidas.rechazosSatelite);
  const entregaSatelite = creadas(pedidas.entregaSatelite);
  const aCorte = creadas(pedidas.aCorte);
  const aCierreRechazado = creadas(pedidas.aCierreRechazado);
  const aCierrePendiente = creadas(pedidas.aCierrePendiente);
  const aRecoger = creadas(pedidas.aRecoger);
  const enReparto = creadas(pedidas.enReparto);

  const cierres = escenarioCierres({ lector: () => dueno });
  /** Lleva las órdenes hasta el reparto del mensajero: cada servicio, por lotes (`LOTE_POR_LLAMADA`). */
  const alReparto = (ordenes: OrdenEscenario[], m: MensajeroEscenario) => llevarA(ordenes, "en_reparto", m);
  const ordenRepo = new OrdenRepository(app);

  /** El cierre del día del mensajero, solicitado por él (`solicitarCierre` de la fábrica). */
  const solicitar = (m: MensajeroEscenario) => enPaso("solicitar el cierre", () => solicitarCierre(escenario, m));
  /** Lo aprueba quien lo haría en `/cierres-admin`: el maestro en la central, el adminSatelite en la satélite. */
  const aprobar = (cierreId: string) => enPaso("aprobar el cierre", () => cierres.aprobarCierre(escenario, cierreId));

  /**
   * Las órdenes de un mensajero, de la bodega al reparto y gestionadas, por lotes y encadenando:
   * mientras el mensajero recoge y gestiona un lote, la central ya guía y le asigna el siguiente. Lo
   * del mensajero va en orden y de una en una, como en su portal (solo puede tener una en gestión).
   */
  async function repartirYGestionar(
    ordenes: OrdenEscenario[],
    m: MensajeroEscenario,
    gestion: (o: OrdenEscenario) => GestionEscenario,
  ): Promise<void> {
    const lotes: OrdenEscenario[][] = [];
    for (let i = 0; i < ordenes.length; i += LOTE_POR_LLAMADA) lotes.push(ordenes.slice(i, i + LOTE_POR_LLAMADA));
    const asignados: Promise<unknown>[] = [];
    for (const lote of lotes) {
      const anterior = asignados[asignados.length - 1] ?? Promise.resolve();
      asignados.push(anterior.then(() => llevarA(lote, "mensajero_recogiendo_en_bodega", m)));
    }
    const delMensajero = (async () => {
      for (const [k, lote] of lotes.entries()) {
        await asignados[k];
        await llevarA(lote, "en_reparto", m);
        for (const o of lote) {
          const g = gestion(o);
          await enPaso(`gestionar(${g.resultado})`, () => nucleo.gestionar(escenario, o, m, g));
        }
      }
    })();
    await enParalelo([...asignados, delMensajero]);
  }

  /**
   * Un mensajero que reparte, gestiona y cierra con el cierre aprobado. Devuelve el cierre. Sin
   * órdenes (B recortada) no hay nada que cerrar: la app no deja pedir un cierre sin gestiones.
   */
  async function repartoConCierreAprobado(
    ordenes: OrdenEscenario[],
    m: MensajeroEscenario,
    gestion: (o: OrdenEscenario) => GestionEscenario,
  ): Promise<string | null> {
    if (ordenes.length === 0) return null;
    await repartirYGestionar(ordenes, m, gestion);
    const cierreId = await solicitar(m);
    await aprobar(cierreId);
    return cierreId;
  }

  // ── Los tramos, a la vez: cada uno con sus órdenes y su mensajero. Las gestiones de un mismo
  //    mensajero van de una en una (la app solo le deja una orden en gestión), así que el tramo más
  //    largo es el del mensajero con más gestiones: se reparten entre varios, ninguno con más de
  //    `LOTE_POR_LLAMADA` (medición del build, 2026-10-26: con las 12 de la central en un solo
  //    mensajero, su tramo era la ruta crítica de la demo) ───────────────────────────────────────

  /** Incidente (ficha 158): lo reporta el maestro y lo aprueba el admin (R51: no el mismo). */
  async function tramoIncidente(): Promise<void> {
    const incidentes = new IncidenteAdminService(
      new IncidenteAdminRepository(app, new WalletMovimientoRepository(app), new WalletIndemnizacionIncidenteFeedService()),
      new OrdenRepository(app),
      new OrdenHistorialRepository(app),
      new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
      new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
    );
    await llevarA(aIncidente, "en_bodega_central");
    // Cada reporte es de una orden distinta: van a la vez.
    const reportados = await enParalelo(
      aIncidente.map((o) => {
        const datosReporte = reportarIncidenteSchema.pick({ ordenId: true, causa: true, motivo: true }).parse({
          ordenId: o.id,
          causa: "danado",
          motivo: "Caja golpeada en bodega",
        });
        return llamar("IncidenteAdminService.reportar", () =>
          conEmpresa(org, () => incidentes.reportar({ ...datosReporte, evidencias: evidencias() }, maestro)),
        );
      }),
    );
    const incidenteIds = reportados.flatMap((r) => (r.status === "ok" ? [r.incidenteId] : []));
    if (incidenteIds.length > 0) {
      const a = aprobarIncidenteSchema.parse({ incidenteId: incidenteIds[0], monto: INDEMNIZACION });
      await llamar("IncidenteAdminService.aprobar", () =>
        conEmpresa(org, () => incidentes.aprobar(a.incidenteId, a.monto, actorAdmin)),
      );
    }
  }

  /**
   * Mensajero central: las entregas (una con pago mixto) y las reprogramadas; lo aprueba el maestro.
   * Devuelve el cierre aprobado: el pago al mensajero de R18 va contra él.
   */
  async function tramoCentral(): Promise<string> {
    const cierreId = await repartoConCierreAprobado([...entregas, ...reprogramadas], mCentral, (o) => {
      if (reprogramadas.includes(o)) return { resultado: "reprogramado" };
      // R16: la que cobra, con pago mixto. Casi todo electrónico a propósito: el pago al mensajero
      // de R18 es lo que su cierre le debe MENOS el efectivo que ya tiene en la mano (`min(P, E)`);
      // con la entrega en efectivo no quedaría nada que pagarle.
      return o === entregas[0]
        ? {
            resultado: "entregado",
            pagos: [
              { metodo: "efectivo", monto: EFECTIVO_DEL_PAGO_MIXTO },
              { metodo: "transferencia", monto: MONTO_A_COBRAR - EFECTIVO_DEL_PAGO_MIXTO },
            ],
          }
        : { resultado: "entregado", pagos: [] };
    });
    if (cierreId === null) throw new Error("[demo-qa] el mensajero central no tiene entregas");
    return cierreId;
  }

  /** Las novedades, con su mensajero; lo aprueba el maestro. La tienda rechaza la mitad después del corte. */
  async function tramoNovedades(): Promise<void> {
    await repartoConCierreAprobado(novedades, mNovedades, () => ({ resultado: "novedad" }));
  }

  /**
   * Los rechazos de la central, con su mensajero; lo aprueba el maestro. Después, sus devoluciones
   * (fichas 48 y 419): todas salen hacia la tienda y la mitad llega (una por escáner de la tienda y
   * otra confirmada por la central con su comprobante).
   */
  async function tramoRechazosCentral(): Promise<void> {
    if (rechazosCentral.length === 0) return;
    await repartoConCierreAprobado(rechazosCentral, mRechazos, () => ({ resultado: "devolucion_a_origen_por_rechazo" }));
    // Cada devolución es de una orden distinta: van a la vez.
    await enParalelo(
      rechazosCentral.map((o) =>
        llamar("DevolucionOrigenService.devolverATienda", () =>
          conEmpresa(org, () => new DevolucionOrigenService(ordenRepo).devolverATienda(o.id, maestro)),
        ),
      ),
    );
    const [porEscaner, porComprobante] = rechazosCentral.slice(n);
    await enParalelo([
      llamar("RecepcionOrigenService.recibirEnOrigen", () =>
        conEmpresa(org, async () => new RecepcionOrigenService(ordenRepo).recibirEnOrigen(await guiaDe(porEscaner), tiendaBodega)),
      ),
      llamar("DevolucionTiendaService.confirmarEntrega", () =>
        conEmpresa(org, () =>
          new DevolucionTiendaService(
            new DevolucionTiendaRepository(app),
            new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
            new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
          ).confirmarEntrega({ tiendaId: escenario.tienda.id, ordenIds: [porComprobante.id], evidencias: evidencias() }, maestro),
        ),
      ),
    ]);
  }

  /**
   * La satélite: dos mensajeros con los rechazos y una entrega; aprueba el adminSatelite y, con los
   * dos cierres aprobados, se cierra la bodega. Después, las devoluciones de la satélite (ficha 139):
   * 1/3 se queda por devolver a la central, 2/3 salen hacia ella y la mitad de esas llega.
   */
  async function tramoSatelite(): Promise<void> {
    const rechazadas = new Set(rechazosSatelite.map((o) => o.id));
    const gestion = (o: OrdenEscenario): GestionEscenario =>
      rechazadas.has(o.id) ? { resultado: "devolucion_a_origen_por_rechazo" } : { resultado: "entregado" };
    const mitad = Math.ceil(rechazosSatelite.length / 2);
    await enParalelo([
      enPaso("mensajero-satelite", () =>
        repartoConCierreAprobado([...rechazosSatelite.slice(0, mitad), ...entregaSatelite], mSatelite, gestion),
      ),
      enPaso("mensajero-satelite-2", () => repartoConCierreAprobado(rechazosSatelite.slice(mitad), mSatelite2, gestion)),
    ]);

    // R17: el cierre de la bodega satélite consolida los cierres aprobados de su zona. Lo «aprueba» el
    // maestro marcándolo recibido con el efectivo que trae (ficha 431): es lo que monta
    // `/cierres-admin` en lugar del «Aprobar» retirado. `aprobarCierreBodega` ya no deja la fila
    // coherente con `cierre_bodega_conciliacion_coherente` y la base lo rechaza.
    const cierreBodega = await llamar("CierreBodegaService.solicitarCierreBodega", () =>
      conEmpresa(org, () =>
        new CierreBodegaService(new CierreBodegaRepository(app), new OrdenRepository(app)).solicitarCierreBodega(adminSatelite),
      ),
    );
    if (cierreBodega.status !== "ok") throw new Error("inalcanzable");
    const recibida = marcarConsolidacionRecibidaSchema.parse({
      cierreBodegaId: cierreBodega.cierreBodegaId,
      montoRecibido: cierreBodega.totales.efectivo,
    });
    await llamar("ConciliacionSatelitesService.marcarRecibida", () =>
      conEmpresa(org, () =>
        new ConciliacionSatelitesService(new SaldosSatelitesRepository(app), new CierresBodegaAdminRepository(app)).marcarRecibida(
          recibida,
          maestro,
        ),
      ),
    );

    if (!recortada) {
      // Cada envío y cada recepción son de una orden distinta: van a la vez.
      const haciaCentral = rechazosSatelite.slice(n);
      await enParalelo(
        haciaCentral.map((o) =>
          llamar("EnvioDevolucionCentralService.enviarACentral", () =>
            conEmpresa(org, () => new EnvioDevolucionCentralService(ordenRepo).enviarACentral(o.id, adminSatelite)),
          ),
        ),
      );
      await enParalelo(
        haciaCentral.slice(n).map((o) =>
          llamar("RecepcionBodegaCentralService.recibirEnBodegaCentral", () =>
            conEmpresa(org, async () => new RecepcionBodegaCentralService(ordenRepo).recibirEnBodegaCentral(await guiaDe(o), maestro)),
          ),
        ),
      );
    }
  }

  /** Recolección en tienda (ficha 157), con su mensajero propio (R-c). */
  async function tramoRecoleccion(): Promise<void> {
    await llamar("GuiaAsignacionService.asignarRecoleccion", () =>
      conEmpresa(org, () =>
        s.guia.asignarRecoleccion({ ordenIds: porPantalla.map((o) => o.id), mensajeroId: mRecolector.id }, maestro),
      ),
    );
    const recoleccion = new RecoleccionTiendaService(
      new OrdenRepository(app),
      new GestionOrdenRepository(app),
      new OrdenHistorialRepository(app),
    );
    for (const o of porPantalla.slice(n)) {
      await llamar("RecoleccionTiendaService.recolectarEnTienda", () =>
        conEmpresa(org, () => recoleccion.recolectarEnTienda(o.numGuia, mRecolector.actor)),
      );
    }
  }

  async function guiaDe(o: { id: string }): Promise<number> {
    const f = await dueno.orden.findUniqueOrThrow({ where: { id: o.id }, select: { numGuia: true } });
    if (f.numGuia === null) throw new Error("[demo-qa] una orden devuelta sin guía");
    return f.numGuia;
  }

  /**
   * R17: el cierre que queda solicitado sin decidir, y el que se rechaza, se piden ANTES del corte: un
   * mensajero con el cierre abierto queda fuera del corte (R-b), y así sus órdenes no esperan a que
   * pase. Lo que sí espera al corte es el RECHAZO: con el cierre rechazado, sus gestiones vuelven a
   * estar sin cierre y el corte las barrería. Devuelve el cierre a rechazar.
   */
  async function cierreSinDecidir(ordenes: OrdenEscenario[], m: MensajeroEscenario): Promise<string> {
    await alReparto(ordenes, m);
    for (const o of ordenes) {
      await enPaso("gestionar(entregado)", () => nucleo.gestionar(escenario, o, m, { resultado: "entregado" }));
    }
    return solicitar(m);
  }

  // Las del corte se dejan en reparto con los tramos: el corte solo las mira cuando corre.
  const alRepartoDelCorte = async () => {
    if (mCorte) await alReparto(aCorte, mCorte);
  };
  const [cierreCentral, , , , , , , , cierreARechazar] = await enPaso("tramos", () =>
    enParalelo([
      enPaso("mensajero-central", tramoCentral),
      enPaso("mensajero-novedades", tramoNovedades),
      enPaso("mensajero-rechazos", tramoRechazosCentral),
      enPaso("satélite", tramoSatelite),
      enPaso("incidente", tramoIncidente),
      enPaso("recolección", tramoRecoleccion),
      enPaso("mensajero-corte", alRepartoDelCorte),
      enPaso("mensajero-cierre-pendiente", () => cierreSinDecidir(aCierrePendiente, mPendiente)),
      enPaso("mensajero-cierre-rechazado", () => cierreSinDecidir(aCierreRechazado, mRechazado)),
    ]),
  );

  // ── Dinero (R18, R19), con todos los cierres de arriba aprobados, a la vez con el corte: el dinero
  //    no cambia el estado de ninguna orden, que es lo único que el corte compara ─────────────
  await enParalelo([enPaso("dinero", registrarDinero), enPaso("corte de mañana", corteDeLaDemo)]);

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
    await llamar(
      "AporteCapitalService.registrar",
      () => conEmpresa(org, () =>
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
    await llamar(
      "LiquidacionService.registrarPagoMensajero",
      () => conEmpresa(org, () =>
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
    await llamar(
      "AbonoTiendaService.registrar",
      () => conEmpresa(org, () =>
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
    await llamar(
      "WalletEgresoService.registrarEgreso(pago_plataforma)",
      () => conEmpresa(org, () =>
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

  // ── Novedad interna (B1): el corte de mañana, solo para esta empresa. Ningún tramo que mueva
  //    órdenes corre a la vez: compara los estados de toda la empresa antes y después ───────────
  async function corteDeLaDemo(): Promise<void> {
    if (mCorte) await corteDeManana(aCorte.map((o) => o.id));
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

  // ── Después del corte, a la vez: el rechazo de la tienda, el rechazo del cierre pedido antes del
  //    corte y lo que queda en reposo. Cada uno con su mensajero y sus órdenes ──────────────────
  async function rechazoDeLaTienda(): Promise<void> {
    if (recortada) return;
    // Ficha 240: la tienda dueña rechaza una novedad; la orden queda devolviéndose a origen.
    const rechazo = new RechazoTiendaService(
      new OrdenRepository(app),
      new GestionOrdenRepository(app),
      new TarifaVigenteRepository(app),
      new RechazoTiendaCobroRepository(app),
    );
    for (const o of novedades.slice(n)) {
      const r = rechazarNovedadSchema.parse({ ordenId: o.id, motivo: "La tienda no la reintenta" });
      await llamar("RechazoTiendaService.rechazar", () => conEmpresa(org, () => rechazo.rechazar(r.ordenId, r.motivo, tiendaBodega)));
    }
  }

  // Órdenes en reposo: recogiendo en bodega y en reparto (su mensajero no cierra: R-a).
  async function enReposo(): Promise<void> {
    await llevarA(aRecoger, "mensajero_recogiendo_en_bodega", mReposo);
    await alReparto(enReparto, mReposo);
  }

  await enPaso("después del corte", () =>
    enParalelo([
      enPaso("rechazo de la tienda", rechazoDeLaTienda),
      enPaso("mensajero-cierre-rechazado › rechazar el cierre", () =>
        cierres.rechazarCierre(escenario, cierreARechazar, "Falta el efectivo de una entrega"),
      ),
      enPaso("mensajero-reposo", enReposo),
    ]),
  );

  // ── Cola y comprobación final ───────────────────────────────────────────────────────────────
  const cierre = await enPaso("cerrar la cola de jobs", () => cerrarJobsSinEjecutar(jobs, org));
  const porDecision = [
    ...(recortada ? ESTADOS_RECORTADOS_DE_B : []),
    ...(NOVEDAD_INTERNA_CON_CORTE_DE_MANANA ? [] : ["novedad_interna"]),
  ];
  const comprobacion = await enPaso("comprobación", () => comprobarEmpresaDemo(ctx, org, { estadosPorDecision: porDecision }));

  return {
    clave,
    slug: datos.slug,
    organizacionId: org,
    recortada,
    // Las altas corren a la vez: la tabla de la salida (R26) va en un orden fijo, no en el de llegada.
    usuarios: [...usuarios].sort((a, b) => posicionDePerfil(a.perfil) - posicionDePerfil(b.perfil)),
    jobsCerrados: { completados, sinEjecutar: cierre.cerradosPorTipo },
    tiposNoEsperados: cierre.tiposNoEsperados,
    comprobacion,
    duracionMs: Date.now() - inicio,
  };
}

/** El orden de los perfiles en la tabla de usuarios de la salida (`PERFILES_DEMO`). */
function posicionDePerfil(perfil: string): number {
  const i = (PERFILES_DEMO as readonly string[]).indexOf(perfil);
  return i === -1 ? PERFILES_DEMO.length : i;
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
  const recuentos = await enParalelo(
    TABLAS_SIN_FILAS.map((tabla) =>
      // El nombre sale de una lista fija de este archivo, nunca de una entrada.
      dueno.$queryRaw<{ n: bigint }[]>(
        Prisma.sql`SELECT count(*) AS n FROM ${Prisma.raw(`"${tabla}"`)} WHERE "organizacion_id" = ${organizacionId}`,
      ),
    ),
  );
  for (const [i, tabla] of TABLAS_SIN_FILAS.entries()) {
    const filas = Number(recuentos[i][0]?.n ?? 0);
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
