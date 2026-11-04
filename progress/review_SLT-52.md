# Revisión F2.2 — SLT-52 «Tarifas flexibles: modelo y cálculo»

Reviewer · 2026-11-03 · rama `feature/SLT-52-tarifas-flexibles-modelo`, HEAD `df5d6289` · diff `origin/dev...HEAD`
(224 archivos). MCP `codebase-memory` no respondió (timeout de conexión): todo por Grep/Read.
`.env` usado solo para conectar (ningún valor impreso).

## Veredicto: **RECHAZO** (1 mayor, 0 bloqueantes, 9 menores)

El dinero, la trazabilidad, el multiempresa y las migraciones están bien. Lo rechaza un solo
hallazgo mayor, que se arregla con un número y su test (H1): el verificador de RLS del despliegue
espera 166 triggers `sme_*` y la base, con las seis migraciones aplicadas, tiene 167. Para la
vuelta 2 basta con revisar el diff acotado a H1.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R55 → test real | OK. Revisé las aserciones, no solo los nombres (abajo) |
| 2 | Tasks de `tasks.md` todas `[x]` | OK (39 `[x]`, 0 `[ ]`) |
| 3 | `design.md > ## Lo que ya existe` presente, el diff no re-crea nada de la lista | OK (con una deriva de texto, H10) |
| 4 | Dinero: cobro y pago congelados y coherentes, IVA solo en cobros, «sin tarifa» = sin flete por entregado | OK |
| 5 | Multiempresa: `organizacion_id`, RLS, triggers de misma empresa y ninguna consulta que cruce empresas | OK en la base; el contador del verificador de despliegue está mal (H1) |
| 6 | Migraciones nuevas, con `down.sql`, sin editar ninguna aplicada; esquema = `db/schema.prisma` | OK |
| 7 | Convivencia con el modelo viejo (`respaldo-identico`, T0) | OK |
| 8 | API pública: `ivaFulfillment` en OpenAPI, CHANGELOG y guía; ninguna clave interna filtrada | OK |
| 9 | Desvíos de la bitácora | Ninguno inaceptable (abajo) |
| 10 | Tests de aserción vacía o que comparan contra su propia fuente | Ninguno encontrado |
| 11 | Reglas del reviewer (`docs/perfil-agentes.md`): org_id/RLS/down.sql/literales de país-moneda/Ordenex/dependencias | OK. Solo un comentario con «colón» (H6) y ninguna dependencia nueva |
| 12 | `docs/checkpoints-proyecto.md`: typecheck, lint, gate, E2E de flujos críticos | typecheck 0, lint 0 errores; gate solo con los rojos conocidos; E2E de cierre, wallet y aislamiento en verde en T7.3 (falta una corrida conjunta, H7) |

### 1. Trazabilidad (lo que miré en cada test)

- **WHERE y dinero congelado, contra Postgres real:**
  - R4, R7, R8, R10-R12, R15, R43, R44 y R45: `tarifas-flexibles-migration.test.ts`. Cada CHECK
    se ejerce por su nombre de restricción y los niveles válidos se cuentan.
  - R16-R23 y R28, más el WHERE que no trae nada de más: `tarifas-flexibles-resolver.test.ts`.
  - R8, R9, R12, R14 y R15 en la escritura: `tarifas-flexibles-escritura.test.ts`. Comprueba el
    actor y el antes/después literales, y que el savepoint se lleva el historial.
  - R24, R33, R40, R41 y R42: `tarifas-flexibles-snapshot.test.ts`. Cubre la solicitud, el corte,
    la 477 y la lectura vieja.
  - R52-R55: `tarifas-flexibles-base-congelada.test.ts`. El valor vivo se cambia DESPUÉS de
    congelar, y la base, el pago, los totales y el cobro de la aprobación se comparan con
    literales (2000.00 → 1000.00/500.00; R54 1000.00 → 500.00/250.00; R55 con la base resuelta
    con A = 1500.00 y la congelada con B = 3000.00).
  - R36/R37 contra la base: `tarifas-flexibles-respaldo.test.ts`.
  - R48-R50: `rechazo-tienda-cobro-tarifa-valor-migration.test.ts`.
- **R40 y R37** están mapeados en la bitácora a tests con dobles (`cierre-pago-congelado.test.ts`),
  pero también tienen su prueba en integración: snapshot «R40/R24/R33/R19/R20» y respaldo
  «empresa con UN valor nuevo». Lo mismo R19 y R33 (resolver «R19/R20: el MISMO mensajero en Z y
  en Z2» y snapshot).
- **R38** (`convergencia-tarifa-listado-cierre.test.ts`) compara con literales (`1695.00`, `565.00`)
  y con el `where` exacto, no contra la función que los produce. Lo refuerza la guardia
  `tarifas-resolver-inyectado`.
- **Aserción vacía:** los únicos `if (!HAY_BASE_DE_DATOS) return;` están en `beforeAll`, bajo
  `describeSiHayBase` (`describe.skip` sin base). No hay `it.skip`, `.only` ni `return` antes de
  `expect` en los tests nuevos.
- **T0 intacto:** `respaldo-identico.test.ts` solo se tocó en T4 (`b7e22911`), y solo con 16
  líneas AÑADIDAS que comprueban la forma envuelta contra el MISMO literal. Ningún literal cambió.
- Los literales que desaparecen de tests existentes son refactores de forma (la tarifa envuelta
  en `{modelo:"viejo"}` y el campo `ivaFulfillment` añadido). No encontré ningún importe que
  cambiara.

### 4. Dinero

- **Base del %:** `lib/utils/cobro-congelado.ts:41-57`. `baseDelCobroCongelado` usa
  `derivarIngresoOrden` sobre `tarifaDe(detalle)` congelado, que es la misma cuenta del cobro a
  la tienda.
- **IVA:** `ivaDe` solo acepta `ValorCobro` (`lib/tarifas/calculo.ts:37`) y `importePagoNuevo`
  nunca lo llama (`lib/utils/pago-mensajero.ts`). `gestion_pago_congelado` no tiene columna de
  IVA, y `tarifa_valor_iva_solo_tienda` rechaza un IVA de pago, incluso 0.
- **R51:** `fleteEntregadoSinTarifa` (`lib/utils/ingreso-empresa.ts:276-280`).
- **Redondeo:** HALF_UP en Decimal, con el IVA sobre el importe ya redondeado (R26).

### 5. Multiempresa

- Las cinco tablas nuevas tienen `organizacion_id NOT NULL` con DEFAULT de la empresa, FK, índice
  y política `<t>_por_empresa`. Todos sus únicos son por empresa o están anclados a una FK NOT NULL.
- Hay 10+1 triggers `sme_*` y 5 `sin_cambio_de_empresa`. Las FK compuestas quedan cubiertas por
  la columna `zona_id` que comparten, más el CHECK `grupo_con_zona`.
- El SQL a mano de Analítica (`DineroProductosRepository.ts:310-320`) filtra
  `dc.organizacion_id = d.organizacion_id`. Por eso sale de `EXCEPCIONES_SQL_A_MANO`, que es una
  lista que solo puede bajar.
- `usaModeloNuevo` es un `findFirst` sin `where`: depende de la extensión, como todo el
  repositorio. El cron usa `paraCadaEmpresa` y la extensión lanza `EmpresaNoResuelta` si no hay
  empresa.

### 6. Migraciones

- Son seis, todas nuevas, con `down.sql`, en orden detrás de `20261102090100` y con un solo
  commit cada una (ninguna se editó después).
- `prisma migrate diff` (base local con las 6 aplicadas → `db/schema.prisma`) da un diff vacío,
  con EXIT 0.

## Hallazgos

### Mayor

- **H1 — El verificador de RLS del despliegue cuenta mal los triggers de misma empresa.**
  - Dónde: `scripts/verificar-rls-despliegue.ts:32` (`TRIGGERS_MISMA_EMPRESA = 166`), y su test
    `tests/unit/scripts/verificar-rls-despliegue.test.ts:21,32,37,43,50`.
  - Qué pasa: SLT-52 añade 10 `sme_*` en `20261103120200` y 1 más en
    `20261103140100_rechazo_tienda_cobro_tarifa_valor_misma_empresa`, que es de T4.6 y no se
    contó. Medido:
    - `CREATE TRIGGER "sme_` en todas las migraciones: 167;
    - base local con las 6 migraciones aplicadas: `sme=167` (y `rtc=1`).
  - Efecto: `evaluarCatalogo` compara por igualdad (`m.sme === c.triggersMismaEmpresa`), así que
    el punto 6 sale ROJO tras un despliegue correcto. Un falso rojo en el chequeo de aislamiento
    entre empresas lleva a diagnosticar mal la RLS o a ignorar el script.
  - Arreglo: poner 167, nombrar la migración de T4.6 en el comentario y actualizar el test.

### Menores

- **H2 — R43 solo protege el cobro congelado; el pago congelado sigue modificable.**
  `20261103120100_tarifas_flexibles_tablas/migration.sql:287-294`. `gestion_pago_congelado` NO
  revoca UPDATE/DELETE a `servi_app`, así que la app puede reescribir un pago congelado. Lo decide
  design §2.5 (la 398 y la 477 re-congelan) y el test de R43 lo declara. Se acepta como diseño
  aprobado; queda anotado porque R43 dice «lo congelado de un cierre» sin excepción.
- **H3 — Una carrera en `fijar` sale como 500.** `lib/repositories/TarifaValorRepository.ts:146-170`.
  Si dos personas fijan a la vez el mismo nivel nuevo, el P2002 de `tarifa_valor_nivel_key` no se
  traduce (`GrupoDistritosService` sí lo hace). Hoy no hay pantalla; SLT-54 debe mapearlo a
  `validation_error`.
- **H4 — R39 en el pago del modelo viejo.** `lib/repositories/_shared/resolver-tarifas.ts:487`.
  Se hace una consulta por par `(zona, vehículo)` DISTINTO, en serie. En un cierre el par es uno,
  y así funcionaba antes (desvío 5 de T3), pero el test de R39 del viejo solo mide un par.
- **H5 — R9 solo está probado por partes.** No hay test que quite un valor y luego resuelva.
  «Quitar» deja el concepto en el nivel siguiente por construcción: la ausencia la cubren R16-R23.
  Basta un caso de integración para cerrarlo.
- **H6 — Un comentario nuevo nombra la moneda.** `lib/services/BulkOrdenService.ts:570`:
  «redondeado al colon» (calcado de `lib/types/cotizacion.ts:197`, que ya estaba en dev). Va
  contra la regla de no poner literales de moneda en código nuevo.
- **H7 — Falta una corrida E2E conjunta.** `progress/impl_SLT-52.md:1745`. Falta la corrida de
  dinero + humo juntos con el build que lleva `NEXT_PUBLIC_APP_URL`; por separado salieron en verde
  (27 y 18). El CI corre el E2E solo en el PR a producción.
- **H8 — Huecos abiertos que pasan a SLT-54** (`CierreAporteRepository.ts:53`):
  - el detalle del cierre de administración no pinta `fulfillment`/`ivaFulfillment`;
  - la tarjeta «tarifa aplicada» queda vacía en el modelo nuevo;
  - en el aporte por orden, una orden del nuevo sin el concepto aparece con 0.00.
  Están anotados en la bitácora (T5.3, abiertos 4 y 5) y conviene pasarlos a la ficha de SLT-54.
- **H9 — Un cambio de modelo a media solicitud la aborta.** `crearCierre` lanza
  `ModelosDeTarifaMezclados` si la empresa pasa al modelo nuevo entre que el servicio resuelve el
  pago y el congelado. La solicitud falla y se reintenta; es raro, solo pasa con el primer valor de
  la empresa.
- **H10 — Una frase del design quedó desfasada.**
  `specs/SLT-52-tarifas-flexibles-modelo/design.md:18` dice «Ninguna de las 11 raíces de
  composición cambia», pero `CierreDiaRepository` ahora recibe `TarifaVigenteRepository`. El
  código está bien y la guardia T7.1 lo vigila; solo falla el texto.

## Desvíos de la bitácora

Ninguno es inaceptable:
- Algunos los cerraron luego decisiones del humano: el fulfillment sin IVA pasó a R46, la traza
  del cobro por rechazo a R48-R50, «sin tarifa» a R51 y la base viva de la 398/477 a R52-R55.
- Otros siguen patrones del código: el historial lo escribe el repositorio con `appendAccion` en
  la tx, `fijarValor` devuelve `validation_error` donde el design decía `not_found`, el upsert se
  hace a mano por el NULLS NOT DISTINCT y la 477 resuelve en el repositorio.
- `CrearCierreInput.pagos` es opcional, pero lo compensa el `throw` de R37.
- La función de la base se mudó a `cobro-congelado.ts` para cortar el ciclo; el cuerpo es
  idéntico y lo verifiqué.
- `DesgloseCargaApi` no gana la clave para no tocar T0; la carga suma el IVA aparte y sí lo
  publica.
- H2, H4 y H8 vienen de desvíos aceptables que conviene tener a la vista.

## Gate

`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` → **INIT_EXIT=1**.

- typecheck 0 errores; lint 0 errores (234 avisos ajenos).
- `test:rapido`: 4 archivos fallidos y 1278 pasados; 9 tests fallidos, 17404 pasados y 26 saltados.
- Los cuatro rojos son los conocidos, que no son de SLT-52 y fallan igual en dev por la base local:
  `caja-backfill` (5) y `notificacion-evento-{bloqueo-cierre,gasto-fijo,webhook-suscripcion}-migration`
  (1+1+2).
- Ningún otro rojo. `carga-division`, `planes-asignacion` y `slt73-marcar-asienta` no fallaron en
  esta corrida.
- El gate se corta en `test:rapido`, así que los pasos posteriores de `init.sh` no se evaluaron en
  esta corrida. Las guardias que se relacionan con el diff corrieron dentro de `vitest related`.
- Log:
  `C:\Users\ArqDev\AppData\Local\Temp\claude\aab05f6b97f87a08\f7f7aab5-fce1-4ca5-876a-bed4e91ec523\scratchpad\init-slt52-review.log`.

## Qué falta para OK

Arreglar H1 (constante 167, su comentario y `tests/unit/scripts/verificar-rls-despliegue.test.ts`).
Los menores no bloquean: H3, H5 y H6 se arreglan en un minuto si el implementer vuelve, y H8 pasa
a la ficha de SLT-54.

## Vuelta 2 (2026-11-03)

Acotada a `b7baa743..66119764` (un commit: `66119764 fix(SLT-52): hallazgos de la revisión F2.2`).

### Veredicto: **OK con menores**

H1 (el único mayor) está arreglado y su test muere con la mutación. No hay regresiones ni hallazgos nuevos.

### Alcance del commit

10 archivos. Todos caen dentro de H1, H3, H5, H6, H10 o la bitácora:
- H1: `scripts/verificar-rls-despliegue.ts`, `tests/unit/scripts/verificar-rls-despliegue.test.ts`.
- H3: `lib/repositories/TarifaValorRepository.ts`, `lib/interfaces/repositories/ITarifaValorRepository.ts`
  (el tipo de retorno de `fijar`), `lib/services/TarifaValorService.ts`, `tests/unit/services/tarifa-valor-service.test.ts`.
- H5: `tests/integration/db/tarifas-flexibles-escritura.test.ts`.
- H6: `lib/services/BulkOrdenService.ts` (solo el comentario).
- H10: `specs/SLT-52-tarifas-flexibles-modelo/design.md` (solo esa fila).
- Bitácora: `progress/impl_SLT-52.md` (añade la sección de arreglos).

No toca nada más.

### Estado de cada hallazgo

| # | Estado | Evidencia |
|---|---|---|
| H1 (mayor) | **Cerrado** | `TRIGGERS_MISMA_EMPRESA = 167` y el comentario nombra `20261103140100`. Medido por mí: 167 `CREATE TRIGGER sme_` en `db/migrations/*/migration.sql` y 0 `DROP TRIGGER sme_`. Test 4/4. **Mutación a 166: caen los 4 tests.** Archivo restaurado y árbol limpio. |
| H2 | Aceptado | No se toca (ver vuelta 1). |
| H3 | **Cerrado** | Un P2002 de `tarifa_valor_nivel_key` devuelve `"nivel_ocupado"` y el service lo traduce a `validation_error` en `concepto`; cualquier otro error se relanza. El `try/catch` envuelve el `$transaction` **dentro** de `fijar`. Guardia `historial-accion-escrituras-cubiertas` (junto con `aprobacion-escrituras-cubiertas`): 98/98. Servicio 64/64, con 3 `it` nuevos (`meta.target`, forma del driver adapter, y otros P2002/P2003 que se propagan). |
| H4 | Aceptado | No se toca. |
| H5 | **Cerrado** | `it("R9 — quitar el valor del nivel especifico …")`: grupo=2100 → resuelve `2100.00`/`grupo`; `quitarValor` del servicio real → resuelve `1500.00`/`zona`. Literales con `toEqual`, contra Postgres; se ejecutó y no salió saltado (archivo 6/6). |
| H6 | **Cerrado** | `BulkOrdenService.ts:570` → «redondeado a la unidad de la moneda». |
| H7 | Aceptado | Sin cambios. |
| H8 | Derivado a SLT-54 | Ya está comentado en la ficha de SLT-54. |
| H9 | Aceptado | Sin cambios. |
| H10 | **Cerrado** | La fila del design dice ya que la única raíz que cambia es la de `CierreDiaRepository` y nombra sus tres puntos. |

### Verificación que corrí

- `vitest run` de `verificar-rls-despliegue.test.ts`, `tarifa-valor-service.test.ts` y `tarifas-flexibles-escritura.test.ts`: 3 archivos, 74/74, ninguno saltado.
- Guardias `*-escrituras-cubiertas`: 2 archivos, 98/98.
- Mutación de H1 (167 → 166): 4/4 rojos; restaurada.
- Gate del implementer (`init-slt52-fixrev.log`):
  - `INIT_EXIT=1`; typecheck y lint pasan.
  - `test:rapido`: 4 archivos y 9 tests rojos, 1278 archivos y 17408 tests verdes.
  - Los 4 rojos son los conocidos ajenos: `caja-backfill` (5) y `notificacion-evento-{bloqueo-cierre,gasto-fijo,webhook-suscripcion}-migration` (1+1+2). No hay ningún rojo de SLT-52.

### Menor (observación, no bloquea)

- El texto del error de H3 lo redactó el implementer, porque el spec no lo define. Es razonable y no nombra la moneda; queda a la vista por si producto quiere otro.
