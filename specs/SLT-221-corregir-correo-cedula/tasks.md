# SLT-221 «Maestro: corregir correo y cédula de un usuario» — tasks

> Dos PR secuenciales sobre `feature/SLT-221-corregir-correo-cedula` (D6). PR 2 empieza cuando
> PR 1 esté mergeado en `dev` y la rama esté al día con él. Cada PR cierra con `./init.sh` en
> verde, E2E en local (`docs/perfil-agentes.md`) y su reviewer.
> Tope por PR (`gate.tamano_pr`): 40 archivos con los tests, 1000 líneas de producción y 3000 de
> tests. El aviso salta al 80% (32 archivos).
> Antes del primer gate de cada tanda: `.env` copiado al worktree y base desechable exportada.

## Tamaño

| PR | Archivos | Producción (estimado) | Tests (estimado) |
|---|---|---|---|
| PR 1 — cédula | 18 (45%) | ~250 líneas | ~650 líneas |
| PR 2 — correo | 30 (75%) | ~850 líneas | ~1400 líneas |

En PR 2 el margen de líneas de producción es corto: comentarios breves y nada fuera de
`## Archivos esperados`. Si `./init.sh` avisa del 80%, el implementer para y lo dice.

---

## Tanda 1 — PR 1: cédula y base del Histórico (R1601-R1609)

- [x] **T1.1 — Migración A y esquema.**
  `20261120130000_slt221_historial_correo_cedula`: los dos valores del enum y `varchar(254)` en
  `valor_anterior`/`valor_nuevo` (design §2.1). Antes, comprobar con `pg_depend` qué vistas
  dependen de esas columnas. `down.sql` con el molde de
  `20261119120000_historial_accion_ordenes_retiradas_a_central`. `db/schema.prisma` al día.
  **Hecho:** `migrate deploy` y `db:rollback` aplican y revierten sin error en una base desechable,
  y `prisma generate` compila.
- [x] **T1.2 — Catálogo del Histórico** (depende de T1.1).
  `lib/types/historial-accion.ts`: los dos tipos en A.3, categoría «cambia_permisos» y etiquetas
  (R1609). **Hecho:** `pnpm run typecheck` verde (exhaustividad del enum).
- [x] **T1.3 [P] — Borde.** `actualizarUsuarioSchema` gana `cedula` y el comentario R16 se
  actualiza (design §3.1). **Hecho:** `tests/unit/types/usuario-schema.test.ts` cubre que `cedula`
  entra y que `email` y `password` siguen siendo `validation_error` (R1607).
- [x] **T1.4 — Servicio y repositorio** (depende de T1.2 y T1.3).
  - `UpdateUsuarioData.cedula` y `ActualizarUsuarioServiceResult` con `conflict`;
  - `validarCambioDePersona` con la cédula;
  - `actualizar` traduce `UsuarioDuplicadoError`;
  - `UserRepository.update` escribe la cédula, añade `usuario_cedula_cambiada` al mismo lote y
    traduce P2002 (design §3.1).

  **Hecho:**
  - `tests/unit/services/usuario-service-cedula.test.ts` cubre R1601, R1602 (tipo guardado y tipo
    nuevo) y R1603;
  - `tests/integration/db/usuario-cedula-corregida.test.ts`, contra la base real, cubre:
    - el UPDATE;
    - el choque del índice `(empresa, tipo, cedula)` y que el mismo documento en otra empresa no
      choca;
    - la fila con anterior y nuevo (R1604);
    - sin fila al reenviar el mismo documento (R1605);
    - 254 caracteres caben y 255 abortan (R1608).
  - Cada test se mata con una mutación (quitar la condición de «cambió», quitar el `organizacion_id`
    del choque) antes de darlo por bueno.
- [x] **T1.5 — Guardias del Histórico** (depende de T1.4).
  - `historial-accion-sin-datos-cliente`: lista de excepciones declaradas para
    `usuario_cedula_cambiada` y `usuario_email_cambiado` en `UserRepository.ts`, con su
    contraprueba y la consecuencia de D10 escrita en la cabecera (design §6);
  - `historial-accion-escrituras-cubiertas`: conteo 86 → 88 y `usuario_email_cambiado` en
    `ESCRITOR_PENDIENTE_EN_CURSO` (ficha SLT-221, tarea T2.4).

  **Hecho:** `pnpm run test:guardias` verde, y meter `email` en el bloque de `usuario_rol_cambiado`
  la pone roja.
- [x] **T1.6 — Formulario** (depende de T1.4).
  `UsuarioForm.tsx`: «Número de documento» editable en edición y `cedula` en el payload. El conflict
  ya se pinta bajo el campo. **Hecho:** `tests/unit/components/usuario-form.test.tsx` actualizado
  (antes afirmaba que el campo estaba deshabilitado) cubre R1606 y el mensaje de R1603, y
  `tests/unit/actions/usuarios.test.ts` el borde.
- [x] **T1.7 — E2E** (depende de T1.6).
  `e2e/usuario-corregir-cedula.spec.ts`: el maestro corrige la cédula de un usuario, la ve guardada
  y ve la fila «Cambió la cédula de un usuario» con el valor anterior y el nuevo en el Histórico de
  acciones. **Hecho:** verde en local con base desechable y build (`NEXT_PUBLIC_APP_URL` como en
  `gate.yml`).
  **Estado:** registrado en el proyecto `aislamiento`. Vuelta 2 de la review: verde en local
  (base desechable nueva `servi_slt221_e2e` + `migrate deploy` + seed + `next build`), junto con
  `tope-intentos-por-empresa` y `tarifas-valor-propio-mensajero`: 34 passed, 0 failed, 0 flaky.
- [ ] **T1.8 — Cierre de PR 1.** `./init.sh` verde. Evidencia en
  `progress/features/SLT-221.md`, con la comprobación de lo que el usuario ve. Reviewer. El PR lo
  abre el leader.

### Archivos esperados — PR 1

- `db/schema.prisma`
- `db/migrations/20261120130000_slt221_historial_correo_cedula/migration.sql`
- `db/migrations/20261120130000_slt221_historial_correo_cedula/down.sql`
- `lib/types/usuario.ts`
- `lib/types/historial-accion.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/interfaces/services/IUsuarioService.ts`
- `lib/services/UsuarioService.ts`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `tests/unit/types/usuario-schema.test.ts`
- `tests/unit/actions/usuarios.test.ts`
- `tests/unit/services/usuario-service-cedula.test.ts`
- `tests/integration/db/usuario-cedula-corregida.test.ts`
- `tests/unit/components/usuario-form.test.tsx`
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `e2e/usuario-corregir-cedula.spec.ts`

---

## Tanda 2 — PR 2: correo con confirmación (R1610-R1632)

Empieza con PR 1 mergeado y la rama al día con `dev`.

- [x] **T2.0 — `/design`** (bloquea T3.x, no T2.x). **Omitido por decisión de Carlos 2026-11-19:
  componentes de hoy, sin canvas.** El bloque va en `UsuarioForm` con sus componentes y la página
  pública copia la estructura y el estilo de `/recuperar-contrasena`.
  Canvas de la página pública `/recuperar-contrasena/confirmar-correo` (pantalla nueva) y del
  bloque «Cambiar correo / Pendiente de confirmar» dentro de `UsuarioForm`, con los componentes de
  hoy. **Hecho:** el canvas está aprobado por Carlos.
- [x] **T2.1 — Migración B y esquema.**
  `20261122120000_slt221_usuario_cambio_correo` (design §2.2):
  - tabla, CHECK, índice parcial, RLS `usuario_cambio_correo_por_empresa`, GRANT a `servi_app`;
  - triggers de misma empresa generados con `scripts/generar-misma-empresa.ts --faltantes`;
  - `down.sql`;
  - modelo y relaciones inversas en `db/schema.prisma`;
  - alta en `lib/db/modelos-de-negocio.ts`.

  **Hecho:** deploy y rollback limpios, y las guardias `organizacion-en-modelos` y
  `fk-misma-empresa` verdes.
- [x] **T2.2 [P] — Piezas puras** (depende de T2.1 solo para tipos).
  - `lib/utils/enlace-de-un-uso.ts`;
  - `AUTH_CAMBIO_CORREO_TTL_HORAS` (72) en `lib/config/auth.ts`;
  - plantilla `confirmar-correo.ts`;
  - schemas y DTO en `lib/types/usuario.ts` (design §3.2, §3.3, §8).

  **Hecho:** typecheck verde. Las piezas se prueban a través de los tests de T2.3 y T2.5, con la
  plantilla real (sin doble).
- [x] **T2.3 — Repositorio** (depende de T2.1).
  Métodos de `usuario_cambio_correo` y `aplicarCambioCorreo` en `IUserRepository`/`UserRepository`
  (design §3.4). **Hecho:** `tests/integration/db/usuario-cambio-correo.test.ts`, contra la base,
  cubre:
  - el WHERE de `existeEmailEnEmpresa` (misma empresa choca, otra no) (R1611);
  - el índice parcial: un solo abierto, y abrir otro anula el anterior (R1616);
  - la RLS entre dos empresas (R1630);
  - R1615 con `findCuentasPorEmailConHash`;
  - el canje real: correo cambiado, pendiente confirmado y fila `usuario_email_cambiado` con el
    actor que lo pidió (R1622);
  - P2002 sin cambios (R1624);
  - dos canjes concurrentes, un solo cambio (R1625).

  Cada caso se mata con una mutación del WHERE antes de creerlo.
- [x] **T2.4 — Servicio del maestro** (depende de T2.2 y T2.3).
  - `solicitarCambioCorreo`, `cancelarCambioCorreo` y `cambioCorreoPendiente` en `UsuarioService`;
  - el 7.º parámetro `correoDeCambio`, que lanza si falta;
  - `usuario_email_cambiado` sale de `ESCRITOR_PENDIENTE_EN_CURSO` y entra en el censo.

  **Hecho:**
  - `tests/unit/services/usuario-service-cambio-correo.test.ts` cubre R1610-R1614, R1616, R1617,
    R1620, R1621, R1630, R1631 y R1632 (hash persistido, `#enlace=` en la URL, log sin destinatario
    ni URL);
  - guardia `historial-accion-escrituras-cubiertas` verde.
- [x] **T2.5 — Canje** (depende de T2.2 y T2.3).
  - `IConfirmarCorreoService` y `ConfirmarCorreoService`;
  - `lib/actions/confirmar-correo.ts`, con `comoPlataforma` + `conEmpresa` y su composition root no
    exportado;
  - entrada en `EXCEPCIONES_DE_PLATAFORMA`.

  **Hecho:**
  - `tests/unit/services/confirmar-correo-service.test.ts` cubre R1622, R1623 (los seis motivos,
    misma respuesta), R1627, R1628 y R1629;
  - `tests/unit/actions/confirmar-correo.test.ts` cubre el borde y el paso por `comoPlataforma` →
    `conEmpresa`;
  - guardia `plataforma-solo-en-lista` verde.
- [x] **T2.6 — Acciones del maestro** (depende de T2.4).
  - Las tres acciones en `lib/actions/usuarios.ts`;
  - `buildUsuarioService` pasa `correoDeCambio` con `crearEmailSender()`, `baseUrlDeLaApp()`,
    `emailContacto()` y el TTL.

  **Hecho:**
  - `tests/unit/actions/usuarios-composition.test.ts` prueba que el 7.º parámetro se PASA;
  - `tests/unit/actions/usuarios.test.ts` cubre el borde de las tres acciones (`unauthenticated`,
    id inválido, `.strict()`).
- [x] **T3.1 — Bloque del formulario** (depende de T2.0 y T2.6).
  `CambioCorreoUsuario.tsx`, montado en `UsuarioForm.tsx` en edición (design §7). **Hecho:**
  `tests/unit/components/cambio-correo-usuario.test.tsx` cubre:
  - sin pendiente, con pendiente y vencido (R1618);
  - cancelar (R1619);
  - reenviar (R1620);
  - los mensajes de `conflict` y `envio_fallido`.
- [x] **T3.2 — Página pública** (depende de T2.0 y T2.5).
  `app/recuperar-contrasena/confirmar-correo/page.tsx` + `_components/ConfirmarCorreoForm.tsx`.
  Abrirla no llama a nada (R1626); el botón confirma; los tres mensajes (R1622-R1624). **Hecho:**
  cubierto por T3.3. La página se ve sin sesión, sin tocar `PUBLIC_ROUTES`.
- [x] **T3.3 — E2E** (depende de T3.1 y T3.2).
  `e2e/usuario-cambio-correo.spec.ts`:
  - el maestro pide el cambio y ve el pendiente;
  - lo cancela y lo vuelve a pedir;
  - el test siembra un pendiente con secreto conocido (design §10);
  - abre el enlace sin sesión y confirma;
  - entra con el correo nuevo y ya no con el anterior;
  - el maestro ve «Cambió el correo de un usuario» con anterior y nuevo en el Histórico.

  **Hecho:** verde en local con base desechable y build.
- [ ] **T3.4 — Cierre de PR 2.**
  - `./init.sh` verde;
  - `ESCRITOR_PENDIENTE_EN_CURSO` sin tipos de SLT-221;
  - evidencia en `progress/features/SLT-221.md`, comparando la pantalla con el canvas de T2.0;
  - reviewer;
  - el leader abre el PR.

### Archivos esperados — PR 2

- `db/schema.prisma`
- `db/migrations/20261122120000_slt221_usuario_cambio_correo/migration.sql`
- `db/migrations/20261122120000_slt221_usuario_cambio_correo/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/config/auth.ts`
- `lib/types/usuario.ts`
- `lib/utils/enlace-de-un-uso.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/interfaces/services/IUsuarioService.ts`
- `lib/services/UsuarioService.ts`
- `lib/interfaces/services/IConfirmarCorreoService.ts`
- `lib/services/ConfirmarCorreoService.ts`
- `lib/services/email/plantillas/confirmar-correo.ts`
- `lib/actions/usuarios.ts`
- `lib/actions/confirmar-correo.ts`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `app/(app)/configuracion/_components/CambioCorreoUsuario.tsx`
- `app/recuperar-contrasena/confirmar-correo/page.tsx`
- `app/recuperar-contrasena/confirmar-correo/_components/ConfirmarCorreoForm.tsx`
- `tests/unit/services/usuario-service-cambio-correo.test.ts`
- `tests/unit/services/confirmar-correo-service.test.ts`
- `tests/unit/actions/usuarios-composition.test.ts`
- `tests/unit/actions/usuarios.test.ts`
- `tests/unit/actions/confirmar-correo.test.ts`
- `tests/integration/db/usuario-cambio-correo.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/components/usuario-form.test.tsx` (el mock de acciones gana las tres del bloque)
- `tests/unit/components/cambio-correo-usuario.test.tsx`
- `e2e/usuario-cambio-correo.spec.ts`
- `playwright.config.ts` (registra el E2E en `aislamiento`)

## Archivos esperados

Unión de los dos PR (la lee `scripts/archivos-en-vuelo.mjs`):

- `db/schema.prisma`
- `db/migrations/20261120130000_slt221_historial_correo_cedula/migration.sql`
- `db/migrations/20261120130000_slt221_historial_correo_cedula/down.sql`
- `db/migrations/20261122120000_slt221_usuario_cambio_correo/migration.sql`
- `db/migrations/20261122120000_slt221_usuario_cambio_correo/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/config/auth.ts`
- `lib/types/usuario.ts`
- `lib/types/historial-accion.ts`
- `lib/utils/enlace-de-un-uso.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/interfaces/services/IUsuarioService.ts`
- `lib/services/UsuarioService.ts`
- `lib/interfaces/services/IConfirmarCorreoService.ts`
- `lib/services/ConfirmarCorreoService.ts`
- `lib/services/email/plantillas/confirmar-correo.ts`
- `lib/actions/usuarios.ts`
- `lib/actions/confirmar-correo.ts`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `app/(app)/configuracion/_components/CambioCorreoUsuario.tsx`
- `app/recuperar-contrasena/confirmar-correo/page.tsx`
- `app/recuperar-contrasena/confirmar-correo/_components/ConfirmarCorreoForm.tsx`
- `tests/unit/types/usuario-schema.test.ts`
- `tests/unit/actions/usuarios.test.ts`
- `tests/unit/actions/usuarios-composition.test.ts`
- `tests/unit/actions/confirmar-correo.test.ts`
- `tests/unit/services/usuario-service-cedula.test.ts`
- `tests/unit/services/usuario-service-cambio-correo.test.ts`
- `tests/unit/services/confirmar-correo-service.test.ts`
- `tests/integration/db/usuario-cedula-corregida.test.ts`
- `tests/integration/db/usuario-cambio-correo.test.ts`
- `tests/unit/components/usuario-form.test.tsx`
- `tests/unit/components/cambio-correo-usuario.test.tsx`
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `e2e/usuario-corregir-cedula.spec.ts`
- `e2e/usuario-cambio-correo.spec.ts`
- `playwright.config.ts`
