// SL-17 M3 (design §3 M3, D15): genera el `migration.sql` y el `down.sql` de los triggers de «misma
// empresa» desde `db/schema.prisma`. Se commitea porque una FK de negocio nueva necesita su trigger
// en una migracion futura, y la guardia R39 la pone en rojo hasta que lo tenga.
//
//   tsx scripts/generar-misma-empresa.ts                         imprime migration.sql y down.sql
//   tsx scripts/generar-misma-empresa.ts --escribir <dir>        los escribe en <dir>
//   tsx scripts/generar-misma-empresa.ts --faltantes [--escribir <dir>]
//       solo lo que las migraciones existentes aun no cubren (sin las funciones): para una FK nueva.

import fs from "node:fs";
import path from "node:path";

import {
  FUNCION_MISMA_EMPRESA,
  FUNCION_SIN_CAMBIO,
  type FkDeNegocio,
  fkCubierta,
  fkDeNegocio,
  nombreTrigger,
  nombreTriggerSinCambio,
  tablaSinCambioCubierta,
  triggersVivos,
} from "../lib/db/fk-de-negocio";
import { MODELOS_DE_NEGOCIO } from "../lib/db/modelos-de-negocio";

const RAIZ = path.resolve(__dirname, "..");
const DIR_MIGRACIONES = path.join(RAIZ, "db", "migrations");

const FUNCIONES_SQL = `CREATE FUNCTION ${FUNCION_MISMA_EMPRESA}() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tabla_ref text := TG_ARGV[0];  col_fk text := TG_ARGV[1];  col_ref text := TG_ARGV[2];
  v_fk text;  v_org_ref text;  v_encontrada boolean;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col_fk) INTO v_fk USING NEW;
  IF v_fk IS NULL THEN RETURN NEW; END IF;                        -- FK opcional sin valor
  -- La tabla referida va en el esquema del trigger (no en el search_path): asi funciona igual en
  -- un esquema desechable de test.
  EXECUTE format('SELECT organizacion_id, true FROM %I.%I WHERE %I::text = $1',
                 TG_TABLE_SCHEMA, tabla_ref, col_ref)
    INTO v_org_ref, v_encontrada USING v_fk;
  IF v_encontrada IS NULL THEN RETURN NEW; END IF;                -- inexistente: lo rechaza la FK
  IF v_org_ref IS NULL THEN RETURN NEW; END IF;                   -- usuario superadmin (D15)
  IF NEW.organizacion_id IS DISTINCT FROM v_org_ref THEN
    RAISE EXCEPTION 'referencia a otra empresa: %.% -> %', TG_TABLE_NAME, col_fk, tabla_ref
      USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION ${FUNCION_SIN_CAMBIO}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id THEN
    RAISE EXCEPTION 'una fila no cambia de empresa: %', TG_TABLE_NAME USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;`;

function triggerFk(fk: FkDeNegocio): string {
  return (
    `-- ${fk.modelo}.${fk.campo}\n` +
    `CREATE TRIGGER "${nombreTrigger(fk.tabla, fk.columna)}" BEFORE INSERT OR UPDATE OF "${fk.columna}", "organizacion_id"\n` +
    `  ON "${fk.tabla}" FOR EACH ROW EXECUTE FUNCTION ${FUNCION_MISMA_EMPRESA}('${fk.tablaRef}', '${fk.columna}', '${fk.columnaRef}');`
  );
}

function triggerSinCambio(tabla: string): string {
  return (
    `CREATE TRIGGER "${nombreTriggerSinCambio(tabla)}" BEFORE UPDATE OF "organizacion_id"\n` +
    `  ON "${tabla}" FOR EACH ROW EXECUTE FUNCTION ${FUNCION_SIN_CAMBIO}();`
  );
}

function leerMigraciones(): string[] {
  return fs
    .readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((d) => path.join(DIR_MIGRACIONES, d, "migration.sql"))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"));
}

function generar(soloFaltantes: boolean): { migracion: string; down: string; fks: number; tablas: number } {
  const esquema = fs.readFileSync(path.join(RAIZ, "db", "schema.prisma"), "utf8");
  let fks = fkDeNegocio(esquema);
  let tablas = MODELOS_DE_NEGOCIO.map((m) => m.tabla);
  if (soloFaltantes) {
    const vivos = triggersVivos(leerMigraciones());
    fks = fks.filter((fk) => !fkCubierta(fk, vivos));
    tablas = tablas.filter((t) => !tablaSinCambioCubierta(t, vivos));
  }

  const cabecera =
    `-- SL-17 M3 (design §3 M3, D15, R37–R39): misma empresa en cada FK de negocio a negocio.\n` +
    `-- GENERADO con \`tsx scripts/generar-misma-empresa.ts\`${soloFaltantes ? " --faltantes" : ""}: no editar a mano.\n` +
    `--\n` +
    `--   · ${fks.length} FK de negocio a negocio: trigger \`verificar_misma_empresa\` (SQLSTATE SL017).\n` +
    `--   · ${tablas.length} tablas de negocio: trigger \`<tabla>_sin_cambio_de_empresa\` (R38).\n` +
    `--   · Quedan fuera las FK a plataforma, a \`organizacion\` y a \`jobs\`, y el \`usuario\` referido\n` +
    `--     sin empresa (superadmin). Prisma no ve funciones ni triggers: no hay drift.\n`;

  const partes = [cabecera, "BEGIN;", ""];
  if (!soloFaltantes) partes.push(FUNCIONES_SQL, "");
  partes.push(...fks.map(triggerFk), "", ...tablas.map(triggerSinCambio), "", "COMMIT;", "");

  // Down: primero los triggers (dependen de las funciones), luego las funciones.
  const down = [
    `-- DOWN (SL-17 M3) — revierte \`migration.sql\`: DROP TRIGGER de todos y despues DROP FUNCTION.\n` +
      `-- GENERADO con \`tsx scripts/generar-misma-empresa.ts\`${soloFaltantes ? " --faltantes" : ""}.\n`,
    "BEGIN;",
    "",
    ...fks.map((fk) => `DROP TRIGGER "${nombreTrigger(fk.tabla, fk.columna)}" ON "${fk.tabla}";`),
    "",
    ...tablas.map((t) => `DROP TRIGGER "${nombreTriggerSinCambio(t)}" ON "${t}";`),
    "",
    ...(soloFaltantes
      ? []
      : [`DROP FUNCTION ${FUNCION_MISMA_EMPRESA}();`, `DROP FUNCTION ${FUNCION_SIN_CAMBIO}();`, ""]),
    "COMMIT;",
    "",
  ];

  return { migracion: partes.join("\n"), down: down.join("\n"), fks: fks.length, tablas: tablas.length };
}

function main(): void {
  const args = process.argv.slice(2);
  const soloFaltantes = args.includes("--faltantes");
  const iEscribir = args.indexOf("--escribir");
  const { migracion, down, fks, tablas } = generar(soloFaltantes);

  if (iEscribir < 0) {
    process.stdout.write(`${migracion}\n-- ════ down.sql ════\n\n${down}`);
    return;
  }
  const destino = args[iEscribir + 1];
  if (!destino) throw new Error("--escribir necesita el directorio de la migracion");
  const dir = path.resolve(destino);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "migration.sql"), migracion);
  fs.writeFileSync(path.join(dir, "down.sql"), down);
  console.log(`${path.relative(RAIZ, dir)}: ${fks} FK de negocio a negocio, ${tablas} tablas sin cambio de empresa`);
}

main();
