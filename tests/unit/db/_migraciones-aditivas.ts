/**
 * Las reglas de «migración solo aditiva» de la épica GEO, compartidas por SLT-43 (R19) y SLT-46 (R8).
 * Extraídas de `slt43-migraciones-aditivas.test.ts` sin cambiar lo que reprochan por defecto:
 *   · `DROP`, `TRUNCATE`, `RENAME` y `ALTER COLUMN` en cualquier sitio;
 *   · `DELETE`, `UPDATE` o `INSERT` sobre una tabla que no crearon estas migraciones (los eventos de
 *     trigger, las acciones de FK, el `DO UPDATE` de un upsert y los `GRANT`/`REVOKE` no son escrituras);
 *   · `ALTER TYPE` que no sea `ADD VALUE IF NOT EXISTS`;
 *   · `ADD COLUMN` en una tabla existente con `NOT NULL` o `DEFAULT` (reescribiría o bloquearía la tabla).
 * Los comentarios se quitan antes: explicar un `DROP` no es hacerlo.
 *
 * SLT-46 (design §3) añade dos opciones, apagadas por defecto (SLT-43 sigue igual):
 *   · `dmlEnCuerpoDeFuncion`: el `INSERT`/`UPDATE`/`DELETE` dentro del cuerpo `$tag$ … $tag$` de un
 *     `CREATE [OR REPLACE] FUNCTION` es la escritura del trigger en tiempo de ejecución y no cuenta.
 *     Ahí siguen contando `DROP`, `TRUNCATE`, `RENAME`, `ALTER COLUMN` y, además, `EXECUTE` (SQL
 *     dinámico: podría escribir cualquier tabla). Un bloque `DO $$ … $$` NO es un cuerpo de función:
 *     corre al migrar y su DML cuenta.
 *   · `reemplazablesPermitidas`: con la lista puesta, `CREATE OR REPLACE FUNCTION` solo se admite
 *     sobre esos nombres; con cualquier otro es falta (reemplazaría una función que ya existe).
 */

export interface Migracion {
  nombre: string;
  sql: string;
}

export interface OpcionesAditivas {
  /** El DML dentro del cuerpo de una función no cuenta (sí `EXECUTE` y lo destructivo). */
  dmlEnCuerpoDeFuncion?: boolean;
  /** Si se da, únicas funciones que una migración puede `CREATE OR REPLACE`. */
  reemplazablesPermitidas?: readonly string[];
}

/**
 * Sin comentarios y sin la comparación `TG_OP = 'DELETE'` de las funciones de trigger (nombra el evento,
 * no lo ejecuta). Los demás literales se quedan: un `EXECUTE 'DROP …'` tiene que seguir saltando.
 */
export function sinComentarios(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/\bTG_OP\s*=\s*'[A-Z]+'/g, "TG_OP = ''");
}

const IDENT = String.raw`(?:ONLY\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?`;

/** Rangos `[inicio, fin)` de los cuerpos `$tag$ … $tag$` de cada `CREATE [OR REPLACE] FUNCTION`. */
export function cuerposDeFuncion(sql: string): [number, number][] {
  const rangos: [number, number][] = [];
  for (const m of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi)) {
    const desde = (m.index ?? 0) + m[0].length;
    const apertura = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(desde));
    if (apertura === null) continue;
    const inicio = desde + apertura.index + apertura[0].length;
    const cierre = sql.indexOf(apertura[0], inicio);
    if (cierre < 0) continue;
    rangos.push([inicio, cierre]);
  }
  return rangos;
}

/** Lo que la regla reprocha en un conjunto de migraciones; vacío = aditivas. Pura, para probarla con texto inventado. */
export function faltasR19(migraciones: readonly Migracion[], opciones: OpcionesAditivas = {}): string[] {
  const limpias = migraciones.map((m) => ({ nombre: m.nombre, sql: sinComentarios(m.sql) }));
  const nuevas = new Set(
    limpias.flatMap((m) =>
      [...m.sql.matchAll(new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`, "gi"))].map((x) =>
        x[1].toLowerCase(),
      ),
    ),
  );
  const faltas: string[] = [];

  for (const { nombre, sql } of limpias) {
    const falta = (que: string) => faltas.push(`${nombre}: ${que}`);
    const cuerpos = opciones.dmlEnCuerpoDeFuncion ? cuerposDeFuncion(sql) : [];
    const enCuerpo = (i: number) => cuerpos.some(([a, b]) => i >= a && i < b);

    for (const m of sql.matchAll(/\b(DROP|TRUNCATE|RENAME|ALTER\s+COLUMN)\b/gi)) {
      falta(m[1].toUpperCase().replace(/\s+/g, " "));
    }

    for (const m of sql.matchAll(/\bALTER\s+TYPE\s+"?[A-Za-z0-9_]+"?\s+([^;]*)/gi)) {
      if (!/^ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\b/i.test(m[1])) falta(`ALTER TYPE ${m[1].trim().slice(0, 40)}`);
    }

    for (const m of sql.matchAll(new RegExp(String.raw`\bINSERT\s+INTO\s+${IDENT}`, "gi"))) {
      if (enCuerpo(m.index ?? 0)) continue;
      if (!nuevas.has(m[1].toLowerCase())) falta(`INSERT en la tabla existente ${m[1]}`);
    }

    for (const m of sql.matchAll(/\b(DELETE|UPDATE)\b/gi)) {
      const i = m.index ?? 0;
      if (enCuerpo(i)) continue;
      const antes = sql.slice(0, i);
      const anterior = /([A-Za-z]+)\s*$/.exec(antes)?.[1]?.toUpperCase();
      const despues = sql.slice(i + m[0].length);
      const sentencia = antes.slice(antes.lastIndexOf(";") + 1);
      // Eventos de trigger (`OR UPDATE`, `UPDATE OF`, `AFTER UPDATE`), acciones de FK (`ON DELETE`), el
      // `DO UPDATE` de un upsert (su tabla la mira la regla de INSERT) y los permisos no escriben filas.
      if (anterior !== undefined && ["ON", "OR", "DO", "BEFORE", "AFTER"].includes(anterior)) continue;
      if (/^\s*OF\b/i.test(despues)) continue;
      if (/^\s*(REVOKE|GRANT)\b/i.test(sentencia)) continue;
      const tabla =
        m[1].toUpperCase() === "DELETE"
          ? new RegExp(String.raw`^\s*FROM\s+${IDENT}`, "i").exec(despues)?.[1]
          : new RegExp(String.raw`^\s*${IDENT}`, "i").exec(despues)?.[1];
      if (tabla === undefined || !nuevas.has(tabla.toLowerCase())) {
        falta(`${m[1].toUpperCase()} sobre ${tabla ?? "una tabla que no se reconoce"}`);
      }
    }

    for (const m of sql.matchAll(new RegExp(String.raw`\bALTER\s+TABLE\s+${IDENT}\s+ADD\s+COLUMN\s+([^;]*)`, "gi"))) {
      if (nuevas.has(m[1].toLowerCase())) continue;
      if (/\bNOT\s+NULL\b|\bDEFAULT\b/i.test(m[2])) falta(`ADD COLUMN con NOT NULL o DEFAULT en ${m[1]}`);
    }

    if (opciones.dmlEnCuerpoDeFuncion) {
      for (const m of sql.matchAll(/\bEXECUTE\b/gi)) {
        if (enCuerpo(m.index ?? 0)) falta("EXECUTE en el cuerpo de una función");
      }
    }

    if (opciones.reemplazablesPermitidas !== undefined) {
      const permitidas = new Set(opciones.reemplazablesPermitidas.map((f) => f.toLowerCase()));
      for (const m of sql.matchAll(new RegExp(String.raw`\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:"?public"?\.)?${IDENT}`, "gi"))) {
        if (!permitidas.has(m[1].toLowerCase())) falta(`CREATE OR REPLACE FUNCTION ${m[1]}`);
      }
    }
  }
  return faltas;
}
