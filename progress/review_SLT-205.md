# Review SLT-205 «Guardias rotas: dependencias-declaradas-presentes y buscadores-con-escaneo»

Ruta directa, revisión acotada al diff `origin/dev...42faa2a4` (PR #232). El diff toca 4 archivos:
la guardia `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`, `tests/baseline-rojos.json`
y dos de `progress/`. No toca código de la app, `db/`, dinero ni permisos: la ruta directa vale.

## Checklist

- [x] Ruta: directa, aprobada por Carlos; el diff no toca dinero, permisos, auth, integraciones ni webhooks.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 2/40 archivos, 0/1000 de producción, 182/3000 de tests.
- [x] Test que fallaba antes: `SLT-205: escaneo={false} NO cuenta como escaneo`; el rojo con la guardia vieja está en la bitácora.
- [x] Mapa requisito → test en `progress/impl_SLT-205.md`.
- [x] Typecheck: `pnpm run typecheck`, exit 0.
- [x] Lint del archivo tocado: `eslint`, sin problemas.
- [x] Guardia con el código actual: `27 passed (27)`, exit 0. Ninguna pantalla de dev queda en rojo.
- [x] Inventario: 20 archivos `.tsx` de `app/` y `components/` montan `<BuscadorFiltros`. `RankingHistoricoModule` solo lo monta con `buscador={false}`: quedan 19 = 8 + 11, como afirma el control positivo. Ningún montaje usa spread ni alias, y no hay montajes fuera de `app/` y `components/`.
- [x] `SIN_ESCANEO`: las 11 entradas tienen motivo. Recolección cita SLT-200 punto 6 y la decisión de Carlos del 2026-11-18. Las 9 con `FUERA_DE_B1_B8` heredan la prohibición de la guardia de SLT-160.
- [x] Punto 1, diagnóstico correcto. `init.sh` es del arnés (`arnes.manifest:11`) y no llama a `scripts/verificar-dependencias.mjs`: ningún `.sh` del repo lo llama. `git show 86d70bf0:init.sh` ya tenía `# >>> FIN PASO 2: DEPENDENCIAS <<<` sin `(ficha 420)` y con `ok "dependencias presentes"`. La guardia exige el marcador con `(ficha 420)` (línea 256), la llamada (línea 360) y la ausencia del `ok` (línea 365).
- [x] `init.sh` no se tocó (no está en el diff). La entrada del baseline sigue, y su motivo suma el diagnóstico de forma exacta.
- [ ] Sin falsos negativos ni cuelgues del detector ante formas de JSX: falla, ver B1 y B2.
- [n/a] E2E: el diff no toca `db/`, pantallas ni dinero.

## Mutaciones repetidas por el reviewer (todas restauradas con `git checkout --` / `rm`; `git status` limpio)

| # | mutación | resultado |
|---|---|---|
| R1 | `RecoleccionModule.tsx:283` `<BuscadorFiltros escaneo` | ROJO, 3 failed: SLT-200, «excepción … ninguno escanea» y el de inventario. Bien. |
| R2 | `RecoleccionModule.tsx:283` `<BuscadorFiltros escaneo={debounceActivoZq7 \|\| true}` | **VERDE, 27 passed**: falso negativo (B1). |
| R3 | `RecoleccionModule.tsx:283` `<BuscadorFiltros title="guia -> tienda" escaneo` | **vitest colgado** más de 3 min; lo maté (B2). Reproducido aparte con las mismas funciones: `timeout 10` → exit 124. |
| R4 | archivo nuevo `components/zz/AliasZz.tsx` con `import { BuscadorFiltros as Caja }` y `<Caja onChange={…} />` | VERDE, 27 passed: no lo ve (m1). |

## Hallazgos

### B1 — BLOQUEANTE: una excepción puede encender la cámara con una expresión y la guardia sigue verde
`escanea()` solo da `true` con `escaneo` suelto o `escaneo={true}`, y la guardia usa esa misma
función en las dos direcciones. En `CON_ESCANEO` eso protege: una expresión no cuenta como cámara.
En `SIN_ESCANEO` el efecto es el contrario: `escaneo={cualquierCosa}` cuenta como «no escanea».
Así, Recolección (decisión de Carlos, SLT-200) puede volver a tener cámara con
`escaneo={algo}` y el test `excepción …: ninguno escanea` sigue verde (mutación R2).

Qué falta: en las excepciones, exigir que la prop `escaneo` no esté o sea el literal `false`;
cualquier otro valor va a rojo. Hace falta además una contraprueba con `escaneo={expr}` en un
archivo de excepción.

### B2 — BLOQUEANTE: una prop de texto con `>` cuelga la guardia (bucle infinito)
`aperturasDeBuscador` corta la etiqueta en el primer `>` de profundidad 0, aunque esté dentro de
un literal (`title="guia -> tienda"`, `placeholder="Guía > tienda"`). Entonces la apertura queda
con una comilla sin cerrar. En `propsDeApertura`, `indexOf` devuelve `-1`, `i = fin + 1` vuelve a
`0` y el `while` no termina. Es código nuevo de este diff: no falla en rojo, cuelga el proceso, y
en CI se pierde el job hasta el timeout (mutación R3).

Qué falta:
- saltar los literales `"…"` y `'…'` al buscar el `>` de cierre;
- en `propsDeApertura`, cortar (o fallar con mensaje) si `fin < 0`;
- una contraprueba con `>` dentro de un literal y `escaneo` detrás.

### m1 — menor: alias y spread no se ven
- `import { BuscadorFiltros as X }` deja el montaje fuera del inventario (R4, verde).
- Un `{...props}` que lleve `escaneo` a un archivo de `SIN_ESCANEO` tampoco se ve.

Hoy no existe ninguno de los dos casos. Una línea barata que cierra la puerta: poner en rojo
cualquier import de `BuscadorFiltros` con `as` y cualquier `{...}` en la apertura de un montaje.

### m2 — menor: el motivo de las 9 excepciones es genérico
«fuera de B1-B8 de SLT-160» es el motivo heredado y verificable, y está bien no inventar otro. Si
alguna de esas pantallas pide cámara, la decisión se escribe en su entrada.

## Veredicto

**RECHAZADO** por B1 y B2. Los dos se arreglan en la guardia, con su contraprueba. El punto 1
(dependencias) está bien diagnosticado y bien parado: no hay nada que cambiar en él.

## Vuelta 2 (acotada a f5689c39..0e644ca4)

Revisé solo el diff de los arreglos (`tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`, `tests/baseline-rojos.json`, `progress/`) frente a B1, B2 y m1, y busqué regresiones.

### Checklist
- [x] **B1**: en una excepción, `apagado()` solo acepta que `escaneo` falte o sea el literal `{false}`. La mutación R2 repetida (`RecoleccionModule.tsx:283` `<BuscadorFiltros escaneo={debounceActivoZq7 || true}`) da **ROJO**, con 3 failed / 28 passed. El mensaje es «pasa «escaneo» distinto de «{false}»: quítalo o pásalo a CON_ESCANEO». La contraprueba unitaria cubre `{x || true}`, `{expr}`, `escaneo` suelto, `{ false }` y la ausencia.
- [x] **B2**: con `title="guia -> tienda" escaneo` en Recolección la guardia termina **en ROJO** en segundos (3 failed). Con `title="guia -> tienda"` sin `escaneo` termina **en VERDE**: 31 passed. Las dos corridas tenían `timeout 120`. Un literal sin cerrar lanza «literal sin cerrar», no se queda en bucle. El comentario del test explica bien que el `{ timeout: 2000 }` no corta un bucle síncrono.
- [x] **m1, alias**: un archivo nuevo `components/zz/AliasZz.tsx` con `import { BuscadorFiltros as Caja }` y `<Caja onChange={…} />` da **ROJO**: el inventario no cuadra.
- [x] **m1, spread**: `<BuscadorFiltros {...restoZq7}` en Recolección da **ROJO** con el mensaje claro «no se puede verificar escaneo con spread: <BuscadorFiltros {...restoZq7}».
- [x] **Punto 1 fuera de la ficha**: `git diff origin/dev...HEAD` no toca ni `tests/baseline-rojos.json` ni la guardia de dependencias. El diff contra dev son solo la guardia de escaneo y `progress/`.
- [x] Guardia sin mutar: 31 passed. ESLint limpio. `tsc --noEmit` sin errores. Tamaño del PR: 1/40 archivos, 0/1000 líneas de producción, 278/3000 de tests.
- [x] Árbol restaurado tras cada mutación (`git checkout --` y `rm -rf components/zz`). `git status` limpio.

### Hallazgos
- **m2, menor** (no bloquea): en `aperturasDeBuscador`, el lookahead `(?![\w$])` va dentro de un template literal. Ahí `\w` se queda en `w`, así que la regex real es `(?![w$])`. Resultado: un componente distinto cuyo nombre empiece por `BuscadorFiltros` (o por el alias) se cuenta como buscador. Lo comprobé con un archivo nuevo que monta `<BuscadorFiltrosZz onChange={…} />`: la guardia da ROJO por inventario. Falla hacia el lado seguro (falso positivo, nunca falso negativo) y hoy no existe ningún componente así en `app/` ni en `components/`. El arreglo es escribir `\w` (o `[A-Za-z0-9_$]`). Puede ir en este PR o quedar anotado.

### Veredicto vuelta 2
**OK**. B1 y B2 quedan resueltos y verificados con mutación. m1 queda resuelto. No hay regresiones. Queda abierto solo m2, que es menor.
