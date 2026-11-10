#!/usr/bin/env node
// Hook Stop del arnes. Hace dos cosas al cerrar cada turno:
//   1. Regla 9 de CLAUDE.md: si el ultimo mensaje nombra una key de ficha sin su titulo
//      («ya hice la SL-50»), anade debajo una NOTA con `<key> «<title>»` de la copia del board
//      (scripts/nombres-de-fichas.mjs). No bloquea: el hook corre cuando el humano ya ve el
//      mensaje, y un bloqueo se lo duplicaba entero (decision del humano, 2026-11-10).
//   2. Corre el validador de features (offline, <1 s) y solo habla si falla: un recordatorio que
//      sale en cada turno se deja de leer.
// Nunca falla: un hook roto no debe impedir trabajar. Las rutas se resuelven contra la raiz del
// repo, no contra el cwd (guard-hooks-anclados).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const VALIDADOR = join(RAIZ, 'scripts', 'validate-features.mjs');
const salida = {};
const avisos = [];

/** La entrada del hook (stdin JSON). Vacia o ilegible = sin datos, nunca un error. */
function leerEntrada() {
  try {
    const texto = readFileSync(0, 'utf8');
    return texto.trim() ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

/** Raiz del worktree principal: `feature_list.json` vive ahi aunque el hook corra en un worktree. */
function raizPrincipal() {
  try {
    const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return comun ? dirname(comun) : RAIZ;
  } catch {
    return RAIZ;
  }
}

const leerJson = (ruta) => {
  try {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
};

const entrada = leerEntrada();

// --- 1. Regla 9: ninguna key sin su titulo -----------------------------------------------
try {
  const mensaje = entrada.last_assistant_message;
  if (typeof mensaje === 'string' && mensaje) {
    const { keysSinTitulo, notaDeTitulos } = await import(pathToFileURL(join(RAIZ, 'scripts', 'nombres-de-fichas.mjs')).href);
    const { resolverTracker } = await import(pathToFileURL(join(RAIZ, 'scripts', 'tracker.mjs')).href);
    const principal = raizPrincipal();
    const lista = leerJson(join(principal, 'feature_list.json'));
    const titulos = new Map((lista?.features ?? []).filter((f) => f?.key && f?.title).map((f) => [f.key, f.title]));
    const config = leerJson(join(RAIZ, 'arnes.config.json')) ?? leerJson(join(principal, 'arnes.config.json'));
    const t = resolverTracker(config, lista?.jira);
    const prefijos = [t.prefijo, ...(t.historicos ?? [])].filter(Boolean);
    const sueltas = keysSinTitulo(mensaje, { titulos, prefijos });
    if (sueltas.length > 0) avisos.push(notaDeTitulos(sueltas, titulos));
  }
} catch {
  /* sin scripts o sin datos: la regla no se puede comprobar, el turno sigue */
}

// --- 2. Validador de features ------------------------------------------------------------
if (existsSync(VALIDADOR)) {
  const r = spawnSync(process.execPath, [VALIDADOR], { cwd: RAIZ, encoding: 'utf8' });
  if (r.status !== 0) {
    const detalle = (r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join(' | ');
    avisos.push(`[arnes] el validador de features esta en ROJO: ${detalle}`);
  }
}

if (avisos.length > 0) salida.systemMessage = avisos.join('\n');

if (Object.keys(salida).length > 0) console.log(JSON.stringify(salida));
