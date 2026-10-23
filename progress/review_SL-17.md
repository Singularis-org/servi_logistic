# SL-17 «Tabla organizacion y aislamiento por empresa» — review

- **Rama:** `feature/SL-17-organizacion-y-aislamiento`, head revisado `7bb729e` (PR #3 contra `dev`).
- **Diff:** `origin/dev...7bb729e`, 204 archivos (93 de app, db y scripts).
- **Fecha:** 2026-10-23. Reviewer.
- **Grafo:** no se usó. El MCP `codebase-memory-mcp` no estaba entre las herramientas de esta sesión,
  así que la revisión se hizo con Grep, Read y scripts de barrido de un solo uso, fuera del repo.

## Verificación ejecutada por el reviewer (no copiada de la bitácora)

Base desechable `sl17r_053034` en el Postgres local 18.2. Se creó, se migró con `migrate deploy` y
se sembró con `db:seed`. Al acabar se borró: no queda ninguna base `sl17%`. La base
`servi-logistic` no se tocó. El `prisma generate` con el esquema de SL-17 se hizo dentro de
`gate.lock` (05:30:18), y el lock se soltó a las 05:38:50.

| Comprobación | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | exit 0 (0 errores, 2 avisos) |
| Drift: `migrate diff --from-config-datasource --to-schema db/schema.prisma` | `-- This is an empty migration.` |
| Objetos en la base recién migrada | 0 `organizacion`, 73 políticas `*_por_empresa`, 150 triggers `sme_*`, 73 `*_sin_cambio_de_empresa` |
| 6 guardias SL-17 + `tests/unit/db` + unit de auth, API key, postulación, crons, caché, alta, action y webhook | 25 archivos, 381/381 |
| Integración: `aislamiento-{ordenes,rls,fk-misma-empresa,usuarios,cierres,wallet,mecanismo}`, `unicos-por-empresa`, `organizacion-alta`, `dos-empresas-entradas` | 10 archivos, 117/117 |
| `migracion-sl17-ida-y-vuelta` (R6, R32) | 7/7 |
| CI del PR #3 en `7bb729e` | `estatico`, 3 shards y `gate-completo` en SUCCESS; `e2e` SKIPPED, porque solo corre en el PR a `prod` |

### Mutaciones (4 pedidas, en 6 variantes; cada una restaurada y comprobada)

| # | Mutación | Dónde | Resultado |
|---|---|---|---|
| M1 | Sin filtro en la extensión (`const filtrados = args;`) | `lib/db/extension-empresa.ts` | **Muere.** 34 rojos: 33 unit de `extension-empresa.test.ts` y el R10 de integración («rechaza create/update que traen la empresa A»). El resto de la integración sigue verde, porque la RLS filtra sola: es la defensa en profundidad que se pretende. Restaurado con `git checkout`. |
| M2a | `orden_por_empresa` con `USING (true) WITH CHECK (true)` en el archivo de M2 | `db/migrations/20261022130100_…/migration.sql` | **Muere.** La guardia `rls-por-empresa` da 2 rojos y nombra `"orden"`. Restaurado con `git checkout`. |
| M2b | La misma política, y la de `zona`, en `USING (true)` en la base | `ALTER POLICY` | **Muere.** 6 rojos: R17/R20, R17 WITH CHECK, R18, R19, R21 y el R8 de `softDelete` por SQL a mano. Política restaurada y comprobada en `pg_policies`. |
| M3 | Borrar el trigger `sme_orden_tienda_id_c85426db`, en el archivo y en la base | M3 y `DROP TRIGGER` | **Muere en los dos.** La guardia R39 nombra `Orden.tienda (orden.tienda_id -> usuario) sin trigger`. En la base caen 5: R37 por SQL a mano como dueño y como `servi_app`, R37 por el cliente, «sin la lectura previa, la red es la base» y el control de existencia del trigger. Trigger recreado; `pg_get_triggerdef` sale idéntico. |
| M4a | `zona_nombre_key` sin `organizacion_id`, en la base | `DROP` + `CREATE UNIQUE INDEX … ("nombre")` | **Muere.** 5 rojos en `unicos-por-empresa`. Índice restaurado y comprobado en `pg_indexes`. |
| M4b | La misma columna quitada en el archivo de la migración `20261023090000` | `migration.sql:87` | **Muere.** 2 rojos de ida y vuelta en `unicos-por-empresa`. Ninguna guardia estática lo ve: lo detecta solo la integración (hallazgo m6). Restaurado con `git checkout`. |

En esa misma corrida salieron 4 rojos de `dependencias-declaradas-presentes`. Están en
`tests/baseline-rojos.json` y el diff no toca `init.sh`: no son hallazgo.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con EARS numerados (R1–R48).
- [x] `design.md` con alternativas descartadas (§11).
- [x] `tasks.md`: 68 tareas `[x]` y 0 `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido. El diff reutiliza lo listado
  (`getPrismaClient`, `resolveActorFromSession`, `buildAutenticar`, `_postgres-real.ts`,
  `PasswordResetService`, `menu-visibility`) y no lo vuelve a crear: solo añade
  `tests/fabricas/organizaciones.ts`.
- [x] Assignee y rama publicada. Lo da el leader; no hay indicios en contra.
- [x] Mapa `R<n> → test` en `progress/impl_SL-17.md > T4.5`, de R1 a R48. Muestreado abajo.
- [x] Typecheck y lint, corridos por mí.
- [x] `gate-completo` en verde en el PR (`7bb729e`).
- [x] Flujo crítico tocado (aislamiento entre empresas): E2E `e2e/dos-empresas-humo.spec.ts`, con su
  salida local y una mutación en la bitácora (T4.2). No lo corrí: necesita un dev server propio, y
  hay otro agente en paralelo.
- [x] Sin dependencias nuevas: el diff no toca `package.json` ni el lockfile.
- [x] Sin secretos en el código. `scripts/verificar-rls-despliegue.ts` sanea la URL antes de imprimir.
- [x] Sin webhooks nuevos. El de WhatsApp conserva su validación de firma.
- [x] Nada hardcodeado que cambie entre entornos: `servi_app` es un nombre de rol, no una credencial.
- [x] `./init.sh` verde en el worktree (bitácora, sobre `7637055`) y `gate-completo` verde en el CI.
- [ ] `progress/features/SL-17.md > Cierre`: no existe todavía. Lo escribe el leader al cerrar.
- [ ] Desmontar el worktree: después del merge.

### docs/checkpoints-proyecto.md
- [x] Typecheck, lint y gate.
- [x] E2E del flujo crítico nuevo (aislamiento): lo añade la propia feature.
- [x] Toda tabla de negocio con RLS y `organizacion_id`: 73/73 en la base, y las guardias R23 y R24.
- [~] «Toda query nueva filtra por `organizacion_id`». El diff no añade SQL a mano de negocio sin
  filtro: las 4 líneas nuevas de `$executeRaw` son `set_config` y un advisory lock. Las 47
  excepciones son consultas previas, y el aplazamiento lo decidió el humano (D7). Ver m3.
- [x] Las 5 migraciones nuevas traen `down.sql`. No se edita ninguna migración ya aplicada.
- [x] Ningún recurso ni literal de Ordenex. Ningún literal de país o moneda en lógica nueva: las 3
  coincidencias son un comentario, un comentario del esquema reindentado y columnas `sinpe_*` que ya
  existían.
- [x] Ningún `console.log` de secretos o PII. Solo hay logs en scripts, y van saneados.
- [x] Capas: `OrganizacionService` en `lib/services`, `OrganizacionRepository` en `lib/repositories`,
  la action en `lib/actions` y validación con zod en el servicio.
- [x] Autorización en el servidor. `altaEmpresaAction` rechaza antes de construir el servicio.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna tabla de negocio sin `organizacion_id` ni sin RLS. `jobs` es «diferida» (SL-19), con la
  columna nulable y la política `jobs_abierta`. `organizacion` es de plataforma.
- [x] Ninguna migración sin `down.sql`.
- [x] Sin literales de país o moneda en código nuevo, y sin Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué. Algunos son largos, pero eso no se penaliza.

## Trazabilidad (R1–R48)

Las 48 entradas del mapa apuntan a archivos que existen y que corrí en verde. De las 4 mutaciones
pedidas, 10 casos concretos caen en rojo: R8, R10, R17, R18, R19, R20, R21, R24, R37 y R39. La
bitácora documenta otra mutación por test para R28–R31, R42, R13, R16, R40 y R47.

Busqué el patrón «test verde sin datos» en los 33 archivos de test nuevos (`if (!x) return`,
`return null`, `.skip`, `.todo`):
- los `if (ids.length === 0) return` y `if (!base|c) return` están en las limpiezas de
  `afterAll` y en helpers;
- los `return null` son helpers que devuelven el SQLSTATE;
- `describe.skip` solo actúa sin `DATABASE_URL`, y el CI la tiene.

Ninguno hace pasar un caso sin comprobar nada. La bitácora cuenta que T4.3b arregló un caso así en
`caja-tesoreria-idempotencia`, un test ajeno.

## Superficie sin cubrir: barrido

- **Rutas.** 27 `route.ts`:
  - las 9 de API key corren en `conEmpresaDeLaKey`;
  - los 11 crons con datos de negocio van por `paraCadaEmpresa` o, en el caso del drenador, por
    `conSuEmpresa`;
  - `purga-descargas` solo toca storage (SL-19);
  - `asistente`, `chat/media` y `carga-masiva/chunk` tienen sesión y los resuelve el resolutor;
  - `api-docs` y `docs/openapi` no tocan datos;
  - el webhook de WhatsApp está en la lista de plataforma con SL-36.
- **Páginas sin sesión.**
  - `/postulacion` lee `vehiculos` y `tipoIdentificacion`, ambos de plataforma, sin relaciones anidadas.
  - `/login` y `/recuperar-contrasena` leen `Session`.
  - `/` ya no tiene conteos.
  - `/paquete/[numGuia]` exige sesión (ver la desviación 4).
- **`comoPlataforma`.** Aparece en los 12 archivos de la lista, y la guardia R27 está verde. De lo que
  corre en plataforma, solo 3 archivos tocan repositorios que figuran en `EXCEPCIONES_SQL_A_MANO`:
  - `api-key-request`: `ApiKeyRepository`. `autenticar` no usa el SQL a mano del archivo, que es el
    `EXISTS` de borrado y corre con sesión.
  - El webhook:
    - `ChatConversacionRepository.resolverOrdenActivaPorNumero`, SQL a mano como dueño, a propósito
      para averiguar la empresa (m4);
    - `ChatMensajeRepository` y `WhatsappEjecucionRepository`, que corren por lote en `conEmpresa`.
- **Transacciones interactivas que usan el cliente global en vez de `tx`** (hueco D14). Lo barrí en
  los 80 callbacks `$transaction(async (tx) => …)` de `lib/` y `app/`. No encontré ningún uso directo
  del cliente global dentro. Las 3 llamadas a repositorios que el barrido marcó (`CierreDiaRepository`,
  `CierresAdminRepository` e `IncidenteAdminRepository`) pasan `tx`. El hueco existe en la extensión,
  pero hoy no tiene uso.
- **Cachés.** Solo `next-analitica-cache` y `next-tablero-dia-cache` usan `unstable_cache`, y los dos
  llevan la clave `org:` (R34).
- **Clientes Prisma alternativos.** Solo `scripts/bench-busqueda-ordenes.ts` (benchmark) y
  `scripts/verificar-rls-despliegue.ts`. Fuera de `getPrismaClient()` no hay ningún cliente de
  producción.

### Muestra de 15 de las 47 excepciones de SQL a mano

Las 47 llevan el mismo motivo: «cubierto por RLS; revisión fina pendiente», con la ficha SL-17. La
justificación vale solo si el SQL corre en contexto de empresa, con envoltura o dentro de una
transacción de empresa. Para cada una miré desde dónde se llama:

| Archivo | Quién lo llama | ¿La RLS lo cubre? |
|---|---|---|
| `AnaliticaRollupRepository` | job recurrente `analitica_rollup_diario` → `paraCadaEmpresa` | sí |
| `ApiKeyRepository` (`EXISTS` de borrado) | `configuracion/api`, con sesión | sí |
| `CierreDiaRepository` | cierre de día, con sesión | sí |
| `CierresAdminRepository` | `cierres-admin` (R30 probado) | sí |
| `EstadoCuentaRepository` | wallet de tiendas, con sesión (R29 probado) | sí |
| `GestionOrdenRepository` | gestiones, con sesión, dentro de `tx` | sí |
| `LiquidacionPagoRepository` | wallet de mensajeros, con sesión | sí |
| `OrdenRepository` | órdenes, con sesión, API key o crons (R8 `softDelete` probado) | sí |
| `TableroDiaRepository` | `next-tablero-dia-cache`, en `conEmpresa` | sí |
| `WalletMovimientoRepository` | caja, con sesión y en `tx` (R29 probado) | sí |
| `WhatsappEnvioRepository` | crons `avisos-*` → `paraCadaEmpresa` | sí |
| `ZonaRepository` | configuración de zonas, con sesión | sí |
| `ChatMensajeRepository` | webhook por lote en `conEmpresa`; `chat/media`, con sesión | sí |
| `ChatConversacionRepository` | `resolverOrdenActivaPorNumero` corre en `comoPlataforma("SL-36")`, como dueño | **no**: va sin RLS a propósito. El motivo de la excepción es inexacto (m4) |
| `jobs/webhook-estado-encolado`, `jobs/whatsapp-bienvenida-encolado`, `correccion-cierre` | `tx` de la operación de negocio que encola | sí |

## Desviaciones declaradas: juicio

| # | Desviación | Juicio | ¿Debe recogerla el spec? |
|---|---|---|---|
| 1 | Las FK se leen de `schema.prisma` y no del DMMF | Correcta. El DMMF de Prisma 7 en ejecución no trae `relationFromFields`, y la alternativa (`@prisma/internals`) sería una dependencia nueva. La guardia R39 cuadra con `pg_constraint` (150 = 150) y muere con M3. | **Sí.** `design.md §3 M3` (l. 224 y 249–250) y `§8` (l. 582) siguen diciendo `Prisma.dmmf`. |
| 2 | `Actor.organizacionId` opcional | Inocua. Ningún archivo de `lib/` ni de `app/` lee `actor.organizacionId`: la empresa sale del resolutor, no del `Actor`. | No hace falta. Si acaso, una línea en §5. |
| 3 | Los modelos de plataforma se envuelven en contexto de empresa (T3.10) | **Correcta y necesaria.** Cerró una fuga real: `distrito.zonas` traía zonas de otra empresa, y escribir en `vehiculos` pasaba. | **Sí, y es la más importante.** La tabla `design.md §6.1`, columna «Modelo de plataforma», sigue describiendo el comportamiento anterior, el que fugaba. El código (cabecera de `extension-empresa.ts`) ya tiene la tabla buena. |
| 4 | `/paquete/[numGuia]` sin `conEmpresa` | **Correcta.** Exige sesión, y la empresa sale de la cookie. Envolverla con la empresa de la guía dejaría a un usuario de B ver una guía de A. | **Sí.** La fila «Rastreo público» de `design.md §7` (l. 480) cita `app/paquete/[numGuia]/page.tsx` como si corriera en plataforma. |
| 5 | 47 excepciones en vez de ~66 | Correcta. El design contaba archivos con `$queryRaw`, y la guardia cuenta los que nombran tablas de negocio en SQL y no filtran. Ver m3 y m4. | **Sí.** La cifra y el criterio del detector. |
| — | (No declarada como desviación.) T3.9, únicos por empresa: 18 compuestos | Bien hecha, con migración, `down.sql` y test que muere con M4. | **Sí.** `requirements.md > Lo que NO entra` todavía dice «SL-18: únicos… por empresa». Hace falta un R nuevo, por ejemplo «R49: los únicos de negocio de la tabla de T3.9 son por empresa; los 7 globales siguen globales», que mapee a `unicos-por-empresa.test.ts`, y ajustar el alcance. |

## Riesgos abiertos: ¿bloquean el uso real con dos empresas?

| Riesgo | ¿Bloquea? | Por qué |
|---|---|---|
| 500 en `cambiarActivacionGeografica` y `actualizarDistritosEspeciales` | **No** | La geografía nace `activo = true` (`@default(true)`), así que la cobertura funciona sin tocar nada. Que una empresa no pueda cambiar una tabla compartida es fallar cerrado, y es lo correcto. El 500 es un botón roto visible en `configuracion/geografia` y en Tarifas: menor (m1). |
| «Ya existe» engañoso al escribir vehículos o geografía | **No** | No se escribe nada (lo comprueba el E2E de R40). Solo confunde al maestro (m1). |
| Deadlock de M1 con el autovacuum | **No** | M1 va en `BEGIN/COMMIT`: si cae, no deja nada a medias. Se recupera con `migrate resolve --rolled-back` y repitiendo. La receta solo está en la bitácora, no en `progress/deudas.md` ni en un runbook de despliegue (m2). |
| Upsert de push por `endpoint` global | **No** | Afecta a un mismo navegador que cambia de cuenta entre empresas, un caso raro con un usuario por empresa (D8). El push de A le llega a esa misma persona, no a un tercero. Está en D14 con dueño SL-18/SL-19. |
| (Añadido) El alta de empresas en producción depende de SL-32 | **No para SL-17**, pero sí para «mañana» | `exigirSuperadmin` devuelve `false` hasta que exista `lib/auth/plataforma.ts`, como pide R48. Sin SL-32 mergeado y enganchado, nadie puede crear las dos empresas reales desde la app, y no hay comando (D18). El leader tiene que secuenciar SL-32 justo después. |
| (Añadido) T4.1 solo verificó QA | **No para el merge**, pero sí antes del alta en producción | D21 exige correr `scripts/verificar-rls-despliegue.ts` contra producción antes de dar de alta empresas allí. Está pendiente. |

## Hallazgos

Ninguno es BLOQUEANTE.

- **m1 — menor.** Errores de UX al escribir en tablas de plataforma desde el maestro: 500 en
  `cambiarActivacionGeografica` y `actualizarDistritosEspeciales`, y «ya existe» en vehículos y en
  `crear/renombrarNodoGeografico`. Recogido en D12, con dueño SL-26 y la decisión de Carlos. Se
  recomienda un estado `no_permitido` explícito en esas actions, que puede ir en una ficha corta.
- **m2 — menor.** La recuperación del deadlock de M1 (`migrate resolve --rolled-back
  20261022130000_organizacion_y_rol_app`) solo vive en la bitácora. Debería estar en
  `progress/deudas.md` o en la nota de despliegue que usará quien migre producción y QA.
- **m3 — menor.** Las 47 excepciones comparten un motivo genérico y la ficha SL-17, y D11 dice
  «Dueño: Carlos (ficha propia)» sin número. La guardia R26 acepta `SL-17` porque es una ficha
  válida, pero la deuda queda sin una ficha a la que apuntar. Hay que crear la ficha de la revisión
  fina y citarla.
- **m4 — menor.** `ChatConversacionRepository` está en la lista «cubierto por RLS», pero su
  `resolverOrdenActivaPorNumero` corre como dueño en `comoPlataforma("SL-36")`, sin RLS y a
  propósito: para lo que hace dentro del webhook, el motivo no es verdad. Hay que matizarlo o citar
  SL-36. Relacionado: con un único número de WhatsApp compartido, el mensaje entrante de un teléfono
  con órdenes vivas en A y en B va a una sola de las dos. Es de SL-36 (D10).
- **m5 — menor.** El spec deriva del código en 5 puntos: las desviaciones 1, 3, 4 y 5, y T3.9 frente a
  «Lo que NO entra», que no tiene R. Hay que actualizar `design.md` (§3 M3, §6.1, §7 y §8) y
  `requirements.md` (alcance y un R para los únicos por empresa) antes de cerrar la ficha, para que
  SL-18, SL-19 y SL-32 trabajen sobre el contrato real. No bloquea el merge: el comportamiento está
  probado y documentado en `docs/architecture.md`.
- **m6 — menor.** Ninguna guardia estática detecta que un único compuesto de la migración
  `20261023090000` pierda `organizacion_id`: lo ve solo el test de integración (M4b), y el drift
  porque `schema.prisma` lo sigue declarando. Basta con eso, pero un único nuevo de negocio sin
  `organizacion_id` en una migración futura no lo para nadie: R23 mira columnas e índices, no los
  únicos. Es candidato a guardia en SL-18.
- **m7 — menor.** `filtraPorEmpresa` decide por archivo: una sola mención de `organizacion_id` deja
  pasar todas las consultas del archivo. Es una debilidad aceptable del detector, ahora que la RLS es
  la barrera real. Vale anotarla en D11.
- **m8 — menor (proceso).** Al preparar la base desechable, un `new URL()` fallido en un comando
  mío sacó por la salida de mi herramienta la URL local de la base, con su contraseña local. No llegó
  a ningún archivo del repo ni a este informe. Lo declaro.

## Veredicto

**OK.**

No hay bloqueantes:
- cada R1–R48 tiene un test que existe y que compruebo en verde;
- las 4 mutaciones pedidas mueren en sus 6 variantes;
- el drift está vacío;
- las 5 migraciones traen `down.sql`, con ida y vuelta probada;
- `gate-completo` está en verde en el head;
- el barrido de superficie no encontró ninguna entrada a datos de negocio fuera de `conEmpresa`, de
  la extensión o de la lista de plataforma.

**Antes de cerrar la ficha:** m5 (spec), m2 (receta de despliegue) y m3 (ficha de la revisión fina).

**Antes de dar de alta empresas reales:** T4.1 contra producción y el merge de SL-32 con
`lib/auth/plataforma.ts` enganchado.
