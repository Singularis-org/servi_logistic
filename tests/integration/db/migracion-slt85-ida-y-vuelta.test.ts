import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
  aplicarMigracionesHasta,
  conectar,
  diferencias,
  ejecutar,
  foto,
  sentenciasDe,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";
import { cero } from "./_fixtures/periodo-calendario";

/**
 * SLT-85 (design §3, §3.1, §6; R17–R20) — la migración de la traza de facturación de ida y vuelta, en una
 * base PROPIA (`slt85_iv_<rand>`): el relleno toma un LOCK sobre `cobro_plataforma_movimiento` y el
 * `down.sql` tira una tabla con FK a `orden`; en la base compartida tomarían sus locks bajo los demás
 * archivos. La base de `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de la migración, con los triggers de SL-40 y SLT-83 escribiendo los movimientos:
 *   · empresa P, con un plan fijo de 100 y tipo de cobro mensual: una orden fija con guía y monto (cargo),
 *     y otra anulada en una fecha fija y recuperada (cargo, reverso, cargo). Luego pasa a un plan al 2 %
 *     con mínimo 500 y una orden de 100.000 se entrega (cargo porcentual de 2.000). Al final, su tipo de
 *     cobro pasa a anual: es el que tiene «al aplicar la migración» (P2);
 *   · empresa S, sin plan y sin valor global: una orden con cargo 0,00 «sin_configurar».
 *
 * Los casos van en orden y cada uno parte de lo que dejó el anterior (como `migracion-slt83-ida-y-vuelta`):
 * R19 intenta la migración y la deja sin aplicar; R17 la aplica; R18 la mira; R20 baja, sube y prueba
 * que la bajada se niega con una fila en vivo.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M = "20261109120000_cobro_plataforma_traza";
const BASE = `slt85_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const ANULADA_EN = "2026-04-20T12:00:00.000Z";
const GUIA = 987_654_321;

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones, triggers, privilegios, políticas. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
};

let db: Conexion;
let admin: Conexion | undefined;
let antesDeM: Foto;
let libroAntes: string;
const empresa: Record<"P" | "S", string> = { P: "", S: "" };
let fksDeS: Fks;
const orden: Record<"fija" | "recuperada" | "porcentual" | "sinConfigurar", string> = {
  fija: "",
  recuperada: "",
  porcentual: "",
  sinConfigurar: "",
};

async function fotoCompleta(): Promise<Foto> {
  const resultado = await foto(db);
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/** El libro entero: cada movimiento con todas sus columnas, en un md5 y su cuenta. */
async function libro(): Promise<string> {
  const { rows } = await db.query(
    `SELECT count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' || md5(COALESCE(string_agg(m::text, '|' ORDER BY m."id"), '')) AS l
       FROM "cobro_plataforma_movimiento" m`,
  );
  return String(rows[0].l);
}

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`se esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

interface Fks {
  organizacionId: string;
  tiendaId: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
}

async function sembrarEmpresa(nombre: string): Promise<Fks> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizacionId = await uno(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`, [
    randomUUID(),
    `SLT85 IV ${nombre} ${sufijo}`,
    `slt85-iv-${sufijo}`,
  ]);
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SLT85', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
    [randomUUID(), `slt85-iv-${sufijo}@example.com`, `slt85-iv-${sufijo}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SLT85 ${sufijo}`, organizacionId],
  );
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  return { organizacionId, tiendaId, zonaId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };
}

async function crearOrden(fks: Fks, montoCobrar: string | null = null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "monto_cobrar", "updated_at", "organizacion_id")
     SELECT $1, $2, s."id", 'SLT85', '88887777', $3, $4, $5, $6, 'Caja', $7::numeric, now(), $8
       FROM "order_status" s WHERE s."value" = 'en_preparacion'`,
    [id, `SLT85-IV-${id.slice(0, 8)}`, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, montoCobrar, fks.organizacionId],
  );
  return id;
}

async function crearPlan(costo: { fijo?: string; pct?: string; minimo?: string }): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden", "costo_por_orden_pct", "costo_por_orden_minimo")
     VALUES ($1, $2, 'publico', 50000, $3::numeric, $4::numeric, $5::numeric)`,
    [id, `SLT85 IV ${id.slice(0, 8)}`, costo.fijo ?? null, costo.pct ?? null, costo.minimo ?? null],
  );
  return id;
}

async function asignar(organizacionId: string, planId: string | null): Promise<void> {
  await db.query(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = CASE WHEN $1::text IS NULL THEN NULL
       ELSE (now() AT TIME ZONE 'UTC') - interval '1 hour' END WHERE "id" = $2`,
    [planId, organizacionId],
  );
}

async function existe(): Promise<{ tabla: boolean; funciones: number; triggerDelLibro: number }> {
  const { rows } = await db.query(
    `SELECT to_regclass('public.cobro_plataforma_traza') IS NOT NULL AS tabla,
            (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('cobro_plataforma_traza_al_registrar', 'cobro_plataforma_traza_inmutable')) AS funciones,
            (SELECT count(*)::int FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = 'cobro_plataforma_movimiento'
                AND t.tgname = 'cobro_plataforma_traza_al_registrar') AS "triggerDelLibro"`,
  );
  return rows[0] as { tabla: boolean; funciones: number; triggerDelLibro: number };
}

/** Corre un script que debe fallar: devuelve el error (o `null` si no falló). */
async function correrYCapturar(texto: string, etiqueta: string): Promise<ErrorDeScript | null> {
  try {
    await ejecutar(db, texto, etiqueta);
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

interface FilaRellenada {
  secuencia: number;
  orden_id: string;
  ok_ligada: boolean;
  tipo_movimiento: string;
  reverso_ok: boolean;
  fuente: string;
  valor_cobrado: string;
  cobrado_ok: boolean;
  tipo_cobro: string;
  porcentaje: string | null;
  minimo: string | null;
  valor_fijo: string | null;
  num_guia: number | null;
  monto_cobrar: string | null;
  estado_orden: string | null;
  plan_id: string | null;
  plan_nombre: string | null;
  cobrado_at: string;
  periodo_tipo: string | null;
  periodo_inicio_at: string | null;
  periodo_fin_at: string | null;
  reconstruido: boolean;
}

/** Cada movimiento con su traza y lo que la liga a él (empresa, orden, tipo, fecha y el cargo que anula). */
async function rellenadas(): Promise<FilaRellenada[]> {
  const { rows } = await db.query(
    `SELECT m."secuencia", m."orden_id",
            (t."organizacion_id" = m."organizacion_id" AND t."orden_id" = m."orden_id" AND t."tipo_movimiento" = m."tipo"
             AND t."fuente" = m."fuente") AS ok_ligada,
            t."tipo_movimiento"::text AS tipo_movimiento,
            (t."reverso_de" IS NOT DISTINCT FROM (SELECT tc."id" FROM "cobro_plataforma_traza" tc
               JOIN "cobro_plataforma_movimiento" mc ON mc."id" = tc."movimiento_id"
              WHERE m."tipo" = 'reverso' AND mc."orden_id" = m."orden_id" AND mc."secuencia" = m."secuencia" - 1)) AS reverso_ok,
            t."fuente"::text AS fuente, t."valor_cobrado"::text AS valor_cobrado, (t."cobrado_at" = m."ocurrido_at") AS cobrado_ok,
            t."tipo_cobro", t."porcentaje"::text AS porcentaje, t."minimo"::text AS minimo, t."valor_fijo"::text AS valor_fijo,
            t."num_guia", t."monto_cobrar"::text AS monto_cobrar, t."estado_orden", t."plan_id", t."plan_nombre",
            to_char(t."cobrado_at", ${ISO}) AS cobrado_at, t."periodo_tipo",
            to_char(t."periodo_inicio_at", ${ISO}) AS periodo_inicio_at, to_char(t."periodo_fin_at", ${ISO}) AS periodo_fin_at,
            t."reconstruido"
       FROM "cobro_plataforma_movimiento" m
       LEFT JOIN "cobro_plataforma_traza" t ON t."movimiento_id" = m."id"
      ORDER BY m."orden_id", m."secuencia"`,
  );
  return rows as unknown as FilaRellenada[];
}

/** El año de calendario de la plataforma (−06:00) que contiene un instante UTC. */
function anioDe(iso: string): { inicio: string; fin: string } {
  const anio = new Date(new Date(iso).getTime() - 6 * 3_600_000).getUTCFullYear();
  return { inicio: cero(`${anio}-01-01`), fin: cero(`${anio + 1}-01-01`) };
}

describeSiHayBase("SLT-85 R17–R20 — la migración de la traza: relleno, cierre y bajada", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    await db.query(`DELETE FROM "cobro_plataforma_tarifa"`);
    const P = await sembrarEmpresa("P");
    const S = await sembrarEmpresa("S");
    empresa.P = P.organizacionId;
    empresa.S = S.organizacionId;
    fksDeS = S;

    await asignar(P.organizacionId, await crearPlan({ fijo: "100" }));
    orden.fija = await crearOrden(P, "25000");
    await db.query(`UPDATE "orden" SET "num_guia" = $2 WHERE "id" = $1`, [orden.fija, GUIA]);
    orden.recuperada = await crearOrden(P);
    await db.query(`UPDATE "orden" SET "deleted_at" = $2::timestamp WHERE "id" = $1`, [orden.recuperada, ANULADA_EN]);
    await db.query(`UPDATE "orden" SET "deleted_at" = NULL WHERE "id" = $1`, [orden.recuperada]);

    await asignar(P.organizacionId, await crearPlan({ pct: "2", minimo: "500" }));
    orden.porcentual = await crearOrden(P, "100000");
    await db.query(
      `UPDATE "orden" SET "estatus_id" = (SELECT "id" FROM "order_status" WHERE "value" = 'entregado') WHERE "id" = $1`,
      [orden.porcentual],
    );
    await db.query(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'anual' WHERE "id" = $1`, [P.organizacionId]);

    orden.sinConfigurar = await crearOrden(S);

    antesDeM = await fotoCompleta();
    libroAntes = await libro();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R19 — la migración falla si queda un movimiento sin traza, y no deja nada aplicado", async () => {
    // Control de la siembra: seis movimientos, en el orden de las cuatro órdenes.
    expect(libroAntes.split(" ")[0]).toBe("6");

    // El bloque DO de cierre: sin la sentencia que rellena los reversos, el reverso queda sin traza.
    const sentencias = sentenciasDe(sqlDe(M, "migration.sql"));
    const sinReversos = sentencias.filter(
      (s) => !(/^INSERT INTO "cobro_plataforma_traza"/.test(s) && /WHERE m\."tipo" = 'reverso'/.test(s)),
    );
    expect(sentencias.length - sinReversos.length).toBe(1);
    const cierre = await correrYCapturar(sinReversos.join(";\n"), `${M} sin reversos`);
    expect(cierre?.sqlstate).toBe("P0001");
    expect(cierre?.message).toMatch(/SLT-85: 1 movimientos de cobro_plataforma_movimiento quedaron sin traza/);
    expect(await existe()).toEqual({ tabla: false, funciones: 0, triggerDelLibro: 0 });
    expect(diferencias(await fotoCompleta(), antesDeM)).toEqual([]);

    // (propuesta) Un reverso suelto, sin cargo que anular, tampoco tiene traza posible: la migración
    // real cae entera.
    await db.query(
      `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
       VALUES ($1, $2, $3, 3, 'reverso', 'sin_configurar', 0, now())`,
      [`slt85-suelto-${randomUUID()}`, empresa.S, orden.sinConfigurar],
    );
    try {
      const conSuelto = await fotoCompleta();
      const suelto = await correrYCapturar(sqlDe(M, "migration.sql"), M);
      expect(suelto?.sqlstate).toBe("23514");
      expect(suelto?.message).toMatch(/cobro_plataforma_traza_reverso_de/);
      expect(await existe()).toEqual({ tabla: false, funciones: 0, triggerDelLibro: 0 });
      expect(diferencias(await fotoCompleta(), conSuelto)).toEqual([]);
    } finally {
      await db.query(`DELETE FROM "cobro_plataforma_movimiento" WHERE "id" LIKE 'slt85-suelto-%'`);
    }
    expect(await libro()).toBe(libroAntes);
  });

  it("R17 — el relleno escribe una traza por movimiento con lo guardado y vacíos lo demás", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    expect(await libro()).toBe(libroAntes);
    const filas = await rellenadas();
    const deOrden = (o: string) => filas.filter((f) => f.orden_id === o);

    expect(filas).toHaveLength(6);
    // Lo que sí se guardó: empresa, orden, tipo, fuente, fecha, signo y el cargo que anula el reverso.
    expect(filas.every((f) => f.ok_ligada && f.reverso_ok && f.cobrado_ok && f.reconstruido)).toBe(true);
    // Lo que no se guardó, vacío, aunque la orden fija tenga hoy guía, monto y estado.
    expect(filas.map((f) => [f.num_guia, f.monto_cobrar, f.estado_orden, f.plan_id, f.plan_nombre])).toEqual(
      Array(6).fill([null, null, null, null, null]),
    );

    const regla = (f: FilaRellenada) => [f.tipo_movimiento, f.fuente, f.tipo_cobro, f.valor_fijo, f.porcentaje, f.minimo, f.valor_cobrado];
    expect(deOrden(orden.fija).map(regla)).toEqual([["cargo", "plan", "fijo", "100.00", null, null, "100.00"]]);
    expect(deOrden(orden.recuperada).map(regla)).toEqual([
      ["cargo", "plan", "fijo", "100.00", null, null, "100.00"],
      ["reverso", "plan", "fijo", "100.00", null, null, "-100.00"],
      ["cargo", "plan", "fijo", "100.00", null, null, "100.00"],
    ]);
    expect(deOrden(orden.recuperada)[1].cobrado_at).toBe(ANULADA_EN);
    expect(deOrden(orden.porcentual).map(regla)).toEqual([["cargo", "plan", "porcentual", null, "2.00", "500.00", "2000.00"]]);
    expect(deOrden(orden.sinConfigurar).map(regla)).toEqual([["cargo", "sin_configurar", "fijo", "0.00", null, null, "0.00"]]);
  });

  it("R18 — el período de los históricos sale del tipo de la empresa al migrar; sin plan, vacío", async () => {
    const filas = await rellenadas();
    const deP = filas.filter((f) => f.orden_id !== orden.sinConfigurar);
    expect(deP).toHaveLength(5);
    // Los movimientos se hicieron con tipo mensual; al migrar, la empresa es anual (P2).
    expect(deP.map((f) => [f.periodo_tipo, f.periodo_inicio_at, f.periodo_fin_at])).toEqual(
      deP.map((f) => {
        const { inicio, fin } = anioDe(f.cobrado_at);
        return ["anual", inicio, fin];
      }),
    );
    expect(deP.find((f) => f.cobrado_at === ANULADA_EN)).toMatchObject({
      periodo_inicio_at: cero("2026-01-01"),
      periodo_fin_at: cero("2027-01-01"),
    });
    const deS = filas.filter((f) => f.orden_id === orden.sinConfigurar);
    expect(deS.map((f) => [f.periodo_tipo, f.periodo_inicio_at, f.periodo_fin_at])).toEqual([[null, null, null]]);
  });

  it("R20 — el down baja sin tocar movimientos, y subir otra vez rehace el relleno", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(await existe()).toEqual({ tabla: false, funciones: 0, triggerDelLibro: 0 });
    expect(await libro()).toBe(libroAntes);
    // Esquema, funciones, triggers, privilegios, políticas y filas: los de antes de la migración.
    expect(diferencias(await fotoCompleta(), antesDeM)).toEqual([]);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    const filas = await rellenadas();
    expect(filas).toHaveLength(6);
    expect(filas.every((f) => f.reconstruido && f.ok_ligada && f.reverso_ok)).toBe(true);
  });

  it("R20 — el down se niega si hay una fila en vivo, sin cambiar nada", async () => {
    const enVivo = await crearOrden(fksDeS);
    const { rows } = await db.query(`SELECT "reconstruido" FROM "cobro_plataforma_traza" WHERE "orden_id" = $1`, [enVivo]);
    expect(rows).toEqual([{ reconstruido: false }]);

    const con = await fotoCompleta();
    const libroCon = await libro();
    const negado = await correrYCapturar(sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(negado?.sqlstate).toBe("P0001");
    expect(negado?.message).toMatch(/SLT-85 down: hay trazas escritas en vivo/);
    expect(await existe()).toEqual({ tabla: true, funciones: 2, triggerDelLibro: 1 });
    expect(await libro()).toBe(libroCon);
    expect(diferencias(await fotoCompleta(), con)).toEqual([]);
  });
});
