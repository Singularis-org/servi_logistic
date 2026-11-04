import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { AprobacionPostulacionRepository } from "@/lib/repositories/AprobacionPostulacionRepository";
import { PostulacionRepository } from "@/lib/repositories/PostulacionRepository";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { idDeRol } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-42 (T4.2; R10, R11, R13, R14) — las dos lecturas nuevas de la postulación de mensajero, contra
// Postgres real y como `servi_app` con la empresa puesta, que es como corre la app:
//   - `PostulacionRepository.cedulaExiste(cedula, tipo)`: el duplicado es por empresa Y tipo, como
//     el índice `usuario_cedula_key` (R13);
//   - `AprobacionPostulacionRepository.personaPendiente(id)`: lo que se valida al aprobar, solo de
//     una postulación pendiente de la empresa en curso.
// Dos empresas (A y B) y todo en una transacción del dueño que se revierte (`revertida`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Mundo {
  A: string;
  B: string;
  cedula: string;
  ruc: string;
  pendiente: string;
  activo: string;
}

const DOCUMENTO = "112223333";

async function idDeTipo(tx: TxDeTest, value: string): Promise<string> {
  return (await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;
}

async function sembrar(tx: TxDeTest): Promise<Mundo> {
  const A = (await crearOrganizacion(tx, { nombre: `Postulación A ${randomUUID().slice(0, 6)}` })).id;
  const B = (await crearOrganizacion(tx, { nombre: `Postulación B ${randomUUID().slice(0, 6)}` })).id;
  const cedula = await idDeTipo(tx, "cedula");
  const ruc = await idDeTipo(tx, "ruc");
  const rolId = await idDeRol(tx, "mensajero");
  const mensajero = async (estado: "pendiente" | "activo", documento: string) =>
    (
      await tx.usuario.create({
        data: {
          nombre: "Ana",
          email: `slt42-${randomUUID().slice(0, 8)}@example.test`,
          telefono: "88887777",
          passwordHash: "x",
          cedula: documento,
          tipoIdentificacionId: cedula,
          rolId,
          estado,
          organizacionId: A,
        },
        select: { id: true },
      })
    ).id;
  const pendiente = await mensajero("pendiente", DOCUMENTO);
  const activo = await mensajero("activo", "998887777");
  return { A, B, cedula, ruc, pendiente, activo };
}

describeSiHayBase("SLT-42 — postulación: documento por empresa y tipo, y la persona que se valida al aprobar", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R13: cedulaExiste choca solo con el mismo documento, el mismo tipo y la misma empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrar(tx);
      const repo = new PostulacionRepository(tx as unknown as PrismaClient);

      await comoApp(tx, m.A);
      const enA = {
        mismoTipo: await repo.cedulaExiste(DOCUMENTO, m.cedula),
        otroTipo: await repo.cedulaExiste(DOCUMENTO, m.ruc),
        otroDocumento: await repo.cedulaExiste("123456789", m.cedula),
      };
      await comoDueno(tx);

      await comoApp(tx, m.B);
      const enB = await repo.cedulaExiste(DOCUMENTO, m.cedula);
      await comoDueno(tx);
      return { enA, enB };
    });

    expect(r.enA).toEqual({ mismoTipo: true, otroTipo: false, otroDocumento: false });
    expect(r.enB).toBe(false);
  });

  it("R10, R11, R14: personaPendiente da teléfono, documento y tipo de una postulación pendiente de la empresa en curso, y nada más", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrar(tx);
      const repo = new AprobacionPostulacionRepository(tx as unknown as PrismaClient);

      await comoApp(tx, m.A);
      const pendiente = await repo.personaPendiente(m.pendiente);
      const activo = await repo.personaPendiente(m.activo);
      const noExiste = await repo.personaPendiente(randomUUID());
      await comoDueno(tx);

      await comoApp(tx, m.B);
      const deOtraEmpresa = await repo.personaPendiente(m.pendiente);
      await comoDueno(tx);
      return { m, pendiente, activo, noExiste, deOtraEmpresa };
    });

    expect(r.pendiente).toEqual({ telefono: "88887777", cedula: DOCUMENTO, tipoIdentificacionId: r.m.cedula });
    expect(r.activo).toBeNull();
    expect(r.noExiste).toBeNull();
    expect(r.deOtraEmpresa).toBeNull();
  });
});
