# SLT-48 — geo-jerarquica-contract · design.md

> Requisitos: `requirements.md` (R1–R49). Escrito por `spec_author` el 2026-11-17 sobre la rama
> `feature/SLT-48-geo-jerarquica-contract` (pila geo hasta SLT-125). El MCP del grafo no tenía indexado
> este worktree: la exploración se hizo con Grep y Read, sobre el inventario previo del leader
> (`slt48-inventario.md` en el scratchpad de la sesión). Las preguntas P1–P5 siguen abiertas; donde el
> diseño depende de ellas, dice qué propone y qué cambia si la respuesta es otra.

## Lo que ya existe

Buscado en el board (`feature_list.json`), en `specs/` y en el código con `vista geografía`, `mover nodo`,
`padre_id`, `lugarDeLaOrden`, `fksDeNodo`, `país aún no habilitado`, `sincronía`.

- **Board.** Nadie más cubre vistas, mover nodos ni más de 3 niveles. Relacionadas sin solaparse:
  SLT-196 «Geografía jerárquica: borrar el modelo viejo» (el deploy 2, después de este), SLT-57
  «Tarifas flexibles: retirar el modelo viejo» (otra épica), SLT-82 «Geografía multipaís: código postal,
  zonas por polígono y fuente oficial por país», SLT-183 «Usuarios propios en tests de geografía, avisos y
  migraciones» y SLT-187 «Tests de migración desfasados tras SL-17» (pueden chocar en
  `tests/integration/db/geografia-*`), SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER»
  (toca funciones de trigger).
- **Specs.** Los compromisos «hasta SLT-48» de SLT-43, 44, 45, 46, 47, 65, 71, 89 y 125 están
  inventariados. Este spec toma los del deploy 1 y deja los de borrado a SLT-196.
- **Código que se reutiliza:**
  - el catálogo en memoria (`CatalogoGeograficoRepository`, `geografia-dominio.ts`: `ancestros`,
    `estaActivo`, `zonaQueCubre`, `esZonaEspecial`);
  - la ruta del lugar (`_shared/ruta-del-lugar.ts`), que ya alimenta todas las superficies de SLT-125.
    Cambiar `lugarDeLaOrden` cambia todas a la vez;
  - el patrón de escritura con «antes» y `updateMany` condicionado de `GeoRepository.renombrar`, que
    sirve para mover;
  - `appendAccionPlataforma` y el historial de plataforma;
  - los scripts `geo:equivalencia-*` y `geo:explain-*`, que comparan la lectura congelada por las FK
    contra la nueva. Sobre una copia con esta feature aplicada, las órdenes viejas conservan sus FK, así
    que los mismos scripts sirven de equivalencia (R30, R33);
  - `columnasGeoDePlantilla` (`lib/utils/plantilla-geo.ts`, SLT-45), que ya arma una columna por nivel;
  - el índice de `orden.nodo_geografico_id` (`schema.prisma`, SLT-43).
- **Lo que no existe y se crea:** vistas (ninguna migración del repo crea una), mover un nodo, la regla de
  hoja, el valor `nodo_geografico_movido` del historial de plataforma.

## 1. Resumen

Una migración convierte las tablas viejas en vistas sobre `nodo_geografico`. Para eso quita lo que lo
impide: las FK hacia ellas, el NOT NULL de dos FK de la orden y los triggers de sincronía. La orden deja
de escribir sus 3 FK y todo lector pasa a su nodo. La regla de guardado de SLT-45 («profundidad 2 o 3 de
un país de 3 niveles») se cambia por la regla de hoja. El superadmin gana «mover nodo». Las pantallas
de N niveles esperan una maqueta aprobada.

Orden de las tandas: **T0** maqueta (en paralelo) → **T1** base y Prisma → **T2** servidor (escrituras,
lectores, tarifas) → **T3** mover nodo (servidor) → **T4** pantallas → **T5** tests que escriben tablas
viejas → **T6** E2E → **T7** cierre.

## 2. Modelo de datos

### 2.1 Migraciones

Dos carpetas nuevas, con timestamps posteriores a la última migración de la pila al implementar
(se proponen `20261117120000` y `20261117120100`; el implementer los ajusta si chocan con `dev`).

1. **`20261117120000_slt48_historial_nodo_movido`**: solo
   `ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'nodo_geografico_movido';`.
   Va sola porque un valor de enum nuevo no se puede usar en la misma transacción. Su `down.sql`
   recrea el tipo sin el valor, con el patrón de las migraciones de enum del repo (falla si quedan filas
   con ese valor).
2. **`20261117120100_slt48_geografia_vieja_a_vistas`**: todo lo demás, en este orden y en una
   transacción:
   1. **Precondición (R6).** Un bloque `DO` cuenta las filas con `nodo_geografico_id IS NULL` en `orden`
      (todas, incluidas las de `deleted_at`), `zona_distrito` y `distrito_zona_especial`. Si alguna cuenta
      no es 0, `RAISE EXCEPTION` con las tres cuentas. En producción el backfill de SLT-43 ya corrió; si
      no, la migración no entra.
   2. **FK (R4).** `DROP CONSTRAINT` de `orden_provincia_id_fkey`, `orden_canton_id_fkey`,
      `orden_distrito_id_fkey`, `zona_distrito_distrito_id_fkey` y la de
      `distrito_zona_especial.distrito_id` (nombre exacto sacado del catálogo de la base al implementar).
      `ALTER COLUMN provincia_id DROP NOT NULL` y lo mismo con `canton_id` en `orden`.
   3. **Sincronía (R5).** `DROP TRIGGER` y `DROP FUNCTION` de: `provincia_sincroniza_nodo_geografico`,
      `canton_…`, `distrito_…` y sus `geo_sincronizar_*()` (`20261104120300`); y
      `nodo_geografico_copia_a_geografia_vieja` y `geo_copiar_nodo_a_geografia_vieja()`
      (`20261106120100`). También los triggers que viven sobre las tablas viejas y mueren con ellas
      (`canton_pais_del_padre`, `distrito_pais_del_padre`).
   4. **`orden_nodo_geografico` (R9).** `CREATE OR REPLACE FUNCTION` con este cuerpo: si `NEW` trae nodo,
      se conserva; si no lo trae y trae alguna FK, el nodo es `COALESCE(distrito_id, canton_id)`; si no
      trae nada, queda NULL (el NOT NULL es de SLT-196). Desaparece la búsqueda «subiendo» de SLT-89, que
      solo hacía falta mientras las FK eran la fuente. El trigger pasa a `BEFORE INSERT OR UPDATE OF
      nodo_geografico_id, provincia_id, canton_id, distrito_id`, igual que hoy.
   5. **`geografia_del_pais_de_la_empresa` (R7, R8).** `CREATE OR REPLACE FUNCTION`: en `orden` compara
      el país de `nodo_geografico.pais_id` del nodo con el país de la empresa. En `zona_distrito` y
      `distrito_zona_especial` usa `COALESCE(NEW.nodo_geografico_id, NEW.distrito_id)`, porque el trigger
      `BEFORE` que copia `distrito_id` → nodo puede correr después (los triggers del mismo momento corren
      por orden alfabético de nombre). Mismo `SQLSTATE 'SL021'`.
   6. **Tablas → vistas (R1–R3).** `DROP TABLE` de `distrito`, `canton` y `provincia` (en ese orden; ya
      no tienen dependientes) y:
      ```sql
      CREATE VIEW "provincia" WITH (security_invoker = true) AS
        SELECT n.id, n.nombre, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
        FROM nodo_geografico n WHERE n.profundidad = 1;
      CREATE VIEW "canton" WITH (security_invoker = true) AS
        SELECT n.id, n.nombre, n.padre_id AS provincia_id, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
        FROM nodo_geografico n WHERE n.profundidad = 2;
      CREATE VIEW "distrito" WITH (security_invoker = true) AS
        SELECT n.id, n.nombre, n.padre_id AS canton_id, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
        FROM nodo_geografico n WHERE n.profundidad = 3;
      ```
      - `security_invoker = true`: la RLS de lectura por país de `nodo_geografico` se aplica a quien
        consulta (R3). Sin ella, la vista correría con los permisos del dueño y saltaría la RLS. Exige
        Postgres ≥ 15; T1.1 lo comprueba en la base de tests y en Supabase.
      - **Solo lectura (R2).** Una vista de una sola tabla con `WHERE` es actualizable automáticamente
        en Postgres: un `INSERT` pasaría a `nodo_geografico`. Cada vista lleva un trigger
        `INSTEAD OF INSERT OR UPDATE OR DELETE` que lanza `SQLSTATE 'SL048'` con el mensaje
        «geografía vieja de solo lectura: escribe nodo_geografico». Además `GRANT SELECT` a `servi_app` y
        ningún otro permiso. Un trigger cubre también al dueño, que los `REVOKE` no cubrirían.
      - El código de la vista copia los nombres de columna de hoy, así que el SQL crudo que aún lee
        `FROM distrito` (scripts de equivalencia, `pnpm geo:backfill --validar`) sigue funcionando.

**`down.sql` (R11, R12).** Hace lo inverso:
1. Precondición: cuenta las órdenes cuyo nodo no se puede expresar con 3 FK (profundidad del nodo ≠ 2 y
   ≠ 3, o un país cuya profundidad máxima no es 3). Si hay alguna, `RAISE EXCEPTION` con la cuenta (P5).
2. Borra las vistas y sus triggers; recrea las tablas con el DDL actual (columnas, únicos, FK
   compuestas `(id, pais_id)`, índices, RLS `*_del_pais`, `GRANT` de hoy) y las llena con
   `INSERT … SELECT` desde los nodos de profundidad 1–3.
3. Rellena las 3 FK de las órdenes que las tienen en NULL desde la ruta del nodo (profundidad 3 →
   abuelo, padre, nodo; profundidad 2 → padre, nodo, NULL).
4. Repone el NOT NULL, las 5 FK y las funciones y triggers de sincronía y de `orden` con su cuerpo de
   antes (copiado de `20261104120300`, `20261106120100`, `20261110130000` y `20261026130300`).

La ida y vuelta la prueba `migracion-slt48-ida-y-vuelta.test.ts` contra Postgres real.

### 2.2 Guardia de migraciones (R13, R14)

`tests/unit/db/slt48-migraciones-declaradas.test.ts`, sobre `_migraciones-aditivas.ts`. A diferencia de
SLT-43, 46 y 89, aquí lo destructivo se permite, pero **por lista cerrada**: cada `DROP CONSTRAINT`,
`DROP NOT NULL`, `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE` y `CREATE OR REPLACE FUNCTION` de las dos
carpetas tiene que estar en una lista literal del test, con su objeto. Cualquier sentencia destructiva
fuera de la lista pone el test en rojo, y también un `DROP COLUMN`, `DROP VIEW`, `ALTER TABLE "pais"`,
`SET NOT NULL` sobre `nodo_geografico_id` o un `RENAME` (R14). Si hace falta, `_migraciones-aditivas.ts`
gana una opción `destructivasDeclaradas`; las guardias de SLT-43, 46 y 89 no cambian.

### 2.3 Multi-empresa, RLS y país

- No hay tablas nuevas ni `organizacion_id` nuevos. Las vistas son de plataforma (geografía) y filtran
  por país con la RLS de `nodo_geografico` (R3). `historial_plataforma` sigue sin políticas y con
  `REVOKE ALL` para `servi_app`.
- **Qué depende del país:** la forma del árbol (P, tipos de nivel) y el catálogo salen de
  `nodo_geografico` y `tipo_nivel_geografico` del país de la empresa (`deLaEmpresa()`) o del país
  elegido por el superadmin (`dePais(paisId)`). Moneda, impuestos y métodos de pago no se tocan.
- `pais_tipos_de_nivel` (copia `pais.nivel_N_*` → `tipo_nivel_geografico`) **se queda**: no sincroniza
  las tablas viejas y sus columnas viven hasta SLT-196.

## 3. Prisma y las vistas

**Desconocido verificado:** el repo usa Prisma 7.8.0 (`node_modules/prisma/package.json`), el
`schema.prisma` no declara `previewFeatures` ni bloques `view`, y no se encontró en la documentación
local si un bloque `view` puede ser destino de una relación desde un `model`. No se da por hecho. **T1.1**
lo comprueba con `prisma validate` y `prisma migrate diff --from-migrations db/migrations --to-schema
db/schema.prisma --shadow-database-url …` y decide entre dos caminos:

- **Camino A (preferido).** `previewFeatures = ["views"]` y `Provincia`, `Canton`, `Distrito` pasan de
  `model` a `view`, conservando sus campos. Se queda si se cumplen las tres cosas:
  1. `prisma validate` acepta las relaciones de `Orden`, `ZonaDistrito` y `DistritoZonaEspecial` hacia
     las vistas;
  2. `migrate diff` no propone crear tablas ni FK para ellas;
  3. el cliente generado conserva `prisma.distrito.findMany` y los `select` por relación que usan
     `geografia-activa.ts`, `GrupoDistritosRepository`, `TarifasPantallaRepository` y `ZonaRepository`.
- **Camino B (si falla A).** Las tres quedan como `view` sin relaciones: se quitan los campos de relación
  `Orden.provincia/canton/distrito`, `ZonaDistrito.distrito`, `DistritoZonaEspecial.distrito` y los
  inversos, y los lectores por relación pasan a leer el catálogo (`CatalogoGeograficoRepository`). Suma
  unos 5 archivos de producción, ya listados en `## Archivos esperados` de `tasks.md`.

En los dos caminos se descarta seguir con `model` sobre una vista (ver Alternativas, 3). La decisión y la
salida de los dos comandos quedan en `progress/impl_SLT-48.md`. Si ninguno de los dos caminos funciona, el
implementer para y pregunta.

Ninguna dependencia nueva: un preview feature de Prisma no es un paquete.

## 4. La orden guarda solo su nodo (R15–R21)

### 4.1 Regla de hoja (`lib/services/geo-ubicacion.ts`)

- Salen `esPaisDeTresNiveles`, `admiteGuardado`, `PROFUNDIDADES_GUARDABLES`, `fksDeNodo` y
  `MSG_PAIS_NO_HABILITADO`. `UbicacionResuelta` pierde `fks`.
- Entra `esHoja(cat, nodo)`: con la propuesta de P2, `true` si no tiene hijos activos en el catálogo
  (`cat.hijos.get(nodo.id)` filtrado por `estaActivo`). Si P2 se responde «sin hijos», se quita el filtro y
  no cambia nada más.
- Entra `msgUbicacionIncompleta(nombre, tipoSiguiente)`, sin tildes como los mensajes de v1:
  `ubicacion incompleta: '<nombre>' tiene <tipo plural> debajo; indica el ultimo nivel`. El tipo sale del
  catálogo (el de los hijos del nodo).
- `resolverUbicacion` cambia el paso «país habilitado» por «es hoja». La zona y la marca no cambian
  (`zonaQueCubre`, `esZonaEspecial`).

### 4.2 Vías de entrada

| Vía | Sitio | Cambio |
|---|---|---|
| Carga masiva y API v2 | `BulkOrdenService.ts` (`:404`, `:414`, `:513`, `:725`, `:838`, `:1154-1156`) | Usa la regla de hoja; arma la orden con `nodoGeograficoId` y sin FK |
| API v1 (por nombres) | `lib/services/geo-resolucion.ts` (`:68-71`, `:199-202`) | Resuelve hasta el nodo nombrado y aplica la regla de hoja (R19). Ya no devuelve FK: devuelve el nodo |
| Cotización | `CotizacionOrdenService.ts:245` | Igual que la carga |
| Guardado | `OrdenRepository.createManyOrdenes`, `createManyOrdenesConGuia`, `toCreateManyInput` | Escriben `nodo_geografico_id`; las 3 FK no se mandan (quedan NULL, R15) |
| Corrección | `lib/actions/corregir-datos-cliente.ts`, `CorregirDatosClienteService.ts`, `OrdenRepository.corregirDatosCliente` | Recibe `nodoId` en lugar de 3 ids; valida hoja; escribe el nodo y pone las 3 FK en NULL (R16) |
| Update genérico | `OrdenRepository.toUpdateData` | Deja de aceptar las 3 FK |

El contrato de la corrección cambia: `lib/types/correccion-datos-cliente.ts` pasa de
`provinciaId/cantonId/distritoId` a `nodoId`, y el «antes» que manda el modal es el nodo anterior.
`ICorregirDatosClienteService` y `IOrdenRepository` cambian igual.

### 4.3 Plataforma (R21)

`GeografiaPlataformaModule.tsx` pierde el aviso de «aún no habilitado» (`:273`, `:414`, `:498`,
`:505-508`). Marcar un país disponible ya lo permitía SLT-46.

## 5. Lectores (R22–R30)

| Lector | Hoy | Después |
|---|---|---|
| `lugarDeLaOrden` (`_shared/lugar-orden.ts`) | `distritoId ?? cantonId` | `nodoGeograficoId`. Firma `(o: { nodoGeograficoId: string \| null }) => string \| null` |
| `whereLugarEn` | `OR` sobre dos columnas | `{ nodoGeograficoId: { in: ids } }` |
| `sqlLugarEn` | `OR` en SQL | `o."nodo_geografico_id" = ANY($1::text[])` |
| `ruta-del-lugar.ts` | ruta desde la FK | ruta desde el nodo (un solo sitio, como prometió SLT-47) |
| `InformeTransitoRepository` (`:82`, `:104-105`, `:138`, `:163-167`, `:190`) | join por FK | por nodo; título con los 2 niveles más hondos de la ruta (R25) |
| `ubicacion-presentacion.ts:104` | `D = min(P,3)` | `D = P` (R26) |
| `CierreDiaRepository` (`:485`, `:516-526`) | nombres y snapshot por FK | ruta del nodo: niveles 1–3 a las 3 columnas, ids al snapshot (R27) |
| `OrdenRepository` (selects `:360`, `:380`, `:1202-1204`, `:1262`, `:1447-1448`, `:1998`, `:2014`, `:2256`, `:2886-2953`, `:3040`, `:3715-3717`, `:5988-5989`) | FK | `nodoGeograficoId` |
| `ZonaRepository` (`:562`, `:769`) | `whereLugarEn` | sin cambio de código propio; hereda el cambio |
| API v1, respuestas | FK y relaciones | niveles 1–3 de la ruta (R28) |

Una orden vieja tiene `nodo = COALESCE(distrito_id, canton_id)` (lo garantiza el trigger de SLT-43 y el
backfill; la precondición R6 asegura que no hay NULL). Por eso el resultado de toda lectura sobre órdenes
viejas es el de hoy (R22–R24, R27, R28).

`lugarDeLaOrden` puede devolver `null` para una orden sin nodo (solo posible en SQL a mano, porque R6
lo impide en datos y la app siempre lo manda). Las superficies ya tratan «lugar fuera del catálogo» como
ruta vacía (SLT-125 R18); el cierre sigue revirtiendo, como hoy.

**Guardias.**
- `geografia-lecturas-sin-nodo-fk.guardia.test.ts` (SLT-44) prohibía leer el nodo. Ahora la regla es la
  inversa, y se reescribe como `orden-fk-geo-sin-uso.guardia.test.ts` (R29). Prohíbe en `lib/`, `app/` y
  `components/` las claves `provinciaId`, `cantonId` y `distritoId` dentro de un `select`, `data` o
  `where` de `orden`/`Orden`, y `o."provincia_id"`, `o."canton_id"`, `o."distrito_id"` en SQL crudo de
  órdenes. Tiene contraprueba. Las de zonas y grupos (`zona_distrito.distrito_id`) no entran: son otra
  tabla y se retiran en SLT-196.
- `geografia-vieja-sin-escritor.guardia.test.ts` se queda (sigue cierto) y suma las vistas al mensaje.

**Rendimiento (R30).** `nodo_geografico_id` ya tiene índice. La persona corre `geo:explain-consultas`,
`geo:explain-filtros` y `geo:explain-analitica` sobre la copia antes y después; si el listado empeora,
la primera mitigación es llevar los nombres al catálogo (decisión heredada de SLT-65).

## 6. Tarifas (R31, R32)

`ParTarifa` conserva su clave `distritoId` (nombre interno, decisión heredada), pero ya no sale de
`orden.distrito_id`: la calcula una función pura nueva, `distritoDeTarifa(cat, nodoId)` en
`lib/services/geografia-dominio.ts`:

- en Costa Rica (y con la propuesta (a) de P3, en todo país): el nodo de la orden si su profundidad es
  ≥ 3; si no, `null` → sin grupo, tarifa base (SLT-89 R20);
- si P3 se responde distinto, cambia solo esta función y sus tests.

Llamadores: `resolver-tarifas.ts` (`:99-185`, `:276`, `:397`, `:488`, `:606-629`), `ApiOrdenLecturaService.ts:50`,
`RechazoTiendaService.ts:250`, `CotizacionOrdenService.ts:139`, `OrdenRepository.ts:1262`, `:2256`. Los
que hoy leen `distritoId` de la orden pasan a leer `nodoGeograficoId` y llaman a `distritoDeTarifa`.
Para una orden vieja de CR, `nodo = distrito_id` cuando hay distrito y `nodo = canton_id` (profundidad 2)
cuando no: la función devuelve lo mismo que hoy (R32). La equivalencia la cierra
`geo:equivalencia-dinero` sobre la copia (R33).

## 7. Mover un nodo (R34–R41)

### 7.1 Capas

- **Tipo** (`lib/types/geografia-nodo.ts`): `moverNodoSchema` zod `.strict()` con `id`, `padreIdNuevo` y
  `padreIdAnterior` (el «antes» del modal). `renombrarNodoSchema` sigue rechazando `padreId`.
- **Repositorio** (`GeoRepository.mover`, interfaz `IGeoRepository`), en una transacción:
  1. lee el nodo y el padre destino; `no_existe` si falta alguno;
  2. valida país, profundidad (`destino.profundidad === nodo.profundidad - 1`), que no sea el padre
     actual y que el nodo no sea raíz (R35). Con la propuesta de P4, rechaza un destino retirado;
  3. `updateMany({ where: { id, padreId: padreIdAnterior }, data: { padreId: padreIdNuevo } })`. Con
     `count = 0` → `cambio_concurrente` (R37). El único `(padre_id, nombre_normalizado)` de la base lanza
     la violación de UNIQUE → `conflict` en el borde (R35);
  4. `appendAccionPlataforma` con `accion: "nodo_geografico_movido"`, `valorAnterior` y `valorNuevo` =
     las rutas de los padres, recortadas a `GEO_NOMBRE_MAX` como en `renombrar` (R38).
  El trigger de SLT-46 que rechaza cambiar `profundidad` sigue protegiendo el árbol. Mover no cambia la
  profundidad y no crea ciclos, porque el destino está a la misma altura que el padre actual.
  `nodo-geografico-escritor-unico.guardia` sigue verde: escribe `GeoRepository`.
- **Vista previa** (`GeoRepository.vistaPreviaMover`, solo lectura): rutas antes/después, número de
  descendientes (CTE recursiva sobre `padre_id`) y número de órdenes en el subárbol (por
  `nodo_geografico_id`, todas las empresas: es plataforma). Corre las validaciones de R35 (R36). Con la
  propuesta (a) de P1, cuenta también las órdenes abiertas cuyo grupo de tarifas o marca de zona especial
  cambiaría, por empresa (§7.2). Si hay alguna, la vista previa la devuelve como bloqueo y `mover` la
  rechaza con `validation_error`.
- **Servicio** (`GeografiaService.moverNodo`, `vistaPreviaMoverNodo`; interfaz `IGeografiaService`).
- **Acción** (`lib/actions/geografia-plataforma.ts`): `moverNodoGeografico` y
  `vistaPreviaMoverNodoGeografico` con `comoPlataforma` (solo superadmin; si no, `forbidden`, R34).
- **Historial**: el valor de enum (migración 1), `HistorialPlataformaAccion` en `schema.prisma` y la
  etiqueta en `lib/types/historial-accion.ts`.

### 7.2 Las órdenes ya creadas (R39–R41)

- `orden` no se toca (R39): la ruta se lee del árbol, así que el nombre mostrado cambia solo. La zona está
  guardada en `orden.zona_id` y no cambia.
- El precio de una orden abierta no está congelado: se resuelve con `distritoDeTarifa` y el catálogo. Si
  el grupo o la marca del nodo eran **heredados** de un antepasado que deja de serlo, la orden cambiaría
  de precio. Eso choca con la decisión «Mover un nodo» (P1). La propuesta (a) lo evita sin tocar el
  esquema. Para cada empresa con órdenes abiertas en el subárbol, se calcula con el catálogo de antes y
  con uno «movido» en memoria (una función pura en `geografia-dominio.ts`: `catalogoConPadre(cat, id,
  padreNuevo)`) el grupo (`grupoDeNodo`) y la marca de cada nodo con órdenes abiertas. Si alguno difiere,
  se bloquea. Un nodo con grupo o marca propios (fila en `grupo_distritos_distrito`, `zona_distrito` o
  `distrito_zona_especial`) no cambia nunca. Si P1 se responde (b) o (c), cambia esta sección y la tarea
  T3.3.
- Las órdenes nuevas toman la zona y el grupo de la posición nueva porque el catálogo ya refleja el padre
  nuevo (R41).

### 7.3 Pantalla

En `/plataforma/geografia`, cada nodo no raíz gana la acción «Mover». Abre `MoverNodoDialog.tsx`, que
elige el padre destino entre los nodos de la profundidad del padre actual (con buscador, del mismo país),
pide la vista previa y muestra el modal antes → después (R36). Si hay bloqueo, «Confirmar» queda
deshabilitado y se explica por qué. Espera la maqueta (R42).

## 8. Pantallas de N niveles (R42–R47)

Todas esperan la maqueta aprobada (T0). El backend avanza antes.

| Pantalla | Archivos | Cambio |
|---|---|---|
| Corregir ubicación | `CorregirUbicacionAviso.tsx`, `CorregirDatosClienteModal.tsx` | Un selector por nivel del país (P selectores encadenados, etiquetas de `useEtiquetasGeograficas`/tipos del catálogo), hasta una hoja. Lee el árbol de `lugares` del catálogo de filtros (SLT-47), no las listas planas. En CR, 3 selectores con las etiquetas de hoy (R43) |
| Historial | `lib/types/historial-accion-etiquetas.ts` | La etiqueta de un lugar es la ruta entera (de la hoja a la raíz, separador de hoy), con la forma de cadena de largo variable que ya usa SLT-43 para el nodo. `provincia`/`canton`/`distrito` siguen como forma vieja para las filas ya escritas (R44) |
| Tarifas (grupos) | `TarifasGrupos.tsx`, `TarifasZonas.tsx` | `PROFUNDIDAD_DE_DISTRITO = 3` y las etiquetas fijas de 3 niveles pasan a los tipos del país hasta P (R45) |
| Zonas | `CrearZonaForm.tsx`, `GeografiaSelector.tsx`, `_shared/filtrar-arbol-geografico.ts` | Árbol hasta P con los tipos del país (R45) |
| Carga masiva | `lib/utils/plantilla-geo.ts` (sin cambio esperado) y el flujo de carga | En un país de 4 niveles, una fila con 4 niveles crea la orden en el nivel 4 (R46). Hoy la plantilla ya trae las 4 columnas; lo que fallaba era el guardado (§4.1). La maqueta confirma si hay algún cambio visual |

La guardia `etiquetas-geograficas-sin-literal` se amplía a los archivos nuevos y tocados (R47).

## 9. Tests que escriben las tablas viejas

Con vistas de solo lectura, todo test que escribe `provincia`, `canton` o `distrito` da `SL048`
(40 de integración, la fábrica `tests/fabricas/paises.ts` y el E2E `geo-presentacion-4-niveles`).

- **Fábrica y fixtures** (`tests/fabricas/paises.ts`, `_fixtures/geo-43.ts`, `geo-44.ts`, `geo-47.ts`,
  `geo-71.ts`, `e2e/_planes-fixture.ts`, `e2e/_zona-especial-fixture.ts`): crean `tipo_nivel_geografico`
  y `nodo_geografico` con los mismos ids que hoy. Así los tests que solo usan la fábrica no cambian de
  aserciones.
- **Tests de las tablas viejas como tales** (`geo-sincronia-geografia`, `geo-sincronia-orden-zonas`,
  `slt46-nodo-copia-vieja`, `geografia-por-pais` en su parte de FK compuestas): prueban triggers que ya
  no existen. Se reescriben contra las vistas (R1–R3, R5) o contra el nodo. Ninguno se borra sin
  autorización del humano: si uno queda sin objeto, el implementer para y pregunta.
- **Ida y vuelta de migraciones viejas** (`migracion-sl20`, `-sl38`, `-slt43`, `-slt46`,
  `geografia-dta-2026-migration`, `tarifas-flexibles-migration`): aplican el `down.sql` de su migración
  sobre la base actual. Con SLT-48 aplicada, ese `down.sql` encuentra vistas. Un helper nuevo,
  `tests/integration/db/_fixtures/sin-slt48.ts`, aplica el `down.sql` de SLT-48 antes y su
  `migration.sql` después, en la misma transacción de test. Así también se ejercita el `down.sql`
  (R11).
- **Órdenes de fixtures con FK**: siguen funcionando por R9 (el trigger pone el nodo). No hace falta
  tocarlas.

## 10. Autorización

- Mover nodo: solo superadmin, con `comoPlataforma` en la acción (R34). El servicio no decide permisos.
- Corregir ubicación: los permisos de hoy (no cambian); cambia el contrato de datos.
- Vistas: `GRANT SELECT` a `servi_app`; ninguna escritura (R2).
- Ningún módulo nuevo que encender.

## 11. Alternativas descartadas

1. **Dejar las tablas viejas como tablas y seguir sincronizándolas.** Es lo que hay hoy. No cumple el
   alcance («pasan a ser vistas») y mantiene los triggers de los dos sentidos, que son el riesgo de
   divergencia que la épica quiere quitar.
2. **Que la app siga escribiendo las 3 FK (doble escritura) y solo los lectores pasen al nodo.**
   Evitaría el `DROP NOT NULL` y el cambio de 10–12 archivos de escritura. Pero en un país de 4 niveles no
   hay FK que escribir, la decisión dice que la orden guarda solo su nodo, y SLT-196 tendría que hacer
   este trabajo de todos modos.
3. **Dejar `Provincia/Canton/Distrito` como `model` de Prisma sobre una vista.** El cliente funcionaría,
   pero `prisma migrate dev --create-only` (como el repo crea migraciones) compararía el esquema con las
   migraciones y propondría `CREATE TABLE` y las FK en cada migración nueva. Cada persona tendría que
   borrarlas a mano. Se descarta por frágil.
4. **Vistas materializadas.** Necesitan `REFRESH` (otro trigger de sincronía, lo que se quiere quitar),
   no admiten RLS y dejan una ventana de datos viejos.
5. **Validar «es hoja» en la base (trigger en `orden`).** Rompería las órdenes viejas en cantón al
   actualizarlas, complicaría mover nodos (un nodo con órdenes podría dejar de ser hoja al recibir un
   hijo) y añadiría una consulta por fila al tope de ≤ 1 ms. La regla vive en el servicio, que ya tiene
   el catálogo.
6. **Mover reescribiendo las órdenes (UPDATE de `nodo`/`zona_id`).** Lo prohíbe la decisión heredada de
   SLT-46: «corrige sin reescribir». Además tocaría `orden` en masa.
7. **Quitar el comportamiento de compatibilidad de R9.** Obligaría a reescribir todo fixture que crea
   órdenes con FK, unos 40 archivos más, sin beneficio en producción, porque la app ya no manda FK. Se
   retira en SLT-196 junto con las columnas.

## 12. Riesgos

- **Prisma y vistas (§3):** no se sabe si el camino A funciona. El camino B suma archivos. T1.1 va
  primero y decide.
- **Tamaño:** 48 archivos de producción y 85–105 de tests (ver `tasks.md > Tamaño`). La parte de
  producción está dentro de lo aceptado; la de tests puede pasar de los 60–90 aceptados.
- **Choques:** SLT-183 «Usuarios propios en tests de geografía, avisos y migraciones», SLT-187 «Tests
  de migración desfasados tras SL-17» y SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER»
  tocan archivos de esta lista. Lo detecta `archivos-en-vuelo.mjs`.
- **`down.sql` con órdenes no representables (P5):** si se aborta, volver atrás después de abrir un país
  de 4 niveles exige antes decidir qué hacer con esas órdenes.

## 13. Mapa R → test

| R | Test |
|---|---|
| R1, R3 | `tests/integration/db/slt48-vistas-geografia.test.ts` (columnas, filas por profundidad, RLS por país con `servi_app` y en plataforma) |
| R2 | `slt48-vistas-geografia.test.ts` (INSERT/UPDATE/DELETE como `servi_app` y como dueño → `SL048`, sin cambios) |
| R4, R6 | `tests/integration/db/migracion-slt48-ida-y-vuelta.test.ts` (FK y NOT NULL ausentes; precondición con nodo NULL aborta) |
| R5 | `slt48-vistas-geografia.test.ts` (sin triggers de sincronía en `pg_trigger`; crear, renombrar, retirar y mover se ven al instante) |
| R7, R8 | `tests/integration/db/slt48-triggers-orden-pais.test.ts` |
| R9 | `slt48-triggers-orden-pais.test.ts` (FK sin nodo → nodo; nodo presente se conserva) |
| R10 | `tests/integration/db/slt48-trigger-orden-rendimiento.test.ts` (carga masiva de prueba, ≤ 1 ms/fila) |
| R11, R12 | `migracion-slt48-ida-y-vuelta.test.ts` |
| R13, R14 | `tests/unit/db/slt48-migraciones-declaradas.test.ts` (con contraprueba) |
| R15 | `tests/integration/db/orden-nodo-escritura.test.ts` (ampliado: cada vía deja las 3 FK en NULL) |
| R16 | `tests/integration/db/corregir-datos-cliente.repo.test.ts` (ampliado) |
| R17, R18 | `tests/unit/services/geo-ubicacion.test.ts`, `bulk-orden-service.n-niveles.test.ts`, `bulk-orden-service.forma-pais.test.ts`, `tests/integration/api/v2-paises-de-prueba.route.test.ts` |
| R19 | `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` (ampliado: v1, regla de hoja) |
| R20 | `migracion-slt48-ida-y-vuelta.test.ts` (huella de órdenes viejas antes y después, idéntica) |
| R21 | `tests/components/GeografiaPlataformaSinAviso.test.tsx` |
| R22 | `tests/unit/repositories/lugar-orden.test.ts`, `tests/unit/services/ruta-del-lugar.test.ts`, `tests/integration/db/orden-lugar-owner.test.ts` |
| R23 | `tests/unit/repositories/lugares-del-filtro.test.ts`, `orden-repository-filtros.test.ts`, `tests/integration/db/slt48-filtro-orden-nueva.test.ts` |
| R24 | `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`, `zona-reconciliacion-ordenes.test.ts` |
| R25 | `tests/unit/utils/ubicacion-presentacion.test.ts`, `tests/integration/db/informe-transito-nodo.test.ts` |
| R26 | `e2e/geo-presentacion-4-niveles.spec.ts` (cuarta columna llena) |
| R27 | `tests/integration/db/cierre-dia-snapshot-nodo.test.ts` |
| R28 | `tests/integration/api/v1-ordenes-lugar.route.test.ts` |
| R29 | `tests/unit/guards/orden-fk-geo-sin-uso.guardia.test.ts` |
| R30, R33 | Salida de `geo:explain-*` y `geo:equivalencia-*` pegada en el PR (persona, T7.1) |
| R31, R32 | `tests/unit/services/geografia-dominio.distrito-de-tarifa.test.ts`, `tests/integration/db/tarifas-flexibles-resolver.test.ts` y `slt89-equivalencia-cr.test.ts` (ampliados), `tests/integration/db/slt48-tarifas-equivalencia.test.ts` |
| R34, R35, R37, R38 | `tests/integration/db/geografia-mover-nodo.test.ts`, `tests/unit/actions/geografia-plataforma.mover.test.ts` |
| R36 | `tests/integration/db/geografia-mover-nodo.test.ts` (vista previa), `tests/components/MoverNodoDialog.test.tsx` |
| R39–R41 | `tests/integration/db/geografia-mover-nodo-ordenes.test.ts` (sin escrituras en `orden`, ruta nueva, precio y marca iguales o bloqueo según P1, orden nueva con zona nueva) |
| R42 | `progress/impl_SLT-48.md` (aprobación anotada) — revisado por el reviewer |
| R43 | `tests/components/CorregirUbicacionNNiveles.test.tsx` |
| R44 | `tests/unit/types/historial-accion-etiquetas-ruta.test.ts` (nuevo) |
| R45 | `tests/components/TarifasGruposNNiveles.test.tsx`, `tests/components/ZonasNNiveles.test.tsx` |
| R46 | `tests/integration/db/carga-masiva-4-niveles.test.ts` |
| R47 | `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` (ampliada) |
| R48 | `slt48-migraciones-declaradas.test.ts` + diff revisado por el reviewer |
| R49 | `e2e/mis-asignaciones.spec.ts`, `asignacion-satelite`, `recepcion-satelite`, `cierre-dia`, `cierres-admin*`, `wallet*`, `devolucion-origen`, `dos-empresas-humo` (sin cambiar aserciones; CI del PR a `prod`) |

Los nombres de test nuevos son propuesta: el implementer puede ajustarlos, y el mapa final va a
`progress/impl_SLT-48.md`.
