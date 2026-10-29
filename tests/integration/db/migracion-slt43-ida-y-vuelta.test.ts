import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comprobar, ejecutar as ejecutarScript, type Argumentos } from "@/scripts/geo-backfill-nodo";
import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
  MIGRACIONES,
  aplicarMigracionesHasta,
  carpetasDeMigracion,
  conectar,
  diferencias,
  ejecutar,
  foto,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";
import { crearOrdenGeo43, sembrarEscenarioGeo43, type EscenarioGeo43SinTipos } from "./_fixtures/geo-43";
import { revertida } from "./_fixtures/pais-20";

/**
 * SLT-43 (T6.1; design §3 y §7) — las seis migraciones de la geografía jerárquica, de ida y vuelta,
 * con el script de datos en medio, contra Postgres.
 *
 * - R14: con dos distritos hermanos «San José»/«San Jose», o con dos provincias del mismo país que
 *   normalizan igual, `20261029120200` aborta con `SLT43`, las cifras, y no deja nada.
 * - R13: tras la ida, cada provincia, cantón y distrito tiene su nodo con el mismo id, país, padre,
 *   nombre, código y `activo`, la profundidad de su nivel y el tipo `nivel_N` de su país. La provincia
 *   «1» y el cantón «1» del país de prueba (mismo código, otro tipo) pasan.
 * - R23: los dos enums ganan `nodo_geografico` sin que cambie ninguna fila de historial.
 * - Entre la ida y la vuelta corre `scripts/geo-backfill-nodo.ts` (`--aplicar`, `--equivalencia`,
 *   `--validar`) sobre ESTA base, que es local y desechable.
 * - R34: los seis `down.sql`, en orden inverso, dejan el esquema como antes salvo los dos valores de
 *   enum, y la geografía, las órdenes, las zonas, los cierres y el historial sin cambios. Reaplicar
 *   las seis deja lo mismo que la primera vez, y el script vuelve a correr.
 * - R35: tras la vuelta, crear y editar geografía, órdenes y zonas funciona como antes de SLT-43.
 *
 * BASE PROPIA (prefijo `slt43_`), construida aplicando las migraciones anteriores, como
 * `migracion-sl20-ida-y-vuelta.test.ts`: los downs quitan columnas de `orden` y de las zonas, y en la
 * base compartida romperían a los archivos que corren a la vez. Los datos se siembran con el fixture
 * del feature (`sembrarEscenarioGeo43`) por un Prisma propio de esta base, ANTES de SLT-43.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SLT-43. */
const PREVIA = "20261028130400_plan_cambio_enums";
const M_ENUMS = "20261029120000_geo_enums_nodo_geografico";
const M_TIPOS = "20261029120100_tipo_nivel_geografico";
const M_NODO = "20261029120200_nodo_geografico";
const M_SINCRONIA = "20261029120300_nodo_geografico_sincronia";
const M_COLUMNAS = "20261029120400_columnas_nodo_geografico";
const M_INDICES = "20261029120500_indices_nodo_geografico";
const DE_SLT43 = [M_ENUMS, M_TIPOS, M_NODO, M_SINCRONIA, M_COLUMNAS, M_INDICES];

const BASE = `slt43_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const ENUMS_QUE_SE_QUEDAN = ["historial_accion_entidad", "historial_plataforma_entidad"];

describe("SLT-43 — las seis migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SLT43].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBe(posiciones[i - 1] + 1);
    }
    for (const c of DE_SLT43) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let admin: Conexion;
let db: Conexion;
let prisma: PrismaClient;
let escenario: EscenarioGeo43SinTipos;
let antes: Foto;
let con: Foto;
let datosAntes: Foto;
let nodosDeLaPrimeraIda: Set<string>;

/** Lo que la foto del fixture no mira y estas migraciones sí crean (mismo juego que SL-20). */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || t.tgenabled::text || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  politicas: `SELECT tablename || '.' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
      coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

/** La foto del fixture (con el conteo de filas de cada tabla) y lo de `CONSULTAS_EXTRA`. */
async function fotoCompleta(): Promise<Foto> {
  const resultado = await foto(db);
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/**
 * Las filas que SLT-43 no debe mover (R23, R34), enteras y sin las columnas nuevas: así la misma
 * consulta vale antes de la ida, con las columnas puestas y después de la vuelta.
 */
const CONSULTAS_DE_DATOS: Record<string, string> = {
  provincia: `SELECT to_jsonb(t)::text AS l FROM provincia t`,
  canton: `SELECT to_jsonb(t)::text AS l FROM canton t`,
  distrito: `SELECT to_jsonb(t)::text AS l FROM distrito t`,
  orden: `SELECT (to_jsonb(t) - 'nodo_geografico_id')::text AS l FROM orden t`,
  zona_distrito: `SELECT (to_jsonb(t) - 'nodo_geografico_id')::text AS l FROM zona_distrito t`,
  distrito_zona_especial: `SELECT (to_jsonb(t) - 'nodo_geografico_id')::text AS l FROM distrito_zona_especial t`,
  cierre_detail: `SELECT (to_jsonb(t) - 'ubicacion_snapshot')::text AS l FROM cierre_detail t`,
  historial_accion: `SELECT to_jsonb(t)::text AS l FROM historial_accion t`,
  historial_plataforma: `SELECT to_jsonb(t)::text AS l FROM historial_plataforma t`,
};

async function datos(): Promise<Foto> {
  const resultado: Foto = {};
  for (const [seccion, consulta] of Object.entries(CONSULTAS_DE_DATOS)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/** R13: lo que la copia debe dar, leído de la geografía vieja. */
async function nodosEsperados(): Promise<Set<string>> {
  const { rows } = await db.query(`
    SELECT concat_ws(' | ', id, pais_id, '-', nombre, coalesce(codigo_dta, '-'), activo, 1, 'nivel_1') AS l FROM provincia
    UNION ALL SELECT concat_ws(' | ', id, pais_id, provincia_id, nombre, coalesce(codigo_dta, '-'), activo, 2, 'nivel_2') FROM canton
    UNION ALL SELECT concat_ws(' | ', id, pais_id, canton_id, nombre, coalesce(codigo_dta, '-'), activo, 3, 'nivel_3') FROM distrito`);
  return new Set(rows.map((r) => String(r.l)));
}

/** Los nodos con la clave de su tipo (los ids de los tipos son nuevos en cada ida). */
async function nodos(): Promise<Set<string>> {
  const { rows } = await db.query(`
    SELECT concat_ws(' | ', n.id, n.pais_id, coalesce(n.padre_id, '-'), n.nombre, coalesce(n.codigo_oficial, '-'),
                     n.activo, n.profundidad, t.clave) AS l
      FROM nodo_geografico n JOIN tipo_nivel_geografico t ON t.id = n.tipo_id AND t.pais_id = n.pais_id`);
  return new Set(rows.map((r) => String(r.l)));
}

async function uno(consulta: string, valores: unknown[] = []): Promise<unknown> {
  const { rows } = await db.query(consulta, valores);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

async function etiquetasDe(enumerado: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = $1 AND n.nspname = 'public'
      ORDER BY e.enumsortorder`,
    [enumerado],
  );
  return rows.map((r) => String(r.l));
}

async function ida(sufijo = ""): Promise<void> {
  for (const carpeta of DE_SLT43) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}${sufijo}`);
}

async function correrScript(a: Omit<Argumentos, "lote" | "pausaMs">): Promise<{ codigo: number; salida: string }> {
  const r = await ejecutarScript(prisma, { lote: 2, pausaMs: 0, ...a });
  return { codigo: r.codigoDeSalida, salida: r.lineas.join("\n") };
}

/** Intenta `20261029120200` y devuelve el error con el que aborta (o `null` si pasó). */
async function intentarNodo(): Promise<unknown> {
  return ejecutar(db, sqlDe(M_NODO, "migration.sql"), M_NODO).then(
    () => null,
    (e: unknown) => e,
  );
}

describeSiHayBase("SLT-43 — geografía jerárquica de ida y vuelta, con el script en medio", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_ENUMS);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDe(BASE), max: 1 }),
    }) as unknown as PrismaClient;

    // Datos de ANTES de SLT-43, confirmados: geografía de un segundo país con un distrito retirado,
    // órdenes con y sin distrito, zona, zona especial, cierres e historial de los dos tipos.
    escenario = await prisma.$transaction(async (tx) => sembrarEscenarioGeo43(tx, "XA"), { timeout: 60_000 });
    await db.query(`UPDATE distrito SET activo = false WHERE id = $1`, [escenario.geo.otroDistritoId]);
    await db.query(
      `INSERT INTO historial_accion (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, lote_id, organizacion_id)
       VALUES ($1, 'nodo_geografico_desactivado', 'distrito', $2, 'Barrio SLT-43', $3, $4)`,
      [randomUUID(), escenario.geo.otroDistritoId, randomUUID(), escenario.empresaId],
    );
    await db.query(
      `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
       VALUES ($1, 'nodo_geografico_creado', 'provincia', $2, 'Región SLT-43', 'XA')`,
      [randomUUID(), escenario.geo.provinciaId],
    );

    antes = await fotoCompleta();
    datosAntes = await datos();
    expect(datosAntes.orden.size, "sin órdenes no se prueba nada").toBeGreaterThanOrEqual(2);
    expect(datosAntes.historial_accion.size + datosAntes.historial_plataforma.size).toBeGreaterThanOrEqual(2);

    // Las dos primeras: R14 se prueba contra `20261029120200`, que necesita los tipos.
    await ejecutar(db, sqlDe(M_ENUMS, "migration.sql"), M_ENUMS);
    await ejecutar(db, sqlDe(M_TIPOS, "migration.sql"), M_TIPOS);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R14: dos distritos hermanos «San José»/«San Jose» abortan la migración con las cifras y sin dejar nada", async () => {
    const ids = [randomUUID(), randomUUID()];
    await db.query(`INSERT INTO distrito (id, nombre, canton_id) VALUES ($1, 'San José', $3), ($2, 'San Jose', $3)`, [
      ...ids,
      escenario.geo.cantonId,
    ]);
    const previo = await fotoCompleta();

    const fallo = await intentarNodo();
    expect(fallo, "la migración no abortó").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("SLT43");
    expect((fallo as ErrorDeScript).message).toContain(
      "0 grupos de provincias del mismo pais, 0 de cantones de la misma provincia, 1 de distritos del mismo canton",
    );
    expect(diferencias(await fotoCompleta(), previo), "tras el aborto").toEqual([]);

    await db.query(`DELETE FROM distrito WHERE id = ANY($1::text[])`, [ids]);
  }, 120_000);

  it("R14: dos provincias del mismo país que normalizan igual abortan la migración sin dejar nada", async () => {
    const ids = [randomUUID(), randomUUID()];
    await db.query(
      `INSERT INTO provincia (id, nombre, pais_id) VALUES ($1, 'Región Sur', 'XA'), ($2, '  REGION   sur ', 'XA')`,
      ids,
    );
    const previo = await fotoCompleta();

    const fallo = await intentarNodo();
    expect(fallo, "la migración no abortó").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("SLT43");
    expect((fallo as ErrorDeScript).message).toContain("1 grupos de provincias del mismo pais");
    expect(diferencias(await fotoCompleta(), previo), "tras el aborto").toEqual([]);

    await db.query(`DELETE FROM provincia WHERE id = ANY($1::text[])`, [ids]);
  }, 120_000);

  it("R13/R23: la ida copia cada nivel a un nodo igual, con el código «1» en dos tipos, y los enums ganan el valor sin tocar el historial", async () => {
    for (const carpeta of [M_NODO, M_SINCRONIA, M_COLUMNAS, M_INDICES]) {
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    con = await fotoCompleta();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(diferencias(con, antes).length, "las seis migraciones no cambiaron nada").toBeGreaterThan(0);

    const esperados = await nodosEsperados();
    expect(esperados.size, "la base migrada no trae la geografía de CR y XA").toBeGreaterThan(585);
    nodosDeLaPrimeraIda = await nodos();
    expect(diferencias({ n: nodosDeLaPrimeraIda }, { n: esperados }), "nodos ≠ geografía vieja").toEqual([]);

    // R9/R14: la provincia y el cantón de XA comparten el código «1» y los dos tienen nodo.
    expect(
      await uno(
        `SELECT string_agg(profundidad::text, ',' ORDER BY profundidad) FROM nodo_geografico
          WHERE pais_id = 'XA' AND codigo_oficial = '1'`,
      ),
    ).toBe("1,2");
    expect(await uno(`SELECT activo FROM nodo_geografico WHERE id = $1`, [escenario.geo.otroDistritoId])).toBe(false);

    for (const e of ENUMS_QUE_SE_QUEDAN) expect(await etiquetasDe(e), e).toContain("nodo_geografico");
    expect(diferencias(await datos(), datosAntes), "la ida movió datos viejos o historial").toEqual([]);
  }, 300_000);

  it("el script, entre la ida y la vuelta, llena las columnas nuevas, da equivalencia y valida las FK sin mover datos viejos", async () => {
    const previo = await comprobar(prisma);
    expect(previo.ordenesConDistritoDeOtroCanton + previo.ordenesConCantonDeOtraProvincia).toBe(0);
    expect(previo.pendientes.orden, "la ida no dejó órdenes pendientes").toBeGreaterThanOrEqual(2);

    const aplicado = await correrScript({ modo: "aplicar", base: BASE });
    expect(aplicado.codigo, aplicado.salida).toBe(0);
    expect(Object.values((await comprobar(prisma)).pendientes)).toEqual([0, 0, 0, 0]);
    expect(await uno(`SELECT nodo_geografico_id FROM orden WHERE id = $1`, [escenario.ordenConDistritoId])).toBe(
      escenario.geo.distritoId,
    );
    expect(await uno(`SELECT nodo_geografico_id FROM orden WHERE id = $1`, [escenario.ordenSinDistritoId])).toBe(
      escenario.geo.cantonId,
    );

    const equivalente = await correrScript({ modo: "equivalencia" });
    expect(equivalente.codigo, equivalente.salida).toBe(0);
    const validado = await correrScript({ modo: "validar", base: BASE });
    expect(validado.codigo, validado.salida).toBe(0);
    expect(
      await uno(`SELECT count(*)::int FROM pg_constraint WHERE conname LIKE '%nodo_geografico_id_fkey' AND convalidated AND connamespace = 'public'::regnamespace`),
    ).toBe(3);

    expect(diferencias(await datos(), datosAntes), "el script movió datos viejos").toEqual([]);
  }, 300_000);

  it("R34/R23: los seis down.sql, en orden inverso, dejan el esquema como antes salvo los dos valores de enum, y los datos sin cambios", async () => {
    for (const carpeta of [...DE_SLT43].reverse()) {
      await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
    }

    const d = diferencias(await fotoCompleta(), antes);
    const deEnum = d.filter((l) => ENUMS_QUE_SE_QUEDAN.some((e) => l.includes(`en tipos: ${e} `)));
    expect(
      d.filter((l) => !deEnum.includes(l)),
      "tras los seis downs",
    ).toEqual([]);
    expect(deEnum, "solo cambian los dos enums que se quedan").toHaveLength(4);
    for (const e of ENUMS_QUE_SE_QUEDAN) expect(await etiquetasDe(e), e).toContain("nodo_geografico");

    expect(diferencias(await datos(), datosAntes), "tras la vuelta").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(
      await uno(`SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname IN ('nodo_geografico', 'tipo_nivel_geografico') AND n.nspname = 'public'`),
    ).toBe(0);
    expect(
      await uno(`SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public'
        AND column_name IN ('nodo_geografico_id', 'ubicacion_snapshot')`),
    ).toBe(0);
  }, 300_000);

  it("R35: tras la vuelta se crean y editan geografía, órdenes y zonas como antes de SLT-43", async () => {
    await revertida(prisma, async (tx) => {
      // Alta de país, provincia, cantón, dos distritos, órdenes con y sin distrito, zona, zona
      // especial y cierre: el mismo fixture que siembra antes de SLT-43.
      const e = await sembrarEscenarioGeo43(tx, "XB");
      const otraOrden = await crearOrdenGeo43(tx, e, { distritoId: e.geo.otroDistritoId });

      await tx.provincia.update({ where: { id: e.geo.provinciaId }, data: { nombre: "Región renombrada" }, select: { id: true } });
      await tx.distrito.update({ where: { id: e.geo.otroDistritoId }, data: { activo: false }, select: { id: true } });
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = $1 WHERE id = $2`, e.geo.otroDistritoId, e.ordenConDistritoId);
      await tx.zonaDistrito.update({
        where: { id: e.zonaDistritoId },
        data: { distritoId: e.geo.otroDistritoId },
        select: { id: true },
      });

      const [leido] = await tx.$queryRawUnsafe<
        { provincia: string; activo: boolean; distrito_orden: string; distrito_zona: string; nueva: string; pais: string }[]
      >(
        `SELECT (SELECT nombre FROM provincia WHERE id = $1) AS provincia,
                (SELECT activo FROM distrito WHERE id = $2) AS activo,
                (SELECT distrito_id FROM orden WHERE id = $3) AS distrito_orden,
                (SELECT distrito_id FROM zona_distrito WHERE id = $4) AS distrito_zona,
                (SELECT distrito_id FROM orden WHERE id = $5) AS nueva,
                (SELECT pais_id FROM distrito WHERE id = $2) AS pais`,
        e.geo.provinciaId,
        e.geo.otroDistritoId,
        e.ordenConDistritoId,
        e.zonaDistritoId,
        otraOrden,
      );
      expect(leido).toEqual({
        provincia: "Región renombrada",
        activo: false,
        distrito_orden: e.geo.otroDistritoId,
        distrito_zona: e.geo.otroDistritoId,
        nueva: e.geo.otroDistritoId,
        // El trigger de SL-20 sigue poniendo el país desde el padre.
        pais: "XB",
      });
    });
  }, 120_000);

  it("R34: reaplicadas las seis, todo queda igual que la primera vez y el script vuelve a correr", async () => {
    await ida(" (otra vez)");
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(diferencias({ n: await nodos() }, { n: nodosDeLaPrimeraIda }), "nodos tras reaplicar").toEqual([]);
    expect(diferencias(await datos(), datosAntes), "tras reaplicar").toEqual([]);

    const aplicado = await correrScript({ modo: "aplicar", base: BASE });
    expect(aplicado.codigo, aplicado.salida).toBe(0);
    const equivalente = await correrScript({ modo: "equivalencia" });
    expect(equivalente.codigo, equivalente.salida).toBe(0);
  }, 300_000);
});
