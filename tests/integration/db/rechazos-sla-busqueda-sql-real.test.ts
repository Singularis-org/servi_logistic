import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { terminoDeBusqueda } from "@/lib/utils/filtros-listado-ordenes";
import { ORIGEN_TIPO_RECHAZO_SLA } from "@/lib/utils/rechazo-sla-flag";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-194 (T4, D3) — LA BUSQUEDA DE RECHAZOS POR PLAZO VENCIDO, CONTRA POSTGRES DE VERDAD.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Por que contra la base: un doble del repositorio no ve el SQL, y en este repo una mutacion del
// `WHERE` ha pasado en verde por delante de un doble (medido cuatro veces). Aqui se ejerce el
// `rechazoSlaWhere` real con el criterio de `/ordenes`.
//
// Siembra PROPIA, dentro de una transaccion que siempre se revierte: dos empresas (A, la del actor,
// y B), dos tiendas de A y las ordenes de abajo. La consulta corre con el rol de la app (`comoApp`),
// sin `BYPASSRLS`, como en produccion: asi «otra empresa» lo mide la politica real, no un supuesto.
//
//   a1  tienda A · guia 91024 · rechazo SLA          -> la UNICA que debe salir con q=91024
//   a2  tienda A · guia 95555 · rechazo SLA          -> sale sin q; no casa con 91024
//   y una orden que CASA con 91024 (por su remision) en cada caso que R954 deja fuera:
//   otraTienda (tienda B), borrada, noRechazada (en preparacion, con transicion SLA), manual
//   (rechazada sin la transicion del cron), otraEmpresa (empresa B, con su propia tienda).
//
// No-vacuidad: antes de mirar el repositorio, se comprueba como dueno que las siete casan con el
// termino en la columna generada. Sin eso, «no aparece» podria ser «no casaba».
//
// Mutaciones (progress/impl_SLT-194.md, Backend): quitar `criterioBusqueda` de `rechazoSlaWhere`, y
// meter el termino en un `OR` con `tiendaId`. Las dos ponen este archivo en rojo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ESTATUS_RECHAZADA = "devolucion_a_origen_por_rechazo";
const ESTATUS_PREPARACION = "en_preparacion";

interface Escenario {
  repo: OrdenRepository;
  tiendaA: string;
  ids: {
    a1: string;
    a2: string;
    otraTienda: string;
    borrada: string;
    noRechazada: string;
    manual: string;
    otraEmpresa: string;
  };
}

async function idDeEstatus(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

/** Siembra el escenario, comprueba que no es vacuo y deja la transaccion con el rol de la app. */
async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);

  const empresaA = (await crearOrganizacion(tx, { nombre: `SLT-194 A ${randomUUID()}` })).id;
  const empresaB = (await crearOrganizacion(tx, { nombre: `SLT-194 B ${randomUUID()}` })).id;
  await fijarEmpresa(tx, empresaA);

  const fks = await crearFksDeOrden(tx); // la tienda A sale de aqui
  const tiendaB = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const rechazada = await idDeEstatus(tx, ESTATUS_RECHAZADA);
  const preparacion = await idDeEstatus(tx, ESTATUS_PREPARACION);

  let segundos = 0;
  const crear = async (o: {
    numRemision: string;
    numGuia?: number;
    destinatario?: string;
    tiendaId?: string;
    fksDe?: typeof fks;
    estatusId?: string;
    borrada?: boolean;
    origenTipo?: typeof ORIGEN_TIPO_RECHAZO_SLA | "gestion";
  }): Promise<string> => {
    const id = randomUUID();
    const f = o.fksDe ?? fks;
    segundos += 60;
    await tx.orden.create({
      data: {
        id,
        numRemision: o.numRemision,
        numGuia: o.numGuia ?? null,
        estatusId: o.estatusId ?? rechazada,
        destinatario: o.destinatario ?? "Destinatario de prueba",
        telefonoDest: "00000000",
        tiendaId: o.tiendaId ?? f.tiendaId,
        zonaId: f.zonaId,
        provinciaId: f.provinciaId,
        cantonId: f.cantonId,
        producto: "Caja",
        cobraComision: false,
        // Fechas crecientes: el orden de la pagina (`createdAt desc`) es deterministico.
        createdAt: new Date(Date.UTC(2026, 10, 1, 12, 0, segundos)),
        deletedAt: o.borrada ? new Date() : null,
      },
    });
    await tx.ordenHistorialEstado.create({
      data: {
        ordenId: id,
        estatusDestinoId: rechazada,
        origenTipo: o.origenTipo ?? ORIGEN_TIPO_RECHAZO_SLA,
      },
    });
    return id;
  };

  const a1 = await crear({ numRemision: "REM-SLT194-A1", numGuia: 91024, destinatario: "Ana Quintanilla" });
  const a2 = await crear({ numRemision: "REM-SLT194-A2", numGuia: 95555, destinatario: "Beto Zubizarreta" });
  const otraTienda = await crear({ numRemision: "R91024-OTRATIENDA", tiendaId: tiendaB });
  const borrada = await crear({ numRemision: "R91024-BORRADA", borrada: true });
  const noRechazada = await crear({ numRemision: "R91024-NORECHAZADA", estatusId: preparacion });
  const manual = await crear({ numRemision: "R91024-MANUAL", origenTipo: "gestion" });

  // Empresa B, con su tienda y su zona: la base no deja colgar una orden de la tienda de otra
  // empresa («referencia a otra empresa: orden.tienda_id -> usuario»). La politica de la empresa
  // la deja fuera ademas de su tienda.
  await fijarEmpresa(tx, empresaB);
  const fksB = await crearFksDeOrden(tx);
  const otraEmpresa = await crear({ numRemision: "R91024-OTRAEMPRESA", fksDe: fksB });
  await fijarEmpresa(tx, empresaA);

  const ids = { a1, a2, otraTienda, borrada, noRechazada, manual, otraEmpresa };

  // No-vacuidad, como dueno (sin RLS): las siete casan con «91024» en la columna generada, y las de
  // la empresa B son de verdad de la empresa B.
  const casan = await tx.orden.findMany({
    where: { id: { in: Object.values(ids) }, busquedaTexto: { contains: "91024" } },
    select: { id: true },
  });
  expect(casan.map((f) => f.id).sort()).toEqual(
    [a1, otraTienda, borrada, noRechazada, manual, otraEmpresa].sort(),
  );
  const deB = await tx.orden.findUniqueOrThrow({ where: { id: otraEmpresa }, select: { organizacionId: true } });
  expect(deB.organizacionId).toBe(empresaB);

  // Desde aqui, el rol de la app en la empresa A (sin BYPASSRLS).
  await comoApp(tx, empresaA);

  return {
    repo: new OrdenRepository(clienteConTransaccionAnidada(tx) as PrismaClient),
    tiendaA: fks.tiendaId,
    ids,
  };
}

const PAGINA = { skip: 0, take: 10 };

describeSiHayBase("SLT-194 — busqueda en Rechazos por plazo vencido (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const conEscenario = <T>(fn: (e: Escenario) => Promise<T>) =>
    enTransaccionRevertida(prisma, async (tx) => fn(await sembrar(tx)));

  it("R957: sin termino, salen los dos rechazos SLA de la tienda (el where de siempre)", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      expect(await repo.countRechazadasSlaByTienda(tiendaA)).toBe(2);
      const filas = await repo.findRechazadasSlaByTienda(tiendaA, PAGINA);
      // `createdAt desc`: a2 nacio despues que a1.
      expect(filas.map((f) => f.id)).toEqual([ids.a2, ids.a1]);
    });
  });

  it("R953: q=91024 -> total 1 y la pagina trae solo la guia 91024", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      const t = terminoDeBusqueda("91024");
      expect(await repo.countRechazadasSlaByTienda(tiendaA, t)).toBe(1);
      const filas = await repo.findRechazadasSlaByTienda(tiendaA, PAGINA, t);
      expect(filas.map((f) => [f.id, f.numGuia])).toEqual([[ids.a1, 91024]]);
    });
  });

  it("R953: q=95555 -> la otra orden, sola", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      const t = terminoDeBusqueda("95555");
      expect(await repo.countRechazadasSlaByTienda(tiendaA, t)).toBe(1);
      const filas = await repo.findRechazadasSlaByTienda(tiendaA, PAGINA, t);
      expect(filas.map((f) => f.id)).toEqual([ids.a2]);
    });
  });

  it("R953: por remision y por destinatario fijados por el test -> la orden correcta", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      const casos: Array<[string, string]> = [
        ["REM-SLT194-A2", ids.a2],
        ["rem-slt194-a1", ids.a1],
        ["Zubizarreta", ids.a2],
        ["quintanilla", ids.a1],
      ];
      for (const [q, esperado] of casos) {
        const t = terminoDeBusqueda(q);
        expect(await repo.countRechazadasSlaByTienda(tiendaA, t), q).toBe(1);
        const filas = await repo.findRechazadasSlaByTienda(tiendaA, PAGINA, t);
        expect(filas.map((f) => f.id), q).toEqual([esperado]);
      }
    });
  });

  it("R953: el total y la pagina salen del mismo filtro (termino que casa con las dos, pagina de 1)", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      const t = terminoDeBusqueda("REM-SLT194");
      expect(await repo.countRechazadasSlaByTienda(tiendaA, t)).toBe(2);
      const p1 = await repo.findRechazadasSlaByTienda(tiendaA, { skip: 0, take: 1 }, t);
      const p2 = await repo.findRechazadasSlaByTienda(tiendaA, { skip: 1, take: 1 }, t);
      const p3 = await repo.findRechazadasSlaByTienda(tiendaA, { skip: 2, take: 1 }, t);
      expect([...p1, ...p2].map((f) => f.id)).toEqual([ids.a2, ids.a1]);
      expect(p3).toEqual([]);
    });
  });

  it("R954: con q=91024 no aparece ni cuenta la de otra tienda, otra empresa, borrada, no rechazada ni manual", async () => {
    await conEscenario(async ({ repo, tiendaA, ids }) => {
      const t = terminoDeBusqueda("91024");
      const filas = await repo.findRechazadasSlaByTienda(tiendaA, PAGINA, t);
      const vistos = filas.map((f) => f.id);
      for (const caso of ["otraTienda", "otraEmpresa", "borrada", "noRechazada", "manual"] as const) {
        expect(vistos, caso).not.toContain(ids[caso]);
      }
      expect(vistos).toEqual([ids.a1]);
      expect(await repo.countRechazadasSlaByTienda(tiendaA, t)).toBe(1);
    });
  });
});
