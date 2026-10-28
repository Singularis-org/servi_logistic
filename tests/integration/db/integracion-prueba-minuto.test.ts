import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { PRUEBAS_POR_MINUTO_DEFECTO, pruebasPorMinuto } from "@/lib/config/integraciones";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { IntegracionPruebaMinutoRepository } from "@/lib/repositories/IntegracionPruebaMinutoRepository";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SL-36 T3.2 (design §6; R16 base) — el contador de pruebas por minuto contra Postgres real: la
// sexta prueba del minuto supera el límite por defecto, otra empresa no cuenta, y con pruebas a la
// vez ninguna se pierde. Lo que el service hace con el número (rechazar sin llamar al proveedor y
// decir cuándo volver) es de T5.1, con un doble de este repositorio.
//
// POR QUÉ EL CLIENTE BASE EN LOS DOS PRIMEROS CASOS. Es el dueño de las tablas, sin `set_config`:
// si el SQL no escribiera la empresa del contexto, el `DEFAULT` de `organizacion_id` quedaría NULL
// y el caso fallaría; si la escribiera mal, A y B contarían en la misma fila. La concurrencia va con
// el cliente de la app (extensión + `servi_app`), commiteada y limpiada en `afterAll`.
//
// `now()` es la hora de inicio de la transacción, así que todo lo de una transacción revertida cae en
// el mismo minuto: esos casos no dependen del reloj.
//
// Mutación medida (progress/impl_SL-36-T3.md): sin `organizacion_id` en el SQL cae «A y B cuentan
// por separado».

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let A: string;
let B: string;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

async function sumarN(repo: IntegracionPruebaMinutoRepository, org: string, n: number): Promise<number[]> {
  return conEmpresa(org, async () => {
    const intentos: number[] = [];
    for (let i = 0; i < n; i++) intentos.push((await repo.sumarPrueba()).intentos);
    return intentos;
  });
}

describeSiHayBase("SL-36 T3.2 — IntegracionPruebaMinutoRepository contra Postgres (R16)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    await bajoLockDeEscrituraReal(async () => {
      A = (await crearOrganizacion(base, { nombre: "Empresa A SL36 minuto" })).id;
      B = (await crearOrganizacion(base, { nombre: "Empresa B SL36 minuto" })).id;
    });
    expect(await base.organizacion.count({ where: { id: { in: [A, B] } } })).toBe(2);
  }, 60_000);

  afterAll(async () => {
    if (A !== undefined && B !== undefined) {
      await bajoLockDeEscrituraReal(async () => {
        await base.$executeRawUnsafe(`DELETE FROM integracion_prueba_minuto WHERE organizacion_id = ANY($1::text[])`, [A, B]);
        await base.$executeRawUnsafe(`DELETE FROM organizacion WHERE id = ANY($1::text[])`, [A, B]);
      });
    }
    await base?.$disconnect();
  }, 60_000);

  it("sin contexto de empresa, falla con EmpresaNoResuelta sin escribir", async () => {
    await expect(new IntegracionPruebaMinutoRepository(base).sumarPrueba()).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });

  it("la sexta prueba del minuto supera el límite por defecto; el minuto es el truncado de la base", async () => {
    const r = await revertida(async (tx) => {
      const repo = new IntegracionPruebaMinutoRepository(tx);
      const intentos = await sumarN(repo, A, 6);
      const ultimo = await conEmpresa(A, () => repo.sumarPrueba());
      const [{ minuto }] = await tx.$queryRawUnsafe<{ minuto: Date }[]>(`SELECT date_trunc('minute', now()) AS minuto`);
      return { intentos, ultimo, minuto };
    });

    expect(r.intentos).toEqual([1, 2, 3, 4, 5, 6]);
    // El límite lo aplica el service; aquí se comprueba que el número que le llega lo cruza en la sexta.
    expect(pruebasPorMinuto({})).toBe(PRUEBAS_POR_MINUTO_DEFECTO);
    expect(r.intentos.filter((n) => n > PRUEBAS_POR_MINUTO_DEFECTO)).toEqual([6]);
    expect(r.ultimo).toEqual({ intentos: 7, minuto: r.minuto });
  });

  it("A y B cuentan por separado: las pruebas de A no gastan el límite de B", async () => {
    const r = await revertida(async (tx) => {
      const repo = new IntegracionPruebaMinutoRepository(tx);
      const deA = await sumarN(repo, A, 5);
      const deB = await sumarN(repo, B, 2);
      const masDeA = await sumarN(repo, A, 1);
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; intentos: number }[]>(
        `SELECT organizacion_id, intentos FROM integracion_prueba_minuto WHERE organizacion_id = ANY($1::text[])`,
        [A, B],
      );
      return { deA, deB, masDeA, filas: Object.fromEntries(filas.map((f) => [f.organizacion_id, f.intentos])) };
    });

    expect(r).toEqual({ deA: [1, 2, 3, 4, 5], deB: [1, 2], masDeA: [6], filas: { [A]: 6, [B]: 2 } });
  });

  it("con pruebas a la vez ninguna se pierde: cada una recibe un número distinto (cliente de la app)", async () => {
    const crudo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 6 }), omit: PRISMA_OMIT });
    const app = conAislamientoPorEmpresa(crudo as unknown as PrismaClient, async () => null);
    const N = 10;
    try {
      const repo = new IntegracionPruebaMinutoRepository(app);
      const conteos = await bajoLockDeEscrituraReal(() =>
        conEmpresa(A, () => Promise.all(Array.from({ length: N }, () => repo.sumarPrueba()))),
      );
      // Las diez de A no cuentan para B: su primera prueba del minuto es la 1.
      const deB = await conEmpresa(B, () => repo.sumarPrueba());

      const filas = await base.integracionPruebaMinuto.findMany({
        where: { organizacionId: A, minuto: { in: [...new Set(conteos.map((c) => c.minuto.getTime()))].map((t) => new Date(t)) } },
        select: { minuto: true, intentos: true },
      });
      // Por minuto (si el lote cruzó un cambio de minuto, son dos filas), los números devueltos son
      // exactamente 1..k y la fila guarda k: sin huecos ni repetidos, que es lo que perdería un
      // leer-y-escribir.
      const porMinuto = new Map<number, number[]>();
      for (const c of conteos) porMinuto.set(c.minuto.getTime(), [...(porMinuto.get(c.minuto.getTime()) ?? []), c.intentos]);
      for (const [minuto, numeros] of porMinuto) {
        const k = numeros.length;
        expect(numeros.sort((x, y) => x - y)).toEqual(Array.from({ length: k }, (_, i) => i + 1));
        expect(filas.find((f) => f.minuto.getTime() === minuto)?.intentos).toBe(k);
      }
      expect(conteos).toHaveLength(N);
      expect(deB.intentos).toBe(1);
    } finally {
      await crudo.$disconnect();
    }
  }, 60_000);
});
