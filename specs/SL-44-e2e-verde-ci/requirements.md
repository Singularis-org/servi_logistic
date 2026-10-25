# SL-44 — E2E en verde en CI · requirements

## Alcance

- El E2E de Playwright (`e2e/`) sale **verde de verdad** en CI: sin baseline de E2E, sin `skip`, sin
  `fixme` y sin reintentos que tapen un fallo.
- Corre en cada PR a `dev` y a `prod`, y a mano. Va partido en grupos, cada uno con su propia base.
- Cada spec crea sus datos con fixtures propias que pasan por los servicios reales de la app. Absorbe
  la tanda 7 de SL-31 (T10, T11a, T11b; sus R19–R22).
- Los E2E obtienen el OTP sin SMTP y sin debilitar producción. Cierra D17.
- El humo de dos empresas da de alta A y B por la pantalla «Empresas». Cierra D16.
- Las subidas a Storage se resuelven en CI sin Supabase real.

**Lo que NO entra:**
- reescribir pantallas o servicios para que los E2E pasen;
- arreglar en producción un defecto que un E2E destape. Se abre ficha nueva, y el E2E sigue rojo
  hasta que se arregle (ver R27);
- los datos de demostración de QA (SL-43).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-23 | ¿Se sale a producción con el `e2e` en rojo, con baseline o con skip masivo? | No. El job tiene que salir verde de verdad (Carlos, vía leader). → R13, R22, R24, R27 |
| 2026-10-24 | P1 — ¿Cómo se reparte el trabajo con SL-31? | SL-44 absorbe la tanda 7 de SL-31 (T10, T11a, T11b; R19–R23) y **anula su P3 / R23** (`test.fixme` con ficha). Ningún E2E se queda en `fixme` ni en skip. Queda anotado en `specs/SL-31-tests-datos-propios-ci/tasks.md` (Carlos). → R7–R13, R18 |
| 2026-10-24 | P3 — ¿Cuándo corre el job `e2e`? | En cada PR a `dev` (y a `prod`, y a mano). Si hace falta, se parte en shards con base propia (Carlos). → R19–R22 |
| 2026-10-24 | P2 — ¿Entra D16? | Sí. El humo de dos empresas da de alta por la pantalla «Empresas», no por fixture (leader). → R16, R17 |
| 2026-10-24 | ¿Las fixtures dependen de SL-43? | No. Son propias del E2E; SL-43 podrá reutilizarlas después (leader). → R7 |
| 2026-10-24 | ¿La guarda del OTP en producción es requisito? | Sí, con su test, y va en la primera tanda (leader). → R1–R3 |
| 2026-10-24 | ¿Cómo se resuelve Storage en CI? | Lo propone el spec, con la solución mínima justificada (leader). Propuesta: un doble del API de Storage que arranca Playwright (`design.md > D2`). → R4–R6 |

## Requisitos (EARS)

### Seguridad del OTP (tanda 1)

- **R1.** MIENTRAS `VERCEL_ENV` valga `production`, el sistema NO DEBE escribir el código de un OTP
  en ningún log ni salida de consola, aunque `AUTH_OTP_DEBUG_LOG` valga `1` o `true`.
- **R2.** SI `AUTH_OTP_DEBUG_LOG` vale `1` y `VERCEL_ENV` no vale `production` (vale otra cosa o no
  está definida), ENTONCES el emisor de consola DEBE seguir escribiendo una sola línea con el
  destinatario y el cuerpo del correo, como hoy.
- **R3.** Fuera de `e2e/`, `playwright.config.ts`, `.github/workflows/gate.yml` y `tests/`, ningún
  archivo versionado DEBE dar a `AUTH_OTP_DEBUG_LOG` un valor no vacío. `.env.example` DEBE dejarla
  vacía.

### Storage en el E2E

- **R4.** CUANDO corre el E2E, las subidas, los borrados y las URL firmadas de Storage de la app
  DEBEN resolverse contra un doble local del API de Storage. NO DEBEN usar red externa ni
  credenciales reales.
- **R5.** El doble DEBE devolver, por la URL firmada de un objeto subido, los mismos bytes y el mismo
  tipo de contenido que se subieron. SI se pide un objeto que no se subió, ENTONCES DEBE responder
  con error.
- **R6.** El cambio NO DEBE modificar `lib/storage/` ni las composition roots que construyen sus
  clases.

### Datos de cada spec (absorbe R19–R22 de SL-31)

- **R7.** Cada spec de `e2e/` DEBE crear, antes de sus casos, la empresa, los usuarios y los datos
  que usa. NO DEBE depender de ningún dato preexistente salvo los catálogos de `pnpm run db:seed`.
- **R8.** Una fixture DEBE producir cada estado de negocio (orden, recepción, asignación, gestión,
  cierre, movimiento de caja) llamando al servicio de `lib/services/` que lo produce en la app, o a
  la ruta de cron que lo produce. SI ningún servicio ni cron produce ese estado, ENTONCES la fixture
  puede escribir la fila con la empresa fijada, y `design.md > D4` DEBE listar esa excepción con su
  motivo.
- **R9.** Los specs y fixtures de `e2e/` NO DEBEN contener:
  - credenciales de usuarios sembrados a mano (`correct-password`, `maestro@example.com`…);
  - valores esperados que dependan de una semilla externa;
  - lecturas de `E2E_RASTREO_*`, `SL17_HUMO_MAESTRO_*` o `SL39_UI`.

  Cada valor esperado DEBE corresponder a datos que el propio spec creó.
- **R10.** Los correos de los usuarios que crea una fixture DEBEN ser `@example.test` y generarse
  por corrida, con sufijo aleatorio.
- **R11.** SI la base del E2E no es alcanzable o le falta un catálogo, ENTONCES el spec DEBE fallar
  con un mensaje que lo diga. NO DEBE saltarse.
- **R12.** SI `DATABASE_URL` apunta a un host distinto de `localhost` o `127.0.0.1`, ENTONCES la
  fábrica de datos del E2E DEBE abortar antes de abrir una conexión de escritura.
- **R13.** Ningún archivo de `e2e/` DEBE contener `test.skip`, `test.fixme`, `describe.skip`,
  `describe.fixme` ni `.only`, en ninguna de sus formas (llamada directa o condicional).

### OTP en el E2E

- **R14.** El servidor de la app que arranca Playwright DEBE:
  - escribir su stdout y su stderr en el archivo que nombra `E2E_LOG_SERVIDOR`, fuera del checkout;
  - usar el emisor de consola, aunque el `.env` local tenga `SMTP_*`;
  - tener `AUTH_OTP_DEBUG_LOG=1`.
- **R15.** CUANDO un E2E necesita un OTP, DEBE leerlo de la línea de debug de ese log, filtrando por
  su destinatario y solo entre lo escrito después de pedirlo. NO DEBE requerir SMTP.

### Humo de dos empresas (D16)

- **R16.** El humo de dos empresas DEBE:
  - dar de alta A y B desde `/plataforma/empresas` con el superadmin de prueba;
  - hacer entrar a cada maestro por «¿Olvidaste tu contraseña?» con el OTP del log (R15);
  - conservar sus aserciones de aislamiento: recorrido del menú del maestro sin errores ni
    marcadores de la otra empresa, detalles de A en 404 para B, webhook propio, vehículos sin
    escritura y geografía en 404.
- **R17.** El humo NO DEBE exigir SMTP ni un `messageId` del proveedor. El correo de recuperación de
  cada maestro DEBE constar en el log como enviado a ese maestro.

### Inventario

- **R18.** Cada spec que `design.md > D5` marca «se arregla» DEBE pasar contra la UI actual y
  recorrer el flujo que declara su cabecera, con los datos de R7.
- **R19.** Cada nombre de spec que `docs/checkpoints-proyecto.md > Flujos críticos` cita entre
  backticks DEBE corresponder a un archivo existente en `e2e/`. Un nombre con `*` DEBE casar con al
  menos uno.

### CI

- **R20.** CUANDO se abre, se actualiza, se reabre o sale de borrador un PR a `dev` o a `prod`, y
  CUANDO se lanza `workflow_dispatch`, DEBE correr el E2E. Los filtros de ruta del workflow
  (`progress/**`, `specs/**`) siguen aplicando.
- **R21.** Cada grupo del E2E DEBE correr sobre su propio Postgres de servicio, migrado con
  `prisma migrate deploy` y con `pnpm run db:seed`, y sin usuarios, zonas ni órdenes antes de
  Playwright. SI migrar o sembrar falla, ENTONCES el grupo DEBE terminar en rojo sin correr
  Playwright.
- **R22.** El check `e2e` DEBE salir en verde solo si todos los grupos terminaron en `success`. Un
  grupo en rojo, cancelado o saltado DEBE dejarlo en rojo.
- **R23.** El job DEBE generar en cada corrida, enmascarados, `SESSION_SECRET` y `CRON_SECRET`
  efímeros. NO DEBE usar secretos del repositorio.
- **R24.** SI un caso solo pasa al reintentarse, ENTONCES el grupo DEBE terminar en rojo.
- **R25.** CUANDO un grupo falla, el job DEBE subir como artefacto las trazas de Playwright y el log
  del servidor.
- **R26.** Dentro de una base, los specs que afirman la plataforma sin empresas DEBEN terminar antes
  de que empiece cualquier spec que dé de alta una empresa.
- **R27.** CUANDO se corre `pnpm run test:e2e` contra una base local recién migrada con catálogos,
  DEBE terminar con 0 fallidos, 0 saltados y 0 inestables. DEBE hacerlo también en una segunda
  corrida seguida sobre la misma base.
- **R28.** Cada grupo DEBE terminar dentro de su `timeout-minutes` (30).

### Cierre

- **R29.** Al cerrar la ficha:
  - `docs/verification.md` DEBE decir que el E2E corre en cada PR a `dev`, cómo obtiene el OTP y
    qué doble usa para Storage. `docs/gate.md` es del arnés (`arnes.manifest`) y no se toca aquí;
  - `progress/deudas.md` DEBE dar por resueltas D16 y D17.

## Mapa decisión → requisito

| Decisión | Requisitos |
|---|---|
| Verde de verdad (2026-10-23) | R13, R22, R24, R27 |
| P1 (absorbe SL-31 tanda 7, sin `fixme`) | R7–R13, R18 |
| P3 (cada PR a `dev`, shards con base propia) | R19–R22 |
| P2 / D16 | R16, R17 |
| Fixtures propias, sin SL-43 | R7 |
| Guarda del OTP en la tanda 1 | R1–R3 |
| Storage en CI | R4–R6 |

## Preguntas abiertas

- **A1 — Borrado de los datos al terminar.** R19 de SL-31 pedía borrar lo creado. Este spec lo
  sustituye por R27: datos con sufijo aleatorio por corrida, y dos corridas seguidas en verde. El
  motivo está en `design.md > Alternativas`. Si Carlos quiere el borrado, entra como requisito.
  Encarece las fixtures de cierres y caja, por las FK `RESTRICT`.
- **A2 — Defecto de producción destapado por un E2E.** Este spec lo trata como ficha nueva que
  bloquea el cierre de SL-44 (R27), no como `fixme`. Si aparece, el leader decide si el arreglo
  entra aquí o en su ficha antes del merge.
