import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
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

/**
 * SLT-126 (design §1, §5.1; R6–R10, R12) — la migración que retira el valor propio de la empresa, de ida y
 * vuelta, en una base PROPIA (`slt126_iv_<rand>`): borra y vuelve a crear una columna de `organizacion` y
 * reemplaza la función de la regla vigente; en la base compartida tomaría sus locks bajo los demás archivos.
 * La base de `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de la migración, con el global en 50,00 y los triggers de SL-40, SLT-83 y SLT-85
 * escribiendo movimientos y trazas:
 *   · empresa E: valor propio 80,00 y plan fijo de 100,00 → O1 con cargo 80,00 «empresa»;
 *   · empresa G: valor propio 80,00 y sin plan → O2 con cargo 80,00 «empresa»;
 *   · empresa P: valor propio 80,00 y plan al 2 % (mínimo 500) → OP con cargo 80,00 «empresa» (la
 *     excepción ganaba al porcentual, SLT-83 R7).
 *
 * Los casos van en orden y cada uno parte de lo que dejó el anterior (como `migracion-slt83-ida-y-vuelta`):
 * R9/R10 suben y miran; R6/R7 crean órdenes nuevas; R8 anula y recupera una orden antigua; R12 baja.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261112120000_bug_report_image";
const M = "20261113120000_cobro_plataforma_sin_valor_empresa";
const BASE = `slt126_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

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

interface Fks {
  organizacionId: string;
  tiendaId: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
}

let db: Conexion;
let admin: Conexion | undefined;
const empresa: Record<"E" | "G" | "P", Fks> = {} as Record<"E" | "G" | "P", Fks>;
const orden: Record<"O1" | "O2" | "OP", string> = { O1: "", O2: "", OP: "" };
let antesDeM: Foto;
let libroAntes: Libro;
let md5TarifaAntes: string;

/** La foto del esquema sin las filas (las órdenes de los casos las mueven), con funciones, triggers y privilegios. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

interface Libro {
  /** Cuenta, Σ con signo y md5 de cada fila completa de `cobro_plataforma_movimiento`. */
  movimientos: string;
  /** Cuenta, Σ de `valor_cobrado` y md5 de cada fila completa de `cobro_plataforma_traza`. */
  trazas: string;
  /** Por empresa: Σ con signo de sus movimientos y de sus trazas. */
  porEmpresa: string[];
  /** Por empresa: la deuda de SL-45 R13 (Σ cargos − Σ reversos − Σ pagos vigentes). */
  deuda: string[];
}

/** Todo lo que R9 dice que la migración no mueve. */
async function libro(): Promise<Libro> {
  const { rows: m } = await db.query(
    `SELECT count(*)::text || ' ' || COALESCE(sum(CASE WHEN "tipo" = 'cargo' THEN "monto" ELSE -"monto" END), 0)::text
            || ' ' || md5(COALESCE(string_agg(m::text, '|' ORDER BY m."id"), '')) AS l
       FROM "cobro_plataforma_movimiento" m`,
  );
  const { rows: t } = await db.query(
    `SELECT count(*)::text || ' ' || COALESCE(sum("valor_cobrado"), 0)::text
            || ' ' || md5(COALESCE(string_agg(t::text, '|' ORDER BY t."id"), '')) AS l
       FROM "cobro_plataforma_traza" t`,
  );
  const { rows: porEmpresa } = await db.query(
    `SELECT o."id" || ' ' ||
            COALESCE((SELECT sum(CASE WHEN m."tipo" = 'cargo' THEN m."monto" ELSE -m."monto" END)
                        FROM "cobro_plataforma_movimiento" m WHERE m."organizacion_id" = o."id"), 0)::text || ' ' ||
            COALESCE((SELECT sum(t."valor_cobrado") FROM "cobro_plataforma_traza" t WHERE t."organizacion_id" = o."id"), 0)::text AS l
       FROM "organizacion" o ORDER BY o."id"`,
  );
  const { rows: deuda } = await db.query(
    `SELECT o."id" || ' ' || (
              COALESCE((SELECT sum(CASE WHEN m."tipo" = 'cargo' THEN m."monto" ELSE -m."monto" END)
                          FROM "cobro_plataforma_movimiento" m WHERE m."organizacion_id" = o."id"), 0)
            - COALESCE((SELECT sum(w."monto") FROM "wallet_movimiento" w
                         WHERE w."organizacion_id" = o."id" AND w."tipo" = 'egreso' AND w."categoria" = 'egreso_pago_plataforma'
                           AND NOT EXISTS (SELECT 1 FROM "wallet_movimiento" c
                                            WHERE c."organizacion_id" = o."id" AND c."tipo" = 'ingreso'
                                              AND c."categoria" = 'ingreso_ajuste' AND c."origen_tipo" = 'gasto'
                                              AND c."origen_id" = w."id")), 0)
            )::numeric(14, 2)::text AS l
       FROM "organizacion" o ORDER BY o."id"`,
  );
  return {
    movimientos: String(m[0].l),
    trazas: String(t[0].l),
    porEmpresa: porEmpresa.map((r) => String(r.l)),
    deuda: deuda.map((r) => String(r.l)),
  };
}

async function md5Tarifa(): Promise<string> {
  const { rows } = await db.query(
    `SELECT md5(pg_get_functiondef('cobro_plataforma_tarifa_de(text)'::regprocedure)) AS l`,
  );
  return String(rows[0].l);
}

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`se esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

async function sembrarEmpresa(nombre: string): Promise<Fks> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizacionId = await uno(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`, [
    randomUUID(),
    `SLT126 IV ${nombre} ${sufijo}`,
    `slt126-iv-${sufijo}`,
  ]);
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SLT126', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
    [randomUUID(), `slt126-iv-${sufijo}@example.com`, `slt126-iv-${sufijo}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SLT126 ${sufijo}`, organizacionId],
  );
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  return { organizacionId, tiendaId, zonaId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };
}

async function crearPlan(costo: { fijo?: string; pct?: string; minimo?: string }): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden", "costo_por_orden_pct", "costo_por_orden_minimo")
     VALUES ($1, $2, 'publico', 50000, $3::numeric, $4::numeric, $5::numeric)`,
    [id, `SLT126 IV ${id.slice(0, 8)}`, costo.fijo ?? null, costo.pct ?? null, costo.minimo ?? null],
  );
  return id;
}

async function asignar(organizacionId: string, planId: string): Promise<void> {
  await db.query(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
    [planId, organizacionId],
  );
}

/** El valor propio, como lo escribía el superadmin antes de SLT-126 (dueño). */
async function fijarValorPropio(organizacionId: string, monto: string): Promise<void> {
  await db.query(`UPDATE "organizacion" SET "cobro_plataforma_por_orden" = $2::numeric WHERE "id" = $1`, [organizacionId, monto]);
}

async function crearOrden(fks: Fks, montoCobrar: string | null = null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "monto_cobrar", "updated_at", "organizacion_id")
     SELECT $1, $2, s."id", 'SLT126', '88887777', $3, $4, $5, $6, 'Caja', $7::numeric, now(), $8
       FROM "order_status" s WHERE s."value" = 'en_preparacion'`,
    [id, `SLT126-IV-${id.slice(0, 8)}`, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, montoCobrar, fks.organizacionId],
  );
  return id;
}

/** Cada movimiento de la orden como «tipo monto fuente», en orden. */
async function movimientos(ordenId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "tipo"::text || ' ' || "monto"::text || ' ' || "fuente"::text AS l FROM "cobro_plataforma_movimiento"
      WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    [ordenId],
  );
  return rows.map((r) => String(r.l));
}

/** Cada traza de la orden como «tipo fuente valor_cobrado», en el orden de su movimiento. */
async function trazas(ordenId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT t."tipo_movimiento"::text || ' ' || t."fuente"::text || ' ' || t."valor_cobrado"::text AS l
       FROM "cobro_plataforma_traza" t JOIN "cobro_plataforma_movimiento" m ON m."id" = t."movimiento_id"
      WHERE t."orden_id" = $1 ORDER BY m."secuencia"`,
    [ordenId],
  );
  return rows.map((r) => String(r.l));
}

/** ¿Existen la columna y su CHECK, y cuántas funciones de `public` la nombran en su definición? */
async function rastroDelValorPropio(): Promise<{ columna: boolean; check: boolean; funcionesQueLaLeen: number }> {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'organizacion'
                       AND column_name = 'cobro_plataforma_por_orden') AS columna,
            EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_schema = 'public' AND table_name = 'organizacion'
                       AND constraint_name = 'organizacion_cobro_plataforma_por_orden_check') AS "check",
            (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
                AND pg_get_functiondef(p.oid) LIKE '%cobro_plataforma_por_orden%') AS "funcionesQueLaLeen"`,
  );
  return rows[0] as { columna: boolean; check: boolean; funcionesQueLaLeen: number };
}

async function anular(ordenId: string, anulada: boolean): Promise<void> {
  await db.query(
    `UPDATE "orden" SET "deleted_at" = CASE WHEN $2 THEN now() AT TIME ZONE 'UTC' ELSE NULL END WHERE "id" = $1`,
    [ordenId, anulada],
  );
}

describe("SLT-126 — la migración en disco", () => {
  it("R10, R12: va detrás de la anterior y trae su down.sql, que vuelve a crear la columna", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M)).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    expect(carpetas.indexOf(M_ANTERIOR)).toBeGreaterThanOrEqual(0);
    expect(sqlDe(M, "migration.sql")).toMatch(/DROP COLUMN "cobro_plataforma_por_orden"/);
    expect(sqlDe(M, "down.sql")).toMatch(/ADD COLUMN "cobro_plataforma_por_orden" DECIMAL\(12,2\)/);
  });
});

describeSiHayBase("SLT-126 R6–R10, R12 — sin valor propio: la subida, las órdenes nuevas, lo ya cobrado y la bajada", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    await db.query(
      `INSERT INTO "cobro_plataforma_tarifa" ("id", "monto", "updated_at") VALUES (true, 50, now())
       ON CONFLICT ("id") DO UPDATE SET "monto" = EXCLUDED."monto", "updated_at" = now()`,
    );
    empresa.E = await sembrarEmpresa("E");
    empresa.G = await sembrarEmpresa("G");
    empresa.P = await sembrarEmpresa("P");
    await asignar(empresa.E.organizacionId, await crearPlan({ fijo: "100" }));
    await asignar(empresa.P.organizacionId, await crearPlan({ pct: "2", minimo: "500" }));
    for (const e of [empresa.E, empresa.G, empresa.P]) await fijarValorPropio(e.organizacionId, "80");

    orden.O1 = await crearOrden(empresa.E);
    orden.O2 = await crearOrden(empresa.G);
    orden.OP = await crearOrden(empresa.P, "100000");

    antesDeM = await fotoSinFilas();
    libroAntes = await libro();
    md5TarifaAntes = await md5Tarifa();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R9: subir no crea, cambia ni borra movimientos ni trazas, y la deuda de cada empresa sigue igual", async () => {
    // Control de la siembra: con la regla vieja, las tres órdenes se cargaron con el valor propio.
    expect([await movimientos(orden.O1), await movimientos(orden.O2), await movimientos(orden.OP)]).toEqual([
      ["cargo 80.00 empresa"],
      ["cargo 80.00 empresa"],
      ["cargo 80.00 empresa"],
    ]);
    expect(libroAntes.movimientos.split(" ")[0]).toBe("3");
    expect(libroAntes.trazas.split(" ")[0]).toBe("3");
    expect(await rastroDelValorPropio()).toEqual({ columna: true, check: true, funcionesQueLaLeen: 1 });

    await ejecutar(db, sqlDe(M, "migration.sql"), M);

    expect(await libro()).toEqual(libroAntes);
    expect(await trazas(orden.O1)).toEqual(["cargo empresa 80.00"]);
  });

  it("R10: la columna y su CHECK ya no existen, ninguna función la lee y el enum conserva «empresa»", async () => {
    expect(await rastroDelValorPropio()).toEqual({ columna: false, check: false, funcionesQueLaLeen: 0 });
    const { rows } = await db.query(`SELECT enum_range(NULL::cobro_plataforma_fuente)::text AS l`);
    expect(String(rows[0].l)).toBe("{empresa,global,sin_configurar,plan}");
    // La función cambió (control: si no, R12 compararía dos md5 iguales sin probar nada).
    expect(await md5Tarifa()).not.toBe(md5TarifaAntes);
  });

  it("R6, R7: la empresa con valor propio y plan fijo se carga por su plan (100,00 «plan»)", async () => {
    const o3 = await crearOrden(empresa.E);
    expect(await movimientos(o3)).toEqual(["cargo 100.00 plan"]);
    expect(await trazas(o3)).toEqual(["cargo plan 100.00"]);
  });

  it("R6, R7: la empresa con valor propio y sin plan se carga por el global (50,00 «global»)", async () => {
    const o4 = await crearOrden(empresa.G);
    expect(await movimientos(o4)).toEqual(["cargo 50.00 global"]);
    expect(await trazas(o4)).toEqual(["cargo global 50.00"]);
  });

  it("R6, R7: la empresa con valor propio y plan porcentual congela sin cargo y se cobra al entregarse", async () => {
    const o6 = await crearOrden(empresa.P, "100000");
    expect(await movimientos(o6)).toEqual([]);
    const { rows } = await db.query(
      `SELECT "porcentaje"::text AS p, "minimo"::text AS m FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`,
      [o6],
    );
    expect(rows).toEqual([{ p: "2.00", m: "500.00" }]);
    await db.query(
      `UPDATE "orden" SET "estatus_id" = (SELECT "id" FROM "order_status" WHERE "value" = 'entregado') WHERE "id" = $1`,
      [o6],
    );
    expect(await movimientos(o6)).toEqual(["cargo 2000.00 plan"]);
  });

  it("R6: ninguna orden creada después de la migración tiene un movimiento con fuente «empresa»", async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento"
        WHERE "fuente" = 'empresa' AND "orden_id" NOT IN ($1, $2, $3)`,
      [orden.O1, orden.O2, orden.OP],
    );
    expect(rows[0].n).toBe(0);
  });

  it("R8: la orden antigua con cargo «empresa» se anula y se recupera con su importe y su fuente, también en la traza", async () => {
    await anular(orden.O1, true);
    expect(await movimientos(orden.O1)).toEqual(["cargo 80.00 empresa", "reverso 80.00 empresa"]);
    await anular(orden.O1, false);
    expect(await movimientos(orden.O1)).toEqual(["cargo 80.00 empresa", "reverso 80.00 empresa", "cargo 80.00 empresa"]);
    expect(await trazas(orden.O1)).toEqual(["cargo empresa 80.00", "reverso empresa -80.00", "cargo empresa 80.00"]);

    // La de la empresa sin plan, igual: su reverso no toma el global de hoy.
    await anular(orden.O2, true);
    expect(await movimientos(orden.O2)).toEqual(["cargo 80.00 empresa", "reverso 80.00 empresa"]);
    expect(await trazas(orden.O2)).toEqual(["cargo empresa 80.00", "reverso empresa -80.00"]);
  });

  it("R12: bajar devuelve la columna vacía con su CHECK, la función de antes y la regla vieja", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(await rastroDelValorPropio()).toEqual({ columna: true, check: true, funcionesQueLaLeen: 1 });
    expect(await md5Tarifa()).toBe(md5TarifaAntes);
    // Esquema, funciones (md5 de su definición y proacl), triggers, privilegios y políticas: los de antes.
    expect(diferencias(await fotoSinFilas(), antesDeM)).toEqual([]);
    // Los importes borrados no vuelven: NULL en todas las empresas (P3).
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "organizacion" WHERE "cobro_plataforma_por_orden" IS NOT NULL`,
    );
    expect(rows[0].n).toBe(0);
    expect(await movimientos(await crearOrden(empresa.G))).toEqual(["cargo 50.00 global"]);

    // La regla vieja volvió: el valor propio gana otra vez.
    await fijarValorPropio(empresa.G.organizacionId, "70");
    expect(await movimientos(await crearOrden(empresa.G))).toEqual(["cargo 70.00 empresa"]);
    // El CHECK vuelve a morder.
    await expect(
      db.query(`UPDATE "organizacion" SET "cobro_plataforma_por_orden" = -1 WHERE "id" = $1`, [empresa.E.organizacionId]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
