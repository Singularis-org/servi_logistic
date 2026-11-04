# review SLT-76 «Deuda de los hotfix SLT-73 y SLT-75» (HOTFIX a prod)

Revisión de `git diff origin/prod...HEAD` en `c6c0ca37`, rama `hotfix/SLT-76-deuda-hotfix-73-75`.
Base local `servi_slt76_mig`, con el envoltorio `conbaseslt76.sh` y `SLT76_DB`. Prisma se regeneró
antes de correr. Nunca se usó prod. El MCP del grafo no tiene indexado este worktree: todo se hizo
con Grep/Read.

## Checklist

- [x] **Trazabilidad R1–R21.** Cada R tiene un test que muerde. Lo comprobé con el mapa de
  `impl_SLT-76.md`, leyendo los tests de los bloques 6 y 9 y con mutaciones propias (abajo).
- [~] **Tasks.** T1–T9 están en `[x]`. Siguen abiertos T0 (verificación en prod con Carlos) y T10
  (PR, CI, deudas en `dev`), que son del leader. Ver m3.
- [x] **`## Lo que ya existe`** existe y tiene contenido. El diff no re-crea nada de su lista. R21
  no entra en esa búsqueda: ver m1.
- [x] **Migraciones.** Las dos nuevas traen `down.sql`. Ningún `migration.sql` que ya estaba cambia:
  `--name-status` sobre `db/` da solo `M` en los dos `down.sql` (SLT-73 y SLT-75), `M` en
  `schema.prisma` y `A` en las nuevas. Prisma solo hace checksum del `migration.sql`. Los `down.sql`
  se editan a propósito (§9.2, R18/R19).
- [x] **Sin drift.** `prisma migrate status`: «276 migrations found… Database schema is up to date!».
  `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma`: «-- This is an empty
  migration.»
- [x] typecheck: `TC_EXIT=0`. lint: `LINT_EXIT=0` (232 avisos, 0 errores, todos ya existentes).
- [x] **Tests de integración del diff:** 13 archivos, `Test Files 13 passed (13)` ·
  `Tests 118 passed (118)`, sin skipped.
- [x] **Unitarios, componentes y guardias del diff** (incluido todo `tests/unit/descarga` y la
  guardia `columnas-sensibles`): `Test Files 56 passed (56)` · `Tests 725 passed (725)`.
- [x] **Gate v2.** Leído en `gate_SLT-76_v2.log`: `INIT_EXIT=0`, 488/488 archivos y 320/320
  guardias. E2E: 30 passed según la bitácora (no lo repetí).
- [x] **Baseline.** Ningún test del bloque 7 ni de SLT-76 está en `tests/baseline-rojos.json`, y el
  diff no toca ese archivo.
- [x] **Reglas del reviewer** (`perfil-agentes.md`):
  - sin tabla nueva ni query de negocio sin empresa: el predicado y el historial usan el cliente de
    la petición o la `tx`;
  - sin literales de país o moneda en el código nuevo (grep de las líneas añadidas fuera de
    comentarios: 0);
  - sin Ordenex y sin dependencias nuevas;
  - los comentarios explican el porqué.

## Lo que se miró con lupa

**Bloque 9 (`20261102090100`)**
- La migración es un solo `DO`: dos `DROP TABLE IF EXISTS` y `DROP SCHEMA` sin CASCADE, dentro de un
  sub-bloque que atrapa `2BP01`. No toca `public`.
- El `down.sql` de SLT-73 lanza `RAISE EXCEPTION` como primera sentencia del `DO`, antes de cualquier
  `INSERT`, y el mensaje nombra SLT-76 y dice «no se pueden devolver».
- El de SLT-75 mete el `INSERT` y el `DROP` dentro del `IF`, y en el `ELSE` deja un `NOTICE` con
  «SLT-76».
- El `down.sql` de SLT-76 solo deja un `NOTICE`: no recrea nada y dice por escrito que los datos «no
  se recuperan».
- Orden de las bajadas: 090100 (no-op) → 090000 → SLT-75 (`NOTICE`) → SLT-73 (falla). Así una bajada
  completa se para en SLT-73 antes de dejar los libros sin asientos. Correcto.

**Bloque 6**
- El enum se añade solo, en una migración sin uso del valor.
- El `down.sql` copia la función dinámica de SL-23 (como `_slt76`) y borra antes las filas de la
  acción.
- `ZonaRepository.update` escribe con `tx`, con una fila por distrito y un lote propio, y recorta a
  60 con `valorDeCatalogo`. Si la lista de distritos no cambia, no escribe nada.

**Bloques 2 y 3**
- `consolidacionesConDinero` es la única fuente. La usan `revertirConciliacion` (dentro de la tx,
  antes de escribir) y las dos superficies (`desmarcable = conciliado && !conDinero.has(id)`). El
  botón lee `marca.desmarcable`.
- Los ajustes cuentan.

**Bloques 1 y R21**
- `fecha()` y `CierreDiaModule` usan `fechaCalendarioCR`.
- La guardia queda sin excepciones.
- Las 7 columnas usan `diaCR`, pero repetido en 4 archivos: ver m2.

**Bloque 7**
- El lock de aviso y `LOCK TABLE usuario` se toman antes del primer DDL, y el test lo comprueba.
- `rechazoPorRestrict` solo se aplica a los 3 casos con hijos. `distritoAOtroPais` y
  `padreInexistente` siguen exigiendo `23503`. El CI usa `postgres:17` (`gate.yml:123,318`), y la
  función acepta los dos códigos.
- R14 tiene un corpus decisivo.
- R15 filtra por el país de la empresa y ordena por `id`.
- Que D32 desaparece solo lo prueba el CI.

## Mutaciones del reviewer

Script en `scratchpad/rv_mut.sh`. En cada una: grep = 1 con la mutación, rojo; revertida con
`git checkout`, grep = 0, verde. El árbol quedó limpio al final.

| # | Mutación | Rojo | Verde |
|---|---|---|---|
| M1 | down SLT-73: `RAISE EXCEPTION` → `RAISE NOTICE` | `1 failed \| 8 passed (9)` | `9 passed (9)` |
| M1b | down SLT-76 recrea `respaldo.slt73_asientos` vacía | `2 failed \| 7 passed (9)` | `9 passed (9)` |
| M2 | `SaldosSatelitesRepository`: `desmarcable` ignora `conDinero` | `1 failed \| 1 passed (2)` | `2 passed (2)` |
| M2b | `CierreBodegaRepository`: lo mismo | `1 failed \| 1 passed (2)` | `2 passed (2)` |
| M3 | el predicado ignora los ajustes (revertir con ajuste) | `1 failed (1)` | `1 passed (1)` |
| M3b | `ConciliacionAcciones` ignora `marca.desmarcable` | `2 failed \| 4 passed (6)` | `6 passed (6)` |
| M4 | R21: `fechaSolicitud` de bodega vuelve a `fechaDiaISO` | `2 failed \| 18 passed (20)` | `20 passed (20)` |
| M4b | R21: `fechaCierre` de la fundida vuelve a `fechaDiaISO` | `1 failed \| 36 passed (37)` | `37 passed (37)` |
| M5 | R9: el texto del distrito sin `valorDeCatalogo` (sin recorte a 60) | `1 failed \| 3 passed (4)` | `4 passed (4)` |

## Hallazgos

No hay bloqueantes.

- **m1 · menor — R21 no tiene design ni tasks.** La enmienda solo está en `requirements.md`, y además
  quedó bajo el título «Bloque 2» (`specs/SLT-76-deuda-hotfix-73-75/requirements.md:52`), no en el
  bloque 1. `design.md` y `tasks.md` no la nombran, así que la búsqueda de «Lo que ya existe» no la
  cubrió. Por eso se pasó por alto `lib/utils/fecha-dia-iso.ts > fechaDiaMovimientoCR`, el
  precedente directo (ver m2). Arreglo: una línea en `design.md §1` y una task cerrada en `tasks.md`,
  y mover R21 al bloque 1.
- **m2 · menor — `diaCR` copiado en 4 archivos.** Está en:
  - `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts:44`
  - `app/(app)/cierres-admin/_components/cierres-admin-descarga-columnas.ts:37`
  - `app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas.ts:48`
  - `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts:153`

  **Centralizarlo es viable.** La guardia `columnas-sensibles` (`tests/unit/descarga/columnas-sensibles.guardia.test.ts`)
  solo descubre y sondea los módulos `*-descarga-columnas.ts`, así que una función exportada desde
  `lib/utils/fecha-dia-iso.ts` no entra en su sondeo. De hecho ese archivo ya exporta
  `fechaDiaMovimientoCR` por el mismo motivo: la sonda cae a `fechaDiaISO`.

  `fechaDiaMovimientoCR` no sirve tal cual: trata la medianoche UTC exacta como fecha `@db.Date`, y
  un `solicitadoAt` a las `00:00:00.000Z` saldría con el día UTC. Lo que hace falta es un hermano en
  ese archivo, por ejemplo `fechaDiaCR(valor)` con `String(valor)` y `DIA_ISO`, como su vecino, que
  los 4 archivos importen. Ya importan `fechaDiaISO` de ahí.

  El comportamiento de hoy es correcto (M4/M4b lo matan). Se recomienda hacerlo en esta misma
  ficha, por el «no dejemos deuda».
- **m3 · menor — Tasks de T10 sin marcar.** `tasks.md:144-145` (mapa R→test e `init.sh` en verde)
  ya están hechos según la bitácora y el log, pero siguen en `[ ]`. Además, el mapa dice «R1-R20» y
  ya incluye R21.
- **m4 · menor (proceso, del leader) — T0 es irreversible.** T0 (`tasks.md:18-26`: conteos de los
  respaldos en prod y el OK de Carlos de que SLT-73 y SLT-75 quedaron bien) es condición del bloque 9,
  que no se puede deshacer. No es un hallazgo sobre el código, pero el PR no debe mergearse sin que
  esté escrito en él.
- **m5 · menor — Comentario impreciso.** `20261102090000_slt76_historial_zona_distrito/down.sql` dice
  que la función es la de SL-23 «TAL CUAL, renombrada». Es correcto (una función `pg_temp` no se
  comparte entre archivos), pero no la reutiliza: la copia. No hay que hacer nada.
- **m6 · menor — D32 sin confirmar.** D32 solo se confirma en el CI: el 40P01 no se reproducía en
  local. El test comprueba los dos locks (mutaciones T7.1a/b de la bitácora), pero que desaparezca
  el deadlock lo dirá `gate-completo` sin relanzar.

## Veredicto

**OK**

Los menores m1–m3 se pueden cerrar en esta rama antes del PR; m2 es el único que toca código. m4 y
m6 son condiciones del PR y del CI, del leader.
