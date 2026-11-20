import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba, crearTipoDocumentoDePrueba } from "@/tests/fabricas/paises";
import { esP2002, textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { comoDueno, errorEnSavepoint, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-42 (T1.5; R2, R4, R5, R11, R13, R31) — el catálogo de tipos de documento por país, contra
// Postgres real, con dos empresas en dos países: A en Costa Rica y B en el país de prueba `XA`.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte (`revertida`); `comoApp` fija la
// empresa y pasa a `servi_app`, el rol con el que corre la app, para que la RLS actúe.
//
// Lo que se mide aquí es la RED de la base: qué ve y qué puede escribir cada empresa, y qué rechaza
// el SQL. El filtro de `activo` y del país en el repositorio y la traducción a `validation_error` /
// `conflict` son de los servicios (design §4.2) y se prueban en su bloque.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Mundo {
  A: string;
  B: string;
  /** Tipos de XA, en el orden del catálogo. */
  xa: { activo1: string; activo2: string; inactivo: string };
}

async function sembrarMundo(tx: TxDeTest): Promise<Mundo> {
  await crearPaisDePrueba(tx, "XA", { prefijoTelefonico: "999", telefonoDigitosNacionales: 7, zonaHoraria: "Europe/Madrid" });
  // Se crean en desorden para que el orden lo dé el catálogo y no la inserción.
  const activo2 = await crearTipoDocumentoDePrueba(tx, "XA", { clave: "carne", orden: 2, caracteres: "alfanumerico", largoMin: 5, largoMax: 9 });
  const inactivo = await crearTipoDocumentoDePrueba(tx, "XA", { clave: "viejo", orden: 3, activo: false });
  const activo1 = await crearTipoDocumentoDePrueba(tx, "XA", { clave: "nacional", orden: 1 });
  const A = (await crearOrganizacion(tx, { nombre: `Empresa CR ${randomUUID().slice(0, 6)}` })).id;
  const B = (await crearOrganizacionEnPais(tx, "XA", { nombre: `Empresa XA ${randomUUID().slice(0, 6)}` })).id;
  return { A, B, xa: { activo1: activo1.id, activo2: activo2.id, inactivo: inactivo.id } };
}

async function clavesVisibles(tx: TxDeTest, sql = `SELECT "pais_id", "clave" FROM "tipo_identificacion" ORDER BY "orden"`): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ pais_id: string; clave: string }[]>(sql);
  return filas.map((f) => `${f.pais_id}/${f.clave}`);
}

async function idDeTipoCR(tx: TxDeTest, clave: string): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "tipo_identificacion" WHERE "pais_id" = 'CR' AND "clave" = $1`,
    clave,
  );
  if (!f) throw new Error(`falta el tipo CR/${clave}: aplica las migraciones`);
  return f.id;
}

/** INSERT de un usuario por SQL, como el dueño. El SQLSTATE y la constraint del rechazo, o `null`. */
async function insertarUsuario(
  tx: TxDeTest,
  o: { organizacionId: string; tipoId: string; cedula: string },
): Promise<string | null> {
  const id = randomUUID();
  return intentar(
    tx,
    `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
     VALUES ($1, 'Persona SLT42', $2, '88880000', 'x', $3, $4, (SELECT "id" FROM "rol" WHERE "value" = 'mensajero'), $5, now())`,
    id,
    `slt42-${id.slice(0, 8)}@example.test`,
    o.cedula,
    o.tipoId,
    o.organizacionId,
  );
}

describeSiHayBase("SLT-42 — tipos de documento por país (dos empresas: CR y XA)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: la regla del tipo se valida en la base (caracteres, largos) y la clave es única dentro del país, no entre países", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const insertar = (clave: string, caracteres: string, min: number, max: number, pais = "XA") =>
        intentar(
          tx,
          `INSERT INTO "tipo_identificacion" ("id","value","pais_id","clave","nombre","caracteres","largo_min","largo_max","orden")
           VALUES ($1, $2, $3, $4, 'Prueba', $5, $6, $7, 1)`,
          randomUUID(),
          `${pais}_${clave}_${randomUUID().slice(0, 6)}`,
          pais,
          clave,
          caracteres,
          min,
          max,
        );
      return {
        caracteresRaros: await insertar("raro", "emoji", 5, 9),
        minMayorQueMax: await insertar("al_reves", "digitos", 9, 5),
        minCero: await insertar("cero", "digitos", 0, 5),
        maxDemasiado: await insertar("largo", "digitos", 5, 31),
        // CR ya tiene `pasaporte`: en XA la misma clave es otro tipo y entra.
        valido: await insertar("pasaporte", "alfanumerico", 6, 20),
        mismaClaveMismoPais: await insertar("pasaporte", "alfanumerico", 6, 20),
        // `pais_id` es FK: un tipo no puede colgar de un país que no existe.
        sinPaisExistente: await insertar("nacional", "digitos", 8, 8, "XZ"),
      };
    });
    expect(r).toEqual({
      caracteresRaros: "23514",
      minMayorQueMax: "23514",
      minCero: "23514",
      maxDemasiado: "23514",
      valido: null,
      mismaClaveMismoPais: "23505",
      sinPaisExistente: "23503",
    });
  });

  it("R4, R5, R11, R31: cada empresa ve solo los tipos de su país, en el orden del catálogo; el de otro país no existe para ella", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const todosComoDueno = await clavesVisibles(tx);
      const porId = async (id: string) =>
        (await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "tipo_identificacion" WHERE "id" = $1`, id)).length;

      const cedulaCR = await idDeTipoCR(tx, "cedula_fisica");

      await comoApp(tx, m.A);
      const deA = await clavesVisibles(tx);
      const activosDeA = await clavesVisibles(tx, `SELECT "pais_id", "clave" FROM "tipo_identificacion" WHERE "activo" ORDER BY "orden"`);
      const tipoDeXaDesdeA = await porId(m.xa.activo1);
      await comoDueno(tx);

      await comoApp(tx, m.B);
      const deB = await clavesVisibles(tx);
      const activosDeB = await clavesVisibles(tx, `SELECT "pais_id", "clave" FROM "tipo_identificacion" WHERE "activo" ORDER BY "orden"`);
      const tipoDeCrDesdeB = await porId(cedulaCR);
      await comoDueno(tx);

      return { todosComoDueno, deA, activosDeA, tipoDeXaDesdeA, deB, activosDeB, tipoDeCrDesdeB };
    });

    // El dueño (plataforma) ve los de los dos países (R4).
    expect(r.todosComoDueno).toEqual(expect.arrayContaining(["CR/cedula_fisica", "XA/nacional", "XA/viejo"]));
    expect(r.deA).toEqual(["CR/cedula_fisica", "CR/cedula_juridica", "CR/dimex", "CR/nite", "CR/pasaporte"]);
    expect(r.activosDeA).toEqual(r.deA);
    expect(r.tipoDeXaDesdeA).toBe(0);
    expect(r.deB).toEqual(["XA/nacional", "XA/carne", "XA/viejo"]);
    expect(r.activosDeB).toEqual(["XA/nacional", "XA/carne"]);
    expect(r.tipoDeCrDesdeB).toBe(0);
  });

  it("R4: sin empresa en el contexto, servi_app no ve ningún tipo", async () => {
    const n = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
      await tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);
      const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "tipo_identificacion"`);
      await comoDueno(tx);
      return f.n;
    });
    expect(n).toBe(0);
  });

  it("R4: una empresa recibe 42501 al escribir en pais y en tipo_identificacion, también por SQL a mano; la plataforma sí escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const cedula = await idDeTipoCR(tx, "cedula_fisica");
      await comoApp(tx, m.A);
      const intentos = {
        insertarPais: await intentar(
          tx,
          `INSERT INTO "pais" ("id","nombre","nivel_1_singular","nivel_1_plural","nivel_2_singular","nivel_2_plural","nivel_3_singular","nivel_3_plural")
           VALUES ('XY','Pais SLT42','a','b','c','d','e','f')`,
        ),
        cambiarZona: await intentar(tx, `UPDATE "pais" SET "zona_horaria" = 'Europe/Madrid' WHERE "id" = 'CR'`),
        cambiarPrefijo: await intentar(tx, `UPDATE "pais" SET "prefijo_telefonico" = '1' WHERE "id" = 'CR'`),
        borrarPais: await intentar(tx, `DELETE FROM "pais" WHERE "id" = 'XA'`),
        insertarTipo: await intentar(
          tx,
          `INSERT INTO "tipo_identificacion" ("id","value","pais_id","clave","nombre","caracteres","largo_min","largo_max","orden")
           VALUES ($1, 'CR_nuevo', 'CR', 'nuevo', 'Nuevo', 'digitos', 5, 5, 9)`,
          randomUUID(),
        ),
        cambiarRegla: await intentar(tx, `UPDATE "tipo_identificacion" SET "largo_max" = 20 WHERE "id" = $1`, cedula),
        desactivar: await intentar(tx, `UPDATE "tipo_identificacion" SET "activo" = false WHERE "id" = $1`, cedula),
        borrarTipo: await intentar(tx, `DELETE FROM "tipo_identificacion" WHERE "id" = $1`, cedula),
      };
      await comoDueno(tx);
      const [cr] = await tx.$queryRawUnsafe<{ zona_horaria: string; prefijo_telefonico: string }[]>(
        `SELECT "zona_horaria", "prefijo_telefonico" FROM "pais" WHERE "id" = 'CR'`,
      );
      const [ced] = await tx.$queryRawUnsafe<{ largo_max: number; activo: boolean }[]>(
        `SELECT "largo_max", "activo" FROM "tipo_identificacion" WHERE "id" = $1`,
        cedula,
      );
      // La plataforma (dueño, sin RLS) escribe los datos de cualquier país.
      const plataforma = {
        zonaXa: await intentar(tx, `UPDATE "pais" SET "zona_horaria" = 'America/Panama' WHERE "id" = 'XA'`),
        tipoXa: await intentar(tx, `UPDATE "tipo_identificacion" SET "activo" = true WHERE "id" = $1`, m.xa.inactivo),
      };
      return { intentos, cr, ced, plataforma };
    });

    expect(r.intentos).toEqual({
      insertarPais: "42501",
      cambiarZona: "42501",
      cambiarPrefijo: "42501",
      borrarPais: "42501",
      insertarTipo: "42501",
      cambiarRegla: "42501",
      desactivar: "42501",
      borrarTipo: "42501",
    });
    expect(r.cr).toEqual({ zona_horaria: "America/Costa_Rica", prefijo_telefonico: "506" });
    expect(r.ced).toEqual({ largo_max: 9, activo: true });
    expect(r.plataforma).toEqual({ zonaXa: null, tipoXa: null });
  });

  it("R13, R31: el documento es único por empresa y tipo; otro tipo en la misma empresa u otra empresa con el mismo tipo entran", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const cedula = await idDeTipoCR(tx, "cedula_fisica");
      const nite = await idDeTipoCR(tx, "nite");
      const otraCR = (await crearOrganizacion(tx, { nombre: `Empresa CR2 ${randomUUID().slice(0, 6)}` })).id;
      const doc = `1${randomUUID().replace(/\D/g, "").padEnd(9, "0").slice(0, 8)}`;
      const primero = await insertarUsuario(tx, { organizacionId: m.A, tipoId: cedula, cedula: doc });
      const mismoTipoMismaEmpresa = await insertarUsuario(tx, { organizacionId: m.A, tipoId: cedula, cedula: doc });
      const [restriccion] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'usuario_cedula_key'
            AND indexdef LIKE '%(organizacion_id, tipo_identificacion_id, cedula)%'`,
      );
      return {
        primero,
        mismoTipoMismaEmpresa,
        otroTipoMismaEmpresa: await insertarUsuario(tx, { organizacionId: m.A, tipoId: nite, cedula: doc }),
        mismoTipoOtraEmpresa: await insertarUsuario(tx, { organizacionId: otraCR, tipoId: cedula, cedula: doc }),
        // B está en XA: con un tipo de su país, el mismo número también entra.
        otraEmpresaOtroPais: await insertarUsuario(tx, { organizacionId: m.B, tipoId: m.xa.activo1, cedula: doc }),
        indicePorEmpresaYTipo: restriccion.n,
      };
    });
    expect(r).toEqual({
      primero: null,
      // 23505 sobre `usuario_cedula_key`: el nombre con el que los repositorios lo traducen a `conflict`.
      mismoTipoMismaEmpresa: "23505",
      otroTipoMismaEmpresa: null,
      mismoTipoOtraEmpresa: null,
      otraEmpresaOtroPais: null,
      indicePorEmpresaYTipo: 1,
    });
  });

  it("R13: el repetido llega como P2002 con el nombre usuario_cedula_key, el que los repositorios traducen a conflict", async () => {
    const r = await revertida(base, async (tx) => {
      const A = (await crearOrganizacion(tx)).id;
      const cedula = await idDeTipoCR(tx, "cedula_fisica");
      const rol = await tx.rol.findFirstOrThrow({ where: { value: "mensajero" }, select: { id: true } });
      const crear = () =>
        tx.usuario.create({
          data: {
            nombre: "Persona SLT42",
            email: `slt42-${randomUUID().slice(0, 8)}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: "111111111",
            tipoIdentificacionId: cedula,
            rolId: rol.id,
            organizacionId: A,
          },
          select: { id: true },
        });
      await crear();
      const error = await errorEnSavepoint(tx, crear);
      return { p2002: esP2002(error), constraint: textoConstraintP2002(error) };
    });
    expect(r.p2002).toBe(true);
    expect(r.constraint).toContain("usuario_cedula_key");
  });
});
