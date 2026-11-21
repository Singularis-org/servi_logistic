# SLT-241 — Moneda e impuesto del país en pantallas: tarifas, configuración y ranking · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio **y** `pnpm run typecheck` está en
> verde. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Cada task de pantalla añade sus
> casos a `tests/components/moneda-del-pais-tarifas.test.tsx` (archivo nuevo, lo crea la primera que
> llegue). Cada caso se prueba con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor:
> con CR el texto debe ser el mismo que sin proveedor (R16, R17). Los tests existentes que solo cambian
> la forma de llamar **no cambian ningún valor esperado**.

## Bloque 1 — Escritura de tarifas en el servidor (R5–R9)

- [x] **T1.1** `lib/types/tarifa-flexible.ts`: `escrituraValorSchemaDe(impuesto)` y los tres esquemas
  de siempre construidos con `IMPUESTO_ROTULO` (design §5.1). Sin «IVA» fuera de comentarios.
  - *Hecho:* `esquemas-escritura.test.ts` y `tarifa-schemas.test.ts` verdes sin tocarlos.
- [x] **T1.2** Servicio, repositorio y fábrica (design §5.2). Depende de T1.1.
  - `TarifaValorService(repo, impuestoNombre = IMPUESTO_ROTULO)` valida con
    `escrituraValorSchemaDe(impuestoNombre)`.
  - `TarifaValorRepository(prisma, impuestoNombre = IMPUESTO_ROTULO)` y `textoDelValor(v, impuesto)`.
  - `serviciosDeTarifas(prisma, impuestoNombre = IMPUESTO_ROTULO)` lo pasa a los dos.
  - En `tests/unit/services/tarifa-valor-service.test.ts`: los casos de R5 (mensajes con «IGV») y de
    R6 (historial `"monto 1500.00 IGV 13.00"`, un pago sin impuesto).
  - *Hecho:* esos casos en verde; el resto del archivo, `tarifas-flexibles-escritura.test.ts`,
    `tarifa-activacion.test.ts`, `servicios-composicion.test.ts` y `tarifas-action.test.ts` verdes sin
    tocarlos.
- [x] **T1.3** `lib/actions/tarifas.ts > guardarValoresTarifa`: sin `deps.servicio`, lee el país con
  `paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService())` antes del bucle y
  construye `serviciosDeTarifas(getPrismaClient(), impuestoNombre)` (design §3, §5.2). Depende de T1.2.
  - En `moneda-del-pais-tarifas.test.tsx`: los casos de R7 y R8 y el cableado de §9 (fuente de la
    acción y `serviciosDeTarifas(prisma, "IGV")` hasta el servicio y el repositorio).
  - *Hecho:* en verde; `tarifas-action.test.ts` verde sin tocarlo.
- [x] **T1.4** [P] `lib/repositories/_shared/resolver-tarifas.ts`: el error de `aValorCobro` nombra la
  columna, no un impuesto (R9, design §6).
  - *Hecho:* `tarifas-flexibles-resolver.test.ts` verde sin tocarlo y el archivo sin «IVA» fuera de
    comentarios.

## Bloque 2 — Pantalla de Tarifas (R1–R4) (puede ir en paralelo con el bloque 1)

- [x] **T2.1** `tarifas-textos.ts`: `etiquetaModo`, `porcentajeParaVer`, `textoReferencia`,
  `textoValorSinIva` y `textoValor` reciben la moneda (y el impuesto); `textosDelImpuesto(impuesto)`
  con las 7 entradas que hoy dicen «IVA»; sin `money` ni `monedaConfig` (design §4.1).
  `tarifas-borrador.ts`: `planDeGuardado(editadas, columnas, impuesto)`.
  - `tests/components/TarifasMensajeros.test.tsx`: sus 4 llamadas a `planDeGuardado` pasan
    `IMPUESTO_ROTULO`; ningún valor esperado cambia.
  - Casos puros de R1–R4 en `moneda-del-pais-tarifas.test.tsx`.
  - *Hecho:* en verde.
- [x] **T2.2** Componentes de la pantalla (design §4.2). Depende de T2.1.
  - `TarifasValores.tsx`, `TarifasVehiculo.tsx`, `TarifasGrupos.tsx`, `TarifasMensajeros.tsx`,
    `TarifasTiendas.tsx` y `TarifaMensajeroDialogo.tsx` leen los hooks y los pasan.
  - Casos montados de R1, R2 y R4 en `moneda-del-pais-tarifas.test.tsx`, y el censo «sin IVA» de los 8
    archivos con su contraprueba.
  - *Hecho:* en verde. Siguen verdes sin tocarlos `TarifasValores.test.tsx`, `TarifasVehiculo.test.tsx`,
    `TarifasGrupos.test.tsx`, `TarifasTiendas.test.tsx`, `TarifasModulo.test.tsx`,
    `TarifasFulfillmentSoloTienda.test.tsx` y `TarifasDisposicion.test.tsx` (13 archivos, sin ₡).

## Bloque 3 — Configuración > Usuarios y ranking (R10, R11) (en paralelo con los bloques 1 y 2)

- [x] **T3.1** [P] `UsuariosModule.tsx`: `textoAvisoZona(aviso, moneda)` con `formatearMontoEn` (R10,
  design §7).
  - *Hecho:* caso de R10 en verde; los tests de Usuarios, verdes sin tocarlos.
- [x] **T3.2** [P] Ranking: `PremioInputRow.tsx`, `RankingPodio.tsx` y `RankingHistoricoModule.tsx`
  (`columnasHistorico(moneda)` con `useMemo`) con el hook; se borra el reexport de `money` de
  `ranking-labels.ts` (R11, design §7).
  - *Hecho:* casos de R11 en verde; `RankingPodio.test.tsx`, `RankingHistoricoModule.test.tsx`,
    `RankingModule.test.tsx` y `RankingHistoricoDescarga.test.tsx` verdes sin tocarlos.

## Bloque 4 — Ejemplos de plantillas e informes (R12–R15) (en paralelo con los bloques 1–3)

- [x] **T4.1** [P] Plantillas de orden (design §8.1, §8.2).
  - `plantilla-datos.ts`: `MONTO_COBRAR_EJEMPLO` y el `ejemplo` de `monto` desde el formateador.
  - `plantilla-mensaje.ts`: `previewConEjemplos(cuerpo, zona?, moneda?)`.
  - `PlantillaMensajeService.ts`: `monedaDeVistaPrevia?` en `PlantillaInformeDeps`, pedida solo con
    `necesitaMoneda`.
  - `lib/actions/plantillas.ts > buildPlantillaService` la pasa con `paisParaPantallasDelActor`.
  - Casos de R12 y su cableado en `moneda-del-pais-tarifas.test.tsx`.
  - *Hecho:* en verde; `plantilla-datos.test.ts`, `preview-mismo-motor.test.ts`,
    `preview-fecha-hora-zona.test.ts`, `PlantillaMensajeService.test.ts`,
    `plantillas-composition-root-474.test.ts` y `plantilla-mensaje-utils.test.ts` verdes sin tocarlos.
- [x] **T4.2** [P] Informes (design §8.3).
  - `importeEjemplo?` en `VariableInforme` (`tipos.ts`), `VariableCatalogo` (`catalogo.ts`) y
    `VariableDeInforme` (`vista-previa-informe.ts`).
  - `transito/informe.ts`: `por_cobrar` con `importeEjemplo` y `ejemplo` desde el formateador.
  - `componerVistaPrevia(cuerpo, variables, valores, moneda)`.
  - `VistaPreviaMensaje.tsx` y `VariablesInsert.tsx` le pasan `useMonedaDelPais()`.
  - Caso de R13 en `moneda-del-pais-tarifas.test.tsx`.
  - *Hecho:* en verde; `informe-transito-informe.test.ts`, `catalogo-de-variables.test.ts`,
    `VariablesInsert.test.tsx`, `ConfiguracionEnviosWhatsappPage.test.tsx` y
    `ConfiguracionPlantillasPage.test.tsx` verdes sin tocarlos.

## Bloque 5 — Guardias y cierre (depende de los bloques 1–4)

- [x] **T5.1** Censo de R18 de SLT-235: `CENSO_MONEDA_DEL_PAIS` gana los 16 archivos de design §9 (R19).
  - *Hecho:* en verde, y rojo si en uno de ellos se reescribe un `money(` o un `formatMontoString(`.
- [x] **T5.2** `pais-sin-literales` (R20): fuera las 5 entradas de SLT-241, `TOPE_EXCEPCIONES = 14` y
  la línea de «Bajadas» del comentario de cabecera. No se toca `FichaQueLoRetira`.
  - Caso en `moneda-del-pais-tarifas.test.tsx`: ninguna excepción con `ficha === "SLT-241"` y tope 14.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [ ] **T5.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`): el
    grupo `dinero` y los que salgan de `grep -rl` en `e2e/` por `configuracion/tarifas`, `ranking`,
    `plantillas` y `envios-whatsapp` (entre ellos `e2e/tarifas-maqueta.spec.ts`).
  - El mapa R → test va en `progress/impl_SLT-241.md`.
  - El reviewer comprueba en el diff lo de R18 (design §11).
  - *Hecho:* todo verde y el mapa con los 20 requisitos.

## Archivos esperados

Producción:
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`
- `app/(app)/configuracion/tarifas/_components/tarifas-borrador.ts`
- `app/(app)/configuracion/tarifas/_components/TarifasValores.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasVehiculo.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasMensajeros.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasTiendas.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifaMensajeroDialogo.tsx`
- `app/(app)/configuracion/_components/UsuariosModule.tsx`
- `app/(app)/ranking/_components/ranking-labels.ts`
- `app/(app)/ranking/_components/PremioInputRow.tsx`
- `app/(app)/ranking/_components/RankingPodio.tsx`
- `app/(app)/ranking/historico/_components/RankingHistoricoModule.tsx`
- `lib/types/tarifa-flexible.ts`
- `lib/services/TarifaValorService.ts`
- `lib/repositories/TarifaValorRepository.ts`
- `lib/tarifas/servicios.ts`
- `lib/actions/tarifas.ts`
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/types/plantilla-datos.ts`
- `lib/utils/plantilla-mensaje.ts`
- `lib/services/PlantillaMensajeService.ts`
- `lib/actions/plantillas.ts`
- `lib/whatsapp-envios/informes/tipos.ts`
- `lib/whatsapp-envios/informes/catalogo.ts`
- `lib/whatsapp-envios/informes/transito/informe.ts`
- `lib/utils/vista-previa-informe.ts`
- `app/(app)/configuracion/envios-whatsapp/_components/VistaPreviaMensaje.tsx`
- `app/(app)/configuracion/plantillas/_components/VariablesInsert.tsx`
- `components/private/cierres/fila/fila-gestion-labels.ts` (solo el import de la variante con la moneda de la plataforma; decisión del leader 2026-11-21, archivo 35/40)

Tests:
- `tests/components/moneda-del-pais-tarifas.test.tsx`
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`
- `tests/unit/services/tarifa-valor-service.test.ts`
- `tests/components/TarifasMensajeros.test.tsx`

Grep del 2026-11-21. Si el typecheck o un test señalan otro llamante (de `etiquetaModo`,
`porcentajeParaVer`, `textoValor*`, `textoReferencia`, `planDeGuardado`, `componerVistaPrevia`,
`previewConEjemplos` o `textoAvisoZona`), se añade aquí antes del PR.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 29 | unas 380 |
| Tests | 5 | unas 700 (unas 600 del archivo nuevo) |
| **Total** | **34** | |

Es el 85% de `gate.tamano_pr` (40 archivos): pasa del aviso del 80%, y el humano lo aceptó el
2026-11-21 en una sola ficha (P1 en `requirements.md > Decisiones cerradas`, máximo 40). Quedan 6 archivos de margen; si se pasa de 40,
el implementer para y el leader decide. Las líneas quedan muy por debajo de sus dos topes (1 000 de
producción y 3 000 de tests).
