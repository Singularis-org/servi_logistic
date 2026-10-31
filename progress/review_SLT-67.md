# review SLT-67 «Montos sin «.00» cuando el número es cerrado (campo compartido)»

Rama `feature/SLT-67-montos-sin-decimales-cerrados`, diff `origin/dev...1516726`. Feature SIN SDD (decisión
del humano): los criterios C1-C5 de `progress/impl_SLT-67.md` sustituyen a los `R<n>`.

## Checklist
- [x] Trazabilidad: C1-C5 mapean a tests reales (`tests/unit/config/moneda-para-campo.test.ts`,
  `tests/components/MontoInput.test.tsx`, `tests/components/PlanForm.test.tsx`), ninguno vacío.
- [n/a] specs/ y tasks.md: sin SDD por decisión del humano (`progress/features/SLT-67.md > Decisiones`).
  `## Lo que ya existe`: no hay design.md; el diff reutiliza `FORMA_DECIMAL`, `partirSinSigno`, `esCero`,
  `ESCALA` de `lib/config/moneda.ts` y la primitiva `components/ui/input`; no re-crea nada.
- [x] Importes sin float: `montoParaCampo` es solo string; no hay `Number(`/`parseFloat(`/`toFixed(`.
  Test de barrido + guardia `dinero-centimos-cuando-existen` en verde.
- [x] Coherencia con `formatMontoString`/`montoExacto`: misma regla (la cola solo cuando existe, mínimo 2),
  pero sin símbolo ni miles ni redondeo, porque es el valor de un input que vuelve a la action. Justificado
  en el comentario.
- [x] Servidor: «10» en vez de «10.00» pasa `montoCobroSchema` (`^\d{1,10}(\.\d{1,2})?$`), Prisma lo guarda
  igual en `DECIMAL(12,2)`, y `diferenciasDelPlan` compara con `importeCanonico` (no hay rastro falso).
  `planCambioProgramado.version` (JSON) puede guardar «10»; antes también podía (el usuario ya podía teclear
  «10»), y `textoDelPrecio` lo pinta tal cual. No es regresión.
- [x] Casos borde de la util: vacío/blancos, «500.», «.5», «-», «500,50», negativos y «-0.00», más de 2
  decimales sin redondeo, importes que un number no representa. Ceros a la izquierda: ver menor 2.
- [x] Campo: con foco muestra lo tecleado tal cual (test «500.» y «500.5»); normaliza en focus/blur y
  entrega string por `onChange`.
- [x] Accesibilidad: `type="text"`, `inputMode="decimal"`, reenvía `id`/`aria-*` que `FormField` clona
  (test). Mismo `Input` de `components/ui`, mismo focus ring que antes.
- [x] Carpeta: `components/shared/MontoInput.tsx` (compuesto sobre primitiva ui). Ver menor 1.
- [x] Sin dependencias nuevas (no toca `package.json` ni el lockfile).
- [x] Sin literales de país/moneda, sin Ordenex, sin tablas/migraciones/queries.
- [x] Comentarios explican el porqué.
- [x] Lint de los 6 archivos tocados: exit 0.
- [ ] Typecheck: NO corrido por mí (memoria escasa, instrucción del leader); el implementer reporta
  `tsc --noEmit` sin errores. Lo cubre `gate-completo` en CI.
- [ ] `./init.sh`, suite completa y E2E: no corridos (instrucción del leader); los corre el CI.
  `e2e/planes-superadmin.spec.ts` no espera «.00» en inputs de monto (verificado por lectura en la bitácora).

## Verificación ejecutada (binarios del worktree)
- `vitest run` moneda-para-campo, MontoInput, PlanForm, guardia dinero-centimos, `tests/unit/planes` →
  7 files, 125 tests passed.
- `vitest run tests/unit/guards` → 228/229 files; el único rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` (4 tests), listado en `tests/baseline-rojos.json`:
  deuda ajena, no es hallazgo.
- Nota para quien repita: correr vitest con el binario del checkout principal desde el worktree da
  «Invalid Chai property: toHaveValue» en los tests de componente (dos copias de vitest/chai: el worktree
  ya tiene su `node_modules`). Con `./node_modules/.bin/vitest` del worktree pasan.

## Hallazgos
### Bloqueantes
Ninguno.

### Menores
1. `docs/architecture.md > Regla: sin sobre-ingenieria` pide promover a `shared/` cuando DOS features lo
   usan; `MontoInput` tiene un solo uso (PlanForm). Lo cubre la decisión explícita del humano (pieza
   reutilizable para futuros formularios), y los candidatos están listados en la bitácora. Conviene dejar
   la migración de esos candidatos como deuda en `## Cierre`.
2. Ceros a la izquierda: `montoParaCampo("0500.00")` da `"0500"` (no los quita, a diferencia de
   `importeCanonico`). Es coherente con «no reescribir lo que no se pidió» y el schema lo acepta, pero no
   hay test que fije ese comportamiento.
3. Con más de 2 decimales significativos («500.505») el campo los conserva y el schema lo rechaza con su
   mensaje; es la decisión registrada (no redondear), solo se anota que el usuario verá el error al guardar.

## Veredicto
OK
