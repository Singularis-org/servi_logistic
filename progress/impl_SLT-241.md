# SLT-241 «Moneda e impuesto del país en pantallas: tarifas, configuración y ranking» · bitácora de implementación

## Bloque 1 — Escritura de tarifas en el servidor (T1.1–T1.4, R5–R9) · backend_dev · 2026-11-21

### Archivos

Producción (modificados):
- `lib/types/tarifa-flexible.ts` — T1.1: `esquemasDeEscritura(impuesto)` interna y `escrituraValorSchemaDe(impuesto)`
  exportada; `escrituraCobroSchema`, `escrituraPagoSchema` y `escrituraValorSchema` = los de `IMPUESTO_ROTULO`
  (mismos mensajes con CR). Sin «IVA» fuera de comentarios.
- `lib/services/TarifaValorService.ts` — T1.2: `constructor(repo, impuestoNombre = IMPUESTO_ROTULO)`; el esquema
  se construye una vez en el constructor.
- `lib/repositories/TarifaValorRepository.ts` — T1.2: `constructor(prisma, impuestoNombre = IMPUESTO_ROTULO)` y
  `textoDelValor(v, impuesto)`. Sin «IVA» fuera de comentarios.
- `lib/tarifas/servicios.ts` — T1.2: `serviciosDeTarifas(prisma, impuestoNombre = IMPUESTO_ROTULO)` lo pasa al
  servicio y al repositorio de valores.
- `lib/actions/tarifas.ts` — T1.3: `guardarValoresTarifa`, sin `deps.servicio`, lee
  `paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService())` antes del bucle y construye
  `serviciosDeTarifas(getPrismaClient(), impuestoNombre)`. Las demás acciones, igual.
- `lib/repositories/_shared/resolver-tarifas.ts` — T1.4: el error de `aValorCobro` dice
  «no tiene % de impuesto (ivaPct)».

Tests:
- `tests/unit/services/tarifa-valor-service.test.ts` — casos nuevos de R5 y R6 al final (el resto, intacto).
- `tests/components/moneda-del-pais-tarifas.test.tsx` — **nuevo**: R7, R8 y el cableado de §9. Estructura por
  `describe` de requisito; los `vi.mock` del bloque 1 llaman por defecto a la implementación real, para que los
  bloques 2–5 añadan sus `describe` sin heredar dobles.

### Mapa R → test (bloque 1)

| R | Test |
|---|---|
| R5 | `tarifa-valor-service.test.ts` > «SLT-241 R5 — …» > «R5: un % de impuesto mal formado en un cobro dice «El IGV debe ser…»», «R5: un pago con % de impuesto dice «… no llevan IGV.»», «R5/R16: sin impuesto (y con «IVA») los mensajes son los de hoy…»; `moneda-del-pais-tarifas.test.tsx` > «§9/R5: el servicio de la fabrica valida con «IGV»» |
| R6 | `tarifa-valor-service.test.ts` > «SLT-241 R6 — …» > «R6: reemplazar un cobro deja «monto 1500.00 IGV 13.00» → «monto 1800.00 IGV 13.00»», «R6: quitar un cobro deja «IGV»…», «R6: un pago, sin % de impuesto, deja el mismo texto que hoy («monto 800.00»)»; `moneda-del-pais-tarifas.test.tsx` > «§9/R6: el repositorio de la fabrica es el real… escribe «IGV» en el historial» |
| R7 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R7 — …» > «R7: con tres cambios, `paraPantallas` se llama UNA vez…», «R7: la fabrica se construye UNA vez, con el cliente de la peticion y el impuesto del pais («IGV»)», «R7 (design §3): con el servicio inyectado no se lee el pais…», «R7 (design §10): sin sesion se rechaza antes de leer el pais»; «SLT-241 §9 — el fuente de `guardarValoresTarifa`…» (caso + 4 contrapruebas) |
| R8 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R8 — …» > «R8: `paraPantallas` lanza → la fabrica recibe IMPUESTO_ROTULO, el resultado es ok y el error queda en el log», «R8: sin empresa en la sesion → IMPUESTO_ROTULO, sin consultar el pais». País sin impuesto: `pais-para-pantallas.test.ts` (SLT-235) |
| R9 | `tarifas-flexibles-resolver.test.ts` sin tocarlo (se salta sin base local; corre en CI); `pais-sin-literales.guardia.test.ts` en verde cuando T5.2 quite la entrada |
| R16 (parte servidor) | «R5/R16…» y «§9/R16: sin impuesto, la fabrica cae al rotulo de la plataforma…»; `esquemas-escritura.test.ts`, `tarifa-schemas.test.ts`, `servicios-composicion.test.ts`, `tarifas-action.test.ts` y el resto de `tarifa-valor-service.test.ts` verdes sin tocarlos |

### Verificación (salida real, 2026-11-21)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0. Sin `NODE_OPTIONS`, tsc murió por
  memoria (exit 134).
- `pnpm run lint` → exit 0, `✖ 249 problems (0 errors, 249 warnings)`, ninguno en los archivos tocados
  (`eslint` sobre los 8 archivos: sin salida, exit 0).
- `vitest run tests/components/moneda-del-pais-tarifas.test.tsx tests/unit/services/tarifa-valor-service.test.ts`
  → `Test Files 2 passed (2)`, `Tests 126 passed (126)`.
- `vitest run` de los listados en «Hecho» (`esquemas-escritura`, `tarifa-schemas`, `servicios-composicion`,
  `tarifas-action`, `tarifas-flexibles-escritura`, `tarifa-activacion`, `tarifas-flexibles-resolver`) →
  `Test Files 4 passed | 3 skipped (7)`, `Tests 131 passed | 60 skipped`. Los 3 saltados son los de
  `tests/integration/db/`: no hay base local (`HAY_BASE_DE_DATOS`); corren en CI.
- `pais-sin-literales.guardia.test.ts` → **1 rojo esperado**: «la lista solo baja» pide quitar
  `TarifaValorRepository.ts`, `_shared/resolver-tarifas.ts` y `types/tarifa-flexible.ts`, que ya no tienen
  literales. Lo cierra T5.2 (bloque 5: quitar las entradas de SLT-241 y bajar `TOPE_EXCEPCIONES`); el
  archivo de excepciones no es de este bloque.

**Veredicto:** bloque 1 hecho (R5–R9 con test y en verde); queda el rojo de `pais-sin-literales` para T5.2.

## Bloque 3 — Configuración > Usuarios y ranking (T3.1–T3.2, R10–R11) · frontend_dev · 2026-11-21

### Archivos

Producción (modificados):
- `app/(app)/configuracion/_components/UsuariosModule.tsx` — T3.1: `textoAvisoZona(aviso, moneda)` con
  `formatearMontoEn(moneda, impacto.totalSinConsolidar)` (mismo marcador `-`); el componente lee `useMonedaDelPais()`.
- `app/(app)/ranking/_components/PremioInputRow.tsx` — T3.2: `formatearMontoEn(moneda, premio.monto, SIN_MONTO_RAYA)`
  con el hook.
- `app/(app)/ranking/_components/RankingPodio.tsx` — T3.2: el hook dentro de `EscalonPodio` (antes del retorno temprano).
- `app/(app)/ranking/historico/_components/RankingHistoricoModule.tsx` — T3.2: `columnasHistorico(moneda)` de módulo,
  montada con `useMemo(() => columnasHistorico(moneda), [moneda])`; `TarjetaHistorico` lee el hook.
- `app/(app)/ranking/_components/ranking-labels.ts` — T3.2: fuera el reexport de `money` (no lo importaba nadie más).

Tests:
- `tests/components/moneda-del-pais-tarifas.test.tsx` — al final, el bloque 3 (sus imports, junto a los demás;
  `vi.mock` de `@/lib/actions/usuarios`, `@/lib/actions/ranking` y `next/navigation`, que ningún otro bloque importa).
  Cada caso, con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor.

El typecheck no señaló otros llamantes de `textoAvisoZona` ni del `money` reexportado.

### Mapa R → test (bloque 3)

| R | Test |
|---|---|
| R10 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R10 — el aviso de impacto…» > «R10/R16/R17: con el pais de prueba «€»; con CR, lo mismo que sin proveedor…» |
| R11 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R11 — el ranking pinta el premio en la moneda del pais» > «R11/R16/R17: `RankingPodio`, el premio del escalon», «R11: `RankingPodio` sin premio no pinta importe», «R11/R16/R17: `PremioInputRow`, el monto del premio en solo lectura», «R11: `PremioInputRow` sin monto pinta «Sin premio asignado»», «R11/R16/R17: `RankingHistoricoModule` en escritorio, la celda del premio de la tabla», «R11: … en escritorio, sin premio la celda pinta la raya larga», «R11/R16/R17: … en el telefono, el premio de la tarjeta», «R11: … en el telefono, sin premio la tarjeta dice «Sin premio asignado»» |
| R16/R17 (bloque 3) | Los casos «R…/R16/R17» de arriba (CR = sin proveedor = moneda de la plataforma); `RankingPodio.test.tsx`, `RankingHistoricoModule.test.tsx`, `RankingModule.test.tsx`, `descarga/RankingHistoricoDescarga.test.tsx` y los 8 tests de Usuarios verdes sin tocarlos |

### Verificación (salida real, 2026-11-21)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- `pnpm run lint` → exit 0, `✖ 249 problems (0 errors, 249 warnings)`; `eslint` sobre los 6 archivos tocados →
  «No issues found».
- `vitest run tests/components/moneda-del-pais-tarifas.test.tsx` → `Test Files 1 passed (1)`, `Tests 23 passed (23)`.
- `vitest run` de `RankingPodio`, `RankingHistoricoModule`, `RankingModule`, `usuarios-aviso-zona` y
  `UsuariosTopePlan` → `Test Files 5 passed (5)`, `Tests 87 passed (87)`.
- `vitest run` de `descarga/RankingHistoricoDescarga`, `usuario-form`, `usuarios-columns`, `usuarios-filtros-def`,
  `usuarios-module`, `usuarios-nombre-no-imprimible`, `usuarios-restablecer` y `moneda-del-pais-pantallas` →
  `Test Files 8 passed (8)`, `Tests 202 passed (202)`.
- `pwa-mensajero-sin-recorte.guardia.test.ts` (nombra `PremioInputRow`) → `Tests 54 passed (54)`.

**Veredicto:** bloque 3 hecho (R10 y R11 con test y en verde, CR idéntico a sin proveedor); los 5 archivos entran
en el censo de R18 en T5.1.

## Bloque 4 — parte de lib/ (T4.1 completa, T4.2 sin los dos componentes) · backend_dev · 2026-11-21

Producción (modificados):
- `lib/types/plantilla-datos.ts` — T4.1: `MONTO_COBRAR_EJEMPLO = 12500` (fixture y catálogo); el `ejemplo` de
  `{{monto}}` es `formatearMontoEn(MONEDA_PLATAFORMA, MONTO_COBRAR_EJEMPLO)` (mismo texto con CR, R14/R15).
- `lib/utils/plantilla-mensaje.ts` — T4.1: `previewConEjemplos(cuerpo, zona?, moneda?)`. Sin moneda llama a
  `resolverValoresPlantilla` con tres argumentos, como antes: `preview-mismo-motor.test.ts` (sin tocar) espía la
  llamada con `toHaveBeenCalledWith(vars, fixture, undefined)` y un cuarto `undefined` lo ponía rojo.
- `lib/services/PlantillaMensajeService.ts` — T4.1: `monedaDeVistaPrevia?: () => Promise<FormatoMoneda>` en
  `PlantillaInformeDeps`; `preview` la pide solo con `necesitaMoneda(variables)`.
- `lib/actions/plantillas.ts` — T4.1: `buildPlantillaService` pasa `monedaDeVistaPrevia: async () => (await
  paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService())).moneda`.
- `lib/whatsapp-envios/informes/tipos.ts`, `catalogo.ts` — T4.2: `importeEjemplo?` en `VariableInforme` y
  `VariableCatalogo`.
- `lib/whatsapp-envios/informes/transito/informe.ts` — T4.2: `por_cobrar` con `importeEjemplo: "322900.00"` y
  `ejemplo: formatearMontoEn(MONEDA_PLATAFORMA, "322900.00")`.
- `lib/utils/vista-previa-informe.ts` — T4.2: `importeEjemplo?` en `VariableDeInforme`;
  `componerVistaPrevia(cuerpo, variables, valores, moneda)` (los dos últimos obligatorios): una variable con
  `importeEjemplo` se pinta con `formatearMontoEn(moneda, …)`; `valores[clave]` gana.

Tests:
- `tests/components/moneda-del-pais-tarifas.test.tsx` — bloque 4 al final (imports junto a los demás, bajo
  «// Bloque 4»): R12 (servicio, `previewConEjemplos`, ejemplo del catálogo), cableado de `buildPlantillaService`
  (lectura del fuente sin comentarios + 3 contrapruebas) y el caso puro de R13 sobre `componerVistaPrevia`.
  Cada caso con `MONEDA_DE_PRUEBA`, con `MONEDA_CR` y sin moneda (CR = sin moneda).

**Pendiente (frontend_dev):** `VistaPreviaMensaje.tsx` y `VariablesInsert.tsx` deben pasar `useMonedaDelPais()` a
`componerVistaPrevia` (y su tipo de `variables`, ganar `importeEjemplo?`); hasta entonces el typecheck falla en
ellos (abajo). El caso montado de R13 (`VistaPreviaMensaje` con el proveedor) va con esa parte. No apareció otro
llamante de `previewConEjemplos` ni de `componerVistaPrevia` fuera de «Archivos esperados» en producción (los de
tests llaman a `previewConEjemplos` con 1–2 argumentos y siguen compilando).

### Mapa R → test (bloque 4, parte lib/)

| R | Test |
|---|---|
| R12 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R12 — la vista previa de una plantilla de orden…» > «R12: con el pais de prueba, `Total {{monto}}` sale en «€», igual que el envio real…», «R12/R16/R17: con CR, el mismo texto que sin la dependencia», «R12: un cuerpo sin importe no pide la moneda», «R12: el alias `{{total}}`…», «R12/R16/R17: `previewConEjemplos(cuerpo, zona, moneda)`…»; «SLT-241 §9 — `buildPlantillaService` pasa la moneda del pais…» (+ 3 contrapruebas) |
| R13 | `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R13 — la vista previa de un informe…» > «R13: con el pais de prueba, `{{por_cobrar}}` sale «€322 900» y `{{vencidos}}` sigue «7»», «R13/R16/R17: con CR, el texto de siempre…», «R13: un valor dado gana…», «R13: solo `por_cobrar` lleva `importeEjemplo`…». Falta el caso montado (frontend_dev) |
| R14/R15 | Mismo archivo: «R14/R15: el ejemplo de `{{monto}}` del catalogo…» y «R14/R15: el `ejemplo` de `por_cobrar`…»; `plantilla-mensaje-utils.test.ts` y `catalogo-de-variables.test.ts` verdes sin tocarlos; la guardia ya marca `plantilla-datos.ts` e `informe.ts` sin literales (baja en T5.2) |

### Verificación (salida real, 2026-11-21)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 2, solo los dos componentes de frontend_dev:
  - `VistaPreviaMensaje.tsx(37,43): error TS2554: Expected 4 arguments, but got 3.`
  - `VariablesInsert.tsx(173,36): error TS2554: Expected 4 arguments, but got 2.`
- `pnpm run lint` → `✖ 249 problems (0 errors, 249 warnings)`; `eslint` sobre los 9 archivos tocados → sin salida, exit 0.
- `vitest run` de `moneda-del-pais-tarifas`, `plantilla-datos`, `preview-mismo-motor`, `preview-fecha-hora-zona`,
  `PlantillaMensajeService`, `plantillas-composition-root-474`, `plantilla-mensaje-utils`,
  `informe-transito-informe`, `catalogo-de-variables`, `VariablesInsert`, `ConfiguracionEnviosWhatsappPage`,
  `ConfiguracionPlantillasPage`, `campos-ocultos-siguen-resolviendo` y `pais-sin-literales.guardia` →
  `Test Files 1 failed | 13 passed (14)`, `Tests 1 failed | 373 passed (374)`. El rojo es el esperado de
  `pais-sin-literales` «la lista solo baja»: las 5 entradas de SLT-241 ya no tienen literales (se quitan en T5.2).
  `moneda-del-pais-tarifas.test.tsx` sola → `Tests 38 passed (38)`.

**Veredicto:** parte lib/ del bloque 4 hecha (R12 completo con cableado; R13 puro en verde); falta la parte de
pantalla de T4.2, que además devuelve el typecheck a verde.

- **T4.2, parte de pantalla (frontend_dev, 2026-11-21):** `VistaPreviaMensaje.tsx` y `VariablesInsert.tsx` leen `useMonedaDelPais()` y la pasan a `componerVistaPrevia` (tipo de `variables` → `VariableDeInforme`). Caso montado de R13 en `moneda-del-pais-tarifas.test.tsx` > «SLT-241 R13 — montado: `VistaPreviaMensaje` y `VariablesInsert` pintan el importe en la moneda del pais» (`it.each` de las dos pantallas: prueba → `Por cobrar €322 900, vencidos 7`; CR = sin proveedor = moneda de la plataforma). Verificación: typecheck exit 0; lint `✖ 249 problems (0 errors, 249 warnings)`, exit 0, y eslint de los 3 archivos sin avisos; vitest de `moneda-del-pais-tarifas` + `informe-transito-informe`, `catalogo-de-variables`, `VariablesInsert`, `ConfiguracionEnviosWhatsappPage`, `ConfiguracionPlantillasPage` → `Test Files 6 passed (6)`, `Tests 88 passed (88)`. T4.2 completa.

## Bloque 2 — Pantalla de Tarifas (T2.1–T2.2, R1–R4) · frontend_dev · 2026-11-21

### Archivos

Producción (modificados):
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` — T2.1: sin `money` ni `monedaConfig`.
  `etiquetaModo(modo, moneda)`, `porcentajeParaVer(valor, moneda)`, `textoReferencia(ref, moneda, impuesto)`,
  `textoValorSinIva(v, moneda)`, `textoValor(v, moneda, impuesto)`; los importes con
  `formatearMontoEn(moneda, x, SIN_MONTO_RAYA)`. `textosDelImpuesto(impuesto)` con las 7 entradas que salen de
  `TEXTOS` (`colIva`, `ivaDe`, `notaMensajero`, `notaSatelite`, `ivaObligatorio`, `mensajerosBase`, `sinIva`).
  Decisión del leader: además `porcentajeParaVerEnLaPlataforma(valor)` = `porcentajeParaVer(valor, MONEDA_PLATAFORMA)`.
- `app/(app)/configuracion/tarifas/_components/tarifas-borrador.ts` — T2.1: `planDeGuardado(editadas, columnas, impuesto)`;
  el error es `textosDelImpuesto(impuesto).impuestoObligatorio`.
- `TarifasValores.tsx`, `TarifasVehiculo.tsx`, `TarifasGrupos.tsx`, `TarifasMensajeros.tsx`, `TarifasTiendas.tsx`,
  `TarifaMensajeroDialogo.tsx` — T2.2: leen `useMonedaDelPais()` / `useImpuestoDelPais()` una vez y los pasan; las
  auxiliares de módulo (`notaDe`, `resumenDeActor`, `valorDe`, `flete`) reciben la moneda (o `ti`) por argumento.
  `TarifasVehiculo` deja `monedaConfig`: `TEXTOS.enMonto(moneda.simbolo)`.
- `components/private/cierres/fila/fila-gestion-labels.ts` — solo el import y el nombre en sus 3 llamadas:
  `porcentajeParaVerEnLaPlataforma` (sin cambio visible; el «IVA» y `money` siguen igual).

Tests:
- `tests/components/TarifasMensajeros.test.tsx` — sus 4 llamadas a `planDeGuardado` pasan `IMPUESTO_ROTULO`
  (+ el import); ningún valor esperado cambia.
- `tests/components/moneda-del-pais-tarifas.test.tsx` — al final, el bloque 2: casos puros (T2.1), montados (T2.2) y
  el censo «sin IVA» de los 8 archivos con 2 contrapruebas. Imports del bloque junto a los demás.

El typecheck no señaló otros llamantes fuera de «Archivos esperados».

### Mapa R → test (bloque 2), todo en `moneda-del-pais-tarifas.test.tsx`

| R | Test |
|---|---|
| R1 | «SLT-241 R1 — `tarifas-textos`…» (4 casos: «€1 801», «Hoy rige»/«Varía» en €, raya larga sin importe, CR = plataforma); montados: «`TarifasValores`» > «R1/R16/R17: el valor guardado…», «R1/R4: «Hoy rige»…»; «`TarifasVehiculo`» > «R1/R16/R17: el valor de un vehiculo…», «R1: «Hoy rige» de la celda…»; «`TarifasGrupos`» (flete y resumen del mensajero); «`TarifasTiendas`»; «`TarifasMensajeros`…» > «R1/R16/R17: el valor propio…» |
| R2 | «SLT-241 R2 — `etiquetaModo`…» (2); montados: «R2: la columna Modo… «Monto €»» (`TarifasValores`), «R2: «En €» bajo una celda…» (`TarifasVehiculo`), «R2: el selector de modo del dialogo ofrece «Monto €»» |
| R3 | «SLT-241 R3 — `porcentajeParaVer`…» (punto con prueba, coma con CR, valor en % y % del impuesto, CR = plataforma) |
| R4 | «SLT-241 R4 — `textosDelImpuesto` y `planDeGuardado`…» (7 entradas con «IGV», las de siempre con «IVA», «+ 13 % IGV», aviso obligatorio); montados: encabezado «IGV», etiqueta accesible «IGV de …», notas «Sin IGV» de mensajero y satélite, flete del grupo, base del %, nota del diálogo; censo «sin IVA» de los 8 archivos + 2 contrapruebas |
| R16/R17 (bloque 2) | Cada caso montado compara CR con sin proveedor (`compruebaLosTresMontajes`, `compruebaElImpuesto`); los puros comparan CR con `MONEDA_PLATAFORMA` / `IMPUESTO_ROTULO`; los 10 archivos `tests/components/Tarifas*.test.tsx` verdes (9 sin tocar) |
| R18 (cierres) | «R18: `porcentajeParaVerEnLaPlataforma`…»; tests de cierres que importan `fila-gestion-labels` verdes sin tocarlos |

### Verificación (salida real, 2026-11-21, `NODE_OPTIONS=--max-old-space-size=8192`)

- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → exit 0, `✖ 249 problems (0 errors, 249 warnings)` (los mismos 249 de antes); `eslint` sobre
  los 10 archivos tocados → «No issues found», exit 0.
- `vitest run tests/components/moneda-del-pais-tarifas.test.tsx` → `Test Files 1 passed (1)`, `Tests 82 passed (82)`.
- `vitest run` de `TarifasMensajeros`, `TarifasValores`, `TarifasVehiculo`, `TarifasGrupos`, `TarifasTiendas`,
  `TarifasModulo`, `TarifasFulfillmentSoloTienda`, `TarifasDisposicion` (Hecho de T2.1/T2.2) + los que importan
  `fila-gestion-labels` (`cierres-trato-tu.guardia`, `liquidacion-money-safe`, `pwa-mensajero-sin-recorte.guardia`,
  `fila-gestion-vista`) + `FilaGestion` → `Test Files 13 passed (13)`, `Tests 514 passed (514)`.
- `TarifasActivar` y `TarifasTopeIntentos` (también importan `tarifas-textos`) → `Test Files 2 passed (2)`, `Tests 35 passed (35)`.
- `pais-sin-literales` no se corrió: rojo esperado hasta T5.2.

**Veredicto:** bloque 2 hecho (T2.1 y T2.2; R1–R4 con test y en verde); los tests de Tarifas y de cierres, verdes sin cambiar valores.
