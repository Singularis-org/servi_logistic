import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  OrdenBaseCobroDevolucionRow,
  OrdenParaCorreccionRow,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import { SNAPSHOT_SELECT } from "@/lib/repositories/CierreDiaRepository";
import { conAyudaAbiertaDe, type ClienteSqlAyuda } from "@/lib/repositories/ayuda-abierta";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import {
  esZonaEspecialDeLaEmpresa,
  SELECT_MARCA_ZONA_ESPECIAL,
} from "@/lib/repositories/_shared/zona-especial";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import type { SortDir, SortField } from "@/lib/types/orden";
import { ordenTotal } from "@/lib/types/ordenamiento-listado";
import { ESTADOS_TERMINALES } from "@/lib/types/order-status-transiciones";
import { ESTADOS_PAQUETE_EN_ESTANTE } from "@/lib/utils/estados-bodega-satelite";
import { NOMBRE_USUARIO_SELECT } from "@/lib/utils/nombre-usuario";

// SLT-65 (design §8) — LA LECTURA DE HOY, CONGELADA. NO SE EDITA.
//
// Copia literal de las consultas que SLT-65 pasa al catalogo (`nodo_geografico`), tal como estaban
// en el commit b2bade4, ANTES de tocar los repositorios. Es «el antes» contra el que se comparan las
// lecturas nuevas: el test de CI, el script de equivalencia (`scripts/geo-equivalencia-consultas.ts`)
// y el de rendimiento (`scripts/geo-explain-consultas.ts`). Si se tocara para que un test pase, la
// comparacion dejaria de probar nada.
//
// Unico cambio respecto del original: cada metodo es una funcion libre que recibe el cliente
// (`this.prisma` -> `cliente`) o la transaccion (`tx`). Los cuerpos —select, include, where, orderBy,
// el colapso, la marca y el mapeo—, comentarios incluidos, son los de entonces. Las constantes
// privadas del modulo de origen se copian igual; los helpers y constantes exportados de `lib/` se
// importan. Cada funcion cita el archivo y las lineas de b2bade4 de donde sale.
//
// Vive en `scripts/` y no en `lib/` porque lee las tablas viejas de la geografia (`provincia`,
// `canton`, `distrito`, `zona_distrito` y `distrito_zona_especial` por la relacion `zonasEspeciales`),
// y las guardias `zona-especial-punto-unico` y `geografia-predicado-unico` barren `lib/` y `app/`.
//
// Se borra con SLT-48.

// Cada funcion pide solo lo que lee: sirve el `PrismaClient`, el cliente de una transaccion o el
// `Pick` de cualquiera de los repositorios de origen.
type ClienteOrden = Pick<PrismaClient, "orden">;
type ClienteOrdenConAyuda = ClienteOrden & ClienteSqlAyuda;
type TxDePlan = Pick<PrismaClient, "zonaDistrito" | "orden">;

// =================================================================================================
// CierreDiaRepository (lib/repositories/CierreDiaRepository.ts)
// =================================================================================================

// Copia de CierreDiaRepository.ts:291 en b2bade4. `SNAPSHOT_SELECT` se importa: es exportado.
type SnapshotRow = Prisma.GestionOrdenGetPayload<{ select: typeof SNAPSHOT_SELECT }>;

/**
 * FICHA 450 (T2.7) — los descriptivos que el snapshot CONGELA COMO VALOR, leidos de uno en uno.
 *
 * `esCentral` (R6) y los cinco nombres (R7) se congelan como VALOR y no como FK porque son
 * MUTABLES (design §2.1 de la feature 69): guardar solo el FK dejaria abierto el vector «cambiar
 * la zona entre solicitar y aprobar» que aquella feature cerro. Eso no cambia ni un apice: lo que
 * cambia es que las cinco lecturas van en SERIE sobre la conexion de la transaccion en vez de
 * salir las cinco a la vez.
 *
 * Los `in` van deduplicados: un cierre de 40 ordenes de la misma tienda no manda 40 ids.
 */
// Copia de CierreDiaRepository.ts:304–311 en b2bade4 (se copia y no se importa: SLT-65 la cambia).
export interface DescriptivosDeOrden {
  zonas: Map<string, { nombre: string; esCentral: boolean }>;
  tiendas: Map<string, { nombre: string }>;
  provincias: Map<string, { nombre: string }>;
  cantones: Map<string, { nombre: string }>;
  /** `zonaEspecial`: la marca de la EMPRESA de la transaccion (SL-38), ya resuelta a dos valores. */
  distritos: Map<string, { nombre: string; zonaEspecial: boolean }>;
}

/** Lo minimo que `leerDescriptivosDeOrdenes` necesita del cliente de la transaccion. */
// Copia de CierreDiaRepository.ts:313–317 en b2bade4.
export type DescriptivosTxClient = Pick<
  PrismaClient,
  "zona" | "usuario" | "provincia" | "canton" | "distrito"
>;

// Copia de CierreDiaRepository.ts:319–368 en b2bade4.
export async function leerDescriptivosDeOrdenes(
  filas: readonly SnapshotRow[],
  tx: DescriptivosTxClient,
): Promise<DescriptivosDeOrden> {
  const unicos = (ids: (string | null)[]): string[] => [
    ...new Set(ids.filter((id): id is string => id !== null)),
  ];
  const zonaIds = unicos(filas.map((f) => f.orden.zonaId));
  const tiendaIds = unicos(filas.map((f) => f.orden.tiendaId));
  const provinciaIds = unicos(filas.map((f) => f.orden.provinciaId));
  const cantonIds = unicos(filas.map((f) => f.orden.cantonId));
  const distritoIds = unicos(filas.map((f) => f.orden.distritoId));

  // ⚠️ UNA CONSULTA A LA VEZ (R3). Un `Promise.all` aqui reproduciria EXACTAMENTE el defecto que
  // esta ficha vino a cerrar: cinco consultas de golpe sobre la UNICA conexion de la transaccion.
  const zonas = await tx.zona.findMany({
    where: { id: { in: zonaIds } },
    select: { id: true, nombre: true, esCentral: true },
  });
  const tiendas = await tx.usuario.findMany({
    where: { id: { in: tiendaIds } },
    select: { id: true, nombre: true },
  });
  const provincias = await tx.provincia.findMany({
    where: { id: { in: provinciaIds } },
    select: { id: true, nombre: true },
  });
  const cantones = await tx.canton.findMany({
    where: { id: { in: cantonIds } },
    select: { id: true, nombre: true },
  });
  const distritos = await tx.distrito.findMany({
    where: { id: { in: distritoIds } },
    // SL-38: la marca de la EMPRESA de la transaccion, por el punto unico (la RLS la acota).
    select: { id: true, nombre: true, ...SELECT_MARCA_ZONA_ESPECIAL },
  });

  return {
    zonas: new Map(zonas.map((z) => [z.id, { nombre: z.nombre, esCentral: z.esCentral }])),
    tiendas: new Map(tiendas.map((t) => [t.id, { nombre: t.nombre }])),
    provincias: new Map(provincias.map((p) => [p.id, { nombre: p.nombre }])),
    cantones: new Map(cantones.map((c) => [c.id, { nombre: c.nombre }])),
    distritos: new Map(
      distritos.map((d) => [
        d.id,
        { nombre: d.nombre, zonaEspecial: esZonaEspecialDeLaEmpresa(d) },
      ]),
    ),
  };
}

/**
 * FICHA 450 — el descriptivo de un FK NOT NULL, o error duro.
 *
 * Con la relacion anidada, una fila ausente era imposible: Prisma devolvia el objeto o el tipo no
 * compilaba. Con las lecturas por `in` deja de serlo, y en codigo de dinero un `?? null` silencioso
 * congelaria un nombre vacio sin que nadie se enterara — el fallo mudo que este repo persigue. Asi
 * que se lanza, y la transaccion entera se revierte.
 */
// Copia de CierreDiaRepository.ts:370–386 en b2bade4.
function descriptivoDe<T>(mapa: Map<string, T>, id: string, tabla: string): T {
  const fila = mapa.get(id);
  if (fila === undefined) {
    throw new Error(
      `snapshot del cierre: falta la fila de \`${tabla}\` con id ${id} dentro de la transaccion`,
    );
  }
  return fila;
}

/** La marca y los nombres que `crearCierre` congela en `cierre_detail` para una fila. */
export interface CongeladoDeHoy {
  esCentral: boolean;
  esZonaEspecial: boolean;
  tiendaNombre: string;
  zonaNombre: string;
  provinciaNombre: string;
  cantonNombre: string;
  distritoNombre: string | null;
}

// Copia de las expresiones de `crearCierre`, CierreDiaRepository.ts:1339–1370 en b2bade4: las de
// `esCentral`, `esZonaEspecial` y los cinco nombres del `data` del `createMany`. Las columnas que
// se copian tal cual de la orden y las de la tarifa no leen geografia y no entran.
export function congeladoDeHoy(f: SnapshotRow, descriptivos: DescriptivosDeOrden): CongeladoDeHoy {
  return {
    esCentral: descriptivoDe(descriptivos.zonas, f.orden.zonaId, "zona").esCentral,
    // R20 (SL-38): congela la marca de la EMPRESA en este instante; desmarcar despues
    // no mueve esta fila. Una orden sin distrito (el unico FK nullable de `orden`)
    // congela `false`: sin distrito no hay marca que aplicar.
    esZonaEspecial:
      f.orden.distritoId === null
        ? false
        : descriptivoDe(descriptivos.distritos, f.orden.distritoId, "distrito")
            .zonaEspecial,
    // descriptivos (R7).
    tiendaNombre: descriptivoDe(descriptivos.tiendas, f.orden.tiendaId, "usuario").nombre,
    zonaNombre: descriptivoDe(descriptivos.zonas, f.orden.zonaId, "zona").nombre,
    provinciaNombre: descriptivoDe(
      descriptivos.provincias,
      f.orden.provinciaId,
      "provincia",
    ).nombre,
    cantonNombre: descriptivoDe(descriptivos.cantones, f.orden.cantonId, "canton").nombre,
    distritoNombre:
      f.orden.distritoId === null
        ? null
        : descriptivoDe(descriptivos.distritos, f.orden.distritoId, "distrito").nombre,
  };
}

// =================================================================================================
// OrdenRepository (lib/repositories/OrdenRepository.ts)
// =================================================================================================

/**
 * FICHA 337 (segunda mitad) -- las CINCO entradas de `derivarIngresoOrden` (mas las dos que esa
 * funcion pide aunque la rama `rechazada` no las use), para congelar el cobro del rechazo que la
 * tienda hace desde novedades.
 *
 * Es la version minima de lo que `cierre_detail` congela al solicitar un cierre: la misma
 * informacion, para una gestion que ya no va a entrar en ningun cierre. `select` explicito y sin
 * relaciones de adorno.
 *
 * `deletedAt: null` en el `where`, con el mismo criterio que `findById` y `findParaCorreccion`:
 * una orden borrada cuenta como no encontrada, no como fila sin tarifa.
 *
 * Money-safe: `montoCobrar` sale como STRING escala 2 (`toFixed(2)`), nunca `number`.
 */
// Copia de OrdenRepository.ts:2755–2783 en b2bade4.
export async function findBaseCobroDevolucion(
  cliente: ClienteOrden,
  ordenId: string,
): Promise<OrdenBaseCobroDevolucionRow | null> {
  const row = await cliente.orden.findFirst({
    where: { id: ordenId, deletedAt: null },
    select: {
      id: true,
      tiendaId: true,
      zonaId: true,
      montoCobrar: true,
      cobraComision: true,
      zona: { select: { esCentral: true } },
      distrito: { select: { ...SELECT_MARCA_ZONA_ESPECIAL } },
    },
  });
  if (row === null) return null;
  return {
    ordenId: row.id,
    tiendaId: row.tiendaId,
    zonaId: row.zonaId,
    esCentral: row.zona.esCentral,
    // La marca es del distrito PARA LA EMPRESA de la orden (SL-38), no de la zona. Una orden
    // sin distrito -- el unico FK nullable de `orden`-- entra como `false`: sin distrito no hay
    // marca que aplicar. Mismo punto unico que usan `findParaCorreccion` y el listado.
    esZonaEspecial: esZonaEspecialDeLaEmpresa(row.distrito),
    montoCobrar: row.montoCobrar ? row.montoCobrar.toFixed(2) : null,
    cobraComision: row.cobraComision,
  };
}

// Copia de OrdenRepository.ts:2785–2837 en b2bade4. `conAyudaAbiertaDe` recibe el mismo cliente
// (antes `this.prisma`), por eso el cliente pide tambien `$queryRaw`.
export async function findParaCorreccion(
  cliente: ClienteOrdenConAyuda,
  ordenId: string,
): Promise<OrdenParaCorreccionRow | null> {
  const row = await cliente.orden.findFirst({
    where: { id: ordenId, deletedAt: null },
    select: {
      id: true,
      tiendaId: true,
      numGuia: true,
      destinatario: true,
      telefonoDest: true,
      producto: true,
      notas: true,
      direccion: true,
      peso: true,
      montoCobrar: true,
      cobraComision: true,
      provinciaId: true,
      cantonId: true,
      distritoId: true,
      estatus: { select: { value: true } },
      zona: { select: { id: true, nombre: true, esCentral: true } },
      distrito: { select: { nombre: true, ...SELECT_MARCA_ZONA_ESPECIAL } },
      cierreDetalles: { select: { id: true }, take: 1 },
    },
  });
  if (row === null) return null;
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    estatusValue: row.estatus.value,
    numGuia: row.numGuia,
    destinatario: row.destinatario,
    telefonoDest: row.telefonoDest,
    producto: row.producto,
    notas: row.notas,
    direccion: row.direccion,
    peso: row.peso ? row.peso.toNumber() : null,
    montoCobrar: row.montoCobrar ? row.montoCobrar.toFixed(2) : null,
    cobraComision: row.cobraComision,
    provinciaId: row.provinciaId,
    cantonId: row.cantonId,
    distritoId: row.distritoId,
    distritoNombre: row.distrito?.nombre ?? null,
    zonaId: row.zona.id,
    zonaNombre: row.zona.nombre,
    esCentral: row.zona.esCentral,
    // La marca es del distrito PARA LA EMPRESA de la orden (SL-38), no de la zona. Una orden
    // sin distrito (el unico FK nullable) entra como `false`.
    esZonaEspecial: esZonaEspecialDeLaEmpresa(row.distrito),
    yaEnUnCierre: row.cierreDetalles.length > 0,
    // FICHA 454 (R64): la ayuda deja de ser estado; se deriva (punto unico, `ayuda-abierta.ts`).
    ayudaAbierta: (await conAyudaAbiertaDe(cliente, [row.id])).has(row.id),
  };
}

// Copia de OrdenRepository.ts:315–418 en b2bade4 (`apiOrdenSelect`; el comentario de cabecera,
// :291–314, no se repite). Solo cambia el nombre, para que se lea como la constante de la copia.
export function API_ORDEN_SELECT(ownerId: string) {
  return {
    numGuia: true,
    numRemision: true,
    destinatario: true,
    telefonoDest: true,
    producto: true,
    direccion: true,
    montoCobrar: true,
    createdAt: true,
    estatus: { select: { value: true } },
    // ⏳ 2026-09-09 (feature 404, R6/R15): una RELACION ANIDADA de la misma `findMany`/`findUnique`
    // —un LEFT JOIN por la PK de `usuario`—, no una consulta por item: la pagina entera se resuelve
    // con la consulta que ya se hacia. Se proyectan `id` + las tres columnas de identidad y NADA MAS
    // (ni telefono, ni email, ni cedula, ni zona, ni vehiculo, ni estado interno).
    mensajeroAsignado: { select: { id: true, ...NOMBRE_USUARIO_SELECT } },
    // --- ⏳ 2026-09-10 (feature 415) — LA ZONA Y LAS ENTRADAS DEL COSTO -----------------------
    // R19/R24: la mitad del par (tienda, zona) con el que el service resuelve la tarifa vigente de
    // toda la pagina en UNA sola consulta. No se publica.
    zonaId: true,
    // R20: entrada VIVA de la formula. No se publica.
    cobraComision: true,
    /**
     * ⚠️ ESTA ES LA ZONA **DE LA ORDEN** (a donde va el paquete), NO LA DEL MENSAJERO.
     *
     * En este sistema «zona» nombra dos cosas y solo una es esta. La exclusion de «zona» que
     * figura unas lineas mas arriba, DENTRO de la proyeccion de `mensajeroAsignado`, habla de la
     * OTRA —`usuario.zona_id`, en que zona trabaja esa persona, dato personal suyo— y sigue
     * vigente palabra por palabra: esa no se publica y esta feature no la toca (R6).
     *
     * `id` y `nombre` se PUBLICAN (R1). `esCentral` **NO se publica** (R5): entra solo en
     * `costeo` porque elige la columna de flete. Ni subzona, ni marca de zona especial, ni
     * geografia: nadie las pidio y `es_central` es una columna mutable que daria un segundo sitio
     * donde responder «¿es GAM?».
     */
    zona: { select: { id: true, nombre: true, esCentral: true } },
    // R20/R21: la marca de zona especial, la otra entrada viva. Desde SL-38 es de la EMPRESA de
    // la orden (`distrito_zona_especial`, acotada por la RLS) y se resuelve en `toApiOrdenRow` con
    // el punto unico; `distrito` es el unico FK nullable de `orden`, asi que la relacion puede
    // venir `null`. No se publica ni la marca ni nada del distrito (ni provincia, ni canton, ni
    // el nombre).
    distrito: { select: { ...SELECT_MARCA_ZONA_ESPECIAL } },
    /**
     * R25/R26/R27/R31/R33 — LA FILA CONGELADA de `cierre_detail` con la que se deriva `costoReal`.
     *
     * ⚠️ EL FILTRO POR `aprobado` NO ES REDUNDANTE, aunque HOY no recorte ni una fila. Medido
     * contra produccion el 2026-09-10: de 1.652 ordenes vivas, 1.182 tienen fila congelada y las
     * **1.182 son de cierres `aprobado`** —cero en `solicitado`, `rechazado` o `vencido`—.
     * (Reproducido en local el mismo dia: 15 de 15.)
     *
     * Y ESTE ES EL MECANISMO, que es lo que hace falta saber para no borrarlo: la fila **se
     * escribe al SOLICITAR** el cierre, no al aprobarlo —`tx.cierreDetail.createMany` vive dentro
     * de `CierreDiaRepository.crearCierre` (`lib/repositories/CierreDiaRepository.ts:942`), en la
     * misma `$transaction` que vincula las gestiones—, y es **INMUTABLE** (69/R10, con guardia que
     * prohibe borrarla desde `lib/`). O sea: un cierre `solicitado` YA tiene su fila y un
     * `rechazado` la CONSERVA.
     *
     * El 100 % medido significa, entonces, que hoy no quedan cierres sin resolver con ordenes
     * vivas —un estado de los datos—, **no** que el codigo lo garantice. Sin este filtro,
     * `costoReal` cambiaria **HACIA ATRAS** en cuanto vuelva a haber un cierre solicitado o en
     * cuanto uno se rechace. Cambiar hacia atras es exactamente el defecto que esta ficha existe
     * para evitar. Lo mata `tests/integration/db/costo-y-zona-api-415.test.ts` (casos 2 y 3), que
     * siembra los dos estados que hoy no existen en produccion.
     *
     * `tiendaId: ownerId` es el `tienda_id` **CONGELADO** de la fila, no el vivo de la orden
     * (R33): un cambio posterior de dueño no puede publicar a una tienda lo que se le facturo a
     * otra.
     *
     * `orderBy` de DOS claves + `take: 1` (R27, D6): gana la MAS RECIENTE, con desempate por `id`
     * para que el orden sea TOTAL y dos lecturas consecutivas den lo mismo. Una orden `devuelta`
     * sigue viva y puede entrar en un segundo cierre; en la base local hay 5 ordenes con dos o mas
     * filas elegibles, asi que no es hipotetico.
     *
     * `take: 1` en una relacion anidada lo aplica Prisma POR FILA PADRE: no hay N+1 y el coste no
     * depende de en cuantos cierres apareciera cada orden (R31).
     */
    cierreDetalles: {
      where: { tiendaId: ownerId, cierre: { estado: "aprobado" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        // Las entradas CONGELADAS de la formula...
        montoCobrar: true,
        cobraComision: true,
        esCentral: true,
        esZonaEspecial: true,
        // ...y la tarifa CONGELADA, que `tarifaDe` reconstruye. Ni una columna mas: ni el `id` de
        // la fila, ni el `cierre_id`, ni el `zona_id`/`zona_nombre` congelados, ni los
        // descriptivos, ni el `created_at` —nada de eso se publica (R18) y lo que no se lee no se
        // puede filtrar—. `tiendaId` tampoco: ya va en el `where`.
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
        tarifaFulfillment: true,
      },
    },
  } satisfies Prisma.OrdenSelect;
}

/** Los parametros de `listByOwner` (OrdenRepository.ts:3408–3417 en b2bade4). */
export interface ParamsPaginaApi {
  ownerId: string;
  estatusId?: string;
  createdAtDesde?: Date;
  createdAtHasta?: Date;
  numGuia?: number;
  numRemision?: string;
  skip: number;
  take: number;
}

// Copia de `listByOwner`, OrdenRepository.ts:3418–3444 en b2bade4: el `where` y el `findMany` de
// la pagina. Devuelve las filas crudas, con la marca anidada en `distrito`; el `count` del total y
// el mapeo `toApiOrdenRow` no leen geografia y no entran (la marca de cada fila la da `marcasDeHoy`
// o `esZonaEspecialDeLaEmpresa(fila.distrito)`, que es lo que hacia `toApiOrdenRow:675`).
export async function paginaApiDeHoy(cliente: ClienteOrden, params: ParamsPaginaApi) {
  // R20/R23: `tiendaId` y `deletedAt` se escriben PRIMERO y de forma INCONDICIONAL. No es
  // estilo: en un object literal, un spread POSTERIOR que repitiera `tiendaId` lo pisaria (gana
  // el ultimo valor escrito) y el listado devolveria ordenes ajenas sin fallar ruidosamente.
  const where: Prisma.OrdenWhereInput = {
    tiendaId: params.ownerId, // R6/R7 (106) + R20 (257): owner FORZADO
    deletedAt: null, // R11 (106) + R23 (257)
    ...(params.estatusId ? { estatusId: params.estatusId } : {}),
    // R15: igualdad estricta sobre columna nullable -> `num_guia = $1` no casa con NULL en SQL.
    ...(params.numGuia !== undefined ? { numGuia: params.numGuia } : {}),
    ...(params.numRemision !== undefined ? { numRemision: params.numRemision } : {}),
    ...(params.createdAtDesde || params.createdAtHasta
      ? {
          createdAt: {
            ...(params.createdAtDesde ? { gte: params.createdAtDesde } : {}),
            ...(params.createdAtHasta ? { lt: params.createdAtHasta } : {}),
          },
        }
      : {}),
  };
  return cliente.orden.findMany({
    where,
    orderBy: { createdAt: "desc" }, // orden estable entre paginas (R10)
    skip: params.skip,
    take: params.take,
    select: API_ORDEN_SELECT(params.ownerId),
  });
}

// --- Constantes privadas del listado, copiadas igual -------------------------------------------

// Copia de OrdenRepository.ts:981–985 en b2bade4, reducida a la entrada del orden por defecto: el
// design (§8, §10) solo mide la primera pagina con el orden por defecto, y la guardia
// `clave-remision-solo-lectura` no admite otro archivo que nombre esa columna.
const SORT_COLUMN: Record<"created_at", "createdAt"> = {
  created_at: "createdAt",
};

// Copia de OrdenRepository.ts:1016 en b2bade4 (el porque, en :987–1015).
const DESEMPATE_UNICO: Prisma.OrdenOrderByWithRelationInput = { id: "asc" };

// `gestion_orden.resultado` de una reprogramacion (espejo de
// `LiberacionReprogramadaRepository`, el cron que consume la misma fecha).
// Copia de OrdenRepository.ts:1060–1062 en b2bade4.
const RESULTADO_REPROGRAMADA = "reprogramado";

// Copia de OrdenRepository.ts:1097–1130 en b2bade4.
export const WITH_ESTATUS_Y_TIENDA = {
  include: {
    estatus: { select: { id: true, value: true } },
    tienda: {
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        // Feature 274: aqui NO hay tarifas. Ver el comentario de `TARIFA_SELECT`.
      },
    },
    zona: { select: { id: true, nombre: true, esCentral: true } },
    provincia: { select: { id: true, nombre: true } },
    canton: { select: { id: true, nombre: true } },
    // La marca de zona especial (2026-08-25; de la EMPRESA desde SL-38) viaja con el distrito
    // porque decide el MONTO del flete que muestran las dos columnas de dinero de la fila, no solo
    // su etiqueta.
    distrito: { select: { id: true, nombre: true, ...SELECT_MARCA_ZONA_ESPECIAL } },
    mensajeroAsignado: { select: { id: true, ...NOMBRE_USUARIO_SELECT } },
    // Gestion de reprogramacion VIGENTE (a lo sumo una, `take: 1`): alimenta la
    // columna "Liberada el" de la tab `reprogramada`. `orden -> gestiones` es 1:N
    // (una orden acumula gestiones entre reintentos), asi que la vigente es la mas
    // reciente NO anulada. Mismo shape que `LiberacionReprogramadaRepository`
    // (el cron que libera), para que la fecha mostrada sea EXACTAMENTE la que
    // decide la liberacion y no puedan divergir.
    gestiones: {
      where: { resultado: RESULTADO_REPROGRAMADA, anuladaAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { fechaReprogramacion: true },
    },
  },
} as const;

// Fila de orden del listado con todas las relaciones directas resueltas.
// Copia de OrdenRepository.ts:1132–1133 en b2bade4.
export type OrdenListRow = Prisma.OrdenGetPayload<typeof WITH_ESTATUS_Y_TIENDA>;

/** La primera pagina de `/ordenes` sin filtros: solo orden y ventana (ListOrdenesParams sin `where`). */
export interface ParamsPaginaListado {
  sortBy: Extract<SortField, "created_at">;
  sortDir: SortDir;
  skip: number;
  take: number;
}

// Copia de `list`, OrdenRepository.ts:2003–2100 en b2bade4, para la primera pagina SIN FILTROS:
// con `params.where` vacio, cada `...criterioColumna(...)`, `...criterioBusqueda(...)` y los
// condicionales del `where` (:2005–2077) escriben `{}`, y solo queda `deletedAt: null` (R34). El
// `orderBy` (:2088–2091) y el `findMany` (:2094–2100) van tal cual. El `count`, las tarifas, las
// señales y `toListItemDTO` no leen geografia y no entran (la marca de cada fila es
// `esZonaEspecialDeLaEmpresa(fila.distrito)`, como en `toListItemDTO:1284`).
export async function paginaListadoDeHoy(
  cliente: ClienteOrden,
  params: ParamsPaginaListado,
): Promise<OrdenListRow[]> {
  const where: Prisma.OrdenWhereInput = {
    deletedAt: null, // R34
  };
  // Feature 101/R6: `prioridad DESC` PRIMERO y LUEGO el orden vigente (lista blanca R31:
  // created_at/num_guia/num_remision). El sort va en la QUERY para respetar la paginacion
  // (una orden prioritaria flota a la primera pagina, no queda atrapada en la 2). Es GLOBAL
  // al listado pero INOCUO fuera de `en_bodega_central`: solo ahi (y en bodega satelite) hay
  // `prioridad = true`; en el resto el desempate booleano cae al criterio vigente sin
  // alterar el orden observable (R10, sin reordenar superficies ajenas).
  //
  // FICHA 352: la lista se cierra con `DESEMPATE_UNICO`, y se cierra pasando por `ordenTotal`
  // —que exige el desempate como argumento— para que la proxima tabla que se sume al contrato
  // no pueda olvidarlo sin que el compilador se lo diga. El porque esta en la constante.
  const orderBy: Prisma.OrdenOrderByWithRelationInput[] = ordenTotal(
    [{ prioridad: "desc" }, { [SORT_COLUMN[params.sortBy]]: params.sortDir }],
    DESEMPATE_UNICO,
  );

  return cliente.orden.findMany({
    where,
    orderBy,
    skip: params.skip,
    take: params.take,
    ...WITH_ESTATUS_Y_TIENDA, // R25: incluye estatus.value + tienda.nombre
  });
}

// La marca de zona especial de un conjunto de ordenes, con la proyeccion de hoy: la de
// `apiOrdenSelect` (OrdenRepository.ts:356), `WITH_ESTATUS_Y_TIENDA` (:1115),
// `findBaseCobroDevolucion` (:2767) y `findParaCorreccion` (:2805) en b2bade4 —la relacion
// `distrito` con `...SELECT_MARCA_ZONA_ESPECIAL`—, resuelta con el punto unico como en
// `toApiOrdenRow:675` y `toListItemDTO:1284`. Una orden sin distrito da `false`. No es copia de un
// metodo: junta la proyeccion y el mapeo que esas lecturas repiten, para comparar ordenes sueltas.
export async function marcasDeHoy(
  cliente: ClienteOrden,
  ordenIds: readonly string[],
): Promise<Map<string, boolean>> {
  if (ordenIds.length === 0) return new Map();
  const filas = await cliente.orden.findMany({
    where: { id: { in: [...ordenIds] } },
    select: { id: true, distrito: { select: { ...SELECT_MARCA_ZONA_ESPECIAL } } },
  });
  return new Map(filas.map((f) => [f.id, esZonaEspecialDeLaEmpresa(f.distrito)]));
}

/**
 * FICHA 374 (R60/R61) — cuantas ordenes SIN ENTREGAR cuelgan de un nodo geografico.
 *
 * SE CUENTA POR LA COLUMNA CONGELADA DE LA ORDEN, no enumerando los descendientes del nodo. La
 * orden lleva `provincia_id`, `canton_id` y `distrito_id`, y los tres tienen indice propio, asi
 * que un `count` por nivel es un acceso por indice en vez de un `IN` de hasta 123 ids. Y es
 * ademas MAS CORRECTO: `distrito_id` es el UNICO nullable de la terna, asi que una orden sin
 * distrito CUENTA al desactivar su canton y NO cuenta al desactivar un distrito.
 *
 * «SIN ENTREGAR» = `deleted_at IS NULL` + estatus fuera de `ESTADOS_TERMINALES`. (El resto del
 * comentario, OrdenRepository.ts:2883–2894, explica por que no se usan otras listas.)
 */
// Copia de `contarSinEntregarPorNodoGeografico`, OrdenRepository.ts:2896–2910 en b2bade4.
export async function contarSinEntregarDeHoy(
  cliente: ClienteOrden,
  nivel: NivelGeografico,
  id: string,
): Promise<number> {
  const porNivel =
    nivel === "provincia"
      ? { provinciaId: id }
      : nivel === "canton"
        ? { cantonId: id }
        : { distritoId: id };
  return cliente.orden.count({
    where: {
      ...porNivel,
      deletedAt: null,
      estatus: { value: { notIn: [...ESTADOS_TERMINALES] } },
    },
  });
}

// =================================================================================================
// ZonaRepository (lib/repositories/ZonaRepository.ts)
// =================================================================================================

/**
 * ⭑ EL CORTE DE ELEGIBILIDAD DE LA RECONCILIACION (366/R6/R7/R8), EN UNA SOLA DECLARACION.
 *
 * Vive en el `WHERE` a proposito: son condiciones sobre filas de OTRAS tablas (`cierre_detail` y
 * `gestion_orden`), no `if`s que un doble pueda esquivar. Sus cuatro cortes, sin ninguno de
 * estado:
 *   · `deletedAt: null`       — una orden borrada no se re-estampa;
 *   · `cierreDetalles: none`  — ya tiene un detalle congelado en un cierre: eso ya se facturo, y
 *     `cierre_detail` es INMUTABLE (366/R8);
 *   · `gestiones: none {...}` — tiene una gestion VIGENTE cuyo resultado ya decidio dinero
 *     (`entregada`, `rechazada`, `incidente`). Una `reprogramada` o una `devuelta` vigentes NO
 *     excluyen: las dos se rutean HACIA ADELANTE por `orden.zonaId`
 *     (`LiberacionReprogramadaService`, `DevolucionSlaService`), asi que dejarlas con la zona
 *     vieja las liberaria a la bodega equivocada — el mismo atasco que la 366 vino a arreglar.
 *
 * El estado NO entra aqui: cada consumidor le añade su clausula COMPLEMENTARIA, y esa
 * complementariedad es lo que hace que los dos conjuntos sean disjuntos por construccion.
 */
// Copia de ZonaRepository.ts:187–200 en b2bade4.
export function whereBaseElegible(distritoIds: string[], zonaResueltaId: string): Prisma.OrdenWhereInput {
  return {
    distritoId: { in: distritoIds },
    zonaId: { not: zonaResueltaId },
    deletedAt: null,
    cierreDetalles: { none: {} },
    gestiones: {
      none: {
        anuladaAt: null,
        resultado: { in: ["entregado", "devolucion_a_origen_por_rechazo", "incidente"] },
      },
    },
  };
}

/** La misma forma que `PlanDeReconciliacion` (design §6.1). */
export interface PlanDeHoy {
  /** Por zona destino: las ordenes que se mueven (id, guia, remision). */
  porZona: Map<string, { id: string; numGuia: number | null; numRemision: string | null }[]>;
  retenidasEnBodegaSatelite: number;
}

// Copia de `update`, ZonaRepository.ts:461–531 en b2bade4, SIN las escrituras: sin el `loteId`, el
// `resolverActorCongelado` (:488–491), el `updateMany` ni el `appendAccion` (:534–560). Lo que el
// original escribia, aqui se devuelve: `elegibles` por zona y el conteo de retenidas. Como en el
// original, una zona sin elegibles no entra en `porZona` (el `continue` de :532).
export async function planDeHoy(tx: TxDePlan, distritosAfectados: string[]): Promise<PlanDeHoy> {
  const porZona: PlanDeHoy["porZona"] = new Map();
  let ordenesRetenidasEnBodegaSatelite = 0;
  if (distritosAfectados.length > 0) {
    // El estado YA reemplazado de la N:M: es el que decide cual es la zona correcta.
    const filas = await tx.zonaDistrito.findMany({
      where: { distritoId: { in: distritosAfectados } },
      select: { distritoId: true, zonaId: true },
    });

    const zonasPorDistrito = new Map<string, string[]>();
    for (const fila of filas) {
      const bucket = zonasPorDistrito.get(fila.distritoId);
      if (bucket) bucket.push(fila.zonaId);
      else zonasPorDistrito.set(fila.distritoId, [fila.zonaId]);
    }

    // 366/R2/R3: el colapso 1/0/>1 es EL MISMO que usan la carga masiva y la correccion
    // manual (`_shared/zona-colapso`). Un distrito con 0 o con >1 zonas resuelve `null` y NO
    // mueve ninguna orden: no se inventa una zona eligiendo la primera.
    const distritosPorZonaResuelta = new Map<string, string[]>();
    for (const distritoId of distritosAfectados) {
      const zonaResuelta = zonaUnicaDeDistrito(zonasPorDistrito.get(distritoId) ?? []);
      if (zonaResuelta === null) continue;
      const bucket = distritosPorZonaResuelta.get(zonaResuelta);
      if (bucket) bucket.push(distritoId);
      else distritosPorZonaResuelta.set(zonaResuelta, [distritoId]);
    }

    if (distritosPorZonaResuelta.size > 0) {
      for (const [zonaResueltaId, distritoIds] of distritosPorZonaResuelta) {
        // El corte de elegibilidad de la 366 (los cuatro cortes que NO miran el estado) vive
        // en `whereBaseElegible`, arriba, y lo leen las DOS consultas de este bloque.
        const base = whereBaseElegible(distritoIds, zonaResueltaId);

        // FICHA 377 (R2/R8): en transito si, en el estante no. El porque, en ZonaRepository.ts:498–523.
        ordenesRetenidasEnBodegaSatelite += await tx.orden.count({
          where: { ...base, estatus: { value: { in: [...ESTADOS_PAQUETE_EN_ESTANTE] } } },
        });

        const elegibles = await tx.orden.findMany({
          where: { ...base, estatus: { value: { notIn: [...ESTADOS_PAQUETE_EN_ESTANTE] } } },
          select: { id: true, numGuia: true, numRemision: true },
        });
        if (elegibles.length === 0) continue;

        porZona.set(zonaResueltaId, elegibles);
      }
    }
  }
  return { porZona, retenidasEnBodegaSatelite: ordenesRetenidasEnBodegaSatelite };
}
