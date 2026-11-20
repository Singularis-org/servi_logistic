# Review SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes»

- Rama `feature/SLT-118-planes-facturar-periodo-en-curso`, HEAD `2f99a851`, comparada con `origin/dev`.
- Ruta: completa (dinero, esquema y migración). Revisor: `reviewer`, 2026-11-11.
- El grafo no se consultó; la revisión se hizo con Grep, Read y lectura del diff.

## Verificación ejecutada
- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores (243 avisos, todos heredados).
- `pnpm run test:guardias`: 4 rojos, los 4 de `dependencias-declaradas-presentes`, que son el baseline; pasan 4808.
- Unitarios puntuales, 9 archivos y 289 tests, todos verdes: `jobs-factura-plataforma`, `deuda-plataforma`,
  `planes-service-periodo`, `planes-service-tipo-cobro`, `rastro-periodo` y las guardias
  `cobro-plataforma-solo-por-trigger`, `rls-por-empresa`, `jobs-recurrentes-con-siembra` y
  `jobs-handler-por-tipo`.
- La integración contra Postgres y el E2E no se pudieron correr: no hay base local. Los tests se leyeron y no se dan
  por buenos ni por malos.
- El cuerpo del tope del pago en `20261111130100_factura_plataforma/down.sql:25-75` se comparó con
  `diff` contra el de `20261024140000`: son iguales al carácter.

## Checklist
- [x] Spec completo: `requirements.md` en EARS (R1–R40), `design.md` con alternativas descartadas (§9) y
  `## Lo que ya existe` con contenido. El diff no re-crea nada de esa lista: `plan_costo_*` y `plan_dias_*`
  no existían en ninguna migración anterior.
- [ ] **Tasks: falta una sin marcar.** `tasks.md:89` (T6.2) está en `[ ]`. Además, T10.3 está marcada `[x]` sin
  haberse cumplido (B2).
- [x] Tamaño: 73 archivos y 6 584 líneas. La última línea `tamano-pr-aceptado` de
  `progress/features/SLT-118.md` lo acepta: «todo en un PR, sin tope fijo».
- [x] Trazabilidad: cada R1–R40 nombra al menos un archivo de test que existe y que tiene un `it` con su `R<n>`
  (comprobado con un script sobre `requirements.md`). El mapa R → test está en `progress/impl_SLT-118.md`. Sobre
  R33 hay una nota (m1).
- [x] Typecheck y lint verdes.
- [ ] `./init.sh` en verde: no consta. Corta en el paso del board (cupo del equipo, ajeno a la feature); los pasos
  se corrieron por separado (`progress/impl_SLT-118.md:516-519`).
- [ ] E2E afectados corridos en local: no consta (B2).
- [x] Tabla nueva con `organizacion_id` y su DEFAULT, FK, RLS `…_por_empresa`, REVOKE de escritura, trigger de
  «sin cambio de empresa» y modelo en `MODELOS_DE_NEGOCIO`. Guardia `rls-por-empresa` a 90 tablas.
- [x] Las dos migraciones traen `down.sql`. La de la tabla tiene su negativa (R27): se niega con una cuota o con una
  primera cuota cerrada, y antes toma `LOCK TABLE … ACCESS EXCLUSIVE`. La del enum quita solo su valor con la
  función dinámica que ya usa el repo.
- [x] Sin literales de país ni de moneda y sin recursos de Ordenex en el código nuevo (buscado con grep en `lib`,
  `app`, `db` y `scripts`).
- [x] Escrituras: la guardia `cobro-plataforma-solo-por-trigger` ya cubre `factura_plataforma` (Prisma y SQL, con
  su contraprueba). Ningún archivo de `lib/` ni de `app/` escribe la tabla: solo llaman a funciones del dueño con
  `REVOKE EXECUTE … FROM PUBLIC`. Solo `factura_plataforma_en_curso` tiene GRANT a `servi_app`, y comprueba que la
  empresa pedida sea la del contexto (42501).
- [x] Dependencias: ninguna nueva.

## Revisión de fondo (dinero)
- **Cierre, corte y cuota por adelantado.** En `factura_plataforma_cerrar` (`migration.sql:455-508`) el cerrojo
  `FOR UPDATE` de la empresa es el mismo que toma `aplicarEnTx`, así que un cierre y un cambio se serializan. El
  cierre avanza y cierra en orden de `desde`. La espera de R39 está en `migration.sql:478`. Primero calcula la
  primera cuota (con el plan de la factura cuyo `desde` es la marca) y después la de la emisión (con el plan de N).
  `factura_plataforma_cuota` evita cobrar dos veces el mismo período: mira las cerradas y las marcas de las no
  cerradas, y excluye solo la marca que se está calculando.
  - Recorrí a mano los ejemplos de R8, R15, R16 (los cuatro: inicio el 1 aplicado el 12, quincenal y mensual;
    aplicado el 20; P19; inicio el 16 por la cola), R28, R29 y R38. Todos dan las cifras del spec.
  - Un detalle a favor: en «inicio el 16 por la cola» la cuota de la emisión no duplica la primera, porque ve su
    propia marca.
- **Prorrateo.** `plan_costo_del_tramo` redondea dos veces, sobre el costo del período ya redondeado, como SLT-86
  R12. Hay test gemelo contra `cobro.ts` (R10).
- **Deuda y tope del pago.** La misma fórmula (cargos − reversos + cuota + primera cuota de las cerradas − pagos)
  está en los cuatro sitios:
  - el trigger de la base (`migration.sql:637-639`);
  - `CobroPlataformaMovimientoRepository`, que alimenta la wallet y el tope de la app;
  - `EmpresasPlataformaRepository`, que alimenta el listado del superadmin;
  - `derivarDeudaPlataforma`.

  El `down` repone el cuerpo literal de SL-45. El test de integración de R18 y R19 mira los cuatro sitios.
- **Aislamiento.** RLS `FOR ALL` con REVOKE de escritura. `deEmpresaParaPlataforma` usa `conEmpresa(id, …)`, como
  decidió el humano el 2026-11-11, y baja a `servi_app` con esa empresa.
- **Job.** Es recurrente cada hora a los :10, va en `RECURRENTES_DE_PLATAFORMA`, es de núcleo y su siembra está
  registrada. La `dedupe_key` es por hora: sembrar dos veces no duplica la corrida. Si una empresa falla, el handler
  sigue con las demás y falla al final (R12).
  - Idempotencia: el segundo cierre no encuentra nada vencido, el número sale de `max+1` bajo el cerrojo y
    `factura_plataforma_inmutable` impide tocar una cerrada (SL118).
- **Fecha de efecto del superadmin (P7, P9, P10) y R37.**
  - `efectoAlInicioDelPeriodo` (`PlanesRepository.ts:771`) usa como tipo de referencia el más largo entre el
    vigente y el nuevo, respeta un inicio común y no mueve la primera asignación.
  - El rango de 12 meses se valida sobre la fecha elegida (`fueraDeRango`). `vigenteDesde` devuelve la fecha real
    en asignar, crear custom y cambiar tipo.
  - R37 se comprueba bajo el cerrojo antes de escribir, en asignar, crear custom (revierte con
    `AsignacionRechazada`), cambiar tipo, editar, programar y aplicar lo programado (este último lanza).

## Hallazgos

### Bloqueantes
- **B1. Una task sin marcar:** `specs/SLT-118-planes-facturar-periodo-en-curso/tasks.md:89`. T6.2 sigue en `[ ]`
  (checklist 2 y `CHECKPOINTS.md`).
  - Los casos que pide casi todos tienen su `it` en `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
    (líneas 263-832, más `SL118` en la 832).
  - Lo que falta es marcarla y corregir el texto: lista R33, y el archivo dice en su línea 32 «R33 queda fuera de
    este archivo» (m1).
- **B2. T10.3 marcada sin cumplirse, sin constancia de E2E en local:** `tasks.md:197-198` contra
  `progress/impl_SLT-118.md:516-519`.
  - `./init.sh` no terminó en verde (cortó en el cupo del board).
  - Los E2E `--project=dinero` y `e2e/dos-empresas-humo.spec.ts` no se corrieron en local: «decisión del
    coordinador», no del humano.
  - El diff toca `db/`, pantallas y dinero. `docs/perfil-agentes.md > reviewer` (línea 78) y `> Todos los agentes`
    lo hacen bloqueante.
  - La integración de la feature (unos 3 500 líneas de tests de dinero) tampoco se ha visto correr.
  - Para cumplirlo: correr esos E2E en una base desechable (o que el humano acepte por escrito pasarlos al CI) y
    dejar la constancia; desmarcar T10.3 hasta entonces.

### Menores
- **m1.** `requirements.md:411`: R33 cita como test `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, y
  ese archivo lo excluye en su línea 32. R33 sí tiene test real en
  `tests/integration/db/planes-cambio-empresa.test.ts:717`; el inicio futuro está en `cambio-plan:764`. Falta
  ajustar el mapa del spec y de T6.2.
- **m2.** `lib/planes/jobs-factura-plataforma.ts:88`: `catch {}` tira la causa del fallo de cada empresa. El error
  final solo lleva los ids. En un job de dinero conviene conservar el mensaje o registrarlo (en `jobs-cambio-plan.ts`
  hay precedente del mismo patrón).
- **m3.** `db/migrations/20261111130100_factura_plataforma/migration.sql:557-572`: mientras la cola no aplica una
  primera asignación pendiente con efecto dentro de la factura en curso (R28), `factura_plataforma_en_curso` no
  muestra la primera cuota prevista, porque la marca la pone la toma. R24 queda corto en ese intervalo; la cifra
  cerrada es correcta.
- **m4.** `migration.sql:468,478`: la espera de R39 solo mira `organizacion.plan_cambio_*`. Si el barrido de
  `plan_cambios_vencidos` aplica tarde (después de los :10 del corte) una edición programada de la periodicidad del
  plan con efecto en ese corte, `avanzar` ya habrá abierto la factura siguiente con la periodicidad vieja (R36).
  Solo pasa si la cola va con retraso; conviene documentarlo o cubrirlo.
- **m5.** `lib/repositories/FacturaPlataformaRepository.ts:216`: `deEmpresaParaPlataforma` no tiene llamador ni
  comprueba que quien llama sea superadmin. La acción de SLT-119 «Planes: pantallas de facturas para el superadmin
  y el maestro» tendrá que validarlo en el servidor.

## Veredicto
**RECHAZADO**: 2 bloqueantes (B1, B2) y 5 menores. Ninguno de los dos es un fallo del cálculo de dinero: son de
proceso y de evidencia. En la lógica de facturas, deuda, escrituras, aislamiento, migraciones y job no encontré
bloqueantes.

## Vuelta 2 (acotada a 9da32166..898029b8: merge 1af0ac2c, d8918306, 898029b8)

SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes». Comparada con `origin/dev` (5806824b).

### Checklist
- [x] **B1:** T6.2 marcada `[x]`; `tasks.md` ya no tiene ninguna `[ ]`. Texto corregido: R33 fuera, remite a su test real.
- [x] **B2:** T10.3 deja constancia de que `./init.sh`, la integración y los E2E (`dinero`, `dos-empresas-humo`) los da el
  CI del PR a `dev`, y que no se mergea sin `gate-completo` y `e2e` en verde. Lo decidió el humano (`progress/features/SLT-118.md`,
  línea del 2026-11-11 «tras la revisión»). Ya no es bloqueante; la condición pasa al merge.
- [x] **m1:** R33 cita solo `tests/integration/db/planes-cambio-empresa.test.ts`.
- [x] **m2:** `jobs-factura-plataforma.ts` guarda `{organizacionId, causa}` y el error final lleva ids y causas. Test unitario
  nuevo (Error y no-Error); unit en verde.
- [x] **m3:** `factura_plataforma_en_curso` con primera asignación pendiente (detalle abajo). Coincide con R24 y R28 (P17) en el
  caso que cubre el test.
- [x] **m4:** `factura_plataforma_cerrar` espera también a una edición programada que cambia `periodicidadOrdenes` (clave
  camelCase, la misma que escribe `PlanesRepository.aplicarVersion`). `down.sql` sigue siendo reversible: firmas iguales
  (`cerrar(text, timestamp)`, `en_curso(text)`), sin objetos nuevos, y los DROP las cubren. La migración no está en `origin/dev`,
  así que editarla en sitio es válido.
- [x] **Merge de dev (1af0ac2c):** el choque con SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia
  de plan» en `PlanesRepository.ts` se resolvió uniendo los imports de `@/lib/planes/ciclo` (se añade `inicioDelPeriodoCalendario`).
  Se conservan `esPlanDisponible` y el `FOR SHARE` de SLT-99. En los archivos de planes solo entra lo de dev, sin pérdidas visibles.
  typecheck verde.
- [x] Verificación: typecheck verde; eslint de lo tocado verde; `vitest run tests/unit/planes` + `planes-service-crear-custom`
  453/453; `test:guardias` 4 rojos, todos de `dependencias-declaradas-presentes` (baseline), 4822 pasan. La integración nueva
  (m3, m4) la he leído, no la he corrido: va al CI.
- [x] Tamaño: 73 archivos, 6 785 líneas, aceptado por el humano («todo en un PR, sin tope fijo»).

### m3 en detalle
- **E > D y E < fin natural (R28):** la en curso se muestra con `hasta` = E. Las órdenes se recortan en
  `LEAST(ahora, E)`. La primera cuota es `cuota(E, plan nuevo, tipo nuevo, true)`, y la de la emisión la excluye el filtro de la
  marca. Coincide con lo que hace `tomar_cambio` §5.4 y con el ejemplo de R28: inicio el 18, 13 433.33, la misma cifra pendiente,
  tras la cola y cerrada. Lo cubre el test nuevo de `factura-plataforma-aislamiento.test.ts`, con quincenal y mensual.
- **E = fin natural:** la marca va en la en curso, como en §5.2 vía `avanzar`. Coincide.
- **E ≤ D (la cola va tarde):** la marca va en D, en la por cerrar que acaba en D o, si no hay, en la en curso. Coincide con §5.2 en
  la cuota. Pero la vista no aplica la periodicidad nueva a la en curso (ver m7).

### Hallazgos nuevos
- **m6 (menor).** `design.md §2.6` no se actualizó. Sigue diciendo que «con marca (en la en curso solo puede ser su `desde`, P18)»
  la primera cuota sale del plan de la propia factura. No describe la marca prevista de una primera asignación pendiente
  (recorte en E, primera cuota con `plan_cambio_*`, descarte de la cuota de la emisión). Eso solo está en el comentario de
  `migration.sql:538-543`. Tampoco se añadió el caso al *Test* de R24.
- **m7 (menor).** En `factura_plataforma_en_curso`, rama E ≤ D: `v_hasta` y `periodicidad` salen de la periodicidad de la factura
  (quincenal, sin plan). `tomar_cambio` §5.2, en cambio, pasará la en curso a la periodicidad del plan nuevo y le recalculará el
  fin. Con un plan de órdenes mensuales, mientras la cola no aplica, la vista muestra el fin el 16 y la cuota prevista calculada
  en ese fin. Es una vista transitoria, porque la cifra cerrada es correcta, y ningún test cubre esta rama.
- **m8 (menor, fuera del diff).** `origin/dev` avanzó con SLT-126 «Cobro por orden: retirar el valor propio de la empresa».
  `git merge-tree HEAD origin/dev` da conflicto en `tests/unit/actions/empresas-plataforma.composition-root.test.ts`. Su
  migración `20261113120000` no toca funciones de SLT-118. Hace falta otro merge de dev antes del PR, y que el CI corra sobre él.

### Veredicto vuelta 2
**OK.** B1 y B2 están resueltos (B2 por decisión del humano: el merge exige `gate-completo` y `e2e` en verde) y m1–m4 están
corregidos. m5 está en SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro». Quedan los menores m6–m8, que no
bloquean.

## Vuelta 3 (acotada a 8b1ffdf0..d13cf08b: 3dd042e2, c5556abd, 4cc48462, a7c3b7c6, 7bdb066b, d13cf08b)

### Verificación ejecutada
- [x] typecheck (`tsc --noEmit`) sin errores; eslint sin errores en `scripts/verificar-rls-despliegue.ts`, su test y los tres
  tests de integración de factura tocados.
- [x] `pnpm test:guardias`: 4 rojos, todos de `dependencias-declaradas-presentes` (baseline); 4822 pasan.
- [x] `vitest run tests/unit/scripts/verificar-rls-despliegue.test.ts`: 4/4.
- [x] `git merge-tree HEAD origin/dev`: limpio (dev solo trae SLT-124, sin migraciones ni archivos de esta rama).
- [x] Tamaño: 75 archivos; lo acepta la línea «todo en un PR, sin tope fijo».
- [ ] Integración (T16.3, T16.4, m7 y su gemelo) y `db:migrate`/`db:rollback`: **leídos, no corridos** (sin base local). En
  el PR #130 los shards de vitest y `e2e (dinero)` estaban `pending` al revisar.

### Revisión de fondo (dinero)
- **Factura histórica (R26, T16.2).** La siembra usa `date_trunc('day', created_at − 6 h) + 6 h`, la misma regla que
  `avanzar` paso 1, y `fin_natural_at = plan_fin_periodo_calendario(periodicidad, now())`. La sembrada lleva todo
  `[alta, primer corte)`. `factura_plataforma_ordenes` suma `[desde, hasta)` sin tope de largo, y las facturas
  siguientes empiezan en su `hasta`, así que no hay huecos ni solapes: ninguna orden se duplica ni se pierde. No lleva
  marca. La cuota es la del período que empieza en la emisión, sin las anteriores (P15). Lo verifica el test «alta el 3 de
  septiembre…» con cifras: 350 / 100 / 4 movimientos / cuota 15 500, sin primera cuota, número 1, y la mensual con fin el 1
  de diciembre. Además corre el TEXTO de la siembra (`sembrarComoLaMigracion`, que falla si la siembra cambia de forma), y
  la base propia comprueba `desde` = 00:00 del alta y el fin.
- **`fin_natural_at` (P20).** Lo escribe `abrir`; `avanzar` fija con él (y, por tanto, `cerrar`). `tomar_cambio` §5.2 lo
  recalcula solo si la periodicidad cambia (con la misma lo conserva; ese es el R16 aclarado, y design §2.3 ya está
  alineado). En R28 la factura nueva lo lleva calculado desde E. `en_curso` lee el guardado salvo en la vista previa
  §5.2 con otra periodicidad, que calcula como la toma. El trigger lo congela en una `por_cerrar` (SL118, con test).
- **R36.** Editar el plan no toca facturas; `avanzar` lee el fin guardado. El test T16.3 comprueba `trasEditar ==
  antes`, nada el 15, la fija el 16 y la siguiente mensual con fin el 1 de diciembre.
- **R28 sobre la histórica.** `avanzar(efecto)` no la fija, porque E < fin guardado. Cae en la rama «efecto > D, sin
  plan», que la fija en E (`hasta = E ≤ fin_natural_at`, CHECK ok) con la marca, y abre la nueva con su fin desde E. Las
  órdenes `[alta, E)` van en ella y `[E, …)` en las siguientes. Es correcto, pero no tiene test propio (ver m9).
- **CHECK `factura_plataforma_fin_natural`** (`fin > desde`, `hasta ≤ fin`). Se cumple en todas las escrituras: la
  siembra (el fin es posterior a `now()` y `now()` es posterior al alta), `abrir`, la fijación de `avanzar` (`hasta = fin`),
  R28 (`hasta = E < fin`) y el recálculo de R16. Hay test del 23514. **`down.sql`** no cambia: la columna se va con el
  `DROP TABLE` y ningún otro objeto la nombra; el CI corre la ida y vuelta de la base propia (R27).
- **m7 y su gemelo.** `en_curso`, con `plan_cambio_desde_at ≤ D`, muestra la periodicidad del plan del cambio y, si es
  distinta, el fin recalculado. Es lo que hará la toma, para la primera asignación y para el cambio. Hay dos tests
  nuevos en `aislamiento`, que comparan contra el estado tras la cola. m6 está resuelto: design §2.6 y el *Test* de R24
  ya los incluyen. m8 está resuelto: el merge de dev no deja conflicto.
- **verificar-rls-despliegue.** `MODELOS_DE_NEGOCIO` llega a 90 y el contrato sube a 91 políticas y 90 triggers «sin
  cambio». `triggersMismaEmpresa` se queda en 175, y está justificado: la única FK de `factura_plataforma` es a
  `organizacion`. No baja la exigencia.
- **Trazabilidad R26/R36.** El mapa de `impl_SLT-118.md` cita los `it` nuevos, que existen y nombran su `R<n>` con
  aserciones reales.

### Hallazgos
- **B3 (BLOQUEANTE). T16.1, T16.2, T16.3 y T16.4 están sin marcar** (`tasks.md:193-215`). El checkpoint 2 exige
  todas las tasks en `[x]`. El código y los tests están escritos; falta la constancia. Hay que marcarlas con la misma
  fórmula que T10.3: «Hecho» por el CI del PR (integración de `cierre`, `cambio-plan` y `aislamiento`, y la ida y
  vuelta de la base propia), con la decisión B2 del humano extendida a T16 en `progress/features/SLT-118.md`.
  Otra opción es correr `db:migrate`/`db:rollback` y la integración en una base desechable y dejar la evidencia. En
  cualquier caso, no se mergea sin `gate-completo` en verde.
- **m9 (menor).** Falta un test de R28 sobre la factura histórica: una empresa sembrada sin plan (D = alta, semanas
  antes del corte) a la que se le asigna un primer plan con inicio E entre D y el fin guardado. El caso es de dinero:
  emite al momento `[alta, E)` con la primera cuota. Hoy solo lo cubre el razonamiento de design §2.8 («sin regla
  nueva»). Por eso conviene dejarlo en `factura-plataforma-cambio-plan.test.ts` con `sembrarComoLaMigracion`.
- **m10 (menor, informativo).** Con un inicio pasado (hasta −1 mes) posterior al alta, la histórica cae en R28 y cobra
  la primera cuota desde E. Con la siembra anterior, E ≤ D caía en R16 con la marca en D. Es lo que dicen R28 y design
  §2.8, y la empresa no tenía plan, así que no choca con P15. Lo anoto porque cambia la cifra respecto de antes de la
  decisión de la histórica.

### Veredicto vuelta 3
**RECHAZADO** solo por B3 (tasks T16.1–T16.4 sin marcar). La lógica de dinero revisada (histórica, `fin_natural_at`,
R16, R28, R36, CHECK, `down.sql`, m7 y su gemelo, verificar-rls 90) no tiene defectos. Con B3 resuelto y el CI en verde,
pasa.
