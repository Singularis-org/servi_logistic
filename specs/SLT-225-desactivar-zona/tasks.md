# SLT-225 — Tasks

> Antes del primer gate: copiar `.env` al worktree (sin `.env` el gate se salta la integración) y
> exportar la base desechable antes de cualquier `vitest`. Cada prueba de `tests/integration/db/` se
> mata con una mutación antes de darla por buena (quitar la cláusula del `WHERE`, quitar el trigger),
> y el rojo queda anotado en `progress/impl_SLT-225.md`. Una tanda por agente.

## T0 — Impedimentos reales en producción (leader, solo lectura) — antes del PR

- [ ] Contra producción (`.env.prod`, `SET default_transaction_read_only = on`), para «GAM Kevin
  (Alajuéla)»: órdenes vivas según `WHERE_ORDEN_VIVA` (design §3.1) agrupadas por estado, usuarios
  con `zona_id` = la zona (nombre, rol, estado) y número de filas en `zona_distrito`.
- **Hecho:** números en `progress/features/SLT-225.md`, sin imprimir datos de clientes. Con ellos se
  responde la pregunta 3. Se repite el día del paso a producción.

## T1 — Migraciones y esquema (R1740, R1754, R1755-base) — sin dependencias

- [x] `db/migrations/20261123120000_historial_zona_desactivada/{migration,down}.sql` (design §1.4).
- [x] `db/migrations/20261123120100_zona_activa/{migration,down}.sql`: columna y los dos triggers
  (design §1.2).
- [x] `db/schema.prisma`: `Zona.activa` y los dos valores en `HistorialAccionTipo`.
- **Hecho:** `migrate deploy` sobre una base desechable nueva; `down.sql` de las dos aplicado y
  re-aplicado sin error; `prisma generate` y typecheck verdes.

## T2 — Catálogo del historial (R1749, R1750) — depende de T1

- [x] `lib/types/historial-accion.ts`: tupla, categoría y etiqueta (design §3.5). Ajustar los conteos
  escritos en comentarios y tests que cuenten tipos.
- **Hecho:** typecheck verde (`satisfies` y `_AsegurarExhaustivo` cierran las dos direcciones).

## T3 — Repositorio (R1741–R1748, R1752, R1753, R1759-orden) — depende de T1, T2

- [x] `IZonaRepository`: `desactivar`, `reactivar`, sus resultados y `zona_desactivada` en
  `UpdateZonaResult`.
- [x] `ZonaRepository`: `desactivar` y `reactivar` (design §3.1–3.2), `update` rechaza la zona
  desactivada (§3.3), `list` ordena y `toDTO` proyecta `activa` (§3.4).
- [x] `TarifasPantallaRepository.listarZonas`/`buscarZona` con `where: { activa: true }` (R1757).
  Comprobar si el diálogo de activar tarifas y los «faltantes» leen `listarZonas`. Si leen otra
  consulta, anotarlo en `progress/impl_SLT-225.md` y decidir con el leader.
- [x] `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: las dos entradas del
  censo (design §3.5).
- **Hecho:** `tests/integration/db/zona-desactivar.test.ts` verde y matado por mutación (ver mapa);
  `zona-repository.test.ts` y `zona-sin-distritos.test.ts` verdes sin cambiar expectativas;
  `pnpm run test:guardias` verde.

## T4 — Servicios y acciones (R1751, R1753, R1755) — depende de T3

- [x] `IZonaService`/`ZonaService`: `desactivar`, `reactivar`, y `actualizar` traduce
  `zona_desactivada`.
- [x] `lib/types/zona.ts`: `ZonaDTO.activa`, `ImpedimentosDesactivacion`, resultados, los dos mensajes y
  `opcionesZonaUsuario` (design §2.1).
- [x] `lib/actions/zonas.ts`: `desactivarZona`, `reactivarZona`.
- [x] `UsuarioService.resolverZona` con el valor actual (design §2.3).
- **Hecho:** `zona-service.test.ts`, `zonas-action.test.ts` y `usuario-zona.test.ts` verdes.

## T5 — Pantallas (R1756, R1759–R1761) — depende de T4 [P con T6]

- [ ] `ZonasModule.tsx`: marca, botones, `Modal` de desactivar/reactivar con impedimentos y el texto
  nuevo de `en_uso` (design §3.6–3.7).
- [ ] `UsuarioForm.tsx`: opciones con `opcionesZonaUsuario` (design §3.8).
- **Hecho:** `tests/components/ZonaDesactivar.test.tsx`, `ZonaBorradoMotivo.test.tsx` y
  `ZonasModuleListado.test.tsx` verdes; typecheck y lint verdes.

## T6 — Ayuda (sin R) — depende de T4 [P con T5]

- [ ] `docs/ayuda/oficina/configuracion-zonas.md`: sección «Desactivar y reactivar» (qué la impide y
  qué hacer con cada impedimento) y el texto nuevo de «Eliminar». Actualizar `actualizado`.
- **Hecho:** las guardias de ayuda verdes.

## T7 — E2E y cierre — depende de T5, T6

- [ ] `e2e/zona-desactivar.spec.ts`: el maestro intenta desactivar una zona con un usuario asignado,
  ve el nombre en la confirmación, le cambia la zona, la desactiva, ve «Desactivada», la reactiva.
- [ ] Correr en local (base desechable nueva + `next build`) ese E2E, `zonas-crear-sin-costos`,
  `zona-sin-distritos` y `dos-empresas-humo`.
- [ ] Mapa `R -> test` en `progress/impl_SLT-225.md`.
- **Hecho:** `./init.sh` verde; E2E locales verdes; mapa completo.

## Mapa R -> test

| R | Test |
|---|---|
| R1740 | `tests/integration/db/zona-desactivar.test.ts` › «la migración deja activas las zonas existentes y una zona nueva nace activa» |
| R1741 | `zona-desactivar.test.ts` › «desactivar sin impedimentos marca la zona y no toca órdenes, usuarios, tarifas ni historial previos» |
| R1742 | `zona-desactivar.test.ts` › «una orden en estado no terminal bloquea; entregada, devuelta a tienda, incidente y eliminada no» (con el conteo por estado y el tope de 20 en la muestra) |
| R1743 | `zona-desactivar.test.ts` › «un usuario asignado bloquea, también si está inactivo» |
| R1744 | `zona-desactivar.test.ts` › «una zona con distritos no se desactiva» |
| R1745 | `zona-desactivar.test.ts` › «la zona de bodega principal no se desactiva» |
| R1746 | `zona-desactivar.test.ts` › «con varios impedimentos los devuelve todos y no escribe marca ni historial» |
| R1747 | `zona-desactivar.test.ts` › «reactivar marca activa y no devuelve distritos ni usuarios» |
| R1748 | `zona-desactivar.test.ts` › «desactivar dos veces / reactivar una activa no escribe nada» |
| R1749 | `zona-desactivar.test.ts` › «deja una fila zona_desactivada en la misma transacción» + `historial-accion-escrituras-cubiertas.guardia.test.ts` |
| R1750 | `zona-desactivar.test.ts` › «deja una fila zona_reactivada» + la misma guardia |
| R1751 | `tests/unit/services/zona-service.test.ts` › «desactivar/reactivar: un no-maestro recibe forbidden y el repositorio no se llama» |
| R1752 | `zona-desactivar.test.ts` › «dos empresas: la zona de B responde not_found y las órdenes/usuarios de B no cuentan como impedimento de A» |
| R1753 | `zona-desactivar.test.ts` › «update de una zona desactivada devuelve zona_desactivada sin escribir» + `zona-service.test.ts` › «traduce zona_desactivada al mensaje» |
| R1754 | `zona-desactivar.test.ts` › «la base rechaza insertar en zona_distrito con la zona desactivada (bajo servi_app) y la carrera con la desactivación» |
| R1755 | `tests/unit/services/usuario-zona.test.ts` › «zona desactivada: rechaza la elección nueva y acepta la que ya tenía» + `zona-desactivar.test.ts` › «la base rechaza usuario.zona_id nuevo a una zona desactivada» |
| R1756 | `tests/unit/types/zona-opciones.test.ts` › «opcionesZonaUsuario deja fuera las desactivadas salvo la actual» |
| R1757 | `zona-desactivar.test.ts` › «TarifasPantallaRepository.listarZonas y buscarZona no devuelven la desactivada» |
| R1758 | `zona-desactivar.test.ts` › «listLite sigue devolviendo la zona desactivada» |
| R1759 | `tests/components/ZonaDesactivar.test.tsx` › «orden, marca y botones por estado» + `e2e/zona-desactivar.spec.ts` |
| R1760 | `ZonaDesactivar.test.tsx` › «el rechazo deja abierta la confirmación con usuarios, órdenes, distritos y bodega principal; el éxito avisa y refresca» + `e2e/zona-desactivar.spec.ts` |
| R1761 | `tests/components/ZonaBorradoMotivo.test.tsx` › «en_uso ofrece desactivar; es_central conserva su texto» |

## Tamaño

- Archivos (sin `specs/` ni `progress/`): **28** de 40 (70%).
- Producción: ~720 líneas (migraciones con `down.sql` del enum ~150, repositorio ~180, pantalla ~130,
  tipos/servicios/acciones ~200, resto ~60). Tope: 1000.
- Tests: ~1300 líneas (integración ~650, componentes ~300, E2E ~120, resto ~230). Tope: 3000.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261123120000_historial_zona_desactivada/migration.sql`
- `db/migrations/20261123120000_historial_zona_desactivada/down.sql`
- `db/migrations/20261123120100_zona_activa/migration.sql`
- `db/migrations/20261123120100_zona_activa/down.sql`
- `lib/types/historial-accion.ts`
- `lib/types/zona.ts`
- `lib/interfaces/repositories/IZonaRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/interfaces/services/IZonaService.ts`
- `lib/services/ZonaService.ts`
- `lib/services/UsuarioService.ts`
- `lib/actions/zonas.ts`
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `docs/ayuda/oficina/configuracion-zonas.md`
- `tests/integration/db/zona-desactivar.test.ts`
- `tests/integration/actions/zonas-action.test.ts`
- `tests/unit/services/zona-service.test.ts`
- `tests/unit/services/usuario-zona.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `tests/unit/types/zona-opciones.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/components/ZonaDesactivar.test.tsx`
- `tests/components/ZonaBorradoMotivo.test.tsx`
- `tests/components/ZonasModuleListado.test.tsx`
- `e2e/zona-desactivar.spec.ts`
- `specs/SLT-225-desactivar-zona/requirements.md`
- `specs/SLT-225-desactivar-zona/design.md`
- `specs/SLT-225-desactivar-zona/tasks.md`
- `progress/impl_SLT-225.md`
- `progress/features/SLT-225.md`
