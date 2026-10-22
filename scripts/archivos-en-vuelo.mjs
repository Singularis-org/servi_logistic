#!/usr/bin/env node
/**
 * Archivos en vuelo de TODO el equipo, para la validacion de conflicto de F1.0
 * (`AGENTS.md > Paralelismo`, `docs/equipo.md`).
 *
 *   node scripts/archivos-en-vuelo.mjs                     inventario por feature en vuelo
 *   node scripts/archivos-en-vuelo.mjs --candidata QC-12   interseccion con la candidata; exit 1 si choca
 *   node scripts/archivos-en-vuelo.mjs --candidata QC-12 --acepto QC-7,QC-9
 *                                                          choques con esas keys aceptados por el humano
 *
 * Por que existe: antes la validacion leia `progress/impl_<feature>.md` del disco local, pero
 * las features de los companeros viven en SUS ramas, no en tu disco. Aqui la fuente es el
 * remoto: por cada feature `in_progress`/`spec_ready` (de cualquiera) con rama publicada,
 *   - archivos TOCADOS: `git diff --name-only origin/<integracion>...origin/<rama>`
 *   - archivos ESPERADOS: rutas entre backticks de la seccion `## Archivos esperados` de su
 *     `tasks.md` (`docs/specs.md > tasks.md`), leido de su rama. Si el tasks.md no tiene esa
 *     seccion, todas las rutas entre backticks del archivo MENOS las que empiezan por `./`
 *     (son comandos: `./init.sh`, `./scripts/x.sh`), y avisa.
 * Requisito para que sirva: cada tanda termina con `git push` (AGENTS.md > F2.1).
 *
 * `specs/` y `progress/` no cuentan como conflicto: cada feature escribe en su carpeta.
 * Los archivos COMPARTIDOS de apendice (`tests/baseline-rojos.json`, `progress/deudas.md`;
 * ampliable en `arnes.config.json > equipo.archivos_compartidos`) dan AVISO, no CHOCA.
 * Por que (2026-10-08): `./init.sh` citado como comando y el baseline compartido hacian que
 * toda candidata chocara con todo lo que estaba en vuelo (`docs/equipo.md`).
 *
 * Solo CHOCA con OTRA persona. Fichas del mismo dueno (mismo `assignee.accountId`, no nulo)
 * dan AVISO: el dueno decide su orden. Un choque con otra persona sigue siendo CHOCA (exit 1)
 * salvo que su key venga en `--acepto` (lista por comas o la opcion repetida): entonces sale
 * `CHOCA ACEPTADO` y no cuenta. La aceptacion es del humano y se anota en
 * `progress/features/<candidata>.md > Decisiones`; el conflicto lo resuelve quien mergee
 * segundo (AGENTS.md > F2.3). Una key de `--acepto` que no choca da AVISO.
 * Por que (2026-10-13): `spec_ready` cuenta como en vuelo, y cinco specs aprobados de un mismo
 * dueno con orden acordado chocaban entre si y ninguno arrancaba; y una feature quedaba parada
 * por un solo test compartido con otra persona. Humano: avanzar sin bloqueantes y arreglar los
 * conflictos al final si hace falta (`docs/equipo.md`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitOpcional = (...args) => {
  try { return git(...args); } catch { return null; }
};

const raiz = path.dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
const config = existsSync('arnes.config.json') ? JSON.parse(readFileSync('arnes.config.json', 'utf8')) : {};
const INTEGRACION = config.ramas?.integracion ?? 'dev';
const listaPath = path.join(raiz, 'feature_list.json');
if (!existsSync(listaPath)) {
  console.error('no hay feature_list.json en la raiz del repo: corre F0 primero');
  process.exit(2);
}
const { features } = JSON.parse(readFileSync(listaPath, 'utf8'));

const args = process.argv.slice(2);
const iCand = args.indexOf('--candidata');
const candidata = iCand >= 0 ? args[iCand + 1] : null;
// `--acepto QC-a,QC-b`, `--acepto=QC-a` o la opcion repetida: keys cuyo choque acepto el humano.
const aceptadas = new Set();
args.forEach((a, i) => {
  const valor = a === '--acepto' ? args[i + 1] : a.startsWith('--acepto=') ? a.slice('--acepto='.length) : null;
  for (const k of (valor ?? '').split(',')) if (k.trim()) aceptadas.add(k.trim());
});

gitOpcional('fetch', '--quiet', '--prune', 'origin');

const RUTA = /`([\w.@()[\]\-]+(?:\/[\w.@()[\]\-]+)+\.[a-z0-9]+)`/gi;
// Dentro de `## Archivos esperados` tambien cuentan los archivos de la raiz (`init.sh`, `package.json`).
const RUTA_EN_SECCION = /`([\w.@()[\]\-]+(?:\/[\w.@()[\]\-]+)*\.[a-z0-9]+)`/gi;
const ignorable = (f) => f.startsWith('specs/') || f.startsWith('progress/');
const COMPARTIDOS = new Set(config.equipo?.archivos_compartidos ?? ['tests/baseline-rojos.json', 'progress/deudas.md']);

/** Cuerpo de la seccion `## Archivos ...` (canon: `## Archivos esperados`), o null si no hay. */
function seccionArchivos(texto) {
  const lineas = texto.split(/\r?\n/);
  const i = lineas.findIndex((l) => /^##\s+Archivos\b/i.test(l));
  if (i < 0) return null;
  const fin = lineas.findIndex((l, j) => j > i && /^#{1,2}\s/.test(l));
  return lineas.slice(i + 1, fin < 0 ? undefined : fin).join('\n');
}

/**
 * Rutas de archivo esperadas de un tasks.md. Con seccion `## Archivos esperados`, solo las de
 * la seccion (alli `./x` es un archivo). Sin ella, las de todo el archivo salvo las que empiezan
 * por `./`, que en el cuerpo del tasks.md son comandos (`./init.sh`). `sinSeccion` lo marca.
 */
function esperados(texto) {
  const seccion = seccionArchivos(texto);
  const out = new Set();
  for (const m of seccion == null ? texto.matchAll(RUTA) : seccion.matchAll(RUTA_EN_SECCION)) {
    if (seccion == null && m[1].startsWith('./')) continue;
    const ruta = m[1].replace(/^\.\//, '');
    if (!ignorable(ruta)) out.add(ruta);
  }
  return { rutas: out, sinSeccion: seccion == null };
}

const ramaDe = (f) => f.branch ?? `feature/${f.key ?? f.id}-${f.name}`;
const specDe = (f) => f.spec_path ?? `specs/${f.key ?? f.id}-${f.name}`;

const enVuelo = features.filter((f) => ['in_progress', 'spec_ready'].includes(f.status) && (f.key ?? String(f.id)) !== candidata);
const inventario = [];
for (const f of enVuelo) {
  const rama = ramaDe(f);
  const remoto = `origin/${rama}`;
  if (gitOpcional('rev-parse', '--verify', '--quiet', remoto) == null) {
    inventario.push({ f, rama, publicada: false, archivos: new Set() });
    continue;
  }
  const tocados = (gitOpcional('diff', '--name-only', `origin/${INTEGRACION}...${remoto}`) ?? '')
    .split('\n').filter((l) => l && !ignorable(l));
  const tasks = gitOpcional('show', `${remoto}:${specDe(f)}/tasks.md`);
  const esp = tasks == null ? { rutas: new Set(), sinSeccion: false } : esperados(tasks);
  inventario.push({ f, rama, publicada: true, sinSeccion: esp.sinSeccion, archivos: new Set([...tocados, ...esp.rutas]) });
}

const quien = (f) => f.assignee?.displayName ?? 'sin assignee';

if (!candidata) {
  for (const { f, rama, publicada, sinSeccion, archivos } of inventario) {
    const nota = !publicada ? '  [rama NO publicada: no se puede saber que toca]' : sinSeccion ? '  [tasks.md sin `## Archivos esperados`]' : '';
    console.log(`${f.key ?? f.id} (${quien(f)}) ${rama}${nota}`);
    for (const a of [...archivos].sort()) console.log(`  ${a}`);
  }
  process.exit(0);
}

// Archivos esperados de la candidata: su tasks.md donde este (worktree actual, raiz o hermanos).
const fichaCand = features.find((f) => f.key === candidata || String(f.id) === candidata);
if (!fichaCand) {
  console.error(`la candidata ${candidata} no esta en feature_list.json`);
  process.exit(2);
}
const bases = ['.', raiz, ...(existsSync(path.join(raiz, '.worktrees'))
  ? readdirSync(path.join(raiz, '.worktrees')).map((d) => path.join(raiz, '.worktrees', d)) : [])];
let tasksCand = null;
for (const b of bases) {
  const p = path.join(b, specDe(fichaCand), 'tasks.md');
  if (existsSync(p)) { tasksCand = readFileSync(p, 'utf8'); break; }
}
if (tasksCand == null) {
  console.error(`no encuentro ${specDe(fichaCand)}/tasks.md: la validacion de conflicto necesita el tasks.md de la candidata`);
  process.exit(2);
}
const { rutas: mios, sinSeccion: candSinSeccion } = esperados(tasksCand);
const SIN_SECCION = 'su tasks.md no tiene `## Archivos esperados`: se leen las rutas de todo el archivo (docs/specs.md > tasks.md)';
if (candSinSeccion) console.log(`AVISO: ${candidata}: ${SIN_SECCION}`);

// Mismo dueno: mismo `assignee.accountId` y no nulo (sin assignee nunca es "el mismo").
const duenoCand = fichaCand.assignee?.accountId ?? null;
const mismoDueno = (f) => duenoCand != null && f.assignee?.accountId === duenoCand;
const usadas = new Set();

let choques = 0;
for (const { f, publicada, sinSeccion, archivos } of inventario) {
  if (!publicada) {
    console.log(`AVISO: ${f.key ?? f.id} (${quien(f)}) esta en vuelo y su rama no esta publicada: no se puede comprobar el conflicto`);
    continue;
  }
  if (sinSeccion) console.log(`AVISO: ${f.key ?? f.id} (${quien(f)}): ${SIN_SECCION}`);
  const comunes = [...mios].filter((a) => archivos.has(a));
  const compartidos = comunes.filter((a) => COMPARTIDOS.has(a));
  const reales = comunes.filter((a) => !COMPARTIDOS.has(a));
  if (compartidos.length > 0) {
    console.log(`AVISO: comparte con ${f.key ?? f.id} (${quien(f)}) archivos de apendice, no choca: ${compartidos.join(', ')}`);
  }
  if (reales.length === 0) continue;
  const key = f.key ?? String(f.id);
  if (mismoDueno(f)) {
    console.log(`AVISO: mismo dueño que ${key} (${quien(f)}), no choca: ${reales.join(', ')} — el dueño decide el orden y lo anota en progress/features/<key>.md`);
  } else if (aceptadas.has(key)) {
    usadas.add(key);
    console.log(`CHOCA ACEPTADO con ${key} (${quien(f)}): ${reales.join(', ')} — anotalo en progress/features/${candidata}.md > Decisiones`);
  } else {
    choques++;
    console.log(`CHOCA con ${key} (${quien(f)}): ${reales.join(', ')}`);
  }
}
for (const k of aceptadas) {
  if (!usadas.has(k)) console.log(`AVISO: --acepto ${k}: no hay choque con otra persona que aceptar, no se aplica`);
}
if (choques === 0) console.log(`${candidata}: sin conflicto de archivos con ${inventario.length} feature(s) en vuelo`);
process.exit(choques > 0 ? 1 : 0);
