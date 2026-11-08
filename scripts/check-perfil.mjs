#!/usr/bin/env node
/**
 * Frescura del PERFIL DE PROYECTO (arnes v2, `docs/equipo.md > El perfil del proyecto`).
 *
 * El arnes es generico; lo que cambia de proyecto en proyecto (arquitectura, verificacion,
 * convenciones, dependencias) vive en los docs que lista `arnes.config.json > perfil.docs`.
 * Esos docs envejecen en silencio: nadie los relee porque nada lo pide. Este check lo pide.
 *
 *   - FALLA si `arnes.config.json` falta o no declara el prefijo del tracker (`tracker.prefijo`,
 *     o `jira.project` en un perfil sin `tracker`): sin eso el arnes no sabe a que proyecto
 *     pertenece (lo genera `/arnes-init`). Con `tracker`, el bloque `jira` no se lee
 *     (`scripts/tracker.mjs`).
 *   - AVISA si un doc del perfil no existe, no lleva el marcador
 *     `<!-- perfil: revisado=AAAA-MM-DD ... -->` en su primera linea, o lo lleva vencido
 *     (`perfil.max_dias_sin_revisar`, 60 por defecto). Avisa y no falla: bloquear un PR porque
 *     un doc cumple 61 dias seria un gate que se ignora. Se renueva con `/arnes-init` (modo
 *     revision), que relee el doc con el humano y actualiza la fecha.
 *
 *   - FALLA si `ramas.integracion` o `ramas.produccion` faltan, si el bloque `ci` esta mal, o si
 *     el `.github/workflows/gate.yml` GENERADO (`scripts/ci.mjs`) no esta al dia con
 *     `arnes.config.json` o le falta el `arnes-gate.yml` al que llama. GitHub no lee el JSON, asi
 *     que el workflow lleva los nombres escritos y aqui se comprueba que no se desalinean (con
 *     `main` escrito y `prod` real, el PR de despliegue no corria ni el gate ni el E2E).
 *     Un `gate.yml` escrito a mano AVISA (pasalo al generado) y sigue con la comprobacion antigua:
 *     su `pull_request.branches` debe incluir las dos ramas y todo `github.base_ref == '<x>'` debe
 *     nombrar la de produccion. AVISA si `origin/<rama>` no existe en local.
 *
 * La deriva de DEPENDENCIAS no se mira aqui: la caza `tests/guards/guard-dependencias-aprobadas`.
 *
 * Salida: lineas `AVISO: ...` y notas en stdout; errores en stderr y exit 1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { erroresCi, esGenerado, generarGate } from './ci.mjs';
import { erroresDisparadores } from './disparadores.mjs';
import { resolverTracker } from './tracker.mjs';

const CONFIG = 'arnes.config.json';
const MARCADOR = /<!--\s*perfil:\s*revisado=(\d{4}-\d{2}-\d{2})/;

if (!existsSync(CONFIG)) {
  console.error(`falta ${CONFIG}: el arnes no sabe a que proyecto pertenece. Corre /arnes-init.`);
  process.exit(1);
}
let config;
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (err) {
  console.error(`${CONFIG} no es JSON valido: ${err.message}`);
  process.exit(1);
}
const tracker = resolverTracker(config);
const proyecto = tracker.prefijo;
if (!proyecto) {
  const campo = tracker.etiqueta === 'tracker' ? 'tracker.prefijo' : 'jira.project';
  console.error(`${CONFIG} no declara "${campo}". Corre /arnes-init.`);
  process.exit(1);
}

const { integracion, produccion } = config.ramas ?? {};
if (!integracion || !produccion) {
  console.error(`${CONFIG} no declara "ramas.integracion" y "ramas.produccion". Corre /arnes-init.`);
  process.exit(1);
}
const GATE = '.github/workflows/gate.yml';
// El gate.yml GENERADO (`scripts/ci.mjs`, `docs/gate.md > El CI se genera`) tiene que estar al dia
// con arnes.config.json: si no, `fail` con el comando que lo arregla. Uno escrito a mano sigue con
// las comprobaciones de ramas de abajo y un aviso para pasarlo al generado.
const erroresDeCi = erroresCi(config);
if (erroresDeCi.length > 0) {
  console.error(`${CONFIG}: ${erroresDeCi.join('; ')}.`);
  process.exit(1);
}
if (!existsSync(GATE)) {
  console.log(`AVISO: no hay ${GATE}: el CI no corre. Generalo con node scripts/ci.mjs generar (docs/gate.md > El CI se genera).`);
} else if (esGenerado(readFileSync(GATE, 'utf8'))) {
  if (readFileSync(GATE, 'utf8').replace(/\r\n/g, '\n') !== generarGate(config)) {
    console.error(`${GATE} no esta al dia con ${CONFIG} (ramas o ci): node scripts/ci.mjs generar.`);
    process.exit(1);
  }
  if (!existsSync('.github/workflows/arnes-gate.yml')) {
    console.error(`${GATE} llama a .github/workflows/arnes-gate.yml, que no existe: ./scripts/arnes-sync.sh --aplicar.`);
    process.exit(1);
  }
} else {
  console.log(`AVISO: ${GATE} esta escrito a mano: cada mejora del CI del arnes habra que copiarla a mano. Pasalo al generado: node scripts/ci.mjs generar (docs/gate.md > El CI se genera).`);
}
if (existsSync(GATE) && !esGenerado(readFileSync(GATE, 'utf8'))) {
  const yml = readFileSync(GATE, 'utf8');
  const filtro = /pull_request:[\s\S]*?branches:\s*\[([^\]]*)\]/.exec(yml);
  if (!filtro) {
    console.log(`AVISO: no se leer el filtro de ramas de ${GATE} (se espera "branches: [a, b]"): comprueba a mano que escucha ${integracion} y ${produccion}.`);
  } else {
    const ramasGate = filtro[1].split(',').map((r) => r.trim().replace(/^['"]|['"]$/g, ''));
    const faltan = [integracion, produccion].filter((r) => !ramasGate.includes(r));
    if (faltan.length) {
      console.error(`${GATE} no escucha PRs a ${faltan.join(', ')} (tiene [${ramasGate.join(', ')}]; ${CONFIG} > ramas manda). Corrige "branches:".`);
      process.exit(1);
    }
  }
  for (const [, rama] of yml.matchAll(/github\.base_ref\s*==\s*'([^']+)'/g)) {
    if (rama !== produccion) {
      console.error(`${GATE} compara github.base_ref con '${rama}', pero la rama de produccion es '${produccion}' (${CONFIG} > ramas). El E2E no correria en el PR de despliegue.`);
      process.exit(1);
    }
  }
}
for (const rama of [integracion, produccion]) {
  const hay = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${rama}`], { stdio: 'ignore' });
  if (hay.status !== 0) console.log(`AVISO: no existe origin/${rama} en local (${CONFIG} > ramas). Haz git fetch o revisa el nombre.`);
}

// Forma de lo que lee el gate rapido y el validador: un error aqui haria que el gate ignorase la
// configuracion en silencio (`docs/gate.md > Disparadores`, `docs/specs.md > Tres rutas`).
const erroresGate = erroresDisparadores(config.gate?.disparadores);
const presupuesto = config.gate?.presupuesto_rapido;
if (presupuesto !== undefined && !(Number.isInteger(presupuesto) && presupuesto > 0)) {
  erroresGate.push('gate.presupuesto_rapido debe ser un entero positivo (archivos de test)');
}
const tamano = config.gate?.tamano_pr;
if (tamano !== undefined) {
  const ent = (v) => v === undefined || (Number.isInteger(v) && v > 0);
  if (tamano === null || typeof tamano !== 'object' || !ent(tamano.max_archivos) || !ent(tamano.max_lineas)
    || (tamano.excluir !== undefined && !(Array.isArray(tamano.excluir) && tamano.excluir.every((g) => typeof g === 'string' && g.trim())))) {
    erroresGate.push('gate.tamano_pr debe ser { max_archivos?: entero > 0, max_lineas?: entero > 0, excluir?: [globs] }');
  }
}
const completaSi = config.rutas?.completa_si_toca;
if (completaSi !== undefined && !(Array.isArray(completaSi) && completaSi.every((g) => typeof g === 'string' && g.trim()))) {
  erroresGate.push('rutas.completa_si_toca debe ser una lista de globs');
}
if (erroresGate.length > 0) {
  console.error(`${CONFIG}: ${erroresGate.join('; ')}.`);
  process.exit(1);
}

const docs = config.perfil?.docs ?? [];
const maxDias = config.perfil?.max_dias_sin_revisar ?? 60;
const hoy = Date.now();
let vencidos = 0;

for (const doc of docs) {
  if (!existsSync(doc)) {
    console.log(`AVISO: el perfil declara ${doc} y no existe. Corre /arnes-init.`);
    vencidos++;
    continue;
  }
  const primera = readFileSync(doc, 'utf8').split('\n', 1)[0];
  const m = MARCADOR.exec(primera);
  if (!m) {
    console.log(`AVISO: ${doc} no lleva el marcador "<!-- perfil: revisado=AAAA-MM-DD -->": nadie ha confirmado que siga vigente.`);
    vencidos++;
    continue;
  }
  const dias = Math.floor((hoy - Date.parse(`${m[1]}T00:00:00Z`)) / 86_400_000);
  if (dias > maxDias) {
    console.log(`AVISO: ${doc} lleva ${dias} dias sin revisar (max ${maxDias}). Revisalo con /arnes-init.`);
    vencidos++;
  }
}

console.log(`perfil del proyecto ${proyecto}: ${docs.length - vencidos}/${docs.length} docs revisados en los ultimos ${maxDias} dias`);
