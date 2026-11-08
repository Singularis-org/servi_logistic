#!/usr/bin/env node
/**
 * El `.github/workflows/gate.yml` del proyecto, GENERADO desde `arnes.config.json`
 * (`docs/gate.md > El CI se genera`).
 *
 *   node scripts/ci.mjs generar               escribe .github/workflows/gate.yml
 *   node scripts/ci.mjs generar --si-procede  solo si no existe o ya es generado (lo usa el sync)
 *   node scripts/ci.mjs comprobar             exit 1 si el gate.yml generado no esta al dia
 *
 * Por que: antes cada proyecto copiaba a mano un workflow de 400 lineas y lo adaptaba, asi que cada
 * mejora del CI del arnes habia que copiarla a mano otra vez en cada proyecto, y nadie lo hacia. Ahora
 * la mecanica vive en `.github/workflows/arnes-gate.yml` (del arnes, lo trae el sync) y el `gate.yml`
 * del proyecto es una llamada de 30 lineas que sale de `arnes.config.json`: ramas y bloque `ci`
 * (`shards`, `postgres_image`, `node_version`, `navegadores`, `e2e`). Lo propio del proyecto que no
 * cabe en un dato va en `scripts/ci-entorno.sh` y `scripts/ci-e2e-preparar.sh`.
 *
 * Un `gate.yml` escrito a mano (sin la marca de generado) no se pisa nunca: `check-perfil.mjs` avisa
 * de que conviene pasarlo al generado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUTA_GATE = '.github/workflows/gate.yml';
export const MARCA = '# GENERADO por scripts/ci.mjs desde arnes.config.json.';
export const CI_POR_DEFECTO = { shards: 3, postgres_image: 'postgres:17', node_version: '24', navegadores: 'chromium', e2e: true };

/** El bloque `ci` con los valores por defecto donde falten. */
export function ciDe(config) {
  const c = { ...CI_POR_DEFECTO, ...(config?.ci ?? {}) };
  delete c.$comment;
  return c;
}

/** Errores de forma de `ramas` y `ci` que impiden generar (lista vacia = bien). */
export function erroresCi(config) {
  const e = [];
  if (!config?.ramas?.integracion || !config?.ramas?.produccion) e.push('faltan ramas.integracion y ramas.produccion');
  for (const r of ["integracion", "produccion"]) {
    const v = config?.ramas?.[r];
    if (v && !/^[A-Za-z0-9._/-]+$/.test(v)) e.push(`ramas.${r} (${v}) solo admite letras, numeros y . _ / -`);
  }
  const c = ciDe(config);
  if (!Number.isInteger(c.shards) || c.shards < 1 || c.shards > 20) e.push('ci.shards debe ser un entero entre 1 y 20');
  if (typeof c.postgres_image !== 'string' || !/^[A-Za-z0-9._/:@-]+$/.test(c.postgres_image)) e.push('ci.postgres_image debe ser una imagen (p. ej. postgres:17)');
  if (!/^\d+$/.test(String(c.node_version))) e.push('ci.node_version debe ser una version mayor de Node (p. ej. "24")');
  if (typeof c.navegadores !== 'string' || !/^[a-z]+( [a-z]+)*$/.test(c.navegadores)) e.push('ci.navegadores: nombres de Playwright separados por espacio (p. ej. "chromium webkit")');
  if (typeof c.e2e !== 'boolean') e.push('ci.e2e debe ser true o false');
  return e;
}

/** El texto del `gate.yml`. Puro: lo prueba la guardia. */
export function generarGate(config) {
  const errores = erroresCi(config);
  if (errores.length > 0) throw new Error(errores.join('; '));
  const { integracion, produccion } = config.ramas;
  const c = ciDe(config);
  const lista = JSON.stringify(Array.from({ length: c.shards }, (_, i) => i + 1));
  return [
    MARCA,
    '# No lo edites a mano: cambia `ramas` o `ci` en arnes.config.json y corre',
    '# `node scripts/ci.mjs generar` (lo hace tambien `./scripts/arnes-sync.sh --aplicar`). La mecanica',
    '# del gate esta en arnes-gate.yml, que es del arnes (docs/gate.md > El CI se genera).',
    'name: gate',
    '',
    'on:',
    '  pull_request:',
    `    branches: [${integracion}, ${produccion}]`,
    '    types: [opened, synchronize, reopened, ready_for_review]',
    "    # Solo se salta lo que ningun test lee: el estado y los specs.",
    '    paths-ignore:',
    "      - 'progress/**'",
    "      - 'specs/**'",
    '  workflow_dispatch:',
    '',
    'permissions:',
    '  contents: read',
    '',
    '# Un push nuevo al mismo PR cancela la corrida anterior: su veredicto ya no describe la punta.',
    'concurrency:',
    '  group: gate-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
    '  cancel-in-progress: true',
    '',
    'jobs:',
    '  gate:',
    '    uses: ./.github/workflows/arnes-gate.yml',
    '    with:',
    `      rama_integracion: ${integracion}`,
    `      rama_produccion: ${produccion}`,
    `      shards: ${c.shards}`,
    `      shards_lista: '${lista}'`,
    `      postgres_image: ${c.postgres_image}`,
    `      node_version: '${c.node_version}'`,
    `      navegadores: ${c.navegadores}`,
    `      e2e: ${c.e2e}`,
    '    secrets: inherit',
    '',
  ].join('\n');
}

const normalizar = (t) => t.replace(/\r\n/g, '\n');
export const esGenerado = (texto) => normalizar(texto).startsWith(MARCA);

function leerConfig() {
  if (!existsSync('arnes.config.json')) throw new Error('falta arnes.config.json: corre /arnes-init');
  return JSON.parse(readFileSync('arnes.config.json', 'utf8'));
}

function main(args) {
  const [sub] = args;
  try {
    if (sub === 'generar') {
      if (args.includes('--si-procede') && existsSync(RUTA_GATE) && !esGenerado(readFileSync(RUTA_GATE, 'utf8'))) {
        console.log(`${RUTA_GATE} esta escrito a mano: no se toca (pasalo al generado con node scripts/ci.mjs generar)`);
        return 0;
      }
      const texto = generarGate(leerConfig());
      const antes = existsSync(RUTA_GATE) ? normalizar(readFileSync(RUTA_GATE, 'utf8')) : null;
      if (antes === texto) { console.log(`${RUTA_GATE} ya estaba al dia`); return 0; }
      mkdirSync(path.dirname(RUTA_GATE), { recursive: true });
      writeFileSync(RUTA_GATE, texto);
      console.log(`${RUTA_GATE} ${antes === null ? 'creado' : 'regenerado'} desde arnes.config.json`);
      return 0;
    }
    if (sub === 'comprobar') {
      if (!existsSync(RUTA_GATE)) { console.error(`falta ${RUTA_GATE}: node scripts/ci.mjs generar`); return 1; }
      const actual = normalizar(readFileSync(RUTA_GATE, 'utf8'));
      if (!esGenerado(actual)) { console.log(`${RUTA_GATE} escrito a mano (sin la marca de generado)`); return 0; }
      if (actual !== generarGate(leerConfig())) {
        console.error(`${RUTA_GATE} no esta al dia con arnes.config.json: node scripts/ci.mjs generar`);
        return 1;
      }
      console.log(`${RUTA_GATE} al dia con arnes.config.json`);
      return 0;
    }
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  console.error('uso: node scripts/ci.mjs <generar [--si-procede]|comprobar>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
