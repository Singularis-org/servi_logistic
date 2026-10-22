#!/usr/bin/env node
/**
 * Compara los archivos de test en rojo de una corrida contra `tests/baseline-rojos.json`.
 *
 * Existe porque cuando `dev` arrastra deuda ajena la suite completa termina siempre en rojo,
 * y entonces el gate deja de responder la unica pregunta que importa al cerrar una feature:
 * **¿rompi algo YO?**. Comparar a mano contra un numero que viaja por el chat no escala: en
 * una sola feature de un proyecto anterior hubo que hacerlo ocho veces y una se concluyo mal.
 *
 * La comparacion es **por archivo, no por conteo**. Una suite grande tira 2-5 flakes de
 * saturacion que cambian de sitio (se midieron 30, 31 y 32 rojos sobre el mismo codigo), asi
 * que exigir conteos exactos daria falsas alarmas constantes — y un gate que grita en falso se
 * ignora, que es como se pierde un gate.
 *
 * Coste aceptado a proposito: si un archivo YA listado gana un rojo nuevo de verdad, no se ve.
 * A cambio, la pregunta que si contesta —«¿aparecio un archivo que antes no fallaba?»— aguanta
 * el ruido.
 *
 * Estado en QuimiCloude (2026-08-28): el baseline nace VACIO porque la suite esta verde
 * (93/93, gate completo en 113 s). Con el baseline vacio esto no afloja nada: cualquier
 * archivo rojo es "nuevo" y bloquea. La maquinaria queda montada para cuando la suite crezca.
 *
 * Salida: resumen de una linea por stdout (para el `ok` de init.sh), errores y avisos por
 * stderr, exit 0/1.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const BASELINE = 'tests/baseline-rojos.json';
const reportePath = process.argv[2] ?? '.vitest-rojos.json';

/** Rutas comparables entre Windows y Linux: relativas al repo y siempre con `/`. */
const normalizar = (p) => relative(process.cwd(), resolve(p)).split('\\').join('/');

const morir = (...lineas) => {
  for (const l of lineas) console.error(l);
  process.exit(1);
};

// --- 1. El reporte tiene que existir Y ser de ESTA corrida ----------------------------
// Un gate que da por bueno lo que no llego a mirar es peor que ninguno. `init.sh` borra el
// reporte antes de correr la suite justo por esto: si vitest revienta antes de escribirlo
// (OOM, error de config, un Ctrl-C), aqui no puede quedar el archivo de la corrida ANTERIOR
// haciendose pasar por el de hoy. Ese es el mismo fallo que tuvo el bloque de `jq`: un check
// que sale verde sin haber examinado lo que dice examinar.
if (!existsSync(reportePath)) {
  morir(
    `no existe el reporte ${reportePath}: la suite no llego a escribirlo.`,
    'no se puede afirmar nada sobre los rojos de esta corrida.',
  );
}

let reporte;
try {
  reporte = JSON.parse(readFileSync(reportePath, 'utf8'));
} catch (err) {
  morir(`${reportePath} no se pudo leer: ${err.message}`);
}

// --- 2. Baseline: sin motivo no hay entrada -------------------------------------------
// El `motivo` no es adorno. Sin el, la lista se convierte en el sitio donde cualquiera mete
// lo que le estorba y nadie sabe ya si sigue haciendo falta.
let conocidos = new Map();
if (existsSync(BASELINE)) {
  let crudo;
  try {
    crudo = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    morir(`${BASELINE} no se pudo leer: ${err.message}`);
  }
  const archivos = crudo.archivos ?? crudo;
  const malas = [];
  for (const [archivo, meta] of Object.entries(archivos)) {
    if (archivo.startsWith('_')) continue; // claves de documentacion
    if (!meta || !meta.motivo || !meta.desde) malas.push(archivo);
    else conocidos.set(normalizar(archivo), meta);
  }
  if (malas.length > 0) {
    morir(
      `${BASELINE}: entradas sin "motivo" o sin "desde": ${malas.join(', ')}`,
      'un baseline sin motivos es un vertedero: nadie sabra despues si esa deuda sigue viva.',
    );
  }
} else {
  console.error(`aviso: no hay ${BASELINE}; se asume que no hay rojos heredados.`);
}

// --- 3. Clasificar la corrida ---------------------------------------------------------
function clasificar(rep) {
  const rojos = new Set();
  const ejecutados = new Set();
  for (const suite of rep.testResults ?? []) {
    const ruta = normalizar(suite.name);
    ejecutados.add(ruta);
    if (suite.status === 'failed') rojos.add(ruta);
  }
  return { rojos, ejecutados };
}

const { rojos, ejecutados } = clasificar(reporte);

// La corrida fallo pero ningun ARCHIVO figura en rojo: entonces el fallo no es atribuible a
// nada que este comparador pueda comparar (un error de configuracion, un `unhandled rejection`
// fuera de un test, un worker caido). Dar verde ahi seria decir "no rompiste nada" sin haber
// mirado lo que se rompio.
//
// NO se compara `numTotalTestSuites` contra los archivos vistos: ese campo cuenta SUITES
// (bloques `describe`), no archivos —medido el 2026-08-28: 25 suites en 9 archivos—, y usarlo
// asi daba una falsa alarma en cada corrida verde. Y el punto ciego que se temia no existe:
// tambien medido, un archivo que revienta al importarse SI aparece en `testResults` con
// status `failed`, asi que entra en el analisis por la via normal.
if (reporte.success === false && rojos.size === 0) {
  morir(
    'la corrida fallo pero ningun archivo de test figura en rojo.',
    'el fallo no es atribuible a un archivo (config, worker caido, error fuera de un test);',
    'no se puede afirmar que no rompiste nada.',
  );
}

const nuevos = [...rojos].filter((f) => !conocidos.has(f)).sort();

// "Recuperado" SOLO si esta corrida lo ejecuto. Calcular `baseline - rojos` parece lo natural
// y esta MAL: un archivo que no corrio (modo rapido, filtro, suite parcial) no dice nada, y
// pedir que se borre del baseline por no haber corrido es una falsa alarma. Se midio: con
// fixtures de dos archivos, esa version pedia limpiar 6 de las 7 entradas.
const recuperados = [...conocidos.keys()].filter((f) => ejecutados.has(f) && !rojos.has(f)).sort();

// --- 4. Veredicto ---------------------------------------------------------------------
if (nuevos.length > 0) {
  console.error(`hay ${nuevos.length} archivo(s) de test en rojo que NO estan en el baseline:`);
  for (const f of nuevos) console.error(`  ${f}`);
  console.error('si el rojo es tuyo, arreglalo. Si es deuda ajena de dev, añadelo a');
  console.error(`${BASELINE} con su motivo y su fecha, y dilo en el PR.`);
  process.exit(1);
}

if (recuperados.length > 0) {
  console.error(`aviso: ${recuperados.length} archivo(s) del baseline ya pasan; toca limpiarlos:`);
  for (const f of recuperados) console.error(`  ${f}`);
}

const resumen = conocidos.size === 0
  ? `sin rojos nuevos (${ejecutados.size} archivos ejecutados, baseline vacio)`
  : `sin rojos nuevos (${rojos.size} rojos, todos en el baseline de ${conocidos.size})`;
console.log(recuperados.length > 0 ? `${resumen}; ${recuperados.length} por limpiar` : resumen);
