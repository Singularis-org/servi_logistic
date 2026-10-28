# Review SL-45 «Pago a la plataforma desde la wallet»

- Revisor: `reviewer`, 2026-10-24, sobre `d4aa31f` (rama `feature/SL-45-pago-a-la-plataforma`, sin PR).
- Diff revisado: `origin/dev...HEAD` (base `87269af`). `origin/dev` ya va en `d7a6309`, con SL-41 mergeada.
- Base desechable: contenedor propio `sl45r-pg` (postgres:17) con `sl45r_main` (`migrate deploy` + `db:seed`)
  y `sl45r_merge` (el merge con `origin/dev`). Las dos bases y el contenedor se borraron al acabar, y en
  `pg_database` no quedó ninguna `sl45r*`. El `.env` no se tocó: `DATABASE_URL` se pasó por entorno.
- `gate.lock`: lo tomé como «reviewer-SL-45» después de esperar a SL-44-T7, con `prisma generate` dentro.
  El cliente quedó generado con el esquema de SL-45 y el lock se soltó.
- MCP del grafo: no estaba entre mis herramientas, así que usé Grep/Read.

## Checklist

### Especificación y tasks
- [x] `requirements.md` con R1–R28 en EARS; `design.md` abre con `## Lo que ya existe`, que no está
      vacía, y el diff no re-crea nada de esa lista (reutiliza `WalletEgresoService`, la anulación de 458-B
      y el diálogo único).
- [x] `tasks.md`: 51 `[x]` y ningún `[ ]`.
- [~] `requirements.md` sigue con P2 «ABIERTA», aunque Carlos ya dijo que sí a R28 (m1).

### Trazabilidad
- [x] `progress/impl_SL-45.md` trae el mapa R1–R28 → test.
- [x] Cada R tiene un test que existe y se ejecuta. Los 7 de integración pasan contra Postgres
      (45/45, 0 skipped).
- [~] R19 en la anulación: los tests cubren tienda, mensajero y satélite, pero no `apiKey` ni
      `superadmin` (m2).
- [~] R17: hay guardia de código, pero la base lo permite (B1).

### Mutaciones medidas por mí (restauradas con `cmp`, `RESTAURADO_OK` en todas)
11 archivos: los 6 de integración de deuda y pago, más los unitarios del tope, la deuda, Empresas y el
servicio de egresos.

| Mutación | Resultado |
|---|---|
| control (solo un comentario) | 126/126 verde |
| M1: el pago no baja la deuda (`deuda.sub(pagosVigentes)` fuera, `lib/utils/deuda-plataforma.ts`) | **cae**: 30 fallos en 6 archivos, integración incluida |
| M2: se acepta el sobrepago (`"supera"` → `"cabe"` en `TopePagoPlataformaService`) | **cae**: 15 fallos (R9 y R10 en Postgres, el borde de un céntimo) |
| M3: la anulación no restaura la deuda (`sumaPagosVigentes` no descarta los anulados) | **cae**: 8 fallos (R15, R16, R18 y R9 en `pago-plataforma-sl45`) |
| M4a: aislamiento en «Empresas»: `pagadoDe` suma lo de todas las empresas | **cae**: 3 fallos (`empresas-plataforma-deuda-sl45`, incluido el del cliente dueño) |
| M4b: `sumaPagosVigentes` sin `organizacionId` en el `where` | sobrevive: la RLS y la extensión ya filtran. Es defensa en profundidad (m3) |

**`whereLibroCajaConTerminoSql` excluyendo la categoría (la mutación viva del implementer): es un falso
positivo y no bloquea.**
- La función es genérica (`lib/repositories/libro-caja-a-quien-sql.ts`) y SL-45 no la toca.
- No tiene ninguna lista de categorías: ni el «A quién», ni el término, ni la guía distinguen por
  categoría.
- La mutación mete una regla que no existe, en vez de romper una que sí existe.
- El camino que recorre la descarga sin filtros (`listar` con `buildWhere`) está cubierto: su mutación
  cae.

### Checkpoints del proyecto
- [x] `pnpm run typecheck`: TC=0, con `.next/dev` borrado.
- [x] `pnpm run lint`: 0 errores (232 warnings, todos previos).
- [x] `pnpm run test:guardias`: 303/304. El único rojo es `dependencias-declaradas-presentes.guardia`,
      que está en `tests/baseline-rojos.json` y no tiene que ver con el diff. No es un hallazgo.
- [x] Los 50 archivos de test del diff, unitarios y de componentes: 860/860.
- [x] Migraciones: las dos nuevas traen `down.sql`. El timestamp va detrás de `20261024120000`. No se
      edita ninguna migración anterior. `prisma migrate diff --from-config-datasource --to-schema` da
      «No difference detected». La ida y vuelta (R27) pasa contra Postgres.
- [x] El CHECK de la migración 2 parte de la última que lo reescribe (`20260928120100`), y solo añade
      `egreso_pago_plataforma`.
- [x] Ninguna tabla nueva, así que no hace falta RLS nueva. Ningún literal de país ni de moneda en
      lib/app/components (Empresas usa `money()`). Nada de Ordenex. Ningún `console.log`. Sin CRLF.
- [x] Ninguna dependencia nueva.
- [x] Capas: lógica en `lib/services/`, datos en `lib/repositories/`, borde en `lib/actions/`. El tope
      corre dentro de la transacción, con candado por empresa (`pg_advisory_xact_lock` sobre
      `app.organizacion_id`).
- [x] Flujo crítico de dinero: hay E2E nuevo (`e2e/pago-plataforma-sl45.spec.ts`, 6/6 en la bitácora) y
      `dos-empresas-humo` pasa 6/6 en la bitácora. Ojo: en CI se salta sin `SL45_UI=1` (m4).
- [ ] **Datos y seguridad: una empresa puede alterar su deuda con SQL a mano como `servi_app` (B1).**
- [ ] **Coherencia de informes: la métrica `egresos` queda mal con el pago y con su anulación (B2).**

### Seguridad de roles (punto 4 del encargo)
- [x] Registrar: `WalletEgresoService.registrarEgreso` responde `forbidden` antes de tocar el repo y el
      tope. Lo cubre un test con `it.each` de mensajero, adminTienda, adminSatelite, apiKey y superadmin.
      Además hay R19 de mensajero en Postgres.
- [x] El superadmin no puede registrar: no tiene `esAccesoTotal` y, sin empresa en el actor,
      `antesDelPago` lanza antes de comparar.
- [x] Anular: `EgresoCajaAnulacionService` y `WalletAnulacionService` usan `esAccesoTotal`, una lista
      cerrada de maestro y admin. El código es correcto, pero el test no recorre apiKey ni superadmin (m2).

### Coherencia con SL-39 y SL-40 (punto 3)
- [x] El pago es `propio` y `efectivo`: baja «Dinero en caja», sube «Salió» y baja la ganancia. No toca
      el IVA, que va por su propio seed, ni lo que se debe a las tiendas. `ganancia_empresa` lo incluye
      (R25, cubierto por la guardia `metrics-caja-naturaleza`).
- [x] No toca los cargos. Lo medí como `servi_app`: `UPDATE` y `DELETE` sobre
      `cobro_plataforma_movimiento` dan `permission denied` (R22).
- [ ] La métrica `egresos` no incluye el pago (B2).

### La columna del superadmin en «Empresas» (punto 6)
- [x] SL-45 y SL-41 tocan los mismos archivos: `EmpresasModule.tsx`, `db/schema.prisma` y los tres tests
      de Empresas. Merge de prueba de `d4aa31f` sobre `origin/dev`: sin conflictos.
- [x] En el merge: typecheck TC=0, migraciones y seed en una base nueva, y 7 archivos de tests de
      Empresas y pago (109/109).
- [x] La columna «Cobro por orden» de SL-40 queda igual: la nueva va detrás.
- [x] La celda pinta el `estado` y el `importe` que vienen del servidor, sin aritmética. El cálculo es
      la regla de R13, agrupado por `organizacion_id` en contexto de plataforma.

## Hallazgos

### B1 — BLOQUEANTE: la empresa altera su deuda con la plataforma con SQL a mano como `servi_app` (R17, R9, D7)

`servi_app` tiene `INSERT`, `UPDATE` y `DELETE` sobre `wallet_movimiento`: lo da el `ALTER DEFAULT
PRIVILEGES` de `20261022130000`. No hay ningún trigger que lo frene: los únicos triggers son el de la
FK de la misma empresa y `wallet_movimiento_sin_cambio_de_empresa`.

Lo reproduje en `sl45r_main`, con la empresa A fijada (`app.organizacion_id`) y `role = servi_app`. Cada
paso fue una transacción aparte, y la deuda se midió con la regla de R13. Punto de partida: cargos 1.000,
pago P1 de 600 vigente, pago P2 de 300 anulado, y un sueldo S1 de 400. Deuda: **400,00**.

| Ataque como `servi_app` de A | Deuda de A después |
|---|---|
| a) `UPDATE wallet_movimiento SET monto = 5000 WHERE id = P1` | **−4.000,00** (a favor, saltándose R9 y R17) |
| b) `DELETE` del contra-asiento de P2 | **100,00**: el pago anulado vuelve a contar |
| c) `INSERT` a mano de un `egreso_pago_plataforma` de 5.000 | **−4.600,00**: sobrepago sin tope (R9) |
| d) `UPDATE … SET categoria = 'egreso_pago_plataforma'` sobre el sueldo S1 | **0,00**: al día sin que salga un céntimo más de la caja |
| e) `DELETE` de P1 | 1.000,00 (en contra de la empresa) |
| f) `UPDATE` o `DELETE` de `cobro_plataforma_movimiento` | `permission denied` (R22 se cumple) |
| g) B hace `UPDATE` o `DELETE` sobre P1 de A | 0 filas: la RLS aísla |

- Es la misma amenaza por la que se rechazó SL-40 (B1 y B2: «una empresa borra su deuda con SQL a
  mano»).
- SL-40 la cerró para los cargos con el `REVOKE`. SL-45 hace que la deuda dependa además de
  `wallet_movimiento`, que no tiene esa protección. La guardia `pago-plataforma-inmutable-sl45` solo mira
  el código de `lib/`, `app/` y `scripts/`, no la base.

**Qué es deuda previa y qué introduce SL-45:**
- **Previo:** que `servi_app` pueda tocar el libro de la caja. Antes, una empresa solo podía falsear su
  propia caja, que es dato suyo y no le interesa a la plataforma.
- **Nuevo de SL-45:** ese mismo libro ahora decide cuánto le debe la empresa a la plataforma. Los
  ataques a)–d) bajan una deuda que la empresa no controla por la app: la app pone tope, no deja editar
  y solo anula con contra-asiento.
- **No es hallazgo:** registrar por la app un pago que no se hizo, siempre que quepa en la deuda. Es
  por diseño: el pago es una declaración, y la conciliación queda fuera de alcance.

**Arreglo mínimo, en una migración nueva** (las de SL-45 no se editan):
1. Que `servi_app` no pueda modificar ni borrar pagos ni sus contra-asientos. Dos opciones:
   - **(a) La más simple:** `REVOKE UPDATE, DELETE ON "wallet_movimiento" FROM servi_app;`. Según la
     propia guardia de R17, ningún código de la app actualiza ni borra el libro. Las acciones
     referenciales (`registrado_por ON DELETE SET NULL`) corren como dueño. Cierra también la deuda
     previa.
   - **(b) Acotada a SL-45:** un trigger `BEFORE UPDATE OR DELETE` que rechace cuando `OLD` o `NEW` es
     `egreso_pago_plataforma`, o cuando `OLD` es un `ingreso_ajuste` con `origen_tipo = 'gasto'` cuyo
     `origen_id` es un pago.
2. Cerrar c), el sobrepago por `INSERT` a mano: un trigger `BEFORE INSERT` sobre `wallet_movimiento`,
   `WHEN (NEW.categoria = 'egreso_pago_plataforma')`, `SECURITY DEFINER`. Debe:
   - tomar el mismo `pg_advisory_xact_lock` del repositorio;
   - calcular la deuda con la regla de R13;
   - rechazar si `NEW.monto` la supera o si la deuda no es mayor que cero.

   Así R9 y R10 también se cumplen en la base.
3. Tests en Postgres como `servi_app`, uno por ataque: a), b), c) y d) tienen que fallar. Cada uno con
   su mutación (quitar el `REVOKE` o el trigger y verlo pasar).

### B2 — BLOQUEANTE: la métrica `egresos` queda falseada por el pago y, sobre todo, por su anulación

- `lib/analytics/metrics.ts > egresos` («Salidas de la caja principal») incluye `ingreso_ajuste`, el
  contra-asiento de toda anulación de egreso (D12 de la 183). No incluye `egreso_pago_plataforma`.
- El neto es `Σ ingreso − Σ egreso` (`derivarBalance`).
- Esa métrica la consumen el tablero financiero de `/analitica` (`financiero/cargar.ts`,
  `TableroFinanciero`) y la exportación financiera (`ExportarVistaFinanciera`).

| Caso | `egresos` (neto) | La realidad (lo que dice la caja) |
|---|---|---|
| Pago de 600 | sin cambio | salen 600 («Salió» +600) |
| Pago de 600 anulado | **+600** (el contra-asiento cuenta y el pago no) | neto 0 |

- El primer caso es una omisión.
- El segundo es un número con el signo cambiado. Pasa justo con la acción que SL-45 añade (R15), y SL-45
  es la primera ficha que mete un egreso anulable con `origen_tipo = gasto` que no está en `egresos`.
- La bitácora lo dejó «Abierto» (línea 271) y nadie lo decidió. Además, el catálogo dice que `egresos`
  es un subconjunto de `dinero_en_caja` y de `ganancia_empresa`, y con el pago deja de serlo.

**Arreglo mínimo:** añadir `egreso_pago_plataforma` a `egresos.definicion.categorias`, con una línea en
la `descripcion` («desde SL-45 incluye el pago a la plataforma»). Más un test: pago y anulación dan neto
0, y el pago solo da −M. Cambiar la definición de esa métrica pasó siempre por el humano (P4 de la 173,
D12 de la 183), así que **hace falta el OK de Carlos** antes de que el implementer lo toque.

### m1 — menor: `requirements.md` sigue con P2 «ABIERTA» y R28 «solo si P2 = sí»
Carlos ya dijo que sí, y la bitácora y el código implementan R28 con «Pagado». Hay que pasar P2 a
«Decisiones cerradas», con fecha y con la ampliación de «Pagado».

### m2 — menor: R19 en la anulación no prueba `apiKey` ni `superadmin`
`wallet-anulacion-service.test.ts` recorre tienda, mensajero y satélite. El código usa una lista cerrada
(`esAccesoTotal`), así que hoy es correcto. Pero R19 nombra los cinco roles al anular, y una excepción
añadida para el superadmin no la detectaría ningún test. Falta añadir los dos actores al bucle.

### m3 — menor: el filtro explícito por `organizacion_id` de `sumaPagosVigentes` no tiene test
Quitarlo (M4b) no cambia nada, porque la RLS ya filtra. Ese filtro está ahí como defensa en profundidad,
y lo mismo pasa con `CobroPlataformaMovimientoRepository`. Hace falta un caso con el cliente dueño, como
el que ya tiene `empresas-plataforma-deuda-sl45`.

### m4 — menor: `e2e/pago-plataforma-sl45.spec.ts` se salta sin `SL45_UI=1`
Es el mismo patrón que SL-39 y SL-40 (m2 de SL-40): en CI no protege nada hasta SL-44. Hay que anotarlo
en la ficha de SL-44 o en `progress/deudas.md`.

## Veredicto

**RECHAZADO.**
- **B1:** como `servi_app`, la empresa puede bajar su deuda con la plataforma con SQL a mano. Puede
  modificar el monto de un pago, borrar el contra-asiento de un pago anulado, insertar un pago por encima
  de la deuda o recalificar un sueldo como pago. Es la misma amenaza que SL-40 cerró para los cargos. Se
  arregla con una migración nueva (`REVOKE UPDATE, DELETE` o trigger, más un trigger de tope en el
  `INSERT`), con sus tests en Postgres.
- **B2:** la métrica `egresos` no cuenta el pago, pero sí su anulación: sale +M con el signo cambiado en
  el tablero y en la exportación financiera. Es una línea en el catálogo, pero necesita el OK de Carlos.

El resto está sólido:
- las cuatro mutaciones pedidas caen, en integración y en unitarios;
- el tope y la concurrencia corren contra Postgres de verdad;
- no hay drift y la ida y vuelta de las migraciones pasa;
- los roles están bien al registrar;
- la columna de «Empresas» se mergea limpia con SL-41 y queda en verde;
- typecheck, lint y guardias en verde, salvo el rojo del baseline.

## Revisión 2 (acotada a bf89522..ced8394)

- Revisor: `reviewer`, 2026-10-24.
- Base desechable `sl45r_main` en un contenedor propio `sl45r-pg`, con `migrate deploy` (incluida
  `20261024140000_pago_plataforma_blindaje`) y `db:seed`. La base y el contenedor se borraron al acabar.
- `gate.lock` tomado como «reviewer-SL-45 (vuelta 2)», con `prisma generate` dentro, y soltado al acabar.
- `prisma migrate diff`: «No difference detected». Typecheck TC=0 y lint 0 errores.
- Guardias 303/304. El rojo es el mismo de baseline, `dependencias-declaradas-presentes`.
- Unitarios del rango 98/98. Integración: 8 archivos y 84/84, entre ellos `pago-plataforma-sl45-blindaje`,
  la ida y vuelta y `caja-tesoreria-migration`.

### B1 — RESUELTO
Repetí los ataques a mano como `servi_app` de A, con una deuda de 400,00:

| Ataque | Resultado |
|---|---|
| a) `UPDATE` del monto de un pago | `permission denied` |
| b) `DELETE` del contra-asiento | `permission denied` |
| c) `INSERT` a mano de 5.000 | rechazado por el trigger (23514, «supera la deuda vigente (400.00)») |
| c') `INSERT` de dos filas de 300 en una sentencia | rechazada la segunda («… (100.00)»): cada fila ve las anteriores |
| d) `UPDATE` de un sueldo a pago | `permission denied` |
| Privilegios | `UPDATE`, `DELETE` y `TRUNCATE` en `f`; `INSERT` en `t` |
| Pago legítimo de 400 y anulación legítima con contra-asiento | pasan (deuda 0,00 y 1.000,00) |

**El REVOKE no rompe ningún flujo real.**
- En `lib/`, `app/` y `scripts/` no hay `walletMovimiento.update/updateMany/upsert/delete/deleteMany`, ni
  `UPDATE` o `DELETE FROM` a mano, ni `FOR UPDATE` sobre `wallet_movimiento`.
- Las suites de wallet y pago del rango pasan con el REVOKE puesto.

**La excepción del reenvío no abre hueco.** El único `wallet_movimiento_clave_idempotencia_key` hace que
toda clave ya usada choque, así que la excepción nunca deja escribir una fila:

| Intento | Resultado |
|---|---|
| Clave de un pago ya registrado, monto 5.000, `ON CONFLICT DO NOTHING` | `INSERT 0 0`, deuda 400,00 |
| La misma, sin `ON CONFLICT` | 23505 |
| Clave de un **sueldo** reutilizada para un pago de 5.000 | `INSERT 0 0` |
| `ON CONFLICT (id) DO NOTHING`, que no cubre la clave | 23505 |
| A usa una clave que solo existe en B | el trigger busca por empresa, no la encuentra, aplica el tope y rechaza |
| La misma clave nueva dos veces en una sentencia (400 y 5.000) | entra la de 400 y la de 5.000 se descarta; deuda 0,00 |

**Mutaciones en la base**, contra `pago-plataforma-sl45-blindaje`:
- `GRANT UPDATE, DELETE` de vuelta: 3 failed / 7 passed.
- `DISABLE TRIGGER` del tope: 3 failed / 7 passed.
- Las dos se revirtieron, y lo comprobé: `UPDATE` en `f` y trigger `O`.

### B2 — RESUELTO
- `egresos` ya incluye `egreso_pago_plataforma`, con una línea en la `descripcion` y la decisión de
  Carlos anotada.
- El test de integración pasa por `AnaliticaFinancieraService` real: el pago de 600 da −600,00 en el
  neto, y su anulación lo deja en 0,00.
- Mutación: quitar la categoría de la lista tumba ese test (1 failed). La restauré y `cmp` dio
  `RESTAURADO_OK`.

### Menores
- **m1 — resuelto:** P2 pasa a CERRADA (D11, Carlos, con «Pagado»).
- **m2 — resuelto:** apiKey y superadmin entran en los dos tests de anulación, en
  `EgresoCajaAnulacionService.anular` y en `WalletAnulacionService.enrutar`.
- **m3 — resuelto:** hay un caso con el cliente dueño para `sumaPagosVigentes`. Quitar `organizacionId`
  del `where` lo tumba (1 failed). Lo restauré con `RESTAURADO_OK`.
- **m4 — sigue abierto, no bloquea:** el E2E sigue con `SL45_UI=1`. La bitácora lo deja anotado para
  SL-44 (línea 1150).

### Regresiones
No encontré ninguna: la anulación, el reenvío de la app y el pago justo a la deuda siguen pasando.

## Veredicto (Revisión 2)

**OK.** B1 y B2 resueltos, con test y mutación. m1–m3 resueltos y m4 anotado para SL-44.
