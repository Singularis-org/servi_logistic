import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import {
  UsuarioDuplicadoError,
  type CreateUsuarioInput,
  type UpdateUsuarioData,
} from "@/lib/interfaces/repositories/IUserRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol } from "./_fixtures/superadmin-32";

// SLT-221 (T1.4; R1601, R1603-R1605, R1608) — `UserRepository.update` corrige la cedula de un usuario,
// contra Postgres real: el UPDATE, el indice unico `(organizacion_id, tipo_identificacion_id, cedula)`,
// la fila `usuario_cedula_cambiada` del Historico en la misma transaccion y la anchura nueva de
// `valor_anterior`/`valor_nuevo` (254). Todo en una transaccion que siempre se revierte; el
// `$transaction` del repositorio es un SAVEPOINT real (`clienteConSavepoint`), asi que un fallo deshace
// lo que el repositorio llego a escribir, como en produccion.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

interface Catalogos {
  rolMaestro: string;
  rolAdmin: string;
  tipoCedula: string;
}

async function catalogos(tx: TxDeTest): Promise<Catalogos> {
  const tipo = await tx.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" }, select: { id: true } });
  return { rolMaestro: await idDeRol(tx, "maestro"), rolAdmin: await idDeRol(tx, "admin"), tipoCedula: tipo.id };
}

function datos(c: Catalogos, tag: string, extra: Partial<CreateUsuarioInput> = {}): CreateUsuarioInput {
  return {
    nombre: `Persona ${tag} ${RUN}`,
    email: `slt221-${tag}-${RUN}@ejemplo.test`,
    telefono: "88887777",
    cedula: `221${tag}${RUN}`,
    tipoIdentificacionId: c.tipoCedula,
    rolId: c.rolAdmin,
    passwordHash: "no-utilizable",
    estado: "activo",
    ...extra,
  };
}

async function crearEn(tx: TxDeTest, org: string, d: CreateUsuarioInput): Promise<string> {
  await fijarEmpresa(tx, org);
  const repo = new UserRepository(clienteConSavepoint(tx));
  return conEmpresa(org, async () => (await repo.create(d, null)).id);
}

/** `UserRepository.update` real, en la empresa `org`. Devuelve el error con que falla, o `null`. */
async function editarEn(
  tx: TxDeTest,
  org: string,
  id: string,
  data: UpdateUsuarioData,
  actor: string,
): Promise<unknown> {
  await fijarEmpresa(tx, org);
  const repo = new UserRepository(clienteConSavepoint(tx));
  return conEmpresa(org, () => repo.update(id, data, actor)).then(
    () => null,
    (e: unknown) => e,
  );
}

async function filasDeCedula(tx: TxDeTest, usuarioId: string) {
  return tx.historialAccion.findMany({
    where: { entidadId: usuarioId, accion: "usuario_cedula_cambiada" },
    select: {
      entidadTipo: true,
      valorAnterior: true,
      valorNuevo: true,
      actorUsuarioId: true,
      loteId: true,
      organizacionId: true,
    },
  });
}

async function cedulaDe(tx: TxDeTest, id: string): Promise<string> {
  return (await tx.usuario.findUniqueOrThrow({ where: { id }, select: { cedula: true } })).cedula;
}

describeSiHayBase("SLT-221 — la cedula corregida por el maestro (tabla real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Una transaccion revertida, serializada, con dos empresas nuevas, un maestro en A y los catalogos. */
  function conDosEmpresas<T>(
    fn: (tx: TxDeTest, ctx: { a: string; b: string; c: Catalogos; maestro: string }) => Promise<T>,
  ): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const a = (await crearOrganizacion(tx, { nombre: `A ${RUN}` })).id;
      const b = (await crearOrganizacion(tx, { nombre: `B ${RUN}` })).id;
      const c = await catalogos(tx);
      const maestro = await crearEn(tx, a, datos(c, "m", { rolId: c.rolMaestro }));
      return fn(tx, { a, b, c, maestro });
    });
  }

  it("R1601 + R1604: el UPDATE cambia la cedula y deja UNA fila con la anterior, la nueva, el usuario y el maestro", async () => {
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const d = datos(c, "u1");
      const id = await crearEn(tx, a, d);
      const error = await editarEn(tx, a, id, { cedula: `nueva${RUN}` }, maestro);
      return { error, id, maestro, a, anterior: d.cedula, cedula: await cedulaDe(tx, id), filas: await filasDeCedula(tx, id) };
    });

    expect(r.error).toBeNull();
    expect(r.cedula).toBe(`nueva${RUN}`);
    expect(r.filas).toEqual([
      {
        entidadTipo: "usuario",
        valorAnterior: r.anterior,
        valorNuevo: `nueva${RUN}`,
        actorUsuarioId: r.maestro,
        loteId: expect.any(String),
        organizacionId: r.a,
      },
    ]);
  });

  it("R1604: cambiar rol y cedula en la misma edicion deja las dos filas con el MISMO lote", async () => {
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const id = await crearEn(tx, a, datos(c, "lote"));
      await editarEn(tx, a, id, { cedula: `lote${RUN}`, rolId: c.rolMaestro }, maestro);
      return tx.historialAccion.findMany({
        where: { entidadId: id, accion: { in: ["usuario_cedula_cambiada", "usuario_rol_cambiado"] } },
        select: { accion: true, loteId: true },
      });
    });

    expect(r.map((f) => f.accion).sort()).toEqual(["usuario_cedula_cambiada", "usuario_rol_cambiado"]);
    expect(new Set(r.map((f) => f.loteId)).size).toBe(1);
  });

  it("R1605: reenviar el mismo documento junto a otro cambio no escribe fila de cedula", async () => {
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const d = datos(c, "igual");
      const id = await crearEn(tx, a, d);
      const error = await editarEn(tx, a, id, { cedula: d.cedula, nombre: `Renombrada ${RUN}` }, maestro);
      const nombre = (await tx.usuario.findUniqueOrThrow({ where: { id }, select: { nombre: true } })).nombre;
      return { error, nombre, filas: await filasDeCedula(tx, id) };
    });

    expect(r.error).toBeNull();
    // Control positivo: la edicion SI se aplico; lo que falta es solo la fila.
    expect(r.nombre).toBe(`Renombrada ${RUN}`);
    expect(r.filas).toEqual([]);
  });

  it("R1603: el documento de otro usuario de la MISMA empresa da UsuarioDuplicadoError('cedula') y no cambia nada", async () => {
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const otro = datos(c, "otro");
      await crearEn(tx, a, otro);
      const d = datos(c, "dup");
      const id = await crearEn(tx, a, d);
      const error = await editarEn(tx, a, id, { cedula: otro.cedula, nombre: `No ${RUN}` }, maestro);
      const fila = await tx.usuario.findUniqueOrThrow({ where: { id }, select: { cedula: true, nombre: true } });
      return { error, fila, d, filas: await filasDeCedula(tx, id) };
    });

    expect(r.error).toEqual(new UsuarioDuplicadoError("cedula"));
    expect((r.error as UsuarioDuplicadoError).campo).toBe("cedula");
    expect(r.fila).toEqual({ cedula: r.d.cedula, nombre: r.d.nombre });
    expect(r.filas).toEqual([]);
  });

  it("R1603: el mismo documento en OTRA empresa no choca", async () => {
    const r = await conDosEmpresas(async (tx, { a, b, c, maestro }) => {
      const deB = datos(c, "enb");
      await crearEn(tx, b, deB);
      const id = await crearEn(tx, a, datos(c, "ena"));
      const error = await editarEn(tx, a, id, { cedula: deB.cedula }, maestro);
      return { error, deB, cedula: await cedulaDe(tx, id) };
    });

    expect(r.error).toBeNull();
    expect(r.cedula).toBe(r.deB.cedula);
  });

  it("R1608: un valor de 254 caracteres cabe entero en `valor_anterior`/`valor_nuevo`, sin recortar", async () => {
    const largo = `${RUN}${"9".repeat(254 - RUN.length)}`;
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const id = await crearEn(tx, a, datos(c, "ancho"));
      const error = await editarEn(tx, a, id, { cedula: largo }, maestro);
      await editarEn(tx, a, id, { cedula: `corta${RUN}` }, maestro);
      return { error, filas: await filasDeCedula(tx, id) };
    });

    expect(largo).toHaveLength(254);
    expect(r.error).toBeNull();
    expect(r.filas.map((f) => f.valorNuevo)).toContain(largo);
    expect(r.filas.map((f) => f.valorAnterior)).toContain(largo);
  });

  it("R1608: 255 caracteres abortan la transaccion entera: ni la cedula ni la fila", async () => {
    const r = await conDosEmpresas(async (tx, { a, c, maestro }) => {
      const d = datos(c, "pasa");
      const id = await crearEn(tx, a, d);
      const error = await editarEn(tx, a, id, { cedula: "9".repeat(255) }, maestro);
      return { error, d, cedula: await cedulaDe(tx, id), filas: await filasDeCedula(tx, id) };
    });

    // Postgres no trunca: la sentencia falla. No se fija el SQLSTATE (puede variar entre versiones).
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error).not.toBeInstanceOf(UsuarioDuplicadoError);
    expect(r.cedula).toBe(r.d.cedula);
    expect(r.filas).toEqual([]);
  });
});
