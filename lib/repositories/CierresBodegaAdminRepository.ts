import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AlcanceLecturaBodega,
  CierreBodegaDetalleCierreRow,
  CorregirConciliacionInput,
  ICierresBodegaAdminRepository,
  MarcaConMontoResult,
  MarcarConciliadoInput,
  ResolverCierreBodegaInput,
  ResolverCierreBodegaResult,
  RevertirConciliacionInput,
  RevertirConciliacionResult,
} from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import {
  ASIENTOS_POR_DEFECTO,
  asentarCierreDia,
  type AsientosCierreDiaDeps,
} from "@/lib/repositories/_shared/asientos-cierre-dia";
import { esperadoDe } from "@/lib/utils/conciliacion-satelite";
import { consolidacionesConDinero } from "@/lib/repositories/_shared/conciliacion-con-dinero";
import type { CierreBodegaResumenRow } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import {
  BODEGA_RESUMEN_SELECT,
  aResumenRows,
} from "@/lib/repositories/CierreBodegaRepository";
// Feature 69/T23 (R15): se reusan las MISMAS piezas que compone T18 en `CierresAdminRepository`
// (proyeccion + mapper), no una copia: las dos pantallas de admin muestran el detalle del mismo
// cierre_dia ya creado y tienen que salir del mismo sitio o divergen.
// Feature 230 (T7.1, R26): + las CUATRO piezas de la hoja fundida (proyeccion, snapshot con su
// clave de join, orden y recortes) y su compositor. Mismo motivo llevado al extremo: los DOS
// caminos de la descarga detallada tienen que emitir la MISMA fila desde la MISMA declaracion,
// asi que ninguno de ellos declara nada propio.
import {
  cargosFulfillmentVigentes,
  CIERRE_NUEVO_CON_GESTIONES,
  cierresDelModeloNuevo,
  componerGestionesDescarga,
  ORDEN_DETALLE_DESCARGA,
  ORDEN_RECHAZOS_DESCARGA,
  RECHAZO_TIENDA_DESCARGA_SELECT,
  toRechazoTiendaDescargaDTO,
  DETALLE_ADMIN_SELECT,
  DETALLE_DESCARGA_SELECT,
  GESTION_ADMIN_SELECT,
  GESTION_DESCARGA_SELECT,
  ORDEN_GESTIONES_DESCARGA,
  filtrosWhere,
  toPendienteRowDesdeSnapshot,
} from "@/lib/repositories/CierresAdminRepository";
// FICHA 394 (2026-09-08): + el derivador EN LOTE de los intentos de entrega vigentes, el mismo
// que consumen la analitica y el tope de la 276. Se IMPORTA, no se reescribe: es el numero con
// el que el sistema cobra, y dos agregaciones «iguales» divergen a la primera correccion.
import { contarIntentosVigentesEnLoteCon } from "@/lib/repositories/OrdenHistorialRepository";
import type {
  CierreGestionDescargaRow,
  RechazoTiendaDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { FiltrosDescargaGestionesRepo } from "@/lib/types/filtros-cierres";
import { CierreDetalleFaltanteError } from "@/lib/utils/cierre-detalle";
import type { PaginaRepositorio, RangoPagina } from "@/lib/utils/rango-pagina";
import type { FiltrosCierresBodegaRepo } from "@/lib/types/filtros-cierres";
import { NOMBRE_USUARIO_SELECT, nombreCompletoUsuario } from "@/lib/utils/nombre-usuario";
import { idsCierresBodegaPorFolio, recortePorFolio } from "@/lib/repositories/_shared/folio-cierres-sql";

// Solo el estado que la 40 puede transicionar (R18): la guardia del updateMany.
const ESTADO_SOLICITADO = "solicitado";
// FICHA 431: el otro lado de la marca. `aprobado` se LEE «Recibido» (D2/D3: el enum `cierre_estado`
// NO se toca, lo comparten `cierre_dia` y `cierre_bodega`).
const ESTADO_APROBADO = "aprobado";

/** SLT-73 — la transaccion de la marca: el cliente interactivo de `$transaction`. */
type TxMarca = Prisma.TransactionClient;

/**
 * SLT-73 (R11/R13/R15, design §2.3-§2.4) — LA DIFERENCIA DE LA SATELITE de un evento (marca o
 * correccion), dentro de la transaccion del llamador y DESPUES de su `updateMany` guardado.
 *
 *   esperado   = `esperadoDe` del snapshot de la consolidacion (R8): lo recaudado por TODOS los
 *                metodos menos el pago a sus mensajeros y lo que gana la satelite por rechazos (D3/D4).
 *   objetivo   = esperado - recibido: lo que la satelite sigue debiendo tras este evento.
 *   yaAsentado = suma de `diferencia` de los ajustes PREVIOS de esta consolidacion: lo que la caja
 *                ya descuenta por eventos anteriores.
 *   delta      = objetivo - yaAsentado: lo que ESTE evento tiene que mover.
 *
 * Si `delta` es cero no se escribe nada (R13: la diferencia no vario). Si no, UNA fila de ajuste
 * (append-only: ninguna anterior se toca) y UN movimiento de caja con origen esa fila: egreso si la
 * satelite entrego menos (delta > 0), ingreso si entrego mas (delta < 0), siempre por |delta|.
 * La naturaleza de caja de las dos categorias vive en `lib/utils/caja-tesoreria.ts`; aqui no se lee.
 */
async function asentarDiferenciaSatelite(
  tx: TxMarca,
  asientos: AsientosCierreDiaDeps,
  args: {
    cierreBodegaId: string;
    evento: "marca" | "correccion";
    recibido: Prisma.Decimal;
    creadoPor: string;
    instante: Date;
  },
): Promise<void> {
  const consolidacion = await tx.cierreBodega.findUniqueOrThrow({
    where: { id: args.cierreBodegaId },
    select: { totalGeneral: true, totalPagoMensajero: true, totalIngresoBodegaRechazos: true },
  });
  // SLT-76 (R6): la MISMA formula que el «Falta por recibir» de las dos pantallas, sin copia.
  const esperado = esperadoDe(consolidacion);
  const previos = await tx.conciliacionBodegaAjuste.aggregate({
    where: { cierreBodegaId: args.cierreBodegaId },
    _sum: { diferencia: true },
  });
  const yaAsentado = previos._sum.diferencia ?? new Prisma.Decimal(0);
  const delta = esperado.minus(args.recibido).minus(yaAsentado);
  if (delta.isZero()) return;

  const ajuste = await tx.conciliacionBodegaAjuste.create({
    data: {
      cierreBodegaId: args.cierreBodegaId,
      evento: args.evento,
      montoEsperado: esperado,
      montoRecibido: args.recibido,
      diferencia: delta,
      creadoPor: args.creadoPor,
      createdAt: args.instante,
    },
    select: { id: true },
  });
  const entregoMenos = delta.isPositive();
  await asientos.walletMovimientoRepo.crearMovimientos(tx, [
    {
      tipo: entregoMenos ? "egreso" : "ingreso",
      categoria: entregoMenos ? "egreso_diferencia_satelite" : "ingreso_diferencia_satelite",
      monto: delta.abs().toFixed(2),
      origenTipo: "conciliacion_bodega_ajuste",
      origenId: ajuste.id,
      descripcion: null,
      registradoPor: args.creadoPor,
      fechaMovimiento: args.instante,
    },
  ]);
}

/**
 * SLT-96 — ¿lo declarado de esta consolidacion es 0? `null` si no existe. Lee el SNAPSHOT de la base,
 * dentro de la transaccion de la escritura: la peticion nunca aporta lo declarado (R5). Los snapshots
 * no cambian despues de consolidar, asi que leerlos aqui no deja carrera con el `updateMany`.
 */
async function declaradoEsCero(tx: TxMarca, id: string): Promise<boolean | null> {
  const s = await tx.cierreBodega.findUnique({
    where: { id },
    select: { totalGeneral: true, totalPagoMensajero: true, totalIngresoBodegaRechazos: true },
  });
  return s === null ? null : esperadoDe(s).isZero();
}

// Feature 69/T23: el detalle sale del SNAPSHOT -> el cliente necesita `cierreDetail`.
type CierresBodegaAdminPrismaClient = Pick<
  PrismaClient,
  | "cierreBodega"
  | "cierreDia"
  | "gestionOrden"
  | "cierreDetail"
  // Ficha 362 (R9): la resolucion pasa a `$transaction` y registra su accion en ella.
  | "$transaction"
  | "historialAccion"
  | "usuario"
  | "zona"
  // SLT-76 (R3/R4): los dos libros de `consolidacionesConDinero` (`desmarcable`).
  | "walletMovimiento"
  | "conciliacionBodegaAjuste"
  // SLT-105 (R122): los ids de los recibidos incompletos salen de SQL a mano (`idsRecibidosIncompletos`).
  | "$queryRaw"
  // SLT-110 (R210): SOLO LECTURA del cargo vigente de fulfillment de las ordenes del detalle. La app
  // no puede escribir esa tabla (REVOKE, SLT-94).
  | "ordenFulfillmentMovimiento"
  // SLT-113 (R373): SOLO LECTURA de los rechazos de la tienda para la hoja de la descarga. La
  // escritura vive en la tx de `CierreDiaRepository.crearCierre`.
  | "cierreRechazoTienda"
>;

// Proyeccion de la cabecera de un cierre_dia incluido en el detalle (mensajero +
// totales snapshot).
export const DETALLE_CIERRE_SELECT = {
  id: true,
  mensajeroId: true,
  totalEfectivo: true,
  totalSimpe: true,
  totalTransferencia: true,
  totalGeneral: true,
  totalPagoMensajero: true, // feature 39/R20: snapshot del pago al mensajero del cierre_dia
  totalIngresoBodegaRechazos: true, // feature 56/R19: snapshot del ingreso de bodega por rechazos del cierre_dia
  solicitadoAt: true, // SLT-104 (PA3): fecha la nota de tarifas congeladas de las gestiones de ESTE cierre_dia
  mensajero: { select: NOMBRE_USUARIO_SELECT },
  // SLT-56 (R20): cuantas gestiones de ESTE cierre tienen al menos un ajuste del pago, para marcar
  // el cierre en la lista del cierre de bodega. Se cuentan GESTIONES (`some`) y no filas de ajuste:
  // una gestion ajustada dos veces es una gestion ajustada. Mismo conjunto de gestiones que el
  // detalle de abajo (`cierreId` = este cierre), asi que la marca y las gestiones marcadas cuadran.
  _count: { select: { gestiones: { where: { ajustesPagoMensajero: { some: {} } } } } },
} as const;

type DetalleCierreRow = Prisma.CierreDiaGetPayload<{ select: typeof DETALLE_CIERRE_SELECT }>;

export function toDetalleCierreRow(r: DetalleCierreRow): CierreBodegaDetalleCierreRow {
  return {
    cierreDiaId: r.id,
    mensajeroId: r.mensajeroId,
    mensajeroNombre: nombreCompletoUsuario(r.mensajero),
    totales: {
      efectivo: r.totalEfectivo.toFixed(2),
      simpe: r.totalSimpe.toFixed(2),
      transferencia: r.totalTransferencia.toFixed(2),
      general: r.totalGeneral.toFixed(2),
    },
    totalPagoMensajero: r.totalPagoMensajero.toFixed(2), // R20: snapshot money-safe STRING
    totalIngresoBodegaRechazos: r.totalIngresoBodegaRechazos.toFixed(2), // feature 56/R19: snapshot money-safe STRING
    gestionesAjustadas: r._count.gestiones, // SLT-56 (R20)
    solicitadoAt: r.solicitadoAt.toISOString(), // SLT-104 (PA3)
  };
}

/**
 * Feature 184 — Tanda E (R16) — el ORDEN de los cierres de bodega del admin, declarado UNA vez.
 *
 * Lo comparten los CINCO caminos que leen esta tabla desde este repositorio: el listado sin
 * paginar, las dos paginas (cola e historico) y los dos CONJUNTOS de los que salen los archivos.
 * Estaba escrito TRES veces —una por metodo— y la tanda E habria sumado dos copias mas.
 *
 * No es simetria: en cuanto un archivo depende de estos conjuntos, si su orden diverge del de la
 * pagina, la fila 26 del archivo deja de ser la primera de la pagina 2 (R5) y no hay ninguna
 * pantalla que lo diga. Una sola declaracion tampoco lo vuelve invisible: los casos de los
 * `*-where.test.ts` fijan el valor ABSOLUTO, asi que cambiar la constante los pone rojos.
 */
/**
 * Pedido humano del 2026-08-16 — el WHERE de los FILTROS de estos listados (fecha + zona),
 * declarado UNA vez para los cuatro caminos: las dos paginas y los dos conjuntos del archivo.
 *
 * SIN MENSAJERO, y no es un recorte de alcance sino de datos: un cierre de bodega consolida los
 * cierres del dia de VARIOS mensajeros, asi que «el mensajero de este cierre» no es una pregunta
 * con respuesta. La columna no existe.
 *
 * Las fechas son de CALENDARIO DE COSTA RICA: `solicitadoAt` es un instante, y «del 1 al 3»
 * significa desde el inicio del 1 en CR hasta el inicio del 4 en CR. Por eso el limite superior
 * es `lt` del dia SIGUIENTE y no `lte` del mismo dia — con `lte` se perderian los cierres
 * solicitados entre las 00:00 y las 23:59:59.999 del ultimo dia del rango, que es justo el dia
 * que el usuario acaba de pedir. Es el MISMO criterio que `CierresAdminRepository.filtrosWhere`,
 * escrito aparte porque la tabla y sus columnas son otras.
 */
function filtrosBodegaWhere(
  filtros: FiltrosCierresBodegaRepo | undefined,
): Prisma.CierreBodegaWhereInput[] {
  if (!filtros) return [];
  const condiciones: Prisma.CierreBodegaWhereInput[] = [];
  // SLT-42 (R22): los limites llegan ya resueltos en la zona del pais de la empresa.
  if (filtros.solicitadoDesde !== undefined || filtros.solicitadoHasta !== undefined) {
    condiciones.push({
      solicitadoAt: {
        ...(filtros.solicitadoDesde !== undefined ? { gte: filtros.solicitadoDesde } : {}),
        ...(filtros.solicitadoHasta !== undefined ? { lt: filtros.solicitadoHasta } : {}),
      },
    });
  }
  if (filtros.destinoZonaIds !== undefined) {
    condiciones.push({ zonaId: { in: [...filtros.destinoZonaIds] } });
  }
  return condiciones;
}

const ORDEN_CIERRES_BODEGA_ADMIN = {
  solicitadoAt: "desc",
} as const satisfies Prisma.CierreBodegaOrderByWithRelationInput;

/**
 * SLT-105 (R122) — el criterio de «Conciliados» («Resueltos» en la pantalla de hoy), declarado UNA
 * vez para su pagina, su `count` y su conjunto completo (Feature 184/R16).
 *
 * En POSITIVO (PA1): con la marca de recibido (`conciliadoAt` no nulo) y SIN nada por recibir, es
 * decir, fuera de `incompletos` (los ids que devuelve `idsRecibidosIncompletos`). Ya no parte por
 * `estado`: un `aprobado` con dinero por llegar se queda en la cola, y un `rechazado` heredado (sin
 * marca) tambien.
 */
function historicoBodegaWhere(
  filtros: FiltrosCierresBodegaRepo | undefined,
  incompletos: readonly string[],
  idsPorFolio?: readonly string[],
): Prisma.CierreBodegaWhereInput {
  // SLT-153 (R458): el folio DENTRO del `AND`; como clave hermana pisaria el `id: { notIn }`.
  const recortes = [...filtrosBodegaWhere(filtros), ...recortePorFolio(idsPorFolio)];
  return {
    conciliadoAt: { not: null },
    id: { notIn: [...incompletos] },
    ...(recortes.length > 0 ? { AND: recortes } : {}),
  };
}

/**
 * SLT-105 (R122) — el criterio de «Por conciliar» («Pendientes» en la pantalla de hoy), declarado UNA
 * vez para su pagina, su `count` y su conjunto completo (Feature 184/R16).
 *
 * COMPLEMENTO EXACTO del de arriba para el MISMO `incompletos`: sin marca (solicitado, rechazado
 * heredado o cualquier estado futuro) o con marca y algo por llegar. Una fila sin marca solo cumple
 * este; una con marca cumple este si su id esta en `incompletos` y el de arriba si no. Asi ninguna
 * fila queda en las dos listas ni fuera de las dos (R44 de la 170), y un cierre con dinero fuera de
 * la central no se archiva como resuelto.
 */
function colaBodegaWhere(
  filtros: FiltrosCierresBodegaRepo | undefined,
  incompletos: readonly string[],
  idsPorFolio?: readonly string[],
): Prisma.CierreBodegaWhereInput {
  const recortes = [...filtrosBodegaWhere(filtros), ...recortePorFolio(idsPorFolio)]; // SLT-153 (R458)
  return {
    OR: [{ conciliadoAt: null }, { id: { in: [...incompletos] } }],
    ...(recortes.length > 0 ? { AND: recortes } : {}),
  };
}

/**
 * Feature 40 — repositorio de "Cierres de bodega" del maestro. SOLO queries Prisma. El
 * maestro NO se acota por zona (todo va a la central). Reusa BODEGA_RESUMEN_SELECT /
 * toBodegaResumenRow (cabecera). `resolverCierreBodega` es un unico UPDATE guardado por
 * estado; NO toca cierre_dia ni otra tabla (R21/R22).
 *
 * Feature 69/T23 (R15): el detalle de las gestiones ya NO reusa WITH_DETALLE / toPendienteRow
 * de la 37 (que leen la orden VIVA y siguen siendo correctos para la vista EN VIVO de
 * gestiones sin cierre); sale del SNAPSHOT `cierre_detail` con las mismas piezas que T18.
 */
export class CierresBodegaAdminRepository implements ICierresBodegaAdminRepository {
  /**
   * SLT-73 (design §2.6): `asientos` son los feeds y libros con los que la marca asienta los cierres
   * del dia. Por defecto, los REALES: las dos construcciones de produccion
   * (`lib/actions/conciliacion-satelites.ts` y `lib/actions/cierre-bodega.ts`) no inyectan nada y
   * escriben de verdad. Solo los tests pasan un doble.
   */
  constructor(
    private readonly prisma: CierresBodegaAdminPrismaClient,
    private readonly asientos: AsientosCierreDiaDeps = ASIENTOS_POR_DEFECTO,
  ) {}

  /** R15: todos los cierres de bodega, mas reciente primero, totales -> STRING. */
  async findCierresBodega(): Promise<CierreBodegaResumenRow[]> {
    const rows = await this.prisma.cierreBodega.findMany({
      orderBy: ORDEN_CIERRES_BODEGA_ADMIN,
      select: BODEGA_RESUMEN_SELECT,
    });
    return aResumenRows(this.prisma, rows);
  }

  /**
   * Feature 184 — Tanda E (T E.1, R1/R14/R15/R16) — el HISTORICO ENTERO, sin recorte: el conjunto
   * del que sale el archivo de «Cierres de bodega resueltos» (listado 5).
   *
   * **Por que existe, y por que no bastaba reusar.** Hasta hoy ese archivo se producia releyendo
   * `listarCierresBodegaAdmin()`, que llama a `findCierresBodega`: TODOS los cierres de bodega,
   * cola e historico juntos, para quedarse con una de las dos mitades. `findCierresBodega` NO se
   * puede reusar aqui —a diferencia de lo que pasaba en las tandas B y C, donde el conjunto ya
   * existia— porque no es este conjunto: es su union con el de la cola. Y cada fila de mas no es
   * gratis: `BODEGA_RESUMEN_SELECT` lleva dos joins de nombre y un `_count` de `cierresDia`.
   *
   * SLT-105 (R123): el corte es el de conciliacion (`historicoBodegaWhere` con los incompletos de
   * `idsRecibidosIncompletos`, leidos UNA vez), no el de `estado`.
   *
   * Es `findHistoricoPaginado` sin `skip`/`take` y sin el `count`: MISMO `historicoBodegaWhere` y
   * MISMO `ORDEN_CIERRES_BODEGA_ADMIN` (R16), de una sola declaracion cada uno, para que la
   * pagina N sea el segmento N de este conjunto (R5). Sin el `count` de la pagina (R15): el total
   * de un conjunto sin recorte es su longitud. Desde SLT-105 son DOS sentencias: antes del
   * `findMany` se lee el conjunto de recibidos incompletos (`idsRecibidosIncompletos`), que es
   * lo que decide el corte.
   */
  async findHistoricoCompleto(
    filtros?: FiltrosCierresBodegaRepo,
  ): Promise<CierreBodegaResumenRow[]> {
    const incompletos = await this.idsRecibidosIncompletos();
    const rows = await this.prisma.cierreBodega.findMany({
      where: historicoBodegaWhere(filtros, incompletos, await this.idsPorFolio(filtros)),
      orderBy: ORDEN_CIERRES_BODEGA_ADMIN,
      select: BODEGA_RESUMEN_SELECT,
    });
    return aResumenRows(this.prisma, rows);
  }

  /**
   * Feature 184 — Tanda E (T E.1, R1/R14/R15/R16) — la COLA ENTERA de pendientes, sin recorte:
   * el conjunto del que sale el archivo de «Cierres de bodega pendientes» (listado 4).
   *
   * Espejo exacto del de arriba, y con el mismo motivo para existir. Aqui se nota mas: la cola
   * son los cierres SIN resolver —una decena— y el historico crece sin tope con los dias, asi que
   * descargar la cola arrastraba todo el historico de la operacion para descartarlo en memoria.
   *
   * La particion sigue viva en los CUATRO caminos: `colaBodegaWhere` e `historicoBodegaWhere`
   * reciben el MISMO conjunto de incompletos (SLT-105), una con `in` y sin marca, otra con `notIn`
   * y con marca, y las dos paginas y los dos conjuntos salen de esas dos funciones. Ninguna fila
   * puede quedar en las dos listas ni caerse de las dos.
   */
  async findColaCompleta(
    filtros?: FiltrosCierresBodegaRepo,
  ): Promise<CierreBodegaResumenRow[]> {
    const incompletos = await this.idsRecibidosIncompletos();
    const rows = await this.prisma.cierreBodega.findMany({
      where: colaBodegaWhere(filtros, incompletos, await this.idsPorFolio(filtros)),
      orderBy: ORDEN_CIERRES_BODEGA_ADMIN,
      select: BODEGA_RESUMEN_SELECT,
    });
    return aResumenRows(this.prisma, rows);
  }

  /**
   * Feature 170 — FASE 2 (T I.1, R40/R41/R44/R51/R54): una pagina del HISTORICO + el total.
   *
   * El `where` se construye UNA vez y lo comparten `findMany` y `count`: escribirlo dos veces
   * es como el total acaba contando un conjunto distinto del que se muestra.
   */
  async findHistoricoPaginado(
    rango: RangoPagina,
    filtros?: FiltrosCierresBodegaRepo,
  ): Promise<PaginaRepositorio<CierreBodegaResumenRow>> {
    // Feature 184/R16: el criterio sale de `historicoBodegaWhere`, la MISMA declaracion que usa
    // el conjunto completo del que sale el archivo. SLT-105 (R122): «Conciliados» = con marca y
    // fuera de los incompletos; los incompletos se leen UNA vez y el `where` lo comparten
    // `findMany` y `count`.
    const where = historicoBodegaWhere(
      filtros,
      await this.idsRecibidosIncompletos(),
      await this.idsPorFolio(filtros),
    );
    const [rows, total] = await Promise.all([
      this.prisma.cierreBodega.findMany({
        where,
        orderBy: ORDEN_CIERRES_BODEGA_ADMIN, // R51: el mismo criterio del listado sin paginar
        skip: rango.skip,
        take: rango.take,
        select: BODEGA_RESUMEN_SELECT,
      }),
      this.prisma.cierreBodega.count({ where }), // R41: el total del CONJUNTO
    ]);
    return { items: await aResumenRows(this.prisma, rows), total };
  }

  /**
   * Feature 170 — FASE 2 (T J.1, R40/R41/R44/R51/R54): una pagina de la COLA de cierres de
   * bodega pendientes + el total.
   *
   * COMPLEMENTO EXACTO de `findHistoricoPaginado` (SLT-105, R122): sin marca o con marca y algo
   * por recibir. Las dos leen el MISMO conjunto de incompletos, aqui con `in` y alli con `notIn`,
   * y la condicion de marca opuesta: ninguna fila acaba en las dos listas ni en ninguna.
   */
  async findColaPaginada(
    rango: RangoPagina,
    filtros?: FiltrosCierresBodegaRepo,
  ): Promise<PaginaRepositorio<CierreBodegaResumenRow>> {
    // Feature 184/R16: mismo criterio compartido que el conjunto completo de esta cola.
    const where = colaBodegaWhere(filtros, await this.idsRecibidosIncompletos(), await this.idsPorFolio(filtros));
    const [rows, total] = await Promise.all([
      this.prisma.cierreBodega.findMany({
        where,
        orderBy: ORDEN_CIERRES_BODEGA_ADMIN, // R51: el mismo criterio del listado sin paginar
        skip: rango.skip,
        take: rango.take,
        select: BODEGA_RESUMEN_SELECT,
      }),
      this.prisma.cierreBodega.count({ where }), // R41: el total del CONJUNTO
    ]);
    return { items: await aResumenRows(this.prisma, rows), total };
  }

  /** SLT-153 (R458): con folio, los ids de `cierre_bodega` que lo contienen; sin folio, ni una consulta. */
  private async idsPorFolio(filtros: FiltrosCierresBodegaRepo | undefined): Promise<string[] | undefined> {
    if (filtros?.folio === undefined) return undefined;
    return idsCierresBodegaPorFolio(this.prisma, filtros.folio);
  }

  /**
   * SLT-105 (R122, R125; design «Como se lee lo que falta») — los ids de los cierres de bodega de la
   * empresa activa con la marca de recibido a los que AUN les falta dinero.
   *
   * «Debe llegar a la central» no es una columna: es la resta de los tres snapshots que hace
   * `paraLaCentral` (y `esperadoDe` en la marca). Prisma no compara una columna con una resta de
   * tres, por eso va en SQL a mano. `<` estricto = `hayFaltantePorRecibir`: cero o negativo (llego de
   * mas) no falta. La empresa se filtra por escrito, ademas de la RLS. Sin filtros de pantalla: los
   * recortes los pone el `where` de Prisma que recibe este conjunto.
   */
  private async idsRecibidosIncompletos(): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT cb."id"
        FROM "cierre_bodega" cb
       WHERE cb."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')
         AND cb."conciliado_at" IS NOT NULL
         AND cb."monto_recibido" < (cb."total_general" - cb."total_pago_mensajero"
                                    - cb."total_ingreso_bodega_rechazos")`;
    return filas.map((f) => f.id);
  }

  /**
   * R11 (+69/R15): cierre de bodega + cada cierre_dia con sus gestiones desde el SNAPSHOT.
   * SLT-148 (R420): el numero de sentencias no depende de cuantos cierres del dia consolide.
   */
  async findCierreBodegaConDetalle(
    id: string,
    /**
     * SLT-42 (R22): la zona del pais de la empresa (la lee el servicio). Con ella se fecha cada
     * instante del DTO (`fechaGestion`, ...); el repositorio no la lee ni la guarda.
     */
    zona: string,
    alcance: AlcanceLecturaBodega,
  ): Promise<{
    cierre: CierreBodegaResumenRow;
    cierresDia: {
      resumen: CierreBodegaDetalleCierreRow;
      gestiones: CierreGestionPendienteRow[];
    }[];
  } | null> {
    // SLT-107 (R280, D-S9): el filtro de zona va EN el `where` de la cabecera, junto al de empresa
    // (extension + RLS): un cierre de otra zona no llega a leerse (no se lee y se descarta). `findFirst`
    // porque `id` + `zonaId` no es una clave unica.
    const cierre = await this.prisma.cierreBodega.findFirst({
      where: { id, ...(alcance.lectura === "zona" ? { zonaId: alcance.zonaId } : {}) },
      select: BODEGA_RESUMEN_SELECT,
    });
    // R19 / SLT-107 (R281): no existe o fuera de alcance -> `null` ANTES de leer cierres del dia,
    // gestiones, detalle y cargos de fulfillment.
    if (cierre === null) return null;

    // SLT-148 (R428): sin cierres del dia no hay gestiones, filas congeladas ni cargos que leer. El
    // conteo ya viene en la cabecera (`_count.cierresDia` de `BODEGA_RESUMEN_SELECT`): el corte va
    // ANTES de leer `cierre_dia`, porque esa lectura carga sus gestiones como relacion y Prisma emite
    // las sentencias de una relacion aunque no haya filas padre.
    if (cierre._count.cierresDia === 0) return this.conCabecera(cierre, []);

    // Los cierre_dia incluidos (WHERE cierre_bodega_id = id), mas reciente primero, CON sus gestiones.
    // Feature 69/T23 (R15): un cierre_dia consolidado en un cierre_bodega esta YA CREADO (y normalmente
    // ya aprobado y liquidado), asi que su detalle son los datos CONGELADOS, nunca
    // `gestion_orden.orden.*` VIVO. Mismo DTO que `findCierreByIdEnAlcance` -> la UI no cambia.
    //
    // SLT-148 (R420, R423, R426): las gestiones van como RELACION de esta misma lectura, con la
    // proyeccion de admin tal cual (R23 de la 212: el tercer camino reusa `GESTION_ADMIN_SELECT`, no
    // una copia). Prisma la resuelve con UNA sentencia por nivel acotada a `cierre_id IN (los cierres
    // del dia leidos)`, ya agrupada por cierre del dia y en `createdAt desc` dentro de cada uno: el
    // numero de sentencias no depende de cuantos cierres del dia haya. Antes eran dos lecturas por
    // cierre del dia (D67).
    const cierresDiaRows = await this.prisma.cierreDia.findMany({
      where: { cierreBodegaId: id },
      orderBy: { solicitadoAt: "desc" },
      select: {
        ...DETALLE_CIERRE_SELECT,
        gestiones: { orderBy: { createdAt: "desc" }, select: GESTION_ADMIN_SELECT },
      },
    });
    const idsDia = cierresDiaRows.map((cd) => cd.id);

    // SLT-148 (R426): las filas congeladas de TODOS los cierres del dia en una lectura, con el conjunto
    // `cierreId IN (idsDia)` en el `where`. SLT-110 (R210, R216): el cargo vigente de fulfillment por
    // orden, en UNA consulta; una orden en dos cierres del dia lleva el mismo cargo en las dos.
    const [cargoPorOrden, detalle] = await Promise.all([
      cargosFulfillmentVigentes(this.prisma, idsDia),
      this.prisma.cierreDetail.findMany({
        where: { cierreId: { in: idsDia } },
        select: { ...DETALLE_ADMIN_SELECT, cierreId: true },
      }),
    ]);
    // R424: la clave es (cierre del dia, orden), el grano de `@@unique([cierreId, ordenId])`. Una orden
    // con gestiones en dos cierres del dia del mismo cierre de bodega tiene una fila congelada en cada uno.
    const filaPorClave = new Map(detalle.map((d) => [`${d.cierreId}:${d.ordenId}`, d]));

    const cierresDia = cierresDiaRows.map(({ gestiones, ...cd }) => ({
      resumen: toDetalleCierreRow(cd),
      // Sin fallback (R14/decision (a), R427): si falta la fila, error DURO. Un fallback a datos vivos
      // seria el camino de lectura que la feature 69 vino a matar.
      gestiones: gestiones.map((g) => {
        const d = filaPorClave.get(`${cd.id}:${g.ordenId}`);
        if (d === undefined) throw new CierreDetalleFaltanteError(cd.id, g.ordenId);
        // SLT-110 (R210-R212): la misma lectura que el detalle de mensajeros -> fecha del cargo y
        // `tarifaFaltante` por el mismo mapper.
        return toPendienteRowDesdeSnapshot(g, d, zona, {
          cargoFulfillmentAt: cargoPorOrden.get(g.ordenId) ?? null,
        });
      }),
    }));

    return this.conCabecera(cierre, cierresDia);
  }

  /** SLT-76 (R3/R4): la cabecera del detalle con `desmarcable`, por el mismo camino que las listas. */
  private async conCabecera<T>(
    cierre: Parameters<typeof aResumenRows>[1][number],
    cierresDia: T[],
  ): Promise<{ cierre: CierreBodegaResumenRow; cierresDia: T[] } | null> {
    const [resumen] = await aResumenRows(this.prisma, [cierre]);
    if (resumen === undefined) return null; // inalcanzable: una fila entra, una fila sale
    return { cierre: resumen, cierresDia };
  }

  /**
   * Feature 230 — Tanda 7 (T7.1, R11/R24/R26/R41) — TODAS las gestiones de los cierres del dia
   * YA CONSOLIDADOS en un cierre de bodega que casan los recortes del dialogo.
   *
   * `cierreBodegaId: { not: null }` es la traduccion EXACTA de R24 («las gestiones de los cierres
   * del dia consolidados en un cierre de bodega, y ninguna otra»). No hay alcance por zona que
   * componer: este listado es de ACCESO TOTAL, y el guard de rol lo aplica el servicio antes de
   * llamar aqui (R25).
   *
   * **Esto y el camino de `cierres-admin` cubren conjuntos DISJUNTOS**, no dos vistas de lo mismo
   * (design §2.6): un cierre del dia con destino `bodega_central` —la GAM— nunca se consolida en
   * un cierre de bodega, porque `consolidablesWhere` exige destino satelite. Los dos botones
   * juntos son el total; uno solo deja fuera media operacion.
   *
   * Reusa las cuatro piezas de la hoja fundida sin declarar nada propio (R26), y NO reusa
   * `findCierreBodegaConDetalle`: aquel lee UN cierre de bodega (sus cierres del dia en lote desde
   * SLT-148) con la proyeccion del detalle, y aqui el conjunto es un rango de meses.
   */
  async findGestionesDeCierresBodegaCompleto(
    filtros: FiltrosDescargaGestionesRepo,
    /**
     * SLT-42 (R22): la zona del pais de la empresa (la lee el servicio). Con ella se fecha cada
     * instante del DTO (`fechaGestion`, ...); el repositorio no la lee ni la guarda.
     */
    zona: string,
  ): Promise<CierreGestionDescargaRow[]> {
    const gestiones = await this.prisma.gestionOrden.findMany({
      where: {
        cierre: {
          cierreBodegaId: { not: null }, // R24: solo lo ya consolidado en bodega
          // Los recortes se componen con `AND`, la MISMA forma que usan `historicoWhere` y
          // `colaWhere` del otro repositorio, y por el mismo motivo: como claves hermanas, un
          // recorte puede SUSTITUIR al criterio de seleccion en vez de sumarse a el.
          AND: filtrosWhere(filtros),
        },
      },
      orderBy: [...ORDEN_GESTIONES_DESCARGA], // R11/R26: el MISMO orden que el camino A
      select: GESTION_DESCARGA_SELECT, // R41: sin `evidencia_storage_path`
    });
    if (gestiones.length === 0) return [];

    const cierreIds = [...new Set(gestiones.map((g) => g.cierreId).filter((id) => id !== null))];
    // FICHA 394 — ids DEDUPLICADOS de las ordenes: una orden puede traer varias gestiones y su
    // conteo de intentos es UNO.
    const ordenIds = [...new Set(gestiones.map((g) => g.ordenId))];
    const [detalle, intentosPorOrden] = await Promise.all([
      this.prisma.cierreDetail.findMany({
        where: { cierreId: { in: cierreIds } },
        orderBy: ORDEN_DETALLE_DESCARGA, // SLT-113: el mismo orden determinista que el camino A
        select: DETALLE_DESCARGA_SELECT,
      }),
      // FICHA 394 — el MISMO derivador en lote que el camino A (R26: las dos hojas emiten la
      // misma fila). Una consulta para todo el conjunto, no una por gestion.
      contarIntentosVigentesEnLoteCon(this.prisma.gestionOrden, ordenIds),
    ]);
    // SLT-113 (R375): los cargos de fulfillment, solo de los cierres del modelo nuevo; sin ninguno,
    // ninguna consulta (mismo criterio y mismo compositor que el camino de `/cierres-admin`).
    const idsNuevos = [...cierresDelModeloNuevo(detalle)];
    const cargoPorOrden =
      idsNuevos.length > 0
        ? await cargosFulfillmentVigentes(this.prisma, idsNuevos)
        : new Map<string, Date | null>();
    return componerGestionesDescarga(gestiones, detalle, intentosPorOrden, zona, cargoPorOrden);
  }

  /**
   * SLT-113 (R372, R373) — los rechazos de la tienda de los cierres del modelo nuevo del MISMO
   * conjunto que `findGestionesDeCierresBodegaCompleto`: consolidados en bodega, mismos recortes y el
   * criterio de la hoja (`CIERRE_NUEVO_CON_GESTIONES`), todo en el WHERE. Una consulta.
   */
  async findRechazosTiendaDeCierresBodegaModeloNuevoCompleto(
    filtros: FiltrosDescargaGestionesRepo,
    zona: string,
  ): Promise<RechazoTiendaDescargaDTO[]> {
    const filas = await this.prisma.cierreRechazoTienda.findMany({
      where: {
        cierre: {
          cierreBodegaId: { not: null }, // R24: el mismo criterio que la hoja de gestiones
          AND: [...filtrosWhere(filtros), ...CIERRE_NUEVO_CON_GESTIONES],
        },
      },
      orderBy: ORDEN_RECHAZOS_DESCARGA,
      select: RECHAZO_TIENDA_DESCARGA_SELECT,
    });
    return filas.map((r) => toRechazoTiendaDescargaDTO(r, zona));
  }

  /**
   * R16-R22: transicion atomica guardada; un solo UPDATE.
   *
   * FICHA 362 (R6/R9/R11) — `cierre_bodega_aprobado` / `cierre_bodega_rechazado`. El metodo se
   * envuelve en `$transaction` (forma 2 del design §2.3: era un `updateMany` suelto), y el
   * registro va DENTRO del `res.count === 1`: un cierre ya resuelto no deja rastro de una segunda
   * resolucion que no ocurrio.
   *
   * `monto` = `total_general` del cierre (snapshot), `Decimal`. `motivoRechazo` NO se copia (R5).
   */
  async resolverCierreBodega(
    input: ResolverCierreBodegaInput,
  ): Promise<ResolverCierreBodegaResult> {
    const { id, nuevoEstado, resueltoPor, motivoRechazo } = input;

    const resultado = await this.prisma.$transaction(async (tx) => {
      // R18: aplica SOLO si sigue `solicitado` (guardia de estado en el WHERE).
      const res = await tx.cierreBodega.updateMany({
        where: { id, estado: ESTADO_SOLICITADO },
        data: {
          estado: nuevoEstado,
          resueltoPor, // R20
          resueltoAt: new Date(), // R20
          motivoRechazo,
        },
      });
      if (res.count !== 1) return null;

      const cierre = await tx.cierreBodega.findUnique({
        where: { id },
        select: {
          totalGeneral: true,
          solicitadoAt: true,
          zona: { select: { nombre: true } },
        },
      });
      const actor = await resolverActorCongelado(tx, resueltoPor);
      await appendAccion(tx, [
        {
          accion:
            nuevoEstado === "aprobado" ? "cierre_bodega_aprobado" : "cierre_bodega_rechazado",
          entidadTipo: "cierre_bodega",
          entidadId: id,
          entidadEtiqueta: etiquetaDeEntidad("cierre_bodega", {
            zonaNombre: cierre?.zona.nombre ?? null,
            fecha: cierre?.solicitadoAt ?? new Date(),
            zonaHoraria: input.zonaHoraria, // SLT-42 (R22)
          }),
          monto: cierre?.totalGeneral ?? null,
          ...actor,
        },
      ]);
      return "updated" as const;
    });
    if (resultado === "updated") return "updated";

    // count 0: distinguir "ya resuelto" (existe) de "no existe".
    const existe = await this.prisma.cierreBodega.count({ where: { id } });
    return existe > 0 ? "conflict" : "fuera_de_alcance"; // R18 vs R19
  }

  /**
   * ⭑ FICHA 431 (R8/R9/R11/R13) — MARCAR RECIBIDA una consolidacion, con su monto.
   *
   * Mismo molde que `resolverCierreBodega` y a proposito: `$transaction` propia, guarda por estado
   * en el `WHERE`, `appendAccion(tx, …)` DENTRO del callback y el trio de desenlaces.
   *
   * ⚠️ `appendAccion(tx, …)` Y NUNCA `appendAccion(this.prisma, …)`. Esa sustitucion NO la caza
   * NINGUN test de integracion de este repo —ahi `this.prisma` ES el cliente de la transaccion del
   * test— y solo la caza la guardia estatica del censo
   * (`tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`), que exige forma
   * `abre_tx` y el `appendAccion` dentro del callback.
   *
   * EL ESPEJO `resuelto_at`/`resuelto_por` NO ES DUPLICACION POR DESCUIDO:
   * el repositorio de analitica de conciliacion de cierres (`contarCierresPorEstado`, sin su nombre
   * completo a proposito: la guardia de fuente de la 127 censa todo archivo que lo escriba, y este
   * no es de analitica) selecciona los aprobados POR
   * `resuelto_at`. Sin rellenarlo, los cierres de bodega saldrian de la analitica financiera en
   * silencio. Las columnas NUEVAS son las que llevan el SIGNIFICADO y el monto; estas son el
   * espejo heredado del acto.
   *
   * SLT-73 (D9 reabre el R14 de la 431): SI ESCRIBE EN LOS LIBROS, en esta misma transaccion. Por
   * cada cierre del dia satelite aprobado que la consolidacion incluye, los asientos que la
   * aprobacion de un cierre de la central habria escrito (R10), y la diferencia de la satelite si lo
   * recibido no cuadra (R11). Si cualquier escritura falla, la marca entera revierte (R12).
   */
  async marcarConciliado(input: MarcarConciliadoInput): Promise<MarcaConMontoResult> {
    const { id, montoRecibido, nota, actorUsuarioId } = input;
    // Money-safe: el importe entra como STRING de escala 2 y se convierte AQUI, en el borde de la
    // escritura. Ni `Number`, ni `parseFloat`, ni aritmetica.
    const monto = new Prisma.Decimal(montoRecibido);
    const ahora = new Date();

    const resultado = await this.prisma.$transaction(async (tx) => {
      // SLT-96 (R1/R2/R9): el 0 solo vale con lo declarado en 0. Se lee SOLO con monto 0, para que
      // el camino de un monto > 0 haga las mismas consultas de siempre. Inexistente → `null`, que
      // cae en el conteo de abajo (`fuera_de_alcance`), igual que con un monto > 0.
      if (monto.isZero()) {
        const cero = await declaradoEsCero(tx, id);
        if (cero === null) return null;
        if (!cero) return "monto_cero_no_permitido" as const;
      }

      // R11: aplica SOLO si sigue pendiente de conciliar. Los DOS predicados, no uno: el estado es
      // lo que las pantallas leen y `conciliado_at` es EL predicado de la marca.
      const res = await tx.cierreBodega.updateMany({
        where: { id, estado: ESTADO_SOLICITADO, conciliadoAt: null },
        data: {
          estado: ESTADO_APROBADO, // D2: `aprobado` se LEE «Recibido»
          conciliadoAt: ahora,
          conciliadoPor: actorUsuarioId,
          montoRecibido: monto,
          conciliadoNota: nota,
          resueltoAt: ahora, // espejo (ver cabecera)
          resueltoPor: actorUsuarioId, // espejo (ver cabecera)
        },
      });
      if (res.count !== 1) return null;

      // SLT-73 (R10/R12/R20/R22): los asientos de cada cierre del dia de ESTA consolidacion, en
      // orden de solicitud. `asentarCierreDia` es idempotente por el unico de cada libro, asi que un
      // cierre ya asentado no se duplica, y uno cuyos asientos retiro la migracion C se re-escribe.
      // Solo los `aprobado` con destino satelite: es lo que la aprobacion dejo sin asentar (R1).
      const cierresDia = await tx.cierreDia.findMany({
        where: { cierreBodegaId: id, estado: "aprobado", destinoTipo: "bodega_satelite" },
        select: { id: true },
        orderBy: { solicitadoAt: "asc" },
      });
      for (const c of cierresDia) {
        await asentarCierreDia(tx, c.id, this.asientos, ahora);
      }
      await asentarDiferenciaSatelite(tx, this.asientos, {
        cierreBodegaId: id,
        evento: "marca",
        recibido: monto,
        creadoPor: actorUsuarioId,
        instante: ahora,
      });

      const cierre = await tx.cierreBodega.findUnique({
        where: { id },
        select: { solicitadoAt: true, zona: { select: { nombre: true } } },
      });
      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "cierre_bodega_conciliado",
          entidadTipo: "cierre_bodega",
          entidadId: id,
          entidadEtiqueta: etiquetaDeEntidad("cierre_bodega", {
            zonaNombre: cierre?.zona.nombre ?? null,
            fecha: cierre?.solicitadoAt ?? ahora,
            zonaHoraria: input.zonaHoraria, // SLT-42 (R22)
          }),
          // El monto RECIBIDO, no el consolidado: es lo que la persona afirma haber contado.
          monto,
          // La NOTA no entra (R5 de la 362): es texto libre tecleado por una persona.
          ...actor,
        },
      ]);
      return "updated" as const;
    });
    if (resultado !== null) return resultado;

    const existe = await this.prisma.cierreBodega.count({ where: { id } });
    return existe > 0 ? "conflict" : "fuera_de_alcance"; // R11 vs no existe
  }

  /**
   * ⭑ FICHA 431 (R12/R13) — REVERTIR la marca: vuelve a «Pendiente de conciliar» y BORRA los cuatro
   * datos de la marca mas el espejo.
   *
   * ⚠️ METODO PROPIO Y NO UN BOOLEANO EN `marcarConciliado`: la guardia del censo mide POR METODO,
   * no por escritura (medido en las fichas 376 y 380). Con las dos acciones en el mismo metodo,
   * borrar uno de los dos `appendAccion` la dejaria VERDE.
   *
   * ⚠️ EL MONTO SE LEE ANTES DE BORRARLO, y va a la fila del historial. Despues de este UPDATE, esa
   * fila es el UNICO sitio del sistema donde sobrevive cuanto se habia dado por recibido: sin el,
   * el rastro diria «alguien deshizo algo» en vez de «alguien deshizo un recibido de ₡500.000».
   *
   * ⚠️ CONSECUENCIA DECLARADA: al vaciar `resuelto_at`, la analitica financiera deja de contar este
   * cierre en su periodo. Es lo correcto —no se recibio— y esta escrito para que no sorprenda.
   *
   * SLT-73 (R14, D11): si la marca YA ASENTO los cierres de la consolidacion en la caja, NO se
   * revierte: devuelve `con_asientos` sin tocar nada. Los libros son append-only y el unico no
   * dejaria re-escribir esos asientos; el monto se arregla con «Corregir».
   */
  async revertirConciliacion(input: RevertirConciliacionInput): Promise<RevertirConciliacionResult> {
    const { id, actorUsuarioId } = input;

    const resultado = await this.prisma.$transaction(async (tx) => {
      // SLT-73 (R14) + SLT-76 (R5): el conteo va ANTES de cualquier escritura y dentro de la
      // transaccion. Asientos `cierre_dia` de sus cierres O ajustes de diferencia: el MISMO
      // predicado que decide si la pantalla ofrece «Desmarcar» (R4).
      if ((await consolidacionesConDinero(tx, [id])).has(id)) return "con_asientos" as const;

      // El monto ANTES del borrado: es lo que la fila del historial tiene que documentar.
      const previo = await tx.cierreBodega.findUnique({
        where: { id },
        select: {
          montoRecibido: true,
          solicitadoAt: true,
          zona: { select: { nombre: true } },
        },
      });

      // R12: aplica SOLO si de verdad estaba marcada. Los DOS predicados, por el mismo motivo que
      // en `marcarConciliado`.
      const res = await tx.cierreBodega.updateMany({
        where: { id, estado: ESTADO_APROBADO, conciliadoAt: { not: null } },
        data: {
          estado: ESTADO_SOLICITADO, // D2: `solicitado` se LEE «Pendiente de conciliar»
          conciliadoAt: null,
          conciliadoPor: null,
          montoRecibido: null,
          conciliadoNota: null,
          resueltoAt: null, // espejo: se va con la marca (ver cabecera)
          resueltoPor: null, // espejo
        },
      });
      if (res.count !== 1) return null;

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "cierre_bodega_conciliacion_revertida",
          entidadTipo: "cierre_bodega",
          entidadId: id,
          entidadEtiqueta: etiquetaDeEntidad("cierre_bodega", {
            zonaNombre: previo?.zona.nombre ?? null,
            fecha: previo?.solicitadoAt ?? new Date(),
            zonaHoraria: input.zonaHoraria, // SLT-42 (R22)
          }),
          // EL MONTO QUE SE BORRA. Leido arriba, dentro de la misma transaccion.
          monto: previo?.montoRecibido ?? null,
          ...actor,
        },
      ]);
      return "updated" as const;
    });
    if (resultado === "updated" || resultado === "con_asientos") return resultado;

    const existe = await this.prisma.cierreBodega.count({ where: { id } });
    return existe > 0 ? "conflict" : "fuera_de_alcance"; // R12 vs no existe
  }

  /**
   * ⭑ FICHA 473 (R1-R8, R12) — CORREGIR el monto recibido de una consolidacion YA conciliada.
   *
   * Mismo molde que `marcarConciliado`/`revertirConciliacion`: `$transaction` propia, guarda en el
   * `WHERE`, `appendAccion(tx, …)` DENTRO del callback y el trio de desenlaces.
   *
   * ⚠️ SIN CORTE PREVIO por `montoRecibido === null`: rechazar una pendiente o una rechazada es
   * trabajo del `WHERE`. Un `if` antes lo haria redundante e inmune a las mutaciones (quitar los
   * predicados de estado sobreviviria).
   *
   * ⚠️ `montoRecibido: previo.montoRecibido` en el `WHERE` es un compare-and-swap (R8): en READ
   * COMMITTED, una correccion concurrente que leyo el mismo `previo` re-evalua el `WHERE` tras el
   * bloqueo de fila, ve el monto ya cambiado y obtiene `count 0` → `conflict`. Sin el, su fila de
   * historial llevaria un `valor_anterior` falso.
   *
   * D3: reescribe `conciliado_at`/`resuelto_at` igual que el rodeo Desmarcar + Marcar que sustituye.
   *
   * SLT-73 (R13): si el faltante cambia, escribe UN movimiento de diferencia nuevo por la variacion
   * (una fila de ajuste `correccion` mas), sin tocar los anteriores. NO vuelve a asentar los cierres
   * del dia: ya los asento la marca.
   */
  async corregirConciliacion(input: CorregirConciliacionInput): Promise<MarcaConMontoResult> {
    const { id, montoRecibido, nota, actorUsuarioId } = input;
    // Money-safe: STRING de escala 2 → `Prisma.Decimal` en el borde de la escritura.
    const monto = new Prisma.Decimal(montoRecibido);
    const ahora = new Date();

    const resultado = await this.prisma.$transaction(async (tx) => {
      // El monto ANTERIOR, leido en la misma transaccion: va al historial y al compare-and-swap.
      const previo = await tx.cierreBodega.findUnique({
        where: { id },
        select: {
          montoRecibido: true,
          solicitadoAt: true,
          zona: { select: { nombre: true } },
        },
      });
      if (previo === null) return null;

      // SLT-96 (R3/R4): la misma regla del 0 que en la marca, antes de escribir nada.
      if (monto.isZero()) {
        const cero = await declaradoEsCero(tx, id);
        if (cero === null) return null;
        if (!cero) return "monto_cero_no_permitido" as const;
      }

      // R6/R8: SOLO si sigue conciliada (los DOS predicados) y su monto es el leido arriba.
      const res = await tx.cierreBodega.updateMany({
        where: {
          id,
          estado: ESTADO_APROBADO,
          conciliadoAt: { not: null },
          montoRecibido: previo.montoRecibido,
        },
        data: {
          montoRecibido: monto,
          conciliadoNota: nota,
          conciliadoPor: actorUsuarioId,
          conciliadoAt: ahora,
          resueltoAt: ahora, // espejo (D3)
          resueltoPor: actorUsuarioId, // espejo (D3)
        },
      });
      if (res.count !== 1) return null;

      // SLT-73 (R13/R15/R22): la variacion del faltante, si la hay, como un ajuste `correccion`.
      await asentarDiferenciaSatelite(tx, this.asientos, {
        cierreBodegaId: id,
        evento: "correccion",
        recibido: monto,
        creadoPor: actorUsuarioId,
        instante: ahora,
      });

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "cierre_bodega_conciliado",
          entidadTipo: "cierre_bodega",
          entidadId: id,
          entidadEtiqueta: etiquetaDeEntidad("cierre_bodega", {
            zonaNombre: previo.zona.nombre,
            fecha: previo.solicitadoAt,
            zonaHoraria: input.zonaHoraria, // SLT-42 (R22)
          }),
          // El monto NUEVO; el par anterior/nuevo distingue esta fila de una marca (D1).
          monto,
          valorAnterior: previo.montoRecibido?.toFixed(2) ?? null,
          valorNuevo: monto.toFixed(2),
          // La NOTA no entra (R4; R5 de la 362): es texto libre tecleado por una persona.
          ...actor,
        },
      ]);
      return "updated" as const;
    });
    if (resultado !== null) return resultado;

    const existe = await this.prisma.cierreBodega.count({ where: { id } });
    return existe > 0 ? "conflict" : "fuera_de_alcance"; // R6/R8 vs R7
  }
}
