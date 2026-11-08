#!/usr/bin/env node
/**
 * `pnpm run test:rapido` — el gate de cerrar tanda (`docs/gate.md`).
 *
 * Corre, en UNA sola seleccion, tres grupos de tests:
 *   1. Los que el GRAFO DE IMPORTS relaciona con el diff contra `origin/<integracion>`,
 *      calculado con TRES puntos (merge-base) y sumando lo que aun no esta commiteado: una tanda
 *      de tres commits mirando solo el tercero es un agujero.
 *   2. SIEMPRE, todos los tests que casan con `arnes.config.json > gate.siempre` (por defecto
 *      `["guard"]`): las guardias y los demas tests que recorren el arbol de archivos en vez de
 *      importar lo que vigilan (contratos de modulo, de ruta...), que ningun grafo selecciona.
 *      Que ninguno se quede fuera lo vigila `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts`.
 *   3. Los DISPARADOS por `arnes.config.json > gate.disparadores`: «si el diff toca esto, corre
 *      estos tests», para los acoplamientos que no son imports (esquema, migraciones, alcance de
 *      un modulo). Detalle en `scripts/disparadores.mjs`.
 *
 * PRESUPUESTO (`gate.presupuesto_rapido`, por defecto 150 archivos): si el grupo 1 pasa de ese
 * numero —un util importado por medio repo—, no se corre en local y se dice en voz alta; los
 * grupos 2 y 3 si corren, y el resto lo cubre el CI. Un «rapido» de 16 minutos (medido en el
 * proyecto de origen, 978 s) ya no es rapido y el agente lo vive como un cuelgue.
 * `TEST_RAPIDO_SIN_PRESUPUESTO=1` lo desactiva para una corrida.
 *
 * Sin correr nada:
 *   node scripts/test-rapido.mjs --seleccion            que correria y por que (los tres grupos)
 *   node scripts/test-rapido.mjs --comprobar <test>...  exit 1 si alguno NO entra en la seleccion:
 *                                                       verifica un disparador nuevo
 *
 * La seleccion se calcula con la API de vitest (`createVitest` + `getRelevantTestSpecifications`),
 * que la devuelve sin ejecutar nada, y se corre con el CLI. Si la API falla, cae a `vitest related`
 * + `gate.siempre` como antes, sin presupuesto ni disparadores, y lo avisa.
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

import { disparados } from './disparadores.mjs';

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

const lineas = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

/**
 * Todo lo que cambio respecto de `BASE_REF`: lo commiteado (tres puntos), lo modificado sin
 * commitear y lo nuevo sin seguimiento. Incluye archivos que no son codigo (`schema.prisma`, SQL):
 * los necesitan los disparadores.
 */
function cambiosDelDiff() {
  const revParse = spawnSync('git', ['rev-parse', '--verify', '--quiet', BASE_REF], { encoding: 'utf8' });
  const archivos = new Set();
  if (revParse.status !== 0) {
    console.log(`[test:rapido] '${BASE_REF}' no existe; solo cuenta lo que no esta commiteado.`);
  } else {
    const diff = spawnSync('git', ['diff', '--name-only', `${BASE_REF}...HEAD`], { encoding: 'utf8' });
    if (diff.status !== 0) console.log(`[test:rapido] no se pudo calcular el diff vs ${BASE_REF}.`);
    else for (const f of lineas(diff.stdout)) archivos.add(f);
  }
  for (const args of [['diff', '--name-only', 'HEAD'], ['ls-files', '--others', '--exclude-standard']]) {
    const r = spawnSync('git', args, { encoding: 'utf8' });
    if (r.status === 0) for (const f of lineas(r.stdout)) archivos.add(f);
  }
  return [...archivos].sort();
}

/** Los cambiados que son codigo y siguen en disco: la entrada de `vitest related`. */
const deCodigo = (archivos) => archivos.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) && existsSync(f));

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

/** Limite de tests relacionados que el rapido corre en local (`gate.presupuesto_rapido`). */
export function presupuestoRapido(config) {
  const n = config?.gate?.presupuesto_rapido;
  return Number.isInteger(n) && n > 0 ? n : 150;
}

/**
 * Que se corre, a partir de los tres grupos ya calculados. Pura: la prueba la guardia.
 * @returns {{ archivos: string[], relacionadosFuera: boolean }}
 */
export function seleccion({ relacionados, siempre, disparados, heredados, presupuesto, sinPresupuesto = false }) {
  const relacionadosFuera = !sinPresupuesto && relacionados.length > presupuesto;
  const todos = new Set([...(relacionadosFuera ? [] : relacionados), ...siempre, ...disparados]);
  const conocidos = new Set(heredados.map(normalizar));
  return { archivos: [...todos].filter((f) => !conocidos.has(normalizar(f))).sort(), relacionadosFuera };
}

/** Los tres grupos, con la API de vitest. `null` si la API no esta o falla. */
async function gruposConLaApi(codigo, siempre) {
  let vitest;
  try {
    const { createVitest } = await import('vitest/node');
    const opciones = { watch: false, passWithNoTests: true, ...(codigo.length > 0 ? { related: codigo } : {}) };
    vitest = await createVitest('test', opciones, {}, {});
    const rel = (s) => normalizar(s.moduleId);
    const todos = [...new Set((await vitest.globTestSpecifications()).map(rel))].sort();
    const relacionados = codigo.length > 0 ? [...new Set((await vitest.getRelevantTestSpecifications()).map(rel))].sort() : [];
    return { todos, relacionados, siempre: todos.filter((t) => siempre.some((p) => t.includes(p))) };
  } catch (err) {
    console.log(`[test:rapido] AVISO: la API de vitest no respondio (${err.message}); se corre related + gate.siempre sin presupuesto ni disparadores.`);
    return null;
  } finally {
    await vitest?.close?.().catch(() => {});
  }
}

/** Corre `vitest run <archivos>` por tandas (la linea de comandos tiene limite en Windows). */
function correrArchivos(archivos, heredados, etiqueta) {
  const TANDA = 100;
  let estado = 0;
  for (let i = 0; i < archivos.length && estado === 0; i += TANDA) {
    const parte = archivos.slice(i, i + TANDA);
    const sufijo = archivos.length > TANDA ? ` (${i + 1}-${i + parte.length} de ${archivos.length})` : '';
    estado = runVitest(['run', '--passWithNoTests', ...parte], `${etiqueta}${sufijo}`, heredados);
  }
  return estado;
}

/** El camino de antes: `vitest related` + `gate.siempre`. Solo si la API no esta. */
function modoAnterior(codigo, siempre, heredados) {
  const excluir = heredados.flatMap((f) => ['--exclude', f]);
  const files = codigo.filter((f) => !heredados.includes(f));
  let status = 0;
  if (files.length > 0) {
    status = runVitest(['related', '--run', '--passWithNoTests', ...excluir, ...files], `tests relacionados con ${files.length} archivo(s)`, heredados);
  }
  if (status === 0) {
    status = runVitest(['run', ...siempre, '--passWithNoTests', ...excluir], `tests que corren siempre (gate.siempre: ${siempre.join(', ')})`, heredados);
  }
  return status;
}

/**
 * Tests de `pedidos` que la seleccion NO incluye. Puro. Lo usa `--comprobar`: tras escribir un
 * disparador, comprueba que el rapido ya habria cazado el rojo de CI (`docs/gate.md > Cuando el
 * CI sale rojo y el local salió verde`).
 */
export function noSeleccionados(pedidos, archivos) {
  const sel = new Set(archivos.map(normalizar));
  return pedidos.filter((t) => !sel.has(normalizar(t)));
}

async function main() {
  const args = process.argv.slice(2);
  const soloSeleccion = args.includes('--seleccion');
  const iComprobar = args.indexOf('--comprobar');
  const aComprobar = iComprobar >= 0 ? args.slice(iComprobar + 1).filter((a) => !a.startsWith('--')) : null;

  const config = leerConfig();
  const heredados = rojosHeredados();
  const siempre = patronesSiempre(config);
  const cambios = cambiosDelDiff();
  const codigo = deCodigo(cambios);

  const grupos = await gruposConLaApi(codigo, siempre);
  let status;
  if (!grupos && (soloSeleccion || aComprobar)) {
    console.error('[test:rapido] --seleccion y --comprobar necesitan la API de vitest, que no respondio.');
    process.exit(2);
  }
  if (!grupos) {
    status = modoAnterior(codigo, siempre, heredados);
  } else {
    const { archivos: delDisparador, motivos } = disparados(cambios, grupos.todos, config?.gate?.disparadores);
    const presupuesto = presupuestoRapido(config);
    const sel = seleccion({
      relacionados: grupos.relacionados,
      siempre: grupos.siempre,
      disparados: delDisparador,
      heredados,
      presupuesto,
      sinPresupuesto: process.env.TEST_RAPIDO_SIN_PRESUPUESTO === '1',
    });
    console.log(`[test:rapido] ${cambios.length} archivo(s) cambiados vs ${BASE_REF}.`);
    console.log(`[test:rapido] relacionados por imports: ${grupos.relacionados.length}${sel.relacionadosFuera ? ` -> FUERA (presupuesto ${presupuesto})` : ''}`);
    console.log(`[test:rapido] gate.siempre (${siempre.join(', ')}): ${grupos.siempre.length}`);
    console.log(`[test:rapido] disparadores: ${delDisparador.length}${motivos.length ? `\n  ${motivos.join('\n  ')}` : ''}`);
    if (sel.relacionadosFuera) {
      console.log(
        `[test:rapido] AVISO: ${grupos.relacionados.length} tests relacionados pasan del presupuesto (${presupuesto}): NO se corren en local.\n` +
          '  El cambio toca algo muy importado. Los cubre el CI completo en el PR (`gate-completo`), que es obligatorio antes de mergear.\n' +
          '  Para correrlos aqui igualmente: TEST_RAPIDO_SIN_PRESUPUESTO=1 ./init.sh',
      );
    }
    if (aComprobar) {
      const fuera = noSeleccionados(aComprobar, sel.archivos);
      for (const t of aComprobar) console.log(`[test:rapido] ${fuera.includes(t) ? 'NO entra' : 'entra   '}  ${t}`);
      if (fuera.length > 0) console.log('[test:rapido] falta un disparador que los cubra (docs/gate.md > Cuando el CI sale rojo y el local salió verde).');
      process.exit(fuera.length > 0 ? 1 : 0);
    }
    if (soloSeleccion) {
      for (const f of sel.archivos) console.log(`  ${f}`);
      process.exit(0);
    }
    status = sel.archivos.length === 0
      ? (console.log('[test:rapido] nada que correr.'), 0)
      : correrArchivos(sel.archivos, heredados, `${sel.archivos.length} archivo(s) de test seleccionados`);
  }
  if (heredados.length > 0) {
    console.log(`
[test:rapido] ${heredados.length} rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.`);
  }
  process.exit(status);
}

// Solo corre como script: la guardia lo importa para probar `veredictoConHeredados`.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
