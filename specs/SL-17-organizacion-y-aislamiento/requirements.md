# SL-17 «Tabla organizacion y aislamiento por empresa» — requirements

> Board Jira SL · épica SL-2 (Fase 2 — Varias empresas en la misma app) · assignee: Carlos Restrepo ·
> zona `backend` · complejidad alta · `sdd: true` · depende de SL-10.

## Alcance

**Qué es.** Que dos empresas usen la misma base sin verse. Este spec cubre el **aislamiento base**
que Carlos quiere listo el **2026-10-23**:

1. **Esquema.** Se crea la tabla `organizacion`, con un `slug` único, y cada tabla de negocio recibe
   `organizacion_id NOT NULL` con un índice. Los catálogos del sistema, la geografía y lo que usa el
   superadmin son de plataforma y quedan fuera. La clasificación de los 88 modelos está en
   `design.md > §2`.
2. **Filtro automático.** El cliente de base de datos de la app toma la empresa de la sesión y la
   aplica a toda lectura y escritura de un modelo de negocio. Si no hay empresa, falla cerrado.
3. **RLS por empresa en Postgres**, como defensa en profundidad, fijada por transacción. Cubre
   también el SQL escrito a mano.
4. **Misma empresa en cada referencia.** Una garantía en la base: una fila de negocio no puede
   apuntar a una fila de negocio de otra empresa, y la empresa de una fila no cambia. Se hace con
   triggers, sin tocar las relaciones de Prisma.
5. **Guardias** que ponen el gate en rojo en cuatro casos:
   - un modelo de negocio sin la columna;
   - una tabla de negocio sin política;
   - una FK de negocio a negocio sin su trigger;
   - un SQL a mano que no filtra por empresa.

   Cada excepción lleva su ficha.
6. **Tests de integración con dos empresas** que intentan leerse entre sí en los flujos críticos de
   órdenes, wallet, cierres y usuarios.
7. **La landing actual pasa a ser de la plataforma**, y se retiran sus conteos públicos, que sumaban
   todas las empresas.

**Lo que NO entra** (son fichas siguientes y no bloquean mañana):
- la revisión fina, uno a uno, del SQL a mano que la RLS ya cubre;
- SL-18: únicos y secuencias por empresa (`orden_num_guia_seq`, `email`, `cedula`, etc.);
- SL-19: el resto de la cola `jobs` (únicos de `dedupe_key`, revisión de cada handler) y el
  storage por empresa;
- SL-25: alta de empresas (no hay seeds de empresas), y SL-26: el panel del superadmin, incluida la
  edición del catálogo de vehículos;
- SL-32: el rol superadmin, el `CHECK` que liga `organizacion_id NULL` con ese rol, la comprobación
  de rol (`lib/auth/plataforma.ts`) y la pantalla «Empresas» del superadmin, que llama a la action
  de alta de SL-17;
- SL-28: consolidar migraciones (va después de esta);
- **SL-35 «Landing pública por empresa con postulación»**: que cada empresa encienda o apague su
  ruta pública con su contenido, y la postulación por empresa en esa ruta;
- **SL-36 «Módulo de integraciones por empresa»**: credenciales de API por empresa, aisladas y
  nunca combinadas. WhatsApp entra ahí;
- toda UI de alta de empresas. SL-17 deja solo la pieza de dominio: servicio, repositorio y
  Server Action protegida.

**Prioridad máxima de Carlos (2026-10-22):** mañana tienen que poder usar la app **al menos dos
empresas reales**, con los datos separados y todos los módulos funcionando, en Vercel y en Supabase
(cuentas propias de Carlos). Hay dos bases nuevas y vacías: **producción** (Production) y **QA**
(Preview). De ahí salen la pieza de alta que usa el superadmin (R44–R46), el humo de dos empresas
(R47) y la verificación de las dos bases reales (T4.1).

## Decisiones cerradas (no reabrir)

Las tomó Carlos el 2026-10-22 y las transmitió el leader. D1–D11 llegaron con el encargo del spec;
D12–D17 cierran las preguntas abiertas de la primera versión.

| # | Decisión | Cubierta por |
|---|---|---|
| D1 | Alcance de mañana = «aislamiento base»: esquema + filtro automático + RLS + guardias + tests de dos empresas. | R1–R48 |
| D2 | `organizacion` + `organizacion_id NOT NULL` + índice en cada tabla de negocio. Catálogos del sistema, geografía y superadmin son de plataforma. La clasificación de los 88 modelos vive en `design.md`. | R1, R2, R4, R5 |
| D3 | El filtro es una extensión del cliente Prisma: toma la empresa de la sesión e inyecta `organizacion_id` en todo where/create/update/delete/upsert de un modelo de negocio. Falla cerrado (error) si no hay empresa en contexto. | R7–R13 |
| D4 | RLS por empresa con `set_config('app.organizacion_id', …, true)` por transacción, como defensa en profundidad, cubriendo también el SQL a mano (66 archivos con `$queryRaw`/`$executeRaw`). | R17–R22 |
| D5 | Guardia: falla si un modelo de negocio no tiene `organizacion_id` o si un SQL a mano no filtra por empresa, con lista de excepciones con ficha. | R23–R27 |
| D6 | Tests de integración con DOS empresas que intentan leerse entre sí: órdenes, wallet, cierres y usuarios. | R28–R31 |
| D7 | Fuera de mañana: revisión fina del SQL a mano, SL-18, SL-19. | Alcance (Lo que NO entra), R26 |
| D8 | Un usuario pertenece a UNA sola empresa (`usuario.organizacion_id`). El superadmin (SL-32) no tiene empresa: `organizacion_id NULL`, y nunca pasa por el filtro de empresa. El punto de encuentro con SL-32 no depende de su merge. | R3, R14, R15, R35, R36 |
| D9 | SL-28 va DESPUÉS. SL-17 añade migraciones normales encima de las 228 actuales, cada una con su `down.sql`. No hay base desplegada: la local se rehace con `migrate reset`. | R6 |
| D10 | App vacía: sin seeds de empresas (las crea el superadmin en SL-25). En los tests, las fábricas crean su organización. | R32, R33 |
| D11 | Choques: SL-31 (crea `tests/fabricas/`, toca `gate.yml`) y SL-32 (toca `usuario`/`rol`). Se declaran en `design.md` con la regla «quien mergea segundo rebasa». | design.md §10 (no es comportamiento: no lleva R) |
| D12 | `vehiculos` es de **plataforma**: las empresas solo lo leen (`SELECT USING (true)`), y escribir desde una empresa falla cerrado. La edición pasa al superadmin (SL-26). La pantalla `configuracion/vehiculos` del maestro queda de solo lectura o falla cerrado al escribir. Es un cambio frente a SL-32, donde Vehículos seguía con el maestro. | R40 |
| D13 | `organizacion.slug`, único y `NOT NULL`, entra ya en SL-17. La landing actual pasa a ser de la plataforma. SL-35 «Landing pública por empresa con postulación» cubre la ruta pública por empresa (encendido, apagado y contenido) y la postulación por empresa. Mañana, la postulación pública sin empresa falla cerrado. | R1, R41 |
| D14 | WhatsApp corre en contexto de plataforma, como excepción. Lo absorbe SL-36 «Módulo de integraciones por empresa» (credenciales de API por empresa, aisladas y nunca combinadas). Carlos traerá un ejemplo de otra app. | R15, R27 |
| D15 | Referencias entre empresas: hace falta una **garantía estructural** en SL-17, sin tocar las relaciones de Prisma. Se hace con una función plpgsql genérica y un trigger `BEFORE INSERT OR UPDATE OF <fk>` por cada FK de negocio a negocio. Si la empresa difiere, el trigger lanza un error con SQLSTATE propio. Quedan excluidas las FK hacia plataforma (catálogos, `vehiculos`, geografía, `organizacion`) y las que apuntan a un usuario superadmin (NULL). La migración se genera desde el DMMF y trae su `down.sql`. Una guardia cubre las FK nuevas, y un test de integración prueba el rechazo en la base. Se mantiene también la lectura previa en los servicios, y se mide el coste por insert. | R37, R38, R39, R43 |
| D16 | Drenador de jobs: opción (b). Se adelanta `jobs.organizacion_id`, nulable y capturada de la transacción que encola, y cada job corre con su empresa. | R42 |
| D17 | Se retiran los conteos públicos de la landing. | R43 |
| D18 | Mañana al menos dos empresas reales usan la app con todos los módulos. **Revisada por Carlos el mismo día:** las empresas se crean **desde el superadmin**, no por comando. SL-17 deja la pieza de dominio `OrganizacionService.altaEmpresa({nombre, slug, maestro: {nombre, email}})`, su repositorio y una Server Action que exige rol superadmin. El servicio es atómico y valida con zod; si el slug ya existe, es idempotente o falla con conflicto; corre en contexto de plataforma citando SL-17. La comprobación de rol es de SL-32 (`lib/auth/plataforma.ts`): sin ella, la action falla cerrado para todos, y el punto de enganche queda explícito. La pantalla «Empresas» va en SL-32. No abre alcance de SL-25 ni de SL-26. | R44, R45, R46, R48 |
| D19 | Humo de aceptación de dos empresas en la tanda 4: crea A y B con el servicio desde la fixture (se cambia por la pantalla de SL-32 cuando exista) y recorre en cada una los módulos del menú real del maestro. Ni un dato de A aparece en B, y ninguna pantalla rompe por falta de empresa. | R47 |
| D20 | Los crons, el drenador y las rutas con API key tienen que **funcionar** con dos empresas, no solo no filtrar. | R13, R16, R42 (con dos empresas con datos) |
| D21 | Mañana corre en Vercel y en Supabase (cuentas de Carlos), con dos bases nuevas y vacías: producción para Production y QA para Preview. Antes de dar de alta empresas se verifica **en las dos** el rol `servi_app`, el `SET ROLE` desde el pooler, la RLS y que el dueño no se la salta. Si falla, hay un plan B escrito, y su `DATABASE_URL_APP` va por entorno: Production y Preview. | T4.1 (verificación de despliegue; design §4) |

## Requisitos (EARS)

### Esquema

- **R1.** El sistema DEBE tener una entidad `organizacion` con identificador, nombre, `slug` y fechas
  de alta y de última modificación. El `slug` es obligatorio y único entre todas las empresas.
- **R2.** Cada modelo clasificado como **negocio** en `design.md > §2` DEBE tener `organizacion_id`
  obligatorio, con clave ajena a `organizacion` y un índice cuya primera columna sea
  `organizacion_id`. `usuario` es la única excepción a «obligatorio» (R3).
- **R3.** `usuario.organizacion_id` DEBE admitir NULL (el superadmin). `usuario` es la **única**
  tabla de negocio donde se permite: en las otras 72 es obligatoria. Todo usuario con empresa DEBE
  pertenecer a exactamente una.
- **R4.** Los modelos clasificados como **plataforma** en `design.md > §2` NO DEBEN tener
  `organizacion_id`.
- **R5.** CUANDO se crea un modelo nuevo en `db/schema.prisma`, el sistema DEBE exigir que esté
  clasificado como negocio, plataforma o diferido (con ficha). Si no lo está, el gate falla (R23).
- **R6.** Cada migración que añade esta feature DEBE traer un `down.sql`. Aplicar la migración y
  luego su `down.sql` sobre una base migrada DEBE dejar el esquema como estaba antes.
- **R35.** SI se crea un `usuario` sin empresa, ENTONCES el cliente de la app DEBE rechazar la
  operación con un error. Hay una sola salvedad: la creación desde un contexto de plataforma que
  pasa `organizacion_id = NULL` **explícito**, como el comando de arranque del superadmin de SL-32.
  La regla de base de datos que liga el NULL con el rol superadmin, `CHECK ((rol = superadmin) <->
  (organizacion_id IS NULL))`, NO la escribe SL-17, porque ese rol aún no existe. La añade SL-32
  en una migración posterior. Es el contrato entre las dos fichas (`design.md > §10`).
- **R36.** En SL-17, los únicos de `usuario.email` y `usuario.cedula` DEBEN seguir siendo
  **globales**: un mismo email o documento no puede existir en dos empresas. Si pasan a ser por
  empresa, lo decide y migra SL-18.

### Filtro automático en el cliente de la app

- **R7.** MIENTRAS haya una empresa en contexto, toda lectura de un modelo de negocio hecha con el
  cliente de la app DEBE devolver solo filas de esa empresa. Cubre `findMany`, `findFirst`,
  `findUnique`, `findFirstOrThrow`, `findUniqueOrThrow`, `count`, `aggregate` y `groupBy`.
- **R8.** MIENTRAS haya una empresa en contexto, toda escritura sobre un modelo de negocio
  (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`) DEBE afectar solo filas de esa empresa.
  Sobre una fila de otra empresa DEBE comportarse igual que sobre una fila que no existe.
- **R9.** CUANDO se crea una fila de un modelo de negocio (`create`, `createMany`, `upsert`), el
  sistema DEBE guardarla con la empresa del contexto.
- **R10.** SI los datos de una creación o actualización traen un `organizacion_id` distinto del de
  la empresa en contexto, ENTONCES el sistema DEBE rechazar la operación con un error y no escribir
  nada.
- **R11.** SI se opera un modelo de negocio sin empresa en contexto y sin un contexto de plataforma
  declarado, ENTONCES el sistema DEBE lanzar un error identificable (empresa no resuelta) **sin
  ejecutar** la consulta.
- **R12.** CUANDO una petición autenticada por sesión opera sobre datos de negocio, la empresa en
  contexto DEBE ser la `organizacion_id` del usuario dueño de la sesión. Ningún dato que mande el
  cliente puede fijarla: ni el cuerpo, ni la query, ni las cabeceras, ni otra cookie.
- **R13.** CUANDO una petición llega autenticada por API key, la empresa en contexto DEBE ser la de
  esa API key.
- **R14.** SI el usuario de la sesión no tiene empresa (superadmin), ENTONCES toda operación sobre
  un modelo de negocio por el cliente de la app DEBE fallar como R11. Ninguna empresa se le asigna
  por defecto.
- **R15.** DONDE un punto de entrada figure en la lista de excepciones de plataforma (cada una con
  su justificación y su ficha), el sistema DEBE permitirle operar sin filtro de empresa. Son, por
  ejemplo, el login, la validación de la sesión, los jobs sin empresa, el alta de empresa por el
  superadmin, el webhook y la sincronización de WhatsApp (SL-36) y el panel del superadmin (SL-26).
- **R16.** CUANDO corre un cron o un job recurrente que toca datos de negocio, el sistema DEBE
  ejecutarlo una vez por cada empresa existente, cada vez con esa empresa en contexto. Sin
  empresas, termina sin tocar datos de negocio y sin error.
- **R34.** Toda caché de datos de negocio (analítica, tablero del día) DEBE separar sus entradas
  por empresa. Si dos empresas hacen la misma consulta con los mismos parámetros, NO DEBEN
  compartir la entrada.
- **R41.** SI llega una postulación pública (de mensajero o de recurso) sin una empresa en
  contexto, ENTONCES el sistema DEBE rechazarla sin crear usuario, documentos ni postulación.
- **R42.** CUANDO se encola un job dentro de un contexto de empresa, el job DEBE guardar esa
  empresa, y el drenador DEBE ejecutarlo con esa empresa en contexto. Un job sin empresa se ejecuta
  en contexto de plataforma; si es recurrente y toca negocio, itera las empresas (R16).

### RLS por empresa (defensa en profundidad)

- **R17.** Cada tabla de negocio DEBE tener RLS activa y una política para el rol de base de datos
  de la app. La política solo deja leer, insertar, actualizar o borrar filas cuyo `organizacion_id`
  es la empresa fijada en la transacción en curso.
- **R18.** MIENTRAS la app opera con una empresa en contexto, cada transacción que abra DEBE fijar
  esa empresa (local a la transacción) y operar con el rol sin privilegio de saltarse la RLS. Así
  también el SQL a mano queda sujeto a la RLS.
- **R19.** SI una transacción con el rol de la app no fijó empresa, ENTONCES las tablas de negocio
  DEBEN devolver cero filas y rechazar toda inserción.
- **R20.** CUANDO un SQL a mano sin filtro por empresa lee o modifica una tabla de negocio con la
  empresa A en contexto, el resultado DEBE limitarse a filas de A.
- **R21.** La empresa fijada en una transacción NO DEBE sobrevivir a ella. Una transacción
  posterior en la misma conexión que no fije empresa se comporta como R19.
- **R22.** MIENTRAS la app opera con una empresa en contexto, los catálogos y la geografía de
  plataforma DEBEN seguir siendo legibles, y las tablas de sesión y de autenticación solo DEBEN
  mostrar filas de usuarios de esa empresa.
- **R40.** SI una transacción con empresa en contexto intenta insertar, modificar o borrar una fila
  de `vehiculos` o de otro catálogo de plataforma, ENTONCES la base DEBE rechazarlo, y la fila no
  cambia.

### Misma empresa en cada referencia (garantía estructural)

- **R37.** CUANDO se inserta una fila de negocio, o se cambia una de sus claves ajenas hacia otra
  tabla de negocio, y la fila referenciada pertenece a otra empresa, la base DEBE rechazar la
  escritura con un error de SQLSTATE propio que nombre la tabla y la columna. Esto vale con
  cualquier rol de conexión (app o plataforma) y aunque el servicio no haya leído antes la fila
  referenciada. Hay dos excepciones: las claves ajenas hacia tablas de plataforma, y las que apuntan
  a un `usuario` sin empresa (superadmin).
- **R38.** SI se intenta cambiar el `organizacion_id` de una fila de negocio ya existente,
  ENTONCES la base DEBE rechazarlo con el mismo SQLSTATE de R37.
- **R39.** SI existe en `db/schema.prisma` una clave ajena de un modelo de negocio a otro modelo de
  negocio sin su trigger de misma empresa en `db/migrations/`, ENTONCES el gate DEBE fallar
  nombrando el modelo y el campo.

### Guardias (gate)

- **R23.** SI un modelo de `db/schema.prisma` clasificado como negocio no tiene `organizacion_id` o
  su índice, si uno de plataforma lo tiene, o si un modelo no está clasificado, ENTONCES el gate
  DEBE fallar nombrando el modelo.
- **R24.** SI una tabla de negocio no tiene en `db/migrations/` una política RLS por empresa,
  ENTONCES el gate DEBE fallar nombrando la tabla.
- **R25.** SI un archivo de producción con SQL a mano nombra una tabla de negocio y no filtra por
  `organizacion_id`, y no está en la lista de excepciones, ENTONCES el gate DEBE fallar nombrando el
  archivo y la tabla.
- **R26.** SI una excepción de las listas de R25 o R27 no trae ficha (`SL-<n>`) y motivo, o nombra
  un archivo que ya no existe, ENTONCES el gate DEBE fallar.
- **R27.** SI un archivo fuera de la lista de excepciones de plataforma abre un contexto de
  plataforma, ENTONCES el gate DEBE fallar nombrando el archivo.

### Tests de integración con dos empresas

- **R28. Órdenes.** CUANDO un actor de la empresa B lista, busca o lee por id órdenes, DEBE ver
  solo órdenes de B. CUANDO intenta modificar o borrar por id una orden de A, DEBE recibir «no
  encontrado» y la orden de A queda intacta.
- **R29. Wallet.** CUANDO un actor de B consulta saldos o movimientos de la wallet, o registra un
  movimiento que referencia por id a un recurso de A, NO DEBE ver ni alterar el dinero de A, y los
  saldos de A no cambian.
- **R30. Cierres.** CUANDO un actor de B lista o resuelve (aprueba o rechaza) cierres, DEBE ver
  solo cierres de B. Sobre un cierre de A, DEBE recibir «no encontrado» sin cambiar su estado.
- **R31. Usuarios.** CUANDO un actor de B lista, busca o edita usuarios, DEBE ver y editar solo
  usuarios de B. Un usuario sin empresa (superadmin) no aparece en el listado de ninguna empresa.

### Datos de arranque y landing

- **R32.** Las migraciones y los seeds NO DEBEN crear filas de `organizacion`.
- **R33.** Las fábricas de test DEBEN poder crear una organización propia y dejar sus datos de
  prueba asociados a ella, sin depender de filas existentes en la base.
- **R43.** El sistema NO DEBE exponer sin sesión ningún conteo ni agregado calculado sobre datos de
  negocio. La landing de la plataforma no muestra conteos públicos.

### Alta de empresa (pieza de dominio que usa el superadmin) y aceptación con dos empresas

- **R44.** CUANDO `OrganizacionService.altaEmpresa` recibe un nombre, un slug libre y los datos del
  primer maestro, el sistema DEBE crear en una sola transacción la organización y un usuario con rol
  `maestro`, estado `activo` y esa empresa. El usuario nace **sin contraseña utilizable**, y fija la
  suya con el flujo existente de «recuperar contraseña». Los datos del maestro son `nombre` y
  `email`, más lo que resuelva la pregunta abierta 1.
- **R45.** SI el slug ya existe con el mismo email de maestro, ENTONCES `altaEmpresa` NO DEBE
  escribir nada y DEBE devolver la empresa existente (idempotente). SI el slug existe con otros
  datos, ENTONCES DEBE devolver un conflicto por slug sin escribir nada.
- **R46.** SI la entrada no es válida (slug con otro formato, email inválido, campo vacío), o si el
  email del maestro ya pertenece a otro usuario (único global, R36), ENTONCES `altaEmpresa` DEBE
  devolver un error que nombre el campo o el conflicto, y no dejar ninguna fila escrita, tampoco la
  organización.
- **R48.** CUANDO se invoca la Server Action de alta de empresa, el sistema DEBE ejecutarla solo si
  el actor de la sesión es superadmin según `lib/auth/plataforma.ts` (SL-32). Cualquier otro actor
  (maestro, admin, otro rol, o sin sesión) DEBE recibir «no autorizado» sin que el servicio se
  llame. MIENTRAS esa comprobación de SL-32 no exista en el código, la action DEBE rechazar a
  **todos** los actores.
- **R47.** CUANDO dos empresas creadas con `altaEmpresa` y con datos propios recorren con su
  maestro todas las rutas del menú del maestro (según `lib/auth/menu-visibility.ts`), cada ruta
  DEBE responder sin error ni fallo por falta de empresa, y ningún dato de una empresa DEBE
  aparecer en las pantallas de la otra.

## Preguntas abiertas

Las seis de la primera versión quedaron cerradas por Carlos el 2026-10-22 (D12–D17). Queda una,
nacida de D18 revisada:

1. **Datos obligatorios del primer maestro.** La firma decidida es
   `maestro: { nombre, email }`, pero `usuario` exige `telefono`, `cedula` (única global) y
   `tipo_identificacion_id`, todos `NOT NULL` en `db/schema.prisma`. No se pueden rellenar con
   valores inventados: una cédula de relleno chocaría en la segunda empresa por el único global.
   **Recomendación:** ampliar la entrada a `maestro: { nombre, email, telefono, documento,
   tipoDocumento }`, validada con zod. La alternativa es hacer nulables esas tres columnas, pero
   cambia el modelo heredado y su validación en la postulación (feature 21).
   **Mientras no haya respuesta**, T2.8 implementa la firma ampliada, porque la otra no puede
   insertar.

Queda por verificar lo técnico:
- el rol `servi_app` en las dos bases reales (producción y QA), con su plan B: T4.1 y
  `design.md > §4`;
- el coste de la envoltura y de los triggers: T1.1 y T2.7.
