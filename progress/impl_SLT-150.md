# impl SLT-150 — Guardia dominio-ordenex-fuera: un solo barrido del repo

Ruta directa. Fecha 2026-11-13.

## Medicion (antes)

- La premisa de la ficha no se cumple: el archivo YA memorizaba (`let cache` en `archivosConDominio`).
  Barridos por corrida hoy: **1** (el test R9 sale en 0 ms porque reusa el cache).
- El costo real es ese UN barrido: `git ls-files` (8089 rutas) + `statSync` + `readFileSync` de cada
  archivo en Node. Corrida sola: «ninguna entrada sobra…» 1136 ms; bajo la carga del gate, 31 s.
  De los archivos leidos, **7495** no contienen el nombre heredado ni en minusculas: lectura inutil.

## Test que reproduce el fallo

`describe("costo del barrido (SLT-150)")` al final de la guardia (contador exportado `costoDelBarrido`):

- «recorre el repo una sola vez por corrida del archivo» — `barridos === 1`. Verde ya contra el codigo
  de hoy (confirma la premisa falsa); fija el memo.
- «Node solo lee los archivos que git grep marca con el nombre heredado» — `lecturasSinNombre === 0`.
  Contra el codigo de hoy (instrumentado, sin el arreglo): ROJO, `expected 7495 to be +0`, 1 failed | 10 passed.

## Arreglo

`universo()` toma de lo versionado solo los candidatos de `git grep -l -z -i -F <nombre>` (+ `.env.example`
como antes; mismos filtros de `progress/`, binarios y existencia). Todo acierto del detector contiene el
nombre, asi que el filtro es un superconjunto: no se pierde ningun hallazgo. `git grep` sin aciertos (exit 1)
= universo vacio. Ningun `expect` ni titulo de los 9 tests previos cambia.

## Despues

- 11/11 verdes, tres corridas: «ninguna entrada sobra…» 180 / 182 / 168 ms (antes 1136 ms, ~6,5x);
  archivos leidos por Node: 231 candidatos fuera de `progress/` (antes 8089 rutas).
- Mutacion memo: quitar `if (cache) return cache;` -> ROJO `expected 3 to be 1`; revertido -> 11 passed.
- Mutacion detector (el barrido sigue mordiendo): anadir el dominio a `docs/conventions.md` -> R9 ROJO
  `docs/conventions.md:33`; revertido (`git checkout`) -> 11 passed.

## Importadores de `_dominio-heredado.ts`

API sin tocar. `recursos-origen-fuera` y `docs-marca-heredada` verdes (77 passed | 1 skipped: R18 omitido
sin `RECURSOS_ORIGEN_REF`, preexistente). `recursos-origen-fuera` tiene su propio barrido
(`ls-files --cached --others`, otro universo y varias clases): no es trivial reusar este; se deja.

## Archivos

- `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (modificado)
- `progress/impl_SLT-150.md` (este)

## Salidas

- vitest dominio + recursos-origen-fuera + docs-marca-heredada: EXIT=0, 3 files, 88 passed | 1 skipped
- `npx eslint tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`: EXIT=0
- `npx tsc --noEmit -p .`: EXIT=0

Veredicto: la guardia barre una vez y ya barria una; el arreglo real es leer 231 archivos en vez de 8089 (1136 -> ~175 ms).
