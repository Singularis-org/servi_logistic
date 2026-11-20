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
| R1756 | `tests/unit/types/zona-opciones.test.ts` › «opcionesZonaUsuario deja fuera las desactivadas salvo la actual» (la pantalla, T5) |
| R1757 | `zona-desactivar.test.ts` › «R1757 — TarifasPantallaRepository.listarZonas y buscarZona no devuelven la desactivada» |
| R1758 | `zona-desactivar.test.ts` › «R1758 — listLite sigue devolviendo la zona desactivada; R1759 — list pone las activas primero» |
| R1759 | parte de datos: el mismo test (orden de `list`). Pantalla: pendiente T5 (`ZonaDesactivar.test.tsx`, E2E) |
| R1760 | pendiente T5 (frontend) |
| R1761 | pendiente T5 (frontend) |

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
(se completa al cerrar)
