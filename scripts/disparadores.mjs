/**
 * Patrones de rutas del arnes: globs con capturas, y los disparadores del gate rapido.
 *
 * Por que existen los disparadores (`docs/gate.md > Disparadores`): el gate rapido elige los tests
 * por el grafo de imports (`vitest related`), y hay tests que no importan lo que vigilan —los que
 * leen `schema.prisma` o las migraciones, los de alcance que recorren un modulo, los de
 * integracion—. Esos salen verdes en local y rojos en CI. Medido en el proyecto de origen
 * (2026-11-07): 4 de los 5 ultimos rojos de CI eran tests de esquema, de migracion, de `scope` o de
 * integracion que el rapido no habia seleccionado.
 *
 * Un disparador dice «si el diff toca esto, corre estos tests»:
 *
 *   { "si_cambia": ["db/schema.prisma", "db/migrations/**"], "corre": ["schema", "tests/integration/"] }
 *   { "si_cambia": "lib/modules/<m>/**", "corre": ["tests/unit/<m>/", "tests/integration/<m>/"] }
 *
 * - `si_cambia`: glob (o lista) sobre rutas del repo. `**` = cualquier cosa, `*` = un segmento,
 *   `<nombre>` = un segmento capturado.
 * - `corre`: filtros de vitest (subcadena de la ruta del test, como `gate.siempre`), donde `<nombre>`
 *   se sustituye por lo capturado.
 *
 * Sin dependencias y sin efectos: lo importan `test-rapido.mjs`, `validate-features.mjs`,
 * `check-perfil.mjs` y sus guardias.
 */

/** Glob -> { regex, nombres }. `<x>` captura un segmento; `**` cualquier cosa; `*` un segmento. */
export function compilarPatron(glob) {
  const nombres = [];
  let re = '';
  const g = String(glob);
  for (let i = 0; i < g.length; ) {
    if (g.startsWith('**/', i)) { re += '(?:.*/)?'; i += 3; continue; }
    if (g.startsWith('**', i)) { re += '.*'; i += 2; continue; }
    const c = g[i];
    if (c === '*') { re += '[^/]*'; i += 1; continue; }
    if (c === '<') {
      const fin = g.indexOf('>', i);
      if (fin > i + 1) { nombres.push(g.slice(i + 1, fin)); re += '([^/]+)'; i = fin + 1; continue; }
    }
    re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return { regex: new RegExp(`^${re}$`), nombres };
}

/** `true` si `ruta` casa con alguno de los globs. */
export function casaAlguno(ruta, globs) {
  return [].concat(globs ?? []).some((g) => compilarPatron(g).regex.test(ruta));
}

/** Errores de forma de `gate.disparadores` (lista vacia = bien). Lo usa `check-perfil.mjs`. */
export function erroresDisparadores(disparadores) {
  if (disparadores === undefined) return [];
  if (!Array.isArray(disparadores)) return ['gate.disparadores no es una lista'];
  const errores = [];
  disparadores.forEach((d, i) => {
    const si = [].concat(d?.si_cambia ?? []);
    const corre = [].concat(d?.corre ?? []);
    if (si.length === 0 || si.some((s) => typeof s !== 'string' || !s.trim())) {
      errores.push(`gate.disparadores[${i}].si_cambia debe ser un glob o una lista de globs`);
    }
    if (corre.length === 0 || corre.some((s) => typeof s !== 'string' || !s.trim())) {
      errores.push(`gate.disparadores[${i}].corre debe ser una lista de filtros de tests`);
    }
    const capturas = new Set(si.flatMap((s) => compilarPatron(s).nombres));
    for (const c of corre) {
      for (const [, n] of String(c).matchAll(/<([^>]+)>/g)) {
        if (!capturas.has(n)) errores.push(`gate.disparadores[${i}].corre usa <${n}>, que si_cambia no captura`);
      }
    }
  });
  return errores;
}

/**
 * Tests que disparan los archivos cambiados.
 * @param {string[]} cambiados rutas del repo con `/`
 * @param {string[]} tests rutas de los archivos de test con `/`
 * @param {Array<{si_cambia: string|string[], corre: string[]}>} [disparadores] sin bloque = ninguno
 * @returns {{ archivos: string[], motivos: string[] }} tests a correr y por que
 */
export function disparados(cambiados, tests, disparadores) {
  const archivos = new Set();
  const motivos = [];
  for (const d of disparadores ?? []) {
    const filtros = new Set();
    let causa = null;
    for (const glob of [].concat(d.si_cambia ?? [])) {
      const { regex, nombres } = compilarPatron(glob);
      for (const ruta of cambiados) {
        const m = regex.exec(ruta);
        if (!m) continue;
        causa ??= ruta;
        for (const f of [].concat(d.corre ?? [])) {
          filtros.add(nombres.reduce((acc, n, k) => acc.replaceAll(`<${n}>`, m[k + 1]), f));
        }
      }
    }
    if (filtros.size === 0) continue;
    const elegidos = tests.filter((t) => [...filtros].some((f) => t.includes(f)));
    for (const t of elegidos) archivos.add(t);
    motivos.push(`${causa} -> ${[...filtros].join(', ')} (${elegidos.length} test/s)`);
  }
  return { archivos: [...archivos].sort(), motivos };
}
