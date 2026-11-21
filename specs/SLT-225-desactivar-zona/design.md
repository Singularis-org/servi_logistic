# SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» — design

## Lo que ya existe

Se buscó `desactivar zona`, `zona inactiva`, `zona_desactivada`, `activa`/`activo`, `deleted_at` en
zona, `órdenes vivas`, `sin entregar` y `cerrar bodega` en `feature_list.json`, `specs/` y el código.
El grafo no indexa este worktree, así que se buscó con Grep/Read.

- **Board.** Ninguna ficha duplica esta. «desactivar zona» solo aparece en SLT-225.
- **`zona` no tiene hoy ninguna marca de baja.** No tiene `activo`, `activa` ni `deleted_at`. Su único
  final es el borrado físico (`ZonaRepository.hardDelete`, `lib/repositories/ZonaRepository.ts:713`).
  Ese borrado devuelve `referenced` por la FK RESTRICT de `orden`, que `ZonaService.borrar` traduce a
  `conflict/en_uso`. La pantalla muestra entonces «No se puede eliminar: la zona está en uso»
  (`ZonasModule.tsx:193-199`). Ese texto es el que cambia R1761.
- **El patrón que se copia: retirar sin borrar (FICHA 374).** `provincia`/`canton`/`distrito` tienen
  `activo boolean NOT NULL DEFAULT true` (`db/schema.prisma:668-679`), con historial
  `nodo_geografico_desactivado`/`_activado` en «hace desaparecer algo»
  (`lib/types/historial-accion.ts:326-342`). Antes de retirar se cuentan las órdenes sin entregar con
  `OrdenRepository.contarSinEntregarPorNodoGeografico` (`lib/repositories/OrdenRepository.ts:2947`):
  `deletedAt: null` + `estatus.value notIn ESTADOS_TERMINALES`. **Esa es la definición de «orden
  viva» que se reutiliza (D4).** `ESTADOS_TERMINALES` se importa de
  `lib/types/order-status-transiciones.ts:475`, su única fuente (lo vigila
  `geografia-terminales-una-sola-fuente.guardia`).
- **Las dos definiciones de «viva» que NO se usan, y por qué:**
  - `ZonaRepository.contarOrdenesVivasPorZona` (FICHA 376) usa `deletedAt: null` + sin
    `cierre_detail`. Responde «¿qué flete cambiaría?». Una orden entregada que aún no entró a un
    cierre contaría como viva y bloquearía la desactivación sin motivo.
  - `whereBaseElegible` de `_shared/reconciliar-zona-ordenes.ts` (366/377, SLT-224) responde «¿qué
    orden se puede re-estampar?». Deja fuera una orden con una gestión de devolución vigente aunque
    el paquete siga viajando. Además ese archivo lo está tocando SLT-224 «Retiro a central:
    recalcular la zona de la orden» en su PR 2, y aquí no se toca.
- **Elección nueva frente a valor que ya se tenía (SL-42).** `UsuarioService.resolverVehiculo` rechaza
  un tipo de vehículo inactivo solo si `deseado !== actual` (`lib/services/UsuarioService.ts:972`).
  `resolverZona` (`:916-941`) gana la misma regla (R1755).
- **SLT-198 «Cerrar una bodega: dejar una zona sin distritos».** Al editar, una zona ya puede quedarse
  sin distritos. Es el paso con el que se despeja el impedimento de R1744. No se toca.
- **El filtro de bodegas de Cierres** (`CierresAdminRepository.findCatalogoFiltros`, `:1711`) ya deja
  fuera a toda zona que no sea la central y no tenga un `adminSatelite` en pie. Una zona desactivada
  no tiene usuarios (R1743), así que sale de ese filtro sola.
- **Consumidores de la lista de zonas**, revisados uno por uno:

| Consumidor | Dónde | Qué hace esta ficha |
|---|---|---|
| Pantalla de zonas | `ZonaRepository.list` → `listarZonas` → `ZonasModule.tsx` | Proyecta `activa` y ordena activas primero (R1759) |
| Selector de zona del usuario | `UsuarioForm.tsx:197-206` (mismo `listarZonas`) | Filtra en cliente con `opcionesZonaUsuario` (R1756) y el servidor rechaza (R1755) |
| Tarifas | `TarifasPantallaRepository.listarZonas`/`buscarZona` (`:57-63`) | `where: { activa: true }` en las dos (R1757) |
| Filtros de órdenes y entregas | `ZonaRepository.listLite` → `FiltrosOrdenesService` | Sin cambios (R1758, pregunta 1) |
| Filtros de analítica | `FiltrosOperativos.tsx` (catálogo propio) | Sin cambios (R1758) |
| Filtro de bodegas de cierres | `CierresAdminRepository.findCatalogoFiltros` | Sin cambios: ya sale sola |
| SINPE por bodega | `ZonaRepository.listarSinpe` | Sin cambios (fuera de alcance) |
| Informe de tránsito WhatsApp | `previsualizarInformeTransito` | Sin cambios (fuera de alcance) |
| Descriptivos de cierres, saldos de satélites, estado de cuenta | `CierreDiaRepository:404`, `SaldosSatelitesRepository`, `EstadoCuentaRepository:266` | Sin cambios: son historia |
| Selector de distritos al editar una zona | `GeografiaSelector.tsx` | Sin cambios: una zona desactivada no tiene distritos (R1744) y no se edita (R1753) |

## 1. Modelo de datos

### 1.1 Columna

```prisma
model Zona {
  // SLT-225 (R1740): `NOT NULL DEFAULT true`, como `activo` de la geografía (FICHA 374): toda zona
  // está activa o desactivada, y `null` no significaría nada. Se llama `activa` (femenino) y no
  // `activo`: la guardia de la 374 prohíbe el literal `activo: true` en `lib/` fuera de
  // `geografia-activa.ts`, y esta marca no es geografía.
  activa Boolean @default(true)
}
```

`organizacion_id`, RLS (`zona_por_empresa`) y el único `(organizacion_id, nombre)` ya existen y no
cambian. Una zona desactivada conserva su nombre, así que no se puede crear otra con el mismo nombre
en la misma empresa. Se acepta así: reactivarla es la salida.

No depende del país: es una marca de la empresa sobre su propia zona.

### 1.2 Triggers: la base frena lo que la app ya rechaza (R1754, R1755)

La app rechaza antes (R1753, R1755), pero la carrera con la desactivación solo la cierra la base. Hay
dos funciones `plpgsql` `SECURITY INVOKER`, ejecutadas `BEFORE INSERT OR UPDATE`:

- `zona_distrito_exige_zona_activa` en `zona_distrito`: lee
  `SELECT activa FROM zona WHERE id = NEW.zona_id FOR SHARE` y, si es `false`, lanza
  `RAISE EXCEPTION ... USING ERRCODE = 'SL225'`.
- `usuario_zona_exige_activa` en `usuario`: actúa solo si `NEW.zona_id IS NOT NULL` y además
  `TG_OP = 'INSERT' OR NEW.zona_id IS DISTINCT FROM OLD.zona_id`. Es lo mismo que «no rechaza al que
  ya la tenía». Hace el mismo `FOR SHARE` y lanza el mismo `SQLSTATE`.

**Por qué `FOR SHARE`.** La desactivación (§3.1) toma primero el bloqueo de fila de la zona con su
`UPDATE`. La escritura que compite toma `FOR SHARE` sobre la misma fila, así que una de las dos
espera a la otra:
- si la desactivación va primero, el trigger ve `activa = false` y rechaza;
- si la escritura va primero, la desactivación espera a que haga commit, y su conteo de impedimentos
  (que corre después del `UPDATE`) ya la ve y rechaza.

`FOR SHARE` pide privilegio `UPDATE` sobre `zona`, y `servi_app` ya lo tiene porque
`ZonaRepository.update` escribe ahí. La política RLS de `UPDATE` deja pasar la fila porque es de la
misma empresa (el trigger de misma empresa ya lo garantiza en las dos tablas). El implementer lo
mide con el test de R1754 bajo `servi_app`, no con el superusuario.

`orden` no lleva trigger. Una orden solo recibe zona desde `zona_distrito` (carga, API, corrección y
reconciliación colapsan por distrito, SLT-198 §«Lo que ya existe»). Una zona desactivada no tiene
distritos y R1754 impide que los reciba, así que ninguna orden nueva puede caer en ella. Un trigger
en `orden` cobraría un bloqueo por cada orden que se inserta.

### 1.3 Enum del historial

`historial_accion_tipo` gana `zona_desactivada` y `zona_reactivada`. La entidad `zona` ya existe.

### 1.4 Migraciones

La última de `origin/dev` es `20261121140100_plan_nivel`, y otra rama usa `20261122120000`.

| Carpeta | `migration.sql` | `down.sql` |
|---|---|---|
| `20261123120000_historial_zona_desactivada` | Solo los dos `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS`. Va sola porque Postgres no deja usar un valor de enum en la transacción que lo añade (55P04), como `20261107130000_historial_tope_intentos`. | Copia el patrón del `down.sql` de `20261107130000`: borra las filas con esos dos tipos, recrea el enum sin ellos y repone la columna. |
| `20261123120100_zona_activa` | `ALTER TABLE "zona" ADD COLUMN "activa" BOOLEAN NOT NULL DEFAULT true;` y las dos funciones y triggers de §1.2. | `DROP TRIGGER`/`DROP FUNCTION` de los dos y `ALTER TABLE "zona" DROP COLUMN "activa";` |

Las dos son aditivas: ninguna zona cambia de comportamiento al migrar (R1740).

## 2. Contratos

### 2.1 Tipos (`lib/types/zona.ts`)

```ts
export interface ZonaDTO { /* … lo de hoy … */ activa: boolean } // R1740/R1759

export interface ImpedimentosDesactivacion {
  esCentral: boolean;                                   // R1745
  distritos: number;                                    // R1744
  usuarios: { nombre: string; rol: string; estado: string }[]; // R1743 (etiquetas legibles)
  ordenesVivas: {                                       // R1742
    total: number;
    porEstado: { estado: OrderStatusValue; cantidad: number }[];
    muestra: string[];                                  // hasta 20: «#<guía>» o «remisión <n>»
  };
}

export type DesactivarZonaResult =
  | { status: "ok" }
  | { status: "conflict"; motivo: "impedimentos"; impedimentos: ImpedimentosDesactivacion }
  | { status: "conflict"; motivo: "ya_desactivada" }
  | Exclude<ZonaActionError, { status: "conflict" }>;

export type ReactivarZonaResult =
  | { status: "ok" }
  | { status: "conflict"; motivo: "ya_activa" }
  | Exclude<ZonaActionError, { status: "conflict" }>;

export const MSG_ZONA_DESACTIVADA_EDITAR = "Esta zona está desactivada. Reactívala para editarla."; // R1753
export const MSG_ZONA_DESACTIVADA_USUARIO = "Esa zona está desactivada; elige otra.";             // R1755

/** R1756: puro, para el selector del usuario. Activas + la que el usuario ya tiene. */
export function opcionesZonaUsuario(zonas: ZonaDTO[], zonaActualId: string | null): ZonaDTO[];
```

`lib/types/zona.ts` viaja al navegador. Por eso `ImpedimentosDesactivacion` lleva etiquetas
(nombre, rol y estado legibles) y no ids de usuario.

### 2.2 Repositorio (`IZonaRepository`)

```ts
export type DesactivarZonaRepoResult =
  | { estado: "ok" } | { estado: "not_found" } | { estado: "ya_desactivada" }
  | { estado: "bloqueada"; impedimentos: ImpedimentosDesactivacion };
export type ReactivarZonaRepoResult = { estado: "ok" } | { estado: "not_found" } | { estado: "ya_activa" };

desactivar(id: string, actorUsuarioId: string | null): Promise<DesactivarZonaRepoResult>;
reactivar(id: string, actorUsuarioId: string | null): Promise<ReactivarZonaRepoResult>;
```

`UpdateZonaResult` gana `{ estado: "zona_desactivada" }` (R1753). Un método por tipo de historial,
como pide `historial-accion-escrituras-cubiertas` («UN METODO POR TIPO»).

### 2.3 Servicio y acción

- `ZonaService.desactivar(id, actor)` y `ZonaService.reactivar(id, actor)`: `maestro` o `forbidden`
  antes de tocar el repositorio (R1751, mismo `esMaestro` que el CRUD). Traducen el resultado del
  repositorio: `bloqueada` → `conflict/impedimentos`, `ya_*` → `conflict/ya_*`.
- `ZonaService.actualizar`: `zona_desactivada` → `validation_error` con
  `fieldErrors: { nombre: [MSG_ZONA_DESACTIVADA_EDITAR] }`.
- `lib/actions/zonas.ts`: `desactivarZona(id)` y `reactivarZona(id)`, con la forma de `borrarZona`
  (zod del id, `withErrorHandler`, `deps` para tests). Son Server Actions: no hay endpoint nuevo.
- `UsuarioService.resolverZona(rolId, deseado, actual)`: si `zona.activa === false && deseado !== actual`
  devuelve `reason: "inactive"` → `MSG_ZONA_DESACTIVADA_USUARIO`. Hoy `resolverZona` no recibe el
  valor actual. Se le pasa desde `crear` (`null`) y desde `resolverZonaParaActualizar` (`actual.zonaId`).
  Lee `activa` de `findById`, que ya devuelve el `ZonaDTO`.

**Autorización:** en el servidor, en `ZonaService` (rol `maestro`). La pantalla ya es solo del
`maestro` (`docs/ayuda/oficina/configuracion-zonas.md`, `roles: [maestro]`). No depende de ningún
módulo apagable.

## 3. Comportamiento

### 3.1 `ZonaRepository.desactivar`, en una sola `$transaction`

1. `tx.zona.updateMany({ where: { id, activa: true }, data: { activa: false } })`. Toma el bloqueo
   de fila (§1.2). Si cuenta 0, un `findUnique` distingue `not_found` de `ya_desactivada` (R1748) y
   sale sin escribir.
2. Lee los impedimentos **por la misma `tx`**, cada uno con su condición en el `WHERE`:
   - `esCentral` de la fila;
   - `tx.zonaDistrito.count({ where: { zonaId: id } })`;
   - `tx.usuario.findMany({ where: { zonaId: id }, select: nombre, apellidos, rol.value, estado })`,
     sin filtrar por estado (pregunta 2);
   - `tx.orden.groupBy({ by: ["estatusId"], where: WHERE_ORDEN_VIVA(id) })` para el total y el conteo
     por estado. Luego `tx.orden.findMany({ where: WHERE_ORDEN_VIVA(id), select: { numGuia, numRemision }, orderBy: { createdAt: "asc" }, take: 20 })`.
     `WHERE_ORDEN_VIVA(id) = { zonaId: id, deletedAt: null, estatus: { value: { notIn: [...ESTADOS_TERMINALES] } } }`
     se declara una vez en el repositorio, con `ESTADOS_TERMINALES` importado.
3. Si hay algún impedimento, lanza un error centinela interno con los impedimentos. Eso deshace el
   paso 1. Fuera de la transacción se atrapa y se devuelve `bloqueada` (R1746: no queda la marca ni
   ninguna fila).
4. Si no hay ninguno: `resolverActorCongelado` + `appendAccion` con
   `{ accion: "zona_desactivada", entidadTipo: "zona", entidadId: id, entidadEtiqueta: etiquetaDeEntidad("zona", { nombre }) }`.
   `valor_anterior` y `valor_nuevo` van en NULL, como en `nodo_geografico_*`: el par de tipos ya
   dice la transición (R1749).

La empresa la ponen la extensión del cliente y la RLS en cada lectura de la `tx` (R1752). No hace
falta un `organizacion_id` a mano en el `where`, igual que en el resto de `ZonaRepository`.

### 3.2 `ZonaRepository.reactivar`

`updateMany({ where: { id, activa: false }, data: { activa: true } })`. Si cuenta 0, distingue
`not_found` de `ya_activa`. Después escribe `zona_reactivada` en la misma `tx` (R1747, R1750).

### 3.3 `ZonaRepository.update` con la zona desactivada (R1753)

Dentro de la transacción que ya existe y antes de la primera escritura, se lee
`tx.zona.findUnique({ where: { id }, select: { activa: true } })`. Si no existe, se devuelve
`not_found` como hoy. Si `activa === false`, devuelve `zona_desactivada`. No se escribe nada: ni la
N:M, ni las tarifas, ni la reconciliación. El implementer mira si una lectura de la fila que ya
exista en `update` puede llevar el campo, en vez de añadir otra.

### 3.4 `ZonaRepository.list` (R1759)

`orderBy: [{ activa: "desc" }, { nombre: "asc" }]`, y `toDTO` proyecta `activa`. `findById` también
la proyecta (la lee `UsuarioService`).

### 3.5 Historial (`lib/types/historial-accion.ts`)

- En `HISTORIAL_ACCION_TIPOS`, bloque A.2 «hace desaparecer», justo después de `zona_borrada`. Lleva
  comentario con el motivo: precedente literal de `nodo_geografico_desactivado`/`_activado`, los dos
  en la misma categoría.
- `CATEGORIA_POR_ACCION`: los dos en `hace_desaparecer`.
- `ACCION_LABELS`: «Desactivó una zona» y «Reactivó una zona».
- `historial-accion-escrituras-cubiertas.guardia`: dos entradas,
  `{ tipos: ["zona_desactivada"], metodo: "desactivar", forma: "abre_tx", mutacion: /tx\.zona\.updateMany\(/ }`
  y su gemela para `reactivar`.

### 3.6 Pantalla (`ZonasModule.tsx`), con los componentes de hoy

- `ZonasList`: si `z.activa === false`, muestra `<Badge variant="secondary">Desactivada</Badge>` (el
  mismo `Badge` de «Zona de bodega principal») y los botones «Reactivar» (`outline`) y «Eliminar».
  Si está activa: «Editar», «Desactivar» (`outline`, icono `lucide-react` `Archive`/`ArchiveRestore`)
  y «Eliminar».
- Un segundo `Modal` (`components/shared/Modal`), con el patrón del de borrado: `dismissible={false}`
  y `onConfirm` que hace `throw res` para quedarse abierto. Ante `conflict/impedimentos` guarda los
  impedimentos en estado y los pinta como `children` del `Modal`, con una lista por grupo (textos en
  §3.7). Ante éxito: `toast.success("Zona desactivada")` y `refetch()`. Reactivar usa el mismo
  `Modal` con otro título y otro texto.
- `mensajeBorradoFallido` (R1761): `en_uso` →
  «No se puede eliminar: la zona tiene historia (órdenes o usuarios). Puedes desactivarla en su lugar.»

### 3.7 Textos de los impedimentos (R1760)

Se arman en la pantalla a partir de los datos tipados. El servicio no redacta texto:

- Bodega principal: «Es la zona de bodega principal. Marca otra zona como bodega principal antes.»
- Distritos: «Tiene N distrito(s). Quítalos editando la zona.»
- Usuarios: «Tiene N usuario(s) asignado(s). Cámbiales la zona:», seguido de una línea por usuario con
  «Nombre Apellido · Rol · Estado».
- Órdenes: «Tiene N orden(es) sin terminar:», seguido de «Estado (cantidad)» por estado, con la
  etiqueta de `NOMBRE_ESTADO` (`lib/types/order-status.ts:132`, la fuente única del nombre visible),
  y «Guías: #1234, #1235… y M más.»

### 3.8 Usuarios (R1756)

`UsuarioForm.tsx:205` construye las opciones con `opcionesZonaUsuario(zonas, usuario?.zonaId ?? null)`
en vez de mapear la lista entera.

## 4. Alternativas descartadas

1. **`desactivada_at timestamptz` en vez de un booleano.** El cuándo y el quién ya los guarda la fila
   del historial (R1749). Una fecha en la zona sería una segunda fuente de esa misma información, y
   además obliga a cada lectura a escribir `IS NULL`. La geografía y los vehículos usan booleano.
2. **Quitarle los distritos a la zona al desactivarla.** Sería una escritura implícita que dispara la
   reconciliación 366/377 y mueve órdenes de zona sin que nadie lo pida. Rechazar y decir «quítalos
   editando la zona» deja ese paso a la vista, con su propio aviso de órdenes reubicadas.
3. **Borrado lógico (`deleted_at`) con un filtro global que oculte la zona.** Escondería la zona
   también en la historia: cierres, saldos, analítica y detalle de órdenes. Eso es justo lo que D1
   prohíbe.
4. **Validar solo en la app, sin triggers.** Deja abierta la carrera «alguien asigna un distrito o un
   usuario mientras otro desactiva». Este repo pone en la base lo que debe ser imposible (CHECK del
   SINPE, triggers de misma empresa).
5. **Una consulta previa de solo lectura («¿qué impide desactivar?») como acción aparte.** Daría una
   pantalla un paso más fluida, pero suma acción, método de servicio y tests, y de todos modos habría
   que volver a comprobar dentro de la transacción. La transacción ya devuelve los impedimentos en el
   rechazo.

## 5. Riesgos y notas

- **Choque de archivos con SLT-224 «Retiro a central: recalcular la zona de la orden»** (misma
  persona, PR 2 en curso): los dos tocan `lib/repositories/ZonaRepository.ts`,
  `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` y
  `tests/unit/repositories/zona-repository.test.ts`. Esta ficha no toca
  `_shared/reconciliar-zona-ordenes.ts`. Quien mergee segundo rebasa, y los cambios no se pisan
  (métodos nuevos y entradas nuevas del censo).
- **Orden eliminada y luego recuperada.** Una orden borrada no cuenta como viva (D4). Si después se
  recupera (`orden_recuperada`), queda viva en una zona desactivada. Es un caso raro y se puede ver:
  la orden sigue listándose con su zona y se corrige con los flujos de corrección de hoy. No se
  bloquea la recuperación.
- **Lo que mide T0 en producción** (solo lectura, `.env.prod`): los impedimentos reales de «GAM Kevin
  (Alajuéla)», con el conteo por estado y los usuarios. Así Carlos sabe qué mover antes de que
  llegue el botón, y la pregunta 3 se responde con números.
