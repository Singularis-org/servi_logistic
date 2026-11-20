#!/usr/bin/env node
/**
 * Metricas del ciclo: donde se va el tiempo de una feature (`docs/gate.md > Medir el ciclo`).
 *
 *   node scripts/metricas.mjs gate --modo <m> --segundos <n> --codigo <c>   lo llama init.sh al salir
 *   node scripts/metricas.mjs fase <key> <F1.0|F1.3|F1.4|F2.1|F2.4|F2.5>    lo llama el leader
 *   node scripts/metricas.mjs informe [--desde AAAA-MM-DD] [--key K] [--sin-ci]  el resumen
 *
 * Por que: en el proyecto de origen nadie sabia donde se iba el tiempo. Hubo que reconstruirlo a
 * mano (2026-11-07): mediana de 38 h por feature, CI de 13 min, 41% de corridas de CI en rojo o
 * canceladas. Sin medir, ninguna mejora del gate se puede evaluar.
 *
 * Los eventos van, uno por linea (JSONL), a `progress/logs/metricas.jsonl` en la raiz del worktree
 * principal: no se versiona, es de cada maquina. El CI se lee de GitHub con `gh` (compartido).
 * Registrar nunca falla ni bloquea: una metrica perdida no puede romper el gate.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FASES = ['F1.0', 'F1.3', 'F1.4', 'F2.1', 'F2.4', 'F2.5'];
// Tramos del ciclo: [desde, hasta, nombre]. Si falta una fase intermedia, el tramo no se cuenta.
export const TRAMOS = [
  ['F1.0', 'F1.3', 'tomar -> spec listo'],
  ['F1.3', 'F1.4', 'espera de aprobacion del spec'],
  ['F1.4', 'F2.4', 'implementacion hasta el PR'],
  ['F2.1', 'F2.4', 'tandas hasta el PR'],
  ['F2.4', 'F2.5', 'PR -> merge (CI + review humana)'],
  ['F1.0', 'F2.5', 'ciclo completo'],
];

/** `feature/PROY-12-algo` -> `PROY-12`; cualquier otra rama -> null. */
export function keyDeRama(rama) {
  const m = /^feature\/([A-Z][A-Z0-9]*-\d+)-/.exec(String(rama ?? ''));
  return m ? m[1] : null;
}

export function mediana(xs) {
  const v = [...xs].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function percentil(xs, p) {
  const v = [...xs].sort((a, b) => a - b);
  return v.length === 0 ? null : v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
}

/**
 * Resumen de los eventos. Puro: lo prueba la guardia.
 * @param {Array<object>} eventos lineas del JSONL ya parseadas
 */
export function resumir(eventos, { desde, key } = {}) {
  const desdeMs = desde ? Date.parse(`${desde}T00:00:00Z`) : -Infinity;
  const ev = eventos.filter((e) => Date.parse(e.ts) >= desdeMs && (!key || e.key === key));

  const gate = {};
  for (const e of ev.filter((x) => x.tipo === 'gate')) {
    (gate[e.modo] ??= []).push(e);
  }
  const gates = Object.entries(gate).map(([modo, es]) => ({
    modo,
    corridas: es.length,
    mediana_s: mediana(es.map((x) => x.segundos)),
    p90_s: percentil(es.map((x) => x.segundos), 90),
    rojo_pct: Math.round((100 * es.filter((x) => !x.ok).length) / es.length),
  }));

  // Por key, la PRIMERA vez que se registra cada fase (una fase repetida no reinicia el reloj).
  const porKey = new Map();
  for (const e of ev.filter((x) => x.tipo === 'fase')) {
    const f = porKey.get(e.key) ?? {};
    if (!(e.fase in f)) f[e.fase] = Date.parse(e.ts);
    porKey.set(e.key, f);
  }
  const tramos = TRAMOS.map(([a, b, nombre]) => {
    const horas = [...porKey.values()].filter((f) => f[a] != null && f[b] != null && f[b] >= f[a]).map((f) => (f[b] - f[a]) / 3_600_000);
    return { tramo: nombre, features: horas.length, mediana_h: horas.length ? +mediana(horas).toFixed(1) : null, max_h: horas.length ? +Math.max(...horas).toFixed(1) : null };
  });

  const tandas = new Map();
  for (const e of ev.filter((x) => x.tipo === 'gate' && x.key)) tandas.set(e.key, (tandas.get(e.key) ?? 0) + 1);
  return { gates, tramos, features: porKey.size, corridas_de_gate_por_feature: mediana([...tandas.values()]) };
}

/** Resumen del CI de GitHub (`gh run list`), o el motivo por el que no se pudo leer. */
export function resumirCi(corridas) {
  const terminadas = corridas.filter((r) => r.conclusion && r.conclusion !== 'skipped');
  if (terminadas.length === 0) return { corridas: 0 };
  const min = terminadas.map((r) => (Date.parse(r.updatedAt) - Date.parse(r.createdAt)) / 60_000);
  const malas = terminadas.filter((r) => r.conclusion !== 'success').length;
  return {
    corridas: terminadas.length,
    mediana_min: +mediana(min).toFixed(1),
    p90_min: +percentil(min, 90).toFixed(1),
    rojo_o_cancelada_pct: Math.round((100 * malas) / terminadas.length),
  };
}

// ------------------------------------------------------------------------------- disco y CLI

function raizPrincipal() {
  try {
    const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (comun) return path.dirname(comun);
  } catch { /* sin git */ }
  return process.cwd();
}

export const rutaMetricas = (raiz = raizPrincipal()) => path.join(raiz, 'progress', 'logs', 'metricas.jsonl');

function registrar(evento, raiz) {
  try {
    const ruta = rutaMetricas(raiz);
    mkdirSync(path.dirname(ruta), { recursive: true });
    appendFileSync(ruta, `${JSON.stringify({ ts: new Date().toISOString(), ...evento })}\n`);
  } catch { /* una metrica perdida no rompe nada */ }
}

function leerEventos(raiz) {
  const ruta = rutaMetricas(raiz);
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

const rama = () => {
  const r = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
};

const valor = (args, f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

function main(args) {
  const [sub, ...resto] = args;
  if (sub === 'gate') {
    const r = rama();
    registrar({
      tipo: 'gate',
      modo: valor(resto, '--modo') ?? '?',
      segundos: Number(valor(resto, '--segundos') ?? 0),
      ok: valor(resto, '--codigo') === '0',
      rama: r,
      key: keyDeRama(r),
    });
    return 0;
  }
  if (sub === 'fase') {
    const [key, fase] = resto;
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key ?? '') || !FASES.includes(fase)) {
      console.error(`uso: node scripts/metricas.mjs fase <KEY> <${FASES.join('|')}>`);
      return 2;
    }
    registrar({ tipo: 'fase', key, fase });
    console.log(`metrica: ${key} ${fase}`);
    return 0;
  }
  if (sub === 'informe') {
    const key = valor(resto, '--key');
    const r = resumir(leerEventos(), { desde: valor(resto, '--desde'), key });
    if (key) console.log(`(solo ${key})`);
    console.log(`== Gate local (${rutaMetricas()})`);
    if (r.gates.length === 0) console.log('  sin corridas registradas (init.sh las registra al salir)');
    for (const g of r.gates) console.log(`  ${g.modo}: ${g.corridas} corridas, mediana ${g.mediana_s} s, p90 ${g.p90_s} s, ${g.rojo_pct}% en rojo`);
    if (r.corridas_de_gate_por_feature != null) console.log(`  corridas de gate por feature (mediana): ${r.corridas_de_gate_por_feature}`);
    console.log(`== Ciclo por fase (${r.features} feature/s con fases registradas)`);
    for (const t of r.tramos) console.log(`  ${t.tramo}: ${t.features ? `mediana ${t.mediana_h} h, max ${t.max_h} h (${t.features})` : 'sin datos'}`);
    if (!resto.includes('--sin-ci') && !key) {
      const gh = spawnSync('gh', ['run', 'list', '--workflow', 'gate', '--limit', '100', '--json', 'conclusion,createdAt,updatedAt'], { encoding: 'utf8' });
      console.log('== CI (gh run list --workflow gate, ultimas 100)');
      if (gh.status !== 0) console.log(`  no se pudo leer: ${(gh.stderr || 'gh no disponible').trim().split('\n')[0]}`);
      else {
        const c = resumirCi(JSON.parse(gh.stdout || '[]'));
        console.log(c.corridas ? `  ${c.corridas} corridas, mediana ${c.mediana_min} min, p90 ${c.p90_min} min, ${c.rojo_o_cancelada_pct}% en rojo o canceladas` : '  sin corridas terminadas');
      }
    }
    return 0;
  }
  console.error('uso: node scripts/metricas.mjs <gate|fase|informe> ... (cabecera del script)');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
