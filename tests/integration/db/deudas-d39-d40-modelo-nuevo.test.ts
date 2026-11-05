import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaModelo } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { consolidacionesConModeloNuevo } from "@/lib/repositories/_shared/detalle-modelo-nuevo";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { FiltrosWalletRepository } from "@/lib/repositories/FiltrosWalletRepository";
import { categoriasConModeloNuevoSql } from "@/lib/repositories/libro-caja-a-quien-sql";
import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import { ConciliacionSatelitesService } from "@/lib/services/ConciliacionSatelitesService";
import { FiltrosWalletService } from "@/lib/services/FiltrosWalletService";
import { WalletService } from "@/lib/services/WalletService";
import type { AQuienFiltro } from "@/lib/types/libro-caja-a-quien";
import type { ComposicionGananciaDTO, WalletMovimientoCategoria } from "@/lib/types/wallet";
import type { ConceptoConMovimientosDTO } from "@/lib/types/wallet-filtros";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// D39 y D40 — EL MODELO DE TARIFA EN LOS AGREGADOS, CONTRA POSTGRES REAL.
//
// Lo que se prueba vive en el SQL: el `EXISTS` sobre `cierre_detail` de la tarjeta y del filtro de la caja,
// y la lectura en lote de las consolidaciones. Todo se lee como `servi_app`, con la RLS puesta, por el
// servicio que usa la pantalla. Cada empresa es nueva, asi que la caja solo trae lo que el caso sembro, y
// cada lectura se consulta por el id sembrado: un id ausente da `undefined` y el caso se pone rojo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SATELITE = "bodega_satelite" as const;
const PAGINA = { page: 1, pageSize: 25 };
const MAESTRO: Actor = { usuarioId: "maestro-del-test", rol: "maestro" };
const FLETE = "ingreso_flete_devolucion" as const;
const IVA = "ingreso_iva_flete_devolucion" as const;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

let siguienteGuia = 949_000_000 + Math.floor(Math.random() * 900_000);

interface Empresa {
  org: string;
  fks: FksDeOrden;
  M: string;
}

async function crearEmpresa(tx: TxDeTest): Promise<Empresa> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  return { org, fks, M };
}

async function crearDetalle(tx: TxDeTest, e: Empresa, cierreId: string, modelo: TarifaModelo): Promise<void> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-D39-${randomUUID().slice(0, 12)}`,
      destinatario: "D39",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: e.fks.estatusId,
      tiendaId: e.fks.tiendaId,
      zonaId: e.fks.zonaId,
      provinciaId: e.fks.provinciaId,
      cantonId: e.fks.cantonId,
      montoCobrar: new Prisma.Decimal("1000.00"),
      cobraComision: false,
    },
    select: { id: true },
  });
  await tx.cierreDetail.create({
    data: {
      cierreId,
      ordenId: orden.id,
      cobraComision: false,
      zonaId: e.fks.zonaId,
      tiendaId: e.fks.tiendaId,
      esCentral: false,
      tarifaModelo: modelo,
      numRemision: "R-1",
      destinatario: "D39",
      producto: "caja",
      tiendaNombre: "T",
      zonaNombre: "Z",
      provinciaNombre: "P",
      cantonNombre: "C",
    },
  });
}

async function crearCierre(
  tx: TxDeTest,
  e: Empresa,
  modelos: readonly TarifaModelo[],
  mensajeroId: string = e.M,
): Promise<string> {
  const cierre = await tx.cierreDia.create({
    data: { mensajeroId, estado: "aprobado", destinoTipo: SATELITE, destinoZonaId: e.fks.zonaId },
    select: { id: true },
  });
  for (const modelo of modelos) await crearDetalle(tx, e, cierre.id, modelo);
  return cierre.id;
}

/** Una consolidacion con esos cierres y unos snapshots literales, para ver que el importe no se mueve. */
async function crearConsolidacion(tx: TxDeTest, e: Empresa, cierreIds: readonly string[]): Promise<string> {
  const c = await tx.cierreBodega.create({
    data: {
      zonaId: e.fks.zonaId,
      solicitadoPor: e.M,
      totalEfectivo: new Prisma.Decimal("1000.00"),
      totalGeneral: new Prisma.Decimal("1000.00"),
      totalPagoMensajero: new Prisma.Decimal("100.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal("50.00"),
    },
    select: { id: true },
  });
  await tx.cierreDia.updateMany({ where: { id: { in: [...cierreIds] } }, data: { cierreBodegaId: c.id } });
  return c.id;
}

async function crearMovimiento(
  tx: TxDeTest,
  origenId: string,
  categoria: WalletMovimientoCategoria = FLETE,
  opciones: { origenTipo?: "cierre_dia" | "gestion_orden"; fecha?: Date } = {},
): Promise<string> {
  const fila = await tx.walletMovimiento.create({
    data: {
      tipo: "ingreso",
      categoria,
      monto: new Prisma.Decimal("282.50"),
      origenTipo: opciones.origenTipo ?? "cierre_dia",
      origenId,
      ...(opciones.fecha !== undefined ? { fechaMovimiento: opciones.fecha } : {}),
    },
    select: { id: true },
  });
  return fila.id;
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

// ── D39: la tarjeta de la ganancia y las opciones del filtro de concepto ─────────────────────────────

type FiltrosCaja = { tipo?: "ingreso" | "egreso"; categoria?: WalletMovimientoCategoria; desde?: Date; hasta?: Date; aQuien?: AQuienFiltro };

interface LecturaCaja {
  composicion: ComposicionGananciaDTO;
  /** Lo que dice cada opcion del filtro: sin `categoria` en la entrada, como la pide la pantalla. */
  conceptos: ConceptoConMovimientosDTO[];
}

function servicioCaja(cli: PrismaClient) {
  return new WalletService(
    new WalletMovimientoRepository(cli),
    cli as never,
    { haySaldoInicialVigente: async () => false } as never,
    {} as never,
  );
}

async function leerCaja(tx: TxDeTest, org: string, filtros: FiltrosCaja = {}): Promise<LecturaCaja> {
  return comoEmpresa(tx, org, async () => {
    const cli = clienteConSavepoint(tx);
    const r = await servicioCaja(cli).verResumenCaja({ ...PAGINA, ...filtros } as never, MAESTRO);
    if (r.status !== "ok") throw new Error("el resumen no devolvio ok");
    const { categoria: _soloDelLibro, ...filtrosDeConcepto } = filtros;
    const c = await new FiltrosWalletService(new FiltrosWalletRepository(cli)).conceptosConMovimientos(
      { libro: "caja", ...filtrosDeConcepto },
      MAESTRO,
    );
    if (c.status !== "ok") throw new Error("los conceptos no devolvieron ok");
    return { composicion: r.composicion, conceptos: c.conceptos };
  });
}

function concepto(l: LecturaCaja, categoria: string): ConceptoConMovimientosDTO {
  const c = l.conceptos.find((x) => x.categoria === categoria);
  if (c === undefined) throw new Error(`el filtro no ofrece ${categoria}: la lectura no vio lo sembrado`);
  return c;
}

describeSiHayBase("D39 — el agregado de la caja dice si incluye cobros del modelo nuevo, contra Postgres", () => {
  it("una empresa sin cierres del modelo nuevo: la lista vacia, las opciones de siempre y el importe de siempre", async () => {
    const l = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["viejo", "viejo"]);
      await crearMovimiento(tx, cierre, FLETE);
      await crearMovimiento(tx, cierre, IVA);
      return leerCaja(tx, e.org);
    });
    expect(l.composicion.categoriasConModeloNuevo).toEqual([]);
    // El literal ES el contrato: ni una clave nueva en las opciones de quien no tiene modelo nuevo.
    expect(l.conceptos).toEqual([
      { categoria: FLETE, movimientos: 1 },
      { categoria: IVA, movimientos: 1 },
    ]);
    expect(l.composicion.ingresos[FLETE]).toBe("282.50");
    expect(l.composicion.iva[IVA]).toBe("282.50");
  });

  it("un cierre del modelo nuevo: cada categoria con fila, en el orden del catalogo, y el importe no se mueve", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      await crearMovimiento(tx, cierre, IVA);
      const soloIva = await leerCaja(tx, e.org);
      await crearMovimiento(tx, cierre, FLETE);
      return { soloIva, las2: await leerCaja(tx, e.org) };
    });
    expect(r.soloIva.composicion.categoriasConModeloNuevo).toEqual([IVA]);
    expect(concepto(r.soloIva, IVA)).toEqual({ categoria: IVA, movimientos: 1, incluyeModeloNuevo: true });

    expect(r.las2.composicion.categoriasConModeloNuevo).toEqual([FLETE, IVA]);
    expect(r.las2.composicion.ingresos[FLETE]).toBe("282.50");
    expect(r.las2.composicion.iva[IVA]).toBe("282.50");
    expect(concepto(r.las2, FLETE)).toEqual({ categoria: FLETE, movimientos: 1, incluyeModeloNuevo: true });
  });

  it("mixto: basta una gestion dentro del cierre, y entre cierres cada categoria responde por sus filas", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const dentro = await crearEmpresa(tx);
      const mixto = await crearCierre(tx, dentro, ["viejo", "nuevo", "viejo"]);
      await crearMovimiento(tx, mixto, FLETE);
      const lecturaDentro = await leerCaja(tx, dentro.org);

      const entre = await crearEmpresa(tx);
      const viejo = await crearCierre(tx, entre, ["viejo"]);
      const nuevo = await crearCierre(tx, entre, ["nuevo"]);
      await crearMovimiento(tx, viejo, FLETE);
      await crearMovimiento(tx, viejo, IVA);
      await crearMovimiento(tx, nuevo, FLETE);
      return { lecturaDentro, lecturaEntre: await leerCaja(tx, entre.org) };
    });
    expect(r.lecturaDentro.composicion.categoriasConModeloNuevo).toEqual([FLETE]);

    expect(r.lecturaEntre.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
    expect(concepto(r.lecturaEntre, FLETE)).toEqual({ categoria: FLETE, movimientos: 2, incluyeModeloNuevo: true });
    expect(concepto(r.lecturaEntre, IVA)).toEqual({ categoria: IVA, movimientos: 1 });
  });

  it("solo las categorias cuyo rotulo depende del modelo, y solo con origen `cierre_dia`", async () => {
    const l = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      // Del mismo cierre, pero «Flete cobrado a la tienda» es cierto en los dos modelos.
      await crearMovimiento(tx, cierre, "ingreso_flete");
      // El cobro por rechazo: su origen es la gestion, aunque el id coincida. Esa devolucion si hubo.
      await crearMovimiento(tx, cierre, FLETE, { origenTipo: "gestion_orden" });
      // La propia sentencia no trae la otra categoria: no depende de que el repositorio la descarte.
      const filas = await comoEmpresa(tx, e.org, () =>
        tx.$queryRaw<{ categoria: string }[]>(categoriasConModeloNuevoSql({})),
      );
      return { filas, lectura: await leerCaja(tx, e.org) };
    });
    expect(l.filas).toEqual([]);
    expect(l.lectura.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(concepto(l.lectura, FLETE)).toEqual({ categoria: FLETE, movimientos: 1 });
    expect(concepto(l.lectura, "ingreso_flete")).toEqual({ categoria: "ingreso_flete", movimientos: 1 });
  });

  it("el periodo consultado manda: `desde` inclusivo, `hasta` exclusivo, y lo de otro periodo no contamina", async () => {
    const MARZO = new Date("2026-03-10T15:00:00.000Z");
    const JUNIO = new Date("2026-06-10T15:00:00.000Z");
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      await crearMovimiento(tx, await crearCierre(tx, e, ["nuevo"]), FLETE, { fecha: MARZO });
      await crearMovimiento(tx, await crearCierre(tx, e, ["viejo"]), FLETE, { fecha: JUNIO });
      return {
        todo: await leerCaja(tx, e.org),
        marzo: await leerCaja(tx, e.org, { desde: MARZO, hasta: new Date("2026-03-11T00:00:00.000Z") }),
        junio: await leerCaja(tx, e.org, { desde: new Date("2026-06-01T00:00:00.000Z") }),
        hastaJusto: await leerCaja(tx, e.org, { hasta: MARZO }),
      };
    });
    expect(r.todo.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
    expect(concepto(r.todo, FLETE).movimientos).toBe(2);

    expect(r.marzo.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
    expect(concepto(r.marzo, FLETE)).toEqual({ categoria: FLETE, movimientos: 1, incluyeModeloNuevo: true });

    expect(r.junio.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(concepto(r.junio, FLETE)).toEqual({ categoria: FLETE, movimientos: 1 });

    expect(r.hastaJusto.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(r.hastaJusto.conceptos).toEqual([]);
  });

  it("los demas filtros del conjunto: direccion, concepto y «A quién»", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const otroMensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      await crearMovimiento(tx, await crearCierre(tx, e, ["nuevo"]), FLETE);
      await crearMovimiento(tx, await crearCierre(tx, e, ["viejo"], otroMensajero), IVA);
      return {
        egresos: await leerCaja(tx, e.org, { tipo: "egreso" }),
        ingresos: await leerCaja(tx, e.org, { tipo: "ingreso" }),
        otroConcepto: await leerCaja(tx, e.org, { categoria: IVA }),
        eseConcepto: await leerCaja(tx, e.org, { categoria: FLETE }),
        delM: await leerCaja(tx, e.org, { aQuien: { tipo: "mensajero", id: e.M } }),
        delOtro: await leerCaja(tx, e.org, { aQuien: { tipo: "mensajero", id: otroMensajero } }),
      };
    });
    expect(r.egresos.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(r.ingresos.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
    expect(r.otroConcepto.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(r.eseConcepto.composicion.categoriasConModeloNuevo).toEqual([FLETE]);

    expect(r.delM.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
    expect(concepto(r.delM, FLETE).incluyeModeloNuevo).toBe(true);

    expect(r.delOtro.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(concepto(r.delOtro, IVA)).toEqual({ categoria: IVA, movimientos: 1 });
  });

  it("activar la empresa no mueve lo congelado: solo cuenta el cierre del modelo nuevo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      await crearMovimiento(tx, await crearCierre(tx, e, ["viejo"]), FLETE);
      await sembrarActivacion(tx, e.org);
      const activadaSinNuevo = await leerCaja(tx, e.org);
      await crearMovimiento(tx, await crearCierre(tx, e, ["nuevo"]), IVA);
      return { activadaSinNuevo, conNuevo: await leerCaja(tx, e.org) };
    });
    expect(r.activadaSinNuevo.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(concepto(r.activadaSinNuevo, FLETE)).toEqual({ categoria: FLETE, movimientos: 1 });
    expect(r.conNuevo.composicion.categoriasConModeloNuevo).toEqual([IVA]);
  });

  it("otra empresa no contamina: la RLS para el `EXISTS`, y como dueno de las tablas se ve", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const B = await crearEmpresa(tx);
      const deB = await crearCierre(tx, B, ["nuevo"]);
      await crearMovimiento(tx, deB, IVA);

      const A = await crearEmpresa(tx);
      // `origen_id` es polimorfico y no tiene FK: un movimiento de A puede apuntar al cierre de B.
      await crearMovimiento(tx, deB, FLETE);
      const sinRls = await tx.$queryRaw<{ categoria: string }[]>(categoriasConModeloNuevoSql({ categoria: FLETE }));

      const lecturaDeA = await leerCaja(tx, A.org);
      await fijarEmpresa(tx, B.org);
      const lecturaDeB = await leerCaja(tx, B.org);
      return { sinRls, lecturaDeA, lecturaDeB };
    });
    expect(r.sinRls.map((f) => f.categoria)).toContain(FLETE);

    expect(r.lecturaDeA.composicion.categoriasConModeloNuevo).toEqual([]);
    expect(r.lecturaDeA.conceptos).toEqual([{ categoria: FLETE, movimientos: 1 }]);

    expect(r.lecturaDeB.composicion.categoriasConModeloNuevo).toEqual([IVA]);
    expect(r.lecturaDeB.conceptos).toEqual([{ categoria: IVA, movimientos: 1, incluyeModeloNuevo: true }]);
  });

  it("dice lo mismo que las filas que abre: la categoria esta si y solo si alguna fila lo afirma", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      await crearMovimiento(tx, await crearCierre(tx, e, ["viejo"]), FLETE);
      await crearMovimiento(tx, await crearCierre(tx, e, ["nuevo"]), FLETE);
      await crearMovimiento(tx, await crearCierre(tx, e, ["viejo"]), IVA);
      const l = await leerCaja(tx, e.org);
      const filas = await comoEmpresa(tx, e.org, async () => {
        const libro = new WalletMovimientoRepository(clienteConSavepoint(tx));
        return {
          [FLETE]: (await libro.listar({ ...PAGINA, categorias: [FLETE] })).movimientos,
          [IVA]: (await libro.listar({ ...PAGINA, categorias: [IVA] })).movimientos,
        };
      });
      return { l, filas };
    });
    expect(r.filas[FLETE]).toHaveLength(2);
    expect(r.filas[IVA]).toHaveLength(1);
    for (const categoria of [FLETE, IVA] as const) {
      expect(r.l.composicion.categoriasConModeloNuevo?.includes(categoria)).toBe(
        r.filas[categoria].some((m) => m.incluyeModeloNuevo === true),
      );
    }
    expect(r.l.composicion.categoriasConModeloNuevo).toEqual([FLETE]);
  });
});

// ── D40: las dos cabeceras de la consolidacion ──────────────────────────────────────────────────────

interface LecturaBodega {
  /** Por consolidacion, cada superficie que pinta o descarga esa cabecera. */
  zonaPagina: Map<string, boolean | undefined>;
  zonaCompleto: Map<string, boolean | undefined>;
  zonaPasados: Map<string, boolean | undefined>;
  adminLista: Map<string, boolean | undefined>;
  adminPendientes: Map<string, boolean | undefined>;
  saldosPagina: Map<string, boolean | undefined>;
  saldosCompleto: Map<string, boolean | undefined>;
  paraLaCentral: Map<string, string>;
  paraLaCentralSaldos: Map<string, string>;
}

function servicioZona(cli: PrismaClient, zonaId: string) {
  return new CierreBodegaService(new CierreBodegaRepository(cli), {
    findUsuarioZonaId: async () => zonaId,
  } as never);
}

async function leerBodega(tx: TxDeTest, e: Empresa): Promise<LecturaBodega> {
  const satelite: Actor = { usuarioId: "adminSatelite-del-test", rol: "adminSatelite" };
  return comoEmpresa(tx, e.org, async () => {
    const cli = clienteConSavepoint(tx);
    const zona = servicioZona(cli, e.fks.zonaId);
    const admin = new CierresBodegaAdminService(new CierresBodegaAdminRepository(cli), {} as never);
    const saldos = new ConciliacionSatelitesService(new SaldosSatelitesRepository(cli), {} as never);
    const zonaId = e.fks.zonaId;

    const pagina = await zona.listarCierresBodegaSolicitadosPaginado(PAGINA, satelite);
    const completo = await zona.listarCierresBodegaSolicitadosCompleto(satelite);
    const consolidacion = await zona.listarConsolidacion(satelite);
    const lista = await admin.listarCierresBodegaAdmin(MAESTRO);
    const pendientes = await admin.listarPendientesCierresBodegaPaginado(PAGINA, MAESTRO);
    const saldosPagina = await saldos.listarConsolidacionesSatelite({ zonaId, ...PAGINA }, MAESTRO);
    const saldosCompleto = await saldos.listarConsolidacionesSateliteCompleto({ zonaId }, MAESTRO);
    if (
      pagina.status !== "ok" ||
      completo.status !== "ok" ||
      consolidacion.status !== "ok" ||
      lista.status !== "ok" ||
      pendientes.status !== "ok" ||
      saldosPagina.status !== "ok" ||
      saldosCompleto.status !== "ok"
    ) {
      throw new Error("alguna lectura de la consolidacion no devolvio ok");
    }
    return {
      zonaPagina: new Map(pagina.items.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      zonaCompleto: new Map(completo.items.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      zonaPasados: new Map(consolidacion.cierresBodegaPasados.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      adminLista: new Map(lista.pendientes.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      adminPendientes: new Map(pendientes.items.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      saldosPagina: new Map(saldosPagina.items.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      saldosCompleto: new Map(saldosCompleto.items.map((c) => [c.cierreBodegaId, c.incluyeModeloNuevo])),
      paraLaCentral: new Map(pagina.items.map((c) => [c.cierreBodegaId, c.paraLaCentral])),
      paraLaCentralSaldos: new Map(saldosPagina.items.map((c) => [c.cierreBodegaId, c.paraLaCentral])),
    };
  });
}

function afirmarBodega(l: LecturaBodega, id: string, esperado: boolean) {
  expect(l.zonaPagina.get(id)).toBe(esperado);
  expect(l.zonaCompleto.get(id)).toBe(esperado);
  expect(l.zonaPasados.get(id)).toBe(esperado);
  expect(l.adminLista.get(id)).toBe(esperado);
  expect(l.adminPendientes.get(id)).toBe(esperado);
  expect(l.saldosPagina.get(id)).toBe(esperado);
  expect(l.saldosCompleto.get(id)).toBe(esperado);
  // El importe es el de siempre: la lectura del modelo no toca un snapshot.
  expect(l.paraLaCentral.get(id)).toBe("850.00");
  expect(l.paraLaCentralSaldos.get(id)).toBe("850.00");
}

describeSiHayBase("D40 — incluyeModeloNuevo en las cabeceras de la consolidacion, contra Postgres", () => {
  it("solo viejo y sin detalle: falso en todas las superficies", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const vieja = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["viejo", "viejo"])]);
      const vacia = await crearConsolidacion(tx, e, [await crearCierre(tx, e, [])]);
      const sinCierres = await crearConsolidacion(tx, e, []);
      return { vieja, vacia, sinCierres, l: await leerBodega(tx, e) };
    });
    afirmarBodega(r.l, r.vieja, false);
    afirmarBodega(r.l, r.vacia, false);
    afirmarBodega(r.l, r.sinCierres, false);
  });

  it("un cierre del modelo nuevo: verdadero, tambien mixto dentro del cierre y entre cierres", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const nueva = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["nuevo"])]);
      const mixtaDentro = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["viejo", "nuevo"])]);
      const mixtaEntre = await crearConsolidacion(tx, e, [
        await crearCierre(tx, e, ["viejo"]),
        await crearCierre(tx, e, ["nuevo"]),
      ]);
      return { nueva, mixtaDentro, mixtaEntre, l: await leerBodega(tx, e) };
    });
    afirmarBodega(r.l, r.nueva, true);
    afirmarBodega(r.l, r.mixtaDentro, true);
    afirmarBodega(r.l, r.mixtaEntre, true);
  });

  it("cada consolidacion responde por sus cierres: la vecina y el cierre sin consolidar no contaminan", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const vieja = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["viejo"])]);
      const nueva = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["nuevo"])]);
      await crearCierre(tx, e, ["nuevo"]); // aprobado y aun sin consolidar
      // El lote lee solo las ids pedidas: la vecina del modelo nuevo no entra en su resultado.
      const soloLaVieja = await consolidacionesConModeloNuevo(tx, [vieja]);
      return { vieja, nueva, soloLaVieja: [...soloLaVieja], l: await leerBodega(tx, e) };
    });
    afirmarBodega(r.l, r.vieja, false);
    afirmarBodega(r.l, r.nueva, true);
    expect(r.soloLaVieja).toEqual([]);
  });

  it("el detalle del maestro trae el mismo dato por su propia lectura", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const vieja = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["viejo"])]);
      const nueva = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["nuevo"])]);
      return comoEmpresa(tx, e.org, async () => {
        const admin = new CierresBodegaAdminService(new CierresBodegaAdminRepository(clienteConSavepoint(tx)), {} as never);
        return {
          vieja: await admin.verCierreBodegaDetalle(vieja, MAESTRO),
          nueva: await admin.verCierreBodegaDetalle(nueva, MAESTRO),
        };
      });
    });
    if (r.vieja.status !== "ok" || r.nueva.status !== "ok") throw new Error("el detalle no devolvio ok");
    expect(r.vieja.cierre.incluyeModeloNuevo).toBe(false);
    expect(r.nueva.cierre.incluyeModeloNuevo).toBe(true);
  });

  it("activar la empresa no mueve lo congelado", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const vieja = await crearConsolidacion(tx, e, [await crearCierre(tx, e, ["viejo"])]);
      await sembrarActivacion(tx, e.org);
      return { vieja, l: await leerBodega(tx, e) };
    });
    afirmarBodega(r.l, r.vieja, false);
  });

  it("otra empresa no contamina: la RLS esconde su consolidacion, y como dueno de las tablas se ve", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const B = await crearEmpresa(tx);
      const deB = await crearConsolidacion(tx, B, [await crearCierre(tx, B, ["nuevo"])]);
      const A = await crearEmpresa(tx);
      const deA = await crearConsolidacion(tx, A, [await crearCierre(tx, A, ["viejo"])]);

      const sinRls = await consolidacionesConModeloNuevo(tx, [deB]);
      const comoA = await comoEmpresa(tx, A.org, () => consolidacionesConModeloNuevo(clienteConSavepoint(tx), [deB]));
      const lecturaDeA = await leerBodega(tx, A);
      await fijarEmpresa(tx, B.org);
      return { deA, deB, sinRls: [...sinRls], comoA: [...comoA], lecturaDeA, lecturaDeB: await leerBodega(tx, B) };
    });
    expect(r.sinRls).toEqual([r.deB]);
    expect(r.comoA).toEqual([]);
    afirmarBodega(r.lecturaDeA, r.deA, false);
    expect(r.lecturaDeA.adminLista.has(r.deB)).toBe(false);
    afirmarBodega(r.lecturaDeB, r.deB, true);
  });
});

// ── Sin una consulta por fila ───────────────────────────────────────────────────────────────────────

describeSiHayBase("D39 y D40 — sin una consulta por fila", () => {
  const { prisma: espia, eventos } = HAY_BASE_DE_DATOS
    ? crearPrismaDeTestConEspia()
    : { prisma: undefined as unknown as PrismaClient, eventos: [] as EventoSqlDeTest[] };

  afterAll(async () => {
    if (HAY_BASE_DE_DATOS) await espia.$disconnect();
  });

  async function sentencias<T>(fn: () => Promise<T>): Promise<{ valor: T; n: number }> {
    eventos.length = 0;
    const valor = await fn();
    return { valor, n: eventos.filter((ev) => ev.query.includes('"cierre_detail"')).length };
  }

  it("tres cierres cuestan una sentencia en cada lectura, y sin consolidaciones ninguna", async () => {
    const r = await enTransaccionRevertida(espia, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      return comoEmpresaConSiembra(tx, e);
    });

    async function comoEmpresaConSiembra(tx: TxDeTest, e: Empresa) {
      const satelite: Actor = { usuarioId: "adminSatelite-del-test", rol: "adminSatelite" };
      const vacia = await comoEmpresa(tx, e.org, () =>
        sentencias(() => servicioZona(clienteConSavepoint(tx), e.fks.zonaId).listarCierresBodegaSolicitadosCompleto(satelite)),
      );
      for (let i = 0; i < 3; i += 1) {
        const cierre = await crearCierre(tx, e, ["nuevo"]);
        await crearMovimiento(tx, cierre, FLETE);
        await crearConsolidacion(tx, e, [cierre]);
      }
      return comoEmpresa(tx, e.org, async () => {
        const cli = clienteConSavepoint(tx);
        return {
          vacia,
          zona: await sentencias(() => servicioZona(cli, e.fks.zonaId).listarCierresBodegaSolicitadosCompleto(satelite)),
          saldos: await sentencias(() =>
            new ConciliacionSatelitesService(new SaldosSatelitesRepository(cli), {} as never).listarConsolidacionesSatelite(
              { zonaId: e.fks.zonaId, ...PAGINA },
              MAESTRO,
            ),
          ),
          categorias: await sentencias(() => new WalletMovimientoRepository(cli).categoriasConModeloNuevo({})),
          conceptos: await sentencias(() =>
            new FiltrosWalletService(new FiltrosWalletRepository(cli)).conceptosConMovimientos({ libro: "caja" }, MAESTRO),
          ),
        };
      });
    }

    expect(r.vacia.n).toBe(0);
    if (r.zona.valor.status !== "ok" || r.saldos.valor.status !== "ok" || r.conceptos.valor.status !== "ok") {
      throw new Error("alguna lectura no devolvio ok");
    }
    expect(r.zona.valor.items.filter((c) => c.incluyeModeloNuevo === true)).toHaveLength(3);
    expect(r.zona.n).toBe(1);
    expect(r.saldos.valor.items.filter((c) => c.incluyeModeloNuevo === true)).toHaveLength(3);
    expect(r.saldos.n).toBe(1);
    expect(r.categorias.valor).toEqual([FLETE]);
    expect(r.categorias.n).toBe(1);
    expect(r.conceptos.valor.conceptos).toEqual([{ categoria: FLETE, movimientos: 3, incluyeModeloNuevo: true }]);
    expect(r.conceptos.n).toBe(1);
  });
});
