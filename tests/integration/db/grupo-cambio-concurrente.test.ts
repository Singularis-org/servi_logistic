import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IGrupoDistritosService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";

import { antesDeBorrar, antesDeMiembros } from "./_fixtures/antes-de-grupo";
import { comoLaEmpresa, crearEscenarioSlt89, type EscenarioSlt89 } from "./_fixtures/slt89-zonas";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R43, R44, R45, R46 (T5.2b; design §5.4) — EL CAMBIO CONCURRENTE EN LAS CUATRO ESCRITURAS DE
 * GRUPOS, contra Postgres real (`slt89-zonas.ts`, empresa `XA`, como la app, con el service real):
 *
 *   · por escritura: «antes» igual a la base → escribe lo de hoy (con su historial); distinto →
 *     `conflict`/`cambio_concurrente` sin filas de negocio ni historial;
 *   · borrar con un valor o un miembro añadido entre medias, o con otro nombre → no borra;
 *   · renombrar al nombre que ya tiene → como hoy; grupo inexistente → `not_found`;
 *   · crear con un nombre recien tomado o un miembro recien metido en otro grupo → `validation_error`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const CONFLICTO = { status: "conflict", motivo: "cambio_concurrente" };

interface Contexto {
  tx: TxDeTest;
  e: EscenarioSlt89;
  actor: Actor;
  zonaId: string;
  /** El grupo «Norte A» de la zona norte con el distrito «dos zonas». */
  grupoId: string;
  /** Corre `fn` con el service real como la app. */
  como: <T>(fn: (s: ReturnType<typeof serviciosDeTarifas>) => Promise<T>) => Promise<T>;
}

/** Filas de negocio e historial que un rechazo no puede tocar. */
async function foto(tx: TxDeTest, grupoId: string) {
  return {
    grupo: await tx.grupoDistritos.findUnique({ where: { id: grupoId }, select: { nombre: true } }),
    miembros: await antesDeMiembros(tx, grupoId),
    valores: await tx.tarifaValor.count({ where: { grupoId } }),
    historial: await tx.historialAccion.count({ where: { entidadId: grupoId } }),
  };
}

describeSiHayBase("SLT-89 · R43–R46 — el «antes» y el cambio concurrente en las escrituras de grupos", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conGrupo<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => {
      const e = await crearEscenarioSlt89(tx);
      const actor: Actor = { usuarioId: e.maestroId, rol: "maestro" };
      const zonaId = e.emp.base.zonas.norteId;
      const como = <T,>(f: (s: ReturnType<typeof serviciosDeTarifas>) => Promise<T>) =>
        comoLaEmpresa(tx, e.empresaId, () => f(serviciosDeTarifas(clienteConSavepoint(tx))));
      const creado = await como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId, nombre: "Norte A", distritoIds: [e.emp.base.geo.distritoDosZonasId] }, actor),
      );
      if (creado.status !== "ok") throw new Error(`no se creo el grupo: ${creado.status}`);
      return fn({ tx, e, actor, zonaId, grupoId: creado.id, como });
    });
  }

  it("⭑ R44: renombrar con el «antes» de la base renombra; con otro, `conflict` sin escribir; al nombre actual, como hoy", async () => {
    const r = await conGrupo(async (c) => {
      const conflicto = await c.como((s) => s.grupoDistritos.renombrarGrupo(c.grupoId, "Norte B", "Otro nombre", c.actor));
      const trasConflicto = await foto(c.tx, c.grupoId);
      const ok = await c.como((s) => s.grupoDistritos.renombrarGrupo(c.grupoId, "Norte B", "Norte A", c.actor));
      const trasOk = await foto(c.tx, c.grupoId);
      // El modal mostro «Norte A» pero otro ya lo renombro a «Norte B»: pedir «Norte B» sigue siendo ok.
      const mismo = await c.como((s) => s.grupoDistritos.renombrarGrupo(c.grupoId, "Norte B", "Norte A", c.actor));
      const inexistente = await c.como((s) => s.grupoDistritos.renombrarGrupo("no-existe", "X", "Y", c.actor));
      return { conflicto, trasConflicto, ok, trasOk, mismo, inexistente };
    });
    expect(r.conflicto).toEqual(CONFLICTO);
    expect(r.trasConflicto.grupo?.nombre).toBe("Norte A");
    expect(r.trasConflicto.historial).toBe(1); // solo `grupo_distritos_creado`
    expect(r.ok).toEqual({ status: "ok" });
    expect(r.trasOk.grupo?.nombre).toBe("Norte B");
    expect(r.trasOk.historial).toBe(2);
    expect(r.mismo).toEqual({ status: "ok" });
    expect(r.inexistente).toEqual({ status: "not_found" });
  });

  it("⭑ R43: cambiar miembros con el «antes» de la base escribe; si otro añadio un miembro, `conflict` sin escribir", async () => {
    const r = await conGrupo(async (c) => {
      const { geo } = c.e.emp.base;
      const antesDelModal = await antesDeMiembros(c.tx, c.grupoId);
      // Otro guardado mete el distrito retirado entre medias.
      const otro = await c.como((s) =>
        s.grupoDistritos.fijarDistritos(c.grupoId, [geo.distritoDosZonasId, geo.distritoRetiradoId], antesDelModal, c.actor),
      );
      const antes = await foto(c.tx, c.grupoId);
      const conflicto = await c.como((s) =>
        s.grupoDistritos.fijarDistritos(c.grupoId, [], antesDelModal, c.actor),
      );
      const trasConflicto = await foto(c.tx, c.grupoId);
      const ok = await c.como((s) =>
        s.grupoDistritos.fijarDistritos(c.grupoId, [], { ...antes.miembros }, c.actor),
      );
      return { otro, antes, conflicto, trasConflicto, ok, trasOk: await foto(c.tx, c.grupoId) };
    });
    expect(r.otro).toEqual({ status: "ok" });
    expect(r.conflicto).toEqual(CONFLICTO);
    expect(r.trasConflicto).toEqual(r.antes);
    expect(r.ok).toEqual({ status: "ok" });
    expect(r.trasOk.miembros).toEqual({ distritoIds: [], nodoIds: [] });
    expect(r.trasOk.historial).toBe(r.antes.historial + 1);
  });

  it("⭑ R45: borrar no borra si entre medias cambio un valor, un miembro o el nombre; con el «antes» de la base, si", async () => {
    const r = await conGrupo(async (c) => {
      const { geo } = c.e.emp.base;
      const delModal = await antesDeBorrar(c.tx, c.grupoId);
      // Un valor añadido al grupo entre medias.
      const valor = await c.como((s) =>
        s.tarifaValor.fijarValor(
          { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500", ivaPct: "13", zonaId: c.zonaId, grupoId: c.grupoId, tiendaId: null, vehiculoId: null },
          c.actor,
        ),
      );
      if (valor.status !== "ok") throw new Error(`no se fijo el valor: ${valor.status}`);
      const conValor = await foto(c.tx, c.grupoId);
      const porValor = await c.como((s) => s.grupoDistritos.borrarGrupo(c.grupoId, delModal, c.actor));
      const trasValor = await foto(c.tx, c.grupoId);

      // Un miembro añadido entre medias (con el valor ya contado en el «antes»).
      const conElValor = await antesDeBorrar(c.tx, c.grupoId);
      await c.como((s) =>
        s.grupoDistritos.fijarDistritos(
          c.grupoId,
          [geo.distritoDosZonasId, geo.distritoRetiradoId],
          { distritoIds: conElValor.distritoIds, nodoIds: conElValor.nodoIds },
          c.actor,
        ),
      );
      const porMiembro = await c.como((s) => s.grupoDistritos.borrarGrupo(c.grupoId, conElValor, c.actor));
      const porNombre = await c.como((s) =>
        s.grupoDistritos.borrarGrupo(c.grupoId, { ...conElValor, nombre: "Otro", distritoIds: [geo.distritoDosZonasId, geo.distritoRetiradoId] }, c.actor),
      );
      const trasRechazos = await foto(c.tx, c.grupoId);
      const ok = await c.como(async (s) => s.grupoDistritos.borrarGrupo(c.grupoId, await antesDeBorrar(c.tx, c.grupoId), c.actor));
      const inexistente = await c.como((s) => s.grupoDistritos.borrarGrupo(c.grupoId, conElValor, c.actor));
      return { conValor, porValor, trasValor, porMiembro, porNombre, trasRechazos, ok, inexistente, tras: await foto(c.tx, c.grupoId) };
    });
    expect(r.porValor).toEqual(CONFLICTO);
    expect(r.trasValor).toEqual(r.conValor);
    expect(r.porMiembro).toEqual(CONFLICTO);
    expect(r.porNombre).toEqual(CONFLICTO);
    expect(r.trasRechazos.grupo?.nombre).toBe("Norte A");
    expect(r.trasRechazos.valores).toBe(1);
    expect(r.ok).toEqual({ status: "ok" });
    expect(r.tras.grupo).toBeNull();
    expect(r.tras.valores).toBe(0);
    expect(r.inexistente).toEqual({ status: "not_found" });
  });

  it("R46: crear no lleva «antes»; un nombre recien tomado o un miembro recien metido en otro grupo → `validation_error`", async () => {
    const r = await conGrupo(async (c) => {
      const { geo } = c.e.emp.base;
      const grupos = await c.tx.grupoDistritos.count();
      const nombreTomado = await c.como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId: c.zonaId, nombre: "Norte A", distritoIds: [geo.distritoRetiradoId] }, c.actor),
      );
      const miembroTomado = await c.como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId: c.zonaId, nombre: "Norte C", distritoIds: [geo.distritoDosZonasId] }, c.actor),
      );
      const ok = await c.como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId: c.zonaId, nombre: "Norte D", distritoIds: [geo.distritoRetiradoId] }, c.actor),
      );
      return { grupos, nombreTomado, miembroTomado, ok, despues: await c.tx.grupoDistritos.count() };
    });
    expect(r.nombreTomado.status).toBe("validation_error");
    if (r.nombreTomado.status === "validation_error") expect(Object.keys(r.nombreTomado.fieldErrors)).toEqual(["nombre"]);
    expect(r.miembroTomado.status).toBe("validation_error");
    if (r.miembroTomado.status === "validation_error") expect(Object.keys(r.miembroTomado.fieldErrors)).toEqual(["distritoIds"]);
    expect(r.ok.status).toBe("ok");
    expect(r.despues).toBe(r.grupos + 1);
  });
});
