#!/usr/bin/env node
/**
 * Avisa de los tests que recorren el arbol de codigo y que el gate rapido no corre
 * (`docs/gate.md > Las guardias van SIEMPRE`).
 *
 * El gate rapido (`scripts/test-rapido.mjs`) corre los tests que `vitest related` relaciona con el
 * diff, mas los que casan con `arnes.config.json > gate.siempre`. Un test que recorre directorios
 * de codigo (`app/`, `lib/`, `components/`) en vez de importar lo que vigila no lo selecciona
 * ningun grafo: si ademas no casa con `gate.siempre`, solo lo ve el CI completo.
 *
 * AVISA y no falla (decision del humano, 2026-10-08): hacerlo bloqueante obligaba a subir el gate
 * rapido de ~35 s a ~145 s o a marcar uno a uno decenas de tests mixtos. El numero queda a la vista
 * para decidir en la revision del perfil. Un test sale del aviso con `// gate: related` y el motivo.
 *
 * Deteccion (heuristica, a proposito estrecha): archivo de test fuera de `tests/integration/` con una
 * llamada que recorre directorios (`readdirSync`, `readdir`, `globSync`, `glob(`, `fs.glob`) y una
 * ruta literal a `app`, `lib` o `components`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RECORRE = /\b(readdirSync|globSync|readdir)\s*\(|\bfs\.glob\b|\bglob\s*\(/;
const RUTA_DE_CODIGO = /['"`](?:\.\.\/)*(?:app|lib|components)(?:\/[^'"`]*)?['"`]/;
const EXCEPCION = /\/\/\s*gate:\s*related/;

/**
 * @param {Array<{ ruta: string, texto: string }>} archivos rutas relativas con `/`
 * @param {string[]} patrones `gate.siempre`
 * @returns {string[]} tests de arbol que no casan con ningun patron ni llevan la excepcion
 */
export function testsDeArbolSinCubrir(archivos, patrones) {
  return archivos
    .filter(({ ruta }) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(ruta) && !ruta.includes('integration/'))
    .filter(({ texto }) => RECORRE.test(texto) && RUTA_DE_CODIGO.test(texto) && !EXCEPCION.test(texto))
    .filter(({ ruta }) => !patrones.some((p) => ruta.includes(p)))
    .map(({ ruta }) => ruta)
    .sort();
}

function leerTests(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  (function recorrer(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') recorrer(f);
      } else {
        out.push({ ruta: f.split(path.sep).join('/'), texto: readFileSync(f, 'utf8') });
      }
    }
  })(dir);
  return out;
}

function main() {
  let patrones = ['guard'];
  try {
    const lista = JSON.parse(readFileSync('arnes.config.json', 'utf8')).gate?.siempre;
    if (Array.isArray(lista) && lista.length > 0) patrones = lista;
  } catch {
    /* sin perfil: solo guardias */
  }
  const fuera = testsDeArbolSinCubrir(leerTests('tests'), patrones);
  if (fuera.length === 0) {
    console.log('tests de arbol: todos cubiertos por gate.siempre');
    return;
  }
  const muestra = fuera.slice(0, 5).join(', ');
  console.log(
    `AVISO: ${fuera.length} test(s) recorren app/lib/components y el gate rapido no los corre (no casan con gate.siempre: ${patrones.join(', ')}). Solo los ve el CI completo. Ej.: ${muestra}${fuera.length > 5 ? ', ...' : ''}. Lista completa: node scripts/tests-de-arbol.mjs --todos`,
  );
  if (process.argv.includes('--todos')) for (const f of fuera) console.log(`  ${f}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
