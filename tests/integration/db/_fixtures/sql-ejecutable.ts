/**
 * FICHA 461 — el texto EJECUTABLE de un `.sql`: sin las lineas de comentario (`-- …`).
 *
 * Los tests que afirman «este archivo NO hace X» (ni `DELETE`, ni `CHECK`, ni toca `monto`) tienen que
 * mirar las sentencias y no la prosa: los comentarios de estas migraciones nombran a proposito lo que
 * no hacen. Mismo criterio que `soloEjecutable` en `wallet-tienda-cobro-migration.test.ts`.
 */
export function soloEjecutable(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n");
}

/**
 * SLT-75 — las sentencias de un `.sql`, una por una, listas para `$executeRawUnsafe` (que no admite
 * varias en una llamada). Corta por `;` salvo DENTRO de un cuerpo `$tag$ … $tag$` (un bloque `DO`),
 * que viaja entero. Sin comentarios de linea (`soloEjecutable`).
 */
export function sentenciasSql(sql: string): string[] {
  const texto = soloEjecutable(sql);
  const salida: string[] = [];
  let actual = "";
  let tag: string | null = null;
  let i = 0;
  while (i < texto.length) {
    if (tag === null) {
      const apertura = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texto.slice(i));
      if (apertura) {
        tag = apertura[0];
        actual += tag;
        i += tag.length;
        continue;
      }
      if (texto[i] === ";") {
        if (actual.trim()) salida.push(actual.trim());
        actual = "";
        i += 1;
        continue;
      }
    } else if (texto.startsWith(tag, i)) {
      actual += tag;
      i += tag.length;
      tag = null;
      continue;
    }
    actual += texto[i];
    i += 1;
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}
