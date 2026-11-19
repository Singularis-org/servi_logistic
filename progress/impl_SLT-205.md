# impl SLT-205 «Guardias rotas: dependencias-declaradas-presentes y buscadores-con-escaneo»

Ruta directa, aprobada por Carlos (2026-11-18). Rama `feature/SLT-205-guardias-rotas`, sale de dev 08a5e385.

## Archivos

- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` (modificado): punto 2.
- `tests/baseline-rojos.json`: SIN cambios frente a dev. El cambio de la vuelta 1 al motivo de
  `dependencias-declaradas-presentes` se revirtió en la vuelta 2 para no chocar con la rama del arnés.
- `progress/features/SLT-205.md` (nuevo), `progress/impl_SLT-205.md` (nuevo).
- NO se tocó `init.sh` (archivo del arnés).

## Punto 1 — `dependencias-declaradas-presentes.guardia.test.ts`: RESUELTO POR EL ARNÉS

Vuelta 2, 2026-11-18, por indicación del leader: el punto 1 sale de esta ficha. Lo arregla una mejora
del arnés en otra rama, `chore/arnes-dependencias-medidas`, que mueve la guardia y quita su entrada
del baseline. Esta rama no toca ni la guardia ni esa entrada: `git diff origin/dev` de los dos
archivos sale vacío. Abajo queda el diagnóstico de la vuelta 1, como antecedente.

### Diagnóstico de la vuelta 1 (antecedente)

De quién es cada archivo:

| archivo | dueño | prueba |
|---|---|---|
| `init.sh` | arnés | línea 11 de `arnes.manifest`; hash en `arnes.lock.json` |
| `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` | proyecto | no está en `arnes.manifest` |
| `scripts/verificar-dependencias.mjs` | proyecto | no está en `arnes.manifest`; nadie lo llama |
| `scripts/gate-proyecto.sh` | proyecto (perfil) | no está en `arnes.manifest`; `init.sh` lo carga en 6.c |

Qué está mal (medido):
- La guardia viene del producto de origen (ficha 420). Exige que el paso 2 de `init.sh`:
  1. tenga el marcador `>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<`;
  2. llame a `scripts/verificar-dependencias.mjs`;
  3. NO diga `ok "dependencias presentes"` sin medir;
  4. corte en rojo si falta un paquete.
- El `init.sh` de la plantilla no ha cumplido nada de eso NUNCA:
  - `git show 86d70bf0:init.sh` (el primer commit del repo) ya tiene `# >>> FIN PASO 2: DEPENDENCIAS <<<`, sin `(ficha 420)` y sin llamar al verificador;
  - el sync 2.14.0 (9aa7e060) tampoco lo trae.
- Hoy `init.sh:200` sigue imprimiendo `ok "dependencias presentes"` sin abrir `package.json`, que es
  justo el incidente que la guardia vino a cerrar.
- `node scripts/verificar-dependencias.mjs .` en este worktree: `56 declaradas, todas presentes`, exit 0.
  El script funciona; lo que falta es que el gate lo llame.
- Por eso NO es el caso (a). Si solo cambio el marcador de la guardia, siguen rojos los 3 tests que miden el
  paso de verdad: R2/R6 ejecutado, R6 «invoca» y R2 «no cuelga de la carpeta».
  Dejarlos verdes exige cambiar `init.sh` o quitar la propiedad que vigila la guardia.

### Parche propuesto B1, para `/afinar-regla` (arnés)

En `init.sh`, paso 2, cambiar `ok "dependencias presentes"` por una comprobación opcional. Sin el
script, el arnés se queda como está, porque la plantilla no conoce `verificar-dependencias.mjs`:

```bash
  if [ -f scripts/verificar-dependencias.mjs ]; then
    DEPENDENCIAS="$(node scripts/verificar-dependencias.mjs .)" \
      || fail "faltan dependencias declaradas en package.json (el detalle esta justo arriba): pnpm install --frozen-lockfile"
    ok "dependencias: $DEPENDENCIAS"
  else
    ok "dependencias presentes"
  fi
```

Notas de B1:
- Con `scripts/verificar-dependencias.mjs` subido a la plantilla, se puede quitar la rama `else`.
- No se cambian los marcadores del paso 2:
  - `tests/guards/guard-init-node-modules-enlazado.test.ts` (arnés) recorta por `# >>> PASO 2: DEPENDENCIAS <<<` / `# >>> FIN PASO 2: DEPENDENCIAS <<<`.
  - La guardia del proyecto se cambia (caso (a)) para usar `MARCA_FIN = ">>> FIN PASO 2: DEPENDENCIAS <<<"`.
- Con eso, los tests de la guardia que miran `init.sh` quedan así:
  - «R2 no cuelga de la carpeta»: sigue rojo, porque la rama `else` conserva el literal. Habría que ajustarlo para que acepte el literal solo dentro del `else`, o subir el script a la plantilla y quitar el `else`.
  - Los demás tests pasan. A medir cuando el parche esté aplicado.

### Alternativa B2 (solo proyecto, sin tocar el arnés)

- Llamar al verificador desde `scripts/gate-proyecto.sh` (perfil). Corre antes del typecheck, así que un
  `web-push` ausente sale ahí y no como TS2307.
- Reescribir la guardia para que ejecute ese paso.
- Hay que quitar la aserción sobre `init.sh:200`. El `ok "dependencias presentes"` del arnés seguiría
  imprimiéndose antes de la medida. Es menos limpio que B1, pero es reversible y no pasa por la plantilla.

Decide el leader con Carlos. Hasta entonces la entrada del baseline sigue, con el motivo ampliado.

## Punto 2 — `buscadores-con-escaneo.guardia.test.ts`

El defecto (m2 de SLT-194): `pasaEscaneo` buscaba la palabra `escaneo` entre las props de primer
nivel. Por eso `escaneo={false}` contaba como cámara encendida. Además:
- con un buscador escaneando, el archivo entero quedaba en verde, aunque tuviera otro sin escaneo;
- un buscador nuevo sin `escaneo` no ponía nada en rojo.

La guardia nueva:
- Lee las props de cada `<BuscadorFiltros …>` (`propsDeApertura`). Solo cuentan `escaneo` suelto o
  `escaneo={true}`. No cuentan `escaneo={false}` ni una expresión: una expresión no se puede probar
  leyendo el texto.
- Un montaje con `buscador={false}` no tiene campo de búsqueda y no es un buscador. Es el caso de
  `RankingHistoricoModule` y del segundo montaje de `GestionesCierre`.
- En `CON_ESCANEO` (B1-B8 + Rechazos) escanean TODOS los buscadores de cada archivo.
- `SIN_ESCANEO` es la lista explícita de excepciones, cada una con su motivo:
  - `/cierres-admin`: B9, busca por folio.
  - Recolección: SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview»,
    decisión de Carlos del 2026-11-18. Se conserva el caso que la fija.
  - Las 9 restantes, con el motivo «fuera de B1-B8 de SLT-160 (R609, D1)». La guardia anterior ya
    les prohibía la cámara: no se inventa otro motivo.
- Inventario: todo archivo de `app/` o `components/` con buscador está en una de las dos listas.
  - Control positivo: 19 archivos = 8 + 11.
  - Uno sin escaneo y fuera de `SIN_ESCANEO` → rojo.
  - Uno con escaneo y fuera de `CON_ESCANEO` → rojo.

### Rojo con la guardia vieja → verde con la nueva

Antes del arreglo, solo con el test nuevo añadido:

```
× SLT-205: `escaneo={false}` NO cuenta como escaneo 5ms
Tests  1 failed | 14 passed (15)
AssertionError: expected true to be false // Object.is equality
```

Después: `Tests  27 passed (27)`, EXIT=0.

### Mutaciones (todas restauradas; las de `app/` con `git checkout --`)

| # | mutación | resultado |
|---|---|---|
| M1 | `LibroCajaBarra.tsx:144` `escaneo` → `escaneo={false}` | ROJO, 2 failed: «LibroCajaBarra monta TODOS…» y «todo buscador… escanea» |
| M2 | `RechazosSlaModule.tsx:149` borrar `escaneo` | ROJO, 2 failed: los mismos dos tests, en Rechazos |
| M3 | guardia: `escanea` vuelve a `has("escaneo")` (la lógica vieja) | ROJO, 2 failed: «`escaneo={false}` NO cuenta» y la contraprueba de formas |
| M4 | guardia: sacar `FiltrosEntregas.tsx` de `SIN_ESCANEO` | ROJO, 1 failed: «todo buscador… salvo las excepciones explícitas» |
| M5 | `RepartoModule.tsx:880` `<BuscadorFiltros escaneo` | ROJO, 2 failed: «excepción RepartoModule… ninguno escanea» y el de inventario |

Final, sin mutaciones: `Tests  27 passed (27)`.

### Vuelta 2 — review RECHAZADA (f5689c39, `progress/review_SLT-205.md`)

- **B1**: en una excepción, `escaneo` tiene que faltar o ser el literal `{false}`.
  - `apagado()` y `ningunoEscanea()` sustituyen a `!pasaEscaneo` en `/cierres-admin`, en Recolección, en las excepciones y en el inventario.
  - Cualquier otra expresión (`escaneo={x || true}`) da rojo.
- **B2**: el `>` de cierre se busca fuera de los literales y de las llaves (`finDeLiteral`, `finDeLlaves`).
  - Un literal o una llave sin cerrar LANZA un error con nombre; ya no hay bucle infinito.
  - El test lleva `timeout: 2000`. Límite declarado: un timeout no corta un bucle SÍNCRONO, porque bloquea el hilo de vitest. La protección real es el `throw`.
- **m1, alias**: `nombresDelBuscador` lee `import { BuscadorFiltros as X }`, y `<X …>` cuenta como buscador.
- **m1, spread**: un `{...}` en la apertura LANZA «no se puede verificar escaneo con spread». Hoy no hay ninguno: el inventario de `app/` y `components/` pasa.
- **Resultado**: `Tests  31 passed (31)`, EXIT=0.

Mutaciones de la vuelta 2:
- las de `app/` se restauraron con `git checkout --`;
- las de la guardia, con una copia que se comparó con `cmp` y después se borró.

| # | mutación | resultado |
|---|---|---|
| R2 (review) | `RecoleccionModule.tsx:283` `<BuscadorFiltros escaneo={debounceActivoZq7 \|\| true}` | ROJO, 3 failed: Recolección, la excepción y el inventario |
| R3 (review) | `RecoleccionModule.tsx:283` `<BuscadorFiltros title="guia -> tienda" escaneo` | ROJO, 3 failed; no se cuelga (corrió bajo `timeout 240`) |
| R4 (review) | `components/zz/AliasZz.tsx` con `import { BuscadorFiltros as Caja }` y `<Caja onChange={f} />` | ROJO, 1 failed: el inventario |
| M6 | `RecoleccionModule.tsx:283` `<BuscadorFiltros {...{}}` | ROJO, 3 failed: `Error: no se puede verificar escaneo con spread` |
| M7 | guardia: `apagado` = `valor !== "true"` (la lógica de la vuelta 1) | ROJO, 2 failed: la contraprueba B1 y la del alias |
| M8 | guardia: `aperturasDeBuscador` deja de saltar literales | ROJO, 1 failed: «un > dentro de un literal…» |
| M9 | guardia: `nombresDelBuscador` ignora los alias | ROJO, 1 failed: «el import con alias se cuenta como buscador» |

## Mapa requisito → test (ruta directa, sin `requirements.md`)

| requisito de la ficha | test |
|---|---|
| P2: rechazar `escaneo={false}` | `SLT-205: \`escaneo={false}\` NO cuenta como escaneo` |
| P2: rechazar la ausencia de `escaneo` en cualquier buscador | `SLT-205: todo buscador de \`app/\` o \`components/\` escanea, salvo las excepciones explícitas` + `%s monta TODOS sus \`BuscadorFiltros\` con \`escaneo\`` |
| P2: lista explícita de excepciones | `excepción %s: tiene buscador y ninguno escanea` |
| P2: conservar Recolección sin cámara (SLT-200) | `SLT-200: \`/recoleccion\` monta \`BuscadorFiltros\` sin \`escaneo\`` |
| P2: el detector no se engaña | `SLT-205: contraprueba de las formas de \`escaneo\` y del archivo con dos buscadores` |
| B1 (review) | «SLT-205: en una excepción, escaneo={x \|\| true} NO pasa por apagado» + «excepción %s…» |
| B2 (review) | «SLT-205: un > dentro de un literal no corta la etiqueta ni cuelga» |
| m1 (review) | «SLT-205: el import con alias se cuenta como buscador» + «SLT-205: un {...props} en la apertura da rojo» |
| P1 | fuera de la ficha: lo resuelve el arnés (`chore/arnes-dependencias-medidas`) |

## Gate

Gate rápido, `bash ./init.sh` sobre la base desechable `servi_slt205_desechable` (con `con-desechable.cjs`).
Log completo, sin `tail`:

```
✓ SLT-205: tamano del PR: 2/40 archivos, 0/1000 lineas de produccion, 182/3000 de tests
✓ typecheck paso
✖ 248 problems (0 errors, 248 warnings)
✓ lint paso
 ✓ tests/unit/guards/buscadores-con-escaneo.guardia.test.ts (27 tests) 386ms
 Test Files  100 passed (100) | Tests 1253 / 1768 / 1584 (+1 skipped) passed
 Test Files  57 passed (57) | Tests 719 passed (719)
[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✓ test:rapido paso
== init OK ==
INIT_EXIT=0
```

Vuelta 2 (mismo comando):

```
✓ SLT-205: tamano del PR: 1/40 archivos, 0/1000 lineas de produccion, 278/3000 de tests
✓ typecheck paso
✖ 248 problems (0 errors, 248 warnings)
✓ lint paso
 ✓ tests/unit/guards/buscadores-con-escaneo.guardia.test.ts (31 tests) 342ms
 Test Files 100/100/100/57 passed | Tests 1253 / 1772 / 1584 (+1 skipped) / 719 passed
[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✓ test:rapido paso
== init OK ==
INIT_EXIT=0
```

Los 248 avisos de lint son previos; esta ficha no toca código de la app.

## Veredicto

Punto 2 hecho y verificado con 5 mutaciones. Punto 1 PARADO en el caso (b), con el parche propuesto para `/afinar-regla`.
