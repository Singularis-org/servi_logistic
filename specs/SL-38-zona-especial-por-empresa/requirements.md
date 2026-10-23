# SL-38 «Distritos de zona especial por empresa» — requirements

## Alcance

Cada empresa marca **sus propios** distritos de zona especial, sobre la geografía de la plataforma.
La marca deja de ser una columna global de `distrito` y pasa a una tabla de negocio,
`distrito_zona_especial(organizacion_id, distrito_id)`, con RLS por empresa. Tarifas y todos los
cálculos de dinero que hoy leen `distrito.zona_especial` pasan a leer la marca **de la empresa de la
orden** (o de la sesión, en Tarifas). La pantalla de Tarifas vuelve a dejar que el `maestro` marque y
desmarque, como antes de SL-17.

Contexto de partida (SL-17 en `dev`):
- La geografía (`provincia`, `canton`, `distrito`) es de plataforma y de solo lectura para la empresa
  (SL-17 R40). Por eso `actualizarDistritosEspeciales` responde con un error 500 al `maestro`.
- La columna `distrito.zona_especial` sigue existiendo y la leen ocho lecturas vivas (inventario en
  `design.md > Lo que ya existe`). En toda base desplegada vale `false` en todas las filas.

**Lo que SÍ entra:**
- la tabla de marcas por empresa, con el patrón de SL-17: `organizacion_id NOT NULL`, la extensión, la
  RLS con `servi_app`, el trigger de «sin cambio de empresa» y el registro en `MODELOS_DE_NEGOCIO`;
- retirar la columna `distrito.zona_especial`;
- la escritura de la marca desde Tarifas por el `maestro`, con la misma acción y el mismo contrato;
- pasar todas las lecturas vivas a la marca de la empresa: el árbol de Tarifas, el Excel de cobertura,
  la carga masiva, el alta por API, la cotización, la corrección de datos del cliente, el cobro del
  rechazo de la tienda, el listado de órdenes, el costeo estimado de la API y el congelado del cierre.

**Lo que NO entra:**
- `cambiarActivacionGeografica` y el resto de la gestión de geografía: pasan al superadmin en SL-32
  (T11). Esta ficha solo arregla la escritura de la marca.
- La pantalla de geografía del superadmin y el registro de sus acciones (SL-26, P7 de SL-32).
- Registrar en el historial de acciones quién marca un distrito: hoy no se registra, y no se añade.
- Las lecturas de **snapshot** (`cierre_detail.es_zona_especial`): cierres, wallet, aportes, analítica
  de dinero por producto y `scripts/contraste-454.*`. Leen lo congelado y no cambian.
- La geografía por país (SL-20).

## Requisitos (EARS)

### La marca por empresa (modelo de datos)

- **R1.** El sistema DEBE tratar un distrito como zona especial para una empresa si y solo si existe
  una marca de esa empresa para ese distrito. DEBE haber como mucho una marca por par
  (empresa, distrito): una segunda inserción del mismo par DEBE fallar en la base.
- **R2.** La tabla de marcas DEBE seguir el patrón de las tablas de negocio de SL-17:
  - `organizacion_id NOT NULL`, con FK a `organizacion`, índice y el `DEFAULT` que toma la empresa de
    la transacción;
  - la política `distrito_zona_especial_por_empresa` para `servi_app`;
  - el trigger `distrito_zona_especial_sin_cambio_de_empresa`;
  - el registro en `MODELOS_DE_NEGOCIO`.

  Las guardias `organizacion-en-modelos`, `rls-por-empresa` y `fk-misma-empresa` DEBEN pasar con la
  tabla nueva contada (74 tablas de negocio).
- **R3.** MIENTRAS una transacción corre con la empresa B fijada y el rol `servi_app`, el sistema NO
  DEBE devolver ninguna marca de la empresa A. Vale para la lectura directa de la tabla, para la
  lectura anidada desde `distrito` o desde `orden`, y para el SQL a mano. En la misma transacción,
  insertar una marca con el `organizacion_id` de A DEBE fallar.
- **R4.** SI una escritura intenta cambiar el `organizacion_id` de una marca, ENTONCES la base DEBE
  rechazarla con el SQLSTATE `SL017`, también como dueño y por SQL a mano.
- **R5.** La migración que crea la tabla DEBE traer un `down.sql` que deje el esquema como estaba:
  aplicar `migration.sql` y después `down.sql` DEBE dejar iguales las columnas
  (`information_schema`), `pg_policies` y `pg_trigger`.

### La columna global

- **R6.** El sistema DEBE retirar la columna `distrito.zona_especial`. Tras la migración, la tabla
  `distrito` no la tiene, `db/schema.prisma` no declara `Distrito.zonaEspecial`, y ningún archivo de
  `lib/` ni de `app/` lee la marca de otra fuente que la de R1.
- **R7.** SI al aplicar la migración de retiro algún distrito tiene `zona_especial = true`, ENTONCES
  la migración DEBE abortar sin cambiar nada y con un mensaje que nombre la causa. Una base local con
  marcas antiguas se rehace con `pnpm run db:reset`.
- **R8.** El `down.sql` del retiro DEBE devolver la columna con su forma anterior: `BOOLEAN`, nulable
  y con `DEFAULT false`.

### Escribir la marca (Tarifas, `maestro`)

- **R9.** CUANDO el `maestro` guarda la marca desde Tarifas con `{ marcar, desmarcar }`, el sistema
  DEBE, en una sola transacción:
  - crear las marcas de **su** empresa para los distritos de `marcar`;
  - borrar las marcas de **su** empresa para los distritos de `desmarcar`;
  - responder `{ status: "ok", actualizados }`, donde `actualizados` es el número de marcas creadas
    más las borradas.

  Marcar un distrito ya marcado no DEBE duplicarlo ni fallar, y desmarcar uno sin marca no DEBE
  fallar; ninguno de los dos cuenta en `actualizados`. Con la RLS y la extensión reales, la respuesta
  NO DEBE ser un error 500.
- **R10.** Escribir la marca NO DEBE modificar ninguna fila de `distrito` ni ninguna marca de otra
  empresa. Si A tiene marcado un distrito y B lo desmarca, la marca de A sigue.
- **R11.** SI el actor no tiene sesión, ENTONCES el sistema DEBE responder `unauthenticated`. SI el
  actor no es `maestro` (el superadmin incluido), ENTONCES DEBE responder `forbidden`. En los dos
  casos, sin leer ni escribir marcas.
- **R12.** SI la entrada no es válida (un id vacío, o el mismo id en `marcar` y en `desmarcar`),
  ENTONCES el sistema DEBE responder `validation_error` sin escribir. SI las dos listas están vacías,
  ENTONCES DEBE responder `{ status: "ok", actualizados: 0 }` sin abrir transacción.
- **R13.** SI algún id de `marcar` no corresponde a un distrito existente, ENTONCES el sistema DEBE
  responder `validation_error` y no dejar escrita ninguna marca del lote.

### Leer la marca de la empresa

- **R14.** CUANDO el `maestro` abre Tarifas, el árbol geográfico DEBE presentar como especiales
  exactamente los distritos que tiene marcados su empresa. La marca de otra empresa no aparece.
- **R15.** El Excel de cobertura de Tarifas DEBE poner «Sí» en la columna Zona especial cuando el
  distrito está marcado por la empresa del actor, y «No» en cualquier otro caso. El valor «Sin
  definir» deja de existir (ver P1).
- **R16.** CUANDO se tarifa una orden nueva (carga masiva, alta por API key o cotización), el sistema
  DEBE elegir el flete del pacto especial si y solo si el distrito de la orden está marcado por la
  empresa de la orden. Las reglas del flete no cambian (`resolverFlete`).
- **R17.** CUANDO se corrigen los datos del cliente de una orden, la marca de la orden y la del
  distrito propuesto DEBEN salir de la empresa de la orden, y el aviso del importe DEBE usarlas.
- **R18.** CUANDO una tienda rechaza una orden desde novedades, el cobro congelado del rechazo DEBE
  usar la marca de la empresa de la orden.
- **R19.** El listado de órdenes (sus columnas de dinero) y el costeo estimado de la API
  (consulta y listado por API key) DEBEN usar la marca viva de la empresa de la orden.
- **R20.** CUANDO se solicita un cierre, `cierre_detail.es_zona_especial` DEBE congelar la marca de la
  empresa en ese instante. Marcar o desmarcar el distrito después NO DEBE cambiar ninguna fila ya
  congelada, ni lo que muestran los cierres, el wallet o la analítica, que leen lo congelado.
- **R21.** MIENTRAS el mismo distrito esté marcado por la empresa A y no por la B, una orden de A en
  ese distrito DEBE tarifarse con el pacto especial y una de B con el flete normal, por cada camino
  de R14–R20.
- **R22.** Toda lectura de la marca en `lib/` DEBE pasar por un único punto compartido. Una guardia
  DEBE fallar si otro archivo lee la relación de marcas por su cuenta.

### Verificación del despliegue y documentación

- **R23.** El script `scripts/verificar-rls-despliegue.ts` DEBE esperar tantas políticas
  `*_por_empresa` y tantos triggers `*_sin_cambio_de_empresa` como modelos haya en
  `MODELOS_DE_NEGOCIO`, sin un número escrito a mano.
- **R24.** `docs/architecture.md > Multi-empresa` DEBE contar 74 tablas de negocio y decir que la
  marca de zona especial es de la empresa. `progress/deudas.md > D12` DEBE dejar resuelta la pregunta
  «dónde vive la marca de zona especial».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Respuesta | Cubre |
|---|---|---|---|
| 2026-10-23 | ¿Dónde vive la marca de zona especial? | Por empresa, en la tabla `distrito_zona_especial(organizacion_id, distrito_id)` con RLS. Cada empresa marca sus distritos sobre la geografía de la plataforma (Carlos). | R1–R5 |
| 2026-10-23 | ¿Quién lee la marca? | Tarifas la lee por empresa, y los cálculos también (Carlos). | R14–R21 |
| 2026-10-23 | ¿Quién la edita? | La pantalla de Tarifas vuelve al `maestro` (Carlos). | R9–R13 |
| 2026-10-22 | ¿Puede la empresa escribir en la geografía? | No. Es de plataforma y de solo lectura para la empresa (SL-17 D2 y R40, heredada). Marcar un distrito no escribe en `distrito`. | R10 |

## Preguntas abiertas

Ninguna bloquea el spec.

- **P1 (Carlos, no bloquea). «Sin definir» en el Excel de cobertura.** La ficha 465 (R13) pedía tres
  valores: «Sí», «No» y «Sin definir». Con una tabla de marcas solo hay dos: el distrito tiene marca o
  no la tiene. «Sin definir» no se ha escrito nunca (la columna nació con `DEFAULT false` y nadie
  escribe `NULL`). El spec propone dos valores (R15). Si Carlos quiere conservar el tercero, haría
  falta una columna `es_especial BOOLEAN NULL` en la tabla de marcas y cambiaría R1 y R15.
