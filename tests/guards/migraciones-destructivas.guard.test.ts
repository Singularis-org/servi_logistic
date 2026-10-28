import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * GUARDIA DE MIGRACIONES QUE PIERDEN DATOS — sobre el ARBOL, no sobre un diff.
 *
 * La regla vive en `docs/architecture.md > Migraciones up/down > ### Migraciones que pierden
 * datos`: una migracion con `DROP TABLE`, `DROP COLUMN`, `DELETE`, `TRUNCATE`, `RENAME` (de
 * tabla, columna o tipo) o `ALTER COLUMN … TYPE` lleva junto a su `migration.sql` un
 * `DESTRUCTIVA.md` con cinco lineas con contenido (Feature, Que se elimina, Por que, Backup,
 * Aprobo). El porque: produccion ya tiene ordenes, tarifas y zonas, y el build de `prod` aplica
 * las migraciones solo (`scripts/migrate-deploy.ts`). Lo que se mergea a `prod` se ejecuta sin
 * que nadie lo vuelva a mirar, asi que el borrado tiene que llegar DECLARADO y aprobado por un
 * humano, no por descuido.
 *
 * Es branch-agnostica a proposito: recorre `db/migrations/`, asi que NO caduca al mergear (una
 * guardia que midiera `git diff` contra `dev` pasaria a juzgar toda rama posterior).
 *
 * Diente (a): toda migracion destructiva posterior al corte tiene `DESTRUCTIVA.md`.
 * Diente (b): ese archivo tiene las cinco claves, cada una con contenido.
 * Diente (c): las autocomprobaciones con fixtures en memoria prueban que (a) y (b) MUERDEN
 *             (`docs/gate.md > Cuando lo que verificas es el gate mismo`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * DECISIONES DE DETECCION (y por que):
 *
 * 1. Solo `migration.sql`, nunca `down.sql`: revertir siempre es destructivo, y exigirle el
 *    archivo a cada `down.sql` lo convertiria en ruido que se rellena sin leer.
 *
 * 2. Solo migraciones con timestamp ESTRICTAMENTE mayor que el corte. Las anteriores estan
 *    aplicadas y Prisma guarda su checksum: anadirles nada no cambia lo que ya se ejecuto, y
 *    editarlas rompe `prisma migrate deploy`.
 *
 * 3. Comentarios fuera: `-- …` y `/* … *\/` (anidados, como en Postgres) no son sentencias.
 *    Las migraciones de este repo explican en comentarios que NO hacen un `DELETE FROM`.
 *
 * 4. Cadenas y cuerpos `$$` fuera, SALVO el cuerpo de un `DO`:
 *    - `'…'` (y `E'…'`) es un dato, no una sentencia: `COMMENT ON … IS 'DROP TABLE …'` no borra.
 *    - El cuerpo `$tag$ … $tag$` de un `CREATE FUNCTION` NO se ejecuta al migrar: un
 *      `DELETE FROM` dentro de una funcion de trigger es comportamiento de runtime, no una
 *      sentencia de la migracion. Si esa funcion borra datos de negocio, lo juzga el
 *      `reviewer`, igual que el `UPDATE` que sobrescribe una columna.
 *    - El cuerpo de un `DO $$ … $$` SI se ejecuta al migrar, ahi mismo. Por eso se escanea
 *      como SQL de la migracion: un `DO $$ BEGIN DELETE FROM x; END $$` es un borrado real y
 *      esconderlo en un `DO` no puede ser la forma de saltarse la guardia.
 *
 * 5. `ALTER TABLE t DROP "col"` (sin la palabra COLUMN) cuenta como `DROP COLUMN`. Se distingue
 *    sin falsos positivos porque se mira solo la ACCION de `ALTER TABLE` (lo que sigue al
 *    nombre de la tabla o a una coma de la lista de acciones): si tras `DROP` viene
 *    `CONSTRAINT`, no es una columna. `DROP DEFAULT/NOT NULL/EXPRESSION/IDENTITY` van detras de
 *    `ALTER COLUMN x`, no al inicio de la accion, asi que tampoco cuentan.
 *
 * 6. `RENAME` cuenta en `ALTER TABLE … RENAME [COLUMN] … TO` / `ALTER TABLE … RENAME TO` y en
 *    `ALTER TYPE … RENAME …` (tabla, columna o tipo, como dice la regla). NO cuentan
 *    `ALTER TABLE … RENAME CONSTRAINT` ni `ALTER INDEX … RENAME` (Prisma los genera al renombrar
 *    claves e indices y no pierden datos, igual que `DROP CONSTRAINT/INDEX`).
 *
 * 7. `TRUNCATE` cuenta como sentencia, no como palabra: `BEFORE TRUNCATE ON t` (trigger) y
 *    `GRANT TRUNCATE ON t` (privilegio) no borran nada.
 *
 * 8. NO cuentan: `DROP INDEX/TRIGGER/FUNCTION/CONSTRAINT/VIEW/POLICY/TYPE` ni `UPDATE`.
 *    Un `UPDATE` que sobrescribe una columna existente SI exige `DESTRUCTIVA.md`, pero no se
 *    puede distinguir de uno que llena una columna nueva sin entender el esquema: ese caso lo
 *    mira el `reviewer` (lo dice la regla).
 */

const REPO_ROOT = path.join(__dirname, "..", "..");
const DIR_MIGRACIONES = path.join(REPO_ROOT, "db", "migrations");

/**
 * Corte: la ultima migracion de `dev` cuando se creo la regla (2026-10-28). Solo se miran las
 * migraciones con timestamp ESTRICTAMENTE mayor; las anteriores ya estan aplicadas en
 * produccion y no se reescriben (ver decision 2 de la cabecera).
 */
const CORTE_MIGRACIONES_DESTRUCTIVAS = "20261027120000";

const CITA_REGLA =
  "docs/architecture.md > Migraciones up/down > Migraciones que pierden datos";

// ─── Funciones puras ──────────────────────────────────────────────────────────────────────

/** Una carpeta de migracion se mira si su prefijo de 14 digitos es mayor que el corte. */
function debeMirarse(nombreCarpeta: string, corte = CORTE_MIGRACIONES_DESTRUCTIVAS): boolean {
  const m = /^(\d{14})_/.exec(nombreCarpeta);
  if (!m) return false;
  // Mismo ancho (14 digitos): la comparacion lexicografica es la numerica.
  return m[1] > corte;
}

/**
 * Deja solo el SQL que la migracion EJECUTA: quita comentarios (`--` y `/* *\/` anidados),
 * vacia las cadenas `'…'` / `E'…'` y los cuerpos `$tag$…$tag$`, salvo el cuerpo de un `DO`,
 * que se ejecuta al migrar y se deja como SQL (decision 4 de la cabecera). Los identificadores
 * `"…"` se conservan: `DROP "col"` los necesita.
 */
function sqlEjecutable(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  // Delimitadores `$tag$` de bloques `DO` abiertos: su contenido se escanea como SQL.
  const doAbiertos: string[] = [];

  while (i < n) {
    const c = sql[i];
    const sig = sql[i + 1];

    // Comentario de linea.
    if (c === "-" && sig === "-") {
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }

    // Comentario de bloque, anidable como en Postgres.
    if (c === "/" && sig === "*") {
      let prof = 1;
      i += 2;
      while (i < n && prof > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          prof++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          prof--;
          i += 2;
        } else {
          i++;
        }
      }
      out += " ";
      continue;
    }

    // Identificador entre comillas dobles: se conserva tal cual.
    if (c === '"') {
      const fin = sql.indexOf('"', i + 1);
      const hasta = fin === -1 ? n : fin + 1;
      out += sql.slice(i, hasta);
      i = hasta;
      continue;
    }

    // Cadena literal: se vacia. `''` es una comilla escapada; con prefijo E, tambien `\'`.
    if (c === "'") {
      const conEscapes = /(?:^|[^\w])[eE]$/.test(sql.slice(Math.max(0, i - 2), i));
      i++;
      while (i < n) {
        if (conEscapes && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += "''";
      continue;
    }

    // Delimitador dollar-quote `$tag$` (tag vacio o identificador sin `$`).
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const delim = m[0];
        // Cierra un `DO` abierto: se sigue escaneando lo que viene detras.
        if (doAbiertos.length > 0 && doAbiertos[doAbiertos.length - 1] === delim) {
          doAbiertos.pop();
          out += " ";
          i += delim.length;
          continue;
        }
        // Abre el cuerpo de un `DO` (`DO $$` o `DO LANGUAGE plpgsql $$`): se escanea.
        if (/\bDO(?:\s+LANGUAGE\s+\w+)?\s*$/i.test(out)) {
          doAbiertos.push(delim);
          out += " ";
          i += delim.length;
          continue;
        }
        // Cualquier otro cuerpo (funcion, cadena dollar-quoted): se vacia.
        const fin = sql.indexOf(delim, i + delim.length);
        i = fin === -1 ? n : fin + delim.length;
        out += "$$ $$";
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

interface SentenciaDestructiva {
  sentencia: string;
  fragmento: string;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const NOMBRE_TABLA = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;
const CABECERA_ALTER_TABLE = String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NOMBRE_TABLA}\s*\*?`;

/** Patrones sobre una sentencia ya limpia (sin comentarios, cadenas ni cuerpos de funcion). */
const PATRONES: readonly { sentencia: string; re: RegExp; soloAlterTable?: boolean; soloAlterType?: boolean }[] = [
  { sentencia: "DROP TABLE", re: /\bDROP\s+TABLE\b/i },
  { sentencia: "DELETE FROM", re: /\bDELETE\s+FROM\b/i },
  // Sentencia TRUNCATE, no la palabra en un trigger (`BEFORE TRUNCATE ON`) o un GRANT.
  { sentencia: "TRUNCATE", re: /\bTRUNCATE\b(?!\s*(?:(?:ON|OR)\b|,))/i },
  // `DROP COLUMN` explicito, en cualquier sitio.
  { sentencia: "DROP COLUMN", re: /\bDROP\s+COLUMN\b/i },
  // `ALTER TABLE t DROP "col"`: DROP al inicio de una accion y sin CONSTRAINT detras.
  {
    sentencia: "DROP COLUMN",
    soloAlterTable: true,
    re: new RegExp(
      String.raw`(?:${CABECERA_ALTER_TABLE}|,)\s*DROP\s+(?!(?:COLUMN|CONSTRAINT|DEFAULT|NOT|EXPRESSION|IDENTITY)\b)`,
      "i",
    ),
  },
  // `ALTER TABLE t RENAME TO x` / `RENAME [COLUMN] a TO b`; no `RENAME CONSTRAINT`.
  {
    sentencia: "RENAME",
    soloAlterTable: true,
    re: /\bRENAME\s+(?!CONSTRAINT\b)/i,
  },
  // `ALTER TYPE t RENAME TO x` / `RENAME VALUE` / `RENAME ATTRIBUTE`.
  { sentencia: "RENAME", soloAlterType: true, re: /\bRENAME\b/i },
  // `ALTER [COLUMN] c [SET DATA] TYPE`.
  {
    sentencia: "ALTER COLUMN ... TYPE",
    soloAlterTable: true,
    re: new RegExp(String.raw`\bALTER\s+(?:COLUMN\s+)?${IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`, "i"),
  },
];

/** Sentencias destructivas que EJECUTA `sql` (un `migration.sql`). Vacio si no hay ninguna. */
function detectarSentencias(sql: string): SentenciaDestructiva[] {
  const hallazgos: SentenciaDestructiva[] = [];
  const sentencias = sqlEjecutable(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const s of sentencias) {
    // Dentro de un `DO`, la sentencia puede empezar tras `BEGIN`.
    const cuerpo = s.replace(/^BEGIN\s+/i, "");
    const esAlterTable = /^ALTER\s+TABLE\b/i.test(cuerpo);
    const esAlterType = /^ALTER\s+TYPE\b/i.test(cuerpo);
    for (const p of PATRONES) {
      if (p.soloAlterTable && !esAlterTable) continue;
      if (p.soloAlterType && !esAlterType) continue;
      if (p.re.test(cuerpo) && !hallazgos.some((h) => h.sentencia === p.sentencia && h.fragmento === s)) {
        hallazgos.push({ sentencia: p.sentencia, fragmento: s.length > 160 ? `${s.slice(0, 160)}…` : s });
      }
    }
  }
  return hallazgos;
}

/** Las cinco claves de `DESTRUCTIVA.md`; cada una acepta su grafia sin tilde. */
const CLAVES_DESTRUCTIVA: readonly { clave: string; re: RegExp }[] = [
  { clave: "Feature", re: /^Feature$/i },
  { clave: "Qué se elimina", re: /^Qu[eé] se elimina$/i },
  { clave: "Por qué", re: /^Por qu[eé]$/i },
  { clave: "Backup", re: /^Backup$/i },
  { clave: "Aprobó", re: /^Aprob[oó]$/i },
];

/**
 * Errores de un `DESTRUCTIVA.md` (vacio = valido). Cada clave tiene que estar en una linea
 * `Clave: contenido` con contenido no vacio. Un placeholder sin rellenar copiado de la plantilla
 * (`<key>`, `<nombre del humano>, <AAAA-MM-DD>`) cuenta como vacio: es el archivo sin escribir.
 */
function validarDestructiva(contenido: string): string[] {
  const valores = new Map<string, string>();
  for (const linea of contenido.split(/\r?\n/)) {
    const m = /^\s*(?:[-*]\s+)?(?:\*\*)?([^:*]+?)\s*:(?:\*\*)?(.*)$/.exec(linea);
    if (!m) continue;
    const def = CLAVES_DESTRUCTIVA.find((c) => c.re.test(m[1].trim()));
    if (def && !valores.has(def.clave)) valores.set(def.clave, m[2].trim());
  }
  const errores: string[] = [];
  for (const { clave } of CLAVES_DESTRUCTIVA) {
    const v = valores.get(clave);
    if (v === undefined) {
      errores.push(`falta la linea \`${clave}:\``);
    } else if (v.replace(/<[^>]*>/g, "").replace(/[\s,]/g, "") === "") {
      errores.push(`la linea \`${clave}:\` esta vacia`);
    }
  }
  return errores;
}

/**
 * Juzga una carpeta de migracion. `archivos` es nombre → contenido (como en disco). Devuelve
 * los mensajes de fallo; vacio = verde. Solo lee `migration.sql` y `DESTRUCTIVA.md`.
 */
function evaluarMigracion(carpeta: string, archivos: Readonly<Record<string, string>>): string[] {
  if (!debeMirarse(carpeta)) return [];
  const sql = archivos["migration.sql"];
  if (sql === undefined) return [];
  const hallazgos = detectarSentencias(sql);
  if (hallazgos.length === 0) return [];

  const detectadas = hallazgos.map((h) => `${h.sentencia} (\`${h.fragmento}\`)`).join("; ");
  const destructiva = archivos["DESTRUCTIVA.md"];
  if (destructiva === undefined) {
    return [
      `db/migrations/${carpeta}: ejecuta ${detectadas} y no tiene DESTRUCTIVA.md junto a ` +
        `migration.sql. Para y pregunta al humano; ver ${CITA_REGLA}.`,
    ];
  }
  return validarDestructiva(destructiva).map(
    (e) => `db/migrations/${carpeta}/DESTRUCTIVA.md: ${e} (la migracion ejecuta ${detectadas}); ver ${CITA_REGLA}.`,
  );
}

// ─── Acceso al arbol ──────────────────────────────────────────────────────────────────────

function carpetasDeMigracion(): string[] {
  if (!fs.existsSync(DIR_MIGRACIONES)) return [];
  return fs
    .readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function leerCarpeta(carpeta: string): Record<string, string> {
  const archivos: Record<string, string> = {};
  for (const nombre of ["migration.sql", "DESTRUCTIVA.md"]) {
    const ruta = path.join(DIR_MIGRACIONES, carpeta, nombre);
    if (fs.existsSync(ruta)) archivos[nombre] = fs.readFileSync(ruta, "utf8");
  }
  return archivos;
}

// ─── Tests ────────────────────────────────────────────────────────────────────────────────

describe("migraciones destructivas — dientes (a) y (b) sobre el arbol real", () => {
  it("toda migracion posterior al corte que pierde datos tiene un DESTRUCTIVA.md completo", () => {
    const fallos = carpetasDeMigracion().flatMap((c) => evaluarMigracion(c, leerCarpeta(c)));
    expect(fallos, fallos.join("\n")).toEqual([]);
  });

  it("contraprueba: el recorrido LLEGA a db/migrations y el corte existe en el arbol", () => {
    // Un recorrido vacio daria verde para siempre sin mirar nada.
    const carpetas = carpetasDeMigracion();
    expect(carpetas.length).toBeGreaterThan(100);
    expect(carpetas.some((c) => c.startsWith(`${CORTE_MIGRACIONES_DESTRUCTIVAS}_`))).toBe(true);
  });

  it("contraprueba: el detector ve el DROP COLUMN real de una migracion historica", () => {
    // Si el detector dejara de ver lo que hay en disco, el diente (a) quedaria ciego.
    const { "migration.sql": sql } = leerCarpeta("20260825120000_drop_tarifa_status");
    expect(sql).toBeDefined();
    expect(detectarSentencias(sql).map((h) => h.sentencia)).toContain("DROP COLUMN");
  });

  it("contraprueba: un DELETE FROM que solo vive en comentarios de una migracion real no cuenta", () => {
    const { "migration.sql": sql } = leerCarpeta("20261024140000_pago_plataforma_blindaje");
    expect(sql).toContain("DELETE FROM");
    expect(detectarSentencias(sql).map((h) => h.sentencia)).not.toContain("DELETE FROM");
  });
});

describe("migraciones destructivas — diente (c): la guardia muerde (fixtures en memoria)", () => {
  const POSTERIOR = "20261101120000_quita_columna";
  const COMPLETO = [
    "Feature: SLT-48",
    "Qué se elimina: columna `zonas.legacy_code` (unas 40 filas en produccion)",
    "Por qué: la reemplaza `zona_geo_id`; una migracion aditiva dejaria dos fuentes de verdad",
    "Backup: snapshot de RDS del 2026-11-01, restauracion probada en staging",
    "Aprobó: Carlos, 2026-11-01",
  ].join("\n");
  const DROP_COLUMN = `ALTER TABLE "zonas" DROP COLUMN "legacy_code";`;

  it("DROP COLUMN sin DESTRUCTIVA.md da ROJO, y el mensaje nombra carpeta, sentencia y regla", () => {
    const fallos = evaluarMigracion(POSTERIOR, { "migration.sql": DROP_COLUMN });
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain(`db/migrations/${POSTERIOR}`);
    expect(fallos[0]).toContain("DROP COLUMN");
    expect(fallos[0]).toContain("docs/architecture.md > Migraciones up/down");
  });

  it("DROP COLUMN con DESTRUCTIVA.md completo da VERDE (tambien sin tildes)", () => {
    expect(evaluarMigracion(POSTERIOR, { "migration.sql": DROP_COLUMN, "DESTRUCTIVA.md": COMPLETO })).toEqual([]);
    const sinTildes = COMPLETO.replace("Qué", "Que").replace("Por qué", "Por que").replace("Aprobó", "Aprobo");
    expect(evaluarMigracion(POSTERIOR, { "migration.sql": DROP_COLUMN, "DESTRUCTIVA.md": sinTildes })).toEqual([]);
  });

  it("una clave vacia, ausente o con el placeholder sin rellenar da ROJO nombrando la clave", () => {
    const vacia = COMPLETO.replace(/^Backup:.*$/m, "Backup:   ");
    const fallosVacia = evaluarMigracion(POSTERIOR, { "migration.sql": DROP_COLUMN, "DESTRUCTIVA.md": vacia });
    expect(fallosVacia).toHaveLength(1);
    expect(fallosVacia[0]).toContain("`Backup:` esta vacia");
    expect(fallosVacia[0]).toContain(`db/migrations/${POSTERIOR}/DESTRUCTIVA.md`);

    const sinAprobo = COMPLETO.replace(/^Aprobó:.*$/m, "");
    expect(validarDestructiva(sinAprobo)).toEqual(["falta la linea `Aprobó:`"]);

    const plantilla = COMPLETO.replace(/^Aprobó:.*$/m, "Aprobó: <nombre del humano>, <AAAA-MM-DD>");
    expect(validarDestructiva(plantilla)).toEqual(["la linea `Aprobó:` esta vacia"]);
  });

  it("detecta cada sentencia que pierde datos", () => {
    const casos: [string, string][] = [
      [`DROP TABLE "zonas_legacy";`, "DROP TABLE"],
      [`drop table if exists zonas_legacy;`, "DROP TABLE"],
      [`ALTER TABLE "zonas" DROP COLUMN IF EXISTS "legacy_code";`, "DROP COLUMN"],
      [`ALTER TABLE "zonas" DROP "legacy_code";`, "DROP COLUMN"],
      [`ALTER TABLE public.zonas ADD COLUMN x int, DROP legacy_code;`, "DROP COLUMN"],
      [`DELETE FROM "zonas" WHERE id = 1;`, "DELETE FROM"],
      [`TRUNCATE TABLE "zonas" CASCADE;`, "TRUNCATE"],
      [`truncate zonas;`, "TRUNCATE"],
      [`ALTER TABLE "zonas" RENAME TO "zonas_geo";`, "RENAME"],
      [`ALTER TABLE "zonas" RENAME COLUMN "nombre" TO "etiqueta";`, "RENAME"],
      [`ALTER TABLE "zonas" RENAME "nombre" TO "etiqueta";`, "RENAME"],
      [`ALTER TYPE "estado_zona" RENAME VALUE 'activa' TO 'vigente';`, "RENAME"],
      [`ALTER TYPE "estado_zona" RENAME TO "estado_zona_geo";`, "RENAME"],
      [`ALTER TABLE "zonas" ALTER COLUMN "precio" TYPE INTEGER;`, "ALTER COLUMN ... TYPE"],
      [`ALTER TABLE "zonas" ALTER COLUMN "precio" SET DATA TYPE DECIMAL(12,2);`, "ALTER COLUMN ... TYPE"],
      [`ALTER TABLE zonas ALTER precio TYPE int USING precio::int;`, "ALTER COLUMN ... TYPE"],
      // El cuerpo de un DO se ejecuta al migrar: cuenta.
      [`DO $$ BEGIN DELETE FROM "zonas"; END $$;`, "DELETE FROM"],
      [`DO LANGUAGE plpgsql $body$ BEGIN DROP TABLE zonas; END $body$;`, "DROP TABLE"],
    ];
    for (const [sql, esperada] of casos) {
      expect(detectarSentencias(sql).map((h) => h.sentencia), sql).toContain(esperada);
    }
  });

  it("una sentencia que solo vive en un comentario NO cuenta", () => {
    const sql = [
      `-- DROP TABLE "zonas"; aqui no se borra nada`,
      `/* DELETE FROM "zonas";`,
      `   /* anidado: TRUNCATE zonas; */ ALTER TABLE z DROP COLUMN c; */`,
      `ALTER TABLE "zonas" ADD COLUMN "zona_geo_id" TEXT; -- DROP COLUMN "legacy"`,
    ].join("\n");
    expect(detectarSentencias(sql)).toEqual([]);
    expect(evaluarMigracion(POSTERIOR, { "migration.sql": sql })).toEqual([]);
  });

  it("DROP INDEX / TRIGGER / FUNCTION / CONSTRAINT / VIEW / POLICY / TYPE y UPDATE NO cuentan", () => {
    const sql = [
      `DROP INDEX IF EXISTS "zonas_codigo_key";`,
      `DROP TRIGGER IF EXISTS trg_zonas ON "zonas";`,
      `DROP FUNCTION IF EXISTS fn_zonas();`,
      `ALTER TABLE "zonas" DROP CONSTRAINT "zonas_pkey";`,
      `ALTER TABLE "zonas" ALTER COLUMN "nombre" DROP NOT NULL, ALTER COLUMN "nombre" DROP DEFAULT;`,
      `DROP VIEW IF EXISTS v_zonas;`,
      `DROP POLICY IF EXISTS p_zonas ON "zonas";`,
      `DROP TYPE IF EXISTS "estado_zona_viejo";`,
      `UPDATE "zonas" SET "zona_geo_id" = "id" WHERE "zona_geo_id" IS NULL;`,
      `ALTER TABLE "zonas" RENAME CONSTRAINT "zonas_pkey" TO "zonas_geo_pkey";`,
      `ALTER INDEX "zonas_codigo_key" RENAME TO "zonas_geo_codigo_key";`,
      `CREATE TRIGGER t BEFORE TRUNCATE ON "zonas" FOR EACH STATEMENT EXECUTE FUNCTION f();`,
      `GRANT SELECT, TRUNCATE ON "zonas" TO servi_app;`,
      `ALTER TABLE "orden" ADD CONSTRAINT fk FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE CASCADE;`,
    ].join("\n");
    expect(detectarSentencias(sql)).toEqual([]);
  });

  it("un DELETE FROM dentro del cuerpo $$ de una funcion o de una cadena NO cuenta", () => {
    const sql = [
      `CREATE OR REPLACE FUNCTION limpia_huerfanos() RETURNS trigger AS $$`,
      `BEGIN`,
      `  DELETE FROM "zona_tmp" WHERE id = OLD.id; -- runtime, no migracion`,
      `  RETURN OLD;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      `CREATE FUNCTION f2() RETURNS void AS $fn$ BEGIN TRUNCATE zonas; END $fn$ LANGUAGE plpgsql;`,
      `COMMENT ON TABLE "zonas" IS 'antes: DROP TABLE zonas_legacy; y DELETE FROM x';`,
      `COMMENT ON COLUMN "zonas"."c" IS E'it\\'s DROP COLUMN c';`,
    ].join("\n");
    expect(detectarSentencias(sql)).toEqual([]);
  });

  it("una migracion con timestamp <= corte NO se mira", () => {
    expect(debeMirarse(`${CORTE_MIGRACIONES_DESTRUCTIVAS}_modulos_nucleo`)).toBe(false);
    expect(debeMirarse("20260825120000_drop_tarifa_status")).toBe(false);
    expect(debeMirarse("20261027120001_siguiente")).toBe(true);
    expect(debeMirarse("migration_lock.toml")).toBe(false);
    expect(evaluarMigracion(`${CORTE_MIGRACIONES_DESTRUCTIVAS}_x`, { "migration.sql": DROP_COLUMN })).toEqual([]);
    expect(evaluarMigracion("20260101000000_vieja", { "migration.sql": DROP_COLUMN })).toEqual([]);
  });

  it("down.sql NO se mira: una migracion aditiva con un down.sql que borra da VERDE", () => {
    const archivos = {
      "migration.sql": `ALTER TABLE "zonas" ADD COLUMN "zona_geo_id" TEXT;`,
      "down.sql": `ALTER TABLE "zonas" DROP COLUMN "zona_geo_id"; DROP TABLE "zonas_geo";`,
    };
    expect(evaluarMigracion(POSTERIOR, archivos)).toEqual([]);
  });
});
