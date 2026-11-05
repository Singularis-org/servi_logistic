# SLT-64 «Ciclo de vida dice 0 cerradas con entregas registradas» · revisión F2.2

Rango `c597021b..0060494a`. Alcance R1–R17 (R18–R23 a ficha aparte, decisión de Carlos del 2026-10-30).
Todo lo de abajo lo medí yo, salvo lo marcado. MCP de grafo no usado: bastó Grep/Read sobre el diff.

**Veredicto: RECHAZADO.** Hay 2 hallazgos bloqueantes (B1, B2) y 7 menores. El código de producción no
tiene ningún defecto medido. Lo que falta es un test que mida el desempate de R1 y la evidencia E2E.

## Checklist

### Trazabilidad

Corrí estos archivos contra Postgres local (`.env` del worktree apunta a `localhost`; solo lo comprobé
como booleano). Ninguno de los casos de la ficha se saltó.

| Archivo | Casos | Pasados | Saltados |
|---|---|---|---|
| `tests/integration/db/ciclo-vida-gestion-final.int.test.ts` | 29 | 29 | 0 |
| `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts` | 11 | 11 | 0 |
| `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts` | 12 | 12 | 0 |
| `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts` | 13 | 13 | 0 |
| `tests/unit/analytics/tags-entregas-fuente-unica.test.ts` | 6 | 6 | 0 |
| `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts` | 8 | 8 | 0 |
| `tests/unit/analytics/ciclo-vida.test.ts` | 28 | 28 | 0 |
| `tests/unit/cache/cache-por-empresa.test.ts` | 14 | 14 | 0 |
| `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts` | 4 | 4 | 0 |
| `tests/unit/analytics/refrescar-cache-analitica.test.ts` | 6 | 6 | 0 |
| `tests/unit/analytics/cache-invalidacion-job.test.ts` | 5 | 5 | 0 |
| `tests/unit/actions/cierres-admin-corregir-resultado-action.test.ts` (sin tocar) | 11 | 11 | 0 |
| `tests/integration/actions/cierre-dia-action.test.ts` (sin tocar) | 12 | 12 | 0 |

| R | Test | Estado |
|---|---|---|
| R1 | `ciclo-vida-gestion-final.int`, bloque R1 y casos R3 de empate | **Parcial: B1.** El desempate «la de `id` mayor» no está medido |
| R2 | bloque R2 (`reprogramado`, `novedad`, sin gestión) | OK |
| R3 | bloque R3 | OK en `n = 1` y en quitar `id` de la tupla |
| R4 | bloque R4 | OK |
| R5 | bloque R5 | OK |
| R6 | «R6: `n` y segundos son los mismos…» | OK, ver punto (c) |
| R7 | bloque R7 | OK |
| R8 | «R8: corregida de `entregado`…» | OK, ver punto (c) |
| R9 | bloque R9 | OK, ver punto (d) |
| R10 | `ciclo-vida-resultados-de-cierre.guardia` | OK |
| R11 | «R11: sin rango…» | OK |
| R12 | `deshacer-gestion-invalida-analitica` + `cierre-dia-477-deshacer` y `cierre-dia-service` | OK por composición, ver punto (a) y m1 |
| R13 | `corregir-resultado-invalida-analitica` | OK en unitario; sin navegador ni E2E (B2) |
| R14 | bloque «si no se aplica, no invalida» de los dos archivos | OK |
| R15 | casos «una caché que lanza» y «si falla CONSTRUIR» | OK |
| R16 | casos «R16: el puerto con registro…» | OK |
| R17 | `tags-entregas-fuente-unica` | OK |

### Tasks

- [x] T1–T4 y dos de los tres puntos del cierre.
- [ ] **`./init.sh` en verde** sigue `[ ]` en `tasks.md:117`. El leader informa de `INIT_EXIT=0` en
  `0060494a`; no lo repetí por instrucción suya. Ver m7.

### `CHECKPOINTS.md`

- [x] `requirements.md` con EARS numerados.
- [x] `design.md` con alternativas descartadas (§6).
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de esa lista. La lista de
  etiquetas se extrae, el puerto se reutiliza y el criterio de última gestión se reutiliza.
- [ ] `tasks.md` entera en `[x]`: m7.
- [x] Assignee y rama publicada (`progress/features/SLT-64.md`). El assignee en el tracker no lo
  comprobé contra Jira.
- [~] Cada `R<n>` con test: falta medir una cláusula de R1 (B1).
- [x] `impl_SLT-64.md` contiene el mapa `R<n> → test`.
- [x] Typecheck: `pnpm run typecheck`, exit 0.
- [x] Lint: `eslint` sobre los archivos de lógica y dos tests nuevos, exit 0. El lint global va en el gate.
- [ ] **E2E de flujo crítico con salida local en `impl_SLT-64.md`: B2.**
- [x] Sin dependencias nuevas (`package.json` y `pnpm-lock.yaml` fuera del diff).
- [x] Sin secretos ni valores que cambien entre entornos en el diff.
- [ ] `gate-completo`, `Cierre` de la feature y desmontaje del worktree: aún no tocan (F2.4).

### `docs/checkpoints-proyecto.md`

- [x] `./init.sh`: lo informa el leader, sin repetir.
- [ ] Flujos críticos: `cierre-dia`, `cierres-admin*` y `dos-empresas-humo`: B2.
- [x] Sin tablas ni migraciones (`db/` fuera del diff).
- [x] Query nueva con test de dos empresas, ver punto (d).
- [x] Sin recursos de Ordenex, literales de país o moneda, ni `console.log` en las líneas añadidas.
- [x] Capas: la consulta en el repositorio, la invalidación en la Server Action.
- [x] Entrada validada con zod en el borde: no cambia.
- [x] Permisos: no cambian. La invalidación solo corre tras el `ok` del servicio.

### `docs/perfil-agentes.md > reviewer`

- [x] Sin migración, sin Ordenex, sin literal de país o moneda, sin dependencia nueva.
- [x] La query no lleva `organizacion_id` en el texto, pero es una excepción ya registrada: ver (d).
- [~] Comentarios: explican el porqué, pero quedan dos falsos (m5).

## Mutaciones propias

Cada una se aplicó con un script, se corrió y se revirtió restaurando el contenido original.
`git status --porcelain` quedó vacío al terminar. **28 aplicadas: 27 matadas y 1 superviviente.**

| Mutación | Archivo | Resultado |
|---|---|---|
| `NOT EXISTS` sin `anulada_at` | `CicloVidaRepository` | matada, R7 y R11 |
| consulta externa sin `anulada_at` | `CicloVidaRepository` | matada, R7 |
| tupla sin `id` | `CicloVidaRepository` | matada, R3 y R11 |
| **desempate invertido (`g2.id < g.id`)** | `CicloVidaRepository` | **SOBREVIVE, 29/29 en verde: B1** |
| `NOT EXISTS` limitado en el tiempo | `CicloVidaRepository` | matada, R3 y R5 |
| fin = última transición si existe | `CicloVidaRepository` | matada, R6 |
| excluir gestiones de cierre aprobado | `CicloVidaRepository` | matada, R6 |
| fin = instante de `gestion_corregida` | `CicloVidaRepository` | matada, R8 |
| ventana sobre `o.created_at` | `CicloVidaRepository` | matada, R4 |
| `hasta` inclusivo | `CicloVidaRepository` | matada, R4 |
| sin `${where}` | `CicloVidaRepository` | matada, 23 casos |
| sin `condicionDeAlcance` | `CicloVidaRepository` | matada, R9 «recorta por sí sola» |
| sin `deleted_at` | `CicloVidaRepository` | matada, R9 |
| `EXISTS` de mensajero sin `anulada_at` | `CicloVidaRepository` | matada, R9 |
| la lista pierde `incidente` | `conteo-ciclo-vida` | matada, R1 y otros |
| test de otra empresa sin `comoApp` | el propio test | matada, R9 otra empresa |
| invalidar con cualquier status | `cierre-dia` y `cierres-admin` (2) | matadas, R14 |
| sin `await` | `cierre-dia` | matada, R12 y R15 |
| origen `manual` | `cierre-dia` | matada, R12, R16 y estático |
| lista recortada | `cierre-dia` | matada, R12 y R16 |
| relanzar el fallo | `cierres-admin` | matada, R15 |
| log con el mensaje crudo | `cierres-admin` | matada, R15 |
| no invalidar | `cierres-admin` | matada, R13 y R16 |
| la vía del cierre rechazado no da `ok` | `CierreDiaService` | matada, `cierre-dia-477-deshacer` |
| la vía pendiente no da `ok` | `CierreDiaService` | matada, «bloqueado: se deshace por la rama 454» |
| la vía legada no da `ok` | `CierreDiaService` | matada, 18 casos |
| perfil vuelve a `"max"` | `next-analitica-cache` | matada, `cache-por-empresa` |

## Puntos pedidos de forma expresa

### (a) Las tres vías de R12: cubiertas por composición, sin bloqueo

- **En el código.** `CierreDiaService.ts:926-970` tiene exactamente tres escrituras, y cada una acaba en
  `{ status: "ok", ordenId }`. Si la escritura devuelve `false`, el resultado es `conflict`. La acción
  tiene un solo punto de decisión, `if (r.status === "ok")`, sin ramas por vía.
- **Otras escrituras.** Grep en `lib/`: `anuladaAt: new Date()` solo aparece en esas tres. La única
  corrección de `resultado` es `corregirResultadoGestionEnCierre`. Los dos métodos del servicio solo
  tienen como llamador su Server Action.
- **Los dos eslabones están medidos por separado.** «Vía → `ok`»: las tres mutaciones del servicio
  mueren en tests unitarios de la vía concreta. «`ok` → invalidar»: los tests de la acción.
- **Lo que no prueba nada en CI.** El SQL real de las vías lo cubren `477-deshacer-cierre-rechazado-sql-real`
  y `454/deshacer-ramas-sql-real`, que están en `tests/baseline-rojos.json` (en local: 4 fallados y 6
  saltados). Es deuda ajena, no hallazgo de esta ficha. Consecuencia: «la vía devuelve `ok`» está
  medido con un repositorio doble.
- **En navegador** solo se ejerció la pendiente, según la bitácora. Ningún test une la acción con el
  servicio real por vía: m1.

### (b) `PERFIL_INVALIDACION = { expire: 0 }`: correcto, con coste declarado

- **Es API admitida.** `revalidateTag(tag, { expire: 0 })` está en `revalidate.js` de Next 16.2.10, sin
  distinción entre Server Action y route handler. No choca con el cron de jobs.
- **Tests.** `cache-invalidacion-job` 5/5, `refrescar-cache-analitica` 6/6, `ActualizarAnalitica` y
  `CorregirResultadoCierre` en verde. En los dos handlers de job, en `analitica-refrescar.ts` y en sus
  tests no queda ninguna referencia a `"max"`; en el adaptador solo la del comentario que explica el cambio.
- **Mejora real.** El botón «Actualizar» no cumplía su propio comentario («la siguiente lectura falla
  en caché»). Ahora sí, según la tabla de la bitácora. Esa medición no la repetí.
- **Coste en jobs.** La primera lectura de `TAGS_OPERATIVA` tras el rollup va a la base, sin servir la
  entrada vieja. Esa región no se pinta hoy, así que no se nota.
- **Coste en las acciones.** `revalidate.js:209-212` activa `pathWasRevalidated`. Leído en el cliente:
  - `CierreDiaModule` ya llama a `router.refresh()` tras el `ok`, así que `/cierre-dia` se renderiza
    **dos veces** por cada deshacer: una en la respuesta y otra en el refresh.
  - `CierresAdminModule` hace lo mismo tras corregir (`refrescarListas`).
  - «Actualizar» añade el render de la página a su `mutate` de SWR.
  - Son operaciones poco frecuentes; lo anoto como m3, no como bloqueo. El módulo no sincroniza estado
    desde las props en ese camino, y SWR usa `fallbackData`, así que no veo pérdida de estado por lectura;
    el E2E de B2 es quien lo confirma.
- **Coherencia del spec.** `design.md:170` y el comentario del adaptador lo recogen. Ningún requisito
  lo pide: `R12` y `R13` dicen «invalidar antes de responder» y `R7` habla de «la siguiente lectura sin
  caché». El test solo fija el literal contra un `next/cache` simulado, de modo que la conducta (la
  primera lectura ya trae la cifra) solo la sostiene una medición manual: m2.
- **No medido, y sigue sin medirse:** `next start` y Vercel (m4).

### (c) R6 y R8 con cierre sembrado por el test: aceptable

- `design.md §7` ya remite a `correccion-resultado-gestion.int.test.ts` para sembrar un cierre abierto, y
  `454/_escenario` está en el baseline por faltar datos en CI. El test nuevo corre en la base de CI
  porque siembra lo suyo: no está en `tests/baseline-rojos.json`.
- **Las escrituras son las reales:** `resolverCierre` y `corregirResultadoGestionEnCierre`. Solo los
  libros de dinero van con dobles, y esta lectura no los consulta.
- **Los tests comprueban que la escritura ocurrió** antes de medir la cifra: la transición existe, con
  su `gestionOrdenId` y otro instante; la orden pasa a `entregado`; el resultado cambió y el evento
  `gestion_corregida` tiene otro instante.
- **Muerden.** «Fin = última transición» y «excluir cierre aprobado» solo las mata R6. «Fin = instante
  de la corrección» solo la mata R8.

### (d) R9 y multiempresa: correcto

- **La consulta no filtra por `organizacion_id` en el texto.** `CicloVidaRepository` ya estaba en
  `EXCEPCIONES_SQL_A_MANO` (`lib/db/excepciones-aislamiento.ts:34`), y la guardia
  `sql-a-mano-por-empresa` está en verde. La excepción no se amplía: el archivo ya estaba y la lista no
  crece.
- **La RLS cubre las tres lecturas** (`g`, `o` y `g2`). Las dos tablas tienen política por
  `organizacion_id` para `servi_app`. El plan lo confirma: la condición aparece en `g`, `o` y `g2`.
- **La prueba es real.** El caso «R9: una orden de otra empresa…» lee como `servi_app` con alcance
  global, y afirma antes que las dos filas existen, cada una en su empresa. Si se quita `comoApp`, cae.
- **Caché.** La clave y la etiqueta llevan la empresa (`cache-por-empresa` 14/14). La invalidación
  resuelve la empresa de la sesión, que es la de la orden, porque RLS impide tocar otra.
- `condicionesDeCiclo` solo cambia en su comentario de cabecera.

### (e) Índice y plan: razonable, sin índice nuevo

`EXPLAIN (ANALYZE)` como `servi_app`, con 60 000 órdenes y 90 000 gestiones por empresa en dos empresas,
en una transacción revertida y con `ANALYZE` previo. La mitad de las órdenes acaba en `reprogramado`.

| Caso | Plan | Tiempo |
|---|---|---|
| Rango de 7 días (5 001 gestiones) | `gestion_orden_organizacion_id_created_at_idx` → `orden_pkey` → anti join con `gestion_orden_orden_id_idx` | 103 ms |
| Sin rango (90 000 gestiones) | `gestion_orden_organizacion_id_idx` en paralelo + hash con `orden` → anti join con `gestion_orden_orden_id_idx` | 555 ms |

- Las cifras son de la primera ejecución con caché fría; orientan el orden de magnitud, no son un SLA.
- El `NOT EXISTS` lee 1–2 filas por orden, porque hay pocas gestiones por orden. No crece con la tabla
  entera. La otra empresa no entra en ningún paso.
- `resultado::text IN` no usa índice, pero no hay ninguno sobre `resultado` que perder, y filtra poco.
- La lectura va tras la caché de 15 min. No hace falta índice ni migración.

### (f) Solo comentarios: confirmado

Compilé con TypeScript los blobs de `c597021b` y `0060494a`, sin comentarios, y comparé: idénticos en
`CohorteCargaRepository.ts`, `ventana-de-carga.ts` y `ConteoCargadasPorDiaRepository.ts`. También en
`conteo-entregas-cache.ts`, `entregas-conteo.ts`, `lib/actions/ciclo-vida.ts`, `ICicloVidaRepository.ts`,
`CicloVidaKpi.tsx` y los dos tests de cohorte más la guardia de terminales.

## Hallazgos

### B1 — BLOQUEANTE. El desempate de R1 no está medido, y un test dice que sí

- **Qué pide.** R1: «"Última" es la de `created_at` más reciente y, si hay empate, la de `id` mayor».
- **Qué pasa.** Con `(g2."created_at" > g."created_at" OR (g2."created_at" = g."created_at" AND g2."id" < g."id"))`,
  que elige el `id` **menor**, los 29 casos siguen en verde.
- **Por qué.** «R3: el empate lo decide el `id` mayor» (`ciclo-vida-gestion-final.int.test.ts:289`)
  siembra dos órdenes simétricas con la misma duración. Al invertir, cuenta la otra orden, y el total
  sigue siendo `{ segundosAcum: 14400, n: 1 }`. El caso de empate de R11 no ayuda, porque sus dos
  gestiones son de cierre.
- **Por qué importa.** Ese orden es lo que hace que esta cifra y «Entregado N» elijan la misma gestión.
  `docs/verification.md > Regla del reviewer`: un test que no verifica lo que dice cubrir es bloqueante.
- **Qué falta.** Que las dos órdenes del caso tengan duraciones distintas, por ejemplo cargando una en
  `D_MENOS_1`, de modo que el esperado identifique cuál contó. Debe poner rojo esta mutación.
  El código de producción no cambia.

### B2 — BLOQUEANTE (evidencia). Falta la corrida local del E2E de los flujos críticos que toca

- **Qué piden.** `CHECKPOINTS.md > Calidad de codigo` y `docs/checkpoints-proyecto.md > Flujos críticos`:
  «Cierres de día y su revisión» con su salida en `impl_<key>.md`, y `dos-empresas-humo` para una
  feature que toca datos de negocio.
- **Qué hay.** `impl_SLT-64.md` no trae ninguna corrida de `e2e/`. Sus mediciones con Playwright son un
  spec temporal en `next dev`, ya borrado.
- **Por qué no basta con el CI.** `deshacerGestion` y `corregirResultadoGestion` son el flujo crítico,
  y `{ expire: 0 }` cambia su respuesta: ahora trae la página renderizada. `e2e/cierre-dia.spec.ts:110`
  recorre el deshacer y afirma sobre la fila justo después. Es la conducta que cambió.
  `corregirResultadoGestion` no se ha ejercido nunca en un navegador con este cambio, y **ningún spec de
  `e2e/` lo recorre**.
- **Precedente.** SLT-72 B1, SL-9 y SL-37 se rechazaron por lo mismo.
- **Qué falta.**
  1. Correr `e2e/cierre-dia.spec.ts`, `e2e/cierres-admin.spec.ts` y `e2e/dos-empresas-humo.spec.ts` con
     la receta de `docs/verification.md > El E2E`, y pegar la salida en `impl_SLT-64.md`.
  2. Ejercer `corregirResultadoGestion` una vez en navegador, o decidir de forma explícita un caso E2E,
     y anotar que el diálogo y el detalle siguen funcionando tras la respuesta con render.
- **Por qué no lo corrí yo.** La receta exige una base desechable migrada, y la instrucción de esta
  revisión excluye las migraciones y el E2E entero.

### Menores

- **m1 — menor.** Ningún test une `deshacerGestion` con el servicio real por cada vía (punto (a)). Un
  caso parametrizado, con `CierreDiaService` real, un repositorio doble y una caché espía, cerraría la
  cadena en un archivo. La composición actual sí mata las mutaciones.
- **m2 — menor.** La conducta de `{ expire: 0 }` no está en ningún requisito y solo la fija un literal
  contra un doble (punto (b)). Conviene añadir a R12 y R13 que la primera lectura tras responder trae la
  cifra nueva, con la tabla de la bitácora como evidencia. `progress/features/SLT-64.md > Decisiones`
  tampoco la recoge.
- **m3 — menor.** Doble render de la página por deshacer y por corregir: el de la respuesta de la
  acción y el de `router.refresh()`. El comentario del adaptador avisa del primero, no de la suma. No se
  midió la diferencia de tamaño ni de tiempo con `"max"`. Se puede quitar el `refresh` en otra ficha si
  pesa.
- **m4 — menor.** `{ expire: 0 }` solo se midió en `next dev` con una instancia. Hay que comprobarlo en el
  Preview de `dev` tras el merge: deshacer y recargar una vez. Sin ese dato no se sabe cómo se comporta en
  Vercel. Anotarlo como comprobación de salida.
- **m5 — menor.** Dos comentarios siguen diciendo lo que esta ficha dejó falso, y `design.md §1` pedía
  corregir este tipo de menciones:
  - `lib/types/cohorte-carga.ts:13-14`: «`CicloVidaDTO`… la ventana cae sobre la transicion TERMINAL».
  - `app/(app)/analitica/_components/entregas/base-del-kpi.ts:53-54`: «`CicloVidaKpi`… las que llegaron a
    un estado terminal».
- **m6 — menor.** `design.md:61` dice «comparar `id` uuid», y la columna es `text`. El orden depende de la
  collation de la columna. Es el mismo en `ORDER BY id DESC` de `ConteoPorStatusRepository`, así que no
  rompe la coherencia. Solo corrige el texto.
- **m7 — menor (cierre).** Marcar `tasks.md:117` y actualizar `progress/features/SLT-64.md` (`estado`
  sigue en `pending`, `## Tandas` vacío). «Archivos esperados» de `tasks.md` tampoco lista
  `ConteoCargadasPorDiaRepository.ts` ni `tests/unit/cache/cache-por-empresa.test.ts`.

## Fuera de lo pedido, sin hallazgo

- `impl_SLT-64.md` declara que 12 jobs `geocodificacion` de la base local avanzaron reintentos por el
  cron de la medición y no se pudieron restaurar. Es base local y está anotado.
- Mi medición del plan usó filas sintéticas en una transacción revertida. La base local no cambió.

## Veredicto

**RECHAZADO.** Bloqueantes: B1 y B2. Con el caso de R1 corregido y la salida de los E2E en la bitácora,
la vuelta 2 se puede acotar a ese diff.

## Vuelta 2 (acotada a ada23ade..e5d6f2e5; ampliada a la coherencia de R12 y R13, porque el arreglo enmienda el spec)

**Veredicto: OK.** 0 bloqueantes y 4 menores nuevos (n1–n4). B1 y B2 quedan cerrados. Lo medí yo, salvo
lo marcado. No corrí `./init.sh` ni la suite: el gate lo midió el leader en `e5d6f2e5` (`INIT_EXIT=0`).
**No corrí el E2E:** exige una base desechable migrada, y esta revisión excluye las migraciones. MCP de
grafo no usado: bastó Grep/Read sobre un diff acotado.

### Checklist

- [x] **B1:** matada por aserción, medido.
- [x] **B2, parte 1:** salida de los tres specs en la bitácora. La leí, no la repetí.
- [x] **B2, parte 2:** caso (c) leído. Afirma la cifra, no se salta y la guardia está en verde. Que muera
  con `"max"` lo afirma la bitácora; no lo repetí.
- [x] **m1:** 5 mutaciones propias, todas matadas.
- [x] **m2:** R12 y R13 enmendados, coherentes. Quedan n2 y n4.
- [x] **m5:** los dos comentarios pedidos, corregidos. Aparecieron otros dos: n1.
- [x] **m6:** `design.md` dice `text`; ya no hay ningún «uuid».
- [x] **m7:** `tasks.md` sin ningún `[ ]`, «Archivos esperados» completo, ficha en `in_progress` y `## Tandas` llena.
- [x] **Sin lógica de producción nueva:** medido.
- [x] **Nota de `NEXT_PUBLIC_APP_URL`:** la evidencia la sostiene.
- [x] `git status --porcelain` vacío tras revertir las mutaciones.

### Ejecución

| Archivos | Casos | Pasados | Fallados | Saltados |
|---|---|---|---|---|
| `ciclo-vida-gestion-final.int`, `deshacer-gestion-invalida-analitica`, `e2e-sin-saltos.guardia` y `cache-por-empresa` | 98 | 98 | 0 | 0 |

`ciclo-vida-gestion-final.int` corrió contra la base local del `.env`, sin imprimir ningún valor.

| Mutación propia | Archivo | Resultado |
|---|---|---|
| `(created_at, id) >` pasa a `created_at > … OR (created_at = … AND g2."id" < g."id")` | `CicloVidaRepository` | **Matada, 28/29.** «R3: el empate lo decide el `id` mayor»: `expected { segundosAcum: 100800, n: 1 } to deeply equal { segundosAcum: 14400, n: 1 }` |
| el cierre rechazado cae en la vía pendiente (`cierreId !== null` a `false`) | `CierreDiaService` | Matada, 15/17: «escribe por su vía» y «pierde la carrera», solo en esa vía |
| pendiente: perder la carrera da `ok` | `CierreDiaService` | Matada, 16/17, solo esa vía |
| cierre rechazado: perder la carrera da `ok` | `CierreDiaService` | Matada, 16/17, solo esa vía |
| legada: perder la carrera da `ok` | `CierreDiaService` | Matada, 16/17, solo esa vía |
| legada: escribe además por `anularGestionPendiente` | `CierreDiaService` | Matada, 16/17, por «escribe solo por la suya» |

El caso de B1 cae por aserción y el número esperado identifica qué orden contó: 100 800 s son las 28 h
de `pierdeElCierre`. Las mutaciones de m1 no repiten las de la bitácora: esas quitan el `ok`, y estas
cambian de vía y dan `ok` al perder la carrera.

### Lógica de producción en el rango

- `git diff --stat ada23ade..HEAD`: los únicos archivos de la app son `lib/types/cohorte-carga.ts` y
  `app/(app)/analitica/_components/entregas/base-del-kpi.ts`.
- Compilé con TypeScript sus blobs de `ada23ade` y `HEAD`, sin comentarios: **idénticos**. Los blobs con
  comentarios sí difieren, así que la comparación no es trivial.
- `e2e/cierres-admin.spec.ts` y el resto son tests, specs y bitácoras.

### B2: lo que sostiene la salida y el caso (c)

**Salida.** Cuadra con el código: `cierres-admin.spec.ts:163` y `cierre-dia.spec.ts:98` son las líneas
que imprime el reportero, y los dos specs están en el proyecto `dinero`. 2 + 3 + 8 + 10 = 23 casos.

**El caso (c), por puntos:**

- **Sin salto.** No usa ninguna forma de salto, y `e2e-sin-saltos` está en verde.
- **Sin rama que lo vacíe.** No hay ningún `if` que evite aserciones. Crea sus datos en una empresa propia.
- **La cifra es exacta.** La frase sale de `textoDesenlacesDeFila` (`ProductosTabla.tsx:682`), con el número
  crudo y sin animación. La regex está anclada: `Entregado: 1` no casa con `Entregado: 12`.
- **La primera lectura tiene precondición.** Antes afirma `Entregado: 2`, de modo que hay entrada en caché y
  las dos órdenes caen en la misma fila. Por eso «1» no puede venir de otra fila.
- **R8 se afirma aparte.** «(2 órdenes cerradas)» no baja. Esta aserción no prueba frescura, porque la cifra
  no cambia; la frescura la prueba la frase. El caso no lo presenta de otro modo.
- **Lo que lee.** Es la fila de productos, no la tarjeta «Entregado», aunque el título dice «Entregado».
  El spec lo explica en su comentario, y la adaptación es la misma para las ocho etiquetas. La tarjeta solo
  se midió con el spec temporal de la bitácora (3 → 1). Lo acepto: la mutación que importa es del
  adaptador, no de cada tarjeta.

**Lo que no pude comprobar.** Que el caso muera con `"max"` lo afirma la bitácora. La propia bitácora vio
peticiones RSC a `/analitica` antes de navegar, sin investigar su origen. Si una de esas peticiones hace
revalidar en segundo plano antes del `goto`, esa muerte podría depender del tiempo. No es falso verde con
el código actual, y `cache-por-empresa` fija el `{ expire: 0 }` de forma determinista (la mutación murió
en la vuelta 1), así que no lo bloqueo.

### La nota de `NEXT_PUBLIC_APP_URL`: sostenida

No es una suposición: hay camino de código, experimento antes/después y un precedente escrito.

- **El aviso solo nace en esa rama.** `BienvenidaMaestroService.ts:63-68` escribe esa línea cuando
  `baseUrl === null` y devuelve `no_enviada`. El caso esperaba `sin_correo`, que es lo que da el servicio con
  URL y sin SMTP (`playwright.config.ts:162-163` vacía el SMTP).
- **Falta de verdad.** En el `.env` del worktree, `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL` no tienen
  valor (conteo 0, sin imprimir nada). Son las dos únicas que lee `baseUrlDeLaApp`.
- **Es de la build.** `superadmin-empresas.spec.ts:49-51` y `gate.yml:370-372` lo dicen con sus palabras:
  Next la incrusta al compilar, y sin ella el paso 2 falla.
- **Los recuentos cuadran.** Con el caso 2 de un spec `serial` caído: 4 + 5 de `dinero` = 9 pasados, 1
  fallado, y 5 + 8 de `aislamiento` = 13 sin correr. Es lo que declara.
- **Antes y después.** Con la variable exportada antes de la build, el mismo código da 23/23 dos veces.
- **Sin solape con la rama.** `git diff --name-only origin/dev...HEAD` no toca ese spec, ni el servicio, ni
  `lib/config/email.ts`, ni `app-url.ts`.

Lo único que no verifiqué es la línea de log citada, porque el log ya no existe. Con lo anterior no hace
falta. **No está en `docs/verification.md`:** confirmado por Grep, ver n3.

### Coherencia de R12 y R13

- **Sin choque con lo demás.** R12 y R13 añaden «la primera lectura trae la cifra nueva», y eso encaja con
  `design.md:171`, con el adaptador y con «invalidar antes de responder». Las dos secciones de evidencia que
  citan existen en la bitácora (`Cierre del hallazgo…` en la línea 204, `Vuelta 2` en la 302).
- **R13** tiene test de navegador: (c), con fila propia en la tabla de trazabilidad.
- **R12** se sostiene por composición, sin agujero: el bloque de m1 prueba las tres vías hasta la caché, el
  cableado prueba que la caché es el adaptador real, y el adaptador lo fijan `cache-por-empresa` y (c).
  Ninguna regresión de una sola pieza pasa. La fila explícita falta: n2.
- **m3 y m4 siguen abiertos**, como se pidió. m4 está anotado como comprobación tras el merge. Con R12 y R13
  ya en `DEBE`, ese Preview pasa a ser la comprobación de un requisito, no solo de una optimización.

### Hallazgos de la vuelta 2

- **n1 — menor.** Quedan dos comentarios falsos del mismo tipo que m5. Se me escaparon en la vuelta 1:
  - `base-del-kpi.ts:91`: `CicloVidaKpi` «llegó a estado TERMINAL, fechado en el cierre».
  - `madurez-textos.ts:25`: `CicloVidaKpi` y `CohorteCargaTabla` «cuentan estados terminales» (cierto ya
    solo para el segundo).
- **n2 — menor.** La tabla de trazabilidad de `requirements.md` no dice qué test cubre la cláusula de primera
  lectura de R12. Solo cita evidencia de bitácora. Falta una fila que nombre la composición de arriba.
- **n3 — menor, fuera de esta ficha.** `docs/verification.md > El E2E` no menciona `NEXT_PUBLIC_APP_URL`.
  Quien siga la receta con un `.env` sin ella tropieza con este rojo. Va por `/afinar-regla` o nota aparte.
- **n4 — menor, para el leader.** El `{ expire: 0 }` y la enmienda de R12 y R13 no están en
  `progress/features/SLT-64.md > Decisiones` ni en la tabla de decisiones de `requirements.md`. Solo en
  `## Tandas`, que dice «sin respuesta de Carlos». Son `DEBE` nuevos que el humano no ha visto: decírselo
  en la puerta de F2.4.

### Veredicto de la vuelta 2

**OK.** Ningún bloqueante. n1–n4, m3 y m4 no impiden pasar a F2.3. Sigue siendo obligatorio el
`gate-completo` en CI.
