#!/usr/bin/env node
/**
 * Tamano del PR de la feature de la rama actual (`docs/gate.md > Tamano del PR`).
 *
 *   node scripts/tamano-pr.mjs          lo llama init.sh: nota, AVISO (>= 80%) o error (> limite)
 *
 * Un PR grande cuesta en todas partes: mas rojos de CI por vuelta, mas vueltas de review, mas
 * choques con el resto del equipo y un merge mas caro. En el proyecto de origen (2026-11-07) los PRs
 * de feature tocaban entre 50 y 160 archivos. La respuesta es partir la feature en rebanadas que
 * se mergean solas (`docs/specs.md > Partir una feature`), y esto es lo que lo comprueba.
 *
 * Mide el diff de la rama contra el merge-base con la rama de integracion, mas lo no commiteado y lo
 * nuevo sin seguimiento. No cuentan `specs/`, `progress/`, los lockfiles ni los snapshots, ni lo que
 * el perfil anada en `gate.tamano_pr.excluir`. Las lineas (anadidas + borradas) se cuentan en dos
 * montones con tope propio: produccion y tests. Es test lo que casa con `gate.tamano_pr.tests` del
 * perfil, que SUSTITUYE a `TESTS_POR_DEFECTO`. Limites en `arnes.config.json > gate.tamano_pr`:
 * `max_archivos` (por defecto 40, cuenta tests y produccion juntos), `max_lineas` (produccion, por
 * defecto 1000) y `max_lineas_tests` (tests, por defecto 3000). Un cierre con su E2E y sus tests
 * de integracion rompia el tope unico solo por los tests, que no cuestan lo mismo de revisar.
 *
 * La salida de emergencia es humana y queda escrita: la linea
 *   <!-- tamano-pr-aceptado: AAAA-MM-DD · <motivo> -->
 * en `progress/features/<key>.md` convierte el error en aviso. La pone el leader con la frase del
 * humano, nunca por su cuenta.
 *
 * Salida: errores en stderr y exit 1; notas y `AVISO:` en stdout. Fuera de una rama de feature,
 * una nota y exit 0.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { casaAlguno } from './disparadores.mjs';

export const EXCLUIR_SIEMPRE = [
  'specs/**',
  'progress/**',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/__snapshots__/**',
  '**/*.snap',
];
export const TESTS_POR_DEFECTO = ['tests/**', 'e2e/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'];
export const LIMITES_POR_DEFECTO = { max_archivos: 40, max_lineas: 1000, max_lineas_tests: 3000 };
const MARCADOR = /<!--\s*tamano-pr-aceptado:\s*([^>]*?)\s*-->/;

/** Limites del perfil, con los por defecto donde falten. */
export function limites(config) {
  const t = config?.gate?.tamano_pr ?? {};
  const ent = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);
  return {
    max_archivos: ent(t.max_archivos, LIMITES_POR_DEFECTO.max_archivos),
    max_lineas: ent(t.max_lineas, LIMITES_POR_DEFECTO.max_lineas),
    max_lineas_tests: ent(t.max_lineas_tests, LIMITES_POR_DEFECTO.max_lineas_tests),
    excluir: [...EXCLUIR_SIEMPRE, ...(Array.isArray(t.excluir) ? t.excluir : [])],
    tests: Array.isArray(t.tests) ? t.tests : TESTS_POR_DEFECTO,
  };
}

/**
 * Archivos y lineas del diff, sin lo excluido, con las lineas de tests aparte. Pura.
 * @param {Array<{ruta: string, lineas: number}>} cambios
 * @param {string[]} excluir
 * @param {string[]} tests globs de lo que es test (por defecto `TESTS_POR_DEFECTO`)
 */
export function medir(cambios, excluir, tests = TESTS_POR_DEFECTO) {
  const cuentan = cambios.filter((c) => !casaAlguno(c.ruta, excluir));
  let lineas = 0;
  let lineas_tests = 0;
  for (const c of cuentan) {
    if (casaAlguno(c.ruta, tests)) lineas_tests += c.lineas;
    else lineas += c.lineas;
  }
  return { archivos: cuentan.length, lineas, lineas_tests, lista: cuentan };
}

/**
 * `ok`, `aviso` o `error`, con el mensaje. Pura. Sin `lineas_tests` (o sin su tope) cuenta 0
 * y el tope por defecto.
 * @param {{archivos: number, lineas: number, lineas_tests?: number}} m
 * @param {{max_archivos: number, max_lineas: number, max_lineas_tests?: number}} l
 * @param {string|null} aceptado el texto del marcador, si lo hay
 */
export function veredicto(m, l, aceptado = null) {
  const lt = m.lineas_tests ?? 0;
  const maxLt = l.max_lineas_tests ?? LIMITES_POR_DEFECTO.max_lineas_tests;
  const pasa = m.archivos > l.max_archivos || m.lineas > l.max_lineas || lt > maxLt;
  const cerca = m.archivos >= 0.8 * l.max_archivos || m.lineas >= 0.8 * l.max_lineas || lt >= 0.8 * maxLt;
  const cifras =
    `${m.archivos}/${l.max_archivos} archivos, ${m.lineas}/${l.max_lineas} lineas de produccion, ` +
    `${lt}/${maxLt} de tests`;
  if (pasa && aceptado) return { nivel: 'aviso', texto: `el PR pasa del tamano (${cifras}), aceptado por el humano: ${aceptado}` };
  if (pasa) {
    return {
      nivel: 'error',
      texto:
        `el PR de esta feature pasa del tamano maximo (${cifras}; arnes.config.json > gate.tamano_pr). ` +
        'Partela en rebanadas que se mergean solas (docs/specs.md > Partir una feature). Si el humano acepta ' +
        'este tamano, anota en progress/features/<key>.md: <!-- tamano-pr-aceptado: AAAA-MM-DD · <motivo> -->',
    };
  }
  if (cerca) return { nivel: 'aviso', texto: `el PR se acerca al tamano maximo (${cifras}): cierra la rebanada o pide partir la feature` };
  return { nivel: 'ok', texto: `tamano del PR: ${cifras}` };
}

// ------------------------------------------------------------------------------- disco y CLI

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function rama() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF; // en el PR de CI
  try { return git('branch', '--show-current').trim(); } catch { return ''; }
}

function cambiosDeLaRama(integracion) {
  let base;
  try { base = git('merge-base', `origin/${integracion}`, 'HEAD').trim(); } catch { return null; }
  const porRuta = new Map();
  for (const l of git('diff', '--numstat', base).split('\n')) {
    const [a, b, ruta] = l.split('\t');
    if (!ruta) continue;
    porRuta.set(ruta, (a === '-' ? 0 : Number(a)) + (b === '-' ? 0 : Number(b)));
  }
  for (const ruta of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    let n = 0;
    try { n = readFileSync(ruta, 'utf8').split('\n').length; } catch { /* binario o ilegible */ }
    porRuta.set(ruta, n);
  }
  return [...porRuta].map(([ruta, lineas]) => ({ ruta, lineas }));
}

function main() {
  const config = existsSync('arnes.config.json') ? JSON.parse(readFileSync('arnes.config.json', 'utf8')) : {};
  const r = rama();
  const key = /^feature\/([A-Z][A-Z0-9]*-\d+)-/.exec(r)?.[1];
  if (!key) {
    console.log(`tamano del PR: no aplica fuera de una rama de feature (${r || 'sin rama'})`);
    return 0;
  }
  const integracion = config.ramas?.integracion ?? 'dev';
  const cambios = cambiosDeLaRama(integracion);
  if (!cambios) {
    console.log(`AVISO: tamano del PR sin medir: no existe origin/${integracion} en local (haz git fetch)`);
    return 0;
  }
  const l = limites(config);
  const notas = path.join('progress', 'features', `${key}.md`);
  const aceptado = existsSync(notas) ? MARCADOR.exec(readFileSync(notas, 'utf8'))?.[1] ?? null : null;
  const v = veredicto(medir(cambios, l.excluir, l.tests), l, aceptado);
  if (v.nivel === 'error') { console.error(`${key}: ${v.texto}`); return 1; }
  console.log(v.nivel === 'aviso' ? `AVISO: ${key}: ${v.texto}` : `${key}: ${v.texto}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
