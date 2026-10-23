import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";

import { CLAVE_LOCK_ESCRITURA_REAL, HAY_BASE_DE_DATOS, urlDeBaseDeDatos } from "./_postgres-real";

/**
 * SL-17 T3.9 — los unicos de negocio que pasan a ser POR EMPRESA, y los que siguen GLOBALES a
 * proposito, contra Postgres.
 *
 * COMO SE MIDE CADA UNICO. Cada caso clona su tabla en un esquema desechable
 * (`LIKE public.<t> INCLUDING DEFAULTS`: columnas, tipos, NOT NULL y defaults, sin FK, CHECK ni
 * triggers) y le pone el indice unico copiado VIVO de `public` (`pg_get_indexdef`). Lo que se prueba
 * es, por tanto, el indice que dejaron las migraciones, no un texto: si una migracion lo volviera
 * global, el caso «dos empresas conviven» caeria con 23505. Sin FK ni CHECK, dos INSERT de una
 * fila minima bastan para aislar el unico de todo lo demas de la tabla (18 tablas con decenas de
 * columnas obligatorias, catalogos y CHECK cruzados entre si). Un caso con la tabla REAL (`zona`,
 * dos empresas de verdad) comprueba que el clon no esconde nada.
 *
 * IDA Y VUELTA. La migracion nombra las tablas sin esquema; con `search_path` en un esquema
 * desechable (y comprobado antes de ejecutar nada) `down.sql` y `migration.sql` actuan sobre los
 * clones y no sobre `public`, que comparten los demas archivos de la suite.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACION = path.join(RAIZ, "db", "migrations", "20261023090000_unicos_por_empresa");
const sqlDe = (archivo: "migration.sql" | "down.sql") => readFileSync(path.join(MIGRACION, archivo), "utf8");

interface Conexion {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

interface Pool {
  connect(): Promise<{ query: Conexion["query"]; release(): void }>;
  end(): Promise<void>;
}

/**
 * UNA conexion fija, sacada del pool del propio driver adapter (sin dependencia nueva): el
 * `search_path`, la transaccion y sus savepoints tienen que vivir en ella. `pool.query` no vale:
 * tras un error (los 23505 que se buscan) el pool descarta esa conexion y la transaccion con ella.
 */
async function conectar(): Promise<Conexion> {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  const pool = adaptador.underlyingDriver() as unknown as Pool;
  const cliente = await pool.connect();
  return {
    query: (texto, valores) => cliente.query(texto, valores),
    end: async () => {
      cliente.release();
      await pool.end();
    },
  };
}

/**
 * SL-17 T4.3b — el DDL de los esquemas desechables (`CREATE`/`DROP SCHEMA`, los clones y la ida y
 * vuelta) va bajo el lock de la 227, de SESION y en la propia conexion. Sin el, un `down.sql` real
 * serializado que recorre `pg_indexes`/`pg_constraint` con `pg_get_indexdef` (el de la 462) leia un
 * indice de estos esquemas justo cuando otro archivo lo soltaba: `XX000 could not open relation with
 * OID`. El lock es reentrante por sesion: cada `tomarLock` lleva su `soltarLock`.
 */
const tomarLock = (c: Conexion) => c.query(`SELECT pg_advisory_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
const soltarLock = (c: Conexion) => c.query(`SELECT pg_advisory_unlock(${CLAVE_LOCK_ESCRITURA_REAL})`);

const nuevoEsquema = (etiqueta: string) => `sl17_t39_${etiqueta}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** Clona las tablas (sin indices) y les copia, VIVOS de `public`, los indices nombrados. */
async function clonar(c: Conexion, esquema: string, tablas: string[], indices: string[]): Promise<void> {
  await c.query(`CREATE SCHEMA "${esquema}"`);
  for (const t of tablas) {
    await c.query(`CREATE TABLE "${esquema}"."${t}" (LIKE public."${t}" INCLUDING DEFAULTS)`);
  }
  const { rows } = await c.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [indices],
  );
  // Sin esto, un nombre mal escrito dejaria la tabla sin indice y todo INSERT pasaria.
  expect(rows.map((r) => r.indexname).sort()).toEqual([...indices].sort());
  for (const r of rows) {
    await c.query(String(r.indexdef).replace(/ ON public\./, ` ON "${esquema}".`));
  }
}

/** La foto de los indices de un esquema, sin el nombre del esquema (para comparar dos esquemas). */
async function fotoDeIndices(c: Conexion, esquema: string): Promise<string[]> {
  const { rows } = await c.query(
    `SELECT replace(indexdef, $1, 'S.') AS l FROM pg_indexes WHERE schemaname = $2 ORDER BY 1`,
    [`${esquema}.`, esquema],
  );
  return rows.map((r) => String(r.l)).sort();
}

/**
 * Inserta una fila minima: los valores dados y, en cada columna obligatoria sin default, uno de
 * relleno de su tipo. El de texto es aleatorio para no chocar con OTRO unico de la misma tabla.
 */
async function insertar(
  c: Conexion,
  esquema: string,
  tabla: string,
  valores: Record<string, string | number | boolean | null>,
): Promise<void> {
  const { rows } = await c.query(
    `SELECT a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo, t.typcategory AS cat,
            t.typname AS typname
       FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND ((a.attnotnull AND d.adbin IS NULL) OR a.attname = ANY($2::text[]))`,
    [`"${esquema}"."${tabla}"`, Object.keys(valores)],
  );
  const columnas: string[] = [];
  const expresiones: string[] = [];
  const params: unknown[] = [];
  for (const r of rows) {
    const col = String(r.columna);
    const tipo = String(r.tipo);
    columnas.push(`"${col}"`);
    if (col in valores) {
      const v = valores[col];
      if (v === null) expresiones.push(`NULL::${tipo}`);
      else {
        params.push(String(v));
        expresiones.push(`$${params.length}::text::${tipo}`);
      }
      continue;
    }
    expresiones.push(rellenoDe(String(r.cat), String(r.typname), tipo));
  }
  for (const col of Object.keys(valores)) {
    if (!rows.some((r) => r.columna === col)) throw new Error(`${tabla}.${col} no existe`);
  }
  await c.query(
    `INSERT INTO "${esquema}"."${tabla}" (${columnas.join(", ")}) VALUES (${expresiones.join(", ")})`,
    params,
  );
}

function rellenoDe(categoria: string, typname: string, tipo: string): string {
  if (typname === "uuid") return "gen_random_uuid()";
  if (typname === "jsonb" || typname === "json") return `'{}'::${tipo}`;
  switch (categoria) {
    case "S":
      return `md5(random()::text)::${tipo}`;
    case "N":
      // 1 cabe en cualquier DECIMAL(p, s) con p > s; ninguna columna numerica de relleno esta en un unico.
      return `1::${tipo}`;
    case "B":
      return "false";
    case "D":
      return `now()::${tipo}`;
    case "E":
      return `(enum_range(NULL::${tipo}))[1]`;
    case "A":
      return `'{}'::${tipo}`;
    default:
      throw new Error(`sin relleno para el tipo ${tipo}`);
  }
}

/** Corre `fn` en un savepoint y devuelve el SQLSTATE con que fallo, o `null` si paso. */
async function sqlstateDe(c: Conexion, fn: () => Promise<void>): Promise<string | null> {
  await c.query("SAVEPOINT caso");
  try {
    await fn();
    await c.query("RELEASE SAVEPOINT caso");
    return null;
  } catch (error) {
    await c.query("ROLLBACK TO SAVEPOINT caso");
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : `sin-sqlstate: ${String(error)}`;
  }
}

type Valores = Record<string, string | number | boolean | null>;

interface Caso {
  tabla: string;
  indice: string;
  /** Los valores del unico (y lo que pide su predicado); `organizacion_id` lo pone cada INSERT. */
  valores: Valores;
}

const ORG_A = "org-a-t39";
const ORG_B = "org-b-t39";

/** Los 18 que la migracion pasa a compuestos con `organizacion_id`. */
const POR_EMPRESA: Caso[] = [
  { tabla: "abono_tienda", indice: "abono_tienda_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "aporte_capital", indice: "aporte_capital_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "liquidacion_pago", indice: "liquidacion_pago_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "liquidacion_reparto", indice: "liquidacion_reparto_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "pago_por_cuenta_tienda", indice: "pago_por_cuenta_tienda_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "wallet_movimiento", indice: "wallet_movimiento_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  { tabla: "wallet_tienda_movimiento", indice: "wallet_tienda_movimiento_clave_idempotencia_key", valores: { clave_idempotencia: "k-1" } },
  {
    tabla: "wallet_movimiento",
    indice: "wallet_movimiento_origen_categoria_uq",
    valores: { origen_tipo: "cierre_dia", origen_id: "origen-1", categoria: "ingreso_flete" },
  },
  { tabla: "gasto_fijo_cobro", indice: "gasto_fijo_cobro_origen_uq", valores: { origen_id: "plantilla-1:2026-10" } },
  {
    // El caso que mas facil chocaba: destinatario solo por rol (usuario NULL, NULLS NOT DISTINCT).
    tabla: "notificacion",
    indice: "notificacion_dedupe_key",
    valores: { entidad_id: "entidad-1", destinatario_rol: "maestro", destinatario_usuario_id: null },
  },
  { tabla: "plantilla_mensaje", indice: "plantilla_mensaje_nombre_key", valores: { nombre: "Bienvenida" } },
  {
    tabla: "plantilla_mensaje",
    indice: "plantilla_mensaje_welcome_message_key",
    valores: { welcome_message: true, deleted_at: null },
  },
  { tabla: "whatsapp_envio", indice: "whatsapp_envio_nombre_vigente_key", valores: { nombre: "Aviso diario", deleted_at: null } },
  { tabla: "zona", indice: "zona_nombre_key", valores: { nombre: "Centro" } },
  { tabla: "zona", indice: "zona_es_central_unico", valores: { es_central: true } },
  // La tarifa por defecto: (NULL, NULL) con NULLS NOT DISTINCT.
  { tabla: "tarifas", indice: "tarifas_zona_id_tienda_id_key", valores: { zona_id: null, tienda_id: null } },
  { tabla: "ranking_snapshot_dia", indice: "ranking_snapshot_dia_fecha_key", valores: { fecha: "2026-10-23" } },
  { tabla: "premio_ranking", indice: "premio_ranking_posicion_key", valores: { posicion: 1 } },
];

/** Los que siguen globales a proposito: el mismo valor en dos empresas sigue fallando. */
const GLOBALES: Caso[] = [
  // R36: una persona, una cuenta, en toda la plataforma.
  { tabla: "usuario", indice: "usuario_email_key", valores: { email: "misma@ejemplo.test" } },
  { tabla: "usuario", indice: "usuario_cedula_key", valores: { cedula: "1-0000-0001" } },
  // El rastreo publico busca por guia sin empresa (design §7).
  { tabla: "orden", indice: "orden_num_guia_key", valores: { num_guia: 4242 } },
  // La key identifica la empresa: dos empresas no pueden compartir el hash.
  { tabla: "api_key", indice: "api_key_key_hash_key", valores: { key_hash: "hash-1" } },
  // Ids de Meta y del servicio de push: externos y unicos en su origen.
  { tabla: "chat_mensaje", indice: "chat_mensaje_wa_message_id_key", valores: { wa_message_id: "wamid.1" } },
  { tabla: "whatsapp_envio_entrega", indice: "whatsapp_envio_entrega_wa_message_id_key", valores: { wa_message_id: "wamid.1" } },
  { tabla: "push_suscripcion", indice: "push_suscripcion_endpoint_key", valores: { endpoint: "https://push.ejemplo.test/1" } },
];

const TABLAS_DE_LA_MIGRACION = [...new Set(POR_EMPRESA.map((c) => c.tabla))];

/** Lo que `down.sql` deja: los 18 de antes, globales, con su forma y su nombre (el contrato). */
const GLOBALES_DEL_DOWN = [
  "CREATE UNIQUE INDEX abono_tienda_clave_idempotencia_key ON S.abono_tienda USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX aporte_capital_clave_idempotencia_key ON S.aporte_capital USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX gasto_fijo_cobro_origen_uq ON S.gasto_fijo_cobro USING btree (origen_id)",
  "CREATE UNIQUE INDEX liquidacion_pago_clave_idempotencia_key ON S.liquidacion_pago USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX liquidacion_reparto_clave_idempotencia_key ON S.liquidacion_reparto USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX notificacion_dedupe_key ON S.notificacion USING btree (evento, entidad_id, destinatario_rol, destinatario_usuario_id) NULLS NOT DISTINCT WHERE (entidad_id IS NOT NULL)",
  "CREATE UNIQUE INDEX pago_por_cuenta_tienda_clave_idempotencia_key ON S.pago_por_cuenta_tienda USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX plantilla_mensaje_nombre_key ON S.plantilla_mensaje USING btree (nombre)",
  "CREATE UNIQUE INDEX plantilla_mensaje_welcome_message_key ON S.plantilla_mensaje USING btree (welcome_message) WHERE ((welcome_message = true) AND (deleted_at IS NULL))",
  "CREATE UNIQUE INDEX premio_ranking_posicion_key ON S.premio_ranking USING btree (posicion)",
  "CREATE UNIQUE INDEX ranking_snapshot_dia_fecha_key ON S.ranking_snapshot_dia USING btree (fecha)",
  "CREATE UNIQUE INDEX tarifas_zona_id_tienda_id_key ON S.tarifas USING btree (zona_id, tienda_id) NULLS NOT DISTINCT",
  "CREATE UNIQUE INDEX wallet_movimiento_clave_idempotencia_key ON S.wallet_movimiento USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX wallet_movimiento_origen_categoria_uq ON S.wallet_movimiento USING btree (origen_tipo, origen_id, categoria) WHERE (origen_id IS NOT NULL)",
  "CREATE UNIQUE INDEX wallet_tienda_movimiento_clave_idempotencia_key ON S.wallet_tienda_movimiento USING btree (clave_idempotencia)",
  "CREATE UNIQUE INDEX whatsapp_envio_nombre_vigente_key ON S.whatsapp_envio USING btree (nombre) WHERE (deleted_at IS NULL)",
  "CREATE UNIQUE INDEX zona_es_central_unico ON S.zona USING btree (es_central) WHERE (es_central = true)",
  "CREATE UNIQUE INDEX zona_nombre_key ON S.zona USING btree (nombre)",
].sort();

describeSiHayBase("SL-17 T3.9 — unicos por empresa y globales a proposito", () => {
  let c: Conexion;
  const esquema = nuevoEsquema("uq");

  beforeAll(async () => {
    c = await conectar();
    const casos = [...POR_EMPRESA, ...GLOBALES];
    await tomarLock(c);
    try {
      await clonar(c, esquema, [...new Set(casos.map((x) => x.tabla))], casos.map((x) => x.indice));
    } finally {
      await soltarLock(c);
    }
    // Lo que sigue solo inserta en los clones, dentro de una transaccion que no se confirma.
    await c.query("BEGIN");
  }, 120_000);

  afterAll(async () => {
    if (!c) return;
    await c.query("ROLLBACK");
    await tomarLock(c);
    try {
      await c.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    } finally {
      await soltarLock(c);
      await c.end();
    }
  }, 120_000);

  it("control: el clon tiene EXACTAMENTE los indices de la lista, copiados de public", async () => {
    const enPublic = await c.query(
      `SELECT replace(indexdef, 'public.', 'S.') AS l FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
      [[...POR_EMPRESA, ...GLOBALES].map((x) => x.indice)],
    );
    expect(await fotoDeIndices(c, esquema)).toEqual(enPublic.rows.map((r) => String(r.l)).sort());
    // Y todos los compuestos empiezan por la empresa.
    for (const caso of POR_EMPRESA) {
      const fila = enPublic.rows.find((r) => String(r.l).includes(` ${caso.indice} `));
      expect(String(fila?.l), caso.indice).toMatch(/USING btree \(organizacion_id, /);
    }
  });

  for (const caso of POR_EMPRESA) {
    it(`por empresa — ${caso.indice}: dos empresas conviven con el mismo valor; en la misma, 23505`, async () => {
      const en = (org: string) => () => insertar(c, esquema, caso.tabla, { ...caso.valores, organizacion_id: org });
      expect(await sqlstateDe(c, en(ORG_A))).toBeNull();
      expect(await sqlstateDe(c, en(ORG_B))).toBeNull();
      expect(await sqlstateDe(c, en(ORG_A))).toBe("23505");
      expect(await sqlstateDe(c, en(ORG_B))).toBe("23505");
    });
  }

  for (const caso of GLOBALES) {
    it(`global a proposito — ${caso.indice}: el mismo valor en otra empresa sigue fallando con 23505`, async () => {
      const en = (org: string) => () => insertar(c, esquema, caso.tabla, { ...caso.valores, organizacion_id: org });
      expect(await sqlstateDe(c, en(ORG_A))).toBeNull();
      expect(await sqlstateDe(c, en(ORG_B))).toBe("23505");
    });
  }
});

describeSiHayBase("SL-17 T3.9 — la tabla real: `zona` con dos empresas de verdad", () => {
  let c: Conexion;

  beforeAll(async () => {
    c = await conectar();
  });
  afterAll(async () => {
    await c?.end();
  });

  it("el mismo nombre de zona en dos empresas pasa; repetido en la misma, 23505 (todo revertido)", async () => {
    const nombre = `Centro ${randomUUID()}`;
    await c.query("BEGIN");
    try {
      // `organizacion` real en RowExclusive hasta el ROLLBACK: el lock de la 227 primero, como en
      // `enTransaccionRevertida`, para no cruzarse con el DDL serializado de las FK hacia ella.
      await c.query(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
      const orgs: string[] = [];
      for (const etiqueta of ["a", "b"]) {
        const id = `t39-${etiqueta}-${randomUUID()}`;
        await c.query(`INSERT INTO public.organizacion (id, nombre, slug, updated_at) VALUES ($1, $1, $1, now())`, [id]);
        orgs.push(id);
      }
      const zona = (org: string) => () =>
        c
          .query(
            `INSERT INTO public.zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id)
             VALUES (gen_random_uuid()::text, $1, '88887777', 'Cuenta de prueba', $2)`,
            [nombre, org],
          )
          .then(() => undefined);
      expect(await sqlstateDe(c, zona(orgs[0]))).toBeNull();
      expect(await sqlstateDe(c, zona(orgs[1]))).toBeNull();
      expect(await sqlstateDe(c, zona(orgs[0]))).toBe("23505");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

describeSiHayBase("SL-17 T3.9 — ida y vuelta de `20261023090000_unicos_por_empresa`", () => {
  let c: Conexion;
  const esquema = nuevoEsquema("iv");
  let fotoConLaMigracion: string[];

  beforeAll(async () => {
    c = await conectar();
    // Todo este bloque hace DDL en su esquema (clon, down y migration): el lock se sostiene de aqui
    // al `afterAll`. Ninguno de sus casos usa otra conexion que lo pida.
    await tomarLock(c);
    await clonar(c, esquema, [...TABLAS_DE_LA_MIGRACION, "organizacion"], POR_EMPRESA.map((x) => x.indice));
    fotoConLaMigracion = await fotoDeIndices(c, esquema);
    await c.query(`SET search_path TO "${esquema}"`);
    // Si el `SET` no hubiera surtido efecto, el down de abajo actuaria sobre `public`.
    const { rows } = await c.query("SELECT current_schemas(false)::text AS s");
    expect(rows[0].s).toBe(`{${esquema}}`);
  }, 120_000);

  afterAll(async () => {
    if (!c) return;
    try {
      await c.query("ROLLBACK").catch(() => undefined);
      await c.query("RESET search_path");
      await c.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
      await soltarLock(c);
    } finally {
      // Cerrar la conexion suelta el lock aunque algo de arriba haya fallado.
      await c.end();
    }
  }, 120_000);

  it("down.sql vuelve a los 18 globales de antes; migration.sql deja los indices como estaban", async () => {
    expect(fotoConLaMigracion).toHaveLength(18);

    await c.query(sqlDe("down.sql"));
    expect(await fotoDeIndices(c, esquema)).toEqual(GLOBALES_DEL_DOWN);

    await c.query(sqlDe("migration.sql"));
    expect(await fotoDeIndices(c, esquema)).toEqual(fotoConLaMigracion);
  });

  it("migration.sql siembra el podio de cada empresa que ya existia, una sola vez", async () => {
    await c.query(`TRUNCATE "premio_ranking", "organizacion"`);
    await c.query(`INSERT INTO "organizacion" (id, nombre, slug) VALUES ('o1', 'o1', 'o1'), ('o2', 'o2', 'o2')`);
    // Una empresa con su posicion 1 ya fijada: la siembra no la pisa ni la duplica.
    await c.query(`INSERT INTO "premio_ranking" (id, organizacion_id, posicion, monto) VALUES ('p-o1-1', 'o1', 1, 15000)`);
    // Para reaplicar la ida hay que volver antes; con una sola fila de podio, el down aplica.
    await c.query(sqlDe("down.sql"));

    await c.query(sqlDe("migration.sql"));

    const { rows } = await c.query(
      `SELECT organizacion_id || ':' || posicion || ':' || coalesce(monto::text, 'null') AS l
         FROM "premio_ranking" ORDER BY 1`,
    );
    expect(rows.map((r) => r.l)).toEqual(["o1:1:15000.00", "o1:2:null", "o1:3:null", "o2:1:null", "o2:2:null", "o2:3:null"]);
  });

  it("down.sql aborta, nombrando el indice, si un valor se repite entre empresas, y no cambia nada", async () => {
    // Del caso anterior quedan dos empresas con su podio: las posiciones 1-3 ya se repiten.
    await insertar(c, esquema, "zona", { nombre: "Centro", organizacion_id: "o1" });
    await insertar(c, esquema, "zona", { nombre: "Centro", organizacion_id: "o2" });
    const antes = await fotoDeIndices(c, esquema);

    let mensaje = "";
    try {
      await c.query(sqlDe("down.sql"));
    } catch (error) {
      mensaje = String((error as Error).message);
    }
    await c.query("ROLLBACK");

    expect(mensaje).toContain("no se puede volver a los unicos globales");
    expect(mensaje).toContain("zona_nombre_key");
    expect(mensaje).toContain("premio_ranking_posicion_key");
    expect(mensaje).not.toContain("tarifas_zona_id_tienda_id_key");
    expect(await fotoDeIndices(c, esquema)).toEqual(antes);
    expect(antes).toEqual(fotoConLaMigracion);
  });
});
