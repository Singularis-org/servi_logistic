# impl SLT-203 «API: publicar los intentos de entrega en la respuesta de la carga»

Ruta directa. Decisión de Carlos (2026-11-18): PUBLICAR `manifiesto.filas[].intentos` de
`POST /api/ordenes/api-key/carga`; 160/R31 (QA5) queda enmendado solo para ese campo. Cierra el
«Abierto» de `progress/impl_SLT-201.md`. Sin cambios de comportamiento: solo contrato, docs,
tests y spec.

## Archivos
- `lib/api/openapi-spec.ts`: `ManifiestoFila.intentos` (integer, minimum 0, obligatorio) con su
  descripción; el ejemplo de fila del manifiesto gana `intentos: 0` y pasa a `satisfies
  ManifiestoFilaDTO` completo; comentarios que citaban la excepción, actualizados.
- `docs/api/api-key-openapi.yaml`: espejo (propiedad, `required`, los dos ejemplos, nota de prosa).
- `docs/api/servi-logistic-api-key.postman_collection.json`: descripción de «2 · Cargar órdenes».
- `docs/ayuda/oficina/guia-integracion-api.md`: viñeta en §5.1 «Comportamientos que debe manejar»
  y fila 2026-11-18 en la tabla del bloque C (historial de cambios).
- `docs/api/CHANGELOG.md`: entrada 2026-11-18 (sin ruptura).
- `tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts`: fuera
  `FUERA_DEL_CONTRATO_FILA_MANIFIESTO`/`sinExcepciones`; la fila real se compara con
  `ManifiestoFila` sin excepciones, más control de que trae `intentos`, que es `required` e `integer`.
- `tests/unit/types/intentos-no-alcance.test.ts`: R31 enmendado (comentario con la decisión y la
  ficha). Recorre el spec y solo admite «intentos» bajo `components.schemas.ManifiestoFila.*` y en
  `manifiesto.filas[n].intentos` de los ejemplos del 200 de la carga; control positivo; mutación en
  memoria que mete `intentos` en cada uno de los demás schemas (incluidos `OrdenListItem` y
  `OrdenDetalle`, que publican `ApiOrdenListItemDTO`/`ApiOrdenDetalleDTO`) y en `info.description`.
  El chequeo de tipos de R16 veta ahora también la clave `intentos` en `ApiOrden*`, `EtiquetaGuiaDTO`
  y `OrdenDTO`.
- `specs/160-badge-intentos-entrega/requirements.md`: nota bajo R31 y fila R31 de la trazabilidad.

## De dónde sale la descripción (código, no supuesto)
- `lib/types/manifiesto.ts`: `intentos: number`, no opcional; sin intentos se emite `0` (160/R28a).
- `lib/services/ManifiestoService.ts:194-211`: `contarIntentosEnLote` y `?? 0`.
- `lib/repositories/OrdenHistorialRepository.ts` (`whereIntentosVigentes`,
  `contarIntentosVigentesEnLoteCon`): resultados `novedad`, `reprogramado`,
  `devolucion_a_origen_por_rechazo` (`RESULTADOS_QUE_CUENTAN_COMO_INTENTO`), no anulada, de visita
  real, en cierre `aprobado`; un grupo por (orden, cierre).
- `app/api/ordenes/api-key/carga/route.ts:379-384`: el manifiesto se arma con
  `manifiestoOrdenIds` de la propia carga, órdenes recién creadas, por eso vale `0` ahí.

## Mapa R → test
| Pedido | Test |
|---|---|
| 1. Documentado en TS/YAML | `openapi-carga-claves-reales.guardia.test.ts` («consolidate…», «ManifiestoFila: mismas propiedades y mismo `required`») |
| 2. Guardia sin excepción: rojo sin doc | ídem (mutación M1) |
| 3. Solo en `ManifiestoFila` | `intentos-no-alcance.test.ts` (R31 enmendado: 3 casos + R16 de tipos) |
| 5. Guía SLT-80 verde | `guia-api-fuente-unica.guardia.test.ts` |

## Tests
`vitest run tests/unit/types/intentos-no-alcance.test.ts tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts tests/unit/guards/guia-api-fuente-unica.guardia.test.ts tests/unit/api`
→ `Test Files 40 passed (40) · Tests 504 passed (504)` (vía `con-desechable`, `servi_slt203_desechable`).

Mutaciones (script `mut203.cjs` del scratchpad, restauradas con `git checkout -- lib/api/openapi-spec.ts`):
- M1, quitar `intentos` de `ManifiestoFila` (propiedad + `required`) → `Tests 3 failed | 21 passed`:
  «consolidate…» (fila real 13 claves contra 12), «ManifiestoFila: mismas propiedades…» (YAML 13
  contra TS 12) y el control de `intentos-no-alcance`. ROJO.
- M2, meter `intentos: { type: "integer" }` en otro schema del canal (cayó en `CargaRequest`) →
  `Tests 1 failed | 7 passed`, `Received ["components.schemas.CargaRequest.properties.intentos"]`. ROJO.
- No mutado: el veto de tipos de R16 es de compilación (lo ve `tsc`, no vitest).

## Paso 6: fecha de despliegue de la entrada 2026-09-24 del CHANGELOG
**No se puede determinar con certeza: se deja «PENDIENTE».** El renombrado (`entregado`,
`pendienteConfirmacion`, `estadoNombre` en el spec; `git log -S`) ya está en el commit raíz
`86d70bf0` «Servi Logistic: punto de partida de la plataforma» (2026-10-22), que es el primer commit
de `git log origin/prod --first-parent` (`git merge-base --is-ancestor 86d70bf0 origin/prod` → sí).
Ningún merge a `origin/prod` lo introduce: el cambio llegó con la historia ya aplanada, así que la
historia no registra cuándo se desplegó. `ivaFulfillment` no es de esta entrada: es la del
2026-11-03 (`f6efb67e`, SLT-52). Queda la contradicción: la guía dice «ya está en producción» y el
CHANGELOG «PENDIENTE»; la fecha la tiene que dar Carlos.

## Gate
Ver el final de este archivo.

### Salida del gate rápido (`bash ./init.sh` vía `con-desechable`, `servi_slt203_desechable`)
- `✓ typecheck paso`, `✓ lint paso`.
- Guardias: 4 tandas de `Test Files 100 passed (100)` (1208, 1779, 1484 y 1477 + 1 skipped).
- `test:rapido`: `Test Files 2 passed (2) · Tests 20 passed (20)` (incluye `intentos-no-alcance.test.ts`);
  3 rojos heredados del baseline, ninguno de esta ficha. Baseline sin cambios.
- `== init OK ==` · **INIT_EXIT=0**.

Veredicto: contrato y docs publican `manifiesto.filas[].intentos`; guardias rojas sin la documentación y verdes con ella.

## Paso 6, resuelto (indicación del leader, 2026-11-18)
Para esta plataforma el renombrado está en producción desde su primer commit en `origin/prod`,
`86d70bf0` (2026-10-22); la entrada 2026-09-24 es anterior a la plataforma. El CHANGELOG pasa de
«PENDIENTE» a «en producción desde el primer despliegue de la plataforma (2026-10-22)». La guía
(§ bloque A: «Ya está en producción») no contradice y no se toca.

## Review (170d2652): hallazgos 2 y 3
- H2: la definición de `intentos` decía «visitas del mensajero», pero el conteo incluye también la
  gestión que registra la tienda desde una ayuda (`OrdenHistorialRepository.ts:230-233`). Ahora dice
  «visitas de entrega sin entrega, contadas una por cierre aprobado con al menos una gestión no
  anulada de resultado `novedad`, `reprogramado` o `devolucion_a_origen_por_rechazo`» en el spec TS,
  el YAML, Postman, la guía y el CHANGELOG.
- H3: quitada del CHANGELOG 2026-09-24 la frase «rompe a quien compare… con los códigos anteriores».
- Gate rápido: 4 × `Test Files 100 passed (100)` + `2 passed (2)`, `== init OK ==`, **INIT_EXIT=0**.
