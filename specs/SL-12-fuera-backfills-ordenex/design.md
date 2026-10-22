# SL-12 — Diseño: fuera los backfills de Ordenex

## Lo que ya existe

Búsqueda hecha el 2026-10-21, con Grep. El MCP del grafo no estaba disponible para este agente.

- **Board** (`feature_list.json`, todas las fichas): buscado `backfill`, `contraste`, `bench`,
  `rollup-analitica-manual`, `incidente`. Solo aparece SL-12. Fichas vecinas que tocan lo mismo:
  - SL-10: deja el gate en verde. No toca ninguno de los archivos de esta ficha. Su lista de
    archivos esperados y la nuestra no se cruzan.
  - SL-11: seeds y zonas. No toca `backfill-*`.
  - SL-15: el nombre «Ordenex» en el código. Es candidata para `rollup-analitica-manual.ts` y
    `drenar-jobs.ts` (pregunta abierta 1).
- **Specs:** no hay ningún `specs/SL-*` que retire scripts. Los specs de Ordenex 125, 128, 173 y 400
  describen los tres scripts. Se quedan como historia (R10).
- **Código:** los tres scripts, sus cinco tests, dos guardias que los censan por ruta, un comentario en
  `lib/` y otro en un test (inventario completo abajo). No hay nada que ya los retire. Se reutilizan
  las guardias existentes: se acota su censo, no se reescriben.

## Comprobación de migraciones (precondición de la ficha)

La ficha dice «salvo que una migración los necesite». Se midió así:

- `scripts/(backfill|contraste|medir|rollup-analitica|bench|drenar)` en `db/`: 0 coincidencias.
- `backfill-`, `marcador-config` y `tesoreria\.ts` en `db/migrations/`: una sola coincidencia, en
  `20260803120000_caja_tesoreria/migration.sql:42`, que cita `lib/utils/caja-tesoreria.ts`, no el
  script.
- Las migraciones que hablan de «backfill» en prosa son de tres tipos:
  - `20260731120000_analytics_daily` dice que la tabla es derivada y que «la puebla el job de la 124
    y el backfill de la 125». No ejecuta el script ni depende de él: la tabla nace vacía (R44 de la 124).
  - `20260803140000_job_tipo_analitica_invalidacion_cache` añade el tipo de job que encolaba el
    script. Se queda (R8): sin el script nadie encola ese tipo, pero el handler sigue registrado y el
    valor del enum no molesta.
  - `20260926120200_cobro_tienda_461_completar_caja` hace su relleno en el propio SQL. No llama a
    ningún script.
- Fuera de `db/`, nadie ejecuta los scripts. No están en `package.json`, ni en
  `.github/workflows/`, ni en `vercel.json`, ni en `arnes.manifest`, ni en ningún `*.sh` o `*.mjs`.

Conclusión: ninguna migración ni ningún job necesita los tres scripts. Se pueden retirar.

## Inventario: quién cita cada script

| Script | Lo importa o lo lee | Lo cita por ruta | Acción |
|---|---|---|---|
| `scripts/backfill-analitica.ts` | `tests/unit/scripts/backfill-analitica-cli.test.ts`, `tests/unit/scripts/backfill-analitica-invalidacion.test.ts` | `tests/unit/analytics/backfill-guards.test.ts` (`ARCHIVOS_125`, `MODULOS_125`, caso R29); comentario en `tests/unit/analytics/cache-invalidacion-backfill.test.ts:128` | borrar el script y sus dos tests; acotar la guardia (D2); arreglar el comentario (D4) |
| `scripts/backfill-caja-tesoreria.ts` | `tests/unit/scripts/backfill-caja-tesoreria-cli.test.ts` | `tests/unit/guards/caja-173-alcance.guardia.test.ts:316` (`MODULOS_DE_LA_173`) | borrar el script y su test; acotar la guardia (D3) |
| `scripts/backfill-marcador-config-geocode.ts` | `tests/unit/scripts/backfill-marcador-config-geocode-cli.test.ts`, `tests/integration/db/backfill-marcador-config-geocode.test.ts` | comentario en `lib/geo/fallo-config-geocode.ts:42` | borrar el script y sus dos tests; arreglar el comentario (D4) |

En `specs/` de Ordenex los citan 125, 128, 173, 400 y 401, en prosa y en `requirements.md`. No se tocan.

## Diseño

No hay modelo de datos, ni migración, ni ruta, ni autorización, ni datos de país: la ficha solo
borra archivos y acota dos censos. Por eso no aplican `organizacion_id`, RLS ni `down.sql`
(`docs/perfil-agentes.md > spec_author`).

### D1 — Borrado (R1, R3)

Se borran ocho archivos:

- los tres scripts de R1;
- `tests/unit/scripts/backfill-analitica-cli.test.ts`;
- `tests/unit/scripts/backfill-analitica-invalidacion.test.ts`;
- `tests/unit/scripts/backfill-caja-tesoreria-cli.test.ts`;
- `tests/unit/scripts/backfill-marcador-config-geocode-cli.test.ts`;
- `tests/integration/db/backfill-marcador-config-geocode.test.ts`.

Los cinco tests importan el script por `@/scripts/...` o leen su fuente. Sin el script no tienen
sujeto: no se pueden adaptar, solo borrar.

### D2 — `backfill-guards` (R6, R7)

- `ARCHIVOS_125` pierde `scripts/backfill-analitica.ts` y se queda con los tres de `lib/`. El título del
  caso «las cuatro rutas censadas existen» pasa a «las tres».
- `MODULOS_125` pierde `@/scripts/backfill-analitica`. `MODULOS_PROHIBIDOS_FUERA` se deriva de
  `MODULOS_125`, así que sigue prohibiendo que un consumidor externo importe el servicio y el contrato
  (R7). El caso no se toca.
- Caso R29: el barrido de URLs de conexión sigue sobre `ARCHIVOS_125`. La contracara
  `soloCodigo(leer("scripts/backfill-analitica.ts"))` toMatch `env.DATABASE_URL` se quita: su único
  sujeto era el script. No hay sustituto honesto, porque los tres archivos de `lib/` reciben el cliente
  por inyección y no leen el entorno.
- Los demás casos (R2, R4, R5, R8, R20, R31, R33, R32) se aplican igual sobre el censo que queda.
- El comentario de cabecera de `CONSUMIDORES_EXTERNOS` habla del «SCRIPT del backfill» en prosa. Se
  deja, porque no cita la ruta. Si el implementer lo corrige, que sea solo esa frase.

### D3 — `caja-173-alcance` (R5)

- `MODULOS_DE_LA_173` pierde `scripts/backfill-caja-tesoreria.ts`.
- El caso «ningún módulo de la 173 nombra un insumo» lee cada entrada con `codigoSinComentarios`. Con
  el archivo borrado y la entrada dentro, fallaría con `ENOENT`, y por eso hay que quitar la entrada.
- El caso «CIERRE de la lista» sigue barriendo `lib/` y `scripts/` (`FUENTES`). Su control de no
  vacuidad (`conCategoriasNuevas.length > 0`) sigue en verde: `lib/utils/caja-tesoreria.ts` y los
  servicios de la caja siguen nombrando las categorías nuevas.
- `VERIFICADORES_SOLO_LECTURA` (`scripts/contraste-454.ts`) no se toca (R9).

### D4 — Citas de ruta en comentarios (R4)

- `lib/geo/fallo-config-geocode.ts:42`: el comentario justifica la idempotencia de
  `marcarFalloConfigGeocode` con «lo necesita la reparación de datos históricos
  (`scripts/backfill-marcador-config-geocode.ts`, R17)». Se reescribe sin la ruta: «marcar dos veces no
  duplica el prefijo, así que una reparación de datos históricos puede correrse dos veces». La
  propiedad sigue siendo cierta y la prueba `tests/unit/geo/fallo-config-geocode.test.ts`.
- `tests/unit/analytics/cache-invalidacion-backfill.test.ts:128`: el comentario «tal y como lo hace
  `scripts/backfill-analitica.ts`» pierde la ruta. El test no importa el script: ejerce el encolado y
  el handler directamente, y se queda.

### D5 — Guardia de retirada (R2, R3, R4, R11)

Archivo nuevo: `tests/unit/guards/backfills-retirados.guardia.test.ts`. La selecciona
`pnpm run test:guardias` por el nombre («guard»), sin registrarla en ninguna lista.

- **Qué vigila:** solo los tres nombres de R1. No prohíbe `scripts/backfill-*` en general: si
  servi_logistic necesita un backfill propio mañana, se escribe sin tocar esta guardia.
- **Casos:**
  1. Ninguno de los tres archivos existe (R1, R11).
  2. Ningún archivo de `app/`, `lib/`, `components/`, `hooks/`, `providers/`, `scripts/`, `tests/` y
     `e2e/` contiene `scripts/backfill-analitica`, `scripts/backfill-caja-tesoreria` ni
     `scripts/backfill-marcador-config-geocode`. Se lee el texto crudo, comentarios incluidos. La propia
     guardia queda excluida por ruta (R3, R4, R11).
  3. Ningún archivo de `db/migrations/` contiene esos tres nombres (R2).
- **Autocomprobación:**
  - el detector se prueba sobre texto sintético: un `import … from "@/scripts/backfill-analitica"` y
    un comentario con la ruta se marcan, y `scripts/backfill-otro.ts` no se marca;
  - se afirma el tamaño de lo barrido: más de 100 archivos de código y más de 10 carpetas de
    migración. Así un recorrido vacío no puede pasar en verde.
- **El mensaje** nombra cada archivo que cita un script y dice que la ficha SL-12 los retiró. Un port
  desde Ordenex (`docs/plan-saas.md > Sincronía con Ordenex`, `git apply` de un diff) es la vía
  realista por la que volverían, y el mensaje tiene que servirle a quien lo aplica.
- **Por qué la guardia no repite listas en otros sitios:** las tres rutas se declaran una vez, en la
  constante de la guardia.

### D6 — `test-citado-desaparecido` (R12)

La guardia lee las filas `| R<n> | … |` de `specs/*/tasks.md` y `specs/*/design.md`, y marca la cita
a un test que la historia de git vio borrarse.

- **Comprobado con Grep:** ningún `tasks.md` ni `design.md` cita en una fila de requisito uno de los
  cinco tests de D1. Las citas que hay están en:
  - `requirements.md`, que la guardia no lee: 125:281, 128:240 y 128:248, 400:304;
  - prosa de tareas: 125/tasks.md:96, 128/tasks.md:119-121, 173/tasks.md:286, 400/tasks.md:281;
  - prosa de diseño: 125/design.md:69.
- **Trampa:** el borrado solo entra en `BORRADOS` cuando está commiteado, porque la guardia lee
  `git log HEAD`. El implementer corre la guardia **después** de commitear el borrado. Un verde antes
  del commit no prueba nada.
- **El spec propio:** ni este `design.md` ni el `tasks.md` pueden escribir filas `| R<n> |` que citen
  entre backticks uno de los cinco tests borrados. La tabla de trazabilidad cita solo tests vivos.

### D7 — `docs/limpieza-ordenex.md` (R13)

La fila «Backfills de Ordenex» de la lista concreta pasa a «Hecho (SL-12)». Lleva una línea con el
resultado de la comprobación de migraciones. El inventario por grep de los §2 y §3 es una foto
medida y no se reescribe.

## Scripts hermanos: por qué no entran

| Script | Qué es (leído en su cabecera) | Lo que arrastra retirarlo | Propuesta |
|---|---|---|---|
| `scripts/contraste-454.ts` + `.sql` | contraste histórico de la ficha 454, para correr en producción de Ordenex | `caja-173-alcance` lo declara en `VERIFICADORES_SOLO_LECTURA`. El caso «los verificadores de solo lectura no escriben» exige que esa lista no esté vacía, así que habría que reescribir el caso | ficha nueva (pregunta 1) |
| `scripts/medir-462-retenidas.sql` | medición previa al despliegue de la ficha 462 | dos tests de integración la leen y la ejecutan: `tests/integration/db/462/medir-462-hoy-cr.test.ts` y `tests/integration/db/462/reprogramadas-retenidas-sql-real.test.ts` (R55 de la 462) | ficha nueva (pregunta 1) |
| `scripts/rollup-analitica-manual.ts` | ejecución manual de una fecha del rollup, con guarda de host `localhost:5432/ordenex` | lo importa `tests/unit/services/analitica-rollup-handler.test.ts` (`esDestinoLocalOrdenex`). Lo listan `rollup-guards`, `backfill-guards` (R33) y `analytics-daily-guards` | SL-15: es el nombre «Ordenex» en código (`docs/limpieza-ordenex.md` §3) |
| `scripts/drenar-jobs.ts` | drenado local de la cola, con la misma guarda de host | listado en `docs/limpieza-ordenex.md` §3 | SL-15 |
| `scripts/bench-busqueda-ordenes.ts` | banco de rendimiento del buscador (ficha 169) | lo citan `busqueda-texto-solo-lectura`, `catalogo-postgres-acota-esquema`, `busqueda-usa-indice` y un comentario de `OrdenRepository` | se queda: herramienta genérica, sin datos de Ordenex |

Ninguno se llama `backfill-*`. Meterlos aquí cambiaría la complejidad de la ficha (de low a medium) y
el humano no lo ha decidido.

## Alternativas descartadas

- **A. Retirar todo el corte vertical de cada backfill** (servicios, contratos, planificador, encolado
  y sus tests). Se descarta porque:
  - no es arreglo mínimo;
  - `lib/analytics/backfill-rango.ts` lo usa producción (`HORIZONTE_HISTORIAL_CR` en
    `AnaliticaOperativaService` y en `lib/api/analitica-api-key-rango.ts`);
  - `CajaBackfillTesoreriaService` lo ejerce `tests/integration/db/abono-tienda-457.test.ts`, un test
    de otra ficha;
  - borrar los servicios obligaría a rehacer `backfill-guards` entero.

  Queda como pregunta abierta 2.
- **B. Dejar los scripts y marcarlos como «no usar»** (comentario o carpeta `scripts/ordenex/`). Se
  descarta porque es lo contrario de lo que pide la ficha. Además, mover la carpeta mantiene vivos los
  cinco tests y las dos guardias, y obliga a reescribir las rutas de los censos.
- **C. Sin guardia nueva, verificando el borrado solo por el diff.** Se descarta porque:
  - R1 a R4 se quedarían sin test, y `CLAUDE.md` regla 4 exige uno por requisito;
  - un port desde Ordenex por `git apply` puede devolver un script o un import sin que nada falle en
    verde.
- **D. Guardia que prohíba cualquier `scripts/backfill-*`.** Se descarta porque bloquearía un backfill
  legítimo de servi_logistic y convertiría una limpieza en una regla de arquitectura que nadie ha
  pedido.

## Dependencias de terceros

Ninguna.

## Trampas para el implementer

- **Antes de empezar:** SL-10 tiene que estar integrada en `dev` y la rama tiene que partir de ese
  `dev`. Sin SL-10, `test-citado-desaparecido` está roja por la historia de git de Ordenex y R12 no se
  puede comprobar.
- **R12 se comprueba con el borrado commiteado** (D6).
- **No escribas filas `| R<n> |` que citen entre backticks los tests borrados**, ni en este spec ni en
  `progress/impl_SL-12.md`. En `progress/` la guardia no mira, pero conviene no sembrar la costumbre.
- **El barrido de R4 lee comentarios**, así que tras el borrado `pnpm run test:guardias` es quien dice
  si queda alguna cita. Grep antes:
  `scripts/backfill-(analitica|caja-tesoreria|marcador-config-geocode)` en `app lib components hooks
  providers scripts tests e2e db`.
- **Log del gate a archivo**, con `INIT_EXIT=$?` escrito dentro (`docs/gate.md > Trampas conocidas`).
