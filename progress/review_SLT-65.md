# review SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo»

Reviewer, F2.2, 2026-11-03. Alcance: solo el diff propio de SLT-65, `ff1ed16f..HEAD` (`ff1ed16f` es el
merge de `feature/SLT-44` en esta rama; desde ahí no entra ningún otro merge). Son 18 commits, de
`b2bade45` a `49b23e2b`, y 56 archivos.

Ya aceptado por el humano, así que no cuenta como hallazgo:
- T8.3 se cerró con excepción: hay un costo fijo de unos 4-5 ms por cada lectura del catálogo;
- T9 no se ejecuta;
- el cupo backend va 4/3;
- los 5 literales de test se enmendaron por decisión humana (2026-10-31 y 2026-11-03).

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint` sobre los `.ts` del diff | 0 errores, 2 warnings. Los dos ya estaban antes: `normalizeName` sin uso en `ZonaRepository.ts:16` ya existía en `ff1ed16f`, y `_args` está en un test. |
| `pnpm run test:guardias` | `1 failed / 324 passed / 3 skipped`. Las 4 rojas son de `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`. |
| Unit: guardias, `zona-repository`, `lugar-orden`, `cierre-dia-repository`, `orden-repository.api-lectura`, `no-regresion-106` | Las únicas rojas son las de la baseline de arriba. |
| Integración SLT-65 (Postgres local) | 11 archivos, `70 passed`, ninguno saltado. Son: `geo-consultas-{ordenes,cierre,conteo,zona}`, `geo-equivalencia-consultas`, `geo-explain-consultas`, `geo-lecturas-sin-backfill`, `geo-65-fixture`, `zona-especial-dos-empresas`, `cierre-detail-congelado` y `asimetria-sin-tarifa`. |
| Integración existente (R8, R14, R16, R18, R27) | `219 passed`, `3 skipped` y 9 rojas, por dos causas. 8 son de `geografia-ordenes-sin-entregar`: está en la baseline y falla en la preparación (`referencia a otra empresa`). 1 es de `geografia-superadmin-sin-empresa`, que se corta en la precondición «la base ya tiene un superadmin»: es el estado de la base local, no el código (ver m6). Entre las verdes están `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro`, `zonas-action`, `geo-nodo-rls`, `geografia-dos-paises`, `cierre-iva-aparte-sl39`, `cierres-admin-service` y `geo-equivalencia-dinero`. |
| `./init.sh` | Se corta en el paso 3 por el cupo backend 4/3, que es la excepción humana. Los pasos que vienen detrás no corren (ver m1). |
| T1.2, copia literal | Comparé con `b2bade4` dos funciones, `findBaseCobroDevolucion` y `leerDescriptivosDeOrdenes`. Solo cambian el `this.prisma` por `cliente` y la cabecera. |
| MCP del grafo | No lo usé. Trabajé con Grep, Read y `git diff`. |

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con R1–R28 en EARS.
- [x] `design.md` con alternativas descartadas (§15).
- [ ] `tasks.md` con todas las tasks `[x]`. Faltan T8.2 (ver m1) y T9.1 y T9.2. T9 no aplica por decisión humana.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: reutiliza `geografia-dominio`, `CatalogoGeograficoRepository`, `zona-colapso` (vía `zonaQueCubre`) y `crearClienteDeSoloLectura`. `compararPorId` se extrae y no se copia.
- [x] Assignee (Camilo) y rama creada con `wt.sh`.
- [x] Cada R1–R28 mapea a un test concreto, y el mapa está en `progress/impl_SLT-65.md` (§«Mapa R → test (R1–R28)»). Leí los casos: cada uno afirma lo que dice. R26 y R28 se cubren con comprobaciones de diff, y las repetí:
  - en `db/` no hay cambios;
  - `lib/db/` solo trae `excepciones-aislamiento.ts`;
  - los filtros y nombres de §2.2 no se tocan.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente, es una condición de merge.
- [ ] E2E de los flujos críticos con su salida local en el impl. La feature toca cierres y `lib/db/`. Por decisión humana («¿E2E nuevo? No») se delega en los E2E existentes, que corren en CI (ver m5).
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni valores de entorno hardcodeados. Los scripts solo corren contra localhost y su conexión es `default_transaction_read_only=on`.
- [ ] `./init.sh` en verde: se corta en el cupo (m1).
- [x] Este archivo existe.
- [ ] El `Cierre` de `progress/features/SLT-65.md` y el desmontaje del worktree se hacen después del merge.

### docs/checkpoints-proyecto.md
- [x] Sin tablas ni migraciones nuevas.
- [x] Las queries nuevas de negocio se acotan por empresa: `deLaEmpresa` toma la empresa del contexto, y si no la hay lanza `EmpresaNoResuelta` (R4). Hay test con dos empresas en `geo-consultas-zona` R17, `geo-consultas-cierre` R17 y `zona-especial-dos-empresas`. El conteo en plataforma es la excepción que pide R12, y tiene su test.
- [x] Nada de Ordenex. Los `console.log` solo están en los scripts y sacan cifras e ids. R24 tiene test de que no salen datos personales.
- [x] Capas: el acceso a datos está en `lib/repositories/` y el dominio en `geografia-dominio`.
- [x] Sin literales de país ni de moneda en el código nuevo. El país del doble de test es `"XX"`.
- [x] Permisos: no cambian.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna query de negocio queda sin empresa, ninguna tabla sin RLS y ninguna migración sin `down.sql` (no hay migraciones).
- [x] Sin literales CR, colones ni SINPE, y sin recursos de Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué. Por ejemplo, el de `whereLugarEn` dice por qué no usa `COALESCE`, y el de `sinTransaccionAnidada` explica el `newTxId`. Hay un comentario desfasado (m2).

## Puntos que pidió el leader

1. **Trazabilidad R1–R28.** Completa. Las suites nuevas tienen antivacío y contraprueba: marca inyectada en un cantón (R1, R5 y R22), cadena incoherente (R11 y R23), INSERT que falla con 25006 (R24) y +19 % / +21 % / Seq Scan (R25).
2. **Los 5 literales enmendados.** Ninguno pierde fuerza:
   - Guardia `zona-reconciliacion-no-retarifa`. Sigue fallando con entrada vacía: `fallosDeLaReconciliacion("")` devuelve «no contiene el `orden.updateMany(`», y ese detector no cambió. `cuerpoDePlanificarReconciliacion` lanza si la función no existe o si no cierra. El antivacío exige `planificarReconciliacion(` en `update`, y `orden.findMany(` y `orden.count(` en el plan. Además gana fuerza: comprueba que el plan no escribe en ningún modelo (`escriturasDelPlan`, con su contraprueba) y que no nombra ninguna tabla de dinero.
   - `zona-repository.test.ts`. Mantiene las dos aserciones de la unión (el conjunto y la longitud 3). Ahora se leen de la llamada que de verdad lleva los lugares. `BASE_D1_ZA` queda escrito literal con la forma de `whereLugarEn`.
   - `emisor-relaciones-anidadas`: 0 lecturas de `provincia` y 2 de `zona`, con su explicación. Conserva el antivacío, `maximoEnVuelo() = 1` y una sola conexión.
   - `gestiones-detalle-api-405`: lectura de calentamiento, después 12 consultas en caliente y la comparación con y sin gestiones sobre la misma base. La lista nombrada se sigue comparando con `toEqual`.
   - Los dos literales de `select` en `orden-repository.api-lectura` y `api-pdf-etiqueta-columna-intacta` siguen afirmando que la relación `distrito` no viaja.
   - Los dos de integración (`emisor` y 405) **no se pudieron medir en local**, porque están en la baseline (m3).
3. **Las dos excepciones de plataforma** de `lib/db/excepciones-aislamiento.ts` son aceptables. Las dos son scripts de consola que no entran al build, rechazan cualquier `DATABASE_URL` que no sea localhost (salida 2, con test `esBaseLocal`) y se conectan con `default_transaction_read_only=on` (test 25006). Cada una tiene su motivo y su ficha. La lista solo la consume la guardia `plataforma-solo-en-lista`, que está en verde, y ninguna ruta de la app.
4. **El rodeo `sin-transaccion-anidada.ts`** es correcto y está acotado:
   - Es un `Proxy` que solo oculta `$transaction`.
   - Se aplica en los dos únicos sitios que cargan el catálogo sobre un `tx`: `leerDescriptivosDeOrdenes` y `ZonaRepository.update`.
   - `OrdenRepository` nunca se construye sobre un `tx` en `lib/` ni en `app/`.
   - Hay test de regresión con el cliente extendido real: `zona-especial-dos-empresas` «SLT-65 R17…», que pasa.
   - El arreglo de raíz sigue pendiente en SLT-44 (m4).
5. **Dinero.** R3 y R5 se prueban fila a fila contra la copia de `b2bade4`: costeo de la API, importes del listado, cobro de la devolución, corrección y congelado del cierre. La equivalencia del script da 0 sobre el fixture y sobre 10 000 órdenes sintéticas. `congeladoDeLaFila` conserva el orden de evaluación de `descriptivoDe`. Con marcas solo en distritos, la orden sin distrito congela la marca del cantón, que es `false`, el mismo valor de antes.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1 (menor). T8.2 sin marcar, y `./init.sh` no pasa del paso 3** por el cupo 4/3, que es la excepción humana. Los pasos de después (`vitest related` y el perfil) no corren en local. Los cubrí con typecheck, lint del diff, todas las guardias y las suites relacionadas (tabla de arriba). Qué falta: el leader anota en `tasks.md` que T8.2 queda cerrada por la excepción del cupo, o se repite `./init.sh` cuando se libere el cupo (al mergear SLT-43 o SLT-44).
- **m2 (menor). `tests/integration/db/emisor-relaciones-anidadas.test.ts:250`.** El comentario «Y las SEIS consultas salieron por la MISMA conexion» ya no es cierto: con la carga del catálogo son más. La aserción (`conexionesUsadas() = 1`) sigue bien. Solo hay que corregir el comentario.
- **m3 (menor, condición de merge). Los literales nuevos de `emisor-relaciones-anidadas`** (0 de `provincia`, 2 de `zona`) **y de `gestiones-detalle-api-405`** (12 en caliente) **no se han medido nunca.** Los dos archivos están en la baseline y no corren con datos en local, así que salen del código y no de una medición. Cuando corran con semilla (CI con semilla o SL-31), hay que confirmarlos.
- **m4 (menor). El arreglo de raíz del `newTxId`** (`{ ...OPCIONES_TRANSACCION }` en `CatalogoGeograficoRepository.enUnaFoto`, que es de SLT-44) solo consta como ABIERTO en `progress/features/SLT-65.md`, no en `progress/deudas.md`. Mientras no se aplique, cualquier repositorio nuevo que cargue el catálogo sobre un `tx` sin `sinTransaccionAnidada` vuelve a romper la siguiente transacción. Qué falta: aplicarlo en SLT-44 antes de su merge, o anotarlo en `deudas.md`.
- **m5 (menor, condición de merge). E2E.** Por decisión humana la feature no deja un E2E nuevo, y en el impl no hay salida local de E2E. Antes de mergear tienen que estar en verde en CI `gate-completo` y `e2e`, y en particular los E2E de cierres y dinero. Como el diff toca `lib/db/`, también `dos-empresas-humo`.
- **m6 (menor). `geografia-superadmin-sin-empresa.test.ts`** (T3.4 dice que «pasa sin cambios») se corta en local en la precondición «la base ya tiene un superadmin que no es de este test». No está en la baseline, y el corte es del estado de la base local, no del diff. Hay que confirmarlo en CI. Además, `geografia-ordenes-sin-entregar` está en la baseline, así que en local la equivalencia del conteo con «hoy» (R11) solo la sostiene `geo-consultas-conteo`, que está en verde.

## Veredicto

**OK.** No hay bloqueantes y hay 6 menores. El merge queda condicionado a lo mismo que pide el proceso: `gate-completo` y `e2e` en verde en CI (m3, m5 y m6), y al cierre de m1 y m4 por parte del leader.

## Vuelta 2 (acotada a b3d7291c..a853b0dc) — 2026-11-04

Alcance: 367b4ba4, el merge de `origin/dev` 0c86d71b (6 conflictos), 7b29903b, el merge de SLT-44 d2769756
y 9b4e0004. No se rehace la trazabilidad R1–R28.

### Checklist
- [x] **Resolución de conflictos sin pérdida (ZonaRepository).** El delta que dev trae a `ZonaRepository.ts`
  (merge-base `62e3d892` → `87fda9f6`) es **idéntico línea a línea** al que entra en la rama (`1c3c37d9` →
  `a853b0dc`): `leerDistritosEnOtraZona`, `esViolacionDistritoUnico`, `CreateZonaResult`, el rastro
  `zona_distrito_cambiado` de SLT-76 y los dos `catch`. La única línea de dev que desaparece es el import
  de `zonaUnicaDeDistrito`, que ya estaba en el merge-base y que SLT-65 sustituyó por `zonaQueCubre`
  (design §6.1). Lo de SLT-65 (`sinTransaccionAnidada`, `nodosBajo`, `whereLugarEn`, `planificarReconciliacion`) sigue.
- [x] **zona-repository.test.** El delta de dev entra entero, salvo dos diferencias de la unión: (1) las
  respuestas de `nmEnOrden` pasan por `filaDeZona`, que es la forma del catálogo de SLT-65; (2) la aserción
  de la segunda lectura de dev (`llamadasNMDeReconciliacion(tx)[1].where.distritoId.in`) se queda en la
  forma `lugaresLeidos` de `orden.count`, que es la enmienda (1) autorizada el 2026-11-03. Conserva el
  conjunto `{dViejo, dQueSigue, dNuevo}` y el «sin repetidos». 61/61 en verde.
- [x] **Los otros 4 conflictos.** `modelos-de-negocio.ts`, `catalogo-y-choke-point.test.ts` y
  `caja-459-migration.test.ts`: el delta de dev entra exacto. Los literales de la unión suman los dos lados
  (75 tipos con `zona_distrito_cambiado`, 28 entidades con `nodo_geografico`, y en caja-459 los tramos
  desplazados uno por cada lado). `deudas.md`: D34 y D35 de dev se quedan y la de SLT-65 pasa a D36, sin
  referencias colgando a «D34» en SLT-65.
- [x] **7b29903b sin `expect` cambiados.** `GeoRepository.listArbol` saca `zonas` (SLT-75 R14) de
  `asignaciones.zonasPorNodo` del catálogo. `lecturas-de-hoy` añade la misma lista para que la
  equivalencia la compare. En `geo-repository-arbol-zonas` solo cambia el doble, y las aserciones quedan
  intactas. `esLecturaDeConflictos` pasa de `select.zona` a `select.distrito`, y es correcto: la carga del
  catálogo (`CatalogoGeograficoRepository:94`) también pide `select.zona`, y solo `leerDistritosEnOtraZona`
  pide `distrito`.
- [x] **9b4e0004 sin `expect` cambiados.** Solo envuelve el escenario en `conEmpresa(A, …)`.
- [~] **367b4ba4.** Cambia **un** `expect`: `toMatchObject({ cantonId: "c-1", … })` pasa a la forma
  `whereLugarEn([c-1, d-1])`, y además suma dos aserciones. La autorización humana existe («Diagnosticar y
  enmendar», Cristian, 2026-11-03), pero solo consta en `progress/impl_SLT-65.md:905`, no en
  `progress/features/SLT-65.md > Decisiones` (m7).
- [ ] **Orden de las migraciones de SLT-43 frente a dev: NO es válido** (B1).
- [x] Typecheck: `tsc --noEmit` sale con 0. Guardias (`tests/guards` + `tests/unit/guards`): 253/254; el único
  rojo es `dependencias-declaradas-presentes`, que está en la baseline. Suites unitarias `tests/unit/db`,
  `tests/unit/repositories`, `tests/unit/historial-accion`, `zona-service` y `geografia-service`: 2535/2536.
  El único rojo es B1.

### Hallazgos

**B1 (BLOQUEANTE). Las seis migraciones de SLT-43 han quedado intercaladas entre las de dev, y las dos
guardias de orden que SLT-43 dejó salen en rojo. Ninguna de las dos está en `tests/baseline-rojos.json`.**
- Dev trae `20261031120000_liberar_recolecciones_recibidas`, con el **mismo timestamp** que
  `20261031120000_geo_enums_nodo_geografico`, y `20261031130000`…`20261102090100`. En disco el orden queda
  así: `geo_enums`, `liberar`, `tipo_nivel` … `indices`, y después las 12 de dev.
- `tests/unit/db/slt43-migraciones-aditivas.test.ts:106`, «las carpetas de SLT-43 son exactamente las
  seis»: el filtro `202610311` recoge también 9 carpetas de dev. **Rojo.** No lo coge `vitest related`
  porque lee del disco, así que `./init.sh` rápido no lo ve, pero `gate-completo` sí.
- `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts:74`, «van en orden detrás de la última de
  dev»: `20261031120100_tipo_nivel_geografico fuera de orden: expected 278 to be 277`. **Rojo.** Su `PREVIA`
  (`20261030120100_incentivo_mensajero_checks`) ya no es la última de dev.
- En producción: `origin/prod` ya tiene aplicadas `20261031120000_liberar…`, `…130000`, `…140000_slt73…`,
  `20261101…` y `20261102…`. Las seis de SLT-43 tienen timestamps anteriores, así que entrarían fuera de
  orden en `migrate deploy`.
- Revisé el contenido y no veo dependencia de datos entre las seis de SLT-43 y las 13 de dev. Dev no toca
  `orden.{provincia,canton,distrito}_id`, `zona_distrito.distrito_id` ni los enums de entidad. SLT-76 añade
  un valor a `historial_accion_tipo` y SLT-43 a `historial_accion_entidad`. Por eso el esquema final sería
  el mismo en los dos órdenes.
- Aun así, la regla que el proyecto sigue (renombres de SLT-43 del 2026-10-30 y el 2026-10-31,
  `progress/impl_SLT-43.md`) es que las seis vayan **detrás de la última de dev**, y sus propios tests lo
  exigen.
- **Qué falta:** renombrar las seis a un timestamp posterior a `20261102090100_slt76_retirar_respaldos` (mismo
  sufijo, mismo SQL). Hay que actualizar el filtro de `slt43-migraciones-aditivas`, `PREVIA` y `M_*` del
  ida-y-vuelta, el comentario de `caja-459-migration.test.ts:133` («SLT-43 (20261031120000)») y las
  referencias del spec y las bitácoras.
- El arreglo es de SLT-43, y SLT-44 lo hereda igual (su merge de dev `62f3dd5e` tiene el mismo estado). El
  leader decide si se hace en SLT-43 y se propaga, o aquí. Mientras tanto, SLT-65 no puede pasar
  `gate-completo`.

**m7 (menor).** La enmienda del `expect` del composition root (367b4ba4) no consta en `progress/features/SLT-65.md > Decisiones`,
solo en la bitácora del implementer. Qué falta: que el leader la anote con la cita de Cristian.

Los menores m1–m6 de la vuelta 1 siguen como estaban. m4 queda registrado como D36.

### Veredicto (vuelta 2)

**RECHAZADO** por B1: las migraciones de SLT-43 no van detrás de las de dev y dos tests de orden fuera de
la baseline salen en rojo. Las resoluciones de conflicto, 7b29903b y 9b4e0004 están bien.

## Vuelta 3 — 2026-11-04 (acotada a 89d82120..42fd8469)

Alcance: cierre de B1 de la vuelta 2 por el merge de SLT-44 (que trae SLT-43 renombrada y SLT-52 por
primera vez), las resoluciones de conflicto en repositorios compartidos y los ajustes mecánicos.
Base: `logistic_slt65_r1104` (localhost). MCP del grafo no usado; Grep/Read y git.

### Checklist

- [x] **Orden de migraciones (B1 vuelta 2).** En `db/migrations` las 6 de SLT-43 son
  `20261104120000`…`20261104120500`, detrás de la última de dev/SLT-52 (`20261103140100`). El listado
  está ordenado y no hay prefijos de SLT-43 repetidos. `prisma migrate status` contra la base: 301/301, al día.
  Ningún archivo de código o test referencia `2026103112010[0-5]00`/`…120500` de SLT-43. `20261031120000`
  solo aparece como `liberar_recolecciones_recibidas` (dev), que sigue. **B1 cerrado.**
- [x] Tests de SLT-43 contra la base: `slt43-migraciones-aditivas` y `migracion-slt43-ida-y-vuelta` en verde.
- [~] **Resoluciones en `CierreDiaRepository` y `OrdenRepository`.** El código de producción une bien los
  dos lados. En `crearCierre`, `...congeladoDeLaFila(f, descriptivos)` (SLT-65) va con `tarifaModelo`,
  `tarifaColumnas(tarifa?.modelo === "viejo" …)`, el `createManyAndReturn` y los conceptos, y el pago
  rebasado (SLT-52) entra completo. La tarifa resuelve por `(tienda, zona, distrito)`. En `OrdenRepository`,
  `distritoId` está una sola vez en select, tipo y `costeo`, más `cantonId`. La marca sale de
  `marcasDeOrdenes`/`esZonaEspecialDeLaOrden`, y `toListItemDTO` recibe `TarifaDeFila` (`tarifa?.cobro`).
  No veo comportamiento perdido en producción. **Pero los dobles de test de SLT-52 no se adaptaron** (B1 abajo).
- [x] `excepciones-aislamiento.ts` deja de listar `DineroProductosRepository`, como en dev y en SLT-44
  (no la quitó el implementer). `ZonaRepository` (update por diferencia, R12 de SLT-52) entra limpio.
- [x] Scripts: `DETALLE_SELECT` suma `tarifaModelo` y `conceptos`, y la llamada es `tarifaDe(d, d.conceptos)`.
  La copia de hoy suma `distritoId`, igual que dev.
- [x] Tests corridos y en verde: `geo-consultas-ordenes`, `geo-consultas-cierre`, `geo-equivalencia-consultas`,
  `cierre-detail-congelado`, `asimetria-sin-tarifa`, `cierre-dia-repository`, `orden-repository`,
  `gestion-desde-ayuda-cierre`. También `tsc --noEmit`, con exit 0.
- [ ] **Unit tests de `tests/unit/{repositories,api,utils,tarifas}`: 9 rojos en 3 archivos, ninguno en la baseline.**
- [x] Decisiones: el Menor m7 y la F2.3 del 2026-11-04 están en `progress/features/SLT-65.md` (líneas 42 y 43).

### Hallazgos

- **BLOQUEANTE B1 — el merge deja en rojo tests de SLT-52 y de la 106 que relaciona el diff.** Ninguno está
  en `tests/baseline-rojos.json`. El implementer no los corrió: su bitácora no los lista.
  - `tests/unit/repositories/cierre-pago-congelado.test.ts` (SLT-52), 7/7 rojos. R40/R42, R40/R46, R40/R34,
    R23 y R42 caen con `TypeError: Cannot read properties of undefined (reading 'findMany')` en
    `CatalogoGeograficoRepository.leerDeLaEmpresa` (`tx.zonaDistrito`), llamado desde
    `leerDescriptivosDeOrdenes` (`CierreDiaRepository.ts:1579`). Los dos R37 esperan
    `ModelosDeTarifaMezclados` y reciben ese `TypeError`. El doble del `tx` no trae
    `...delegadosDelCatalogo(...)`, que es lo que hizo `convergencia-tarifa-listado-cierre` en `resolverPorCierre`.
  - `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`, «SLT-52 T4.4 — el LISTADO cobra con
    esos mismos valores» (R38). Es el mismo `TypeError`, desde `OrdenRepository.marcasDeOrdenes`. El
    `prisma` de ese `it` usa `prismaNuevo()` sin los delegados del catálogo.
  - `tests/unit/repositories/orden-repository.api-lectura.test.ts:146`, R6 (feature 106). El `costeo` recibido
    trae `distritoId: null` y el esperado no lo tiene. La causa es la unión de los dos lados. SLT-65 puso
    `distritoId: null` en `ordenSelectRow` y SLT-52 añadió `distritoId` al `costeo`. En dev pasaba porque la
    fila no traía la clave (`undefined` == ausente para `toEqual`). Es el mismo efecto mecánico que el
    hallazgo m1 de abajo, y arreglarlo también cambia un literal esperado, así que pide la misma autorización.
  - Qué falta: adaptar los dobles de los dos primeros archivos con `delegadosDelCatalogo` (sin tocar ningún
    `expect`) y resolver el R6 de la 106 con la misma autorización que m1. Después, correr
    `pnpm vitest related` sobre `CierreDiaRepository.ts` y `OrdenRepository.ts`.
- **menor m1 (PIDE AUTORIZACIÓN HUMANA) — `geo-consultas-ordenes.test.ts:163-165`.** El `costeo` esperado suma
  `distritoId: f.distritoId`. Dictamen: **es solo el efecto mecánico del campo de SLT-52 y no oculta
  ninguna regresión.**
  - `toApiOrdenRow` pone `distritoId: r.distritoId` en el `costeo` desde SLT-52 (dev, R16/R18: el distrito
    completa el par de la tarifa).
  - La copia de hoy lee la misma columna `orden.distrito_id` (se añadió al `API_ORDEN_SELECT` de la copia,
    igual que en dev).
  - La aserción de la marca no cambia: sigue siendo `esZonaEspecial: esZonaEspecialDeLaEmpresa(f.distrito)`
    frente a la marca nueva del catálogo. `zonaId`, `esCentral`, `montoCobrar`, `cobraComision` y
    `congelado` tampoco cambian.
  - El test pasa contra `logistic_slt65_r1104`.
  - Aun así cambia un literal esperado: queda pendiente de que el humano lo autorice.
- **menor m2 — referencias viejas en el spec.** `specs/SLT-65-geo-jerarquica-consultas/design.md:26` y `:393`
  siguen diciendo que SLT-43 ocupa `20261031120000`–`120500`. Es solo documentación: no rompe nada, pero
  ahora engaña. Mismo caso en `progress/impl_SLT-43.md`, `impl_SLT-44.md`, `impl_SLT-66.md` e
  `impl_SLT-79.md`, que son bitácoras históricas y no se tocan.

### Veredicto (vuelta 3)

**RECHAZADO** por B1: 9 unit tests rojos fuera de la baseline (7 de `cierre-pago-congelado`, 1 de
`convergencia-tarifa-listado-cierre` y el R6 de `orden-repository.api-lectura`). Son dobles de test que no
se adaptaron al catálogo de SLT-65 tras el merge. El código de producción no se pierde. B1 de la vuelta 2
(orden de migraciones) queda cerrado. m1 (literal de `geo-consultas-ordenes`) es mecánico y espera la
autorización humana.

## Vuelta 4 — 2026-11-04 (acotada a 48ebdc3b..72fd897e)

Commits: `9a181b6d` (arreglos) y `72fd897e` (bitácora). Base: `logistic_slt65_r1104`.

### Checklist
- [x] **B1 (dobles).** `cierre-pago-congelado.test.ts` (+10) solo importa `delegadosDelCatalogo` y lo
  esparce en `txCrear` con los nodos `p1`/`ct1`/`d1` (Cartago/Central/Oriental, sin marcas).
  `convergencia-tarifa-listado-cierre.test.ts` (+3) solo lo esparce en el `prisma` del `it` del LISTADO,
  con el nodo `DISTRITO`. Ninguna línea `expect` cambia en ninguno de los dos archivos.
- [x] **m1 (autorizado).** Solo cambia el `costeo` esperado, y en él solo el campo `distritoId`:
  `distritoId: null` en el R6 de `orden-repository.api-lectura.test.ts` (+3, en este rango) y
  `distritoId: f.distritoId` en `geo-consultas-ordenes.test.ts:163-165`. Ese segundo cambio entró en
  `42fd8469`, antes de este rango; el diff de ese merge contra su primer padre añade solo esas 2
  líneas. La marca (`esZonaEspecial`) y los demás campos no cambian. La autorización está en
  `progress/features/SLT-65.md > ## Decisiones` (2026-11-04, Cristian: «Autorizar»).
- [x] **m2.** `design.md:26` y `:393` citan `20261104120000`–`120500`. No queda ningún `20261031` en design.md.
- [x] **Ejecución.** Corrí cada archivo solo, con `timeout 300`, y `DATABASE_URL` apuntando a `logistic_slt65_r1104`:
  - `cierre-pago-congelado`: 11/11.
  - `convergencia-tarifa-listado-cierre`: 10/10.
  - `orden-repository.api-lectura`: 29/29.
  - `geo-consultas-ordenes`: 6/6, ejecutados, ninguno saltado.

### Hallazgos
Ninguno nuevo. B1 y m1 de la vuelta 3 quedan cerrados, y m2 también. No veo regresiones en el rango.

Nota: en local no se corrió la suite unitaria completa porque no cabe en memoria. El leader informa
que pasaron services, analytics, repositories, utils y guards, y que solo falla la baseline. Lo que
falta lo corre `gate-completo` en CI, y no lo cuento como bloqueante.

### Veredicto
**OK.**

## Vuelta 5 — 2026-11-04 (acotada a 73304e1b..ba2a1769)

Alcance: arreglos de los 6 rojos de CI del PR #75 (run 41867912004): d59a3f8f, el merge de SLT-44
68567ea4 (que trae 337bd521 de SLT-43) y las bitacoras. Base: `logistic_slt65_r1104`.

### Checklist
- [x] **1. Prioridad: `EmpresaNoResuelta` en el cierre es cosa del arnes de los tests, no de produccion.**
  - En produccion la empresa de la RLS y la de `contextoActual()` salen de la misma fuente. La
    `$transaction` de empresa (`extension-empresa.ts:282-291`) hace `set_config` con `ctx.organizacionId`
    y corre `fn` dentro de `dentroDeTransaccionDeEmpresa(id)`, asi que las dos coinciden.
  - El cron del corte (`app/api/cron/corte-diario/route.ts:112`) va por `paraCadaEmpresa`, que envuelve
    cada empresa en `conEmpresa(id, ...)` (`para-cada-empresa.ts:78`). La accion `lib/actions/cierre-dia.ts`
    resuelve la empresa por sesion.
  - Superadmin o plataforma: `CatalogoGeograficoRepository.deLaEmpresa` lanza `EmpresaNoResuelta` de
    forma explicita (`:123`), sin leer.
  - Si alguna vez divergieran, `leerDeLaEmpresa` pide `organizacion` por el id del contexto **y** bajo
    la RLS de la conexion. Un desacuerdo da `null`, y con eso lanza `EmpresaNoResuelta`. Falla cerrado:
    nunca devuelve el catalogo del pais de otra empresa.
  - Los unicos `set_config('app.organizacion_id')` a mano fuera de la extension son dos:
    `OrganizacionRepository:67` (alta de empresa) y `PlanesRepository:471` (encolar avisos, y restaura
    el valor anterior). Ninguno pasa por `CierreDiaRepository` ni por el catalogo.
  - La divergencia solo la provoca el helper de test (`comoApp`, que hace `set_config` sin
    `conEmpresa`). El arreglo en el test es correcto y es el mismo patron que `9b4e0004`.
- [x] **2. zona-especial-dos-empresas.** `historial_accion` entra en el `afterAll` y borra por
  `organizacion_id = ANY([A, B])`, las dos empresas creadas por el test. Ningun `it` lee
  `historial_accion`. Solo cambia el orden de la limpieza por la FK RESTRICT; no oculta ninguna aserción.
- [x] **3. geografia-superadmin-sin-empresa (contraprueba).** Desde R10 (`c10045e1`), un id que no
  existe devuelve 0 en `OrdenRepository:2967`, antes de `orden.count`. Con `randomUUID()` la contraprueba
  ya no llegaba al modelo de negocio. Con un distrito real (`profundidad: 3`) el camino es este:
  `nodoGeografico.findUnique` y `dePais` (plataforma, no exigen empresa), y despues `orden.count`
  (negocio), que lanza `EmpresaNoResuelta` fuera de `comoPlataforma`. Sigue probando lo que dice
  su titulo, que el contexto es lo que lo salva. R10 lo cubren sus propios tests y este cambio no lo toca.
  Si la base no tiene distritos, el test lanza un error explicito en vez de pasar en vacio.
- [x] **4. salida-a-reparto-sql-real (337bd521).** Solo cambia el id de la provincia ajena
  (`…-0000` pasa a `…-0001`), que es entrada del escenario. El id del canton y las aserciones siguen igual.
- [x] **5. Ningun `expect` cambio.** En `git diff 73304e1b..ba2a1769 -- tests`, ninguna linea `+`/`-`
  contiene `expect`.

### Verificacion ejecutada (`timeout 600`, un archivo por corrida, `logistic_slt65_r1104`)
- `tarifas-flexibles-snapshot`: 6/6.
- `tarifas-flexibles-base-congelada`: 6/6.
- `zona-distrito-rastro`: 4/4.
- `zona-especial-dos-empresas`: 13/13; el `afterAll` termina sin error.
- `geografia-superadmin-sin-empresa`: 4/4.
- `salida-a-reparto-sql-real`: 7/7.

### Hallazgos
- Ninguno bloqueante.
- menor: la explicacion del arreglo («el catalogo pide `organizacion` por el id del contexto») esta
  copiada en tres tests. Si `comoApp` envolviera `conEmpresa` en un solo sitio, no se repetiria. No
  bloquea, y cambiar la fabrica compartida queda fuera del alcance.

### Veredicto
**OK.**
