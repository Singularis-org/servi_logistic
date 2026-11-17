import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import {
  crearGeografiaDePrueba,
  crearNodoDeNivel,
  crearOrganizacionEnPais,
  crearPaisDePrueba,
} from "@/tests/fabricas/paises";
import { comoDueno, errorEnSavepoint, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-48 · R1, R2, R3, R5 (T1.6; design §2.1) — `provincia`, `canton` y `distrito` como vistas, contra
 * Postgres real y dentro de transacciones que siempre se revierten.
 *
 *   · R1: mismas columnas que las tablas de antes; una fila por nodo de su profundidad, con sus datos.
 *   · R2: toda escritura se rechaza y no cambia nada.
 *   · R3: con la empresa de un país solo se ve ese país; sin empresa (plataforma) se ven todos, como hoy.
 *   · R5: sin triggers de sincronía; crear, renombrar, retirar y mover un nodo se ve en la misma
 *     transacción.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
let base: PrismaClient;

const VISTAS = ["provincia", "canton", "distrito"] as const;
type Vista = (typeof VISTAS)[number];

async function filas<T>(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<T[]> {
  return tx.$queryRawUnsafe<T[]>(sql, ...args);
}

async function contar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<number> {
  const [f] = await filas<{ n: bigint | number }>(tx, sql, ...args);
  return Number(f.n);
}

/** Lo que la vista enseña y lo que el nodo tiene, por profundidad, en el rol y la empresa de la transacción. */
async function vistaYNodos(tx: TxDeTest, vista: Vista): Promise<{ vista: string[]; nodos: string[] }> {
  const profundidad = VISTAS.indexOf(vista) + 1;
  const vistaFilas = await filas<{ id: string }>(tx, `SELECT id FROM ${vista} ORDER BY id`);
  const nodos = await filas<{ id: string }>(
    tx,
    `SELECT id FROM nodo_geografico WHERE profundidad = $1 ORDER BY id`,
    profundidad,
  );
  return { vista: vistaFilas.map((f) => f.id), nodos: nodos.map((f) => f.id) };
}

describeSiHayBase("SLT-48 — geografía vieja como vistas de nodo_geografico", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: las tres son vistas con las columnas de antes, en el mismo orden", async () => {
    const tipos = await base.$queryRawUnsafe<{ relname: string; relkind: string }[]>(
      `SELECT c.relname, c.relkind::text AS relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname`,
      [...VISTAS],
    );
    expect(tipos).toEqual([
      { relname: "canton", relkind: "v" },
      { relname: "distrito", relkind: "v" },
      { relname: "provincia", relkind: "v" },
    ]);
    const columnas = await base.$queryRawUnsafe<{ table_name: string; columnas: string }[]>(
      `SELECT table_name, string_agg(column_name || ':' || data_type, ',' ORDER BY ordinal_position) AS columnas
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        GROUP BY table_name ORDER BY table_name`,
      [...VISTAS],
    );
    expect(columnas).toEqual([
      {
        table_name: "canton",
        columnas: "id:text,nombre:text,provincia_id:text,activo:boolean,codigo_dta:text,pais_id:text",
      },
      {
        table_name: "distrito",
        columnas: "id:text,nombre:text,canton_id:text,activo:boolean,codigo_dta:text,pais_id:text",
      },
      { table_name: "provincia", columnas: "id:text,nombre:text,activo:boolean,codigo_dta:text,pais_id:text" },
    ]);
  });

  it("R1: una fila por nodo de su profundidad, con los datos del nodo; un nodo de profundidad 4 no sale", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: paisId } = await crearPaisDePrueba(tx, "XA");
      const geo = await crearGeografiaDePrueba(tx, paisId, { codigos: { provincia: "9", canton: "9-1", distrito: "9-1-1" } });
      await tx.$executeRawUnsafe(
        `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
         VALUES ($1, $2, 'nivel_4', 'Sector', 'Sectores')`,
        randomUUID(),
        paisId,
      );
      const sector = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
         SELECT $1, $2, t.id, $3, 4, 'Sector SLT-48', '' FROM tipo_nivel_geografico t WHERE t.pais_id = $2 AND t.clave = 'nivel_4'`,
        sector,
        paisId,
        geo.distritoId,
      );
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, geo.cantonId);

      const ver = (vista: Vista, id: string) => filas<Record<string, unknown>>(tx, `SELECT * FROM ${vista} WHERE id = $1`, id);
      const nombre = (id: string) =>
        filas<{ nombre: string }>(tx, `SELECT nombre FROM nodo_geografico WHERE id = $1`, id).then((f) => f[0].nombre);
      return {
        geo,
        nombres: { p: await nombre(geo.provinciaId), c: await nombre(geo.cantonId), d: await nombre(geo.distritoId) },
        provincia: await ver("provincia", geo.provinciaId),
        canton: await ver("canton", geo.cantonId),
        distrito: await ver("distrito", geo.distritoId),
        sectorEnVistas: await contar(
          tx,
          `SELECT (SELECT count(*) FROM provincia WHERE id = $1) + (SELECT count(*) FROM canton WHERE id = $1)
                + (SELECT count(*) FROM distrito WHERE id = $1) AS n`,
          sector,
        ),
        porProfundidad: {
          provincia: await vistaYNodos(tx, "provincia"),
          canton: await vistaYNodos(tx, "canton"),
          distrito: await vistaYNodos(tx, "distrito"),
        },
      };
    });
    expect(r.provincia).toEqual([{ id: r.geo.provinciaId, nombre: r.nombres.p, activo: true, codigo_dta: "9", pais_id: "XA" }]);
    expect(r.canton).toEqual([
      { id: r.geo.cantonId, nombre: r.nombres.c, provincia_id: r.geo.provinciaId, activo: false, codigo_dta: "9-1", pais_id: "XA" },
    ]);
    expect(r.distrito).toEqual([
      { id: r.geo.distritoId, nombre: r.nombres.d, canton_id: r.geo.cantonId, activo: true, codigo_dta: "9-1-1", pais_id: "XA" },
    ]);
    expect(r.sectorEnVistas).toBe(0);
    for (const v of VISTAS) {
      expect(r.porProfundidad[v].vista.length, v).toBeGreaterThan(0);
      expect(r.porProfundidad[v].vista, v).toEqual(r.porProfundidad[v].nodos);
    }
  });

  it("R2: INSERT, UPDATE y DELETE sobre las vistas se rechazan como dueño (SL048, nombra nodo_geografico) y como servi_app, sin cambiar nada", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: paisId } = await crearPaisDePrueba(tx, "XA");
      const empresa = await crearOrganizacionEnPais(tx, paisId);
      const geo = await crearGeografiaDePrueba(tx, paisId);
      const huella = () =>
        filas<{ l: string }>(tx, `SELECT md5(string_agg(to_jsonb(n)::text, ',' ORDER BY id)) AS l FROM nodo_geografico n`).then(
          (f) => f[0].l,
        );
      const antes = await huella();
      const escrituras: Record<Vista, string[]> = {
        provincia: [
          `INSERT INTO provincia (id, nombre, activo, pais_id) VALUES ('${randomUUID()}', 'Nueva', true, 'XA')`,
          `UPDATE provincia SET nombre = 'Otra' WHERE id = '${geo.provinciaId}'`,
          `DELETE FROM provincia WHERE id = '${geo.provinciaId}'`,
        ],
        canton: [
          `INSERT INTO canton (id, nombre, provincia_id, activo, pais_id) VALUES ('${randomUUID()}', 'Nuevo', '${geo.provinciaId}', true, 'XA')`,
          `UPDATE canton SET activo = false WHERE id = '${geo.cantonId}'`,
          `DELETE FROM canton WHERE id = '${geo.cantonId}'`,
        ],
        distrito: [
          `INSERT INTO distrito (id, nombre, canton_id, activo, pais_id) VALUES ('${randomUUID()}', 'Nuevo', '${geo.cantonId}', true, 'XA')`,
          `UPDATE distrito SET canton_id = '${geo.cantonId}' WHERE id = '${geo.distritoId}'`,
          `DELETE FROM distrito WHERE id = '${geo.distritoId}'`,
        ],
      };
      const intentarTodas = async () => {
        const salida: { codigo: string; nombraNodo: boolean }[] = [];
        for (const v of VISTAS) {
          for (const sql of escrituras[v]) {
            const e = await errorEnSavepoint(tx, () => tx.$executeRawUnsafe(sql));
            salida.push({ codigo: e === null ? "pasó" : sqlstateDe(e), nombraNodo: /nodo_geografico/.test(String(e)) });
          }
        }
        return salida;
      };
      const comoDuenoR = await intentarTodas();
      await comoApp(tx, empresa.id);
      const comoServiApp = await intentarTodas();
      await comoDueno(tx);
      return { comoDuenoR, comoServiApp, igual: (await huella()) === antes };
    });
    expect(r.comoDuenoR).toEqual(Array(9).fill({ codigo: "SL048", nombraNodo: true }));
    // `servi_app` solo tiene SELECT (design §2.1, §10): Postgres lo para antes de llegar al trigger.
    expect(r.comoServiApp.map((x) => x.codigo)).toEqual(Array(9).fill("42501"));
    expect(r.igual).toBe(true);
  });

  it("R3: con la empresa de un país se ve solo ese país, igual que nodo_geografico; sin empresa (dueño) se ven todos", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: paisId } = await crearPaisDePrueba(tx, "XA");
      const empresaXA = await crearOrganizacionEnPais(tx, paisId);
      const empresaCR = await crearOrganizacion(tx);
      await crearGeografiaDePrueba(tx, paisId);
      const paises = async () => {
        const salida: Record<string, string[]> = {};
        for (const v of VISTAS) {
          salida[v] = (await filas<{ pais_id: string }>(tx, `SELECT DISTINCT pais_id FROM ${v} ORDER BY pais_id`)).map(
            (f) => f.pais_id,
          );
        }
        return salida;
      };
      const igualAlNodo = async () => {
        const salida: boolean[] = [];
        for (const v of VISTAS) {
          const x = await vistaYNodos(tx, v);
          salida.push(JSON.stringify(x.vista) === JSON.stringify(x.nodos));
        }
        return salida;
      };
      await comoApp(tx, empresaXA.id);
      const xa = { paises: await paises(), igual: await igualAlNodo() };
      await comoApp(tx, empresaCR.id);
      const cr = { paises: await paises(), igual: await igualAlNodo() };
      await comoDueno(tx);
      await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
      const plataforma = { paises: await paises(), igual: await igualAlNodo() };
      return { xa, cr, plataforma };
    });
    const solo = (p: string) => ({ provincia: [p], canton: [p], distrito: [p] });
    expect(r.xa).toEqual({ paises: solo("XA"), igual: [true, true, true] });
    expect(r.cr).toEqual({ paises: solo("CR"), igual: [true, true, true] });
    for (const v of VISTAS) expect(r.plataforma.paises[v], v).toEqual(expect.arrayContaining(["CR", "XA"]));
    expect(r.plataforma.igual).toEqual([true, true, true]);
  });

  it("R5: no queda ningún trigger ni función de sincronía; en las vistas solo el de solo lectura", async () => {
    const triggers = await base.$queryRawUnsafe<{ tabla: string; tgname: string }[]>(
      `SELECT c.relname AS tabla, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
          AND (c.relname = ANY($1::text[]) OR t.tgname ~ 'sincroniza|copia_a_geografia_vieja|pais_del_padre')
        ORDER BY 1, 2`,
      [...VISTAS],
    );
    expect(triggers).toEqual([
      { tabla: "canton", tgname: "canton_solo_lectura" },
      { tabla: "distrito", tgname: "distrito_solo_lectura" },
      { tabla: "provincia", tgname: "provincia_solo_lectura" },
    ]);
    const funciones = await base.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname ~ '^(geo_sincronizar_|geo_copiar_nodo_a_geografia_vieja|geografia_pais_del_padre)'`,
    );
    expect(funciones).toEqual([]);
  });

  it("R5: crear, renombrar, retirar y mover un nodo se ve en su vista en la misma transacción", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: paisId } = await crearPaisDePrueba(tx, "XA");
      const geo = await crearGeografiaDePrueba(tx, paisId);
      const otraProvincia = await crearNodoDeNivel(tx, 1, { nombre: `Otra ${randomUUID()}`, paisId });
      const canton = () =>
        filas<{ nombre: string; activo: boolean; provincia_id: string }>(
          tx,
          `SELECT nombre, activo, provincia_id FROM canton WHERE id = $1`,
          geo.cantonId,
        ).then((f) => f[0] ?? null);

      const nuevo = await crearNodoDeNivel(tx, 3, { nombre: "Barrio nuevo SLT-48", padreId: geo.cantonId });
      const creado = await filas<{ canton_id: string }>(tx, `SELECT canton_id FROM distrito WHERE id = $1`, nuevo.id);
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET nombre = 'Comuna renombrada SLT-48' WHERE id = $1`, geo.cantonId);
      const renombrado = await canton();
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, geo.cantonId);
      const retirado = await canton();
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET padre_id = $1 WHERE id = $2`, otraProvincia.id, geo.cantonId);
      const movido = await canton();
      return { geo, otraProvincia: otraProvincia.id, creado, renombrado, retirado, movido };
    });
    expect(r.creado).toEqual([{ canton_id: r.geo.cantonId }]);
    expect(r.renombrado).toEqual({ nombre: "Comuna renombrada SLT-48", activo: true, provincia_id: r.geo.provinciaId });
    expect(r.retirado).toEqual({ nombre: "Comuna renombrada SLT-48", activo: false, provincia_id: r.geo.provinciaId });
    expect(r.movido).toEqual({ nombre: "Comuna renombrada SLT-48", activo: false, provincia_id: r.otraProvincia });
  });
});
