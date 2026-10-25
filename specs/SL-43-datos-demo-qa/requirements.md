# SL-43 «Datos de demostración para QA» — requirements

> Ficha: SL-43 · zona backend · complejidad high · rama `feature/SL-43-datos-demo-qa`.
> Spec escrito el 2026-10-25 por `spec_author`. El archivo no venía sembrado por `/afinar-feature`:
> el alcance es el texto de Jira con el OK de Carlos del 2026-10-23, y las condiciones nuevas son de
> Carlos del 2026-10-25, las dos recibidas por medio del leader.
> Depende de SL-19 (Storage por empresa, PR #16, sin mergear): la implementación empieza después de
> ese merge (`tasks.md > T0`).

## Pedido

Carlos Restrepo, 2026-10-23: un comando que llena QA con dos empresas de demostración completas,
creadas por los servicios reales de la app, para poder probar a mano cualquier pantalla sin
preparar datos cada vez. El comando se puede repetir: borra sus propias empresas y las vuelve a
crear, sin tocar las que alguien creó a mano. En producción se niega a correr.

Carlos Restrepo, 2026-10-25: QA no procesa la cola de jobs (Vercel Cron solo corre en Production y
el cron de QA se descartó). Los datos tienen que nacer listos para usarse, y ningún job de la demo
puede llamar a un proveedor externo. Los archivos van a Storage por los adaptadores de SL-19.

## Alcance

**Entra**

- Un comando por consola que se corre a mano contra QA.
- Dos empresas de demostración, cada una con usuarios de todos los roles de empresa, zonas, tarifas
  y zona especial.
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
- Correrlo en CI o en el build: es un comando manual.
- Datos de demostración en producción o en local por defecto (en local solo lo usa su test).

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Requisitos |
|---|---|---|---|
| D1 | Un comando crea **dos empresas de demo en QA**, sin tocar las creadas a mano. | Carlos, 2026-10-23 (Jira) | R1, R6, R7, R10 |
| D2 | **Usuarios de cada rol** con correo `@example.test`, **zonas, tarifas y zona especial**. | Carlos, 2026-10-23 (Jira) | R12, R13 |
| D3 | **Órdenes en todos los estados**, entradas **por pantalla, por carga masiva y por API**, con **gestiones, rechazos, devoluciones e incidentes**. | Carlos, 2026-10-23 (Jira) | R14, R15, R16 |
| D4 | **Cierres de día y de bodega, wallet, tesorería y cobro de plataforma.** | Carlos, 2026-10-23 (Jira) | R17, R18, R19 |
| D5 | **Usa los servicios reales.** | Carlos, 2026-10-23 (Jira) | R11 |
| D6 | **Se niega a correr en producción**, con una guardia que tenga su test. | Carlos, 2026-10-23 (Jira) | R2, R3, R4, R5 |
| D7 | **Es re-ejecutable**: borra y recrea solo sus empresas de demo. | Carlos, 2026-10-23 (Jira) | R7, R8, R9, R28, R29 |
| D8 | **QA no procesa la cola de jobs.** Las órdenes nacen **ya ubicadas**, nunca en «La dirección aún se está validando». | Carlos, 2026-10-25 | R20, R21, R22 |
| D9 | Las empresas demo no tienen integraciones (SL-36). **Ningún job de la demo puede llamar a Google, a WhatsApp ni a Anthropic, ni mandar un correo o un mensaje real.** El comando decide qué hace con cada job que encolan los servicios. | Carlos, 2026-10-25 | R22, R23, R24 |
| D10 | Los archivos de la demo se guardan con los **adaptadores de `lib/storage/` de SL-19** (`<organizacion_id>/<ruta>`), y el **borrado también borra los archivos**. La primera task es traer `dev` con SL-19 mergeado. | Carlos, 2026-10-25 | R9, R18 (y `tasks.md > T0`) |
| D11 | Una empresa es demo por una **marca en la base que solo pone el comando**, no por su nombre ni su slug. | `spec_author` (`design.md > D3`) | R6, R10 |
| D12 | El borrado corre con el **rol dueño de la base**, no como la empresa: la empresa no puede borrar sus cargos ni su caja (`REVOKE` de SL-40 y SL-45). | `spec_author` (`design.md > D4`) | R7, R8 |
| D13 | La contraseña de los usuarios demo **la da quien corre el comando** en una variable de entorno; el comando nunca la imprime. | `spec_author` (`design.md > D7`) | R25, R26 |
| D14 | La guardia mira **una marca de entorno que vive en la propia base de QA**, además de `VERCEL_ENV`. Un `.env` copiado por error no basta para pasarla. | `spec_author` (`design.md > D2`) | R3 |

## Glosario

- **Empresa demo**: una organización creada por este comando y marcada como tal en la base.
- **Empresa real**: cualquier otra organización, se haya creado a mano o por otro camino.
- **Marca de entorno QA**: un ajuste de la propia base que declara que es la base de QA
  (`design.md > D2`).
- **Orden ubicada**: orden con latitud y longitud guardadas y estado de geocodificación `OK`.
- **Asignable**: el gate de asignación por coordenadas (`AsignabilidadCoordenadasService`) devuelve
  `asignable` para la orden.
- **Job de la demo**: fila de la cola con la `organizacion_id` de una empresa demo.
- **Cerrar un job sin ejecutarlo**: dejarlo en un estado final sin correr su handler
  (`design.md > D6`).
- **Estados vigentes**: los 20 valores de `ORDER_STATUS_SEED` (`lib/types/order-status.ts`).

## Requisitos (EARS)

### El comando y la guardia

- **R1.** El sistema DEBE ofrecer un comando por consola que, en una sola ejecución, borre las
  empresas demo que existan y cree dos empresas demo nuevas, A y B, con los datos de R12 a R19.
- **R2.** SI `VERCEL_ENV` vale `production`, ENTONCES el comando DEBE terminar con un código de
  salida distinto de 0 antes de abrir ninguna conexión a la base o a Storage.
- **R3.** SI la base a la que apunta el comando no tiene la marca de entorno QA, ENTONCES el comando
  DEBE terminar con un código de salida distinto de 0 sin haber escrito nada en la base ni en Storage.
- **R4.** SI la base y el Storage del comando pertenecen a proyectos distintos (dos proyectos de
  Supabase distintos, o uno local y el otro no), ENTONCES el comando DEBE terminar con un código de
  salida distinto de 0 antes de abrir ninguna conexión.
- **R5.** El sistema NO DEBE escribir en la salida del comando la URL de la base, la clave de Storage,
  la contraseña de los usuarios demo, un hash de contraseña ni el secreto de una API key.

### Identificar y borrar las empresas demo

- **R6.** El sistema DEBE marcar como demo solo las organizaciones que crea el comando, y DEBE
  rechazar que una empresa, con su rol de aplicación, cambie esa marca.
- **R7.** CUANDO el comando borra las empresas demo, el sistema DEBE borrar todas sus filas (datos
  de negocio, usuarios, las filas de plataforma que cuelgan de esos usuarios y sus jobs) y NO DEBE
  cambiar ninguna fila de una empresa real ni de los catálogos, la geografía, la caché de
  geocodificación, la tarifa global de la plataforma o el superadmin.
- **R8.** SI el borrado de la base no puede completarse para todas las empresas demo, ENTONCES el
  sistema NO DEBE dejar ninguna fila borrada y el comando DEBE terminar con un código distinto de 0
  que nombre las tablas que lo impidieron.
- **R9.** CUANDO el comando borra una empresa demo, el sistema DEBE borrar antes sus archivos de
  Storage (los que nombran sus filas y sus temporales de descarga) y NO DEBE borrar ningún archivo
  fuera de la carpeta de esa empresa.
- **R10.** SI existe una empresa real con el slug de una de las empresas demo, ENTONCES el comando
  DEBE terminar con un código distinto de 0 sin borrar ni crear nada.

### Crear los datos con los servicios reales

- **R11.** El sistema DEBE crear cada empresa demo con el alta de empresa de la plataforma, y cada
  dato de R12 a R19 con el servicio que lo produce en la app, con la empresa demo en contexto y el
  actor del rol que lo haría en la app. Las únicas escrituras directas permitidas son las de la tabla
  `design.md > D5.3`.
- **R12.** CUANDO el comando termina, cada empresa demo DEBE tener un usuario de cada uno de estos
  perfiles: maestro, admin, tienda con bodega propia, tienda sin bodega propia, adminSatelite,
  mensajero de la zona central, mensajero de la zona satélite y la cuenta de una API key. Todos los
  correos DEBEN terminar en `@example.test` y DEBEN ser los mismos en cada ejecución para la misma
  empresa demo y el mismo perfil.
- **R13.** CUANDO el comando termina, cada empresa demo DEBE tener una zona central y una satélite
  con su distrito, su tarifa de pago al mensajero y su SINPE confirmado; una tarifa por tienda; y al
  menos un distrito de sus zonas marcado como zona especial.
- **R14.** CUANDO el comando termina, cada empresa demo DEBE tener órdenes creadas por cada una de las
  tres vías de entrada: la pantalla de crear orden, la carga masiva y la API con API key.
- **R15.** CUANDO el comando termina, cada empresa demo DEBE tener al menos una orden viva en cada uno
  de los 20 estados vigentes.
- **R16.** CUANDO el comando termina, cada empresa demo DEBE tener al menos una gestión de cada
  resultado del portal del mensajero (entregada, rechazo, reprogramada y novedad), una entrega con
  pago mixto, una orden devuelta a su tienda y un incidente con indemnización.
- **R17.** CUANDO el comando termina, cada empresa demo DEBE tener al menos un cierre de día aprobado,
  uno rechazado, uno solicitado sin decidir y un cierre de bodega satélite aprobado.
- **R18.** CUANDO el comando termina, cada empresa demo DEBE tener movimientos de caja nacidos de
  aprobar cierres, un pago a un mensajero, un aporte de capital con su comprobante en Storage y un
  abono de una tienda.
- **R19.** CUANDO el comando termina, cada empresa demo DEBE tener una excepción propia de cobro de la
  plataforma, un cargo de la plataforma por cada orden creada y un pago a la plataforma registrado.

### Datos listos para usarse en un QA sin cola

- **R20.** CUANDO el comando crea una orden con dirección, el sistema DEBE dejarla ubicada sin llamar a
  ningún proveedor, y DEBE dejar cerrado el job de geocodificación de esa orden.
- **R21.** CUANDO el comando termina, el gate de asignación DEBE devolver `asignable` para toda orden
  demo que esté en un estado desde el que se asigna a un mensajero.
- **R22.** CUANDO el comando termina, NO DEBE quedar ningún job de la demo en `pending` ni en
  `processing`, y la salida del comando DEBE contar, por tipo, los jobs que cerró sin ejecutarlos.
- **R23.** SI el comando encuentra un job de la demo de un tipo que no está en la lista de tipos
  esperados (`design.md > D6`), ENTONCES DEBE cerrarlo sin ejecutarlo y terminar con un código
  distinto de 0 que nombre ese tipo.
- **R24.** MIENTRAS corre el comando, el sistema NO DEBE llamar a Google, a Meta/WhatsApp ni a
  Anthropic, ni enviar correos ni notificaciones push; y al terminar, las empresas demo NO DEBEN tener
  integraciones, suscripciones de webhook, plantillas de mensaje ni envíos automáticos de WhatsApp.

### Credenciales

- **R25.** SI la variable de entorno con la contraseña de los usuarios demo falta o no cumple la
  política de contraseñas de la app, ENTONCES el comando DEBE terminar con un código distinto de 0
  antes de abrir ninguna conexión.
- **R26.** CUANDO el comando termina con éxito, su salida DEBE listar, por empresa demo, el rol y el
  correo de cada usuario demo, y cada uno DEBE poder entrar con esa contraseña.
- **R27.** DONDE quien corre el comando pase el agente de usuario de su navegador, el sistema DEBE
  dejar ese navegador como dispositivo confiado de cada usuario demo, para que entre sin código por
  correo. *(Pendiente de P1.)*

### Re-ejecución

- **R28.** CUANDO el comando corre por segunda vez sobre la misma base, DEBE terminar con código 0 y
  dejar exactamente dos empresas demo, las nuevas, sin filas ni archivos de las anteriores.
- **R29.** CUANDO una ejecución anterior se interrumpió después del alta de una empresa demo, la
  siguiente ejecución DEBE borrar esa empresa como cualquier otra empresa demo.

## Trazabilidad de las decisiones

Cada fila de `## Decisiones cerradas` está cubierta por los requisitos de su última columna. El mapa
`R<n> → test` lo fija `design.md > D9` y lo completa el implementer en `progress/impl_SL-43.md`.

## Preguntas abiertas

- **P1. Cómo entra una persona con un usuario demo.** El login pide un código por correo desde un
  navegador nuevo (`RiskEngine`: dispositivo e IP desconocidos suman 70 y el umbral es 50), y los
  correos `@example.test` no reciben nada. Opciones:
  - (a) **Recomendada:** el comando acepta el agente de usuario del navegador de quien prueba y lo deja
    como dispositivo confiado (R27). Es la técnica de `tests/fabricas/e2e.ts > confiarDispositivo`.
  - (b) Encender `AUTH_OTP_DEBUG_LOG=1` en el entorno de QA. El código saldría en los logs de Vercel,
    que ve todo el equipo. SL-44 lo permite fuera de `production`.
  - (c) Subir `AUTH_RISK_THRESHOLD` en QA. Afecta a todos los usuarios de QA, no solo a los demo.

  Si Carlos elige (b) o (c), R27 se retira y nada más cambia.
- **P2. La marca de entorno QA.** La guardia exige que la base de QA lleve el ajuste
  `servi.entorno = 'qa'` (`design.md > D2`). Lo pone un humano una sola vez en QA. No está
  comprobado qué sentencia admite Supabase con el rol `postgres`: `ALTER DATABASE postgres SET …`, o
  `ALTER ROLE postgres SET …`. ¿Lo pone Carlos, y con cuál? Si ninguna funciona, ¿qué otra señal de
  la base acepta?
- **P3. De dónde salen las coordenadas.** La geografía del catálogo no trae coordenadas. El design
  propone fijar en el código los distritos de la demo (por `codigo_dta`) y un punto para cada uno,
  con un desplazamiento pequeño por orden para que los marcadores no se pisen. ¿Revisa Carlos esos
  puntos en el PR, o prefiere darlos él?
- **P4. La empresa B.** El design le da a B la misma receta que a A (dos empresas completas). Si B
  solo tiene que demostrar el aislamiento, puede ser más pequeña y el comando tarda la mitad.
- **P5. Dónde se corre.** El design asume que se corre desde la máquina de quien prueba, con un
  archivo de entorno de QA (base con el rol dueño y Storage con la clave de servicio). ¿Quién tiene
  esas credenciales de QA y dónde se guardan?
- **P6. Importes de la demo.** La excepción del cobro de la plataforma, las tarifas y los montos de
  las órdenes son contenido de la demo, no reglas. El design propone valores redondos
  (`design.md > D5.2`). ¿Los acepta Carlos?
