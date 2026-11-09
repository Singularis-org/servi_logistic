import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cargarPantallaTarifas, guardarTopeIntentos } from "@/lib/actions/tarifas";
import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import { usaModeloNuevo } from "@/lib/repositories/_shared/resolver-tarifas";
import { leerTopeIntentosDeLaEmpresa } from "@/lib/repositories/_shared/tope-intentos-empresa";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { TopeIntentosRepository } from "@/lib/repositories/TopeIntentosRepository";
import { TopeIntentosService } from "@/lib/services/TopeIntentosService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { alcanzaElTope } from "@/lib/types/tope-intentos";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { conCandado459, limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { crearFksDeOrden, crearUsuarioDePrueba, type UsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-77 T2.4 (design §1.1, §2, §4.1) — GUARDAR Y LEER EL TOPE, CONTRA POSTGRES REAL Y CON DOS EMPRESAS.
//
// Dos modos, porque miden cosas distintas:
//  - En una transaccion revertida, como `servi_app` (`comoApp`): la politica, el `GRANT` por columna y lo que
//    guardar toca. Sin bajar de rol la RLS no actua y el aislamiento pasaria aunque no existiera.
//  - Commiteando, por la extension real y la fabrica o la action: lo que pasa en plataforma y sin contexto,
//    que es donde un `organizacion.findFirst()` devolveria la fila de cualquier empresa (design §2.2). En una
//    transaccion revertida del dueño eso no se puede ver, porque no hay extension.
//
// Los valores (3, 2, 5, 7...) van a mano: son el contrato, y leerlos del codigo los dejaria siempre verdes.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function servicioDe(tx: TxDeTest, romperRegistro = false) {
  return new TopeIntentosService(new TopeIntentosRepository(clienteConSavepoint(tx, romperRegistro)));
}

async function topeDe(tx: Pick<TxDeTest, "$queryRawUnsafe">, org: string): Promise<number> {
  const filas = await tx.$queryRawUnsafe<{ tope: number }[]>(
    `SELECT "tope_intentos_entrega" AS "tope" FROM "organizacion" WHERE "id" = $1`,
    org,
  );
  expect(filas).toHaveLength(1);
  return filas[0].tope;
}

async function filaDe(tx: TxDeTest, org: string): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ f: string }[]>(
    `SELECT row_to_json(o)::text AS f FROM "organizacion" o WHERE o."id" = $1`,
    org,
  );
  expect(filas).toHaveLength(1);
  return filas[0].f;
}

async function rastroDe(tx: Pick<TxDeTest, "historialAccion">, org: string) {
  return tx.historialAccion.findMany({
    where: { organizacionId: org, accion: "tope_intentos_cambiado" },
    orderBy: { createdAt: "asc" },
    select: { valorAnterior: true, valorNuevo: true, actorUsuarioId: true },
  });
}

interface Escenario {
  A: string;
  B: string;
  maestroA: UsuarioDePrueba;
  adminA: UsuarioDePrueba;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, A);
  const maestroA = await crearUsuarioDePrueba(tx, "maestro");
  const adminA = await crearUsuarioDePrueba(tx, "admin");
  // Las dos nacen en 3: es el punto de partida de cada caso, y un 3 ya cambiado invalidaria lo que siguen.
  expect(await topeDe(tx, A)).toBe(3);
  expect(await topeDe(tx, B)).toBe(3);
  return { A, B, maestroA, adminA };
}

function conEscenario(fn: (tx: TxDeTest, e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => fn(tx, await sembrar(tx)));
}

const actorDe = (u: UsuarioDePrueba, rol: "maestro" | "admin") => ({ usuarioId: u.id, rol });

type Intento = { ok: true; filas: number } | { ok: false; sqlstate42501: boolean };

/**
 * Corre `sql` como `servi_app` en la empresa `org`, dentro de un savepoint que SIEMPRE se revierte: un `42501`
 * aborta la transaccion, y sin el savepoint se perderia todo el caso. `mirar` corre como dueño antes de revertir.
 */
async function intentarComoApp(
  tx: TxDeTest,
  org: string,
  sql: string,
  params: unknown[] = [],
  mirar?: () => Promise<void>,
): Promise<Intento> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await comoApp(tx, org);
    let resultado: Intento;
    try {
      resultado = { ok: true, filas: await tx.$executeRawUnsafe(sql, ...params) };
    } catch (error) {
      return { ok: false, sqlstate42501: llevaSqlstate(error, "42501") };
    }
    await tx.$executeRawUnsafe("RESET ROLE");
    await mirar?.();
    return resultado;
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
  }
}

describeSiHayBase("SLT-77 R1 — un unico tope por empresa, entero, de 1 a 10", () => {
  it("la columna es entera y no admite vacio", async () => {
    const filas = await base.$queryRawUnsafe<{ data_type: string; is_nullable: string }[]>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizacion' AND column_name = 'tope_intentos_entrega'`,
    );
    expect(filas).toEqual([{ data_type: "integer", is_nullable: "NO" }]);
  });

  it.each([1, 10])("el maestro guarda el extremo %i y queda en una sola fila de su empresa", async (valor) => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: valor }, actorDe(e.maestroA, "maestro")));
      expect(res).toEqual({ status: "ok", tope: valor });
      expect(await topeDe(tx, e.A)).toBe(valor);
    });
  });

  it.each([0, 11, 2.5])("%s no llega a la base: validation_error y el tope sigue en 3", async (valor) => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: valor }, actorDe(e.maestroA, "maestro")));
      expect(res.status).toBe("validation_error");
      expect(await topeDe(tx, e.A)).toBe(3);
      expect(await rastroDe(tx, e.A)).toEqual([]);
    });
  });
});

describeSiHayBase("SLT-77 R3 — la empresa sale de la sesion", () => {
  it("guarda en la empresa del contexto, no en otra", async () => {
    await conEscenario(async (tx, e) => {
      await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 5 }, actorDe(e.maestroA, "maestro")));
      expect(await topeDe(tx, e.A)).toBe(5);
      expect(await topeDe(tx, e.B)).toBe(3);
    });
  });

  it("una entrada que nombra la otra empresa se rechaza, y ninguna cambia", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () =>
        servicioDe(tx).guardar({ tope: 5, organizacionId: e.B }, actorDe(e.maestroA, "maestro")),
      );
      expect(res.status).toBe("validation_error");
      expect(await topeDe(tx, e.A)).toBe(3);
      expect(await topeDe(tx, e.B)).toBe(3);
    });
  });

  it("R4: el admin de la empresa recibe forbidden, y no cambia nada", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 5 }, actorDe(e.adminA, "admin")));
      expect(res).toEqual({ status: "forbidden" });
      expect(await topeDe(tx, e.A)).toBe(3);
      expect(await rastroDe(tx, e.A)).toEqual([]);
    });
  });
});

describeSiHayBase("SLT-77 R7 — la app no escribe otra fila ni otra columna, ni con SQL a mano", () => {
  it("guardar en A no cambia B: su fila entera sigue igual", async () => {
    await conEscenario(async (tx, e) => {
      const antesB = await filaDe(tx, e.B);
      await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 7 }, actorDe(e.maestroA, "maestro")));
      expect(await topeDe(tx, e.A)).toBe(7);
      expect(await filaDe(tx, e.B)).toBe(antesB);
      expect(await rastroDe(tx, e.B)).toEqual([]);
    });
  });

  it("UPDATE de la fila de B, desde A: no afecta filas", async () => {
    await conEscenario(async (tx, e) => {
      const res = await intentarComoApp(
        tx,
        e.A,
        `UPDATE "organizacion" SET "tope_intentos_entrega" = 7 WHERE "id" = $1`,
        [e.B],
        async () => expect(await topeDe(tx, e.B)).toBe(3),
      );
      expect(res).toEqual({ ok: true, filas: 0 });
    });
  });

  // ⚠️ El caso que de verdad mide la politica de UPDATE. Con un `WHERE` que nombra columnas, Postgres suma la
  // politica de SELECT como filtro, y esa ya limita a la fila propia: el caso de arriba sigue en 0 aunque la de
  // UPDATE sea `USING (true)`. Sin `WHERE` y con un literal en el SET no se lee ninguna columna, y aqui solo
  // manda la de UPDATE: con `USING (true)` alcanza a B (42501 por el `WITH CHECK`, o 2 filas si tambien se abre).
  it("UPDATE sin WHERE, desde A: alcanza solo la fila de A", async () => {
    await conEscenario(async (tx, e) => {
      const res = await intentarComoApp(tx, e.A, `UPDATE "organizacion" SET "tope_intentos_entrega" = 7`, [], async () => {
        expect(await topeDe(tx, e.A)).toBe(7);
        expect(await topeDe(tx, e.B)).toBe(3);
      });
      expect(res).toEqual({ ok: true, filas: 1 });
    });
  });

  it("control positivo: la fila propia y el tope si se pueden escribir por SQL a mano", async () => {
    await conEscenario(async (tx, e) => {
      const res = await intentarComoApp(
        tx,
        e.A,
        `UPDATE "organizacion" SET "tope_intentos_entrega" = 7, "updated_at" = now() WHERE "id" = $1`,
        [e.A],
      );
      expect(res).toEqual({ ok: true, filas: 1 });
    });
  });

  it.each([
    ["nombre", `"nombre" = 'Otro nombre'`],
    ["es_demo", `"es_demo" = true`],
    ["plan_id", `"plan_id" = NULL`],
    ["slug", `"slug" = 'otro-slug'`],
    ["cobro_plataforma_por_orden", `"cobro_plataforma_por_orden" = 1`],
  ])("%s de A, desde A: 42501", async (_columna, set) => {
    await conEscenario(async (tx, e) => {
      const res = await intentarComoApp(tx, e.A, `UPDATE "organizacion" SET ${set} WHERE "id" = $1`, [e.A]);
      expect(res).toEqual({ ok: false, sqlstate42501: true });
    });
  });

  it("la app tampoco crea ni borra empresas", async () => {
    await conEscenario(async (tx, e) => {
      expect(await intentarComoApp(tx, e.A, `DELETE FROM "organizacion" WHERE "id" = $1`, [e.A])).toEqual({
        ok: false,
        sqlstate42501: true,
      });
      expect(
        await intentarComoApp(
          tx,
          e.A,
          `INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'Nueva', $2)`,
          [randomUUID(), `nueva-${randomUUID().slice(0, 8)}`],
        ),
      ).toEqual({ ok: false, sqlstate42501: true });
    });
  });

  it("lo que la app puede escribir en la tabla es exactamente esto, con su politica", async () => {
    const privilegios = await base.$queryRawUnsafe<{ columna: string }[]>(
      `SELECT column_name AS columna FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = 'organizacion' AND grantee = 'servi_app'
          AND privilege_type = 'UPDATE'
        ORDER BY 1`,
    );
    expect(privilegios.map((p) => p.columna)).toEqual(["tope_intentos_entrega", "updated_at"]);
  });
});

describeSiHayBase("SLT-77 R8 — guardar no toca orden, gestion, historial de estados, cierre ni billetera", () => {
  const TABLAS = ["orden", "gestion_orden", "orden_historial_estado", "cierre_dia", "cierre_detail", "wallet_movimiento"];

  async function foto(tx: TxDeTest, org: string): Promise<Record<string, unknown[]>> {
    const salida: Record<string, unknown[]> = {};
    for (const t of TABLAS) {
      salida[t] = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT row_to_json(x)::text AS f FROM "${t}" x WHERE x."organizacion_id" = $1 ORDER BY x."id"`,
        org,
      );
    }
    return salida;
  }

  it("una orden con 2 intentos ya agotada por el valor nuevo sigue igual, y no aparece nada", async () => {
    await conEscenario(async (tx, e) => {
      await fijarEmpresa(tx, e.A);
      const fks = await crearFksDeOrden(tx);
      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
      const orden = await tx.orden.create({
        data: {
          numRemision: `R-SLT77-${randomUUID().slice(0, 12)}`,
          destinatario: "Tope SLT-77",
          telefonoDest: "88880000",
          producto: "caja",
          estatusId: fks.estatusId,
          tiendaId: fks.tiendaId,
          zonaId: fks.zonaId,
          provinciaId: fks.provinciaId,
          cantonId: fks.cantonId,
          montoCobrar: new Prisma.Decimal("10000.00"),
        },
        select: { id: true },
      });
      const destino = await tx.orderStatus.findUniqueOrThrow({
        where: { value: "novedad" },
        select: { id: true },
      });
      // Dos intentos vigentes de verdad: cada uno, un cierre aprobado distinto con gestion de visita real.
      const cierres: string[] = [];
      for (let i = 0; i < 2; i++) {
        const cierre = await tx.cierreDia.create({
          data: { mensajeroId: mensajero.id, estado: "aprobado", destinoTipo: "bodega_central", destinoZonaId: fks.zonaId },
          select: { id: true },
        });
        cierres.push(cierre.id);
        const gestion = await tx.gestionOrden.create({
          data: { ordenId: orden.id, mensajeroId: mensajero.id, resultado: "novedad", cierreId: cierre.id },
          select: { id: true },
        });
        await tx.ordenHistorialEstado.create({
          data: { ordenId: orden.id, estatusDestinoId: destino.id, origenTipo: "gestion", gestionOrdenId: gestion.id },
        });
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "cierre_detail" ("id", "cierre_id", "orden_id", "cobra_comision", "zona_id", "tienda_id", "es_central",
           "num_remision", "destinatario", "producto", "tienda_nombre", "zona_nombre", "provincia_nombre", "canton_nombre",
           "tarifa_valor_flete", "tarifa_modelo")
         VALUES ($1, $2, $3, false, $4, $5, false, 'R', 'D', 'P', 'T', 'Z', 'Pr', 'Ca', 2500, 'viejo')`,
        randomUUID(),
        cierres[0],
        orden.id,
        fks.zonaId,
        fks.tiendaId,
      );
      await tx.walletMovimiento.create({
        data: {
          tipo: "ingreso",
          categoria: "ingreso_ajuste",
          monto: new Prisma.Decimal("1000.00"),
          origenTipo: "manual",
          origenId: null,
          descripcion: "SLT-77 semilla",
        },
      });

      // La orden de verdad queda agotada con el valor nuevo: si no, este caso no probaria R8.
      const intentos = await comoEmpresa(tx, e.A, () =>
        new OrdenHistorialRepository(clienteConSavepoint(tx)).contarIntentosVigentes(orden.id),
      );
      expect(intentos).toBe(2);

      const antes = await foto(tx, e.A);
      expect(Object.fromEntries(TABLAS.map((t) => [t, antes[t].length]))).toEqual({
        orden: 1,
        gestion_orden: 2,
        orden_historial_estado: 2,
        cierre_dia: 2,
        cierre_detail: 1,
        wallet_movimiento: 1,
      });

      const res = await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 2 }, actorDe(e.maestroA, "maestro")));
      expect(res).toEqual({ status: "ok", tope: 2 });
      expect(await topeDe(tx, e.A)).toBe(2);

      expect(await foto(tx, e.A)).toEqual(antes);
    });
  });
});

describeSiHayBase("SLT-77 R9 — la siguiente decision usa el valor guardado, sin cache y con o sin activacion", () => {
  async function comprobar(tx: TxDeTest, org: string, maestro: UsuarioDePrueba, activada: boolean) {
    const leer = () => comoEmpresa(tx, org, () => leerTopeIntentosDeLaEmpresa(tx));
    expect(await comoEmpresa(tx, org, () => usaModeloNuevo(tx))).toBe(activada);
    expect(await leer()).toBe(3);
    // La regla real con el valor recien leido: una orden con 1 intento no esta en el tope con 3, y con 2 si.
    expect(alcanzaElTope(1, await leer())).toBe(false);
    await comoEmpresa(tx, org, () => servicioDe(tx).guardar({ tope: 2 }, actorDe(maestro, "maestro")));
    expect(await leer()).toBe(2);
    expect(alcanzaElTope(1, await leer())).toBe(true);
    expect(alcanzaElTope(0, await leer())).toBe(false);
    await comoEmpresa(tx, org, () => servicioDe(tx).guardar({ tope: 1 }, actorDe(maestro, "maestro")));
    expect(await leer()).toBe(1);
    expect(alcanzaElTope(0, await leer())).toBe(true);
    expect(await comoEmpresa(tx, org, () => usaModeloNuevo(tx))).toBe(activada);
  }

  it("sin `tarifa_activacion`", async () => {
    await conEscenario(async (tx, e) => {
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(0);
      await comprobar(tx, e.A, e.maestroA, false);
    });
  });

  it("con `tarifa_activacion`", async () => {
    await conEscenario(async (tx, e) => {
      await sembrarActivacion(tx, e.A);
      expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(1);
      await comprobar(tx, e.A, e.maestroA, true);
    });
  });
});

describeSiHayBase("SLT-77 R10, R41 — el rastro", () => {
  it("deja quien, el anterior y el nuevo, y nada mas", async () => {
    await conEscenario(async (tx, e) => {
      await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 2 }, actorDe(e.maestroA, "maestro")));
      const filas = await tx.historialAccion.findMany({
        where: { organizacionId: e.A, accion: "tope_intentos_cambiado" },
        select: {
          entidadTipo: true,
          entidadId: true,
          entidadEtiqueta: true,
          actorUsuarioId: true,
          actorNombre: true,
          actorRol: true,
          monto: true,
          valorAnterior: true,
          valorNuevo: true,
        },
      });
      expect(filas).toEqual([
        {
          entidadTipo: "organizacion",
          entidadId: e.A,
          entidadEtiqueta: "Intentos de entrega",
          actorUsuarioId: e.maestroA.id,
          actorNombre: `Prueba maestro ${e.maestroA.primerApellido}`,
          actorRol: "maestro",
          monto: null,
          valorAnterior: "3",
          valorNuevo: "2",
        },
      ]);
    });
  });

  it("cada cambio toma como anterior el valor que regia", async () => {
    await conEscenario(async (tx, e) => {
      for (const tope of [2, 5]) {
        await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope }, actorDe(e.maestroA, "maestro")));
      }
      const filas = await rastroDe(tx, e.A);
      expect(filas.map((f) => [f.valorAnterior, f.valorNuevo]).sort()).toEqual([
        ["2", "5"],
        ["3", "2"],
      ]);
    });
  });

  it("si el historial falla, el tope no cambia: misma transaccion", async () => {
    await conEscenario(async (tx, e) => {
      await expect(
        comoEmpresa(tx, e.A, () => servicioDe(tx, true).guardar({ tope: 2 }, actorDe(e.maestroA, "maestro"))),
      ).rejects.toBeInstanceOf(RegistroCaido);
      expect(await topeDe(tx, e.A)).toBe(3);
      expect(await rastroDe(tx, e.A)).toEqual([]);
    });
  });
});

describeSiHayBase("SLT-77 R11 — el mismo valor no escribe", () => {
  it("responde ok, sin historial y sin tocar la fila", async () => {
    await conEscenario(async (tx, e) => {
      const antes = await filaDe(tx, e.A);
      const res = await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 3 }, actorDe(e.maestroA, "maestro")));
      expect(res).toEqual({ status: "ok", tope: 3 });
      expect(await filaDe(tx, e.A)).toBe(antes);
      expect(await rastroDe(tx, e.A)).toEqual([]);
    });
  });

  it("control positivo: un valor distinto si escribe los dos", async () => {
    await conEscenario(async (tx, e) => {
      await comoEmpresa(tx, e.A, () => servicioDe(tx).guardar({ tope: 4 }, actorDe(e.maestroA, "maestro")));
      expect(await topeDe(tx, e.A)).toBe(4);
      expect(await rastroDe(tx, e.A)).toHaveLength(1);
    });
  });
});

// Commitean: la extension, la fabrica y la action reales, como en una peticion.
describeSiHayBase("SLT-77 — por la extension real, con dos empresas commiteadas", () => {
  function clienteDePeticion(): { cliente: PrismaClient; cerrar: () => Promise<void> } {
    const crudo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 }) });
    return {
      cliente: conAislamientoPorEmpresa(crudo as unknown as PrismaClient, async () => null),
      cerrar: () => crudo.$disconnect(),
    };
  }

  /** A en 2 y B en 4, fijados como dueño: dos valores distintos de cualquier defecto. */
  async function conDosEmpresas(cuerpo: (a: Personas459, b: Personas459) => Promise<void>) {
    await conCandado459(base, async () => {
      let a: Personas459 | null = null;
      let b: Personas459 | null = null;
      try {
        a = await sembrarPersonas459(base);
        b = await sembrarPersonas459(base);
        await base.organizacion.update({ where: { id: a.organizacionId }, data: { topeIntentosEntrega: 2 } });
        await base.organizacion.update({ where: { id: b.organizacionId }, data: { topeIntentosEntrega: 4 } });
        await cuerpo(a, b);
      } finally {
        await limpiar459(base, a);
        await limpiar459(base, b);
      }
    });
  }

  async function conClienteDePeticion(cuerpo: (cliente: PrismaClient, a: Personas459, b: Personas459) => Promise<void>) {
    await conDosEmpresas(async (a, b) => {
      const { cliente, cerrar } = clienteDePeticion();
      try {
        await cuerpo(cliente, a, b);
      } finally {
        await cerrar();
      }
    });
  }

  it("R27 — la lectura en cada empresa da su valor", async () => {
    await conClienteDePeticion(async (cliente, a, b) => {
      expect(await conEmpresa(a.organizacionId, () => leerTopeIntentosDeLaEmpresa(cliente))).toBe(2);
      expect(await conEmpresa(b.organizacionId, () => leerTopeIntentosDeLaEmpresa(cliente))).toBe(4);
    });
  }, 120_000);

  // Casos separados: con los dos en uno, un fallo del primero dejaria sin medir la plataforma.
  it("R27 — la lectura sin contexto falla, y no devuelve el valor de ninguna empresa", async () => {
    await conClienteDePeticion(async (cliente) => {
      await expect(leerTopeIntentosDeLaEmpresa(cliente)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    });
  }, 120_000);

  it("R27 — la lectura en plataforma falla, y no devuelve el valor de ninguna empresa", async () => {
    await conClienteDePeticion(async (cliente) => {
      await expect(
        comoPlataforma("SL-17", "SLT-77: el tope no se lee en plataforma", () => leerTopeIntentosDeLaEmpresa(cliente)),
      ).rejects.toBeInstanceOf(EmpresaNoResuelta);
    });
  }, 120_000);

  it("R27 — la pantalla en plataforma falla: no pinta el tope de otra empresa", async () => {
    await conClienteDePeticion(async (cliente, a) => {
      await expect(
        comoPlataforma("SL-17", "SLT-77: la pantalla no lee el tope en plataforma", () =>
          serviciosDeTarifas(cliente).tarifasPantalla.cargarPantalla(a.maestro),
        ),
      ).rejects.toBeInstanceOf(EmpresaNoResuelta);
    });
  }, 120_000);

  async function afirmarSinEfectos(a: Personas459, b: Personas459) {
    expect(await topeDe(base, a.organizacionId)).toBe(2);
    expect(await topeDe(base, b.organizacionId)).toBe(4);
    expect(await rastroDe(base, a.organizacionId)).toEqual([]);
    expect(await rastroDe(base, b.organizacionId)).toEqual([]);
  }

  it("R27 — guardar sin contexto falla sin efectos, en ninguna empresa", async () => {
    await conClienteDePeticion(async (cliente, a, b) => {
      await expect(
        serviciosDeTarifas(cliente).topeIntentos.guardar({ tope: 7 }, a.maestro),
      ).rejects.toBeInstanceOf(EmpresaNoResuelta);
      await afirmarSinEfectos(a, b);
    });
  }, 120_000);

  it("R27 — guardar en plataforma falla sin efectos, en ninguna empresa", async () => {
    await conClienteDePeticion(async (cliente, a, b) => {
      await expect(
        comoPlataforma("SL-17", "SLT-77: el tope no se escribe en plataforma", () =>
          serviciosDeTarifas(cliente).topeIntentos.guardar({ tope: 7 }, a.maestro),
        ),
      ).rejects.toBeInstanceOf(EmpresaNoResuelta);
      await afirmarSinEfectos(a, b);
    });
  }, 120_000);

  it("R27 — la action en plataforma responde `error`, no ok, y no escribe", async () => {
    await conDosEmpresas(async (a, b) => {
      const { cliente, cerrar } = clienteDePeticion();
      try {
        const res = await comoPlataforma("SL-17", "SLT-77: la action no escribe en plataforma", () =>
          guardarTopeIntentos(
            { tope: 7 },
            { getActor: async () => a.maestro, servicio: serviciosDeTarifas(cliente).topeIntentos },
          ),
        );
        expect(res).toEqual({ status: "error" });
        expect(await topeDe(base, a.organizacionId)).toBe(2);
        expect(await topeDe(base, b.organizacionId)).toBe(4);
      } finally {
        await cerrar();
      }
    });
  }, 120_000);

  // El composition root de verdad: sin `servicio` en las deps, la action monta el suyo con `getPrismaClient()`.
  it("R3, R7, R10 — la action, por su fabrica real: escribe en la empresa de la sesion, y B no cambia", async () => {
    await conDosEmpresas(async (a, b) => {
      const res = await conEmpresa(a.organizacionId, () =>
        guardarTopeIntentos({ tope: 6 }, { getActor: async () => a.maestro }),
      );
      expect(res).toEqual({ status: "ok", tope: 6 });
      expect(await topeDe(base, a.organizacionId)).toBe(6);
      expect(await topeDe(base, b.organizacionId)).toBe(4);
      expect(await rastroDe(base, a.organizacionId)).toEqual([
        { valorAnterior: "2", valorNuevo: "6", actorUsuarioId: a.maestro.usuarioId },
      ]);
      expect(await rastroDe(base, b.organizacionId)).toEqual([]);
    });
  }, 120_000);

  it("R12, R13, R14 — la pantalla, por su fabrica real, da a cada empresa su valor y a otro rol nada", async () => {
    await conDosEmpresas(async (a, b) => {
      const pedir = (org: string, actor: Personas459["maestro"]) =>
        conEmpresa(org, () => cargarPantallaTarifas({ getActor: async () => actor }));

      expect(await pedir(a.organizacionId, a.maestro)).toMatchObject({ status: "ok", topeIntentos: 2, puedeEscribir: true });
      expect(await pedir(a.organizacionId, a.admin)).toMatchObject({ status: "ok", topeIntentos: 2, puedeEscribir: false });
      expect(await pedir(b.organizacionId, b.admin)).toMatchObject({ status: "ok", topeIntentos: 4 });
      expect(await pedir(a.organizacionId, a.mensajero)).toEqual({ status: "forbidden" });
    });
  }, 120_000);

  it("R10 — dos guardados a la vez: se serializan, y el «anterior» de cada uno es cierto", async () => {
    await conDosEmpresas(async (a) => {
      const uno = clienteDePeticion();
      const dos = clienteDePeticion();
      try {
        const guardar = (cliente: PrismaClient, tope: number) =>
          serviciosDeTarifas(cliente).topeIntentos.guardar({ tope }, a.maestro);
        const respuestas = await conEmpresa(a.organizacionId, () =>
          Promise.all([guardar(uno.cliente, 5), guardar(dos.cliente, 7)]),
        );
        expect(respuestas.map((r) => r.status)).toEqual(["ok", "ok"]);

        const final = await topeDe(base, a.organizacionId);
        expect([5, 7]).toContain(final);
        const filas = await rastroDe(base, a.organizacionId);
        expect(filas).toHaveLength(2);
        const pares = filas.map((f) => `${f.valorAnterior}>${f.valorNuevo}`).sort();
        // Los dos ordenes posibles. Sin el cerrojo, las dos filas dirian «2>…».
        expect(pares).toEqual(final === 7 ? ["2>5", "5>7"] : ["2>7", "7>5"]);
      } finally {
        await uno.cerrar();
        await dos.cerrar();
      }
    });
  }, 120_000);
});
