# SLT-255 — planes-prorroga-pago · tasks.md

> Diseño: `design.md`. Requisitos: `requirements.md` (R1–R23). Un solo PR con la label `tamano-pr-aceptado`.
>
> - `[P]` marca las tareas que se pueden hacer en paralelo con las demás `[P]` de su tanda.
> - En todas las tareas, «hecho» incluye `pnpm run typecheck`, `pnpm run lint` y
>   `pnpm exec vitest related --run <archivos>` en verde.

## Tanda 1 — Enums y catálogo del historial (backend_dev)

- [x] **T1.1** Crear la migración `db/migrations/20261127120000_prorroga_enums/` (`migration.sql` y `down.sql`) y
      poner los dos valores en `db/schema.prisma`. Actualizar también el comentario de `descongelada_hasta`
      (design §1.1, §1.2).
      *Hecho:* `pnpm run db:migrate` aplica. El `down` quita solo esos dos valores y aborta si alguno está en uso.
      `tests/integration/db/prorroga-migration.test.ts` en verde.
- [x] **T1.2** Añadir los dos tipos a `lib/types/historial-accion.ts`: catálogo, categoría `mora`,
      `CATEGORIA_POR_ACCION` y `ACCION_LABELS` (design §5.3). Depende de T1.1.
      *Hecho:* `catalogo-y-choke-point.test.ts` en verde.
- [x] **T1.3** [P] Ampliar `mora-migration.test.ts` y los 8 inventarios de `historial_accion_tipo`. Los dos valores
      de SLT-255 se afirman al final y se quitan antes de los cortes, como hizo SLT-121. Depende de T1.1.
      *Hecho:* los 9 archivos en verde contra una base con la migración aplicada.

## Tanda 2 — Dominio, repositorio, servicio y actions (backend_dev)

- [x] **T2.1** [P] En `lib/planes/mora.ts`: añadir `plazoVigente`, cambiar el estado `descongelada_a_mano` por
      `con_plazo`, reordenar `estadoDeMora` y actualizar `MORA_TEXTOS` (`conPlazo`, `con_plazo`, `sinPlazo`) (design
      §2). Ampliar `tests/unit/planes/mora.test.ts`.
      *Hecho:* R1, R11 y R12 cubiertos con los casos de design §8.
- [x] **T2.2** En `encolar-aviso-mora.ts`, añadir las tres formas nuevas de `AvisoMoraPayload` y su
      `dedupeAvisoMora` (design §4.1).
      *Hecho:* `typecheck` en verde.
- [x] **T2.3** En `MoraEmpresaRepository` e `IMoraEmpresaRepository`: `darPlazo` y `quitarPlazo` en lugar de
      `descongelarAMano`, y la víspera del plazo dentro de `encolarRecordatorios` (design §3.1). Enmendar las
      guardias `historial-accion-escrituras-cubiertas` (censo) y `historial-accion-sin-datos-cliente` (dos
      excepciones `SLT-255`). Depende de T1.2, T2.1 y T2.2.
      *Hecho:* `mora-empresa-repository.test.ts` ampliado y en verde contra Postgres real (R2–R5, R8–R10, R15, R18,
      R21), incluido el cruce en paralelo sin `40P01`. Las dos guardias en verde.
- [x] **T2.4** En `MoraEmpresaService` e `IMoraEmpresaService`: `darPlazo`, `quitarPlazo` y `datos.plazo`. En
      `lib/types/mora.ts`: `darPlazoSchema`, `quitarPlazoSchema`, los nuevos `*Result` y `MoraEmpresaVista.plazo`
      (design §3.2). Depende de T2.3.
      *Hecho:* `mora-empresa-service.test.ts` en verde (R6, R7, R13).
- [x] **T2.5** En `lib/actions/mora-empresa.ts`: `darPlazoEmpresaAction` y `quitarPlazoEmpresaAction` (design §3.3).
      Depende de T2.4.
      *Hecho:* `tests/unit/actions/mora-empresa.test.ts` en verde (R7).

## Tanda 3 — Correos (backend_dev)

- [x] **T3.1** [P] En `mora-aviso.ts`: los contenidos `prorroga`, `prorroga_quitada` y `prorroga_vence`, y
      `plazoHasta` en `recordatorio`, con sus textos (design §4.3). Ampliar `plantilla-mora-aviso.test.ts`.
      *Hecho:* asunto y cuerpo de cada caso. El recordatorio con plazo no dice «se congela» (R16, R17, R18, R22).
- [x] **T3.2** En `jobs-mora.ts`: el zod del payload y `contenidoVigente` con la relectura de design §4.2. Depende
      de T2.2 y T3.1.
      *Hecho:* `jobs-mora.test.ts` en verde (R16–R20, R22).

## Tanda 4 — Interfaz (frontend_dev)

- [x] **T4.1** [P] En `AvisoMora.tsx`, el caso `con_plazo` (design §5.1). Ampliar `AvisoMora.test.tsx`. Depende de
      T2.1.
      *Hecho:* R11 en el test de componente.
- [ ] **T4.2** En `MoraEmpresa.tsx`, los botones «Dar plazo hasta…» y «Quitar prórroga…», con sus dos diálogos. En
      `page.tsx`, ligar las dos actions (design §5.2). Ampliar `MoraEmpresa.test.tsx`. Depende de T2.5.
      *Hecho:* R13 en el test de componente. `typecheck` en verde con las props nuevas.

## Tanda 5 — E2E y documentación

- [ ] **T5.1** Crear `e2e/mora-prorroga.spec.ts` y añadirlo al proyecto `dinero` en `playwright.config.ts`
      (design §7). Depende de las tandas 1 a 4.
      *Hecho:* en verde en local contra una base desechable nueva, junto con `--project=dinero` entero
      (`mora-congelamiento` incluido) y `e2e/dos-empresas-humo.spec.ts` (R23).
- [ ] **T5.2** [P] Actualizar la sección de la mora en `docs/architecture.md`. Tiene que explicar:
      - que el plazo vive en `descongelada_hasta`;
      - los dos tipos nuevos del historial;
      - `darPlazo` y `quitarPlazo`;
      - los tres avisos nuevos;
      - el estado `con_plazo`.
      *Hecho:* la sección ya no nombra `descongelarAMano` ni el estado `descongelada_a_mano` del banner.
- [ ] **T5.3** Correr `./init.sh` en el worktree.
      *Hecho:* verde, y `progress/impl_SLT-255.md` con el mapa R1–R23 → test.

## Archivos esperados

Producción (19):

- `db/migrations/20261127120000_prorroga_enums/migration.sql`
- `db/migrations/20261127120000_prorroga_enums/down.sql`
- `db/schema.prisma`
- `lib/types/historial-accion.ts`
- `lib/planes/mora.ts`
- `lib/types/mora.ts`
- `lib/interfaces/repositories/IMoraEmpresaRepository.ts`
- `lib/interfaces/services/IMoraEmpresaService.ts`
- `lib/repositories/MoraEmpresaRepository.ts`
- `lib/services/MoraEmpresaService.ts`
- `lib/actions/mora-empresa.ts`
- `lib/repositories/_shared/encolar-aviso-mora.ts`
- `lib/planes/jobs-mora.ts`
- `lib/services/email/plantillas/mora-aviso.ts`
- `app/(app)/_components/AvisoMora.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `docs/architecture.md`
- `playwright.config.ts`

Tests (22):

- `tests/integration/db/prorroga-migration.test.ts`
- `tests/integration/db/mora-migration.test.ts`
- `tests/integration/db/caja-459-migration.test.ts`
- `tests/integration/db/correccion-resultado-gestion-migration.test.ts`
- `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`
- `tests/integration/db/historial-accion-conciliacion-bodega-migration.test.ts`
- `tests/integration/db/historial-accion-orden-zona-reconciliada-migration.test.ts`
- `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts`
- `tests/integration/db/historial-accion-zona-pago-mensajero-migration.test.ts`
- `tests/integration/db/historial-accion-zona-sinpe-migration.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`
- `tests/unit/planes/mora.test.ts`
- `tests/integration/repositories/mora-empresa-repository.test.ts`
- `tests/unit/services/mora-empresa-service.test.ts`
- `tests/unit/actions/mora-empresa.test.ts`
- `tests/unit/planes/jobs-mora.test.ts`
- `tests/unit/services/email/plantilla-mora-aviso.test.ts`
- `tests/components/AvisoMora.test.tsx`
- `tests/components/MoraEmpresa.test.tsx`
- `e2e/mora-prorroga.spec.ts`

## Tamaño

- **Archivos:** 41 (19 de producción y 22 de tests), frente al tope de 40 de `gate.tamano_pr`. El humano lo aceptó
  el 2026-11-23 con la label `tamano-pr-aceptado`.
- **Líneas de producción:** unas 650 (tope 1 000): SQL ~60, TS ~420, UI ~170.
- **Líneas de tests:** unas 1 300 (tope 3 000).
