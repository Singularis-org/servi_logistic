# SL-42 — Vehículos: catálogo de la plataforma · design.md

## Lo que ya existe

Buscado `vehiculo`, `vehiculos`, `catálogo de vehículos`, `superadmin`, `plataforma`, `geografía de
plataforma` en `feature_list.json`, `specs/` y el código. El grafo (`codebase-memory-mcp`) no tiene
indexado este worktree: la búsqueda de código se hizo con Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-26 «Panel de superadmin» (`cancelled`): era la ficha que iba a recibir la edición de vehículos (SL-17 D12, SL-32). SL-32 (`done`) y SL-20 (`done`): la geografía de plataforma. Ninguna otra ficha nombra vehículos de plataforma. | SL-42 recoge lo que D12 dejaba a SL-26. Sin solapamiento. |
| `specs/50-vehiculos` | El CRUD original del catálogo, del `maestro`. | Se reutiliza su servicio, repositorio, schema zod y normalización. |
| `specs/SL-17…` D12, R40 | `vehiculos` solo lectura para `servi_app`. | Se mantiene (R23). |
| `specs/SL-32…` R24–R26; `specs/SL-20…` R21, R22, R36, R37 | El patrón: pantalla `/plataforma/…`, 404 al rol de empresa, `forbidden` en el servidor, ruta vieja retirada, `conflict` solo por único. | Se copia el patrón. |
| `progress/deudas.md` D12 | «Queda abierta la parte de vehículos (SL-42)». | Se cierra con esta ficha. |
| `lib/actions/vehiculos.ts`, `lib/services/VehiculoService.ts`, `lib/repositories/VehiculoRepository.ts`, `lib/types/vehiculos.ts`, `lib/interfaces/{services/IVehiculoService,repositories/IVehiculoRepository}.ts` | CRUD del `maestro`. El `catch {}` de crear/actualizar devuelve `conflict` ante cualquier fallo, y el de borrar `in_use`: es el «ya existe» falso. | Se reutilizan servicio y repositorio; las escrituras cambian de dueño y de manejo de errores. |
| `app/(app)/configuracion/vehiculos/` | La pantalla del `maestro`. | Se borra (R16); su módulo es la base de la del superadmin. |
| `lib/actions/geografia-plataforma.ts`, `app/(app)/plataforma/geografia/page.tsx`, `lib/auth/exigir-superadmin.ts`, `lib/repositories/_shared/prisma-unique.ts` (`esViolacionDeUnico`) | El borde de plataforma: `puerta` → zod → servicio, `registrarFallo` con log sin datos. | Se copia la forma. |
| `plan_rastro` (SL-24, `20261028130000_plan`) | Rastro de plataforma de un catálogo sin país, sin FK, `REVOKE ALL FROM servi_app`. | Molde de `vehiculo_rastro` (si P2). |
| `historial_plataforma` (SL-20) | Rastro de plataforma de la geografía, con `pais_id NOT NULL`. | No sirve para vehículos (alternativa A2). |
| `docs/ayuda/oficina/configuracion-vehiculos.md` | Ayuda de la pantalla del `maestro`. | Se retira, como la de geografía en SL-20 T5.6 (R19). |
| `e2e/dos-empresas-humo.spec.ts` | Comprueba que el `maestro` no escribe desde `/configuracion/vehiculos`. | Pasa a comprobar el 404 (R16). |

## 1. Resumen

Tres movimientos:

1. **Escritura → superadmin.** Un borde nuevo, `lib/actions/vehiculos-plataforma.ts`, con la puerta de
   plataforma y errores honestos. `VehiculoService` gana `GESTION_ROLES = ROLES_PLATAFORMA` y la
   operación `cambiarActivacion`.
2. **Pantalla.** `/plataforma/vehiculos` con su ítem de menú; `/configuracion/vehiculos` se borra.
3. **Estado activo.** Columna `vehiculos.activo` y, si P3 se confirma, su efecto en las lecturas de
   empresa.

## 2. Modelo de datos

### 2.1 `vehiculos.activo` — migración `20261103120000_vehiculo_activo`

```sql
ALTER TABLE "vehiculos" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
```

- Todas las filas existentes quedan activas (R23). No hay `organizacion_id`: `vehiculos` es de
  plataforma (`lib/db/modelos-de-negocio.ts` ya lo clasifica así).
- RLS: sin cambios. La política `vehiculos_lectura` (`SELECT USING (true)` para `servi_app`) cubre la
  columna nueva, y el `REVOKE INSERT, UPDATE, DELETE` de SL-17 sigue en pie.
- Único: `vehiculos_name_key` global, sin cambios. Es un catálogo de plataforma, no de negocio: la
  regla «únicos por empresa» no aplica.
- `down.sql`: `ALTER TABLE "vehiculos" DROP COLUMN "activo";`

Prisma: `activo Boolean @default(true)` en `model Vehiculo`.

### 2.2 `vehiculo_rastro` — migración `20261103120100_vehiculo_rastro` *(solo si P2 = sí)*

Calcada de `plan_rastro`:

```sql
CREATE TYPE "vehiculo_rastro_accion" AS ENUM
  ('vehiculo_creado', 'vehiculo_renombrado', 'vehiculo_activado', 'vehiculo_desactivado');

CREATE TABLE "vehiculo_rastro" (
  "id"               TEXT PRIMARY KEY,
  "vehiculo_id"      TEXT NOT NULL,          -- opaco, sin FK
  "vehiculo_nombre"  VARCHAR(40) NOT NULL,   -- congelado; 40 = VEHICULO_NOMBRE_MAX
  "accion"           "vehiculo_rastro_accion" NOT NULL,
  "valor_anterior"   VARCHAR(40),            -- solo renombre
  "valor_nuevo"      VARCHAR(40),            -- solo renombre
  "actor_usuario_id" TEXT NOT NULL,          -- opaco, sin FK
  "actor_nombre"     VARCHAR(120) NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "vehiculo_rastro_vehiculo_id_created_at_idx" ON "vehiculo_rastro" ("vehiculo_id", "created_at");
ALTER TABLE "vehiculo_rastro" ENABLE ROW LEVEL SECURITY;   -- sin políticas
REVOKE ALL ON "vehiculo_rastro" FROM servi_app;           -- R22: los default privileges de SL-17 lo concederían
```

- Sin `organizacion_id`: es de plataforma. Se clasifica en `PLATAFORMA` de
  `lib/db/modelos-de-negocio.ts` (la guardia `organizacion-en-modelos` lo exige).
- `down.sql`: `DROP TABLE "vehiculo_rastro"; DROP TYPE "vehiculo_rastro_accion";`
- Un único escritor, `appendRastroVehiculo(tx, entrada)` en `lib/repositories/registrar-rastro-vehiculo.ts`,
  que recibe `tx` (no puede abrir su propia transacción), como `appendAccionPlataforma`.

### 2.3 Lo que se retira (si P1 = retirar)

`VehiculoRepository.delete` y `contarUsos`, `VehiculoService.borrar`, `borrarVehiculo`. El valor
`vehiculo_borrado` del enum de `historial_accion` **se queda**: hay filas históricas que lo usan. Se
quita de la lista de escritores vivos de `lib/types/historial-accion.ts` y de las guardias
`historial-accion-*` que lo enumeran, con una nota de que el valor solo se lee.

## 3. Autorización

| Operación | Dónde se valida | Quién |
|---|---|---|
| Página `/plataforma/vehiculos` | `page.tsx`: `esPlataforma(actor.rol)` o `notFound()` antes de leer (R1) | superadmin |
| `listarVehiculosPlataformaAction`, `crearVehiculoAction`, `renombrarVehiculoAction`, `cambiarActivacionVehiculoAction` | `puerta` del borde (`exigirSuperadmin`) y otra vez en `VehiculoService` con `GESTION_ROLES` (R14) | superadmin |
| `listarVehiculos` (lectura de empresa) | `VehiculoService.listar` con `READ_ROLES = ["maestro"]` (R17) | maestro |
| Postulación pública | Sin sesión, como hoy (`app/postulacion/page.tsx`) | público |

- `GESTION_ROLES = ROLES_PLATAFORMA` por import. Entra en `EXCEPCIONES_DE_LISTA` de
  `superadmin-fuera-de-empresa.guardia.test.ts` con `soloPlataforma: true` (precedente: los
  `GESTION_ROLES` de geografía, países y carga de división).
- Módulos (SL-23): `/plataforma/vehiculos` y la action `vehiculos-plataforma` son `nucleo` en
  `lib/modulos/reparto.ts`; sale `/configuracion/vehiculos`.

### Contexto de datos: sin `comoPlataforma`

El superadmin no tiene empresa, así que la extensión (`lib/db/extension-empresa.ts`, fila «ninguno»)
corre los modelos de plataforma tal cual, como dueño: puede escribir `vehiculos` y `vehiculo_rastro`
sin la envoltura `servi_app`. Si P1 retira el borrado, ninguna operación toca una tabla de negocio, y
el borde **no** llama a `comoPlataforma` ni entra en `EXCEPCIONES_DE_PLATAFORMA` (alternativa A3).
R7 se prueba en integración contra la base real con un superadmin sin empresa.

## 4. Contratos

### 4.1 Tipos (`lib/types/vehiculos.ts`)

```ts
export interface VehiculoDTO { id: string; name: string; activo: boolean }   // + activo
export const cambiarActivacionVehiculoSchema =
  z.object({ id: z.string().min(1), activo: z.boolean() }).strict();
export const renombrarVehiculoSchema =
  z.object({ id: z.string().min(1), name: nombreSchema }).strict();
```

`crearVehiculoSchema` no cambia.

### 4.2 Servicio (`IVehiculoService`)

```ts
listar(actor): ok{items} | forbidden                         // empresa: maestro (R17)
listarTodos(actor): ok{items} | forbidden                    // plataforma, activos e inactivos (R2)
crear(input, actor): ok{vehiculo} | forbidden | conflict      // R4, R10
renombrar(input, actor): ok{vehiculo} | forbidden | not_found | conflict   // R5, R10, R12
cambiarActivacion(input, actor): ok{vehiculo} | forbidden | not_found      // R6, R12
```

- `crear`, `renombrar` y `cambiarActivacion` son de `GESTION_ROLES`; `listar` sigue con `READ_ROLES`.
- Pedir el estado que ya tiene, o el mismo nombre, devuelve `ok` sin llamar al repositorio que escribe
  (R5, R6, R21).
- Con P2, el repositorio escribe el cambio y su rastro en una `$transaction`; si el `update` no alcanza
  fila, no hay rastro y el servicio responde `not_found`.

### 4.3 Server Actions (`lib/actions/vehiculos-plataforma.ts`, nuevo)

Mismo orden que `geografia-plataforma.ts`: sesión → `exigirSuperadmin` → zod → servicio.

| Action | Respuestas |
|---|---|
| `listarVehiculosPlataformaAction()` | `ok{items}` · `unauthenticated` · `forbidden` |
| `crearVehiculoAction(input)` | `ok{vehiculo}` · `validation_error{fieldErrors}` · `conflict` · `unauthenticated` · `forbidden` · `error` |
| `renombrarVehiculoAction(input)` | lo de crear + `not_found` |
| `cambiarActivacionVehiculoAction(input)` | `ok{vehiculo}` · `validation_error` · `not_found` · `unauthenticated` · `forbidden` · `error` |

`catch`: `esViolacionDeUnico(e)` → `conflict` (carrera con el único, R10); cualquier otro → `error` con
`console.error("[vehiculos-plataforma] fallo <operacion> causa=<error.name>")`, sin nombre ni mensaje
de la base (R11). Desaparece todo `catch {}` que traduce a `conflict` o `in_use`.

### 4.4 Lectura de empresa (`lib/actions/vehiculos.ts`)

Se queda solo `listarVehiculos` (la usa `UsuarioForm`). `crearVehiculo`, `actualizarVehiculo` y
`borrarVehiculo` salen del archivo: el `maestro` ya no tiene por dónde escribir, y R14 se prueba
contra las actions de plataforma con un actor `maestro`.

### 4.5 P3 en las lecturas de empresa (si se confirma)

- `listarVehiculos` devuelve `activo`. `UsuarioForm` ofrece los activos más el que ya tiene el
  usuario que se edita.
- `app/postulacion/page.tsx` ofrece solo los activos (`findMany({ soloActivos: true })`).
- `UsuarioService.resolverVehiculo` y `PostulacionRepository.vehiculoExiste` rechazan un vehículo
  inactivo con `validation_error` en `vehiculoId`, salvo en la edición si es el que ya tenía.
- La asignación de órdenes no mira `activo`.

## 5. Interfaz

- `app/(app)/plataforma/vehiculos/page.tsx` (Server Component): `notFound()` si no es plataforma;
  carga con `listarVehiculosPlataformaAction` y pasa `cargaError` como bandera al módulo (decisión 13
  de SL-20: un fallo no se pinta como vacío, R2).
- `app/(app)/plataforma/vehiculos/_components/VehiculosPlataformaModule.tsx`: tabla con nombre y
  estado; «Crear vehículo»; por fila, «Renombrar» y «Desactivar»/«Activar». Parte del
  `VehiculosModule` actual, sin borrar. Mensajes por desenlace (R13) en
  `vehiculos-plataforma-textos.ts`.
- Menú (`lib/auth/menu-visibility.ts`): ítem «Vehículos», `href: "/plataforma/vehiculos"`,
  `roles: ROLES_PLATAFORMA` por identidad, sin subítems, después de «Geografía» y antes de
  «Mi bodega». `IconKey` gana `"car"` (lucide `Car`, ya en el repo con `lucide-react`) en `Sidebar.tsx`:
  la unión es cerrada y `truck` es de «Entregas». Sale el subítem `/configuracion/vehiculos`.
- La guardia `superadmin-fuera-de-empresa` añade `/plataforma/vehiculos` a `HREFS_ITEMS_PLATAFORMA`.

## 6. Datos que dependen del país

Ninguno. El catálogo de vehículos es uno solo para todas las empresas y todos los países (D12).

## 7. Dependencias

Ninguna librería nueva.

## 8. Alternativas descartadas

- **A1. Dejar `/configuracion/vehiculos` al `maestro` en solo lectura.** Era la salida de SL-17 D12
  («solo lectura o falla cerrado»). Descartada: Carlos decidió el 2026-10-23 quitar el submódulo y la
  ruta, y una pantalla de solo lectura de un catálogo que el `maestro` ya ve en el formulario de
  usuarios no aporta nada.
- **A2. Registrar las acciones en `historial_plataforma` (SL-20).** Descartada: `pais_id` es
  `NOT NULL` con FK a `pais`, y sus índices y su lectura van por país. Hacerla nulable rompe esa
  invariante para dar sitio a una entidad que no es de ningún país. `plan_rastro` ya fijó el
  precedente de un rastro propio para un catálogo de plataforma sin país.
- **A3. Envolver el borde en `comoPlataforma`, como `geografia-plataforma.ts`.** Descartada si P1
  retira el borrado: allí hace falta porque el conteo lee `orden`, que es de negocio. Aquí ninguna
  operación toca negocio, y añadir una excepción a `EXCEPCIONES_DE_PLATAFORMA` (lista que solo debe
  bajar) sin necesidad la haría crecer. Si P1 conserva el borrado, esta alternativa vuelve.
- **A4. Mantener las writes en `lib/actions/vehiculos.ts` cambiando su rol.** Descartada: mezcla en
  un archivo una lectura de empresa y escrituras de plataforma, y el reparto por módulo
  (`MODULO_POR_ACTION`) y las guardias de plataforma trabajan por archivo.

## 9. Riesgos

- **Guardias que enumeran rutas o escritores.** `menu-visibility.test.ts`, `Sidebar.test.tsx`,
  `historial-accion-*.guardia` y las de módulos nombran `/configuracion/vehiculos` o
  `vehiculo_borrado`. Se ajustan en la misma tanda que el cambio que las mueve.
- **E2E de humo.** `dos-empresas-humo.spec.ts` deja de poder crear desde la pantalla del `maestro`;
  pasa a afirmar el 404 y que el catálogo no cambia.
- **P3 sin respuesta.** Sin P3, la columna `activo` existe pero las empresas siguen ofreciendo los
  inactivos: desactivar no tendría efecto visible fuera de la pantalla del superadmin.
