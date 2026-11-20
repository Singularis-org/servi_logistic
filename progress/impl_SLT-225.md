# impl SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» — tanda backend

Tanda: T1–T4 de `specs/SLT-225-desactivar-zona/tasks.md` (backend_dev). T5 (pantallas), T6 (ayuda) y
T7 (E2E) quedan para el frontend_dev; T0 es del leader.

## Archivos

Producción:
- `db/migrations/20261123120000_historial_zona_desactivada/{migration,down}.sql` — dos valores del enum.
  El down borra sus filas (como el de 20261107130000) y recrea el enum con la función dinámica de SLT-211.
- `db/migrations/20261123120100_zona_activa/{migration,down}.sql` — columna `activa` y los triggers
  `zona_distrito_exige_zona_activa` / `usuario_zona_exige_activa` (`FOR SHARE`, SQLSTATE `SL225`).
- `db/schema.prisma` — `Zona.activa`, `zona_desactivada`, `zona_reactivada`.
- `lib/types/historial-accion.ts` — tupla (90), categoría «hace desaparecer», etiquetas.
- `lib/types/zona.ts` — `ZonaDTO.activa`, `ImpedimentosDesactivacion`, `MUESTRA_ORDENES_VIVAS`,
  `DesactivarZonaResult`, `ReactivarZonaResult`, los dos mensajes, `opcionesZonaUsuario`.
- `lib/interfaces/repositories/IZonaRepository.ts`, `lib/repositories/ZonaRepository.ts` — `desactivar`,
  `reactivar`, `update` rechaza la desactivada, `list` ordena activas primero, `toDTO` proyecta `activa`.
- `lib/repositories/TarifasPantallaRepository.ts` — `listarZonas`/`buscarZona` con `activa: true`.
- `lib/interfaces/services/IZonaService.ts`, `lib/services/ZonaService.ts` — `desactivar`, `reactivar`,
  `actualizar` traduce `zona_desactivada`.
- `lib/services/UsuarioService.ts` — `resolverZona(rolId, deseado, actual)` con `reason: "inactive"`.
- `lib/actions/zonas.ts` — `desactivarZona`, `reactivarZona` (anotadas `@sin-superficie` hasta T5).

Tests nuevos: `tests/integration/db/zona-desactivar.test.ts` (17), `tests/unit/types/zona-opciones.test.ts` (3);
casos nuevos en `zona-service.test.ts` (5 + 4 del `it.each`), `zonas-action.test.ts` (6), `usuario-zona.test.ts` (4).

Tests tocados por arrastre (sin cambiar lo que afirman): los 8 `historial-accion-*-migration` / `caja-459`
(los dos tipos nuevos al final del enum), `catalogo-y-choke-point` (90 tipos, 14 en «hace desaparecer»),
la guardia `historial-accion-escrituras-cubiertas` (dos entradas del censo y 90), y `activa: true` /
`desactivar`/`reactivar` en los dobles de 13 archivos de `tests/` (incluidos 5 de componentes: solo el
literal del DTO, ninguna aserción).

## Decisiones tomadas aquí

- **`usuarios[].rol` y `.estado` viajan como VALOR (`RolValue`, `EstadoUsuario`), no como texto.** El
  design decía «etiquetas legibles»; la de estado vive en `app/(app)/configuracion/_components/usuario-estado-label.ts`
  (capa de pantalla) y el repositorio no debe importar de `app/`. La pantalla los etiqueta con
  `ROL_LABELS` (`lib/auth/rol-label.ts`) y `ESTADO_LABELS`, que ya son la fuente única. Sigue sin ids.
- **`porEstado`** va ordenado por cantidad desc y, a igualdad, por valor; la **muestra** por `createdAt` asc.
- **`activa === false`** (y no `!activa`) en `update` y en `resolverZona`: la columna es NOT NULL, así que
  en producción es lo mismo, y los dobles de unit que no declaran `activa` siguen describiendo una zona
  activa (lo que eran). Medido: con `!activa` se ponían rojos 27 tests de `zona-repository.test.ts`.
- **`ZonaService.actualizar`** cuelga `MSG_ZONA_DESACTIVADA_EDITAR` de `fieldErrors.nombre` (design §2.3).
- El trigger de `usuario` es `BEFORE INSERT OR UPDATE OF "zona_id"`: un guardado que no toca la zona ni
  siquiera entra a la función; la función repite la condición `IS DISTINCT FROM` por si alguien amplía el evento.
- **T3, «faltantes» de Tarifas:** `TarifasPantallaService.faltantesPorZona` (diálogo de activar tarifas)
  lee el mismo `listarZonas`, así que una zona desactivada tampoco aparece ahí. Es coherente: no tiene
  distritos (R1744) ni recibe trabajo. Lo anoto para el leader; no cambia nada más.

## Contrato para la UI (T5)

```ts
desactivarZona(id: unknown, deps?): Promise<DesactivarZonaResult>
// { status: "ok" }
// | { status: "conflict"; motivo: "impedimentos"; impedimentos: ImpedimentosDesactivacion }
// | { status: "conflict"; motivo: "ya_desactivada" }
// | validation_error | unauthenticated | forbidden | not_found
reactivarZona(id: unknown, deps?): Promise<ReactivarZonaResult>
// { status: "ok" } | { status: "conflict"; motivo: "ya_activa" } | validation_error | unauthenticated | forbidden | not_found
ImpedimentosDesactivacion = {
  esCentral: boolean; distritos: number;
  usuarios: { nombre: string; rol: RolValue; estado: EstadoUsuario }[];
  ordenesVivas: { total: number; porEstado: { estado: OrderStatusValue; cantidad: number }[]; muestra: string[] };
}
```
`actualizarZona` sobre una desactivada: `validation_error` con `fieldErrors.nombre = [MSG_ZONA_DESACTIVADA_EDITAR]`.
`listarZonas` trae `activa` en cada `ZonaDTO`, activas primero. `opcionesZonaUsuario(zonas, usuario?.zonaId ?? null)`
para el selector del usuario. Al montar los botones hay que **quitar las dos anotaciones `@sin-superficie`**
de `lib/actions/zonas.ts` (la guardia `superficie-de-uso` exige quitarlas cuando la acción es alcanzable).

## Mapa R → test

| R | Test |
|---|---|
| R1740 | `tests/integration/db/zona-desactivar.test.ts` › «R1740 — la migración deja activas las zonas existentes y una zona nueva nace activa» |
| R1741 | `zona-desactivar.test.ts` › «R1741 + R1749 — desactivar sin impedimentos marca la zona y no toca órdenes, usuarios, tarifas ni historial previos…» |
| R1742 | `zona-desactivar.test.ts` › «R1742 — una orden en estado no terminal bloquea; entregada, devuelta a tienda, incidente y eliminada no» |
| R1743 | `zona-desactivar.test.ts` › «R1743 — un usuario asignado bloquea, también si está inactivo» |
| R1744 | `zona-desactivar.test.ts` › «R1744 — una zona con distritos no se desactiva» |
| R1745 | `zona-desactivar.test.ts` › «R1745 — la zona de bodega principal no se desactiva» |
| R1746 | `zona-desactivar.test.ts` › «R1746 — con varios impedimentos los devuelve todos y no escribe marca ni historial» + `zonas-action.test.ts` › «R1746: el rechazo por impedimentos llega con TODOS ellos, tal cual» |
| R1747 | `zona-desactivar.test.ts` › «R1747 + R1750 — reactivar marca activa, deja una fila zona_reactivada y no devuelve distritos ni usuarios» |
| R1748 | `zona-desactivar.test.ts` › «R1748 — desactivar dos veces / reactivar una activa no escribe nada» + `zona-service.test.ts` › «ya_desactivada / ya_activa / not_found se traducen a su status» |
| R1749 | `zona-desactivar.test.ts` › «R1741 + R1749 …» + `historial-accion-escrituras-cubiertas.guardia.test.ts` (entrada `desactivar`) |
| R1750 | `zona-desactivar.test.ts` › «R1747 + R1750 …» + la misma guardia (entrada `reactivar`) |
| R1751 | `tests/unit/services/zona-service.test.ts` › «R1751: desactivar/reactivar con rol %o -> forbidden y el repositorio no se llama» + `zonas-action.test.ts` › «R1751: con el ZonaService real, un admin recibe forbidden…» |
| R1752 | `zona-desactivar.test.ts` › «R1752 — dos empresas: la zona de B responde not_found…» (bajo `servi_app`) |
| R1753 | `zona-desactivar.test.ts` › «R1753 — update de una zona desactivada devuelve zona_desactivada sin escribir» + `zona-service.test.ts` › «R1753: actualizar traduce zona_desactivada al mensaje» |
| R1754 | `zona-desactivar.test.ts` › «R1754 — la base rechaza insertar en zona_distrito con la zona desactivada (bajo servi_app)» + «la desactivación va primero…» + «el distrito va primero…» (dos conexiones reales) |
| R1755 | `tests/unit/services/usuario-zona.test.ts` › bloque «SLT-225 — zona desactivada (R1755)» (4) + `zona-desactivar.test.ts` › «R1755 — la base rechaza usuario.zona_id nuevo…» |
| R1756 | `tests/unit/types/zona-opciones.test.ts` › «opcionesZonaUsuario deja fuera las desactivadas salvo la actual» + `tests/unit/components/usuario-form.test.tsx` › «SLT-225 (R1756)…» (2: la de otra zona no aparece; la propia se conserva y sale preseleccionada) |
| R1757 | `zona-desactivar.test.ts` › «R1757 — TarifasPantallaRepository.listarZonas y buscarZona no devuelven la desactivada» |
| R1758 | `zona-desactivar.test.ts` › «R1758 — listLite sigue devolviendo la zona desactivada; R1759 — list pone las activas primero» |
| R1759 | `zona-desactivar.test.ts` › «R1758 — listLite… ; R1759 — list pone las activas primero» (datos) + `tests/components/ZonaDesactivar.test.tsx` › «orden, marca y botones por estado» + `e2e/zona-desactivar.spec.ts` |
| R1760 | `tests/components/ZonaDesactivar.test.tsx` › «el rechazo deja abierta la confirmación con usuarios, órdenes, distritos y bodega principal; el éxito avisa y refresca» + «un impedimento solo nombra ese, con singular» + «reactivar pide confirmación, avisa y refresca» + `e2e/zona-desactivar.spec.ts` |
| R1761 | `tests/components/ZonaBorradoMotivo.test.tsx` › «R1761 — en_uso ofrece desactivar; es_central conserva su texto» (+ el caso `es_central` del mismo archivo) |

## Mutaciones (cada una aplicada, test corrido, restaurada; hash de `git diff -- lib` igual antes y después)

Base desechable `servi_slt225_impl` (creada nueva + `migrate deploy` + seed). `zona-desactivar.test.ts` corre
sus 17 casos sin saltos en cada corrida (17 = 17 en el conteo de vitest).

| Mutación | Rojo |
|---|---|
| M1 `whereOrdenViva` sin `deletedAt: null` | 1 (R1742) |
| M2 `whereOrdenViva` sin `notIn ESTADOS_TERMINALES` | 2 (R1741, R1742) |
| M3 usuarios con `estado: "activo"` en el `WHERE` | 1 (R1743) |
| M4 `update` sin la guarda `zona_desactivada` | 1 (R1753) |
| M5 centinela cambiado por `return bloqueada` (la marca no se revierte) | 6 (R1742–R1746…) |
| M6 `TarifasPantallaRepository.listarZonas` sin `activa: true` | 1 (R1757) |
| M7 `list` ordenado solo por nombre | 1 (R1758/R1759) |
| M8 `resolverZona` sin el rechazo `inactive` | 2 (usuario-zona R1755) |
| M9 `ZonaService.desactivar` sin gate `maestro` | 5 (R1751, servicio y acción) |
| M10 `hayImpedimentos` sin `esCentral` | 1 (R1745) |
| M11 conteo de distritos a 0 | 3 (R1744, R1746, carrera «el distrito va primero») |
| T1 `DROP TRIGGER zona_distrito_exige_zona_activa` (en la base) | 3 (R1754 y las dos carreras) |
| T2 `DROP TRIGGER usuario_zona_exige_activa` | 1 (R1755 base) |
| T3 función del trigger de distritos sin `FOR SHARE` | 2 (las dos carreras) |

Los triggers se repusieron tras cada mutación (`pg_trigger` = 2, `FOR SHARE` presente) y la suite volvió a verde.

## Verificación

- `migrate deploy` sobre base nueva: verde. `down.sql` de 20261123120100 y luego de 20261123120000 aplicados
  (columna 0, valores del enum 0) y re-aplicados con `migrate deploy`: verde.
- `prisma generate` corrido en este worktree: escribe en el cliente COMPARTIDO de la raíz. Otra sesión lo
  regeneró dos veces con su schema mientras trabajaba (00:00 y 00:11, sin `activa`); cada corrida de tests
  de esta tanda regenera antes.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): verde (sin la memoria extra muere por heap).
- lint de los archivos tocados: 0 errores (1 warning previo, `normalizeName` sin uso en `ZonaRepository.ts`, ya en HEAD).
- Tests de la tanda (28 archivos): `Test Files 28 passed (28) · Tests 581 passed (581)`, sin saltos.
- Gate: ver «Gate» abajo.

## Gate

`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` contra `servi_slt225_impl` (exportada como `DATABASE_URL`):

1. Primera corrida (40 archivos): typecheck ✓, lint ✓ (0 errores), guardias del arnés ✓; `test:rapido` rojo en
   `orden-traspaso-migration` (lista fija de migraciones: arreglado en e0b340db) y en tres archivos de
   zonas por **cliente de Prisma ajeno** (`PrismaClientValidationError: activa`). `INIT_EXIT=1`.
2. Segunda corrida: `INIT_EXIT=1` en el chequeo de tamaño, antes de los tests:
   «el PR de esta feature pasa del tamano maximo (41/40 archivos, 669/1000 lineas de produccion, 903/3000 de
   tests)». 14 archivos de producción y 27 de tests, de los que ~21 son arrastre (listas fijas del enum,
   conteos del catálogo, `activa`/`desactivar` en dobles). Con T5–T7 llegará a ~48. Pide el OK escrito de
   Carlos (`<!-- tamano-pr-aceptado: ... -->` en `progress/features/SLT-225.md`); no lo anoto yo.
3. `test:rapido` y `test:guardias` corridos a mano tras el chequeo: guardias 357/360 archivos verdes; los 3
   rojos (`zona-central-guarda-y-rastro`, `zona-guardado-conserva-costos`, `zona-guardado-conserva-inactivos`)
   y los 3 timeouts de 20 s del rápido (`cierres-gestiones-modelo-nuevo-descarga-sql-real`,
   `corte-diario-segundo-cierre-sql-real`, `historial-accion-migration`) **pasan aislados** con el cliente
   bueno: `Test Files 4 passed (4) · Tests 39 passed` y `Test Files 4 passed (4) · Tests 44 passed`.

**Bloqueo de entorno:** el cliente de Prisma vive en el `node_modules` compartido y otra sesión
(`.worktrees/SLT-224-zona-al-retirar-a-central`, proceso `prisma generate` visto a las 00:48) lo regeneró
con su schema cuatro veces durante la tanda (00:00, 00:11, 00:31, 00:48). Cada vez los tests de zonas de
esta rama caen con `PrismaClientValidationError`, y mis `prisma generate` le hacen lo mismo a esa rama.
El gate completo tiene que correrse cuando SLT-224 no esté generando.

---

# Tanda frontend (T5–T7, frontend_dev, 2026-11-20)

## Archivos
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx` — marca «Desactivada», botones por estado
  (activa: Editar/Desactivar/Eliminar; desactivada: Reactivar/Eliminar), un `Modal` para desactivar y
  reactivar (`dismissible={false}`, `throw res` para quedarse abierto) con `ImpedimentosLista` (`role="alert"`),
  texto nuevo de `en_uso`. Rol y estado de usuario con `ROL_LABELS`/`ESTADO_LABELS`; el estado de la orden con
  `EstadoConInfo` (la guardia `estado-con-info` prohíbe pintar `NOMBRE_ESTADO` suelto: lo pilló el rápido).
  `ya_desactivada`/`ya_activa` avisan con `toast.info` y refrescan.
- `app/(app)/configuracion/_components/UsuarioForm.tsx` — opciones con `opcionesZonaUsuario(zonas, usuario?.zonaId ?? null)`.
- `lib/actions/zonas.ts` — quitadas las dos `@sin-superficie`.
- `docs/ayuda/oficina/configuracion-zonas.md` — «Desactivar y reactivar» con tabla impedimento → qué hacer; «Eliminar» nuevo.
- `e2e/zona-desactivar.spec.ts` (nuevo) y `playwright.config.ts` (proyecto `aislamiento`).
- Tests: `tests/components/ZonaDesactivar.test.tsx` (nuevo, 5), `ZonaBorradoMotivo.test.tsx` (texto R1761),
  `tests/unit/components/usuario-form.test.tsx` (`activa` en el doble + 2 casos R1756).

## Mutaciones (aplicadas, corridas, restauradas)
- `UsuarioForm` sin `opcionesZonaUsuario` → rojo «la desactivada no aparece» (R1756).
- `throw res` → `return` tras guardar impedimentos → rojo R1760 (2 casos).
- Sin el `Badge` «Desactivada» → rojo R1759.

## E2E local
Base nueva `servi_slt225_e2e` (crear + `migrate deploy` + `db:seed`), `next build` con
`NEXT_PUBLIC_APP_URL=http://localhost:3361`, `E2E_PUERTO=3361`, `--project=aislamiento --no-deps`:
`zona-desactivar`, `zonas-crear-sin-costos`, `zona-sin-distritos`, `dos-empresas-humo` → **11 passed (1.3m)**.
La primera corrida cayó en `zona-desactivar`: cambiar la zona del único Admin satélite abre el aviso de la
FICHA 379; el spec ahora pulsa «Continuar» (es determinista, no inestable).
(El build y el E2E se hicieron antes de cambiar `NOMBRE_ESTADO` por `EstadoConInfo`; el spec solo
recorre el impedimento de usuario, que ese cambio no toca.)

## Verificación (base `servi_slt225_impl` exportada como `DATABASE_URL`)
- `pnpm run typecheck` (8 GB): TC_EXIT=0. `pnpm run lint`: 0 errores (249 warnings previos, ninguno en
  archivos de la tanda); eslint de los 8 archivos tocados tras el último cambio: LINT_EXIT=0.
- Componentes: `ZonaDesactivar` + `ZonaBorradoMotivo` + `ZonasModuleListado` 19/19; con la guardia
  `estado-con-info` 22/22; `usuario-form.test.tsx` 40/40.
- `pnpm run test:guardias`: GUARDIAS_EXIT=0, `Test Files 360 passed (360) · Tests 5425 passed | 1 skipped`.
- `pnpm run test:rapido` (665 archivos en lotes de 100; se corta en el primer lote rojo), cinco corridas:
  1. lote 2 «Worker exited unexpectedly» (Windows). 2. lotes 1–4 verdes; lote 5 rojo REAL en
  `estado-con-info.guardia` → arreglado (`EstadoConInfo`). 3. lote 2 worker. 4. lotes 1–2 verdes, lote 3
  timeout 20 s en `orden-traspaso-migration` (aislado: 15/15 verde). 5. lote 2 worker. RAPIDO_EXIT=1 en
  la última. Los lotes 5–7 son solo guardias (`tests/unit/guards/…`), verdes las 360 en `test:guardias`.
- `./init.sh` (8 GB): INIT_EXIT=1 por el chequeo de tamaño (48/40 archivos, 941/1000 producción,
  1385/3000 tests), antes de los tests. La marca de aceptación no la puso esta tanda (ver informe).

Veredicto: T5–T7 hechas; E2E local verde; falta la marca de tamaño para que `init.sh` salga verde.

## Tanda 2026-11-20 — merge de dev y menores de la review
- Merge de origin/dev (SLT-224 #257, SLT-221 #258): conflictos en `tests/integration/db/orden-traspaso-migration.test.ts` (ambas listas) y en el contador del Histórico (90 = 88 + 2). Sin renumerar: 20261123120000/100 siguen últimas.
- m1: `tests/integration/db/zona-desactivar.test.ts` (R1755) reescribe la MISMA `zonaId`. Mutación C (sin la salida «ya tenía esa zona» del trigger de usuario, aplicada en la base servi_slt225_impl y restaurada): rojo.
- m3: `docs/ayuda/oficina/configuracion-zonas.md`, tabla de impedimentos en tuteo.
- Gate: `./init.sh` INIT_EXIT=0; `zona-repository.test.ts` + `zona-desactivar.test.ts`: 78/78.
- Veredicto: lista para PR.
