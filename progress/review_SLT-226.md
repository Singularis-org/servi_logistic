# review SLT-226 «Cobro automático: modelo del cobro e idempotencia»

Vuelta 1, completa. Ruta completa con enmienda (R30–R39, design §12). Rama
`feature/SLT-226-cobro-auto-modelo-idempotencia`, PR #263, HEAD `a9eff28b` (al día con `origin/dev`:
`git log HEAD..origin/dev` vacío). Revisado el 2026-11-20.

Esta revisión reemplaza la vuelta anterior, que se cortó sin terminar.

## Qué corrí (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint` sobre los archivos de producción y de tests del diff: exit 0.
- `vitest run` de `cobro-intento-service`, `libro-caja-autoria-plataforma`, `detalle-movimiento-panel-labels-plataforma`,
  `rls-por-empresa.guardia` y `verificar-rls-despliegue`: `Test Files 5 passed (5)`, `Tests 89 passed (89)`.
- `node scripts/tamano-pr.mjs`: AVISO, 33/40 archivos, 1968/1000 de producción y 3112/3000 de tests, con el
  marcador `tamano-pr-aceptado` en `progress/features/SLT-226.md`.
- Los tests de integración contra la base NO los corrí en local: no tengo la URL de la base de la feature, y
  buscarla se me denegó (exploración de credenciales). Los comprobé en los logs del CI de #263 sobre `a9eff28b`:
  - `cobro-intento` (25), `cobro-pago-en-linea` (20), `cobro-webhook-evento` (8), `migracion-slt226-ida-y-vuelta` (7)
    y `cobro-intento-service` (45) salen en verde y sin saltos;
  - SLT-60, SLT-143 y SL-45 (`pago-plataforma-confirmacion`, `-por-fuera`, `-sl45`, `-sl45-blindaje` y
    `-sl45-concurrencia`) salen en verde;
  - los únicos rojos de los tres shards son `abono-tienda-457-migration`, `cobro-tienda-461-migration` y
    `wallet-461-migration`. Los tres están en `tests/baseline-rojos.json`, así que no son hallazgos.
- `gh pr checks 263`: todo en verde, también `gate-completo` y los E2E `aislamiento`, `dinero` y `reparto`.
- El MCP del grafo no lo usé: revisé con Read y Grep sobre el diff.

## Checklist

### Ruta y especificación
- [x] Ruta completa. Toca dinero, esquema e idempotencia, y la complejidad es `high`: es el suelo correcto.
- [x] `requirements.md` con R1–R39 en EARS y la tabla de decisiones cerradas.
- [x] `design.md` abre con `## Lo que ya existe`, y la enmienda trae el suyo (§12.0). El diff no re-crea nada de lo
      listado: reutiliza el candado `pago_plataforma:<org>`, `_pago_plataforma_aplicar` (con una sobrecarga, sin
      copiar el cuerpo) y la marca de SLT-143.
- [x] Alternativas descartadas: §9 y §12.2.
- [x] `tasks.md`: 53 tasks, todas `[x]`.

### Tamaño y equipo
- [x] Pasa del tope, pero lleva el marcador con las dos aceptaciones del humano (P5 y la enmienda).
- [x] Tiene assignee y la rama nació con el candado (`ece3d1ca chore(SLT-226): feature tomada`).

### Trazabilidad
- [x] `progress/impl_SLT-226.md` trae el mapa `R<n> → test` de R1–R39.
- [ ] **R27 no tiene un test que falle sin el código** del repositorio (hallazgo 1).
- [x] Los otros 38 requisitos tienen tests que afirman el comportamiento. Las mutaciones declaradas (1–10) los
      ponen en rojo según la bitácora. Comprobé en el código las que importan para el dinero:
      - la 4: el intento pasa a `aprobado` antes de escribir la aplicación;
      - la 8: el paso 0 de `cobro_registrar_pago_aprobado`;
      - la 9: el candado en `cobro_marcar_pagado_manual`.

### Idempotencia en 3 capas
- [x] **Capa 1:**
  - el único parcial `cobro_intento_un_vivo_por_factura` es `(organizacion_id, factura_id) WHERE estado IN
    ('creado','pendiente')`;
  - la clave es `factura|saldo|moneda||proveedor|metodo`, con la tasa vacía (§12.3);
  - el candado de la empresa y el `FOR UPDATE` de la factura y del vivo serializan los pedidos;
  - lo prueban R2, R3, R4 (a la vez y con un `INSERT` del dueño que da 23505) y R32.
- [x] **Capa 2:** el único `(proveedor, log_id)` en `cobro_webhook_evento`, con `ON CONFLICT DO NOTHING`; el
      resultado `repetido` o `pendiente` sale de `procesado_at`.
- [x] **Capa 3:** el único global `(proveedor, pago_proveedor_id)` y el paso 0 sin candado (seguro porque la columna
      solo pasa de vacío a un valor). Después van el candado `pago_plataforma:<org>`, el `FOR UPDATE` de la factura,
      la segunda comprobación dentro del candado y el `FOR UPDATE` del intento. La clave
      `cobro:<proveedor>:<id>` del libro es una red más.

### Marca manual
- [x] `cobro_marcar_pagado_manual` y `cobro_registrar_pago_aprobado` comparten `_cobro_aprobar`, sin copiar el
      cuerpo.
- [x] El aviso posterior responde `ya_registrado` por el paso 0, también sin `id_externo`. Lo prueba R37, sin id
      externo, con id nulo y con él.
- [x] Solo el superadmin la usa:
  - el servicio devuelve `forbidden` con `!esPlataforma` antes de validar o de llamar al repositorio, y
    `ROLES_PLATAFORMA = ["superadmin"]`;
  - la función es `SECURITY DEFINER`, con `REVOKE … FROM PUBLIC` y sin `GRANT`;
  - como `servi_app`, ejecutarla da 42501 (test R39).
- [x] Queda el actor en el historial: cada paso lleva al superadmin y `"manual": true`, y la confirmación lleva
      `confirmado_por` (tests R35 y R36). «Registró» no muestra su nombre: `por: null`.

### Concurrencia y deadlocks
- [x] **El cruce de la mutación 9 (40P01) no queda en el código final.** Todas las funciones públicas del cobro
      toman primero `pg_advisory_xact_lock('pago_plataforma:<org>')`:
      - `obtener_o_crear`, `registrar_enlace`, `avanzar`, `registrar_pago_aprobado` y `marcar_pagado_manual`;
      - antes del candado solo hay `SELECT` sin bloqueo para resolver la empresa;
      - después van, siempre en el mismo orden, la factura (`FOR UPDATE`) y el intento (`FOR UPDATE`).
- [x] Los triggers sobre `wallet_movimiento` vuelven a pedir el mismo candado, y el candado es reentrante.
- [x] El trigger `cobro_intento_anular_por_saldo` hace `FOR UPDATE` de intentos dentro de `pago_plataforma_confirmar`,
      `_registrar_por_fuera` y `_anular_confirmado`, que toman ese candado lo primero (20261116120000:241,
      20261121130000:187/228/274).
- [x] Lo cubren dos tests de dos conexiones con `aLaVezConCandado`: R20 (aviso contra aviso) y R37 (marca contra
      aviso). Los dos están en verde en el CI.

### Dinero
- [x] Un solo «Pago a la plataforma»:
  - `egreso_pago_plataforma` por `monto_local`, con «Pagado en línea · <id>» y `registrado_por` nulo;
  - confirmación `en_linea` y una aplicación entera a la factura;
  - el tope lo deja pasar solo si hay un intento `aprobado` con ese `pago_id`, que `servi_app` no puede fabricar
    (REVOKE).
- [x] Sin regresiones en SLT-60, SLT-143 ni SL-45:
  - `_pago_plataforma_aplicar` de 7 argumentos delega con `p_en_linea = false`;
  - el CHECK `confirmado_por IS NOT NULL OR en_linea` mantiene la persona en SLT-60 y SLT-143;
  - sus suites siguen en verde en el CI sin cambiar afirmaciones.

### RLS y seguridad
- [x] `cobro_intento`:
  - es de negocio, con `organizacion_id`, RLS por empresa y `REVOKE INSERT, UPDATE, DELETE` a `servi_app`;
  - tiene los triggers SL-17 generados;
  - lo leen el maestro y el admin (`esAccesoTotal`) y el superadmin.
- [x] `cobro_webhook_evento`: es de plataforma, con RLS sin política y `REVOKE ALL`; está registrada en
      `modelos-de-negocio` y en `_unicos-sin-empresa`.
- [x] R34 y R12:
  - no se guarda el cuerpo del evento ni ningún dato de tarjeta, ni en el intento ni en el evento;
  - el test R34 fija la lista exacta de columnas;
  - el mensaje de error de la consulta no lleva datos del pago.
- [x] No hay literales de país ni de moneda en el código de producción: la moneda sale de `monedaConfig`. Hay `CRC`
      solo en los datos de los tests unitarios.
- [x] No hay ningún recurso de Ordenex ni dependencias nuevas.

### Migraciones
- [x] `20261124140000_cobro_historial_enum` y `20261124140100_cobro_intento` van detrás de
      `20261124130000_orden_historial_origen_retorno_rechazo_cierre`, la mayor de `dev`.
- [x] Cada una trae su `down.sql`, y van en orden inverso:
  - la guarda aborta si hay intentos;
  - repone literal el tope y `_pago_plataforma_aplicar`;
  - quita las firmas de §12.5 y devuelve el `NOT NULL`.
- [x] La ida y vuelta (`migracion-slt226-ida-y-vuelta`, 7 tests) está en verde en el CI.
- [x] La enmienda edita `20261124140100` en el sitio. Es legítimo porque `dev` no la tiene (§12.9), y la base de la
      feature se rehízo.

### Calidad y gate
- [x] Typecheck y lint en verde, y `gate-completo` en verde en el CI.
- [~] `./init.sh` local se corta en la validación del board (hallazgo 4).
- [~] E2E en local: solo hay constancia de antes de la enmienda (hallazgo 3).
- [x] Los comentarios explican el porqué: el orden de bloqueo, la FK diferida y por qué se lee sin candado.

### Desvíos declarados en la bitácora
- [x] `FUNCIONES_NUEVAS` suma `_cobro_aprobar` y `cobro_marcar_pagado_manual`, `metodo` en dos INSERT, la empresa E
      y los tests extra del servicio. Todos son razonables: refuerzan lo que el spec pide y no cambian decisiones.
- [x] El caso «`creado` con id externo» de R14 se siembra a mano, y queda anotado para SLT-230.

## Hallazgos

1. **BLOQUEANTE: R27 y el checkpoint «toda query nueva de negocio con test de integración con dos empresas».**
   - `CobroIntentoRepository.intentosDeFactura` no lo ejercita ningún test de integración. Los tests de R27 son
     unitarios con un repositorio doble: solo comprueban que el servicio elige el alcance. El test R26 lee con SQL
     crudo y no pasa por el repositorio.
   - Dos mutaciones sobreviven a toda la suite:
     - (a) correr la rama `empresa` con `comoPlataforma` y sin el filtro `organizacionId`: un maestro de A vería los
       intentos de B;
     - (b) cambiar `orderBy createdAt desc` por `asc`: R27 pide «del más nuevo al más viejo».
   - **Qué falta:** un test en `tests/integration/db/cobro-intento.test.ts` que llame al
     `CobroIntentoRepository` real:
     - con `{ tipo: "empresa", organizacionId: A }` sobre una factura de A con al menos dos intentos, afirmando el
       orden más nuevo primero;
     - con A sobre la factura de B, afirmando `[]`;
     - con `{ tipo: "plataforma" }` sobre la de B, afirmando que la ve.

   Añadirlo al mapa de R27 en la bitácora.
2. **menor: el evento queda cerrado sin `intento_id` cuando el paso 0 corta por la marca a mano.**
   - Con `ya_registrado` por el paso 0, `registrarPagoAprobado` busca el intento por `(proveedor, idExterno)`. Si el
     intento marcado a mano no tiene `id_externo` (la transferencia de Global66), el evento se cierra `aplicado` con
     `intento_id` nulo.
   - No cuenta doble ni rompe R12 ni R37, pero pierde el enlace del evento con su intento.
   - Se podría buscar por `(proveedor, pago_proveedor_id)` cuando el resultado es `ya_registrado`. Si no se arregla
     aquí, conviene anotarlo para SLT-228 «Cobro automático: webhook por proveedor y el de Rebill».
3. **menor: los E2E en local tras la enmienda.**
   - El grupo `dinero` se corrió en local antes de la enmienda (132 en verde, dos veces) y no después. La bitácora lo
     justifica porque la enmienda no toca UI.
   - `dos-empresas-humo` (el diff toca `lib/db/`) solo consta en el CI.
   - No bloquea: los tres proyectos E2E están en verde en el CI sobre el SHA final, y la enmienda no tiene pantalla.
     Que conste para la próxima: la regla pide constancia local.
4. **menor: `./init.sh` local no termina en verde.** Se corta en la validación del board por el exceso de cupo que
   aceptó el humano y por los specs que faltan de SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de reenviarlo».
   No es del código de esta ficha, y cada paso del rápido se corrió a mano en verde. Lo resuelve el leader en el
   board.
5. **menor (informativo): la marca y el aviso sin `id_externo`, a la vez.** El aviso responde `sin_intento` y su
   evento queda cerrado. Un reenvío con el mismo `logId` sale `repetido`, así que el «reintento posterior responde
   `ya_registrado`» de §12.4 solo vale con un `logId` nuevo. No cuenta doble: es el riesgo aceptado en §12.4. Que lo
   recoja la conciliación de SLT-233 «Cobro automático: conciliación, devoluciones y contracargos».

## Veredicto

**RECHAZADO.** Hay un bloqueante (hallazgo 1): falta el test de integración del repositorio de R27, con dos
empresas, el orden y la lectura del superadmin. El resto está bien: la idempotencia en 3 capas, la marca manual, el
orden de bloqueo sin deadlocks, el dinero, la RLS y las migraciones. Arreglado el hallazgo 1, la vuelta 2 puede
acotarse a ese diff.

## Vuelta 2 (acotada a a9eff28b..536ea04b)

Revisado el 2026-11-21. El commit `536ea04b` toca solo `tests/integration/db/cobro-intento.test.ts` (+27) y
`progress/impl_SLT-226.md`. No toca código de producción, ni el spec, ni el esquema, así que no hay regresiones
posibles fuera del test.

### Hallazgo 1 (BLOQUEANTE, R27): resuelto
- El test nuevo «R27: el repositorio real da a la empresa los intentos de su factura del más nuevo al más viejo, []
  con la factura de otra empresa, y al superadmin la de cualquiera» usa `new CobroIntentoRepository(ctx.app)`. Es el
  repositorio real sobre el cliente envuelto con `conAislamientoPorEmpresa`, como en producción.
- Afirma tres cosas:
  - A lee los intentos de A1, el mismo conjunto que la verdad de la base, con al menos 2 intentos;
  - los lee del más nuevo al más viejo, con horas distintas (`horas[0] > horas[último]`), así que el orden se mide
    de verdad;
  - A sobre B1 recibe `[]`, y el superadmin sobre B1 recibe `[b1]`.
- Lo leí contra las dos mutaciones del hallazgo:
  - (a) la rama `empresa` con `comoPlataforma` y sin filtro devolvería `b1` en lugar de `[]`: rojo;
  - (b) con `asc`, las horas saldrían crecientes: rojo.

  La bitácora lo confirma con la salida real: `1 failed | 25 passed (26)` en cada mutación, y luego revertidas.
- El mapa `R<n> → test` de R27 en `progress/impl_SLT-226.md` lleva el test nuevo.
- Verificado por mí:
  - `eslint tests/integration/db/cobro-intento.test.ts`: exit 0, con el worktree en `536ea04b`;
  - CI de #263 sobre `536ea04b`: todo en verde, `gate-completo` incluido;
  - en los logs de los shards, `cobro-intento.test.ts (26 tests)` en verde;
  - los únicos rojos son los tres de `tests/baseline-rojos.json` (`abono-tienda-457-migration`,
    `cobro-tienda-461-migration` y `wallet-461-migration`).

### Menores de la vuelta 1
- 2 y 5: anotados en la bitácora como frontera con SLT-228 «Cobro automático: webhook por proveedor y el de Rebill»
  y SLT-233 «Cobro automático: conciliación, devoluciones y contracargos». Siguen abiertos como menores y no
  bloquean. Conviene que sus specs los recojan.
- 3 y 4: sin acción y sin cambios; siguen como menores informativos.

### Hallazgos nuevos
Ninguno.

### Veredicto de la vuelta 2

**OK.** No queda ningún bloqueante. Quedan abiertos los menores 2, 3, 4 y 5, ninguno bloqueante.
