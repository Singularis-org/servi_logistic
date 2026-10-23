# Review SL-38 «Distritos de zona especial por empresa»

Revisado el 2026-10-23 sobre `aec5d9e` (rama `feature/SL-38-zona-especial-por-empresa`), con el diff
contra `origin/dev`. Leídos: spec (R1–R24), `progress/impl_SL-38.md`, `docs/{architecture,conventions,
verification,perfil-agentes,checkpoints-proyecto}.md`, `CHECKPOINTS.md` y SL-17 `design.md` §1 y §6.
No usé el MCP del grafo: busqué con Grep/Read y `git grep`.

## Verificación que corrí yo (bajo `gate.lock`, base desechable `sl38r_157822793`, borrada después)

| Qué | Resultado |
|---|---|
| `prisma migrate deploy` en una base nueva | todas aplicadas, incluidas M1 y M2 |
| `prisma generate` (esquema de SL-38) | exit 0 |
| Drift: `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` | `-- This is an empty migration.` |
| `distrito.zona_especial` en `information_schema` | 0 filas: la columna ya no está |
| `TEST_RAPIDO_BASE=origin/dev ./init.sh` | typecheck y lint en verde. `test:rapido`: `1 failed / 13431 passed`, y por eso **`INIT_EXIT=1`**. El rojo es un deadlock (`40P01`) en `cobro-tienda-461-completar-migration.test.ts` (`ALTER TABLE wallet_tienda_movimiento`) bajo carga paralela. Ese archivo no está en el diff ni lee la marca. Solo y dentro del lock, en una base nueva: `6 passed (6)` dos veces. Es inestable, no es de SL-38. |
| Verde de referencia: 6 de integración + 11 unit/guardias de SL-38 | `Test Files 17 passed (17)`, `Tests 194 passed (194)`, ninguno saltado |
| Verde final, después de restaurar todas las mutaciones | `Test Files 3 passed`, `Tests 25 passed`, `git status` limpio y política restaurada (`pg_get_expr` igual que M1) |

### Mutaciones propias (una cada vez, restauradas)

Ninguna repite las de la bitácora.

| # | Mutación | Muere en |
|---|---|---|
| 1 | `DistritoZonaEspecialRepository`: quitar `skipDuplicates: true` | R9/R10 «por el repositorio real…» (P2002) y el composition root de la acción: `2 failed` |
| 2 | `CierreDiaRepository.leerDescriptivosDeOrdenes`: `zonaEspecial: false` fijo | R20 «leerDescriptivosDeOrdenes…» y R20/R21 «el cierre congela…»: `2 failed` |
| 3 | En la base: `ALTER POLICY … USING (true)`, con el `WITH CHECK` intacto (fuga de lectura) | R3 (tabla, joins, cliente de la app), R10, y R14–R20 en dos empresas: `13 failed` |
| 4 | M2: `WHERE "zona_especial" IS TRUE` → `IS NULL` (el aborto no salta) | R7 de `migracion-sl38-ida-y-vuelta`: `1 failed` |
| 5 | `GeoRepository.listArbol`: `zonaEspecial: d.zonasEspeciales !== undefined` (siempre `true`) | R14 «GeoRepository.listArbol…»: `1 failed` |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R24 en EARS.
- [x] `design.md` con alternativas descartadas (§9, A–E) y su porqué.
- [ ] **`tasks.md`: T11 sin marcar** (ver B1).
- [x] `design.md` abre con `## Lo que ya existe`. El diff no vuelve a crear nada de la lista: reutiliza el patrón de SL-17, `_shared/` y las fábricas de organizaciones, y la acción conserva nombre y archivo.

### Trazabilidad
- [x] Cada R1–R24 tiene un test real (mapa en `impl_SL-38.md > Cierre`). Comprobé que los de R3, R7, R9, R10, R14 y R20 matan sus mutaciones.
  - R2: guardias `organizacion-en-modelos`, `rls-por-empresa` (74) y `fk-misma-empresa`, en verde.
  - R6: typecheck sin la columna, `distrito-zona-especial-migration` y la guardia R22.
  - R24: los docs del diff (`architecture.md` dice 74, `deudas.md > D12` queda resuelta).
- [x] `progress/impl_SL-38.md` trae el mapa `R<n> -> test`.

### Calidad de código
- [x] `pnpm run typecheck` en verde.
- [x] `pnpm run lint` sin errores.
- [ ] `./init.sh` en verde con `INIT_EXIT=0` registrado en la bitácora (ver B1).
- [ ] **E2E de los flujos críticos tocados** (ver B2).
- [x] Sin dependencias nuevas.
- [ ] `gate-completo` en CI: no hay PR todavía (lo abre el leader).

### Datos y seguridad (`docs/checkpoints-proyecto.md`)
- [x] La tabla nueva tiene `organizacion_id NOT NULL` con su DEFAULT, FK, índice, RLS `_por_empresa` para `servi_app`, trigger `_sin_cambio_de_empresa` y el único `(organizacion_id, distrito_id)`.
- [x] Las queries nuevas filtran por empresa y hay test de dos empresas (`zona-especial-dos-empresas`). La forma del filtro está en la respuesta 2.
- [x] Las dos migraciones traen `down.sql`. Ninguna se editó después de empujarse: un solo commit cada una (`0769158` y `ba61367`).
- [x] Ningún recurso de Ordenex. Ningún literal de país en el código nuevo de `lib/` o `app/`: los `sinpe*` del fixture e2e son las columnas obligatorias de `zona`.
- [x] Ningún `console.log` de secretos.

### Arquitectura y permisos
- [x] Capas: acción → `DistritoZonaEspecialService` (rol) → `DistritoZonaEspecialRepository` (una `$transaction`). Zod en el borde (`distritosEspecialesSchema`).
- [x] La autorización se valida en el servidor: solo `maestro`, y el superadmin recibe `forbidden`.
- [x] Los comentarios explican el porqué.

## Respuestas a lo que pidió el leader

1. **Trazabilidad.** OK, ver arriba. Cinco mutaciones propias, todas muertas.

2. **Las dos barreras de SL-17.**
   - **Escritura.** Tiene las dos barreras. `tx.distritoZonaEspecial.deleteMany` y `createMany` pasan por la extensión, que mete `organizacionId` en el `where` y en los datos, y además actúa la RLS.
   - **Las ocho lecturas** (`GeoRepository.listArbol`, `CoberturaRepository.listDistritos`, las seis de `OrdenRepository` y `CierreDiaRepository.leerDescriptivosDeOrdenes`):
     - **No son SQL a mano.** El diff no añade ningún `$queryRaw`/`$executeRaw`, y la guardia `sql-a-mano-por-empresa` sale en verde. Por eso no les toca entrada en `EXCEPCIONES_SQL_A_MANO`.
     - **Qué son.** `select` anidados de Prisma (`zonasEspeciales: { select: { id }, take: 1 }`) desde `distrito`/`orden`, por el cliente extendido.
     - **Qué hace la extensión con ellas.** No filtra la relación anidada, porque no ve los `select`/`include` (SL-17 design §1.3 y §6.2: «Lo que no ve: … los `include`/`select` de relaciones. Ahí actúan el DEFAULT y la RLS»). Lo que sí hace es envolver la operación, también la de los modelos de plataforma, en una transacción con `set_config(app.organizacion_id)` y `role servi_app` (SL-17 T3.10, `extension-empresa.ts`).
     - **Consecuencia.** El aislamiento de esas lecturas lo sostiene solo la RLS, que es lo que concluyó el agente del navegador. Es el diseño de SL-17 y el mismo mecanismo que ya protege `distrito.zonas → zona_distrito`.
     - **Veredicto: aceptable.** Está decidido en el design de SL-38 (§4, §7 y la alternativa B descartada). La mutación 3 demuestra que la RLS es la barrera que se mide. Queda el riesgo del plan B de SL-17 (un despliegue sin RLS), ya declarado en §7 (menor m1).

3. **Migraciones.**
   - Las dos tienen `down.sql`. M1 hace `DROP TRIGGER`/`POLICY`/`TABLE`. M2 hace `ADD COLUMN zona_especial BOOLEAN DEFAULT false`, nulable.
   - Sin drift: diff vacío en una base nueva.
   - M2 aborta con `RAISE EXCEPTION` si existe alguna fila `zona_especial IS TRUE`, con un mensaje que nombra la causa. Al ir en la transacción de la migración, la columna se queda: R7 lo prueba, y la mutación 4 lo mata.
   - No se editaron después de aplicarse en QA.

4. **Choques con SL-32** (`origin/feature/SL-32-rol-superadmin`, `ff306a5`). `git merge-tree` de las dos ramas **no da ningún conflicto textual**. Comparten tres archivos, todos en bloques distintos:
   - **`db/schema.prisma`:** SL-32 toca `Usuario`/`RolValue` y SL-38 toca `Distrito`, `Organizacion` y el modelo nuevo.
   - **`lib/actions/geografia.ts`:** SL-32 cambia comentarios de las acciones de nodo («solo la plataforma») y SL-38 cambia `actualizarDistritosEspeciales` y la cabecera.
   - **`progress/deudas.md`:** líneas distintas de D12.

   Choques semánticos y cómo se resuelven:
   - (a) **Orden de las migraciones.** Las de SL-32 (`20261023100000`–`100200`) son anteriores a M1/M2, que ya están aplicadas en QA. Si SL-38 entra primero, `migrate deploy` aplica después las de SL-32, que son independientes (rol y usuario, no distrito). No se renumera nada, y no se puede renumerar M1/M2, porque ya están aplicadas.
   - (b) **SL-32 T11** sigue anotando «abierta la decisión sobre `actualizarDistritosEspeciales` (D12)». SL-38 la resuelve. Quien mergee segundo actualiza la nota de T11 en `specs/SL-32-rol-superadmin/tasks.md` y su bitácora, y deja D12 con las dos frases (SL-26 pendiente y la marca resuelta).
   - (c) En `distrito-zona-especial-service.test.ts`, el `"superadmin" as RolValue` pasa a sobrar cuando entra SL-32. Compila igual, y se limpia en el rebase.
   - (d) `aislamiento-usuarios.test.ts` de SL-32 recorre `MODELOS_DE_NEGOCIO` y exige `organizacion_id NOT NULL`. La tabla nueva lo cumple, así que pasa con 74.
   - (e) Riesgo heredado (design §7): el árbol que lee el superadmin sin empresa vería la unión de las marcas de todas las empresas. En el árbol fusionado, ninguna pantalla del superadmin muestra `zonaEspecial`: solo la leen los componentes de Tarifas. Queda para SL-26.

   Después del merge se corre `prisma generate`, el typecheck y las guardias sobre el árbol fusionado.

5. **T11.** **No basta todavía.**
   - La bitácora registra `INIT_EXIT=1` sobre `91c56c8`. El `INIT_EXIT=0` sobre `6a2cfda` existe solo en un log del scratchpad (`sl38-gate-final.log`), no en `progress/impl_SL-38.md`, y es anterior a `aec5d9e`.
   - Mi corrida sobre `aec5d9e` dio `INIT_EXIT=1` por el deadlock inestable de arriba, que solo sale verde.
   - Para cerrarla: una corrida de `./init.sh` sobre el HEAD final con `INIT_EXIT=0` dentro del log, citada en la bitácora; T11 marcada `[x]`; y lo de B2.

## Hallazgos

- **B1 — BLOQUEANTE.** `tasks.md > T11` sin marcar y sin un gate en verde registrado.
  - CHECKPOINTS pide todas las tasks `[x]` y `./init.sh` en verde. La bitácora solo trae `INIT_EXIT=1` (`91c56c8`).
  - Falta: `./init.sh` en verde sobre el HEAD final (si vuelve el deadlock de `cobro-tienda-461-completar-migration`, repetirlo; no es de SL-38), su `INIT_EXIT=0` en `progress/impl_SL-38.md`, y T11 `[x]`.
- **B2 — BLOQUEANTE.** `docs/checkpoints-proyecto.md > Flujos críticos`.
  - SL-38 toca datos de negocio y `lib/db/` (`modelos-de-negocio.ts`). Por eso exige correr `e2e/dos-empresas-humo.spec.ts`, y no hay salida suya en la bitácora.
  - También toca el congelado de «Cierres de día» (`CierreDiaRepository`), así que hace falta un E2E de ese flujo (`e2e/cierre-dia.spec.ts`) con su salida local.
  - `e2e/zona-especial-dos-empresas.spec.ts` cubre Tarifas, pero no el humo del menú ni el cierre.
  - Falta: correr los dos (con lock y en una base desechable, como T9) y pegar la salida. Si alguno no puede correr en la app vacía, anotarlo con el motivo para que decida el leader.
- **m1 — menor.** Las ocho lecturas dependen solo de la RLS (respuesta 2). Es el diseño de SL-17, pero conviene que `scripts/verificar-rls-despliegue.ts` sea paso obligatorio del despliegue de SL-38 a prod. Cuenta 74 desde la lista.
- **m2 — menor.** `docs/architecture.md:46` sigue diciendo «Las 73 tablas» en la viñeta de SL-17, y la de SL-38 corrige a 74 debajo. Vale como histórico. Se puede dejar.
- **m3 — menor.** Cinco tests de integración modificados en el diff están en la baseline (app vacía) y no se han ejecutado nunca con el cambio: `cobertura-repository`, `emisor-relaciones-anidadas`, `corregir-datos-cliente.repo`, `costo-y-zona-api-415` y `gestiones-detalle-api-405`. Los verá `gate-completo` cuando SL-31 siembre la base de CI. Que el PR lo diga.
- **m4 — menor.** Después del merge con SL-32, quitar el `as RolValue` del caso superadmin y actualizar la nota de T11 de SL-32 (respuesta 4).

## Veredicto

**RECHAZADO**, por B1 y B2. El código, los tests, las migraciones y el aislamiento están bien: los bloqueantes son de evidencia (gate de cierre registrado y E2E de los flujos críticos), no de diseño. Una vuelta 2 acotada al diff de la bitácora y `tasks.md` basta.
