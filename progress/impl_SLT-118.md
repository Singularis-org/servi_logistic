# SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» · bitácora del implementer

## Tanda 1 (antes del cambio de diseño)
- `d237afe7` T1.1–T1.2: modelo `FacturaPlataforma`, `factura_plataforma_cerrar` en `JobTipo`, clasificación.
- `0e58af60` T2.1–T2.3: migraciones `20261111130000_factura_plataforma_job_enum` y `20261111130100_factura_plataforma`.

## Tanda 2 — rehacer schema y migración (T1.3, T2.4–T2.6) · `025a3f2a`
Subagente: `backend_dev`.

Archivos:
- `db/schema.prisma`: `Plan.periodicidadOrdenes` (`@default("quincenal")`); en `FacturaPlataforma`, `periodicidad`,
  las 5 `cuota*`, la marca `primeraCuotaDesdeAt` y las 8 `primeraCuota*`.
- `db/migrations/20261111130100_factura_plataforma/migration.sql`: columna y CHECK de `plan.periodicidad_ordenes`;
  columnas y CHECK de design §1.1; trigger (periodicidad congelada en `por_cerrar`, marca solo de nula a valor);
  `abrir`/`avanzar`/`tomar_cambio` (firma de T2) por §2.2–§2.3; `cifras` → `ordenes(org,desde,hasta)` +
  `cuota(org,tramo_desde,plan,tipo,primera)`; `cerrar` con la espera de R39 y las dos cuotas; `en_curso` con
  `periodicidad`, `cuota_prevista` y `primera_cuota_prevista`; tope del pago suma `cuota + primera_cuota`; siembra
  desde el inicio del corte, sin marca.
- `db/migrations/20261111130100_factura_plataforma/down.sql`: negativa si hay una cerrada con `cuota` o
  `primera_cuota` no nulas; DROP con las firmas nuevas; `DROP COLUMN "periodicidad_ordenes"`.

Decisiones del subagente (no fijadas por el design):
- `factura_plataforma_cuota` devuelve cero filas si no hay cuota; el nombre del plan se lee de `plan` al cerrar.
- El plan de la primera cuota es el de la factura cuyo `desde` es la marca (también en una `por_cerrar` con la marca
  en su `hasta`).
- JSON de `en_curso`: `cuota_prevista` y `primera_cuota_prevista`, cada una
  `{plan_id, plan_nombre, tipo_cobro, desde, hasta, precio_mensual, cuota, dias_cobrados, dias_periodo}` o `null`.
  T4.1/T8.1 leen esas claves.

Pregunta abierta: sin cambio pendiente, `en_curso` calcula la cuota prevista con el plan vigente (design §2.6) y
`cerrar` con el plan de la factura siguiente; solo difieren en el caso heredado de R15 (pendiente a mitad de
factura). ¿Se igualan?

Verificación:
- `prisma generate` con URL vacía sin credenciales: cliente generado.
- typecheck: 1 error heredado de T1 (`lib/modulos/reparto.ts:224`, falta `factura_plataforma_cerrar` en
  `MODULO_POR_JOB`); lo cierra T4.4.
- `pnpm test:guardias`: 336 archivos verdes; 6 tests rojos = 4 baseline (`dependencias-declaradas-presentes`) +
  `jobs-handler-por-tipo` (T4.4) + `rls-por-empresa` 89→90 (T5.2). Los dos últimos vienen de `0e58af60`.
- `db:migrate`/`db:rollback`: sin base desechable en esta máquina (sin Docker ni psql); quedan para el CI.

## Tanda 3 — toma del cambio, repositorio, proceso y guardias (T3.1, T4.1–T4.4, T5.1–T5.2) · sin commit
Subagente: `backend_dev`.

Archivos:
- `lib/repositories/PlanesRepository.ts`: `aplicarEnTx` llama a `factura_plataforma_tomar_cambio(empresa, desde, plan, tipo)` antes del `UPDATE "organizacion"`.
- `lib/types/factura-plataforma.ts` (nuevo): `EstadoFactura`, `PeriodicidadFactura`, `PlanDeLaFactura`, `CuotaDeLaFactura` (forma de `cuota_*`/`primera_cuota_*` y de las previstas de `en_curso`) y `FacturaPlataformaDTO`.
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts` (nuevo): `empresasACerrar()`, `cerrar(org, ahora)`. Las lecturas quedan para T8.1.
- `lib/repositories/FacturaPlataformaRepository.ts` (nuevo): las dos, en `comoPlataforma("SL-24", …)`; `cerrar` = `SELECT factura_plataforma_cerrar(…)`.
- `lib/db/excepciones-aislamiento.ts`: su entrada en `EXCEPCIONES_DE_PLATAFORMA`.
- `lib/planes/jobs-factura-plataforma.ts` (nuevo): composition root, recurrencia HH:10 (`factura_plataforma_cerrar:<AAAA-MM-DDTHH>`), siembra y handler (R12).
- `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`, `scripts/siembra-jobs-recurrentes.ts`: registro.
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: detectores, contraprueba y barrido de `factura_plataforma` (R22).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 89 → 90.

Decisiones: `empresasACerrar` devuelve todas las empresas (por `createdAt`): `cerrar` también abre la primera factura de
una empresa nueva y avanza la en curso, así que filtrar por «tiene por cerrar» dejaría fuera esos casos.

Bloqueo: el registro del tipo nuevo pone rojos tests que enumeran handlers/recurrencias, fuera de los archivos
permitidos: `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`, `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`
(lista, ventana horaria a los :10 y la prueba de idempotencia contra Postgres de `sembrarCierreFacturas`, que pide un test de
integración), `tests/unit/api/procesar-jobs-registro.test.ts`, `tests/unit/services/jobs-registro.test.ts`,
`tests/integration/api/procesar-jobs-geocodificacion.test.ts`, `tests/integration/api/procesar-jobs-webhook-estado.test.ts`;
y T3.1 pone rojo `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (cuenta 1 `$executeRaw`, ahora 2).

Verificación: typecheck verde; eslint de los 11 archivos verde; `test:guardias` 8 rojos = 4 baseline + 4 del bloqueo.

## Tanda 4 — rama verde y cuota prevista igual a `cerrar`
Subagente: `backend_dev`.

Archivos:
- `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`, `tests/unit/api/procesar-jobs-registro.test.ts`,
  `tests/unit/services/jobs-registro.test.ts`, `tests/integration/api/procesar-jobs-geocodificacion.test.ts`
  (size 4 → 5 y `has`), `tests/integration/api/procesar-jobs-webhook-estado.test.ts` (lista en orden de inserción):
  `factura_plataforma_cerrar` en los censos EXACTOS de handlers y recurrencias.
- `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`: el tipo en el censo; `MAS_TARDE_POR_TIPO` =
  16:09:59.999 (desde 16:00 la ventana es la corrida de las 16:10); la prueba de idempotencia contra Postgres
  (`factura-plataforma-cierre.test.ts`, `sembrarCierreFacturas`) en el frente 4.
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: 2 `$executeRaw`, en orden: primero
  `factura_plataforma_tomar_cambio(` con `[empresa, desde, plan, tipo]` y después `UPDATE "organizacion"`.
- `tests/integration/db/factura-plataforma-cierre.test.ts` (nuevo, solo un `it`; T6.1 lo completa): sembrar dos
  veces en la misma ventana (10:01 y 10:09) y re-agendar dejan UNA fila (`contarJobs`); clave `…:2026-11-01T10`.
- `db/migrations/20261111130100_factura_plataforma/migration.sql` (decisión 2026-11-11, design §2.6): en
  `factura_plataforma_en_curso`, sin pendiente con efecto ≤ fin, la cuota prevista usa el plan de la factura
  siguiente N (`desde` = fin, la misma consulta que `cerrar`); si N no existe (la en curso), el que `abrir` le
  copiará: el vigente de la empresa. Inline, sin función nueva (una función obligaría a tocar `down.sql`).

Verificación (2026-11-11, implementer): typecheck verde; eslint de los 8 tests verde; `test:guardias` 4 rojos, todos
de `dependencias-declaradas-presentes` (baseline), 4808 pasan; los 5 tests de registro/repositorio tocados 25/25
verdes; `vitest related` lote 1 (5 archivos de `lib/` de facturas y planes) 18 archivos verdes, 38 skipped; lote 2
(`route.ts`, `excepciones-aislamiento`, `modelos-de-negocio`, `reparto`): rojos solo en 4 archivos del baseline
(`habilitacion-api-migration`, `vista-filtro-migration`, `premio-ranking-devengo-migration`,
`orden-traspaso-migration`) y 2 timeouts de 20 s por carga en `CierresDescargaColumnas` y `SatelitePaginacion`
(componentes, ajenos al diff). La integración contra Postgres corre en CI.

## Tanda 5 — T6: tests del bloque A (T6.1–T6.5)
Subagente: `backend_dev`. Sin cambios de producción ni dependencias.

Archivos:
- `tests/integration/db/factura-plataforma-cierre.test.ts` (ampliado; se conserva el `it` R25 de la siembra del job):
  bloque en la base compartida (revertida, reloj por `p_ahora`) y bloque en base PROPIA `slt118_iv_<rand>` con la
  migración de verdad (siembra, dos conexiones a la vez, ida y vuelta).
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (nuevo): `PlanesRepository` real + cola real
  (`aplicarCambioDeEmpresa`) + `FacturaPlataformaRepository.cerrar`. Sin R30 por P9, R33, R36 ni R38 (T11/T14).
- `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (nuevo).
- `tests/unit/planes/jobs-factura-plataforma.test.ts` (nuevo).
- `tests/integration/db/factura-plataforma-aislamiento.test.ts` (nuevo; T9.2 le añade R24).

Mapa R → test (archivo · `it`):
- R1, R2, R3, R5, R9 · cierre · «sin plan factura quincenal, sin cuota, y cada corrida emite la vencida y abre la siguiente»
- R2, R3, R8 · cierre · «mensual 31 000 con 10 %…: 27 900.00 … el 1 y nada el 16» y «anual con órdenes mensuales…»
- R3 · unit · «R3: sin que nadie lo pida, cierra CADA empresa con el mismo «ahora»…» (+2 casos)
- R4 · cierre · «a las 00:04:59.999 del 16 … fijada pero sin cerrar; a las 00:10, se cierra»
- R5, R6, R7 · cierre · «cifras de las órdenes por instante, bordes al milisegundo, un reverso … y la traza que suma igual»
- R5 (dos cuotas) · cambio-plan · «R16, R5: quincenal con inicio el 1 aplicado el 12…»
- R8 · cierre · bimestral, quincenal 15 500, precio editado; cambio-plan · «R8: un pendiente por SQL quincenal → mensual con efecto el 16…»
- R9 · cierre · «un plan sin costo base emite sus facturas sin cuota…»
- R10 · gemelas · «costo de un período completo…», «sin precio…», «costo de un tramo y sus días…», «redondeo del tramo…»
- R11 · cierre · «cerrar otra vez, o tras un cierre que falló a medias…»; base propia · «R26 (P15), R11: … dos cierres a la vez desde dos conexiones…»
- R12 · unit · «si una empresa falla, cierra las demás y DESPUÉS falla nombrándola…», «un fallo al listar…»
- R13 · aislamiento · «nadie cambia una factura cerrada, tampoco el dueño: SL118…»
- R14 · cierre · «el número es correlativo por empresa desde 1…» (dos empresas intercaladas)
- R15 · cambio-plan · «R15, R39: mensual → quincenal al 1 de diciembre…», «R15: un pendiente por SQL con efecto el 10…»
- R16 · cambio-plan · inicio el 1 aplicado el 12 (quincenal y mensual), aplicado el 20, alta el 10 (P19), inicio el 16 por la cola, cambio tras el cierre, plan con órdenes mensuales, SL118 de una por cerrar y de la marca
- R17 · cambio-plan · «guardar, reemplazar y cancelar un pendiente, o editar el precio del plan, no cambia ninguna factura»
- R21 · aislamiento · «la app en la empresa A solo lee las facturas de A…», «una factura no cambia de empresa…: SL017»
- R22 · aislamiento · «la app no inserta, no cambia y no borra…: 42501», «la app no ejecuta el cierre, la toma de un cambio…: 42501»
- R23 · aislamiento · «la plataforma (el dueño, como el superadmin) lee las facturas de las dos empresas»
- R25 · unit · registro/recurrente de plataforma, núcleo, cableado en plataforma, cada hora a los :10, zonas, siembra, sin correos; cierre · el `it` de la siembra
- R26 · cierre · «una empresa dada de alta después…»; base propia · «la migración deja a cada empresa UNA factura en curso…» y «el período de cobro en curso cuenta como pagado…»
- R27 · base propia · «con una factura cerrada con cuota, el down se niega…», «con solo una primera cuota cerrada…», «sin cuotas cerradas, el down deja la base como estaba … y se puede volver a subir»
- R28 · cambio-plan · inicio el 5 (11 366.67), inicio el 18 (13 433.33, quincenal y mensual), alta el 10 (P19)
- R29 · cambio-plan · alta el 10 (6 200.00), inicio el 5 y el 18, anual desde el 18 (44 de 365), mensual desde el 1 aplicado el 12; gemelas · «la primera cuota que guarda la base es la de costoDelPeriodoEnCurso…», «sin el permiso de primera cuota…»
- R39 · cambio-plan · «R15, R39: …espera a la cola…» y «R16, R39: inicio el 16 … si el cierre llega antes que la cola, espera»

Verificación (2026-11-11, sin base local; la integración corre en CI):
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → verde (`tsc --noEmit` sin errores).
- `pnpm exec eslint <los 5 archivos>` → exit 0.
- `pnpm exec vitest run <los 5 archivos> --pool=threads` → 1 archivo verde (unit, 15/15), 4 skipped (45 tests sin `DATABASE_URL`).

Hallazgos (sin tocar producción):
- Los ayudantes (`planConPrecio`, `empresa`, `cargo`/`movimiento`, `cerrar`, `facturas`) van duplicados en tres archivos de
  integración para no añadir un `_fixtures/factura-plataforma.ts` fuera de «Archivos esperados». Si el humano acepta +1
  archivo, se extraen.
- `plan_costo_del_periodo` con descuento en monto mayor que el costo devuelve `GREATEST(x, 0)`: si gana el 0, el valor sale
  con escala 0 («0» y no «0.00»). Sin efecto en la factura (las columnas son `numeric(12,2)`); la gemela lo compara como
  `numeric(12,2)`. No comprobado contra Postgres.
- R4 no fija el borde exacto: el cierre usa `hasta ≤ ahora − 5 min`, así que a las 00:05:00.000 ya cierra. El test mira
  00:04:59.999 (no cierra) y 00:10 (cierra).
- R17 «editar el precio» se simula con la fila del historial por SQL (lo que escribe la edición de SL-24), no por `editar`.
- El caso «plan con órdenes mensuales tomado por una factura quincenal» (R16) es casi el de R38; T15.3 puede reutilizarlo.
- Los efectos usados en los cambios del superadmin (1 de diciembre, 16 de diciembre, 1 de enero) ya son inicios del tipo
  de referencia: no cambian cuando T11.2 lleve el efecto (R30). El caso «cambio aplicado después del cierre» usa
  `asignar` del repositorio con un efecto pasado (clase `cambio`); si T11.2 lo prohíbe en el repositorio, ese `it` se ajusta.

Veredicto: T6.1–T6.5 escritos; typecheck y eslint verdes, unit 15/15; la integración (45 casos) queda para CI.

## Tanda 6 — bloque C, servidor (T11.1–T11.3, T12.1–T12.4) · sin commit

Archivos (lib):
- `lib/interfaces/repositories/IPlanesRepository.ts` — T11.1: `vigenteDesde?: string` en el `ok` de `ResultadoAsignar`,
  `ResultadoCrearYAsignar` y `ResultadoCambiarTipoCobro` (solo con `pendiente: true`).
- `lib/repositories/PlanesRepository.ts` — T11.2: `efectoAlInicioDelPeriodo(efecto, tipoVigente, tipoNuevo)` (exportada,
  pura) y su uso en `cambiarEmpresaEnTx` bajo el cerrojo, después de R19 y antes de decidir pendiente/en el acto. Tipo de
  referencia = el de mayor índice en `TIPOS_COBRO`; inicio → se respeta (R31); si no, `fechaDeEfectoPorDefecto` (R30);
  `"inicio"` no se toca (R33); sin revalidar el rango (R34). Devuelve `vigenteDesde` real con el pendiente; `asignar`,
  `crearYAsignar` y `cambiarTipoCobro` lo propagan. El método queda en pasos numerados (1. R19, 2. fecha real, 3. pendiente
  o en el acto) para que T14.2 añada la regla de R37 sin mezclarla.
- `lib/services/PlanesService.ts` y `lib/types/planes.ts` — T11.3: `asignar` y `crear` responden con el `vigenteDesde` del
  repositorio; `CambiarTipoCobroResult` gana `vigenteDesde: string | null`; `fueraDeRango` sigue sobre la elegida (R34).

Archivos (tests):
- `tests/integration/db/planes-cambio-empresa.test.ts` — T12.1: bloque nuevo «SLT-118» (R30 ×10 casos, «hoy», R31 ×4,
  quincenal → mensual el 16, R33, R34). Ajustados los casos que T11.2 rompe: R17/R20 (el 10 de octubre ahora rige el 1 de
  noviembre; sin tramo), los dos R18 (reloj fijo `servicioEn`, «hoy» = inicio de período), R16/R20 del tipo (1 de enero),
  R19 (`vigenteDesde: null` en `cambiarTipoCobro`) y R14 (aplica en la fecha real del pendiente).
- `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` — T12.2: «hoy» fijo el 1 de enero de 2027 en D10/D14; bloque
  nuevo con R30 (quincenal → anual, anual → mensual, mensual → quincenal), R31 (inicio común futuro, «hoy» = 1 de enero en
  el acto, el 16 de quincenal → mensual).
- `tests/integration/db/planes-crear-custom-asigna.test.ts` — T12.2: R30/R32 en el custom (mensual → 1 dic, anual → 1 ene);
  los casos con «hoy» y plan previo con reloj fijo el 1 de enero.
- T12.3: `tests/integration/db/planes-asignacion.test.ts` (reloj fijo el 1 de noviembre),
  `tests/integration/db/plan-de-la-empresa-periodo.test.ts` (el pendiente mensual → bimestral en el próximo inicio de
  bimestre), `tests/integration/db/planes-cancelar-cambio-historial.test.ts` (pendientes en el próximo 1 de mes / 1 de
  enero, que se respetan).
- `tests/unit/services/planes-service-periodo.test.ts` y `tests/unit/services/planes-service-tipo-cobro.test.ts` — T12.4:
  tabla de R30/R31 sobre `efectoAlInicioDelPeriodo`, R33, R32 (la respuesta trae la real, el repositorio recibe la
  elegida; `null` en el acto o sin cambio) y R34 (en el tope entra con la real 2028-01-01; el 11 → `validation_error`).

`factura-plataforma-cambio-plan.test.ts` no se tocó: sus efectos de clase `cambio` (1 dic, 16 dic, 1 ene) ya son inicios del
tipo de referencia, y el «aplicado después del cierre» (1 dic, guardado el 3) se respeta y se aplica en el acto.

Mapa R → test:
- R30: `planes-cambio-empresa` («R30, R32: asignar otro plan…» ×10, «R30: «hoy» = 10 de noviembre…», «R17, R20, R30…»,
  «R16, R20, R30…»); `planes-cambiar-tipo-cobro` («R30: a uno más largo / más corto…»); `planes-crear-custom-asigna`
  («R30, R32 (SLT-118)…»); `planes-service-periodo` («R30, R31: %s → %s…»).
- R31: `planes-cambio-empresa` («R31: asignar otro plan…» ×4, «R31, R30: quincenal → mensual el 16…», «R18, R31…»);
  `planes-cambiar-tipo-cobro` («R31: inicio común futuro», «R31: mensual → anual con «hoy» = 1 de enero…»);
  `planes-service-periodo` (tabla).
- R32: `planes-service-periodo` («R32: …» ×4), `planes-service-tipo-cobro` («SLT-118 R32…»), integración en las tres de
  arriba (`vigenteDesde` real). Las confirmaciones en pantalla son T12.5 (frontend).
- R33: `planes-cambio-empresa` («R33: la primera asignación no se lleva…»), `planes-service-periodo` («R33: …»).
- R34: `planes-cambio-empresa` («R34, R32: …»), `planes-service-periodo` («R34: …» ×2).

Verificación:
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: rojo SOLO por 3 errores en tests de componentes (frontend):
  `tests/components/PlanEmpresaPeriodo.test.tsx(113)` y `tests/components/PlanEmpresaTipoCobro.test.tsx(65, 138)`, dobles de
  `cambiarTipoCobro` sin `vigenteDesde` (ahora obligatorio en `CambiarTipoCobroResult`, design §3.1).
- `pnpm exec eslint` sobre los 4 de `lib/` y los 8 tests: sin problemas.
- `vitest run` unit propios: 2 archivos, 123/123 verdes. Integración propia: 6 archivos, 79 casos `skipped` (sin base).
- `vitest related --run` de los 4 de `lib/`: cortado a los 8 min (exit 124) sin resumen. Sustituido por lotes de ≤5
  archivos con los tests que importan el servicio, el repositorio o el tipo: 17 archivos; 14 verdes (en ejecución los
  componentes pasan) y 3 rojos fuera de la lista, por lo mismo (ver abajo).

Rojos por T11.2/T11.3 fuera de la lista (NO tocados, para el humano):
- `tests/unit/services/planes-service-crear-custom.test.ts` («SLT-86 R17: si el repositorio lo deja pendiente…»): el doble
  devuelve `pendiente: true` sin `vigenteDesde`; el servicio ya no lo inventa.
- `tests/unit/services/planes-service-inicio-ciclo.test.ts` («con fecha futura, el repositorio lo deja pendiente…»): igual.
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (2 casos D16): «hoy» = 3 de noviembre ya no se aplica en el
  acto (mensual ↔ anual), así que va por `escribirPendiente` y el doble de Prisma no lo soporta.
- `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (por lectura, sin base): dos casos con `vigenteDesde: dia(0)`
  mensual → mensual esperan aplicarse en el acto o `tope_excedido`; salvo el día 1 quedan pendientes.
- `tests/components/PlanEmpresaPeriodo.test.tsx` (tipo): fuera de T12.5.

Veredicto: T11.1–T11.3 y T12.1–T12.4 hechos; lint y unit propios verdes; typecheck rojo solo en tests de componentes (frontend) y 4 tests fuera de la lista rojos por el mismo cambio, pendientes de decisión.

## Tanda 7 — tests rotos y R30 por P9 · sin commit
Subagente: `backend_dev`. Sin cambios en `lib/` ni dependencias; no se tocó `tests/components/*`.

Archivos (solo tests):
- `tests/unit/actions/deuda-plataforma.composition-root.test.ts`, `empresas-plataforma.composition-root.test.ts`,
  `wallet-egresos.composition-root.test.ts`: el doble de Prisma gana `facturaPlataforma` (`aggregate` /
  `groupBy`) sin cuotas (`_sum: { cuota: null, primeraCuota: null }` / `[]`), lo que piden T7 (R18). Ninguna
  aserción cambia: el orden `candado, clave, sumas, pagos` de wallet-egresos sigue igual, porque el `aggregate` no
  apunta en `orden`.
- `tests/unit/services/planes-service-crear-custom.test.ts` y `planes-service-inicio-ciclo.test.ts`: el doble con
  `pendiente: true` trae `vigenteDesde` (la fecha que se asevera), porque desde T11.3 el servicio no la deduce (R32).
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: los dos casos D16 (mensual ↔ anual) usan «hoy» =
  1 de enero de 2027 (`HOY_1_ENERO`), inicio del anual, para que se apliquen en el acto (R31); las fechas que se
  aseveran (`valoresDeToma`, `valorNuevo`) pasan del 3 de noviembre al 1 de enero. El caso «mismo tipo» sigue con el 3.
- `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts`: `caso(tx, ahora?)` admite un reloj fijo; «R39,
  SLT-86 R16/R17» y «P14, R42» usan `AHORA_FIJO` (1 de noviembre de 2026, 12:00 de la plataforma) con `HOY_FIJO`
  y `diaFijo(-10)`, en lugar de `dia(0)` / `dia(-10)` del reloj real.
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (T6.2): `it` nuevo «R30 (P9): quincenal → anual
  guardado por `PlanesService` el 10 de noviembre rige el 1 de enero…». Es `cambiarTipoCobro` del servicio con reloj
  fijo el 10 de noviembre y la fecha elegida el 10. Asevera: respuesta `vigenteDesde: "2027-01-01"`; el pendiente
  queda con el 1 de enero y el tipo vigente quincenal; guardar no toca ninguna factura (R17); las emitidas el 16 de
  noviembre y el 1 y el 16 de diciembre llevan 15 500.00 de la quincena que empieza; la del 1 de enero lleva
  372 000.00 anual (365/365, hasta el 1 de enero de 2028); la del 16 de enero no lleva cuota. Ninguna factura con
  `hasta` el 10 y ninguna primera cuota. Se actualizan la cabecera y el `describe` (R28–R30).

Mapa R → test (esta tanda):
- R30 (P9) · `factura-plataforma-cambio-plan.test.ts` · «R30 (P9): quincenal → anual guardado por `PlanesService`…»
- R18 · los tres `*.composition-root.test.ts` (cableado con la cuota de las facturas, en cero)
- R31 · `planes-repository-tipo-cobro.test.ts` (D16 con «hoy» = 1 de enero, en el acto)
- R32 · `planes-service-crear-custom.test.ts` («SLT-86 R17…»), `planes-service-inicio-ciclo.test.ts` («con fecha futura…»)

Verificación (2026-11-11, sin base local; la integración corre en CI):
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → verde (`tsc --noEmit` sin errores, también en los tests
  de componentes).
- `pnpm exec eslint <los 8 archivos>` → exit 0.
- `pnpm exec vitest run <los 8 archivos> --pool=threads` → 6 archivos verdes (86 tests), 2 skipped (24 tests de
  integración sin `DATABASE_URL`).
- `vitest related --run --pool=threads` (timeout 420):
  - lote T7 (los 5 de deuda) → 41 verdes / 17 skipped. Hubo 1 rojo, `tests/components/WalletCaja463.test.tsx` «A:
    periodo en vuelo + «Sale»…» (9,2 s, por carga): corrido solo, 25/25 verdes.
  - `IPlanesRepository.ts` + `PlanesRepository.ts` → 20 verdes / 41 skipped (355 tests).
  - `PlanesService.ts` → 12 verdes / 16 skipped (448 tests).
  - `lib/types/planes.ts` → cortado a los 420 s (exit 124). Se sustituyó por los 108 tests unit/componente que
    importan `@/lib/types/planes` o un módulo de `lib/`, `components/`, `app/` o `hooks/` que lo importa. Corrieron en
    4 lotes: 29/26/28/25 archivos, todos verdes (413 + 330 + 473 + 754 tests). La integración queda fuera porque se
    salta sin base.

Hallazgos:
- No hay fallo de producción. Los rojos eran los que anticipaba la tanda 6, más los tres composition-root que rompió T7.
- R30 por P9 se mide con `cambiarTipoCobro` (mismo plan, cambia el tipo). Un `asignar` de otro plan quincenal → anual
  pasa por el mismo `cambiarEmpresaEnTx` (cubierto en `planes-cambio-empresa`); no se duplicó aquí.
- Los dos casos de `planes-asignacion-inicio-ciclo` y el R30 nuevo solo se pueden comprobar en CI (sin base local).
- `WalletCaja463` es lento con carga, igual que en tandas anteriores; no es de esta ficha.

Veredicto: tests rotos por T7/T11 en verde sin cambiar lo que aseveran y R30 (P9) añadido; typecheck, eslint y unit verdes; la integración (24 casos) va a CI.

## Tanda 7b — confirmaciones con la fecha real (T11.4, T12.5) · frontend_dev
- `PlanEmpresa.tsx`: el cambio de tipo de cobro pendiente avisa «Cambio programado desde {fecha real}» (`TEXTOS.programado`); el cambio de plan ya pintaba `vigenteDesde`.
- `PlanesModule.tsx`: el custom pendiente avisa «Plan «X» creado. Cambio programado desde {fecha}.» (`textoCambioProgramado`, textos existentes juntados; a confirmar por el humano).
- Tests R32: `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanEmpresaPeriodo.test.tsx` (fuera de la lista del spec; tenía montado el flujo), `tests/components/PlanesModule.test.tsx` (2). Dobles con `vigenteDesde: null`.
- Verificación: typecheck verde; eslint limpio; los 3 archivos 54/54.

## Cierre de tandas 6–7 (implementer)
typecheck verde; eslint de los archivos sin commit verde; `test:guardias` ver la línea de `progress/features/SLT-118.md > Tandas`.

## Tanda 9 — bloque B (T8.1 empresa, T9.1, T9.2) · backend_dev · sin commit
Archivos:
- `lib/repositories/FacturaPlataformaRepository.ts`: `deLaEmpresa()` (design §2.6, §3). Una sola sentencia como `servi_app` en la empresa de la sesión: `factura_plataforma_en_curso(current_setting('app.organizacion_id'))` y las cerradas en `jsonb` (filtro por `organizacion_id` + RLS), validadas con zod. Una sola foto: en dos lecturas, un cierre entre ambas duplicaría o perdería una factura. Importes normalizados a dos decimales con `Prisma.Decimal`; cerradas primero, por `desde`. Sin `comoPlataforma`.
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`: `deLaEmpresa(): Promise<FacturaPlataformaDTO[]>`. `deEmpresaParaPlataforma` NO se declara (pregunta abierta: cómo fija la empresa el superadmin).
- `lib/types/factura-plataforma.ts`: sin cambios (el DTO ya cubría la lectura).
- `tests/integration/db/factura-plataforma-deuda.test.ts` (nuevo, T9.1).
- `tests/integration/db/factura-plataforma-aislamiento.test.ts` (T9.2): 4 casos R24 por el lado de la empresa.

Mapa R → test:
- R18 → deuda: «R18, R19: una factura con las dos cuotas sube la deuda en las dos…» (wallet, tope app, tope base 23514, listado del superadmin; la en curso con marca no suma).
- R19 → deuda: el mismo caso (pago previo intacto; tope con la cuota incluida en app y base; saldada, ni 0.01).
- R20 → deuda: «R20: aplicar una primera asignación (R16) y cerrar … no escriben cargos, trazas ni movimientos de la wallet».
- R40 → deuda: «R40: un cambio de plan y de tipo de cobro aplicado tras emitir dos cuotas no las devuelve…».
- R24 → aislamiento: plan mensual (1–15 sin cuota; 16–30 con diciembre prevista, la 1–15 por cerrar sin cuota); cambio pendiente al fin (prevista del plan nuevo); quincenal desde el 1 aplicado el 12 (las dos previstas); «R24, R21» (A lee las suyas con número y cuotas emitidas; otra empresa o sin empresa → 42501).

Verificación:
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: verde (sin salida de errores).
- `eslint` de los 4 archivos: limpio.
- `vitest run` de los 2 tests de integración `--pool=threads`: 2 archivos / 13 casos skipped (sin base local) → al CI.
- `vitest related --run --pool=threads` de los 2 archivos de `lib/`: 14 passed | 7 skipped (21 archivos); 202 passed | 62 skipped.
- Guardias no corridas (por instrucción). `deLaEmpresa` solo lee; ninguna escritura de `factura_plataforma`.

Veredicto: `deLaEmpresa` y los tests de R18–R20, R24 (empresa) y R40 escritos; typecheck, eslint y related verdes; la integración se prueba en CI. T8.1 queda a medias hasta que se decida `deEmpresaParaPlataforma` (lectura del superadmin, R23/R24).

## Tanda 8 — bloque D, servidor (T14.1–T14.3, T15.1, T15.3) · backend_dev · sin commit
Subagente: `backend_dev`. Sin dependencias ni migraciones (la columna y el SQL ya estaban en `20261111130100`). No se
tocó T14.4 ni T15.2 (formulario, frontend_dev), ni los archivos de la deuda/aislamiento del otro backend_dev.

Archivos (lib):
- `lib/types/planes.ts` — T14.1: `PERIODICIDADES_ORDENES`, `PeriodicidadOrdenes`, `periodicidadOrdenesSchema`;
  `periodicidadOrdenes` opcional en `crearPlanSchema` y `edicionDelPlan` (la heredan `editarPlanSchema`,
  `versionPlanSchema` y `VersionPlan`); refine de R37 en `crearPlanSchema` (`tipoCobro`); `periodicidadOrdenes?` en
  `PlanDTO`. El texto `TIPO_QUINCENAL_CON_ORDENES_MENSUALES` vive aquí y no en `mensajes.ts` porque `mensajes.ts` importa
  valores de este módulo (ciclo).
- `lib/interfaces/repositories/IPlanesRepository.ts` — T14.2: `PeriodicidadIncompatibleAlEditar` (`{ estado:
  "periodicidad_incompatible"; empresas }`) en `ResultadoEdicion` y `ResultadoProgramar`; `{ estado:
  "periodicidad_incompatible" }` en `ResultadoAsignar` (y así en `ResultadoCrearYAsignar`) y `ResultadoCambiarTipoCobro`;
  `aplicarCambioProgramado` documenta que lanza.
- `lib/repositories/PlanesRepository.ts` — T14.2: `aDTO` la lee (`periodicidadOrdenesSchema.parse`); `crearEnTx` y
  `aplicarVersion` la escriben si viene (ausente = DEFAULT al crear, sin cambio al editar); `empresasQuincenalesSiPasaAMensual`
  (con el plan en FOR UPDATE: empresas con el plan y tipo quincenal + pendientes hacia el plan con tipo quincenal; 0 si la
  versión no pasa de quincenal a mensual) en `editar`, `programarCambio` (devuelven la variante sin escribir) y
  `aplicarCambioProgramado` (lanza `Error` con «R37» antes de escribir). `cambiarEmpresaEnTx`: paso 1 nuevo = R37 (tipo
  quincenal con plan mensual → `periodicidad_incompatible`), y los de la tanda 6 pasan a 2 (R19), 3 (fecha real, R30) y 4
  (pendiente o en el acto). `cambiarTipoCobro` devuelve la variante en vez de lanzar.
- `lib/services/PlanesService.ts` — T14.3: `periodicidad_incompatible` → `validation_error` en `tipoCobro` (asignar,
  crear custom, cambiar tipo) o en `periodicidadOrdenes` con el número de empresas (editar en el acto y programar).
- `lib/planes/mensajes.ts` — T14.3: `periodicidadIncompatible(empresas)`.
- `lib/planes/rastro.ts` — T14.3: `periodicidadOrdenes` en `CampoDelPlan`, `CAMPOS` y `planCanonico` (un DTO sin ella =
  `quincenal`, el DEFAULT), así que entra en `diferenciasDelPlan`.

Archivos (tests):
- `tests/integration/db/planes-periodicidad-ordenes.test.ts` (nuevo, T15.1): 11 casos, R35 ×5 y R37 ×6.
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (T15.3): helper nuevo
  `editarPeriodicidad` (por `PlanesService`, reloj del 10 de noviembre); 3 casos nuevos (R38, R36 ×2); cabecera y
  `describe` con R36 y R38. El caso existente «R16: un plan con órdenes mensuales tomado por una factura quincenal…» se
  referencia en la cabecera (mismo corte con tipo quincenal → mensual); no se tocó.
- Tests existentes rotos por el cambio, arreglados con lo mínimo (sin cambiar lo que aseveran):
  - `tests/unit/planes/rastro.test.ts` («al crear salen todos los campos…»): el alta trae ahora
    `periodicidadOrdenes: { antes: null, despues: "quincenal" }` (una línea).
  - `tests/integration/db/planes-historial.test.ts` (el rastro `creado` exacto): la misma línea (por lectura; se salta sin base).
  - `tests/unit/actions/planes.composition-root.test.ts`: la fila Prisma doble gana `periodicidadOrdenes: "quincenal"`
    (la columna es NOT NULL y `aDTO` la valida) y el DTO esperado de `asignables` la trae.
  - `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: la fila Prisma doble gana `periodicidadOrdenes`.

Mapa R → test:
- R35 · `planes-periodicidad-ordenes.test.ts` · «R35: crear sin ella la deja quincenal y con ella la guarda…», «R35: editar
  en el acto la cambia con su fila de rastro; una edición que no la trae no la cambia», «R35: programada, no cambia hasta su
  fecha; el aplicador de la cola la escribe con su rastro», «R35, P14: un plan que ya existía… queda quincenal», «R35: un
  valor que no es quincenal ni mensual es validation_error…». (El formulario, T15.2, es de frontend_dev.)
- R36 · `factura-plataforma-cambio-plan.test.ts` · «R36: … de quincenal a mensual el 10 de noviembre…», «R36: … de mensual
  a quincenal el 10 de noviembre…».
- R37 · `planes-periodicidad-ordenes.test.ts` · «R37: asignar con tipo quincenal…», «R37: crear el custom con tipo quincenal
  y órdenes mensuales… (esquema y repositorio)…», «R37: cambiar el tipo a quincenal…», «R37: editar a mensual con una
  empresa quincenal… en el acto y programada…», «R37: editar a mensual un plan que una empresa tiene como cambio pendiente
  con tipo quincenal…», «R37: una programada a mensual que ya no pasa al aplicarse… hace fallar el trabajo…».
- R38 · `factura-plataforma-cambio-plan.test.ts` · «R38: mensual con órdenes quincenales a un plan mensual con órdenes
  mensuales, guardado el 10 de noviembre…» (y el R16 existente del mismo corte).

Verificación (2026-11-11, sin base local; la integración corre en CI):
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → verde (`tsc --noEmit` sin errores).
- `pnpm exec eslint` de los 6 de `lib/` y los 6 tests tocados → exit 0.
- `pnpm exec vitest run <los 6 tests tocados> --pool=threads` → 3 archivos verdes (22 tests), 3 skipped (37 casos de
  integración sin `DATABASE_URL`). Tras un último retoque del servicio se repitió con `tests/unit/services/` entero
  (por la ruta de carpeta entraron 388 archivos): 388 verdes, 7860 tests, 3 skipped.
- `vitest related --run --pool=threads lib/planes/rastro.ts` (timeout 420) → cortado (exit 124) sin resumen, como
  `lib/types/planes.ts` en la tanda 7. Sustituido por los 112 tests unit/componente/integración-no-db que importan uno de
  los 6 módulos cambiados o un módulo de `lib/`, `components/`, `app/` o `hooks/` que los importa, en 4 lotes:
  30/30/30/22 archivos, todos verdes (407 + 421 + 572 + 673 tests).

Hallazgos y preguntas:
- **Pregunta (sin resolver, no inventado):** `lineasDeCambioDelPlan` (`lib/planes/mensajes.ts`), que pintan el correo del
  cambio de plan, el detalle del plan (`PlanDetalle.tsx`) y `PlanEmpresa.tsx`, no tiene línea para `periodicidadOrdenes`. El
  spec no la pide (R35 solo nombra el rastro). Hoy una edición que solo cambia la periodicidad escribe su fila de rastro y
  su correo de «guardado», pero ese correo y el detalle dicen «El plan queda igual que el actual». ¿Se añade una línea
  («Facturación de órdenes: quincenal → mensual») y con qué texto?
- **A confirmar por el humano:** los dos textos nuevos (`TIPO_QUINCENAL_CON_ORDENES_MENSUALES` y
  `periodicidadIncompatible(n)`); el spec pide «su mensaje» sin literal.
- R37 al editar cuenta, como dice design §3.2, las empresas con el plan y tipo quincenal y las que lo tienen como pendiente
  con tipo quincenal. Una empresa con el plan quincenal y un pendiente a otro plan cuenta igual (todavía lo tiene).
- Un plan público se puede crear mensual sin rechazo (no lleva tipo); el rechazo llega al asignarlo con quincenal.

Veredicto: T14.1–T14.3, T15.1 y T15.3 hechos; typecheck, eslint y los 112 tests relacionados verdes; 14 casos de integración nuevos (R35–R38) van a CI; una pregunta abierta sobre la línea de la periodicidad en «qué cambia».

## Tanda 10 — formulario de la periodicidad (T14.4, T15.2) · frontend_dev
- `PlanForm.tsx`: selector «Facturación de órdenes» (`RadioGroup`, «Quincenal»/«Mensual» de `TEXTOS_TIPO_COBRO.tipo`), quincenal al crear o si el DTO no la trae, siempre en la petición; error de campo `periodicidadOrdenes` con `aria-invalid`/`aria-describedby` y foco.
- `tests/components/PlanFormPeriodicidad.test.tsx` (nuevo, 5 casos R35). Ajustados: `PlanForm.test.tsx` (3 peticiones exactas con `periodicidadOrdenes: "quincenal"`), `PlanFormDescuentos.test.tsx` (el radio «Quincenal» buscado dentro del grupo «Tipo de cobro»).
- Verificación: typecheck verde; eslint limpio; los 7 tests que importan `PlanForm` 93/93.

## Mapa R → test (R1–R40)
T10.2 (2026-11-11, backend_dev). Sacado de los `it`/`describe` reales (grep de `R<n>` en los tests del diff con
`origin/dev`) y de las tandas 5–10 de este archivo. Abreviaturas: `cierre`, `cambio-plan`, `gemelas`, `deuda` y
`aislamiento` = `tests/integration/db/factura-plataforma-<nombre>.test.ts` (`gemelas` = `…-cuota-gemelas…`);
`jobs` = `tests/unit/planes/jobs-factura-plataforma.test.ts`; `cambio-empresa`, `tipo-cobro-int`, `custom-asigna`,
`periodicidad` = `tests/integration/db/planes-cambio-empresa.test.ts`, `…/planes-cambiar-tipo-cobro.test.ts`,
`…/planes-crear-custom-asigna.test.ts`, `…/planes-periodicidad-ordenes.test.ts`; `svc-periodo`, `svc-tipo-cobro` =
`tests/unit/services/planes-service-periodo.test.ts`, `…/planes-service-tipo-cobro.test.ts`.

| R | Archivo | `it` / `describe` |
|---|---|---|
| R1 | cierre | «R1, R2, R3, R5, R9: sin plan factura quincenal, sin cuota, y cada corrida emite la vencida y abre la siguiente» |
| R2 | cierre | el mismo; «R2, R3, R8: mensual 31 000 con 10 % y órdenes quincenales…»; «R2, R3, R8: anual con órdenes mensuales…» |
| R3 | cierre; jobs | los tres de arriba; «R3: sin que nadie lo pida, cierra CADA empresa con el mismo «ahora» del reloj de la cola», «R3: sin empresas, la corrida termina bien sin cerrar nada», «R3: una empresa sin nada vencido (o en espera de un cambio, R39) devuelve 0…» |
| R4 | cierre | «R4: a las 00:04:59.999 del 16 la factura del 1 al 15 queda fijada pero sin cerrar; a las 00:10, se cierra» |
| R5 | cierre; cambio-plan | «R1, R2, R3, R5, R9…»; «R5, R6, R7: cifras de las órdenes por instante…»; «R16, R5: quincenal con inicio el 1 aplicado el 12…» (las dos cuotas) |
| R6 | cierre | «R5, R6, R7: cifras de las órdenes por instante, bordes al milisegundo, un reverso en la factura del reverso…» |
| R7 | cierre | el mismo («…y la traza que suma igual») |
| R8 | cierre; cambio-plan | «R2, R3, R8» ×2; «R8: bimestral con órdenes quincenales…»; «R8: quincenal 15 500…»; «R8: un precio editado con efecto el 20…»; «R8: un pendiente por SQL quincenal → mensual con efecto el 16…» |
| R9 | cierre | «R1, R2, R3, R5, R9…»; «R9: un plan sin costo base emite sus facturas sin cuota y con los cargos de sus órdenes» |
| R10 | gemelas | «R10: el costo de un período completo de la base es igual a montoDelPeriodo…», «R10: sin precio…», «R10: el costo de un tramo y sus días…», «R10: el redondeo del tramo es el mismo en los bordes…» |
| R11 | cierre | «R11: cerrar otra vez, o tras un cierre que falló a medias…»; «R26 (P15), R11: … dos cierres a la vez desde dos conexiones facturan una sola vez» |
| R12 | jobs | «R12: si una empresa falla, cierra las demás y DESPUÉS falla nombrándola…», «R12: un fallo al listar las empresas falla la corrida sin cerrar ninguna» |
| R13 | aislamiento | «R13: nadie cambia una factura cerrada, tampoco el dueño: SL118 sin cambiar nada» |
| R14 | cierre | «R14: el número es correlativo por empresa desde 1, en el orden de los períodos, y la en curso no tiene» |
| R15 | cambio-plan | «R15, R39: mensual → quincenal al 1 de diciembre…»; «R15: un pendiente por SQL con efecto el 10 (a mitad de factura)…» |
| R16 | cambio-plan | «R16: un cambio aplicado después del cierre de su factura…»; «R16: un plan con órdenes mensuales tomado por una factura quincenal…»; «R16, R5…»; «R16, R29: mensual con inicio el 1 aplicado el 12…»; «R16: quincenal con inicio el 1 aplicado el 20…»; «R16, R28, R29: alta el 10…»; «R16, R39: inicio el 16 que aplica la cola…»; «R16: una por cerrar no cambia su plan ni su periodicidad…: SL118…» |
| R17 | cambio-plan | «R17: guardar, reemplazar y cancelar un pendiente, o editar el precio del plan, no cambia ninguna factura» |
| R18 | deuda; `tests/unit/utils/deuda-plataforma.test.ts` | «R18, R19: una factura con las dos cuotas sube la deuda en las dos…»; `describe` «SLT-118 — derivarDeudaPlataforma con cuotas (R18)» (5 `it`); cableado con cuotas en cero en los tres `tests/unit/actions/*.composition-root.test.ts` de deuda, empresas y wallet |
| R19 | deuda; unit deuda | «R18, R19…» (pago previo intacto, tope en app y base); «pagar la cuota exacta deja la empresa al día (R19)» |
| R20 | deuda | «R20: aplicar una primera asignación (R16) y cerrar una factura con dos cuotas no escriben cargos, trazas ni movimientos de la wallet» |
| R21 | aislamiento | «R21: la app en la empresa A solo lee las facturas de A…»; «R21: una factura no cambia de empresa…: SL017»; «R24, R21: la empresa A lee las suyas…; la de otra empresa o sin empresa, 42501» |
| R22 | aislamiento; `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | «R22: la app no inserta, no cambia y no borra facturas, ni las suyas: 42501 sin cambios»; «R22: la app no ejecuta el cierre, la toma de un cambio ni ninguna función que escribe facturas: 42501»; «ningún archivo de lib/ ni de app/ escribe en factura_plataforma (SLT-118, R22)» |
| R23 | aislamiento | Base: «R23: la plataforma (el dueño, como el superadmin) lee las facturas de las dos empresas». App (T8.1, tanda 12): «R23: el superadmin lee las de A y las de B, cada una solo con las suyas, también desde un contexto de plataforma» (`deEmpresaParaPlataforma` por el cliente con la extensión), con el control «control: sin `conEmpresa`, la lectura de la empresa por el cliente de la app no corre (EmpresaNoResuelta)» |
| R24 | aislamiento | Empresa: «R24: plan mensual: la del 1 al 15 sin cuota prevista…», «R24: con un cambio pendiente cuyo efecto es el fin de la en curso…», «R24: quincenal con inicio el 1 aplicado el 12…», «R24, R21…». Superadmin (tanda 12): «R24: el superadmin ve la en curso con su total parcial y la cuota prevista, igual que la empresa; sin número» |
| R25 | jobs; cierre | `describe` «SLT-118 — registro y recurrencia del cierre de facturas (R25)» (6 `it` + `it.each` «R25: cada hora a los 10 minutos — $caso» ×4); «R25: la siembra del cierre (sembrarCierreFacturas) y su re-agendado dejan UNA fila por corrida (contarJobs)» |
| R26 | cierre | «R26: una empresa dada de alta después…»; «R26: la migración deja a cada empresa UNA factura en curso…»; «R26 (P15), R11: el período de cobro en curso cuenta como pagado…» |
| R27 | cierre | «R27: con una factura cerrada con cuota, el down se niega sin tocar nada»; «R27: con solo una primera cuota cerrada…»; «R27: sin cuotas cerradas, el down deja la base como estaba…» |
| R28 | cambio-plan | «R16, R28, R29: alta el 10…»; «R28, R29: quincenal con inicio el 5 aplicado en el acto…»; «R28, R29: inicio el 18 (futuro, lo aplica la cola)…» |
| R29 | cambio-plan; gemelas | los tres de R28; «R16, R29…»; «R29: anual desde el 18 con órdenes quincenales: 44 de 365…»; «R29: la primera cuota que guarda la base es la de costoDelPeriodoEnCurso…»; «R29: sin el permiso de primera cuota, un tramo que no empieza en el período no tiene cuota (R8)» |
| R30 | cambio-empresa; tipo-cobro-int; custom-asigna; cambio-plan; svc-periodo | `it.each` «R30, R32: asignar otro plan, %s → %s elegido el %s → pendiente para el %s…», «R30: «hoy» = 10 de noviembre, mensual → 1 de diciembre…», «R17, R20, R30…», «R16, R20, R30…», «R18, R30, R31…»; casos «R30: a uno más largo / más corto…» del `describe` «SLT-118 — cambiar el tipo de cobro con el tipo de referencia (R30, R31)»; «R30, R32 (SLT-118): un custom para una empresa con plan mensual…»; «R30 (P9): quincenal → anual guardado por `PlanesService`…»; `it.each` «R30, R31: %s → %s elegido el %s → %s…» |
| R31 | cambio-empresa; tipo-cobro-int; svc-periodo; `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` | `it.each` «R31: asignar otro plan, %s → %s elegido el %s (inicio de un período del tipo de referencia) → se respeta», «R31, R30: quincenal → mensual el 16…», «R18, R31: con «hoy» en el inicio de un bimestre…»; casos «R31: inicio común futuro», «R31, R30: inicio del vigente pero no del de referencia» y «R31: mensual → anual con «hoy» = 1 de enero…»; «R30, R31: %s → %s…»; `describe` «D16 — cambiarTipoCobro deja su acción propia en el historial» (con «hoy» = 1 de enero) |
| R32 | svc-periodo; svc-tipo-cobro; componentes | «R32: asignar pasa la elegida…», «R32: crear un custom…», «R32: cambiar el tipo responde con la fecha real…», «R32: asignar aplicado en el acto responde `vigenteDesde: null`»; «SLT-118 R32: el repositorio llevó la elegida al 1 de enero…»; `tests/components/PlanEmpresaTipoCobro.test.tsx` «SLT-118 R32: con el cambio pendiente…»; `tests/components/PlanEmpresaPeriodo.test.tsx` «SLT-118 R32: al cambiar el plan…»; `tests/components/PlanesModule.test.tsx` «SLT-118 R32: crear un custom…», «SLT-118 R32: un plan que rige ya…» |
| R33 | cambio-empresa; svc-periodo | «R33: la primera asignación no se lleva: inicio el 10 (a mitad de período)…»; «R33: una primera asignación (`inicio`) no se lleva, aunque caiga a mitad de período» |
| R34 | cambio-empresa; svc-periodo | «R34, R32: con hoy el 10 de noviembre, quincenal → anual elegido el 10 de noviembre de 2027 (el tope)…»; «R34: elegida el 10 de noviembre de 2027 (el tope) entra…», «R34: elegida el 11 de noviembre de 2027 → validation_error…» |
| R35 | periodicidad; `tests/components/PlanFormPeriodicidad.test.tsx`; `tests/unit/planes/rastro-periodo.test.ts`; `tests/unit/services/email/plantilla-cambio-plan.test.ts` | «R35: crear sin ella la deja quincenal…», «R35: editar en el acto la cambia…», «R35: programada, no cambia hasta su fecha…», «R35, P14: un plan que ya existía…», «R35: un valor que no es quincenal ni mensual…»; `describe` «SLT-118 R35 — «Facturación de órdenes» en el formulario del plan» (5 `it`); `describe` «SLT-118 R35 — «Facturación de órdenes: <antes> → <después>»» (5 `it`, «qué cambia» y el cambio pendiente); «SLT-118 R35: el cambio de la periodicidad de órdenes del plan sale como «Facturación de órdenes: quincenal → mensual»» (correo) |
| R36 | cambio-plan | «R36: la periodicidad del plan editada de quincenal a mensual el 10 de noviembre…», «R36: … de mensual a quincenal el 10 de noviembre…» |
| R37 | periodicidad | «R37: asignar con tipo quincenal…», «R37: crear el custom con tipo quincenal y órdenes mensuales…», «R37: cambiar el tipo a quincenal…», «R37: editar a mensual con una empresa quincenal…», «R37: editar a mensual un plan que una empresa tiene como cambio pendiente…», «R37: una programada a mensual que ya no pasa al aplicarse…» |
| R38 | cambio-plan | «R38: mensual con órdenes quincenales a un plan mensual con órdenes mensuales, guardado el 10 de noviembre…» |
| R39 | cambio-plan; jobs | «R15, R39…»; «R16, R39: … si el cierre llega antes que la cola, espera»; «R3: una empresa sin nada vencido (o en espera de un cambio, R39)…» |
| R40 | deuda | «R40: un cambio de plan y de tipo de cobro aplicado tras emitir dos cuotas no las devuelve…» |

Huecos: ninguno desde la tanda 12 (R23 desde la app y R24 del superadmin cubiertos con `deEmpresaParaPlataforma`).
Corrección al mapa de `tasks.md`: R33 no está en `cambio-plan` (su cabecera dice «R33 queda fuera de este archivo»),
sino en `cambio-empresa` y `svc-periodo`.

Veredicto: mapa R1–R40 completo, sin huecos (tanda 12).

## Tanda 12 — superadmin y línea de periodicidad (T8.1, T9.2, T10.2) · backend_dev · sin commit

Decisión aplicada (humano y leader, 2026-11-11): el superadmin fija la empresa con `conEmpresa(id, …)` (opción A).

Archivos:
- `lib/repositories/FacturaPlataformaRepository.ts`: `deEmpresaParaPlataforma(organizacionId)` =
  `conEmpresa(organizacionId, () => this.deLaEmpresa())`. Sin SQL nuevo. Dentro de un `comoPlataforma` también vale:
  el `conEmpresa` de dentro manda mientras dura la lectura.
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`: el método en el contrato (necesita el cliente con
  la extensión, `getPrismaClient()`); fuera la nota de «espera a que se decida».
- `lib/planes/mensajes.ts`: `CambioDelPlanParaCorreo.periodicidadOrdenes` y, en `lineasDeCambioDelPlan`, la línea
  «Facturación de órdenes: <antes> → <después>» con los valores tal cual (minúscula). Sin `antes` (alta) no pinta.
- `tests/integration/db/factura-plataforma-aislamiento.test.ts`: `describe` nuevo «SLT-118 — el superadmin lee las
  facturas de una empresa por la app (R23, R24; T8.1)». Commitea su siembra bajo `bajoLockDeEscrituraReal` (la
  extensión abre su propia transacción en otra conexión y no ve una revertida) y la borra en su `afterAll`
  (empresas → facturas por CASCADE; planes → historial por CASCADE). Cliente: `conAislamientoPorEmpresa(base,
  async () => null)`, como `cobro-plataforma-plan`.
- `tests/unit/planes/rastro-periodo.test.ts`: `describe` «SLT-118 R35 — «Facturación de órdenes: <antes> → <después>»» (5 `it`).
- `tests/unit/services/email/plantilla-cambio-plan.test.ts`: «SLT-118 R35: el cambio de la periodicidad…».

Guardias de aislamiento: sin entrada nueva. `conEmpresa` no es `comoPlataforma` (`plataforma-solo-en-lista` no lo
mira) y el archivo ya filtra por `organizacion_id` en su SQL (`sql-a-mano-por-empresa` no lo lista).

Quién consume la línea (comprobado):
- correo: `lib/planes/jobs-cambio-plan.ts` pasa `aviso.cambios` entero (el `diferenciasDelPlan`) → sale.
- `PlanEmpresa.tsx`: `lineasDeCambioDelPlan(diferenciasDelPlan(actual, elegido))` → sale; también el cambio pendiente
  (`cambioPendienteDelPlan`, `lib/planes/consumo.ts`).
- `PlanDetalle.tsx` (`lineasDelRastro`): **NO sale**. Arma el objeto campo a campo (`nombre`, `topes`, `modulos`,
  `precio`, `costoPorOrden`, …) y no pasa `periodicidadOrdenes`. Falta una línea de UI (frontend_dev):
  `periodicidadOrdenes: deEdicion(c.periodicidadOrdenes) as CambioDelPlanParaCorreo["periodicidadOrdenes"] ?? undefined`
  o equivalente, y su test de componente. No lo toqué: fuera de mi capa.

Mapa: R23, R24 y R35 actualizados arriba y en `tasks.md`; sin huecos. T8.1, T9.2 y T10.2 marcadas.
T9.1 no pide caso del superadmin (tasks.md): `factura-plataforma-deuda.test.ts` sin cambios.
Fuera de «Archivos esperados»: `tests/unit/planes/rastro-periodo.test.ts`, `tests/unit/services/email/plantilla-cambio-plan.test.ts`.

Verificación:
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → `tsc --noEmit` sin errores.
- `eslint` de los 7 archivos → sin salida (verde).
- `vitest run` rastro-periodo, plantilla-cambio-plan, factura-plataforma-aislamiento `--pool=threads` →
  `Test Files 2 passed | 1 skipped (3)`, `Tests 33 passed | 13 skipped (46)` (integración sin base: al CI).
- `vitest related --run` de `FacturaPlataformaRepository.ts` + `IFacturaPlataformaRepository.ts` →
  `Test Files 14 passed | 7 skipped (21)`, `Tests 202 passed | 68 skipped (270)`.
- `vitest related --run` de `lib/planes/mensajes.ts` → no terminó en 420 s (cortado por `timeout`, sin salida).
  Sustituido por los tests que lo importan y los de sus consumidores, en lotes de 5 (`vitest run --pool=threads`):
  tope-error, rastro-costo-porcentual, rastro-costeo, mensajes-periodo, mensajes-costo-porcentual → `5 passed`, `60 passed`;
  planes-service-inicio-ciclo, consumo, MiPlanModule, PlanDetalle, PlanEmpresa → `5 passed`, `142 passed`;
  jobs-cambio-empresa, procesar-jobs-plan-cambio, PlanEmpresaPeriodo, PlanEmpresaTipoCobro, PlanDetalleAsignar →
  `5 passed`, `90 passed`. `planes-periodicidad-ordenes` (integración) al CI; la guardia `mi-plan-solo-maestro`, al leader.

Veredicto: T8.1 y la línea de periodicidad hechos con sus tests; falta pasar `periodicidadOrdenes` en `PlanDetalle.tsx` (UI).

## Tanda 12b — la línea en el detalle del plan · frontend_dev
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`: `lineasDelRastro` pasa `periodicidadOrdenes` a `lineasDeCambioDelPlan`.
- `tests/components/PlanDetalle.test.tsx`: «SLT-118 R35: el historial dice «Facturación de órdenes: quincenal → mensual»; el alta no pinta la periodicidad». 20/20.
- `PlanEmpresa.tsx` sin cambios: la muestra por `cambioPendienteDelPlan` y el resumen al elegir otro plan (leído en el código).

## T10.3 — gate local (implementer, 2026-11-11)
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: corta en el paso del board, ajeno a la feature: `feature_list.json invalido: zona backend 6 in_progress (max 5), zona fullstack 4 (max 3)` (cupo del equipo; lo resuelve el leader).
- Por separado: typecheck verde; eslint de lo tocado verde; `test:guardias` 4 rojos, todos de `dependencias-declaradas-presentes` (baseline), 4808 pasan.
- Integración contra Postgres y E2E (`--project=dinero`, `e2e/dos-empresas-humo.spec.ts`): los corre el CI (sin base local; decisión del coordinador 2026-11-11).

## Menores m2–m4 de la revisión · backend_dev · sin commit (2026-11-11)
- Archivos: `lib/planes/jobs-factura-plataforma.ts` (m2), `db/migrations/20261111130100_factura_plataforma/migration.sql` (m3: `factura_plataforma_en_curso`; m4: `factura_plataforma_cerrar`), `tests/unit/planes/jobs-factura-plataforma.test.ts`, `tests/integration/db/factura-plataforma-aislamiento.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, `specs/.../requirements.md` (R39, una línea), `specs/.../design.md` (§2.5). `down.sql` sin cambios: hace DROP de las dos funciones. La migración no está en `origin/dev`.
- m2 → `jobs-factura-plataforma.test.ts` «R12: el error final conserva la causa de CADA empresa que falló, no solo su id».
- m3 → `factura-plataforma-aislamiento.test.ts` «R24, R28: una primera asignación pendiente con inicio el 18 se ve desde que se guarda…» (quincenal y mensual: pendiente = tras la cola = cerrada).
- m4 → `factura-plataforma-cambio-plan.test.ts` «R39, R36: una edición programada de la periodicidad al 16 que la cola aún no aplicó a las 00:10…» (con control: edición programada solo de nombre no hace esperar).
- typecheck verde; eslint de lo tocado verde; unit 16/16; `test:guardias` 4 rojos, todos de `dependencias-declaradas-presentes` (baseline), 4822 pasan. Integración: CI.
- Veredicto: m2–m4 hechos; los dos casos de integración nuevos solo los valida el CI.
