import { readFileSync } from "node:fs";
import { join } from "node:path";

// FICHA 461 / T B.11 — el SQL REAL de la migracion de datos que COMPLETA la linea de caja de los
// cobros previos, y su `down`, listos para ejecutarse contra cobros SEMBRADOS en la base de test.
//
// A diferencia de la reclasificacion de la 459, esta migracion NO lleva lista: su criterio es por
// DATOS (todo `debito/cobro_manual` sin salida reclasificada y sin linea de cobro), asi que el texto
// se despliega sin sustituir nada (`UP_COMPLETAR_461`); para ejecutarlo sobre el esquema de hoy solo
// cambia el objetivo del `ON CONFLICT` (`UP_461_SOBRE_ESQUEMA_ACTUAL`, abajo). Por lo demas, el fixture
// solo lo lee una vez y normaliza los finales de linea (el checkout en Windows es CRLF; Postgres no lo
// nota, pero las aserciones sobre el texto si).
//
// Lo comparten `cobro-tienda-461-completar-migration.test.ts` (la migracion por si sola) y
// `caja-invariante-tiendas.test.ts` (R7/R8 tras completar con ESTE SQL).

const DIR = join(process.cwd(), "db/migrations/20260926120200_cobro_tienda_461_completar_caja");
export const UP_COMPLETAR_461 = readFileSync(join(DIR, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
export const DOWN_COMPLETAR_461 = readFileSync(join(DIR, "down.sql"), "utf8").replace(/\r\n/g, "\n");

/**
 * El `down.sql` SIN el `BEGIN;`/`COMMIT;` de fuera: dentro de la transaccion revertida de un test no
 * se puede abrir otra. Lo que queda es el bloque `DO` de la precondicion y el `DELETE`, que es todo
 * lo que el `down` hace.
 */
export const DOWN_COMPLETAR_461_EN_TX = DOWN_COMPLETAR_461.replace(/^\s*BEGIN;\s*$/m, "").replace(
  /^\s*COMMIT;\s*$/m,
  "",
);

// SL-17 T3.9 (`20261023090000_unicos_por_empresa`): `wallet_movimiento_origen_categoria_uq` pasa a
// empezar por `organizacion_id`. En `migrate deploy` la 461 corre ANTES y su `ON CONFLICT` casa con
// el unico de su momento; un test que la ejecuta sobre el esquema de HOY choca con 42P10 («no hay
// restriccion unica que coincida»). Se cambia SOLO ese objetivo por el compuesto; criterio, INSERT y
// control final siguen siendo el texto real, y el INSERT toma la empresa del DEFAULT, que la
// transaccion del test ya fija. `UP_COMPLETAR_461` queda intacto: es el texto que se despliega.
export const CONFLICTO_461 = 'ON CONFLICT ("origen_tipo", "origen_id", "categoria") WHERE "origen_id" IS NOT NULL';
export const CONFLICTO_POR_EMPRESA =
  'ON CONFLICT ("organizacion_id", "origen_tipo", "origen_id", "categoria") WHERE "origen_id" IS NOT NULL';

function sobreEsquemaActual(sql: string): string {
  // Sin esto, un cambio en el texto de la 461 dejaria la sustitucion muda y el 42P10 volveria lejos de
  // su causa.
  if (!sql.includes(CONFLICTO_461)) throw new Error("la 461 ya no trae el ON CONFLICT esperado: revisa la sustitucion");
  return sql.replace(CONFLICTO_461, CONFLICTO_POR_EMPRESA);
}

export const UP_461_SOBRE_ESQUEMA_ACTUAL = sobreEsquemaActual(UP_COMPLETAR_461);
