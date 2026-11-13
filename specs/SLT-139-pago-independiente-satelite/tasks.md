# SLT-139 «Pago al mensajero independiente del efectivo: satélite» — tasks

> Requisitos: `requirements.md` (R317-R319, R322-R324, R329, R330, R333-R338, R340-R345). Diseño:
> `design.md`. `[P]` = paralelizable con la task anterior del mismo bloque. Antes de cualquier `vitest`
> o migración: `.env` copiado al worktree y base desechable exportada (memorias del leader «worktree
> sin .env = gate ciego» y «vitest related toca la base local»). Nunca `prisma migrate reset`. Avisar
> antes de `prisma generate` (`node_modules` compartido). Dinero: `Prisma.Decimal` y strings de escala
> 2, sin coma flotante.

## T0 — Medir antes de tocar (sin código de producción)

- [x] **T0.1** Confirmar la definición vigente de `pago_mensajero_movimiento_tipo_categoria_check` y de
  `pago_mensajero_movimiento_origen_uq` en la base desechable con todas las migraciones
  (`pg_get_constraintdef`, `pg_indexes`). Hecho: texto anotado en `progress/impl_SLT-139.md`; si no
  coincide con `design.md > 3.2`, PARA y avisa al leader.
- [x] **T0.2** Con R336 aplicado a mano en una rama local sin commitear (la marca en el `updateMany` de
  la aprobación, para todo destino), correr los tests de integración y los E2E que nombran
  `pago_efectivo`, «Pago del efectivo», «La central debe», «se paga del efectivo», `marcarConciliado`
  o `aprobar` de satélite, y los unit de `CierresAdminService`, `CierreDiaService` y
  `LiquidacionService` con filas de marca `true`. Hecho: lista de los que caen, con el motivo, en
  `progress/impl_SLT-139.md`; `## Archivos esperados` actualizado. Si el total pasa de 40, PARA y
  avisa al leader antes de seguir.
- [x] **T0.3** `[P]` Con `pago_satelite` solo en `schema.prisma` y `prisma generate` (avisado), correr
  `pnpm run typecheck` y listar cada `Record<PagoMensajeroMovimientoCategoria, …>` que señale. Hecho:
  la lista coincide con `design.md > 7` o se actualizan el diseño y `## Archivos esperados`.
- [ ] **T0.4** `[P]` DIFERIDA (consulta de solo lectura a prod bloqueada para agentes; informativa). (Carlos, en prod, transacción READ ONLY; informativa, no bloquea) Contar los
  `cierre_dia` de satélite `aprobado` con la marca en `false` cuya consolidación no está conciliada, y
  los de satélite en `solicitado`/`vencido`. Hecho: números anotados en `progress/features/SLT-139.md`
  (cuántos quedarán con la regla vieja, `requirements.md > PA3`).

## T1 — Esquema y migraciones (depende de T0.1)

- [x] **T1.1** `db/schema.prisma`: `pago_satelite` en `PagoMensajeroMovimientoCategoria`, con
  comentario. Hecho: `prisma validate` y `prisma generate` sin error.
- [x] **T1.2** `db/migrations/20261115120000_pago_satelite_enum/{migration,down}.sql` (design §3.1). La
  fecha se ajusta si `dev` ya tiene una migración posterior. Hecho: sube en la base desechable; el
  down aborta con una fila `pago_satelite`.
- [x] **T1.3** `db/migrations/20261115120100_pago_satelite_checks/{migration,down}.sql` (design §3.2).
  Hecho: sube; el down aborta con una fila `pago_satelite` (RAISE) y sin ella deja el CHECK de SLT-68.
- [x] **T1.4** `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` (design §13.2). Hecho: verde
  contra Postgres real; cubre R330, R337 y la unicidad de R318.

## T2 — La marca al aprobar (depende de T1)

- [x] **T2.1** `CierresAdminRepository.resolverCierre`: la marca en el `updateMany` que aprueba, solo
  con `nuevoEstado === "aprobado"`; se quita el `updateMany` aparte de SLT-123 (design §2). Hecho:
  casos 2 de la integración (T10.1) en verde.

## T3 — El feed (depende de T1)

- [x] **T3.1** `WalletMensajeroFeedService`: `destinoTipo` en el `select` y la rama `pago_satelite = P`
  (design §4); comentario de la cabecera al día. `lib/types/wallet-mensajero.ts`: `pago_satelite` en
  los dos SEED. Hecho: casos 5 y 7 de la integración en verde; `wallet-mensajero-feed-service.test.ts`
  sigue verde sin cambios.

## T4 — Lo pendiente (depende de T1)

- [x] **T4.1** `derivarPendienteCierre` con la unión de design §5.1 y `LecturaPagadoSateliteAusenteError`.
  Hecho: `tests/unit/utils/pendiente-cierre.test.ts` con la tabla de abajo (importes a mano); un
  `// @ts-expect-error` que fija que una marca `boolean` sin `pagadoPorSatelite` no compila; la lectura
  estática de que toda llamada en `lib/` nombra `pagadoPorSatelite`; y la aserción de «sin coma
  flotante» extendida a `pendiente-cierre.ts`, `WalletMensajeroFeedService.ts`,
  `CierreBodegaService.ts` y `CierreDiaService.ts` (R343). Si el `@ts-expect-error` no da error,
  PARA: el campo pasa a obligatorio (design §14) y se avisa por el tamaño.

  | # | Marca | P | E | premios | vigentes | pagado satélite | Esperado |
  |---|---|---|---|---|---|---|---|
  | 7 | true | 2500.00 | 4000.00 | 0.00 | 0.00 | 0.00 | 2500.00 |
  | 8 | true | 2500.00 | 4000.00 | 0.00 | 0.00 | 2500.00 | 0.00 |
  | 9 | true | 2500.00 | 0.00 | 300.00 | 0.00 | 2500.00 | 300.00 |
  | 10 | true | 2500.00 | 0.00 | 0.00 | 0.00 | 1000.00 | 1500.00 |
  | 11 | true | 2500.00 | 0.00 | 0.00 | 0.00 | 3000.00 | 0.00 (nunca negativo) |
  | 12 | false | 3000.00 | 1000.00 | 0.00 | 0.00 | 1500.00 | 2000.00 (se ignora) |

## T5 — La lectura (depende de T1)

- [x] **T5.1** `IPagadoPorSateliteLectura` en `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`
  y `sumarPagadoSatelitePorCierre` en `PagoMensajeroMovimientoRepository` (design §5.2). Hecho: casos 3,
  6 y 11 de la integración en verde (R333).

## T6 — Los consumidores (depende de T4, T5)

- [x] **T6.1** `CierresAdminService` (`PremiosLecturaRepo` con `Partial<IPagadoPorSateliteLectura>`;
  `conPendiente` y `pendienteTrasAprobar`, design §5.3). Hecho:
  `tests/unit/services/cierres-admin-pendiente.test.ts` con una página de un cierre viejo de satélite, uno
  nuevo de satélite conciliado (lectura `2500.00` → `0.00`) y uno nuevo central (`3000.00`); la lectura
  llamada una vez con los ids nuevos y ninguna con una página solo de viejos (R334); sin la lectura y
  con un cierre nuevo, `listarCierresAdmin` lanza `LecturaPagadoSateliteAusenteError` y
  `pendienteTrasAprobar` da `"0.00"` (R335).
- [x] **T6.2** `[P]` `CierreDiaService.conPendientePago` + `LecturasPendienteCierre.premios` con
  `sumarPagadoSatelitePorCierre?` (`lib/interfaces/services/ICierreDiaService.ts`). Hecho:
  `tests/unit/services/cierre-dia-pendiente-pago.test.ts` con un cierre nuevo de satélite antes
  (`2500.00`) y después de conciliar (`0.00`); una llamada por página (R334); sin la lectura, el cierre
  nuevo sale sin `pendientePagoMensajero` y el viejo con su cifra (R335).
- [x] **T6.3** `[P]` `LiquidacionService` (`mensajeroRepo` con `Partial<IPagadoPorSateliteLectura>`;
  `imputablesDe`, `restanteTrasAnular`, `pendienteDelCierre`). Hecho:
  `tests/unit/services/liquidacion-service.test.ts`: con la lectura en `1000.00` para un cierre nuevo
  central de P 3 000, el tope es `2000.00` (prueba que se usa); sin la lectura y con un cierre nuevo,
  registrar un pago lanza antes de escribir (ningún `crearMovimientos`, ningún `liquidacion_pago`)
  (R344).
- [x] **T6.4** `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`: las tres acciones
  (`cierre-dia`, `cierres-admin`, `liquidacion`) ejecutadas sin servicio inyectado reciben el
  `PagoMensajeroMovimientoRepository` real con `sumarPagadoSatelitePorCierre` como función (R335,
  R344). Hecho: verde; y rojo si se cambia en una acción el repositorio por un objeto sin la lectura.

## T7 — La consolidación (depende de T1)

- [x] **T7.1** `CierreDiaConsolidableRow.pagoIndependienteEfectivo: boolean` obligatorio
  (`ICierreBodegaRepository.ts`), leído en `CONSOLIDABLE_SELECT` y emitido por `toConsolidableRow`
  (`CierreBodegaRepository.ts`). Los constructores de filas de `consolidacion-completo`,
  `consolidacion-cola-satelite`, `consolidables-paginado` y `cierre-bodega-service` ganan `false` por
  defecto. Hecho: typecheck; `cierre-bodega-repository.test.ts` al día si fija la fila o el `select`.
- [x] **T7.2** `CierreBodegaService.listarConsolidacion` (design §6). Hecho:
  `tests/unit/services/cierre-bodega-service.test.ts` con estos conjuntos (importes a mano):

  | Conjunto | «La central debe» | `totalNetoAgregado` | Tarjeta |
  |---|---|---|---|
  | V (P 3000.00, E 2000.00, G 5000.00) + N (P 2500.00, E 4000.00, G 4000.00) + N0 (P 0.00, E 1000.00, G 1000.00) | 3000.00 | 7500.00 | se pinta |
  | N + N0 (solo nuevos) | 0.00 | 2500.00 | no se pinta |
  | V solo (todos viejos, igual que antes de la ficha) | 3000.00 | 5000.00 | se pinta |
  | V' (P 1500.00, E 2000.00, G 2000.00) + N (todos los pagos viejos alcanzan) | 0.00 | 2000.00 | no se pinta |

  y que `totalPagoMensajeroAgregado` y `paraLaCentralAgregado` del primer conjunto son `5500.00` y
  `4500.00` (no cambian, R341).

## T8 — La nota (independiente) `[P]`

- [x] **T8.1** `notaPagoMensajeros` sin «· se paga del efectivo» (design §8). Hecho:
  `tests/unit/utils/cola-cierres-vista.test.ts` y `tests/components/ColaCierresConsolidar.test.tsx`
  afirman «1 mensajero» y «2 mensajeros» literales y que el texto no contiene «del efectivo» (R324).

## T9 — Catálogos (depende de T1) `[P]`

- [x] **T9.1** `pago_satelite` en `CATEGORIA_PAGO_LABEL` («Pagado por la satélite»), `FUENTE_MENSAJERO`
  (`snapshot_gestion`, `pago_mensajero`), `estado-cuenta-chips.ts` (`"cierres"`) y
  `cuenta_por_pagar_mensajero.definicion.categorias` (design §7). Hecho: typecheck;
  `tests/unit/utils/incentivo-analitica-slt68.test.ts` (catálogo de métricas = SEED) y
  `tests/unit/guards/estado-cuenta-chips-total.guardia.test.ts` siguen verdes sin tocarlos; caso 12 de la
  integración (R329).

## T10 — Integración y mutaciones (depende de T2-T9)

- [x] **T10.1** `tests/integration/db/slt139-pago-satelite.int.test.ts` con los trece casos de design
  §13.1. Hecho: verde contra Postgres real, con la foto de VC idéntica antes y después.
- [x] **T10.2** Mutaciones. Cada una se aplica a mano, se corre el test indicado, **debe caer**, y se
  revierte. Antes de creer un «sobrevive», comprobar que el test se ejecutó (nombre y número de tests en
  la salida; memoria del leader «arnés de mutaciones que miente»). Resultado en
  `progress/impl_SLT-139.md` (mutación, test, rojo/verde, línea del fallo). Las del gate y el árbol
  mutado no corren a la vez (memoria «gate y mutaciones no en paralelo").

  | # | Mutación | Debe caer |
  |---|---|---|
  | **Condición** | | |
  | M1 | Feed: quitar `destinoTipo === "bodega_satelite"` (un nuevo central también escribe `pago_satelite`) | integración caso 10; `slt123-pago-independiente.int` caso 2 |
  | M2 | Feed: decidir la rama por destino y no por la marca (`destinoTipo === "bodega_satelite"` → `pago_satelite` aunque la marca sea `false`) | integración caso 5 (VS con `pago_satelite`) |
  | M3 | Pendiente: invertir la condición del término de satélite (restarlo en viejos, ignorarlo en nuevos) | `pendiente-cierre.test.ts` filas 8 y 12; integración casos 3 y 6 |
  | M4 | Marca: volver a ponerla solo si el destino es `bodega_central` | integración caso 2 (NS en `false`) y caso 5 (NS con `pago_efectivo`) |
  | M5 | Marca: ponerla también al rechazar (sin la condición `nuevoEstado === "aprobado"`) | integración caso 2 (NR en `true`) |
  | M6 | Marca: escritura aparte con `this.prisma` en vez de dentro del `updateMany` de la `tx` | integración caso 2 (el rollback forzado deja la marca en `true`) |
  | M7 | Consumidor: `CierresAdminService` pasa `pagadoPorSatelite: "0.00"` en vez de la lectura | `cierres-admin-pendiente.test.ts`; integración caso 6 (NS `2500.00`) |
  | M8 | Consumidor: `CierreDiaService` pasa `"0.00"` en vez de la lectura | `cierre-dia-pendiente-pago.test.ts`; integración caso 6 |
  | M9 | Consumidor: `LiquidacionService` pasa `"0.00"` en vez de la lectura | `liquidacion-service.test.ts` (tope `2000.00`) |
  | M10 | Fallback: `CierresAdminService` sin la lectura emite el pendiente sin restar en vez de lanzar | `cierres-admin-pendiente.test.ts` |
  | M11 | Lectura llamada por fila en vez de una vez por página | `cierres-admin-pendiente.test.ts`, `cierre-dia-pendiente-pago.test.ts`; integración caso 13 |
  | **Fórmula** | | |
  | M12 | Feed: `pago_satelite = min(P, E)` en vez de `P` | integración caso 5 (NS: E 1 000 < P 2 500 → `1000.00`); caso 6 (pendiente `1500.00`) |
  | M13 | Feed: escribir `pago_efectivo` en vez de `pago_satelite` en el nuevo de satélite | integración caso 5; caso 12 (etiqueta) |
  | M14 | Pendiente: sumar lo pagado por la satélite en vez de restarlo | `pendiente-cierre.test.ts` filas 8-11 |
  | M15 | Pendiente: quitar el `gt(0)` (devolver negativos) | `pendiente-cierre.test.ts` fila 11 |
  | M16 | `sumarPagadoSatelitePorCierre` sin `categoria: "pago_satelite"` | integración caso 6 (NS suma también su `pago_devengado`: `5000.00`) |
  | M17 | `sumarPagadoSatelitePorCierre` sin `origenId: { in }` | integración caso 11 (NS suma la fila de otro cierre) |
  | M18 | `Number(...)` en el término de satélite o en el reparto | aserción de coma flotante de `pendiente-cierre.test.ts` (R343) |
  | **«La central debe» y el neto** | | |
  | M19 | «La central debe» con todos los consolidables (código de antes) | `cierre-bodega-service.test.ts` conjunto 1 (`0.00` en vez de `3000.00`); integración caso 4 |
  | M20 | Reparto de los pagos viejos con el efectivo de todo el conjunto | `cierre-bodega-service.test.ts` conjunto 1 (`0.00`); integración caso 4 |
  | M21 | Reparto con todos los pagos y solo el efectivo de los viejos | `cierre-bodega-service.test.ts` conjunto 1 (`5500.00`) |
  | M22 | Neto sin restar Σ P de los nuevos | `cierre-bodega-service.test.ts` conjuntos 1 y 2; integración caso 4 |
  | M23 | `toConsolidableRow` sin la marca | typecheck (campo obligatorio); integración caso 4 |
  | M24 | Nota de «Pago a mensajeros» con «· se paga del efectivo» | `cola-cierres-vista.test.ts`, `ColaCierresConsolidar.test.tsx` |
  | **Migración** | | |
  | M25 | Quitar el CHECK de origen de `pago_satelite` | migración: `origen_tipo = 'manual'` aceptado |
  | M26 | `pago_satelite` también en la rama `devengo` del CHECK | migración: `tipo = 'devengo'` aceptado |
  | M27 | `down.sql` de los CHECK sin la precondición | migración: con una fila `pago_satelite` el down no aborta con el RAISE esperado |
  | M28 | `pago_satelite` en el predicado de exclusión de `origen_uq` (no idempotente) | migración (segundo insert aceptado); integración caso 7 |
  | M29 | Un `UPDATE` de backfill en la migración (p. ej. `pago_efectivo` → `pago_satelite` de cierres de satélite) | migración (conteos y sumas antes = después); integración caso 1 |
  | **Cableado** | | |
  | M30 | Una acción pasa un objeto sin `sumarPagadoSatelitePorCierre` | `cierre-dia-pendiente-cableado.test.ts` |

  Los importes de design §13.1 están elegidos para que la regla vieja y la nueva den números distintos
  en cada caso (NS con E < P; K1 con efectivo total suficiente y efectivo de los viejos insuficiente):
  si T10.1 los cambia, comprueba antes que M2, M3, M12, M19 y M20 siguen cayendo.

## T11 — Tests y E2E existentes (depende de T0.2, T10)

- [ ] **T11.1** Actualizar los que T0.2 listó. Previstos: `tests/integration/db/slt123-pago-independiente.int.test.ts`
  (caso 6: S1 aprobado con el código nuevo ahora lleva la marca; pasa a fixture viejo con la marca en
  `false`, que es lo que caracteriza) y `tests/integration/db/slt73-marcar-asienta.int.test.ts` (aprueba
  con `aprobar` real; sus cierres pasan a nuevos: el libro lleva `pago_satelite` en vez de
  `pago_efectivo`, con importes escritos a mano). Regla: si el test caracteriza la conciliación de hoy,
  pasa a la regla nueva; si usa la aprobación como montaje para otra cosa, se le da un cierre viejo.
  Nunca se borra una aserción sin sustituirla. Hecho: verdes, y cada cambio con su motivo en
  `progress/impl_SLT-139.md`.
- [ ] **T11.2** `[P]` E2E: el grupo `dinero` entero y los que T0.2 listó (previsto: ninguno cae;
  `e2e/cierre-bodega-satelite.spec.ts` ya espera «La central debe» ausente) en local, con base
  desechable nueva y `NEXT_PUBLIC_APP_URL` como en `gate.yml` (`docs/perfil-agentes.md > E2E en local
  antes del PR`). Hecho: verde.

## T12 — Cierre

- [ ] **T12.1** `./init.sh` en verde en el worktree, con `INIT_EXIT=$?` escrito dentro del log.
- [ ] **T12.2** `progress/impl_SLT-139.md` con el mapa R → test (abajo), las mutaciones y el tamaño
  medido por `scripts/tamano-pr.mjs`.
- [ ] **T12.3** Preview con Carlos antes de promover (memoria «aprobar en Preview antes de prod», D10):
  un cierre de satélite nuevo «Pendiente <P>» en `/cierres-admin` y en `/cierre-dia` hasta conciliar y
  `0.00` después; «Pagado por la satélite» en su estado de cuenta; «La central debe» de una
  consolidación mixta; la nota sin «· se paga del efectivo». Hecho: OK de Carlos anotado en
  `progress/features/SLT-139.md`.

**Total: 26 tasks** (T0.1-T0.4, T1.1-T1.4, T2.1, T3.1, T4.1, T5.1, T6.1-T6.4, T7.1-T7.2, T8.1, T9.1,
T10.1-T10.2, T11.1-T11.2, T12.1-T12.3).

## Trazabilidad

| R | Test | Caso |
|---|---|---|
| R317 | `tests/integration/db/slt139-pago-satelite.int.test.ts` | caso 5: NS = devengo 2500.00 + `pago_satelite` 2500.00, sin `pago_efectivo`, fecha = `conciliado_at` |
| R318 | integración caso 7 + `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` | re-asentar NS no duplica; la base rechaza el segundo `pago_satelite` del mismo (cierre, mensajero) |
| R319 | integración casos 3 y 6 + `tests/unit/services/cierres-admin-pendiente.test.ts` + `tests/unit/services/cierre-dia-pendiente-pago.test.ts` | NS `2500.00` antes, `0.00` después; cuenta por pagar 0 |
| R322 | `tests/unit/services/cierre-bodega-service.test.ts` + integración caso 4 | conjuntos 1-4 de T7.2; K1 `3000.00` |
| R323 | ídem | unit: neto `7500.00`, `2500.00`, `5000.00` (igual que antes), `2000.00`; integración: K1 `9500.00` |
| R324 | `tests/unit/utils/cola-cierres-vista.test.ts`, `tests/components/ColaCierresConsolidar.test.tsx` | «1 mensajero», «2 mensajeros», sin «del efectivo» |
| R329 | integración caso 12 + `tests/unit/utils/incentivo-analitica-slt68.test.ts` (sin cambios) | etiqueta en estado de cuenta y descarga, detalle por guía, analítica, catálogo |
| R330 | `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` | 23514 con `devengo`, con `manual`, con `origen_id` nulo |
| R333 | integración caso 11 | empresa B no suma en A |
| R334 | `cierres-admin-pendiente.test.ts`, `cierre-dia-pendiente-pago.test.ts` + integración caso 13 | una llamada por página |
| R335 | `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` + `cierres-admin-pendiente.test.ts` + `cierre-dia-pendiente-pago.test.ts` | las acciones pasan la lectura; sin ella, error o «Sin dato», nunca una cifra |
| R336 | integración caso 2 | marca `true` en NS, NS0, NC; `false` en VS, VC, NR; rollback deja `false` |
| R337 | migración | conteos y sumas iguales; los down abortan con una fila y sin ella revierten |
| R338 | `tests/unit/utils/pendiente-cierre.test.ts` | filas 7-12 |
| R340 | integración caso 5 | VS (viejo, conciliado hoy) = devengo 3000.00 + `pago_efectivo` 2000.00 |
| R341 | integración casos 4, 5, 9 y 10 + `cierre-bodega-service.test.ts` | caja, `paraLaCentral` `1500.00`, premios, conciliación analítica, alcance de pago, central |
| R342 | integración caso 1 | foto de VC idéntica |
| R343 | `pendiente-cierre.test.ts` (lectura de archivos) + `tests/unit/guards/liquidacion-money-safe.test.ts` (sin cambios: ya cubre `PagoMensajeroMovimientoRepository`, `CierresAdminService`, `LiquidacionService`) | sin coma flotante |
| R344 | `liquidacion-service.test.ts` + `cierre-dia-pendiente-cableado.test.ts` | lanza antes de escribir; la acción pasa la lectura |
| R345 | integración caso 8 | corregir no toca `pago_satelite`; desmarcar devuelve `con_asientos` |

## Tamaño

Límite (`gate.tamano_pr` sin valor en `arnes.config.json` → por defecto): 40 archivos y 1 000 líneas
(añadidas + borradas). No cuentan `specs/` ni `progress/`.

**Producción** (estimación):

| Bloque | Archivos | Líneas |
|---|---|---|
| Esquema + 2 migraciones (4 SQL; el `down.sql` del enum es la función dinámica de SLT-68, ~170) | 5 | ~240 |
| Marca al aprobar | 1 | ~15 |
| Feed | 1 | ~15 |
| `derivarPendienteCierre` (unión, término, error) | 1 | ~40 |
| Lectura + interfaz | 2 | ~50 |
| Consumidores (CierresAdmin, CierreDia + interfaz, Liquidación) | 4 | ~100 |
| Consolidación (servicio, repositorio, interfaz) | 3 | ~30 |
| Nota y catálogos | 6 | ~12 |
| **Total** | **23** | **~500** |

**Tests** (estimación; con la regla de que pesan ~2x lo estimado):

| Bloque | Archivos | Estimado | ~2x |
|---|---|---|---|
| Integración nueva (§13.1, trece casos) | 1 | ~450 | ~900 |
| Migración ida y vuelta | 1 | ~130 | ~260 |
| Unit: pendiente, CierresAdmin, CierreDia, Liquidación, consolidación | 5 | ~360 | ~720 |
| Fixtures que ganan la marca (3 servicios + repositorio) | 4 | ~10 | ~20 |
| Nota (unit + componente) | 2 | ~10 | ~20 |
| Cableado | 1 | ~60 | ~120 |
| Existentes que caen (previstos) | 2 | ~90 | ~180 |
| **Total** | **16** | **~1 110** | **~2 220** |

**Total SLT-139: 39 archivos** (23 de producción, 16 de tests) y **~1 600 líneas estimadas, ~2 700 con
los tests al doble**. Cabe en 40 archivos, **por encima del 80% (32)**, con un archivo de margen. **No
cabe en 1 000 líneas** por ninguna de las dos cuentas: solo la producción y la integración nueva ya
suman ~950. No se parte (instrucción del leader; y no hay corte vertical sin dinero contradictorio,
`requirements.md > PA1`): la salida es la línea `tamano-pr-aceptado` de `docs/gate.md > Tamaño del PR`
con el sí de Carlos. Si T0.2 o T0.3 añaden archivos y el total pasa de 40, el leader decide antes de
seguir.

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261115120000_pago_satelite_enum/migration.sql`
- `db/migrations/20261115120000_pago_satelite_enum/down.sql`
- `db/migrations/20261115120100_pago_satelite_checks/migration.sql`
- `db/migrations/20261115120100_pago_satelite_checks/down.sql`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/services/WalletMensajeroFeedService.ts`
- `lib/utils/pendiente-cierre.ts`
- `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`
- `lib/repositories/PagoMensajeroMovimientoRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/services/LiquidacionService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/interfaces/repositories/ICierreBodegaRepository.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`
- `lib/types/wallet-mensajero.ts`
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/analytics/metrics.ts`

Tests nuevos:
- `tests/integration/db/slt139-pago-satelite.int.test.ts`
- `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts`

Tests que se amplían:
- `tests/unit/utils/pendiente-cierre.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
- `tests/unit/services/liquidacion-service.test.ts`
- `tests/unit/services/cierre-bodega-service.test.ts`
- `tests/unit/utils/cola-cierres-vista.test.ts`
- `tests/components/ColaCierresConsolidar.test.tsx`
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`

Tests que solo ganan la marca obligatoria de la fila consolidable:
- `tests/unit/services/consolidacion-completo.test.ts`
- `tests/unit/services/consolidacion-cola-satelite.test.ts`
- `tests/unit/services/consolidables-paginado.test.ts`
- `tests/unit/repositories/cierre-bodega-repository.test.ts` (si fija la fila o el `select`; T7.1)

Tests que caen (previstos; T0.2 los mide):
- `tests/integration/db/slt123-pago-independiente.int.test.ts`
- `tests/integration/db/slt73-marcar-asienta.int.test.ts`

Las acciones `lib/actions/cierres-admin.ts`, `lib/actions/cierre-dia.ts` y `lib/actions/liquidacion.ts`
**no** cambian (design §5.3).
