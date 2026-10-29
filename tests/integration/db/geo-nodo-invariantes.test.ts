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
//   · R4: guarda país, tipo, padre, profundidad, nombre, nombre normalizado, código, activo, ruta y
//     fecha de alta.
//   · R5 y R6: padre o tipo de otro país → 23503 (FK compuestas), sin guardar nada.
//   · R7: profundidad que no es la del padre + 1 (o 1 sin padre) → SQLSTATE propio `SLT43`, también
//     al mover un nodo bajo un descendiente suyo.
//   · R8: la ruta de un nodo nuevo, y la de todos sus descendientes al cambiar de padre.
//   · R9: hermanos y raíces con el mismo nombre normalizado, y código repetido en el mismo país y
//     tipo → 23505; el mismo código en dos tipos del mismo país sí entra.
//   · R11: el índice GIN sobre `ruta` existe y la consulta «bajo este ancestro» lo usa.
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
  ruta: string[];
  created_at: Date;
}

async function nodo(tx: TxDeTest, id: string): Promise<FilaNodo | undefined> {
  const filas = await tx.$queryRawUnsafe<FilaNodo[]>(`SELECT * FROM nodo_geografico WHERE id = $1`, id);
  return filas[0];
}

async function rutas(tx: TxDeTest, ids: string[]): Promise<Record<string, string[]>> {
  const filas = await tx.$queryRawUnsafe<{ id: string; ruta: string[] }[]>(
    `SELECT id, ruta FROM nodo_geografico WHERE id = ANY($1::text[])`,
    ids,
  );
  return Object.fromEntries(filas.map((f) => [f.id, f.ruta]));
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

  it("R4: guarda cada campo; el nombre normalizado y la ruta los pone la base, activo nace en true", async () => {
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
      ruta: [r.raiz],
    });
    expect(r.filaRaiz?.created_at).toBeInstanceOf(Date);
    expect(r.filaHijo).toMatchObject({
      tipo_id: r.t.nivel2,
      padre_id: r.raiz,
      profundidad: 2,
      nombre_normalizado: `comuna angel ${r.s}`,
      codigo_oficial: "07",
      ruta: [r.raiz, r.hijo],
    });
  });

  it("R4/R10: un nombre normalizado o una ruta mandados a mano se pisan al cambiar el nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const s = sufijo();
      const raiz = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Uno ${s}` });
      await tx.$executeRawUnsafe(
        `UPDATE nodo_geografico SET nombre = $2, nombre_normalizado = 'otra cosa', ruta = ARRAY['x'] WHERE id = $1`,
        raiz,
        `Dós ${s}`,
      );
      return { s, raiz, fila: await nodo(tx, raiz) };
    });
    expect(r.fila).toMatchObject({ nombre_normalizado: `dos ${r.s}`, ruta: [r.raiz] });
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

  it("R8: al cambiar de padre se rehace la ruta del nodo y la de todo su subárbol, en la misma transacción", async () => {
    const r = await revertida(base, async (tx) => {
      const t = await paisConTipos(tx, "XA");
      const nuevo = (padreId: string | null, profundidad: number, nombre: string) =>
        insertarNodo(tx, {
          paisId: "XA",
          tipoId: [t.nivel1, t.nivel2, t.nivel3, t.nivel3][profundidad - 1],
          padreId,
          profundidad,
          nombre: `${nombre} ${sufijo()}`,
        });
      // A → B → C → D (cuatro niveles: el tipo no ata la profundidad) y una segunda raíz A2 → B2.
      const a = await nuevo(null, 1, "A");
      const b = await nuevo(a, 2, "B");
      const c = await nuevo(b, 3, "C");
      const d = await nuevo(c, 4, "D");
      const hermanoDeC = await nuevo(b, 3, "C bis");
      const a2 = await nuevo(null, 1, "A2");
      const b2 = await nuevo(a2, 2, "B2");
      const antes = await rutas(tx, [a, b, c, d, hermanoDeC]);
      // Mover B (profundidad 2) arrastra dos niveles por debajo.
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET padre_id = $2 WHERE id = $1`, b, a2);
      const trasMoverB = await rutas(tx, [a, b, c, d, hermanoDeC, b2]);
      // Mover C (profundidad 3) bajo B2 arrastra solo a D.
      await tx.$executeRawUnsafe(`UPDATE nodo_geografico SET padre_id = $2 WHERE id = $1`, c, b2);
      const trasMoverC = await rutas(tx, [b, c, d, hermanoDeC]);
      return { ids: { a, b, c, d, hermanoDeC, a2, b2 }, antes, trasMoverB, trasMoverC };
    });
    const { a, b, c, d, hermanoDeC, a2, b2 } = r.ids;
    expect(r.antes).toEqual({ [a]: [a], [b]: [a, b], [c]: [a, b, c], [d]: [a, b, c, d], [hermanoDeC]: [a, b, hermanoDeC] });
    expect(r.trasMoverB).toEqual({
      [a]: [a],
      [b]: [a2, b],
      [c]: [a2, b, c],
      [d]: [a2, b, c, d],
      [hermanoDeC]: [a2, b, hermanoDeC],
      [b2]: [a2, b2],
    });
    expect(r.trasMoverC).toEqual({
      [b]: [a2, b],
      [c]: [a2, b2, c],
      [d]: [a2, b2, c, d],
      [hermanoDeC]: [a2, b, hermanoDeC],
    });
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

  it("R11: hay un índice GIN sobre `ruta` y la consulta de los nodos bajo un ancestro lo usa", async () => {
    const r = await revertida(base, async (tx) => {
      const indices = await tx.$queryRawUnsafe<{ indexdef: string }[]>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'nodo_geografico' AND indexname = 'nodo_geografico_ruta_idx'`,
      );
      const t = await paisConTipos(tx, "XA");
      const a = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `A ${sufijo()}` });
      const b = await insertarNodo(tx, { paisId: "XA", tipoId: t.nivel2, padreId: a, profundidad: 2, nombre: `B ${sufijo()}` });
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off`);
      const plan = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
        `EXPLAIN SELECT id FROM nodo_geografico WHERE ruta @> ARRAY['${a}']::text[]`,
      );
      const bajoA = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM nodo_geografico WHERE ruta @> ARRAY[$1]::text[] ORDER BY profundidad`,
        a,
      );
      return { indices: indices.map((i) => i.indexdef), plan: plan.map((p) => p["QUERY PLAN"]).join("\n"), bajoA: bajoA.map((f) => f.id), a, b };
    });
    expect(r.indices).toHaveLength(1);
    expect(r.indices[0]).toMatch(/USING gin \(ruta\)/);
    expect(r.plan).toContain("nodo_geografico_ruta_idx");
    expect(r.bajoA).toEqual([r.a, r.b]);
  });
});
