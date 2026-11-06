import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import type { DistritoCoberturaRow, ICoberturaRepository } from "@/lib/interfaces/repositories/ICoberturaRepository";
import type { CotizacionGeoRepository, CotizacionOrdenResult } from "@/lib/interfaces/services/ICotizacionOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { CoberturaService } from "@/lib/services/CoberturaService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import type { CotizacionFilaCotizada, CotizacionFilaError } from "@/lib/types/cotizacion";
import type { CoberturaDistritoDTO } from "@/lib/types/cobertura";

import * as hoy from "./geo-equivalencia/lecturas-de-hoy";

// SLT-44 (design §6.2; R21–R23) — `pnpm geo:equivalencia-dinero [--muestra 200] [--empresa <id>]`.
//
// Compara, empresa por empresa, la lectura geografica de hoy (`lecturas-de-hoy.ts`, congelada) con
// la nueva sobre el catalogo, en lo que mueve dinero: la zona y la marca de cada distrito, la
// cobertura de cada zona y la cotizacion de una muestra de ordenes reales.
//
// SOLO LECTURA (R23). El cliente abre cada conexion con `default_transaction_read_only = on`: toda
// transaccion es de solo lectura y cualquier escritura falla con `25006`, tambien la de un bug.
//
// SIN DATOS PERSONALES (R23). De las ordenes solo se leen id, tienda, monto y los nombres de su
// geografia: el destinatario, la direccion y el telefono no se piden. La salida lleva cifras, ids de
// empresa, zona, nodo y orden, y los importes que difieran.
//
// Lo corre una PERSONA sobre una copia de produccion (design §6.2, T7.2). Ningun agente.

const USO = "Uso: pnpm geo:equivalencia-dinero [--muestra <n>] [--empresa <organizacion_id>]";

export const MUESTRA_POR_DEFECTO = 200;

/** Salidas: 0 todo coincide, 1 algo difiere, 2 una empresa no se pudo leer (o argumentos malos). */
export type CodigoDeSalida = 0 | 1 | 2;

/**
 * T5.1 (b): `CoberturaService.listar` solo mira `actor.rol === "maestro"`; el `usuarioId` no
 * participa. Un maestro sintetico de la empresa basta.
 */
const ACTOR_MAESTRO = { usuarioId: "geo-equivalencia-dinero", rol: "maestro" } as const;

/** Sin tope de filas: la comparacion necesita todas, no el error de la descarga. */
const SIN_TOPE_DE_FILAS = Number.MAX_SAFE_INTEGER;

// ---------------------------------------------------------------------------------------------
// El cliente de solo lectura
// ---------------------------------------------------------------------------------------------

/**
 * El cliente del script: el mismo aislamiento por empresa que la app, sobre conexiones que nacen en
 * solo lectura (R23). Sin peticion no hay empresa que resolver: la pone `conEmpresa`.
 */
export function crearClienteDeSoloLectura(url: string | undefined): PrismaClient {
  const adapter = conConsultasEnSeriePorTransaccion(
    new PrismaPg({
      connectionString: url,
      // Dos: `CoberturaService.listar` lee distritos y tarifas en paralelo.
      max: 2,
      options: "-c default_transaction_read_only=on",
    }),
  );
  const base = new PrismaClient({ adapter, omit: PRISMA_OMIT }) as unknown as PrismaClient;
  return conAislamientoPorEmpresa(base, async () => null);
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

export type NombreDeBloque = "distritos" | "cobertura" | "cobertura-por-zona" | "cotizaciones";

export interface Diferencia {
  bloque: NombreDeBloque;
  /** Id de nodo, zona u orden (o la posicion de una fila de cobertura, que no tiene id). */
  id: string;
  campo: string;
  hoy: string;
  nuevo: string;
}

export interface Cifras {
  comparados: number;
  distintos: number;
}

export interface InformeDeEmpresa {
  organizacionId: string;
  distritos: Cifras;
  cobertura: Cifras;
  coberturaPorZona: Cifras;
  cotizaciones: Cifras;
  diferencias: Diferencia[];
}

export interface OpcionesDeComparacion {
  /** Cuantas ordenes recientes entran en la muestra de cotizaciones. */
  muestra: number;
  /**
   * El cliente de la lectura NUEVA. Por defecto, el mismo que la de hoy. Lo usa el test para
   * inyectar una asignacion en un canton y ver que la comparacion la nombra (design §10, R21).
   */
  clienteNuevo?: PrismaClient;
}

function texto(v: unknown): string {
  return v === undefined ? "(ausente)" : JSON.stringify(v);
}

/** Compara dos mapas por id, campo a campo. Los nombres no se imprimen: solo «distinto». */
function compararPorId<T extends { id: string }>(
  deHoy: readonly T[],
  nuevos: readonly T[],
  campos: readonly (keyof T & string)[],
  camposSinValor: ReadonlySet<string>,
  diferencias: Diferencia[],
  bloque: NombreDeBloque,
): Cifras {
  const a = new Map(deHoy.map((f) => [f.id, f]));
  const b = new Map(nuevos.map((f) => [f.id, f]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  let distintos = 0;
  for (const id of ids) {
    const x = a.get(id);
    const y = b.get(id);
    if (x === undefined || y === undefined) {
      distintos++;
      diferencias.push({ bloque, id, campo: "presente", hoy: String(x !== undefined), nuevo: String(y !== undefined) });
      continue;
    }
    let distinto = false;
    for (const campo of campos) {
      if (JSON.stringify(x[campo]) === JSON.stringify(y[campo])) continue;
      distinto = true;
      const oculto = camposSinValor.has(campo);
      diferencias.push({
        bloque,
        id,
        campo,
        hoy: oculto ? "(texto)" : texto(x[campo]),
        nuevo: oculto ? "(texto)" : texto(y[campo]),
      });
    }
    if (distinto) distintos++;
  }
  return { comparados: ids.length, distintos };
}

const SIN_VALOR_NOMBRE = new Set(["nombre"]);

// ---------------------------------------------------------------------------------------------
// Bloque 1: distritos (y la disponibilidad de provincias y cantones)
// ---------------------------------------------------------------------------------------------

async function compararDistritos(
  cliente: PrismaClient,
  nuevo: OrdenRepository,
  diferencias: Diferencia[],
): Promise<Cifras> {
  // En serie: dentro de una transaccion del test las lecturas comparten conexion.
  const provHoy = await hoy.findAllProvincias(cliente);
  const provNuevo = await nuevo.findAllProvincias();
  const provIds = [...new Set([...provHoy, ...provNuevo].map((p) => p.id))];
  const cantHoy = await hoy.findCantonesByProvinciaIds(cliente, provIds);
  const cantNuevo = await nuevo.findCantonesByProvinciaIds(provIds);
  const cantIds = [...new Set([...cantHoy, ...cantNuevo].map((c) => c.id))];
  const distHoy = await hoy.findDistritosByCantonIds(cliente, cantIds);
  const distNuevo = await nuevo.findDistritosByCantonIds(cantIds);

  const p = compararPorId(provHoy, provNuevo, ["nombre", "disponible"], SIN_VALOR_NOMBRE, diferencias, "distritos");
  const c = compararPorId(
    cantHoy,
    cantNuevo,
    ["nombre", "provinciaId", "disponible"],
    SIN_VALOR_NOMBRE,
    diferencias,
    "distritos",
  );
  const d = compararPorId(
    distHoy,
    distNuevo,
    ["nombre", "cantonId", "disponible", "zonaId", "esCentral", "esZonaEspecial"],
    SIN_VALOR_NOMBRE,
    diferencias,
    "distritos",
  );
  return { comparados: p.comparados + c.comparados + d.comparados, distintos: p.distintos + c.distintos + d.distintos };
}

// ---------------------------------------------------------------------------------------------
// Bloque 2: la cobertura de cada zona
// ---------------------------------------------------------------------------------------------

/** El repositorio con la lectura de distritos apuntada, para contar por zona con ids. */
function conDistritosApuntados(repo: ICoberturaRepository): { repo: ICoberturaRepository; filas: () => DistritoCoberturaRow[] } {
  let filas: DistritoCoberturaRow[] = [];
  return {
    repo: {
      listDistritos: async () => {
        filas = await repo.listDistritos();
        return filas;
      },
      listZonaIdsConTarifaGeneral: () => repo.listZonaIdsConTarifaGeneral(),
    },
    filas: () => filas,
  };
}

/** Por zona, los distritos con cobertura: disponibles y con una sola zona (R8 de la ficha 465). */
function cubiertosPorZona(filas: readonly DistritoCoberturaRow[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    if (!f.disponible || f.zonas.length !== 1) continue;
    const id = f.zonas[0].id;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

/** La fila del Excel sin nombres de lugar ni de zona: lo que se imprime si difiere. */
function filaSinNombres(f: CoberturaDistritoDTO) {
  return {
    disponible: f.disponible,
    cobertura: f.cobertura,
    motivo: f.motivo,
    zonas: f.zonas.length,
    zonaUnica: f.zonaUnica && { esCentral: f.zonaUnica.esCentral, tieneTarifaGeneral: f.zonaUnica.tieneTarifaGeneral },
    zonaEspecial: f.zonaEspecial,
  };
}

async function compararCobertura(
  cliente: PrismaClient,
  clienteNuevo: PrismaClient,
  diferencias: Diferencia[],
): Promise<{ cobertura: Cifras; porZona: Cifras }> {
  // La tarifa general no cambia con SLT-44: la de hoy la lee el repositorio real.
  const real = new CoberturaRepository(cliente);
  const deHoy = conDistritosApuntados({
    listDistritos: () => hoy.listDistritos(cliente),
    listZonaIdsConTarifaGeneral: () => real.listZonaIdsConTarifaGeneral(),
  });
  const nuevo = conDistritosApuntados(new CoberturaRepository(clienteNuevo));

  const rHoy = await new CoberturaService(deHoy.repo, SIN_TOPE_DE_FILAS).listar(ACTOR_MAESTRO);
  const rNuevo = await new CoberturaService(nuevo.repo, SIN_TOPE_DE_FILAS).listar(ACTOR_MAESTRO);

  let cobertura: Cifras;
  if (rHoy.status !== "ok" || rNuevo.status !== "ok") {
    const distinto = rHoy.status !== rNuevo.status;
    if (distinto) diferencias.push({ bloque: "cobertura", id: "listar", campo: "status", hoy: rHoy.status, nuevo: rNuevo.status });
    cobertura = { comparados: 1, distintos: distinto ? 1 : 0 };
  } else {
    // Como multiconjunto: entre nombres repetidos el orden de hoy no esta definido (design §3).
    const pendientes = new Map<string, CoberturaDistritoDTO[]>();
    for (const f of rHoy.items) {
      const k = JSON.stringify(f);
      pendientes.set(k, [...(pendientes.get(k) ?? []), f]);
    }
    const sobranNuevas: CoberturaDistritoDTO[] = [];
    for (const f of rNuevo.items) {
      const lista = pendientes.get(JSON.stringify(f));
      if (lista && lista.length > 0) lista.pop();
      else sobranNuevas.push(f);
    }
    const sobranDeHoy = [...pendientes.values()].flat();
    sobranDeHoy.forEach((f, i) =>
      diferencias.push({ bloque: "cobertura", id: `fila-hoy-${i + 1}`, campo: "fila", hoy: texto(filaSinNombres(f)), nuevo: "(sin pareja)" }),
    );
    sobranNuevas.forEach((f, i) =>
      diferencias.push({ bloque: "cobertura", id: `fila-nueva-${i + 1}`, campo: "fila", hoy: "(sin pareja)", nuevo: texto(filaSinNombres(f)) }),
    );
    cobertura = {
      comparados: Math.max(rHoy.items.length, rNuevo.items.length),
      distintos: Math.max(sobranDeHoy.length, sobranNuevas.length),
    };
  }

  const zonasHoy = cubiertosPorZona(deHoy.filas());
  const zonasNuevo = cubiertosPorZona(nuevo.filas());
  const zonas = [...new Set([...zonasHoy.keys(), ...zonasNuevo.keys()])].sort();
  let distintas = 0;
  for (const id of zonas) {
    const a = zonasHoy.get(id) ?? 0;
    const b = zonasNuevo.get(id) ?? 0;
    if (a === b) continue;
    distintas++;
    diferencias.push({ bloque: "cobertura-por-zona", id, campo: "distritos con cobertura", hoy: String(a), nuevo: String(b) });
  }
  return { cobertura, porZona: { comparados: zonas.length, distintos: distintas } };
}

// ---------------------------------------------------------------------------------------------
// Bloque 3: la cotizacion de una muestra de ordenes reales
// ---------------------------------------------------------------------------------------------

interface OrdenDeMuestra {
  id: string;
  tiendaId: string;
  fila: RawRow;
}

/** Las `muestra` ordenes mas recientes de la empresa, vivas y con distrito. Sin datos personales. */
async function leerMuestra(cliente: PrismaClient, muestra: number): Promise<OrdenDeMuestra[]> {
  const ordenes = await cliente.orden.findMany({
    where: { deletedAt: null, distritoId: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: muestra,
    select: {
      id: true,
      tiendaId: true,
      montoCobrar: true,
      distrito: { select: { nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } } },
    },
  });
  return ordenes.flatMap((o) => {
    if (o.distrito === null) return [];
    const fila: RawRow = {
      provincia: o.distrito.canton.provincia.nombre,
      canton: o.distrito.canton.nombre,
      distrito: o.distrito.nombre,
      // El id de la orden como numero de remision: es lo que nombra la fila en la salida.
      num_remision: o.id,
      ...(o.montoCobrar !== null && { monto_cobrar: o.montoCobrar.toString() }),
    };
    return [{ id: o.id, tiendaId: o.tiendaId, fila }];
  });
}

/** Lo que se imprime de una fila: los importes si se cotizo, los campos con error si no. */
function resumenDeFila(f: CotizacionFilaCotizada | CotizacionFilaError | undefined): string {
  if (f === undefined) return "(ausente)";
  if (f.resultado === "error") return `error en ${Object.keys(f.errores).sort().join(",")}`;
  return `cotizada monto=${f.montoCobrar} costos=${JSON.stringify(f.costos)}`;
}

function filasPorOrden(r: CotizacionOrdenResult): Map<string, CotizacionFilaCotizada | CotizacionFilaError> {
  const m = new Map<string, CotizacionFilaCotizada | CotizacionFilaError>();
  if (r.status !== "ok") return m;
  for (const f of [...r.resumen.filas, ...r.resumen.errores]) m.set(f.numRemision ?? `fila-${f.fila}`, f);
  return m;
}

async function compararCotizaciones(
  cliente: PrismaClient,
  nuevo: OrdenRepository,
  muestra: number,
  diferencias: Diferencia[],
): Promise<Cifras> {
  const ordenes = await leerMuestra(cliente, muestra);
  const porTienda = new Map<string, OrdenDeMuestra[]>();
  for (const o of ordenes) porTienda.set(o.tiendaId, [...(porTienda.get(o.tiendaId) ?? []), o]);

  const geoDeHoy: CotizacionGeoRepository = {
    findAllProvincias: () => hoy.findAllProvincias(cliente),
    findCantonesByProvinciaIds: (ids) => hoy.findCantonesByProvinciaIds(cliente, ids),
    findDistritosByCantonIds: (ids) => hoy.findDistritosByCantonIds(cliente, ids),
  };
  // El repositorio de tarifas es el real en las dos.
  const tarifas = new TarifaVigenteRepository(cliente);
  const servicioDeHoy = new CotizacionOrdenService(geoDeHoy, tarifas);
  const servicioNuevo = new CotizacionOrdenService(nuevo, tarifas);

  let distintos = 0;
  for (const [tiendaId, deLaTienda] of porTienda) {
    // T5.1 (a): el actor que arma `ApiKeyAuthService` para una key que apunta a la tienda.
    const actor = { usuarioId: tiendaId, rol: "apiKey" } as const;
    const filas = deLaTienda.map((o) => o.fila);
    const rHoy = await servicioDeHoy.cotizar(filas, actor);
    const rNuevo = await servicioNuevo.cotizar(filas, actor);
    const fHoy = filasPorOrden(rHoy);
    const fNuevo = filasPorOrden(rNuevo);
    for (const { id } of deLaTienda) {
      const a = fHoy.get(id);
      const b = fNuevo.get(id);
      const igualStatus = rHoy.status === rNuevo.status;
      if (igualStatus && JSON.stringify(a) === JSON.stringify(b)) continue;
      distintos++;
      diferencias.push({
        bloque: "cotizaciones",
        id,
        campo: igualStatus ? "fila" : "status",
        hoy: igualStatus ? resumenDeFila(a) : rHoy.status,
        nuevo: igualStatus ? resumenDeFila(b) : rNuevo.status,
      });
    }
  }
  return { comparados: ordenes.length, distintos };
}

// ---------------------------------------------------------------------------------------------
// La comparacion de una empresa
// ---------------------------------------------------------------------------------------------

/**
 * Compara la lectura de hoy con la nueva para una empresa (R21, R22). Abre el contexto de esa
 * empresa: la RLS y el filtro de la extension acotan las dos lecturas igual.
 */
export async function compararEmpresa(
  cliente: PrismaClient,
  organizacionId: string,
  opciones: OpcionesDeComparacion,
): Promise<InformeDeEmpresa> {
  return conEmpresa(organizacionId, async () => {
    const clienteNuevo = opciones.clienteNuevo ?? cliente;
    const diferencias: Diferencia[] = [];
    // Uno por empresa: el catalogo se carga una vez para los distritos y las cotizaciones.
    const nuevo = new OrdenRepository(clienteNuevo);
    const distritos = await compararDistritos(cliente, nuevo, diferencias);
    const { cobertura, porZona } = await compararCobertura(cliente, clienteNuevo, diferencias);
    const cotizaciones = await compararCotizaciones(cliente, nuevo, opciones.muestra, diferencias);
    return { organizacionId, distritos, cobertura, coberturaPorZona: porZona, cotizaciones, diferencias };
  });
}

/** Las lineas que se imprimen de una empresa: cifras por bloque y cada diferencia (R22, R23). */
export function lineasDeInforme(informe: InformeDeEmpresa): string[] {
  const e = `empresa ${informe.organizacionId}`;
  const cifras = (nombre: string, c: Cifras) => `${e} ${nombre}: comparados=${c.comparados} distintos=${c.distintos}`;
  return [
    cifras("distritos", informe.distritos),
    cifras("cobertura", informe.cobertura),
    cifras("cobertura-por-zona", informe.coberturaPorZona),
    cifras("cotizaciones", informe.cotizaciones),
    ...informe.diferencias.map((d) => `  ${e} [${d.bloque}] ${d.id} ${d.campo}: hoy=${d.hoy} nuevo=${d.nuevo}`),
  ];
}

export function hayDiferencias(informe: InformeDeEmpresa): boolean {
  return [informe.distritos, informe.cobertura, informe.coberturaPorZona, informe.cotizaciones].some((c) => c.distintos > 0);
}

export function codigoDeSalida(informes: readonly InformeDeEmpresa[], fallidas: number): CodigoDeSalida {
  if (fallidas > 0) return 2;
  return informes.some(hayDiferencias) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Argumentos y entrada
// ---------------------------------------------------------------------------------------------

export interface Argumentos {
  muestra: number;
  empresa: string | null;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r: Argumentos = { muestra: MUESTRA_POR_DEFECTO, empresa: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = argv[i + 1];
    if (arg === "--muestra") {
      if (valor === undefined || !/^\d+$/.test(valor) || Number(valor) < 1) return null;
      r.muestra = Number(valor);
      i++;
    } else if (arg === "--empresa") {
      if (valor === undefined || valor.trim() === "" || valor.startsWith("--")) return null;
      r.empresa = valor;
      i++;
    } else {
      return null;
    }
  }
  return r;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }
  const argumentos = leerArgumentos(process.argv.slice(2));
  if (argumentos === null) {
    // No se repite el argumento: se escribe a mano y podria llevar algo que no debe salir.
    console.error(USO);
    process.exitCode = 2;
    return;
  }
  const cliente = crearClienteDeSoloLectura(process.env.DATABASE_URL);
  const opciones: OpcionesDeComparacion = { muestra: argumentos.muestra };
  const informes: InformeDeEmpresa[] = [];
  let fallidas = 0;
  try {
    if (argumentos.empresa !== null) {
      try {
        informes.push(await compararEmpresa(cliente, argumentos.empresa, opciones));
      } catch (error) {
        fallidas++;
        console.error(`empresa ${argumentos.empresa}: fallo al leer (${error instanceof Error ? error.name : "error"})`);
      }
    } else {
      // T5.1 (c): `paraCadaEmpresa` abre plataforma solo para listar; ya esta en la lista (SL-17).
      const resumen = await paraCadaEmpresa(
        async (id) => {
          informes.push(await compararEmpresa(cliente, id, opciones));
        },
        { cliente: cliente as unknown as ClienteDeOrganizaciones },
      );
      fallidas = resumen.fallidas.length;
      for (const f of resumen.fallidas) console.error(`empresa ${f.organizacionId}: fallo al leer`);
    }
    for (const informe of informes) for (const linea of lineasDeInforme(informe)) console.log(linea);
    const codigo = codigoDeSalida(informes, fallidas);
    console.log(
      `total: empresas=${informes.length + fallidas} con-diferencias=${informes.filter(hayDiferencias).length} fallidas=${fallidas} salida=${codigo}`,
    );
    process.exitCode = codigo;
  } finally {
    await cliente.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    // Solo el nombre: el mensaje de Prisma puede llevar la URL de la base.
    console.error(`Fallo geo:equivalencia-dinero (${error instanceof Error ? error.name : "error desconocido"}).`);
    process.exit(2);
  });
}
