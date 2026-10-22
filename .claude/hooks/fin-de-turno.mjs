#!/usr/bin/env node
// Hook Stop del arnes v2. Corre el validador de features (offline, <1 s) y solo habla si falla:
// un recordatorio que sale en cada turno se deja de leer. Sale siempre con 0 para no bloquear.
// Las rutas se resuelven contra la raiz del repo, no contra el cwd (guard-hooks-anclados).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const VALIDADOR = join(RAIZ, 'scripts', 'validate-features.mjs');

if (existsSync(VALIDADOR)) {
  const r = spawnSync(process.execPath, [VALIDADOR], { cwd: RAIZ, encoding: 'utf8' });
  if (r.status !== 0) {
    const detalle = (r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join(' | ');
    console.log(JSON.stringify({ systemMessage: `[arnes] el validador de features esta en ROJO: ${detalle}` }));
  }
}
