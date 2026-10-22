#!/usr/bin/env node
/**
 * Validador de `feature_list.json` — pasos 3 y 4 del gate (`./init.sh`).
 *
 * Node y no `jq` a proposito. Antes esto eran dos bloques de `jq` colgando de un solo
 * `if command -v jq ...`: en una maquina sin `jq` NO fallaban, se saltaban ENTEROS y el
 * gate terminaba en verde sin haber validado nada. Estuvo asi el tiempo suficiente para
 * que nadie notara que los dos `ok` no se imprimian nunca. `init.sh` ya exige Node en el
 * paso 1 y aborta si falta, asi que aqui no se depende de nada que pueda faltar en
 * silencio. Ademas este repo se trabaja tambien desde Windows.
 *
 * Salida: errores en stderr y exit 1; notas en stdout, y avisos en stdout con el prefijo
 * `AVISO:` (no cambian el codigo de salida). `init.sh` solo invoca.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WT_DIR = '.worktrees';
const CONFIG = 'arnes.config.json';
const IDENTIDAD = '.arnes.local.json';
// Cupo por defecto si `arnes.config.json` no declara `cupos_por_persona` (CLAUDE.md regla 1).
const CUPOS_POR_DEFECTO = { frontend: 2, backend: 3, fullstack: 3 };
const EN_VUELO = ['spec_ready', 'in_progress'];
// Los cinco estados del arnes. Son los unicos valores validos de `status` en
// `feature_list.json` y de `jira.estados` en `arnes.config.json` (`docs/jira.md > Los estados
// del board`).
const ESTADOS = ['pending', 'spec_ready', 'in_progress', 'done', 'cancelled'];

const errores = [];
const notas = [];
// Avisos: salen con el prefijo `AVISO:` en stdout e `init.sh` los pinta en amarillo.
// No cambian el codigo de salida.
const avisos = [];

// RAIZ DEL REPO, no el directorio actual. El gate se corre DENTRO del worktree de la
// feature (`AGENTS.md > Worktrees`), y desde ahi `.worktrees/` NO existe: solo se ve el
// `specs/` de la propia rama. El resultado era un rojo por la razon equivocada — «faltan
// specs para features sdd en vuelo: QC-45 QC-75», cuyos specs estaban en disco, en los
// worktrees hermanos — que abortaba el gate en el paso 3 antes de mirar una linea de
// codigo. Paso tres veces: dos en QC-74 y una en QC-76 (2026-09-08), y las dos primeras se
// anotaron como «sigue sin resolverse».
//
// `--git-common-dir` es lo que resuelve esto y `--show-toplevel` no: dentro de un worktree
// enlazado, toplevel es el worktree y common-dir es el `.git` del repo principal.
function raizDelRepo() {
  try {
    const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (comun) return path.dirname(comun);
  } catch {
    /* cae al fallback */
  }
  // Fallback sin git: el worktree vive en `<raiz>/.worktrees/<slug>`, asi que la raiz es el
  // ancestro que tiene `feature_list.json` y NO cuelga de `.worktrees`.
  let dir = path.resolve('.');
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'feature_list.json')) && path.basename(path.dirname(dir)) !== WT_DIR) return dir;
    const padre = path.dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  return null;
}

const RAIZ = raizDelRepo();
const DENTRO_DE_WORKTREE = path.basename(path.dirname(path.resolve('.'))) === WT_DIR;

// `feature_list.json` NO se versiona (arnes v2): es la copia local del board que escribe F0 y
// vive UNA vez por maquina, en la raiz del worktree principal. Un worktree de feature no tiene
// copia propia, asi que se lee la de la RAIZ.
const FEATURE_LIST = RAIZ && existsSync(path.join(RAIZ, 'feature_list.json'))
  ? path.join(RAIZ, 'feature_list.json')
  : 'feature_list.json';

/** Lee un JSON opcional: `undefined` si no existe; error del gate si existe y esta roto. */
function leerJsonOpcional(ruta) {
  if (!existsSync(ruta)) return undefined;
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (err) {
    errores.push(`${ruta} no es JSON valido: ${err.message}`);
    return undefined;
  }
}

// `arnes.config.json` SI se versiona y vive en cada worktree: manda el del directorio actual.
const config = leerJsonOpcional(CONFIG) ?? (RAIZ ? leerJsonOpcional(path.join(RAIZ, CONFIG)) : undefined);
const CUPOS = { ...CUPOS_POR_DEFECTO, ...(config?.cupos_por_persona ?? {}) };
const cupoDe = (zone) => CUPOS[zone] ?? 2;

// Quien soy en Jira. Lo escribe `/jira-connect` en la raiz del worktree principal; no se versiona.
const identidad = leerJsonOpcional(RAIZ ? path.join(RAIZ, IDENTIDAD) : IDENTIDAD);
const MI_CUENTA = identidad?.jira_account_id ?? null;

// Fallar, no avisar. Un `warn` aqui reintroduce el agujero que este bloque cierra: el gate
// seguiria verde habiendo validado a ciegas (`docs/gate.md > El anti-patron: la
// validacion opcional`).
if (RAIZ === null && DENTRO_DE_WORKTREE) {
  errores.push('no se pudo localizar la raiz del repo desde este worktree: los specs de las features en vuelo no se pueden verificar');
}

/** Los sitios donde puede vivir el `specs/` de una feature, resueltos contra la RAIZ. */
function basesDeSpecs() {
  const bases = ['specs'];
  if (RAIZ === null) return bases;
  bases.push(path.join(RAIZ, 'specs'));
  const wt = path.join(RAIZ, WT_DIR);
  if (existsSync(wt)) {
    for (const d of readdirSync(wt, { withFileTypes: true })) {
      if (d.isDirectory()) bases.push(path.join(wt, d.name, 'specs'));
    }
  }
  return bases;
}

// Identidad de una feature. El `key` del board (`QC-7`) manda; el `id` numerico es
// SOLO el fallback para fichas que todavia no tienen issue. Antes mandaba el numerico, lo
// que obligaba a mantener una numeracion propia en serie, y ya se desincronizo una vez: la
// feature QC-13 quedo con `branch: feature/10-...` y `progress/current.md` siguio
// hablando de "Feature 2, 7, 8, 11" cuando en el JSON ya eran 5, 10, 11 y 14.
const ref = (f) => f.key ?? String(f.id);

/** Prefijos con los que puede empezar la carpeta de specs o el worktree de una feature.
 *  Los dos, a proposito: lo nuevo nace como `QC-<n>-<slug>` y lo que ya estaba en disco
 *  cuando entro el `key` se quedo con `<id>-<slug>`. No se renombro nada (decision
 *  humana 2026-09-01), asi que ambas convenciones conviven y las dos tienen que resolver. */
const prefijos = (f) => [f.key, f.id].filter((v) => v != null).map(String);

// --- 0a. `jira.estados`: la traduccion nombre-en-Jira -> estado del arnes --------------
// Los nombres de los estados del board son de cada proyecto, asi que se declaran en el perfil
// y F0 traduce con esa tabla y nada mas. El 2026-10-08 el doc del arnes suponia cinco
// columnas con nombre fijo y el board real de QC tenia otros: F0 se encontro tres estados
// sin traduccion. Se valida aqui, ANTES de mirar `feature_list.json`, porque es perfil
// versionado y tiene que fallar tambien en CI, donde no hay copia del board.
// Muchos-a-uno se acepta (un «Bloqueado» que cuente como `in_progress`); un valor fuera de
// los cinco, no. Que falte alguno de los cinco solo se avisa: un board puede no usar
// `cancelled` todavia.
const estadosJira = config?.jira?.estados;
if (estadosJira !== undefined) {
  if (estadosJira === null || typeof estadosJira !== 'object' || Array.isArray(estadosJira)) {
    errores.push(`${CONFIG} > jira.estados no es un objeto { "<nombre en Jira>": "<estado del arnes>" } (docs/jira.md > Los estados del board)`);
  } else {
    const malos = Object.entries(estadosJira).filter(([, v]) => !ESTADOS.includes(v));
    for (const [nombre, valor] of malos) {
      errores.push(
        `${CONFIG} > jira.estados traduce "${nombre}" a ${JSON.stringify(valor)}, que no es un estado del arnes ` +
        `(validos: ${ESTADOS.join(', ')}).`,
      );
    }
    const usados = new Set(Object.values(estadosJira));
    const sinNombre = ESTADOS.filter((e) => !usados.has(e));
    if (sinNombre.length > 0) {
      avisos.push(`${CONFIG} > jira.estados no traduce ningun estado del board a: ${sinNombre.join(', ')}`);
    }
  }
}

if (!existsSync(FEATURE_LIST)) {
  // Caso normal en CI y en un clon recien hecho: la copia del board no se versiona.
  if (errores.length > 0) {
    for (const e of errores) console.error(e);
    process.exit(1);
  }
  console.log('sin copia local del board (feature_list.json): en CI es lo esperado; en local, corre F0');
  for (const a of avisos) console.log(`AVISO: ${a}`);
  process.exit(0);
}

let features;
let jira;
try {
  const raw = JSON.parse(readFileSync(FEATURE_LIST, 'utf8'));
  features = raw.features;
  // El board al que pertenece el repo vive en `arnes.config.json` (versionado). El bloque
  // `jira` de `feature_list.json` es el formato anterior a v2 y queda solo de respaldo.
  jira = config?.jira ?? raw.jira;
  if (!Array.isArray(features)) throw new Error('la clave "features" no es un array');
} catch (err) {
  console.error(`[features] ${FEATURE_LIST} no se pudo leer: ${err.message}`);
  process.exit(1);
}

// --- 0. El board al que pertenece este archivo ----------------------------------------
// `jira.project` es la identidad del board en disco, y NO se deriva de los `key` a
// proposito. F0 regenera `features` ENTERO desde el board (`docs/jira.md > Si Jira y el
// disco divergen`): un F0 disparado contra el proyecto equivocado dejaria todos los key con
// el prefijo nuevo, consistentes entre si, y una comprobacion derivada los daria por
// buenos. Derivar validaria el resultado del error contra el error. Por eso se declara
// aparte, y por eso F0 tiene prohibido tocar este bloque.
const conKey = features.filter((f) => f.key != null);
if (conKey.length > 0) {
  if (!jira?.project) {
    errores.push(
      `${CONFIG} no declara "jira.project": no hay contra que validar que las fichas ` +
      `vengan del board correcto (docs/jira.md > El board al que pertenece el disco).`,
    );
  } else {
    const ajenas = conKey.filter((f) => f.key.split('-')[0] !== jira.project);
    if (ajenas.length > 0) {
      errores.push(
        `fichas de otro board en ${FEATURE_LIST} (se esperaba "${jira.project}"): ` +
        `${ajenas.map((f) => f.key).join(', ')}. Si el proyecto cambio a proposito, ` +
        `actualiza "jira.project" en ${CONFIG}; si no, la ultima importacion apunto al board equivocado.`,
      );
    } else {
      notas.push(`las ${conKey.length} fichas vienen del proyecto ${jira.project}`);
    }
  }
}

// --- 1. Integridad basica -------------------------------------------------------------
// No estaba en la version con `jq`. Entra ahora porque el archivo pasa a generarse desde
// el board de Jira (`docs/jira.md`): un id repetido por una importacion a medias es
// exactamente el fallo que nadie ve hasta que dos features pelean por la misma rama.
const vistosId = new Map();
const vistosName = new Map();
const vistosKey = new Map();
const porRef = new Map();   // key E id apuntan a la misma ficha: `depends_on` acepta ambos
const copiaConTitulo = features.some((f) => Object.prototype.hasOwnProperty.call(f, 'title'));
if (!copiaConTitulo && features.some((f) => f.key != null)) {
  avisos.push('la copia del board no trae title (anterior a docs/jira.md > Como se nombra una ficha): corre F0 para importarlo');
}
for (const f of features) {
  if (vistosId.has(f.id)) errores.push(`id duplicado: ${f.id} (${vistosId.get(f.id)} y ${f.name})`);
  else vistosId.set(f.id, f.name);

  if (f.key != null) {
    if (vistosKey.has(f.key)) errores.push(`key duplicado: "${f.key}" (${vistosKey.get(f.key)} y ${f.name})`);
    else vistosKey.set(f.key, f.name);

    // El key manda, pero el fallback tiene que decir lo mismo. Si `QC-7` conviviera con
    // `id: 9`, el numerico apuntaria a otra feature: es exactamente la desincronizacion
    // que el key vino a matar, asi que aqui se exige reconciliar en vez de tolerarla.
    // El `title` es lo que el humano reconoce: «SL-10» solo no dice de que se habla, y el gate
    // corre sin red, asi que no puede resolverlo contra Jira (`docs/jira.md > Como se nombra una
    // ficha`). Una copia sin ningun `title` es anterior a la regla: se avisa abajo, como con
    // `assignee`, y la siguiente F0 lo arregla.
    if (copiaConTitulo && (f.title == null || String(f.title).trim() === '')) {
      errores.push(`${f.key} no trae title: F0 no importo el summary del issue`);
    }
    if (!/^[A-Z][A-Z0-9]*-[0-9]+$/.test(f.key)) {
      errores.push(`key con formato invalido: "${f.key}" (se espera PROYECTO-NUMERO, ej. QC-7)`);
    } else if (f.id != null && Number(f.key.split('-').pop()) !== f.id) {
      errores.push(`${f.key} tiene id ${f.id}: el fallback numerico no coincide con el key`);
    }
  } else if (f.id == null) {
    errores.push(`la feature "${f.name}" no tiene ni key ni id: no hay forma de referenciarla`);
  }

  for (const r of prefijos(f)) porRef.set(r, f);

  // F0 traduce el estado del issue con `jira.estados`; un `status` fuera de los cinco es una
  // traduccion inventada o una importacion a medias, y el resto del validador (en vuelo, cupo,
  // specs) lo ignoraria en silencio.
  if (!ESTADOS.includes(f.status)) {
    errores.push(
      `${ref(f)} tiene status ${JSON.stringify(f.status)}, que no es un estado del arnes ` +
      `(validos: ${ESTADOS.join(', ')}). F0 traduce con ${CONFIG} > jira.estados (docs/jira.md > Los estados del board).`,
    );
  }

  if (f.name != null) {
    if (vistosName.has(f.name)) errores.push(`name duplicado: "${f.name}" (ids ${vistosName.get(f.name)} y ${f.id})`);
    else vistosName.set(f.name, f.id);
  }
}

// --- 1b. `epic` agrupa, y ninguna epica se colo como feature --------------------------
// La epica es el modulo al que pertenece la feature (`docs/jira.md > El contrato de
// campos`). Aqui no se puede comprobar contra Jira —el gate corre sin red— pero si se
// puede cazar el fallo que importa: si el `epic` de una ficha apunta al `key` de OTRA
// ficha de este mismo archivo, es que una epica se importo como feature y ahora hay una
// feature que dice ser hija de otra feature. Eso es el filtro `issuetype != Epic` de F0
// sin aplicar, y es exactamente lo que rompe la siguiente importacion.
for (const f of features) {
  if (f.epic == null) continue;
  if (!/^[A-Z][A-Z0-9]*-[0-9]+$/.test(f.epic)) {
    errores.push(`${ref(f)} tiene epic "${f.epic}" con formato invalido (se espera PROYECTO-NUMERO)`);
  } else if (vistosKey.has(f.epic)) {
    errores.push(`${ref(f)} cuelga de ${f.epic}, que esta en este archivo como feature: una epica se importo como ficha`);
  }
  // El `key` de la epica no dice nada por si solo: "QC-17" no es "Identidad y acceso". El
  // nombre se almacena porque el gate corre SIN RED y no puede resolverlo contra Jira.
  if (f.epic_name == null || String(f.epic_name).trim() === '') {
    errores.push(`${ref(f)} cuelga de ${f.epic} pero no trae epic_name: F0 no importo el nombre de la epica`);
  }
}

// --- 2. depends_on apunta a ids que existen -------------------------------------------
// El campo es POLIMORFICO por partida doble: escalar o array (`"depends_on": ["QC-9",
// "QC-10", "QC-12"]`), y cada elemento puede ser un `key` del board o un id numerico. Se
// aceptan las cuatro combinaciones a proposito —lo nuevo se escribe con keys, y una ficha
// sin issue solo puede referenciarse por numero—; lo que no se acepta es que apunte al
// vacio. En Jira esto viene de issue links, que se rompen al borrar un issue, asi que la
// comprobacion no es teorica.
for (const f of features) {
  if (f.depends_on == null) continue;
  const deps = Array.isArray(f.depends_on) ? f.depends_on : [f.depends_on];
  for (const dep of deps) {
    const destino = porRef.get(String(dep));
    if (!destino) errores.push(`feature ${ref(f)} depende de ${dep}, que no existe`);
    else if (destino === f) errores.push(`feature ${ref(f)} depende de si misma`);
  }
}

// --- 3. Toda feature en vuelo tiene dueno, y el cupo es POR PERSONA -------------------
// Arnes v2 (docs/equipo.md). El assignee de Jira es el candado de equipo: una feature en
// vuelo sin assignee la puede volver a tomar cualquiera. F0 importa
// `assignee: {accountId, displayName}`; una copia anterior a v2 no trae el campo en NINGUNA
// ficha, y eso se avisa en vez de fallar: la primera F0 tras actualizar lo arregla.
const enVuelo = features.filter((f) => EN_VUELO.includes(f.status));
const copiaV2 = features.some((f) => Object.prototype.hasOwnProperty.call(f, 'assignee'));
if (!copiaV2) {
  avisos.push('la copia del board es anterior al arnes v2 (no trae assignee): corre F0 para importarlo');
} else {
  const sinDueno = enVuelo.filter((f) => !f.assignee?.accountId).map(ref);
  if (sinDueno.length > 0) {
    errores.push(`features en vuelo sin assignee en Jira: ${sinDueno.join(', ')}. Asignalas (docs/equipo.md > Tomar una feature).`);
  } else if (enVuelo.length > 0) {
    notas.push(`las ${enVuelo.length} features en vuelo tienen assignee`);
  }
}

// El cupo de `in_progress` por zona cuenta SOLO las mias (CLAUDE.md regla 1); las de
// `zone: null` se ignoran (aun sin evaluar). Sin identidad local no se sabe quien soy: se
// cuentan todas, como antes de v2, y se avisa.
// Ojo: esto NO valida el conflicto de archivos entre features; eso lo hace
// `scripts/archivos-en-vuelo.mjs` contra las ramas de todo el equipo.
const esMia = (f) => MI_CUENTA == null || f.assignee?.accountId === MI_CUENTA;
if (MI_CUENTA == null) {
  avisos.push(`sin ${IDENTIDAD}: el cupo se cuenta sobre TODO el equipo. Corre /jira-connect para fijar tu identidad.`);
}
const enProgreso = features.filter((f) => f.status === 'in_progress' && esMia(f));
const porZona = new Map();
for (const f of enProgreso) {
  if (f.zone == null) continue;
  porZona.set(f.zone, [...(porZona.get(f.zone) ?? []), ref(f)]);
}
for (const [zone, ids] of porZona) {
  if (ids.length > cupoDe(zone)) {
    errores.push(`zona ${zone}: ${ids.join(', ')} (${ids.length} in_progress, max ${cupoDe(zone)})`);
  }
}
notas.push(`cupo por zona respetado (${MI_CUENTA ? 'mis' : 'todas las'} in_progress=${enProgreso.length})`);

// --- 4. Specs presentes para features sdd en vuelo ------------------------------------
// Se acota a "en vuelo" a proposito: las `done` pueden ser previas a la convencion y
// `pending`/`cancelled` no la necesitan aun/ya.
//
// Se busca en el `specs/` local, en el de la RAIZ y en el de cada worktree hermano: mientras
// una feature esta en vuelo su spec vive en `.worktrees/<slug>/specs/...` y NO llega a la
// raiz hasta que su PR mergea en `dev`. Mirar solo la raiz daria rojo por la razon
// equivocada, que es peor que no mirar; y mirar solo el directorio actual dejaba ciego al
// gate corrido desde un worktree, que es como se corre siempre (ver `RAIZ` arriba).
//
// Y en la rama REMOTA de la feature (`origin/<f.branch>`): la de un companero no esta en tu
// disco, y sin esto su `spec_ready` ponia en rojo el gate de todo el equipo (QC-167, 2026-10-08).
function tieneSpec(f) {
  if (f.spec_path && existsSync(path.join(f.spec_path, 'requirements.md'))) return true;
  if (basesDeSpecs().some((base) => globRequirements(base, f))) return true;
  return specEnRamaRemota(f);
}

/** `origin/<f.branch>:specs/<key>-*\/requirements.md`, sin red: usa lo ultimo que trajo `git fetch`. */
function specEnRamaRemota(f) {
  if (!f.branch) return false;
  let rutas;
  try {
    rutas = execFileSync('git', ['ls-tree', '-r', '--name-only', `refs/remotes/origin/${f.branch}`, 'specs/'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return false;
  }
  return rutas
    .split('\n')
    .some((r) => prefijos(f).some((p) => new RegExp(`^specs/${p}-[^/]+/requirements\\.md$`).test(r)));
}

/** Busca `<base>/<key>-*\/requirements.md` y, como fallback, `<base>/<id>-*\/`.
 *  Por identificador, NUNCA por `.name`: el slug de la carpeta y el `name` de la ficha
 *  no siempre coinciden, y ese fue un bug real. */
function globRequirements(base, f) {
  if (!existsSync(base)) return false;
  for (const dir of readdirSync(base, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (!prefijos(f).some((r) => dir.name.startsWith(`${r}-`))) continue;
    if (existsSync(path.join(base, dir.name, 'requirements.md'))) return true;
  }
  return false;
}

const sinSpec = features
  .filter((f) => f.sdd === true && EN_VUELO.includes(f.status))
  .filter((f) => !tieneSpec(f))
  .map((f) => ref(f));

if (sinSpec.length > 0) {
  errores.push(`faltan specs para features sdd en vuelo: ${sinSpec.join(' ')}`);
} else {
  notas.push('specs presentes para features sdd en vuelo');
}

// --- 5. Ninguna ficha sembrada esta esperando al board --------------------------------
// `/afinar-feature` cierra el alcance con el humano ANTES del spec y siembra
// `requirements.md`. Si esa conversacion invalido lo que dice la tarjeta —`description`,
// `complexity`, `zone` o `depends_on`— el comando escribe el cambio en Jira ANTES de
// sembrar. Cuando el MCP de `atlassian` no responde el trabajo no se tira: se siembra
// igual, con un marcador, y este bloque deja el gate en ROJO hasta que alguien actualice
// el issue y lo borre.
//
// El gate corre sin red y no puede preguntarle a Jira si la description esta al dia. Lo
// que si puede es ver la marca. Sin esto la regla seria una nota, y en este repo lo que
// no sale en `./init.sh` no existe (regla 5 de `CLAUDE.md`). El porque completo y el
// incidente que lo origina, en
// `docs/jira.md > Cuando el disco descubre que el board esta desactualizado`.
const MARCADOR_BOARD = /<!--\s*board-pendiente:\s*([^>]*?)\s*-->/;

function buscarMarcadores(base, out) {
  if (!existsSync(base)) return;
  for (const dir of readdirSync(base, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const req = path.join(base, dir.name, 'requirements.md');
    if (!existsSync(req)) continue;
    const m = MARCADOR_BOARD.exec(readFileSync(req, 'utf8'));
    if (m) out.push(`${req} -> ${m[1]}`);
  }
}

// Los mismos sitios que el bloque 4, contra la RAIZ y por la misma razon.
const boardPendiente = [];
for (const base of basesDeSpecs()) buscarMarcadores(base, boardPendiente);

if (boardPendiente.length > 0) {
  for (const p of boardPendiente) {
    errores.push(`board sin actualizar: ${p}. Escribe el cambio en el issue y borra el marcador.`);
  }
} else {
  notas.push('ninguna ficha sembrada esperando al board');
}

// --- 6. Cada spec sembrado tiene su ficha, y con el mismo slug -------------------------
// Sale del segundo incidente de `/afinar-feature` (2026-09-01): la acotacion de QC-14
// renombro la ficha a `modelo-producto` en el board y sembro `specs/QC-14-modelo-producto/`,
// pero `feature_list.json` siguio diciendo `modelo-inventario` y apuntando a una carpeta que
// no existe.
//
// El bloque 4 no lo caza, y la direccion es justo el motivo: aquel mira si una ficha TIENE
// spec, y solo para las que estan en vuelo. Este recorre al reves —de la carpeta a la ficha—
// porque el sintoma es una carpeta huerfana, no una ficha sin carpeta.
//
// Solo carpetas con prefijo de `key` (`QC-<n>-`). Las `<id>-<slug>` son anteriores al `key`
// y no se renombraron (decision humana 2026-09-01): `specs/8-layout-privado-con-sidebar`
// existe y el `id` 8 es hoy `sesion-actual-y-logout`, asi que exigirles nada daria rojo por
// la razon equivocada.
//
// Solo `specs/` de la raiz, no los worktrees: el spec de una rama sin mergear puede
// pertenecer a una ficha que el `feature_list.json` de `dev` todavia no conoce.
const CARPETA_CON_KEY = /^([A-Z][A-Z0-9]*-\d+)-(.+)$/;
const specsHuerfanos = [];

if (existsSync('specs')) {
  for (const dir of readdirSync('specs', { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const m = CARPETA_CON_KEY.exec(dir.name);
    if (!m) continue;
    if (!existsSync(path.join('specs', dir.name, 'requirements.md'))) continue;

    const [, key, slug] = m;
    const ficha = features.find((f) => f.key === key);
    if (!ficha) {
      specsHuerfanos.push(`specs/${dir.name}/ no tiene ficha en ${FEATURE_LIST}: falta ${key}.`);
    } else if (ficha.name && ficha.name !== slug) {
      specsHuerfanos.push(
        `specs/${dir.name}/ no cuadra con ${FEATURE_LIST}: ${key} se llama "${ficha.name}".`,
      );
    }
  }
}

if (specsHuerfanos.length > 0) {
  errores.push(...specsHuerfanos);
} else {
  notas.push('cada spec sembrado tiene su ficha, con el mismo slug');
}

// --- Resultado ------------------------------------------------------------------------
if (errores.length > 0) {
  for (const e of errores) console.error(e);
  process.exit(1);
}
for (const n of notas) console.log(n);
for (const a of avisos) console.log(`AVISO: ${a}`);
