# SL-18 «Únicos y secuencias por empresa»: tasks

`[P]` marca las tareas que pueden ir en paralelo con las demás de su tanda. «Dep.» indica de qué
tarea depende. Cada tanda cierra con `./init.sh` en verde. Las tareas de la tanda 7 dependen de que
el humano apruebe la Propuesta A de P4. Con la B, pasan a SLT-41.

## Tanda 1: únicos de `usuario` (R1–R5)

- [x] **T1.1** Migración `20261026090000_usuario_unico_por_empresa`: `migration.sql` y `down.sql`
  (design §2 M1).
  **Hecho:** `pnpm run db:reset` aplica; el `down.sql` aborta con repetidos y, sin ellos, deja los
  globales.
- [x] **T1.2** `db/schema.prisma` (`Usuario`): fuera `@unique` de `email` y `cedula`; dentro los dos
  `@@unique` con `map` y `@@index([email])`. Dep. T1.1.
  **Hecho:** `prisma migrate diff` sin drift; `pnpm run typecheck` en verde tras T1.3.
- [x] **T1.3** `UserRepository` / `IUserRepository`: sustituir `findByEmail` y
  `findByEmailWithHash` por `findCuentasPorEmail` y `findCuentasPorEmailConHash` (design §3.1).
  `PostulacionRepository` pasa a `findFirst`. Ajustar los dobles de los tests unitarios que
  declaran los métodos viejos. Dep. T1.2.
  **Hecho:** typecheck en verde; `user-repository.test.ts` cubre orden, select sin hash y
  plataforma al final.
- [x] **T1.4** Tests de integración. Dep. T1.3.
  - `tests/integration/db/usuario-unico-por-empresa.test.ts`:
    - R1: el mismo email y la misma cédula en A y en B;
    - R2: repetido en la misma empresa da `UsuarioDuplicadoError` con su campo;
    - R3: el superadmin con el email de una cuenta de A sí entra; una segunda cuenta sin empresa
      con el mismo email da P2002;
    - R4: ida y vuelta del `down.sql`, que aborta con repetidos y nombra el índice.
  - Ajustar `aislamiento-usuarios.test.ts`: los dos casos de SL-17 R36 pasan de «falla con P2002»
    a «se crea en B».
  - Ajustar `unicos-por-empresa.test.ts`: `usuario_email_key` y `usuario_cedula_key` salen de
    «global a propósito».
  - Ajustar `organizacion-alta.test.ts` si algún caso daba por hecho el email global.
  **Hecho:** los tres archivos en verde; mutación anotada en `impl` (quitar `organizacion_id` del
  índice → R1 en rojo).
- [x] **T1.5** [P] R5: test en `tests/integration/db/usuario-unico-por-empresa.test.ts`: la key
  «tienda-x» se crea en A y en B; repetida en A da `conflict`. Dep. T1.3.
  **Hecho:** verde.

## Tanda 2: login (R6–R15)

- [x] **T2.1** `lib/types/auth.ts`: `loginInputSchema` suma `organizacionId` (uuid, nullable,
  opcional, `.strict()`); `LoginResult` suma `elegir_empresa`. `IAuthService`: `LoginCommandInput`
  y `LoginCommandResult` (design §3.4).
  **Hecho:** typecheck en verde.
- [x] **T2.2** `AuthService.login` según design §3.2, pasos 1–8. El predicado de habilitada va en
  una sola función (`puedeIniciarSesion` si SLT-32 ya mergeó; si no, inline con el comentario de
  §9). Dep. T1.3, T2.1.
  **Hecho:** `tests/unit/services/auth-service-empresas.test.ts` cubre:
  - R6: una válida → sesión;
  - R7: dos válidas → `elegir_empresa` ordenado, «Plataforma» con `null`, sin escrituras;
  - R8: excluye la mala, la inactiva y la bloqueada;
  - R9: ninguna vale → `invalid_credentials` y un fallo por cuenta;
  - R10: vale en A → ningún fallo en B;
  - R11: con empresa → solo esa; con una empresa ajena → `invalid_credentials`;
  - R12: todas bloqueadas → `account_locked`; solo inactivas → `account_unavailable`;
  - R15: sin empresa y no superadmin → nunca opción.

  `tests/unit/services/auth-service.test.ts` ajustado al repositorio nuevo y en verde.
- [x] **T2.3** `lib/actions/auth.ts`: pasa `organizacionId` al servicio y devuelve
  `elegir_empresa` tal cual. Dep. T2.2.
  **Hecho:** `tests/integration/actions/login-varias-empresas.test.ts`, con base real y dos
  empresas, cubre:
  - R7: la respuesta trae A y B;
  - R11: con B → cookie de la sesión de la cuenta de B;
  - R13: `empresaDeLaPeticion()` con esa cookie devuelve B, y un listado de usuarios no trae los
    de A;
  - R14: con riesgo alto, `verifyChallenge` abre la sesión de la cuenta de B.

## Tanda 3: recuperar contraseña (R16–R21)

- [x] **T3.1** Plantilla `lib/services/email/plantillas/recuperar-contrasena.ts`: una línea por
  cuenta con el nombre de la empresa y la URL (texto y HTML, sobre `plantilla-marca.ts`).
  **Hecho:** test de la plantilla: N enlaces, «Plataforma» para la de plataforma, sin el secreto
  fuera del `#enlace=`.
- [x] **T3.2** `PasswordResetService` según design §4.1:
  - `solicitar` con enlaces y un solo correo;
  - `emitirEnlace` privado;
  - el canje acepta `DEVICE_HASH_RECUPERACION`;
  - fuera `verificarCodigo` y `restablecer`.

  `IPasswordResetService` y `lib/types/password-reset.ts` se ajustan. Dep. T1.3, T3.1.
  **Hecho:** `tests/unit/password-reset-por-empresa.test.ts` cubre:
  - R16: dos cuentas → un correo con dos enlaces; una sobre el límite se omite;
  - R17: sin cuentas o todas al límite → sin correo y la misma respuesta;
  - R19: vencido, usado, sustituido o marca ajena → `invalid_or_expired`;
  - R21: solo el hash en `create`, y el secreto no está en ninguna llamada a `console`.

  Se ajustan `password-reset-service.test.ts`, `password-reset-enlace.test.ts`,
  `password-reset-actions.test.ts`, `password-reset-degrada-a-consola.test.ts`,
  `correos-sin-secretos.test.ts` y `otp-challenge-issuer.test.ts`: se borran los casos del código
  por email y se conservan los del enlace.
- [x] **T3.3** (2026-10-26: las dos acciones quedan como envoltorios que siempre fallan hasta
  T7.2, porque `app/` no se toca en esta tanda; R20 se prueba por comportamiento.
  Ver `progress/impl_SL-18.md > Tanda 3`.) `lib/actions/password-reset.ts`: fuera `verificarCodigoRecuperacion` y
  `restablecerContrasena`. `lib/actions/_shared/contexto-peticion.ts` inyecta el emisor y la URL
  base. Dep. T3.2.
  **Hecho:** R20: test de que el módulo ya no exporta esas acciones.
  `tests/integration/actions/recuperar-por-empresa.test.ts`, con base real, cubre R18: el enlace
  de B cambia la contraseña de B, y la de A sigue entrando con la vieja.

## Tanda 4: guardia de únicos (R22, R23, R30)

- [ ] **T4.1** [P] Detector `tests/unit/guards/_unicos-por-empresa.ts` y lista
  `UNICOS_SIN_EMPRESA` en `lib/db/excepciones-aislamiento.ts`, sembrada como dice design §5.
  Dep. T1.1.
  **Hecho:** el detector lista los únicos finales; la lista cuadra con ellos.
- [ ] **T4.2** `tests/unit/guards/unicos-por-empresa.guardia.test.ts`, con los casos (a)–(d) de
  design §5. Dep. T4.1, T6.3.
  **Hecho:** verde; la autoprueba (d) demuestra el rojo con SQL de muestra y con la mutación M4b.

## Tanda 5: índices de rutas calientes (R24, R25)

- [ ] **T5.1** Medición (design §6): `EXPLAIN (ANALYZE, BUFFERS)` de cada candidato con dos
  empresas, antes y después. La tabla va a `progress/impl_SL-18.md`. Dep. T1.1.
  **Hecho:** tabla con consulta, plan antes y después y decisión por candidato.
- [ ] **T5.2** Migración `20261026090100_indices_rutas_calientes` (`migration.sql` y `down.sql`) y
  los `@@index` en `db/schema.prisma`, solo con lo que eligió T5.1. Dep. T5.1.
  **Hecho:** sin drift; ida y vuelta del `down.sql`.
- [ ] **T5.3** `tests/integration/db/indices-rutas-calientes.test.ts`: R24 (cada índice elegido
  existe con `organizacion_id` primero y el `EXPLAIN` de su consulta lo nombra) y R25
  (`usuario_email_idx` en el plan de la búsqueda del login). Dep. T5.2.
  **Hecho:** verde.

## Tanda 6: push y número de guía (R26–R30)

- [ ] **T6.1** [P] `lib/repositories/PushEndpointPlataformaRepository.ts` (design §7) y su entrada
  en `EXCEPCIONES_DE_PLATAFORMA`. `registrarSuscripcionPush` lo llama antes de `registrar`.
  Dep. —.
  **Hecho:** `tests/integration/db/push-ultimo-gana.test.ts`, con base real, cubre:
  - R26: el endpoint de A, registrado en B, deja una sola fila, la de B, y los destinatarios de
    push de A ya no lo incluyen;
  - R27: el cambio de cuenta dentro de A reescribe el dueño;
  - R28: los otros endpoints de A y de B no cambian.

  `push-action.test.ts` está ajustado y pasa la guardia `plataforma-solo-en-lista`.
- [ ] **T6.2** [P] `tests/integration/db/num-guia-global.test.ts`: R29. Las guías de órdenes de A y
  de B salen de `siguiente_num_guia()` sin repetirse, y `orden_num_guia_key` sigue sin
  `organizacion_id`. Dep. —.
  **Hecho:** verde.
- [ ] **T6.3** [P] `docs/architecture.md > Multi-empresa > Únicos`: el párrafo de design §8 y la
  lista de los 5 globales a propósito. `progress/deudas.md > D14`: el punto del push queda resuelto
  por SL-18. Dep. —.
  **Hecho:** R30 lo verifica la guardia de T4.2 (c).

## Tanda 7: pantallas mínimas y E2E (R31, R32). Solo con la Propuesta A de P4

- [ ] **T7.1** `app/login/_components/LoginForm.tsx`: la variante `elegir_empresa` muestra una
  lista de botones, uno por empresa con su nombre. Al pulsar uno, vuelve a llamar a `login` con
  ese `organizacionId`. Sin diseño nuevo. Dep. T2.3.
  **Hecho:** `tests/components/LoginForm.test.tsx` cubre la lista y la segunda llamada.
- [ ] **T7.2** `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`: el paso 1 acaba
  en «Revisa tu correo»; fuera el paso del código. Dep. T3.3.
  **Hecho:** `recuperar-contrasena-form.test.tsx` y `recuperar-contrasena-page.test.tsx` en verde.
- [ ] **T7.3** E2E. Dep. T7.1, T7.2.
  - `e2e/_superadmin-fixture.ts > recuperarContrasena` pasa al enlace (`enlaceEnviadoA` y
    `/recuperar-contrasena#enlace=…`), y `e2e/superadmin-empresas.spec.ts` y
    `e2e/dos-empresas-humo.spec.ts` se ajustan (R32).
  - `e2e/login-varias-empresas.spec.ts` (R31): el mismo email y la misma contraseña en A y en B;
    `/login` ofrece las dos; elige B; entra en B y no ve datos de A.
  - `e2e/auth.spec.ts` sigue en verde.

  **Hecho:** los cuatro archivos en verde con `pnpm exec playwright test`.

## Cierre

- [ ] **T8.1** `./init.sh` en verde. Mapa R→test en `progress/impl_SL-18.md` (abajo). Dep. todas.

## Mapa R → test

| R | Test |
|---|---|
| R1, R2, R3, R4, R5 | `tests/integration/db/usuario-unico-por-empresa.test.ts` |
| R6–R12, R15 | `tests/unit/services/auth-service-empresas.test.ts` |
| R7, R11, R13, R14 | `tests/integration/actions/login-varias-empresas.test.ts` |
| R16, R17, R19, R21 | `tests/unit/password-reset-por-empresa.test.ts` |
| R18, R20 | `tests/integration/actions/recuperar-por-empresa.test.ts` |
| R22, R23, R30 | `tests/unit/guards/unicos-por-empresa.guardia.test.ts` |
| R24, R25 | `tests/integration/db/indices-rutas-calientes.test.ts` |
| R26, R27, R28 | `tests/integration/db/push-ultimo-gana.test.ts` |
| R29 | `tests/integration/db/num-guia-global.test.ts` |
| R31 | `e2e/login-varias-empresas.spec.ts`, `e2e/auth.spec.ts` |
| R32 | `e2e/dos-empresas-humo.spec.ts`, `e2e/superadmin-empresas.spec.ts` |

## Archivos esperados

- `db/migrations/20261026090000_usuario_unico_por_empresa/migration.sql`
- `db/migrations/20261026090000_usuario_unico_por_empresa/down.sql`
- `db/migrations/20261026090100_indices_rutas_calientes/migration.sql`
- `db/migrations/20261026090100_indices_rutas_calientes/down.sql`
- `db/schema.prisma`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/repositories/PostulacionRepository.ts`
- `lib/repositories/PushEndpointPlataformaRepository.ts`
- `lib/interfaces/services/IAuthService.ts`
- `lib/services/AuthService.ts`
- `lib/types/auth.ts`
- `lib/actions/auth.ts`
- `lib/interfaces/services/IPasswordResetService.ts`
- `lib/services/PasswordResetService.ts`
- `lib/services/email/plantillas/recuperar-contrasena.ts`
- `lib/types/password-reset.ts`
- `lib/actions/password-reset.ts`
- `lib/actions/_shared/contexto-peticion.ts`
- `lib/actions/push.ts`
- `lib/db/excepciones-aislamiento.ts`
- `app/login/_components/LoginForm.tsx`
- `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`
- `docs/architecture.md`
- `progress/deudas.md`
- `progress/impl_SL-18.md`
- `tests/integration/db/usuario-unico-por-empresa.test.ts`
- `tests/integration/db/aislamiento-usuarios.test.ts`
- `tests/integration/db/unicos-por-empresa.test.ts`
- `tests/integration/db/organizacion-alta.test.ts`
- `tests/integration/db/indices-rutas-calientes.test.ts`
- `tests/integration/db/push-ultimo-gana.test.ts`
- `tests/integration/db/num-guia-global.test.ts`
- `tests/integration/actions/login-varias-empresas.test.ts`
- `tests/integration/actions/recuperar-por-empresa.test.ts`
- `tests/integration/recuperar-contrasena-form.test.tsx`
- `tests/integration/recuperar-contrasena-page.test.tsx`
- `tests/integration/recuperar-contrasena-enlace.test.tsx`
- `tests/unit/services/auth-service.test.ts`
- `tests/unit/services/auth-service-empresas.test.ts`
- `tests/unit/password-reset-por-empresa.test.ts`
- `tests/unit/password-reset-service.test.ts`
- `tests/unit/password-reset-enlace.test.ts`
- `tests/unit/password-reset-actions.test.ts`
- `tests/unit/actions/password-reset-degrada-a-consola.test.ts`
- `tests/unit/actions/push-action.test.ts`
- `tests/unit/services/email/correos-sin-secretos.test.ts`
- `tests/unit/services/otp-challenge-issuer.test.ts`
- `tests/unit/repositories/user-repository.test.ts`
- `tests/unit/services/usuario-zona.test.ts`
- `tests/unit/services/usuario-vehiculo.test.ts`
- `tests/unit/services/usuario-service.test.ts`
- `tests/unit/services/usuario-service-superadmin.test.ts`
- `tests/unit/services/usuario-restablecer-contrasena.test.ts`
- `tests/unit/services/usuario-impacto-zona.test.ts`
- `tests/unit/services/postulacion-login-regresion.test.ts`
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`
- `tests/unit/guards/379-maestro-sin-bloqueo.guardia.test.ts`
- `tests/unit/repositories/postulacion-repository.test.ts`
- `tests/unit/guards/_unicos-por-empresa.ts`
- `tests/unit/guards/unicos-por-empresa.guardia.test.ts`
- `tests/components/LoginForm.test.tsx`
- `e2e/_superadmin-fixture.ts`
- `e2e/superadmin-empresas.spec.ts`
- `e2e/dos-empresas-humo.spec.ts`
- `e2e/login-varias-empresas.spec.ts`
- `e2e/auth.spec.ts`
