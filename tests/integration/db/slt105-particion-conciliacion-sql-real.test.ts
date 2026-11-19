import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { estadoConciliacionDe } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import type { CierreBodegaResumenRow } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import type { FiltrosCierresBodegaRepo } from "@/lib/types/filtros-cierres";
import { ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";

import { comoApp, crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» (T2; R44, R122-R126) — la
 * partición de las dos listas de bodega de la central, contra Postgres real.
 *
 * Los tests de repositorio usan un `$queryRaw` doble y no ven el SQL que elige los «recibidos
 * incompletos» (memoria «Probar el WHERE donde vive»). Aquí solo pasa si Postgres reparte de verdad.
 *
 * EL CORPUS (una transacción que SIEMPRE se revierte), con importes escritos a mano:
 *   empresa A (la de la transacción), bodega Z1 salvo I2:
 *     · S  `solicitado`, sin marca                                       → por conciliar
 *     · I  `aprobado`, Debe llegar 5 000,00, recibido 4 600,00           → por conciliar (incompleto)
 *     · E  `aprobado`, Debe llegar 3 000,00, recibido 3 000,00           → conciliados
 *     · M  `aprobado`, Debe llegar 3 000,00, recibido 3 200,00 (de más)  → conciliados
 *     · Z  `aprobado`, Debe llegar 0,00, recibido 0,00 (SLT-96)          → conciliados
 *     · G  `aprobado`, recaudado 5 000 − pago 1 000 − gana la bodega 500 = Debe llegar 3 500,00,
 *          recibido 3 500,00 → conciliados. Si se olvida restar lo que gana la bodega, Debe llegar
 *          sería 4 000 y G caería en la cola (mata la resta incompleta).
 *     · X  `rechazado` heredado, sin marca                              → por conciliar (PA1)
 *     · I2 `aprobado` en la bodega Z2, con otra fecha, Debe llegar 4 000,00, recibido 1 000,00
 *          → por conciliar (incompleto); para los filtros.
 *   empresa B:
 *     · IB `aprobado`, Debe llegar 5 000,00, recibido 100,00: un incompleto de OTRA empresa. No sale
 *          en ninguna lista ni cuenta en ningún total (R125).
 *
 * Las lecturas se hacen como la app (`comoApp`: rol sin BYPASSRLS y la empresa fijada) dentro de un
 * SAVEPOINT que se deshace. Una lectura más, como DUEÑO (sin RLS), comprueba que la consulta a mano
 * filtra la empresa por escrito: sin ese filtro, IB entraría en la cola.
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catálogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const PAGINA = { skip: 0, take: 100 };

type Nombre = "S" | "I" | "E" | "M" | "Z" | "G" | "X" | "I2" | "IB";

interface Siembra {
  zonaId: string;
  solicitadoPor: string;
  conciliadoPor: string;
  estado: "solicitado" | "aprobado" | "rechazado";
  solicitadoAt: string;
  totalGeneral: string;
  totalPagoMensajero?: string;
  totalIngresoBodegaRechazos?: string;
  /** Solo con `estado: "aprobado"`: el CHECK `cierre_bodega_conciliacion_coherente` lo exige. */
  recibido?: string;
}

async function sembrarCierreBodega(tx: TxDeTest, s: Siembra): Promise<string> {
  const instante = new Date(s.solicitadoAt);
  const conMarca = s.estado === "aprobado";
  const { id } = await tx.cierreBodega.create({
    data: {
      zonaId: s.zonaId,
      solicitadoPor: s.solicitadoPor,
      estado: s.estado,
      totalEfectivo: new Prisma.Decimal(s.totalGeneral),
      totalGeneral: new Prisma.Decimal(s.totalGeneral),
      totalPagoMensajero: new Prisma.Decimal(s.totalPagoMensajero ?? "0.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal(s.totalIngresoBodegaRechazos ?? "0.00"),
      solicitadoAt: instante,
      ...(s.estado === "solicitado"
        ? {}
        : { resueltoPor: s.conciliadoPor, resueltoAt: new Date(instante.getTime() + 3_600_000) }),
      ...(s.estado === "rechazado" ? { motivoRechazo: "Rechazo heredado del corpus SLT-105" } : {}),
      ...(conMarca
        ? {
            conciliadoAt: new Date(instante.getTime() + 3_600_000),
            conciliadoPor: s.conciliadoPor,
            montoRecibido: new Prisma.Decimal(s.recibido ?? "0.00"),
          }
        : {}),
    },
    select: { id: true },
  });
  return id;
}

async function crearZona(tx: TxDeTest, etiqueta: string): Promise<string> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const zona = await tx.zona.create({
    data: { nombre: `Bodega ${etiqueta} SLT-105 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return zona.id;
}

/**
 * Corre `fn` como la app: rol `servi_app` (sin BYPASSRLS) con la empresa fijada, dentro de un
 * SAVEPOINT. Deshacerlo devuelve el rol del dueño y la empresa del fixture.
 */
async function comoLaApp<T>(tx: TxDeTest, organizacionId: string, fn: () => Promise<T>): Promise<T> {
  const punto = `slt105_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await comoApp(tx, organizacionId);
    return await fn();
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
  }
}

interface Lista {
  ids: string[];
  total: number;
  filas: CierreBodegaResumenRow[];
}

interface Lecturas {
  cola: Lista;
  historico: Lista;
  colaCompleta: string[];
  historicoCompleto: string[];
}

async function leerLas4(repo: CierresBodegaAdminRepository, filtros?: FiltrosCierresBodegaRepo): Promise<Lecturas> {
  const cola = await repo.findColaPaginada(PAGINA, filtros);
  const historico = await repo.findHistoricoPaginado(PAGINA, filtros);
  return {
    cola: { ids: cola.items.map((f) => f.cierreBodegaId), total: cola.total, filas: cola.items },
    historico: { ids: historico.items.map((f) => f.cierreBodegaId), total: historico.total, filas: historico.items },
    colaCompleta: (await repo.findColaCompleta(filtros)).map((f) => f.cierreBodegaId),
    historicoCompleto: (await repo.findHistoricoCompleto(filtros)).map((f) => f.cierreBodegaId),
  };
}

interface Resultado {
  nombres: Record<string, Nombre>;
  sinFiltro: Lecturas;
  porBodegaZ1: Lecturas;
  porFechaDeI2: Lecturas;
  /** La cola leída como DUEÑO (sin RLS), solo con los ids del corpus. */
  colaComoDueno: Nombre[];
}

const nombrar = (nombres: Record<string, Nombre>, ids: string[]): string[] =>
  ids.map((id) => nombres[id] ?? `ajeno:${id}`);

describeSiHayBase("SLT-105 — partición de las listas de bodega de la central por conciliación (Postgres real)", () => {
  let prisma: PrismaClient;
  let r: Resultado;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const catalogo = await prisma.rol.findUnique({ where: { value: "maestro" }, select: { id: true } });
    if (catalogo === null) {
      throw new Error("faltan catálogos: corre `pnpm exec prisma migrate deploy` y `pnpm run db:seed`.");
    }

    r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ org: empresaA }] = await tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id', true) AS org`,
      );
      if (!empresaA) throw new Error("la transacción no tiene empresa fijada");

      const z1 = await crearZona(tx, "Z1");
      const z2 = await crearZona(tx, "Z2");
      const solicitante = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const base = { solicitadoPor: solicitante, conciliadoPor: maestro };

      const ids: Record<Exclude<Nombre, "IB">, string> = {
        S: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "solicitado", solicitadoAt: "2026-03-08T15:00:00Z", totalGeneral: "2000.00" }),
        I: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "aprobado", solicitadoAt: "2026-03-07T15:00:00Z", totalGeneral: "5000.00", recibido: "4600.00" }),
        E: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "aprobado", solicitadoAt: "2026-03-06T15:00:00Z", totalGeneral: "3000.00", recibido: "3000.00" }),
        M: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "aprobado", solicitadoAt: "2026-03-05T15:00:00Z", totalGeneral: "3000.00", recibido: "3200.00" }),
        Z: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "aprobado", solicitadoAt: "2026-03-04T15:00:00Z", totalGeneral: "0.00", recibido: "0.00" }),
        G: await sembrarCierreBodega(tx, {
          ...base,
          zonaId: z1,
          estado: "aprobado",
          solicitadoAt: "2026-03-03T15:00:00Z",
          totalGeneral: "5000.00",
          totalPagoMensajero: "1000.00",
          totalIngresoBodegaRechazos: "500.00",
          recibido: "3500.00",
        }),
        X: await sembrarCierreBodega(tx, { ...base, zonaId: z1, estado: "rechazado", solicitadoAt: "2026-03-02T15:00:00Z", totalGeneral: "1000.00" }),
        I2: await sembrarCierreBodega(tx, { ...base, zonaId: z2, estado: "aprobado", solicitadoAt: "2026-02-01T15:00:00Z", totalGeneral: "4000.00", recibido: "1000.00" }),
      };

      const empresaB = (await crearOrganizacion(tx, { nombre: `Empresa B SLT-105 ${randomUUID()}` })).id;
      await fijarEmpresa(tx, empresaB);
      const zb = await crearZona(tx, "ZB");
      const solicitanteB = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
      const maestroB = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const ib = await sembrarCierreBodega(tx, {
        zonaId: zb,
        solicitadoPor: solicitanteB,
        conciliadoPor: maestroB,
        estado: "aprobado",
        solicitadoAt: "2026-03-09T15:00:00Z",
        totalGeneral: "5000.00",
        recibido: "100.00",
      });
      await fijarEmpresa(tx, empresaA);

      const nombres: Record<string, Nombre> = { [ib]: "IB" };
      for (const [n, id] of Object.entries(ids)) nombres[id] = n as Nombre;

      const repo = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
      const sinFiltro = await comoLaApp(tx, empresaA, () => leerLas4(repo));
      const porBodegaZ1 = await comoLaApp(tx, empresaA, () => leerLas4(repo, { destinoZonaIds: [z1] }));
      const porFechaDeI2 = await comoLaApp(tx, empresaA, () =>
        leerLas4(repo, {
          solicitadoDesde: new Date("2026-02-01T00:00:00Z"),
          solicitadoHasta: new Date("2026-02-02T00:00:00Z"),
        }),
      );

      // Como DUEÑO (la RLS no actúa): solo el filtro escrito de la consulta a mano separa a IB.
      const delCorpus = new Set(Object.keys(nombres));
      const colaComoDueno = (await repo.findColaCompleta())
        .map((f) => f.cierreBodegaId)
        .filter((id) => delCorpus.has(id))
        .map((id) => nombres[id]!);

      return { nombres, sinFiltro, porBodegaZ1, porFechaDeI2, colaComoDueno };
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R44/R122: por conciliar = {S, I, X, I2}; conciliados = {E, M, Z, G}; unión = todo A, intersección vacía", () => {
    const cola = nombrar(r.nombres, r.sinFiltro.cola.ids);
    const historico = nombrar(r.nombres, r.sinFiltro.historico.ids);
    // Orden de hoy, más reciente primero (R123): las fechas del corpus son distintas a propósito.
    expect(cola).toEqual(["S", "I", "X", "I2"]);
    expect(historico).toEqual(["E", "M", "Z", "G"]);
    expect([...cola, ...historico].sort()).toEqual(["E", "G", "I", "I2", "M", "S", "X", "Z"]);
    expect(cola.filter((n) => historico.includes(n))).toEqual([]);
  });

  it("R123: el total de cada página es el tamaño de su conjunto, y los conjuntos completos traen los mismos ids en el mismo orden", () => {
    expect(r.sinFiltro.cola.total).toBe(4);
    expect(r.sinFiltro.historico.total).toBe(4);
    expect(r.sinFiltro.colaCompleta).toEqual(r.sinFiltro.cola.ids);
    expect(r.sinFiltro.historicoCompleto).toEqual(r.sinFiltro.historico.ids);
  });

  it("R123: con filtro de bodega (Z1), I2 sale de la cola y de su total a la vez; el histórico no cambia", () => {
    expect(nombrar(r.nombres, r.porBodegaZ1.cola.ids)).toEqual(["S", "I", "X"]);
    expect(r.porBodegaZ1.cola.total).toBe(3);
    expect(nombrar(r.nombres, r.porBodegaZ1.colaCompleta)).toEqual(["S", "I", "X"]);
    expect(nombrar(r.nombres, r.porBodegaZ1.historico.ids)).toEqual(["E", "M", "Z", "G"]);
    expect(r.porBodegaZ1.historico.total).toBe(4);
  });

  it("R123: con filtro de fecha (el día de I2), solo I2 queda en la cola y en su total; el histórico queda vacío", () => {
    expect(nombrar(r.nombres, r.porFechaDeI2.cola.ids)).toEqual(["I2"]);
    expect(r.porFechaDeI2.cola.total).toBe(1);
    expect(nombrar(r.nombres, r.porFechaDeI2.colaCompleta)).toEqual(["I2"]);
    expect(r.porFechaDeI2.historico.ids).toEqual([]);
    expect(r.porFechaDeI2.historico.total).toBe(0);
    expect(r.porFechaDeI2.historicoCompleto).toEqual([]);
  });

  it("R124: el estado de conciliación que deriva la tarjeta casa con la lista en que cae cada cierre", () => {
    const estadoDe = (f: CierreBodegaResumenRow) =>
      [r.nombres[f.cierreBodegaId], estadoConciliacionDe({ conciliado: f.conciliado, faltaPorRecibir: f.faltaPorRecibir })];
    expect(r.sinFiltro.cola.filas.map(estadoDe)).toEqual([
      ["S", "pendiente"],
      ["I", "incompleto"],
      ["X", "pendiente"],
      ["I2", "incompleto"],
    ]);
    expect(r.sinFiltro.historico.filas.map(estadoDe)).toEqual([
      ["E", "recibido"],
      ["M", "recibido"],
      ["Z", "recibido"],
      ["G", "recibido"],
    ]);
    // Lo que falta, escrito a mano: I = 5 000 − 4 600; I2 = 4 000 − 1 000.
    const falta = (n: Nombre) =>
      new Prisma.Decimal(r.sinFiltro.cola.filas.find((f) => r.nombres[f.cierreBodegaId] === n)!.faltaPorRecibir);
    expect(falta("I").eq("400")).toBe(true);
    expect(falta("I2").eq("3000")).toBe(true);
  });

  it("R125: el incompleto de OTRA empresa no sale en ninguna de las cuatro lecturas ni cuenta en ningún total", () => {
    for (const lect of [r.sinFiltro, r.porBodegaZ1, r.porFechaDeI2]) {
      for (const ids of [lect.cola.ids, lect.historico.ids, lect.colaCompleta, lect.historicoCompleto]) {
        expect(nombrar(r.nombres, ids)).not.toContain("IB");
      }
    }
    // Los totales ya están fijados arriba en 4 + 4: IB sumaría uno a alguno de los dos.
    expect(r.sinFiltro.cola.total + r.sinFiltro.historico.total).toBe(8);
  });

  it("R125: la consulta a mano filtra la empresa POR ESCRITO (leída como dueño, sin RLS, IB no entra en la cola)", () => {
    expect(r.colaComoDueno).toEqual(["S", "I", "X", "I2"]);
  });

  it("R126 (servidor): marcar de menos → cola como incompleto; corregir hasta lo esperado → conciliados; desmarcar → cola sin marca", async () => {
    const pasos = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ org: empresa }] = await tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id', true) AS org`,
      );
      if (!empresa) throw new Error("la transacción no tiene empresa fijada");
      const zona = await crearZona(tx, "R126");
      const solicitante = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const sinMarca = (general: string) =>
        sembrarCierreBodega(tx, {
          zonaId: zona,
          solicitadoPor: solicitante,
          conciliadoPor: maestro,
          estado: "solicitado",
          solicitadoAt: "2026-04-01T15:00:00Z",
          totalGeneral: general,
        });
      const p = await sinMarca("5000.00");
      const d = await sinMarca("3000.00");

      const escribe = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const lee = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
      const dondeEsta = (id: string) =>
        comoLaApp(tx, empresa, async () => {
          const cola = (await lee.findColaPaginada(PAGINA)).items.find((f) => f.cierreBodegaId === id);
          const hist = (await lee.findHistoricoPaginado(PAGINA)).items.find((f) => f.cierreBodegaId === id);
          const fila = cola ?? hist;
          return {
            lista: cola && hist ? "las dos" : cola ? "cola" : hist ? "conciliados" : "ninguna",
            estado: fila ? estadoConciliacionDe({ conciliado: fila.conciliado, faltaPorRecibir: fila.faltaPorRecibir }) : null,
          };
        });
      const comun = { zonaHoraria: ZONA_DE_CR, nota: null, actorUsuarioId: maestro };

      const antes = await dondeEsta(p);
      const marca = await escribe.marcarConciliado({ ...comun, id: p, montoRecibido: "4600.00" });
      const trasMarcar = await dondeEsta(p);
      const correccion = await escribe.corregirConciliacion({ ...comun, id: p, montoRecibido: "5000.00" });
      const trasCorregir = await dondeEsta(p);

      const marcaD = await escribe.marcarConciliado({ ...comun, id: d, montoRecibido: "3000.00" });
      const dMarcado = await dondeEsta(d);
      const revertir = await escribe.revertirConciliacion({ zonaHoraria: ZONA_DE_CR, id: d, actorUsuarioId: maestro });
      const trasDesmarcar = await dondeEsta(d);
      return { antes, marca, trasMarcar, correccion, trasCorregir, marcaD, dMarcado, revertir, trasDesmarcar };
    });

    expect(pasos.antes).toEqual({ lista: "cola", estado: "pendiente" });
    expect(pasos.marca).toBe("updated");
    expect(pasos.trasMarcar).toEqual({ lista: "cola", estado: "incompleto" });
    expect(pasos.correccion).toBe("updated");
    expect(pasos.trasCorregir).toEqual({ lista: "conciliados", estado: "recibido" });
    expect(pasos.marcaD).toBe("updated");
    expect(pasos.dMarcado).toEqual({ lista: "conciliados", estado: "recibido" });
    expect(pasos.revertir).toBe("updated");
    expect(pasos.trasDesmarcar).toEqual({ lista: "cola", estado: "pendiente" });
  }, 60_000);
});
