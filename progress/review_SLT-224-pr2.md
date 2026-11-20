# Review PR 2 — SLT-224 «Retiro a central: recalcular la zona de la orden (quedan con la zona vieja tras mover distritos)»

- Revisado: rama `feature/SLT-224-zona-al-retirar-a-central`, HEAD `9af37535`, diff contra `origin/dev` (PR 1 ya mergeado).
- Fecha: 2026-11-20. Reviewer (Opus).
- Alcance: R1713, R1715, R1716, R1718 (pantalla) y R1720–R1727 (corte D6 y motivos), con P4 por defecto
  (`reprogramado` y `novedad` no se mueven) y el literal 377/T4 de `zona-repository.test.ts` reescrito con OK del leader.

## Veredicto: RECHAZADO

Un bloqueante: la segunda escritura del corte de dinero (el SQL `cobroEnCurso` de la vista previa) no está
probada en dos de sus ramas. Dos mutaciones mías sobre ese `WHERE` sobreviven con la suite en verde. Lo
demás está bien: el corte que escribe (el `WHERE` Prisma del helper) está bien probado, el dinero congelado no
se toca, la UI cumple y init y E2E salen en verde.

## Checklist

- [x] **Ruta completa** (toca la zona, de la que sale la tarifa): requirements, design y tasks presentes.
- [x] **`design.md > ## Lo que ya existe`** con la búsqueda del PR 2 (`ESTADOS_TERMINALES`, `CierreEstado`,
      `resolverDestinoCierre`, `MotivoSaltada`). El diff reutiliza `ESTADOS_TERMINALES` y `ESTADOS_PAQUETE_EN_ESTANTE`
      y no vuelve a crear nada de esa lista.
- [ ] **Tasks `[x]`**: faltan T0b (medido en `progress/features/SLT-224.md`, pero sin marcar) y las cuatro de
      T15. T15 se cierra con esta review y la marca el leader (m1).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs`: 17/40 archivos, 511/1000 líneas de producción, 939/3000 de tests.
- [ ] **Trazabilidad R→test**: todas las R tienen su test. El de R1727 (y el de R1722 en la vista previa del
      botón) no cubre la matriz de R1722 (B1).
- [x] **Mapa R→test en `progress/impl_SLT-224.md > PR 2`** (backend y pantalla).
- [x] **Corte de dinero (lo que escribe)**: una orden con `cierre_detail` de un cierre `solicitado`, `rechazado` o
      `vencido`, o con una gestión que decidió dinero sin cierre o con un cierre sin aprobar, no se mueve. Lo prueba
      `reconciliar-zona-corte-vivas.int.test.ts` (matriz) por el guardado de zona, la recepción y el botón.
- [x] **Tarifa congelada intacta**: el test R1707 compara el md5 de `cierre_detail`, `cierre_detail_concepto`,
      `gestion_orden`, `gestion_pago_congelado` y `wallet_movimiento` antes y después, con la orden de cierre aprobado ya
      movida. La fila de la orden solo cambia `zona_id` y `updated_at`. El helper solo hace `updateMany` de `zonaId`
      (guardia `zona-reconciliacion-no-retarifa`, 14 verdes).
- [x] **Empresa**: el PR 2 no añade queries sin `organizacion_id`. El SQL de la vista previa conserva el JOIN por
      empresa del PR 1, y el helper va por la `tx` con la empresa en contexto (RLS).
- [x] **Sin tablas ni migraciones nuevas** en el PR 2; `init.sh` dice «todas las migraciones tienen down.sql».
- [x] **Sin literales de país o moneda en el código de producción nuevo**. `sinpeNumero` solo sale en fixtures de
      test, igual que en los que ya había. Nada de Ordenex.
- [x] **Dependencias**: ninguna nueva.
- [x] **Comentarios**: explican el porqué (D6, §4b, P4). La excepción es la de B1: el comentario de
      `ActualizacionZonasRepository` dice que «R1727 ata las dos», y no las ata del todo.
- [x] **UI**: «Actualizar zonas» sale solo si `esAccesoTotal(rol)` (maestro/admin). El test recorre todos los
      `RolValue`. Las Server Actions vuelven a validar el rol (R1714). Abre el `Modal` compartido en «cargando», pinta
      grupos zona actual → nueva, total y saltadas con motivo, sin confirmar (vista previa). Sin candidatas no hay
      «Confirmar». El resultado refresca el listado al cerrar. Textos en español llano. Ayuda en
      `docs/ayuda/oficina/ordenes.md` sin glifos.
- [x] **typecheck / lint / guardias**: verdes dentro de `./init.sh`.
- [x] **E2E locales**: verdes (ver abajo).

## Verificación ejecutada

### `./init.sh`
- Base desechable NUEVA `servi_slt224_e2e2`: `CREATE DATABASE`, `prisma migrate deploy`, `db:seed`. Nunca `migrate reset`.
  Exportada como `DATABASE_URL`/`DIRECT_URL`. `.env` presente, comprobado solo como booleano; ningún valor impreso.
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`, con `INIT_EXIT` escrito dentro del log: **INIT_EXIT=0**.
  Test rápido: 100 archivos/1342, 100/1739, 100/1565 y 87/1252 (1 skipped). Sin rojos nuevos.
- Ruido de entorno, no del PR. Una corrida previa contra la base de `.env` cayó por
  `tests/unit/scripts/demo-qa-paralelo.test.ts`, un test de tiempo que verde suelto (4/4). Otras dos cayeron porque
  otro worktree (`SLT-225-desactivar-zona`) regeneró el cliente Prisma del `node_modules` compartido a mitad de
  corrida: `error TS` en `HistorialAccionRepository` y «column (not available) does not exist» en `zona.create`.
  Con `prisma generate` y el cliente estable durante la corrida (mtime comprobado), verde.

### E2E locales
`next build` con `NEXT_PUBLIC_APP_URL=APP_BASE_URL=http://localhost:3062`, `E2E_PUERTO=3062`,
`E2E_STORAGE_PUERTO=54362`, base `servi_slt224_e2e2`. Sin dev server propio.
Specs: los de `grep -rl recepcion e2e/` (asignacion-satelite, cierre-modelo-nuevo-plan-porcentual, planes-borrador,
recepcion-satelite, recibir-paquetes, reglas-bloqueos-cierre, reprogramacion-liberacion, seleccion-entre-busquedas,
tope-intentos-por-empresa), el de `retirar` (retiro-satelite-central), y además zona-sin-distritos y
escritorio-igual-a-prod. Este último cubre la fila de la cabecera de /ordenes, donde entra el botón.

- Corrida 1: inválida. El cliente Prisma compartido estaba regenerado con el schema de SLT-225 (11 rojos
  `zona.create`, todos de fixture).
- Corrida 2, con el cliente estable antes y después (mtime igual): **53 passed**, 1 failed y 1 did not run, los dos
  en `seleccion-entre-busquedas`, por «worker process exited unexpectedly (code=3221226505)». Es la inestabilidad
  conocida de Windows.
- Repetición de `seleccion-entre-busquedas.spec.ts`, con el cliente estable: **2 passed**.
- Total: **55/55 verdes** (incluye las dependencias de `plataforma-vacia`).
- Ningún E2E pulsa «Actualizar zonas». La pantalla la cubre `tests/components/ActualizarZonasButton.test.tsx`
  (17 tests) y la escritura, los de integración.

### Mutaciones propias (árbol restaurado con `git checkout` tras cada una; `git status` limpio)
Contra `actualizacion-zonas.int.test.ts`, `reconciliar-zona-corte-vivas.int.test.ts` y
`recepcion-central-reconcilia-zona.int.test.ts` (26 tests, ejecutados, no skipped):

| # | Mutación | Resultado |
|---|---|---|
| PM1 | helper `whereBaseElegible`: quitar `OR: [{ cierreId: null }, { cierre: { estado: { not: "aprobado" } } }]` de `gestiones.none` | **MUERTA**: 5 rojos (los tres llamadores, la matriz y R1720 en recepción) |
| PM2 | helper: `cierreDetalles.none.cierre.estado` `not: "aprobado"` → `notIn: ["aprobado", "vencido"]` | **MUERTA**: 1 rojo (matriz, `cd-vencido`) |
| SM1 | SQL `cobroEnCurso` de `ActualizacionZonasRepository`: `AND (g.cierre_id IS NULL OR c.estado <> 'aprobado')` → `AND (g.cierre_id IS NULL)` | **SOBREVIVE**: 26/26 verdes |
| SM2 | SQL `cobroEnCurso`: `cd ... AND c.estado <> 'aprobado'` → `AND c.estado = 'solicitado'` | **SOBREVIVE**: 26/26 verdes |

## Hallazgos

### BLOQUEANTE

**B1. El SQL `cobroEnCurso` de la vista previa no está probado en dos de sus ramas (R1722 en el botón, R1727).**
`lib/repositories/ActualizacionZonasRepository.ts > sqlZonaErrada()` es la segunda escritura del corte de dinero.
Decide qué cuenta la vista previa como «se actualiza» y qué enseña como «cobro en curso», en la vista previa y en
las restantes después de confirmar. La matriz de `actualizacion-zonas.int.test.ts` solo tiene un `cierre_detail` de
cierre `solicitado`, una gestión sin cierre y un `cierre_detail` aprobado. No tiene ningún `cierre_detail` de cierre
`rechazado` o `vencido` ni ninguna gestión con cierre (aprobado o sin aprobar). Por eso SM1 y SM2 sobreviven.

Si ese SQL diverge del helper, por ejemplo con una gestión `entregado` en un cierre `rechazado`, la vista previa
cuenta la orden en los grupos, la escritura (bien protegida) no la mueve y el resultado tampoco la lista como
saltada, porque `motivoDeSaltada` devuelve `null`. Desaparece de los dos listados, que es justo lo que R1727 prohíbe.
El comentario del repositorio dice que R1727 ata las dos escrituras, y en estas ramas no las ata. Regla del perfil
(`backend_dev`): un `WHERE` de dinero sin test de integración que lo mate no está probado.

**Qué falta.** Añadir a la matriz de `actualizacion-zonas.int.test.ts`, en un estado `se_mueve`:
- `cierre_detail` de cierre `rechazado` y de cierre `vencido`, con salida esperada `cobro_en_curso`;
- gestión `entregado` (o rechazo) con `cierre_id` de un cierre `rechazado`, con salida esperada `cobro_en_curso`;
- gestión de rechazo con `cierre_id` de un cierre `aprobado`, que se actualiza.

Después, ajustar los literales (`SALTADAS_ESPERADAS`, totales) y dejar en `progress/impl_SLT-224.md` el rojo de SM1 y
SM2 contra el test nuevo (R1727 debe caer). No hace falta tocar código de producción.

### Menores

**m1. Tasks sin marcar.** `tasks.md` T0b sigue `[ ]` aunque el T0b está medido en `progress/features/SLT-224.md`
(2026-11-20). Las cuatro casillas de T15 también siguen sin marcar: init, E2E y head del PR los cierra esta review o
el leader, y el mapa ya está en la bitácora. El leader las marca al cerrar.

**m2. P4 y la parada del T0b, pendientes de Carlos.** `progress/features/SLT-224.md` anota «2026-11-19, Carlos (P4):
reprogramado/novedad esperando liberación se mueven («si se mueven»). Sin aplicar», con la duda del paquete devuelta a
Carlos. El código y R1723 siguen el valor por defecto (no se mueven), como pidió el leader, y `requirements.md` aún dice
«Abierta: P4». Además, el T0b registra una condición de parada de `design.md §6`: una
`mensajero_recogiendo_en_bodega` con cierre aprobado, «consulta a Carlos». Antes del aviso de merge conviene que
Carlos confirme las dos cosas por escrito y que el spec registre el estado real de P4. No es bloqueante para el
código: el valor por defecto es el conservador.

**m3. Texto «cobro en curso (cierre sin aprobar)».** En `ActualizarZonasButton.tsx` (`TEXTO_MOTIVO_SALTADA`) y en la
ayuda, el paréntesis no describe bien el caso más común de R1722: una gestión decidida sin ningún cierre todavía
(entregada hoy). R1726 dice literal «cobro en curso». Propuesta: dejar «cobro en curso», o «cobro en curso (falta
aprobar su cierre)».

**m4. Export sin consumidor.** `ESTADOS_DEVOLUCION_SIN_RECONCILIAR` (`lib/utils/estados-bodega-satelite.ts`) ya no la
usa ningún código de producción, solo `clase-reconciliacion-zona.test.ts`. Se puede quitar, o anotar por qué se
conserva.

**m5. Entorno, no del PR.** El cliente Prisma del `node_modules` compartido lo regenera cualquier worktree que pase
el gate (hoy SLT-225 «desactivar zona», que añade columnas a `zona`). Tumbó dos corridas mías con rojos que no son de
este diff. Para la vuelta 2 y el gate del implementer: `prisma generate` justo antes y comprobar el mtime del
cliente después.

## Lo que pasó bien (para no repetir trabajo en la vuelta 2)
- `CLASE_RECONCILIACION_ZONA` es un `Record<OrderStatusValue, …>` exhaustivo. El test fija literal cada clase y que
  las claves sean `ORDER_STATUS_SEED` (R1725).
- La matriz de `reconciliar-zona-corte-vivas.int.test.ts` siembra 22 órdenes, comprueba que se sembró entera y que
  `retenidas = 1` (R1724).
- La recepción mueve la orden con un intento anterior aprobado y deja su acción con el escáner como actor (R1720).
- `motivoDeSaltada`: el estado manda sobre el cobro, por construcción. Probado en unit, en integración y en componente.

## Vuelta 2 (acotada a 4dcc7b87..cc6f38ab)

- Revisado: HEAD `cc6f38ab` (arreglo `39cd5a4e` + decisiones de Carlos `cc6f38ab`). Fecha: 2026-11-20. Reviewer (Opus).
- Entorno: `pnpm prisma generate` antes de empezar (cliente sin la columna `activa` de SLT-225, comprobado en el
  `schema.prisma` generado). `DATABASE_URL`/`DIRECT_URL` exportadas a `servi_slt224_pr2`; `.env` comprobado solo
  como booleano, ninguna URL impresa.

### Veredicto: APROBADO

B1 cerrado: repetí SM1 y SM2 y las dos mueren. m1, m3 y m4 resueltos; m2 resuelto por Carlos. El diff no
toca código de producción salvo un texto de UI y un export muerto, y el gate sale verde.

### Checklist de la vuelta
- [x] **B1** — `actualizacion-zonas.int.test.ts` sin mutar: 6 passed (no skipped). Mutaciones mías sobre
      `sqlZonaErrada()`, árbol restaurado con `git checkout` tras cada una (`git status` limpio):

| # | Mutación | Resultado |
|---|---|---|
| SM1 | `AND (g.cierre_id IS NULL OR c.estado <> 'aprobado')` → `AND (g.cierre_id IS NULL)` | **MUERTA**: 5/6 rojos, R1727 incluido (`expected 5 to be 4`; falta `gestion-cierre-rechazado` en las saltadas) |
| SM2 | detalle: `c.estado <> 'aprobado'` → `c.estado = 'solicitado'` | **MUERTA**: 5/6 rojos, R1727 incluido (`expected 6 to be 4`; faltan `cd-rechazado` y `cd-vencido`) |
| SM3 (nueva) | gestión: `AND (g.cierre_id IS NULL OR c.estado <> 'aprobado')` → `AND TRUE` | **MUERTA**: 4/6 rojos (`expected 3 to be 4`; `gestion-cierre-aprobado` deja de actualizarse) |

      Los literales nuevos (`SALTADAS_ESPERADAS`, 4 actualizadas, `cambiadas`) están escritos a mano, no derivados
      de la fuente. El comentario del repositorio («R1727 ata las dos») ya es cierto.
- [x] **m1** — `tasks.md`: T0b y tres casillas de T15 marcadas. Queda abierta «T0b re-medido antes de abrir el PR»,
      que le toca al leader. Es correcto que siga sin marcar.
- [x] **m2** — `requirements.md` registra P4 resuelta («No moverlas hasta liberar», 2026-11-20). El código ya seguía
      ese valor. La parada del T0b la responde Carlos en `progress/features/SLT-224.md > Decisiones`, y el corte no cambia.
- [x] **m3** — «cobro en curso (gestión o cierre sin aprobar)» en el botón, el test de componente y la ayuda. Sin glifos.
- [x] **m4** — `ESTADOS_DEVOLUCION_SIN_RECONCILIAR` y `estadosDeClase` fuera. No queda ninguna referencia en código ni
      en tests (grep), y `deClase` del test unitario sigue en uso.
- [x] **Tamaño**: 17/40 archivos, 498/1000 líneas de producción, 978/3000 de tests.
- [x] **`./init.sh`** (`NODE_OPTIONS=--max-old-space-size=8192`, `INIT_EXIT` dentro del log): **INIT_EXIT=0**. Test
      rápido 100/1342, 100/1739, 100/1565 y 87/1252 (1 skipped), typecheck, lint, guardias y down.sql en verde.
      Nota de entorno: el `mtime` del cliente Prisma compartido cambió a mitad de la corrida (otro worktree generó).
      El cliente resultante sigue sin `activa` y la corrida salió verde, así que no afecta al veredicto.
- [x] **E2E**: no los repetí. El diff solo cambia el texto de un motivo dentro del modal del botón, y ese texto lo
      cubre `ActualizarZonasButton.test.tsx`.

### Menores (nuevos, no bloquean)
- **m6. Spec y ficha con restos de «P4 abierta».** `design.md` §2 (tabla de clases, fila `por_liberar`) dice todavía
  «P4 (abierta; por defecto no se mueve)», y `progress/features/SLT-224.md > Preguntas abiertas` sigue listando P4.
  Además `design.md` §2.1 dice que `ESTADOS_DEVOLUCION_SIN_RECONCILIAR` «se conserva». Conviene una línea que diga
  que P4 está resuelta y que el export se quitó en el PR 2. Puede hacerlo el leader al cerrar.
- **m5** (entorno) sigue igual: el cliente compartido lo regeneran otros worktrees. Antes del aviso de merge, mira
  que el `gate-completo` de CI salga verde.
