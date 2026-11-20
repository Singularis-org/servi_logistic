# Review — SLT-179 «Siembra propia en tests de corrección, gestión y reparto»

Revisado: rama `feature/SLT-179-siembra-tests-correccion-reparto`, HEAD 49457a9e, contra `origin/dev`.
Ruta ligera (spec único `requirements.md`, R1020–R1032). Diff de producción vacío; no toca dinero,
permisos, auth, integraciones ni webhooks: la ruta ligera es válida.

## Checklist

- [x] **Ruta:** ligera correcta (solo `tests/`, `specs/`, `progress/`).
- [x] **Spec:** `requirements.md` con alcance, EARS R1020–R1032, `## Lo que ya existe`, `## Tasks` (T1–T8
      todas `[x]`; T8 con «CI del PR pendiente») y `## Archivos esperados`. El diff no re-crea nada de
      «Lo que ya existe»: reutiliza `crearFksDeOrden`/`crearUsuarioDePrueba`; `_postgres-real.ts`,
      `454/_escenario.ts` y `_fixtures/orden-minima.ts` sin cambios.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 16/40 archivos, 0/1000 producción, 717/3000 tests. Sin
      línea de aceptación (no hace falta).
- [x] **R1030:** `git diff --name-only origin/dev...HEAD -- lib app components hooks db scripts .github package.json` → 0.
- [x] **Typecheck:** `pnpm run typecheck` exit 0 (corrido por mí). **Lint:** `eslint` sobre los 15 archivos
      de test, sin salida (0 errores).
- [x] **R1025 (no debilitar):** revisado el diff entero. Número de `it`/`test` igual en los 15 archivos.
      Ningún literal esperado cambiado. Los `expect` que bajan (novedades 24→20, reparto-manana 36→27)
      son las precondiciones `expect(fks).not.toBeNull()` («hay una orden en la base»), sustituidas por
      el control positivo de la siembra dentro de cada caso (`sembrarModelo`/`sembrarFks`, `count === 1`
      con mensaje). No eran aserciones de comportamiento.
  - `novedades`: `SELECT … usuario LIMIT 1` → `WHERE id = $1` con el modelo sembrado; la aserción
    `toBe(1)` sigue igual. Correcto (R1022).
  - `correccion-dia-reparto.int`: `Semilla.zonaId` → `zonaAjena: boolean`; la zona ajena se crea en la tx
    y el R12 sigue con su control positivo (`zonaId = null` sí corrige). Equivalente, sin debilitar.
  - `corregir-datos-cliente.repo`: `toBe(FKS.zonaId)` → `toBe(viva.zonaSembrada)`, que captura la zona
    sembrada en ese mismo caso (no la función bajo prueba). No compara contra su propia fuente.
- [x] **R1022:** sin `fksDeOrden` en el alcance; `tipoIdentificacion` por `value: "cedula"`; central y
      satélite propias en `deshacer-asignacion` y `corregir-datos-cliente`; usuarios de 405 sembrados.
      Las lecturas `orden.findMany`/`gestionOrden.findMany` que quedan son sobre ids del caso.
- [x] **R1023:** todo en `enTransaccionRevertida`; ninguna fila confirmada. Base B tras mi corrida: mismo
      conteo que la bitácora (`organizacion 1, zona 2, usuario 5, orden 40, gestion_orden 40,
      cierre_dia 1, tarifa_zona_mensajero 2`).
- [x] **R1020/R1021 (verificado por mí en `servi_slt179b_desechable`, empresa ajena confirmada):**
      `novedades-sin-gestionar-aviso-dedupe` 5, `reparto-manana-repository` 10,
      `deshacer-asignacion-zona-satelite.int` 6, `correccion-fecha-reprogramacion.int` 23 → **44 passed,
      0 failed, 0 skipped**. `gestiones-detalle-api-405` (parado) cae como dice su motivo
      (`falta el estado devolucion_por_confirmar`).
- [x] **R1024:** controles positivos con mensaje que nombra la fila en los 15; sin `return` temprano.
- [x] **R1026:** tabla de mutaciones en la bitácora (10 archivos). Repetida una mutación propia distinta:
      en `deshacer-asignacion-zona-satelite.int` la central sembrada con `esCentral: false` → 6/6 rojos con
      «SLT-179: la zona central sembrada no esta en la base». Restaurado con `git checkout --`;
      `git status` limpio.
- [x] **R1027:** baseline 152→142: solo salen las 10 claves verdes del alcance; ninguna otra entrada cambia
      (comparado clave a clave contra `origin/dev`).
- [x] **R1028 (decisión del leader, SLT-186 «Tests con estados retirados del catálogo»):** las 5 entradas
      paradas conservan `desde: 2026-10-22`; su motivo trae clase, primera línea del error, fecha de
      medición, causas de segundo nivel y cita SLT-186. Ver menor 1 sobre los números de línea.
- [x] **R1029:** no se tocó ningún helper compartido.
- [ ] **R1031:** pendiente del CI del PR (`gate-completo`); esperado, no es hallazgo.
- [x] **R1032:** bajo el tope sin aceptación.
- [x] **Trazabilidad:** `progress/impl_SLT-179.md > Mapa R → evidencia` cubre R1020–R1032.
- [x] **checkpoints-proyecto:** sin tablas, queries de producción, migraciones, dependencias, secretos ni
      Ordenex. No toca flujos críticos de producción (solo tests): no aplica E2E. Los `sinpeNumero`/
      `sinpeNombre` son nombres de columna del esquema ya usados en esos mismos archivos, no literales
      nuevos de país en código de la app.

## Hallazgos

1. **menor** — Números de línea de los motivos de 4 de los 5 parados apuntan a la versión de `origin/dev`,
   no al archivo de HEAD (R1028 pide `archivo:línea`):
   - `gestiones-detalle-api-405.test.ts:166` → vitest en HEAD reporta `:140` (medido por mí).
   - `traspaso-mensajero.int.test.ts:88` → el `throw` está en `:78-79`.
   - `correccion-dia-reparto.int.test.ts:85` → el `throw` está en `:77-78`.
   - `corregir-datos-cliente.repo.test.ts:97` → `:98-99` (desfase de una línea).
   - `correccion-dia-reparto-efectos.int.test.ts:97` sí coincide.
   El mensaje del error es exacto y localiza el sitio sin ambigüedad; SLT-186 va a reescribir esos
   archivos. Corregible en el mismo PR o al tomar SLT-186.
2. **menor** — La tabla «Los 5 que siguen rojos» de `progress/impl_SLT-179.md` arrastra los mismos números
   de línea de `origin/dev`.

## Veredicto

**OK** — sin bloqueantes. R1031 queda a cargo del `gate-completo` del PR.
