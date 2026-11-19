// Guardia: el paso 2 de `init.sh` MIDE las dependencias declaradas, no que exista la carpeta.
//
// Existe por el incidente del 2026-09-11 (servi_logistic, ficha 420): el paso 2 preguntaba si
// existia el DIRECTORIO `node_modules` y, si existia, imprimia «dependencias presentes» sin abrir
// `package.json`. Tras mergear una ficha que anadia `web-push` el gate completo dio ese visto
// bueno EN VERDE y dos pasos mas tarde reventaba con `Cannot find module 'web-push'`. Parecia un
// error de codigo y era un `pnpm install` que faltaba. Y si falta SOLO el paquete de runtime pero
// siguen sus tipos en `node_modules/@types/`, el typecheck pasa en verde y el fallo sale en
// ejecucion: este paso es la unica red. El arreglo se perdio una vez en el sync del arnes 2.14.0,
// porque no se habia subido a la plantilla (`docs/gate.md > El gate tiene DOS niveles > Por que`).
//
// Tres bloques:
// - el verificador (`scripts/verificar-dependencias.mjs`) contra arboles FALSOS en un temporal:
//   romper el `node_modules` real de quien corre la suite para ver un rojo deja la maquina peor;
// - el paso 2 de `init.sh`, extraido entre sus marcadores y EJECUTADO con bash: una comprobacion
//   de texto sobre el `|| fail` se burlaba sustituyendolo por un `|| DEPENDENCIAS="..."` que
//   conservaba la palabra; ejecutarlo mide la propiedad, no la forma
//   (`docs/gate.md > Probar que muerde, no que pasa`);
// - el texto de `init.sh` y del verificador, para los casos baratos y probables (borrar la llamada,
//   volver a la linea vieja, importar un paquete de `node_modules`).
//
// El verificador se lanza con `node`, no se importa: importarlo correria la comprobacion como
// efecto de importar y podria dejar `process.exitCode = 1` en el proceso de vitest.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VERIFICADOR = join(RAIZ, 'scripts', 'verificar-dependencias.mjs')
const INIT_SH = join(RAIZ, 'init.sh')
const INICIO = '# >>> PASO 2: DEPENDENCIAS <<<'
const FIN = '# >>> FIN PASO 2: DEPENDENCIAS <<<'

// En Windows, `bash` a secas puede resolver al de WSL (System32). Se usa el de Git Bash.
function rutaBash(): string {
  if (process.platform !== 'win32') return 'bash'
  const candidatos = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ]
  return candidatos.find((c) => existsSync(c)) ?? 'bash'
}
const BASH = rutaBash()

const aBash = (p: string) => p.replace(/\\/g, '/')
const tmp = mkdtempSync(join(tmpdir(), 'guardia-dependencias-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let n = 0

interface OpcionesArbol {
  dependencias?: Record<string, string>
  devDependencias?: Record<string, string>
  /** Paquetes que SI se instalan en el node_modules falso. */
  instalados?: string[]
  /** Carpetas creadas sin package.json dentro: existen, pero no son un paquete. */
  carpetasVacias?: string[]
  /** Paquetes instalados como enlace ROTO, que es la forma real de pnpm con un store purgado. */
  enlacesRotos?: string[]
  /** Si es false, no se crea node_modules en absoluto. */
  conNodeModules?: boolean
}

function arbolFalso(opciones: OpcionesArbol): string {
  const raiz = join(tmp, `arbol-${++n}`)
  mkdirSync(raiz, { recursive: true })
  writeFileSync(
    join(raiz, 'package.json'),
    JSON.stringify({
      name: 'arbol-falso',
      dependencies: opciones.dependencias ?? {},
      devDependencies: opciones.devDependencias ?? {},
      // A proposito: optionalDependencies PUEDE faltar y el verificador no debe exigirla. Si algun
      // dia se exigiera, el caso verde de abajo se pondria rojo.
      optionalDependencies: { 'paquete-opcional-ausente': '^1.0.0' },
    }),
  )
  if (opciones.conNodeModules === false) return raiz

  const nodeModules = join(raiz, 'node_modules')
  mkdirSync(nodeModules)
  for (const nombre of opciones.instalados ?? []) {
    mkdirSync(join(nodeModules, nombre), { recursive: true })
    writeFileSync(join(nodeModules, nombre, 'package.json'), JSON.stringify({ name: nombre }))
  }
  for (const nombre of opciones.carpetasVacias ?? []) {
    mkdirSync(join(nodeModules, nombre), { recursive: true })
  }
  for (const nombre of opciones.enlacesRotos ?? []) {
    const objetivo = join(raiz, 'store-borrado', nombre)
    mkdirSync(objetivo, { recursive: true })
    writeFileSync(join(objetivo, 'package.json'), JSON.stringify({ name: nombre }))
    const enlace = join(nodeModules, nombre)
    mkdirSync(dirname(enlace), { recursive: true })
    symlinkSync(objetivo, enlace, 'junction')
    rmSync(objetivo, { recursive: true, force: true })
  }
  return raiz
}

function correrVerificador(raiz: string) {
  const r = spawnSync(process.execPath, [VERIFICADOR, raiz], { encoding: 'utf8' })
  return { codigo: r.status, salida: r.stdout ?? '', error: r.stderr ?? '' }
}

function pasoDos(): string {
  const lineas = readFileSync(INIT_SH, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const i = lineas.findIndex((l) => l.startsWith(INICIO))
  const f = lineas.findIndex((l) => l.startsWith(FIN))
  if (i === -1) throw new Error(`init.sh no tiene el marcador de inicio «${INICIO}»: la guardia no puede aislar el paso 2`)
  if (f === -1) throw new Error(`init.sh no tiene el marcador de fin «${FIN}»: la guardia no puede aislar el paso 2`)
  if (f <= i) throw new Error('en init.sh el marcador de fin del paso 2 va antes que el de inicio')
  return lineas.slice(i + 1, f).join('\n')
}

// Corre el paso 2 REAL en un arbol falso que lleva su copia del verificador en `scripts/` (sin ella
// el rojo llegaria por «no existe el archivo»: el desenlace correcto por el motivo equivocado) y
// un `pnpm` falso, para que ningun caso instale de verdad.
function correrPasoDos(opciones: OpcionesArbol) {
  const raiz = arbolFalso(opciones)
  mkdirSync(join(raiz, 'scripts'), { recursive: true })
  writeFileSync(join(raiz, 'scripts', 'verificar-dependencias.mjs'), readFileSync(VERIFICADOR, 'utf8'))
  const bin = join(tmp, `bin-${n}`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'pnpm'), '#!/usr/bin/env bash\nexit 0\n')
  const script = [
    'set -euo pipefail',
    "RED=''; GREEN=''; YELLOW=''; NC=''",
    'fail() { echo "${RED}✗ $1${NC}"; exit 1; }',
    'ok()   { echo "${GREEN}✓ $1${NC}"; }',
    'warn() { echo "${YELLOW}! $1${NC}"; }',
    `chmod +x "${aBash(join(bin, 'pnpm'))}"`,
    `export PATH="$(cd "${aBash(bin)}" && pwd):$PATH"`,
    pasoDos(),
  ].join('\n')
  const r = spawnSync(BASH, ['-c', script], { cwd: raiz, encoding: 'utf8' })
  return { codigo: r.status, todo: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// Quita comentarios para que las aserciones sobre el verificador miren lo que HACE y no lo que
// su cabecera explica de si mismo (que menciona `child_process` justo para decir que no lo usa).
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('guardia: el verificador de dependencias', { timeout: 30_000 }, () => {
  it('con todas las declaradas presentes pasa y dice cuantas comprobo (la opcional ausente no cuenta)', () => {
    const raiz = arbolFalso({
      dependencias: { zod: '^4.0.0', next: '^16.0.0' },
      devDependencias: { vitest: '^4.0.0' },
      instalados: ['zod', 'next', 'vitest'],
    })
    const { codigo, salida, error } = correrVerificador(raiz)
    expect(codigo).toBe(0)
    expect(salida).toContain('3 declaradas, todas presentes')
    expect(error).toBe('')
  })

  it('una declarada que no esta en el arbol da rojo y la nombra, solo a ella', () => {
    // El incidente: el arbol existe, casi entero, y le falta web-push.
    const raiz = arbolFalso({
      dependencias: { zod: '^4.0.0', 'web-push': '^3.6.7', next: '^16.0.0' },
      instalados: ['zod', 'next'],
    })
    const { codigo, error } = correrVerificador(raiz)
    expect(codigo).toBe(1)
    expect(error).toContain('web-push')
    expect(error).not.toContain('- zod')
    expect(error).not.toContain('- next')
  })

  it('nombra todas las ausentes, de dependencies y devDependencies, incluidas las de scope', () => {
    const raiz = arbolFalso({
      dependencias: { zod: '^4.0.0', 'web-push': '^3.6.7' },
      devDependencias: { '@types/web-push': '^3.6.4', vitest: '^4.0.0' },
      instalados: ['zod', 'vitest'],
    })
    const { codigo, error } = correrVerificador(raiz)
    expect(codigo).toBe(1)
    expect(error).toContain('- web-push')
    expect(error).toContain('- @types/web-push')
    expect(error).toContain('faltan 2 de las 4')
  })

  it('una carpeta sin package.json no cuenta como paquete instalado', () => {
    const raiz = arbolFalso({ dependencias: { 'web-push': '^3.6.7' }, carpetasVacias: ['web-push'] })
    const { codigo, error } = correrVerificador(raiz)
    expect(codigo).toBe(1)
    expect(error).toContain('web-push')
  })

  it('un enlace roto (la forma de pnpm con el store purgado) tampoco cuenta', () => {
    const raiz = arbolFalso({
      dependencias: { 'web-push': '^3.6.7', zod: '^4.0.0' },
      instalados: ['zod'],
      enlacesRotos: ['web-push'],
    })
    const { codigo, error } = correrVerificador(raiz)
    expect(codigo).toBe(1)
    expect(error).toContain('web-push')
  })

  it('sin node_modules lo reporta como arbol sin instalar, sin enumerar ausencias', () => {
    const raiz = arbolFalso({ dependencias: { zod: '^4.0.0', 'web-push': '^3.6.7' }, conNodeModules: false })
    const { codigo, error } = correrVerificador(raiz)
    expect(codigo).toBe(1)
    expect(error).toContain('sin instalar')
    expect(error).not.toContain('- zod')
  })

  it('el rojo trae el comando de reparacion ya escrito', () => {
    const raiz = arbolFalso({ dependencias: { 'web-push': '^3.6.7' }, instalados: [] })
    expect(correrVerificador(raiz).error).toContain('pnpm install --frozen-lockfile')
  })

  it('el arbol REAL de este repo tiene todas sus dependencias declaradas', () => {
    // El que habria cazado el incidente con solo correr la suite: mide el node_modules de quien
    // corre esto ahora mismo.
    const { codigo, salida, error } = correrVerificador(RAIZ)
    expect(error).toBe('')
    expect(codigo).toBe(0)
    expect(salida).toMatch(/^\d+ declaradas, todas presentes/)
  })
})

describe('guardia: el paso 2 de init.sh, EJECUTADO', { timeout: 30_000 }, () => {
  it('init.sh tiene los dos marcadores del paso 2', () => {
    expect(() => pasoDos()).not.toThrow()
  })

  it('con una dependencia ausente el paso corta en rojo, la nombra y NO da el visto bueno', () => {
    const { codigo, todo } = correrPasoDos({
      dependencias: { zod: '^4.0.0', 'web-push': '^3.6.7' },
      instalados: ['zod'],
    })
    expect(codigo, `el paso 2 termino en ${codigo} con web-push ausente. Salida:\n${todo}`).not.toBe(0)
    expect(todo).toContain('web-push')
    // Mata al `fail` silenciado: aunque el codigo fuera no-cero por otro motivo, el `ok` saldria.
    expect(todo).not.toContain('dependencias: ')
  })

  it('con el arbol completo el paso pasa y da el visto bueno con la cifra', () => {
    // La otra mitad del par: sin ella, un paso que fallara SIEMPRE tambien pasaria el de arriba.
    const { codigo, todo } = correrPasoDos({
      dependencias: { zod: '^4.0.0', 'web-push': '^3.6.7' },
      devDependencias: { vitest: '^4.0.0' },
      instalados: ['zod', 'web-push', 'vitest'],
    })
    expect(codigo, todo).toBe(0)
    expect(todo).toContain('dependencias: 3 declaradas, todas presentes')
  })
})

describe('guardia: el gate llama al verificador', () => {
  const init = readFileSync(INIT_SH, 'utf8')

  it('init.sh invoca scripts/verificar-dependencias.mjs', () => {
    // Que el script exista no prueba nada si nadie lo llama: es lo que perdio el sync 2.14.0.
    expect(init).toContain('scripts/verificar-dependencias.mjs')
  })

  it('init.sh ya no contiene ok "dependencias presentes"', () => {
    // La linea exacta del incidente: si vuelve, el gate afirma sin medir.
    expect(init).not.toContain('ok "dependencias presentes"')
  })

  it('la instalacion de arranque usa el lockfile y corta el gate si falla', () => {
    const instalacion = init.split('\n').find((l) => l.trim().startsWith('pnpm install'))
    expect(instalacion, 'init.sh ya no instala en el arranque').toBeDefined()
    expect(instalacion).toContain('--frozen-lockfile')
    expect(instalacion).toContain('fail')
  })
})

describe('guardia: el verificador no depende de lo que verifica', () => {
  const fuente = sinComentarios(readFileSync(VERIFICADOR, 'utf8'))

  it('solo importa modulos node:, nunca un paquete de node_modules', () => {
    // Comprobar las dependencias USANDO una dependencia se caeria justo el dia que tiene que hablar.
    const importados = [...fuente.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
    expect(importados.length).toBeGreaterThan(0)
    for (const modulo of importados) expect(modulo, `${modulo} no es un modulo nativo de node`).toMatch(/^node:/)
  })

  it('no lanza procesos ni toca la red', () => {
    expect(fuente).not.toContain('child_process')
    expect(fuente).not.toContain('fetch(')
  })
})
