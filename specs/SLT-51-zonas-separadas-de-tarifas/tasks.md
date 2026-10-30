# SLT-51 — zonas-separadas-de-tarifas · tasks.md

Reparto: `backend_dev` → T1-T3; `frontend_dev` → T4-T10; T11-T12 al final. `[P]` = puede ir en
paralelo con las otras `[P]` de su bloque. Cada task cierra con
`pnpm exec vitest related --run <archivos tocados>` en verde y su commit
(`feat(SLT-51): …` / `test(SLT-51): …`).

## Backend

- [x] **T1 — Esquemas opcionales** (R7, R8, R9). `lib/types/zona.ts`: `crearZonaSchema.cobroVehiculo`
  con `.default(false)`; en `actualizarZonaSchema`, `cobroVehiculo` y `tarifas` `.optional()` sin
  default, con el `superRefine` de design §5 (los dos ausentes válidos; solo uno → issue en el que
  falta; los dos → `applyTarifaRules`). Casos nuevos en `tests/unit/types/zona-schema.test.ts`.
  *Hecho:* los casos de R8 en rojo antes del cambio y en verde después; los existentes, verdes.
- [x] **T2 — Servicio y repositorio no tocan lo ausente** (R6, R7, R9). Depende de T1.
  `IZonaRepository.UpdateZonaData` con `cobroVehiculo?`/`tarifas?`; `ZonaService.prepararDatos`
  valida vehículos solo si hay `tarifas`; `ZonaRepository.update` salta `pagosPrevios`, el
  `deleteMany`/`createMany` de `tarifa_zona_mensajero` y la fila `zona_pago_mensajero_cambiado`
  cuando `tarifas` es `undefined`, y pasa `cobroVehiculo` tal cual (undefined = no escribe).
  `MSG_SIN_ZONA_CENTRAL` con el texto nuevo (R10). Ajustar `tests/unit/services/zona-service.test.ts`.
  *Hecho:* `zona-pago-mensajero-rastro.test.ts` y `zonas-action.test.ts` verdes sin cambiar sus
  aserciones de 380.
- [x] **T3 — Integración contra Postgres** (R5, R6, R7, R8). Depende de T2.
  `tests/integration/db/zona-guardado-conserva-costos.test.ts`: (a) crear sin costos → 0 filas de
  pago, `cobro_vehiculo=false`, 0 filas `tarifas` de la zona, especiales iguales; (b) zona con pagos
  por vehículo + tarifa de zona + 2 distritos especiales, `actualizarZona` con
  `{ nombre, distritoIds }` → todo igual y 0 filas nuevas `zona_pago_mensajero_cambiado`;
  (c) solo `tarifas` → `validation_error` y nada escrito. Casos `forbidden` de R2 confirmados en
  `zonas-action.test.ts`.
  *Hecho:* verde; y rojo si se reintroduce el `deleteMany` incondicional (mutación anotada en
  `progress/impl_SLT-51.md`).

## Frontend

- [x] **T4 — Mudar archivos** (sin cambiar comportamiento). `git mv` de `ZonasTarifasModule.tsx`
  (→ `ZonasModule.tsx`), `CrearZonaForm.tsx`, `GeografiaSelector.tsx`,
  `DescargarCoberturaButton.tsx` y `cobertura-descarga-columnas.ts` a
  `app/(app)/configuracion/zonas/_components/`; arreglar imports en código y tests (lista en
  design §8). `ZonasModule` deja de montar `TiendasModule`.
  *Hecho:* typecheck y lint verdes; los tests movidos verdes con la ruta nueva.
- [x] **T5 — Página `/configuracion/zonas`** (R1, R2, R12, R16). Depende de T4.
  `app/(app)/configuracion/zonas/page.tsx` (gate `maestro`, Cobertura + `ZonasModule`, pre-carga de
  árbol y zonas). `menu-visibility.ts` con el subítem «Zonas» entre Usuarios y Tarifas;
  `reparto.ts` con la ruta. Tests: `tests/unit/app/zonas/ZonasPage.test.tsx`,
  `menu-visibility.test.ts`, `Sidebar.test.tsx`.
  *Hecho:* tests verdes; `modulos-reparto.guardia` verde.
- [x] **T6 — Página Tarifas sin zonas** (R12, R13). Depende de T4. [P] con T5.
  `tarifas/page.tsx` monta solo `TiendasModule` con las zonas; sin Cobertura ni árbol ni vehículos.
  `TarifasPage.cobertura.test.tsx` se sustituye por `tests/unit/app/tarifas/TarifasPage.test.tsx`.
  *Hecho:* test verde: sin «Cobertura», sin «Costos por zona», sin «Crear zona», `TiendasModule`
  recibe las zonas.
- [x] **T7 — Formulario sin costos** (R4, R5, R6). Depende de T1 y T4.
  `CrearZonaForm` según design §4; `GeografiaSelector` con `permitirEspecial` (default `false`).
  Test nuevo `tests/components/ZonaFormSinCostos.test.tsx`; `ZonaDistritoEspecial.test.tsx`
  reescrito (sin botón «Especial» en Zonas; nunca llama a `actualizarDistritosEspeciales`);
  `TarifasClaridadMontos.test.tsx` sin los casos del formulario de zona.
  *Hecho:* tests verdes; el payload espiado no lleva `cobroVehiculo` ni `tarifas`.
- [x] **T8 — Rótulos «Zona de bodega principal» y listado** (R3, R10, R11, R14). Depende de T7.
  Textos de design §4 en casilla, modal, borrado, vacío y listado (etiqueta, sin «cobro por
  vehículo»). Actualizar `ZonaCentralConfirmacion.test.tsx` y `ZonaBorradoMotivo.test.tsx`; nuevo
  `tests/components/ZonasModuleListado.test.tsx` (incluye: ningún texto visible contiene
  «central»).
  *Hecho:* tests verdes.
- [x] **T9 — Sin superficie anotada**. Depende de T7. `@sin-superficie` en
  `actualizarDistritosEspeciales` y `CobroVehiculoTarifas` (design §5).
  *Hecho:* `pnpm run test:guardias` verde.
- [x] **T10 — Ayuda** [P]. `docs/ayuda/oficina/configuracion-zonas.md` nuevo y
  `configuracion-tarifas.md` corregido (design §7).
  *Hecho:* `ayuda-pantalla-ruta-existe.guardia` verde.

## Cierre

- [ ] **T11 — E2E** (R5, R3). Depende de T5-T8. `e2e/zonas-crear-sin-costos.spec.ts` (design §8);
  `e2e/zona-especial-dos-empresas.spec.ts` a `test.fixme` citando SLT-54 (P1, si el humano lo
  confirma). *Hecho:* `pnpm exec playwright test e2e/zonas-crear-sin-costos.spec.ts` verde en
  local, con su salida en `progress/impl_SLT-51.md`.
- [ ] **T12 — Gate y trazabilidad**. `./init.sh` verde; mapa `R1..R16 → test` en
  `progress/impl_SLT-51.md`. Captura de `/configuracion/zonas` (listado + formulario de crear) y de
  `/configuracion/tarifas` como evidencia de lo que ve el usuario.

## Archivos esperados

- `app/(app)/configuracion/zonas/page.tsx`
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx`
- `app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/zonas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/zonas/_components/DescargarCoberturaButton.tsx`
- `app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas.ts`
- `app/(app)/configuracion/tarifas/page.tsx`
- `app/(app)/configuracion/tarifas/_components/ZonasTarifasModule.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/tarifas/_components/DescargarCoberturaButton.tsx`
- `app/(app)/configuracion/tarifas/_components/cobertura-descarga-columnas.ts`
- `app/(app)/configuracion/tarifas/_components/CobroVehiculoTarifas.tsx`
- `app/(app)/configuracion/_shared/filtrar-arbol-geografico.ts`
- `lib/types/zona.ts`
- `lib/services/ZonaService.ts`
- `lib/interfaces/repositories/IZonaRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/actions/geografia.ts`
- `lib/actions/cobertura.ts`
- `lib/auth/menu-visibility.ts`
- `lib/modulos/reparto.ts`
- `docs/ayuda/oficina/configuracion-zonas.md`
- `docs/ayuda/oficina/configuracion-tarifas.md`
- `tests/unit/types/zona-schema.test.ts`
- `tests/unit/services/zona-service.test.ts`
- `tests/integration/db/zona-guardado-conserva-costos.test.ts`
- `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
- `tests/integration/actions/zonas-action.test.ts`
- `tests/unit/app/zonas/ZonasPage.test.tsx`
- `tests/unit/app/zonas/DescargarCoberturaButton.test.tsx`
- `tests/unit/app/tarifas/DescargarCoberturaButton.test.tsx`
- `tests/unit/app/tarifas/TarifasPage.cobertura.test.tsx`
- `tests/unit/app/tarifas/TarifasPage.test.tsx`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/components/geografia-selector-inactivos.test.tsx`
- `tests/unit/descarga/cobertura-descarga-columnas.test.ts`
- `tests/unit/actions/geografia-action.test.ts`
- `tests/unit/utils/filtrar-arbol-geografico.test.ts`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/config/paginacion-dominios.test.ts`
- `tests/components/Sidebar.test.tsx`
- `tests/components/ZonaFormSinCostos.test.tsx`
- `tests/components/ZonasModuleListado.test.tsx`
- `tests/components/CrearZonaFormReconciliacion.test.tsx`
- `tests/components/ZonaCentralConfirmacion.test.tsx`
- `tests/components/ZonaDistritoEspecial.test.tsx`
- `tests/components/ZonaBorradoMotivo.test.tsx`
- `tests/components/ZonaNombreNoImprimible.test.tsx`
- `tests/components/TarifasClaridadMontos.test.tsx`
- `e2e/zonas-crear-sin-costos.spec.ts`
- `e2e/zona-especial-dos-empresas.spec.ts`
- `progress/impl_SLT-51.md`
