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
