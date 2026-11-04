# SL-42 — Vehículos: catálogo de la plataforma · tasks.md

> P1, P2 y P3 están cerradas (`requirements.md > Decisiones cerradas`, 2026-11-03). La etiqueta
> **(P<n>)** de una task solo indica de qué decisión viene.
> `[P]` = puede ir en paralelo con las otras `[P]` de su tanda.

## T0 — Antes de empezar

- [x] T0.1 Correr `node scripts/archivos-en-vuelo.mjs` con la sección de abajo.
  **Hecho:** sin choque de archivos con otra persona, o choque aceptado.

## T1 — Datos (backend_dev)

- [x] T1.1 Migración `20261103120000_vehiculo_activo` (`migration.sql` + `down.sql`) y
  `activo Boolean @default(true)` en `model Vehiculo` (design §2.1). Dep.: T0.
  **Hecho:** `tests/integration/db/vehiculos-migration.test.ts` cubre R23: tras aplicar, las filas
  existentes quedan activas; el `down.sql` quita la columna; `servi_app` sigue sin poder escribir
  `vehiculos`.
- [x] T1.2 **(P2)** Migración `20261103120100_vehiculo_rastro` (`migration.sql` + `down.sql`),
  `model VehiculoRastro` y su enum, clasificación en `lib/db/modelos-de-negocio.ts`, y el escritor
  único `lib/repositories/registrar-rastro-vehiculo.ts` (design §2.2). Dep.: T1.1.
  **Hecho:** `organizacion-en-modelos.guardia` verde; `tests/integration/db/vehiculos-plataforma.test.ts`
  cubre R22 (con `servi_app`, leer y escribir `vehiculo_rastro` da `42501`).

## T2 — Dominio y borde (backend_dev)

- [x] T2.1 `lib/types/vehiculos.ts`: `activo` en `VehiculoDTO`, `renombrarVehiculoSchema`,
  `cambiarActivacionVehiculoSchema` (design §4.1). Dep.: T1.1.
  **Hecho:** `tests/unit/types/vehiculos.test.ts` cubre R9 (vacío, <2, >40, campo desconocido).
- [x] T2.2 `IVehiculoRepository` + `VehiculoRepository`: `findMany({ soloActivos? })`, `rename`,
  `setActivo`, con el rastro en la misma `$transaction`. **(P1)** quitar `delete` y `contarUsos`.
  Dep.: T2.1, T1.2.
  **Hecho:** `tests/integration/db/vehiculos-plataforma.test.ts` cubre R6 (desactivar no toca
  `usuario.vehiculo_id` ni `tarifa_zona_mensajero`), R7 (superadmin sin empresa contra la base real)
  y R21 (fila de rastro solo si escribe; ninguna en el no-op).
- [x] T2.3 `IVehiculoService` + `VehiculoService`: `GESTION_ROLES = ROLES_PLATAFORMA`, `listarTodos`,
  `renombrar`, `cambiarActivacion`; `listar` sigue con `READ_ROLES`. **(P1)** quitar `borrar`.
  Dep.: T2.2.
  **Hecho:** `tests/unit/services/vehiculo-service.test.ts` cubre R4, R5 (incluido el propio nombre),
  R6 (no-op sin escribir), R10, R12, R14 (cada rol de empresa → `forbidden` sin llamar al repositorio),
  R17 (el `maestro` sigue listando) y R20 (no se llama a `historial_accion`).
- [ ] T2.4 `lib/actions/vehiculos-plataforma.ts` (design §4.3) y en `lib/modulos/reparto.ts` la action
  como `nucleo`. `lib/actions/vehiculos.ts` se queda solo con `listarVehiculos` (design §4.4).
  El servicio corre dentro de `comoPlataforma("SL-42", …)`, y el archivo entra en
  `EXCEPCIONES_DE_PLATAFORMA` de `lib/db/excepciones-aislamiento.ts` con su ficha y su motivo
  (design §3, enmienda 2026-11-04). Dep.: T2.3.
  **Misma tanda y mismo commit que T4.2** (decisión 2026-11-04): quitar las writes de
  `lib/actions/vehiculos.ts` rompe el typecheck hasta que se borra `app/(app)/configuracion/vehiculos/`.
  Sin stubs.
  **Hecho:** `tests/unit/actions/vehiculos-plataforma-action.test.ts` cubre R9 (`validation_error`
  por campo), R10 (único en carrera → `conflict`), R11 (otro fallo, p. ej. `permission denied` → `error`
  con log sin nombre ni mensaje de la base; nunca `conflict` ni `in_use`), R12 y R14 (`maestro` →
  `forbidden`, sin sesión → `unauthenticated`, en las cuatro actions).
  `tests/integration/actions/vehiculos-action.test.ts` se ajusta: solo prueba `listarVehiculos`.
  `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` verde con la entrada nueva, y
  `tests/integration/db/vehiculos-plataforma.test.ts` cubre R7 y R21 por el borde: el superadmin sin
  empresa escribe el cambio y su rastro, con el nombre del actor congelado, sin `EmpresaNoResuelta`.
- [ ] T2.5 [P] **(P1)** Retirar `vehiculo_borrado` de los escritores vivos (`lib/types/historial-accion.ts`)
  y ajustar las guardias que lo enumeran; el valor del enum se queda (design §2.3). Dep.: T2.2.
  **Hecho:** `historial-accion-escrituras-cubiertas`, `historial-accion-punto-unico` y
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` verdes.
- [ ] T2.6 [P] Guardia `superadmin-fuera-de-empresa`: `GESTION_ROLES` de `VehiculoService` en
  `EXCEPCIONES_DE_LISTA` (`soloPlataforma: true`) y `/plataforma/vehiculos` en
  `HREFS_ITEMS_PLATAFORMA`, con su contraprueba. Dep.: T2.3.
  **Hecho:** guardia verde; con `maestro` en `GESTION_ROLES` sale rojo.

## T3 — Lecturas de empresa (P3) (backend_dev + frontend_dev)

- [ ] T3.1 **(P3)** `UsuarioService.resolverVehiculo` y `PostulacionRepository.vehiculoExiste`
  rechazan un inactivo nuevo (design §4.5). Dep.: T2.2.
  **Hecho:** `tests/unit/services/usuario-vehiculo.test.ts` y
  `tests/unit/services/postulacion-mensajero-service.test.ts` cubren R18 (alta y cambio a inactivo →
  `validation_error` en `vehiculoId`; edición sin cambiar el inactivo → válida).
- [ ] T3.2 [P] **(P3)** `UsuarioForm` ofrece los activos más el actual; `app/postulacion/page.tsx`
  solo los activos. Dep.: T2.4.
  **Hecho:** `tests/unit/components/usuario-form.test.tsx` y `tests/integration/postulacion-page.test.tsx`
  cubren R17 y R18.

## T4 — Interfaz (frontend_dev)

- [ ] T4.1 `app/(app)/plataforma/vehiculos/page.tsx`, `_components/VehiculosPlataformaModule.tsx` y
  `_components/vehiculos-plataforma-textos.ts`; `MODULO_POR_RUTA` con `/plataforma/vehiculos`
  (design §5). Dep.: T2.4.
  **Hecho:** `tests/unit/components/vehiculos-plataforma-page.test.tsx` cubre R1 (404 a cada rol de
  empresa sin llamar a la action), R2 (lista activos e inactivos; un fallo de carga no se pinta como
  vacío) y R13 (un mensaje por desenlace; «ya existe» solo con `conflict`).
- [ ] T4.2 Borrar `app/(app)/configuracion/vehiculos/` y su entrada en `MODULO_POR_RUTA`. Dep.: T4.1.
  **Misma tanda y mismo commit que T2.4** (decisión 2026-11-04), sin stubs.
  **Hecho:** R16 en `vehiculos-plataforma-page.test.tsx` (la ruta no existe en `app/`).
- [ ] T4.3 [P] Menú: ítem «Vehículos» de plataforma, `IconKey` `"car"` en `Sidebar.tsx`, sale el
  subítem de «Configuración». Dep.: ninguna.
  **Hecho:** `tests/unit/auth/menu-visibility.test.ts` cubre R1 (solo el superadmin ve el ítem), R3
  (aterrizajes sin cambio) y R15 (el `maestro` no ve `/configuracion/vehiculos` en ningún ítem);
  `tests/components/Sidebar.test.tsx` verde.
- [ ] T4.4 [P] Retirar `docs/ayuda/oficina/configuracion-vehiculos.md`. Dep.: ninguna.
  **Hecho:** R19: ninguna ayuda enlaza a `/configuracion/vehiculos`; las guardias de ayuda verdes.

## T5 — Verificación y cierre

- [ ] T5.1 `e2e/dos-empresas-humo.spec.ts`: el `maestro` recibe 404 en `/configuracion/vehiculos` y el
  catálogo no cambia (R16). Dep.: T4.2.
  **Hecho:** el spec pasa en CI (`gate-completo`).
- [ ] T5.2 `progress/deudas.md`: D12 cerrada en su parte de vehículos; mapa `R<n> -> test` en
  `progress/impl_SL-42.md`; `docs/architecture.md > Multi-empresa` menciona que la edición de
  `vehiculos` es del superadmin. Dep.: T1–T5.1.
  **Hecho:** `./init.sh` verde en el worktree; los 23 requisitos
  tienen test.

## Archivos esperados

Docs y estado:
- `specs/SL-42-vehiculos-catalogo-plataforma/requirements.md`
- `specs/SL-42-vehiculos-catalogo-plataforma/design.md`
- `specs/SL-42-vehiculos-catalogo-plataforma/tasks.md`
- `progress/features/SL-42.md`
- `progress/impl_SL-42.md`
- `progress/deudas.md`
- `docs/architecture.md`
- `docs/ayuda/oficina/configuracion-vehiculos.md`

Datos:
- `db/schema.prisma`
- `db/migrations/20261103120000_vehiculo_activo/migration.sql`
- `db/migrations/20261103120000_vehiculo_activo/down.sql`
- `db/migrations/20261103120100_vehiculo_rastro/migration.sql`
- `db/migrations/20261103120100_vehiculo_rastro/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`

Backend:
- `lib/types/vehiculos.ts`
- `lib/types/historial-accion.ts`
- `lib/interfaces/repositories/IVehiculoRepository.ts`
- `lib/interfaces/services/IVehiculoService.ts`
- `lib/repositories/VehiculoRepository.ts`
- `lib/repositories/registrar-rastro-vehiculo.ts`
- `lib/repositories/PostulacionRepository.ts`
- `lib/services/VehiculoService.ts`
- `lib/services/UsuarioService.ts`
- `lib/actions/vehiculos.ts`
- `lib/actions/vehiculos-plataforma.ts`
- `lib/modulos/reparto.ts`
- `lib/auth/menu-visibility.ts`

Frontend:
- `app/(app)/plataforma/vehiculos/page.tsx`
- `app/(app)/plataforma/vehiculos/_components/VehiculosPlataformaModule.tsx`
- `app/(app)/plataforma/vehiculos/_components/vehiculos-plataforma-textos.ts`
- `app/(app)/configuracion/vehiculos/page.tsx`
- `app/(app)/configuracion/vehiculos/_components/VehiculosModule.tsx`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `app/(app)/_components/Sidebar.tsx`
- `app/postulacion/page.tsx`

Tests:
- `tests/unit/types/vehiculos.test.ts`
- `tests/unit/services/vehiculo-service.test.ts`
- `tests/unit/services/usuario-vehiculo.test.ts`
- `tests/unit/services/postulacion-mensajero-service.test.ts`
- `tests/unit/actions/vehiculos-plataforma-action.test.ts`
- `tests/unit/components/vehiculos-plataforma-page.test.tsx`
- `tests/unit/components/usuario-form.test.tsx`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`
- `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/historial-accion-punto-unico.guardia.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/components/Sidebar.test.tsx`
- `tests/integration/actions/vehiculos-action.test.ts`
- `tests/integration/db/vehiculos-migration.test.ts`
- `tests/integration/db/vehiculos-plataforma.test.ts`
- `tests/integration/postulacion-page.test.tsx`
- `e2e/dos-empresas-humo.spec.ts`
