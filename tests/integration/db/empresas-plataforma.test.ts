import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { crearOrganizacion, datosDeOrganizacionDePrueba } from "../../fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "../../fabricas/paises";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  crearPrismaDeTestEnEsquema,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";

// SL-32 / T14b (R29) — el listado de la pantalla «Empresas», con su SQL contra Postgres real.
//
// Los tests del servicio usan un doble y no ven el `where`: quitar el filtro por rol `maestro` los
// deja en verde. Aqui el repositorio REAL corre sobre la transaccion del test (cliente base, sin la
// extension), con datos propios: dos organizaciones de la fabrica de SL-17, dos maestros en la
// primera, uno en la segunda y un `admin` en la primera. Todo en una transaccion revertida y
// serializada con el lock de la 227.
//
// La base puede tener otras organizaciones (las de otros tests, o una base de desarrollo): los
// casos con datos miran solo las suyas, y «sin organizaciones» corre en un esquema desechable con
// las tres tablas vacias (ver su caso).
//
// Mutacion de T14b: sin `where: { rol: { value: "maestro" } }` en el repositorio, el `admin` entra
// entre los maestros y cae el primer caso.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** SL-45 (R28): una empresa sin cargos ni pagos está al día con la plataforma. */
const AL_DIA = { deuda: "0.00", estado: "al_dia", importe: "0.00" } as const;

/** SL-20 (R9, R10): una organización de la fábrica nace en Costa Rica. */
const COSTA_RICA = { id: "CR", nombre: "Costa Rica" } as const;

let prisma: PrismaClient;

// En el futuro lejano: asi las dos son las mas recientes de la base y su orden no depende de
// cuando se crearon las demas.
const ALTA_A = new Date("2999-01-01T10:00:00.000Z");
const ALTA_B = new Date("2999-01-02T10:00:00.000Z");

type Sembrado = {
  a: { id: string; nombre: string; slug: string };
  b: { id: string; nombre: string; slug: string };
  maestroA1: { nombre: string; email: string };
  maestroA2: { nombre: string; email: string };
  maestroB: { nombre: string; email: string };
  admin: { nombre: string; email: string };
  sensibles: string[];
};

async function usuario(
  tx: TxDeTest,
  rolId: string,
  organizacionId: string,
  nombre: string,
  creado: Date,
): Promise<{ nombre: string; email: string; cedula: string; telefono: string; hash: string }> {
  const u = await insertarUsuario(tx, rolId, organizacionId);
  if (!u.desenlace.ok) throw new Error(`no se sembro ${nombre}: ${JSON.stringify(u.desenlace)}`);
  const hash = `hash-sl32-${randomUUID()}`;
  const telefono = `tel-${randomUUID().slice(0, 8)}`;
  // Documento y telefono propios, que no son subcadena del email: asi «no contiene» prueba algo.
  const cedula = `doc-${randomUUID().slice(0, 12)}`;
  const [fila] = await tx.$queryRawUnsafe<{ email: string }[]>(
    `UPDATE "usuario" SET "nombre" = $2, "created_at" = $3, "password_hash" = $4, "telefono" = $5, "cedula" = $6
      WHERE "id" = $1 RETURNING "email"`,
    u.id,
    nombre,
    creado,
    hash,
    telefono,
    cedula,
  );
  return { nombre, email: fila.email, cedula, telefono, hash };
}

async function organizacion(tx: TxDeTest, alta: Date): Promise<{ id: string; nombre: string; slug: string }> {
  const { id } = await crearOrganizacion(tx);
  const [fila] = await tx.$queryRawUnsafe<{ nombre: string; slug: string }[]>(
    `UPDATE "organizacion" SET "created_at" = $2 WHERE "id" = $1 RETURNING "nombre", "slug"`,
    id,
    alta,
  );
  return { id, ...fila };
}

/** Siembra lo del caso y corre el repositorio real sobre la transaccion. */
function conDatos<T>(fn: (listado: EmpresaListada[], s: Sembrado) => T): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const rolMaestro = await idDeRol(tx, "maestro");
    const rolAdmin = await idDeRol(tx, "admin");

    const a = await organizacion(tx, ALTA_A);
    const b = await organizacion(tx, ALTA_B);
    // El segundo maestro de A se da de alta ANTES que el primero en la tabla, pero con fecha
    // posterior: el orden lo pone `created_at`, no el orden de insercion.
    const maestroA2 = await usuario(tx, rolMaestro, a.id, "Maestro A2", new Date("2999-01-01T12:00:00.000Z"));
    const maestroA1 = await usuario(tx, rolMaestro, a.id, "Maestro A1", new Date("2999-01-01T11:00:00.000Z"));
    const admin = await usuario(tx, rolAdmin, a.id, "Admin A", new Date("2999-01-01T10:30:00.000Z"));
    const maestroB = await usuario(tx, rolMaestro, b.id, "Maestro B", new Date("2999-01-02T11:00:00.000Z"));

    const sensibles = [maestroA1, maestroA2, maestroB, admin].flatMap((u) => [u.cedula, u.telefono, u.hash]);
    const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
    const solo = (u: { nombre: string; email: string }) => ({ nombre: u.nombre, email: u.email });
    return fn(listado, {
      a,
      b,
      maestroA1: solo(maestroA1),
      maestroA2: solo(maestroA2),
      maestroB: solo(maestroB),
      admin: solo(admin),
      sensibles,
    });
  });
}

describeSiHayBase("SL-32 — listado de empresas del superadmin contra Postgres (R29)", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("trae las dos, la mas reciente primero, cada una con sus maestros por alta y sin el admin", async () => {
    const r = await conDatos((listado, s) => ({ listado, s }));
    const mias = r.listado.filter((e) => e.id === r.s.a.id || e.id === r.s.b.id);

    // SLT-66 R31, R32: los dos campos nuevos del listado. Su valor se mide en empresas-plataforma-plan
    // (aquí el global no está fijado); este caso sigue midiendo lo de SL-32.
    const nuevosSlt66 = { cobroVigente: expect.anything(), plan: null };
    expect(mias).toEqual([
      { id: r.s.b.id, nombre: r.s.b.nombre, slug: r.s.b.slug, creadaEn: ALTA_B, maestros: [r.s.maestroB], cobroPorOrden: null, deudaPlataforma: AL_DIA, pagadoPlataforma: "0.00", pais: COSTA_RICA, ...nuevosSlt66 },
      {
        id: r.s.a.id,
        nombre: r.s.a.nombre,
        slug: r.s.a.slug,
        creadaEn: ALTA_A,
        maestros: [r.s.maestroA1, r.s.maestroA2],
        cobroPorOrden: null,
        deudaPlataforma: AL_DIA, pagadoPlataforma: "0.00",
        pais: COSTA_RICA,
        ...nuevosSlt66,
      },
    ]);
    expect(JSON.stringify(r.listado)).not.toContain(r.s.admin.email);
  });

  it("todo el listado va por fecha de alta descendente", async () => {
    const listado = await conDatos((l) => l);

    expect(listado.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < listado.length; i++) {
      expect(listado[i - 1].creadaEn.getTime()).toBeGreaterThanOrEqual(listado[i].creadaEn.getTime());
    }
  });

  it("ninguna fila trae password_hash, telefono ni documento: solo las columnas de la tabla", async () => {
    const r = await conDatos((listado, s) => ({ listado, s }));
    const mias = r.listado.filter((e) => e.id === r.s.a.id || e.id === r.s.b.id);

    expect(mias).toHaveLength(2);
    for (const e of mias) {
      expect(Object.keys(e).sort()).toEqual([
        "cobroPorOrden",
        "cobroVigente", // SLT-66 R31
        "creadaEn",
        "deudaPlataforma",
        "id",
        "maestros",
        "nombre",
        "pagadoPlataforma",
        "pais",
        "plan", // SLT-66 R32
        "slug",
      ]);
      for (const m of e.maestros) expect(Object.keys(m).sort()).toEqual(["email", "nombre"]);
      // SL-20 (R9): del país, solo código y nombre.
      expect(Object.keys(e.pais).sort()).toEqual(["id", "nombre"]);
    }
    const texto = JSON.stringify(mias);
    for (const valor of r.s.sensibles) expect(texto).not.toContain(valor);
  });

  it("SL-20 R9: cada empresa trae su país, código y nombre", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const xa = await crearPaisDePrueba(tx, "XA");
      const enXa = await crearOrganizacionEnPais(tx, xa.id);
      const enCr = await crearOrganizacion(tx);
      const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
      return { xa, enXa, enCr, listado };
    });

    const paisDe = (id: string) => r.listado.find((e) => e.id === id)?.pais;
    expect(paisDe(r.enXa.id)).toEqual({ id: "XA", nombre: r.xa.nombre });
    expect(paisDe(r.enCr.id)).toEqual(COSTA_RICA);
  });

  it("sin organizaciones devuelve []", async () => {
    // Las tablas de `public` pueden tener organizaciones de otros tests o de una base de desarrollo,
    // y vaciarlas no es de este test. El repositorio corre igual sobre un esquema desechable con
    // copias vacias de las tres tablas que toca (`LIKE ... INCLUDING ALL`). El control de despues
    // demuestra que el cliente lee de verdad ese esquema: con una organizacion, la devuelve.
    const esquema = `sl32_empresas_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await bajoLockDeEscrituraReal(async () => {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${esquema}"`);
      for (const tabla of ["rol", "organizacion", "usuario"]) {
        await prisma.$executeRawUnsafe(`CREATE TABLE "${esquema}"."${tabla}" (LIKE "public"."${tabla}" INCLUDING ALL)`);
      }
      // SL-20 (R9): el listado trae el país de cada empresa. La organización de control nace en `CR`
      // por el DEFAULT copiado, así que Costa Rica tiene que estar en la copia de `pais`.
      await prisma.$executeRawUnsafe(`CREATE TABLE "${esquema}"."pais" (LIKE "public"."pais" INCLUDING ALL)`);
      await prisma.$executeRawUnsafe(`INSERT INTO "${esquema}"."pais" SELECT * FROM "public"."pais" WHERE "id" = 'CR'`);
      // SL-45 (R28): el listado lee también los cargos y los pagos de cada empresa. Sin restricciones
      // (`LIKE` a secas): el CHECK tipo-categoría compara con el enum de `public` y no dejaría cambiar
      // el tipo de la columna. Vacías: aquí solo importa que existan.
      for (const tabla of ["cobro_plataforma_movimiento", "wallet_movimiento"]) {
        await prisma.$executeRawUnsafe(`CREATE TABLE "${esquema}"."${tabla}" (LIKE "public"."${tabla}")`);
      }
      // Prisma califica el cast del enum con el esquema del cliente (`"<esquema>".rol_value`): el
      // tipo tiene que existir ahi, con las mismas etiquetas, y `rol.value` tiene que usarlo.
      const [{ etiquetas }] = await prisma.$queryRawUnsafe<{ etiquetas: string }[]>(
        `SELECT string_agg(quote_literal(enumlabel), ',' ORDER BY enumsortorder) AS etiquetas
           FROM pg_enum WHERE enumtypid = 'public.rol_value'::regtype`,
      );
      await prisma.$executeRawUnsafe(`CREATE TYPE "${esquema}"."rol_value" AS ENUM (${etiquetas})`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${esquema}"."rol" ALTER COLUMN "value" TYPE "${esquema}"."rol_value" USING "value"::text::"${esquema}"."rol_value"`,
      );
      // SL-45: lo mismo para los enums que filtra la lectura de los pagos.
      for (const [tipo, columna] of [
        ["wallet_movimiento_tipo", "tipo"],
        ["wallet_movimiento_categoria", "categoria"],
      ] as const) {
        const [{ etiquetas: deEsteTipo }] = await prisma.$queryRawUnsafe<{ etiquetas: string }[]>(
          `SELECT string_agg(quote_literal(enumlabel), ',' ORDER BY enumsortorder) AS etiquetas
             FROM pg_enum WHERE enumtypid = 'public.${tipo}'::regtype`,
        );
        await prisma.$executeRawUnsafe(`CREATE TYPE "${esquema}"."${tipo}" AS ENUM (${deEsteTipo})`);
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${esquema}"."wallet_movimiento" ALTER COLUMN "${columna}" TYPE "${esquema}"."${tipo}" USING "${columna}"::text::"${esquema}"."${tipo}"`,
        );
      }
    });
    const enEsquema = crearPrismaDeTestEnEsquema(esquema);
    try {
      const repo = new EmpresasPlataformaRepository(enEsquema);

      expect(await repo.listar()).toEqual([]);

      const datos = datosDeOrganizacionDePrueba();
      await enEsquema.organizacion.create({ data: datos });
      const control = await repo.listar();
      expect(control.map((e) => ({ nombre: e.nombre, slug: e.slug, maestros: e.maestros, pais: e.pais }))).toEqual([
        { ...datos, maestros: [], pais: COSTA_RICA },
      ]);
    } finally {
      await enEsquema.$disconnect();
      await bajoLockDeEscrituraReal(() => prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`));
    }
  });
});
