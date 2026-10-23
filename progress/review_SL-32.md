# SL-32 «Rol superadmin y su usuario de arranque» — review

- **Rama:** `feature/SL-32-rol-superadmin`, head revisado `9b51e1f` (PR #4, draft, contra `dev`).
- **Diff:** `origin/dev...9b51e1f`, 123 archivos y 26 commits.
- **Fecha:** 2026-10-23. Reviewer.
- **Grafo:** no lo usé, porque el MCP `codebase-memory-mcp` no estaba entre las herramientas de esta
  sesión. La revisión se hizo con Grep, Read y scripts de un solo uso fuera del repo.

## Verificación ejecutada por el reviewer (no copiada de la bitácora)

Usé una base desechable `sl32r_mut` en el Postgres local (`localhost`, no es un recurso de
Ordenex). La migré con `migrate deploy`, la sembré con `db:seed` y la borré al acabar: no queda
ninguna `sl32r%`. Tomé `gate.lock` a las 12:39:53, con `prisma generate` dentro, y lo solté al
terminar el gate.

| Comprobación | Resultado |
|---|---|
| Drift: `migrate diff --from-config-datasource --to-schema db/schema.prisma` | `-- This is an empty migration.`, recién migrada y también tras la ida y vuelta |
| Integración SL-32: `un-solo-superadmin`, `usuario-empresa-o-superadmin`, `arranque-superadmin`, `empresas-plataforma`, `usuarios-sin-superadmin`, `aislamiento-usuarios`, `aislamiento-fk-misma-empresa` | Todos en verde. El único rojo es `geografia-registro-accion` > R54, que pide usuarios sembrados. **Está en `tests/baseline-rojos.json`**, así que no es un hallazgo |
| Ida y vuelta de las 3 migraciones (R21) | Detalle en «Migraciones», abajo |
| Concurrencia del ALS compartido | 200 peticiones concurrentes con `conEmpresa`, cada una escrita en una copia del módulo y leída en la otra: 1000 lecturas y 0 cruces. Un `comoPlataforma` concurrente se ve como plataforma. Fuera de todo `run`, el contexto es `null` |
| `TEST_RAPIDO_BASE=dev ./init.sh` (sin `DATABASE_URL`) | `INIT_EXIT=0`. El typecheck y el lint pasan (solo avisos). Los relacionados dan `Tests 15734 passed / 996 skipped` y las guardias `4081 passed / 20 skipped` |
| CI | En el head `9b51e1f` los checks salen SKIPPED porque el PR está en draft. En `f8210c6` (`workflow_dispatch`), `gate-completo`, `estatico` y los 3 shards pasan; el `e2e` sale failure. Entre `f8210c6` y `9b51e1f` solo cambia la bitácora |

### Mutaciones (cada una restaurada, con `git diff --quiet` limpio o la definición comprobada en el catálogo)

| # | Mutación | Resultado |
|---|---|---|
| M1 | `exigirSuperadmin` → `return actor.rol !== undefined` (cualquier sesión pasa) | **Muere:** 7 rojos, los 6 roles de empresa en `organizaciones-action` y el maestro en `alta-empresa-rol` |
| M2 | `esPlataforma` → `rol.length > 0` (todos son plataforma) | **Muere:** 31 rojos en 7 archivos: `plataforma`, `empresas-page` (los 6 roles reciben la página), `organizaciones-action`, `empresas-plataforma.composition-root`, `marco-superadmin-sin-empresa`, `usuario-service-superadmin` y `geografia-admin-page`. `geografia-service`, `geografia-action` y `menu-visibility` siguen en verde, porque leen `ROLES_PLATAFORMA` y no el predicado: es correcto |
| M3 | `DROP CONSTRAINT usuario_empresa_o_superadmin` en la base | **Muere:** 5 de 6 en `usuario-empresa-o-superadmin`. Queda verde el caso positivo, el superadmin con NULL. CHECK recreado; `pg_get_constraintdef` sale idéntico |
| M4 | `DROP INDEX usuario_un_solo_superadmin` en la base | **Muere:** 3 rojos, el segundo INSERT y el UPDATE en `un-solo-superadmin`, y el P2002 → `ya_existe` en `arranque-superadmin`. Índice recreado; `indexdef` sale idéntico |

Ningún test de los que cubren estas cuatro puertas pasa sin datos. Los de base usan `describe.skip`
si no hay `DATABASE_URL`; con base, `idDeRol` lanza si falta el rol en vez de salir en verde.

## Checklist

### Especificación
- [x] `requirements.md` en EARS, R1–R38.
- [x] `design.md` con alternativas descartadas.
- [x] `tasks.md`: todas las tareas en `[x]` (0 `[ ]`).
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: reutiliza `seedRoles`, `strongPasswordSchema`, `hashPassword`, el flujo de recuperación y la action de SL-17.

### Equipo
- [x] Rama publicada y PR #4. Assignee: Carlos Restrepo (cabecera del spec).

### Trazabilidad
- [ ] **Cada `R<n>` mapea a un test concreto.** R21 no tiene test, solo «verificación de T3» (B1). R20 cita un archivo que no lo cubre (m3).
- [x] `progress/impl_SL-32.md > T10` tiene el mapa R → test.

### Calidad de código
- [x] typecheck, lint y `./init.sh` (rápido) en verde en el worktree (`INIT_EXIT=0`).
- [ ] `gate-completo` en verde **en el PR**: hoy sale SKIPPED en el head, por el draft. Pasó en `f8210c6` por `workflow_dispatch`. Hay que sacar el PR de draft y verlo en verde antes de pedir el merge.
- [ ] **Flujo crítico «Aislamiento entre empresas»:** el diff toca `lib/db/` y la sesión, y `e2e/dos-empresas-humo.spec.ts` no se ha corrido en esta rama (B2).
- [x] Flujo crítico «Login y sesión»: `e2e/superadmin-arranque.spec.ts` y `e2e/superadmin-empresas.spec.ts`, con la salida local en la bitácora (9 passed, dos veces).
- [x] Sin dependencias nuevas: `package.json` solo añade el script `arranque:superadmin`.

### Seguridad y configuración
- [x] Ningún secreto en el repo. `.env.example` declara vacías las seis `SUPERADMIN_*`. El E2E usa credenciales ficticias de `example.test`, que R20 permite.
- [x] Sin webhooks nuevos.
- [x] Nada que cambie entre entornos queda en un literal. El `id` fijo del rol es un contrato de la migración, no configuración.

### Proyecto (`docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`)
- [x] Sin tablas nuevas. Las lecturas nuevas sin empresa (el listado de organizaciones, el arranque y el nombre del pie) van en `comoPlataforma` y están declaradas en `EXCEPCIONES_DE_PLATAFORMA`.
- [x] Las 3 migraciones traen `down.sql`. Ninguna migración anterior se toca, y cada una entra en un solo commit (`5833762`), sin ediciones posteriores.
- [x] Sin literales de país ni de moneda nuevos, y ninguna referencia a Ordenex.
- [x] Las capas se respetan: services, repositories, actions y composition root.
- [x] La autorización va en el servidor: la página «Empresas» da `notFound()`, el listado `forbidden` y la action `no_autorizado`, todo antes de leer.
- [x] Los comentarios explican el porqué.
- [ ] Ningún `console.log` de secretos: el diff no añade ninguno, pero el README nuevo describe mal uno que ya existía (m4).

## Respuestas a lo pedido

### 1. Trazabilidad y mutaciones
Las mutaciones están en la tabla de arriba: las cuatro mueren. El mapa de T10 es correcto salvo en
R21, que no tiene test (B1), y en R20 (m3).

### 2. Seguridad
- **Otro rol contra `altaEmpresaAction`.** `exigirSuperadmin` responde `false` para los 6 roles de
  empresa y para «sin sesión» antes de construir el servicio. El test los recorre todos, y M1 los
  tumba.
- **La pantalla y el listado.** La página Empresas y el listado preguntan a `esPlataforma` antes de
  leer. `empresas-page.test.tsx` recorre los 6 roles y «sin sesión», y comprueba que el listado y el
  catálogo no se llaman.
- **El superadmin y los datos de negocio.** No ve datos de ninguna empresa por el marco ni por el
  menú:
  - el menú solo le da «Empresas» (`itemsVisibles`, el test recorre los 7 roles);
  - el layout lee en plataforma solo su propio `usuario` por id;
  - la campana y el canal push devuelven vacío sin construir servicio, y no usan `comoPlataforma`,
    que le abriría todas las empresas;
  - por debajo, su sesión no resuelve empresa, así que cualquier modelo de negocio falla cerrado con
    `EmpresaNoResuelta` en la extensión de SL-17: un 500, no una fuga.

### 3. `lib/db/contexto-empresa.ts` (c04da42)
**El cambio es correcto y no abre fugas entre peticiones.**
- `AsyncLocalStorage` aísla por cadena asíncrona dentro de cada `run()`, no por instancia. Antes ya
  había una sola instancia por grafo de módulos, compartida por todas las peticiones concurrentes de
  ese grafo. Ahora hay una por proceso: la semántica por petición es la misma.
- El almacén solo se escribe con `almacen.run(...)` (`conEmpresa`, `comoPlataforma` y
  `dentroDeTransaccionDeEmpresa`). En `lib/`, `app/` y `middleware.ts` no hay `enterWith` ni
  `disable`, así que ningún contexto sobrevive a su callback.
- `middleware.ts` declara `runtime: "nodejs"`: comparte proceso y `globalThis` con la app, que es
  justo el caso del bug. Si en Vercel corren aparte, cada proceso tiene su cliente y su almacén,
  coherentes entre sí.
- `Symbol.for` da la misma clave a todas las copias del módulo.
- Lo medí: 1000 lecturas cruzadas entre dos copias y 0 contextos ajenos.
- Hay que llevarlo a `dev`. Llega con el merge de esta rama, y antes si otra rama lo necesita.

### 4. Riesgos abiertos: ¿bloquean que dos empresas operen hoy?
- **D15/P7 (geografía del superadmin). No bloquea.**
  - La geografía llega sembrada por migración (`20260713005000_seed_geografia_cr` y la DTA de
    `20260905175156`).
  - Los maestros solo leen el árbol (`listarArbol` sigue abierto, R25).
  - El superadmin no tiene Geografía en el menú. Si entra por URL a `/configuracion/geografia`, el
    alta funciona, pero `renombrar` responde un «ya existe» falso y retirar/reactivar y el conteo
    caen en `EmpresaNoResuelta`. D15 no recoge ni el falso conflicto ni ese acceso por URL (m5).
- **`actualizarDistritosEspeciales` (D12). No es de SL-32 y no bloquea la operación básica.** Viene
  de SL-17: el maestro no puede marcar `distrito.zona_especial` desde Tarifas (500), y SL-38 lo
  resuelve. Las empresas pueden crear órdenes y zonas, pero no marcar zonas especiales hasta SL-38.
- **Login con OTP. No bloquea el código; es una dependencia operativa.**
  - Cada entorno de Vercel necesita `SMTP_USER` y `SMTP_PASSWORD` de Brevo.
  - La bitácora prueba que el SMTP aceptó los dos envíos (con `messageId`), pero no se leyó la
    bandeja ni se probó en Vercel.
  - Antes de dar de alta las empresas, hay que comprobar que llega un código real en Production,
    como dice el README.
  - Sin SMTP, el código acaba en los logs (m4).

### 5. Migraciones `20261023100000/100100/100200`
- Las tres traen `down.sql` y van detrás de `20261023090000_unicos_por_empresa`.
- La base recién migrada no tiene drift.
- Ida y vuelta medida en `sl32r_mut`:
  - con un superadmin dentro, el down de la 3.ª va bien;
  - el de la 2.ª aborta con `P0001 hay un usuario superadmin…`, y el usuario, el índice y la fila
    `rol` siguen en su sitio;
  - sin el superadmin, los downs de la 2.ª y la 1.ª van bien: el enum vuelve a
    `maestro,admin,mensajero,Admin Tienda,adminSatelite,apiKey` y no queda `rol_value_old`;
  - al reaplicar las tres, el drift sigue vacío y los tests de R27 y R28 salen 9/9.
- No hay que editarlas. Lo que falta es un test que fije este comportamiento (B1).

### 6. Desviaciones de la bitácora: ¿las debe recoger el spec?
| Desviación | ¿Al spec? |
|---|---|
| Base adelantada sobre la rama de SL-17 | No. Es historia de la rama |
| Timestamps `202610231000xx` detrás de `20261023090000` | **Sí.** R21 sigue nombrando `…130300` como «hoy»: hay que poner el nombre real |
| La action responde `no_autorizado`, no `forbidden` | **Sí.** R35 dice `forbidden` |
| «Empresas» antes de «Mi bodega» | No: ya está en `design.md` (fila de `menu-visibility.ts`) |
| `/configuracion` responde al superadmin con 200 y «No tienes permiso», no con 404 | **Sí.** R5 dice «`notFound()` en páginas». Hay que decir «`notFound()` o el aviso sin permiso que la página ya da, sin leer datos» |
| ALS en `globalThis` | **Sí**, en `design.md`: es un cambio a `lib/db/` y no aparece en ninguna sección |
| Campana y push sin tablas de empresa para el superadmin | **Sí**, en `design.md > El marco del portal`, que solo nombra el layout. R6 ya lo cubre |
| D19 de SL-17 (humo de dos empresas por la pantalla) pendiente | Va a `progress/deudas.md`, y además es B2 |

## Hallazgos

### BLOQUEANTE

- **B1 — R21 sin test.** El mapa de T10 da a R21 «verificación de T3», que es manual. R21 exige
  conductas que se pueden comprobar:
  - cada migración trae su `down.sql`;
  - los downs devuelven el enum, el catálogo, el índice y el CHECK a como estaban;
  - el down del rol falla si queda un superadmin.

  Ninguna está fijada por un test, y el precedente existe: `migracion-sl17-ida-y-vuelta` (R6 y R32
  de SL-17). **Qué falta:** un test, por ejemplo
  `tests/integration/db/migracion-sl32-ida-y-vuelta.test.ts`, más uno estático para la existencia
  y el orden de los `down.sql`. El de integración tiene que:
  - aplicar los tres downs en orden inverso, con el superadmin dentro y sin él;
  - comprobar el aborto con `P0001` y que no se borra nada;
  - comprobar el enum de seis valores y que no queda `rol_value_old`;
  - volver a aplicar las migraciones.

  Lo que mido en «Migraciones» es lo que ese test tiene que fijar. No hace falta editar ninguna
  migración.
- **B2 — El humo de aislamiento no se ha corrido en esta rama.** `docs/checkpoints-proyecto.md >
  Flujos críticos` exige `e2e/dos-empresas-humo.spec.ts` a toda feature que toque la sesión o
  `lib/db/`, y SL-32 toca las dos: `contexto-empresa.ts`, el login del superadmin y el marco.
  - La bitácora (Gates, línea 1351) dice que «en local pasan», pero la sección a la que remite
    («T9 y T17 — segunda vuelta») solo corre los dos specs de SL-32.
  - D19 queda «pendiente» y no está en `progress/deudas.md`.
  - `superadmin-empresas.spec.ts` crea A y B por la pantalla y los dos maestros entran, pero no
    recorre el menú del maestro ni busca datos de A en B, que es lo que afirma el humo.

  **Qué falta:** correr `e2e/dos-empresas-humo.spec.ts` en local sobre esta rama (con
  `SL17_HUMO_MAESTRO_A/_B` y `SL17_HUMO_LOG_SERVIDOR`) y pegar la salida en la bitácora. Si el
  humo pide el alta por el servicio y no por la pantalla, vale así para este checkpoint, y el
  cambio a la pantalla queda como deuda D19 en `progress/deudas.md`.

### menor

- **m1 — R5 frente a `/configuracion`.** La página responde al superadmin con 200 y «No tienes
  permiso…», y R5 pide `notFound()`. No hay fuga: no lee datos. Hay que reconciliar R5 (ver la
  tabla del punto 6).
- **m2 — R35 dice `forbidden` y la action responde `{ estado: "no_autorizado" }`.** Hay que
  ajustar el texto de R35.
- **m3 — El mapa de R20 cita el archivo equivocado.** Cita `recursos-origen-fuera.guardia.test.ts`,
  que no mira `SUPERADMIN_*`. La cobertura real de `.env.example` es
  `env-example-sin-valores.guardia.test.ts`. La parte del README y el texto de la ayuda de R26 se
  quedan en «revisión del diff», sin test.
- **m4 — El README afirma algo falso sobre el código del OTP.** Dice: «El código solo se imprime
  con `AUTH_OTP_DEBUG_LOG=1`». No es así: `ConsoleEmailSender` registra siempre el asunto, y
  `plantillaOtpCodigo` mete el código en el asunto (`lib/services/email/plantillas/otp-codigo.ts:45`:
  `subject: \`Tu codigo de verificacion: ${code}\``). El E2E depende justo de eso.
  - Es código anterior a SL-32, pero SL-32 vuelve a montar la recuperación de contraseña.
  - En un entorno sin SMTP, el email y el código de recuperación de cualquier cuenta, también la del
    superadmin, quedan en los logs.
  - Hay que corregir el README y abrir deuda: o el asunto sin código, o el aviso de consola sin
    asunto.
- **m5 — A D15 le faltan dos efectos.** El primero: con el superadmin, `renombrar` responde un
  conflicto falso («ya existe»), por el `catch` genérico de D12. El segundo: el superadmin llega
  por URL a `/configuracion/geografia`, donde retirar y reactivar dan 500.
- **m6 — Los dos E2E de SL-32 (y el humo de SL-17) fallan en CI.** CI no define
  `SL17_HUMO_LOG_SERVIDOR`. Hoy el job `e2e` solo corre en el PR a `prod`, y ahí van a salir en
  rojo. No hay deuda registrada.
- **m7 — `geografia-registro-accion.test.ts` aporta poco a R24.** El mapa lo cita, pero está en
  `baseline-rojos.json`, así que en CI sus rojos no cuentan. R24 se apoya de verdad en
  `geografia-service` y `geografia-action` (unit).
- **m8 — Hipótesis sin verificar, fuera del diff.** Las Server Actions exportadas con un segundo
  parámetro `deps` (`altaEmpresaAction(input, deps)`, un patrón de todo el repo) aceptan lo que
  mande el cliente. React deserializa referencias a server functions en los argumentos. No he
  comprobado que se pueda explotar, ni encontrado una action que devuelva un `rol` controlable.
  Merece una ficha propia que lo mida.
- **m9 — Sin `gate-completo` en el head del PR.** Sale SKIPPED por el draft. Hay que sacarlo de
  draft y verlo en verde antes de pedir el merge.

## Veredicto

**RECHAZADO** por B1 (R21 sin test) y B2 (humo de aislamiento sin correr en una rama que toca
`lib/db/` y la sesión). El código de la feature está bien: las cuatro puertas mueren con su
mutación, el ALS compartido es correcto, no hay drift y los downs se comportan como dice el spec.
Lo que falta es evidencia, no un cambio de la app. Los menores no bloquean, pero m1, m2 y m4 deben
quedar resueltos en el spec y el README antes del cierre.
