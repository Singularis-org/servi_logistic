import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (T1.1, R80) — QUIÉN RESOLVIÓ EL
 * CIERRE, leído por `findCierreByIdEnAlcance` contra Postgres real.
 *
 * Los tests de servicio usan dobles y no ven el `select` ni el `WHERE`; aquí la única forma de que
 * pase es que Postgres devuelva de verdad el nombre de `cierre_dia.resuelto_por`, y nada fuera del
 * alcance.
 *
 * Se siembra todo dentro de una transacción que SIEMPRE se revierte, en una empresa propia (la crea
 * `enTransaccionRevertida`): no depende de que la base traiga usuarios, zonas ni órdenes, así que
 * corre igual en la base recién migrada del CI. Sin base alcanzable se SALTA (`describe.skip`, visible
 * en la salida), nunca un `return` silencioso que se lea como `passed`.
 *
 * El mensajero y la resolutora tienen nombres DISTINTOS a propósito: una mutación que lea el nombre
 * del `mensajero` en vez del de `resueltoPorUsuario` no puede acertar por casualidad.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt100-${Date.now().toString(36)}`;

interface Ctx {
  repo: CierresAdminRepository;
  alcanceZonaA: Alcance;
  alcanceZonaB: Alcance;
  aprobado: string;
  solicitado: string;
  aprobadoOtraZona: string;
  /** Autocomprobación: lo que quedó sembrado, leído de la base en la misma transacción. */
  sembrados: Array<{ id: string; estado: string; resueltoPor: string | null; destinoZonaId: string | null }>;
  resolutoraId: string;
}

describeSiHayBase("SLT-100/R80 — quién resolvió el cierre, contra Postgres real", () => {
  let prisma: PrismaClient;
  let conCorpus: <T>(fn: (ctx: Ctx) => Promise<T>) => Promise<T>;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    // Catálogos del sistema (`pnpm run db:seed`): sin ellos no se puede sembrar un usuario. Fallo
    // RUIDOSO, no un verde sin comprobar nada.
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    if (rol === null || tipo === null) {
      throw new Error(
        "faltan los catálogos `rol`/`tipo_identificacion`: corre `pnpm run db:seed` antes de esta suite.",
      );
    }

    conCorpus = (fn) =>
      enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);

        const nuevaZona = async (letra: string) =>
          (
            await tx.zona.create({
              data: { nombre: `Zona ${letra} ${SUFIJO}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
              select: { id: true },
            })
          ).id;
        const zonaA = await nuevaZona("A");
        const zonaB = await nuevaZona("B");

        const nuevoUsuario = async (clave: string, nombre: string, primerApellido: string) =>
          (
            await tx.usuario.create({
              data: {
                nombre,
                primerApellido,
                email: `u-${clave}-${SUFIJO}@ejemplo.test`,
                telefono: "88880000",
                passwordHash: "x",
                cedula: `C-${clave}-${SUFIJO}`,
                tipoIdentificacionId: tipo.id,
                rolId: rol.id,
              },
              select: { id: true },
            })
          ).id;
        const mensajero = await nuevoUsuario("mensajero", "Mario", "Mensajero");
        const resolutora = await nuevoUsuario("resolutora", "Carla", "Resolutora");

        const nuevoCierre = async (
          estado: "aprobado" | "solicitado",
          destinoZonaId: string,
          resueltoPor: string | null,
        ) =>
          (
            await tx.cierreDia.create({
              data: {
                mensajeroId: mensajero,
                estado,
                destinoTipo: "bodega_satelite",
                destinoZonaId,
                resueltoPor,
                resueltoAt: resueltoPor === null ? null : new Date("2026-11-07T19:10:00-06:00"),
              },
              select: { id: true },
            })
          ).id;
        const aprobado = await nuevoCierre("aprobado", zonaA, resolutora);
        const solicitado = await nuevoCierre("solicitado", zonaA, null);
        const aprobadoOtraZona = await nuevoCierre("aprobado", zonaB, resolutora);

        const sembrados = await tx.cierreDia.findMany({
          where: { id: { in: [aprobado, solicitado, aprobadoOtraZona] } },
          select: { id: true, estado: true, resueltoPor: true, destinoZonaId: true },
        });

        const repo = new CierresAdminRepository(
          tx as unknown as PrismaClient,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        );
        return fn({
          repo,
          alcanceZonaA: { destinoTipo: "bodega_satelite", destinoZonaId: zonaA },
          alcanceZonaB: { destinoTipo: "bodega_satelite", destinoZonaId: zonaB },
          aprobado,
          solicitado,
          aprobadoOtraZona,
          sembrados,
          resolutoraId: resolutora,
        });
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("autocomprobación: las tres filas sembradas existen con su estado, resolutor y zona", async () => {
    await conCorpus(async (c) => {
      const porId = new Map(c.sembrados.map((s) => [s.id, s]));
      expect(c.sembrados).toHaveLength(3);
      expect(porId.get(c.aprobado)).toMatchObject({
        estado: "aprobado",
        resueltoPor: c.resolutoraId,
        destinoZonaId: c.alcanceZonaA.destinoZonaId,
      });
      expect(porId.get(c.solicitado)).toMatchObject({
        estado: "solicitado",
        resueltoPor: null,
        destinoZonaId: c.alcanceZonaA.destinoZonaId,
      });
      expect(porId.get(c.aprobadoOtraZona)).toMatchObject({
        estado: "aprobado",
        resueltoPor: c.resolutoraId,
        destinoZonaId: c.alcanceZonaB.destinoZonaId,
      });
    });
  });

  it("R80: el detalle del aprobado trae exactamente «Carla Resolutora» (no el mensajero)", async () => {
    const r = await conCorpus((c) => c.repo.findCierreByIdEnAlcance(c.aprobado, c.alcanceZonaA, ZONA_CR));
    expect(r).not.toBeNull();
    expect(r?.resueltoPorNombre).toBe("Carla Resolutora");
    // El señuelo: el mensajero del mismo cierre se llama distinto.
    expect(r?.cierre.mensajeroNombre).toBe("Mario Mensajero");
  });

  it("R80: el `solicitado` sin resolutor trae `null`", async () => {
    const r = await conCorpus((c) => c.repo.findCierreByIdEnAlcance(c.solicitado, c.alcanceZonaA, ZONA_CR));
    expect(r).not.toBeNull();
    expect(r?.cierre.estado).toBe("solicitado");
    expect(r?.resueltoPorNombre).toBeNull();
  });

  it("R80/R13: el aprobado de OTRA zona, con alcance satélite de la zona A, no se encuentra (sin nombre)", async () => {
    const [fuera, dentro] = await conCorpus(async (c) => [
      await c.repo.findCierreByIdEnAlcance(c.aprobadoOtraZona, c.alcanceZonaA, ZONA_CR),
      // Control positivo: el MISMO cierre, con el alcance de SU zona, sí trae el nombre. Así el
      // `null` de arriba solo puede venir del alcance, no de una fila mal sembrada.
      await c.repo.findCierreByIdEnAlcance(c.aprobadoOtraZona, c.alcanceZonaB, ZONA_CR),
    ]);
    expect(fuera).toBeNull();
    expect(dentro?.resueltoPorNombre).toBe("Carla Resolutora");
  });
});
