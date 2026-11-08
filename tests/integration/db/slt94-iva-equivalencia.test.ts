import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { ivaDe } from "@/lib/tarifas/calculo";
import type { ValorCobro } from "@/lib/types/tarifa-flexible";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, enTransaccionRevertida, serializarEscriturasReales } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-94 (design §7, R15) — la aritmética del IVA del cobro de fulfillment vive DUPLICADA: en el trigger
// `fulfillment_al_crear_orden` (`round(monto * iva_pct / 100, 2)` de Postgres) y en `ivaDe`
// (`lib/tarifas/calculo.ts`, HALF_UP), que es lo que la cotización y el costo por API publican (R33).
// Este archivo las compara en los bordes (…,005): el `round` de numeric redondea la mitad alejándose de
// cero, que para positivos es HALF_UP.
//
// No se compara contra una copia del SQL: cada caso CREA una orden y lee el IVA que escribió el trigger
// real. Todo en una transacción revertida: no queda nada.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** [monto, % IVA]: cada uno deja el tercer decimal del IVA en 5 o cerca del borde. */
const CASOS: [string, string][] = [
  ["0.50", "1.00"], //   0.005    → 0.01
  ["0.10", "5.00"], //   0.005    → 0.01
  ["0.01", "50.00"], //  0.005    → 0.01
  ["1.50", "13.00"], //  0.195    → 0.20
  ["10.05", "5.00"], //  0.5025   → 0.50
  ["12.30", "2.50"], //  0.3075   → 0.31
  ["3.33", "15.15"], //  0.504495 → 0.50
  ["100.10", "0.05"], // 0.05005  → 0.05
  ["1234.50", "3.50"], // 43.2075 → 43.21
  ["16618.40", "3.50"], // 581.644 → 581.64 (la medición de la 204)
  ["999.99", "13.00"], // 129.9987 → 130.00
  ["9999999999.99", "99.99"],
  ["1000.00", "0.00"], // sin IVA
];

let base: PrismaClient;

describeSiHayBase("SLT-94 — el IVA del trigger es el de `ivaDe` (Postgres)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("para cada borde, el IVA que escribe el trigger es exactamente `ivaDe`", async () => {
    const leidos = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ org }] = await tx.$queryRawUnsafe<{ org: string }[]>(`SELECT current_setting('app.organizacion_id') AS org`);
      const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
      const zona = await tx.zona.create({
        data: { nombre: `Zona SLT94 IVA ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      });
      const canton = await tx.canton.findFirstOrThrow({
        where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
        select: { id: true, provinciaId: true },
      });
      const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
      await tx.tarifaActivacion.create({ data: { organizacionId: org } });
      const valor = await tx.tarifaValor.create({
        data: { tiendaId: tienda.id, concepto: "tienda_fulfillment", modo: "monto", valor: "1.00", ivaPct: "0.00" },
        select: { id: true },
      });

      const salida: { monto: string; iva: string }[] = [];
      for (const [monto, pct] of CASOS) {
        await tx.tarifaValor.update({ where: { id: valor.id }, data: { valor: monto, ivaPct: pct } });
        const id = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
             "provincia_id", "canton_id", "producto", "updated_at")
           VALUES ($1, $2, $3, 'SLT94', '88887777', $4, $5, $6, $7, 'Caja', now())`,
          id,
          `SLT94-IVA-${id.slice(0, 8)}`,
          estatus.id,
          tienda.id,
          zona.id,
          canton.provinciaId,
          canton.id,
        );
        const filas = await tx.$queryRawUnsafe<{ monto: string; iva: string }[]>(
          `SELECT "monto"::text, "iva"::text FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1`,
          id,
        );
        if (filas.length !== 1) throw new Error(`el trigger no cobró el caso ${monto} × ${pct}`);
        salida.push(filas[0]);
      }
      return salida;
    });

    expect(leidos).toHaveLength(CASOS.length);
    CASOS.forEach(([monto, pct], i) => {
      const valor: ValorCobro = { concepto: "tienda_fulfillment", modo: "monto", valor: monto, ivaPct: pct, nivel: "tienda_general", tarifaValorId: null };
      const esperado = ivaDe(valor, new Prisma.Decimal(monto));
      expect(leidos[i], `${monto} × ${pct}%`).toEqual({ monto, iva: esperado.toFixed(2) });
    });
  });
});
