# SL-23 ajuste — Recolección, Bodegas satélite, API e integraciones, WhatsApp y Wallet al núcleo (sin SDD)

Decisiones del humano del 2026-10-27 (Recolección + Satélite; luego API; luego WhatsApp) y del
2026-10-28 (Wallet). Rama `feature/SL-23-nucleo-recoleccion-satelite` (d289252 y 7085171, PR #27).
La ampliación de Wallet va sin commit: lo hace el leader.
Quedan 3 apagables: analitica, monitoreo, ranking.

## Corrección: migración de Wallet aparte (2026-10-28)
El PR #27 se mergeó a dev con `20261027120000_modulos_nucleo` en su versión de 7085171 (4 apagables).
El commit cc985d5 la había editado para quitar `wallet`, y eso rompe el checksum de Prisma en todo
entorno que ya la aplicó. Se corrige así:
- **Migración ya mergeada:** `db/migrations/20261027120000_modulos_nucleo/{migration.sql,down.sql}` vuelve a
  la versión de origin/dev (`git checkout origin/dev -- …`). `git diff origin/dev` sobre la carpeta queda
  vacío: idéntica byte a byte.
- **Migración nueva:** `db/migrations/20261028120000_modulo_wallet_nucleo/{migration.sql,down.sql}`.
  - Ida: borra las filas `wallet` y recrea `modulo_apagable` con 3 claves (rename, create, ALTER COLUMN
    … USING ::text, drop). La política, los grants, el trigger y la FK no dependen del tipo; el índice
    único lo reconstruye el ALTER. No toca historial ni `jobs.last_error`.
  - Down: recrea el enum con las 4 claves de 20261027120000 y enciende `wallet` para todas las
    empresas.
- **`db/schema.prisma`:** el enum ya tenía 3 claves (analitica, monitoreo, ranking). Su comentario,
  `catalogo.ts` y `docs/architecture.md` nombran ahora las dos migraciones.
- **Tests de ida y vuelta:**
  - `migracion-sl23-nucleo-ida-y-vuelta.test.ts` vuelve a la versión de origin/dev: prueba
    20261027120000 tal como está mergeada (8 → 4 claves).
  - Nuevo `migracion-sl23-wallet-ida-y-vuelta.test.ts` para 20261028120000, en base propia
    `sl23w_iv_*`. Aplica todo hasta 20261027120000 y prueba: 4 → 3 claves; la tabla conserva RLS,
    política, grants, trigger, índices y restricciones; `wallet` se rechaza con 22P02; el historial y el job
    que la nombran no se tocan; el down devuelve 4 claves con wallet encendido; la reaplicación es idéntica.
  - Ninguna guardia valida nombres concretos de migraciones. Las que leen la carpeta lo hacen de forma
    genérica y pasan.
- **Verificación:**
  - Typecheck (8 GB): **exit 0**. eslint en los archivos tocados: **0 problemas**.
  - vitest con Postgres real (`tests/guards`, `tests/unit/guards`, `tests/unit/modulos`, las tres
    pruebas de ida y vuelta de SL-23, organizacion-modulo, modulo-apagado-action y
    para-cada-empresa-modulo): `3306 passed | 7 failed`.
    - Las tres pruebas de ida y vuelta (sl23, sl23-nucleo, sl23-wallet) están todas en verde.
    - Rojos: `dependencias-declaradas-presentes` (4, baseline), y 3 guardias de barrido de archivos que
      agotaron sus 20 s bajo carga (`tarifa-status-retirado`, `catalogo-postgres-acota-esquema` y
      `otp-debug-solo-en-pruebas`). Sueltas pasan 26/26.

## Ampliación Wallet (2026-10-28)
- **Migración:** SUSTITUIDO por la corrección de arriba. Esta ampliación editaba `20261027120000_modulos_nucleo`,
  y ahora va en `20261028120000_modulo_wallet_nucleo`. `schema.prisma` queda con el enum de 3.
- **Catálogo:** «Wallet» entra en NUCLEO (13 nombres) con la fecha 2026-10-28.
- **Reparto:** las 8 rutas de wallet y mi-wallet, las 18 actions y el cron `generar-gastos-fijos` pasan a
  núcleo. `premio-ranking-devengo` deja de ser pieza compartida y queda en `"ranking"`.
  `PremiosRankingPanel` (anfitriona `/wallet/mensajeros`, ahora núcleo) se declara con `"ranking"`.
  `cargar-kpis.ts` sale de `CONSUMOS_ENTRE_MODULOS` (Wallet ya no es módulo).
- **Puertas fuera:** comprobé antes que cada diff de SL-23 era solo puerta, traductor FORBIDDEN,
  `rechazoDeModulo` o `modulo` del cron.
  - Devueltos a e50ae78 (26 archivos): 7 páginas de wallet, `generar-gastos-fijos/route.ts` y 18 actions de wallet.
  - Editados a mano: `premio-ranking-devengo.ts` (exige solo `ranking`) y `wallet/mensajeros/page.tsx`
    (sin puerta de ruta; conserva `moduloActivo("ranking")` para la pestaña de premios).
- **Menú:** fuera los 2 `modulo: "wallet"`; quedan analitica, monitoreo y ranking.
- **Guardia `modulos-reparto`:**
  - Conteos: 4 páginas y 17 actions de módulo.
  - R33: hoy ninguna pieza es compartida (`{}`).
  - No-vacío de (e): mide el cruce real `wallet/mensajeros/…/PremiosRankingPanel.tsx →
    lib/actions/premio-ranking-devengo` (núcleo → Ranking) y que declarado queda limpio.
  - Árbol inventado y casos directos: pasan a Analítica (`analitica-operativa`) en vez de wallet; un
    caso nuevo comprueba que llamar a `wallet` desde Analítica ya no es cruce.
  - Las fuentes sintéticas de las puertas usan `monitoreo`.
- **Tests:**
  - `wallet` como módulo genérico pasa a `monitoreo`, `analitica` o `ranking` en catalogo,
    exigir-modulo, para-cada-empresa-modulo (unit e integración), modulos-empresa-service
    (wallet y whatsapp, rechazados como clave), ModulosEmpresa, plataforma-empresa-detalle-page
    (3 interruptores, NUCLEO de 13), organizacion-modulo, menu-modulos (/wallet y /mi-wallet ahora
    núcleo), CierresAdminPage y nucleo-sin-modulos.
  - **modulo-apagado-action:** el caso «Wallet apagado → forbidden» pasa a «Wallet es núcleo: con todo
    apagado, la caja se lee (ok)». Se quita el caso del `toActionError` compartido porque ya no queda
    ninguna action con puerta en ese camino (lo usaban WhatsApp y Wallet); queda dicho en la cabecera.
  - **Migración de ida y vuelta:** 3 claves después, y `wallet` rechazada con 22P02.
- **Docs:** `docs/architecture.md` (3 apagables) y los comentarios de ModulosEmpresa.tsx,
  IModulosEmpresaService.ts, e2e/dos-empresas-humo.spec.ts y CierresAdminPage.test.tsx.
- **Verificación Wallet:**
  - **Typecheck** (8 GB): **exit 0**, también después de los últimos arreglos.
  - **eslint** en los 48 archivos tocados: **0 problemas**.
  - **vitest con la base real:** guardias, `tests/unit`, `tests/components`, las 8 páginas de wallet y 38
    archivos de integración de módulos, migraciones y wallet. Resultado: `Tests 44 failed | 30948
    passed`, en 24 archivos.
  - **Nuestros (5 tests, en 3 archivos), arreglados:**
    - `crons-sin-empresas` y `dos-empresas-entradas` esperaban `saltadas` en el cron
      `generar-gastos-fijos`, que ya no filtra por módulo; vuelven a la forma de antes de SL-23.
    - En `menu-modulos`, «Caja principal» repite el href `/wallet` (10 ítems, no 9).
    - Al rerun salen 8/8 archivos y 158/158 tests verdes, junto con la guardia, la ida y vuelta,
      modulo-apagado-action y organizacion-modulo.
  - **Ajenos al cambio:** se probaron los mismos 18 archivos rojos de wallet/integración en HEAD 7085171,
    con los cambios guardados en un stash temporal ya restaurado. Fallan igual: 17 archivos, 31 tests.
    Las causas son de la base local:
    - «faltan la zona central, el tipo `cedula` o una orden» (×8), «tabla `orden` esta vacia» y «base
      sin sembrar»: la base local de desarrollo no tiene la siembra que piden esas suites.
    - «la base ya tiene un superadmin»: superadmin sembrado (modulo-apagado-datos-intactos,
      modulos-empresa-historial).
    - Catálogos de `wallet-458/461-migration` y 23503 frente a 23001: base local con datos de demo-qa.
  - **Flakes bajo carga:** `WalletCajaBarra467` es el único que pasa en HEAD y falló en el lote; suelto, con
    los cambios, pasa. `DescargarDataset`: ya conocido.
  - **Ya conocidos:** `whatsapp-webhook-config` (el `.env` local fija v25.0) y `dependencias-declaradas-presentes`
    (en el baseline).

---
Historia de los pasos anteriores (2026-10-27):

## Migración
- `db/migrations/20261027120000_modulos_nucleo/{migration.sql,down.sql}`, una sola migración, ampliada en
  cada paso; todavía no está en dev.
- **Ida:** borra las filas de las 4 claves, renombra el tipo, crea `modulo_apagable` con 4 claves, hace
  el ALTER COLUMN … USING ::text y borra el tipo viejo.
  - La política, los grants, el trigger y la FK no dependen del tipo; el índice único lo reconstruye el
    ALTER.
  - No toca `historial_accion` (texto en `valor_*`) ni `jobs.last_error`.
- **Down:** recrea las 8 claves en su orden (sin ADD VALUE, por 55P04) y vuelve a encender las 4 para
  todas las empresas.
- **Test:** `tests/integration/db/migracion-sl23-nucleo-ida-y-vuelta.test.ts`.

## Código
- `db/schema.prisma` (enum de 4).
- `lib/modulos/catalogo.ts`: NUCLEO suma Recolección, Bodegas satélite, API e integraciones y WhatsApp.
- `lib/modulos/reparto.ts`: pasan a `"nucleo"` todas las piezas de los 4 módulos.
  - Rutas, actions, los 8 jobs `whatsapp_*`, los webhooks, el cron `sync-plantillas-whatsapp` y la API
    `chat/media` + `webhooks/whatsapp`.
  - `ordenes/api-key/analitica` queda en `"analitica"`.
  - `CONSUMOS_ENTRE_MODULOS` pierde las 3 piezas de WhatsApp (ChatFlotante, ChatConversacion,
    EnviarPlantillaWhatsappButton).
- **WhatsApp, puertas y flags fuera:** los 27 archivos que SL-23 tocó solo para eso se devolvieron a su
  versión anterior a SL-23 (`git checkout e50ae78 -- …`). Se comprobó antes que cada diff era solo
  la puerta o el flag `whatsappActivo`.
  - Páginas: plantillas, envios-whatsapp (4), historico/conversaciones, mis-asignaciones/{reparto,
    recoger}, novedades.
  - Componentes: RepartoModule, GestionarOrdenPanel, NovedadAcciones, NovedadesModule, NovedadesTabs.
  - Actions: chat-whatsapp, envios-whatsapp, historico-conversaciones, informe-picking,
    informe-transito, plantillas, plantillas-sync, whatsapp-envio.
  - `app/api/chat/media`, `app/api/cron/sync-plantillas-whatsapp`, `WebhookWhatsappService`, y los
    tipos `chat-whatsapp` y `whatsapp-envio`.
- **API (paso anterior):** sin puertas en configuracion/api, api-keys, webhooks y `conEmpresaDeLaKey`.
  Recolección y Satélite: sin puertas en sus 5 páginas y 3 actions.
- `lib/auth/menu-visibility.ts`: solo quedan `modulo:` de analitica, monitoreo, ranking y wallet (×2).
- **Docs/textos:** `docs/architecture.md` (4 apagables; se quita «el webhook de WhatsApp responde 200
  sin procesar»), y los comentarios de ModulosEmpresa.tsx, IModulosEmpresaService.ts,
  e2e/dos-empresas-humo.spec.ts y CierresAdminPage.test.tsx.

## Tests
- **Devueltos a su versión anterior a SL-23** (solo probaban el flag o la puerta de WhatsApp): 18 tests de
  componentes de reparto y novedades, más menu-historico, menu-visibility y
  menu-visibility-envios-whatsapp.
- **Borrado:** `tests/unit/services/webhook-whatsapp-service-modulo.test.ts`, que probaba la puerta
  retirada.
- **Reescritos** con otro módulo (ranking, monitoreo, analitica o wallet):
  - Catálogo y empresas: catalogo, modulos-empresa-service, ModulosEmpresa,
    plataforma-empresa-detalle-page (4 switches, NUCLEO de 12), modulos-empresa.composition-root,
    modulos-empresa-historial, organizacion-modulo.
  - modulo-apagado-action: el caso del toActionError compartido usa `previsualizarMovimientoAction` (wallet).
  - Jobs: job-queue-service-descartado usa jobs de analítica. En procesar-jobs-modulos hoy ningún job
    exige módulo; el descarte se ejerce pasando `ranking` explícito a `conSuEmpresa`.
  - menu-modulos: la poda de subítems se mide sobre un desplegable armado, y un caso comprueba que
    los ítems de los 4 módulos ya son núcleo.
- **Guardia `modulos-reparto`:** 12 páginas y 35 actions de módulo. El no-vacío de (e) pasa a medir el
  cruce real `analitica/cargar-kpis.ts → lib/actions/wallet`. El recorrido transitivo ya lo cubre el
  árbol inventado.

## Verificación (ampliación WhatsApp)
- **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`, con el tsconfig que ya
  excluye los worktrees: **exit 0**.
- **eslint** en los archivos tocados: 0 errores. Quedan 2 warnings `no-unused-vars` que ya existían antes de
  esta ampliación (GestionarOrdenPanel igual a e50ae78; RepartoModule.test igual a HEAD).
- **vitest con la base real**: guardias, `tests/unit`, `tests/components`, la integración de módulos y las
  dos migraciones de ida y vuelta. Resultado: `Test Files 6 failed | 2102 passed (2108)`,
  `Tests 10 failed | 31004 passed`. Después se arreglaron los rojos propios:
  - **Propio, arreglado:** `crons-sin-empresas` (3) y `whatsapp-sin-integracion` (1) esperaban `saltadas`,
    pero el cron de plantillas ya no filtra por módulo. Devueltos a su forma anterior a SL-23: 51/51
    verdes.
  - **Baseline:** `dependencias-declaradas-presentes` (4), que ya está en `tests/baseline-rojos.json`.
  - **Entorno local, no del cambio:**
    - `whatsapp-webhook-config`: el `.env` local fija `apiVersion` v25.0 y el test espera v21.0. Sin
      `.env`, verde.
    - `DescargarDataset`: rojo solo bajo carga; suelto, 19/19 verde.
    - `modulos-empresa-historial`: «la base ya tiene un superadmin que no es de este test (SL-32
      R27)». La base local de desarrollo tiene un superadmin sembrado; en CI la base es limpia.
- **Integración de la migración:** `migracion-sl23-nucleo-ida-y-vuelta` y `organizacion-modulo` verdes
  contra Postgres, dentro de la corrida de arriba.

## Rojos de CI del PR #27 (run 40603065789, commit d289252)
- **`tests/integration/plataforma-empresa-detalle-page.test.tsx`: PROPIO, arreglado.** En d289252
  el test seguía esperando 8 interruptores: «expected [ …(5) ] to have a length of 8 but got 5». Ahora
  espera 4 interruptores y un NUCLEO de 12, y pasa en local. En un worktree temporal de origin/dev
  pasa con su versión (8 y 8).
- **`tests/integration/db/analitica-operativa-indices.test.ts`: DEUDA DE DEV, no del ajuste.**
  - **Línea decisiva:** «AssertionError: el plan no nombra gestion_orden_organizacion_id_created_at_idx:
    Index Scan using gestion_orden_organizacion_id_idx on gestion_orden g … Filter: (… created_at >= …)».
    El planificador eligió el índice simple de SL-17 en vez del compuesto de SL-18; los dos tienen un
    coste de ≈8.16, así que gana uno u otro según los datos del shard.
  - **Evidencia:** la rama no toca el test, la migración 20261026090200 ni
    `AnaliticaOperativaVivaRepository` respecto de origin/dev (diff vacío). El mismo archivo sale rojo
    en el CI de SL-20 (runs 40598912536 y 40600847590), una rama que contiene origin/dev y no tiene
    20261027120000. En local pasa igual en origin/dev (worktree temporal, ya borrado) que en esta rama
    (7/7).
  - **Ya está diagnosticado:** SL-20 lo arregla en su rama (`DROP INDEX
    "gestion_orden_organizacion_id_idx"` dentro de la transacción revertida del test, «decision de
    Camilo, 2026-10-27»). No se añadió al baseline: decide el humano (esperar al merge de SL-20 o
    baseline).

## Sin verificar / bloqueos
- `./init.sh` completo: no se relanzó en esta ampliación. El `.env` sigue con el `$3` sin comillas en
  la línea 124 (lo arregla el humano).
- El rojo de `analitica-operativa-indices` seguirá en el CI de este PR hasta que entre el arreglo de
  SL-20 o el humano lo pase al baseline.
- E2E `dos-empresas-humo`: no se corrió (solo cambiaron textos).
