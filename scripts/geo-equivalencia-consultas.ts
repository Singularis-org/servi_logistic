import { pathToFileURL } from "node:url";

import { Prisma, type PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import type {
  OrdenBaseCobroDevolucionRow,
  OrdenParaCorreccionRow,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import {
  SNAPSHOT_SELECT,
  congeladoDeLaFila,
  leerDescriptivosDeOrdenes,
} from "@/lib/repositories/CierreDiaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { planificarReconciliacion, type TxDeReconciliacion } from "@/lib/repositories/ZonaRepository";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import { tarifaDe } from "@/lib/utils/cierre-detalle";
import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";

import { compararPorId, type Cifras, type Diferencia } from "./geo-equivalencia/comparacion";
import * as hoy from "./geo-equivalencia/consultas-de-hoy";
import { crearClienteDeSoloLectura, leerArgumentos } from "./geo-equivalencia-dinero";

// SLT-65 (design §9; R22–R24) — `pnpm geo:equivalencia-consultas [--muestra 200] [--empresa <id>]`.
//
// Compara, empresa por empresa, las lecturas que SLT-65 pasa al catalogo jerarquico: la copia
// congelada de hoy (`geo-equivalencia/consultas-de-hoy.ts`) frente al repositorio. Bloques: lo que
// congelaria un cierre y el ingreso que sale de ello, el cobro de una devolucion, la lectura para la
// correccion, la marca de los listados, lo que moveria el guardado de cada zona y el conteo de
// ordenes sin entregar de cada nodo.
//
// El conteo se compara una vez por pais en plataforma, como lo lee el superadmin (con las ordenes de
// todas las empresas), y ademas por empresa, en su contexto. Este archivo esta en
// `EXCEPCIONES_DE_PLATAFORMA` por ese `comoPlataforma` (SLT-65).
//
// SOLO LECTURA (R24). Reutiliza el cliente del script de SLT-44: cada conexion nace con
// `default_transaction_read_only = on` y cualquier escritura falla con `25006`.
//
// SIN DATOS PERSONALES (R24). La salida lleva cifras, ids de empresa, zona, nodo y orden, y los
// importes que difieran. Los nombres y los campos personales solo dicen «distinto».
//
// SOLO CONTRA localhost: se niega a correr con otra base. Lo corre una PERSONA sobre una copia de
// produccion restaurada en local (design §9). Ningun agente fuera de la base de tests local.

const USO = "Uso: pnpm geo:equivalencia-consultas [--muestra <n>] [--empresa <organizacion_id>]";

/** Salidas: 0 todo coincide, 1 algo difiere, 2 una empresa o un pais no se pudo leer. */
export type CodigoDeSalida = 0 | 1 | 2;

export interface InformeDeEmpresa {
  organizacionId: string;
  /** Por orden: la marca y los tres nombres que congelaria un cierre. */
  cierres: Cifras;
  /** `comparados` = gestiones de los detalles de la muestra; `distintos` = 1 si el total difiere. */
  cierresIngreso: Cifras;
  cobroDevolucion: Cifras;
  correccion: Cifras;
  listados: Cifras;
  /** Ordenes del listado sin tarifa: su `fleteOrigen` no dice la marca (no entran en `listados`). */
  listadosSinTarifa: number;
  reconciliacion: Cifras;
  diferencias: Diferencia[];
}

export interface InformeDePais {
  paisId: string;
  /** Quien ve las ordenes contadas: `plataforma` o la empresa del contexto. */
  ambito: string;
  conteoSinEntregar: Cifras;
  /** Informativo (no cambia la salida): ordenes vivas con la cadena de FK viejas incoherente. */
  cadenaIncoherente: string[];
  diferencias: Diferencia[];
}

export interface OpcionesDeComparacion {
  /** Cuantas ordenes recientes (y cuantos detalles de cierre) entran en la muestra. */
  muestra: number;
  /**
   * El cliente de la lectura NUEVA. Por defecto, el mismo que la de hoy. Lo usa el test para
   * inyectar una marca en un canton y ver que la comparacion la nombra (T5.3).
   */
  clienteNuevo?: PrismaClient;
}

// ---------------------------------------------------------------------------------------------
// Bloque `cierres`: lo que congelaria un cierre y el ingreso de los detalles
// ---------------------------------------------------------------------------------------------

type FilaSnapshot = Prisma.GestionOrdenGetPayload<{ select: typeof SNAPSHOT_SELECT }>;

/** Lo que se compara de cada orden. `estado: "error"` = falta un descriptivo (el cierre lanzaria). */
interface CongeladoComparable {
  id: string;
  estado: "ok" | "error";
  esZonaEspecial: boolean | null;
  provinciaNombre: string | null;
  cantonNombre: string | null;
  distritoNombre: string | null;
}

const NOMBRES_DEL_CONGELADO = new Set(["provinciaNombre", "cantonNombre", "distritoNombre"]);

function comparable(
  id: string,
  calcular: () => { esZonaEspecial: boolean; provinciaNombre: string; cantonNombre: string; distritoNombre: string | null },
): CongeladoComparable {
  try {
    const c = calcular();
    return {
      id,
      estado: "ok",
      esZonaEspecial: c.esZonaEspecial,
      provinciaNombre: c.provinciaNombre,
      cantonNombre: c.cantonNombre,
      distritoNombre: c.distritoNombre,
    };
  } catch {
    return { id, estado: "error", esZonaEspecial: null, provinciaNombre: null, cantonNombre: null, distritoNombre: null };
  }
}

const DETALLE_SELECT = {
  cierreId: true,
  ordenId: true,
  esCentral: true,
  montoCobrar: true,
  cobraComision: true,
  tarifaId: true,
  tarifaValorFlete: true,
  tarifaValorFleteGam: true,
  tarifaValorFleteDevuelto: true,
  tarifaValorFleteDevueltoGam: true,
  tarifaComisionCod: true,
  tarifaIvaFlete: true,
  tarifaIvaComisionCod: true,
  tarifaEspecial: true,
  tarifaEspecialDevuelta: true,
} as const satisfies Prisma.CierreDetailSelect;

async function compararCierres(
  cliente: PrismaClient,
  clienteNuevo: PrismaClient,
  muestra: number,
  diferencias: Diferencia[],
): Promise<{ cierres: Cifras; ingreso: Cifras }> {
  // (a) Las gestiones vigentes sin cierre: lo que se llevaria un cierre nuevo.
  const vigentes = await cliente.gestionOrden.findMany({
    where: { cierreId: null, anuladaAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: SNAPSHOT_SELECT,
  });
  // (b) Los `muestra` detalles mas recientes y las gestiones de su cierre.
  const detalles = await cliente.cierreDetail.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: muestra,
    select: DETALLE_SELECT,
  });
  const delDetalle = detalles.length === 0
    ? []
    : await cliente.gestionOrden.findMany({
        where: {
          cierreId: { in: [...new Set(detalles.map((d) => d.cierreId))] },
          ordenId: { in: [...new Set(detalles.map((d) => d.ordenId))] },
          anuladaAt: null,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { ...SNAPSHOT_SELECT, cierreId: true, resultado: true },
      });
  const detallePorPar = new Map(detalles.map((d) => [`${d.cierreId}|${d.ordenId}`, d]));
  const gestionesDeDetalles = delDetalle.flatMap((g) => {
    const d = detallePorPar.get(`${g.cierreId}|${g.ordenId}`);
    return d === undefined ? [] : [{ g, d }];
  });

  // Una fila por orden, como el grano de `cierre_detail`.
  const porOrden = new Map<string, FilaSnapshot>();
  for (const f of [...vigentes, ...gestionesDeDetalles.map((x) => x.g)]) {
    if (!porOrden.has(f.ordenId)) porOrden.set(f.ordenId, f);
  }
  const filas = [...porOrden.values()];

  // En serie: dentro de la transaccion del test las lecturas comparten conexion.
  const descHoy = await hoy.leerDescriptivosDeOrdenes(filas, cliente);
  const descNuevo = await leerDescriptivosDeOrdenes(filas, clienteNuevo);
  const deHoy = filas.map((f) => comparable(f.ordenId, () => hoy.congeladoDeHoy(f, descHoy)));
  const nuevos = filas.map((f) => comparable(f.ordenId, () => congeladoDeLaFila(f, descNuevo)));
  const cierres = compararPorId(
    deHoy,
    nuevos,
    ["estado", "esZonaEspecial", "provinciaNombre", "cantonNombre", "distritoNombre"],
    NOMBRES_DEL_CONGELADO,
    diferencias,
    "cierres",
  );

  // El ingreso de los detalles: tarifa, resultado y entradas congeladas; la marca, la de hoy frente
  // a la nueva. Una orden con un descriptivo ausente ya cuenta como distinta arriba y no suma.
  const marcaHoy = new Map(deHoy.map((c) => [c.id, c.esZonaEspecial]));
  const marcaNueva = new Map(nuevos.map((c) => [c.id, c.esZonaEspecial]));
  const sumar = (marcas: Map<string, boolean | null>): Prisma.Decimal => {
    let total = new Prisma.Decimal(0);
    for (const { g, d } of gestionesDeDetalles) {
      const marca = marcas.get(g.ordenId);
      if (marca === null || marca === undefined) continue;
      const derivado = derivarIngresoOrden(
        {
          resultado: g.resultado,
          esCentral: d.esCentral,
          esZonaEspecial: marca,
          montoCobrar: d.montoCobrar === null ? null : d.montoCobrar.toFixed(2),
          cobraComision: d.cobraComision,
        },
        tarifaDe(d),
      );
      for (const monto of Object.values(derivado)) if (monto !== undefined) total = total.plus(monto);
    }
    return total;
  };
  const totalHoy = sumar(marcaHoy).toFixed(2);
  const totalNuevo = sumar(marcaNueva).toFixed(2);
  const ingresoDistinto = totalHoy !== totalNuevo;
  if (ingresoDistinto) {
    diferencias.push({ bloque: "cierres", id: "ingreso-de-los-detalles", campo: "total", hoy: totalHoy, nuevo: totalNuevo });
  }
  return { cierres, ingreso: { comparados: gestionesDeDetalles.length, distintos: ingresoDistinto ? 1 : 0 } };
}

// ---------------------------------------------------------------------------------------------
// La muestra de ordenes de `cobro-devolucion`, `correccion` y `listados`
// ---------------------------------------------------------------------------------------------

interface OrdenDeMuestra {
  id: string;
  tiendaId: string;
  numRemision: string | null;
  numGuia: number | null;
}

/** Las `muestra` ordenes vivas mas recientes, mas todas las vivas cuyo distrito tiene marca. */
export async function leerMuestraDeOrdenes(cliente: PrismaClient, muestra: number): Promise<OrdenDeMuestra[]> {
  const select = { id: true, tiendaId: true, numRemision: true, numGuia: true } as const;
  const recientes = await cliente.orden.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: muestra,
    select,
  });
  // Las marcas de la empresa del contexto (la RLS y la extension las acotan).
  const marcas = await cliente.distritoZonaEspecial.findMany({ select: { distritoId: true } });
  const conMarca = marcas.length === 0
    ? []
    : await cliente.orden.findMany({
        where: { deletedAt: null, distritoId: { in: [...new Set(marcas.map((m) => m.distritoId))] } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select,
      });
  const porId = new Map<string, OrdenDeMuestra>();
  for (const o of [...recientes, ...conMarca]) if (!porId.has(o.id)) porId.set(o.id, o);
  return [...porId.values()];
}

const CAMPOS_COBRO = ["tiendaId", "zonaId", "esCentral", "esZonaEspecial", "montoCobrar", "cobraComision"] as const;

type CobroComparable = Omit<OrdenBaseCobroDevolucionRow, "ordenId"> & { id: string };

async function compararCobro(
  cliente: PrismaClient,
  nuevo: OrdenRepository,
  ordenes: readonly OrdenDeMuestra[],
  diferencias: Diferencia[],
): Promise<Cifras> {
  const deHoy: CobroComparable[] = [];
  const nuevos: CobroComparable[] = [];
  const comoComparable = ({ ordenId, ...resto }: OrdenBaseCobroDevolucionRow): CobroComparable => ({ id: ordenId, ...resto });
  for (const { id } of ordenes) {
    const a = await hoy.findBaseCobroDevolucion(cliente, id);
    const b = await nuevo.findBaseCobroDevolucion(id);
    if (a !== null) deHoy.push(comoComparable(a));
    if (b !== null) nuevos.push(comoComparable(b));
  }
  return compararPorId(deHoy, nuevos, [...CAMPOS_COBRO], new Set(), diferencias, "cobro-devolucion");
}

/** Los campos de texto de la correccion: personales o nombres. Solo se imprime «distinto». */
const CAMPOS_DE_TEXTO_CORRECCION = new Set([
  "destinatario",
  "telefonoDest",
  "producto",
  "notas",
  "direccion",
  "distritoNombre",
  "zonaNombre",
]);

async function compararCorreccion(
  cliente: PrismaClient,
  nuevo: OrdenRepository,
  ordenes: readonly OrdenDeMuestra[],
  diferencias: Diferencia[],
): Promise<Cifras> {
  const deHoy: OrdenParaCorreccionRow[] = [];
  const nuevos: OrdenParaCorreccionRow[] = [];
  for (const { id } of ordenes) {
    const a = await hoy.findParaCorreccion(cliente, id);
    const b = await nuevo.findParaCorreccion(id);
    if (a !== null) deHoy.push(a);
    if (b !== null) nuevos.push(b);
  }
  // Todos los campos de la fila, de cualquiera de los dos lados.
  const campos = [...new Set([...deHoy, ...nuevos].flatMap((f) => Object.keys(f)))].filter(
    (c): c is keyof OrdenParaCorreccionRow & string => c !== "id",
  );
  return compararPorId(deHoy, nuevos, campos, CAMPOS_DE_TEXTO_CORRECCION, diferencias, "correccion");
}

/**
 * La marca que deja ver una fila de `findListItemsByIds`: el DTO no la lleva, la lleva el origen
 * del flete. `null` si no se puede saber: sin tarifa (`fleteOrigen` «normal» y flete en cero).
 */
function marcaDelListado(item: { fleteOrigen?: string; fleteConIva?: string }): boolean | null {
  if (item.fleteOrigen === "especial" || item.fleteOrigen === "especial_sin_pacto") return true;
  if (item.fleteOrigen === "normal" && item.fleteConIva !== undefined && item.fleteConIva !== "0.00") return false;
  return null;
}

async function compararListados(
  cliente: PrismaClient,
  nuevo: OrdenRepository,
  ordenes: readonly OrdenDeMuestra[],
  diferencias: Diferencia[],
): Promise<{ listados: Cifras; sinTarifa: number }> {
  const marcasHoy = await hoy.marcasDeHoy(cliente, ordenes.map((o) => o.id));
  const porId = new Map((await nuevo.findListItemsByIds(ordenes.map((o) => o.id), { tipo: "global" })).map((i) => [i.id, i]));

  let distintos = 0;
  let sinTarifa = 0;
  for (const o of ordenes) {
    const deHoy = marcasHoy.get(o.id);
    // La API de la tienda dueña, filtrada por la remision (unica por tienda) o la guia.
    const filtro =
      o.numRemision !== null ? { numRemision: o.numRemision } : o.numGuia !== null ? { numGuia: o.numGuia } : null;
    const api =
      filtro === null
        ? undefined
        : (await nuevo.listByOwner({ ownerId: o.tiendaId, ...filtro, skip: 0, take: 2 })).items.find((f) =>
            o.numRemision !== null ? f.numRemision === o.numRemision : f.numGuia === o.numGuia,
          );
    const item = porId.get(o.id);
    const listado = item === undefined ? undefined : marcaDelListado(item);
    if (listado === null) sinTarifa++;

    let distinto = false;
    const anotar = (campo: string, nuevoValor: boolean | undefined) => {
      distinto = true;
      diferencias.push({
        bloque: "listados",
        id: o.id,
        campo,
        hoy: String(deHoy ?? "(ausente)"),
        nuevo: String(nuevoValor ?? "(ausente)"),
      });
    };
    if (api?.costeo.esZonaEspecial !== deHoy) anotar("api costeo.esZonaEspecial", api?.costeo.esZonaEspecial);
    if (listado !== null && listado !== deHoy) anotar("listado esZonaEspecial", listado);
    if (distinto) distintos++;
  }
  return { listados: { comparados: ordenes.length, distintos }, sinTarifa };
}

// ---------------------------------------------------------------------------------------------
// Bloque `reconciliacion`: un guardado sin cambios de cada zona
// ---------------------------------------------------------------------------------------------

async function compararReconciliacion(
  cliente: PrismaClient,
  clienteNuevo: PrismaClient,
  diferencias: Diferencia[],
): Promise<Cifras> {
  const zonas = await cliente.zona.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  const ids = (filas: readonly { id: string }[]) => JSON.stringify(filas.map((f) => f.id).sort());
  let distintas = 0;
  for (const { id: zonaId } of zonas) {
    const distritos = (
      await cliente.zonaDistrito.findMany({ where: { zonaId }, orderBy: { distritoId: "asc" }, select: { distritoId: true } })
    ).map((f) => f.distritoId);
    const planHoy = await hoy.planDeHoy(cliente, distritos);
    // Sin `tx`: el cliente del script no esta dentro de una transaccion y la carga abre la suya.
    const planNuevo = await planificarReconciliacion(clienteNuevo as unknown as TxDeReconciliacion, distritos);

    let distinta = false;
    for (const destino of [...new Set([...planHoy.porZona.keys(), ...planNuevo.porZona.keys()])].sort()) {
      const a = ids(planHoy.porZona.get(destino) ?? []);
      const b = ids(planNuevo.porZona.get(destino) ?? []);
      if (a === b) continue;
      distinta = true;
      diferencias.push({ bloque: "reconciliacion", id: zonaId, campo: `destino ${destino}`, hoy: a, nuevo: b });
    }
    if (planHoy.retenidasEnBodegaSatelite !== planNuevo.retenidasEnBodegaSatelite) {
      distinta = true;
      diferencias.push({
        bloque: "reconciliacion",
        id: zonaId,
        campo: "retenidas",
        hoy: String(planHoy.retenidasEnBodegaSatelite),
        nuevo: String(planNuevo.retenidasEnBodegaSatelite),
      });
    }
    if (distinta) distintas++;
  }
  return { comparados: zonas.length, distintos: distintas };
}

// ---------------------------------------------------------------------------------------------
// La comparacion de una empresa
// ---------------------------------------------------------------------------------------------

/**
 * Compara las lecturas de hoy con las nuevas para una empresa (R22, R23). Abre el contexto de esa
 * empresa: la RLS y el filtro de la extension acotan las dos lecturas igual.
 */
export async function compararEmpresaConsultas(
  cliente: PrismaClient,
  organizacionId: string,
  opciones: OpcionesDeComparacion,
): Promise<InformeDeEmpresa> {
  return conEmpresa(organizacionId, async () => {
    const clienteNuevo = opciones.clienteNuevo ?? cliente;
    const diferencias: Diferencia[] = [];
    // Uno por empresa: el catalogo se carga una vez para todas las lecturas de ordenes.
    const nuevo = new OrdenRepository(clienteNuevo);
    const { cierres, ingreso } = await compararCierres(cliente, clienteNuevo, opciones.muestra, diferencias);
    const ordenes = await leerMuestraDeOrdenes(cliente, opciones.muestra);
    const cobroDevolucion = await compararCobro(cliente, nuevo, ordenes, diferencias);
    const correccion = await compararCorreccion(cliente, nuevo, ordenes, diferencias);
    const { listados, sinTarifa } = await compararListados(cliente, nuevo, ordenes, diferencias);
    const reconciliacion = await compararReconciliacion(cliente, clienteNuevo, diferencias);
    return {
      organizacionId,
      cierres,
      cierresIngreso: ingreso,
      cobroDevolucion,
      correccion,
      listados,
      listadosSinTarifa: sinTarifa,
      reconciliacion,
      diferencias,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Por pais: el conteo de ordenes sin entregar de cada nodo y la cadena incoherente
// ---------------------------------------------------------------------------------------------

/**
 * Por cada provincia, canton y distrito del pais con al menos una orden, el conteo de hoy frente al
 * nuevo; y las ordenes vivas con la cadena de FK viejas incoherente (informativo).
 *
 * Lee en el contexto que haya abierto quien llama: las ordenes que cuenta son las que ese contexto
 * ve. `main` lo corre una vez por pais en plataforma (`compararConteosDelPaisEnPlataforma`,
 * design §9) y una vez por empresa (`compararConteosDeLaEmpresa`).
 */
export async function compararConteosDelPais(
  cliente: PrismaClient,
  paisId: string,
  opciones: { ambito: string; clienteNuevo?: PrismaClient },
): Promise<InformeDePais> {
  const nuevo = new OrdenRepository(opciones.clienteNuevo ?? cliente);
  const diferencias: Diferencia[] = [];

  const ternas = await cliente.orden.findMany({
    where: { provincia: { paisId } },
    distinct: ["provinciaId", "cantonId", "distritoId"],
    select: { provinciaId: true, cantonId: true, distritoId: true },
  });
  const nodos: { nivel: NivelGeografico; id: string }[] = [];
  const vistos = new Set<string>();
  const anadir = (nivel: NivelGeografico, id: string | null) => {
    if (id === null || vistos.has(id)) return;
    vistos.add(id);
    nodos.push({ nivel, id });
  };
  for (const t of ternas) {
    anadir("provincia", t.provinciaId);
    anadir("canton", t.cantonId);
    anadir("distrito", t.distritoId);
  }
  const deHoy: { id: string; conteo: number }[] = [];
  const nuevos: { id: string; conteo: number }[] = [];
  for (const { nivel, id } of nodos) {
    deHoy.push({ id, conteo: await hoy.contarSinEntregarDeHoy(cliente, nivel, id) });
    nuevos.push({ id, conteo: await nuevo.contarSinEntregarPorNodoGeografico(nivel, id) });
  }
  const conteoSinEntregar = compararPorId(deHoy, nuevos, ["conteo"], new Set(), diferencias, "conteo-sin-entregar");

  // Con las FK viejas: el distrito de la orden cuelga de otro canton, o su canton de otra provincia.
  const vivas = await cliente.orden.findMany({
    where: { deletedAt: null, provincia: { paisId } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      provinciaId: true,
      cantonId: true,
      canton: { select: { provinciaId: true } },
      distrito: { select: { cantonId: true } },
    },
  });
  const cadenaIncoherente = vivas
    .filter((o) => o.canton.provinciaId !== o.provinciaId || (o.distrito !== null && o.distrito.cantonId !== o.cantonId))
    .map((o) => o.id);

  return { paisId, ambito: opciones.ambito, conteoSinEntregar, cadenaIncoherente, diferencias };
}

/** `compararConteosDelPais` en plataforma: las ordenes de todas las empresas, como el superadmin (R22). */
export function compararConteosDelPaisEnPlataforma(
  cliente: PrismaClient,
  paisId: string,
  clienteNuevo?: PrismaClient,
): Promise<InformeDePais> {
  return comoPlataforma("SLT-65", "geo:equivalencia-consultas compara el conteo sin entregar del pais como el superadmin", () =>
    compararConteosDelPais(cliente, paisId, { ambito: "plataforma", clienteNuevo }),
  );
}

/** Los paises a comparar: el de la empresa de `--empresa`, o el de cada empresa. */
async function paisesAComparar(cliente: PrismaClient, empresa: string | null): Promise<string[]> {
  const filas = await comoPlataforma("SLT-65", "geo:equivalencia-consultas lista los paises de las empresas", () =>
    cliente.organizacion.findMany({
      where: empresa === null ? {} : { id: empresa },
      distinct: ["paisId"],
      orderBy: { paisId: "asc" },
      select: { paisId: true },
    }),
  );
  return filas.map((f) => f.paisId);
}

/** `compararConteosDelPais` sobre el pais de la empresa y con sus ordenes (contexto de empresa). */
export async function compararConteosDeLaEmpresa(
  cliente: PrismaClient,
  organizacionId: string,
  clienteNuevo?: PrismaClient,
): Promise<InformeDePais> {
  return conEmpresa(organizacionId, async () => {
    const organizacion = await cliente.organizacion.findFirst({ where: { id: organizacionId }, select: { paisId: true } });
    if (organizacion === null) throw new Error(`empresa ${organizacionId}: no se encontro`);
    return compararConteosDelPais(cliente, organizacion.paisId, { ambito: `empresa ${organizacionId}`, clienteNuevo });
  });
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

const cifras = (prefijo: string, nombre: string, c: Cifras, extra = "") =>
  `${prefijo} ${nombre}: comparados=${c.comparados} distintos=${c.distintos}${extra}`;

const lineaDeDiferencia = (prefijo: string, d: Diferencia) =>
  `  ${prefijo} [${d.bloque}] ${d.id} ${d.campo}: hoy=${d.hoy} nuevo=${d.nuevo}`;

/** Las lineas que se imprimen de una empresa: cifras por bloque y cada diferencia (R23, R24). */
export function lineasDeInforme(informe: InformeDeEmpresa): string[] {
  const e = `empresa ${informe.organizacionId}`;
  return [
    cifras(e, "cierres", informe.cierres),
    cifras(e, "cierres-ingreso", informe.cierresIngreso),
    cifras(e, "cobro-devolucion", informe.cobroDevolucion),
    cifras(e, "correccion", informe.correccion),
    cifras(e, "listados", informe.listados, ` sin-tarifa=${informe.listadosSinTarifa}`),
    cifras(e, "reconciliacion", informe.reconciliacion),
    ...informe.diferencias.map((d) => lineaDeDiferencia(e, d)),
  ];
}

/** Las lineas de un pais: el conteo, el numero de ordenes con cadena incoherente y sus ids (R23). */
export function lineasDeInformeDePais(informe: InformeDePais): string[] {
  const p = `pais ${informe.paisId} (${informe.ambito})`;
  return [
    cifras(p, "conteo-sin-entregar", informe.conteoSinEntregar),
    `${p} cadena-incoherente: ordenes=${informe.cadenaIncoherente.length}`,
    ...informe.cadenaIncoherente.map((id) => `  ${p} [cadena-incoherente] ${id}`),
    ...informe.diferencias.map((d) => lineaDeDiferencia(p, d)),
  ];
}

export function hayDiferencias(informe: InformeDeEmpresa): boolean {
  return [
    informe.cierres,
    informe.cierresIngreso,
    informe.cobroDevolucion,
    informe.correccion,
    informe.listados,
    informe.reconciliacion,
  ].some((c) => c.distintos > 0);
}

/** La cadena incoherente es informativa: no cuenta como diferencia. */
export function hayDiferenciasDePais(informe: InformeDePais): boolean {
  return informe.conteoSinEntregar.distintos > 0;
}

export function codigoDeSalida(
  empresas: readonly InformeDeEmpresa[],
  paises: readonly InformeDePais[],
  fallidas: number,
): CodigoDeSalida {
  if (fallidas > 0) return 2;
  return empresas.some(hayDiferencias) || paises.some(hayDiferenciasDePais) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Argumentos y entrada
// ---------------------------------------------------------------------------------------------

/** Solo localhost: el script no corre contra ninguna otra base. */
export function esBaseLocal(url: string | undefined): boolean {
  if (url === undefined || url.trim() === "") return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

const nombreDeError = (error: unknown) => (error instanceof Error ? error.name : "error");

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
  if (!esBaseLocal(process.env.DATABASE_URL)) {
    console.error("ABORTA: DATABASE_URL no apunta a localhost. Este script solo corre contra una base local.");
    process.exitCode = 2;
    return;
  }
  const cliente = crearClienteDeSoloLectura(process.env.DATABASE_URL);
  const opciones: OpcionesDeComparacion = { muestra: argumentos.muestra };
  const empresas: InformeDeEmpresa[] = [];
  const paises: InformeDePais[] = [];
  let fallidas = 0;
  let paisesFallidos = 0;

  const unaEmpresa = async (id: string) => {
    empresas.push(await compararEmpresaConsultas(cliente, id, opciones));
    paises.push(await compararConteosDeLaEmpresa(cliente, id));
  };
  try {
    // Una vez por pais, en plataforma (design §9).
    for (const paisId of await paisesAComparar(cliente, argumentos.empresa)) {
      try {
        paises.push(await compararConteosDelPaisEnPlataforma(cliente, paisId));
      } catch (error) {
        paisesFallidos++;
        console.error(`pais ${paisId}: fallo al leer (${nombreDeError(error)})`);
      }
    }
    if (argumentos.empresa !== null) {
      try {
        await unaEmpresa(argumentos.empresa);
      } catch (error) {
        fallidas++;
        console.error(`empresa ${argumentos.empresa}: fallo al leer (${nombreDeError(error)})`);
      }
    } else {
      // `paraCadaEmpresa` abre plataforma solo para listar; ya esta en la lista (SL-17).
      const resumen = await paraCadaEmpresa(unaEmpresa, { cliente: cliente as unknown as ClienteDeOrganizaciones });
      fallidas += resumen.fallidas.length;
      for (const f of resumen.fallidas) console.error(`empresa ${f.organizacionId}: fallo al leer`);
    }
    for (const informe of empresas) for (const linea of lineasDeInforme(informe)) console.log(linea);
    for (const informe of paises) for (const linea of lineasDeInformeDePais(informe)) console.log(linea);
    const codigo = codigoDeSalida(empresas, paises, fallidas + paisesFallidos);
    const incoherentes = paises.reduce((n, p) => n + p.cadenaIncoherente.length, 0);
    console.log(
      `total: empresas=${empresas.length + fallidas} con-diferencias=${empresas.filter(hayDiferencias).length} ` +
        `conteos-con-diferencias=${paises.filter(hayDiferenciasDePais).length} cadena-incoherente=${incoherentes} ` +
        `paises=${paises.filter((p) => p.ambito === "plataforma").length + paisesFallidos} fallidas=${fallidas + paisesFallidos} salida=${codigo}`,
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
    console.error(`Fallo geo:equivalencia-consultas (${nombreDeError(error)}).`);
    process.exit(2);
  });
}
