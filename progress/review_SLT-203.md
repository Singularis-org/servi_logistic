# Review SLT-203 «API: publicar los intentos de entrega en la respuesta de la carga»

PR #237 · HEAD revisado `54c983e7` (= head del PR en GitHub) · diff `origin/dev...HEAD` completo.
Ruta directa (contrato externo): se revisa el diff entero. Decisión de Carlos (2026-11-18):
publicar `manifiesto.filas[].intentos` de `POST /api/ordenes/api-key/carga`, enmendando 160/R31
solo para ese campo.

## Checklist

- [x] **1. Lo documentado coincide con lo que la ruta envía.**
  - Tipo `integer`, `minimum: 0`, obligatorio y nunca `null`. Viene de `lib/types/manifiesto.ts:81`
    (`intentos: number`, no opcional) y de `lib/services/ManifiestoService.ts:211`
    (`intentos.get(row.id) ?? 0`), que pasa por `toFilaDTO` (`ManifiestoService.ts:256`).
  - Significado: `contarIntentosEnLote` (`ManifiestoService.ts:194`) llega a
    `lib/repositories/OrdenHistorialRepository.ts:269-281`, que hace un `groupBy (ordenId, cierreId)`,
    es decir, cuenta una vez por cierre. Filtra con `whereIntentosVigentes` (`:200-234`): el
    resultado está en `RESULTADOS_QUE_CUENTAN_COMO_INTENTO` = `devolucion_a_origen_por_rechazo`,
    `novedad`, `reprogramado` (`lib/types/orden-historial.ts:259-263`), `anuladaAt: null`, cierre
    `aprobado`, y la gestión nace de una visita real. Coincide con «contadas una por cierre aprobado;
    una gestión anulada o cuyo cierre no se aprobó no cuenta».
  - Vale 0 en la carga: `app/api/ordenes/api-key/carga/route.ts:381-383` arma el manifiesto con
    `cargaResult.manifiestoOrdenIds`, que son las órdenes recién creadas del lote.
- [x] **2. La guardia de SLT-201 ya no tiene excepción y da rojo sin documentación.**
  `FUERA_DEL_CONTRATO_FILA_MANIFIESTO` y `sinExcepciones` desaparecen; la fila se compara con
  `props("ManifiestoFila")` tal cual. Repetí las mutaciones en el árbol real y las restauré con
  `git checkout --`:
  - **M-A: quitar `intentos` (propiedad y `required`) de `ManifiestoFila` en `openapi-spec.ts`.**
    Da 3 rojos: guardia SLT-201 R2 «consolidate…», SLT-201 R4 «ManifiestoFila: mismas propiedades
    y mismo `required`» (el YAML ya no coincide) y el control de `intentos-no-alcance.test.ts`.
  - **M-B: meter `intentos: { type: "integer" }` en `OrdenDetalle` (que publica
    `ApiOrdenDetalleDTO`) del spec real.** Da rojo en «la especificacion OpenAPI no menciona los
    intentos fuera de `ManifiestoFila`», con la ruta
    `components.schemas.OrdenDetalle.allOf[1].properties.intentos`.
  - **M-B': `intentos?: number` en `ApiOrdenListItemDTO` (`lib/types/api-orden.ts`).** `tsc`
    da 2 errores TS2322 en `intentos-no-alcance.test.ts:121-122` (list y detalle, que hereda).
    vitest no lo ve porque no hace typecheck; lo para el typecheck del gate.
  - Sin mutar: 24/24 verdes en los dos archivos.
- [x] **3. Sin cambio de comportamiento.** Fuera de docs y tests, el diff solo toca
  `lib/api/openapi-spec.ts`: el schema, el ejemplo (`satisfies ManifiestoFilaDTO`, que es solo de
  tipos) y comentarios. No toca `app/`.
- [x] **4. Guía SLT-80.** Verdes `guia-api-fuente-unica.guardia`, `guia-api-descargas` (genera el
  PDF real: 200, `application/pdf`, empieza por `%PDF-`), `docs-marca-heredada.guardia`,
  `asistente-sin-frontmatter.guardia` y `openapi-466-descripciones`: 5 archivos, 93 tests.
- [x] **5. CHANGELOG 2026-09-24.** `86d70bf0` («Servi Logistic: punto de partida de la plataforma»,
  2026-10-22) es commit raíz (sin padres), es el primero de `origin/prod` en `--first-parent` y ya
  contiene el renombrado (`lib/types/order-status.ts:179-182`: `devuelta→novedad`,
  `reprogramada→reprogramado`, `rechazada→devolucion_a_origen_por_rechazo`). Ninguna línea añadida
  nombra otro producto (busqué ordenex, ecom, shopify, dropi y singularis: 0 coincidencias).
- [x] **6. Enmienda de 160/R31.** El texto original de R31 queda intacto y la nota va debajo. La
  única línea borrada es la fila R31 de la trazabilidad, que se reescribe ampliada.
- [x] Tamaño: 7/40 archivos, 67/1000 de producción, 98/3000 de tests.
- [x] Lint de los 3 `.ts` tocados: sin problemas. Typecheck: el árbol mutado solo dio los 2 errores
  provocados, así que el árbol limpio no tiene errores.
- [x] Ruta directa: el «test que fallaba antes» existe. M-A reproduce el estado de `origin/dev` y
  pone rojos la guardia y el control. La bitácora tiene el mapa pedido → test.
- [x] Reglas del proyecto (`perfil-agentes > reviewer`): no hay literales de país o moneda en
  código nuevo ni referencias a Ordenex, no hay dependencias nuevas y no toca `db/`, pantallas ni
  dinero.
- [x] El YAML es espejo del TS: propiedad, `required`, los dos ejemplos y la descripción son
  idénticos.

## Hallazgos

1. **menor — suelo de ruta.** `docs/specs.md > Tres rutas` pide la ruta completa si el diff toca
   «integraciones externas». El canal de API key es el contrato con los integradores, pero aquí
   solo cambia la documentación del contrato (sin runtime, sin endpoint nuevo, un campo que la ruta
   ya enviaba). Lo decidió Carlos y su enmienda está escrita bajo 160/R31. No lo marco bloqueante.
   Si el leader o Carlos leen la regla en sentido estricto (cualquier cambio de contrato externo),
   la ficha debe subir de ruta.
2. **menor — «visitas del mensajero».** La descripción dice «visitas del mensajero», pero
   `whereIntentosVigentes` (`OrdenHistorialRepository.ts:230-233`) también cuenta la vía
   `gestion_registrada` de la tienda desde una ayuda. Para el integrador es la misma idea (una
   visita real a la calle) y no cambia el número que ve en la carga, que siempre es 0. Si se
   quiere afinar: «visitas de entrega».
3. **menor — CHANGELOG 2026-09-24.** «Rompe a quien compare… con los códigos anteriores»: como la
   plataforma nació en `86d70bf0` ya con los códigos nuevos, ningún integrador de esta plataforma
   vio los anteriores en producción. La frase es correcta pero sobra. No hace falta tocarla.

## Veredicto

**OK.** No hay bloqueantes. Los menores no piden vuelta.
