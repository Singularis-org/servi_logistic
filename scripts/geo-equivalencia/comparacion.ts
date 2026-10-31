// SLT-65 (design §8) — la comparacion por id que comparten los scripts de equivalencia de SLT-44
// (`geo-equivalencia-dinero.ts`) y de SLT-65 (`geo-equivalencia-consultas.ts`). Vive aparte para que
// cada script nombre sus propios bloques sin copiar la regla de «que cuenta como distinto».

export interface Diferencia {
  /** El bloque del informe; cada script tiene los suyos. */
  bloque: string;
  /** Id de nodo, zona u orden (o la posicion de una fila que no tiene id). */
  id: string;
  campo: string;
  hoy: string;
  nuevo: string;
}

export interface Cifras {
  comparados: number;
  distintos: number;
}

export function texto(v: unknown): string {
  return v === undefined ? "(ausente)" : JSON.stringify(v);
}

/** Compara dos listas por id, campo a campo. Los campos de `camposSinValor` solo dicen «distinto». */
export function compararPorId<T extends { id: string }>(
  deHoy: readonly T[],
  nuevos: readonly T[],
  campos: readonly (keyof T & string)[],
  camposSinValor: ReadonlySet<string>,
  diferencias: Diferencia[],
  bloque: string,
): Cifras {
  const a = new Map(deHoy.map((f) => [f.id, f]));
  const b = new Map(nuevos.map((f) => [f.id, f]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  let distintos = 0;
  for (const id of ids) {
    const x = a.get(id);
    const y = b.get(id);
    if (x === undefined || y === undefined) {
      distintos++;
      diferencias.push({ bloque, id, campo: "presente", hoy: String(x !== undefined), nuevo: String(y !== undefined) });
      continue;
    }
    let distinto = false;
    for (const campo of campos) {
      if (JSON.stringify(x[campo]) === JSON.stringify(y[campo])) continue;
      distinto = true;
      const oculto = camposSinValor.has(campo);
      diferencias.push({
        bloque,
        id,
        campo,
        hoy: oculto ? "(texto)" : texto(x[campo]),
        nuevo: oculto ? "(texto)" : texto(y[campo]),
      });
    }
    if (distinto) distintos++;
  }
  return { comparados: ids.length, distintos };
}
