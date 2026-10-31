import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import {
  SQL_INSERTAR_NODO,
  argumentosDeNodo,
  insertarNodo,
  tiposDeNivel,
  type NodoNuevo,
  type TiposDeNivel,
} from "./_fixtures/geo-43";
import { intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T2.2; design §2.2) — las invariantes de `nodo_geografico` contra Postgres real.
//   · R4: guarda país, tipo, padre, profundidad, nombre, nombre normalizado, código, activo y fecha de
//     alta; sin columna de ancestros (enmienda 2026-10-29): el árbol es `padre_id` y `profundidad`.
//   · R5 y R6: padre o tipo de otro país → 23503 (FK compuestas), sin guardar nada.
//   · R7: profundidad que no es la del padre + 1 (o 1 sin padre), o cambiar la profundidad de un nodo
//     con hijos → SQLSTATE propio `SLT43`; así no hay ciclos (colgar un nodo de su nieto con la
//     profundidad «correcta» se rechaza). Mover un nodo con hijos a otro padre del mismo nivel entra.
//     Colgarse de sí mismo: el CHECK `nodo_geografico_padre_id_check` (23514) en un UPDATE; en un INSERT
//     llega antes el trigger (SLT43), que rechaza todo padre aún no encontrado, también en un INSERT de
//     varias filas desordenado o cruzado (la FK, que se comprueba al final de la sentencia, no basta).
//   · R9: hermanos y raíces con el mismo nombre normalizado, y código repetido en el mismo país y
//     tipo → 23505; el mismo código en dos tipos del mismo país sí entra.
//   · R8 y R11 retirados (enmienda 2026-10-29): se comprueba que no quedan su columna, su índice ni su
//     trigger.
//
// Los nodos se insertan a mano como dueño, en países de prueba `XA`/`XB`, dentro de una transacción
// que se revierte. Los nombres llevan un sufijo para no chocar con la geografía que traiga la base.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface FilaNodo {
  id: string;
  pais_id: string;
  tipo_id: string;
  padre_id: string | null;
  profundidad: number;
  nombre: string;
  nombre_normalizado: string;
  codigo_oficial: string | null;
  activo: boolean;
  created_at: Date;
}

async function nodo(tx: TxDeTest, id: string): Promise<FilaNodo | undefined> {
  const filas = await tx.$queryRawUnsafe<FilaNodo[]>(`SELECT * FROM nodo_geografico WHERE id = $1`, id);
  return filas[0];
}

/** El SQLSTATE de insertar `n` en un SAVEPOINT, o `null` si entró. */
function intentarNodo(tx: TxDeTest, n: NodoNuevo): Promise<string | null> {
  return intentar(tx, SQL_INSERTAR_NODO, ...argumentosDeNodo({ ...n, id: n.id ?? randomUUID() }));
}

async function paisConTipos(tx: TxDeTest, codigo: "XA" | "XB"): Promise<TiposDeNivel> {
  await crearPaisDePrueba(tx, codigo);
  return tiposDeNivel(tx, codigo);
}

const sufijo = () => randomUUID().replace(/-/g, "").slice(0, 8);

describeSiHayBase("SLT-43 — nodo_geografico: invariantes", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R4: guarda cada campo; el nombre normalizado lo pone la base, activo nace en true", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const s = sufijo();
      const raiz = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `  Región   Ñandú ${s} ` });
      const hijo = await insertarNodo(tx, {
        paisId: "XA",
        tipoId: t.nivel2,
        padreId: raiz,
        profundidad: 2,
        nombre: `Comuna Ángel ${s}`,
        codigoOficial: "07",
      });
      return { t, s, raiz, hijo, filaRaiz: await nodo(tx, raiz), filaHijo: await nodo(tx, hijo) };
    });
    expect(r.filaRaiz).toMatchObject({
      pais_id: "XA",
      tipo_id: r.t.nivel1,
      padre_id: null,
      profundidad: 1,
      nombre: `  Región   Ñandú ${r.s} `,
      nombre_normalizado: `region nandu ${r.s}`,
      codigo_oficial: null,
      activo: true,
    });
    expect(r.filaRaiz?.created_at).toBeInstanceOf(Date);
    expect(r.filaHijo).toMatchObject({
      tipo_id: r.t.nivel2,
      padre_id: r.raiz,
      profundidad: 2,
      nombre_normalizado: `comuna angel ${r.s}`,
      codigo_oficial: "07",
    });
  });

  it("R4: la tabla no tiene columna `ruta` (enmienda 2026-10-29)", async () => {
    const columnas = await base.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'nodo_geografico' AND column_name = 'ruta'`,
    );
    expect(columnas).toEqual([]);
  });

  it("R4/R10: un nombre normalizado mandado a mano se pisa al cambiar el nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const s = sufijo();
      const raiz = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Uno ${s}` });
      await tx.$executeRawUnsafe(
        `UPDATE nodo_geografico SET nombre = $2, nombre_normalizado = 'otra cosa' WHERE id = $1`,
        raiz,
        `Dós ${s}`,
      );
      return { s, raiz, fila: await nodo(tx, raiz) };
    });
    expect(r.fila).toMatchObject({ nombre_normalizado: `dos ${r.s}` });
  });

  it("R5: un padre de otro país se rechaza con 23503 y no guarda nada", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisConTipos(tx, "XA");
      const xb = await paisConTipos(tx, "XB");
      const raizXB = await insertarNodo(tx, { paisId: "XB", tipoId: xb.nivel1, padreId: null, profundidad: 1, nombre: `Raíz XB ${sufijo()}` });
      const id = randomUUID();
      const error = await intentarNodo(tx, { id, paisId: "XA", tipoId: xa.nivel2, padreId: raizXB, profundidad: 2, nombre: `Hijo ${sufijo()}` });
      return { error, guardado: (await nodo(tx, id)) !== undefined };
    });
    expect(r).toEqual({ error: "23503", guardado: false });
  });

  it("R6: un tipo de otro país se rechaza con 23503 y no guarda nada", async () => {
    const r = await revertida(base, async (tx) => {
      await paisConTipos(tx, "XA");
      const xb = await paisConTipos(tx, "XB");
      const id = randomUUID();
      const error = await intentarNodo(tx, { id, paisId: "XA", tipoId: xb.nivel1, padreId: null, profundidad: 1, nombre: `Raíz ${sufijo()}` });
      return { error, guardado: (await nodo(tx, id)) !== undefined };
    });
    expect(r).toEqual({ error: "23503", guardado: false });
  });

  it("R7: profundidad mala al crear o al mover, también bajo un descendiente propio → SLT43, sin cambios", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const a = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A ${sufijo()}` });
      const b = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a, profundidad: 2, nombre: `B ${sufijo()}` });
      const c = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: b, profundidad: 3, nombre: `C ${sufijo()}` });
      const raizProfunda = randomUUID();
      const hijoSaltado = randomUUID();
      const errores = {
        raizConProfundidad2: await intentarNodo(tx, { id: raizProfunda, paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 2, nombre: `R ${sufijo()}` }),
        hijoQueSaltaUnNivel: await intentarNodo(tx, { id: hijoSaltado, paisId: "XA", tipoId: t.nivel3, padreId: a, profundidad: 3, nombre: `S ${sufijo()}` }),
        moverASubirDeNivel: await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2 WHERE id = $1`, c, a),
        moverBajoSuDescendiente: await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2 WHERE id = $1`, b, c),
        cambiarSoloLaProfundidad: await intentar(tx, `UPDATE nodo_geografico SET profundidad = 5 WHERE id = $1`, c),
      };
      const creados = [await nodo(tx, raizProfunda), await nodo(tx, hijoSaltado)].filter(Boolean).length;
      return { errores, creados, b: await nodo(tx, b), c: await nodo(tx, c), a, ids: { b } };
    });
    expect(r.errores).toEqual({
      raizConProfundidad2: "SLT43",
      hijoQueSaltaUnNivel: "SLT43",
      moverASubirDeNivel: "SLT43",
      moverBajoSuDescendiente: "SLT43",
      cambiarSoloLaProfundidad: "SLT43",
    });
    expect(r.creados).toBe(0);
    expect(r.b).toMatchObject({ padre_id: r.a, profundidad: 2 });
    expect(r.c).toMatchObject({ padre_id: r.ids.b, profundidad: 3 });
  });

  it("R7: cambiar la profundidad de un nodo con hijos → SLT43, aunque la nueva cuadre con su padre nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const a = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A ${sufijo()}` });
      const b = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a, profundidad: 2, nombre: `B ${sufijo()}` });
      await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: b, profundidad: 3, nombre: `C ${sufijo()}` });
      const a2 = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A2 ${sufijo()}` });
      const b2 = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a2, profundidad: 2, nombre: `B2 ${sufijo()}` });
      // B (con un hijo) bajo B2 con profundidad 3: cuadra con B2, pero dejaría a su hijo en 3.
      const error = await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2, profundidad = 3 WHERE id = $1`, b, b2);
      return { error, a, b: await nodo(tx, b) };
    });
    expect(r.error).toBe("SLT43");
    expect(r.b).toMatchObject({ padre_id: r.a, profundidad: 2 });
  });

  it("R7: colgar un nodo de su nieto con la profundidad del nieto + 1 → SLT43 y sin cambios (sin ciclos)", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const a = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A ${sufijo()}` });
      const b = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a, profundidad: 2, nombre: `B ${sufijo()}` });
      const nieto = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: b, profundidad: 3, nombre: `C ${sufijo()}` });
      // Cuadra con el padre nuevo (3 + 1 = 4); sin la regla de los hijos quedaría A → B → C → A.
      const error = await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2, profundidad = 4 WHERE id = $1`, a, nieto);
      return { error, ids: { a, b }, filas: { a: await nodo(tx, a), b: await nodo(tx, b), nieto: await nodo(tx, nieto) } };
    });
    expect(r.error).toBe("SLT43");
    expect(r.filas.a).toMatchObject({ padre_id: null, profundidad: 1 });
    expect(r.filas.b).toMatchObject({ padre_id: r.ids.a, profundidad: 2 });
    expect(r.filas.nieto).toMatchObject({ padre_id: r.ids.b, profundidad: 3 });
  });

  it("R7: crear un nodo colgado de sí mismo → SLT43 (su padre aún no existe) y no guarda nada; el CHECK existe", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const id = randomUUID();
      const errores = {
        profundidad1: await intentarNodo(tx, { id, paisId: "XA", tipoId: t.nivel1, padreId: id, profundidad: 1, nombre: `Yo ${sufijo()}` }),
        profundidad2: await intentarNodo(tx, { id, paisId: "XA", tipoId: t.nivel2, padreId: id, profundidad: 2, nombre: `Yo ${sufijo()}` }),
      };
      const check = await tx.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_constraintdef(c."oid") AS "def" FROM "pg_constraint" c
           JOIN "pg_class" t ON t."oid" = c."conrelid" JOIN "pg_namespace" n ON n."oid" = t."relnamespace"
          WHERE c."conname" = 'nodo_geografico_padre_id_check' AND n."nspname" = 'public'`,
      );
      return { errores, guardado: (await nodo(tx, id)) !== undefined, check: check.map((c) => c.def) };
    });
    expect(r.errores).toEqual({ profundidad1: "SLT43", profundidad2: "SLT43" });
    expect(r.guardado).toBe(false);
    expect(r.check).toEqual(["CHECK ((padre_id IS DISTINCT FROM id))"]);
  });

  it("R7: colgar de sí misma una raíz sin hijos con la profundidad «correcta» → 23514 (CHECK) y sin cambios", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const raiz = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `R ${sufijo()}` });
      // El trigger lee la versión vieja de la fila como padre (profundidad 1) y 2 = 1 + 1 cuadra.
      const error = await intentar(tx, `UPDATE nodo_geografico SET padre_id = id, profundidad = 2 WHERE id = $1`, raiz);
      return { error, fila: await nodo(tx, raiz) };
    });
    expect(r.error).toBe("23514");
    expect(r.fila).toMatchObject({ padre_id: null, profundidad: 1 });
  });

  it("R7: un INSERT de dos filas colgadas una de otra (ciclo) → SLT43 y no queda ninguna", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const a = randomUUID();
      const b = randomUUID();
      // La FK autorreferente se comprueba al final de la sentencia y la cumplirían las dos filas: sin
      // rechazar al padre «aún no encontrado», A (prof 1, padre B) y B (prof 2, padre A) quedarían en ciclo.
      const error = await intentar(
        tx,
        `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
           VALUES ($1, 'XA', $3, $2, 1, $4, ''), ($2, 'XA', $3, $1, 2, $5, '')`,
        a,
        b,
        t.nivel1,
        `A ${sufijo()}`,
        `B ${sufijo()}`,
      );
      return { error, quedan: [await nodo(tx, a), await nodo(tx, b)].filter(Boolean).length };
    });
    expect(r).toEqual({ error: "SLT43", quedan: 0 });
  });

  it("R7: un INSERT de varias filas con el hijo antes que su padre → SLT43; en orden, entra", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const ids = { padre: randomUUID(), hijo: randomUUID(), padre2: randomUUID(), hijo2: randomUUID() };
      const sql = `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
           VALUES ($1, 'XA', $2, $3, $4, $5, ''), ($6, 'XA', $7, $8, $9, $10, '')`;
      // Sin el rechazo, el hijo entraría con profundidad 7 bajo una raíz.
      const desordenado = await intentar(tx, sql, ids.hijo, t.nivel2, ids.padre, 7, `H ${sufijo()}`, ids.padre, t.nivel1, null, 1, `P ${sufijo()}`);
      const ordenado = await intentar(tx, sql, ids.padre2, t.nivel1, null, 1, `P2 ${sufijo()}`, ids.hijo2, t.nivel2, ids.padre2, 2, `H2 ${sufijo()}`);
      return {
        desordenado,
        ordenado,
        quedanDesordenado: [await nodo(tx, ids.padre), await nodo(tx, ids.hijo)].filter(Boolean).length,
        hijo2: await nodo(tx, ids.hijo2),
        padre2: ids.padre2,
      };
    });
    expect(r).toMatchObject({ desordenado: "SLT43", ordenado: null, quedanDesordenado: 0 });
    expect(r.hijo2).toMatchObject({ padre_id: r.padre2, profundidad: 2 });
  });

  it("R7: mover un nodo con hijos a otro padre del mismo nivel entra y sus hijos quedan igual", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const a = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A ${sufijo()}` });
      const b = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a, profundidad: 2, nombre: `B ${sufijo()}` });
      const c = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: b, profundidad: 3, nombre: `C ${sufijo()}` });
      const cBis = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel3, padreId: b, profundidad: 3, nombre: `C bis ${sufijo()}` });
      const a2 = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A2 ${sufijo()}` });
      const error = await intentar(tx, `UPDATE nodo_geografico SET padre_id = $2 WHERE id = $1`, b, a2);
      return { error, ids: { b, a2 }, filas: { b: await nodo(tx, b), c: await nodo(tx, c), cBis: await nodo(tx, cBis) } };
    });
    expect(r.error).toBeNull();
    expect(r.filas.b).toMatchObject({ padre_id: r.ids.a2, profundidad: 2 });
    expect(r.filas.c).toMatchObject({ padre_id: r.ids.b, profundidad: 3 });
    expect(r.filas.cBis).toMatchObject({ padre_id: r.ids.b, profundidad: 3 });
  });

  it("R9: hermanos o raíces con el mismo nombre normalizado y código repetido por país y tipo → 23505", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisConTipos(tx, "XA");
      const xb = await paisConTipos(tx, "XB");
      const s = sufijo();
      const raiz = await insertarNodo(tx, { paisId: "XA", tipoId: xa.nivel1, padreId: null, profundidad: 1, nombre: `San José ${s}`, codigoOficial: "1" });
      const otraRaiz = await insertarNodo(tx, { paisId: "XA", tipoId: xa.nivel1, padreId: null, profundidad: 1, nombre: `Otra ${s}`, codigoOficial: "2" });
      await insertarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: raiz, profundidad: 2, nombre: `Centro ${s}`, codigoOficial: "10" });
      return {
        raizHomonimaNormalizada: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel1, padreId: null, profundidad: 1, nombre: `san  JOSE ${s}` }),
        hermanoHomonimoNormalizado: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: raiz, profundidad: 2, nombre: ` Céntro ${s}` }),
        codigoRepetidoMismoTipo: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel1, padreId: null, profundidad: 1, nombre: `Tercera ${s}`, codigoOficial: "1" }),
        // Lo que sí entra:
        mismoNombreEnOtroPadre: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: otraRaiz, profundidad: 2, nombre: `Centro ${s}` }),
        mismaRaizEnOtroPais: await intentarNodo(tx, { paisId: "XB", tipoId: xb.nivel1, padreId: null, profundidad: 1, nombre: `San José ${s}`, codigoOficial: "1" }),
        mismoCodigoEnOtroTipo: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: otraRaiz, profundidad: 2, nombre: `Cuatro ${s}`, codigoOficial: "1" }),
        dosSinCodigo: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: otraRaiz, profundidad: 2, nombre: `Cinco ${s}` }),
        otroSinCodigo: await intentarNodo(tx, { paisId: "XA", tipoId: xa.nivel2, padreId: otraRaiz, profundidad: 2, nombre: `Seis ${s}` }),
      };
    });
    expect(r).toEqual({
      raizHomonimaNormalizada: "23505",
      hermanoHomonimoNormalizado: "23505",
      codigoRepetidoMismoTipo: "23505",
      mismoNombreEnOtroPadre: null,
      mismaRaizEnOtroPais: null,
      mismoCodigoEnOtroTipo: null,
      dosSinCodigo: null,
      otroSinCodigo: null,
    });
  });

  it("R8/R11 retirados: no quedan el índice ni el trigger de la columna de ancestros", async () => {
    const indices = await base.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'nodo_geografico_ruta_idx'`,
    );
    const triggers = await base.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT t."tgname" AS "tgname" FROM "pg_trigger" t JOIN "pg_class" c ON c."oid" = t."tgrelid" JOIN "pg_namespace" n ON n."oid" = c."relnamespace" WHERE t."tgname" = 'nodo_geografico_ruta_descendientes' AND n."nspname" = 'public'`,
    );
    expect(indices).toEqual([]);
    expect(triggers).toEqual([]);
  });
});
