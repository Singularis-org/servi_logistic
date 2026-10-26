// SQL que cambia o borra filas de una tabla cuyo nombre se decide al ejecutar (`DELETE FROM ${…}`,
// `UPDATE ${…}`, `TRUNCATE ${…}`). Lo comparten las guardias de los libros que solo se anexan
// (SL-40 `cobro-plataforma-solo-por-trigger`, SL-45 `pago-plataforma-inmutable-sl45`).
//
// POR QUÉ. Esas guardias buscan el NOMBRE de su tabla en el SQL. Un `DELETE` con la tabla en una
// variable no lo lleva, así que pasaba sin que lo vieran (review SL-43, m5): el borrado de la demo de
// QA borra `wallet_movimiento`, `cobro_plataforma_movimiento` y `orden` así. Ahora toda mutación con
// tabla dinámica sale roja salvo que figure abajo, con su ficha y su motivo, y con las condiciones que
// la hacen segura todavía presentes en el archivo.
//
// NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

/** Una mutación con tabla dinámica aceptada a sabiendas. */
export interface ExcepcionSqlDinamico {
  /** Ruta relativa a la raíz, con `/`. */
  archivo: string;
  ficha: string;
  motivo: string;
  /** Lo que tiene que seguir en el código del archivo para que la excepción valga. */
  exige: { que: string; patron: RegExp }[];
}

export const EXCEPCIONES_SQL_DINAMICO: readonly ExcepcionSqlDinamico[] = [
  {
    archivo: "scripts/demo-qa/borrar.ts",
    ficha: "SL-43",
    motivo:
      "D12 (aprobado 2026-10-25): el borrado de las empresas demo corre como dueño de la base, tras las tres " +
      "capas de la guardia de entorno, y recorre por catálogo toda tabla con `organizacion_id` (también " +
      "`wallet_movimiento` y `cobro_plataforma_movimiento`). Solo alcanza empresas con `es_demo`, que se " +
      "comprueba tres veces; nunca corre en producción ni desde la app.",
    exige: [
      { que: "solo lista empresas con `es_demo`", patron: /where:\s*\{\s*esDemo:\s*true\s*\}/ },
      { que: "re-comprueba la marca antes de borrar", patron: /await\s+exigirSoloDemo\s*\(/ },
      { que: "el DELETE final de `organizacion` filtra por `es_demo`", patron: /DELETE FROM "organizacion" WHERE "id" = ANY\(\$1::text\[\]\) AND "es_demo"/ },
      { que: "las filas se borran por empresa, nunca la tabla entera", patron: /DELETE FROM \$\{id\(paso\.tabla\)\} WHERE \$\{id\(paso\.columna\)\} = ANY\(\$1::text\[\]\)/ },
    ],
  },
];

/** Las mutaciones con tabla dinámica de un código (ya sin comentarios). */
export function mutacionesSqlDinamicas(codigo: string): string[] {
  const re = /\b(?:delete\s+from|update|truncate(?:\s+table)?)\s+(?:only\s+)?"?\$\{/gi;
  return [...codigo.matchAll(re)].map((m) => m[0]);
}

/** Los hallazgos de una lista de archivos que no cubre ninguna excepción. */
export function hallazgosSqlDinamico(
  fuentes: readonly { ruta: string; codigo: string }[],
  excepciones: readonly ExcepcionSqlDinamico[] = EXCEPCIONES_SQL_DINAMICO,
): string[] {
  const exceptuados = new Set(excepciones.map((e) => e.archivo));
  return fuentes
    .filter((f) => !exceptuados.has(f.ruta))
    .flatMap((f) => mutacionesSqlDinamicas(f.codigo).map((m) => `${f.ruta}: ${m}`));
}

/**
 * Lo que falla en una excepción: el archivo ya no tiene SQL dinámico (sobra) o le falta una de las
 * condiciones que la hacen segura.
 */
export function fallosDeExcepcion(e: ExcepcionSqlDinamico, codigo: string): string[] {
  const fallos: string[] = [];
  if (mutacionesSqlDinamicas(codigo).length === 0) fallos.push(`${e.archivo}: ya no tiene SQL dinámico, quita la excepción`);
  for (const { que, patron } of e.exige) if (!patron.test(codigo)) fallos.push(`${e.archivo}: ya no ${que}`);
  return fallos;
}
