import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { PaisService } from "@/lib/services/PaisService";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearGeografiaDePrueba, crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { PAIS_CUATRO_NIVELES, sembrarPaisDePruebaGeo } from "@/tests/fixtures/paises-de-prueba-geo";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest } from "./_postgres-real";

// SL-20 (T1.8; enmienda 2026-10-26, decisión 6; design §2.1, §2.6, §3) — `pais.disponible` contra
// Postgres real (migración 20261026120500_pais_disponible).
//   · R44: Costa Rica queda disponible tras migrar, y un país que se inserta sin la columna nace
//     disponible.
//   · R3: una empresa (`servi_app`) no puede cambiar la disponibilidad de ningún país.
//   · R46: con `XA` apagado, su empresa sigue en `XA`, lee su geografía y crea una orden como
//     `servi_app`: nada de la RLS ni de los triggers de la geografía lee la columna.
//   · R47 (base): el enum del historial acepta `pais_disponibilidad_activada`/`_desactivada`.
//
// Cada caso corre en una transacción del dueño que se revierte (`revertida`). Los de R3 y R46 bajan a
// `servi_app` con `comoApp`: con la conexión del dueño ni el REVOKE ni la RLS actúan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SL20', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

describeSiHayBase("SL-20 — pais.disponible", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R44: tras migrar, Costa Rica está disponible y un país insertado sin la columna nace disponible", async () => {
    const r = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular,
        nivel_2_plural, nivel_3_singular, nivel_3_plural) VALUES ('XA', 'País XA', 'a', 'b', 'c', 'd', 'e', 'f')`);
      const filas = await tx.$queryRawUnsafe<{ id: string; disponible: boolean }[]>(
        `SELECT id, disponible FROM pais WHERE id IN ('CR', 'XA') ORDER BY id`,
      );
      return filas.map((f) => `${f.id}=${f.disponible}`);
    });
    expect(r).toEqual(["CR=true", "XA=true"]);
  });

  it("R3: una empresa no puede cambiar la disponibilidad de un país (42501) y el país queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const apaga = await intentar(tx, `UPDATE pais SET disponible = false WHERE id = 'CR'`);
      await comoDueno(tx);
      const cr = await tx.pais.findUnique({ where: { id: "CR" }, select: { disponible: true } });
      return { apaga, disponibleTras: cr?.disponible };
    });
    expect(r).toEqual({ apaga: "42501", disponibleTras: true });
  });

  it("R46: con XA apagado, su empresa sigue en XA, lee su geografía y crea una orden como servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const geo = await crearGeografiaDePrueba(tx, "XA");
      const empresa = await crearOrganizacionEnPais(tx, "XA");
      await fijarEmpresa(tx, empresa.id);
      const fks = await crearFksDeOrden(tx);

      await tx.pais.update({ where: { id: "XA" }, data: { disponible: false } });

      await comoApp(tx, empresa.id);
      const nodos = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (SELECT count(*) FROM provincia WHERE id = $1) + (SELECT count(*) FROM canton WHERE id = $2)
           + (SELECT count(*) FROM distrito WHERE id = $3) AS n`,
        geo.provinciaId,
        geo.cantonId,
        geo.distritoId,
      );
      const paisVisto = await tx.$queryRawUnsafe<{ id: string; disponible: boolean }[]>(
        `SELECT p.id, p.disponible FROM organizacion o JOIN pais p ON p.id = o.pais_id WHERE o.id = $1`,
        empresa.id,
      );
      const ordenId = randomUUID();
      const orden = await intentar(
        tx,
        INSERTAR_ORDEN,
        ordenId,
        `SL20-${ordenId.slice(0, 8)}`,
        fks.estatusId,
        fks.tiendaId,
        fks.zonaId,
        geo.provinciaId,
        geo.cantonId,
        geo.distritoId,
      );
      const ordenVista = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM orden WHERE id = $1`, ordenId);
      await comoDueno(tx);
      return {
        nodos: Number(nodos[0]?.n),
        pais: paisVisto.map((f) => `${f.id}=${f.disponible}`),
        orden,
        ordenVista: ordenVista.length,
      };
    });
    expect(r).toEqual({ nodos: 3, pais: ["XA=false"], orden: null, ordenVista: 1 });
  });

  // SLT-46 (T5.4; R28): «disponible» no mira los niveles. Un país de 4 niveles, con nodos de
  // profundidad 4, se apaga y se enciende por el service con el historial de SL-20 (R47).
  it("SLT-46 R28: un país de 4 niveles (con nodos de profundidad 4) se marca disponible y no disponible por el service, con su historial", async () => {
    const r = await revertida(base, async (tx) => {
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const org = await crearOrganizacion(tx);
      const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
      if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
      const service = new PaisService(new PaisRepository(clienteConSavepoint(tx)));
      const actor = { usuarioId: u.id, rol: "superadmin" as const };
      const profundidad4 = await tx.nodoGeografico.count({ where: { paisId, profundidad: 4 } });
      const apagado = await service.cambiarDisponible({ id: paisId, disponible: false }, actor);
      const trasApagar = await tx.pais.findUniqueOrThrow({ where: { id: paisId }, select: { disponible: true } });
      const encendido = await service.cambiarDisponible({ id: paisId, disponible: true }, actor);
      const trasEncender = await tx.pais.findUniqueOrThrow({ where: { id: paisId }, select: { disponible: true } });
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId },
        orderBy: { createdAt: "asc" },
        select: { accion: true, actorUsuarioId: true },
      });
      return { paisId, profundidad4, apagado, trasApagar, encendido, trasEncender, historial, actorId: u.id };
    });

    // Anti-vacuidad: el país sí tiene nodos por debajo del tercer nivel.
    expect(r.profundidad4).toBeGreaterThan(0);
    expect(r.apagado).toEqual({ status: "ok", id: r.paisId, disponible: false });
    expect(r.trasApagar).toEqual({ disponible: false });
    expect(r.encendido).toEqual({ status: "ok", id: r.paisId, disponible: true });
    expect(r.trasEncender).toEqual({ disponible: true });
    expect(r.historial.map((h) => h.accion).sort()).toEqual(["pais_disponibilidad_activada", "pais_disponibilidad_desactivada"]);
    expect(new Set(r.historial.map((h) => h.actorUsuarioId))).toEqual(new Set([r.actorId]));
  });

  it("R47 (base): el historial de plataforma acepta las dos acciones de disponibilidad de un país", async () => {
    const r = await revertida(base, async (tx) => {
      const insertar = (accion: string) =>
        intentar(
          tx,
          `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
            VALUES ($1, $2::historial_plataforma_accion, 'pais', 'CR', 'Costa Rica', 'CR')`,
          randomUUID(),
          accion,
        );
      return {
        activada: await insertar("pais_disponibilidad_activada"),
        desactivada: await insertar("pais_disponibilidad_desactivada"),
        inventada: await insertar("pais_disponibilidad_inventada"),
      };
    });
    expect(r).toEqual({ activada: null, desactivada: null, inventada: "22P02" });
  });
});
