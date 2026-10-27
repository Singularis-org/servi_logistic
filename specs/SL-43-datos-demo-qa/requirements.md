# SL-43 «Datos de demostración para QA» — requirements

> Ficha: SL-43 · zona backend · complejidad high · rama `feature/SL-43-datos-demo-qa`.
> Spec escrito el 2026-10-25 por `spec_author`. El archivo no venía sembrado por `/afinar-feature`:
> el alcance es el texto de Jira con el OK de Carlos del 2026-10-23, y las condiciones nuevas son de
> Carlos del 2026-10-25, las dos recibidas por medio del leader.
> **Aprobado por Carlos Restrepo el 2026-10-25**, con las preguntas P1–P6 cerradas el mismo día
> (D15–D24). P5 cambió el diseño: la demo corre sola en el build de QA, no a mano.
> Depende de SL-19 (Storage por empresa, PR #16, sin mergear): la implementación empieza después de
> ese merge (`tasks.md > T0`).

## Pedido

Carlos Restrepo, 2026-10-23: QA tiene que tener dos empresas de demostración completas, creadas por
los servicios reales de la app, para poder probar a mano cualquier pantalla sin preparar datos cada
vez. Se puede repetir: borra sus propias empresas y las vuelve a crear, sin tocar las que alguien creó
a mano. En producción se niega a correr.

Carlos Restrepo, 2026-10-25:
- QA no procesa la cola de jobs (Vercel Cron solo corre en Production y el cron de QA se descartó).
  Los datos tienen que nacer listos para usarse, y ningún job de la demo puede llamar a un proveedor
  externo. Los archivos van a Storage por los adaptadores de SL-19.
- La demo se recrea en cada despliegue de QA, dentro del build, como las migraciones. Para entrar con
  un usuario demo, el código de acceso se lee en los logs de Vercel.

## Alcance

**Entra**

- Un paso del build que, en cada despliegue de QA (Preview de la rama `dev`), recrea las dos empresas
  demo después de migrar.
- El mismo código como comando por consola (`pnpm demo:qa`), para local y para los tests.
- Dos empresas de demostración con la misma receta, cada una con usuarios de todos los roles de
  empresa, zonas, tarifas y zona especial.
- Órdenes en los 20 estados vigentes, entradas por pantalla, por carga masiva y por API, con
  gestiones, rechazos, devoluciones e incidentes.
- Cierres de día y de bodega, wallet, tesorería, cobro de la plataforma y pago a la plataforma.
- Órdenes ya ubicadas y una cola sin trabajo pendiente de las empresas demo.
- El borrado de las empresas demo anteriores, con sus archivos de Storage.
- La guardia que impide correrlo en producción, con su test.

**Lo que NO entra**

- Ninguna pantalla nueva. Las empresas demo se ven en «Empresas» del superadmin como cualquier otra.
- Integraciones de las empresas demo (WhatsApp, Google Maps, optimización de rutas, asistente):
  SL-36 las deja sin configurar, y la demo no las configura.
- Suscripciones de webhook, plantillas de WhatsApp y envíos automáticos de WhatsApp en las empresas
  demo.
- Un cron o un drenado de la cola en QA (descartado por Carlos, 2026-10-25).
- Correr la demo en el build de producción, en CI o en los previews de ramas que no sean `dev`.
- Conservar lo que alguien cree a mano dentro de una empresa demo: el siguiente despliegue lo borra
  (D15).
- Dispositivos confiados para los usuarios demo: el acceso es con el código de los logs (D20).

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Requisitos |
|---|---|---|---|
| D1 | Se crean **dos empresas de demo en QA**, sin tocar las creadas a mano. | Carlos, 2026-10-23 (Jira) | R1, R6, R7, R10 |
| D2 | **Usuarios de cada rol** con correo `@example.test` (el dominio lo cambia D29), **zonas, tarifas y zona especial**. | Carlos, 2026-10-23 (Jira) | R12, R13 |
| D3 | **Órdenes en todos los estados**, entradas **por pantalla, por carga masiva y por API**, con **gestiones, rechazos, devoluciones e incidentes**. | Carlos, 2026-10-23 (Jira) | R14, R15, R16 |
| D4 | **Cierres de día y de bodega, wallet, tesorería y cobro de plataforma.** | Carlos, 2026-10-23 (Jira) | R17, R18, R19 |
| D5 | **Usa los servicios reales.** | Carlos, 2026-10-23 (Jira) | R11 |
| D6 | **Se niega a correr en producción**, con una guardia que tenga su test. | Carlos, 2026-10-23 (Jira) | R2, R3, R4, R5, R30 |
| D7 | **Es re-ejecutable**: borra y recrea solo sus empresas de demo. | Carlos, 2026-10-23 (Jira) | R7, R8, R9, R27, R28 |
| D8 | **QA no procesa la cola de jobs.** Las órdenes nacen **ya ubicadas**, nunca en «La dirección aún se está validando». | Carlos, 2026-10-25 | R20, R21, R22 |
| D9 | Las empresas demo no tienen integraciones (SL-36). **Ningún job de la demo puede llamar a Google, a WhatsApp ni a Anthropic, ni mandar un correo o un mensaje real.** El comando decide qué hace con cada job que encolan los servicios. | Carlos, 2026-10-25 | R22, R23, R24 |
| D10 | Los archivos de la demo se guardan con los **adaptadores de `lib/storage/` de SL-19** (`<organizacion_id>/<ruta>`), y el **borrado también borra los archivos**. La primera task es traer `dev` con SL-19 mergeado. | Carlos, 2026-10-25 | R9, R18 (y `tasks.md > T0`) |
| D11 | Una empresa es demo por una **marca en la base que solo pone el comando**, no por su nombre ni su slug. | `spec_author`, aprobado 2026-10-25 | R6, R10 |
| D12 | El borrado corre con el **rol dueño de la base**, no como la empresa: la empresa no puede borrar sus cargos ni su caja (`REVOKE` de SL-40 y SL-45). | `spec_author`, aprobado 2026-10-25 | R7, R8 |
| D13 | La contraseña de los usuarios demo sale de **`DEMO_QA_CONTRASENA`**, una variable *sensitive* de Preview solo para la rama `dev`. **Nunca se imprime.** | Carlos, 2026-10-25 (P5) | R5, R25, R26 |
| D14 | La guardia mira **una marca de entorno que vive en la propia base de QA**, además de `VERCEL_ENV` y de que la base y el Storage sean del mismo proyecto. Un `.env` copiado por error no basta para pasarla. | `spec_author`, aprobado 2026-10-25 | R3 |
| D15 | **P5. La demo corre sola en el build de cada despliegue de QA**, después de migrar, como `scripts/migrate-deploy.ts`. La activa una variable nueva, **`DEMO_ON_PREVIEW`**, solo con `gitBranch=dev`. Cada despliegue recrea las dos empresas desde cero; **se acepta perder lo creado a mano dentro de ellas**, y las empresas que no son demo nunca se tocan. `pnpm demo:qa` queda para local y para tests. | Carlos, 2026-10-25 | R1, R27, R29, R30 |
| D16 | **Usa las credenciales que ya tiene el build**: `DIRECT_URL` (la del dueño, la de la migración), `DATABASE_URL` y la clave de servicio de Storage de Preview (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). No se inventan otras variables aparte de las tres de D25. | Carlos, 2026-10-25 | R4 |
| D17 | **Las tres capas de la guardia se mantienen en el build** (`VERCEL_ENV`, el mismo proyecto y la marca en la base). En Preview, `VERCEL_ENV=preview`. | Carlos, 2026-10-25 | R2, R3, R4, R30 |
| D18 | **Si la demo falla, el build falla**, como cuando falla una migración: no queda en silencio. | Carlos (recomendación del leader), 2026-10-25; justificado en `design.md > D10.3` | R31 |
| D19 | **Tiempo de build:** la demo tiene un tope propio, muy por debajo del límite de Vercel. Si el tiempo medido obliga, **se recorta la empresa B** y se dice. | Carlos, 2026-10-25 (P4) | R33, R15 |
| D20 | **P1. Login:** se enciende **`AUTH_OTP_DEBUG_LOG=1` en Preview para la rama `dev`**. El código sale en los logs de Vercel y Carlos acepta que se vean los de todos los usuarios de QA. **Sin navegador confiado** (el antiguo R27 se retira). | Carlos, 2026-10-25 | R26 |
| D21 | **P2. La marca de QA:** el implementer prueba en Supabase qué sentencia funciona (`ALTER DATABASE`, `ALTER ROLE` o, si ninguna, una tabla de configuración). Queda como task con su prueba. | Carlos, 2026-10-25 | R3 |
| D22 | **P3. Coordenadas:** distritos y puntos fijos en el código. | Carlos, 2026-10-25 | R20 |
| D23 | **P4. La empresa B** lleva la **misma receta que A**, salvo que el tiempo de build obligue a recortarla (D19). | Carlos, 2026-10-25 | R12–R19 |
| D24 | **P6. Importes redondos** de `design.md > D5.2`. | Carlos, 2026-10-25 | R13, R19 |
| D25 | **Variables que Carlos crea en Vercel antes del merge** (Preview, rama `dev`): `DEMO_ON_PREVIEW`, `DEMO_QA_CONTRASENA` y `AUTH_OTP_DEBUG_LOG`. | Carlos, 2026-10-25 | R29, R25, R26 |
| D26 | Dos builds de QA a la vez **no recrean la demo a la vez**: el segundo espera al primero. | `spec_author` (`design.md > D10.2`) | R32 |
| D27 | **`novedad_interna` con el corte de mañana.** El corte diario solo cierra el día anterior, así que la demo llama a `CorteDiarioService.ejecutarCorte(<mañana>)` **solo sobre las empresas demo**, dentro de `conEmpresa(<demo>)` y nunca por la ruta del cron. Va detrás de `NOVEDAD_INTERNA_CON_CORTE_DE_MANANA = true` (`scripts/demo-qa/receta.ts`). | Carlos, 2026-10-25 (B1 de la implementación) | R15 |
| D28 | **Excepción de R12 para el perfil `api`.** `ApiKeyService.generar` crea su propio usuario, con el correo `apikey+<slug>@apikey.invalid` y una contraseña aleatoria, y ese rol no navega. La demo usa el servicio tal cual y no fuerza el correo. | leader, 2026-10-25 (review vuelta 1, m8: hecho técnico del servicio) | R12 |
| D29 | **Correos demo en `yopmail.com`**: `servi-<slug de la empresa>-<perfil>@yopmail.com` (p. ej. el del maestro de la demo A: `servi-` + `demo-qa-a` + `-maestro` + `@yopmail.com`). El buzón es público; se acepta porque solo son datos demo de QA y además hace falta `DEMO_QA_CONTRASENA`. El usuario de la API key no cambia (D28). El borrado identifica a los usuarios demo por su empresa (`es_demo`), nunca por el dominio. | Carlos, 2026-10-26 | R12, R7 |

## Glosario

- **Empresa demo**: una organización creada por la demo y marcada como tal en la base.
- **Empresa real**: cualquier otra organización, se haya creado a mano o por otro camino.
- **Marca de entorno QA**: un ajuste de la propia base que declara que es la base de QA
  (`design.md > D2`).
- **Paso de demo del build**: la ejecución de la demo dentro de `pnpm run build`, después de las
  migraciones y antes de `next build`.
- **Build de QA**: un build de Vercel con `VERCEL_ENV=preview` de la rama `dev`, que tiene
  `MIGRATE_ON_PREVIEW=true` y `DEMO_ON_PREVIEW=true`.
- **Orden ubicada**: orden con latitud y longitud guardadas y estado de geocodificación `OK`.
- **Asignable**: el gate de asignación por coordenadas (`AsignabilidadCoordenadasService`) devuelve
  `asignable` para la orden.
- **Job de la demo**: fila de la cola con la `organizacion_id` de una empresa demo.
- **Cerrar un job sin ejecutarlo**: dejarlo en un estado final sin correr su handler
  (`design.md > D6`).
- **Estados vigentes**: los 20 valores de `ORDER_STATUS_SEED` (`lib/types/order-status.ts`).

## Requisitos (EARS)

### La demo y la guardia

- **R1.** El sistema DEBE ofrecer una demo que, en una sola ejecución, borre las empresas demo que
  existan y cree dos empresas demo nuevas, A y B, con los datos de R12 a R19. Se DEBE poder ejecutar
  como paso del build y como comando por consola.
- **R2.** SI `VERCEL_ENV` vale `production`, ENTONCES la demo NO DEBE abrir ninguna conexión a la base
  ni a Storage. Como comando por consola, además, DEBE terminar con un código de salida distinto de 0.
- **R3.** SI la base a la que apunta la demo no tiene la marca de entorno QA, ENTONCES la demo DEBE
  terminar con un código de salida distinto de 0 sin haber escrito nada en la base ni en Storage.
- **R4.** SI `DIRECT_URL`, `DATABASE_URL` y el Storage de la demo no pertenecen al mismo proyecto
  (proyectos de Supabase distintos, o unos locales y otros no), ENTONCES la demo DEBE terminar con un
  código de salida distinto de 0 antes de abrir ninguna conexión.
- **R5.** El sistema NO DEBE escribir en la salida de la demo ni en el log del build la URL de la base,
  la clave de Storage, la contraseña de los usuarios demo, un hash de contraseña ni el secreto de una
  API key.

### Identificar y borrar las empresas demo

- **R6.** El sistema DEBE marcar como demo solo las organizaciones que crea la demo, y DEBE rechazar
  que una empresa, con su rol de aplicación, cambie esa marca.
- **R7.** CUANDO la demo borra las empresas demo, el sistema DEBE borrar todas sus filas (datos de
  negocio, usuarios, las filas de plataforma que cuelgan de esos usuarios y sus jobs) y NO DEBE
  cambiar ninguna fila de una empresa real ni de los catálogos, la geografía, la caché de
  geocodificación, la tarifa global de la plataforma o el superadmin.
- **R8.** SI el borrado de la base no puede completarse para todas las empresas demo, ENTONCES el
  sistema NO DEBE dejar ninguna fila borrada, y la demo DEBE terminar con un código distinto de 0 que
  nombre las tablas que lo impidieron.
- **R9.** CUANDO la demo borra una empresa demo, el sistema DEBE borrar antes sus archivos de Storage
  (los que nombran sus filas y sus temporales de descarga) y NO DEBE borrar ningún archivo fuera de la
  carpeta de esa empresa.
- **R10.** SI existe una empresa real con el slug de una de las empresas demo, ENTONCES la demo DEBE
  terminar con un código distinto de 0 sin borrar ni crear nada.

### Crear los datos con los servicios reales

- **R11.** El sistema DEBE crear cada empresa demo con el alta de empresa de la plataforma, y cada
  dato de R12 a R19 con el servicio que lo produce en la app, con la empresa demo en contexto y el
  actor del rol que lo haría en la app. Las únicas escrituras directas permitidas son las de la tabla
  `design.md > D5.3`.
- **R12.** CUANDO la demo termina, cada empresa demo DEBE tener un usuario de cada uno de estos
  perfiles: maestro, admin, tienda con bodega propia, tienda sin bodega propia, adminSatelite,
  mensajero de la zona central, mensajero de la zona satélite y la cuenta de una API key. Todos los
  correos, salvo el de la cuenta de la API key, DEBEN tener la forma
  `servi-<slug de la empresa>-<perfil>@yopmail.com` (D29), con 64 caracteres o menos antes de la `@`.
  Ese lo pone `ApiKeyService.generar` (`apikey+<slug>@apikey.invalid`, D28). Todos DEBEN ser los
  mismos en cada ejecución para la misma empresa demo y el mismo perfil.
- **R13.** CUANDO la demo termina, cada empresa demo DEBE tener una zona central y una satélite con su
  distrito, su tarifa de pago al mensajero y su SINPE confirmado; una tarifa por tienda; y al menos un
  distrito de sus zonas marcado como zona especial.
- **R14.** CUANDO la demo termina, cada empresa demo DEBE tener órdenes creadas por cada una de las
  tres vías de entrada: la pantalla de crear orden, la carga masiva y la API con API key.
- **R15.** CUANDO la demo termina, la empresa A DEBE tener al menos una orden viva en cada uno de los
  20 estados vigentes, y la empresa B también, salvo que se haya recortado por tiempo (D19). En ese
  caso, la salida DEBE decir qué estados le faltan a B.
- **R16.** CUANDO la demo termina, cada empresa demo DEBE tener al menos una gestión de cada resultado
  del portal del mensajero (entregada, rechazo, reprogramada y novedad), una entrega con pago mixto,
  una orden devuelta a su tienda y un incidente con indemnización.
- **R17.** CUANDO la demo termina, cada empresa demo DEBE tener al menos un cierre de día aprobado, uno
  rechazado, uno solicitado sin decidir y un cierre de bodega satélite aprobado.
- **R18.** CUANDO la demo termina, cada empresa demo DEBE tener movimientos de caja nacidos de aprobar
  cierres, un pago a un mensajero, un aporte de capital con su comprobante en Storage y un abono de una
  tienda.
- **R19.** CUANDO la demo termina, cada empresa demo DEBE tener una excepción propia de cobro de la
  plataforma, un cargo de la plataforma por cada orden creada y un pago a la plataforma registrado.

### Datos listos para usarse en un QA sin cola

- **R20.** CUANDO la demo crea una orden con dirección, el sistema DEBE dejarla ubicada en un punto
  fijo de su distrito sin llamar a ningún proveedor, y DEBE dejar cerrado el job de geocodificación de
  esa orden.
- **R21.** CUANDO la demo termina, el gate de asignación DEBE devolver `asignable` para toda orden demo
  que esté en un estado desde el que se asigna a un mensajero.
- **R22.** CUANDO la demo termina, NO DEBE quedar ningún job de la demo en `pending` ni en
  `processing`, y la salida DEBE contar, por tipo, los jobs que cerró sin ejecutarlos.
- **R23.** SI la demo encuentra un job suyo de un tipo que no está en la lista de tipos esperados
  (`design.md > D6`), ENTONCES DEBE cerrarlo sin ejecutarlo y terminar con un código distinto de 0 que
  nombre ese tipo.
- **R24.** MIENTRAS corre la demo, el sistema NO DEBE llamar a Google, a Meta/WhatsApp ni a Anthropic,
  ni enviar correos ni notificaciones push; y al terminar, las empresas demo NO DEBEN tener
  integraciones, suscripciones de webhook, plantillas de mensaje ni envíos automáticos de WhatsApp.

### Credenciales

- **R25.** SI `DEMO_QA_CONTRASENA` falta o no cumple la política de contraseñas de la app, ENTONCES la
  demo DEBE terminar con un código distinto de 0 antes de abrir ninguna conexión.
- **R26.** CUANDO la demo termina con éxito, su salida DEBE listar, por empresa demo, el perfil y el
  correo de cada usuario demo, y la contraseña de `DEMO_QA_CONTRASENA` DEBE ser la válida para cada uno
  en el paso de contraseña del login.

### Re-ejecución

- **R27.** CUANDO la demo corre por segunda vez sobre la misma base, DEBE terminar con código 0 y dejar
  exactamente dos empresas demo, las nuevas, sin filas ni archivos de las anteriores.
- **R28.** CUANDO una ejecución anterior se interrumpió después del alta de una empresa demo, la
  siguiente ejecución DEBE borrar esa empresa como cualquier otra empresa demo.

### El paso del build

- **R29.** CUANDO el build corre con `VERCEL_ENV=preview`, `MIGRATE_ON_PREVIEW=true` y
  `DEMO_ON_PREVIEW=true`, el sistema DEBE ejecutar la demo después de aplicar las migraciones y antes
  de compilar la app.
- **R30.** SI en el build falta cualquiera de esas tres condiciones, ENTONCES el paso de demo DEBE
  omitirse con código 0, sin abrir ninguna conexión, y DEBE dejar en el log una línea con el motivo.
- **R31.** SI la demo termina con un código distinto de 0 dentro del build, ENTONCES el build DEBE
  fallar.
- **R32.** MIENTRAS una ejecución de la demo está en curso sobre una base, otra ejecución sobre la
  misma base DEBE esperar a que termine antes de borrar o crear nada.
- **R33.** SI la demo supera su tope de tiempo (`design.md > D10.4`), ENTONCES DEBE abortar con un
  código distinto de 0 que lo diga.

## Trazabilidad de las decisiones

Cada fila de `## Decisiones cerradas` está cubierta por los requisitos de su última columna. El mapa
`R<n> → test` lo fija `design.md > D9` y lo completa el implementer en `progress/impl_SL-43.md`.

## Preguntas abiertas

Ninguna para el humano. Quedan dos comprobaciones de entorno que el spec no pudo hacer, y son tasks:

- Qué sentencia de la marca de QA acepta Supabase (D21): `tasks.md > T2b`.
- Que las variables de D16 existen en Preview para la rama `dev`, y el límite de duración del build en
  el plan de Vercel del equipo: `tasks.md > T0`. `spec_author` no tiene acceso al panel de Vercel:
  los nombres salen del código (`scripts/migrate-deploy.ts`, `lib/supabase/client.ts`) y del README.
