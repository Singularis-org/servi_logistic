# Revisión SLT-72 «Confirmación física también para las órdenes sin gestionar del cierre»

- Revisor: reviewer (Opus 5.5), 2026-10-31.
- Worktree `.worktrees/SLT-72-hotfix`, rama `hotfix/SLT-72-confirmacion-fisica-sin-gestionar`, HEAD
  `0422dfe7`: 9 commits sobre `origin/prod` (`7a8ce667`), incluido un merge de `origin/prod`.
- Spec vigente: `specs/451-confirmacion-fisica-sin-gestionar/` (R1–R40). Puente:
  `specs/SLT-72-…/requirements.md` (Q1 = (a), Carlos).
- MCP del grafo: no lo usé. Exploré con Grep/Read/git diff, que sobra para un diff de 9 archivos
  de producción.

## Checklist

### Especificación
- [x] requirements EARS R1–R40 (451) + puente SLT-72.
- [x] `design.md` tiene alternativas descartadas (§9 A–F).
- [x] `## Lo que ya existe`: el spec es del 2026-09-21, anterior al corte del 2026-10-06, así que no
  aplica. Su §1, «Qué hay hoy, verificado en el archivo real», hace ese papel. El diff no re-crea nada:
  reusa el punto único, `confirmada_fisica_at` (nombre de la 238), `cierre_sin_gestion` y la ventana.
- [~] Tasks: todas en `[x]` menos **T0.1** (foto de la cola en producción, solo lectura) y **T6.4**
  (aviso a bodega). Las dos son de operación, del leader y del humano. Ver m2.

### Equipo
- [x] Assignee Carlos Restrepo (`progress/features/SLT-72.md`). Rama hotfix desde `prod`.

### Trazabilidad
- [x] `progress/impl_SLT-72.md` tiene el mapa R→test de los 40 R (backend R1–R28 y R37–R40;
  pantalla R19 cliente y R29–R36).
- [x] Muestreé los casos y no son vacíos: R10, R11/R12, R13 (incluida la entrada de otro origen),
  R14, R15, R20/R21/R26 contra SQL real, R23/R40 (migración) y R29–R36 (componente).
  - R24 y R39 se apoyan en suites `[=]`.
  - `confirmacion-sin-lectores` busca por nombre (`NOMBRES = ["confirmadaFisicaAt", …]`), así que
    cubre la columna nueva sin tocarla.
  - `cierres-admin-caja-cod.test.ts`: `git diff --quiet` limpio y verde.

### Calidad de código (lo corrí yo)
- [x] `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `TC_EXIT=0`, 0 `error TS`.
- [x] `eslint` sobre los `.ts/.tsx` del diff → exit 0, 0 errores y 1 warning (el `money` sin uso,
  preexistente).
- [x] `pnpm run test:guardias` → `1 failed | 317 passed`. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`:
  - está en `tests/baseline-rojos.json`;
  - ni ella ni `init.sh` están en el diff;
  - `init.sh` de `origin/prod` ya trae el marcador viejo.

  No es hallazgo.
- [x] Los 24 archivos de test del diff (sin guardias), contra `servi_slt72` → `22 passed`, `462 passed`.
  - Los 2 rojos (`cierre-rechazo-tienda-aprobacion` y `454/caracterizacion/confirmacion-fisica-238`)
    caen en `beforeAll` con «referencia a otra empresa». Están en el baseline y no son hallazgo
    (ver m3).
- [x] Integración nueva y ajustada (`sql-real`, `migration`, `nucleo-sin-modulos`,
  `devolucion-rechazadas-flow`) contra `servi_slt72` → `4 passed`, `32 passed`, 0 skipped.
  - URL por categorías: `local: true`, `slt72: true`, `supabase: false`.
- [x] Gate del implementer: `INIT_EXIT=0` en el log `gate_SLT-72_r2.log`, sobre `b00e6835`.
  `0422dfe7` solo toca `impl_SLT-72.md` y `tasks.md`.
- [ ] **E2E de flujo crítico con salida local en `impl_SLT-72.md`** → **B1**.
- [x] Dependencias nuevas: ninguna.

### Seguridad / configuración
- [x] No hay secretos, literales de país o moneda, `console.log` ni referencias a Ordenex en el diff
  (grep de `sinpe|colon|costa rica|₡|ordenex|console.log` sobre las líneas añadidas en
  `lib app db`: 0).

### Datos y seguridad (proyecto)
- [x] No hay tabla nueva.
  - `cierre_sin_gestion` ya está clasificada en `lib/db/modelos-de-negocio.ts:79`: la extensión
    inyecta `organizacion_id` y hay RLS.
  - La query nueva `findBarridasDelCierre` pasa por esa extensión.
- [~] Test de integración de dos empresas para la query nueva: no hay uno específico. Ver m1.
- [x] Migración `20261031130000_cierre_sin_gestion_confirmacion_fisica`:
  - `ADD COLUMN … TIMESTAMP(3)`, nullable, sin default y sin backfill;
  - `down.sql` con `DROP COLUMN IF EXISTS`;
  - no edita ninguna migración aplicada;
  - sin colisión: la última en `origin/prod` y `origin/dev` es `20261031120000_liberar_recolecciones_recibidas`;
  - el test MIG (11/11) y el round trip `db:rollback`/`deploy` del implementer prueban R23 y R40.

### Arquitectura / permisos
- [x] La lógica vive en el service, el acceso a datos en el repo y la entrada sigue siendo zod en el
  borde (`discriminatedUnion("origen")`, sin default de `origen`).
- [x] Entrada única: `lib/actions/cierres-admin.ts:357` es el único llamador de `service.aprobarCierre`.
  La autorización y el alcance se validan en el servidor.

## Puntos que pidió el leader

1. **Fallo cerrado en servidor.**
   - `validarConfirmacionFisica` corre ANTES de la tx, como exige R16.
   - Lee las dos fuentes siempre y barre los faltantes sobre `porClave` (los dos orígenes).
   - La marca `confirmada_fisica_at` se escribe DENTRO de la tx de `resolverCierre`, con
     `where { cierreId, ordenId IN }` y `count !== length → throw`.
   - Rutas revisadas:
     - **Rechazo** (`rechazarCierre`, ~L1643): no valida ni marca, que es lo que pide R27. Y no
       libera (109/R27).
     - **Válvula/vencido** (`CierresAdminRepository:2552`): solo `estado → solicitado`, sin marca
       (R28), y `ESTADOS_RESOLUBLES = ["solicitado"]` obliga a pasar después por la aprobación normal.
     - **`IncidenteAdminService.resolver`**: aprueba un *incidente*, no un cierre.
     - **`CierresBodegaAdminService`**: es el nivel 2, fuera de alcance.
     - Las otras escrituras de `cierreDia` no transicionan a `aprobado`.
   - No encontré ninguna ruta que libere barridas sin confirmarlas.
   - La rama `sinGestionRegistrado = false`, que libera por mensajero, solo existe en cierres ya
     aprobados (backfill de la 264, citado en el puente).
2. **Migración.** Cumple; ver arriba.
3. **WHERE contra Postgres real: mutaciones mías, todas revertidas.** Copia previa más `cmp` →
   «RESTAURADO» en las tres. `git status -s` vacío al terminar.
   - **M1: quitar `cierreId` del WHERE de `findBarridasDelCierre`.**
     - SQL: `Test Files 2 failed` (el `beforeAll` de `sql-real` cae y deja 6 skipped).
     - REPO: 4 failed.
     - Muerta.
   - **M2: quitar `cierreId` del WHERE del `updateMany` de `cierreSinGestion`.**
     - SQL: `1 failed | 5 passed` («R21: una barrida ajena en la escritura LANZA y revierte…»).
     - Muerta.
   - **M3: quitar el alcance (`cierre: alcanceWhere(alcance)`) del WHERE de `findBarridasDelCierre`.**
     - SQL: **verde**.
     - Solo la matan los unitarios con dobles (REPO «R6: el WHERE…» y «R8: fuera de alcance…»).
     - Ver m1.
4. **Frontend.**
   - `confirmDisabled={faltanPorConfirmar > 0}`, con
     `faltanPorConfirmar = progresoDePaquetes(conjuntoEsperado, …)`.
   - `conjuntoEsperado = filasAConfirmar(grupos, ordenesSinGestion)`, que incluye las barridas
     filtradas por el punto único.
   - En el submit hay un doble candado (`if (faltanPorConfirmar > 0) return`).
   - `pedirAprobacion` abre la ventana también con solo barridas.
   - La guía de la barrida sale de `detalle.ordenesSinGestion`, es decir de `cierre_sin_gestion` (la
     congelada, Q2). El servidor compara contra la misma columna (`findBarridasDelCierre` →
     `numGuia`).
   - No hay puerta de escape (caso R19 del componente).
5. **Diff solo de esta ficha.** Los 44 archivos son de la 451/SLT-72: producción del cierre, sus
   tests, dobles y fixtures obligados por el contrato, spec y progress. No hay nada ajeno.

## Desviaciones declaradas: validadas

1. **Barridas en la misma lista `{ordenId}` + dos `updateMany`.** Aceptada.
   - R39 es requisito y §5.4 es diseño.
   - Comprobé que `caja-cod` sigue sin tocar y verde.
   - Se conserva el `?: never` del rechazo, y el mapeo por `origen` es exhaustivo.
2. **Barridas leídas en cada aprobación.** Aceptada.
   - Sin esa lectura, un cierre solo con barridas y lista vacía aprobaría, y eso viola R10/R17.
   - Cuesta una consulta en paralelo.
   - R18 se mantiene: mismo payload y `return null`.
3. **Entrada `gestion` con el `ordenId` de una barrida → ajena.** Aceptada y necesaria: sin ella el
   mapa por clave dejaría a una entrada cubrir la fila del otro origen. Hay test (R13) y la mutación
   del implementer lo mata.
4. **El test SQL siembra sus propios datos.** Aceptada.
   - Vi caer el andamiaje de la 454 con «referencia a otra empresa», y esas suites están en el baseline.
   - El test no tiene `if (!x) return` y M1/M2 lo ponen rojo.
5. **Rótulo «Novedad interna».** **Coherente.**
   - La guardia `nombres-estado-retirados` prohíbe la frase «sin gestionar»
     (`FRASE`, L79).
   - El detalle del cierre ya nombra esas mismas órdenes con
     `nombreDeEstado("novedad_interna")` (`cierre-factura.tsx:1454-1456`).
   - Falta solo la confirmación de Carlos.
6. **`origen: "gestion"` en las aserciones de la 238.** Aceptada: el literal ES el contrato, el borde
   cambió y rechaza entradas sin `origen`. El caso PREMISA no se tocó.

## Hallazgos

- **B1 — BLOQUEANTE (evidencia, sin cambio de código).** `progress/impl_SLT-72.md` no trae la
  corrida local del E2E de los flujos críticos que toca esta feature.
  - **Qué piden los checkpoints.** «Cierres de día y su revisión (`cierres-admin*`)» está en
    `CHECKPOINTS.md > Calidad de codigo` y en `docs/checkpoints-proyecto.md > Flujos críticos`. Como
    la feature toca datos de negocio, el aislamiento también pide `e2e/dos-empresas-humo.spec.ts`.
  - **Por qué no basta con el CI.** `e2e/cierres-admin.spec.ts` (a) recorre exactamente el payload
    que cambió: cada entrada ahora exige `origen`. Además, la fábrica `aprobarCierre`, que usan
    varios E2E, cambió.
  - **Precedentes.** SL-9 y SL-37 se rechazaron por lo mismo. SLT-63 no, porque no tocaba el flujo
    de forma directa.
  - **Qué falta.** Correr `pnpm exec playwright test e2e/cierres-admin.spec.ts` y
    `e2e/dos-empresas-humo.spec.ts` contra `servi_slt72`, con un solo dev server, y pegar la salida
    en `impl_SLT-72.md`.
- **m1 — menor.** El filtro de alcance de `findBarridasDelCierre` (R8) solo está probado con dobles,
  y la query nueva no tiene un test de dos empresas propio.
  - La M3 lo deja pasar en verde contra Postgres.
  - **Impacto acotado.** `resolverCierre` lleva su propio `alcanceGuard`, así que un fuera de
    alcance no aprueba. Lo que se expondría son los `ordenId` en `fieldErrors`, que es lo que R8
    prohíbe revelar.
  - El aislamiento por empresa lo dan la extensión y la RLS, sobre una tabla ya clasificada.
  - **Recomendado.** Un caso en `sql-real`: el satélite de otra zona, o de otra empresa, recibe `[]`.
- **m2 — menor (proceso, bloquea el DESPLIEGUE, no el código).** T0.1 y T6.4 siguen `[ ]`.
  - El spec (Q4) exige medir cuántos cierres vencidos o en cola arrastran barridas y avisar a bodega
    ANTES de desplegar.
  - Si no, el primer efecto visible será «el botón Aprobar dejó de funcionar».
  - Son del leader y de Carlos, antes del merge a `prod`.
- **m3 — menor.** Dos suites editadas por el diff no se pueden ejecutar hoy (baseline, «referencia a
  otra empresa»): `cierre-rechazo-tienda-aprobacion.test.ts` y
  `454/caracterizacion/confirmacion-fisica-238.test.ts`. Su cambio (`origen:"gestion"` y un tipo)
  solo lo verifica el typecheck. No bloquea: el mismo contrato lo ejercitan las suites verdes.
- **m4 — menor (defensa en profundidad, opcional).** Dentro de la tx no se re-comprueba que la lista
  de barridas cubra TODAS las filas de `cierre_sin_gestion` del cierre, que es lo que libera la 109.
  - Se apoya en un invariante documentado: la tabla solo se escribe al crear el cierre, así que la
    lista no crece entre validar y aprobar, y R16 pone la validación antes.
  - Hoy es correcto. Si algún día se escribiera `cierre_sin_gestion` fuera de la creación, R26
    dependería solo de la validación previa.
- **m5 — menor (pendiente humano).** El rótulo «Novedad interna» frente a R29 («sin gestionar») es
  coherente con la 455 y su guardia. Que Carlos lo confirme.
- **m6 — menor (proceso).** `progress/features/SLT-72.md > Cierre` sigue incompleto: falta el PR, el
  resumen y las deudas. Lo cierra el leader.

## Veredicto

**RECHAZADO**, solo por B1.
- **Qué está bien.** El código, la migración, el fallo cerrado, la trazabilidad y las mutaciones
  sobre el SQL real.
- **Qué falta.** Lo que bloquea es evidencia: la corrida local de `e2e/cierres-admin.spec.ts` y
  `e2e/dos-empresas-humo.spec.ts` anotada en `impl_SLT-72.md`.
- **Vuelta 2.** Con esa salida en verde, y sin cambios de código, el veredicto pasa a OK. m1 se
  recomienda pero no condiciona. m2 condiciona el despliegue.

## Vuelta 2 (acotada a 9805285b..dbfea2fa)

Commits revisados:
- `75fc827a` — test R8;
- `afb854c8` — evidencia E2E y gate;
- `dbfea2fa` — puertas de despliegue.

`git diff --name-only 9805285b..HEAD -- lib app db` sale vacío: en esta vuelta no cambió código de
producción.

### B1 — CERRADO
- He leído los logs del scratchpad yo mismo (`e2e_SLT-72_c1..c3.log`).
  - **c1:** `1 failed | 2 passed`, `E2E_EXIT=1`. El rojo es de entorno: «el log del servidor no
    recibió ningún enlace … ¿falta `NEXT_PUBLIC_APP_URL` en el build?», en `dos-empresas-humo`. No
    es de esta ficha.
  - **c2 y c3:** `9 passed`, `E2E_EXIT=0` en las dos.
    - `dos-empresas-humo.spec.ts`: sus 7 casos.
    - `cierres-admin.spec.ts`: (a) aprobar con la guía confirmada y (b) rechazar con motivo.
- El código de producción es el mismo que se revisó en la vuelta 1, así que la evidencia vale para HEAD.
- La bitácora `impl_SLT-72.md` recoge la corrida («Vuelta 2»).

### m1 — CERRADO
- Hay caso nuevo en `cierre-sin-gestion-confirmacion-sql-real.test.ts`: «R8: las barridas de un
  cierre fuera del alcance NO se leen…».
  - Usa un alcance ajeno con la MISMA zona y otro `destinoTipo`.
  - Tiene control positivo: con el alcance propio salen las dos barridas, así que el `[]` no es vacuo.
- Lo comprobé contra `servi_slt72`:
  - sin mutar: `7 passed`;
  - con mi mutación M3 de la vuelta 1 (WHERE de `findBarridasDelCierre` reducido a
    `{ cierreId }`): `1 failed | 6 passed`, y el que cae es justo el caso R8. Muerta.
  - revertida con `cmp` → «RESTAURADO», y `git status -s` vacío.
- Gate ronda 3 (`gate_SLT-72_r3.log`): `Test Files 264 passed`, guardias `317 passed`, `INIT_EXIT=0`.

### m2, m5 y m6 — atendidos en `progress/features/SLT-72.md` (`dbfea2fa`)
- **m5:** Carlos confirma el rótulo «Novedad interna».
- **m2 / T0.1:** consulta de solo lectura en prod autorizada por Carlos: 0 cierres en
  `solicitado`, `vencido` o `rechazado`, así que no hay cola atascada al desplegar.
- **m2 / T6.4:** bodegas avisadas.
- **m6:** la bitácora de cierre ya tiene sus entradas. El PR y las deudas los añade el leader al abrirlo.

### Hallazgos de la vuelta 2
- **m7 — menor (proceso).** En `specs/451-confirmacion-fisica-sin-gestionar/tasks.md`, T0.1 (L41) y
  T6.4 (L228) siguen en `[ ]`, aunque `progress/features/SLT-72.md` las da por hechas. Hay que
  marcarlas `[x]` antes del PR para cumplir `CHECKPOINTS.md > Especificacion`. No bloquea.
- m3 y m4 de la vuelta 1 siguen como estaban: son menores y aceptados.

### Veredicto vuelta 2

**OK.** No queda ningún bloqueante: B1 tiene la evidencia E2E verde y m1 está cubierto con SQL real y
su mutación muerta. Antes de abrir el PR a `prod` hay que hacer dos cosas:
- marcar T0.1 y T6.4 (m7);
- esperar a que `gate-completo` y el E2E del CI estén en verde.
