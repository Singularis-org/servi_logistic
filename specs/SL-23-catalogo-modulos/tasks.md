# SL-23 — catalogo-modulos · tasks.md

> Requisitos R1–R34 en `requirements.md`; el cómo, en `design.md`. El reparto de `design.md > §3`
> lo aprobó el humano el 2026-10-26, con los cierres en el núcleo y el módulo «Wallet» (`wallet`).
>
> **Reapertura del 2026-10-26 (durante la implementación).** El humano pasó «Incidentes y
> novedades» al núcleo (quedan 8 módulos) y fijó que sin empresa la puerta no aplica (R34). Se
> reabren T1, T3, T4 y T5, ya commiteadas, con el ajuste marcado «Ajuste 2026-10-26» en cada una.
> Van antes de T6–T11.
>
> `[P]` = puede ir en paralelo con las otras `[P]` de su tanda. Cada task cierra con
> `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <archivos tocados>` en
> verde, y un commit `feat(SL-23): …` / `test(SL-23): …`.

## Tanda 0 — Preparación

- [x] **T0 — Orden de migraciones y base de pruebas.**
  - Comprobar contra `origin/dev` que `20261025160100_entorno_marca` sigue siendo la última
    migración. Si no lo es, renumerar las tres de T1 antes de aplicarlas en ninguna base
    compartida.
  - Exportar `DATABASE_URL` a una base local propia (`docs/verification.md`).
  - *Hecho:* la nota del orden está en `progress/impl_SL-23.md`.

## Tanda 1 — Datos (depende de T0)

- [x] **T1 — Migraciones y esquema** (design §4, §9; R4, R5, R7, R20, R27). *Reabierta.*
  - **Ajuste 2026-10-26.** Quitar `incidentes_novedades` del `CREATE TYPE modulo_apagable` **en
    sitio**, en `20261026120000_organizacion_modulo/migration.sql`, y del `enum ModuloApagable` de
    `db/schema.prisma`. No se crea migración nueva: la migración no está mergeada. Hay que resetear
    la base local (`logistic_sl23`) donde ya se aplicó, porque cambia su checksum. El backfill da
    8 filas por empresa en `migracion-sl23-ida-y-vuelta.test.ts`.
  - Las tres carpetas, cada una con su `migration.sql` y su `down.sql`.
  - `db/schema.prisma`: `OrganizacionModulo`, `ModuloApagable`, `Organizacion.modulos`,
    `JobEstado.descartado`, y los dos `HistorialAccionTipo` y el `HistorialAccionEntidad` nuevos.
  - `lib/db/modelos-de-negocio.ts` gana `OrganizacionModulo`.
  - *Hecho:*
    - `prisma migrate deploy` y el diff de drift salen vacíos;
    - `migracion-sl23-ida-y-vuelta.test.ts` está en verde: backfill sobre dos empresas previas,
      nombres en español, descarte y vuelta atrás;
    - `organizacion-en-modelos`, `rls-por-empresa` y `fk-misma-empresa` están en verde.
- [x] **T2 — RLS y aislamiento de la tabla** (R4, R6, R7, R25).
  - `tests/integration/db/organizacion-modulo.test.ts`, con dos empresas:
    - cada una ve solo sus filas;
    - `INSERT` y `DELETE` con `servi_app` dan `42501`;
    - un alta por `OrganizacionService` deja cero filas;
    - sin fila, el módulo está apagado.
  - *Hecho:* en verde con `DATABASE_URL`; ningún caso pasa sin datos.

## Tanda 2 — Catálogo, reparto y puertas (depende de T1)

- [x] **T3 [P] — Catálogo y reparto** (design §2, §3, §6.3; R1, R2). *Reabierta.*
  - **Ajuste 2026-10-26.**
    - `catalogo.ts`: sin `incidentes_novedades` en `MODULOS_APAGABLES` ni en `ORDEN_MODULOS`;
      «Incidentes y novedades» va en `NUCLEO` (8 nombres).
    - `reparto.ts`:
      - `/incidentes`, `/novedades` y las actions `incidentes`, `novedades`, `habilitar-novedad`,
        `rechazos-sla-tienda` y `gestion-desde-ayuda` pasan a `"nucleo"`;
      - `liquidacion` y `conciliacion-satelites` también pasan a `"nucleo"` (§3.9);
      - `CONSUMOS_ENTRE_MODULOS` gana `EnviarPlantillaWhatsappButton` (§6.3) y no lleva
        `ReportarIncidenteModal`.
    - `catalogo.test.ts`: 8 claves y 8 nombres de núcleo, e `incidentes_novedades` no existe.
  - `lib/modulos/catalogo.ts` y `lib/modulos/reparto.ts`, con las tablas de §3 tal cual
    (incluidas las compartidas de §3.7 y `CALCULO_CONTINUO` de §3.8) y `CONSUMOS_ENTRE_MODULOS`.
  - `tests/unit/modulos/catalogo.test.ts`: exactamente 8 claves, iguales al enum (con `wallet`,
    sin `wallet_cierres` ni `incidentes_novedades`), y el núcleo con sus 8 nombres (incluye
    «Cierres» e «Incidentes y novedades»).
  - *Hecho:* test en verde; `MODULO_POR_JOB` es un `Record<JobTipo, …>` que compila.
- [x] **T4 [P] — Guardias** (design §8, §3.9; R3, R28). *Reabierta.*
  - **Ajuste 2026-10-26.** El caso (e) sigue los imports de forma transitiva desde
    `app/(app)/<ruta>/**`, a través de `components/**` y `hooks/**`, hasta `lib/actions/*`.
    Al fallar, nombra la cadena. Una entrada de `CONSUMOS_ENTRE_MODULOS` puede nombrar un
    componente de `components/`. Con el reparto nuevo, el único cruce que queda por resolver en T8
    es `EnviarPlantillaWhatsappButton`. `ReportarIncidenteModal` deja de serlo. Mutación nueva: un
    componente de `components/` montado en una ruta del núcleo que importa una action de wallet →
    rojo.
  - `tests/unit/guards/modulos-reparto.guardia.test.ts`, casos (a)–(f), cada uno con su
    fixture que lo pone en rojo.
  - `tests/unit/guards/modulos-sin-seed.guardia.test.ts`.
  - En esta tanda (b)–(f) **fallan a propósito**: se marcan y se ponen en verde al final de T8–T11.
    No se mergea ningún rojo.
  - *Hecho:* (a) y la de seed están en verde, y cada caso tiene su mutación probada.
- [x] **T5 [P] — Puertas de lectura** (design §5.1; R9, R16, R17, R34). *Reabierta.*
  - **Ajuste 2026-10-26 (R34).**
    - `modulosActivos()` captura solo `EmpresaNoResuelta` y devuelve `null`, memorizado en el
      `cache()`.
    - Con `null`, `exigirModuloActivo` y `exigirModuloEnRuta` vuelven sin lanzar y sin
      `notFound()`, y `moduloActivo` da `false`.
    - Casos nuevos en `exigir-modulo.test.ts`:
      - la lectura lanza `EmpresaNoResuelta` → ninguna puerta lanza ni llama a `notFound`;
      - otro error → se propaga;
      - `null` se memoriza (una sola lectura).
  - `ModulosActivosRepository` y su interfaz, `lib/modulos/exigir-modulo.ts` y
    `lib/modulos/modulo-inactivo-error.ts`.
  - `tests/fabricas/modulos.ts > puertasAbiertas()`.
  - `tests/unit/modulos/exigir-modulo.test.ts`:
    - apagado → `notFound` / `ModuloInactivoError` con `details.codigo = "modulo_inactivo"`;
    - encendido → pasa;
    - dos claves (R33): apagada si falta cualquiera; `details.modulo` nombra la apagada;
    - superadmin → conjunto vacío sin consulta;
    - sin memo entre peticiones.
  - *Hecho:* tests en verde.

## Tanda 3 — Escritura del superadmin (depende de T3, T5)

- [x] **T6 — Servicio, repositorio y action** (design §5.2; R9–R13).
  - `EntradaAccion.organizacionId?` en `appendAccion`.
  - `lib/types/modulos-empresa.ts`, `ModulosEmpresaRepository` / `ModulosEmpresaService` con sus
    interfaces, `lib/actions/modulos-empresa.ts` y `lib/actions/_shared/modulos-empresa.ts`.
  - Categoría `cambia_modulos` en `lib/types/historial-accion.ts`.
  - Excepción en `lib/db/excepciones-aislamiento.ts`.
  - Tests:
    - `tests/unit/services/modulos-empresa-service.test.ts`: orden de las comprobaciones,
      `forbidden` para el `maestro` y para todos los roles de empresa, módulo fuera del catálogo,
      empresa inexistente, idempotencia;
    - `tests/integration/db/modulos-empresa-historial.test.ts`: una fila por cambio real, ninguna
      en un repetido; si el historial falla, no hay cambio; el actor es el superadmin;
    - `tests/unit/actions/modulos-empresa.composition-root.test.ts`.
  - *Hecho:* tests en verde; `historial-accion-punto-unico`, `historial-accion-escrituras-cubiertas`
    y `plataforma-solo-en-lista` en verde.
- [x] **T7 — Pantalla de detalle** (design §7; R8, R14).
  - `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` y
    `_components/ModulosEmpresa.tsx`.
  - El enlace «Módulos» en `EmpresasModule.tsx`.
  - `tests/integration/plataforma-empresa-detalle-page.test.tsx`: superadmin ve 8 controles y el
    núcleo (8 nombres) sin control; los 6 roles de empresa reciben `notFound` antes de leer; empresa
    inexistente → `notFound`.
  - `tests/components/ModulosEmpresa.test.tsx`: el switch llama a la action, se revierte si falla
    y se deshabilita mientras espera.
  - *Hecho:* tests en verde; `empresas-page.test.tsx` en verde con el enlace.

## Tanda 4 — Aplicar las puertas (depende de T3, T5; T8–T11 en paralelo entre sí)

- [x] **T8 [P] — Menú** (design §6; R15, R32).
  - `modulo` en `MenuItem`/`MenuChild` y la tabla de §3.6.
  - `filtrarPorModulos` y `menuDeLaEmpresa`.
  - Los tres consumidores de `app/` (layout, dashboard y not-found).
  - Consumos entre módulos (§6.3), con el flag desde el Server Component anfitrión:
    - `ChatFlotante` solo con WhatsApp encendido (`app/(app)/mis-asignaciones/reparto/page.tsx`
      y `recoger/page.tsx`);
    - en `/wallet/mensajeros`, `PremiosRankingPanel` solo con Ranking encendido;
    - `EnviarPlantillaWhatsappButton` solo con WhatsApp encendido: en `/novedades`
      (`page.tsx` → `NovedadesModule` → `NovedadAcciones`) y en `/mis-asignaciones/reparto`
      (`RepartoModule` → `GestionarOrdenPanel`).
  - `tests/unit/auth/menu-modulos.test.ts`: oculta ítems y subítems; un desplegable vacío
    desaparece (Histórico del `admin` con WhatsApp apagado); `primerDestino` sobre lo filtrado;
    «Cierre del día», «Cierres del día», «Novedades» e «Incidentes» visibles con los 8 apagados; `adminSatelite` con Bodegas
    satélite apagado aterriza en su primer destino o en Inicio (R32); superadmin sin cambios;
    identidad conservada.
  - `tests/components/NovedadesPage.test.tsx`: con WhatsApp apagado, la acción de plantilla no se
    pinta y el resto de `/novedades` sí.
  - *Hecho:* tests en verde; los 140 usos existentes de `itemsVisibles`/`puedeVer` siguen en verde
    sin tocarlos; caso (f) de la guardia en verde.
- [x] **T9 [P] — Páginas** (design §5.3; R16).
  - `await exigirModuloEnRuta("<clave>")` como primera línea de las 24 páginas de un módulo.
  - Los tests de esas páginas ganan `puertasAbiertas()`.
  - *Hecho:* caso (b) de la guardia en verde; los tests de página listados abajo en verde.
- [x] **T10 [P] — Actions** (design §5.1, §5.3, §3.7; R17, R31, R33, R34).
  - `await exigirModuloActivo("<clave>")` como primera sentencia de cada función exportada de
    los 48 archivos de un módulo. `liquidacion`, `conciliacion-satelites` y las 5 de Incidentes
    y novedades son núcleo y no llevan puerta. `premio-ranking-devengo` va con
    `("wallet", "ranking")`.
  - R34 en `tests/integration/db/modulo-apagado-action.test.ts`: una action de wallet sin sesión
    → `unauthorized`; con el superadmin → `forbidden`; ninguna da error interno.
  - Los tests de esas actions ganan `puertasAbiertas()`.
  - `tests/integration/db/modulo-apagado-action.test.ts`: con Ranking apagado, una action de
    ranking devuelve `forbidden` y la base no cambia; con Wallet apagado, igual con una action de
    wallet; con Ranking apagado y Wallet encendido, `premio-ranking-devengo` devuelve `forbidden`;
    encendido, funciona.
  - `tests/integration/db/nucleo-sin-modulos.test.ts` (R31): empresa sin ningún módulo
    encendido; el corte diario crea el cierre `vencido`, el bloqueo por cierre pendiente aplica,
    la action de cierre del día funciona, aprobar un cierre escribe sus movimientos de caja y
    `registrarPagoMensajeroAction` registra el pago.
  - `tests/components/CierresAdminPage.test.tsx` (R31): con Wallet apagado, «Pago al mensajero» y
    la oferta de pago al aprobar siguen visibles.
  - Forma del rechazo (decisión del 2026-10-26): `{ status: "forbidden" }`, nunca una excepción.
    Los traductores locales ganan `FORBIDDEN`; las actions sin `withErrorHandler` propio envuelven
    solo la puerta y traducen con `rechazoDeModulo` (`lib/actions/_shared/to-action-error.ts`). La
    guardia (c) gana «ninguna action de un módulo lanza por la puerta».
  - *Hecho:* casos (c) y (e) de la guardia en verde; tests en verde.
- [x] **T11 [P] — Jobs, crons, API y webhook** (design §5.4–§5.6, §3.7, §3.8; R18–R21, R24, R30, R33).
  - `conSuEmpresa` con `modulo` (los de `CALCULO_CONTINUO` reciben `"nucleo"`), `JobDescartado`,
    `JobQueueService` (`descartados`) y `JobRepository.descartar`.
  - `paraCadaEmpresa({ modulo })` con `saltadas`, en los dos crons que se saltan empresas
    (`generar-gastos-fijos`, `sync-plantillas-whatsapp`). `snapshot-ranking` no cambia.
  - `conEmpresaDeLaKey` con la puerta de la API, `exigirModuloActivo("analitica")` en
    `ordenes/api-key/analitica`, `chat/media` y `WebhookWhatsappService`.
  - Tests:
    - `tests/unit/services/job-queue-service-descartado.test.ts`;
    - `tests/unit/cron/procesar-jobs-modulos.test.ts`: `webhook_estado`, `webhook_evento` y un
      `whatsapp_*` descartados sin handler; uno del núcleo corre; un recurrente re-agenda;
      `analitica_rollup_diario` y `analitica_invalidacion_cache` corren con Analítica apagada (R30);
    - `tests/unit/cron/snapshot-ranking-modulo-apagado.test.ts` (R30): la foto incluye a la
      empresa con Ranking apagado;
    - `tests/unit/db/para-cada-empresa-modulo.test.ts` y
      `tests/integration/db/para-cada-empresa-modulo.test.ts`;
    - `tests/unit/api/api-key-modulo-inactivo.test.ts`: 403 con
      `details.codigo = "modulo_inactivo"` y cuerpo no ejecutado, en las 9 rutas con un fake; y
      `ordenes/api-key/analitica` con la API encendida y Analítica apagada → 403 con
      `details.modulo = "analitica"` (R33);
    - `tests/unit/services/webhook-whatsapp-service-modulo.test.ts`.
  - Se ajustan los tests existentes del drenador y de `paraCadaEmpresa` (campo nuevo del resumen).
  - *Hecho:* caso (d) de la guardia en verde; tests en verde.

## Tanda 5 — Fábricas, E2E y cierre (depende de T6–T11)

- [ ] **T12 — Fábricas** (design §10).
  - `crearEmpresa` con `modulos` (por defecto `"todos"`), lo que también cubre `crearEmpresaE2E`
    y la demo de QA.
  - *Hecho:* `tests/integration/db/demo-qa.test.ts` en verde; un E2E de `reparto` y otro de
    `dinero` en verde en local.
- [ ] **T13 — Humo de dos empresas** (design §10; R15, R16, R23, R25, R26).
  - El superadmin enciende por la pantalla los 8 módulos de A y 7 de B (sin Ranking).
  - `rutasDelMenuDelMaestro(apagados)`.
  - El caso de B sin Ranking y A con Ranking.
  - *Hecho:* `pnpm exec playwright test --project=aislamiento`, dos corridas seguidas sobre la
    misma base, 0 failed, 0 skipped y 0 flaky (`docs/verification.md > El E2E`).
- [ ] **T14 — Cierre.**
  - Las guardias (a)–(f) y la de seed, en verde.
  - `./init.sh` en verde en el worktree.
  - Mapa `R1…R34 → test` y salida real de los tests en `progress/impl_SL-23.md`.
  - `package.json` sin dependencias nuevas (R29).
  - `docs/architecture.md > Multi-empresa` gana una viñeta SL-23: tabla, puertas y guardia.
  - *Hecho:* checklist de `CHECKPOINTS.md` y `docs/checkpoints-proyecto.md` recorrido, sin rojos
    nuevos en `tests/baseline-rojos.json`.

## Archivos esperados

### Datos
- `db/schema.prisma`
- `db/migrations/20261026120000_organizacion_modulo/migration.sql`
- `db/migrations/20261026120000_organizacion_modulo/down.sql`
- `db/migrations/20261026120100_historial_accion_modulos/migration.sql`
- `db/migrations/20261026120100_historial_accion_modulos/down.sql`
- `db/migrations/20261026120200_job_estado_descartado/migration.sql`
- `db/migrations/20261026120200_job_estado_descartado/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/para-cada-empresa.ts`

### Módulos, servicio y repositorios
- `lib/modulos/catalogo.ts`
- `lib/modulos/reparto.ts`
- `lib/modulos/exigir-modulo.ts`
- `lib/modulos/modulo-inactivo-error.ts`
- `lib/types/modulos-empresa.ts`
- `lib/types/historial-accion.ts`
- `lib/interfaces/repositories/IModulosActivosRepository.ts`
- `lib/interfaces/repositories/IModulosEmpresaRepository.ts`
- `lib/interfaces/repositories/IHistorialAccionRepository.ts`
- `lib/interfaces/repositories/IJobRepository.ts`
- `lib/interfaces/services/IModulosEmpresaService.ts`
- `lib/interfaces/services/IJobQueueService.ts`
- `lib/repositories/ModulosActivosRepository.ts`
- `lib/repositories/ModulosEmpresaRepository.ts`
- `lib/repositories/registrar-accion.ts`
- `lib/repositories/JobRepository.ts`
- `lib/services/ModulosEmpresaService.ts`
- `lib/services/JobQueueService.ts`
- `lib/services/WebhookWhatsappService.ts`
- `lib/actions/modulos-empresa.ts`
- `lib/actions/_shared/modulos-empresa.ts`
- `lib/api/api-key-request.ts`
- `lib/auth/menu-visibility.ts`
- `docs/architecture.md`

### App: superadmin, layout y menú
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/ModulosEmpresa.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/not-found.tsx`
- `app/(app)/mis-asignaciones/reparto/page.tsx`
- `app/(app)/mis-asignaciones/recoger/page.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx`
- `app/(app)/wallet/mensajeros/_components/WalletMensajerosTabs.tsx`
- `app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx`
- `app/(app)/novedades/page.tsx`
- `app/(app)/novedades/_components/NovedadesModule.tsx`
- `app/(app)/novedades/_components/NovedadAcciones.tsx`
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`

### App: páginas de un módulo (24)
- `app/(app)/analitica/page.tsx`
- `app/(app)/monitoreo/page.tsx`
- `app/(app)/recoleccion/page.tsx`
- `app/(app)/recepcion-satelite/page.tsx`
- `app/(app)/recepcion-satelite/por-recibir/page.tsx`
- `app/(app)/recepcion-satelite/en-bodega/page.tsx`
- `app/(app)/mi-bodega/page.tsx`
- `app/(app)/wallet/page.tsx`
- `app/(app)/wallet/tiendas/page.tsx`
- `app/(app)/wallet/tiendas/[tiendaId]/page.tsx`
- `app/(app)/wallet/mensajeros/page.tsx`
- `app/(app)/wallet/mensajeros/[mensajeroId]/page.tsx`
- `app/(app)/wallet/satelites/page.tsx`
- `app/(app)/wallet/satelites/[zonaId]/page.tsx`
- `app/(app)/mi-wallet/page.tsx`
- `app/(app)/ranking/page.tsx`
- `app/(app)/ranking/historico/page.tsx`
- `app/(app)/configuracion/plantillas/page.tsx`
- `app/(app)/configuracion/envios-whatsapp/page.tsx`
- `app/(app)/configuracion/envios-whatsapp/nuevo/page.tsx`
- `app/(app)/configuracion/envios-whatsapp/[id]/page.tsx`
- `app/(app)/configuracion/envios-whatsapp/historial/page.tsx`
- `app/(app)/historico/conversaciones/page.tsx`
- `app/(app)/configuracion/api/page.tsx`

### Actions de un módulo (48)
- `lib/actions/_shared/to-action-error.ts` (`rechazoDeModulo`)
- `lib/types/chat-whatsapp.ts`, `lib/types/whatsapp-envio.ts`, `lib/types/tablero-dia.ts` (el `forbidden` de módulo en sus resultados)
- `lib/actions/analitica-financiera.ts`
- `lib/actions/analitica-operativa.ts`
- `lib/actions/analitica-refrescar.ts`
- `lib/actions/ciclo-vida.ts`
- `lib/actions/cohorte-carga.ts`
- `lib/actions/conteo-cargadas-por-dia.ts`
- `lib/actions/conteo-devoluciones.ts`
- `lib/actions/conteo-entregas.ts`
- `lib/actions/conteo-hoy-gestion.ts`
- `lib/actions/conteo-por-status.ts`
- `lib/actions/conteo-productos.ts`
- `lib/actions/detalle-dinero-producto.ts`
- `lib/actions/finanzas-diario.ts`
- `lib/actions/tablero-dia.ts`
- `lib/actions/recoleccion-tienda.ts`
- `lib/actions/recepcion-satelite.ts`
- `lib/actions/envio-devolucion-central.ts`
- `lib/actions/abono-tienda.ts`
- `lib/actions/aporte-capital.ts`
- `lib/actions/como-quedo.ts`
- `lib/actions/deuda-plataforma.ts`
- `lib/actions/efecto-movimiento.ts`
- `lib/actions/estado-cuenta.ts`
- `lib/actions/gasto-fijo-cobro.ts`
- `lib/actions/gasto-fijo-plantilla.ts`
- `lib/actions/libro-caja-autoria.ts`
- `lib/actions/pago-por-cuenta-tienda.ts`
- `lib/actions/premio-ranking-devengo.ts`
- `lib/actions/rechazo-tienda-cobro.ts`
- `lib/actions/wallet.ts`
- `lib/actions/wallet-anulacion.ts`
- `lib/actions/wallet-comprobante.ts`
- `lib/actions/wallet-egresos.ts`
- `lib/actions/wallet-filtros.ts`
- `lib/actions/wallet-mensajero.ts`
- `lib/actions/wallet-tienda.ts`
- `lib/actions/ranking.ts`
- `lib/actions/ranking-historico.ts`
- `lib/actions/chat-whatsapp.ts`
- `lib/actions/envios-whatsapp.ts`
- `lib/actions/historico-conversaciones.ts`
- `lib/actions/plantillas.ts`
- `lib/actions/plantillas-sync.ts`
- `lib/actions/whatsapp-envio.ts`
- `lib/actions/informe-picking.ts`
- `lib/actions/informe-transito.ts`
- `lib/actions/api-keys.ts`
- `lib/actions/webhooks.ts`

### Crons, jobs y API
- `app/api/cron/procesar-jobs/route.ts`
- `app/api/cron/generar-gastos-fijos/route.ts`
- `app/api/cron/sync-plantillas-whatsapp/route.ts`
- `app/api/chat/media/[mensajeId]/route.ts`
- `app/api/ordenes/api-key/analitica/route.ts`

### Fábricas y E2E
- `tests/fabricas/modulos.ts`
- `tests/fabricas/empresa-y-usuarios.ts`
- `e2e/dos-empresas-humo.spec.ts`
- `e2e/_dos-empresas-fixture.ts`
- `e2e/_superadmin-fixture.ts`

### Tests nuevos
- `tests/unit/modulos/catalogo.test.ts`
- `tests/unit/modulos/exigir-modulo.test.ts`
- `tests/unit/guards/modulos-reparto.guardia.test.ts`
- `tests/unit/guards/modulos-sin-seed.guardia.test.ts`
- `tests/unit/guards/_modulos-reparto.ts` (detectores de la guardia del reparto)
- `tests/unit/services/modulos-empresa-service.test.ts`
- `tests/unit/services/job-queue-service-descartado.test.ts`
- `tests/unit/services/webhook-whatsapp-service-modulo.test.ts`
- `tests/unit/actions/modulos-empresa.composition-root.test.ts`
- `tests/unit/auth/menu-modulos.test.ts`
- `tests/unit/cron/procesar-jobs-modulos.test.ts`
- `tests/unit/cron/snapshot-ranking-modulo-apagado.test.ts`
- `tests/unit/db/para-cada-empresa-modulo.test.ts`
- `tests/unit/api/api-key-modulo-inactivo.test.ts`
- `tests/components/ModulosEmpresa.test.tsx`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `tests/integration/db/organizacion-modulo.test.ts`
- `tests/integration/db/modulos-empresa-historial.test.ts`
- `tests/integration/db/modulo-apagado-action.test.ts`
- `tests/integration/db/nucleo-sin-modulos.test.ts`
- `tests/integration/db/para-cada-empresa-modulo.test.ts`
- `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts`

### Tests existentes que se ajustan (conocidos; se añaden aquí los que aparezcan al tocar)
- `tests/unit/db/para-cada-empresa.test.ts`
- `tests/unit/services/job-queue-service.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `tests/unit/api/procesar-jobs-registro-envios.test.ts`
- `tests/integration/actions/procesar-jobs-route.test.ts`
- `tests/integration/empresas-page.test.tsx`
- `tests/integration/app-layout-superadmin.test.tsx`
- `tests/components/AppLayout.test.tsx`
- `tests/components/PantallaNoEncontrada.test.tsx`
- `tests/components/HomePageMaestro.test.tsx`
- `tests/components/HomePage.test.tsx`
- `tests/components/HomePageRol.test.tsx`
- `tests/components/MisAsignacionesPage.test.tsx`
- `tests/components/AnaliticaPage.test.tsx`
- `tests/components/TableroDiaPage.test.tsx`
- `tests/components/RecoleccionPage.test.tsx`
- `tests/components/RecepcionSatelitePage.test.tsx`
- `tests/components/RecepcionSateliteIncidente.test.tsx`
- `tests/components/CierresAdminPage.test.tsx` (caso R31: pago visible con Wallet apagado)
- `tests/components/EstadoCuentaSatelite.test.tsx`
- `tests/components/WalletDeudaPlataformaSL40.test.tsx`
- `tests/components/WalletDeudaPlataformaSL45.test.tsx`
- `tests/components/RankingPage.test.tsx`
- `tests/components/RankingHistoricoPage.test.tsx`
- `tests/components/NovedadesPage.test.tsx` (flag de WhatsApp para la acción de plantilla)
- `tests/components/ConfiguracionApiPage.test.tsx`
- `tests/components/ConfiguracionPlantillasPage.test.tsx`
- `tests/components/ConfiguracionEnviosWhatsappPage.test.tsx`
- `tests/components/HistoricoConversacionesPage.test.tsx`
- `tests/integration/wallet-page.test.tsx`
- `tests/integration/wallet-tiendas-page.test.tsx`
- `tests/integration/wallet-tiendas-estado-page.test.tsx`
- `tests/integration/wallet-mensajeros-page.test.tsx`
- `tests/integration/wallet-mensajeros-estado-page.test.tsx`
- `tests/integration/wallet-satelites.test.tsx`
- `tests/integration/mi-wallet-page.test.tsx`
- `tests/unit/components/wallet-page-cobros-pendientes.test.tsx`
- `tests/unit/actions/deuda-plataforma.composition-root.test.ts`
- Ajustados en T10/T11 (puertasAbiertas, `descartados`, `saltadas`, módulos encendidos o contrato de la cola):
  `tests/unit/actions/busqueda-por-guia-469-roots.test.ts`, `libro-kardex-468.action.test.ts`,
  `wallet-egresos.composition-root.test.ts`, `wallet-tienda-cobro-action.test.ts`,
  `tests/unit/services/whatsapp-sin-integracion.test.ts`, `webhook-whatsapp-service.test.ts`,
  `tests/unit/api/webhook-whatsapp-entregas.test.ts`, `webhook-whatsapp-por-empresa.test.ts`,
  `api-key-empresa.test.ts`, `tests/unit/cron/crons-sin-empresas.test.ts`,
  `tests/unit/guards/geocode-salud-sin-prosa.guardia.test.ts`, `tests/integration/api/webhook-whatsapp.route.test.ts`,
  `tests/integration/db/dos-empresas-entradas.test.ts`, los dobles de `IJobRepository` de
  `corregir-ubicacion-geocode`, `optimizacion-ruta-enqueue` y `orden-geocode-enqueue`, `scripts/drenar-jobs.ts`
  y 38 de integración de wallet/analítica (lista en `progress/impl_SL-23.md`, Tanda 4)
- Ajustados en T8/T9 (puertasAbiertas, flag `whatsappActivo` en los montajes, literales del menú con `modulo`,
  página async): lista en `progress/impl_SL-23.md`, Tanda 5
