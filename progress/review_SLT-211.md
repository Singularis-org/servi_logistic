# review SLT-211 «Histórico de acciones: registrar el retiro de paquetes de una satélite a la central»

Fecha: 2026-11-19. HEAD revisado: `27f66678`. Diff: `git diff origin/dev...HEAD` (origin/dev = `ab489908`).
Ruta directa con migración a prod esta noche: revisión completa a petición del leader.

## Checklist

- [x] **Ruta.** Directa, complexity low. El diff no toca dinero, permisos, auth, integraciones ni
      webhooks (el retiro no toca tablas de dinero, R983 de SLT-197). Suelo respetado.
- [x] **Especificación (directa).** La bitácora dice qué cambia, con qué test, y el rojo antes del
      arreglo (`3 failed | 7 passed`). Mapa requisito → test en `progress/impl_SLT-211.md`.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 20/40 archivos, 286/1000 producción, 208/3000 tests.
- [x] **Trazabilidad.** Cada punto de la ficha tiene test real (ver «Verificación» abajo).
- [x] **typecheck** `pnpm run typecheck`: 0 errores.
- [x] **lint** sobre los `.ts` del diff: 0 errores (1 warning previo, `IOrdenRepository.ts:11`).
- [x] **Guardias** `pnpm run test:guardias`: 359 archivos, 5377 passed, 1 skipped.
- [x] **Migración** con `down.sql`; no edita ninguna aplicada; aditiva.
- [x] **Datos.** Sin tabla nueva. `organizacion_id` de `historial_accion` sale del DEFAULT, como el
      resto de escritores de empresa (comprobado en la fila que dejó el E2E: `organizacion_id` no nulo).
- [x] **Sin Ordenex, sin literales de país/moneda, sin secretos, sin dependencias nuevas.**
- [x] **Capas.** Escritura en el repositorio, dentro de la `$transaction` existente; etiqueta en la
      fuente única `lib/types/historial-accion-etiquetas.ts`.
- [x] **E2E afectado corrido en local** (por este reviewer; ver hallazgo 1).
- [ ] **`./init.sh` rápido en verde.** La bitácora lo trae ROJO (timeouts bajo carga y `demo-qa`), no
      atribuible a este diff. Decisión del leader (hallazgo 3). El check `gate-completo` del CI manda.

## Verificación (corrida por el reviewer)

1. **Migración `20261119120000_historial_accion_ordenes_retiradas_a_central`**
   - Solo `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'ordenes_retiradas_a_central';`.
     El valor no se USA en la misma migración: no hay riesgo 55P04.
   - `down.sql`: la función dinámica del repo. Comparada con la de
     `20261108120000_slt94_fulfillment_enums/down.sql` (renombrando slt94→slt211): el cuerpo es
     IDÉNTICO; solo cambian la cabecera y la lista de valores. Lee `pg_enum` vigente; RAISE si hay filas.
   - Nombre: ordena después de la última de origin/dev (`20261117120000_plan_borrador`). Ninguna
     otra rama remota trae migraciones `202611(18|19|2x)`; origin/prod va por `20261115120100`.
   - Base desechable NUEVA `servi_slt211b_desechable`: `migrate deploy` desde cero → «All migrations
     have been successfully applied». Segundo `deploy` → «No pending migrations to apply».
     `migration.sql` reaplicado a mano (`prisma db execute`) → OK (IF NOT EXISTS). `down.sql` → OK;
     `down.sql` otra vez → OK (idempotente, NOTICE); `migration.sql` de nuevo → OK. Estado final:
     86 valores en `historial_accion_tipo`, el último `ordenes_retiradas_a_central` (coincide con
     `HISTORIAL_ACCION_TIPOS` = 86); 1 fila en `_prisma_migrations`.
2. **Misma transacción; conflicto = 0 filas.** `appendAccion(tx, …)` va dentro de la
   `$transaction` y después del `throw RetiroSateliteConflicto`. Tests: «conflicto (carrera en el
   WHERE) NO deja ninguna accion» (con control positivo en la misma siembra) y «el repo en conflicto
   … no deja ninguna accion». Verdes.
3. **Una fila por satélite, mismo `lote_id`; 1 fila con una satélite.** Tests «3 ordenes de una
   satelite deja EXACTAMENTE 1 accion» (actor, rol, entidad, etiqueta exacta, monto/valores NULL) y
   «mezcla dos satelites deja una fila por satelite, con el MISMO lote_id». Verdes.
4. **Etiqueta ≤ 120.** `etiquetaDeRetiroSatelite` mide cada candidata antes de añadirla y cierra con
   «, … y M más»; `limpiar` y el `slice(0, 120)` de `appendAccion` son la red. Test con 40 guías de 9
   dígitos: ≤ 120 y listadas + contadas = 40. Verde.
5. **Catálogo.** Entidad `zona` (existente; la satélite ES una zona con su cierre de bodega),
   categoría `hace_desaparecer` (precedente `gestion_fecha_reprogramacion_corregida`), label
   «Retiró paquetes de una satélite a la central» en pasado con la persona como sujeto. Histórico ›
   Acciones lo muestra sin código nuevo: la columna sale de `ACCION_LABELS` vía
   `HistorialAccionService` y el filtro de `historial-acciones-filtros-def.ts` mapea
   `HISTORIAL_ACCION_TIPOS` con `ACCION_LABELS`. Test de label literal + categoría + zod del filtro
   (positivo y negativo con valor imposible). Verde.
6. **Mutaciones (repetidas por el reviewer, restauradas con `git checkout --`):**
   - `await appendAccion(` → `await ((..._x: unknown[]) => Promise.resolve())(`: **4 rojos** — la
     guardia «retirarSateliteLote registra su accion en la misma transaccion» y los 3 int SLT-211 que
     esperan filas (3 órdenes, lote mixto, control positivo del conflicto).
   - `appendAccion(tx, …)` → `appendAccion(this.prisma as never, …)` (fuera de la tx): la guardia
     da **1 rojo**.
   - Árbol limpio tras restaurar (`git status` vacío).
7. **`node_modules` propio.** Directorio real (no junction), ignorado por `/node_modules` en
   `.gitignore`. El diff no toca `pnpm-lock.yaml`, `package.json`, `.gitignore` ni `.npmrc`; sin
   archivos sin seguimiento. Nada fuera de lugar en la rama.

Tests corridos (desechable `servi_slt211_desechable`): int de retiro + 3 unit/guardia del diff →
4 archivos, 201 passed; el int con `--reporter=verbose` muestra los 4 casos SLT-211 ejecutados (no
saltados). Los 9 `*-migration.test.ts` del diff → 9 archivos, 117 passed, 0 skipped.

E2E (desechable `servi_slt211b_desechable` + `db:seed` + `next build`, `E2E_PUERTO=3044`,
`NEXT_PUBLIC_APP_URL=http://localhost:3044`): `pnpm exec playwright test e2e/retiro-satelite-central.spec.ts`
→ **3 passed (29.1s)**, E2E_EXIT=0. La corrida dejó 1 fila `ordenes_retiradas_a_central`
(`entidad_tipo=zona`, etiqueta de 56 caracteres, `organizacion_id` y actor no nulos, 1 fila en su lote).

## Hallazgos

1. **menor** — La bitácora no traía constancia de E2E aunque el diff toca `db/` (regla de
   `docs/perfil-agentes.md > reviewer`). Cubierto por este reviewer: `e2e/retiro-satelite-central.spec.ts`
   en verde contra base nueva (arriba). Si el leader quiere la constancia en la bitácora, copiar esa línea.
2. **menor** — `retirarSateliteLote` salta en silencio las órdenes con `zonaId === null` al armar las
   acciones (`continue`), y `retirarABodegaCentral` no valida la zona. Si alguna vez llega una orden en
   `en_bodega_satelite` sin zona, su retiro no queda en Histórico › Acciones y la etiqueta de su lote no
   la cuenta. El comentario afirma que no ocurre; no hay test ni constraint que lo sostenga. No bloquea.
3. **menor (leader)** — Gate rápido en ROJO en la bitácora: timeouts bajo carga (verdes aislados) y
   `tests/integration/db/demo-qa.test.ts`, que NO está en `tests/baseline-rojos.json`. La bitácora lo
   reproduce idéntico sin el código de SLT-211 y la receta no llama al retiro. No es de esta ficha,
   pero hay que decidir baseline o ficha propia antes de mergear, y esperar `gate-completo` en verde.
4. **menor** — Corrí `pnpm run test:guardias` sin el wrapper de desechable (son guardias estáticas;
   no se observó escritura). Lo anoto por transparencia.

## Veredicto

**OK** — sin bloqueantes. Migración aditiva, reaplicable y reversible verificada en base nueva; la
acción se escribe en la misma transacción y las mutaciones dan rojo.
