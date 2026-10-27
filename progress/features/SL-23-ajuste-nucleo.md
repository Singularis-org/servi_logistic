# SL-23 ajuste — Recolección, Bodegas satélite y API e integraciones al núcleo (sin SDD)

Decisiones del humano del 2026-10-27 (la de API e integraciones llegó como ampliación). Rama
`feature/SL-23-nucleo-recoleccion-satelite`. Sin commit (lo hace el leader).
Quedan 5 apagables: analitica, monitoreo, wallet, ranking, whatsapp.

## Archivos
- Migración `db/migrations/20261027120000_modulos_nucleo/{migration.sql,down.sql}`. Se llamaba
  `…_modulos_nucleo_recoleccion_satelite` y se renombró al ampliarla; nunca se mergeó.
  - **Ida:** borra las filas de las 3 claves, renombra el tipo, crea `modulo_apagable` con 5 claves, hace el
    ALTER COLUMN … USING ::text y borra el tipo viejo.
  - **Lo que no cambia:** la política, los grants, el trigger y la FK no dependen del tipo; el índice único
    lo reconstruye el ALTER. `historial_accion` (texto en `valor_*`) y `jobs.last_error` no se tocan, y
    ninguna otra tabla usa el enum.
  - **Down:** recrea las 8 claves (sin ADD VALUE, 55P04) y vuelve a encender las 3 para todas las
    empresas (ON CONFLICT DO NOTHING).
  - **Test nuevo:** `tests/integration/db/migracion-sl23-nucleo-ida-y-vuelta.test.ts`.
- `db/schema.prisma` (enum), `lib/modulos/catalogo.ts` (fichas, ORDEN_MODULOS; NUCLEO + Recolección,
  Bodegas satélite, API e integraciones).
- `lib/modulos/reparto.ts`, todo a `"nucleo"`:
  - Rutas: `/recoleccion`, `/recepcion-satelite*`, `/mi-bodega`, `/configuracion/api`.
  - Actions: recoleccion-tienda, recepcion-satelite, envio-devolucion-central, api-keys, webhooks.
  - Jobs: webhook_estado, webhook_evento.
  - API: las 8 de `ordenes/api-key/**`. `ordenes/api-key/analitica` pasa a exigir solo `"analitica"`.
- Puertas quitadas:
  - Páginas: mi-bodega, recoleccion, recepcion-satelite (+ en-bodega, por-recibir), configuracion/api.
  - Actions: recoleccion-tienda, recepcion-satelite, envio-devolucion-central (también el caso FORBIDDEN
    de SL-23), api-keys, webhooks (envoltorio `rechazoDeModulo`).
  - `lib/api/api-key-request.ts` (`conEmpresaDeLaKey` ya no exige módulo).
  - La ruta de analítica por key conserva su `exigirModuloActivo("analitica")`.
- `lib/auth/menu-visibility.ts`: se quitan 4 `modulo:` (recolección, recepción satélite, mi bodega y API).
- Textos: `docs/architecture.md` (5 apagables; la API por key ya no da 403 salvo `/analitica`).
  También los comentarios de `dashboard/page.tsx`, `ModulosEmpresa.tsx`, `IModulosEmpresaService.ts` y
  `e2e/dos-empresas-humo.spec.ts`. La ayuda (`docs/ayuda`) no lista módulos.
- Tests actualizados:
  - Catálogo y reparto: catalogo, modulos-empresa-service, ModulosEmpresa, CierresAdminPage
    (comentarios), fabricas/modulos (comentario), organizacion-modulo.
  - Menú: menu-modulos (R32 sobre menú armado con wallet; caso nuevo: Recolección, Satélite y API
    visibles con todo apagado).
  - Guardia modulos-reparto: 18 páginas y 43 actions; ya no hay pieza compartida de API.
  - API y jobs: api-key-modulo-inactivo (reescrito: con todo apagado ninguna ruta por key da
    modulo_inactivo salvo `/analitica`), procesar-jobs-modulos (los webhooks son núcleo y corren),
    job-queue-service-descartado (usa whatsapp), exigir-modulo (monitoreo en vez de api).
  - `migracion-sl23-ida-y-vuelta`: deja de exigir «justo detrás de la última de dev». Ese rojo ya existía
    antes de este ajuste: las migraciones de SL-18 ordenan en medio.

## Verificación (ampliación)
- **Typecheck:** `tsc --noEmit` excluyendo `.claude`, `.worktrees` y `.serena` (tsconfig temporal, ya
  borrado, heap 6 GB) termina con **exit 0**.
- **eslint** en los archivos tocados: **exit 0**.
- **vitest** con la base real (`DATABASE_URL` del `.env`, cargado por Node). Corrió `tests/guards` y
  `tests/unit/{guards,modulos,auth,api,cron,services}`, los componentes de recolección, satélite, API,
  Sidebar y ModulosEmpresa, `tests/integration/api`, organizacion-modulo y las dos migraciones de ida
  y vuelta.
  - Resultado: `Test Files 1 failed | 672 passed (673)`, `Tests 4 failed | 10954 passed | 1 skipped`.
  - El único rojo es `dependencias-declaradas-presentes` (4), que ya está en `tests/baseline-rojos.json`.
  - Confirmado en modo verbose que las dos de DB corren contra Postgres: 15/15 verdes, incluida la ida y
    vuelta de `20261027120000_modulos_nucleo`.
- **`./init.sh`:** ROJO por entorno, no por el cambio.
  1. Con el `.env` crudo corta en `./.env: line 124: $3: unbound variable`, porque `SUPERADMIN_PASSWORD`
     lleva un `$3` sin comillas.
  2. Con el `.env` cargado por Node, el typecheck se queda sin memoria (OOM): `**/*.ts` arrastra las copias
     de `.claude/worktrees/` y `.worktrees/`.

## Sin verificar / bloqueos
- `./init.sh` en verde: falta arreglar el `.env` (comillas) y el OOM del typecheck (`exclude` en
  tsconfig o limpiar `.claude/worktrees/`). Las dos cosas son del humano o del leader.
- E2E `dos-empresas-humo`: no se corrió. Solo cambiaron textos; recorre ORDEN_MODULOS, que ahora tiene 5.
