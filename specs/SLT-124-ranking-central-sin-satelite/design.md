# SLT-124 «Ranking de la central sin mensajeros de satélite» — design

## Lo que ya existe

Busqué `premio`, `incentivo` y `ranking` junto con `satélite`/`destino` en `feature_list.json`,
`specs/` y el código. Usé Grep: el índice del grafo no tiene este worktree.

Apareció:
- **SLT-122 «Pago al mensajero: solo la bodega dueña del cierre»** (done). Cerró el pago directo y el
  reparto, y dejó fuera de forma explícita los premios y los incentivos, que mandó aquí
  (`specs/SLT-122-pago-bodega-duena/requirements.md:254`). **Se reutiliza:**
  - `alcanceWhere` (`lib/repositories/alcance-cierre-where.ts:12-19`);
  - `ALCANCE_ACCESO_TOTAL` (`lib/services/alcance-cierres.ts:11-14`);
  - `listarCierresImputablesEnAlcance` y `obtenerCierreParaPagoEnAlcance`
    (`lib/interfaces/repositories/ILiquidacionPagoRepository.ts:265-269`, `:306-310`);
  - el patrón de su test de integración (`tests/integration/db/pago-mensajero-bodega-duena.test.ts`).
- **293 (premio del podio), SLT-68 (incentivo), 76/196/246 (ranking vivo y congelado).** Son las
  features que se corrigen. No se re-crea nada de ellas.
- **La regla «zona central»:** `zona.es_central` y `resolverDestinoCierre`
  (`lib/utils/bodega-responsable.ts:16-23`). Se aplica la misma regla y no se inventa otra.

No hay ninguna ficha que solape con esta.

## Modelo de datos

**Sin cambios de esquema, sin migraciones, sin `down.sql`.** Todo lo que hace falta ya existe y está
indexado:
- `cierre_dia.destino_tipo` / `destino_zona_id` (`db/schema.prisma:1648-1649`, índice `:1690`);
- `zona.es_central` (`:599`);
- `usuario.zona_id` (`:121`).

**Multi-empresa.** Ningún WHERE nuevo lleva `organizacion_id`: lo ponen la extensión del cliente y la
RLS de `cierre_dia`, `usuario` y `zona`, igual que en SLT-122 (`alcance-cierre-where.ts:10`). La zona
que se compara es la del propio usuario, así que siempre es de su misma empresa.

**Datos que dependen del país.** Ninguno nuevo. La ventana del día sigue saliendo de la zona horaria
de la empresa (`zonaDeLaEmpresa`, SLT-42), y la zona central la marca cada empresa en su
configuración (feature 54).

## Autorización y módulos

No cambia nada:
- registrar o listar premios exige acceso total (`PremioRankingDevengoService.ts:83-85`);
- el incentivo, también (`IncentivoMensajeroService.ts:57`);
- el ranking lo leen el acceso total y el mensajero (`RankingService.ts:60-62`);
- las puertas de módulo (Ranking, Wallet) siguen igual.

Esta ficha **estrecha datos**, no permisos: a qué cierre se cuelga dinero y quién entra en el
cálculo.

## Cambios por pieza

### 1. Cierre del día con alcance (premio, R1-R6)

`ICierreDelDiaRepository.resolverCierreDelDia(mensajeroId, ventana, alcance: Alcance)` lleva el
parámetro **obligatorio**, sin valor por defecto, para que ningún llamador se olvide del alcance.
`CierreDelDiaRepository` añade `...alcanceWhere(alcance)` al `where` (`:41-49`). No cambian el
`orderBy`, el `select` ni el `findFirst`. Con el filtro en el WHERE, el desempate por
`solicitado_at`/`id` elige entre los cierres centrales, y eso resuelve el caso mixto (R3) sin código
aparte.

`PremioRankingDevengoService` pasa `ALCANCE_ACCESO_TOTAL` en las dos llamadas (`:149` y `:186`).
- Si solo hay cierres de satélite, la lectura devuelve `null`, y el servicio ya responde
  `sin_cierre` (R2, R4) sin entrar en la transacción.
- `anularPremio` no resuelve el cierre: usa el `cierreId` del propio premio (`:284-293`). Por eso
  R7 se cumple sin tocarlo.

La cabecera de `ICierreDelDiaRepository.ts:5-8` («no depende de ningún alcance») se reescribe: desde
esta ficha sí depende.

### 2. Incentivo con alcance (R8-R11)

`IncentivoMensajeroService.registrar` cambia dos lecturas:
- la elección (`:62`) pasa a `listarCierresImputablesEnAlcance(mensajeroId, ALCANCE_ACCESO_TOTAL)`;
- la relectura bajo el candado (`:80`) pasa a
  `obtenerCierreParaPagoEnAlcance(cierre.id, ALCANCE_ACCESO_TOTAL, tx)`.

El `Pick` del constructor cambia en consecuencia. El composition root no cambia, porque ya inyecta el
repositorio completo. Hay que comprobar al implementar que pasa la instancia y no solo que la
importa. `anular` no cambia (R11).

Tras esto, `listarCierresImputables` sin alcance se queda sin consumidores en `lib/`. Se anota como
deuda y no se borra aquí: la usan 7 archivos de tests.

### 3. Universo del ranking (R12-R14)

`UserRepository.listMensajeros` añade al `where` `zona: { esCentral: true }`
(`UserRepository.ts:326`). Tiene exactamente dos consumidores, `RankingService` y
`RankingSnapshotService`, que no cambian. Así el vivo y el congelado siguen partiendo de la **misma**
lista, que es lo que exige la 196 (R3: «mismo universo»), y ninguno de los dos se queda con un filtro
que el otro no tiene.
- Las entregas y asignadas de un mensajero de satélite siguen saliendo de `RankingRepository`, pero
  no se usan: los agregados se construyen solo sobre la lista de mensajeros
  (`RankingService.ts:112-117`).
- Un mensajero sin zona no casa con la relación y queda fuera. Es coherente con que no puede pedir
  cierre (`CierreDiaService.ts:705-707`).
- **Empresa sin zona central (R14):** la lista sale vacía.
  - En vivo, la pantalla muestra el `EmptyState` que ya existe (`RankingPodio.tsx:291-293`,
    `RankingModule.tsx:108`).
  - El congelado escribe la cabecera con 0 filas (`RankingSnapshotService.ts:150-156`, R11 de la
    196).
  - Es lo mínimo, sin texto nuevo. **[Preview]**: se enseña a Carlos.
- Los snapshots ya escritos no se tocan (R13): la lectura del histórico no pasa por `listMensajeros`.
- La cabecera de `IUserRepository.listMensajeros` se actualiza: «mensajeros activos de la zona
  central».

### 4. Guardia

`tests/unit/repositories/criterio-unico.guardia.test.ts:516-536` añade `CierreDelDiaRepository` a
los consumidores de `alcanceWhere`, con el import exacto, 0 redeclaraciones y 1 uso.

## Contratos

| Pieza | Antes | Después |
|---|---|---|
| `ICierreDelDiaRepository.resolverCierreDelDia` | `(mensajeroId, ventana)` | `(mensajeroId, ventana, alcance: Alcance)` |
| `IUserRepository.listMensajeros` | firma igual; activos de la empresa | firma igual; activos **de la zona central** |
| `IncentivoMensajeroService` (constructor `Pick`) | `listarCierresImputables`, `obtenerCierreParaPago` | `listarCierresImputablesEnAlcance`, `obtenerCierreParaPagoEnAlcance` |
| Respuestas de actions y servicios | — | sin cambios: no hay estado nuevo (`sin_cierre`, `sin_cierre_aprobado`, `cierre_no_aprobado` se reusan) |

No hay endpoints ni rutas nuevas, integraciones externas ni librerías nuevas.

## Verificación

Un test de integración nuevo contra Postgres real,
`tests/integration/db/central-sin-satelite-premio-incentivo.test.ts`, con servicios y repositorios
reales. Los escenarios están en `tasks.md > T6`. Tiene **tres mutaciones obligatorias**, porque los
tests de servicio con dobles no ven el WHERE:
1. quitar `...alcanceWhere(alcance)` de `resolverCierreDelDia` debe poner en rojo R1-R4;
2. volver a `listarCierresImputables` sin alcance en el incentivo debe poner en rojo R8-R9;
3. quitar `zona: { esCentral: true }` de `listMensajeros` debe poner en rojo R12 (y R14).

Toca dinero, así que también corren los E2E del proyecto `dinero`, `incentivo-mensajero-slt68` y
`dos-empresas-humo` (este último lee el ranking). Riesgo: si sus fixtures siembran mensajeros sin
zona central, el ranking o el incentivo cambian. Se corrige el fixture, no el requisito.

**T0 (hecho, D5):** en prod no hay premios ni incentivos colgados de cierres de satélite, ni podios
con premio de mensajeros fuera de la central, ni casos mixtos. Desplegar no deja nada huérfano.

## Alternativas descartadas

1. **Filtrar el destino en memoria, en el servicio, después de leer el cierre.** Descartada (R5):
   - con `findFirst` el repositorio ya habría elegido el cierre de satélite más antiguo en el caso
     mixto, y el central se perdería;
   - además, este repo ha medido varias veces que una mutación del WHERE pasa en verde los tests de
     servicio con dobles.
2. **Un estado nuevo `cierre_de_satelite` para el premio y el incentivo**, con texto propio.
   Descartada:
   - con B el caso queda solo en snapshots viejos, y en prod hay 0 (D5);
   - obligaría a tocar tipos, el panel de premios, el diálogo del incentivo y sus labels;
   - PA2 se quitó (D6).
3. **Filtrar el universo del ranking en `RankingService` y `RankingSnapshotService`** con
   `ZonaRepository.findCentralZonaId` + `resolverDestinoCierre`. Descartada:
   - son dos sitios que pueden divergir, que es justo lo que la 196 prohíbe (vivo y congelado sobre el
     mismo universo);
   - añade una dependencia a dos constructores y a sus composition roots.
4. **Método nuevo `listMensajerosDeLaCentral` en `IUserRepository`.** Descartada: obligaría a
   añadirlo a ~13 dobles tipados de tests, y `listMensajeros` ya tiene como únicos consumidores los
   dos del ranking.
5. **Contar en el ranking solo las gestiones que caen en cierres centrales.** Descartada: en vivo, las
   gestiones del día aún no tienen cierre, así que el ranking de hoy saldría vacío hasta cerrar.
