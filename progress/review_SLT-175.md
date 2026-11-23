# Review SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos»

Reviewer, 2026-11-16. Ruta **ligera**, review acotada a `git diff origin/dev...HEAD` (HEAD `45fe8b36`).
Grafo no usado (todo lo tocado son tests); Grep/Read.

## Checklist

- [x] **Ruta.** Diff solo en `tests/`, `specs/` y `progress/`: `git diff --name-only origin/dev...HEAD -- lib app components db` vacío. Toca guardias de dinero, pero sin código de producción: la ligera vale.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 4/40 archivos, 0/1000 de producción, 634/3000 de tests.
- [x] **Tasks.** T1-T6 `[x]`. T7 `[ ]`: lo local está hecho y anotado; falta solo la línea del log de `gate-completo` del PR (ver m3).
- [x] **Typecheck** (`tsc --noEmit -p .`, 8 GB) exit 0. **Lint** de los 3 tests exit 0.
- [x] **Guardia + cableado:** `vitest run pago-tienda-no-mueve-dinero.guardia.test.ts gate-cableado-arnes-v2.guardia.test.ts` → 22 passed.
- [x] **Sql-real en `servi_slt175_desechable`** (URL solo en el entorno del proceso): 2 files, **8 passed, 0 skipped, 0 failed** (4 + 4). Antes, conteo en esa base: `orden` = 0, `usuario` = 0. La siembra es propia: no hay nada previo de lo que pueda colgar.
- [x] **Baseline (R675).** El diff de `tests/baseline-rojos.json` son 8 líneas borradas, solo las dos claves del spec. Ninguna otra entrada cambia.
- [x] **Literales (R672).** El diff de los dos sql-real solo toca imports, `beforeAll` y la siembra dentro de `conCorpus`. No hay ni una línea con `it(`, `expect`, `toBe`/`toEqual` ni ningún literal monetario. Los controles positivos siguen con cardinales exactos.
- [x] **Sin `return` vacuo.** De la base solo queda `orderStatus.findFirst({ where: { value: "en_reparto" } })`, que lanza si falta. Zona, geografía y usuarios se crean con `crearFksDeOrden`/`crearUsuarioDePrueba` en la tx revertida.
- [x] **Fixture `orden-minima.ts`** sin tocar.

## Verificación propia (mutaciones)

| Mutación (mía) | Resultado | Restaurado |
|---|---|---|
| **Transitiva en 3 saltos.** `lib/utils/_rev_a.ts` (`export { cifrasDelCierre } from "./_rev_b"`) → `_rev_b.ts` (`export * from "../utils/cifras-cierre"`), importado como `cifrasDelCierre as zzRev` en `CobroTiendaService.ts:6`. | 3 rojos del árbol real, con la cadena entera: `CobroTiendaService.ts:6 → _rev_a.ts → _rev_b.ts → cifras-cierre.ts`. | `rm` de los dos y `git checkout -- lib/services/CobroTiendaService.ts`; `git status` limpio. |
| **R674 (b).** `partesPorTienda` resta `ingreso.total − fleteDevolucionConIva` (`lib/utils/ingreso-empresa.ts:680`). | 4/8 rojos: R6/R7 e identidades del mensajero, R19 vs R20 e identidades de bodega (`94350.00` vs `92655.00`; `130734.00` vs `129039.00`). | `git checkout -- lib/`; `git status` limpio. |

Las mutaciones (a), de siembra, M6/M7, de quitar una excepción y de añadir una inexistente están en `progress/impl_SLT-175.md:68-104`. Las leí y son coherentes con el código. No las repetí.

## Trazabilidad

| R | Test | ¿Falla si se rompe? |
|---|---|---|
| R670 | `cierre-desglose-por-tienda-sql-real.test.ts`, 4/0/0 en base sin `orden` ni `usuario` | sí (corrido) |
| R671 | `cierre-bodega-desglose-por-tienda-sql-real.test.ts`, 4/0/0, misma base | sí (corrido) |
| R672 | casos «identidades» y «CONTROL POSITIVO», literales intactos | sí (la mutación b los tumba) |
| R673 | los dos CONTROL POSITIVO con cardinal exacto, y la mutación de siembra de la bitácora | sí; lo del catálogo, ver m4 |
| R674 | R6, R6/R7, R19 vs R20 e identidades | sí: (b) verificada por mí, (a) en la bitácora |
| R675 | diff del baseline + `gate-cableado-arnes-v2` | sí |
| R676 | guardia «ningun camino de valor…» sobre el árbol real, y en memoria (a), (b), (d), (e), (f) | sí (mi mutación transitiva) |
| R677 | en memoria (c), también a través de `export *` | sí |
| R678 | «solo encoge» (tope 2, cita SLT-176), «quitar una excepcion da rojo», en memoria (g) | sí |
| R679 | en memoria (a)-(g) y «el barrido no es vacuo» (`leidos > servicios`, `ingreso-empresa.ts`, las dos cadenas exactas) | sí |

## Hallazgos

Ningún bloqueante.

- **m1 · menor** · `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts:352,458`. «Solo puede encoger» se sostiene con el literal `2` en `toBeLessThanOrEqual(2)`. Subir el tope pide editar ese literal en el mismo archivo. Es visible en el diff y suficiente para una guardia, pero no es mecánico. Cuando SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre» vacíe la lista, el literal debe bajar a 0.
- **m2 · menor** · `…guardia.test.ts:362-363`. La excepción es por par (servicio, primer módulo), como fija D2. Por eso un camino NUEVO que nazca dentro del subárbol de `cifras-bodega-descarga.ts` o de `CierresAdminService.ts` queda tapado mientras la excepción viva. Es aceptado por diseño; se anota para que SLT-176 lo cierre.
- **m3 · menor** · `specs/…/requirements.md:266`. T7 sigue `[ ]`: falta la línea del log de `gate-completo` con los dos sql-real ejecutados, no saltados. Se anota al abrir el PR; no bloquea el review.
- **m4 · menor** · R673, rama «falta un catálogo». No hay un test propio que lo ejerza. Descansa en que `crearFksDeOrden`/`crearUsuarioDePrueba` y el `findFirst` de `en_reparto` lanzan con mensaje, que es lo que pide el spec. Basta con que el archivo no dé `passed`.
- **m5 · menor (incidencia de entorno)**. Al construir la URL de la desechable, mi primer script no quitó las comillas simples del `.env`, y el error de Node imprimió la URL de la base local en la salida de mi herramienta. No llegó a ningún archivo del repo. Le pasó lo mismo al implementer (`impl_SLT-175.md:149-155`). Conviene rotar la contraseña de Postgres local y que los scripts de URL lleven `try/catch` sin eco desde el primer intento.

## Veredicto

**OK.**
