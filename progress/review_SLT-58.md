# Review SLT-58 «Planes: gestión del superadmin y consumo de la empresa (UI)»

Rango revisado: `origin/dev...a5bbc05` (35 commits, 77 archivos). Reviewer, 2026-10-30.

## Verificación ejecutada

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | verde |
| `pnpm run lint` | 0 errores (230 warnings ajenos al diff) |
| vitest: 17 archivos unit/components/páginas de la feature (+ `planes-service.test.ts` de SL-24) | 17/17, 476 tests verdes |
| `pnpm run test:guardias` | 318 verdes; 1 rojo: `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json` y no toca nada del diff. No es un hallazgo |
| Integración de base (`plan-de-la-empresa`, `plan-ciclo-corto`, `migracion-ciclo-elegido-ida-y-vuelta`, `planes-asignacion-inicio-ciclo`, `mi-plan-repository`, `planes-lecturas-plataforma`) | **Skipped en local, sin base** (5 de 6 archivos, 49 tests). Los confirma `gate-completo` en CI |
| E2E | No se corrió (instrucción del leader). Revisé el código: `e2e/planes-superadmin.spec.ts:295` comprueba `estado === 404` |
| `package.json` / `pnpm-lock.yaml` | sin diff (R27) |

## Checklist

### CHECKPOINTS.md
- [x] requirements.md con EARS R1–R42.
- [x] design.md con alternativas descartadas (§9).
- [x] tasks.md: 81 `[x]`, ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`. El diff reutiliza `usoDe`, `lineasDeCambioDelPlan`/`diferenciasDelPlan`, `textoDelPrecio` e `inicioDelCiclo`, y no re-crea nada de esa lista.
- [x] Mapa R→test en `progress/impl_SLT-58.md` (consolidado R1–R28 y enmienda R29–R42 + R8).
- [x] Typecheck y lint.
- [ ] `gate-completo` en CI: pendiente del PR.
- [x] Flujo crítico: el diff toca datos de negocio (el uso de órdenes que cuentan los triggers). Hay un E2E propio (`planes-superadmin`) y su salida está en impl. El humo de dos empresas está anotado en la bitácora (rojo en /wallet por carga, fuera del diff; contexto conocido).
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni configuración hardcodeada.
- [ ] `./init.sh` rápido en verde: la 2ª corrida local no terminó por memoria y el humano aceptó que lo confirme CI.

### docs/checkpoints-proyecto.md
- [x] Sin tabla nueva. La columna `organizacion.plan_ciclo_corto_desde_at` hereda la protección de `organizacion` (solo lectura para `servi_app`).
- [x] Queries nuevas:
  - «Mi plan» va por `plan_de_la_empresa`, `SECURITY DEFINER` y acotada a `app.organizacion_id`: rechaza con `42501` otra empresa y el caso sin contexto (R9, con test de dos empresas).
  - Las lecturas del superadmin van en `comoPlataforma` y están declaradas en `EXCEPCIONES_DE_PLATAFORMA` (motivo ampliado en `lib/db/excepciones-aislamiento.ts`).
  - `planDeEmpresa` filtra `historialAccion` por `organizacionId` explícito.
- [x] Migraciones:
  - Las dos son nuevas en esta rama (`20261029120000`, `20261029150000`); ninguna migración mergeada se edita.
  - Las dos traen `down.sql`. El de `20261029150000` restaura los tres cuerpos con `CREATE OR REPLACE` y hace DROP de la función, el CHECK y la columna, en orden inverso.
- [x] Sin recursos de Ordenex, sin `console.log` de PII ni literales de país o moneda en el código nuevo (grep sobre el diff de `app/ lib/ components/ db/`).
- [x] Capas: la lógica en `MiPlanService`/`PlanesService`, el acceso a datos en los repositorios y la action nueva (`previsualizarAsignacionPlanAction`) en `lib/actions/planes.ts`. zod en el borde (`asignarPlanSchema.inicioCiclo`, `previsualizarAsignacionSchema`, `planIdSchema`).
- [x] Permisos en el servidor:
  - `MiPlanService.ver` responde `forbidden` antes del repositorio con `ROLES_MI_PLAN`, la misma constante que lee el menú.
  - Las lecturas y la vista previa de `PlanesService` empiezan por `esSuperadmin`.
  - Las páginas hacen `notFound()` con lo que responde el servicio.
- [x] «Mi plan» va al núcleo (`lib/modulos/reparto.ts`), así que no le hace falta una puerta de módulo.

### Puntos concretos que pidió el leader
- [x] **R8, 404 real:** `/mi-plan` no tiene `loading.tsx` (decisión humana, no es un hallazgo) y la página llama a `notFound()` cuando el servicio no responde `ok`. El E2E exige `status() === 404`.
- [x] **Migración `20261029150000` y paridad (R35):**
  - `plan_inicio_ciclo_en_curso` (antes del ancla da `COALESCE(corto, ancla)`; si no, `plan_inicio_ciclo`) coincide con `inicioDelCicloEnCurso`/`inicioDelSiguienteCiclo` de `lib/planes/ciclo.ts`.
  - La tabla común es `tests/integration/db/_fixtures/ciclo-corto.ts`: ancla futura, pasada y de hoy; ±1 min y 1 ms; ancla el 31; caso sin corto guardado. La rama TS está verde en `ciclo-plan.test.ts`.
  - El CHECK `corto < ancla` se respeta en el `UPDATE` de `asignar`: una sola sentencia con el mismo `now()`.
  - Las empresas que ya tienen plan quedan con la columna NULL y ancla pasada, así que su ciclo es idéntico al de antes (R41).
- [x] **Autorización y RLS:**
  - El rol de la app no lee las tablas de planes; R9 tiene test.
  - No hay SQL a mano por empresa: todo pasa por la función acotada o por `comoPlataforma` declarado.
  - `AsyncLocalStorage` aísla los `comoPlataforma` concurrentes del `Promise.all` del detalle de la empresa.
- [x] **Excepción R25:**
  - De los tests de SL-24 solo cambia `tests/unit/services/planes-service.test.ts`: +5 líneas, cuatro `vi.fn` y un comentario, sin tocar aserciones.
  - Ningún `tests/integration/db/plan*.test.ts` de SL-24 cambia.
  - Las otras ediciones de tests existentes (menú, Sidebar, guardias de PWA y de superadmin, E2E de arranque) actualizan listas por los ítems nuevos «Mi plan» y «Planes», y no son de SL-24.
  - P14: sin fecha, `asignar` llama al repositorio con tres argumentos y sigue rechazando con `tope_excedido`.
- [x] **Sin dependencias nuevas.**

## Hallazgos

### BLOQUEANTES
Ninguno.

### menores
1. **menor — La decisión de R25 dice tres `vi.fn` y hay cuatro.**
   - `requirements.md > Decisiones cerradas`, fila «¿Se puede tocar `planes-service.test.ts` (R25)?», habla de tres `vi.fn` (`catalogo`, `detalle`, `planDeEmpresa`).
   - El diff añade también `vistaPreviaAsignacion`. Está documentado en `tasks.md` T14 y en `progress/impl_SLT-58.md:320` (precedente de la misma decisión) y es igual de mecánico, pero la fila de la decisión no se actualizó.
   - Arreglo: que el leader o el spec_author añadan la cuarta a la fila, o una nota de la enmienda.
2. **menor — Dos relojes en la primera asignación con fecha.**
   - «Hoy», el rango (R30) y el ancla de una fecha que no es hoy salen del reloj del servicio (`anclaDeLaFechaElegida`). El ancla «ahora» y la decisión «¿ciclo corto?» (`CASE WHEN ancla > now()`) salen de `now()` de la base.
   - Con relojes alineados no cambia nada. Con desfase, cerca de la medianoche de la plataforma, una fecha que el servicio ve como «mañana» podría guardarse con un ancla ya pasada para la base. Sería un ciclo mensual sin ciclo corto, y el CHECK no salta porque `corto` queda NULL.
   - Sin test y sin impacto práctico esperable. Solo se anota.
3. **menor — Los tests de integración de base no se verificaron aquí.**
   - Saltaron por falta de base local.
   - De su verde en `gate-completo` dependen R2, R9, R25 (STABLE), R26, R31–R36, R39, R41 y R42. Los archivos existen y sus casos coinciden con los «Test previsto».

### Sobre el 404 aislado en `/plataforma/empresas/<A>` (contexto conocido)
No veo una causa en el diff. En esa página, `notFound()` solo se alcanza por dos caminos, y los dos existían antes:
- `resolveActorFromSession()` devuelve `null` o un rol que no es de plataforma.
- `verModulosEmpresa` responde distinto de `ok` (`not_found` o `validation_error`).

Las lecturas nuevas (`leerPlan`, `leerAsignables`, `leerPlanActual`) capturan su error y devuelven `null`, así que no producen un 404. Lo único que añade el diff es más presión sobre el pool de la base en esa página: tres lecturas en paralelo, una de ellas en `$transaction`, más una secuencial. Esto puede volver más lenta la resolución de la sesión bajo carga, pero no convierte un error en 404. Si se repite, el sitio donde mirar es la búsqueda de la sesión en `lib/auth/resolve-actor.ts:27` (sesión no encontrada da `null`).

## Trazabilidad (muestreo verificado)
Todas las R1–R42 tienen al menos un test concreto en el mapa de impl, y los archivos existen. Comprobé en verde los de unit, componentes y páginas:
- **R1–R7:** `consumo.test.ts`, `ciclo-plan.test.ts`, `MiPlanModule`, `mi-plan-service`.
- **R8:** `mi-plan-service` (siete roles, cero llamadas), `mi-plan-page` y el E2E con 404.
- **R10–R12:** `menu-mi-plan`.
- **R13–R24:** los componentes del superadmin, `planes-service-lecturas` y las páginas `plataforma-*`. R24 por la guardia `superficie-de-uso`, con 0 `@sin-superficie`.
- **R29, R30, R36, R37 y R42 (rama de servicio):** `planes-service-inicio-ciclo`.
- **R37 y R38:** `PlanEmpresa.test.tsx`.
- **R40:** `consumo.test.ts`.
- **R27:** diff vacío de `package.json`.
- Las ramas de base de R2, R9, R25, R26, R31–R36, R39, R41 y R42 están en los archivos de integración citados, que no pude ejecutar (menor 3).

## Veredicto

**OK** (sin bloqueantes). Antes del merge: `gate-completo` verde en CI, que incluye la integración de base no verificada aquí, y la fila de la decisión R25 corregida (menor 1).
