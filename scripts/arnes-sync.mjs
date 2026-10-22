#!/usr/bin/env node
/**
 * arnes-sync — mueve el ARNES entre este proyecto y la plantilla, en las dos direcciones.
 *
 *   node scripts/arnes-sync.mjs                  BAJAR, dry-run: que traeria la plantilla
 *   node scripts/arnes-sync.mjs --aplicar        BAJAR: aplica lo que cambio en la plantilla
 *   node scripts/arnes-sync.mjs --subir -m "…"   SUBIR: abre un PR en la plantilla con tus mejoras
 *   node scripts/arnes-sync.mjs --estado         sin red: mejoras locales sin subir (lo usa init.sh)
 *   --aplicar --resuelto <archivo>               tras integrar a mano un conflicto: lo da por resuelto
 *   --desde <url|ruta>  --ref <rama>             plantilla (default: arnes.config.json > plantilla)
 *
 * Como sabe quien cambio que: `arnes.lock.json` (versionado) guarda el hash de cada archivo del
 * arnes TAL COMO LO TRAJO el ultimo sync. Con tres hashes por archivo —local (L), base del lock (B)
 * y plantilla (T)— cada caso tiene un solo significado:
 *   L = T            igual, nada que hacer
 *   L = B, T != B    la plantilla trae algo nuevo          → BAJAR lo aplica
 *   T = B, L != B    mejora local que la plantilla no tiene → BAJAR NO la pisa; SUBIR la propone
 *   los tres distintos  conflicto                          → nadie lo toca; se resuelve a mano
 *
 * Por que: antes el sync copiaba la plantilla encima sin mirar, y una mejora hecha en el proyecto
 * se perdia en silencio en el siguiente sync. Y subir una mejora a la plantilla era una instruccion
 * para el agente, no un paso mecanico. Ahora las mejoras viajan por un PR que revisa un humano.
 *
 * Solo toca archivos de `arnes.manifest`. Nunca toca el perfil del proyecto. Nunca borra: un archivo
 * que la plantilla quito se reporta.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LOCK = 'arnes.lock.json';
const CONFIG = 'arnes.config.json';
const PLANTILLA_POR_DEFECTO = { url: 'https://github.com/singularis-co/harness_config.git', ref: 'main' };

const C = { r: '\x1b[0;31m', g: '\x1b[0;32m', y: '\x1b[1;33m', d: '\x1b[2m', n: '\x1b[0m' };
const fail = (m) => { console.error(`${C.r}✗ ${m}${C.n}`); process.exit(1); };

// ---------------------------------------------------------------------------------- argumentos
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valor = (...fs) => { for (const f of fs) { const i = args.indexOf(f); if (i >= 0) return args[i + 1]; } return undefined; };
if (flag('-h') || flag('--help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 10).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  process.exit(0);
}
const RESUELTOS = args.flatMap((a, i) => (a === '--resuelto' ? [args[i + 1]] : [])).filter(Boolean);
const MODO = flag('--subir') ? 'subir' : flag('--estado') ? 'estado' : flag('--aplicar') ? 'aplicar' : 'ver';

if (!existsSync(CONFIG)) fail(`corre esto en la raiz de un proyecto con arnes (falta ${CONFIG})`);
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const DESDE = valor('--desde') ?? config.plantilla?.url ?? PLANTILLA_POR_DEFECTO.url;
const REF = valor('--ref') ?? config.plantilla?.ref ?? PLANTILLA_POR_DEFECTO.ref;

// ---------------------------------------------------------------------------------- utilidades
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** Hash del contenido con los finales de linea normalizados: el mismo archivo en Windows y Linux. */
const hashDe = (ruta) => (existsSync(ruta) ? createHash('sha256').update(readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')).digest('hex') : null);

function entradas(raiz) {
  const m = path.join(raiz, 'arnes.manifest');
  if (!existsSync(m)) return [];
  return readFileSync(m, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}
function archivosDe(raiz) {
  const out = new Set();
  const recorrer = (rel) => {
    for (const d of readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const r = `${rel}/${d.name}`;
      if (d.isDirectory()) recorrer(r); else out.add(r);
    }
  };
  for (const e of entradas(raiz)) {
    if (e.endsWith('/')) { if (existsSync(path.join(raiz, e))) recorrer(e.slice(0, -1)); }
    else if (existsSync(path.join(raiz, e))) out.add(e);
  }
  return out;
}
const leerLock = () => (existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null);

// ---------------------------------------------------------------------------------- --estado
if (MODO === 'estado') {
  const lock = leerLock();
  if (!lock) { console.log(`AVISO: sin ${LOCK}: el sync no sabe que version del arnes tienes. Corre ./scripts/arnes-sync.sh --aplicar`); process.exit(0); }
  const locales = [...archivosDe('.')].filter((f) => hashDe(f) !== (lock.archivos[f] ?? null));
  for (const s of lock.subidos ?? []) console.log(`subido a la plantilla y pendiente de merge alli: ${s.pr} (${s.archivos.length} archivo/s)`);
  if (locales.length === 0) console.log(`arnes al dia con la plantilla ${lock.arnes_version ?? ''} (${lock.commit?.slice(0, 7) ?? '?'})`.trim());
  else console.log(`AVISO: ${locales.length} archivo(s) del arnes cambiados en este proyecto y sin subir a la plantilla: ${locales.join(', ')}. Subelos con /afinar-regla o ./scripts/arnes-sync.sh --subir -m "<que mejora>"`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------- plantilla
const tmp = mkdtempSync(path.join(tmpdir(), 'arnes-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const P = path.join(tmp, 'plantilla');
try {
  execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', '--branch', REF, DESDE, P], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  fail(`no pude clonar ${DESDE}@${REF}: ${String(e.stderr ?? e.message).trim()}`);
}
if (!existsSync(path.join(P, 'arnes.manifest'))) fail('la plantilla no trae arnes.manifest');
const COMMIT = git(P, 'rev-parse', 'HEAD');
let VERSION = '?';
try { VERSION = JSON.parse(readFileSync(path.join(P, 'arnes.config.example.json'), 'utf8')).arnes_version ?? '?'; } catch { /* sin version */ }

// ---------------------------------------------------------------------------------- clasificar
const lock = leerLock();
const base = lock?.archivos ?? {};
const todos = [...new Set([...archivosDe(P), ...archivosDe('.'), ...Object.keys(base)])].sort();
const grupos = { igual: [], bajar: [], local: [], conflicto: [], quitado: [], sinBase: [] };
for (const f of todos) {
  const L = hashDe(f), T = hashDe(path.join(P, f)), B = base[f] ?? null;
  if (L === T) grupos.igual.push(f);
  else if (T === null && B !== null && L === B) grupos.quitado.push(f);   // la plantilla lo quito; tu no lo tocaste
  else if (!lock) grupos[L === null ? 'bajar' : 'sinBase'].push(f);         // sin lock: solo es seguro traer lo que falta
  else if (L === B) grupos.bajar.push(f);
  else if (T === B) grupos.local.push(f);
  else grupos.conflicto.push(f);
}

const pinta = (color, marca, lista, nota = '') => lista.forEach((f) => console.log(`${color}${marca} ${f}${C.n}${nota ? `  ${C.d}${nota}${C.n}` : ''}`));

// ---------------------------------------------------------------------------------- --subir
if (MODO === 'subir') {
  const mensaje = valor('-m', '--mensaje');
  if (!mensaje) fail('falta -m "<que mejora>": es el titulo del PR en la plantilla');
  if (!lock) fail(`sin ${LOCK} no se puede saber que cambiaste tu. Corre primero ./scripts/arnes-sync.sh --aplicar`);
  if (grupos.conflicto.length) {
    pinta(C.r, '!', grupos.conflicto, 'la plantilla tambien lo cambio');
    fail('hay archivos que cambiaste tu Y la plantilla. Baja primero (--aplicar no los toca), integra a mano y vuelve a subir.');
  }
  if (grupos.local.length === 0) { console.log('no hay mejoras locales del arnes que subir'); process.exit(0); }

  const proyecto = config.jira?.project ?? path.basename(process.cwd());
  const slug = mensaje.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  // Fecha y hora UTC: dos subidas el mismo dia con el mismo titulo no chocan en el nombre de rama.
  const sello = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const rama = `mejora/${proyecto.toLowerCase()}-${slug}-${sello}`;
  git(P, 'checkout', '-q', '-b', rama);
  for (const f of grupos.local) {
    const destino = path.join(P, f);
    if (existsSync(f)) {
      mkdirSync(path.dirname(destino), { recursive: true });
      cpSync(f, destino);
      // El bit de ejecucion viaja por el indice de git, no por el disco (en Windows no existe):
      // se copia del indice del proyecto al de la plantilla.
      const modo = (() => { try { return git('.', 'ls-files', '-s', '--', f).split(' ')[0]; } catch { return ''; } })();
      if (modo === '100755') { git(P, 'add', '--', f); git(P, 'update-index', '--chmod=+x', '--', f); }
    }
    else rmSync(destino, { force: true });   // la borraste tu en el proyecto
  }
  const autor = (() => { try { return git('.', 'config', 'user.name'); } catch { return 'desconocido'; } })();
  git(P, 'add', '-A');
  git(P, 'commit', '-q', '-m', `feat(arnes): ${mensaje}`, '-m', `Mejora subida desde ${proyecto} por ${autor} con scripts/arnes-sync.mjs --subir.\nArchivos: ${grupos.local.join(', ')}`);
  try { git(P, 'push', '-q', '-u', 'origin', rama); } catch (e) { fail(`no pude publicar la rama en la plantilla: ${String(e.stderr ?? e.message).trim()}`); }
  const cuerpo = [
    `Mejora del arnés propuesta desde **${proyecto}** (${autor}).`,
    '',
    '**Archivos**',
    ...grupos.local.map((f) => `- \`${f}\``),
    '',
    'Al mergear, cada proyecto la recibe con `./scripts/arnes-sync.sh --aplicar`.',
    'Si cambia el contrato del arnés, sube `arnes_version` en `arnes.config.example.json` y añade la entrada en `CHANGELOG.md` antes de mergear.',
  ].join('\n');
  let url = '';
  try {
    url = execFileSync('gh', ['pr', 'create', '--base', REF, '--head', rama, '--title', `feat(arnes): ${mensaje}`, '--body', cuerpo], { cwd: P, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    fail(`la rama ${rama} quedo publicada, pero no pude abrir el PR: ${String(e.stderr ?? e.message).trim()}`);
  }
  pinta(C.g, '↑', grupos.local);
  // El lock pasa a registrar TU version de cada archivo subido, como si la plantilla ya la tuviera:
  // asi el commit del lock viaja en el MISMO PR del proyecto y, cuando se mergean los dos PRs, el
  // proyecto ya esta "al dia" sin un PR extra. Si la plantilla rechaza o cambia la mejora, el
  // siguiente --aplicar lo ve como cambio de la plantilla y baja su version: manda la plantilla.
  for (const f of grupos.local) {
    if (existsSync(f)) lock.archivos[f] = hashDe(f); else delete lock.archivos[f];
  }
  lock.subidos = [...(lock.subidos ?? []), { pr: url, archivos: grupos.local, fecha: new Date().toISOString().slice(0, 10) }];
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`\nPR en la plantilla: ${url}`);
  console.log(`${LOCK} actualizado: commitealo en el MISMO PR del proyecto. Cuando los dos PRs se mergeen, el proyecto queda al dia sin nada mas.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------- bajar
pinta(C.g, '↓', grupos.bajar, 'la plantilla lo cambio');
pinta(C.y, '↑', grupos.local, 'mejora local sin subir: NO se pisa (--subir para proponerla)');
pinta(C.r, '!', grupos.conflicto.filter((f) => !RESUELTOS.includes(f)), 'conflicto: cambiaste tu y la plantilla; NO se toca. Integra a mano y luego --aplicar --resuelto <archivo>');
pinta(C.g, '✓', grupos.conflicto.filter((f) => RESUELTOS.includes(f)), 'conflicto marcado como resuelto: tu version queda como mejora local');
for (const f of RESUELTOS) if (!grupos.conflicto.includes(f) && !grupos.sinBase.includes(f)) console.log(`${C.y}! --resuelto ${f}: no esta en conflicto, se ignora${C.n}`);
pinta(C.r, '?', grupos.sinBase, `distinto de la plantilla y sin ${LOCK}: NO se toca (decide tu)`);
pinta(C.r, '?', grupos.quitado, 'la plantilla ya no lo trae: decide si borrarlo');

console.log(`\nplantilla ${DESDE}@${REF} (arnes ${VERSION}, ${COMMIT.slice(0, 7)}): ${grupos.bajar.length} a bajar, ${grupos.local.length} mejora(s) local(es), ${grupos.conflicto.length + grupos.sinBase.length} a decidir, ${grupos.igual.length} igual(es).`);

if (MODO === 'ver') { console.log('Dry-run. Para aplicarlo: ./scripts/arnes-sync.sh --aplicar'); process.exit(0); }

for (const f of grupos.bajar) {
  const origen = path.join(P, f);
  if (!existsSync(origen)) continue;
  mkdirSync(path.dirname(f) || '.', { recursive: true });
  cpSync(origen, f);
  if (statSync(origen).mode & 0o111) { try { git('.', 'update-index', '--chmod=+x', f); } catch { /* aun no versionado */ } }
}
// El lock registra la version de la PLANTILLA de cada archivo, no la local: asi una mejora local
// sigue viendose como tal hasta que la plantilla la tenga.
// Un PR subido deja de estar pendiente cuando la plantilla ya trae esos archivos tal cual.
const subidosPendientes = (lock?.subidos ?? []).filter((s) => s.archivos.some((f) => hashDe(path.join(P, f)) !== (base[f] ?? null)));
const nuevo = { $comment: 'Lo escribe scripts/arnes-sync.mjs. Hash de cada archivo del arnes tal como vino de la plantilla. No lo edites a mano.', plantilla: DESDE, ref: REF, commit: COMMIT, arnes_version: VERSION, archivos: {} };
for (const f of [...archivosDe(P)].sort()) {
  const T = hashDe(path.join(P, f));
  // Lo que no se toco por conflicto o sin base conserva su base anterior (si la habia).
  // Un conflicto que el humano ya integro (`--resuelto`) toma como base la plantilla actual: desde
  // ahi, lo que quede distinto es SU mejora y `--subir` puede proponerla.
  const pendiente = (grupos.conflicto.includes(f) || grupos.sinBase.includes(f)) && !RESUELTOS.includes(f);
  nuevo.archivos[f] = pendiente ? (base[f] ?? T) : T;
}
if (subidosPendientes.length) nuevo.subidos = subidosPendientes;
writeFileSync(LOCK, `${JSON.stringify(nuevo, null, 2)}\n`);
if (VERSION !== '?') { config.arnes_version = VERSION; writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`); }
console.log(`Aplicado. ${LOCK} al dia. Siguiente: ./init.sh y commit "chore(arnes): sync a ${VERSION}".`);
