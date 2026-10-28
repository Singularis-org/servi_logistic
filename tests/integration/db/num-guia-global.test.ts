import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SL-18 / T6.2 (design §8) — R29: `orden.num_guia` SIGUE GLOBAL, contra Postgres.
//
// La guía sale en la etiqueta y el QR y se rastrea sin sesión por `/paquete/[numGuia]`: si dos
// empresas pudieran repetirla, el rastreo público tendría que pedir la empresa. Este archivo fija
// las dos mitades de esa decisión:
//   · el generador: órdenes de A y de B numeradas con `siguiente_num_guia()` (el mismo texto que
//     usa `OrdenRepository`) no repiten guía, y la función sigue leyendo `orden_num_guia_seq`;
//   · el índice: `orden_num_guia_key` es único sobre `num_guia` SOLO, sin `organizacion_id`, y
//     rechaza que B reutilice la guía de A.
//
// Todo corre en `enTransaccionRevertida`: las órdenes, las empresas y sus usuarios no sobreviven al
// test. Lo único que no se revierte es el avance de la secuencia (Postgres no la devuelve), que solo
// deja huecos en la numeración, lo mismo que una carga fallida en producción.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const POR_EMPRESA = 5;

interface Geo {
  provinciaId: string;
  cantonId: string;
  distritoId: string;
}

let prisma: PrismaClient;

async function geoCualquiera(tx: TxDeTest): Promise<Geo> {
  const d = await tx.distrito.findFirst({
    where: { activo: true },
    select: { id: true, canton: { select: { id: true, provinciaId: true } } },
    orderBy: { id: "asc" },
  });
  if (d === null) throw new Error("no hay distritos en el catálogo: aplica las migraciones");
  return { provinciaId: d.canton.provinciaId, cantonId: d.canton.id, distritoId: d.id };
}

/** Una empresa con su tienda, su zona y `POR_EMPRESA` órdenes SIN guía. Devuelve los ids. */
async function sembrarEmpresa(tx: TxDeTest, letra: "A" | "B", geo: Geo): Promise<{ org: string; ordenes: string[] }> {
  const org = (await crearOrganizacion(tx, { nombre: `SL18 guia ${letra} ${RUN}` })).id;
  const rol = await tx.rol.findFirstOrThrow({ where: { value: "adminTienda" }, select: { id: true } });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
  const tienda = await tx.usuario.create({
    data: {
      nombre: `SL18 guia tienda ${letra} ${RUN}`,
      email: `sl18-guia-${letra.toLowerCase()}-${RUN}@ejemplo.test`,
      telefono: "88880000",
      passwordHash: "x",
      cedula: `sl18g-${letra}-${RUN}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
      organizacionId: org,
    },
    select: { id: true },
  });
  const zona = await tx.zona.create({
    data: { nombre: `Zona SL18 guia ${letra} ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: org },
    select: { id: true },
  });
  const ordenes: string[] = [];
  for (let i = 1; i <= POR_EMPRESA; i += 1) {
    const o = await tx.orden.create({
      data: {
        numRemision: `SL18G-${letra}${i}-${RUN}`,
        estatusId: estatus.id,
        destinatario: `Cliente SL18 ${letra}${i}`,
        telefonoDest: "88887777",
        tiendaId: tienda.id,
        zonaId: zona.id,
        provinciaId: geo.provinciaId,
        cantonId: geo.cantonId,
        distritoId: geo.distritoId,
        producto: "Caja",
        organizacionId: org,
      },
      select: { id: true },
    });
    ordenes.push(o.id);
  }
  return { org, ordenes };
}

/** «Generar guía»: el mismo generador que `OrdenRepository` (`NUM_GUIA_GENERATOR`). */
async function generarGuias(tx: TxDeTest, ids: string[]): Promise<{ id: string; num_guia: number; organizacion_id: string }[]> {
  return tx.$queryRawUnsafe(
    `UPDATE "orden" SET "num_guia" = siguiente_num_guia()
      WHERE "id" = ANY($1::text[]) AND "num_guia" IS NULL
      RETURNING "id", "num_guia", "organizacion_id"`,
    ids,
  );
}

describeSiHayBase("SL-18 — R29: la guía sigue global (Postgres)", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("⭑ R29: órdenes de A y de B numeradas con `siguiente_num_guia()` no repiten guía, y B no puede reutilizar la de A", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const geo = await geoCualquiera(tx);
      const A = await sembrarEmpresa(tx, "A", geo);
      const B = await sembrarEmpresa(tx, "B", geo);

      // Intercaladas A, B, A, B…: la secuencia es una sola para las dos.
      const guias: { id: string; num_guia: number; organizacion_id: string }[] = [];
      for (let i = 0; i < POR_EMPRESA; i += 1) {
        guias.push(...(await generarGuias(tx, [A.ordenes[i]])), ...(await generarGuias(tx, [B.ordenes[i]])));
      }

      // B intenta quedarse con la guía de A: el índice único lo rechaza (23505).
      await tx.$executeRawUnsafe(`SAVEPOINT sl18_guia_repetida`);
      let codigo: string | undefined;
      try {
        await tx.$executeRawUnsafe(
          `UPDATE "orden" SET "num_guia" = $1 WHERE "id" = $2`,
          guias.find((g) => g.organizacion_id === A.org)?.num_guia,
          B.ordenes[0],
        );
      } catch (e) {
        codigo = JSON.stringify(e).match(/23505/)?.[0] ?? String(e);
      }
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sl18_guia_repetida`);
      return { A, B, guias, codigo };
    });

    // Las diez órdenes recibieron guía, cinco de cada empresa.
    expect(r.guias).toHaveLength(2 * POR_EMPRESA);
    expect(r.guias.filter((g) => g.organizacion_id === r.A.org)).toHaveLength(POR_EMPRESA);
    expect(r.guias.filter((g) => g.organizacion_id === r.B.org)).toHaveLength(POR_EMPRESA);
    // Ninguna repetida, ni dentro de una empresa ni entre las dos.
    const numeros = r.guias.map((g) => Number(g.num_guia));
    expect(numeros.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    expect(new Set(numeros).size).toBe(numeros.length);
    // Y el único global lo hace cumplir la base, no la suerte del generador.
    expect(r.codigo).toBe("23505");
  });

  it("⭑ R29: `orden_num_guia_key` es único sobre `num_guia` sin `organizacion_id`, y la función usa `orden_num_guia_seq`", async () => {
    const indices = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orden_num_guia_key'`,
    );
    expect(indices).toHaveLength(1);
    expect(indices[0].indexdef).toBe("CREATE UNIQUE INDEX orden_num_guia_key ON public.orden USING btree (num_guia)");
    expect(indices[0].indexdef).not.toContain("organizacion_id");

    const funciones = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'siguiente_num_guia'`,
    );
    expect(funciones).toHaveLength(1);
    expect(funciones[0].def).toContain("orden_num_guia_seq");
    // La permutación no toma la empresa: la guía no depende de quién emite la orden.
    expect(funciones[0].def).not.toMatch(/organizacion/i);

    const secuencias = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT count(*) AS n FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'orden_num_guia_seq'`,
    );
    expect(Number(secuencias[0].n)).toBe(1);
  });
});
