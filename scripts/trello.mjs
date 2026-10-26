#!/usr/bin/env node
/**
 * Cliente de Trello del arnes (`docs/trello.md`). Solo se usa cuando
 * `arnes.config.json > tracker.tipo` es `trello`; con Jira, el leader trabaja con el MCP de
 * `atlassian` (`docs/jira.md`).
 *
 *   node scripts/trello.mjs importar                 F0: regenera `features` de feature_list.json
 *   node scripts/trello.mjs tomar <key>              F1.0: relee, se asigna si esta libre, relee
 *   node scripts/trello.mjs soltar <key>             quita tu member de la tarjeta
 *   node scripts/trello.mjs mover <key> <estado>     mueve a la lista de ese estado del arnes
 *   node scripts/trello.mjs comentar <key> <texto>   comenta en la tarjeta
 *   node scripts/trello.mjs aprobacion <key>         quien movio la tarjeta a in_progress y cuando
 *   node scripts/trello.mjs editar <key> [--labels-mas "a|b"] [--labels-menos "a|b"]
 *                                 [--nombre <titulo>] [--desc <texto>]
 *   node scripts/trello.mjs crear --nombre <titulo> --labels "a|b" [--key QC-n] [--depende QC-1,QC-2]
 *                                 [--estado pending] [--desc <texto>]
 *   node scripts/trello.mjs buscar <termino>         tarjetas abiertas y archivadas por nombre/desc
 *   node scripts/trello.mjs yo                       GET /members/me (para /tracker-connect)
 *
 * Los labels se separan con `|`, no con coma: un nombre de epica puede llevar comas
 * (`epic:QC-17 Identidad, acceso`). Las keys de `--depende` no, y van con coma.
 *
 * REST directo con el `fetch` nativo de Node: cero dependencias (CLAUDE.md regla 7). Las
 * credenciales salen de `TRELLO_KEY` y `TRELLO_TOKEN` del entorno y viajan en la cabecera
 * `Authorization`, nunca en la URL: asi un error que imprima la ruta no filtra el token.
 *
 * Un `429` (limite de peticiones de Trello) se reintenta: espera lo que diga `Retry-After` o, sin
 * esa cabecera, 1 s, 2 s, 4 s... hasta `INTENTOS`. Reintentar un POST es seguro aqui: un 429 es
 * una peticion rechazada, no ejecutada. Cualquier otro error no se reintenta.
 *
 * Las respuestas se validan a mano, lo minimo: los scripts del arnes no importan `zod` (un
 * proyecto que reciba el arnes puede no tenerla).
 *
 * Probado sin red: la logica pura en `tests/guards/guard-trello-cliente.test.ts`, y los
 * subcomandos contra un `fetch` simulado en `tests/guards/guard-trello-red.test.ts`
 * (`crearCliente` recibe `fetch`, `esperar`, `env` y `log`).
 *
 * Salida: 0 bien; 1 error; 2 uso incorrecto; 3 la tarjeta tiene otro member (no se toma);
 *         4 `mover <key> in_progress` con la tarjeta en la lista de `spec_ready`: esa es la
 *         aprobacion F1.4 y la hace el humano en Trello (el token es suyo: si la moviera el
 *         script, `aprobacion` la daria por aprobada).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolverTracker } from './tracker.mjs';

export const API = 'https://api.trello.com/1';
export const CHECKLIST_DEPENDE = 'Depende de';
export const SEPARADOR_LABELS = '|';
export const INTENTOS = 5;
const ESPERA_MAXIMA_MS = 60_000;
const KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const ESTADOS = ['pending', 'spec_ready', 'in_progress', 'done', 'cancelled'];
// Labels de un solo valor: anadir `zone:frontend` quita el `zone:` que hubiera.
const LABELS_UNICOS = ['key', 'slug', 'zone', 'complexity', 'epic'];

/** Error con codigo de salida. `main` lo imprime y sale con `codigo`; los tests lo capturan. */
export class SalidaError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// --------------------------------------------------------------------------- logica pura

const nombresDeLabels = (card) => (card.labels ?? []).map((l) => String(l?.name ?? '').trim()).filter(Boolean);

/** Valor del label `<prefijo>:<valor>`, o `null`. */
function valorDeLabel(labels, prefijo) {
  const l = labels.find((n) => n.startsWith(`${prefijo}:`));
  return l ? l.slice(prefijo.length + 1).trim() || null : null;
}

/** `"a|b| c"` -> `['a', 'b', 'c']`. */
export function partirLabels(texto) {
  return String(texto ?? '').split(SEPARADOR_LABELS).map((s) => s.trim()).filter(Boolean);
}

/** La key de la tarjeta: el label `key:<KEY>` manda (features migradas); si no, `<prefijo>-<idShort>`. */
export function keyDeTarjeta(card, prefijo) {
  const migrada = valorDeLabel(nombresDeLabels(card), 'key');
  if (migrada) {
    if (!KEY.test(migrada)) throw new Error(`la tarjeta "${card.name}" tiene el label key:${migrada}, que no es PROYECTO-NUMERO`);
    return migrada;
  }
  if (!prefijo) throw new Error('falta tracker.prefijo en arnes.config.json: no se puede derivar la key');
  return `${prefijo}-${card.idShort}`;
}

/**
 * Indice key -> tarjetas. Una tarjeta con la key mal formada va a `malas` y no tumba las demas:
 * `tomar QT-7` no tiene por que fallar porque otra tarjeta tenga un `key:` roto. `duplicadas`
 * son las keys con mas de una tarjeta (una migracion repetida): ahi nunca se elige una al azar.
 */
export function indexarPorKey(cards, prefijo) {
  const porKey = new Map();
  const malas = [];
  for (const c of cards) {
    let key;
    try {
      key = keyDeTarjeta(c, prefijo);
    } catch (err) {
      malas.push({ card: c, error: err.message });
      continue;
    }
    porKey.set(key, [...(porKey.get(key) ?? []), c]);
  }
  const duplicadas = [...porKey].filter(([, cs]) => cs.length > 1).map(([k, cs]) => ({ key: k, cards: cs }));
  return { porKey, malas, duplicadas };
}

/** 0 members = `null`; 1 = `{accountId, displayName}`; mas de 1 = array (el validador lo rechaza en vuelo). */
export function assigneeDe(card) {
  const miembros = Array.isArray(card.members) && card.members.length > 0
    ? card.members.map((m) => ({ accountId: m.id, displayName: m.fullName ?? m.username ?? m.id }))
    : (card.idMembers ?? []).map((id) => ({ accountId: id, displayName: id }));
  if (miembros.length === 0) return null;
  if (miembros.length === 1) return miembros[0];
  return miembros;
}

/** Items del checklist «Depende de»: cada uno es una key. Sin checklist, `[]`. */
export function dependenciasDe(card) {
  const lista = (card.checklists ?? []).find((c) => String(c?.name ?? '').trim() === CHECKLIST_DEPENDE);
  if (!lista) return [];
  return (lista.checkItems ?? [])
    .slice()
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
    .map((i) => String(i.name ?? '').trim())
    .filter(Boolean);
}

/**
 * Tarjeta de Trello -> ficha de `feature_list.json` (`docs/trello.md > El contrato de campos`).
 * `listas` traduce `idList` a nombre de lista. Una lista sin traduccion en `estados` LANZA:
 * nunca se adivina el estado (`docs/jira.md > Los estados del board`).
 */
export function tarjetaAFicha(card, { prefijo, estados, listas }) {
  const key = keyDeTarjeta(card, prefijo);
  const labels = nombresDeLabels(card);
  const nombreLista = listas instanceof Map ? listas.get(card.idList) : listas?.[card.idList];
  if (nombreLista === undefined) throw new Error(`${key}: la tarjeta esta en una lista desconocida (${card.idList})`);
  const status = estados?.[nombreLista];
  if (status === undefined) {
    throw new Error(
      `${key}: la lista "${nombreLista}" no esta en arnes.config.json > tracker.estados. ` +
      'Anade la fila con el humano y repite la importacion (docs/trello.md > Los estados del board).',
    );
  }
  const epicLabel = labels.find((n) => n.startsWith('epic:'));
  const epicMatch = epicLabel ? /^epic:\s*([A-Z][A-Z0-9]*-\d+)\s+(.+)$/.exec(epicLabel) : null;
  if (epicLabel && !epicMatch) throw new Error(`${key}: el label "${epicLabel}" no tiene la forma epic:<KEY> <nombre>`);
  const slug = valorDeLabel(labels, 'slug');
  return {
    key,
    id: Number(key.split('-').pop()),
    // El nombre de la tarjeta: lo que el humano reconoce (`docs/jira.md > Como se nombra una ficha`).
    title: String(card.name ?? '').trim(),
    epic: epicMatch ? epicMatch[1] : null,
    epic_name: epicMatch ? epicMatch[2].trim() : null,
    name: slug,
    description: card.desc ?? '',
    status,
    sdd: labels.includes('sdd'),
    complexity: valorDeLabel(labels, 'complexity'),
    zone: valorDeLabel(labels, 'zone'),
    branch: slug ? `feature/${key}-${slug}` : null,
    depends_on: dependenciasDe(card),
    spec_path: slug ? `specs/${key}-${slug}` : null,
    assignee: assigneeDe(card),
  };
}

/**
 * Las dos excepciones de F0 a "manda el board" (`docs/jira.md > Si Jira y el disco divergen`):
 * una `in_progress` no se degrada, y `zone`/`complexity` evaluadas no se borran. Una ficha
 * `in_progress` del disco cuya tarjeta ya no esta abierta (archivada o borrada) se conserva con
 * aviso: borrarla en silencio perderia una feature en vuelo. Las demas ausentes se descartan.
 * Devuelve las fichas fusionadas y los avisos para el leader.
 */
export function fusionarConCopia(nuevas, anteriores) {
  const previas = new Map((anteriores ?? []).filter((f) => f?.key).map((f) => [f.key, f]));
  const avisos = [];
  const fichas = nuevas.map((f) => {
    const antes = previas.get(f.key);
    if (!antes) return f;
    const r = { ...f };
    if (antes.status === 'in_progress' && f.status !== 'in_progress') {
      r.status = 'in_progress';
      avisos.push(`${f.key} sigue in_progress en disco aunque la tarjeta esta en ${f.status}: cierrala o cancelala a mano`);
    }
    for (const campo of ['zone', 'complexity']) {
      if (f[campo] == null && antes[campo] != null) {
        r[campo] = antes[campo];
        avisos.push(`${f.key} perdio el label ${campo}:${antes[campo]}: reescribelo con "editar" y anotalo en progress/deudas.md`);
      }
    }
    return r;
  });
  const claves = new Set(nuevas.map((f) => f.key));
  for (const antes of previas.values()) {
    if (claves.has(antes.key) || antes.status !== 'in_progress') continue;
    fichas.push(antes);
    avisos.push(`${antes.key} sigue in_progress en disco pero su tarjeta ya no esta abierta en el board: restaurala o cierra la feature a mano`);
  }
  return { fichas, avisos };
}

/** Nombre de la lista del board para un estado del arnes: la primera de `estados` que exista. */
export function listaParaEstado(estado, estados, listas) {
  const nombres = Object.entries(estados ?? {}).filter(([, v]) => v === estado).map(([n]) => n);
  for (const n of nombres) {
    const l = listas.find((x) => x.name === n);
    if (l) return l;
  }
  return null;
}

/**
 * Que labels quitar y cuales poner al editar. Un label de un solo valor (`zone:`, `slug:`...)
 * que se anade reemplaza al que hubiera con el mismo prefijo; los demas se suman.
 */
export function planDeLabels(actuales, mas, menos) {
  const prefijoDe = (n) => {
    const i = n.indexOf(':');
    return i > 0 && LABELS_UNICOS.includes(n.slice(0, i)) ? n.slice(0, i) : null;
  };
  const reemplazados = new Set(mas.map(prefijoDe).filter(Boolean));
  const quitar = actuales.filter((n) => menos.includes(n) || (reemplazados.has(prefijoDe(n)) && !mas.includes(n)));
  const poner = mas.filter((n) => !actuales.includes(n));
  return { quitar, poner };
}

/** Coincidencia de `buscar`: sin distinguir mayusculas ni tildes, en nombre y descripcion. */
export function coincide(card, termino) {
  const plano = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = plano(termino);
  return plano(card.name).includes(t) || plano(card.desc).includes(t);
}

/**
 * Milisegundos antes de reintentar un 429. `Retry-After` manda (segundos o fecha HTTP); sin
 * ella, 1 s, 2 s, 4 s... Nunca mas de `ESPERA_MAXIMA_MS`: un valor absurdo no cuelga el comando.
 */
export function esperaTras429(retryAfter, intento, ahora = Date.now()) {
  if (retryAfter != null && retryAfter !== '') {
    const segundos = Number(retryAfter);
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1000, ESPERA_MAXIMA_MS);
    const fecha = Date.parse(retryAfter);
    if (Number.isFinite(fecha)) return Math.min(Math.max(fecha - ahora, 0), ESPERA_MAXIMA_MS);
  }
  return Math.min(1000 * 2 ** (intento - 1), ESPERA_MAXIMA_MS);
}

// --------------------------------------------------------------------------- red

function exigir(cond, msg) {
  if (!cond) throw new Error(`respuesta inesperada de Trello: ${msg}`);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function raizDelRepo() {
  try {
    const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (comun) return path.dirname(comun);
  } catch {
    /* sin git: directorio actual */
  }
  return path.resolve('.');
}

/**
 * El cliente, con todo lo que toca el mundo inyectable. `rutaConfig` por defecto es la del
 * directorio actual (el worktree de la feature) o, si no hay, la de la raiz.
 */
export function crearCliente({
  raiz = raizDelRepo(),
  rutaConfig = /** @type {string | undefined} */ (undefined), // tipado para que tsc la cuente entre las opciones
  fetch: hacerFetch = globalThis.fetch,
  esperar = dormir,
  env = process.env,
  log = console.log,
  intentos = INTENTOS,
} = {}) {
  function credenciales() {
    const key = env.TRELLO_KEY;
    const token = env.TRELLO_TOKEN;
    if (!key || !token) {
      throw new SalidaError(
        1,
        'faltan TRELLO_KEY y/o TRELLO_TOKEN en el entorno. Generalos en https://trello.com/power-ups/admin ' +
        'y exportalos en tu terminal (docs/trello.md > Montar un colaborador nuevo). No los pegues en el chat.',
      );
    }
    return { key, token };
  }

  async function pedir(metodo, ruta, { query, cuerpo } = {}) {
    const { key, token } = credenciales();
    const url = new URL(`${API}${ruta}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const opciones = {
      method: metodo,
      headers: {
        Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`,
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    };
    for (let intento = 1; ; intento++) {
      const res = await hacerFetch(url, opciones);
      if (res.status === 429 && intento < intentos) {
        await esperar(esperaTras429(res.headers?.get?.('retry-after'), intento));
        continue;
      }
      const texto = await res.text();
      if (!res.ok) {
        const tras = res.status === 429 ? ` tras ${intento} intentos` : '';
        throw new Error(`Trello ${metodo} ${ruta} -> ${res.status}${tras}: ${texto.slice(0, 200)}`);
      }
      try {
        return texto ? JSON.parse(texto) : null;
      } catch {
        throw new Error(`Trello ${metodo} ${ruta} no devolvio JSON`);
      }
    }
  }

  function leerConfig() {
    const ruta = rutaConfig ?? (existsSync('arnes.config.json') ? 'arnes.config.json' : path.join(raiz, 'arnes.config.json'));
    if (!existsSync(ruta)) throw new Error('falta arnes.config.json: corre /arnes-init');
    const t = resolverTracker(JSON.parse(readFileSync(ruta, 'utf8')));
    if (t.tipo !== 'trello') throw new Error(`arnes.config.json > tracker.tipo es "${t.tipo}": este cliente es solo para Trello (docs/jira.md para Jira)`);
    if (!t.board) throw new Error('falta arnes.config.json > tracker.board (id del board de Trello)');
    if (!t.prefijo) throw new Error('falta arnes.config.json > tracker.prefijo');
    return { ...t, estados: t.estados ?? {} };
  }

  function miMember() {
    const ruta = path.join(raiz, '.arnes.local.json');
    const id = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')).trello_member_id : null;
    if (!id) throw new Error('sin trello_member_id en .arnes.local.json: corre /tracker-connect');
    return id;
  }

  async function listasDelBoard(t) {
    const listas = await pedir('GET', `/boards/${t.board}/lists`, { query: { filter: 'all', fields: 'name,closed' } });
    exigir(Array.isArray(listas), 'las listas no son un array');
    for (const l of listas) exigir(typeof l?.id === 'string' && typeof l?.name === 'string', 'lista sin id o name');
    return listas;
  }

  /** Tarjetas abiertas del board; con `archivadas`, tambien las cerradas (`/cards/all`). */
  async function tarjetasDelBoard(t, { archivadas = false } = {}) {
    const cards = await pedir('GET', `/boards/${t.board}/cards${archivadas ? '/all' : ''}`, {
      query: {
        fields: 'name,desc,idShort,idList,labels,idMembers,closed',
        members: 'true',
        member_fields: 'fullName,username',
        checklists: 'all',
      },
    });
    exigir(Array.isArray(cards), 'las tarjetas no son un array');
    for (const c of cards) {
      exigir(typeof c?.id === 'string' && typeof c?.idList === 'string', 'tarjeta sin id o idList');
      exigir(Number.isInteger(c?.idShort), `la tarjeta ${c?.id} no trae idShort`);
      exigir(Array.isArray(c?.labels ?? []), `la tarjeta ${c?.id} trae labels que no son un array`);
    }
    return archivadas ? cards : cards.filter((c) => !c.closed);
  }

  async function tarjetaPorKey(t, key) {
    const { porKey } = indexarPorKey(await tarjetasDelBoard(t), t.prefijo);
    const cards = porKey.get(key) ?? [];
    if (cards.length === 0) throw new Error(`no hay ninguna tarjeta ${key} en el board`);
    if (cards.length > 1) {
      throw new Error(`${key} esta en ${cards.length} tarjetas (${cards.map((c) => c.id).join(', ')}): archiva las sobrantes antes de seguir`);
    }
    return cards[0];
  }

  async function idMembersDe(idCard) {
    const c = await pedir('GET', `/cards/${idCard}`, { query: { fields: 'idMembers' } });
    exigir(Array.isArray(c?.idMembers), 'la tarjeta no trae idMembers');
    return c.idMembers;
  }

  /** Ids de los labels pedidos, creando en el board los que falten. */
  async function asegurarLabels(t, nombres) {
    if (nombres.length === 0) return [];
    const existentes = await pedir('GET', `/boards/${t.board}/labels`, { query: { fields: 'name', limit: 1000 } });
    exigir(Array.isArray(existentes), 'los labels no son un array');
    const ids = [];
    // `POST /labels` solo acepta el id largo del board (24 hex), no el shortLink de la URL que
    // `docs/trello.md` da como valido para `tracker.board`: con el corto responde 400 "Invalid id".
    let idBoard = t.board;
    for (const n of nombres) {
      let l = existentes.find((x) => x?.name === n);
      if (!l) {
        if (!/^[0-9a-f]{24}$/.test(idBoard)) {
          const b = await pedir('GET', `/boards/${t.board}`, { query: { fields: 'id' } });
          exigir(typeof b?.id === 'string', 'el board no trae id');
          idBoard = b.id;
        }
        // `color: null` = label sin color. SIN PROBAR contra la API real (docs/trello.md > Lo que falta probar).
        l = await pedir('POST', '/labels', { cuerpo: { name: n, color: null, idBoard } });
        exigir(typeof l?.id === 'string', `el label ${n} no se creo`);
        existentes.push(l);
      }
      ids.push(l.id);
    }
    return ids;
  }

  // ------------------------------------------------------------------------- subcomandos

  async function importar() {
    const t = leerConfig();
    const listas = await listasDelBoard(t);
    const nombres = new Map(listas.map((l) => [l.id, l.name]));
    const cards = await tarjetasDelBoard(t);
    // Aqui una key mala o repetida SI detiene F0: importar a medias es peor que no importar.
    const { malas, duplicadas } = indexarPorKey(cards, t.prefijo);
    if (malas.length > 0) throw new Error(malas.map((m) => m.error).join('\n'));
    if (duplicadas.length > 0) {
      throw new Error(`keys repetidas en el board: ${duplicadas.map((d) => `${d.key} (${d.cards.length} tarjetas)`).join(', ')}. Archiva las sobrantes.`);
    }
    const nuevas = cards.map((c) => tarjetaAFicha(c, { prefijo: t.prefijo, estados: t.estados, listas: nombres }));
    const destino = path.join(raiz, 'feature_list.json');
    const anterior = existsSync(destino) ? JSON.parse(readFileSync(destino, 'utf8')) : {};
    const { fichas, avisos } = fusionarConCopia(nuevas, anterior.features);
    fichas.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
    // Escritura atomica: a un temporal del mismo directorio y rename. Un corte a medias deja el
    // feature_list.json anterior entero, nunca uno truncado.
    const temporal = `${destino}.tmp`;
    writeFileSync(temporal, `${JSON.stringify({ ...anterior, features: fichas }, null, 2)}\n`);
    renameSync(temporal, destino);
    log(`${fichas.length} fichas importadas del board ${t.board} a ${destino}`);
    for (const a of avisos) log(`AVISO: ${a}`);
  }

  async function tomar(key) {
    const t = leerConfig();
    const yo = miMember();
    const card = await tarjetaPorKey(t, key);
    const antes = await idMembersDe(card.id);
    const otros = antes.filter((m) => m !== yo);
    if (otros.length > 0) throw new SalidaError(3, `${key} ya tiene member: ${otros.join(', ')}. No se toma; elige otra.`);
    if (!antes.includes(yo)) await pedir('POST', `/cards/${card.id}/idMembers`, { query: { value: yo } });
    const despues = await idMembersDe(card.id);
    if (despues.length !== 1 || despues[0] !== yo) {
      throw new SalidaError(3, `${key} quedo con members ${despues.join(', ')} tras asignarte: alguien la tomo a la vez. Sueltala y elige otra.`);
    }
    log(`${key} es tuya (member ${yo}). Siguiente: ./scripts/wt.sh new ${key} <slug>`);
  }

  async function soltar(key) {
    const t = leerConfig();
    const yo = miMember();
    const card = await tarjetaPorKey(t, key);
    if ((await idMembersDe(card.id)).includes(yo)) await pedir('DELETE', `/cards/${card.id}/idMembers/${yo}`);
    log(`${key}: ya no eres member. Devuelve la tarjeta a su estado anterior con "mover" si hace falta.`);
  }

  async function mover(key, estado) {
    if (!ESTADOS.includes(estado)) throw new Error(`"${estado}" no es un estado del arnes (${ESTADOS.join(', ')})`);
    const t = leerConfig();
    const listas = await listasDelBoard(t);
    const lista = listaParaEstado(estado, t.estados, listas.filter((l) => !l.closed));
    if (!lista) throw new Error(`ninguna lista abierta del board traduce a ${estado} en tracker.estados`);
    const card = await tarjetaPorKey(t, key);
    // De spec_ready a in_progress es la aprobacion F1.4 (`aprobacion` la lee del historial). El
    // token es del humano: si este script la moviera, Trello la apuntaria a su nombre y la
    // aprobacion quedaria falsificada. Desde otro estado (features sin sdd) si se mueve.
    const actual = t.estados[listas.find((l) => l.id === card.idList)?.name];
    if (estado === 'in_progress' && actual === 'spec_ready') {
      throw new SalidaError(
        4,
        `${key} esta en spec_ready: no se mueve a in_progress, la aprobacion F1.4 la hace el humano moviendo la tarjeta en Trello. Confirmala con "aprobacion ${key}".`,
      );
    }
    await pedir('PUT', `/cards/${card.id}`, { cuerpo: { idList: lista.id } });
    log(`${key} -> ${lista.name} (${estado})`);
  }

  async function comentar(key, texto) {
    if (!texto) throw new Error('falta el texto del comentario');
    const t = leerConfig();
    const card = await tarjetaPorKey(t, key);
    await pedir('POST', `/cards/${card.id}/actions/comments`, { cuerpo: { text: texto } });
    log(`${key}: comentario publicado`);
  }

  async function aprobacion(key) {
    const t = leerConfig();
    const nombres = new Map((await listasDelBoard(t)).map((l) => [l.id, l.name]));
    const card = await tarjetaPorKey(t, key);
    const acciones = await pedir('GET', `/cards/${card.id}/actions`, { query: { filter: 'updateCard:idList' } });
    exigir(Array.isArray(acciones), 'las acciones no son un array');
    const estadoDe = (lista) => t.estados[lista?.name ?? nombres.get(lista?.id)];
    const ap = acciones
      .filter((a) => estadoDe(a?.data?.listBefore) === 'spec_ready' && estadoDe(a?.data?.listAfter) === 'in_progress')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (!ap) throw new SalidaError(1, `${key}: sin aprobacion por tarjeta (nadie la movio del estado de spec_ready al de in_progress)`);
    const quien = ap.memberCreator?.fullName ?? ap.idMemberCreator;
    log(`${key}: aprobada por ${quien} (${ap.idMemberCreator}) el ${ap.date}`);
  }

  async function editar(key, opciones) {
    const mas = partirLabels(opciones['--labels-mas']);
    const menos = partirLabels(opciones['--labels-menos']);
    const campos = {};
    if (opciones['--nombre'] !== undefined) campos.name = opciones['--nombre'];
    if (opciones['--desc'] !== undefined) campos.desc = opciones['--desc'];
    if (mas.length === 0 && menos.length === 0 && Object.keys(campos).length === 0) {
      throw new Error('editar no tiene nada que hacer: pasa --labels-mas, --labels-menos, --nombre o --desc');
    }
    const t = leerConfig();
    const card = await tarjetaPorKey(t, key);
    const { quitar, poner } = planDeLabels(nombresDeLabels(card), mas, menos);
    for (const n of quitar) {
      const l = card.labels.find((x) => String(x?.name ?? '').trim() === n);
      await pedir('DELETE', `/cards/${card.id}/idLabels/${l.id}`);
    }
    for (const id of await asegurarLabels(t, poner)) {
      await pedir('POST', `/cards/${card.id}/idLabels`, { query: { value: id } });
    }
    if (Object.keys(campos).length > 0) await pedir('PUT', `/cards/${card.id}`, { cuerpo: campos });
    const cambios = [...poner.map((n) => `+${n}`), ...quitar.map((n) => `-${n}`), ...Object.keys(campos)];
    log(`${key}: ${cambios.join(', ')}`);
  }

  async function crear(opciones) {
    const nombre = opciones['--nombre'];
    if (!nombre) throw new Error('falta --nombre');
    const t = leerConfig();
    const estado = opciones['--estado'] ?? 'pending';
    const etiquetas = partirLabels(opciones['--labels']);
    const pedida = opciones['--key'];
    if (pedida) {
      if (!KEY.test(pedida)) throw new Error(`--key ${pedida} no es PROYECTO-NUMERO`);
      // Repetir una migracion no duplica tarjetas: la key ya existe, abierta o archivada.
      const { porKey } = indexarPorKey(await tarjetasDelBoard(t, { archivadas: true }), t.prefijo);
      if (porKey.has(pedida)) throw new Error(`${pedida} ya existe en el board: no se crea otra vez`);
      etiquetas.push(`key:${pedida}`);
    }
    const lista = listaParaEstado(estado, t.estados, (await listasDelBoard(t)).filter((l) => !l.closed));
    if (!lista) throw new Error(`ninguna lista abierta del board traduce a ${estado} en tracker.estados`);

    const idLabels = await asegurarLabels(t, etiquetas);
    const card = await pedir('POST', '/cards', {
      cuerpo: { idList: lista.id, name: nombre, desc: opciones['--desc'] ?? '', idLabels },
    });
    exigir(typeof card?.id === 'string' && Number.isInteger(card?.idShort), 'la tarjeta creada no trae id/idShort');

    const deps = (opciones['--depende'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (deps.length > 0) {
      const cl = await pedir('POST', `/cards/${card.id}/checklists`, { cuerpo: { name: CHECKLIST_DEPENDE } });
      exigir(typeof cl?.id === 'string', 'el checklist no se creo');
      for (const d of deps) await pedir('POST', `/checklists/${cl.id}/checkItems`, { cuerpo: { name: d } });
    }
    const key = pedida ?? `${t.prefijo}-${card.idShort}`;
    log(`${key} creada en ${lista.name}`);
  }

  async function buscar(termino) {
    if (!termino) throw new Error('falta el termino de busqueda');
    const t = leerConfig();
    const nombres = new Map((await listasDelBoard(t)).map((l) => [l.id, l.name]));
    const cards = (await tarjetasDelBoard(t, { archivadas: true })).filter((c) => coincide(c, termino));
    for (const c of cards) {
      let key;
      try {
        key = keyDeTarjeta(c, t.prefijo);
      } catch {
        key = `(key invalida, tarjeta ${c.id})`;
      }
      log(`${key}\t${nombres.get(c.idList) ?? c.idList}${c.closed ? ' (archivada)' : ''}\t${c.name}`);
    }
    log(`${cards.length} tarjetas con "${termino}"`);
  }

  async function yo() {
    const m = await pedir('GET', '/members/me', { query: { fields: 'id,fullName,username' } });
    exigir(typeof m?.id === 'string', 'members/me no trae id');
    log(JSON.stringify({ id: m.id, fullName: m.fullName, username: m.username }));
  }

  return { pedir, importar, tomar, soltar, mover, comentar, aprobacion, editar, crear, buscar, yo };
}

// --------------------------------------------------------------------------- linea de comandos

function leerOpciones(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      o[args[i]] = args[i + 1];
      i++;
    }
  }
  return o;
}

const USO = 'uso: node scripts/trello.mjs <importar|tomar|soltar|mover|comentar|aprobacion|editar|crear|buscar|yo> ... (cabecera del script)';

/** Despacha un subcomando. Lanza `SalidaError(2)` si el uso es incorrecto. */
export async function ejecutar([sub, ...args], cliente) {
  const pideKey = ['tomar', 'soltar', 'mover', 'comentar', 'aprobacion', 'editar'];
  if (pideKey.includes(sub) && !KEY.test(args[0] ?? '')) throw new SalidaError(2, `${sub} necesita una key (PROYECTO-NUMERO). ${USO}`);
  switch (sub) {
    case 'importar': return cliente.importar();
    case 'tomar': return cliente.tomar(args[0]);
    case 'soltar': return cliente.soltar(args[0]);
    case 'mover': return cliente.mover(args[0], args[1]);
    case 'comentar': return cliente.comentar(args[0], args.slice(1).join(' '));
    case 'aprobacion': return cliente.aprobacion(args[0]);
    case 'editar': return cliente.editar(args[0], leerOpciones(args.slice(1)));
    case 'crear': return cliente.crear(leerOpciones(args));
    case 'buscar': return cliente.buscar(args.join(' '));
    case 'yo': return cliente.yo();
    default: throw new SalidaError(2, USO);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  ejecutar(process.argv.slice(2), crearCliente()).catch((err) => {
    console.error(err.message);
    process.exit(err instanceof SalidaError ? err.codigo : 1);
  });
}
