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
