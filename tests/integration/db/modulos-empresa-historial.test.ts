import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { ModulosEmpresaRepository } from "@/lib/repositories/ModulosEmpresaRepository";
import { ModulosEmpresaService } from "@/lib/services/ModulosEmpresaService";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { exigirSinSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  tomarLockDeEscrituraReal,
  type TxDeTest,
} from "./_postgres-real";

// SL-23 · T6 (design §5.2; R9, R12, R13) — el superadmin enciende y apaga módulos contra Postgres real,
// por el cliente de la app (con la extensión) y el repositorio real:
//   · R12: cada cambio REAL deja UNA fila en `historial_accion` de ESA empresa, con el superadmin
//     congelado como actor, el módulo como etiqueta y su clave en `valor_nuevo`;
//   · R13: un cambio repetido no escribe ni registra nada;
//   · R12: si el registro falla, el cambio no persiste (savepoint real + `createMany` del historial roto).
//
// LOCKS. Este archivo COMMITEA un superadmin y filas de historial con valores de SL-23 que viven hasta
// el `afterAll`. El de superadmin (SL-32) ordena el único hueco del índice; el de la 227 se sostiene
// toda la vida del archivo, como los que dejan filas en `notificacion`: un `down.sql` que recrea el
// enum del historial mientras estas filas existen moriría con 22P02. Orden: superadmin, luego 227.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let app: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};
let soltarEscritura: () => Promise<void> = async () => {};
let empresa: string;
let otra: string;
let superadmin: string;

interface FilaHistorial {
  accion: string;
  entidadTipo: string;
  entidadId: string;
  entidadEtiqueta: string;
  valorNuevo: string | null;
  organizacionId: string;
  actorUsuarioId: string | null;
  actorRol: string | null;
  actorNombre: string | null;
}

async function historialDe(organizacionId: string): Promise<FilaHistorial[]> {
  return base.historialAccion.findMany({
    where: { organizacionId, entidadTipo: "organizacion_modulo" },
    orderBy: { createdAt: "asc" },
    select: {
      accion: true,
      entidadTipo: true,
      entidadId: true,
      entidadEtiqueta: true,
      valorNuevo: true,
      organizacionId: true,
      actorUsuarioId: true,
      actorRol: true,
      actorNombre: true,
    },
  });
}

async function modulosDe(organizacionId: string, c: Pick<PrismaClient, "organizacionModulo"> | TxDeTest = base) {
  return (await c.organizacionModulo.findMany({ where: { organizacionId }, select: { id: true, modulo: true } })).map(
    (f) => `${f.modulo}`,
  );
}

class Revertir extends Error {}

/** Transacción del dueño que siempre se revierte. Sin el lock de la 227: este archivo ya lo sostiene. */
async function revertida(fn: (tx: TxDeTest) => Promise<void>): Promise<void> {
  try {
    await base.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Revertir();
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
  }
}

describeSiHayBase("SL-23 — el superadmin cambia módulos con su rastro en historial_accion (R9, R12, R13)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    soltarSuperadmin = await tomarLockDeSuperadmin();
    soltarEscritura = await tomarLockDeEscrituraReal();
    await exigirSinSuperadmin(base);
    const s = await base.$transaction(
      async (tx) => {
        const e = (await crearOrganizacion(tx, { nombre: "Empresa SL-23 módulos" })).id;
        const o = (await crearOrganizacion(tx, { nombre: "Empresa SL-23 vecina" })).id;
        // '' vuelve NULL el DEFAULT de `usuario.organizacion_id`: el superadmin no tiene empresa.
        await fijarEmpresa(tx, "");
        const sa = await crearUsuarioDePrueba(tx, "superadmin");
        return { e, o, sa: sa.id };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
    empresa = s.e;
    otra = s.o;
    superadmin = s.sa;
    // Siembra comprobada: las dos nacen sin módulos y sin historial.
    expect(await modulosDe(empresa)).toEqual([]);
    expect(await historialDe(empresa)).toEqual([]);
  }, 60_000);

  afterAll(async () => {
    try {
      if (base && empresa) {
        await base.historialAccion.deleteMany({ where: { organizacionId: { in: [empresa, otra] } } });
        await base.organizacion.deleteMany({ where: { id: { in: [empresa, otra] } } });
        if (superadmin) await base.usuario.deleteMany({ where: { id: superadmin } });
      }
    } finally {
      await soltarEscritura();
      await soltarSuperadmin();
      await base?.$disconnect();
    }
  }, 120_000);

  it("R12 — encender deja la fila y UNA acción en el historial de esa empresa, con el superadmin como actor", async () => {
    const repo = new ModulosEmpresaRepository(app);
    expect(await repo.encender(empresa, "ranking", superadmin)).toBe(true);

    const filas = await base.organizacionModulo.findMany({ where: { organizacionId: empresa } });
    expect(filas.map((f) => f.modulo)).toEqual(["ranking"]);
    expect(await historialDe(empresa)).toEqual([
      {
        accion: "modulo_activado",
        entidadTipo: "organizacion_modulo",
        entidadId: filas[0].id,
        entidadEtiqueta: "Ranking",
        valorNuevo: "ranking",
        organizacionId: empresa,
        actorUsuarioId: superadmin,
        actorRol: "superadmin",
        actorNombre: expect.stringContaining("Prueba superadmin"),
      },
    ]);
    // R25: la vecina no se entera.
    expect(await modulosDe(otra)).toEqual([]);
    expect(await historialDe(otra)).toEqual([]);
  });

  it("R13 — encender lo encendido no escribe ni registra nada", async () => {
    const repo = new ModulosEmpresaRepository(app);
    expect(await repo.encender(empresa, "ranking", superadmin)).toBe(false);
    expect(await modulosDe(empresa)).toEqual(["ranking"]);
    expect(await historialDe(empresa)).toHaveLength(1);
  });

  it("R12 — apagar borra la fila y registra modulo_desactivado con el id de la fila borrada", async () => {
    const repo = new ModulosEmpresaRepository(app);
    const [{ id }] = await base.organizacionModulo.findMany({ where: { organizacionId: empresa, modulo: "ranking" } });
    expect(await repo.apagar(empresa, "ranking", superadmin)).toBe(true);
    expect(await modulosDe(empresa)).toEqual([]);
    const historial = await historialDe(empresa);
    expect(historial).toHaveLength(2);
    expect(historial[1]).toMatchObject({
      accion: "modulo_desactivado",
      entidadId: id,
      entidadEtiqueta: "Ranking",
      valorNuevo: "ranking",
      organizacionId: empresa,
      actorUsuarioId: superadmin,
      actorRol: "superadmin",
    });
  });

  it("R13 — apagar lo apagado no escribe ni registra nada", async () => {
    const repo = new ModulosEmpresaRepository(app);
    expect(await repo.apagar(empresa, "ranking", superadmin)).toBe(false);
    expect(await historialDe(empresa)).toHaveLength(2);
  });

  it("R9 — por el servicio, el cambio se ve en la lectura siguiente", async () => {
    const servicio = new ModulosEmpresaService(new ModulosEmpresaRepository(app));
    const actor = { usuarioId: superadmin, rol: "superadmin" as const, organizacionId: null };
    expect(await servicio.fijar(actor, { organizacionId: empresa, modulo: "monitoreo", activo: true })).toEqual({
      estado: "ok",
      cambio: true,
    });
    const r = await servicio.ver(actor, { organizacionId: empresa });
    if (r.estado !== "ok") throw new Error(`se esperaba ok: ${r.estado}`);
    expect(r.empresa.modulos.filter((m) => m.activo).map((m) => m.clave)).toEqual(["monitoreo"]);
    expect(await historialDe(empresa)).toHaveLength(3);
  });

  it("R12 — si el registro falla al encender, el módulo no queda encendido", async () => {
    await revertida(async (tx) => {
      const roto = new ModulosEmpresaRepository(clienteConSavepoint(tx, true));
      await expect(roto.encender(empresa, "analitica", superadmin)).rejects.toBeInstanceOf(RegistroCaido);
      expect(await modulosDe(empresa, tx)).toEqual(["monitoreo"]);
      // Control: con el registro sano, la misma llamada sí enciende (el rojo no era otra cosa).
      const sano = new ModulosEmpresaRepository(clienteConSavepoint(tx, false));
      expect(await sano.encender(empresa, "analitica", superadmin)).toBe(true);
      expect((await modulosDe(empresa, tx)).sort()).toEqual(["analitica", "monitoreo"]);
    });
  });

  it("R12 — si el registro falla al apagar, el módulo sigue encendido", async () => {
    await revertida(async (tx) => {
      const roto = new ModulosEmpresaRepository(clienteConSavepoint(tx, true));
      await expect(roto.apagar(empresa, "monitoreo", superadmin)).rejects.toBeInstanceOf(RegistroCaido);
      expect(await modulosDe(empresa, tx)).toEqual(["monitoreo"]);
    });
    expect(await historialDe(empresa)).toHaveLength(3);
  });
});
