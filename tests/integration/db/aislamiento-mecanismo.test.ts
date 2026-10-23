import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  crearPrismaDeTestEnEsquema,
  urlDeBaseDeDatos,
} from "./_postgres-real";

// SL-17 / T1.1 — SPIKE DE MEDICION (design §6.5).
//
// La extension de aislamiento (design §6) se apoya en cinco hechos de Prisma 7 + `PrismaPg` +
// Postgres que no se pueden dar por supuestos: si uno falla, §6 se corrige ANTES de construir
// encima. Cada `it` mide uno, contra Postgres real.
//
// COMO NO SE ENSUCIA LA BASE. Todo vive en un ESQUEMA DESECHABLE (`DROP SCHEMA ... CASCADE` al
// final): una tabla `prueba (id, org, nombre)` con RLS para los puntos 1, 3, 4 y 5, y un clon
// estructural de `provincia` (`LIKE ... INCLUDING ALL`) para el punto 2 y la medida de coste, al
// que se llega por la API de modelo con `crearPrismaDeTestEnEsquema`. Nada toca `public`.
//
// EL ROL ES DEL CLUSTER, NO DE LA BASE. `sl17_spike_app` tiene nombre propio para no confundirse
// con el `servi_app` de M1, y se suelta al final con `DROP OWNED BY` + `DROP ROLE`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ESQUEMA = `sl17_spike_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const ROL = "sl17_spike_app";
const ORG_A = "org-a";
const ORG_B = "org-b";
const T = `"${ESQUEMA}"."prueba"`;

type Fila = { id: string; org: string; nombre: string };

/** Cliente con un pool de UNA conexion: fuerza que dos transacciones seguidas compartan conexion. */
function crearPrismaDeUnaConexion(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 1 }),
    omit: PRISMA_OMIT,
  }) as unknown as PrismaClient;
}

/** La sentencia de la envoltura de design §6.3, con el rol del spike. */
function fijarEmpresa(cliente: PrismaClient, org: string) {
  return cliente.$executeRaw`SELECT set_config('app.organizacion_id', ${org}, true), set_config('role', ${ROL}, true)`;
}

/**
 * El `Proxy` de design §6.4, en su forma minima: intercepta `$transaction` (interactiva y en lote)
 * y antepone `set_config`. Todo lo demas se reenvia al cliente con su `this` atado.
 */
function conTransaccionDeEmpresa<C extends object>(cliente: C, org: string): C {
  const base = cliente as unknown as PrismaClient;
  return new Proxy(cliente, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (arg: unknown, opciones?: unknown) => {
          if (Array.isArray(arg)) {
            return base
              .$transaction([fijarEmpresa(base, org), ...(arg as Prisma.PrismaPromise<unknown>[])], opciones as never)
              .then((r) => r.slice(1));
          }
          const fn = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
          return base.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${org}, true), set_config('role', ${ROL}, true)`;
            return fn(tx);
          }, opciones as never);
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
}

function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describeSiHayBase("SL-17 T1.1 — mecanismo de aislamiento (design §6.5)", () => {
  let duenoCliente: PrismaClient;
  let enEsquema: PrismaClient;
  let dueno: string;
  let provinciaId: string;

  beforeAll(async () => {
    duenoCliente = crearPrismaDeTest();
    enEsquema = crearPrismaDeTestEnEsquema(ESQUEMA);

    const [{ usuario }] = await duenoCliente.$queryRaw<{ usuario: string }[]>`SELECT current_user::text AS usuario`;
    dueno = usuario;

    await duenoCliente.$executeRawUnsafe(`CREATE SCHEMA "${ESQUEMA}"`);
    await duenoCliente.$executeRawUnsafe(
      `CREATE TABLE ${T} (id text PRIMARY KEY, org text NOT NULL, nombre text NOT NULL)`,
    );
    await duenoCliente.$executeRawUnsafe(
      `CREATE TABLE "${ESQUEMA}"."provincia" (LIKE public."provincia" INCLUDING ALL)`,
    );
    await duenoCliente.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL}') THEN
          CREATE ROLE ${ROL} NOLOGIN NOBYPASSRLS;
        END IF;
      END $$`);
    await duenoCliente.$executeRawUnsafe(`GRANT ${ROL} TO CURRENT_USER`);
    await duenoCliente.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${ESQUEMA}" TO ${ROL}`);
    await duenoCliente.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${T} TO ${ROL}`);
    await duenoCliente.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${ESQUEMA}"."provincia" TO ${ROL}`,
    );
    await duenoCliente.$executeRawUnsafe(`ALTER TABLE ${T} ENABLE ROW LEVEL SECURITY`);
    await duenoCliente.$executeRawUnsafe(
      `CREATE POLICY prueba_por_empresa ON ${T}
         USING (org = NULLIF(current_setting('app.organizacion_id', true), ''))
         WITH CHECK (org = NULLIF(current_setting('app.organizacion_id', true), ''))`,
    );
    await duenoCliente.$executeRawUnsafe(
      `INSERT INTO ${T} (id, org, nombre) VALUES ('a1', '${ORG_A}', 'uno de A'), ('a2', '${ORG_A}', 'dos de A'), ('b1', '${ORG_B}', 'uno de B')`,
    );

    const p = await enEsquema.provincia.create({ data: { id: randomUUID(), nombre: "Provincia del spike", activo: true } });
    provinciaId = p.id;
  }, 60_000);

  afterAll(async () => {
    try {
      await duenoCliente.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ESQUEMA}" CASCADE`);
    } finally {
      try {
        await duenoCliente.$executeRawUnsafe(`DROP OWNED BY ${ROL}`);
        await duenoCliente.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROL}`);
      } catch (error) {
        // Otro esquema del spike (de una corrida en paralelo) aun depende del rol: lo suelta el ultimo.
        console.warn(`[T1.1] no se pudo soltar el rol ${ROL}: ${(error as Error).message}`);
      }
      await enEsquema.$disconnect();
      await duenoCliente.$disconnect();
    }
  }, 60_000);

  // -------------------------------------------------------------------------------------------
  // 1. `$allOperations` a nivel de cliente y el SQL a mano.
  // -------------------------------------------------------------------------------------------
  it("1a. la parte `query` de `$allOperations` intercepta $queryRaw, $executeRaw, $queryRawUnsafe y $executeRawUnsafe", async () => {
    const vistas: { operation: string; model: string | undefined }[] = [];
    const extendido = duenoCliente.$extends({
      query: {
        $allOperations({ operation, model, args, query }) {
          vistas.push({ operation, model });
          return query(args);
        },
      },
    });

    const filas = await extendido.$queryRaw<Fila[]>`SELECT * FROM ${Prisma.raw(T)} ORDER BY id`;
    await extendido.$executeRaw`UPDATE ${Prisma.raw(T)} SET nombre = nombre WHERE id = ${"a1"}`;
    await extendido.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T} WHERE org = $1`, ORG_A);
    await extendido.$executeRawUnsafe(`UPDATE ${T} SET nombre = nombre WHERE id = $1`, "b1");

    expect(filas).toHaveLength(3); // el dueno ve todo: sin datos sembrados este caso no vale
    console.log(`[T1.1 §1a] $allOperations vio: ${JSON.stringify(vistas)}`);
    expect(vistas.map((v) => v.operation)).toEqual([
      "$queryRaw",
      "$executeRaw",
      "$queryRawUnsafe",
      "$executeRawUnsafe",
    ]);
    expect(vistas.every((v) => v.model === undefined)).toBe(true);
  });

  it("1b. los hooks especificos ($queryRaw, $executeRaw, $queryRawUnsafe, $executeRawUnsafe) tambien los ven", async () => {
    const vistas: string[] = [];
    const extendido = duenoCliente.$extends({
      query: {
        $queryRaw({ args, query }) {
          vistas.push("$queryRaw");
          return query(args);
        },
        $executeRaw({ args, query }) {
          vistas.push("$executeRaw");
          return query(args);
        },
        $queryRawUnsafe({ args, query }) {
          vistas.push("$queryRawUnsafe");
          return query(args);
        },
        $executeRawUnsafe({ args, query }) {
          vistas.push("$executeRawUnsafe");
          return query(args);
        },
      },
    });

    await extendido.$queryRaw`SELECT 1`;
    await extendido.$executeRaw`UPDATE ${Prisma.raw(T)} SET nombre = nombre WHERE id = ${"a1"}`;
    await extendido.$queryRawUnsafe(`SELECT 1`);
    await extendido.$executeRawUnsafe(`UPDATE ${T} SET nombre = nombre WHERE id = $1`, "b1");

    console.log(`[T1.1 §1b] hooks especificos vieron: ${JSON.stringify(vistas)}`);
    expect(vistas).toEqual(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"]);
  });

  // -------------------------------------------------------------------------------------------
  // 2. Campo extra NO unico en el `where` unico.
  // -------------------------------------------------------------------------------------------
  it("2. findUnique/update/delete aceptan un campo no unico extra en el where unico y lo aplican", async () => {
    // Control: con el valor que casa, la fila aparece. Sin esto, un `null` abajo no probaria nada.
    const casa = await enEsquema.provincia.findUnique({ where: { id: provinciaId, activo: true } });
    expect(casa?.nombre).toBe("Provincia del spike");

    expect(await enEsquema.provincia.findUnique({ where: { id: provinciaId, activo: false } })).toBeNull();

    await expect(
      enEsquema.provincia.findUniqueOrThrow({ where: { id: provinciaId, activo: false } }),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(
      enEsquema.provincia.update({ where: { id: provinciaId, activo: false }, data: { nombre: "pisada" } }),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(
      enEsquema.provincia.delete({ where: { id: provinciaId, activo: false } }),
    ).rejects.toMatchObject({ code: "P2025" });

    // La fila sigue intacta: ni el update ni el delete la tocaron.
    const despues = await enEsquema.provincia.findUnique({ where: { id: provinciaId } });
    expect(despues?.nombre).toBe("Provincia del spike");

    // Y con el valor que casa, update sí escribe.
    const actualizada = await enEsquema.provincia.update({
      where: { id: provinciaId, activo: true },
      data: { nombre: "Provincia del spike" },
    });
    expect(actualizada.id).toBe(provinciaId);
  });

  // -------------------------------------------------------------------------------------------
  // 3. `set_config('role', …, true)` aplica la RLS a un superusuario y se revierte.
  // -------------------------------------------------------------------------------------------
  it("3. set_config('role', rol, true) aplica la RLS al superusuario y se revierte al acabar la transaccion", async () => {
    const [{ superusuario }] = await duenoCliente.$queryRaw<{ superusuario: boolean }[]>`
      SELECT rolsuper AS superusuario FROM pg_roles WHERE rolname = current_user`;
    console.log(`[T1.1 §3] la URL conecta como superusuario: ${superusuario}`);

    // Como dueno, sin bajar de rol: ve las dos empresas (lo esperado en plataforma).
    const comoDueno = await duenoCliente.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T} ORDER BY id`);
    expect(comoDueno.map((f) => f.org).sort()).toEqual([ORG_A, ORG_A, ORG_B]);

    const conEmpresaA = await duenoCliente.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${ORG_A}, true), set_config('role', ${ROL}, true)`;
      const [{ usuario }] = await tx.$queryRaw<{ usuario: string }[]>`SELECT current_user::text AS usuario`;
      const filas = await tx.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T} ORDER BY id`);
      return { usuario, filas };
    });
    expect(conEmpresaA.usuario).toBe(ROL);
    expect(conEmpresaA.filas.map((f) => f.id)).toEqual(["a1", "a2"]);

    const sinEmpresa = await duenoCliente.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('role', ${ROL}, true)`;
      return tx.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T}`);
    });
    expect(sinEmpresa).toEqual([]);

    // La transaccion siguiente vuelve a ser del dueno y sin empresa.
    const siguiente = await duenoCliente.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<{ usuario: string; org: string | null }[]>`
        SELECT current_user::text AS usuario, current_setting('app.organizacion_id', true) AS org`;
      const filas = await tx.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T}`);
      return { ...fila, filas: filas.length };
    });
    expect(siguiente.usuario).toBe(dueno);
    expect(siguiente.org ?? "").toBe("");
    expect(siguiente.filas).toBe(3);
  });

  // -------------------------------------------------------------------------------------------
  // 4. El lote va en una conexion, y el `Proxy` de `$transaction` no rompe tipo ni `this`.
  // -------------------------------------------------------------------------------------------
  it("4a. el lote [set_config, query] va en una sola conexion y transaccion con PrismaPg", async () => {
    // Pool de 2 (el del helper): si el lote se repartiera entre conexiones, el valor no se veria.
    const [antes, , despues, filas] = await duenoCliente.$transaction([
      duenoCliente.$queryRaw<{ pid: number; tx: string }[]>`SELECT pg_backend_pid() AS pid, txid_current()::text AS tx`,
      fijarEmpresa(duenoCliente, ORG_A),
      duenoCliente.$queryRaw<{ pid: number; tx: string; org: string; usuario: string }[]>`
        SELECT pg_backend_pid() AS pid, txid_current()::text AS tx,
               current_setting('app.organizacion_id', true) AS org, current_user::text AS usuario`,
      duenoCliente.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T} ORDER BY id`),
    ]);
    console.log(`[T1.1 §4a] pid ${antes[0].pid} -> ${despues[0].pid}, tx ${antes[0].tx} -> ${despues[0].tx}`);
    expect(despues[0].pid).toBe(antes[0].pid);
    expect(despues[0].tx).toBe(antes[0].tx);
    expect(despues[0].org).toBe(ORG_A);
    expect(despues[0].usuario).toBe(ROL);
    expect(filas.map((f) => f.id)).toEqual(["a1", "a2"]);
  });

  it("4b. un Proxy sobre el cliente extendido que intercepta $transaction no rompe tipo ni this", async () => {
    const extendido = enEsquema.$extends({
      query: {
        $allOperations({ args, query }) {
          return query(args);
        },
      },
    });
    const conProxy = conTransaccionDeEmpresa(extendido, ORG_A);

    // Interactiva: `tx` operativo (modelo y SQL a mano) y con la empresa fijada.
    const interactiva = await conProxy.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<{ org: string; usuario: string }[]>`
        SELECT current_setting('app.organizacion_id', true) AS org, current_user::text AS usuario`;
      const prov = await tx.provincia.findUnique({ where: { id: provinciaId } });
      const filas = await tx.$queryRawUnsafe<Fila[]>(`SELECT * FROM ${T} ORDER BY id`);
      return { ...fila, nombre: prov?.nombre, ids: filas.map((f) => f.id) };
    });
    expect(interactiva).toEqual({ org: ORG_A, usuario: ROL, nombre: "Provincia del spike", ids: ["a1", "a2"] });

    // En lote: el primer elemento (set_config) se quita del resultado; los tipos se conservan.
    const lote = await conProxy.$transaction([
      conProxy.provincia.findFirst({ where: { id: provinciaId } }),
      conProxy.$queryRaw<{ org: string }[]>`SELECT current_setting('app.organizacion_id', true) AS org`,
    ]);
    const [prov, [{ org }]] = lote;
    expect(prov?.nombre).toBe("Provincia del spike");
    expect(org).toBe(ORG_A);
    expect(lote).toHaveLength(2);

    // Lo demas sigue funcionando por el Proxy, con su `this`.
    expect(await conProxy.provincia.count({ where: { id: provinciaId } })).toBe(1);
    const [{ uno }] = await conProxy.$queryRaw<{ uno: number }[]>`SELECT 1::int AS uno`;
    expect(uno).toBe(1);
    expect(await conProxy.$executeRawUnsafe(`UPDATE ${T} SET nombre = nombre WHERE id = $1`, "a1")).toBe(1);

    // Fuera de `$transaction`, el Proxy no fija nada: corre como dueno.
    const [fuera] = await conProxy.$queryRaw<{ usuario: string }[]>`SELECT current_user::text AS usuario`;
    expect(fuera.usuario).toBe(dueno);
  });

  // -------------------------------------------------------------------------------------------
  // 5. `current_setting` en la transaccion siguiente de la misma conexion.
  // -------------------------------------------------------------------------------------------
  it("5. tras una transaccion que lo fijo con `true`, current_setting vale '' (no NULL) en la misma conexion", async () => {
    const unaConexion = crearPrismaDeUnaConexion();
    try {
      const [virgen] = await unaConexion.$queryRaw<{ pid: number; org: string | null }[]>`
        SELECT pg_backend_pid() AS pid, current_setting('app.organizacion_id', true) AS org`;

      const fijada = await unaConexion.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${ORG_A}, true)`;
        const [f] = await tx.$queryRaw<{ pid: number; org: string }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.organizacion_id', true) AS org`;
        return f;
      });

      const siguiente = await unaConexion.$transaction(async (tx) => {
        const [f] = await tx.$queryRaw<{ pid: number; org: string | null }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.organizacion_id', true) AS org`;
        return f;
      });

      console.log(
        `[T1.1 §5] pid ${virgen.pid}/${fijada.pid}/${siguiente.pid}; org virgen=${JSON.stringify(virgen.org)} fijada=${JSON.stringify(fijada.org)} siguiente=${JSON.stringify(siguiente.org)}`,
      );
      expect(fijada.pid).toBe(virgen.pid);
      expect(siguiente.pid).toBe(virgen.pid);
      expect(virgen.org).toBeNull(); // conexion que nunca lo fijo: NULL
      expect(fijada.org).toBe(ORG_A);
      expect(siguiente.org).toBe(""); // despues: '' y no NULL — por eso el NULLIF de la politica
    } finally {
      await unaConexion.$disconnect();
    }
  });

  // -------------------------------------------------------------------------------------------
  // 6. Coste de la envoltura (medicion, sin umbral).
  // -------------------------------------------------------------------------------------------
  it("6. coste de la envoltura [set_config, query] frente a la operacion suelta (100 repeticiones)", async () => {
    const REPS = 100;
    const CALENTAMIENTO = 10;
    const suelta = () => enEsquema.provincia.findFirst({ where: { id: provinciaId } });
    const envuelta = () => enEsquema.$transaction([fijarEmpresa(enEsquema, ORG_A), suelta()]).then(([, r]) => r);

    for (let i = 0; i < CALENTAMIENTO; i++) {
      await suelta();
      await envuelta();
    }

    const sin: number[] = [];
    const con: number[] = [];
    // Intercaladas: una deriva del servidor o de la red afecta por igual a las dos series.
    for (let i = 0; i < REPS; i++) {
      let t0 = performance.now();
      const a = await suelta();
      sin.push(performance.now() - t0);
      t0 = performance.now();
      const b = await envuelta();
      con.push(performance.now() - t0);
      expect(a?.id).toBe(provinciaId);
      expect(b?.id).toBe(provinciaId);
    }

    const f = (n: number) => n.toFixed(3);
    console.log(
      `[T1.1 §6] sin envoltura: media ${f(media(sin))} ms, mediana ${f(mediana(sin))} ms | ` +
        `con envoltura: media ${f(media(con))} ms, mediana ${f(mediana(con))} ms | ` +
        `sobrecoste: media +${f(media(con) - media(sin))} ms, mediana +${f(mediana(con) - mediana(sin))} ms (n=${REPS})`,
    );
    expect(sin).toHaveLength(REPS);
    expect(con).toHaveLength(REPS);
  }, 60_000);
});
