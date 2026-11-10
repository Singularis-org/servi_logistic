import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SQLSTATE_NODO_CAMBIA_DE_TABLA_VIEJA } from "@/lib/db/sqlstate";
import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { SQL_INSERTAR_NODO, argumentosDeNodo, insertarNodo, tiposDeNivel, type TiposDeNivel } from "./_fixtures/geo-43";
import { MIGRACIONES } from "./_fixtures/ida-y-vuelta-32";
import { intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T2.2; design §2.2) — la copia nodo → geografía vieja (`20261106120100`), contra Postgres.
//   · R2: alta, renombre, código, retiro y reactivación de nodos de profundidad 1, 2 y 3 dejan la
//     fila de provincia/cantón/distrito con el mismo id, nombre, código, `activo`, padre y país.
//   · R3: un nodo de profundidad 4 no crea ni cambia ninguna fila vieja.
//   · R4: sin bucle (la sentencia termina, `pg_trigger_depth` ≤ 3), una fila por id a cada lado y el
//     nodo que originó la escritura intacto; en la otra dirección (SQL sobre `provincia`) igual.
//   · R5: un único de la tabla vieja tumba la escritura del nodo entera (23505), sin nodo ni fila vieja.
//   · R6: cambiar la profundidad de una hoja de 1–3 (o hacia 1–3) → `SLT46`, sin escribir.
//   · R7: borrar físicamente un nodo de 1–3 borra su fila vieja.
//   · R44: el trigger de `orden` y los de las zonas siguen con el cuerpo de SLT-43, y las zonas
//     siguen apuntando a `distrito`.
//
// Los nodos se escriben por SQL como DUEÑO dentro de una transacción que siempre se revierte (la
// misma escritura que hará `GeoRepository` en T3, sin depender de él). País de prueba `XA`: códigos
// libres, sin regla de dígitos.
//
// R5 sin apagar triggers (design §11 proponía crear la fila vieja con la sincronía apagada, lo que
// pide base propia): un nodo de profundidad 1 escrito a mano con OTRO tipo del país pasa el único del
// nodo (país, tipo, código) pero no el de `provincia` (país, código). Es el caso que el comentario de
// la migración describe como «solo por SQL a mano», y basta para ver que la copia arrastra la sentencia.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const sufijo = () => randomUUID().replace(/-/g, "").slice(0, 8);

interface Fila {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  padre: string | null;
  pais: string;
}

/** La fila del nodo con los nombres de columna de la geografía vieja. */
async function filaDelNodo(tx: TxDeTest, id: string): Promise<Fila & { profundidad: number } | undefined> {
  const [f] = await tx.$queryRawUnsafe<(Fila & { profundidad: number })[]>(
    `SELECT id, nombre, codigo_oficial AS codigo, activo, padre_id AS padre, pais_id AS pais, profundidad
       FROM nodo_geografico WHERE id = $1`,
    id,
  );
  return f;
}

/** Las filas viejas con ese id, en las tres tablas, con la tabla delante. */
async function filasViejas(tx: TxDeTest, id: string): Promise<(Fila & { tabla: string })[]> {
  return tx.$queryRawUnsafe<(Fila & { tabla: string })[]>(
    `SELECT 'provincia' AS tabla, id, nombre, codigo_dta AS codigo, activo, NULL::text AS padre, pais_id AS pais FROM provincia WHERE id = $1
     UNION ALL SELECT 'canton', id, nombre, codigo_dta, activo, provincia_id, pais_id FROM canton WHERE id = $1
     UNION ALL SELECT 'distrito', id, nombre, codigo_dta, activo, canton_id, pais_id FROM distrito WHERE id = $1`,
    id,
  );
}

const TABLA = { 1: "provincia", 2: "canton", 3: "distrito" } as const;

/** R2/R4: exactamente una fila vieja con ese id, en la tabla de su profundidad, igual al nodo. */
async function esperarCopiaIgual(tx: TxDeTest, id: string): Promise<void> {
  const nodo = await filaDelNodo(tx, id);
  expect(nodo, `sin nodo ${id}`).toBeDefined();
  const { profundidad, ...comoVieja } = nodo!;
  const viejas = await filasViejas(tx, id);
  expect(viejas).toEqual([{ tabla: TABLA[profundidad as 1 | 2 | 3], ...comoVieja }]);
  const [n] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM nodo_geografico WHERE id = $1`, id);
  expect(n.n).toBe(1);
}

async function contarViejas(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT ((SELECT count(*) FROM provincia) + (SELECT count(*) FROM canton) + (SELECT count(*) FROM distrito))::int AS n`,
  );
  return f.n;
}

async function crearTipo(tx: TxDeTest, paisId: string, clave: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, $2, $3, 'Sector', 'Sectores')`,
    id,
    paisId,
    clave,
  );
  return id;
}

/** Un país `XA` con sus tipos y una rama de profundidad 1 → 3. */
async function conRama<T>(
  fn: (ctx: { tx: TxDeTest; t: TiposDeNivel; s: string; p: string; c: string; d: string }) => Promise<T>,
): Promise<T> {
  return revertida(base, async (tx) => {
    await crearPaisDePrueba(tx, "XA");
    const t = await tiposDeNivel(tx, "XA");
    const s = sufijo();
    const p = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Región ${s}`, codigoOficial: "R1" });
    const c = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: p, profundidad: 2, nombre: `Comuna ${s}`, codigoOficial: "C1" });
    const d = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: c, profundidad: 3, nombre: `Barrio ${s}` });
    return fn({ tx, t, s, p, c, d });
  });
}

describeSiHayBase("SLT-46 — copia del nodo a la geografía vieja (R2–R7, R44)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: el alta de un nodo de profundidad 1, 2 y 3 deja su provincia, cantón y distrito con el mismo id, nombre, código, activo, padre y país", async () => {
    const r = await conRama(async ({ tx, p, c, d }) => {
      for (const id of [p, c, d]) await esperarCopiaIgual(tx, id);
      return { viejas: [await filasViejas(tx, p), await filasViejas(tx, c), await filasViejas(tx, d)].flat() };
    });
    // Sin esto el caso pasaría con nodos y filas viejas que no se escribieron.
    expect(r.viejas.map((v) => [v.tabla, v.codigo])).toEqual([
      ["provincia", "R1"],
      ["canton", "C1"],
      ["distrito", null],
    ]);
  });

  it("R2: renombre, código, retiro y reactivación de cada profundidad llegan a la fila vieja", async () => {
    await conRama(async ({ tx, s, p, c, d }) => {
      for (const [i, id] of [p, c, d].entries()) {
        await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET nombre = $2 WHERE id = $1`, id, `Renombrado ${i} ${s}`);
        await esperarCopiaIgual(tx, id);
        await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET codigo_oficial = $2 WHERE id = $1`, id, `K${i}`);
        await esperarCopiaIgual(tx, id);
        await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, id);
        await esperarCopiaIgual(tx, id);
        expect((await filasViejas(tx, id))[0]).toMatchObject({ nombre: `Renombrado ${i} ${s}`, codigo: `K${i}`, activo: false });
        await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = true, codigo_oficial = NULL WHERE id = $1`, id);
        await esperarCopiaIgual(tx, id);
        expect((await filasViejas(tx, id))[0]).toMatchObject({ codigo: null, activo: true });
      }
    });
  });

  it("R2: dar de alta un hijo bajo un padre retirado lo copia activo, y retirar el padre no toca la fila vieja de los hijos", async () => {
    await conRama(async ({ tx, t, s, p, c, d }) => {
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, c);
      const otro = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: c, profundidad: 3, nombre: `Otro ${s}` });
      await esperarCopiaIgual(tx, otro);
      expect((await filasViejas(tx, otro))[0].activo).toBe(true);
      expect((await filasViejas(tx, d))[0].activo).toBe(true);
      expect((await filasViejas(tx, p))[0].activo).toBe(true);
    });
  });

  it("R3: un nodo de profundidad 4 no crea ni cambia ninguna fila de provincia, cantón ni distrito", async () => {
    const r = await conRama(async ({ tx, s, d }) => {
      const tipo4 = await crearTipo(tx, "XA", "nivel_4");
      const antes = await contarViejas(tx);
      const hoja = await insertarNodo(tx, { paisId: "XA", tipoId: tipo4, padreId: d, profundidad: 4, nombre: `Sector ${s}`, codigoOficial: "S1" });
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET nombre = 'Sector renombrado', codigo_oficial = 'S2' WHERE id = $1`, hoja);
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, hoja);
      await tx.$executeRawUnsafe(`DELETE FROM nodo_geografico WHERE id = $1`, hoja);
      return { antes, despues: await contarViejas(tx), viejas: await filasViejas(tx, hoja), distrito: await filasViejas(tx, d) };
    });
    expect(r.despues).toBe(r.antes);
    expect(r.viejas).toEqual([]);
    expect(r.distrito).toHaveLength(1);
  });

  it("R4: escribir el nodo termina sin bucle (pg_trigger_depth ≤ 3), con una fila por id y el nodo intacto; y lo mismo desde la provincia por SQL", async () => {
    const r = await revertida(base, async (tx) => {
      // Un trigger de medida en las cuatro tablas, dentro de la transacción revertida (el DDL se va con ella).
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE profundidades (d int) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`CREATE FUNCTION slt46_medir_profundidad() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO profundidades VALUES (pg_trigger_depth()); RETURN NULL; END $$`);
      for (const tabla of ["nodo_geografico", "provincia", "canton", "distrito"]) {
        await tx.$executeRawUnsafe(
          `CREATE TRIGGER slt46_medir AFTER INSERT OR UPDATE OR DELETE ON ${tabla} FOR EACH ROW EXECUTE FUNCTION slt46_medir_profundidad()`,
        );
      }
      await crearPaisDePrueba(tx, "XA");
      const t = await tiposDeNivel(tx, "XA");
      const s = sufijo();
      const p = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Región ${s}` });
      const c = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: p, profundidad: 2, nombre: `Comuna ${s}` });
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET nombre = $2, activo = false WHERE id = $1`, c, `Comuna nueva ${s}`);
      for (const id of [p, c]) await esperarCopiaIgual(tx, id);
      const [nodoC] = await tx.$queryRawUnsafe<{ tipo_id: string; nombre: string; nombre_normalizado: string; activo: boolean }[]>(
        `SELECT tipo_id, nombre, nombre_normalizado, activo FROM nodo_geografico WHERE id = $1`,
        c,
      );

      // La otra dirección: SQL sobre la provincia → la sincronía de SLT-43 → la copia, que no reescribe.
      await tx.$executeRawUnsafe(`UPDATE provincia SET nombre = $2, codigo_dta = 'P9' WHERE id = $1`, p, `Región por SQL ${s}`);
      await esperarCopiaIgual(tx, p);
      const [prov] = await tx.$queryRawUnsafe<{ nombre: string; codigo: string }[]>(
        `SELECT nombre, codigo_dta AS codigo FROM provincia WHERE id = $1`,
        p,
      );
      const [maxima] = await tx.$queryRawUnsafe<{ d: number; n: number }[]>(`SELECT max(d)::int AS d, count(*)::int AS n FROM profundidades`);
      return { s, t, nodoC, prov, maxima };
    });
    expect(r.nodoC).toEqual({
      tipo_id: r.t.nivel2,
      nombre: `Comuna nueva ${r.s}`,
      nombre_normalizado: `comuna nueva ${r.s}`,
      activo: false,
    });
    expect(r.prov).toEqual({ nombre: `Región por SQL ${r.s}`, codigo: "P9" });
    // Control: el trigger de medida corrió, y los ecos sí llegaron a la segunda tabla.
    expect(r.maxima.n).toBeGreaterThan(4);
    expect(r.maxima.d).toBeGreaterThanOrEqual(2);
    expect(r.maxima.d).toBeLessThanOrEqual(3);
  });

  it("R5: si la copia choca con un único de la tabla vieja, falla la sentencia entera con 23505 y no queda ni el nodo ni la fila vieja", async () => {
    const r = await conRama(async ({ tx, s }) => {
      // Otro tipo del país: el único del nodo (país, tipo, código) no ve el «R1» de la provincia.
      const otroTipo = await crearTipo(tx, "XA", "region_especial");
      const id = randomUUID();
      const antes = await contarViejas(tx);
      const [historial] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM historial_plataforma`);
      const error = await intentar(
        tx,
        SQL_INSERTAR_NODO,
        ...argumentosDeNodo({ id, paisId: "XA", tipoId: otroTipo, padreId: null, profundidad: 1, nombre: `Especial ${s}`, codigoOficial: "R1" }),
      );
      const [historialDespues] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM historial_plataforma`);
      return { error, nodo: await filaDelNodo(tx, id), viejas: await filasViejas(tx, id), antes, despues: await contarViejas(tx), historial: historial.n, historialDespues: historialDespues.n };
    });
    expect(r.error).toBe("23505");
    expect(r.nodo).toBeUndefined();
    expect(r.viejas).toEqual([]);
    expect(r.despues).toBe(r.antes);
    expect(r.historialDespues).toBe(r.historial);
  });

  it("R6: cambiar la profundidad de una hoja de 1–3, o llevar una de 4 a 3, se rechaza con SLT46 sin escribir nada", async () => {
    const r = await conRama(async ({ tx, t, s, p, c, d }) => {
      const tipo4 = await crearTipo(tx, "XA", "nivel_4");
      const otroDistrito = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: c, profundidad: 3, nombre: `Hoja ${s}` });
      const hoja2 = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: p, profundidad: 2, nombre: `Hoja 2 ${s}` });
      const hoja4 = await insertarNodo(tx, { paisId: "XA", tipoId: tipo4, padreId: d, profundidad: 4, nombre: `Sector ${s}` });
      const antes = { otro: await filasViejas(tx, otroDistrito), nodo: await filaDelNodo(tx, otroDistrito), viejas: await contarViejas(tx) };
      const errores = {
        // El invariante de SLT-43 lo deja pasar (hoja, padre de profundidad 3 → 4): lo frena la copia.
        de3a4: await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2, profundidad = 4 WHERE id = $1`, otroDistrito, d),
        de4a3: await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2, profundidad = 3 WHERE id = $1`, hoja4, c),
        // Una hoja de profundidad 2 que pasaría a raíz.
        de2a1: await intentar(tx, `UPDATE nodo_geografico SET padre_id = NULL, profundidad = 1 WHERE id = $1`, hoja2),
      };
      return {
        errores,
        antes,
        despues: { otro: await filasViejas(tx, otroDistrito), nodo: await filaDelNodo(tx, otroDistrito) },
        hoja4: await filaDelNodo(tx, hoja4),
        viejasHoja4: await filasViejas(tx, hoja4),
      };
    });
    expect(SQLSTATE_NODO_CAMBIA_DE_TABLA_VIEJA).toBe("SLT46");
    expect(r.errores).toEqual({ de3a4: "SLT46", de4a3: "SLT46", de2a1: "SLT46" });
    expect(r.despues).toEqual({ otro: r.antes.otro, nodo: r.antes.nodo });
    expect(r.hoja4?.profundidad).toBe(4);
    expect(r.viejasHoja4).toEqual([]);
  });

  it("R7: borrar físicamente un nodo de profundidad 3 (y luego su cantón y su provincia) borra su fila vieja en la misma sentencia", async () => {
    const r = await conRama(async ({ tx, p, c, d }) => {
      const resultado: Record<string, [number, number]> = {};
      for (const [nombre, id] of [["distrito", d], ["canton", c], ["provincia", p]] as const) {
        const antes = (await filasViejas(tx, id)).length;
        await tx.$executeRawUnsafe(`DELETE FROM nodo_geografico WHERE id = $1`, id);
        resultado[nombre] = [antes, (await filasViejas(tx, id)).length];
      }
      return resultado;
    });
    // [antes, después]: la fila vieja existía y se fue con el nodo.
    expect(r).toEqual({ distrito: [1, 0], canton: [1, 0], provincia: [1, 0] });
  });

  it("R44: el trigger de orden con el cuerpo de SLT-89 y los de las zonas con el de SLT-43, y las zonas siguen apuntando solo a distrito", async () => {
    const sql = readFileSync(path.join(MIGRACIONES, "20261104120400_columnas_nodo_geografico", "migration.sql"), "utf8");
    const cuerpo = (funcion: string) => {
      const m = new RegExp(String.raw`CREATE FUNCTION ${funcion}\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;`).exec(sql);
      if (m === null) throw new Error(`no encuentro ${funcion} en la migración de SLT-43`);
      return m[1];
    };
    // SLT-89 (decision humana del 2026-11-10, requirements.md > Decisiones cerradas): SLT-89 redefine
    // `orden_nodo_geografico` con `CREATE OR REPLACE FUNCTION` (R28, T1.1), asi que su cuerpo esperado
    // sale de esa migracion. El resto de lo que afirma este caso no cambia.
    const sql89 = readFileSync(path.join(MIGRACIONES, "20261110130000_slt89_zona_nodo", "migration.sql"), "utf8");
    const cuerpoReemplazado = (funcion: string) => {
      const m = new RegExp(String.raw`CREATE OR REPLACE FUNCTION ${funcion}\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;`).exec(sql89);
      if (m === null) throw new Error(`no encuentro ${funcion} en la migración de SLT-89`);
      return m[1];
    };
    const r = await revertida(base, async (tx) => {
      const funciones = await tx.$queryRawUnsafe<{ proname: string; prosrc: string }[]>(
        `SELECT proname, prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('orden_nodo_geografico', 'zona_nodo_geografico_del_distrito') ORDER BY proname`,
      );
      const triggers = await tx.$queryRawUnsafe<{ d: string }[]>(
        `SELECT pg_get_triggerdef(t.oid) AS d FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND t.tgname IN ('orden_nodo_geografico', 'zona_distrito_nodo_geografico', 'distrito_zona_especial_nodo_geografico')
          ORDER BY t.tgname`,
      );
      const fks = await tx.$queryRawUnsafe<{ l: string }[]>(
        `SELECT conrelid::regclass::text || ' -> ' || confrelid::regclass::text || ' ' ||
                (SELECT string_agg(a.attname, ',') FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)) AS l
           FROM pg_constraint c
          WHERE c.contype = 'f' AND c.conrelid::regclass::text IN ('zona_distrito', 'distrito_zona_especial')
            AND c.confrelid::regclass::text IN ('distrito', 'canton', 'provincia', 'nodo_geografico')
          ORDER BY 1`,
      );
      return { funciones, triggers: triggers.map((t) => t.d), fks: fks.map((f) => f.l) };
    });
    expect(r.funciones).toEqual([
      { proname: "orden_nodo_geografico", prosrc: cuerpoReemplazado("orden_nodo_geografico") },
      { proname: "zona_nodo_geografico_del_distrito", prosrc: cuerpo("zona_nodo_geografico_del_distrito") },
    ]);
    expect(r.triggers).toEqual([
      'CREATE TRIGGER distrito_zona_especial_nodo_geografico BEFORE INSERT OR UPDATE OF distrito_id, nodo_geografico_id ON public.distrito_zona_especial FOR EACH ROW EXECUTE FUNCTION zona_nodo_geografico_del_distrito()',
      'CREATE TRIGGER orden_nodo_geografico BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id, nodo_geografico_id ON public.orden FOR EACH ROW EXECUTE FUNCTION orden_nodo_geografico()',
      'CREATE TRIGGER zona_distrito_nodo_geografico BEFORE INSERT OR UPDATE OF distrito_id, nodo_geografico_id ON public.zona_distrito FOR EACH ROW EXECUTE FUNCTION zona_nodo_geografico_del_distrito()',
    ]);
    expect(r.fks).toEqual([
      "distrito_zona_especial -> distrito distrito_id",
      "distrito_zona_especial -> nodo_geografico nodo_geografico_id",
      "zona_distrito -> distrito distrito_id",
      "zona_distrito -> nodo_geografico nodo_geografico_id",
    ]);
  });
});
