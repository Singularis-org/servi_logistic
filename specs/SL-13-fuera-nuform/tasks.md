# SL-13 — Tareas

Orden: T0 → T1 → (T1b, T2, T3, T4, T5, T6, T7 en paralelo) → T8 → T9. Un commit por task
(`docs/conventions.md > Commits`). En los mensajes de commit, los nombres prohibidos solo pueden ir
dentro del slug `fuera-nuform`.

- [x] **T0 — Precondición y medida inicial.**
  - Comprueba que `dev` tiene SL-10 integrada: existe `tests/baseline-rojos.json` y lleva la entrada
    de la guardia 459.
  - Comprueba que `dev` contiene `60befb1`. La rama sale de ese `dev`.
  - Vuelve a medir con Grep, fuera de `specs/`, «el integrador», «cliente A» o «cliente B» y
    `distribuidora|ecuador`. Anota el resultado en `progress/impl_SL-13.md` contra
    `design.md > Inventario`.
  - Anota cuántos casos tiene cada test de la lista de archivos esperados, con
    `pnpm exec vitest related --run --reporter=json <archivos>`. Es la línea base de R6.
  - **Hecho:**
    - la medida da 71 archivos, o cada diferencia queda explicada archivo por archivo;
    - el conteo de casos está escrito.

- [x] **T1 — Guardia nueva, primero en rojo** (R1, R2, R3, R4, R15). Depende de T0.
  - Crea `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts` según `design.md > D1`:
    - las diez cadenas exactas de R1, sin vetar «Ecuador» ni «distribuidora» sueltas;
    - la función pura `apariciones`;
    - el caso propio de `ProductosTabla.tsx` (R4) y el de los dos mapas (R15);
    - las dos excepciones con su poda;
    - la autocomprobación sintética.
  - **Hecho:**
    - la guardia sale **en rojo** y lista los 71 archivos de T0;
    - los casos de R2 y R3 ya están en verde.

- [x] **T1b [P] — Configuración del país y centro del mapa** (R5, R15, R16). Depende de T1.
  Ampliación pedida por el humano.
  - Crea `lib/config/pais.ts` y `tests/unit/config/pais.test.ts` (`design.md > D7`).
  - En `RutaMapaInner.tsx`, el respaldo del mapa pasa a `PAIS_DE_OPERACION.centroMapa`.
  - En `UbicacionMapaInner.tsx`, borra la constante sin uso y su comentario.
  - **Hecho:**
    - `pais.test.ts` y el caso R15 de la guardia están en verde;
    - typecheck en verde;
    - `vitest related` sobre los dos mapas en verde;
    - devolver la coordenada de Quito a `RutaMapaInner.tsx` pone en rojo el caso R15 (se restaura
      después).

- [x] **T2 [P] — `app/` y `lib/`** (R1, R4, R5). Depende de T1.
  - Generaliza los comentarios de los cuatro archivos de `design.md > Inventario (a)`.
    `ProductosTabla.tsx` incluye `:615` y `:846`.
  - Cambia el `ejemplo` de la variable `tienda` en `informe.ts` a `"Abarrotes"`.
  - **Hecho:**
    - `git diff dev -- app lib` muestra solo comentarios, más esa línea de `ejemplo`;
    - typecheck en verde;
    - `vitest related` sobre los cinco archivos en verde.

- [x] **T3 [P] — Fixtures de tests** (R1, R6). Depende de T1.
  - Sustituye los nombres según la tabla de `design.md > D5` en los archivos «dato de prueba» de
    `design.md > Inventario (c)`, comentarios incluidos.
  - Haz lo mismo en los cuatro tests de la ampliación (`design.md > Inventario (f)`):
    `partes-por-tienda`, `cierre-desglose-por-tienda-sql-real`, `AnaliticaPage` y la dirección de
    `bulk-orden-service`.
  - Mueve a la vez las expectativas derivadas:
    - email y cédula sintéticos;
    - slug del nombre de archivo del picking;
    - textos concatenados;
    - regex de `getByRole`;
    - motivos.
  - **Hecho:**
    - esos archivos están en verde;
    - el conteo de casos por archivo coincide con el de T0;
    - el orden esperado en `informe-picking.test.ts`, `ParamsPicking.test.tsx` y las dos tablas de
      productos no cambió.

- [x] **T4 [P] — Comentarios y títulos de caso en tests** (R1). Depende de T1.
  - Generaliza los siete archivos «solo en un comentario o en el título de un caso» de
    `design.md > Inventario (c)`.
  - Los comentarios de los archivos de T3 los cambia T3, para que dos tareas en paralelo no editen el
    mismo archivo.
  - **Hecho:** los siete están en verde y conservan su conteo de casos.

- [x] **T5 [P] — Diseños y docs** (R1, R7). Depende de T1.
  - Sustituye los nombres en los cinco HTML y en `canvas.json` (`design.md > D6`).
  - Edita `docs/plan-saas.md`: la línea 14 sin la cuenta de GitHub, y fuera el paréntesis con el nombre del integrador.
  - Edita `docs/limpieza-ordenex.md`: la regla 2 y la §6.
  - **Hecho:**
    - el diff solo muestra los nombres;
    - la guardia de T1 ya no lista nada de `docs/` ni de `design-*/`.

- [x] **T6 [P] — Comentarios de las dos migraciones que se quedan** (R1, R8). Depende de T1.
  - Generaliza las líneas `--` de `20260827160000…/migration.sql`, de `…/down.sql` y de
    `20260828120000…/migration.sql`.
  - **Hecho:**
    - `git diff -U0 dev` sobre esos tres archivos solo muestra comentarios SQL;
    - `orden-num-remision-parcial.test.ts` y `orden-num-remision-por-tienda.test.ts` siguen en verde.

- [x] **T7 [P] — Quitar la 459 y adaptar a quien la usaba** (R1, R9, R11, R12). Depende de T1.
  - Borra la carpeta de la migración, la guardia 459, su test de integración y el fixture SQL.
  - Quita la entrada de la guardia de `tests/baseline-rojos.json`.
  - En `caja-invariante-tiendas.test.ts` y `cobro-tienda-461-completar-migration.test.ts`:
    - siembra directamente la fila reclasificada;
    - quita las aserciones sobre lo que escribía la 459 y nombra cada una en
      `progress/impl_SL-13.md`.
  - En `orden-traspaso-migration.test.ts`, quita la entrada de la 459.
  - En `test-citado-desaparecido.guardia.test.ts`, añade `EXCEPCIONES_TEMPORALES` (dos citas, las del spec 461; ver `design.md > D4`,
    `ficha: "SL-13"`, `retira: "SL-27"`) y el caso de caducidad (`design.md > D4`).
  - **Hecho:**
    - `test-citado-desaparecido` está en verde;
    - quitar una entrada la pone en rojo nombrando esa cita (después se restaura);
    - `gate-cableado-arnes-v2` sigue en verde con el baseline podado.

- [x] **T8 — La cadena de migraciones, contra una base de verdad** (R10). Depende de T6 y T7.
  - Confirma que `DATABASE_URL` no es de Ordenex.
  - Corre `pnpm exec prisma migrate reset --force --skip-seed`.
  - Corre contra esa base los cinco tests de integración de R10.
  - **Hecho:**
    - el reset termina sin error;
    - los cinco tests se **ejecutan** y pasan, con el número de casos ejecutados anotado;
    - sin base disponible, se dice así en `progress/impl_SL-13.md` y R10 queda pendiente de la suite
      completa de CI.
  - **Decisión del leader (2026-10-22):** R10 queda cumplido con los tres tests que pasan ejecutados
    (`api-key-tienda-destino-migration`, `cobro-tienda-461-completar-migration`,
    `premio-ranking-devengo-migration`). `orden-traspaso-migration` y `caja-invariante-tiendas`, que
    abortan por la tabla `orden` vacía, pasan a SL-31. El reset se hizo con `migrate deploy` sobre una
    base nueva (`progress/impl_SL-13.md > T8`).

- [x] **T9 — Cierre** (R1–R16). Depende de T1b–T8.
  - La guardia de T1 está en **verde**.
  - Pruebas de que muerde, cada una restaurada después y con su salida anotada:
    - un archivo nuevo sin versionar con «cliente B» la pone en rojo;
    - un archivo nuevo sin versionar con solo `Ecuador` y `Distribuidora mayorista` **no** la pone
      en rojo;
    - `Distribuidora` devuelto al comentario de `ProductosTabla.tsx` la pone en rojo.
  - Comprobaciones de diff:
    - `git diff --name-status dev...HEAD -- db/migrations` muestra solo los tres editados de T6 y
      los dos borrados de la 459 (R8, R9);
    - `git diff --name-only dev...HEAD -- specs ':!specs/SL-13-fuera-nuform'` sale vacío (R13);
    - no cambió ningún literal de provincia, cantón, distrito, SINPE ni colones (R13).
  - `./init.sh` con el log a archivo y `INIT_EXIT=$?` escrito dentro (R14).
  - Mapa en `progress/impl_SL-13.md`:

    | R | Test |
    |---|---|
    | R1, R2, R3, R4 | `sin-integrador-de-ordenex.guardia.test.ts` |
    | R15 | `sin-integrador-de-ordenex.guardia.test.ts` (caso de los mapas) |
    | R16 | `tests/unit/config/pais.test.ts` |
    | R5 | typecheck, `vitest related` de los cinco archivos y diff |
    | R6 | conteo de casos T0/T3, `informe-picking.test.ts`, `ParamsPicking.test.tsx`, `ProductosTabla.test.tsx` |
    | R7 | `sin-integrador-de-ordenex.guardia.test.ts` (la línea 14 ya no casa) |
    | R8, R9 | comprobaciones de diff de T6/T9 y `orden-traspaso-migration.test.ts` |
    | R10 | `migrate reset` y los cinco tests de integración, ejecutados |
    | R11 | `gate-cableado-arnes-v2.guardia.test.ts` y diff del baseline |
    | R12 | `test-citado-desaparecido.guardia.test.ts` (R-1 y caducidad) |
    | R13 | comprobaciones de diff |
    | R14 | `INIT_EXIT=0` |

  - **Hecho:** `INIT_EXIT=0` en el worktree y las comprobaciones de diff como se espera.

## Archivos esperados

Nuevos:
- `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`
- `lib/config/pais.ts`
- `tests/unit/config/pais.test.ts`

Borrados:
- `db/migrations/20260925120300_reclasificar_cobros_459/migration.sql`
- `db/migrations/20260925120300_reclasificar_cobros_459/down.sql`
- `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts`
- `tests/integration/db/reclasificacion-459-migration.test.ts`
- `tests/integration/db/_fixtures/reclasificacion-459-sql.ts`

Editados, migraciones (solo comentarios):
- `db/migrations/20260827160000_orden_num_remision_unico_parcial/migration.sql`
- `db/migrations/20260827160000_orden_num_remision_unico_parcial/down.sql`
- `db/migrations/20260828120000_api_key_tienda_destino/migration.sql`

Editados, código:
- `app/(app)/ordenes/page.tsx`
- `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
- `lib/analytics/alcance.ts`
- `lib/services/EliminarOrdenService.ts`
- `lib/whatsapp-envios/informes/picking/informe.ts`
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx`
- `app/(app)/mis-asignaciones/_components/UbicacionMapaInner.tsx`

Editados, tests, guardias y baseline:
- `tests/baseline-rojos.json`
- `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`
- `tests/integration/db/caja-invariante-tiendas.test.ts`
- `tests/integration/db/cobro-tienda-461-completar-migration.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/components/AnaliticaPage.test.tsx`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/unit/utils/partes-por-tienda.test.ts`
- `tests/unit/services/bulk-orden-service.test.ts`
- `tests/components/CierreRechazosDeTienda.test.tsx`
- `tests/components/ParamsPicking.test.tsx`
- `tests/components/ProductosTabla.test.tsx`
- `tests/components/ProductosTablaDinero.test.tsx`
- `tests/components/WalletLedgerAcciones459.test.tsx`
- `tests/components/WalletLedgerAcciones461.test.tsx`
- `tests/integration/api/ordenes-api-key-tienda-destino-aislamiento.route.test.ts`
- `tests/integration/api/ordenes-api-key-tienda-destino.route.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/repositories/webhook-suscripcion-repository.test.ts`
- `tests/unit/actions/abono-tienda-action.test.ts`
- `tests/unit/actions/informe-picking-actions.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/repositories/api-key-repository.list.test.ts`
- `tests/unit/repositories/api-key-repository.secreto.test.ts`
- `tests/unit/repositories/api-key-repository.test.ts`
- `tests/unit/repositories/cierre-dia-repository.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `tests/unit/repositories/picking-repository.test.ts`
- `tests/unit/services/_abono-tienda-montar.ts`
- `tests/unit/services/abono-tienda-anulacion.test.ts`
- `tests/unit/services/abono-tienda-service.test.ts`
- `tests/unit/services/api-key-auth-service.test.ts`
- `tests/unit/services/api-key-service.eliminar.test.ts`
- `tests/unit/services/api-key-service.listar.test.ts`
- `tests/unit/services/api-key-service.tienda-destino.test.ts`
- `tests/unit/services/caja-abono-tienda-feed.test.ts`
- `tests/unit/services/cierre-dia-service.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/ejecucion-envio-informe-error.test.ts`
- `tests/unit/services/eliminar-orden-service.test.ts`
- `tests/unit/services/pago-por-cuenta-tienda-service.test.ts`
- `tests/unit/services/whatsapp-envio-service-picking.test.ts`
- `tests/unit/types/abono-tienda-schema.test.ts`
- `tests/unit/types/api-key-motivo-no-eliminable.test.ts`
- `tests/unit/types/pago-por-cuenta-tienda-schema.test.ts`
- `tests/unit/utils/api-key-owner.test.ts`
- `tests/unit/utils/caja-derivacion-457.test.ts`
- `tests/unit/utils/descripcion-abono.test.ts`
- `tests/unit/utils/descripcion-cobro-tienda.test.ts`
- `tests/unit/utils/descripcion-pago-por-cuenta.test.ts`
- `tests/unit/utils/ingreso-ordenex.test.ts`
- `tests/unit/utils/vista-filtro-aplicabilidad.test.ts`
- `tests/unit/whatsapp-envios/informe-picking.test.ts`
- `tests/unit/whatsapp-envios/picking-modelo.test.ts`
- `tests/unit/whatsapp-envios/picking-pdf.test.ts`

Editados, diseños y docs:
- `design-notificaciones/Main.dc.html`
- `design-notificaciones/notificaciones-ordenex.html`
- `design-whatsapp/FormularioMovil.dc.html`
- `design-whatsapp/ParamsPicking.dc.html`
- `design-whatsapp/PdfPicking.dc.html`
- `design-whatsapp/canvas.json`
- `docs/limpieza-ordenex.md`
- `docs/plan-saas.md`

Bitácora:
- `progress/impl_SL-13.md`

**No se tocan** (R9, R13): ninguna otra carpeta de `db/migrations/` y nada de `specs/` salvo
`specs/SL-13-fuera-nuform/`.
