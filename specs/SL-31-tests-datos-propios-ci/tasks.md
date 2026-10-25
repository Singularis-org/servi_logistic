# SL-31 — Tareas

Todo se hace y se verifica en el worktree `.worktrees/SL-31-tests-datos-propios-ci`, contra una base
desechable `servi_logistic_sl31` recién migrada (`prisma migrate deploy` + `pnpm run db:seed`) y
**sin ningún usuario, zona ni orden**. Cada `./init.sh` va a un log con `INIT_EXIT=$?` escrito
dentro. Cada tanda termina con commit, `./init.sh` verde y `git push`.

Antes de cada push, `node scripts/archivos-en-vuelo.mjs --candidata SL-31`: si choca con SL-28 en
un archivo que no está en `design.md > Choque de archivos`, PARA y avisa al leader.

**8 tandas.**
- **La tanda 1 (CI) va primero y sola, en su propio PR a `dev`** (decisión P4b): no depende de las
  fábricas ni de la medición, y se mergea antes que nada para que el PR de SL-28 de Christian no
  salga rojo por una base sin migrar.
- Las tandas 2 a 8 van en la rama de la feature, en orden, sobre `dev` ya con la tanda 1.
- Las mutaciones nunca corren a la vez que un gate.

## Tareas

### Tanda 1 — CI: base migrada en los shards (PR propio, primero)

- [x] **T5 — `gate.yml`** (D5; R16–R18). No depende de ninguna otra tarea. *(2026-10-22:
  implementada; la evidencia de CI y el merge, en `progress/impl_SL-31.md > Tanda 1`.)*
  - Rama propia desde `origin/dev` (p. ej. `feature/SL-31-ci-base-migrada`), con su worktree. Solo
    toca `.github/workflows/gate.yml` y, si el CI del PR lo pide, `tests/baseline-rojos.json`.
  - Paso «Base del shard (migrada + catálogos)» en `vitest`. `db:seed` en `e2e`.
  - Fuera `SEED_ADMIN_*`/`SEED_MAESTRO_*`. Corregir los comentarios.
  - PR a `dev`. La evidencia es **el CI de ese PR** (P4): el repo es público y `gate.yml` corre en
    cada PR.

  **Hecho:**
  - YAML válido: `actionlint` si está; si no, el propio CI del PR, que no arranca con un YAML roto;
  - antes del push, reproducción local sobre una base **nueva**: los tres comandos del paso en
    orden con `set -euo pipefail` salen con 0, y `migrate deploy` contra una base inalcanzable sale
    con ≠ 0;
  - en el CI del PR, los tres shards con el paso de migración en verde y el `gate-completo` en
    verde. Si sale un archivo rojo que no está en el baseline, se mide y se reporta antes de
    mergear; no se mete en el baseline sin motivo;
  - PR mergeado en `dev` antes de abrir el de las tandas 2–8. Se avisa al leader, para que
    Christian rebase SL-28.

### Tanda 2 — Punto de partida y medición

- [ ] **T0 — Punto de partida.** Depende de que la tanda 1 esté en `dev`.
  - Worktree desde `origin/dev`. `DATABASE_URL` exportada, apuntando a `servi_logistic_sl31`.
    Comprobar que no contiene ningún project ref de la app de origen.
  - Crear la base, `prisma migrate deploy`, `pnpm run db:seed`, y comprobar
    `SELECT count(*) FROM usuario|zona|orden` = 0 / 0 / 0.
  - Mirar si SL-28 ya tiene rama publicada y qué toca.

  **Hecho:** las tres cosas anotadas en `progress/impl_SL-31.md`.
- [ ] **T1 — Medición ejecutada** (design `> Medición`; R7, R13, R14). Depende de T0.
  - `./init.sh --completo` con el código **sin cambiar**. El log va a `_trabajo/sl31-antes.log`.
  - Por cada archivo rojo del baseline con motivo SL-31: el primer mensaje de error y su grupo
    (E454, E459, E419, E47x, orden, usuario, zona, otro).
  - Confirmar la lista de excluidos (lee `db/migrations/`) de `design.md > Exclusión SL-28`.
  - Medir los **verdes sin datos**: archivos de `tests/integration/` fuera del baseline con un
    retorno temprano ante un dato de negocio ausente. Se miden con una mutación de la base (vaciar
    el catálogo que el test lee, dentro de una tx), no por lectura.
  - Tiempo de pared de la suite y de `./init.sh` rápido (P6: aceptado; se anota).
  - Añadir a `## Archivos esperados` los verdes sin datos medidos (P2: entran; si pasan de 30, el
    exceso va a una ficha nueva) y cualquier archivo de la tabla que falte.

  **Hecho:** tabla de 245 filas en `progress/impl_SL-31.md` con grupo y mensaje. Las cifras de
  `design.md > Medición` corregidas con lo medido. Si sale un rojo del baseline que **no** es por
  datos, PARA y avisa.

### Tanda 3 — Fábricas y guardia

- [ ] **T2 — `tests/fabricas/`** (D1; R1–R6). Depende de T1.
  - `cliente.ts`, `catalogos.ts`, `unicos.ts`, `usuarios.ts`, `zonas.ts`, `ordenes.ts`.
  - El distrito de Cartago/Cartago, fijado leyendo la migración que lo siembra.
  - `tests/integration/db/_fixtures/orden-minima.ts` queda como reexportación.

  **Hecho:** typecheck verde; los seis `zona-*` de SL-11 siguen en verde sin editarlos.
- [ ] **T3 — Tests de las fábricas** (R1–R6). Depende de T2.
  - `tests/integration/fabricas/fabricas.int.test.ts`. Cubre:
    - **R1:** crea cada cosa y relee por id;
    - **R2:** con la base vacía, ninguna lee fuera de los catálogos (espía de consultas);
    - **R3:** dentro de la tx se borra «cedula» y se exige el error nombrado;
    - **R4:** dos clientes en paralelo crean 20 usuarios y 20 órdenes cada uno;
    - **R5:** el formato del email;
    - **R6:** `crearZonaCentral` sin lock lanza, y con una central previa en la tx crea la suya.
  - Mutación: que `crearFksDeOrden` devuelva un `zonaId` inventado tiene que poner el archivo en
    rojo.

  **Hecho:** verde contra `servi_logistic_sl31`; la mutación en rojo y la salida pegada.
- [ ] **T4 — Guardias** (D4, D1.4; R5, R10, R12). Depende de T2.
  - `tests/unit/guards/fabricas-de-datos.guardia.test.ts`. La lista de permitidos nace con todos
    los infractores de T1 y con los excluidos.
  - `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (SL-11 R16) pasa a barrer
    `tests/fabricas/`.

  **Hecho:** las dos en verde, y su no-vacuidad, contraprueba y «permitido muerto» en rojo cuando
  deben.

### Tanda 4 — Escenarios compartidos

- [ ] **T6 — `454/_escenario.ts` y `419/_escenario-419.ts`** (D2; R2, R5–R10). Depende de T2.
  - `prepararMundo` solo lee el catálogo. Tienda y zona central se crean en `crearEscenario`.
  - Adaptar los 3 lectores de `mundo.fks`/`mundo.centralZonaId`.
  - Sacar del baseline los consumidores que vuelven a verde, **incluidos los excluidos que se
    arreglan solos** (R15).
- [ ] **T7 — `_fixtures/caja-459.ts`, `_fixtures/libro-468.ts`, `_whatsapp-envios-474.ts`,
  `_informe-transito-475.ts`, `_picking-476.ts`** (D2). Depende de T6.
  - Mismo patrón que T6.
  - Antes y después, correr los consumidores **verdes** de `caja-459.ts` (escenarios
    comprometidos) y comparar.

  **Hecho (T6 y T7):**
  - todos los consumidores en verde contra `servi_logistic_sl31`;
  - los consumidores verdes de antes siguen verdes;
  - `usuario`, `zona` y `orden` siguen en 0 filas tras la corrida;
  - mutación en 3 consumidores al azar → rojo;
  - entradas fuera del baseline y permitidos fuera de la guardia;
  - `./init.sh` verde.

### Tanda 5 — Tests directos (orden, usuario, zona)

- [ ] **T8a [P] — `tests/integration/db/cierre-*`, `correccion-*`, `corregir-*`, `busqueda-*`,
  `api-key-*`, `historial-accion-*`, `geografia-*`** (D3; R7–R10). Depende de T2.
- [ ] **T8b [P] — el resto de los grupos orden, usuario y zona** de la tabla de T1 (incluye
  `tests/integration/repositories/*` y `tests/integration/actions/analitica-financiera-action.test.ts`).
  Depende de T2.

  **Hecho (T8a y T8b):** lo mismo que en la tanda 4. Además, R9 comprobado con un diff de las
  líneas `expect(` y del número de `it(` por archivo, pegado en el impl. `tests/baseline-rojos.json`
  y la lista de permitidos se editan **una sola vez al final de la tanda**, no en paralelo.

### Tanda 6 — Sin causa estática y verdes sin datos

- [ ] **T9 — Los «otro» de T1 y los verdes sin datos** (R10, R13; decisión P2). Depende de
  T6–T8.
  - Cada uno con la fábrica que le toque. Los retornos tempranos por un dato ausente se quitan.

  **Hecho:**
  - en verde contra la base vacía;
  - cada verde sin datos, con su fábrica rota, en **rojo** (antes pasaba);
  - baseline sin ninguna entrada SL-31 salvo los excluidos que sigan rojos.

### Tanda 7 — E2E con datos propios

> **Pasa a SL-44 (2026-10-24, decisión de Carlos).** T10, T11a y T11b, y con ellas R19–R23, salen de
> SL-31 y las hace SL-44 «E2E en verde en CI» (`specs/SL-44-e2e-verde-ci/`). Queda anulada la
> decisión P3 / la segunda frase de R23 (`test.fixme` con ficha): ningún E2E se queda en `fixme` ni
> en skip. **Motivo:**
> - un spec heredado no sale verde sin reescribirlo contra la UI actual;
> - para correr en CI necesita cambios fuera de `tests/`: la guarda del OTP y el almacén de CI.
>   R24 de SL-31 los prohíbe.
>
> SL-31 se cierra sin esta tanda. Su T12 deja de depender de T11.

- [ ] **T10 — `tests/fabricas/e2e.ts`** (D6; R19, R21, R22). Depende de T2.
  - `abrirBaseE2E`, `crearUsuarioConSesion`, `limpiarE2E`.
  - Test de unidad del guardián de host: `tests/unit/fabricas/e2e-host.test.ts`.

  **Hecho:**
  - con `DATABASE_URL` a un host remoto inventado, lanza antes de abrir conexión;
  - sin `DATABASE_URL`, lanza con mensaje;
  - un usuario creado entra por `/login` sin OTP en un spec mínimo, y `limpiarE2E` deja 0 filas.
- [ ] **T11a — `auth`, `wallet`, `mi-wallet`, `wallet-mensajeros`, `mis-asignaciones`,
  `rastreo-publico`, `historial-orden`, `analitica-roles`, `devolucion-origen`** (D6; R19–R23).
  Depende de T10.
- [ ] **T11b — `cierre-dia`, `cierre-vencido-modelo`, `cierres-admin`,
  `cierres-admin-rechazos-sla`, `cierre-bodega-satelite`, `reglas-bloqueos-cierre`,
  `asignacion-satelite`, `recepcion-satelite`, `reintentos-escalado`,
  `reprogramacion-liberacion`** (D6; R19–R23). Depende de T10.

  **Hecho (T11a y T11b):**
  - cada spec pasa con `pnpm exec playwright test e2e/<spec>.spec.ts` contra
    `servi_logistic_sl31` sin usuarios, con un solo dev server vivo y `.next` limpio;
  - tras la corrida, 0 filas en `usuario`, `zona` y `orden`;
  - Grep sin `correct-password`, sin `E2E_RASTREO_*` y sin «PRECONDITION (seed)»;
  - los que fallen por una causa ajena a los datos quedan como `test.fixme`, citando la ficha
    nueva creada en el board (P3).

### Tanda 8 — Cierre

- [ ] **T12 — Docs, baseline y gate** (R15, R24–R26). Depende de T5, T9 y T11.
  - `docs/verification.md > Base de datos de test` (R26).
  - `progress/deudas.md > D8` cerrada, o reducida a lo de SL-28.
  - Excluidos que siguen rojos: `motivo` → SL-28, con la causa doble (P1).
  - La lista de permitidos de la guardia, solo con los excluidos.
  - **Base nueva** (`DROP` + `CREATE` + `migrate deploy` + `db:seed`) y `./init.sh --completo`.
  - Diff contra `dev` cruzado con `arnes.manifest`, con `app/ lib/ components/ hooks/ db/ scripts/`
    y con `package.json`.

  **Hecho:**
  - `INIT_EXIT=0`;
  - `tests/baseline-rojos.json` sin entradas SL-31;
  - el diff no toca producción, el arnés ni dependencias;
  - `usuario`/`zona`/`orden` en 0 filas después de la suite completa;
  - el `gate-completo` del CI del PR en verde (P4).

## Trazabilidad prevista

| Req | Test o corrida |
|---|---|
| R1 | `tests/integration/fabricas/fabricas.int.test.ts` |
| R2 | `tests/integration/fabricas/fabricas.int.test.ts` (espía de consultas) + `tests/unit/guards/fabricas-de-datos.guardia.test.ts` |
| R3 | `tests/integration/fabricas/fabricas.int.test.ts` |
| R4 | `tests/integration/fabricas/fabricas.int.test.ts` (dos clientes en paralelo) |
| R5 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` + `tests/integration/fabricas/fabricas.int.test.ts` |
| R6 | `tests/integration/fabricas/fabricas.int.test.ts` |
| R7 | corridas T6–T9: cada archivo del alcance en verde y fuera del baseline |
| R8 | corrida T12: `./init.sh --completo` sobre base nueva sin usuarios |
| R9 | corridas T6–T9: diff de `expect(` e `it(` por archivo |
| R10 | `tests/unit/guards/fabricas-de-datos.guardia.test.ts` + mutaciones de T3, T6–T9 |
| R11 | corrida T12: `./init.sh` sin `DATABASE_URL`, los de integración como `skipped` |
| R12 | `tests/unit/guards/fabricas-de-datos.guardia.test.ts` |
| R13 | corrida T9: cada verde sin datos en rojo con la fábrica rota |
| R14 | corrida T12: diff contra `dev` sin los 23 excluidos ni `_postgres-real.ts` |
| R15 | corrida T6/T12: entradas de los excluidos fuera del baseline (verdes) o con motivo SL-28 |
| R16 | corrida T5 + `gate-completo` de CI |
| R17 | corrida T5 (job `e2e` en `workflow_dispatch`) |
| R18 | corrida T5: Grep de `SEED_ADMIN`, `SEED_MAESTRO` y `test-database.ts` sin resultados en `.github/workflows/gate.yml` |
| R19 | los 19 specs de `e2e/` de D6 (corridas T11) |
| R20 | corrida T11: Grep sin credenciales ni `E2E_*` sembrados |
| R21 | `tests/unit/fabricas/e2e-host.test.ts` |
| R22 | `tests/unit/fabricas/e2e-host.test.ts` |
| R23 | corridas T11 |
| R24 | corrida T12: diff cruzado con `arnes.manifest`, producción y `package.json` |
| R25 | corrida T12: `INIT_EXIT=0` y baseline sin SL-31 |
| R26 | revisión de `docs/verification.md` en T12 |

## Archivos esperados

T1 añade aquí, antes del primer push con código, las rutas medidas que falten (verdes sin datos,
correcciones de grupo). Los 23 excluidos de SL-28 **no** están en esta lista a propósito.

### Infraestructura, fábricas y guardias

- `.github/workflows/gate.yml`
- `tests/baseline-rojos.json`
- `docs/verification.md`
- `tests/fabricas/cliente.ts`
- `tests/fabricas/catalogos.ts`
- `tests/fabricas/unicos.ts`
- `tests/fabricas/usuarios.ts`
- `tests/fabricas/zonas.ts`
- `tests/fabricas/ordenes.ts`
- `tests/fabricas/e2e.ts`
- `tests/integration/fabricas/fabricas.int.test.ts`
- `tests/unit/fabricas/e2e-host.test.ts`
- `tests/unit/guards/fabricas-de-datos.guardia.test.ts`
- `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`

### Helpers compartidos

- `tests/integration/db/_fixtures/orden-minima.ts`
- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/_fixtures/libro-468.ts`
- `tests/integration/db/_fixtures/wallet-458.ts`
- `tests/integration/db/454/_escenario.ts`
- `tests/integration/db/419/_escenario-419.ts`
- `tests/integration/db/_whatsapp-envios-474.ts`
- `tests/integration/db/_informe-transito-475.ts`
- `tests/integration/db/_picking-476.ts`

### Tests de integración en alcance

- `tests/integration/actions/analitica-financiera-action.test.ts`
- `tests/integration/repositories/chat-media-autorizada.int.test.ts`
- `tests/integration/repositories/chat-media-historico.int.test.ts`
- `tests/integration/repositories/conteo-productos.int.test.ts`
- `tests/integration/repositories/dinero-productos.int.test.ts`
- `tests/integration/repositories/financiera-cubo-temporal.integration.test.ts`
- `tests/integration/repositories/historico-conversaciones.int.test.ts`
- `tests/integration/repositories/orden-nota.int.test.ts`
- `tests/integration/db/477-aprobacion-tras-correccion-sql-real.test.ts`
- `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts`
- `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts`
- `tests/integration/db/477-regestionar-sin-cierre-sql-real.test.ts`
- `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts`
- `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`
- `tests/integration/db/484-puntero-corte-sql-real.test.ts`
- `tests/integration/db/484-puntero-incidente-blst765.test.ts`
- `tests/integration/db/484-puntero-traspaso-sql-real.test.ts`
- `tests/integration/db/484-puntero-vigente-sql-real.test.ts`
- `tests/integration/db/486-evidencias-cierres-sql-real.test.ts`
- `tests/integration/db/ajuste-caja-anulacion-461.test.ts`
- `tests/integration/db/analitica-anulacion-rechazo-458.test.ts`
- `tests/integration/db/analytics-daily-job.test.ts`
- `tests/integration/db/api-key-eliminabilidad.test.ts`
- `tests/integration/db/api-key-eliminar-fk-inesperada.test.ts`
- `tests/integration/db/api-key-eliminar-tienda-destino.test.ts`
- `tests/integration/db/api-key-eliminar.test.ts`
- `tests/integration/db/aporte-capital.test.ts`
- `tests/integration/db/asistente-uso-diario.int.test.ts`
- `tests/integration/db/aviso-agregado-repository.test.ts`
- `tests/integration/db/busqueda-comportamiento.test.ts`
- `tests/integration/db/busqueda-normalizacion-paridad.test.ts`
- `tests/integration/db/busqueda-por-guia-469.test.ts`
- `tests/integration/db/busqueda-sincronizacion-columna.test.ts`
- `tests/integration/db/busqueda-usa-indice.test.ts`
- `tests/integration/db/caja-caracterizacion-459.test.ts`
- `tests/integration/db/chat-entrante-telefono-cr.test.ts`
- `tests/integration/db/cierre-aprobacion-libera-solo-lo-suyo.test.ts`
- `tests/integration/db/cierre-aprobar-el-mas-viejo-desbloquea.test.ts`
- `tests/integration/db/cierre-bloqueo-nv-sql-real.test.ts`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-bodega-resumen-pendientes.test.ts`
- `tests/integration/db/cierre-descarga-fechas-sql-real.test.ts`
- `tests/integration/db/cierre-descarga-intentos-entrega-sql-real.test.ts`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-excluye-gestiones-de-escritorio.test.ts`
- `tests/integration/db/cierre-rechazado-aviso-dedupe.test.ts`
- `tests/integration/db/cierre-rechazado-jornada-sql-real.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-totales.test.ts`
- `tests/integration/db/cierre-segundo-vincula-solo-lo-suyo.test.ts`
- `tests/integration/db/cierre-sin-gestion-sql-real.test.ts`
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts`
- `tests/integration/db/cierres-admin-retornables-sql-real.test.ts`
- `tests/integration/db/cierres-filtro-estado-sql-real.test.ts`
- `tests/integration/db/cobertura-repository.test.ts`
- `tests/integration/db/cohorte-carga-indices.int.test.ts`
- `tests/integration/db/como-quedo.test.ts`
- `tests/integration/db/consolidacion-concurrente.int.test.ts`
- `tests/integration/db/correccion-dia-reparto-efectos.int.test.ts`
- `tests/integration/db/correccion-dia-reparto-historial.int.test.ts`
- `tests/integration/db/correccion-dia-reparto.int.test.ts`
- `tests/integration/db/correccion-fecha-reprogramacion.int.test.ts`
- `tests/integration/db/correccion-resultado-gestion.int.test.ts`
- `tests/integration/db/corregir-conciliacion.int.test.ts`
- `tests/integration/db/corregir-datos-cliente.chat.test.ts`
- `tests/integration/db/corregir-datos-cliente.repo.test.ts`
- `tests/integration/db/corregir-ubicacion-geocode.test.ts`
- `tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts`
- `tests/integration/db/costo-y-zona-api-415.test.ts`
- `tests/integration/db/deshacer-asignacion-zona-satelite.int.test.ts`
- `tests/integration/db/deshacer-gestion-conserva-reserva.int.test.ts`
- `tests/integration/db/detalle-en-lote-464.test.ts`
- `tests/integration/db/detalle-movimiento-cierre-postgres.test.ts`
- `tests/integration/db/efecto-movimiento-predice.test.ts`
- `tests/integration/db/eliminar-orden-api-frontera-tienda.test.ts`
- `tests/integration/db/eliminar-orden-pantalla-frontera-tienda.test.ts`
- `tests/integration/db/emisor-relaciones-anidadas.test.ts`
- `tests/integration/db/estado-cuenta-busqueda-orden-463.test.ts`
- `tests/integration/db/estado-cuenta-cierre-pagos-172r52.test.ts`
- `tests/integration/db/estado-cuenta-pago-tienda-172r53.test.ts`
- `tests/integration/db/estado-cuenta-saldo-corrido.test.ts`
- `tests/integration/db/estado-cuenta-servidor-458d.test.ts`
- `tests/integration/db/gasto-fijo-cobro-aprobacion.test.ts`
- `tests/integration/db/gasto-fijo-cobro-idempotencia.test.ts`
- `tests/integration/db/gasto-fijo-cobro-migration.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-historico-intacto.test.ts`
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/gestion-desde-ayuda-dia-reserva.int.test.ts`
- `tests/integration/db/gestiones-detalle-api-405.test.ts`
- `tests/integration/db/historial-accion-atomicidad.test.ts`
- `tests/integration/db/historial-accion-lectura.test.ts`
- `tests/integration/db/historial-accion-q1-ubicacion.test.ts`
- `tests/integration/db/informe-transito-catalogo-real.test.ts`
- `tests/integration/db/informe-transito-hitos.test.ts`
- `tests/integration/db/informe-transito-parados.test.ts`
- `tests/integration/db/informe-transito-seleccion.test.ts`
- `tests/integration/db/informe-transito-zonas.test.ts`
- `tests/integration/db/kardex-cuentas-468.test.ts`
- `tests/integration/db/liberacion-al-aprobar-cierre-real.test.ts`
- `tests/integration/db/liberacion-reprogramada-cierre-real.test.ts`
- `tests/integration/db/libro-caja-a-quien.test.ts`
- `tests/integration/db/libro-caja-busqueda-orden-463.test.ts`
- `tests/integration/db/libro-caja-filtro-a-quien.test.ts`
- `tests/integration/db/libro-caja-revision-458c.test.ts`
- `tests/integration/db/libro-caja-revision-458e.test.ts`
- `tests/integration/db/libro-kardex-468.test.ts`
- `tests/integration/db/liquidacion-fechas-cr-461.test.ts`
- `tests/integration/db/marca-conciliacion.int.test.ts`
- `tests/integration/db/mi-wallet-cierres-alcance.test.ts`
- `tests/integration/db/mi-wallet-resumen-458d.test.ts`
- `tests/integration/db/notificacion-bloqueo-otro-cierre-avisa.test.ts`
- `tests/integration/db/novedades-sin-gestionar-aviso-dedupe.test.ts`
- `tests/integration/db/orden-eliminada-actor-admin.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/db/picking-ordenes-en-preparacion.test.ts`
- `tests/integration/db/picking-resumen-tiendas.test.ts`
- `tests/integration/db/premio-ranking-idempotencia.test.ts`
- `tests/integration/db/push-canal-restricciones.test.ts`
- `tests/integration/db/push-destinatarios-equivalencia.test.ts`
- `tests/integration/db/rechazo-tienda-cobro.int.test.ts`
- `tests/integration/db/recoger-lote-dia-reserva.int.test.ts`
- `tests/integration/db/reparto-manana-repository.test.ts`
- `tests/integration/db/saldo-satelites.int.test.ts`
- `tests/integration/db/saldos-tiendas-busqueda-463.test.ts`
- `tests/integration/db/satelite-bodega-alcance-real.test.ts`
- `tests/integration/db/tarifa-zona-borrado-fk-real.test.ts`
- `tests/integration/db/traspaso-mensajero.int.test.ts`
- `tests/integration/db/usuario-contar-adminsatelites.test.ts`
- `tests/integration/db/usuario-preferencia.test.ts`
- `tests/integration/db/vista-filtro.test.ts`
- `tests/integration/db/wallet-461-idempotencia-clave.test.ts`
- `tests/integration/db/wallet-anulacion-458.test.ts`
- `tests/integration/db/wallet-anulacion-concurrencia.test.ts`
- `tests/integration/db/wallet-caracterizacion-458.test.ts`
- `tests/integration/db/wallet-cierres-selector.test.ts`
- `tests/integration/db/wallet-comprobante-alcance.test.ts`
- `tests/integration/db/wallet-documento-comprobante-458.test.ts`
- `tests/integration/db/wallet-etiqueta-historial-458.test.ts`
- `tests/integration/db/wallet-fecha-elegida.test.ts`
- `tests/integration/db/wallet-origen-legible.test.ts`
- `tests/integration/db/wallet-registro-comprobante-458.test.ts`
- `tests/integration/db/wallet-tienda-cobro.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `tests/integration/db/whatsapp-envio-defaults.test.ts`
- `tests/integration/db/whatsapp-envio-ejecucion-admintienda.test.ts`
- `tests/integration/db/whatsapp-envio-entrega-estado-webhook.test.ts`
- `tests/integration/db/whatsapp-envio-entrega-reclamo.test.ts`
- `tests/integration/db/whatsapp-envio-historial.test.ts`
- `tests/integration/db/whatsapp-envio-idempotencia-programado.test.ts`
- `tests/integration/db/whatsapp-envio-prueba-limite.test.ts`
- `tests/integration/db/whatsapp-envio-resolver-destinatarios.test.ts`
- `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts`
- `tests/integration/db/419/confirmar-entrega-sin-dinero-sql-real.test.ts`
- `tests/integration/db/419/confirmar-entrega-webhook-sql-real.test.ts`
- `tests/integration/db/462/reprogramadas-retenidas-sql-real.test.ts`
- `tests/integration/db/454/aplicacion-al-aprobar-sql-real.test.ts`
- `tests/integration/db/454/ayuda-abierta-sql-real.test.ts`
- `tests/integration/db/454/ayuda-evento-sql-real.test.ts`
- `tests/integration/db/454/carga-mensajero-pendiente-sql-real.test.ts`
- `tests/integration/db/454/cierre-bodega-sf001-sql-real.test.ts`
- `tests/integration/db/454/correccion-ayuda-abierta-sql-real.test.ts`
- `tests/integration/db/454/correccion-ramas-sql-real.test.ts`
- `tests/integration/db/454/corte-excluye-pendientes-sql-real.test.ts`
- `tests/integration/db/454/deshacer-ramas-sql-real.test.ts`
- `tests/integration/db/454/devolucion-rechazadas-seleccion-sql-real.test.ts`
- `tests/integration/db/454/gestion-pendiente-sql-real.test.ts`
- `tests/integration/db/454/intentos-segunda-via-sql-real.test.ts`
- `tests/integration/db/454/novedades-predicado-sql-real.test.ts`
- `tests/integration/db/454/rastreo-pendiente-sql-real.test.ts`
- `tests/integration/db/454/registro-gestion-concurrencia-sql-real.test.ts`
- `tests/integration/db/454/registro-gestion-sin-transicion-sql-real.test.ts`
- `tests/integration/db/454/senales-gestion-lectores-sql-real.test.ts`
- `tests/integration/db/454/webhook-evento-sql-real.test.ts`
- `tests/integration/db/454/caracterizacion/alcance-satelite-y-sf001.test.ts`
- `tests/integration/db/454/caracterizacion/ayuda-ciclo.test.ts`
- `tests/integration/db/454/caracterizacion/cambio-dia.test.ts`
- `tests/integration/db/454/caracterizacion/cierre-rechazado.test.ts`
- `tests/integration/db/454/caracterizacion/confirmacion-fisica-238.test.ts`
- `tests/integration/db/454/caracterizacion/correccion-69.test.ts`
- `tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts`
- `tests/integration/db/454/caracterizacion/corte-no-barre-gestionadas.test.ts`
- `tests/integration/db/454/caracterizacion/deshacer.test.ts`
- `tests/integration/db/454/caracterizacion/devolucion-rechazadas-139.test.ts`
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/454/caracterizacion/dos-gestiones-vivas.test.ts`
- `tests/integration/db/454/caracterizacion/intentos-conteo.test.ts`
- `tests/integration/db/454/caracterizacion/kpi-portal.test.ts`
- `tests/integration/db/454/caracterizacion/liberacion-por-cierre.test.ts`
- `tests/integration/db/454/caracterizacion/multi-dia-271.test.ts`
- `tests/integration/db/454/caracterizacion/no-doble-gestion.test.ts`
- `tests/integration/db/454/caracterizacion/notificacion-n1.test.ts`
- `tests/integration/db/454/caracterizacion/portal-listas-mapa-ruta.test.ts`
- `tests/integration/db/454/caracterizacion/rastreo-y-historial-legado.test.ts`
- `tests/integration/db/454/caracterizacion/rechazos-tienda-425.test.ts`
- `tests/integration/db/454/caracterizacion/reprogramadas-liberacion.test.ts`
- `tests/integration/db/454/caracterizacion/sla-devolucion-reloj.test.ts`
- `tests/integration/db/454/caracterizacion/solicitar-cierre.test.ts`
- `tests/integration/db/454/caracterizacion/tablero-dia.test.ts`
- `tests/integration/db/454/caracterizacion/tope-276.test.ts`
- `tests/integration/db/454/caracterizacion/traspaso.test.ts`
- `tests/integration/db/454/caracterizacion/webhook-estado.test.ts`
- `tests/integration/db/455/interruptor-codigos.test.ts`
- `tests/integration/db/455/rastreo-retirado-y-pendiente-sql-real.test.ts`
- `tests/integration/db/455/snapshot-lectura.test.ts`
- `tests/integration/db/455/caracterizacion/api-lectura.test.ts`
- `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/455/caracterizacion/filtro-ordenes-por-estado.test.ts`
- `tests/integration/db/455/caracterizacion/filtro-satelite-por-codigo.test.ts`
- `tests/integration/db/455/caracterizacion/intentos-y-tope.test.ts`
- `tests/integration/db/455/caracterizacion/novedades-y-ayuda.test.ts`
- `tests/integration/db/455/caracterizacion/plantilla-estatus.test.ts`
- `tests/integration/db/455/caracterizacion/rastreo.test.ts`
- `tests/integration/db/455/caracterizacion/snapshot-correccion.test.ts`
- `tests/integration/db/455/caracterizacion/sql-crudo-avisos-y-corte.test.ts`
- `tests/integration/db/455/caracterizacion/sql-crudo-cron-devoluciones.test.ts`
- `tests/integration/db/455/caracterizacion/sql-crudo-tablero-dia.test.ts`
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`
- `tests/integration/db/caja-backfill.test.ts`

### E2E

- `e2e/analitica-roles.spec.ts`
- `e2e/asignacion-satelite.spec.ts`
- `e2e/auth.spec.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/cierre-dia.spec.ts`
- `e2e/cierre-vencido-modelo.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/devolucion-origen.spec.ts`
- `e2e/historial-orden.spec.ts`
- `e2e/mi-wallet.spec.ts`
- `e2e/mis-asignaciones.spec.ts`
- `e2e/rastreo-publico.spec.ts`
- `e2e/recepcion-satelite.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`
- `e2e/reintentos-escalado.spec.ts`
- `e2e/reprogramacion-liberacion.spec.ts`
- `e2e/wallet.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`
