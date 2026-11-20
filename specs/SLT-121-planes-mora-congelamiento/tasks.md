# SLT-121 — planes-mora-congelamiento · tasks.md

> Diseño: `design.md`. Requisitos: `requirements.md` (R1–R35). Las preguntas P1–P5 se cierran antes de T1: si alguna
> cambia, se ajustan el requisito, el design y estas tareas.
> `[P]` = paralelizable con las demás `[P]` de su tanda. «Hecho» incluye siempre `pnpm run typecheck`, `pnpm run lint`
> y `pnpm exec vitest related --run <archivos>` en verde.

## Tanda 1 — Base de datos (backend_dev)

- [ ] **T1.1** Migración de enums `db/migrations/20261124120000_mora_enums/` (`migration.sql` + `down.sql`) y los siete
      valores en `db/schema.prisma` (design §1.2, §8.1).
      *Hecho:* `pnpm run db:migrate` aplica; `down` quita solo esos valores y aborta si hay uso; inventarios de enums
      ampliados y en verde.
- [ ] **T1.2** Migración `db/migrations/20261124120100_mora_congelamiento/`: columnas, `CHECK`, índice, funciones de §2
      y triggers `<t>_bloqueo_por_mora`, más su `down.sql` (design §1.1, §2, §8.2). Depende de T1.1.
      *Hecho:* `tests/integration/db/mora-migration.test.ts` y `bloqueo-por-mora-cobertura.test.ts` en verde.
- [ ] **T1.3** Tabla de casos compartida `tests/integration/db/_fixtures/fecha-limite-pago.ts` y
      `factura-plataforma-mora.test.ts` (R1, R6, R33). Depende de T1.2.
      *Hecho:* la función devuelve fecha límite, `vence_at` y `vencida` de cada caso; `42501` con otra empresa.
- [ ] **T1.4** `bloqueo-por-mora.test.ts` (R10, R12, R16, R18) y `mora-congelar.test.ts` (R7, R8, R9, R21, R23).
      Depende de T1.2.
      *Hecho:* congela solo en la franja; lecturas pasan; escrituras de `servi_app` sin permiso dan `SL121`; el
      dueño y el permiso pasan; la otra empresa escribe.

## Tanda 2 — Dominio y bloqueo en la app (backend_dev)

- [ ] **T2.1** [P] `lib/config/factura-gracia.ts` + `.env.example` + test (R2).
      *Hecho:* los seis casos de `factura-gracia.test.ts`.
- [ ] **T2.2** [P] `lib/planes/mora.ts` (puro) + entrada en `tests/unit/guards/_pais-sin-literales-excepciones.ts` +
      `tests/unit/planes/mora.test.ts`, con la tabla de T1.3 (R1, R6, R8, R24).
      *Hecho:* la gemela TS da lo mismo que SQL en todos los casos.
- [ ] **T2.3** `lib/db/permiso-en-mora.ts` y la envoltura de `lib/db/extension-empresa.ts` (`app.mora_permitida` en los
      dos sitios); `lib/planes/empresa-congelada.ts` (`EmpresaCongelada`, `traducirErrorDeMora`,
      `exigirEmpresaOperativa`); la traducción en los dos `traducir` de la extensión (design §6.1, §6.2).
      Depende de T1.2.
      *Hecho:* `tests/unit/db/extension-empresa-mora.test.ts` en verde; `withErrorHandler` da `FORBIDDEN` con
      `details.codigo = "empresa_congelada"`.
- [ ] **T2.4** `MoraEmpresaRepository` + `IMoraEmpresaRepository` + entrada en `lib/db/excepciones-aislamiento.ts`
      (design §5.1). Depende de T1.2, T2.1 y T2.2.
      *Hecho:* `mora-empresa-repository.test.ts` (R5, R22, R30, R31, R32).
- [ ] **T2.5** `lib/planes/mora-recalcular.ts` y el enganche en `PagoPlataformaConfirmacionRepository` (las tres
      operaciones en `$transaction`; contrato sin cambios) (design §5.2). Depende de T2.4.
      *Hecho:* `pago-plataforma-recalcula-mora.test.ts` (R19, R20, R21, R34); los tests existentes de SLT-60 y
      SLT-143 siguen en verde.
- [ ] **T2.6** Historial: los cinco tipos y la categoría `mora` en `lib/types/historial-accion.ts` y
      `lib/types/historial-accion-etiquetas.ts`; guardias del historial enmendadas, con la excepción de P5 si Carlos la
      acepta (R30). Depende de T1.1.
      *Hecho:* `historial-accion-*.guardia` en verde.
- [ ] **T2.7** Permisos de §6.1:
      - `wallet-egresos.ts` y `wallet-anulacion.ts` (P3);
      - `confirmar-correo.ts`;
      - `push.ts`, `notificaciones.ts` y `vistas-filtro.ts` (P2);
      - `WebhookWhatsappService.ts`;
      - `conSuEmpresa` y `paraCadaEmpresa` (P1);
      - la guardia `mora-permiso-solo-en-lista`.

      Depende de T2.3.
      *Hecho:* `wallet-egresos-mora.test.ts`, `webhook-whatsapp-mora.test.ts`, `procesar-jobs-mora.test.ts` y la
      guardia en verde (R11, R15, R17).

## Tanda 3 — Bordes, cola y correos (backend_dev)

- [ ] **T3.1** [P] `exigirEmpresaOperativa()` en las seis rutas de escritura de la API por key y en
      `carga-masiva/chunk`; documentar el 403 en `lib/api/openapi-spec.ts`, `docs/api/api-key-openapi.yaml`,
      `docs/api/CHANGELOG.md` y `docs/ayuda/oficina/guia-integracion-api.md` (design §6.2, §6.3). Depende de T2.3.
      *Hecho:* `api-key-empresa-congelada.route.test.ts` y `carga-masiva-empresa-congelada.route.test.ts` (R13,
      R14); los tests de OpenAPI siguen en verde.
- [ ] **T3.2** [P] `lib/planes/jobs-mora.ts`: `mora_diaria` (recurrencia, siembra y manejador) y `mora_aviso_correo`.
      Se cablean en `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts` y
      `scripts/siembra-jobs-recurrentes.ts` (design §4). Depende de T2.4.
      *Hecho:* `jobs-mora.test.ts` (R7, R9, R26–R29).
- [ ] **T3.3** [P] Plantilla `lib/services/email/plantillas/mora-aviso.ts`; la fecha límite en
      `factura-emitida.ts` y `jobs-factura-aviso.ts` (SLT-136); `mi-plan-solo-maestro.guardia` enmendada (design §4.2,
      R25). Depende de T2.2.
      *Hecho:* `plantilla-mora-aviso.test.ts` y las ampliaciones de `plantilla-factura-emitida` y `jobs-factura-aviso`.

## Tanda 4 — Servicio, actions y pantallas (backend_dev → frontend_dev)

- [ ] **T4.1** `MoraEmpresaService` + `IMoraEmpresaService` + `lib/actions/mora-empresa.ts` (`nucleo` en
      `MODULO_POR_ACTION`) + tipos en `lib/types/mora.ts` (design §5.3, §5.4). Depende de T2.4.
      *Hecho:* `mora-empresa-service.test.ts` y `mora-empresa.test.ts` (R3, R4, R22, R24, R32).
- [ ] **T4.2** [P] Banner: `app/(app)/_components/AvisoMora.tsx` y la lectura aislada en `app/(app)/layout.tsx`
      (design §7.1). Depende de T4.1.
      *Hecho:* `AvisoMora.test.tsx` (R24); los demás roles no consultan.
- [ ] **T4.3** [P] Superadmin: `MoraEmpresa.tsx` y su lectura en `plataforma/empresas/[organizacionId]/page.tsx`
      (design §7.2). Depende de T4.1.
      *Hecho:* `MoraEmpresa.test.tsx` (R32).

## Tanda 5 — Punta a punta y cierre

- [ ] **T5.1** `e2e/mora-congelamiento.spec.ts` (proyecto `dinero`), según design §11. Se corren en local, sobre una
      base desechable: el archivo nuevo, `--project=dinero` y `e2e/dos-empresas-humo.spec.ts`. Depende de T1–T4.
      *Hecho:* los tres en verde, sin reintentos (R35, R18).
- [ ] **T5.2** `docs/architecture.md > Facturas de la plataforma`: sección «Mora y congelamiento». Recoge las columnas,
      las funciones, el trigger y su guardia, los permisos, la corrida, los correos, la enmienda a SLT-136 y al
      repositorio de SLT-60 y SLT-143, y la frontera con SLT-226, SLT-230 y SLT-231.
      *Hecho:* el texto nombra cada pieza con su ruta.
- [ ] **T5.3** `progress/impl_SLT-121.md` con el mapa `R<n> → test` y `./init.sh` en verde.
      *Hecho:* los 35 requisitos tienen su test.

## Archivos esperados

### Producción

- `db/migrations/20261124120000_mora_enums/migration.sql`
- `db/migrations/20261124120000_mora_enums/down.sql`
- `db/migrations/20261124120100_mora_congelamiento/migration.sql`
- `db/migrations/20261124120100_mora_congelamiento/down.sql`
- `db/schema.prisma`
- `.env.example`
- `lib/config/factura-gracia.ts`
- `lib/planes/mora.ts`
- `lib/planes/mora-recalcular.ts`
- `lib/planes/empresa-congelada.ts`
- `lib/planes/jobs-mora.ts`
- `lib/planes/jobs-factura-aviso.ts`
- `lib/db/permiso-en-mora.ts`
- `lib/db/extension-empresa.ts`
- `lib/db/para-cada-empresa.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/repositories/MoraEmpresaRepository.ts`
- `lib/interfaces/repositories/IMoraEmpresaRepository.ts`
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts`
- `lib/services/MoraEmpresaService.ts`
- `lib/interfaces/services/IMoraEmpresaService.ts`
- `lib/services/WebhookWhatsappService.ts`
- `lib/services/email/plantillas/mora-aviso.ts`
- `lib/services/email/plantillas/factura-emitida.ts`
- `lib/actions/mora-empresa.ts`
- `lib/actions/wallet-egresos.ts`
- `lib/actions/wallet-anulacion.ts`
- `lib/actions/confirmar-correo.ts`
- `lib/actions/push.ts`
- `lib/actions/notificaciones.ts`
- `lib/actions/vistas-filtro.ts`
- `lib/types/mora.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/modulos/reparto.ts`
- `lib/api/openapi-spec.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/api/ordenes/api-key/carga/[cargaId]/generate/route.ts`
- `app/api/ordenes/api-key/habilitar/route.ts`
- `app/api/ordenes/api-key/[numGuia]/cancelar/route.ts`
- `app/api/ordenes/api-key/orden/[id]/generate/route.ts`
- `app/api/ordenes/api-key/orden/[id]/route.ts`
- `app/api/ordenes/carga-masiva/chunk/route.ts`
- `app/(app)/layout.tsx`
- `app/(app)/_components/AvisoMora.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx`
- `scripts/siembra-jobs-recurrentes.ts`
- `docs/api/api-key-openapi.yaml`
- `docs/api/CHANGELOG.md`
- `docs/ayuda/oficina/guia-integracion-api.md`
- `docs/architecture.md`

### Tests

- `tests/integration/db/_fixtures/fecha-limite-pago.ts`
- `tests/integration/db/factura-plataforma-mora.test.ts`
- `tests/integration/db/mora-congelar.test.ts`
- `tests/integration/db/bloqueo-por-mora.test.ts`
- `tests/integration/db/bloqueo-por-mora-cobertura.test.ts`
- `tests/integration/db/mora-migration.test.ts`
- `tests/integration/repositories/mora-empresa-repository.test.ts`
- `tests/integration/repositories/pago-plataforma-recalcula-mora.test.ts`
- `tests/integration/api/api-key-empresa-congelada.route.test.ts`
- `tests/integration/api/carga-masiva-empresa-congelada.route.test.ts`
- `tests/unit/config/factura-gracia.test.ts`
- `tests/unit/planes/mora.test.ts`
- `tests/unit/planes/jobs-mora.test.ts`
- `tests/unit/planes/jobs-factura-aviso.test.ts`
- `tests/unit/db/extension-empresa-mora.test.ts`
- `tests/unit/services/mora-empresa-service.test.ts`
- `tests/unit/services/webhook-whatsapp-mora.test.ts`
- `tests/unit/services/email/plantilla-mora-aviso.test.ts`
- `tests/unit/services/email/plantilla-factura-emitida.test.ts`
- `tests/unit/actions/mora-empresa.test.ts`
- `tests/unit/actions/wallet-egresos-mora.test.ts`
- `tests/unit/cron/procesar-jobs-mora.test.ts`
- `tests/unit/guards/mora-permiso-solo-en-lista.guardia.test.ts`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`
- `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`
- `tests/components/AvisoMora.test.tsx`
- `tests/components/MoraEmpresa.test.tsx`
- `e2e/mora-congelamiento.spec.ts`

> Inventarios de enums de `job_tipo` y `historial_accion_tipo` que se pongan en rojo (design §10): se añaden aquí
> en cuanto el gate los nombre, antes del commit que los toca.
