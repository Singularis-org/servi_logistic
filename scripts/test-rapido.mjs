#!/usr/bin/env node
/**
 * `pnpm run test:rapido` — el gate de cerrar tanda (`docs/gate.md`).
 *
 * Corre DOS cosas, y las dos importan:
 *   1. Los tests que el GRAFO DE IMPORTS relaciona con el diff contra `origin/dev`,
 *      calculado con TRES puntos (merge-base), no contra el ultimo commit: una tanda de
 *      tres commits mirando solo el tercero es un agujero.
 *   2. SIEMPRE, todos los tests que casan con `arnes.config.json > gate.siempre` (por defecto
 *      `["guard"]`): las guardias y los demas tests que recorren el arbol de archivos en vez de
 *      importar lo que vigilan (contratos de modulo, de ruta...), que ningun grafo selecciona.
 *      Que ninguno se quede fuera lo vigila `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts`.
 *
 * Sale en verde cuando la seleccion esta vacia (`--passWithNoTests`): el diff puede no tocar
 * ningun archivo con tests, y un repo recien montado puede no tener guardias. "Sin tests seleccionados" no es un
 * fallo; un fallo es un test rojo.
 *
 * Node y no bash a proposito: este repo se trabaja tambien desde Windows.
 *
 * Rojos heredados (`tests/baseline-rojos.json`): un rojo de un archivo listado NO pone el
 * gate en rojo; un rojo de cualquier otro archivo, si. Se decide leyendo el informe JSON de la
 * corrida, como el modo completo, y no con `--exclude`: `vitest related` (4.1.10) ignora
 * `--exclude` y corre igual los archivos excluidos. Se midio el 2026-10-08 en QC-226, donde
 * `pantallas-exigen-permiso.test.tsx`, que estaba en el baseline, puso rojo el gate local de
 * una feature que no lo tocaba.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Se invoca el CLI de vitest con `node <bin>` y SIN shell a proposito: con `shell: true`,
// cmd.exe parte las rutas con parentesis (`app/(public)/layout.tsx`) y el comando revienta.
const require = createRequire(import.meta.url);
const VITEST_BIN = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

// La rama de integracion sale del perfil (`arnes.config.json > ramas.integracion`).
function ramaDeIntegracion() {
  try {
    return JSON.parse(readFileSync('arnes.config.json', 'utf8')).ramas?.integracion ?? 'dev';
  } catch {
    return 'dev';
  }
}
const BASE_REF = process.env.TEST_RAPIDO_BASE ?? `origin/${ramaDeIntegracion()}`;

/** Ficheros del diff vs `BASE_REF` (tres puntos) que siguen existiendo en disco. */
function changedFiles() {
  const revParse = spawnSync('git', ['rev-parse', '--verify', '--quiet', BASE_REF], {
    encoding: 'utf8',
  });
  if (revParse.status !== 0) {
    console.log(`[test:rapido] '${BASE_REF}' no existe; se omite la seleccion por diff.`);
    return [];
  }

  const diff = spawnSync('git', ['diff', '--name-only', `${BASE_REF}...HEAD`], {
    encoding: 'utf8',
  });
  if (diff.status !== 0) {
    console.log(`[test:rapido] no se pudo calcular el diff vs ${BASE_REF}; se omite.`);
    return [];
  }

  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file))
    .filter((file) => existsSync(file));
}

/** Rutas comparables entre Windows y Linux: relativas al repo y siempre con `/`. */
const normalizar = (p) => path.relative(process.cwd(), path.resolve(p)).split('\\').join('/');

/**
 * Veredicto de una corrida de vitest con rojos heredados. Es una funcion pura para que la guardia
 * `tests/guards/guard-test-rapido-rojos-heredados.test.ts` la pruebe sin lanzar vitest.
 *
 * - `estado === 0`: verde, sin mirar nada mas.
 * - Rojo con informe valido en el que TODOS los archivos rojos son heredados: verde, y se dice cuales.
 * - Rojo sin informe, con informe ilegible o sin ningun archivo rojo en el: ROJO. El codigo
 *   distinto de 0 tiene otra causa (vitest no arranco, un error fuera de los tests), y un gate
 *   que da por bueno lo que no llego a mirar es peor que ninguno (`comparar-baseline-rojos.mjs`).
 * - Rojo con algun archivo rojo fuera del baseline: ROJO, y se nombran los nuevos.
 *
 * @param {{ estado: number, reporte: unknown, heredados: string[] }} entrada
 * @returns {{ estado: number, heredadosEnRojo: string[], nuevos: string[] }}
 */
export function veredictoConHeredados({ estado, reporte, heredados }) {
  if (estado === 0) return { estado: 0, heredadosEnRojo: [], nuevos: [] };
  const suites = reporte && Array.isArray(reporte.testResults) ? reporte.testResults : null;
  if (!suites) return { estado, heredadosEnRojo: [], nuevos: [] };
  const conocidos = new Set(heredados.map(normalizar));
  const rojos = [...new Set(suites.filter((t) => t.status === 'failed').map((t) => normalizar(t.name)))];
  if (rojos.length === 0) return { estado, heredadosEnRojo: [], nuevos: [] };
  const nuevos = rojos.filter((r) => !conocidos.has(r));
  const heredadosEnRojo = rojos.filter((r) => conocidos.has(r));
  return { estado: nuevos.length === 0 ? 0 : estado, heredadosEnRojo, nuevos };
}

/** Corre vitest con el informe JSON al lado del de consola y aplica `veredictoConHeredados`. */
function runVitest(args, label, heredados) {
  console.log(`\n[test:rapido] ${label}`);
  console.log(`[test:rapido] -> vitest ${args.join(' ')}`);
  const informe = path.join(os.tmpdir(), `test-rapido-${process.pid}-${Date.now()}.json`);
  rmSync(informe, { force: true });
  const result = spawnSync(
    process.execPath,
    [VITEST_BIN, ...args, '--reporter=default', '--reporter=json', `--outputFile.json=${informe}`],
    { stdio: 'inherit' },
  );
  let reporte = null;
  try {
    reporte = JSON.parse(readFileSync(informe, 'utf8'));
  } catch {
    reporte = null;
  }
  rmSync(informe, { force: true });
  const v = veredictoConHeredados({ estado: result.status ?? 1, reporte, heredados });
  if (v.heredadosEnRojo.length > 0 && v.estado === 0) {
    console.log(`[test:rapido] en rojo, pero solo rojos heredados del baseline: ${v.heredadosEnRojo.join(', ')}`);
  }
  if (v.nuevos.length > 0) console.log(`[test:rapido] rojos NUEVOS (fuera del baseline): ${v.nuevos.join(', ')}`);
  return v.estado;
}

// Rojos heredados (`tests/baseline-rojos.json`): deuda AJENA ya registrada. Sin esto bastaba con
// tocar un archivo relacionado con uno de la lista para que el gate local saliera rojo por algo
// que no es tuyo. El CI los sigue corriendo y comparando.
function rojosHeredados() {
  try {
    return Object.keys(JSON.parse(readFileSync('tests/baseline-rojos.json', 'utf8')).archivos ?? {}).filter(
      (f) => !f.startsWith('_'),
    );
  } catch {
    return [];
  }
}

// Patrones que corren siempre (`arnes.config.json > gate.siempre`). Por defecto, solo las guardias.
export function patronesSiempre(config) {
  const lista = config?.gate?.siempre;
  if (!Array.isArray(lista) || lista.length === 0) return ['guard'];
  return lista.filter((p) => typeof p === 'string' && p.trim() !== '');
}

function leerConfig() {
  try {
    return JSON.parse(readFileSync('arnes.config.json', 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const heredados = rojosHeredados();
  const siempre = patronesSiempre(leerConfig());
  // `--exclude` se mantiene porque `vitest run` (las guardias) si lo respeta. En `related` no
  // basta, y lo cubre el veredicto sobre el informe.
  const excluir = heredados.flatMap((f) => ['--exclude', f]);
  // Un test heredado que esta en el diff entraria por nombre: fuera de la lista de archivos.
  const files = changedFiles().filter((f) => !heredados.includes(f));

  let status = 0;
  if (files.length === 0) {
    console.log(`[test:rapido] el diff vs ${BASE_REF} no toca codigo con tests: nada que relacionar.`);
  } else {
    status = runVitest(
      ['related', '--run', '--passWithNoTests', ...excluir, ...files],
      `tests relacionados con ${files.length} archivo(s) del diff vs ${BASE_REF}`,
      heredados,
    );
  }
  if (status === 0) {
    status = runVitest(
      ['run', ...siempre, '--passWithNoTests', ...excluir],
      `tests que corren siempre (gate.siempre: ${siempre.join(', ')})`,
      heredados,
    );
  }
  if (heredados.length > 0) {
    console.log(`
[test:rapido] ${heredados.length} rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.`);
  }
  process.exit(status);
}

// Solo corre como script: la guardia lo importa para probar `veredictoConHeredados`.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
