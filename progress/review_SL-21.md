# Review SL-21 «Moneda e impuestos configurables por país» — vuelta 1

> reviewer · 2026-11-20 · PR #262 · rama `feature/SL-21-moneda-impuestos-configurables` (HEAD 79b20a78)
> Ruta completa (dinero, impuestos, esquema): correcta para el diff.
> Grafo: no consultado; se revisó con Grep/Read y `git diff origin/dev...HEAD`.

## Verificación ejecutada por el reviewer
- `pnpm run typecheck` → verde.
- `eslint` sobre los `.ts/.tsx` del diff → 0 errores, 1 warning.
- `vitest run` por archivo (NODE_OPTIONS=--max-old-space-size=8192):
  - `moneda-formato-pais`, guardia 359 (`dinero-centimos-cuando-existen`), `pais-sin-literales`,
    `reglas-pais-empresa-service`, `whatsapp-moneda-por-pais` e `informe-moneda-por-pais` → 6 archivos, 127 passed.
  - `etiquetas-lote-pdf-service`, `factura-moneda-plataforma`, `organizacion-service-pais`,
    `monto-cobrar-por-pais`, `whatsapp-envio-valores` e `informe-transito-pdf` → 6 archivos, 92 passed.
  - Integración con base: `pais-moneda-impuesto`, `migracion-sl21-ida-y-vuelta`, `organizacion-alta`,
    `pais-repositorio` y `moneda-formato-pais` (bloque de integración) → 5 archivos, 47 passed, ninguno saltado.
- No corrí: la suite completa, `vitest related` ni playwright (la memoria de la máquina no da; lo corre el CI).
- CI del PR al revisar: `estatico`, `e2e (aislamiento)` y `e2e (reparto)` en verde; `e2e (dinero)` y
  los 3 shards de vitest sin terminar.

## Checklist
- [x] **Trazabilidad.** R1–R22 tienen test concreto en `progress/impl_SL-21.md > Cierre`. Revisé que los
  tests de R2 (17 casos 23514), R3 (ida, vuelta y reaplicar), R4 (42501), R6/R7, R10/R11 (moneda que lanza
  y espía), R12/R13, R14, R15, R17 y R21 aserten de verdad y no estén vacíos.
- [x] **Tasks.** `tasks.md` sin `[ ]`.
- [x] **Tamaño.** Por encima del tope, con la línea `tamano-pr-aceptado` en `progress/features/SL-21.md`; no se marca.
- [x] **Lo que ya existe.** `design.md` abre con la sección y la búsqueda. El diff amplía `lib/config/moneda.ts`,
  el puerto `IReglasPaisEmpresa`, `paisIncompleto` y la guardia `pais-sin-literales`; no re-crea nada.
- [x] **Migración.** `20261124120000_sl21_pais_moneda_impuesto` trae `down.sql`. Las seis columnas son NULL-ables.
  Tiene los 8 CHECK de R2 (todo o nada, ISO `^[A-Z]{3}$`, **decimales `BETWEEN 0 AND 2`**, decimal `.`/`,`,
  separadores distintos, miles de 1 carácter, símbolo de 1 a 5 y nombre del impuesto de 1 a 20 con `btrim`).
  El `UPDATE` toca solo CR y solo esas columnas, y aborta si no existe CR. El `down.sql` borra solo lo que creó.
  No hay columna de tasa. Ninguna migración aplicada se editó; el renombre se hizo antes de mergear.
- [x] **RLS / `organizacion_id`.** No hay tabla nueva. `pais` hereda `pais_lectura` y el REVOKE de SL-20 (R4 probado).
- [x] **Costa Rica idéntica (R9, R16).**
  - `MONEDA_PLATAFORMA` sale de `monedaConfig` con escala 2. Ningún entorno ni doc fija `MONEDA_*`, y `MONEDA_CR`
    (fila migrada) = `MONEDA_PLATAFORMA` con el env vacío, probado contra Postgres.
  - Los seis formateadores de siempre delegan en `formatearMontoEn(MONEDA_PLATAFORMA, …)` con el mismo `sinMonto`.
  - Los tests existentes de tránsito, PDF de tránsito, plantillas y etiquetas solo cambian el montaje (pasan
    `MONEDA_CR`), no los valores esperados.
  - Facturas de planes: `notaMoneda`, `importeDocumento`, `textoDelCobroVigente` y el correo usan
    `MONEDA_DE_LOS_PLANES` (= plataforma) con el mismo `SIN_MONTO_RAYA` que el `money()` de antes.
- [x] **Alta de empresa (R17).** `paisIncompleto` exige `moneda` e `impuestoNombre`; responde `validation_error`
  en `paisId`. Probado en unit y en integración.
- [x] **Lectura perezosa (R11, R13).**
  - Chat (acción y servicio) y bienvenida leen `moneda()` solo si `necesitaMoneda(variables)`.
  - `EjecucionEnvioService` pasa `moneda` como función y solo tránsito la invoca, después del corte de «vacío».
  - `EtiquetasLotePdfService` la lee tras comprobar que hay etiquetas y antes de `build`/`upload`.
  - `PaisSinMoneda` sale sin enviar ni subir nada (R6).
- [x] **R21.** Las 3 rutas de API construyen `EtiquetasLotePdfService` con `construirReglasPaisEmpresa(prisma)`.
  La guardia lo censa como receptor.
- [x] **R19.** `lib/api/openapi-spec.ts` fuera del diff; no se renombra ningún enum ni concepto con «iva».
- [x] typecheck y lint sin errores (corridos aquí).
- [ ] **`gate-completo` en CI:** sin terminar al revisar (vitest ×3 y `e2e (dinero)` pendientes). Es condición de merge.
- [~] **E2E afectados (perfil reviewer: «PR que toca db/ o dinero sin constancia de los E2E afectados»).**
  No se corrieron en local; el leader lo pidió por memoria (`MEMORY.md > Gate en CI, no local`). La constancia
  la dan los jobs `e2e` del CI de este PR: `aislamiento` y `reparto` en verde, `dinero` pendiente. Ver hallazgo 1.
- [x] Sin dependencias nuevas, sin secretos, sin Ordenex, sin webhooks nuevos.
- [x] **Guardia `pais-sin-literales` (R20).**
  - Detecta «₡», `\bCRC\b`, `\bIVA\b` e imports (también re-exports, alias y multilínea) de los 7 formateadores
    implícitos, sin mirar comentarios. Tiene autocomprobación de positivos y falsos positivos.
  - Las 12 excepciones nuevas llevan ficha y motivo. Solo `openapi-spec.ts` es `permanente`, con fecha y respaldo
    en la decisión cerrada «La OpenAPI se queda como está». El test exige fecha a cualquier `permanente`.
  - El tope de 20 es el recuento exacto (8 + 12). Confirmé por grep que ningún archivo de servidor fuera de la
    lista llama a esos formateadores.

## Desviaciones del implementer (juicio)
- **`toFixed(ESCALA)` en `formatearMontoEn` con `number`.** No rompe R8: los importes son DECIMAL(12,2), así que
  serializar a 2 es exacto y el cuadre a la escala de la moneda lo hace la cadena, con el medio alejándose del cero.
  Con escala 2 es idéntico a antes. Con 0 decimales cabe un doble redondeo solo si entrara un `number` con más
  de 2 decimales, cosa que hoy no pasa. OK.
- **`formatearTopeEn` sin exportar.** Ningún R pide un tope por país; así se evita un octavo camino en la 359. OK.
- **`buildEtiquetasLotePdf(etiquetas, moneda = MONEDA_PLATAFORMA)`.** El único llamante de servidor
  (`EtiquetasLotePdfService`) pasa siempre la moneda y lanza si no tiene puerto. El default solo lo alcanzaría
  un llamante nuevo. No rompe R14. OK (ver hallazgo 3).
- **Migración renombrada a `20261124120000`.** Necesario por la colisión con `slt221`; no estaba aplicada en
  ningún entorno compartido. Tests de recuento al día. OK.

## Hallazgos

1. **menor (condición de merge, no del código).** No hay E2E local. La regla del perfil del reviewer lo marca como
   bloqueante, pero aquí la constancia la dan los jobs `e2e` del CI del mismo PR (decisión del humano «gate en
   CI»). Sin cambio en el código: no se avisa «listo para mergear» hasta que `e2e (dinero)` y los 3 shards de
   vitest (`gate-completo`) salgan en verde. Si `e2e (dinero)` sale rojo, vuelve al implementer.

2. **menor. `PlantillaMensajeService.preview` y `resolverValoresOrden` caen en `moneda ?? MONEDA_PLATAFORMA`.**
   - Respuesta a la pregunta del implementer: **no rompe ningún R de SL-21**.
     - R10 enumera los tres envíos (acción del chat, bienvenida y reintento del servicio), y los tres pasan la
       moneda del país.
     - `preview` pinta `DATOS_PLANTILLA_EJEMPLO` para quien edita la plantilla; la decisión cerrada manda la
       «vista previa de plantillas» a SLT-235.
     - `resolverValoresOrden` no tiene llamantes de producción (solo `tests/unit/utils/whatsapp-envio-valores.test.ts`).
   - **No basta con dejarlo implícito en SLT-235 «Moneda e impuesto del país en las pantallas de la empresa»:**
     - su `requirements.md` (R13) habla de la vista previa **del navegador** y no nombra
       `PlantillaMensajeService.preview`, que es servidor;
     - el `??` de `plantilla-datos.ts` es justo la caída silenciosa que el design §10 descarta («un job… pintaría
       en silencio con la moneda equivocada»), y la guardia no la ve porque el censo es por archivo.
   - Qué pido, sin cambiar el código de SL-21:
     - (a) el leader anota `PlantillaMensajeService.preview` en el spec de SLT-235 (R13 o «Lo que no entra» con su ficha);
     - (b) `resolverValoresOrden` se borra o se le exige la moneda en la ficha que toque `whatsapp-envio-valores.ts`
       (hoy es código muerto que, si alguien lo cablea, enviaría en la moneda de la plataforma).
   - Si el humano prefiere cerrarlo aquí: basta con hacer `moneda` obligatoria en `valorDeCampo`/`resolverValoresPlantilla`
     cuando `necesitaMoneda` (que lance sin ella) y que la preview del navegador pase `MONEDA_PLATAFORMA` de forma explícita.

3. **menor. Defaults a la moneda de la plataforma en el dibujo de etiquetas.** `drawEtiqueta`, `datosDeEtiqueta`,
   `textosConFuenteEmbebida` y `buildEtiquetasLotePdf` aceptan `moneda` opcional y caen a `MONEDA_PLATAFORMA`; lo
   necesita el generador del navegador (`app/(app)/ordenes/_components/etiquetas-pdf.ts`, SLT-235). Está bien acotado
   hoy porque el servicio de servidor lanza sin puerto. Lo dejo anotado para que SLT-235 vuelva obligatorio el parámetro.

4. **menor. Dos excepciones apuntan a una ficha que hoy no las retira.** `lib/types/plantilla-datos.ts` (ejemplo
   «₡12.500») y `lib/whatsapp-envios/informes/transito/informe.ts` (ejemplo «₡322.900») van a nombre de SLT-235,
   pero su spec (P2, abierta) dice que ninguna rebanada las nombra y propone SLT-241 o `permanente`. La guardia
   no falla por esto. Que el humano cierre P2 en SLT-235 y la entrada cambie de ficha allí. Lo mismo vale para las
   entradas SLT-235 de pantallas que reparte entre SLT-240…246 (`metrics.ts`, `AnaliticaFinancieraService.ts`,
   `TarifaValorRepository.ts`, etc.): su spec ya dice que cada rebanada las mueve.

5. **menor. La excepción `lib/config/moneda.ts` → SLT-237 «Planes: precio por moneda del país».** Los valores
   por defecto `CRC`/«₡» de `loadMonedaConfig` seguirán siendo la moneda de la plataforma (pantallas sin país,
   fallback) incluso después de SLT-237. Es probable que acabe `permanente`; no bloquea.

6. **menor. Solo `MONTO` tiene `usaMoneda`.** Hoy es el único campo con `transform: dinero` del catálogo. Un campo
   de dinero nuevo sin `usaMoneda: true` caería en la moneda de la plataforma sin aviso. Basta con que `definir`
   lo derive cuando `transform === dinero`, o con un test de catálogo; queda para quien añada el siguiente campo.

## Veredicto
**OK**. Ningún hallazgo bloqueante en el código. Condición de merge: `gate-completo` y `e2e (dinero)` en verde en
el CI del PR #262 (hallazgo 1). Los hallazgos 2 a 6 son menores y van como deuda a SLT-235 «Moneda e impuesto del
país en las pantallas de la empresa» y a la ficha que toque `whatsapp-envio-valores.ts`.
