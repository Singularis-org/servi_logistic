# SLT-188 «Tests que dejan filas fuera de su transacción» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1170–R1189**

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`.

**Sin código de producción.** El diff toca `tests/`, un script nuevo de comprobación y
`.github/workflows/gate.yml` (no está en `arnes.manifest`). No toca `init.sh` (archivo del arnés),
migraciones ni esquema. Si lo hiciera falta, se para (R1187).

## Origen

- SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31», T1 (run de CI
  43973243440): en los shards 2 y 3 hubo, en algún momento, una `orden` y una `zona` de OTRA empresa
  confirmadas en la base de servicio; cinco tests las leyeron como «la primera fila» y el trigger
  SL017 rechazó la escritura (`progress/medicion_SLT-177.md:85`, `:92-101`).
- Decisión de Carlos del 2026-11-16 (`progress/features/SLT-177.md:20`): SLT-188 = F11.
- Lector anotado para esta ficha: `total-a-cobrar-sin-cerrado-sql-real.test.ts:68` lee
  `tx.zona.findFirst({ where: { esCentral: true } })` sin acotar; con datos ajenos toma la central de
  otra empresa y el trigger rechaza la orden (`progress/impl_SLT-177.md:274-279`, `:295`).

## Lo que ya existe

Buscado `bajoLockDeEscrituraReal`, `limpiar459`, `limpiarComprometido`, `limpiar419`, `crearOrganizacion`,
`prisma.zona.create`, `prisma.orden.create`, `filas huerfanas` en `feature_list.json`, `specs/`, `tests/`,
`scripts/` y `.github/` (Grep/Read).

| Dónde | Qué hay | Qué se hace |
|---|---|---|
| Board | Ninguna ficha busca filas confirmadas que dejan los tests. SLT-178…SLT-184 (siembra propia) quitan los LECTORES de «la primera fila» (R737 de SLT-177); esta ficha va por los ESCRITORES. | Se sigue; no se tocan sus archivos. |
| Tests que **commitean y limpian a mano** (no van en tx revertida), con `orden` y/o `zona` | `aislamiento-ordenes.test.ts:252-284` (dos empresas con zonas y órdenes, de `beforeAll` a `afterAll`); `central-sin-satelite-premio-incentivo.test.ts:96-254`; `cobro-plataforma-cargos.test.ts:566`; `rechazo-tienda-cobro.int.test.ts:323`; `wallet-anulacion-concurrencia.test.ts:93`; `aislamiento-wallet.test.ts:181`; `incentivo-mensajero-slt68.test.ts:107`; `pago-mensajero-bodega-duena.test.ts:87`; `419/_escenario-419.ts:160,210` (bloque R8); `454/_escenario.ts:804-868` (`sembrarComprometido`). Hoy los dos últimos fallan antes de escribir (sin empresa); SLT-185 «aporte-capital sin empresa en contexto» los arregla y entonces commitearán. | **Inventario de candidatos** para T1 (la lista sale de un `grep`, no es exhaustiva: también hay `INSERT` en SQL a mano). |
| `tests/fabricas/organizaciones.ts:29-39` | Nombre por defecto «Empresa de prueba <sufijo>», slug `prueba-<sufijo>`. Las filas de negocio llevan prefijos propios del test (`SLT124-`, `Central 419 …`, `T31 A …`). | La atribución se hace por esos identificadores, nunca por la hora. |
| `.github/workflows/gate.yml:210-231` | Cada shard: base efímera `migrate deploy` + `db:seed` (solo catálogos) y luego la suite. `gate-completo` une los informes de los shards. | Punto de enganche de la comprobación (R1172-R1174). |

Dos clases de fuga, que la ficha separa:
- **(a) Fuga permanente:** filas que siguen en la base al terminar la suite (limpieza que falta, que
  falla a medias o que no corre si el test cae).
- **(b) Ventana:** filas confirmadas mientras un archivo corre, visibles para los archivos que corren a
  la vez en otro worker. Es inherente a «commitear y limpiar»; el remedio de los lectores es R737 de
  SLT-177, y de los escritores, no commitear lo que se puede revertir.

## Requisitos (EARS)

### Detección

- **R1170** — El repo DEBE tener una comprobación que, dada una foto de la base tomada antes de la suite
  y otra después, liste cada `organizacion` que no estaba antes y sigue existiendo, con el número de filas
  suyas en `orden`, `zona`, `usuario` y en cada otra tabla de negocio con filas, y una muestra de
  identificadores legibles (`num_remision`, nombre de zona, email). DEBE listar también los `value` de
  `order_status` que no estaban antes.
- **R1171** — La foto «antes» DEBE tomarse sobre la base ya migrada y sembrada (después de `db:seed`),
  de modo que lo que traigan migraciones y catálogos NO cuente como fuga. T1 DEBE medir qué hay en esa
  foto en una base nueva (no se supone 0).
- **R1172** — CUANDO corre un shard de `vitest` en CI, DEBE tomarse la foto antes de la suite y
  compararse después, y el resultado DEBE subirse con el informe del shard.
- **R1173** — SI algún shard deja filas según R1170, ENTONCES `gate-completo` DEBE salir en rojo y su
  resumen DEBE nombrar el shard, la organización, la tabla y el conteo. SI no deja ninguna, ENTONCES
  DEBE decirlo («0 filas fuera de su transacción») en el resumen.
- **R1174** — SI falta el informe de la comprobación de un shard que corrió la suite, ENTONCES
  `gate-completo` DEBE salir en rojo (falla cerrado, `docs/gate.md > El anti-patrón: la validación
  opcional`).
- **R1175** — La comprobación DEBE poder correrse en local contra una base desechable con el mismo
  resultado, y NO DEBE borrar ni modificar ninguna fila: solo lee.
- **R1176** — La comprobación DEBE probar que muerde (`docs/gate.md > Probar que muerde`): un caso con
  una organización nueva y una orden y una zona suyas confirmadas DEBE dar el informe con esas filas y
  salida 1; un caso sin filas nuevas, salida 0; un caso con filas que ya estaban en la foto «antes»,
  salida 0.

### Encontrar y arreglar

- **R1177** — T1 DEBE identificar, con la comprobación de R1170 en una corrida de la suite completa (CI
  del PR o local en desechable), cada archivo que deja filas (clase a), atribuyéndolo por los
  identificadores de las filas y no por la hora. El resultado DEBE quedar en `progress/impl_SLT-188.md`
  con fila → archivo → `archivo:línea` de la escritura.
- **R1178** — Cada archivo identificado en R1177 DEBE dejar de dejar filas: o pasa a sembrar dentro de
  una transacción revertida, o su limpieza cubre todo lo que crea, corre en `finally`/`afterAll` aunque el
  caso falle y borra la organización la última (una fila olvidada hace fallar el borrado, no se queda
  muda).
- **R1179** — Cada archivo arreglado DEBE seguir pasando todos sus casos, sin quitar ni debilitar
  aserciones, sin cambiar literales esperados por su fuente y sin bajar el número de casos.
- **R1180** — `total-a-cobrar-sin-cerrado-sql-real.test.ts` NO DEBE leer una zona central que no haya
  creado él (`:68`); DEBE crear la suya en la empresa de la tx con control positivo (`count === 1`), y
  DEBE pasar en una base vacía y en una base con datos de otra empresa.
- **R1181** — SI T1 no encuentra ninguna fuga de clase (a), ENTONCES la ficha DEBE dejarlo escrito con
  la evidencia (informe de R1170 con 0 filas en los 3 shards) y cerrar con la detección (R1170-R1176) y
  R1180; NO DEBE inventar arreglos.
- **R1182** — Para la clase (b), `progress/impl_SLT-188.md` DEBE dejar el inventario de archivos que
  commitean filas de negocio con su motivo escrito en el propio archivo (p. ej. «los repositorios abren su
  propia `$transaction`», `aislamiento-ordenes.test.ts:34-37`); los que no lo tengan y puedan ir en una tx
  revertida DEBEN pasar a ella si caben en el tope del PR, y los demás DEBEN quedar en la deuda
  (`progress/deudas.md`) con su ficha.

### Criterio de hecho medible

- **R1183** — En el CI del PR, los 3 shards DEBEN dar «0 filas fuera de su transacción» con la
  comprobación activa y `gate-completo` en verde.
- **R1184** — La suite de los archivos del inventario de R1182 y del alcance de R1177 DEBE correr dos
  veces seguidas sobre la MISMA base desechable sin un solo rojo nuevo en la segunda (las filas de la
  primera no contaminan la segunda), y la comprobación DEBE dar 0 al final de cada una.
- **R1185** — Una mutación que quite la limpieza de un archivo arreglado (restaurada desde copia) DEBE
  hacer que la comprobación dé salida 1 nombrando ese archivo por sus identificadores.

### Límites

- **R1186** — SI el arreglo de un escritor obliga a cambiar `lib/` (p. ej. un repositorio que no admite
  una tx externa), ENTONCES ese archivo NO DEBE arreglarse aquí: va a la deuda con su evidencia.
- **R1187** — SI la causa de una fuga resulta ser un fallo real de producción (código de la app que
  escribe fuera de la empresa o fuera de la tx que le pasan), ENTONCES la implementación DEBE parar,
  escribir la evidencia y preguntar al leader. Tampoco se toca `init.sh`: si la detección necesitara
  vivir ahí, se para y se propone por `/afinar-regla`.
- **R1188** — `tests/baseline-rojos.json` NO DEBE ganar ninguna entrada por esta ficha. SI un archivo del
  baseline pasa a verde por quitar una fuga (un «dato ajeno»), ENTONCES su entrada DEBE retirarse en el
  mismo PR.
- **R1189** — La comprobación NO DEBE leer ni imprimir credenciales ni la URL de la base (solo conteos,
  ids y los identificadores de R1170).

## Verificación

- Base DESECHABLE por `con-desechable.cjs` (scratchpad, fuera del repo; sin leer ni imprimir la URL):
  `pnpm exec prisma migrate deploy` + `pnpm run db:seed`. **Nunca** la base del `.env` ni `migrate reset`.
- Fixtures de R1176 y mutación de R1185, con su salida en la bitácora (código de salida escrito al log,
  no por `tail`).
- CI del PR: resumen de `gate-completo` con la línea de R1173.

## Tasks

- [ ] **T1 — Comprobación** (R1170, R1171, R1175, R1176, R1189). Script de foto/comparación + sus
  fixtures. Medir la foto de una base nueva. *Hecho:* fixtures 0/1/0 en verde; foto de base nueva
  anotada.
- [ ] **T2 — Enganche en CI** (R1172-R1174). Pasos en `gate.yml` (foto antes y después en cada shard;
  lectura en `gate-completo`). Primero en modo informe en un push del PR para medir, sin rojo. *Hecho:*
  informe de los 3 shards descargado.
- [ ] **T3 — Atribución** (R1177, R1181, R1182). Mapear cada fila a su archivo; inventario de clase (b).
  *Hecho:* tabla en `progress/impl_SLT-188.md`. Si la tabla pasa del tope del PR, parar y proponer corte.
- [ ] **T4 — Arreglar escritores** (R1178, R1179, R1186, R1187). *Hecho:* cada archivo verde y sin filas.
- [ ] **T5 — `total-a-cobrar-sin-cerrado-sql-real`** (R1180). *Hecho:* verde en base vacía y con datos
  ajenos.
- [ ] **T6 — Rojo activado y mutación** (R1173, R1185). Quitar el modo informe; mutación de limpieza →
  rojo; restaurar. *Hecho:* evidencia en la bitácora.
- [ ] **T7 — Doble corrida** (R1184). *Hecho:* dos corridas sobre la misma desechable, 0 y 0.
- [ ] **T8 — Cierre** (R1183, R1188). typecheck, lint, `pnpm run test:guardias`, `git diff --name-only
  origin/dev -- lib app components hooks db` vacío, `node scripts/tamano-pr.mjs`, deudas, mapa R → test,
  `./init.sh` (leader) y `gate-completo` verde con «0 filas fuera de su transacción».

## Archivos esperados

- `scripts/filas-fuera-de-tx.ts`
- `tests/unit/guards/filas-fuera-de-tx.guardia.test.ts`
- `.github/workflows/gate.yml`
- `tests/integration/db/total-a-cobrar-sin-cerrado-sql-real.test.ts`
- `tests/integration/db/aislamiento-ordenes.test.ts`
- `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts`
- `tests/integration/db/cobro-plataforma-cargos.test.ts`
- `tests/integration/db/rechazo-tienda-cobro.int.test.ts`
- `tests/integration/db/wallet-anulacion-concurrencia.test.ts`
- `tests/integration/db/aislamiento-wallet.test.ts`
- `tests/integration/db/incentivo-mensajero-slt68.test.ts`
- `tests/integration/db/pago-mensajero-bodega-duena.test.ts`
- `tests/integration/db/_fixtures/escrituras-459.ts`
- `tests/baseline-rojos.json`
- `progress/deudas.md`
- `progress/impl_SLT-188.md`
- `progress/features/SLT-188.md`

Los archivos de tests de la lista son **candidatos**: solo se tocan los que T3 identifique. Tamaño
estimado: ≤ 17/40 archivos; 0 de producción (el script cuenta como `scripts/`); ~500 líneas de tests.

## Preguntas abiertas

1. **Choque con SLT-185 «aporte-capital sin empresa en contexto».** SLT-185 hará que `sembrarComprometido`
   (`454/_escenario.ts`) y el bloque R8 de `419/_escenario-419.ts` commiteen de verdad (hoy fallan antes
   de escribir). Si SLT-185 se mergea antes, su limpieza entra en el informe de esta ficha; si se mergea
   después, su R1145 lo cubre. Propuesta: no tocar esos dos helpers aquí. El leader decide el orden.
2. **Rojo desde el primer día.** Con R1173 activo, cualquier fuga que T3 no arregle pondría en rojo todos
   los PR. Propuesta: el rojo se activa en T6 solo si T3-T5 dejan el informe en 0; si no cabe, la
   comprobación se mergea en modo informe y una ficha nueva activa el rojo. Necesita OK de Carlos.
