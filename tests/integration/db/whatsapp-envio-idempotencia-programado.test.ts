import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEnvio, crearPlantilla } from "./_whatsapp-envios-474";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";

// Ficha 474 (T6.2, R23) — COMO MUCHO UN mensaje por (dia CR, destinatario, envio), TAMBIEN con
// ejecuciones CONCURRENTES. La concurrencia de verdad exige dos conexiones y filas COMMITEADAS (una
// transaccion revertida no la ve otra conexion): este archivo siembra commiteando (plantilla y envio
// con nombres unicos, destinatarios = usuarios YA existentes) y lo BORRA en `afterAll`. Las pruebas («Probar ahora») NO consumen el cupo del dia.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("474/R23 — idempotencia de la ejecucion programada", () => {
  let a: PrismaClient;
  let b: PrismaClient;
  // SLT-185 (R1141): los repositorios bajo prueba escriben como en produccion: con la envoltura de
  // `getPrismaClient()` y la empresa que resolveria la sesion (la sembrada). Sin ella, la ejecucion
  // nace con `organizacion_id` NULL y el trigger de misma empresa la rechaza (SL017,
  // `whatsapp_envio_ejecucion.envio_id -> whatsapp_envio`). `a`/`b` (dueno) siembran y limpian.
  let appA: PrismaClient;
  let appB: PrismaClient;
  const sembrado: { envioId?: string; plantillaId?: string; empresaId?: string; usuarios: string[] } = {
    usuarios: [],
  };

  beforeAll(async () => {
    a = crearPrismaDeTest();
    b = crearPrismaDeTest();
    const empresaDeLaSesion = async () => sembrado.empresaId ?? null;
    appA = conAislamientoPorEmpresa(a, empresaDeLaSesion);
    appB = conAislamientoPorEmpresa(b, empresaDeLaSesion);
    // Siembra COMMITEADA (la ven las dos conexiones). SLT-183: los destinatarios son DOS usuarios
    // SEMBRADOS aqui, con su empresa (R1103); antes eran «los dos mas antiguos» de la base, y la
    // recien migrada no tiene ninguno. Son nuevos y con claves propias: ningun otro archivo los
    // elige, asi que borrarlos en el `afterAll` no le revienta una FK a nadie.
    // La empresa se crea DESPUES del lock de la 227: un INSERT de `organizacion` antes de el choca
    // con el DDL de otro archivo (40P01, medido).
    await a.$transaction(async (tx) => {
      await serializarEscriturasReales(tx);
      const empresa = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
      sembrado.empresaId = empresa.id;
      await fijarEmpresa(tx, empresa.id);
      for (let i = 0; i < 2; i++) {
        sembrado.usuarios.push((await crearUsuarioDePrueba(tx as unknown as TxDeTest, "mensajero")).id);
      }
      const p = await crearPlantilla(tx);
      sembrado.plantillaId = p.id;
      sembrado.envioId = await crearEnvio(tx, { plantillaId: p.id, nombre: `474 R23 ${randomUUID()}`, usuarioIds: sembrado.usuarios });
    });
    // Control positivo (R1104): los dos destinatarios sembrados llegaron a la base.
    if ((await a.usuario.count({ where: { id: { in: sembrado.usuarios } } })) !== 2) {
      throw new Error("SLT-183: los dos destinatarios sembrados no estan en la base");
    }
  });

  afterAll(async () => {
    await a.$executeRawUnsafe(`DELETE FROM "whatsapp_envio_ejecucion" WHERE "envio_id" = $1`, sembrado.envioId);
    await a.$executeRawUnsafe(`DELETE FROM "whatsapp_envio" WHERE "id" = $1`, sembrado.envioId);
    await a.$executeRawUnsafe(`DELETE FROM "plantilla_mensaje" WHERE "id" = $1`, sembrado.plantillaId);
    // SLT-183 (R1103): los usuarios y la empresa sembrados commiteados se van; se comprueba contando.
    // Bajo el lock de la 227, como la siembra.
    await bajoLockDeEscrituraReal(async () => {
      await a.usuario.deleteMany({ where: { id: { in: sembrado.usuarios } } });
      if (sembrado.empresaId !== undefined) await a.organizacion.deleteMany({ where: { id: sembrado.empresaId } });
    });
    const quedan =
      (await a.usuario.count({ where: { id: { in: sembrado.usuarios } } })) +
      (sembrado.empresaId === undefined ? 0 : await a.organizacion.count({ where: { id: sembrado.empresaId } }));
    await a.$disconnect();
    await b.$disconnect();
    if (quedan !== 0) throw new Error(`SLT-183: ${quedan} filas sembradas siguen en la base`);
  });

  it("⭑ dos ejecuciones CONCURRENTES del mismo dia -> 1 ejecucion y 1 entrega por usuario", async () => {
    const envioId = sembrado.envioId as string;
    const ra = new WhatsappEjecucionRepository(appA);
    const rb = new WhatsappEjecucionRepository(appB);
    const instante = new Date("2099-03-02T11:00:00.000Z");
    const [x, y] = await Promise.all([
      ra.insertarProgramada({ envioId, fechaCr: "2099-03-02", instanteProgramado: instante }),
      rb.insertarProgramada({ envioId, fechaCr: "2099-03-02", instanteProgramado: instante }),
    ]);
    expect(x.id).toBe(y.id); // LA MISMA fila
    expect([x.creada, y.creada].filter(Boolean)).toHaveLength(1);

    const entregas = sembrado.usuarios.map((usuarioId) => ({
      usuarioId,
      destinatarioNombre: "n",
      telefono: "50688887777",
      estado: "pendiente" as const,
      motivo: null,
    }));
    await Promise.all([ra.insertarEntregas(x.id, entregas), rb.insertarEntregas(y.id, entregas)]);
    const n = await a.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "whatsapp_envio_entrega" WHERE "ejecucion_id" = $1`,
      x.id,
    );
    expect(n[0].n).toBe(2);
    const ejecuciones = await a.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "whatsapp_envio_ejecucion" WHERE "envio_id" = $1 AND "origen" = 'programado' AND "fecha_cr" = '2099-03-02'`,
      envioId,
    );
    expect(ejecuciones[0].n).toBe(1);
    // SLT-185 (R1146): la ejecucion es de la empresa sembrada.
    const deLaEmpresa = await a.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "whatsapp_envio_ejecucion" WHERE "id" = $1 AND "organizacion_id" = $2`,
      x.id,
      sembrado.empresaId,
    );
    expect(deLaEmpresa[0].n, "SLT-185: empresa en contexto").toBe(1);
  });

  it("otro dia CR es otra ejecucion", async () => {
    const r = new WhatsappEjecucionRepository(appA);
    const envioId = sembrado.envioId as string;
    const d1 = await r.insertarProgramada({ envioId, fechaCr: "2099-03-03", instanteProgramado: new Date("2099-03-03T11:00:00Z") });
    const d2 = await r.insertarProgramada({ envioId, fechaCr: "2099-03-04", instanteProgramado: new Date("2099-03-04T11:00:00Z") });
    expect(d1.id).not.toBe(d2.id);
  });

  it("R23: las PRUEBAS no tienen unico ni consumen el cupo del dia", async () => {
    // SLT-185: la tx revertida corre en la empresa del envio sembrado, no en una nueva.
    const r = await enTransaccionRevertida(a, async (tx) => {
      const repo = new WhatsappEjecucionRepository(tx as unknown as PrismaClient);
      const envioId = sembrado.envioId as string;
      const p1 = await repo.insertarPrueba({ envioId, solicitadaPor: sembrado.usuarios[1] });
      const p2 = await repo.insertarPrueba({ envioId, solicitadaPor: sembrado.usuarios[1] });
      const prog = await repo.insertarProgramada({ envioId, fechaCr: "2099-03-09", instanteProgramado: new Date("2099-03-09T11:00:00Z") });
      return { distintas: p1 !== p2, progCreada: prog.creada };
    }, { organizacionId: sembrado.empresaId });
    expect(r).toEqual({ distintas: true, progCreada: true });
  });

  it("R24: una omitida ocupa el dia (no se reenvia esa ocurrencia)", async () => {
    // SLT-185: la tx revertida corre en la empresa del envio sembrado, no en una nueva.
    const r = await enTransaccionRevertida(a, async (tx) => {
      const repo = new WhatsappEjecucionRepository(tx as unknown as PrismaClient);
      const envioId = sembrado.envioId as string;
      const om = await repo.insertarProgramada({
        envioId,
        fechaCr: "2099-03-10",
        instanteProgramado: new Date("2099-03-10T11:00:00Z"),
        estado: "omitida",
        motivo: "tarde",
      });
      const otra = await repo.insertarProgramada({ envioId, fechaCr: "2099-03-10", instanteProgramado: new Date("2099-03-10T11:00:00Z") });
      const fila = await repo.obtener(om.id);
      return { mismo: om.id === otra.id, creada: otra.creada, estado: fila?.estado };
    }, { organizacionId: sembrado.empresaId });
    expect(r).toEqual({ mismo: true, creada: false, estado: "omitida" });
  });
});
