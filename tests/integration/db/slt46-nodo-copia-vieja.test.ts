import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { insertarNodo, tiposDeNivel, type TiposDeNivel } from "./_fixtures/geo-43";
import { MIGRACIONES } from "./_fixtures/ida-y-vuelta-32";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T2.2; design §2.2) — la copia nodo → geografía vieja (`20261106120100`), contra Postgres.
//   · R2: alta, renombre, código, retiro y reactivación de nodos de profundidad 1, 2 y 3 dejan la
//     fila de provincia/cantón/distrito con el mismo id, nombre, código, `activo`, padre y país.
//   · R3: un nodo de profundidad 4 no crea ni cambia ninguna fila vieja.
//   · R4, R5 y R6 (sin bucle, el único de la tabla vieja y el cambio de profundidad) se retiraron en
//     SLT-48 T5.1: la copia nodo → tabla vieja ya no existe (SLT-48 R5) y las tablas viejas son vistas.
//   · R7: borrar físicamente un nodo de 1–3 borra su fila vieja.
//   · R44: el trigger de `orden` y los de las zonas siguen con el cuerpo de SLT-43, y las zonas
//     siguen apuntando a `distrito`.
//
// Los nodos se escriben por SQL como DUEÑO dentro de una transacción que siempre se revierte (la
// misma escritura que hará `GeoRepository` en T3, sin depender de él). País de prueba `XA`: códigos
// libres, sin regla de dígitos.

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

/** R2: exactamente una fila vieja con ese id, en la tabla de su profundidad, igual al nodo. */
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

describeSiHayBase("SLT-46 — copia del nodo a la geografía vieja (R2, R3, R7, R44)", () => {
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
    // SLT-48 R9: SLT-48 vuelve a redefinir `orden_nodo_geografico` (con nodo, se conserva); el cuerpo
    // esperado sale ahora de su migracion.
    const sql89 = readFileSync(path.join(MIGRACIONES, "20261117120100_slt48_geografia_vieja_a_vistas", "migration.sql"), "utf8");
    const cuerpoReemplazado = (funcion: string) => {
      const m = new RegExp(String.raw`CREATE OR REPLACE FUNCTION ${funcion}\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;`).exec(sql89);
      if (m === null) throw new Error(`no encuentro ${funcion} en la migración de SLT-48`);
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
    // SLT-48 R4: la migracion quita las FK de `zona_distrito` y `distrito_zona_especial` a `distrito`;
    // quedan las del nodo.
    expect(r.fks).toEqual([
      "distrito_zona_especial -> nodo_geografico nodo_geografico_id",
      "zona_distrito -> nodo_geografico nodo_geografico_id",
    ]);
  });
});
