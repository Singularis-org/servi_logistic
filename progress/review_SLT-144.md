# review SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — vuelta 1

Rama `feature/SLT-144-planes-form-pasos-borrador` @ `62bf4566`, diff contra `origin/dev`. Ruta completa (requirements,
design, tasks). PR #209.

## Checklist

- [x] Ruta: completa. Toca autorización (lecturas de superadmin) y es complejidad high: la ruta es la que toca.
- [x] Trazabilidad R1–R30: cada R tiene un test con su nombre y aserciones reales (revisados los nombres y el cuerpo de
  los de R1, R10, R12, R21, R23 y R28). R21 y R23 son de integración con base (`HAY_BASE_DE_DATOS`): en mi máquina
  se saltan (20 skipped); la bitácora da 33 passed en `servi_logistic_slt144` y los corre `gate-completo`.
- [x] Tasks: ninguna `[ ]` en `tasks.md`.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → AVISO aceptado (64/40 archivos, 1929/1000 líneas de producción,
  2822/3000 de tests), con la línea `tamano-pr-aceptado` en `progress/features/SLT-144.md`. Ver m1.
- [x] `design.md > ## Lo que ya existe`: presente y con contenido; el diff reutiliza `fechaDeRecepcion`,
  `excedidosDe`, `AvisosDeTopes`, `Modal` y mueve `fechaHora`, no re-crea nada.
- [x] Typecheck: `pnpm run typecheck` exit 0 (corrido por mí).
- [x] Lint: no lo corrí en local; job `estatico` del CI en verde sobre el PR.
- [x] Tests corridos por mí (`vitest run --maxWorkers=2`): PlanFormBorrador, FormularioPorPasos,
  PlanFormFechasPorEmpresa, PlanesModule, PlanDetalle, planes-previsualizar-cambio (unit), plan-form-borrador,
  planes.composition-root, plataforma-planes-page, superficie-de-uso.guardia → 10 archivos / 178 passed.
- [ ] `gate-completo` en CI: al revisar, `vitest` (3 shards) y `e2e (dinero)` en curso; `estatico`,
  `e2e (aislamiento)` y `e2e (reparto)` en verde. El merge espera a que termine en verde.
- [x] E2E en local antes del PR (toca pantallas): bitácora T6, Playwright `aislamiento` + `dinero` 40 passed dos
  veces, más `planes-borrador` en `playwright.config.ts`.
- [x] Datos y seguridad: sin tablas, migraciones ni RLS nuevas. Las lecturas nuevas son de plataforma, bajo
  `comoPlataforma("SL-24", …)`, como el resto de planes del superadmin (design §1). Sin literales de país ni
  moneda, sin `console.log`, sin recursos de Ordenex, sin dependencias nuevas.
- [x] Autorización en servidor: `PlanesService.previsualizarCambio` mira `esSuperadmin` antes de zod y del
  repositorio (R22, test); las dos páginas hacen `notFound()` antes de leer borradores (R28, test);
  `verBorradoresDePlanes` pasa por `PlanBorradorService.borradores(actor)`; las cuatro actions del borrador ya
  rechazan por rol (SLT-129 R1).
- [x] Capas: action → service → repositorio con interfaz; zod en el borde (`previsualizarCambioSchema`, `.strict()`).
- [x] Comentarios explican el porqué.

## Puntos pedidos por el leader

- **Restos de `crearPlanAction`/`editarPlanAction`:** `git grep` fuera de `specs/` y `progress/` → 0 apariciones.
  Las páginas pasan las cuatro actions del borrador; `PlanesService.crear/editar` se quedan porque los usa
  `PlanBorradorService.confirmar`. `lib/types/plan-borrador.ts` actualizó su comentario. Decisión humana del
  2026-11-18 anotada en `progress/features/SLT-144.md`. OK.
- **«De inmediato» no tocado (SLT-135 «Planes: sin «De inmediato» al editar un plan»):** `PasoCuandoRige.tsx` solo suma
  20 líneas (`PasoCuandoRigeConFechas` envuelve el paso de hoy y pone `<FechasPorEmpresa>` debajo); los controles
  y el radio «De inmediato» no cambian. El schema nuevo acepta `vigenteDesde: null`. OK.
- **`PasoCuandoRigeConFechas`:** fuera del texto literal de design §5.3 (que decía añadir debajo dentro del paso),
  pero cumple lo mismo y reduce el choque con SLT-135. Aceptable (m3).
- **`?editar=1`:** está en el design (§6, línea 326, y el mapa de archivos). Un plan archivado no lo abre (test
  «R26: un plan archivado no abre la edición…»); sin el parámetro no lee el borrador (test). OK; ver m2.
- **Dobles `vistaPreviaCambio`** en 9 tests de `PlanesService`: una línea por archivo, consecuencia obligada de
  ampliar la interfaz. OK.
- **R17 de SLT-128 `{1,2}` → `{2,3}`** en `planes-cambio-por-empresa.test.ts`: es el efecto que pide R23 (la
  empresa C, que entra en F con la versión del cambio, ahora cuenta). El comentario del test lo explica. OK.
- **Casos de T3.4 ajustados:** `PlanForm.test.tsx` termina en `toBeDisabled()` (design §4.4: tras el `ok` el vuelo
  no se suelta, para que un guardado tardío no abra otro borrador — review m4 de SLT-129) y `PlanFormPeriodicidad`
  R35 partido en dos montajes con las mismas aserciones. El doble `accionesFalsas` valida con los esquemas reales
  de cada paso y arma la petición con el mismo compositor del servidor, así que las aserciones de `enviar` siguen
  midiendo lo de antes. OK.

## Lógica revisada

- `pendienteDelDetalle` (R23): cuenta por empresa con `Set`; las empresas con versión propia del pendiente y sin
  recepción suman a N y a M; las que tienen recepción y versión cuentan una vez; las versiones `noAplicada` quedan
  fuera de `conVersion` y siguen contando por su recepción. `noAplicadasDelDetalle` ya saltaba las no marcadas, así
  que quitar el `where` de `versionesDeEmpresa` no cambia esa lista.
- `vistaPreviaCambio` (R21): mismas empresas (`plan_id = planId`), mismo `excedidosDe`, misma
  `fechaDeRecepcion(tipo, inicioDelDiaPlataforma(F))` que `editar` → `programarCambio`. Solo lee.
- `useBorrador`: un solo vuelo para guardar y confirmar (R4); R10 deja solo los pasos de la respuesta; R11 no
  reabre; R12 lee los ajenos y, si la lectura falla, los deja «Sin guardar».

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1 · Tamaño muy por encima de lo aceptado.** El humano aceptó «~47 archivos y ~1150 líneas de producción»
  (`progress/features/SLT-144.md`); el script mide 64 archivos y 1929 líneas de producción. El marcador hace pasar
  el gate, pero el leader debería decírselo al humano al pedir el merge.
- **m2 · `?editar=1` se queda en la dirección.** `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx:205`
  lo lee solo al montar; tras cerrar el panel, recargar la página lo vuelve a abrir. No rompe nada (sin borrador
  abre el de hoy), pero conviene limpiar el parámetro al cerrar (`router.replace`). Fuera de spec; para una ficha
  aparte o la próxima vuelta si se quiere.
- **m3 · `PasoCuandoRigeConFechas`** (`plan-form/PasoCuandoRige.tsx:80-97`) no figura en design §5.3. Es una forma
  razonable de no tocar los controles que cambia SLT-135; sugiero anotarlo en el design al cerrar.
- **m4 · Línea en blanco doble** en `app/(app)/plataforma/planes/_components/BorradoresDePlanes.tsx:87-88`.
  Cosmético.
- **m5 · R21 y R23 no verificados por mí:** se saltan sin base en esta máquina. Dependen de la bitácora (33 passed) y
  del `gate-completo`.

## Veredicto

**OK** (APROBADO). Sin bloqueantes. El merge sigue esperando a que `gate-completo` termine en verde en el PR #209.
