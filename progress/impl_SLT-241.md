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
