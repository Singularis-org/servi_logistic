import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { fksDeNodo, type FksDeNodo } from "@/lib/services/geo-ubicacion";
import { comoApp, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-45 T4.4 (design §4.3, §10; R20, R24) — `OrdenRepository.findLugarDeOrdenForOwner`.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y la extension de empresa, dentro de
// una transaccion que siempre se revierte. Comprueba el WHERE entero: dueño forzado, orden viva y
// empresa del contexto. La orden de otra empresa no se ve aunque se pida con su id y su dueño reales.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Empresa {
  organizacionId: string;
  tiendaId: string;
  otraTiendaId: string;
  zonaId: string;
}

async function crearTienda(tx: TxDeTest, rolId: string, tipoId: string): Promise<string> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const t = await tx.usuario.create({
    data: {
      nombre: "Tienda Lugar",
      primerApellido: "SLT45",
      email: `slt45-lugar-${sufijo}@example.com`,
      telefono: "80000000",
      passwordHash: "x",
      cedula: `slt45-l-${sufijo}`,
      tipoIdentificacionId: tipoId,
      rolId,
      estado: "activo",
    },
    select: { id: true },
  });
  return t.id;
}

/** Como dueño de la base: la empresa, dos tiendas suyas y una zona. */
async function sembrarEmpresa(tx: TxDeTest): Promise<Empresa> {
  const org = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
  await fijarEmpresa(tx, org.id);
  const rol = await tx.rol.findUniqueOrThrow({ where: { value: "apiKey" }, select: { id: true } });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const zona = await tx.zona.create({
    data: { nombre: "zona_1", esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return {
    organizacionId: org.id,
    tiendaId: await crearTienda(tx, rol.id, tipo.id),
    otraTiendaId: await crearTienda(tx, rol.id, tipo.id),
    zonaId: zona.id,
  };
}

/** Las FK de un nodo del catalogo de la empresa en curso, por profundidad (el primero que admita guardado). */
async function fksDeProfundidad(cli: PrismaClient, profundidad: 2 | 3): Promise<FksDeNodo> {
  const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
  for (const n of catalogo.nodos) {
    if (n.profundidad !== profundidad) continue;
    const fks = fksDeNodo(catalogo, n);
    if (fks !== null) return fks;
  }
  throw new Error(`el catalogo de la empresa no tiene un nodo guardable de profundidad ${profundidad}`);
}

async function crearOrden(cli: PrismaClient, e: Empresa, numRemision: string, fks: FksDeNodo): Promise<string> {
  const estatus = await cli.orderStatus.findUniqueOrThrow({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
  const r = await new OrdenRepository(cli).createManyOrdenesConGuia(
    [
      {
        numRemision,
        estatusId: estatus.id,
        destinatario: "Destinatario SLT-45",
        telefonoDest: "80000001",
        tiendaId: e.tiendaId,
        zonaId: e.zonaId,
        ...fks,
        nodoGeograficoId: fks.distritoId ?? fks.cantonId,
        producto: "Caja",
        peso: null,
        notas: null,
        direccion: null,
        montoCobrar: null,
      },
    ],
    500,
    { actorUsuarioId: e.tiendaId, origenTipo: "carga_api" },
    { cargaId: null, usuarioCargaId: e.tiendaId, totalFiles: 1, name: null },
    { conGuia: true },
  );
  expect(r.creadas).toHaveLength(1);
  return r.creadas[0].ordenId;
}

describeSiHayBase("SLT-45 T4.4 — `findLugarDeOrdenForOwner` (R20, R24)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("dueño, orden viva y empresa del contexto: el lugar; cualquier otro caso, `null`", async () => {
    await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const a = await sembrarEmpresa(tx);
      const b = await sembrarEmpresa(tx);

      await comoApp(tx, a.organizacionId);
      try {
        const cli = clienteConSavepoint(tx);
        const repo = new OrdenRepository(cli);

        const { distrito3, canton2, borrada, fks3, fks2 } = await conEmpresa(a.organizacionId, async () => {
          const fks3 = await fksDeProfundidad(cli, 3);
          const fks2 = await fksDeProfundidad(cli, 2);
          const distrito3 = await crearOrden(cli, a, "SLT45-LUGAR-3", fks3);
          const canton2 = await crearOrden(cli, a, "SLT45-LUGAR-2", fks2);
          const borrada = await crearOrden(cli, a, "SLT45-LUGAR-B", fks3);
          await cli.orden.update({ where: { id: borrada }, data: { deletedAt: new Date() } });
          return { distrito3, canton2, borrada, fks3, fks2 };
        });

        await conEmpresa(a.organizacionId, async () => {
          // Lugar = `COALESCE(distrito_id, canton_id)`.
          expect(await repo.findLugarDeOrdenForOwner(distrito3, a.tiendaId)).toBe(fks3.distritoId);
          expect(await repo.findLugarDeOrdenForOwner(canton2, a.tiendaId)).toBe(fks2.cantonId);
          // Otra tienda de la misma empresa, borrada o inexistente: `null` (404 uniforme).
          expect(await repo.findLugarDeOrdenForOwner(distrito3, a.otraTiendaId)).toBeNull();
          expect(await repo.findLugarDeOrdenForOwner(borrada, a.tiendaId)).toBeNull();
          expect(await repo.findLugarDeOrdenForOwner(randomUUID(), a.tiendaId)).toBeNull();
        });

        // R24: desde la empresa B, la orden de A no se ve aunque se pida con su id y su dueño reales.
        await comoApp(tx, b.organizacionId);
        await conEmpresa(b.organizacionId, async () => {
          expect(await repo.findLugarDeOrdenForOwner(distrito3, a.tiendaId)).toBeNull();
        });
      } finally {
        await tx.$executeRawUnsafe("RESET ROLE");
      }
    });
  });
});
