# Review SLT-221 «Maestro: corregir correo y cédula de un usuario» — PR 2 (backend, T2.1-T2.6)

- Revisado: commit `b1f30a81` (558cf1af, e8291f90, b1f30a81), diff contra `origin/dev` (merge-base `bc45ffa9`).
- Alcance: solo el backend del cambio de correo, R1610-R1632 en lo que toca backend. La UI (T3.x) va en el PR 3.
- Worktree de revisión: `.worktrees/rev-SLT-221-pr2` (detached en b1f30a81), con el `node_modules` del worktree SLT-221 enlazado como junction.
- Bases desechables: `servi_slt221_rev2` (tests, mutaciones y E2E) y `servi_slt221_rev2b`, nueva y limpia para el gate final (ver nota del gate).
- Fecha: 2026-11-20.

## Veredicto: RECHAZADO

Tiene un bloqueante (B1). Lo demás está bien hecho y verificado. B1 se arregla con un test.

## Checklist

- [x] **Trazabilidad R→test.** Cada R de backend tiene un test que lo verifica de verdad (tabla abajo). R1618 (bloque de UI) y R1626 (la página no cambia nada al abrirse) son del PR 3. R1627 tiene solo una prueba estructural (m1).
- [x] **Tasks.** T2.1-T2.6 marcadas `[x]`. T2.0, T3.x y T1.8 siguen abiertas, como corresponde al PR 3.
- [x] **Tamaño.** Con `GITHUB_HEAD_REF=feature/SLT-221-corregir-correo-cedula node scripts/tamano-pr.mjs`: 34/40 archivos, 863/1000 líneas de producción y 1011/3000 de tests. Es un AVISO, no un error.
- [x] **Lo que ya existe.** Está en design.md y no está vacía. El diff no re-crea nada de esa lista: reutiliza `mapDuplicadoError`, `appendAccion`/`resolverActorCongelado`, `ResetRateLimiter`/`buildResetRateKey`, `verifyPassword`/`hashPassword`, `componerCorreo`, `crearEmailSender`, `baseUrlDeLaApp`, `emailContacto`, `requestContextFromHeaders` y `crearConEnlaceSchema.shape.enlace`. `enlace-de-un-uso.ts` es nuevo y la ficha lo justifica: `PasswordResetService` no se migra.
- [x] **Multi-empresa.** `usuario_cambio_correo` lleva `organizacion_id` con DEFAULT de la transacción, FK RESTRICT, índice, RLS `FOR ALL TO servi_app` con USING y WITH CHECK, `GRANT SELECT, INSERT, UPDATE` sin DELETE, triggers `sme_*` en las dos FK a `usuario` y el trigger `impedir_cambio_de_empresa`. Está dado de alta en `modelos-de-negocio.ts`. La RLS se prueba sin la extensión (`comoApp` con la empresa B ve 0 filas y con la A ve 1).
- [x] **`down.sql`.** Existe y suelta los triggers, la política y la tabla dentro de una transacción. No se edita ninguna migración aplicada.
- [x] **Ordenex, país y moneda.** Ningún recurso de Ordenex. Ningún literal de país ni de moneda.
- [x] **Capas.** Lógica en `services/`, datos en `repositories/`, zod en el borde (`.strict()`). La autorización está en el servidor: `ALLOWED_ROLES` y `findById` filtrado por empresa.
- [x] **Dependencias.** No entra ninguna.
- [x] **`console` con PII o secretos.** El código nuevo solo registra `causa=<error.name>`. Ver m4 sobre el `ConsoleEmailSender`, que ya existía.
- [x] **E2E local (el PR toca `db/`).** La bitácora no lo deja constado; lo corrí yo (m2). `e2e/usuario-corregir-cedula.spec.ts` y `e2e/login-varias-empresas.spec.ts`: **13 passed**, `E2E_EXIT=0`, con `next build` sobre `servi_slt221_rev2`. Ningún E2E toca `usuario_cambio_correo` (su E2E es T3.3, PR 3).
- [x] **Typecheck y lint** verdes (los corrí sueltos y dentro de `./init.sh`).
- [x] **Mutaciones propias de WHERE.** 6 de 6 muertas (abajo).
- [ ] **Composition root del limitador (R1629).** Una mutación sobrevive: B1.
- [x] **`./init.sh`.** Ver «Gate» abajo.

## Trazabilidad (backend)

| R | Test que lo verifica |
|---|---|
| R1610, R1614, R1621 | `usuario-service-cambio-correo.test.ts`: crea el pendiente, envía SOLO al correo nuevo, 72 h. `usuarios-composition.test.ts` fija el literal 72 sin la variable. |
| R1611 | unit (conflict sin pendiente ni envío) + integración: el WHERE de `existeEmailEnEmpresa` contra Postgres, misma empresa / sí mismo / otra empresa. |
| R1612, R1613 | unit: `validation_error` en `email`, sin pendiente ni envío. |
| R1615 | integración: `findCuentasPorEmailConHash(anterior)` da la cuenta y `(nuevo)` no. |
| R1616, R1620 | integración: abrir otro anula el anterior, y el índice parcial rechaza un segundo abierto creado a mano (P2002). Unit: el reenvío cuenta el vencimiento desde ahora. |
| R1617 | unit: anula ESE pendiente y responde `envio_fallido`. Integración: `anularCambioCorreo` solo toca el suyo. |
| R1619 | integración: `anularCambioCorreoAbierto` solo toca el del usuario. Unit: cancelar. |
| R1622 | integración: el canje real cambia el correo, confirma el pendiente y deja la fila `usuario_email_cambiado` con el anterior, el nuevo y el maestro como actor. Unit del servicio. |
| R1623 | unit del servicio: los seis motivos (formato roto, inexistente, anulado, usado, vencido y secreto incorrecto) dan `invalid_or_expired`. Integración: `cambioCorreoParaCanje` no da los anulados, usados ni vencidos. |
| R1624 | integración: P2002 al confirmar → `correo_en_uso`, nada cambia y el pendiente sigue abierto. |
| R1625 | integración: dos canjes concurrentes aplican el cambio una sola vez. |
| R1628 | action: sin sesión, `comoPlataforma` y luego `conEmpresa(org)`. Servicio sin contraseña. |
| R1629 | unit del servicio: tope por (id, IP); no lee nada al superarlo y otra IP sigue pudiendo. **El cableado del composition root no se prueba (B1).** |
| R1630 | unit (otra empresa y superadmin → `not_found` sin tocar el pendiente) + integración (filtro y RLS). |
| R1631 | unit: cada rol distinto de maestro → `forbidden` sin leer ni escribir. Action: `unauthenticated`. |
| R1632 | unit: lo persistido es un hash ≠ secreto, la URL lleva `#enlace=`, y el log del fallo no lleva destinatario, URL ni id. |
| R1618 (DTO) | unit: el DTO no lleva id ni hash, y `vencido` sale de la hora. El bloque visual es del PR 3. |
| R1626 | PR 3 (la página). En backend, la action solo la llama el botón. |
| R1627 | solo estructural (m1). |

## Mutaciones propias

Integración `tests/integration/db/usuario-cambio-correo.test.ts` sobre `lib/repositories/UserRepository.ts`. Todas se revirtieron con `git checkout`.

| # | Mutación | Resultado |
|---|---|---|
| M1 | `existeEmailEnEmpresa`: quitar `id: { not: excluirUsuarioId }` | muerta (R1611) |
| M2 | `aplicarCambioCorreo`: quitar `confirmadoAt: null` del `updateMany` | muerta (R1625) |
| M3 | `cambioCorreoParaCanje`: quitar `expiraAt: { gt }` | muerta (R1622/R1623) |
| M4 | `anularCambioCorreoAbierto`: quitar `usuarioId` | muerta (R1619/R1617) |
| M5 | `abrirCambioCorreo`: quitar `usuarioId` del `updateMany` | muerta (R1622/R1623) |
| M6 | `aplicarCambioCorreo`: quitar `expiraAt: { gt }` | muerta (R1622/R1623) |

Seguridad, en `confirmar-correo-service.test.ts` + `confirmar-correo.test.ts` sobre `ConfirmarCorreoService.ts`:

| # | Mutación | Resultado |
|---|---|---|
| S1 | quitar `if (superado) return null` | muerta |
| S2 | quitar la comprobación `verifyPassword` | muerta |
| S3 | quitar `limitador.registrar(clave)` | muerta |
| S4 | `lib/actions/confirmar-correo.ts`: `buildConfirmarCorreoService` con `new ResetRateLimiter()` por petición, en lugar del `limitador` del módulo | **SOBREVIVE (4/4 verdes) → B1** |

## Seguridad del canje

- **Secreto con hash.** 32 bytes `randomBytes` en base64url. En la base solo queda `hashPassword(secreto)`. El enlace viaja solo en el fragmento `#enlace=`. Probado.
- **Tiempo constante.** La comparación del secreto es `verifyPassword` (hash lento con comparación propia). Un enlace inexistente, anulado o vencido sale sin calcular el hash, así que hay una diferencia de tiempo que revela si el id existe y está abierto. El id es un UUID aleatorio, el secreto tiene 256 bits y el patrón es el mismo de `PasswordResetService`. Es menor (m3).
- **Limitador.** Se aplica por (id, IP) ANTES de leer la base y de evaluar el secreto, y registra el intento antes de leer. Bien. El cableado no está probado: B1.
- **Misma respuesta para los seis motivos.** Sí: `INVALIDO` es único. `comoPlataforma` devuelve `null` también para un formato roto y para el tope superado. Probado.
- **Sin destinatario ni URL en logs.** El código nuevo solo escribe `causa=<error.name>`, probado con un `message` que contiene el destinatario y la URL. Ver m4 sobre el `ConsoleEmailSender`, que ya existía.
- **RLS.** La política tiene USING y WITH CHECK, sin DELETE para `servi_app`. El canje solo lee `organizacion_id` dentro de `comoPlataforma`; el UPDATE y el Histórico corren con `conEmpresa(org)`. La excepción está en `EXCEPCIONES_DE_PLATAFORMA`. Probado con `comoApp`.
- **Concurrencia.** El canje consume con `updateMany ... confirmadoAt: null` antes de escribir el correo. Si salta un P2002, revierte todo y el pendiente queda abierto. Probado con dos canjes reales.

## Desvíos de design §3.4 (los pidió revisar el implementer)

1. `ICambioCorreoRepository` como interfaz aparte, implementada por el MISMO `UserRepository`: **aceptado**. `usuarios-composition.test.ts` prueba que `correo.repo` es la misma instancia que `args[0]`.
2. El canje partido en dos métodos (`empresaDelEnlace` en `comoPlataforma` y `confirmar` en `conEmpresa`): **aceptado**. Es necesario por los dos contextos, y el límite sigue mirándose antes de leer.
3. Índice `(organizacion_id, usuario_id)` parcial: **aceptado**. Es el mismo único, porque el usuario ya pertenece a una empresa, y satisface la guardia `unicos-por-empresa`.
4. El log fuera del servicio (`avisarEnvioFallidoCambioCorreo`): **aceptado**. Lo exige la guardia de la feature 287 y el aviso solo recibe el nombre del error.
5. Contadores: `TRIGGERS_MISMA_EMPRESA` pasa de 181 a 183 (dos `sme_*`) y las tablas con RLS de 95 a 96. **Aceptado**: cuadran con la migración.

## Hallazgos

### Bloqueantes

**B1 — R1629: el limitador compartido entre peticiones no está probado en el composition root.**
- El límite por (enlace, IP) solo funciona en producción si `buildConfirmarCorreoService` pasa el `limitador` del módulo.
- Con la mutación S4 (`new ResetRateLimiter()` en cada petición, o sin pasarlo, porque el constructor ya tiene `= new ResetRateLimiter()` por defecto), todos los tests siguen verdes. R1629 quedaría muerto en producción sin que nada lo detecte: es el caso de «el composition root que no inyecta».
- **Qué falta:** un test en `tests/unit/actions/confirmar-correo.test.ts` que llame a `confirmarCambioCorreo` SIN `deps.service`, con el repositorio doblado (`vi.mock` de `UserRepository` o de `getPrismaClient`) y `getContext` fijo. Debe repetir el mismo enlace desde la misma IP más de `AUTH_RESET_MAX_VERIFY_ATTEMPTS` veces y comprobar que, pasado el tope, `empresaDelCambioCorreo` ya no se llama.
- Ese test tiene que matar S4: comprobarlo con la mutación antes de darlo por bueno.

### Menores

- **m1 — R1627 (conservar las sesiones) se prueba solo de forma estructural.** El doble del servicio no tiene métodos de sesión. Ningún test de integración comprueba que las filas `session` del usuario sigan ahí tras `aplicarCambioCorreo`. Sugerencia: añadir esa aserción al test de integración de R1622, o dejarla explícita en el E2E de T3.3.
- **m2 — La bitácora no deja constancia del E2E local del PR 2**, y el PR toca `db/` (`docs/perfil-agentes.md`). La deja esta review: `usuario-corregir-cedula` + `login-varias-empresas`, 13 passed. Al PR 3 le toca el suyo (T3.3).
- **m3 — Diferencia de tiempo entre un enlace inexistente o cerrado (sale sin hash) y uno abierto con el secreto incorrecto (calcula el hash).** Con un UUID aleatorio y el limitador, el riesgo es bajo y el patrón es el mismo de `PasswordResetService`. Si se quiere cerrar: un `verifyPassword` contra un hash señuelo cuando no hay pendiente.
- **m4 — El `ConsoleEmailSender`, que ya existía, escribe `to=<destinatario>` cuando no hay SMTP, y también para los dominios reservados aunque lo haya.** Con su bandera de debug escribe además el cuerpo, que lleva la URL con el secreto. No lo introduce este PR y es el mismo criterio de SL-41 R11 que usa la recuperación de contraseña, pero choca con la letra de R1632 en dev/CI. Queda para el leader decidir si abre una deuda.
- **m5 — Dos «Pedir cambio» simultáneos del mismo usuario** pueden chocar con el índice parcial `usuario_cambio_correo_abierto`. `abrirCambioCorreo` no traduce ese P2002 y el maestro recibiría un error genérico. Es poco probable (doble clic); se puede traducir o reintentar una vez.
- **m6 — Un reenvío fallido deja al usuario sin ningún pendiente,** porque `abrirCambioCorreo` ya anuló el anterior antes del envío. Es coherente con R1616 y R1617, pero la UI del PR 3 debe mostrar que ya no hay nada pendiente.
- **m7 — El texto de la plantilla dice «Tu administrador cambió el correo de tu cuenta a este»,** pero aún no ha cambiado: pide confirmación. Sugerencia: «pidió cambiar». Que lo decida Carlos con el canvas del PR 3.

## Gate (`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`)

**Gate final:** `== init OK ==`, `INIT_EXIT=0` (escrito dentro del log). Corrió sobre `servi_slt221_rev2b` (nueva: `migrate deploy` y seed con exit 0), con log propio, y todas las corridas de vitest salieron del worktree de revisión: 6 bloques de 100/100 archivos y 38/38. Tamaño: «no aplica» en detached; medido aparte, 34/40 archivos y 863/1000 líneas (AVISO).

Antes hubo tres corridas que no valen, por causas del entorno y no del diff:

1. **`init.log` contaminado.** El scratchpad es compartido por los subagentes de la sesión, y otros agentes (SLT-221 frontend y SLT-224) escribieron en el mismo `init.log`. De ahí salieron el «42/40 archivos» (es el trabajo sin commitear del PR 3 en el worktree SLT-221) y el `demo-qa-paralelo` por tiempo (91 ms contra un tope de 75; suelto pasa 4/4). Desde ahí usé logs con nombre único.
2. **`init2`: typecheck rojo** con `zona_desactivada` en `HistorialAccionTipo`. El cliente de Prisma del `node_modules` compartido se regeneró con el esquema de otra rama mientras corría (la lección «node_modules compartido y Prisma»). El typecheck suelto, justo después, terminó con `TC_EXIT=0`.
3. **`init3`: «Worker exited unexpectedly»** + `notificacion-evento-gasto-fijo-migration` en rojo (22P02). La causa son datos que dejaron MIS E2E en `servi_slt221_rev2`. En la base nueva `servi_slt221_rev2b`, ese test pasa 20/20.

## Vuelta 2 (acotada a 0a1b032d..acfcf8e6, arreglo ba8fd346)

### Checklist
- [x] B1 (R1629) cerrado: mutación repetida por el reviewer.
- [x] m1 (R1627) cerrado, con test de integración que muere ante su mutación.
- [x] m5 cerrado: traducción del P2002, test de integración con carrera real y test unitario.
- [x] m7 cerrado: texto de la plantilla y aserción en el test del servicio.
- [x] m3, m4 y m6: anotados como deuda en `progress/impl_SLT-221.md`. No se revisan en esta vuelta.
- [x] Tareas T2.x en `[x]`. Las abiertas son T1.8 y T2.0/T3.x, del cierre y del PR 3.
- [x] Tamaño: 34/40 archivos, 908/1000 líneas de producción y 1131/3000 de tests (AVISO, no supera el máximo).
- [x] Gate local verde.

### Mutaciones (corridas por el reviewer y revertidas después; `git status` limpio)
| # | Mutación | Test | Resultado |
|---|---|---|---|
| S4a | `buildConfirmarCorreoService` con `new ResetRateLimiter()` en cada petición | `tests/unit/actions/confirmar-correo.test.ts` | **muerta** (1 failed / 4 passed; base 5/5) |
| S4b | `buildConfirmarCorreoService` sin pasar el limitador (vale el `= new ResetRateLimiter()` por defecto) | ídem | **muerta** |
| M-m1 | `aplicarCambioCorreo` borra las `session` del usuario dentro de la transacción | `tests/integration/db/usuario-cambio-correo.test.ts` | **muerta** (R1622/R1627 en rojo; base 10/10 contra `servi_slt221_fix`) |
| M-m5 | `abrirCambioCorreo` relanza el P2002 sin traducirlo | ídem | **muerta** (test m5 en rojo) |

El test de m5 no es verde por timing: comprueba que el INSERT llegó a esperar el lock (`pg_stat_activity`) antes de soltar la transacción rival. `usuario-service-cambio-correo.test.ts` cubre m5 y m7: 24/24 en verde.

### Hallazgos
- **menor (nuevo) n1:** en `UserRepository.abrirCambioCorreo`, la condición `texto.includes("usuario_id")` es más ancha que el índice. Hoy la transacción solo inserta en `usuario_cambio_correo`, cuyo único sobre `usuario_id` es ese índice parcial, así que no hay falso positivo. Si en el futuro se añade otro único con `usuario_id` en esa transacción, se disfrazaría de «pedido simultáneo». Basta con `usuario_cambio_correo_abierto`, salvo que Prisma no dé el nombre; en ese caso conviene dejarlo comentado.
- Ningún bloqueante.

### Gate
`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` con `DATABASE_URL` en `servi_slt221_fix`: `== init OK ==` e `INIT_EXIT=0`, escrito dentro del log propio (`rev221v2/init-v2.log`). Vitest: 6 bloques de 100/100 archivos y 38/38. El rápido no corrió los 1686 relacionados porque pasan del presupuesto de 150. Por eso el reviewer corrió a mano los tests del diff (arriba). `.env` se comprobó solo como booleano y no se imprimió ninguna URL.

### Veredicto vuelta 2: **APROBADO** (OK)
