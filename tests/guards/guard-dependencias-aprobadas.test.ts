// Guardia: toda dependencia de `package.json` esta registrada en `docs/dependencias.md`.
//
// Recorre ARCHIVOS, no el grafo de imports: una dependencia recien instalada puede no ser
// importada todavia por nada —o serlo solo desde un script suelto— y ningun test unitario
// la veria. Por eso vive en `tests/guards/` y entra en `pnpm run test:guardias`.
//
// NO consulta npm: el gate corre sin red. Lo que comprueba es la APROBACION (que exista la
// fila), no la salud de la libreria; los cuatro checks los acredita la fila del registro
// (`docs/architecture.md > Dependencias de terceros`).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const REGISTRO = 'docs/dependencias.md'

/** Nombres declarados en `dependencies` + `devDependencies`. */
function dependenciasDeclaradas(): string[] {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort()
}

/**
 * Paquetes con fila en el registro. Una fila es `| \`nombre\` | ... |`: se lee la primera
 * celda y se acepta solo si viene entre backticks, para que el texto en prosa que menciona
 * un paquete no cuente como aprobacion.
 */
function paquetesRegistrados(): Set<string> {
  const md = readFileSync(join(repoRoot, REGISTRO), 'utf8')
  const registrados = new Set<string>()
  for (const linea of md.split('\n')) {
    const fila = linea.trim()
    if (!fila.startsWith('|')) continue
    const primeraCelda = fila.split('|')[1]?.trim() ?? ''
    const match = /^`([^`]+)`$/.exec(primeraCelda)
    if (match) registrados.add(match[1])
  }
  return registrados
}

describe(`guardia: dependencias aprobadas (${REGISTRO})`, () => {
  it('toda dependencia de package.json tiene su fila en el registro', () => {
    const registrados = paquetesRegistrados()
    const sinAprobar = dependenciasDeclaradas().filter((nombre) => !registrados.has(nombre))

    expect(
      sinAprobar,
      `Dependencias en package.json sin fila en ${REGISTRO}: ${sinAprobar.join(', ')}.\n` +
        'Ninguna dependencia entra sin los cuatro checks y aprobacion humana ' +
        '(docs/architecture.md > Dependencias de terceros). Anade la fila o desinstalala.',
    ).toEqual([])
  })

  it('el registro no lista paquetes que ya no estan instalados', () => {
    const declaradas = new Set(dependenciasDeclaradas())
    const sobrantes = [...paquetesRegistrados()].filter((nombre) => !declaradas.has(nombre)).sort()

    expect(
      sobrantes,
      `Filas de ${REGISTRO} que ya no existen en package.json: ${sobrantes.join(', ')}. ` +
        'Borra la fila: un registro con fantasmas deja de ser un acta.',
    ).toEqual([])
  })
})
