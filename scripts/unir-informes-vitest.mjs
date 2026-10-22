#!/usr/bin/env node
/**
 * Une los informes JSON de vitest de los N shards del CI en UN solo informe, para que el
 * veredicto del gate (baseline de rojos + las dos garantias de `init.sh`) se aplique UNA vez,
 * sobre la suite entera. Lo llama `./init.sh --unir <dir> <N>` (`docs/gate.md > En CI la
 * suite va en shards`).
 *
 * Por que no basta con que cada shard de su veredicto: un shard puede no traer NI UN archivo de
 * `tests/integration/`, y la garantia «los tres proyectos corrieron» daria rojo en falso; o al
 * reves, un shard que no llego a escribir su informe no puede contar como «un shard menos que
 * revisar». Por eso aqui:
 *
 *   - **Un shard sin informe es ROJO.** Se exige exactamente N informes. Si el job de un shard
 *     murio antes de subir su artefacto, el gate no sabe nada de los archivos que le tocaban, y
 *     dar verde con los otros N-1 seria afirmar algo sobre tests que no corrieron.
 *   - **Un informe ilegible es ROJO**, por la misma razon.
 *   - **Un mismo archivo en dos shards es ROJO.** El reparto de vitest es disjunto; si un
 *     archivo aparece dos veces, o se mezclaron artefactos de dos corridas o se subio el mismo
 *     dos veces, y en los dos casos el informe unido ya no describe UNA corrida.
 *   - **Cada informe trae al lado su `.vitest-codigo`** (el codigo de salida de vitest en ese
 *     shard). Sin el, la garantia de «contradiccion» de `init.sh` no tiene con que comparar.
 *
 * Uso:   node scripts/unir-informes-vitest.mjs <dir> <N> --out <archivo>
 * Busca `<dir>/**\/.vitest-rojos.json` (el CI los deja en `<dir>/informe-shard-<i>/`).
 * Salida: escribe el informe unido en `<archivo>` y por stdout SOLO el codigo de salida maximo
 * de los shards (lo lee `init.sh`; asi ese calculo vive en un unico sitio). Errores por stderr,
 * exit 1.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const INFORME = '.vitest-rojos.json';
const CODIGO = '.vitest-codigo';

const morir = (...lineas) => {
  for (const l of lineas) console.error(l);
  process.exit(1);
};

// --- 1. Argumentos ----------------------------------------------------------------------
const args = process.argv.slice(2);
const iOut = args.indexOf('--out');
const salida = iOut >= 0 ? args[iOut + 1] : undefined;
const posicionales = args.filter((_, i) => iOut < 0 || (i !== iOut && i !== iOut + 1));
const [dir, nCrudo] = posicionales;
const USO = 'uso: node scripts/unir-informes-vitest.mjs <dir> <N> --out <archivo>';
if (!dir || !nCrudo || !salida) morir(USO);
if (!/^[1-9][0-9]*$/.test(nCrudo)) morir(`N tiene que ser un entero positivo y llego "${nCrudo}".`, USO);
const N = Number(nCrudo);
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  morir(`no existe la carpeta de informes ${dir}: ningun shard dejo su informe.`);
}

// --- 2. Encontrar los informes ----------------------------------------------------------
/** Todas las rutas a `.vitest-rojos.json` bajo `raiz`, en orden estable. */
function buscar(raiz) {
  const hallados = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const ruta = join(raiz, entrada.name);
    if (entrada.isDirectory()) hallados.push(...buscar(ruta));
    else if (entrada.name === INFORME) hallados.push(ruta);
  }
  return hallados.sort();
}

const rutas = buscar(dir);
if (rutas.length !== N) {
  morir(
    `se esperaban ${N} informes de shard (${INFORME}) en ${dir} y hay ${rutas.length}:`,
    ...rutas.map((r) => `  ${r}`),
    'un shard sin informe es ROJO, no «un shard menos»: los archivos que le tocaban no se sabe si corrieron.',
  );
}

// --- 3. Leer cada informe y su codigo ---------------------------------------------------
// Rutas comparables entre Windows y Linux, igual que `comparar-baseline-rojos.mjs`.
const normalizar = (p) => relative(process.cwd(), resolve(p)).split('\\').join('/');

const informes = [];
let codigoMax = 0;
for (const ruta of rutas) {
  let informe;
  try {
    informe = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (err) {
    morir(`${ruta} no se pudo leer como JSON: ${err.message}`);
  }
  if (!informe || !Array.isArray(informe.testResults)) {
    morir(`${ruta} no es un informe de vitest: le falta la lista testResults.`);
  }
  const rutaCodigo = join(ruta, '..', CODIGO);
  if (!existsSync(rutaCodigo)) {
    morir(`falta ${rutaCodigo}: sin el codigo de salida del shard no se puede detectar un fallo fuera de los tests.`);
  }
  const codigoCrudo = readFileSync(rutaCodigo, 'utf8').trim();
  if (!/^[0-9]+$/.test(codigoCrudo)) morir(`${rutaCodigo} no trae un codigo de salida: "${codigoCrudo}".`);
  codigoMax = Math.max(codigoMax, Number(codigoCrudo));
  informes.push({ ruta, informe });
}

// --- 4. Ningun archivo en dos shards ----------------------------------------------------
const visto = new Map();
const repetidos = [];
for (const { ruta, informe } of informes) {
  for (const suite of informe.testResults) {
    const archivo = normalizar(suite.name);
    const previo = visto.get(archivo);
    if (previo && previo !== ruta) repetidos.push(`  ${archivo} (en ${previo} y en ${ruta})`);
    else visto.set(archivo, ruta);
  }
}
if (repetidos.length > 0) {
  morir(
    'el mismo archivo de test aparece en dos informes de shard:',
    ...repetidos,
    'el reparto de vitest es disjunto: o se mezclaron artefactos de dos corridas o uno se subio dos veces.',
  );
}

// --- 5. Unir ----------------------------------------------------------------------------
// Contadores numericos de primer nivel: se suman (numTotalTests, numFailedTests, ...).
// `startTime` es la excepcion: el inicio de la corrida unida es el primero de todos.
const unido = { ...informes[0].informe, testResults: [] };
for (const clave of Object.keys(unido)) {
  if (typeof unido[clave] === 'number') unido[clave] = 0;
}
for (const { informe } of informes) {
  for (const [clave, valor] of Object.entries(informe)) {
    if (typeof valor !== 'number') continue;
    if (clave === 'startTime') unido.startTime = Math.min(unido.startTime || valor, valor);
    else unido[clave] = (unido[clave] ?? 0) + valor;
  }
  unido.testResults.push(...informe.testResults);
}
unido.success = informes.every(({ informe }) => informe.success === true);

writeFileSync(salida, JSON.stringify(unido));
console.error(
  `informes unidos: ${N} shards, ${unido.testResults.length} archivos, ` +
    `${unido.numTotalTests ?? '?'} tests (${unido.numFailedTests ?? '?'} en rojo).`,
);
console.log(String(codigoMax));
