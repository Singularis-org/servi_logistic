import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SLT-128 (design §8; R24, R25) — la migración del cambio programado por empresa, de ida y vuelta, en una base
 * PROPIA (`slt128_iv_<rand>`): crea dos tablas y reemplaza ocho funciones que leen los triggers de topes, la
 * tarifa y la factura; en la base compartida tomaría sus locks bajo los demás archivos. La base de
 * `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de la migración:
 *   · plan P con un pendiente guardado (F = 20 de noviembre, a mitad de quincena y de mes) y dos empresas,
 *     una quincenal y otra mensual;
 *   · plan Q sin pendiente, con una empresa.
 *
 * Los casos van en orden y cada uno parte de lo que dejó el anterior: R24 sube y mira; R25 baja negada con
 * una versión propia y después baja limpia.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261113120000_cobro_plataforma_sin_valor_empresa";
const M = "20261114120000_plan_cambio_por_empresa";
const BASE = `slt128_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** F del pendiente previo: las 00:00 de la plataforma del 20 de noviembre, a mitad de período de las dos. */
const F = "2026-11-20 06:00:00";

/** Las ocho funciones que la migración reemplaza, con la migración de su última definición (design §8). */
const REEMPLAZADAS: readonly { funcion: string; origen: string }[] = [
  { funcion: "plan_tope_usuario", origen: "20261028130200_plan_topes_triggers" },
  { funcion: "plan_tope_api_key", origen: "20261028130200_plan_topes_triggers" },
  { funcion: "cobro_plataforma_tarifa_de", origen: "20261113120000_cobro_plataforma_sin_valor_empresa" },
  { funcion: "plan_de_la_empresa", origen: "20261106130000_plan_de_la_empresa_pendiente_sin_plan" },
  { funcion: "factura_plataforma_abrir", origen: "20261111130100_factura_plataforma" },
  { funcion: "factura_plataforma_tomar_cambio", origen: "20261111130100_factura_plataforma" },
  { funcion: "factura_plataforma_cuota", origen: "20261111130100_factura_plataforma" },
  { funcion: "factura_plataforma_cerrar", origen: "20261111130100_factura_plataforma" },
];

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
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
};

/** De `FUNCTION nombre(` a su `END $$;`, sin el `CREATE [OR REPLACE]` de delante (el origen puede no llevarlo). */
function definicionDe(carpeta: string, archivo: "migration.sql" | "down.sql", funcion: string): string {
  const texto = sqlDe(carpeta, archivo);
  const inicio = texto.indexOf(`FUNCTION ${funcion}(`);
  if (inicio < 0) throw new Error(`${funcion} no está en ${carpeta}/${archivo}`);
  const fin = texto.indexOf("END $$;", inicio);
  return texto.slice(inicio, fin + "END $$;".length);
}

let db: Conexion;
let admin: Conexion | undefined;
let antesDeM: Foto;
let despuesDeM: Foto;
const ids = { P: "", Q: "", cambio: "", quincenal: "", mensual: "", deQ: "" };

/** La foto del esquema sin las filas, con funciones, triggers, privilegios, políticas y RLS. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function crearPlan(nombre: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden", "tope_api_keys")
     VALUES ($1, $2, 'publico', 50000, 100, 3)`,
    [id, `${nombre} ${id.slice(0, 8)}`],
  );
  return id;
}

async function crearEmpresa(planId: string, tipo: "quincenal" | "mensual"): Promise<string> {
  const id = randomUUID();
  const sufijo = id.replace(/-/g, "").slice(0, 12);
  await db.query(
    `INSERT INTO "organizacion" ("id", "nombre", "slug", "plan_id", "plan_ciclo_ancla_at", "plan_tipo_cobro")
     VALUES ($1, $2, $3, $4, '2026-11-01 06:00:00', $5)`,
    [id, `SLT128 IV ${sufijo}`, `slt128-iv-${sufijo}`, planId, tipo],
  );
  return id;
}

async function recepciones(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT r."cambio_id" || ' ' || r."organizacion_id" || ' ' || to_char(r."recibe_at", 'YYYY-MM-DD HH24:MI:SS')
            || ' ' || COALESCE(r."recibido_at"::text, 'pendiente') AS l
       FROM "plan_cambio_recepcion" r ORDER BY 1`,
  );
  return rows.map((r) => String(r.l));
}

async function existe(tabla: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [`public.${tabla}`]);
  return rows[0].e === true;
}

async function cuantas(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await db.query(sql, valores);
  return Number(rows[0].n);
}

describe("SLT-128 — la migración en disco", () => {
  it("R25: va detrás de la anterior y trae su down.sql", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_ANTERIOR)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M)).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    expect(sqlDe(M, "down.sql")).toMatch(/DROP TABLE "plan_cambio_recepcion"/);
    expect(sqlDe(M, "down.sql")).toMatch(/DROP TABLE "plan_version_empresa"/);
  });

  it.each(REEMPLAZADAS)(
    "R25: el down.sql repone LITERALMENTE la última definición de $funcion ($origen) y la subida la reemplaza",
    ({ funcion, origen }) => {
      const deOrigen = definicionDe(origen, "migration.sql", funcion);
      expect(definicionDe(M, "down.sql", funcion)).toBe(deOrigen);
      expect(definicionDe(M, "migration.sql", funcion)).not.toBe(deOrigen);
      expect(sqlDe(M, "migration.sql")).toContain(`CREATE OR REPLACE FUNCTION ${funcion}(`);
    },
  );

  it("control: la última definición de cada una es la que dice la tabla (ninguna migración posterior la toca)", () => {
    const carpetas = carpetasDeMigracion();
    for (const { funcion, origen } of REEMPLAZADAS) {
      const posteriores = carpetas
        .filter((c) => c > origen && c !== M)
        .filter((c) => new RegExp(`FUNCTION ${funcion}\\(`).test(sqlDe(c, "migration.sql")));
      expect(posteriores, funcion).toEqual([]);
    }
  });
});

describeSiHayBase("SLT-128 R24, R25 — los pendientes previos, la subida y la bajada", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    ids.P = await crearPlan("SLT128 IV P");
    ids.Q = await crearPlan("SLT128 IV Q");
    ids.quincenal = await crearEmpresa(ids.P, "quincenal");
    ids.mensual = await crearEmpresa(ids.P, "mensual");
    ids.deQ = await crearEmpresa(ids.Q, "mensual");
    ids.cambio = randomUUID();
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, $5, 'Superadmin SLT128')`,
      [
        ids.cambio,
        ids.P,
        F,
        JSON.stringify({
          nombre: "SLT128 IV P nuevo",
          topes: { porRol: {}, apiKeys: 1 },
          modulos: [],
          precio: { tipo: "monto", mensual: "50000", descuentos: {} },
          costoPorOrden: "80",
          costoPorOrdenPorcentual: null,
        }),
        randomUUID(),
      ],
    );

    antesDeM = await fotoSinFilas();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R24: subir da a cada empresa del plan con pendiente su recepción EN F (sin llevarla al inicio del período) y no encola trabajos", async () => {
    const jobsAntes = await cuantas(`SELECT count(*)::int AS n FROM "jobs"`);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despuesDeM = await fotoSinFilas();

    // La quincenal y la mensual, las dos el 20 a las 00:00 de la plataforma; la empresa de Q, ninguna.
    expect(await recepciones()).toEqual(
      [
        `${ids.cambio} ${ids.quincenal} 2026-11-20 06:00:00 pendiente`,
        `${ids.cambio} ${ids.mensual} 2026-11-20 06:00:00 pendiente`,
      ].sort(),
    );
    expect(await cuantas(`SELECT count(*)::int AS n FROM "plan_version_empresa"`)).toBe(0);
    expect(await cuantas(`SELECT count(*)::int AS n FROM "jobs"`)).toBe(jobsAntes);
    // El pendiente sigue entero: la recepción no lo toca.
    expect(await cuantas(`SELECT count(*)::int AS n FROM "plan_cambio_programado" WHERE "id" = $1`, [ids.cambio])).toBe(1);
  });

  it("R24, R26: las dos tablas son de plataforma: RLS sin políticas y nada para servi_app", async () => {
    const { rows } = await db.query(
      `SELECT c.relname AS t, c.relrowsecurity AS rls,
              (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
              has_table_privilege('servi_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS app
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('plan_cambio_recepcion', 'plan_version_empresa')
        ORDER BY 1`,
    );
    expect(rows).toEqual([
      { t: "plan_cambio_recepcion", rls: true, politicas: 0, app: false },
      { t: "plan_version_empresa", rls: true, politicas: 0, app: false },
    ]);
  });

  it("R24: sin versión propia, la tarifa y los topes de la empresa siguen siendo los del plan", async () => {
    const { rows } = await db.query(
      `SELECT t."monto"::text AS monto, t."fuente"::text AS fuente FROM cobro_plataforma_tarifa_de($1) t`,
      [ids.mensual],
    );
    expect(rows).toEqual([{ monto: "100.00", fuente: "plan" }]);
    const { rows: v } = await db.query(
      `SELECT v."nombre" AS nombre, v."tope_api_keys" AS tope FROM plan_version_de($1, $2) v`,
      [ids.mensual, ids.P],
    );
    expect(v).toEqual([{ nombre: expect.stringMatching(/^SLT128 IV P /), tope: 3 }]);
  });

  it("R25: con una empresa en versión propia, bajar se niega sin tocar nada", async () => {
    await db.query(
      `INSERT INTO "plan_version_empresa" ("organizacion_id", "plan_id", "cambio_id", "version", "desde_at")
       SELECT $1, $2, $3, c."version", $4 FROM "plan_cambio_programado" c WHERE c."id" = $3`,
      [ids.quincenal, ids.P, ids.cambio, F],
    );
    // Control: la versión propia rige para la tarifa (si no, la negativa no probaría nada útil).
    const { rows } = await db.query(`SELECT t."monto"::text AS monto FROM cobro_plataforma_tarifa_de($1) t`, [ids.quincenal]);
    expect(rows).toEqual([{ monto: "80.00" }]);

    const bajada = ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    await expect(bajada).rejects.toBeInstanceOf(ErrorDeScript);
    await expect(bajada).rejects.toMatchObject({ sqlstate: "P0001" });

    expect(diferencias(await fotoSinFilas(), despuesDeM)).toEqual([]);
    expect(await existe("plan_version_empresa")).toBe(true);
    expect(await cuantas(`SELECT count(*)::int AS n FROM "plan_version_empresa"`)).toBe(1);
    expect((await recepciones()).length).toBe(2);
  });

  it("R25: sin versiones propias, bajar deja la base como estaba y el pendiente sigue para el código de antes", async () => {
    await db.query(`DELETE FROM "plan_version_empresa"`);

    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    // Esquema, funciones (md5 de su definición y proacl), triggers, privilegios, políticas y RLS: los de antes.
    expect(diferencias(await fotoSinFilas(), antesDeM)).toEqual([]);
    expect(await existe("plan_cambio_recepcion")).toBe(false);
    expect(await existe("plan_version_empresa")).toBe(false);
    expect(await cuantas(`SELECT count(*)::int AS n FROM "plan_cambio_programado" WHERE "id" = $1`, [ids.cambio])).toBe(1);
    // La tarifa vuelve a leer la fila del plan.
    const { rows } = await db.query(`SELECT t."monto"::text AS monto FROM cobro_plataforma_tarifa_de($1) t`, [ids.quincenal]);
    expect(rows).toEqual([{ monto: "100.00" }]);
  });
});
