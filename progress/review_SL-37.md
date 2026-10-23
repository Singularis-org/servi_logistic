# Review SL-37 «Rastreo público: fecha UTC con «GMT+00:00»»

> Reviewer · 2026-10-23 · diff `origin/dev...e3491e7` (PR #2 a `dev`) · CI `gate-completo` verde (run 39906203008)

## Checklist

### Especificación (CHECKPOINTS.md)
- [x] `requirements.md` con R1, R2 en EARS.
- [ ] `design.md` con al menos una alternativa descartada y su porqué: **no tiene ninguna**.
- [x] `tasks.md` existe y T1, T2 están `[x]`.
- [ ] `design.md` abre con `## Lo que ya existe`: **la sección no existe** (spec del 2026-10-22, entra en la regla desde 2026-10-06). `requirements.md` dice «no hay spec previo en `specs/` sobre este desfase», pero eso no sustituye la sección (`docs/specs.md:42`: términos buscados, qué apareció y qué se reutiliza).
- [ ] `tasks.md > ## Archivos esperados` (`docs/specs.md:95`): falta.

### Trazabilidad
- [x] R1 -> `rastreo-publico-service.test.ts > SL-37 R1` («», «GMT», «GMT+00:00»).
- [x] R2 -> `rastreo-publico-service.test.ts > SL-37 R2` (−06:00, +05:30, −03:00).
- [x] `progress/impl_SL-37.md` tiene el mapa R -> test.

### Mutaciones (corridas por el reviewer, una a una, restauradas con `git checkout`)
| Mutación en `normalizarDesfase` / `formatearEnZona` | Resultado |
|---|---|
| quitar `\|\| desfase === "+00:00"` | muere: «GMT+00:00» -> Z |
| quitar `\|\| desfase === "-00:00"` | **sobrevive: 29/29 verde** |
| quitar `desfase === "" \|\|` | muere: «» -> Z, «GMT» -> Z, R19 |
| quitar `.replace("GMT", "")` | muere: R1, R2 y los de fechas |
| `formatearEnZona` deja de llamar a `normalizarDesfase` | muere: R19 «la zona sale de la CONFIGURACION» |

Base: `Tests 29 passed (29)`. Árbol limpio al terminar.

### Calidad de código
- [x] Lint de los dos archivos: 0 errores (3 warnings preexistentes en líneas 48-52, fuera del diff).
- [x] Typecheck (`tsc --noEmit -p .`): no dio ningún error.
- [x] `gate-completo` verde en CI (dato del leader, run 39906203008).
- [ ] Flujo crítico «Rastreo público» (`docs/checkpoints-proyecto.md > Flujos críticos`): el diff cambia la fecha que muestra el rastreo público. Existe `e2e/rastreo-publico.spec.ts`, pero su salida local no está en `progress/impl_SL-37.md` (lo exige CHECKPOINTS.md).
- [x] Sin dependencias nuevas.

### Baseline
- [x] Comparado `tests/baseline-rojos.json` de `origin/dev` con HEAD, clave por clave: quitada **solo** `tests/unit/services/rastreo-publico-service.test.ts`; añadidas: ninguna. JSON válido.

### Datos, seguridad, arquitectura, reglas del reviewer (perfil)
- [x] Sin tablas, queries, migraciones ni RLS en el diff.
- [x] Sin literales de país/moneda, sin recursos de Ordenex, sin secretos ni `console.log`.
- [x] La lógica sigue en `lib/services/`.
- [x] Comentarios explican el porqué (versión de Node que cambia la salida de `Intl`).

## Hallazgos

1. **BLOQUEANTE** — `design.md` no abre con `## Lo que ya existe` (CHECKPOINTS.md > Especificación; `docs/specs.md:42`: sección ausente = bloqueante). Falta: los términos buscados (p. ej. `timeZoneName`, `longOffset`, `formatearEnZona`, otros formateadores de fecha con `Intl` en `lib/`), lo que apareció y qué se reutiliza, o «Buscado `<términos>`: nada».
2. **BLOQUEANTE** — `design.md` no tiene ninguna alternativa descartada con su porqué (CHECKPOINTS.md > Especificación). Candidatas obvias: comparar con `Date#toISOString`/`timeZoneName: "shortOffset"`, o fijar la versión de Node en CI.
3. **BLOQUEANTE** — la rama `"-00:00"` de `normalizarDesfase` no la vigila ningún test: quitarla deja la suite en verde. Además R1 solo nombra «», «GMT» y «GMT+00:00», así que el código hace algo que el spec no pide. Arreglo: o se añade «GMT-00:00» a R1 y al `it.each` de R1, o se quita la rama del código. El leader pidió que «-00:00» dé Z, así que lo coherente es lo primero.
4. **BLOQUEANTE** — flujo crítico «Rastreo público»: falta en `progress/impl_SL-37.md` la salida local de `e2e/rastreo-publico.spec.ts` (CHECKPOINTS.md > Calidad de código). Se arregla corriendo ese spec y pegando su salida; no hace falta un E2E nuevo, porque el cambio de formato ya lo prueba la unidad sin depender de Node.
5. **menor** — `tasks.md` no tiene `## Archivos esperados` (`docs/specs.md:95`). Son dos archivos; hay que añadirlo.
6. **menor** — el título de `impl_SL-37.md` dice «Implementado por el implementer directamente (cambio de una línea, permitido por el leader)». El diff toca 7 archivos. El texto confunde, pero no cambia nada.

## Veredicto

**RECHAZADO** — 1, 2 y 4 son de spec y bitácora; 3 es un test que falta. El arreglo del código en sí es correcto: las mutaciones de «», «GMT» y «GMT+00:00» mueren, y del baseline solo se quitó la entrada de rastreo-publico-service.

## Revisión 2 (acotada a 4b38174..cae1aa9)

> 2026-10-23. Head `cae1aa9`; CI `gate-completo` success en el run 39910096497 (dato del leader).
> El diff de esta vuelta toca `design.md`, `requirements.md`, `tasks.md`, `impl_SL-37.md`, el
> comentario de `normalizarDesfase` y el `it.each` de R1. La lógica del servicio no cambia.

| # | Hallazgo de la vuelta 1 | Estado |
|---|---|---|
| 1 | `design.md` sin `## Lo que ya existe` | **Resuelto.** Abre con la sección: los términos buscados (`longOffset`, `timeZoneName`, `formatearEnZona`, `Intl.DateTimeFormat`, `toISOString`, `rastreo`), lo que apareció (`formatearEnZona` de 229 se reutiliza; `hora-cr.ts`/`separador-dia-cr.ts` no se tocan) y la suite existente se amplía. El diff no re-crea nada de esa lista. |
| 2 | Sin alternativa descartada | **Resuelto.** Tres alternativas, cada una con su porqué: fijar Node en CI, `toISOString` para UTC y `shortOffset`. |
| 3 | La rama `-00:00` sin test | **Resuelto.** R1 nombra «GMT-00:00» y el `it.each` de R1 la incluye. Lo comprobé yo: la base da 30/30. Quitar `\|\| desfase === "-00:00"` **muere** (1 failed, «GMT-00:00» -> Z). Quitar `\|\| desfase === "+00:00"` sigue muriendo (1 failed). El árbol queda limpio. |
| 4 | Faltaba la salida del E2E del flujo crítico | **Resuelto.** `impl_SL-37.md` trae dos corridas de `e2e/rastreo-publico.spec.ts`. La primera, sobre la base local sin la guía 1001: 1 failed, explicado. La segunda, sobre la base desechable `sl37_e2e` (migrate deploy, seed de catálogos y una orden sintética con guía 1001 y teléfono ficticio): **2 passed**, `E2E_EXIT=0`, y la base se borró después. No lo re-ejecuté: necesita una base propia, y la evidencia es concreta y coherente con el spec. |
| 5 (menor) | `tasks.md` sin `## Archivos esperados` | **Resuelto.** Ver el menor nuevo A. |
| 6 (menor) | El texto «cambio de una línea» | **Resuelto.** La bitácora describe ahora el diff real (7 archivos más el review). |

**La orden de prueba del E2E no la crea ningún seed versionado.** El diff `origin/dev...cae1aa9`
toca 8 archivos y ninguno es seed, migración ni script. Busqué `1001` y `8899` en los seeds
versionados (`db/migrations/*seed*`, `scripts/seed-*.ts`) y no aparecen. `1001` solo sale en
comentarios de `db/migrations/20260825160000_orden_num_remision_unico_por_tienda` y
`db/schema.prisma`, y ninguno de los dos crea datos. `scripts/seed-catalogos.ts` solo siembra
catálogos (estatus de orden), no órdenes. Cumple «sin seeds salvo superadmin».

Typecheck y lint siguen como en la vuelta 1: esta vuelta no cambia código ejecutable, solo un
comentario y un literal del test. El gate local que reporta la bitácora da `INIT_EXIT=0`.

### Hallazgos nuevos
- A. **menor** — `tasks.md > ## Archivos esperados` lista 2 rutas, y el diff también toca `tests/baseline-rojos.json` (la entrada que se retira). Conviene añadirla. No bloquea.
- B. **menor** — la orden sintética de la segunda corrida del E2E se creó a mano y no queda una forma de reproducirla. Es lo correcto (no hay seeds de datos de negocio), pero quien vuelva a correr el E2E tendrá que reconstruir la PRECONDITION. No bloquea.

### Veredicto Revisión 2: **OK**
Los 4 bloqueantes y los 2 menores de la vuelta 1 están resueltos. Solo quedan los menores A y B.
