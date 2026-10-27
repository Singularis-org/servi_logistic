# Review SL-18 «Únicos y secuencias por empresa» — vuelta 1

- Rama `feature/SL-18-unicos-secuencias-por-empresa`, HEAD `20b8d09`. Diff `origin/dev...HEAD`: 48
  commits, 90 archivos.
- Reviewer, 2026-10-27.
- MCP del grafo: no usado. Bastó con Grep/Read sobre el diff.

## Verificación ejecutada por el reviewer

Las corridas fueron en serie, por la máquina justa.

- `pnpm exec vitest run --no-file-parallelism` sobre 7 archivos: `Test Files 7 passed`, `Tests 119 passed`.
  - Guardia de únicos (R22, R23, R30).
  - `auth-service-empresas` (R6–R15).
  - `password-reset-por-empresa` (R16–R21).
  - `push-action` (R26–R28).
  - `LoginForm.test.tsx` (R7, R31).
  - `correos-sin-secretos`.
  - `organizacion-en-modelos`, la guardia reescrita.
- Barrido del diff sin hallazgos:
  - secretos: patrones de claves, cadenas de conexión con contraseña, JWT y `supabase.co`;
  - dependencias: `package.json`, `pnpm-lock` y `docs/dependencias.md` no cambian;
  - literales de país o moneda;
  - recursos de Ordenex.
- No corrí: `./init.sh` (lo corre el leader), la integración contra Postgres, el E2E ni el typecheck
  completo. Los resultados de la integración son los de la bitácora del implementer.

## Checklist

### Trazabilidad (regla 4)
- [x] R1–R5 → `tests/integration/db/usuario-unico-por-empresa.test.ts`. Hay un caso por R, y R4 tiene
  tres: ida y vuelta, abortar con email y abortar con email y cédula.
- [x] R6–R12, R15 → `tests/unit/services/auth-service-empresas.test.ts`.
  - Los casos tienen contenido real: R8 excluye a la vez la cuenta con otra contraseña, la inactiva y
    la bloqueada; R9 compara las dos respuestas y cuenta los intentos; R15 comprueba `sin_empresa`.
  - El orden por nombre de R7 está en `tests/unit/repositories/user-repository.test.ts:206`.
- [x] R7, R11, R13, R14 → `tests/integration/actions/login-varias-empresas.test.ts`.
  - R13 comprueba `empresaDeLaPeticion()` y que el listado de usuarios no trae los de A.
  - R14 comprueba que el OTP abre la cuenta de B.
- [x] R16, R17, R19, R21 → `tests/unit/password-reset-por-empresa.test.ts`.
- [x] R18, R20 → `tests/integration/actions/recuperar-por-empresa.test.ts`, con `password-reset-actions`
  y `recuperar-contrasena-form` en pantalla.
- [x] R22, R23, R30 → `tests/unit/guards/unicos-por-empresa.guardia.test.ts`. Trae autoprueba (d),
  con la mutación M4b incluida.
- [x] R24, R25 → `tests/integration/db/indices-rutas-calientes.test.ts`, más `analitica-operativa-indices`
  y `historial-accion-migration` por T5.4.
- [x] R26–R28 → `tests/integration/db/push-ultimo-gana.test.ts`, que usa el cliente extendido y
  `conEmpresa`, y `tests/unit/actions/push-action.test.ts`.
- [x] R29 → `tests/integration/db/num-guia-global.test.ts`.
- [x] R31 → `e2e/login-varias-empresas.spec.ts` (escrito y sin ejecutar, ver T7.3).
  - Prueba de verdad R31. Crea dos cuentas con el mismo email y la misma contraseña, comprueba en BD
    que son dos filas en A y B, y ve dos botones con los nombres exactos.
  - Al elegir B comprueba que la fila `Session` de la cookie es del maestro de B. En `/configuracion`
    ve la tienda de B como control positivo, y el HTML no contiene ni el email de la tienda de A ni el
    nombre de A.
  - Los selectores (`[data-slot="card"]`, el heading «Elige la empresa», `listitem > button`,
    «Volver a correo y contraseña») existen en `LoginForm.tsx:334-385` y en `components/ui/card.tsx:12`.
- [x] R32 → `e2e/_superadmin-fixture.ts > recuperarContrasena`, usado por `superadmin-empresas` y
  `dos-empresas-humo` (escrito y sin ejecutar).
  - El fixture prueba el camino del enlace: «Enviar enlace», «Revisa tu correo» y `enlaceEnviadoA` del
    log, y luego `/recuperar-contrasena#enlace=…`.
  - También comprueba que el hash sale de la barra y que aparece «Contraseña creada».
  - Los textos coinciden con `RecuperarContrasenaForm.tsx:270,316,339`.
  - `e2e/auth.spec.ts` sigue usando `codigoEnviadoA` solo para el OTP del login, que no cambia: es
    correcto.

### Tasks
- [x] T1.1–T7.2 y T5.4 marcadas `[x]`.
- [ ] T7.3, el E2E, abierta a propósito por decisión humana: el PR no mergea hasta que pase. No la
  trato como bloqueante, por la instrucción del leader.
- [ ] T8.1, el gate del cierre, es del leader y está en curso.

### CHECKPOINTS.md
- [x] requirements EARS, design con alternativas descartadas (§11) y tasks.
- [x] `design.md` abre con `## Lo que ya existe`, que no está vacía. El diff no re-crea nada de esa
  lista:
  - reutiliza el patrón de T3.9;
  - reutiliza `comoPlataforma("SL-17","login")`;
  - reutiliza el canje por enlace de SL-41 y lo amplía con una marca nueva, sin duplicarlo;
  - reutiliza `enlaceEnviadoA` y `urlDelEnlace`.
- [x] Mapa R→test en `progress/impl_SL-18.md > Tanda 7` (R1–R32) y en `tasks.md`.
- [x] Sin dependencias nuevas y sin secretos hardcodeados. La URL base y el contacto salen de
  `lib/config/` (`contexto-peticion.ts:42`).
- [ ] `gate-completo` y `./init.sh` en verde: pendientes (T8.1 y el CI).

### docs/checkpoints-proyecto.md
- [x] Migraciones con `down.sql`. No se edita ninguna migración aplicada. Las tres son nuevas:
  `20261026090000`, `…090100` y `…090200`.
- [x] Sin tablas nuevas. RLS sin cambios.
- [x] Queries nuevas sobre negocio:
  - `findCuentasPorEmail*` lee `usuario` entre empresas, a propósito. Solo se llama dentro de
    `comoPlataforma("SL-17","login")` (`lib/actions/auth.ts:100`, `lib/actions/password-reset.ts:55`).
  - `liberarDeOtrasEmpresas` está en `EXCEPCIONES_DE_PLATAFORMA` con la ficha SL-18.
  - Las dos tienen tests con dos empresas.
- [x] Entrada validada con zod: `loginInputSchema` es `.strict()` y `organizacionId` es
  `uuid().nullable().optional()`.
- [x] Autorización en el servidor.
  - Login: la empresa elegida solo filtra entre las cuentas del email, y la contraseña se vuelve a
    comprobar en esa cuenta (`AuthService.ts:193-197`, `:240-242`). La empresa nunca llega del
    cliente sin prueba.
  - Push: sigue exigiendo sesión. `sinCanalDeEmpresa` corta al superadmin antes de liberar el endpoint
    (`lib/actions/push.ts:122`). El borrado de plataforma lleva el endpoint exacto y excluye la empresa
    de la sesión, y con un id vacío falla cerrado (`PushEndpointPlataformaRepository.ts:142-148`).
- [x] Sin `console.*` de secretos ni de PII.
  - `PasswordResetService` solo registra el nombre de la variable o el nombre del error (`causaDe`).
  - R21 tiene su test de consola.
- [x] Flujo crítico de login y aislamiento: el E2E está escrito (`login-varias-empresas`, `auth`,
  `dos-empresas-humo`). Falta ejecutarlo (T7.3).

### Reglas del proyecto (perfil-agentes > reviewer)
- [x] Ninguna query de negocio sin `organizacion_id` fuera de las excepciones listadas.
- [x] Ninguna migración sin `down.sql`.
- [x] Sin literales de país ni referencias a Ordenex.
- [x] Sin dependencias nuevas.
- [~] Los comentarios explican el porqué. Hay dos desactualizados (m1 y m2).

## Calidad de las migraciones

- **M1, `usuario_unico_por_empresa`.**
  - Conserva los nombres `usuario_email_key` y `usuario_cedula_key`, así que la traducción de P2002
    sigue valiendo.
  - Lleva `organizacion_id` primero y `NULLS NOT DISTINCT`, que da R3.
  - Añade `usuario_email_idx`, que da R25.
  - El `down.sql` cuenta los repetidos dentro de la transacción y lanza `RAISE EXCEPTION` nombrando el
    índice antes de cualquier DDL, así que no cambia nada (R4). Si no hay repetidos, restaura las
    formas de antes.
  - Lo prueban tres casos de ida y vuelta.
- **M2, `indices_rutas_calientes`.** El `down.sql` borra los tres compuestos y restaura
  `tarifas_created_at_idx (created_at)` y `whatsapp_envio_ejecucion_created_at_idx (created_at DESC)`
  con su forma de antes. Nunca aborta. Es reversible.
- **M3, `indices_ordenes_gestiones_historial`.**
  - El `down.sql` borra los tres nuevos y restaura `gestion_orden_created_at_idx (created_at)` y
    `historial_accion_created_at_id_idx (created_at DESC, id)`.
  - `orden_created_at_idx` no se toca: lo necesita la cohorte 411.
  - Es reversible. El parcial de `orden` está documentado en el SQL y en `schema.prisma`.

## Revisiones del spec durante la implementación

Todas son coherentes y están trazadas:

1. **8 globales, no 5.**
   - Anotada en `design.md §2` y `§8`, en `tasks.md:166` y en `docs/architecture.md`.
   - `_unicos-sin-empresa.ts` trae 8 entradas `global`.
   - La comprobación (c) de la guardia exige que `architecture.md` las nombre.
2. **`UNICOS_SIN_EMPRESA` en `tests/unit/guards/`.**
   - Anotada en `design.md §5` y `tasks.md:109`.
   - Ningún código de `lib/` ni de `app/` la importa (grep vacío), así que la mudanza no debilita
     nada. `progress/features/SL-18.md:61` pedía el visto bueno de Camilo o del reviewer: **el
     reviewer lo da.**
3. **R15 con `sin_empresa`.**
   - Decisión de Camilo en `features/SL-18.md:44`, anotada en `design.md §3.2` paso 6.
   - La implementa `AuthService.ts:262-266` y la prueba `auth-service-empresas.test.ts:289,296`.
4. **Ampliación T5.4.**
   - Decisión en `features/SL-18.md:46`, anotada en `design.md §2 M3` y `§6` y en `tasks.md:139`.
   - Los tests ajenos reescritos siguen protegiendo lo mismo (ver abajo).
5. **Design §7, el fallo silencioso del push.**
   - Anotada en `design.md §7` (2026-10-27) y en `deudas.md > D14`.
   - El código arregla los dos síntomas. Pero quedan dos comentarios que todavía dicen P2002 (m1).

## Tests de otras features reescritos

- **126 R25, `analitica-operativa-indices.test.ts`.** Conserva las tres afirmaciones:
  - la migración y su `down.sql`, con la de la 126 congelada y la nueva comprobada;
  - el `@@index` declarado en el bloque `GestionOrden`, y además el viejo prohibido;
  - el plan sin `Seq Scan`, ahora como `servi_app` con la empresa fijada.

  Además añade que el rango de `created_at` va dentro del `Index Cond`, que es más estricto que
  antes. Se conserva el caso que discrimina.
- **362 R40, `historial-accion-migration.test.ts`.** Fija el índice nuevo y prohíbe el viejo. El
  corpus siembra dos empresas intercaladas en modo réplica, dentro de una transacción que se revierte.
  Sigue protegiendo que el listado va por índice, y ahora con empresa.
- **411, `cohorte-carga-indices.int.test.ts`.**
  - Siembra 40 000 órdenes en una transacción que siempre se revierte, y sigue exigiendo
    `orden_created_at_idx`. No se afloja (decisión de Camilo, `features/SL-18.md:47`).
  - Sale de `tests/baseline-rojos.json`, así que el CI tendrá que pasarlo de verdad (ver m6).
- **`organizacion-en-modelos.guardia.test.ts`.** La autoprueba pasa a quitar todos los
  `@@index([organizacionId…` de `Orden` (flag `g`). Es correcto: con dos índices, quitar uno no haría
  fallar la regla. Sigue protegiendo lo mismo, y pasa (corrido arriba).
- **`organizacion-alta.test.ts` y `unicos-por-empresa.test.ts`.**
  - Los casos «email o documento repetido → conflicto» se invierten a «se crea en otra empresa»,
    cuentan las filas exactas y comprueban las dos `organizacionId`.
  - `usuario_email_key` y `usuario_cedula_key` pasan de GLOBALES a la batería por empresa (23505 en
    la misma empresa, convivencia entre empresas).

## Desviación: `e2e/superadmin-empresas` sin los subcasos de email y documento repetidos

Es aceptable y no falta cobertura en otro nivel.

- La pantalla del alta llama a `OrganizacionService.altaEmpresa`.
- «El alta con email repetido, o con documento repetido, crea la empresa» está probado contra
  Postgres, a través del servicio real, en
  `tests/integration/db/organizacion-alta.test.ts > «SL-18 R1 (antes R46/R36)…»` (los dos casos).
  Ese test cuenta las organizaciones, los usuarios y el podio.
- El E2E solo añadiría que la pantalla pinta «creada», que ya cubre el caso 2 del mismo spec.
- El duplicado dentro de una empresa (R2) está en `usuario-unico-por-empresa.test.ts`.

Ver m5 sobre los textos de error que quedan sin uso.

## Hallazgos

Ninguno es BLOQUEANTE.

- **m1 (menor), comentarios que contradicen la revisión de design §7.**
  - `lib/repositories/PushEndpointPlataformaRepository.ts:10` dice «intenta crear y choca con P2002».
  - `lib/actions/push.ts:125-126` dice «chocaría con el único global del endpoint».
  - Design §7 y D14 se corrigieron el 2026-10-27: el fallo es silencioso. Hay que alinear los dos
    comentarios con el design.
- **m2 (menor), un comentario falso en `lib/services/email/plantillas/recuperar-contrasena.ts:28`.**
  - Dice «Ni el asunto ni el preheader llevan … la palabra «contraseña»». Pero el preheader de las
    líneas 41-43 sí la lleva («…cambiar tu contraseña.», «Crea una contraseña nueva…»).
  - SL-41 R11 solo exige que el asunto no lleve un código, un enlace, un secreto ni una contraseña, y
    el asunto cumple.
  - Hay que corregir el comentario (o el preheader, si de verdad se quiere esa regla).
- **m3 (menor), `ArranqueSuperadminRepository.ts:76-81` no encaja del todo con R3.**
  - El comando de arranque rechaza crear el superadmin si el email o la cédula los usa cualquier
    cuenta, también una de empresa. R3 dice que la cuenta de plataforma PUEDE coincidir con una de
    empresa.
  - En la práctica el superadmin se crea primero, con la base vacía. El caso real (un superadmin que
    después es maestro) entra por el alta y funciona.
  - Aun así, es la única vía que crea una cuenta de plataforma, y contradice R3. Opciones: acotar el
    `findFirst` a `organizacionId: null`, o anotarlo como deuda o como decisión. No está en el diff.
- **m4 (menor), `progress/features/SL-18.md` desactualizado.**
  - `Estado` (l.13) sigue diciendo «siguiente, Tanda 7».
  - En `Tandas` falta la línea de la Tanda 7.
  - En `Preguntas abiertas` (l.51) sigue la de design §7, que ya está resuelta.
  - Es del leader.
- **m5 (menor), textos de error del alta sin camino en la UI.**
  - `TEXTO.errorEmail` y `errorDocumento` desaparecen del E2E, pero la traducción de P2002 de
    email/documento en `OrganizacionRepository.campoDuplicado` y sus mensajes de UI siguen como
    defensa.
  - Es razonable, porque una empresa nueva está vacía. Conviene que SLT-41 o una deuda lo sepa, para
    no mantener mensajes muertos.
- **m6 (aviso, no hallazgo), riesgo en el CI.** `cohorte-carga-indices.int.test.ts` sale del baseline.
  Si en CI el volumen sembrado no basta para que el plan elija `orden_created_at_idx`, saldrá como un
  rojo nuevo en `gate-completo`. Lo verá el CI del PR.
- **Abierto por decisión humana, no es hallazgo.** T7.3: el E2E no se ha ejecutado. El PR no se
  mergea hasta que `login-varias-empresas`, `auth`, `superadmin-empresas` y `dos-empresas-humo` pasen,
  y hasta que T8.1 y `gate-completo` estén en verde.

## Veredicto

**OK.**

No hay bloqueantes. R1–R32 tienen test real. Las migraciones son reversibles y el `down.sql` de M1
aborta sin cambiar nada. La autorización es correcta en login, recuperación y push. Ni secretos ni
dependencias nuevas.

El merge sigue condicionado a lo que el humano ya decidió: T7.3 (E2E en verde), T8.1 (`./init.sh`) y
`gate-completo`.
