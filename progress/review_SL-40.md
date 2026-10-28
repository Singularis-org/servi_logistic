# Review SL-40 «Cobro de la plataforma por orden»

- Revisor: `reviewer`, 2026-10-24, sobre `1a38015` (diff contra `origin/dev` `f90799a`).
- Base desechable `sl40r_main`: `migrate deploy` sin seed. Se borró al acabar, y no queda ninguna
  base `sl40*` en `pg_database`.
- `gate.lock` tomado («reviewer SL-40») con `prisma generate` dentro, y soltado al acabar.
- No se usó la base `servi-logistic` ni se copió el `.env`: la URL se deriva en memoria y no se
  imprimió.
- MCP del grafo: no estaba entre mis herramientas, así que usé Grep/Read.

## Checklist

### Especificación y tasks
- [x] `requirements.md` con R1–R29 en EARS.
- [x] `design.md` con 5 alternativas descartadas (§12).
- [x] `tasks.md`: T0–T10 en `[x]`, ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`, y la tabla está llena. El diff no re-crea nada de esa lista:
  - no toca `WalletService`;
  - reutiliza `esPlataforma`, `comoPlataforma`, `REGIONES_BOLSILLO_EMPRESA` y el generador de misma empresa.
- [~] Decisiones de Carlos (P1 congelar, P2 sin IVA, P3 la cancelación por API se cobra): el código hace
  lo decidido, pero `requirements.md` sigue diciendo «ABIERTA» en P1–P3 (m1).

### Trazabilidad
- [x] `progress/impl_SL-40.md > Mapa R<n> → test (final)` cubre R1–R29, cada uno con un test real.
- [x] 4 mutaciones pedidas, y 2 más. Cada una con autocomprobación: el md5 de control cambia al
  mutar y vuelve a `4cb8ff6f…` tras restaurar. Corrí `cobro-plataforma-cargos.test.ts` entero:

| # | Mutación | Resultado |
|---|---|---|
| A | El trigger de creación no cubre la vía fulfillment (`estatus` `en_preparacion`, carga masiva) | 10 failed / 8 passed (cae R12/R19 o3) |
| A2 | El trigger no cubre la vía con guía (pantalla y API) | 14 failed / 4 passed |
| B | Sin reverso al eliminar | 6 failed / 12 passed (cae R15 primero) |
| C | Tarifa no congelada: cambiar el global reescribe los cargos `global` | 8 failed / 10 passed (cae R14 primero) |
| C2 | Recuperar cobra la tarifa de hoy | 4 failed / 14 passed (R16) |
| D | Sin el `REVOKE` de `servi_app` en la tabla de cargos | 1 failed / 17 passed (R8) |

- [x] Sin mutar: `cobro-plataforma-cargos`, `deuda-plataforma-wallet` y `empresas-plataforma-cobro`
  dan 33/33 en verde.

### Triggers (comprobado a mano en `sl40r_main` como `servi_app`)
- [x] Cubren pantalla, carga masiva y API: es el mismo `INSERT`, y lo confirman las mutaciones A y A2.
- [x] Eliminar → reescribir la fecha → recuperar ×2 → eliminar → recuperar → eliminar → cancelación
  por API da `1:cargo 2:reverso 3:cargo 4:reverso 5:cargo 6:reverso` y deuda 0,00. Los reintentos
  y la fecha reescrita no registran nada.
- [x] Carrera de dos sesiones sobre la misma orden, borrando y recuperando a la vez (sin
  `WHERE deleted_at IS NULL`): sale un solo reverso y un solo cargo. La fila bloqueada serializa.
- [x] La desviación «último movimiento más `NEW.deleted_at`» es correcta. Es más robusta que
  `OLD.deleted_at`: una fecha reescrita sobre una orden ya borrada no da un doble reverso, y la mata
  la mutación M3 del implementer.
- [x] P3: un `UPDATE` de estado no dispara (`AFTER UPDATE OF deleted_at … WHEN DISTINCT`), y la
  orden cancelada conserva su cargo.
- [ ] **El cargo se puede borrar o eludir con SQL a mano desde la empresa** (B1, B2).

### Seguridad
- [x] Privilegios de `servi_app`:
  - `cobro_plataforma_movimiento`: solo `SELECT`, con RLS y política `…_por_empresa`;
  - `cobro_plataforma_tarifa`: sin privilegios;
  - `organizacion`: solo `SELECT`, así que la empresa no puede cambiar su propia excepción.
- [x] Las funciones son `SECURITY DEFINER` con `search_path` fijo y `EXECUTE` solo para `postgres`.
- [x] El aislamiento entre empresas lo prueban:
  - R24 (B no ve los cargos de A);
  - R20 (un cargo de A con una orden de B da `SL017`);
  - el `where: { organizacionId }` explícito del repositorio.
- [x] Solo el superadmin configura:
  - `esPlataforma` va antes de zod y de la base (R6, `cobro-plataforma-service`);
  - la página ya da `notFound()` a otro rol.
- [ ] `servi_app` tiene `DELETE` sobre `orden`, y la FK `ON DELETE CASCADE` se lleva los cargos (B1).

### Wallet
- [x] La deuda llega por su propia action y su propio servicio. `WalletService` y
  `wallet_movimiento` no se tocan (R27).
- [x] Lo miden:
  - `deuda-plataforma-wallet`: 0 filas en `wallet_movimiento`;
  - el E2E T7: dinero en caja, entró, salió, ganancia, IVA, aportes, tiendas y «De la empresa» salen
    iguales en las tres lecturas;
  - la mutación de `REGIONES_BOLSILLO_EMPRESA`, que da rojo.
- [x] El IVA de SL-39 sigue igual: ₡416 antes y después en el E2E, y `wallet-iva-aparte-sl39` sigue
  verde (4/4, en la bitácora).
- [x] La deuda se calcula con `Prisma.Decimal` y llega como texto, y la pantalla no hace aritmética (R26).

### Migraciones
- [x] Las tres traen `down.sql`. R29 lo prueba en una base propia; las mutaciones IV-a e IV-b caen.
- [x] Cada carpeta tiene un solo commit (`1315559` y `a73010e`), así que no se editaron después.
  Van detrás de la última de `dev` (`20261023120100`).
- [x] Sin drift: `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` da
  «empty migration», y `migrate status` da «up to date».
- [!] Están en QA y no se pueden editar: los arreglos de B1 y B2 van en una **migración nueva**.

### Rendimiento
- [x] Medido en T4 con `BulkOrdenService.cargarMasiva` real, 500 filas, intercalando con y sin
  triggers:
  - con guía: +9 % (≈0,22 ms por orden);
  - fulfillment: +13 % (≈0,14 ms por orden).
- [x] Es un `SELECT` por PK a `organizacion`, otro a la tarifa y un `INSERT` por fila: un coste
  aceptable.
- [~] No se midió un `INSERT` suelto, aunque el coste por fila ya está medido (m3).

### Calidad de código y gate (lo corrí yo)
- [x] `pnpm run typecheck`: `TC_EXIT=0`.
- [x] `pnpm run lint`: `LINT_EXIT=0`, con 0 errors y 232 warnings heredados.
- [x] `pnpm run test:guardias`: 302/303. El único rojo es `dependencias-declaradas-presentes`, que
  está en `tests/baseline-rojos.json`. El diff no toca `package.json` ni el lock.
- [x] `vitest related` sobre el diff, en la base sin seed: 234 archivos rojos.
  - 233 están en el baseline («La app nace vacía»).
  - El otro, `caja-backfill`, era residuo de mis datos de prueba (una zona de otra empresa). Sin ellos
    da 5/5 en verde, así que no es regresión.
- [x] No se añadieron dependencias.
- [x] Ningún literal de país, moneda u Ordenex en código nuevo de `lib/` o `app/`. Los `₡` y los
  `SINPE` del diff están solo en las aserciones y los fixtures de `e2e/`.
- [x] Los comentarios explican el porqué.
- [x] Capas: la lógica en servicios, los datos en repositorios, las mutaciones en Server Actions y
  zod en el borde. Los dos composition roots tienen test de que **pasan** el repositorio.

### Flujos críticos (E2E)
- [x] Wallet: `e2e/cobro-plataforma-sl40.spec.ts`, 2/2 con su salida en la bitácora. Solo corre con
  `SL40_UI=1` (m2).
- [ ] **`e2e/dos-empresas-humo.spec.ts`: no hay salida suya** (B3).

### Equipo y cierre
- [x] La rama se publicó.
- [n/a] `progress/features/SL-40.md > Cierre`: es del leader, después del PR.

## Hallazgos

### B1 — BLOQUEANTE: una empresa borra su deuda con `DELETE FROM orden` (R8, design §3.4)
- `servi_app` tiene `DELETE` sobre `orden`: es el `ALTER DEFAULT PRIVILEGES` de SL-17, y nadie lo
  revoca. La FK `cobro_plataforma_movimiento.orden_id` es `ON DELETE CASCADE`, y la acción
  referencial corre como dueño.
- Lo reproduje en `sl40r_main` como `servi_app` con la empresa A, en una transacción confirmada:
  - tras el `INSERT` de la orden: 1 cargo de 500,00;
  - `DELETE FROM orden WHERE id = …`: 0 movimientos, tanto vistos por la empresa como por el dueño.
- Una orden recién creada no tiene hijos con `RESTRICT`. Con hijos, la empresa puede borrarlos antes,
  porque también tiene `DELETE` sobre ellos.
- Es justo la amenaza que §3.4 dice cerrar con el `REVOKE` («una empresa podría borrar su deuda con
  un `DELETE` a mano»): se cierra por la tabla de cargos y se abre por la de órdenes.
- El test de R8 no lo intenta: solo hace `DELETE` sobre la tabla de cargos.
- **Falta:**
  - una migración nueva que impida que `servi_app` borre de verdad una orden. Opciones:
    `REVOKE DELETE ON "orden" FROM servi_app` (en `lib/` ningún código hace `DELETE` físico de
    `orden`), o pasar la FK a `RESTRICT`;
  - un caso en `cobro-plataforma-cargos` «R8: un `DELETE FROM orden` de la empresa no borra su
    cargo», con su mutación.

### B2 — BLOQUEANTE: una orden viva sin cargo, insertándola borrada y recuperándola (R12, R17, R8)
- El trigger de creación tiene `WHEN (NEW.deleted_at IS NULL)`. Una orden que nace con `deleted_at`
  no tiene movimientos, y al recuperarla el trigger toma la rama «sin movimientos» de D8 y no hace
  nada.
- Lo reproduje como `servi_app`: `INSERT … deleted_at = now()` y luego `UPDATE … deleted_at = NULL`
  dan una orden viva con 0 movimientos.
- El comentario de la migración («no existe esa vía hoy») vale para la app, pero no para el SQL a
  mano, que es el modelo de amenaza de R8.
- **Falta**, en la misma migración nueva:
  - quitar el `WHEN` y registrar siempre el cargo al insertar, más su reverso si nace borrada; o
  - rechazar el `INSERT` con `deleted_at` para `servi_app`.

  Con su caso de test y su mutación.

### B3 — BLOQUEANTE: falta `e2e/dos-empresas-humo.spec.ts` (`docs/checkpoints-proyecto.md > Flujos críticos`)
- SL-40 toca datos de negocio y `lib/db/`: una tabla de negocio nueva, `modelos-de-negocio.ts` y
  `excepciones-aislamiento.ts`. El checkpoint exige correr el humo, y la bitácora no trae su salida.
- Hay precedente: en SL-38 fue B2 por el mismo motivo, y se cerró con 6/6 corrido en una base
  desechable.
- **Falta:** correrlo con el lock y en una base `sl40_*`, y pegar la salida. Si no puede correr, anotar
  el motivo para que decida el leader.

### m1 — menor: `requirements.md` sigue con P1–P3 «ABIERTA»
Carlos las cerró: congelar, sin IVA, y la cancelación por API se cobra. Hay que pasarlas a
«Decisiones cerradas» con fecha y origen. El código ya hace lo decidido.

### m2 — menor: el E2E nuevo se salta sin `SL40_UI=1`
- Así, en CI no protege nada hasta SL-44. Hay que anotarlo en `progress/deudas.md` o en la ficha de
  SL-44.
- Lo mismo con `e2e/wallet.spec.ts`, en rojo heredado (lo lista SL-44).

### m3 — menor: falta el coste de una orden suelta
El coste del trigger está medido por fila en la carga de 500. Para la pantalla bastaría una línea
con el `INSERT` de una orden, con y sin trigger. No bloquea: el coste por fila ya está medido.

### m4 — menor (aviso para el leader): residuo del incidente
La bitácora pide confirmar que la base compartida `servi-logistic` quedó limpia tras la corrida de
guardias del incidente. No la toqué, como pedía el encargo.

## Veredicto

**RECHAZADO.**
- B1 y B2: el cargo se puede borrar o eludir desde la empresa con SQL a mano, lo mismo que R8 y
  §3.4 dicen impedir. Los dos se arreglan con una sola migración nueva, porque las de SL-40 ya están
  en QA.
- B3: falta la salida de `dos-empresas-humo`.

El resto está sólido: las 6 mutaciones dan rojo, no hay drift, las downs están probadas, la caja y el
IVA no cambian, el rendimiento está medido y typecheck, lint y guardias salen en verde, salvo el rojo
del baseline.

## Revisión 2 (acotada a ddda589..8a7e6e9)

- Revisor: `reviewer`, 2026-10-24.
- Base desechable `sl40r_main`: `migrate deploy` con las cuatro migraciones, sin seed. La borré al
  acabar, y en `pg_database` no queda ninguna `sl40*`.
- `gate.lock` tomado («reviewer SL-40 (vuelta 2)») con `prisma generate` dentro, y soltado al acabar.

### B1 — RESUELTO
- `20261024120000_cobro_plataforma_blindaje_orden` hace `REVOKE DELETE ON "orden" FROM servi_app`.
  Los privilegios de `servi_app` sobre `orden` quedan en `INSERT,SELECT,UPDATE`, y la FK de los cargos
  sigue en `CASCADE`.
- Ninguna ruta lo necesita:
  - en `lib/`, `app/` y `e2e/` no hay `orden.delete`, `deleteMany` ni `DELETE FROM orden`;
  - el único es `scripts/bench-busqueda-ordenes.ts`, y corre como dueño.
- Sin borrado indirecto: las 9 FK de `orden` hacia sus padres son `r` o `n`, ninguna `CASCADE`. Borrar
  una tienda, una carga o una organización no llega a la orden.
- Repetí el ataque como `servi_app`: `DELETE FROM orden` da `42501 permiso denegado` y la transacción
  no deja nada.
- La mutación la hice yo: `GRANT DELETE ON orden TO servi_app` da 1 failed / 19 passed en
  `cobro-plataforma-cargos` («R8 (review B1)»).
  - El md5 de control cambia al mutar (`9d5cab32…`) y vuelve a `aa8231a9…` tras restaurar.

### B2 — RESUELTO
- El trigger de creación ya no lleva `WHEN`. Una orden que nace borrada registra cargo y reverso,
  con el reverso en su `deleted_at`.
- Repetí el ataque como `servi_app`, con el global en 500: `INSERT … deleted_at = now()` y después
  `UPDATE … deleted_at = NULL` dan `1:cargo:500 2:reverso:500 3:cargo:500`. La orden viva vuelve a
  estar cargada.
- Mutaciones hechas por mí, con autocomprobación por md5:
  - `WHEN (NEW.deleted_at IS NULL)` de vuelta: 1 failed / 19 passed («R12/R17 (review B2)»);
  - la función sin el reverso al nacer borrada: 1 failed / 19 passed (el mismo caso).
- La rama «sin movimientos» de D8/R18 no se tocó, y R18 sigue verde.

### B3 — RESUELTO
La bitácora (`## Arreglo de la review > B3`) trae la salida literal:
- `6 passed (2.5m)`, `PW_EXIT=0` y `EmpresaNoResuelta en el log del server: 0`;
- montaje con base `sl40_humo` desechable, un solo dev server, log borrado al acabar.
- El primer intento cayó por un timeout del SMTP. Eso es red, no SL-40, y el segundo, idéntico, dio verde.

### R8 de `aislamiento-ordenes` (de P2025 a 42501): no se debilitó
- Antes probaba que B no borraba la orden de A por la RLS (P2025 / 0 filas). Ahora `servi_app` no
  puede borrar ninguna orden, ni ajena ni propia: es un rechazo más fuerte, y la aserción
  `ordenesDeA()` sin cambios sigue.
- `update` y `updateMany` siguen probando la RLS (P2025 / 0 filas).
- Se pierde la prueba de la RLS sobre `DELETE`, pero ese camino ya no existe. Si alguien devolviera el
  `GRANT`, caerían este caso y «R8 (review B1)»: lo midió el implementer y yo lo confirmé con B1.

### Menores
- m1: cerrado. P1, P2 y P3 figuran como «CERRADA» en `requirements.md`, con la decisión de Carlos.
- m2: cerrado como deuda `progress/deudas.md > D19`, con dueño (SL-44).
- m3: sigue sin hacer y **no bloquea**.
  - El coste por fila está medido en la carga de 500 (+0,14 a +0,22 ms por orden).
  - El cambio de esta vuelta solo añade un `INSERT` cuando la orden nace borrada, y la app no usa
    esa vía.
- m4: sigue para el leader.

### Verificación ejecutable
- Sin drift: `migrate diff` da «empty migration».
- Sin mutar, en verde: `cobro-plataforma-cargos`, `aislamiento-ordenes`,
  `migracion-sl40-ida-y-vuelta`, `deuda-plataforma-wallet` y `empresas-plataforma-cobro` (5 archivos,
  55/55).
- `pnpm run typecheck`: 0. `eslint` de los tres tests tocados: sin errores.
- `pnpm run test:guardias`: 302/303. El único rojo es `dependencias-declaradas-presentes`, que está en
  el baseline.
- La migración nueva trae `down.sql`, y R29 la cubre: la foto incluye funciones, triggers y
  privilegios. Las tres de SL-40 no se tocaron (`git diff ddda589..HEAD` no las incluye).

### Veredicto vuelta 2: **OK**
B1, B2 y B3 están resueltos y la vuelta no trae regresiones. Quedan dos menores no bloqueantes: m3 y
m4 (este último, del leader).
