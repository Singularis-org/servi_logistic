import { pathToFileURL } from "node:url";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { prepararConsultaProductos, type ConsultaProductos } from "@/lib/analytics/productos-consulta";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CicloVidaRepository } from "@/lib/repositories/CicloVidaRepository";
import { CohorteCargaRepository } from "@/lib/repositories/CohorteCargaRepository";
import { ConteoCargadasPorDiaRepository } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { ConteoDevolucionesRepository } from "@/lib/repositories/ConteoDevolucionesRepository";
import { ConteoEntregasRepository } from "@/lib/repositories/ConteoEntregasRepository";
import { ConteoHoyGestionRepository } from "@/lib/repositories/ConteoHoyGestionRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";
import { ConteoProductosRepository } from "@/lib/repositories/ConteoProductosRepository";
import { DineroProductosRepository } from "@/lib/repositories/DineroProductosRepository";
import { InformeTransitoRepository } from "@/lib/repositories/InformeTransitoRepository";
import { PROFUNDIDAD_DEL_NIVEL } from "@/lib/repositories/_shared/lugar-orden";
import {
  resolverLugaresDelFiltro,
  type FacetasGeograficas,
  type LugaresDelFiltro,
} from "@/lib/repositories/_shared/lugares-del-filtro";
import { nodo, nodosDeProfundidad, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import { cortesPorZona } from "@/lib/whatsapp-envios/informes/transito/calculo";
import { estadosIncluidos, PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito, FilaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";

import * as hoy from "./geo-equivalencia/analitica-de-hoy";
import { compararPorId, type Cifras, type Diferencia } from "./geo-equivalencia/comparacion";
import { nombreDeError } from "./geo-equivalencia/medicion";
import { crearClienteDeSoloLectura, leerArgumentos as leerArgumentosDeSlt44 } from "./geo-equivalencia-dinero";
import { esBaseLocal } from "./geo-explain-consultas";

// SLT-71 (design §8; R17, R18) — `pnpm geo:equivalencia-analitica [--muestra 20] [--empresa <id>]`.
//
// Compara, empresa por empresa, la lectura de HOY (la copia congelada de
// `geo-equivalencia/analitica-de-hoy.ts`, que filtra por las columnas `provincia_id`, `canton_id` y
// `distrito_id` y nombra con `canton` y `distrito`) con la NUEVA (los repositorios, que filtran por el
// lugar de la orden con los ids del dominio de SLT-44 y nombran con el catalogo). Bloques:
//   - `analitica`: desglose por estado, entregas, cargadas por dia, devoluciones y ciclo de vida;
//   - `comparten-recorte`: productos, dinero por producto (por importe total), cohorte de carga y
//     contador de hoy;
//   - `transito`: las filas en alerta del informe con los parametros por defecto, por orden;
//   - `cadena-incoherente` (informativo): las ordenes vivas cuya cadena de FK viejas esta rota.
//
// Filtros de `analitica` y `comparten-recorte`, cada uno sin rango y con el rango `mes`: sin filtro,
// cada provincia del pais, los `--muestra` cantones y distritos con mas ordenes vivas, provincia y
// canton a la vez, y un id de canton pedido como distrito (tiene que dar cero en los dos lados, R3).
//
// LAS ORDENES DE CADENA INCOHERENTE (decision heredada de SLT-65). Con la cadena rota, la columna del
// nivel y el lugar de la orden pueden discrepar, y la lectura nueva cuenta por el lugar. Una
// comparacion que difiere SOLO por ellas no cuenta como diferencia: el filtro tiene faceta
// geografica, alguna orden incoherente entra en el filtro por un lado y no por el otro, y la cifra
// difiere como mucho en ese numero de ordenes. Se cuenta aparte (`solo-incoherentes`).
//
// SOLO LECTURA (R18): el cliente de SLT-44, con `default_transaction_read_only = on`. SIN DATOS
// PERSONALES (R18): la salida lleva cifras e ids de empresa, nodo, zona y orden; nunca SQL,
// parametros, nombres de lugar, destinatarios, direcciones ni telefonos. Los campos de texto de
// transito solo dicen «distinto».
//
// SOLO CONTRA localhost. Lo corre una PERSONA sobre una copia de produccion restaurada en local antes
// del merge (T8.3). Ningun agente fuera de la base de tests local.

const USO = "Uso: pnpm geo:equivalencia-analitica [--muestra <n>] [--empresa <organizacion_id>]";

/** Cantones y distritos de la muestra por defecto (design §8). */
export const MUESTRA_POR_DEFECTO = 20;

/** Salidas: 0 todo coincide (o solo difieren ordenes incoherentes), 1 algo difiere, 2 una empresa fallo. */
export type CodigoDeSalida = 0 | 1 | 2;

/** Un maestro sintetico de la empresa: alcance `global` dentro de ella (design §8). */
const ACTOR_MAESTRO = { usuarioId: "geo-equivalencia-analitica", rol: "maestro" } as const;

export interface InformeDeEmpresa {
  organizacionId: string;
  /** Filtros comparados (cada uno cuenta sin rango y con `mes`). */
  filtros: number;
  /** `comparados` = pares (lectura, filtro); `distintos` = los que difieren de verdad. */
  analitica: Cifras;
  compartenRecorte: Cifras;
  /** Por orden en alerta. */
  transito: Cifras;
  /** Pares (lectura, filtro) que difieren solo por ordenes de cadena incoherente. Informativo. */
  soloIncoherentes: number;
  /** Ordenes vivas con la cadena de FK viejas rota, por id. Informativo. */
  cadenaIncoherente: string[];
  diferencias: Diferencia[];
}

export interface OpcionesDeComparacion {
  /** Cuantos cantones y cuantos distritos (los de mas ordenes vivas) entran como filtro. */
  muestra: number;
  /**
   * El cliente de la lectura NUEVA. Por defecto, el mismo que la de hoy. Lo usa el test para
   * inyectar un nodo en el catalogo y ver que la comparacion lo nombra (T5.2).
   */
  clienteNuevo?: PrismaClient;
}

// ---------------------------------------------------------------------------------------------
// Los filtros
// ---------------------------------------------------------------------------------------------

export interface FiltroDeComparacion {
  /** Tipo e id de cada faceta (`provincia=<id>`), mas `mes` si lleva rango. Solo ids. */
  etiqueta: string;
  raw: FacetasGeograficas & { rango?: "mes" };
  /** El id de canton pedido como distrito: los dos lados tienen que dar cero (R3). */
  nivelEquivocado: boolean;
}

const CLAVE_DEL_NIVEL: Record<NivelGeografico, keyof FacetasGeograficas> = {
  provincia: "provincia_id",
  canton: "canton_id",
  distrito: "distrito_id",
};

/** Las ordenes vivas por columna de nivel, de mas a menos (empate por id). */
async function conMasOrdenes(
  cliente: PrismaClient,
  columna: "cantonId" | "distritoId",
  muestra: number,
): Promise<string[]> {
  const filas =
    columna === "cantonId"
      ? await cliente.orden.groupBy({
          by: ["cantonId"],
          where: { deletedAt: null },
          _count: { _all: true },
          orderBy: [{ _count: { cantonId: "desc" } }, { cantonId: "asc" }],
          take: muestra,
        })
      : await cliente.orden.groupBy({
          by: ["distritoId"],
          where: { deletedAt: null, distritoId: { not: null } },
          _count: { _all: true },
          orderBy: [{ _count: { distritoId: "desc" } }, { distritoId: "asc" }],
          take: muestra,
        });
  return filas.flatMap((f) => {
    const id = "cantonId" in f ? f.cantonId : f.distritoId;
    return id === null ? [] : [id];
  });
}

/** Los filtros de la empresa (design §8), sin rango y con el rango `mes`. */
export async function filtrosDeLaEmpresa(
  cliente: PrismaClient,
  catalogo: CatalogoGeografico,
  muestra: number,
): Promise<FiltroDeComparacion[]> {
  const faceta = (nivel: NivelGeografico, id: string) => ({ etiqueta: `${nivel}=${id}`, clave: CLAVE_DEL_NIVEL[nivel], id });
  const cantones = await conMasOrdenes(cliente, "cantonId", muestra);
  const distritos = await conMasOrdenes(cliente, "distritoId", muestra);

  const base: FiltroDeComparacion[] = [{ etiqueta: "sin-filtro", raw: {}, nivelEquivocado: false }];
  const simple = (nivel: NivelGeografico, id: string): FiltroDeComparacion => {
    const f = faceta(nivel, id);
    return { etiqueta: f.etiqueta, raw: { [f.clave]: [id] }, nivelEquivocado: false };
  };
  for (const p of nodosDeProfundidad(catalogo, PROFUNDIDAD_DEL_NIVEL.provincia)) base.push(simple("provincia", p.id));
  for (const id of cantones) base.push(simple("canton", id));
  for (const id of distritos) base.push(simple("distrito", id));

  // Provincia y canton a la vez: el canton con mas ordenes y su provincia en el catalogo.
  const primerCanton = cantones[0];
  const suProvincia = primerCanton === undefined ? null : (nodo(catalogo, primerCanton)?.padreId ?? null);
  if (primerCanton !== undefined && suProvincia !== null) {
    base.push({
      etiqueta: `provincia=${suProvincia}+canton=${primerCanton}`,
      raw: { provincia_id: [suProvincia], canton_id: [primerCanton] },
      nivelEquivocado: false,
    });
  }
  // Un id de canton pedido como distrito: cero en los dos lados (R3).
  if (primerCanton !== undefined) {
    base.push({
      etiqueta: `distrito=${primerCanton} (nivel-equivocado)`,
      raw: { distrito_id: [primerCanton] },
      nivelEquivocado: true,
    });
  }
  return [...base, ...base.map((f) => ({ ...f, etiqueta: `${f.etiqueta} mes`, raw: { ...f.raw, rango: "mes" as const } }))];
}

// ---------------------------------------------------------------------------------------------
// La cadena incoherente
// ---------------------------------------------------------------------------------------------

/** Una orden viva con la cadena de FK viejas rota, con sus tres columnas. */
interface OrdenIncoherente {
  id: string;
  provinciaId: string;
  cantonId: string;
  distritoId: string | null;
}

/** Las ordenes vivas de la empresa cuyo distrito no cuelga de su canton o su canton de su provincia. */
async function ordenesIncoherentes(cliente: PrismaClient): Promise<OrdenIncoherente[]> {
  const vivas = await cliente.orden.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      provinciaId: true,
      cantonId: true,
      distritoId: true,
      canton: { select: { provinciaId: true } },
      distrito: { select: { cantonId: true } },
    },
  });
  return vivas
    .filter((o) => o.canton.provinciaId !== o.provinciaId || (o.distrito !== null && o.distrito.cantonId !== o.cantonId))
    .map(({ id, provinciaId, cantonId, distritoId }) => ({ id, provinciaId, cantonId, distritoId }));
}

const NIVELES: readonly NivelGeografico[] = ["provincia", "canton", "distrito"];

/** Si la orden entra en el filtro por las columnas (hoy). Solo las facetas geograficas. */
function entraHoy(o: OrdenIncoherente, filtro: FacetasGeograficas): boolean {
  const columna: Record<NivelGeografico, string | null> = {
    provincia: o.provinciaId,
    canton: o.cantonId,
    distrito: o.distritoId,
  };
  return NIVELES.every((nivel) => {
    const ids = filtro[CLAVE_DEL_NIVEL[nivel]];
    if (ids === undefined || ids.length === 0) return true;
    const valor = columna[nivel];
    return valor !== null && ids.includes(valor);
  });
}

/** Si la orden entra en el filtro por su lugar (nuevo), con los ids ya resueltos. */
function entraPorLugar(o: OrdenIncoherente, lugares: LugaresDelFiltro): boolean {
  const lugar = o.distritoId ?? o.cantonId;
  return NIVELES.every((nivel) => {
    const ids = lugares[nivel];
    return ids === undefined || ids.includes(lugar);
  });
}

/** Cuantas ordenes incoherentes entran por un lado del filtro y no por el otro. */
export function incoherentesAfectadas(
  incoherentes: readonly OrdenIncoherente[],
  catalogo: CatalogoGeografico,
  filtro: FacetasGeograficas,
): number {
  const lugares = resolverLugaresDelFiltro(catalogo, filtro);
  return incoherentes.filter((o) => entraHoy(o, filtro) !== entraPorLugar(o, lugares)).length;
}

// ---------------------------------------------------------------------------------------------
// Las lecturas
// ---------------------------------------------------------------------------------------------

/**
 * Lo que se imprime de una lectura (cifras, nunca textos) y cuantas ordenes cuenta, para saber si una
 * diferencia cabe en las incoherentes.
 */
interface Resumen {
  /** Para comparar los dos lados. */
  clave: string;
  /** Para imprimir: solo numeros. */
  cifra: string;
  /** Ordenes (o gestiones) que cuenta la lectura. */
  ordenes: number;
}

const suma = (xs: readonly number[]) => xs.reduce((s, n) => s + n, 0);

function resumenDeConteo(resultado: unknown, ordenes: number, cifra = `n=${ordenes}`): Resumen {
  return { clave: JSON.stringify(resultado), cifra, ordenes };
}

interface Lectura<Q> {
  nombre: string;
  hoy: (cliente: PrismaClient, q: Q) => Promise<Resumen>;
  nueva: (cliente: PrismaClient, q: Q) => Promise<Resumen>;
}

const porStatus = async (p: Promise<readonly { conteo: number }[]>) => {
  const filas = await p;
  return resumenDeConteo(filas, suma(filas.map((f) => f.conteo)));
};

const deDesenlaces = (porDesenlace: Readonly<Record<string, number>>) =>
  resumenDeConteo(porDesenlace, suma(Object.values(porDesenlace)));

const deCiclo = (c: { segundosAcum: number; n: number }) => resumenDeConteo(c, c.n, `n=${c.n} segundos=${c.segundosAcum}`);

/** Las cinco lecturas de analitica (design §8, bloque `analitica`). */
const ANALITICA: readonly Lectura<ConsultaConteoEntregas>[] = [
  {
    nombre: "por-status",
    hoy: (c, q) => porStatus(hoy.contarPorStatusDeHoy(c, q)),
    nueva: (c, q) => porStatus(new ConteoPorStatusRepository(c).contarPorStatus(q)),
  },
  {
    nombre: "entregas",
    hoy: async (c, q) => deDesenlaces(hoy.plegarEnDesenlaces(await hoy.contarPorStatusDeHoy(c, q))),
    nueva: async (c, q) => deDesenlaces((await new ConteoEntregasRepository(new ConteoPorStatusRepository(c)).contar(q)).porDesenlace),
  },
  {
    nombre: "cargadas-por-dia",
    hoy: (c, q) => porStatus(hoy.contarCargadasPorDiaDeHoy(c, q)),
    nueva: (c, q) => porStatus(new ConteoCargadasPorDiaRepository(c).contarCargadasPorDia(q)),
  },
  {
    nombre: "devoluciones",
    hoy: (c, q) => porStatus(hoy.contarDevolucionesPorCausaDeHoy(c, q)),
    nueva: (c, q) => porStatus(new ConteoDevolucionesRepository(c).contarDevolucionesPorCausa(q)),
  },
  {
    nombre: "ciclo-vida",
    hoy: async (c, q) => deCiclo(await hoy.acumularCiclosDeHoy(c, q)),
    nueva: async (c, q) => deCiclo(await new CicloVidaRepository(c).acumularCiclos(q)),
  },
];

/** La consulta de cada lectura que comparte el recorte. `null` si la lectura no aplica al filtro. */
interface ConsultasDelFiltro {
  entregas: ConsultaConteoEntregas;
  productos: ConsultaProductos;
  /** La cohorte exige rango: sin el, el borde responde `sin_rango` antes de llegar al repositorio. */
  cohorte: ConsultaConteoEntregas | null;
  dia: NonNullable<ConsultaConteoEntregas["rango"]> | null;
}

/** Dinero por producto: por importe total recaudado y numero de ordenes (design §8). */
function deDinero(l: Awaited<ReturnType<typeof hoy.dineroProductosDeHoy>>): Resumen {
  if (l.estado !== "ok") return { clave: `limite-excedido ${l.limite}`, cifra: `limite-excedido=${l.limite}`, ordenes: 0 };
  let total = new Prisma.Decimal(0);
  for (const f of l.filas) if (f.montoRecibido !== null) total = total.plus(f.montoRecibido);
  const ordenes = new Set(l.filas.map((f) => f.ordenId)).size;
  const cifra = `ordenes=${ordenes} importe=${total.toFixed(2)}`;
  return { clave: cifra, cifra, ordenes };
}

const deCohorte = (filas: readonly { n: number }[]) => resumenDeConteo(filas, suma(filas.map((f) => f.n)));

const deHoyGestion = (c: { sinGestion: number; conGestion: number }) =>
  resumenDeConteo(c, c.sinGestion + c.conGestion, `sin-gestion=${c.sinGestion} con-gestion=${c.conGestion}`);

/** Las cuatro que comparten el recorte (design §8, bloque `comparten-recorte`). */
const COMPARTEN: readonly Lectura<ConsultasDelFiltro>[] = [
  {
    nombre: "productos",
    hoy: async (c, q) => deCohorte(await hoy.contarProductosDeHoy(c, q.productos)),
    nueva: async (c, q) => deCohorte(await new ConteoProductosRepository(c).contarProductos(q.productos)),
  },
  {
    nombre: "dinero-por-producto",
    hoy: async (c, q) => deDinero(await hoy.dineroProductosDeHoy(c, q.productos)),
    nueva: async (c, q) => deDinero(await new DineroProductosRepository(c).leerDineroPorOrden(q.productos)),
  },
  {
    nombre: "cohorte-de-carga",
    hoy: async (c, q) => deCohorte(q.cohorte === null ? [] : await hoy.cohorteCargaDeHoy(c, q.cohorte)),
    nueva: async (c, q) => deCohorte(q.cohorte === null ? [] : await new CohorteCargaRepository(c).contarCohortes(q.cohorte)),
  },
  {
    nombre: "contador-de-hoy",
    hoy: async (c, q) =>
      q.dia === null ? deHoyGestion({ sinGestion: 0, conGestion: 0 }) : deHoyGestion(await hoy.conteoHoyGestionDeHoy(c, q.entregas, q.dia)),
    nueva: async (c, q) =>
      q.dia === null
        ? deHoyGestion({ sinGestion: 0, conGestion: 0 })
        : deHoyGestion(await new ConteoHoyGestionRepository(c).contarDeHoy(q.entregas, q.dia)),
  },
];

function consultaEntregas(raw: object): ConsultaConteoEntregas {
  const p = prepararConteoEntregas(raw, ACTOR_MAESTRO);
  // Solo el estado: el detalle de la preparacion podria repetir la entrada.
  if (p.status !== "ok") throw new Error(`geo:equivalencia-analitica: consulta no concedida (${p.status})`);
  return p.consulta;
}

function consultaProductos(raw: object): ConsultaProductos {
  const p = prepararConsultaProductos(raw, ACTOR_MAESTRO);
  if (p.status !== "ok") throw new Error(`geo:equivalencia-analitica: consulta de productos no concedida (${p.status})`);
  return p.consulta;
}

function consultasDelFiltro(raw: FiltroDeComparacion["raw"]): ConsultasDelFiltro {
  return {
    entregas: consultaEntregas(raw),
    productos: consultaProductos(raw),
    cohorte: raw.rango === undefined ? null : consultaEntregas(raw),
    dia: consultaEntregas({ rango: "dia" }).rango,
  };
}

/**
 * Compara una lectura en un filtro. Devuelve si cuenta como distinta; las que difieren solo por las
 * ordenes incoherentes las suma a `soloIncoherentes`.
 */
async function compararLectura<Q>(
  bloque: string,
  lectura: Lectura<Q>,
  filtro: FiltroDeComparacion,
  q: Q,
  clientes: { hoy: PrismaClient; nuevo: PrismaClient },
  afectadas: number,
  salida: { diferencias: Diferencia[]; soloIncoherentes: number },
): Promise<boolean> {
  // En serie: dentro de la transaccion del test las lecturas comparten conexion.
  const a = await lectura.hoy(clientes.hoy, q);
  const b = await lectura.nueva(clientes.nuevo, q);
  const nivelMalo = filtro.nivelEquivocado && (a.ordenes !== 0 || b.ordenes !== 0);
  if (a.clave === b.clave && !nivelMalo) return false;
  if (!nivelMalo && afectadas > 0 && Math.abs(a.ordenes - b.ordenes) <= afectadas) {
    salida.soloIncoherentes++;
    return false;
  }
  salida.diferencias.push({
    bloque,
    id: filtro.etiqueta,
    campo: nivelMalo ? `${lectura.nombre} (nivel equivocado: tiene que dar cero)` : lectura.nombre,
    hoy: a.cifra,
    nuevo: b.cifra,
  });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Transito
// ---------------------------------------------------------------------------------------------

/** Los campos de una fila de transito. Los de texto (personales o nombres) solo dicen «distinto». */
const CAMPOS_TRANSITO = [
  "numRemision",
  "numGuia",
  "estado",
  "zonaId",
  "destinatario",
  "canton",
  "distrito",
  "montoCobrar",
  "hitoAt",
  "ultimaTransicionAt",
] as const satisfies readonly (keyof FilaTransito)[];

const CAMPOS_TRANSITO_SIN_VALOR = new Set(["numRemision", "numGuia", "destinatario", "canton", "distrito", "montoCobrar"]);

type FilaComparable = Omit<FilaTransito, "ordenId"> & { id: string };

const comparableDeTransito = ({ ordenId, ...resto }: FilaTransito): FilaComparable => ({ id: ordenId, ...resto });

async function compararTransito(
  cliente: PrismaClient,
  clienteNuevo: PrismaClient,
  diferencias: Diferencia[],
): Promise<Cifras> {
  const repo = new InformeTransitoRepository(clienteNuevo);
  const zonas = await repo.zonas();
  const consulta: ConsultaTransito = {
    hito: PARAMETROS_POR_DEFECTO.hito,
    estados: estadosIncluidos(PARAMETROS_POR_DEFECTO),
    cortes: cortesPorZona(zonas, PARAMETROS_POR_DEFECTO, new Date()),
  };
  const deHoy = await hoy.filasEnAlertaDeHoy(cliente, consulta);
  let nuevas: FilaTransito[];
  try {
    nuevas = await repo.filasEnAlerta(consulta);
  } catch (error) {
    // R12: un nodo ausente del catalogo hace fallar la lectura nueva. Es una diferencia, con el
    // nombre del error; los ids de los nodos y las ordenes ya los escribe el log del repositorio.
    diferencias.push({ bloque: "transito", id: "filas-en-alerta", campo: "lectura", hoy: "ok", nuevo: nombreDeError(error) });
    return { comparados: deHoy.length, distintos: deHoy.length };
  }
  return compararPorId(
    deHoy.map(comparableDeTransito),
    nuevas.map(comparableDeTransito),
    CAMPOS_TRANSITO,
    CAMPOS_TRANSITO_SIN_VALOR,
    diferencias,
    "transito",
  );
}

// ---------------------------------------------------------------------------------------------
// La comparacion de una empresa
// ---------------------------------------------------------------------------------------------

/**
 * Compara la lectura de hoy con la nueva para una empresa (R17). Abre el contexto de esa empresa: la
 * RLS y el filtro de la extension acotan los dos lados igual, y el catalogo es el de su pais.
 */
export async function compararEmpresaAnalitica(
  cliente: PrismaClient,
  organizacionId: string,
  opciones: OpcionesDeComparacion,
): Promise<InformeDeEmpresa> {
  return conEmpresa(organizacionId, async () => {
    const clienteNuevo = opciones.clienteNuevo ?? cliente;
    const clientes = { hoy: cliente, nuevo: clienteNuevo };
    // El catalogo de la lectura nueva: el que decide que nodos hay bajo cada faceta.
    const { catalogo } = await new CatalogoGeograficoRepository(clienteNuevo).deLaEmpresa();
    const filtros = await filtrosDeLaEmpresa(cliente, catalogo, opciones.muestra);
    const incoherentes = await ordenesIncoherentes(cliente);

    const salida = { diferencias: [] as Diferencia[], soloIncoherentes: 0 };
    const analitica: Cifras = { comparados: 0, distintos: 0 };
    const compartenRecorte: Cifras = { comparados: 0, distintos: 0 };
    for (const filtro of filtros) {
      const afectadas = incoherentesAfectadas(incoherentes, catalogo, filtro.raw);
      const q = consultasDelFiltro(filtro.raw);
      for (const lectura of ANALITICA) {
        analitica.comparados++;
        if (await compararLectura("analitica", lectura, filtro, q.entregas, clientes, afectadas, salida)) analitica.distintos++;
      }
      for (const lectura of COMPARTEN) {
        compartenRecorte.comparados++;
        if (await compararLectura("comparten-recorte", lectura, filtro, q, clientes, afectadas, salida)) {
          compartenRecorte.distintos++;
        }
      }
    }
    const transito = await compararTransito(cliente, clienteNuevo, salida.diferencias);
    return {
      organizacionId,
      filtros: filtros.length,
      analitica,
      compartenRecorte,
      transito,
      soloIncoherentes: salida.soloIncoherentes,
      cadenaIncoherente: incoherentes.map((o) => o.id),
      diferencias: salida.diferencias,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

const cifras = (prefijo: string, nombre: string, c: Cifras, extra = "") =>
  `${prefijo} ${nombre}: comparados=${c.comparados} distintos=${c.distintos}${extra}`;

/** Las lineas de una empresa: cifras por bloque, la cadena incoherente y cada diferencia (R17, R18). */
export function lineasDeInforme(informe: InformeDeEmpresa): string[] {
  const e = `empresa ${informe.organizacionId}`;
  return [
    cifras(e, "analitica", informe.analitica, ` filtros=${informe.filtros} solo-incoherentes=${informe.soloIncoherentes}`),
    cifras(e, "comparten-recorte", informe.compartenRecorte),
    cifras(e, "transito", informe.transito),
    `${e} cadena-incoherente: ordenes=${informe.cadenaIncoherente.length}`,
    ...informe.cadenaIncoherente.map((id) => `  ${e} [cadena-incoherente] ${id}`),
    ...informe.diferencias.map((d) => `  ${e} [${d.bloque}] ${d.id} ${d.campo}: hoy=${d.hoy} nuevo=${d.nuevo}`),
  ];
}

/** La cadena incoherente y lo que solo difiere por ella son informativos: no cuentan. */
export function hayDiferencias(informe: InformeDeEmpresa): boolean {
  return [informe.analitica, informe.compartenRecorte, informe.transito].some((c) => c.distintos > 0);
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

/** Los argumentos de SLT-44 (`--muestra`, `--empresa`), con la muestra por defecto de este script. */
export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r = leerArgumentosDeSlt44(argv);
  if (r === null) return null;
  return { empresa: r.empresa, muestra: argv.includes("--muestra") ? r.muestra : MUESTRA_POR_DEFECTO };
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
  const url = process.env.DATABASE_URL;
  if (!esBaseLocal(url)) {
    // Sin la URL: lleva la contraseña.
    console.error("ABORTA: DATABASE_URL no apunta a localhost. Este script solo corre contra una base local.");
    process.exitCode = 2;
    return;
  }
  const cliente = crearClienteDeSoloLectura(url);
  const opciones: OpcionesDeComparacion = { muestra: argumentos.muestra };
  const informes: InformeDeEmpresa[] = [];
  let fallidas = 0;
  try {
    if (argumentos.empresa !== null) {
      try {
        informes.push(await compararEmpresaAnalitica(cliente, argumentos.empresa, opciones));
      } catch (error) {
        fallidas++;
        console.error(`empresa ${argumentos.empresa}: fallo al leer (${nombreDeError(error)})`);
      }
    } else {
      // `paraCadaEmpresa` abre plataforma solo para listar; ya esta en la lista (SL-17).
      const resumen = await paraCadaEmpresa(
        async (id) => {
          informes.push(await compararEmpresaAnalitica(cliente, id, opciones));
        },
        { cliente: cliente as unknown as ClienteDeOrganizaciones },
      );
      fallidas = resumen.fallidas.length;
      for (const f of resumen.fallidas) console.error(`empresa ${f.organizacionId}: fallo al leer`);
    }
    for (const informe of informes) for (const linea of lineasDeInforme(informe)) console.log(linea);
    const codigo = codigoDeSalida(informes, fallidas);
    const incoherentes = informes.reduce((n, i) => n + i.cadenaIncoherente.length, 0);
    console.log(
      `total: empresas=${informes.length + fallidas} con-diferencias=${informes.filter(hayDiferencias).length} ` +
        `cadena-incoherente=${incoherentes} fallidas=${fallidas} salida=${codigo}`,
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
    console.error(`Fallo geo:equivalencia-analitica (${nombreDeError(error)}).`);
    process.exit(2);
  });
}
