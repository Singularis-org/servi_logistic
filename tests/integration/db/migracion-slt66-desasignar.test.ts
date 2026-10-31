import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
  aplicarMigracionesHasta,
  carpetasDeMigracion,
  conectar,
  ejecutar,
  sqlDe,
  urlDe,
  type Conexion,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SLT-66 (design §2.3 bis, §9.1; R34) — M4 `plan_desasignar_sin_costo_base`, de ida y vuelta.
 *
 * Con M1–M3 aplicadas se siembran cuatro empresas con plan —sin precio (con ciclo corto), negociable,
 * de base «monto» con costo por orden y de base `0.00`— y una sin plan. Tras M4: las cuatro quedan sin
 * plan, con ancla y ciclo corto a NULL y los módulos iguales; hay una fila `desasignado` por cada una,
 * con `cambios.empresa.antes` exacto y el actor de sistema; la empresa sin plan, intacta.
 *
 * El `down.sql` de M4 repone a las que siguen sin plan y borra sus filas; a una que ya recibió otro plan
 * no la toca. Y el `down.sql` de M2, que quita el valor `desasignado`, se niega mientras queden filas.
 *
 * BASE PROPIA (`slt66_ds_<rand>`): M4 desasigna a TODA empresa con plan; en la base compartida se
 * llevaría las asignaciones de los demás archivos. La base de `DATABASE_URL` no se toca.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M2 = "20261031140100_cobro_plataforma_fuente_plan";
const M3 = "20261031140200_plan_costeo_funciones";
const M4 = "20261031140300_plan_desasignar_sin_costo_base";

const BASE = `slt66_ds_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

type Clave = "sinPrecio" | "negociable" | "monto" | "cero";
const CLAVES: Clave[] = ["sinPrecio", "negociable", "monto", "cero"];

/** Columnas del plan por caso: la forma de la base y el costo por orden. */
const PLANES: Record<Clave, { negociable: boolean; mensual: string | null; costo: string | null }> = {
  sinPrecio: { negociable: false, mensual: null, costo: null },
  negociable: { negociable: true, mensual: null, costo: null },
  monto: { negociable: false, mensual: "1000.00", costo: "100.00" },
  cero: { negociable: false, mensual: "0.00", costo: "0.00" },
};

interface Empresa {
  plan_id: string | null;
  ancla: string | null;
  corto: string | null;
  modulos: string[];
}

let db: Conexion;
let admin: Conexion;
const empresas = {} as Record<Clave | "sinPlan", string>;
const planes = {} as Record<Clave, string>;
const nombres = {} as Record<Clave | "sinPlan", string>;
let antes: Record<Clave | "sinPlan", Empresa>;
let despues: Record<Clave | "sinPlan", Empresa>;

async function empresa(id: string): Promise<Empresa> {
  const { rows } = await db.query(
    // El instante con el formato JSON de Postgres: el mismo con el que M4 lo escribe en `cambios`.
    `SELECT "plan_id", to_jsonb("plan_ciclo_ancla_at") #>> '{}' AS ancla,
            to_jsonb("plan_ciclo_corto_desde_at") #>> '{}' AS corto
       FROM "organizacion" WHERE "id" = $1`,
    [id],
  );
  const { rows: modulos } = await db.query(
    `SELECT "modulo"::text AS m FROM "organizacion_modulo" WHERE "organizacion_id" = $1 ORDER BY 1`,
    [id],
  );
  const r = rows[0];
  return {
    plan_id: r.plan_id === null ? null : String(r.plan_id),
    ancla: r.ancla === null ? null : String(r.ancla),
    corto: r.corto === null ? null : String(r.corto),
    modulos: modulos.map((m) => String(m.m)),
  };
}

async function todas(): Promise<Record<Clave | "sinPlan", Empresa>> {
  const r = {} as Record<Clave | "sinPlan", Empresa>;
  for (const k of [...CLAVES, "sinPlan"] as const) r[k] = await empresa(empresas[k]);
  return r;
}

async function filasDesasignado(): Promise<{ plan_id: string; plan_nombre: string; cambios: unknown; actor_usuario_id: string; actor_nombre: string }[]> {
  const { rows } = await db.query(
    `SELECT "plan_id", "plan_nombre", "cambios", "actor_usuario_id", "actor_nombre"
       FROM "plan_rastro" WHERE "accion" = 'desasignado' ORDER BY "plan_nombre"`,
  );
  return rows as never;
}

describe("SLT-66 M4 — la migración en disco (R34)", () => {
  it("R34 — va detrás de M3, con su down.sql y la cabecera que dice qué no se repone", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M4)).toBeGreaterThan(carpetas.indexOf(M3));
    expect(sqlDe(M4, "migration.sql")).toMatch(/CABECERA: el down\.sql repone plan, ancla y ciclo corto/);
    expect(sqlDe(M4, "migration.sql")).toMatch(/A una que ya recibió otro plan no la toca/);
    expect(sqlDe(M4, "down.sql")).toMatch(/"plan_id" IS NULL/);
  });
});

describeSiHayBase("SLT-66 M4 — plan_desasignar_sin_costo_base de ida y vuelta (R34)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Hasta M3 incluida: M4 es la primera que NO se aplica.
    await aplicarMigracionesHasta(db, M4);

    const sufijo = randomUUID().replace(/-/g, "").slice(0, 8);
    for (const k of [...CLAVES, "sinPlan"] as const) {
      empresas[k] = randomUUID();
      nombres[k] = `SLT66 ds ${k} ${sufijo}`;
      await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
        empresas[k],
        nombres[k],
        `slt66-ds-${k.toLowerCase()}-${sufijo}`,
      ]);
      // Módulos encendidos en cada empresa: M4 no los toca.
      await db.query(
        `INSERT INTO "organizacion_modulo" ("id", "modulo", "organizacion_id") VALUES ($1, 'analitica', $3), ($2, 'ranking', $3)`,
        [randomUUID(), randomUUID(), empresas[k]],
      );
    }
    for (const k of CLAVES) {
      planes[k] = randomUUID();
      const p = PLANES[k];
      await db.query(
        `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_negociable", "precio_mensual", "costo_por_orden")
         VALUES ($1, $2, 'publico', $3, $4::numeric, $5::numeric)`,
        [planes[k], `SLT66 ds plan ${k} ${sufijo}`, p.negociable, p.mensual, p.costo],
      );
      await db.query(
        `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '3 days'
          WHERE "id" = $2`,
        [planes[k], empresas[k]],
      );
    }
    // Sin precio, con ciclo corto: ancla futura y el corto antes de ella (CHECK de SLT-58).
    await db.query(
      `UPDATE "organizacion" SET "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') + interval '10 days',
              "plan_ciclo_corto_desde_at" = (now() AT TIME ZONE 'UTC') - interval '2 hours'
        WHERE "id" = $1`,
      [empresas.sinPrecio],
    );

    antes = await todas();
    await ejecutar(db, sqlDe(M4, "migration.sql"), M4);
    despues = await todas();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R34 — antes de migrar, las cuatro tienen plan y ancla, y la de sin precio ciclo corto (si no, el test sería vacío)", () => {
    for (const k of CLAVES) {
      expect(antes[k].plan_id, k).toBe(planes[k]);
      expect(antes[k].ancla, k).not.toBeNull();
    }
    expect(antes.sinPrecio.corto).not.toBeNull();
    expect(antes.sinPlan.plan_id).toBeNull();
  });

  it("R34 — toda empresa con plan queda sin plan, con ancla y ciclo corto a NULL y los módulos iguales", () => {
    for (const k of CLAVES) {
      expect(despues[k], k).toEqual({ plan_id: null, ancla: null, corto: null, modulos: antes[k].modulos });
    }
    expect(despues.monto.modulos).toEqual(["analitica", "ranking"]);
  });

  it("R34 — la empresa sin plan no se toca", () => {
    expect(despues.sinPlan).toEqual(antes.sinPlan);
  });

  it("R34 — una fila desasignado por empresa, con cambios.empresa.antes exacto y el actor de sistema", async () => {
    const filas = await filasDesasignado();
    expect(filas).toHaveLength(CLAVES.length);
    for (const k of CLAVES) {
      const fila = filas.find((f) => f.plan_id === planes[k]);
      expect(fila, k).toEqual({
        plan_id: planes[k],
        plan_nombre: expect.stringContaining(`SLT66 ds plan ${k}`),
        cambios: {
          empresa: {
            antes: { id: empresas[k], nombre: nombres[k], ancla: antes[k].ancla, cortoDesde: antes[k].corto },
            despues: null,
          },
        },
        actor_usuario_id: "sistema:SLT-66",
        actor_nombre: "Sistema (migración SLT-66)",
      });
    }
  });

  it("R34 — el down.sql de M2 se niega a quitar el valor desasignado mientras queden filas", async () => {
    let error: unknown = null;
    try {
      await ejecutar(db, sqlDe(M2, "down.sql"), `${M2}/down.sql`);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).sqlstate).toBe("P0001");
    expect((error as Error).message).toMatch(/quedan filas desasignado en plan_rastro/);
    expect(await filasDesasignado()).toHaveLength(CLAVES.length);
  });

  it("R34 — el down.sql repone plan, ancla y ciclo corto a las que siguen sin plan, no toca a la que ya recibió otro, y borra las filas", async () => {
    // La de base «monto» recibe otro plan antes de bajar.
    const otro = randomUUID();
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden") VALUES ($1, $2, 'publico', 5, 1)`, [
      otro,
      `SLT66 ds otro ${otro.slice(0, 8)}`,
    ]);
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
      [otro, empresas.monto],
    );
    const montoConOtro = await empresa(empresas.monto);

    await ejecutar(db, sqlDe(M4, "down.sql"), `${M4}/down.sql`);
    const bajado = await todas();

    for (const k of ["sinPrecio", "negociable", "cero"] as const) {
      expect(bajado[k], k).toEqual(antes[k]);
    }
    expect(bajado.monto).toEqual(montoConOtro);
    expect(bajado.monto.plan_id).toBe(otro);
    expect(bajado.sinPlan).toEqual(antes.sinPlan);
    expect(await filasDesasignado()).toEqual([]);
  });
});
