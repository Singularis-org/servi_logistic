# Review SLT-48 «Geografía jerárquica: retirar modelo viejo»

- Ruta: completa. Zona fullstack, complexity high.
- Diff revisado: `origin/feature/SLT-125-geo-jerarquica-exportes...HEAD` (HEAD `ac4e8ad4`), 245 archivos.
- Reviewer, 2026-11-18. El MCP del grafo no se usó; la revisión se hizo con Grep, Read y ejecución.

## Verificación ejecutada (no la bitácora)

- `pnpm run typecheck`: 0 errores.
- `eslint` sobre los .ts/.tsx añadidos o cambiados: 0 errores.
- `pnpm run test:guardias`: 335/339 archivos en verde (3 skipped). El único rojo es `dependencias-declaradas-presentes` (4 tests), que está en `tests/baseline-rojos.json`.
- Base limpia propia `servi_logistic_slt48_review` (local, `prisma migrate deploy` de todas las migraciones, SLT-48 incluida):
  - lote 1 (13 archivos, 80 tests, todos verdes): `slt48-vistas-geografia`, `migracion-slt48-ida-y-vuelta`, `slt48-triggers-orden-pais`, `slt48-trigger-orden-rendimiento`, `slt48-tarifas-equivalencia`, `slt48-filtro-orden-nueva`, `geografia-mover-nodo`, `geografia-mover-nodo-ordenes`, `aislamiento-rls`, `migracion-sl20-ida-y-vuelta`, `migracion-sl38-ida-y-vuelta`, `geografia-dta-2026-migration` y `tests/unit/db/slt48-migraciones-declaradas`;
  - lote 2 (17 archivos, 16 verdes): `geografia-ordenes-sin-entregar`, `zona-reconciliacion-ordenes`, `informe-transito-nodo`, `cierre-dia-snapshot-nodo`, `carga-masiva-4-niveles`, `orden-nodo-escritura`, `v1-ordenes-lugar.route`, `geografia-por-pais`, `geo-sincronia-orden-zonas`, `geo-sincronia-geografia`, `slt46-nodo-copia-vieja`, `migracion-slt43/46-ida-y-vuelta`, `geo-lecturas-catalogo`, `geografia-catalogo-activo` y `orden-lugar-owner`. El rojo es `corregir-datos-cliente.repo`, que está en el baseline (pide una base sembrada);
  - unit y componentes (17 archivos, 361 tests, todos verdes): `geo-ubicacion`, `geo-resolucion-v1-mensajes`, `bulk-orden-service.n-niveles`, `.forma-pais`, `geografia-dominio.distrito-de-tarifa`, `geografia-plataforma.mover`, `historial-accion-etiquetas-ruta`, `CorregirUbicacionNNiveles`, `MoverNodoDialog`, `TarifasGruposNNiveles`, `ZonasNNiveles`, `GeografiaPlataformaSinAviso`, `CorregirDatosCliente.ordenes`, `.novedades`, `corregir-datos-cliente-service`, `ubicacion-presentacion` y `lugar-orden`.
- No corrí E2E ni `./init.sh`. `init.sh` sale rojo por el cupo del board, y el humano lo aceptó.
- `node scripts/tamano-pr.mjs`: el script no existe en este worktree (el arnés de la rama es anterior). Medí el diff a mano, sin contar `specs/` ni `progress/`: 57 archivos de producción con 3.841 líneas, y 176 de tests con 8.775 líneas.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con R1–R49 en EARS.
- [x] `design.md` con alternativas descartadas (§11, siete).
- [ ] `tasks.md` todo `[x]`: faltan T7.1, T7.3 y T7.4. Son de persona o de CI (equivalencia sobre la copia de producción, `gate-completo` y backup). No los hace un agente, pero la feature no pasa a `done` sin ellos.
- [x] `design.md > ## Lo que ya existe`: presente y con contenido, y el diff no re-crea nada de esa lista. Reutiliza `ruta-del-lugar`, el catálogo, el patrón de `renombrar` (en `mover`), `appendAccionPlataforma` y los scripts `geo:*`.
- [x] Assignee y rama (`progress/features/SLT-48.md`).
- [x] Cada R tiene un test concreto que existe y lo prueba (ver «Trazabilidad»).
- [x] Mapa R → test en `progress/impl_SLT-48.md` › T7.3.
- [x] Typecheck y lint en 0.
- [ ] `gate-completo` en CI: pendiente, todavía no hay PR.
- [x] Flujos críticos: los 14 specs de R49 salieron verdes en local según la bitácora («Ajustes tras T6»). En el diff solo cambian los fixtures `e2e/_planes-fixture.ts` y `_zona-especial-fixture.ts`, y `geo-presentacion-4-niveles` (R26, autorizado). Ningún spec crítico cambia de aserción.
- [x] Sin dependencias nuevas.
- [x] Sin secretos, sin webhooks nuevos y nada de configuración escrito a mano.
- [ ] `./init.sh` en verde: rojo solo por cupo, aceptado por el humano.

### docs/checkpoints-proyecto.md
- [x] No hay tablas nuevas. Las vistas usan `security_invoker` y heredan la RLS `nodo_geografico_del_pais` (R3 probado con `servi_app` y en plataforma).
- [x] Las queries nuevas de negocio filtran por empresa. `mover` es de plataforma (superadmin) y cuenta órdenes de todas las empresas a propósito (P1 dice «de qué empresas»).
- [x] Toda migración trae `down.sql` y ninguna aplicada se editó.
- [x] Nada de Ordenex y ningún `console.log` de PII.
- [x] Las capas se respetan (action → service → repository). zod en el borde (`moverNodoSchema`, `vistaPreviaMoverNodoSchema`).
- [x] No hay literal de país en código nuevo. El `DEFAULT 'CR'` del `down.sql` restaura el DDL anterior tal cual.
- [x] Autorización en el servidor: `puerta` en las dos actions de mover (R34, probado en `geografia-plataforma.mover.test.ts`).

### docs/perfil-agentes.md > reviewer
- [x] Las tablas y queries de negocio llevan `organizacion_id` y RLS, y cada migración trae su `down.sql`.
- [x] Sin literales de país o moneda en código nuevo y sin recursos de Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué.

## Puntos que pidió el humano

### 1. Aserciones cambiadas
Revisé por archivo el diff de cada test modificado: las aserciones que se quitan contra las que se añaden, y las citas `SLT-48`. Las de la tabla «Aserciones autorizadas», las 5 extra y las 4 de «Ubicación incompleta» citan su R y siguen una decisión cerrada: regla de hoja (P2), fin de «país no habilitado», FK en NULL (R15/R16), R9, R25/R26 (D = P), R21 y R34.

También revisé las que no están en la tabla: `zona-nodo-herencia`, `geo-lecturas-catalogo`, `geografia-catalogo-activo`, `geografia-historico-intacto`, `aislamiento-mecanismo`, `ruta-del-lugar`, `corregir-datos-cliente-geo-retirada`, `GeografiaPlataformaAltaPais`, `geografia-plataforma-action` y los dos `CorregirDatosCliente.*`. Son cambios de forma (la terna pasa a `nodoId`, la fábrica escribe nodos) o siguen R17 o R34. Ninguna afloja una regla que siga viva:
- el aislamiento entre empresas se conserva: un distrito de otra empresa sigue dando `null`;
- el `42501` de `servi_app` sobre `provincia` sigue en `aislamiento-rls`, sin cambios y en verde;
- `padre` y los demás nombres siguen prohibidos en la lista de actions. Solo `mover` sale de esa lista (R34).

### 2. T5.1 (17 tests retirados) y la falta de `@test-desaparecido`
Vale. La guardia `test-citado-desaparecido` se pondría roja con una anotación sobre archivos que siguen vivos, así que las notas HTML en los designs de SL-20, SLT-43 y SLT-46, más la §9 de este design, son lo coherente. Comprobé que las reglas que siguen vivas tienen otro test, y que existe y pasa:
- `geo-nodo-invariantes` › R5, R7 y R9;
- `geografia-por-pais` › R11 (otro país, 23503) y R11 (mover a otra provincia de otro país);
- `geografia-admin-n-niveles` › «R16: un hermano…»;
- `slt48-vistas-geografia` › R1, R2 y R5;
- `migracion-slt48-ida-y-vuelta` › R4.

La guardia `geografia-lecturas-sin-nodo-fk` se borró con su `@test-desaparecido` en SLT-44, 65 y 71, y la sustituye `orden-fk-geo-sin-uso` (R29).

### 3. Trazabilidad R1–R49
Todas las rutas del mapa T7.3 existen, y las que corrí prueban su R. R30 y R33 dependen por diseño de la persona (T7.1). R42 tiene su aprobación anotada (T0, 2026-11-17, «Aprobada»).

### 4. Migraciones
- Cada una trae su `down.sql`.
  - El de `20261117120000` es un no-op documentado: Postgres no tiene `DROP VALUE`, y la ida usa `IF NOT EXISTS`.
  - El de `20261117120100` recrea las tablas, los índices, la RLS, las FK, el NOT NULL, las funciones y la sincronía.
  - La ida y vuelta de esquema y datos está probada: ida, vuelta y otra vez ida, comparando funciones por md5 y triggers por `pg_get_triggerdef`.
- La excepción está declarada una por una en `tests/unit/db/slt48-migraciones-declaradas.test.ts`: 24 destructivas y 2 `CREATE OR REPLACE`, exactamente una vez cada una. Tiene contraprueba, y `_migraciones-aditivas.ts` se amplió con la opción nueva, que viene apagada por defecto. R14 (SLT-196) se prohíbe por patrón.
- P5: `down.sql` aborta con `profundidad NOT IN (2,3)` y dice la cuenta (test R12).
- R6: la ida aborta con el nodo en NULL, también en órdenes borradas, y da las cuentas por tabla.
- Vistas: `security_invoker = true`. El trigger `INSTEAD OF` da `SL048` y nombra `nodo_geografico`. `REVOKE ALL` + `GRANT SELECT` a `servi_app`, que recibe `42501` (probado).
- Bloqueos sobre `orden`: solo DDL de catálogo (`DROP CONSTRAINT`, `DROP NOT NULL`, triggers). Nada reescribe la tabla y el `count(*)` va antes de tomar el lock exclusivo. Es aceptable.

### 5. Decisiones
- Hoja = sin hijos activos (`geo-ubicacion.ts:106`, `esHoja`).
- Tarifas: `distritoDeTarifaDelNodo` da grupo solo con profundidad ≥ 3 (P3). Lo usan la cotización, el cierre y el cobro de devolución y de rechazo (`findBaseCobroDevolucion`).
- Mover (`GeoRepository.ts:413` `evaluarMovimiento`, `:916` `mover`):
  - solo a la misma profundidad, y se rechazan raíz, destino inexistente, de otro país y padre actual;
  - P4 con la cascada de retiro, y `conflict`;
  - bloqueo P1 con su cuenta y sus empresas;
  - `cambio_concurrente` con `updateMany` condicionado;
  - historial en la misma transacción;
  - descendientes desglosados por nivel y la fila «Ubicación» (`MoverNodoDialog.tsx:114`).
- v1 igual que hoy: `ApiOrdenLecturaService` no cambia y `v1-ordenes-lugar` compara la respuesta con y sin FK.
- Los 6 textos de CR, «Un/Una <tipo>» (`tarifas-textos.ts:255`) y el aviso único (`CorregirDatosClienteModal.tsx:487-496`) están implementados como se decidió.

### 6. Archivos fuera de `## Archivos esperados`
Solo `specs/SL-20…`, `specs/SLT-43…` y `specs/SLT-46…/design.md` (notas HTML de T5.1, autorizadas el 2026-11-18), y los `specs/`/`progress/` propios. Hay archivos esperados que no se tocaron:
- los del camino B (no se usó);
- `ApiOrdenLecturaService`, `RechazoTiendaService` y `resolver-tarifas` (leen lo que les da el repositorio, que ya pasó al nodo);
- `historial-accion.ts` (decisión e);
- `lugares-del-filtro` y `filtrar-arbol-geografico`;
- algunos tests de la lista que no escriben las tablas viejas, o que pasan intactos sobre una base limpia (`aislamiento-rls`, `migracion-sl20`, `migracion-sl38` y `geografia-dta-2026`, verdes en mi corrida).

### 7. Nada de SLT-196
Confirmado:
- ningún `DROP COLUMN`, `DROP VIEW`, `RENAME` ni NOT NULL del nodo, y no se toca `pais.nivel_N_*`;
- `NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL` y `_shared/zona-colapso.ts` siguen;
- las 3 columnas de nombre de `cierre_detail` se siguen escribiendo (R27).

## Hallazgos

1. **BLOQUEANTE (de proceso, no de código): tamaño del PR sin marca de aceptación y por encima de lo aceptado.**
   - El diff tiene 233 archivos sin contar `specs/` ni `progress/`: 57 de producción con 3.841 líneas y 176 de tests con 8.775.
   - El humano aceptó «~150 archivos: 48 de producción y 85–105 de tests» (requirements › Decisiones, «Tamaño del PR»), y la ficha dice «60-90 de tests».
   - Los tests superan ese tope en un 70 %, y el total en un 55 %.
   - `progress/features/SLT-48.md` no tiene la línea `<!-- tamano-pr-aceptado: AAAA-MM-DD · <motivo> -->`, y `scripts/tamano-pr.mjs` no está en este worktree.
   - Para cumplirlo, el leader enseña las cifras reales al humano y, si este acepta, añade la marca con su frase a `progress/features/SLT-48.md`. El código no cambia.
2. **menor:** R25 dice «los 2 niveles más hondos de la ruta de la orden», pero lo implementado es D = P, es decir los niveles P−1 y P del país (design §5, `ubicacion-presentacion.ts`).
   - En CR y para órdenes en el último nivel da lo mismo.
   - Una hoja más alta que P (por ejemplo, un nivel 3 sin hijos en un país de 4) sale como «Bellavista · vacío».
   - Un nivel 3 en un país de 10 niveles sale con las dos columnas vacías (`ubicacion-presentacion.test.ts`, describe `dosMasHondos`).
   - Lo respalda el design, no el texto de R25. Conviene alinear el texto o confirmarlo con el humano.
3. **menor:** dos tests del mapa están en `tests/baseline-rojos.json`, y CI no detectaría una regresión en ellos.
   - `corregir-datos-cliente.repo` (R16) pide una base sembrada. R16 también lo cubren en Postgres `orden-nodo-escritura` (verde) y los unit y de componente.
   - `geografia-ordenes-sin-entregar` (R24) sale verde en una base limpia: según la regla del baseline, debería salir de la lista en este PR, y el gate avisará.
4. **menor:** con el aviso único, si no hay ningún lugar elegido sigue saliendo «Falta completar: <nivel>.» (`CorregirDatosClienteModal.tsx:491`). Es una interpretación razonable, porque sin lugar no hay a quién nombrar en «Ubicación incompleta». Conviene que el humano la confirme.
5. **menor:** P1 tiene una carrera. `mover` evalúa las órdenes abiertas dentro de la transacción, pero sin bloquear filas. Una orden creada en el subárbol entre esa lectura y el commit no entra en el bloqueo. La ventana es corta y es una operación de superadmin, pero queda anotada.
6. **menor:** en el `down.sql`, una orden creada tras el deploy sin nodo ni FK (SQL a mano) haría fallar `SET NOT NULL` con un error genérico, no con el mensaje de P5. Además, `ADD FOREIGN KEY` valida `orden` entera durante la vuelta. Es aceptable para un rollback.
7. **menor:** quedan T7.1, T7.3 y T7.4 sin marcar: equivalencia y `explain` en la copia de producción, `gate-completo` y backup. Son de persona o de CI y condición para pasar a `done`.

## Veredicto

**RECHAZADO**, solo por el hallazgo 1, que es de proceso: el tamaño real del PR supera lo que aceptó el humano y falta la línea `tamano-pr-aceptado`. El código, las migraciones, la trazabilidad y las decisiones pasan la revisión. Basta que el humano acepte las cifras reales y el leader escriba la marca. Después, una vuelta 2 acotada a ese commit puede cerrar en OK con menores.

## Vuelta 2 (acotada a 36f3e2d3..d8c07742)

Alcance: el tamaño y los commits 970a142e, c85ed6b3 y ab9b1a0d (más 2c33e82a y d8c07742, que son bitácora). El aviso con el formulario vacío no se reabre: el humano decidió que siga «Falta completar: <nivel>.».

### Verificación ejecutada
- Base limpia propia `servi_logistic_slt48_review` con `prisma migrate deploy`, borrada al terminar.
- `pnpm run typecheck`: 0 errores. `eslint` de `GeoRepository.ts` y de los dos tests tocados: 0 errores.
- `vitest` (8 archivos, 43 tests), todos verdes:
  - `geografia-mover-nodo-carrera` (nuevo), `geografia-mover-nodo` y `geografia-mover-nodo-ordenes`;
  - `migracion-slt48-ida-y-vuelta` (con el caso nuevo de R12) y `slt48-migraciones-declaradas`;
  - `geografia-ordenes-sin-entregar` (fuera del baseline), `slt48-trigger-orden-rendimiento` (R10, sigue ≤ 1 ms/fila) y `gate-cableado-arnes-v2` (forma del baseline).

### Hallazgos de la vuelta 1
- **H1 (BLOQUEANTE), tamaño: cerrado.** `progress/features/SLT-48.md:40` tiene `<!-- tamano-pr-aceptado: 2026-11-18 · 233 archivos (57 prod / 176 tests) · aceptado por el humano -->`, que coincide con lo que medí.
- **H2, R25: cerrado.** El texto de R25 ahora dice lo que hace el código: los 2 últimos niveles del país, y la columna que falta vacía (decisión del humano del 2026-11-18). El código no cambia.
- **H3, baseline: cerrado.** `geografia-ordenes-sin-entregar` sale de `tests/baseline-rojos.json` y en base limpia está verde. `corregir-datos-cliente.repo` sigue en el baseline, con R16 cubierto por `orden-nodo-escritura`.
- **H4, aviso con el formulario vacío: cerrado** por decisión del humano.
- **H5, carrera P1: cerrado.**
  - `bloquearNodos` hace `SELECT … ORDER BY id FOR UPDATE` del subárbol antes de contar (`GeoRepository.ts`, en `evaluarMovimiento` solo cuando la llama `mover`; la vista previa no bloquea).
  - El razonamiento es correcto. La comprobación de la FK `orden_nodo_geografico_id` toma `FOR KEY SHARE` del nodo, que choca con `FOR UPDATE`. En READ COMMITTED el conteo posterior es otra sentencia y ve lo confirmado.
  - Los `UPDATE` de órdenes que no cambian el nodo no comprueban la FK y no se bloquean.
  - El test de dos conexiones es real: el implementer documenta el rojo sin el arreglo y yo lo vi en verde con él.
- **H6, `down.sql` y P5: cerrado.**
  - La precondición cuenta también las órdenes sin nodo ni FK y las que tienen FK a medias.
  - Revisé la lógica de `sin_lugar`. Una orden con nodo y las 3 FK en NULL la rellena el paso 3, o la cuenta `en_nodo_que_no_cabe`. Una orden vieja con provincia y cantón no cuenta. Un nodo NULL en el `LEFT JOIN` no cuenta en el `FILTER`.
  - Hay un test nuevo que prueba el mensaje, que no sale 23502 y que el esquema no cambia.
- **H7, tareas T7: sigue** como estaba (persona y CI).

### Riesgo de interbloqueo: mover contra una carga masiva (pedido por el leader)
- **Deadlock.** Es posible cuando una transacción de carga ya tiene `FOR KEY SHARE` de un nodo del subárbol y luego pide otro que `mover` ya bloqueó. El orden por id de `mover` no lo evita, porque la carga toma sus locks en el orden de sus filas.
  - Postgres aborta al proceso que primero corre el detector, es decir, al que empezó a esperar antes. Ese es `mover`: espera a la carga antes de que la carga le espere a él.
  - Así que en el caso normal cae `mover` (40P01). `moverNodoAction` lo devuelve como `error` genérico con log, el superadmin reintenta y no se escribe nada.
  - La conclusión de la bitácora es correcta en eso.
- **menor (nuevo), no es deadlock sino espera larga.** La bitácora dice «la carga no se ve afectada», y no es del todo cierto.
  - Mientras dura la transacción de `mover`, toda escritura de orden que ponga un nodo del subárbol espera. Eso incluye cada chunk de `createManyOrdenesConGuia` (`OrdenRepository.ts:3235`, `$transaction` sin `timeout`, el de Prisma por defecto) y las altas sueltas.
  - `mover` bloquea **antes** de calcular P1, que es la parte cara: su `TIMEOUT_MOVER_MS` es de 30 s porque un nodo alto puede arrastrar miles de órdenes abiertas.
  - Si `mover` tarda más que el `timeout` de la transacción de la carga, el chunk falla con P2028. Es atómico y se puede reintentar, y no corrompe nada, pero el usuario ve un error.
  - Sugerencia, no bloqueante: mover el `FOR UPDATE` a justo antes del conteo de P1 no ayuda, porque el conteo es lo caro. Las opciones son poner un `lock_timeout` corto en `mover` y anotar en `docs/architecture.md` que mover un nodo alto bloquea las altas en ese subárbol mientras dura, o dejar esa nota sola, porque es una operación rara de superadmin.

### Regresiones
Ninguna. El trigger de `orden` y la ida de la migración no cambian, y R10 sigue en verde.

### Veredicto vuelta 2
**OK con menores.** No quedan bloqueantes ni mayores. Quedan como menores la espera de las cargas mientras dura `mover` (arriba) y T7.1, T7.3 y T7.4 pendientes de persona y CI, que son condición para `done`.

## Vuelta 3 (acotada a 906c5cc7..1cc0f397)

Alcance: la decisión del humano «tope corto a mover». Revisé 7f446927, b94c1535 y 1cc0f397, y el archivo nuevo `lib/repositories/_shared/prisma-ocupado.ts`.

### Verificación ejecutada
- Base limpia propia `servi_logistic_slt48_review` (`prisma migrate deploy`), borrada al terminar.
- `pnpm run typecheck`: 0 errores.
- `eslint` de `GeoRepository.ts`, `prisma-ocupado.ts`, `geografia-plataforma.ts`, `MoverNodoDialog.tsx` y `geografia-mover-nodo-cede.test.ts`: 0 errores.
- `vitest` de 7 archivos, 194 tests, todos verdes: `geografia-mover-nodo-cede` (nuevo, 3 casos con dos conexiones), `geografia-mover-nodo-carrera`, `geografia-mover-nodo`, `geografia-mover-nodo-ordenes`, `geografia-plataforma.mover`, `geografia-plataforma-action` y `MoverNodoDialog`.

### P1 sigue cerrado
- **Fase 1, sin bloqueos y fuera de la transacción:** padre de hoy, R35, P4 y el cálculo caro de P1. Si P1 bloquea, devuelve `bloqueado` sin abrir la transacción.
- **Fase 2, en una transacción con `lock_timeout` de 2 s:**
  - bloquea el subárbol con `bloquearNodos` y fija `statement_timeout` = 2 s;
  - `confirmarP1`:
    - **Nodos colgados después:** si algún nodo fuera de la lista tiene el padre dentro del subárbol, da `cambio_concurrente`. Con el subárbol bloqueado no se puede colgar uno nuevo, porque la FK `padre_id` toma `FOR KEY SHARE` y choca.
    - **Órdenes nuevas:** `bloqueoDeMover` con `yaVistas` evalúa toda orden abierta del subárbol que la fase 1 no vio. Eso incluye las creadas entre fases y las que entraron por una corrección. La primera pasada dio `null`, así que el bloqueo de las nuevas es el bloqueo entero.
  - `updateMany` condicionado a `padre_id = padreIdAnterior`, y el historial.
- El test de carrera de la vuelta 2 sigue en verde.

### «Ocupado» no escribe
- La fase 1 solo lee.
- La fase 2 es una sola transacción. 55P03, 57014, 40P01 y P2028/P2034 la revierten entera, sin `padre_id` ni fila de historial. Los tres casos de `geografia-mover-nodo-cede` lo comprueban.
- `moverNodoAction` devuelve `{ status: "conflict", motivo: "ocupado" }` sin log. El modal muestra el aviso y queda en el paso 2 para reintentar (`MoverNodoDialog.test.tsx`).
- `prisma-ocupado.ts` se ve correcto:
  - busca el código en `code`, en `originalCode` y en las causas anidadas, con un tope de profundidad y control de ciclos, y también en el mensaje;
  - solo se usa en la action de mover, así que no oculta errores de otras operaciones;
  - no hay riesgo de clasificar como «ocupado» un fallo de datos: los cinco códigos son de concurrencia o de tiempo.

### Hallazgos

1. **menor: la ventana entre fases no protege el destino ni lo ya visto.**
   - El destino y sus antepasados no se bloquean ni se vuelven a comprobar en la fase 2. Si otro superadmin lo retira o lo mueve mientras corre la fase 1, `mover` cuelga el nodo de un padre retirado (P4) o con un P1 calculado sobre otro árbol.
   - Las órdenes ya vistas (`abiertasVistas`) no se reevalúan. Si una corrección les cambia la zona o el nodo dentro del subárbol entre fases, ese cambio no se mira.
   - Pasaba lo mismo en la vuelta 2, pero ahora la ventana es toda la fase 1, que en un nodo alto puede durar segundos.
   - Arreglo barato: en la fase 2, `FOR SHARE` del destino y sus antepasados, y volver a comprobar `activo`/P4 y su `padre_id`.
   - Es un caso de superadmin contra superadmin, o de corrección contra mover en la misma ventana. No bloquea.
2. **menor: el tope de 4 s. Coherente, pero conviene bajarlo.**
   - El cálculo de la propia doc:
     - una escritura de empresa espera como mucho el `lock_timeout` (2 s), si llega mientras `mover` espera su bloqueo;
     - o el resto de la transacción con los bloqueos tomados (≤ 4 s de `timeout` de Prisma, más una sentencia en vuelo de ≤ 2 s);
     - en total, ~6 s en el peor caso teórico.
   - Para «unos segundos» vale. Contra los 5 s del `timeout` por defecto de cada chunk de la carga masiva (`OrdenRepository.ts:3235`) va justo:
     - el chunk tiene además su propio trabajo (insert, guía, historial);
     - en el peor caso teórico podría caer él en P2028, que es justo lo que la decisión quiere evitar («cede siempre el superadmin»).
   - En la práctica, la fase 2 son unas 10 sentencias de milisegundos, y la espera real de una empresa es la del `lock_timeout` más esos milisegundos.
   - Recomendación: `TOPE_MOVER_MS` = 1 s y `timeout` de la transacción ≈ 2 s. Así el peor caso queda en ~3 s, con margen claro bajo los 5 s del chunk, y el superadmin sigue reintentando muy poco.
   - Los tiempos de `geografia-mover-nodo-cede` salen de las constantes exportadas, así que cambiarlas no exige reescribir el test.
3. **menor: T7.1, T7.3 y T7.4 pendientes**, sin cambios.

### Regresiones
Ninguna:
- la vista previa no cambia: misma `vista`, ahora con `bloqueo` desde `p1.bloqueo`;
- los tests de mover de vueltas anteriores siguen en verde;
- `docs/architecture.md` describe lo implementado.

### Veredicto vuelta 3
**OK con menores.** No hay bloqueantes ni mayores. Recomiendo, sin bloquear, bajar el tope (hallazgo 2) y bloquear y volver a comprobar el destino en la fase 2 (hallazgo 1).

## Vuelta 4 (acotada a b4c957c5..40f83ad8)

Alcance: 648f7eb9 (tope y segunda fase), b7115aa2 (test nuevo) y 40f83ad8 (bitácora).

### Verificación ejecutada
- Base limpia propia `servi_logistic_slt48_review` (`prisma migrate deploy`), borrada al terminar.
- `pnpm run typecheck`: 0 errores. `eslint` de `GeoRepository.ts` y del test nuevo: 0 errores.
- `vitest` de 7 archivos, 71 tests, todos verdes:
  - `geografia-mover-nodo-entre-fases` (nuevo, 4 casos);
  - `-cede`, `-carrera`, `geografia-mover-nodo` y `-ordenes`;
  - `geografia-plataforma.mover` y `MoverNodoDialog`.

### Tope
- `TOPE_MOVER_MS` = 1 s (`lock_timeout` y `statement_timeout`) y `TIMEOUT_TRANSACCION_MOVER_MS` = 2 s.
- Peor caso teórico para una empresa: los 2 s de transacción más una sentencia en vuelo de 1 s, unos 3 s. Deja unos 2 s de margen bajo los 5 s de cada tanda de la carga masiva.
- `docs/architecture.md` y el comentario de `GeoRepository.ts` dicen lo mismo, con los valores medidos (~1 s y ~2 s).
- Hallazgo 2 de la vuelta 3: cerrado.

### Segunda fase
- **Bloqueo:** `bloquearNodos` recibe el subárbol más `cadenaDelDestino` (el destino y sus antepasados).
  - Va en una sola sentencia `… ORDER BY id FOR UPDATE`, así que los bloqueos se toman en orden de id y dos `mover` no se cruzan.
  - El destino y sus antepasados no pueden estar en el subárbol, porque son de menos profundidad. Si se repitiera un id, `ANY` lo absorbe.
- **Revisión:** `destinoSigueIgual` comprueba, con los bloqueos tomados, que cada nodo de la cadena existe, está activo y tiene el mismo padre (P4 y el árbol de P1). Si no, `cambio_concurrente`.
- **Órdenes ya vistas:** `firmaDeOrden` (empresa, zona y nodo). Una orden vista cuya firma cambió vuelve a pasar por P1. Las nuevas siguen pasando. No cuesta una consulta más.
- **Coste:** las altas de orden o de hijos que apunten a un antepasado del destino también esperan, con el mismo tope.
- Hallazgo 1 de la vuelta 3: cerrado.

### Test nuevo
`geografia-mover-nodo-entre-fases`, 4 casos, verdes:
- el destino se retira;
- un antepasado se retira;
- el destino cambia de padre;
- una orden vista cambia de nodo y queda afectada.

Los tres primeros dan `cambio_concurrente` sin escribir. El cuarto da `bloqueado` (P1).

### Límites anotados en la bitácora: ¿pesan?
- **Cambio de tarifas o marcas de una empresa entre las dos fases: no pesa.**
  - Hace falta que el maestro de una empresa edite grupos o marcas de ese subárbol justo durante la fase 1 de un `mover` de plataforma, que es una operación rara.
  - El efecto posible es un movimiento que P1 habría bloqueado con las tarifas nuevas. No hay pérdida de datos: es el mismo efecto que esa edición de tarifas tendría por sí sola sobre las órdenes abiertas.
  - Basta con dejarlo anotado.
- **Cambio de zona sin test propio: no pesa.**
  - La zona entra en la misma `firmaDeOrden` que el nodo, y la compara la misma línea (`yaVistas.get(o.id) === firmaDeOrden(orden)`).
  - El caso del nodo ya ejercita ese camino.

### Regresiones
Ninguna. La vista previa no cambia, y los tests de mover de las vueltas 1 a 3 siguen en verde.

### Veredicto vuelta 4
**OK.** No quedan bloqueantes, mayores ni menores de código. Para pasar a `done` solo quedan T7.1, T7.3 y T7.4, que hacen una persona y el CI: equivalencia y `explain` sobre la copia de producción, `gate-completo` en verde y backup.
