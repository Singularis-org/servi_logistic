# SLT-75 · tasks — un distrito, a lo sumo una zona por empresa (HOTFIX)

Rama `hotfix/SLT-75-distrito-zona-unica` desde `origin/prod`, en el worktree
`.worktrees/SLT-75-hotfix`. Para cada `R<n>`, el test y la mutación que lo mata están en
`design.md > §8`.

En la columna «Dep.», `[P]` significa que la task puede ir en paralelo con las demás que estén
listas.

## T0 · Verificación previa en producción (leader, SOLO LECTURA) — antes de desplegar

- [ ] Justo antes del deploy, con una conexión de solo lectura (ningún agente escribe en
      producción), contar los duplicados. Sin datos personales en el informe: solo conteos y los
      nombres de distrito y de zona.
      ```sql
      SELECT organizacion_id, distrito_id, count(*) AS zonas
      FROM zona_distrito GROUP BY 1, 2 HAVING count(*) > 1;
      ```
      Contar también las filas totales de `zona_distrito` y las órdenes vivas de cada distrito
      duplicado.
- **Hecho cuando:** hay un número anotado en `progress/features/SLT-75.md`.
  - Si sale **exactamente 1 fila** (el distrito del cantón Cartago, zonas «GAM» y «GAM
    (Alajuéla)-(Cartago)»), se sigue.
  - **Si sale otro número, se PARA y decide Carlos:** su decisión cubre ese caso y no otros.

## T1 · Migración de datos (R9, R10, R11, R13)

Dep.: —

- [ ] Crear `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/` con `migration.sql`
      y `down.sql`, tal como dice `design.md §3.1`:
  - esquema `respaldo` con `REVOKE ALL … FROM PUBLIC`;
  - tabla de respaldo con columnas con nombre;
  - `DELETE … USING`;
  - ningún `UPDATE` de `orden`.
- **Hecho cuando:**
  - `pnpm run db:migrate` la aplica sobre una base de test;
  - el `migration.sql` no contiene la palabra `orden`;
  - el `down.sql` reinserta con `organizacion_id` explícito, con `WHERE EXISTS` y con
    `ON CONFLICT DO NOTHING`.

## T2 · Índice único por empresa (R7)

Dep.: T1

- [ ] `db/schema.prisma`: `@@unique([organizacionId, distritoId])` en `ZonaDistrito`, con un
      comentario `SLT-75`.
- [ ] Crear `db/migrations/20261101090100_zona_distrito_distrito_unico_por_empresa/`:
  - `migration.sql` con el `CREATE UNIQUE INDEX "zona_distrito_organizacion_id_distrito_id_key"`;
  - `down.sql` con el `DROP INDEX IF EXISTS`.
- [ ] **NO** añadir entrada en `tests/unit/guards/_unicos-sin-empresa.ts`: el índice empieza por
      `organizacion_id`, y una entrada pondría la guardia en rojo (`design.md §2.1`).
- **Hecho cuando:**
  - `pnpm exec prisma migrate dev --create-only` no genera ninguna diferencia (sin drift);
  - `pnpm run test:guardias` está en verde, `unicos-por-empresa` incluida.

## T3 · Repositorio: rechazo en la transacción y red del índice (R1, R2, R4, R5, R6, R8)

Dep.: T2

- [ ] `lib/interfaces/repositories/IZonaRepository.ts`:
  - `DistritoEnOtraZona` y `CreateZonaResult`;
  - `UpdateZonaResult` gana `distrito_en_otra_zona`;
  - `create` devuelve `CreateZonaResult`.
- [ ] `lib/repositories/ZonaRepository.ts`:
  - la lectura de conflictos con `tx`, antes de la primera escritura, en `create` y en `update`
    (`design.md §4.2`);
  - el detector `esViolacionDistritoUnico`;
  - la rama nueva en los dos `catch`, antes de `translateEsCentralConflict`.
- [ ] Adaptar los dobles de `tests/unit/repositories/zona-repository.test.ts` y añadir sus casos de
      R6 y R8.
- **Hecho cuando:**
  - el typecheck está en verde;
  - los tests unit de R6 y R8 están verdes y se ponen rojos con sus mutaciones;
  - la guardia `consultas-concurrentes-en-transaccion` está en verde.

## T4 · Servicio: traducción a `validation_error` (R1, R2, R3, R8)

Dep.: T3

- [ ] `lib/services/ZonaService.ts`: `crear` y `actualizar` traducen `distrito_en_otra_zona` a
      `fieldErrors.distritoIds`, con los mensajes de R3 (orden por nombre) y de R8. Los textos van
      como constantes.
- [ ] `tests/unit/services/zona-service.test.ts`: casos de R2, R3 (literal esperado como contrato)
      y R8.
- **Hecho cuando:** los tests están verdes, y se ponen rojos al cambiar el texto o el orden.

## T5 · Tests de integración del guardado y del índice (R1-R8, R14 dos empresas)

Dep.: T4

- [ ] Crear `tests/integration/db/zona-distrito-unica.test.ts`, contra Postgres real y en
      contexto de empresa (`servi_app`), con dos empresas. Siembra distritos propios del test.
      Casos de `design.md §8`:
  - R1 y R2: «nada cambia», incluidas `orden.zona_id` y `historial_accion`;
  - R3: el mensaje con nombres reales;
  - R4, R5;
  - R7: inserción directa que falla en la misma empresa y se acepta en otra;
  - R8: el detector reconoce el error real;
  - R14: el árbol de A no trae la zona de B.
- [ ] Correr las mutaciones de la tabla y anotar cada una en `progress/impl_SLT-75.md`, con el
      comando y la salida de que se puso rojo. **Autocomprobación:** sin mutar, el archivo pasa con
      N tests ejecutados (N > 0), no «0 tests».
- **Hecho cuando:** todo está verde y cada mutación quedó medida en rojo.

## T6 · Test de la migración (R9-R13)

Dep.: T2, [P] con T3-T5

- [ ] Crear `tests/integration/db/zona-distrito-unica-migration.test.ts` (precedente de cómo leer y
      aplicar el SQL: `tests/integration/db/geografia-dta-2026-migration.test.ts`). Dentro de una
      transacción que se revierte:
  1. quitar el índice;
  2. sembrar un duplicado en la empresa A, el mismo distrito en la empresa B, un distrito no
     duplicado y una orden del duplicado;
  3. aplicar los dos `migration.sql` y comprobar R9, R10 (también que `servi_app` no puede hacer
     `SELECT` del respaldo) y R11 (`orden.zona_id` y `updated_at`);
  4. aplicar los dos `down.sql` en orden inverso y comprobar R12;
  5. un caso sin duplicados para R13.
- **Hecho cuando:** está verde, y las mutaciones R9, R10, R11 y R12 de `design.md §8` quedaron
      medidas en rojo.

## T7 · Árbol (R14)

Dep.: —, [P]

- [ ] `lib/types/geografia-nodo.ts`: `DistritoArbolDTO.zonas` obligatorio.
- [ ] `lib/repositories/GeoRepository.ts`: `listArbol` proyecta `zonas` ordenadas por nombre. El
      colapso de `zonaId` y `zonaNombre` no cambia.
- [ ] Añadir `zonas` a los fixtures de `DistritoArbolDTO` que el typecheck señale (candidatos en
      «Archivos esperados»).
- [ ] `tests/integration/db/geografia-catalogo-activo.test.ts`: los casos de 1 y 0 zonas afirman
      `zonas`.
- **Hecho cuando:** el typecheck está en verde y los tests de R14 también.

## T8 · Pantalla (R15-R22)

Dep.: T7

- [ ] `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`:
  - prop `zonaEnEdicionId`;
  - casilla deshabilitada con `(zona: X)`;
  - `provDistIds` y `cantDistIds` solo con seleccionables;
  - grupo sin seleccionables, deshabilitado (`design.md §6.1`).
- [ ] `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`:
  - pasar `zonaEnEdicionId={zonaIdGuardada}`;
  - en `mensajeDeError`, añadir la rama `distritoIds` y cambiar el texto del `conflict`.
- [ ] `app/(app)/configuracion/tarifas/_components/ZonasTarifasModule.tsx`: `abrirEditar` y
      `abrirCrear` leen el árbol al abrir. Si falla, no abren y avisan. La preselección sale de
      `d.zonas`.
- [ ] Crear los tests:
  - `tests/unit/components/geografia-selector-zona-ocupada.test.tsx` (R15-R18);
  - `tests/components/ZonasTarifasEditarDistritos.test.tsx` (R19, R20);
  - `tests/components/ZonaDistritoEnOtraZona.test.tsx` (R21, R22).
- **Hecho cuando:**
  - los tests están verdes y sus mutaciones quedaron medidas en rojo;
  - pasa la guardia `etiquetas-geograficas-sin-literal`;
  - hay evidencia visual en local (`docs/verification.md`): captura del selector con un distrito
    bloqueado y del toast de error, con datos sembrados en local, nunca de producción.

## T9 · Adaptar los tests que siembran duplicados (decisión por test en `design.md §8.1`)

Dep.: T2

- [ ] `tests/integration/db/zona-reconciliacion-ordenes.test.ts`: reescribir `:383` y `:590`.
      Confirmar que «un `lote_id` por guardado» (366 R11) sigue afirmado en algún test.
- [ ] `tests/integration/db/geografia-catalogo-activo.test.ts`: quitar `distritoDosZonas` (`:144`)
      y el caso `:336`.
- [ ] `tests/integration/db/corregir-datos-cliente.repo.test.ts`: quitar `dosZonas` (`:479`) y su
      aserción (`:773`).
- [ ] `tests/integration/db/cobertura-repository.test.ts`: quitar la fila `z2/dDos` (`:141`) y
      ajustar `:177-179` y `:193`.
- [ ] Barrido: correr los demás tests de integración que siembran `zona_distrito`. Si alguno siembra
      un duplicado de la misma empresa o guarda una zona con distritos que ya están en otra zona,
      aplicar la regla de `design.md §8.1`. Los archivos son:
  - `aislamiento-ordenes`
  - `aislamiento-rls`
  - `cobro-plataforma-cargos`
  - `demo-qa`
  - `dos-empresas-entradas`
  - `geografia-cascada-reversible`
  - `geografia-dta-2026-migration`
  - `geografia-por-pais`
  - `informe-transito-zonas`
  - `zona-central-guarda-y-rastro`
  - `zona-guardado-conserva-inactivos`
  - `zona-pago-mensajero-rastro`

  Todos están en `tests/integration/db/`.
- **Hecho cuando:** los cinco archivos de arriba y el barrido están verdes con base de datos. Cada
  test eliminado o reescrito queda anotado en `progress/impl_SLT-75.md`, con qué protegía y dónde
  sigue protegido.

## T10 · Gate y cierre

Dep.: T1-T9

- [ ] Correr `./init.sh` en verde. Escribir `INIT_EXIT=$?` dentro del log.
- [ ] Mapa `R1..R22 → test` en `progress/impl_SLT-75.md`.
- [ ] Dejar escrito en el PR a `prod` el efecto visible para Carlos: el distrito queda sin zona y
      hay que asignarlo desde la pantalla (`design.md §3.3`).
- [ ] Dejar escrito para el dueño de SLT-43 la nota de convivencia en `dev` (`design.md §10`).
- **Hecho cuando:**
  - el gate local está verde;
  - el reviewer dio su OK;
  - el PR a `prod` está abierto por el leader.

## T11 · Verificación posterior en producción (leader, SOLO LECTURA) — después del deploy

Dep.: deploy

- [ ] Comprobar, sin escribir nada:
  - la consulta de T0 devuelve 0 filas;
  - `zona_distrito_organizacion_id_distrito_id_key` existe en `pg_indexes`;
  - `respaldo.slt75_zona_distrito_duplicado` tiene las filas esperadas (2 para el caso conocido);
  - la `zona_id` de la orden del distrito sigue siendo la de antes;
  - el total de `zona_distrito` es el de T0 menos las filas respaldadas.
- **Hecho cuando:** está anotado en `progress/features/SLT-75.md`.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/migration.sql`
- `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/down.sql`
- `db/migrations/20261101090100_zona_distrito_distrito_unico_por_empresa/migration.sql`
- `db/migrations/20261101090100_zona_distrito_distrito_unico_por_empresa/down.sql`
- `lib/interfaces/repositories/IZonaRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/services/ZonaService.ts`
- `lib/types/geografia-nodo.ts`
- `lib/repositories/GeoRepository.ts`
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/ZonasTarifasModule.tsx`
- `tests/integration/db/zona-distrito-unica.test.ts`
- `tests/integration/db/zona-distrito-unica-migration.test.ts`
- `tests/unit/components/geografia-selector-zona-ocupada.test.tsx`
- `tests/components/ZonasTarifasEditarDistritos.test.tsx`
- `tests/components/ZonaDistritoEnOtraZona.test.tsx`
- `tests/unit/services/zona-service.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `tests/integration/db/zona-reconciliacion-ordenes.test.ts`
- `tests/integration/db/geografia-catalogo-activo.test.ts`
- `tests/integration/db/corregir-datos-cliente.repo.test.ts`
- `tests/integration/db/cobertura-repository.test.ts`
- Fixtures de `DistritoArbolDTO` que pueden necesitar `zonas`. Son candidatos: manda el typecheck.
  - `tests/unit/components/geografia-selector-inactivos.test.tsx`
  - `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
  - `tests/unit/utils/filtrar-arbol-geografico.test.ts`
  - `tests/unit/services/geografia-service.test.ts`
  - `tests/components/ZonaCentralConfirmacion.test.tsx`
  - `tests/components/ZonaDistritoEspecial.test.tsx`
  - `tests/components/ZonaNombreNoImprimible.test.tsx`
  - `tests/components/CrearZonaFormReconciliacion.test.tsx`
- `progress/impl_SLT-75.md`
- `progress/features/SLT-75.md`
