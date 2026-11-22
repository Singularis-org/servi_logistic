# Review SLT-241 «Moneda e impuesto del país en pantallas: tarifas, configuración y ranking»

- Fecha: 2026-11-21 · Fase F2.4 · Ruta completa.
- Diff revisado: `origin/feature/SLT-240-moneda-pantallas-ordenes...HEAD` (rama apilada sobre #271), 11 commits, 40
  archivos (35 de código y tests, más spec y bitácora).
- Grafo: no lo usé. El design ya deja dicho que este worktree no está indexado. Revisé con Grep/Read y git diff.

## Checklist

- [x] **Ruta**: completa. Toca dinero (importes, impuesto, historial de tarifas) y la complejidad es high. Ninguna ruta inferior aplica.
- [x] **Spec**: están `requirements.md` (R1–R20 en EARS, sin preguntas abiertas), `design.md` (6 alternativas descartadas) y `tasks.md`.
- [x] **`design.md > Lo que ya existe`**: está y tiene contenido. El diff no re-crea nada de esa lista: reutiliza
  `useMonedaDelPais`/`useImpuestoDelPais`, `paisParaPantallasDelActor`, `formatearMontoEn` y el censo de SLT-235. No abre
  archivos nuevos en `configuracion/tarifas/_components/` (censo de `TarifasDisposicion`).
- [~] **Tasks**: T1.1–T5.2 están `[x]`. Falta marcar T5.3 (cierre: `./init.sh` y E2E en local) (menor 1).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` da un aviso: 35/40 archivos, 640/1000 líneas de producción y 1454/3000 de tests.
  Queda dentro del máximo. El humano aceptó pasar del 80% (P1) y el leader aceptó el archivo 35, `fila-gestion-labels.ts`
  (`progress/features/SLT-241.md > Decisiones`).
- [x] **Trazabilidad R→test**: el mapa de R1–R20 está en `progress/impl_SLT-241.md`, y comprobé que cada test existe y comprueba algo de verdad:
  - R1–R4: casos puros de `tarifas-textos`/`planDeGuardado` y montados de los 6 componentes, cada uno con el país de
    prueba (€, «IGV»), con CR y sin proveedor. Además, el censo «sin IVA» de los 8 archivos, con 2 contrapruebas.
  - R5/R6: `tarifa-valor-service.test.ts`, mensajes con «IGV» e historial `monto 1500.00 IGV 13.00`. Un pago sin %
    queda como hoy.
  - R7/R8: `guardarValoresTarifa` con tres cambios lee el país una vez y antes del primer `fijarValor`. La fábrica
    recibe «IGV». Si `paraPantallas` lanza, recibe `IMPUESTO_ROTULO`, el resultado es `ok` y el error queda en el log.
    Sin empresa, no consulta el país. También se comprueba el cableado del fuente, con 4 contrapruebas.
  - R9: la guardia `pais-sin-literales` pasa con `resolver-tarifas.ts` fuera de la lista (menor 3).
  - R10/R11: `UsuariosModule`, `RankingPodio`, `PremioInputRow` y `RankingHistoricoModule` (tabla y tarjeta) con su
    marcador de «sin importe».
  - R12–R15: servicio + `previewConEjemplos` + cableado de `buildPlantillaService` con 3 contrapruebas;
    `componerVistaPrevia` en puro y montado en `VistaPreviaMensaje`/`VariablesInsert`. El `ejemplo` que va a Meta
    sigue en la moneda de la plataforma.
  - R16/R17: cada caso compara CR con «sin proveedor». Los tests de antes siguen verdes sin cambiar ningún valor
    esperado (solo `TarifasMensajeros.test.tsx` cambió la llamada, añadiendo `IMPUESTO_ROTULO`).
  - R19: censo con los 16 archivos, más un caso que inyecta `money(`/`formatMontoString(` en cada uno y espera rojo.
  - R20: no queda ninguna entrada a nombre de SLT-241 y el tope es 14.
- [x] **R18 (comprobado en el diff, design §11)**: el diff no toca `db/`, ni hay migración, ni se escribe sobre
  `historial_accion` existente. `ranking-*-descarga-columnas.ts` no cambia. No hay archivos de wallet ni de
  plataforma. Los nombres internos con «iva» se mantienen. Ningún «IVA» cambió fuera de los archivos de §4–§6. En
  `fila-gestion-labels.ts` solo cambia el import, a `porcentajeParaVerEnLaPlataforma`, y el texto que se ve es el mismo.
- [x] **Dinero e impuesto**: `formatearMontoEn` formatea desde el string y no pasa por `Number`. El marcador
  `SIN_MONTO_RAYA` es el mismo que daba `money`. `money`/`formatMontoString` son `formatearMontoEn(MONEDA_PLATAFORMA, …)`,
  así que con CR o sin proveedor el texto es idéntico byte a byte. El impuesto entra por constructor y la acción lo lee
  una vez, después de la comprobación de sesión y rol (`actorDe` va antes) y con la empresa de la sesión, nunca del input.
- [x] **Costa Rica sin cambios (R16)**: los tests de Tarifas, ranking, Usuarios, plantillas, informes, esquemas de
  escritura, composición y acción están en verde sin cambiar sus valores.
- [x] **Reglas del proyecto (perfil reviewer)**: no hay tabla ni query nueva. No hay literal de país o moneda en código nuevo
  (lo confirma la guardia). No entra ninguna dependencia ni hay nada de Ordenex. Los comentarios explican el porqué.
- [~] **E2E afectados corridos en local**: no hay constancia (menor 1).

### Verificación que corrí (2026-11-21, `NODE_OPTIONS=--max-old-space-size=8192`)

- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → exit 0, `✖ 249 problems (0 errors, 249 warnings)`. Son los mismos 249 de la bitácora.
- `pnpm run test:guardias` → `Test Files 357 passed | 3 skipped (360)`, `Tests 5419 passed | 28 skipped`.
- `vitest run` de `moneda-del-pais-tarifas`, `moneda-del-pais-pantallas`, `tarifa-valor-service`, `TarifasMensajeros`,
  `TarifasValores`, `TarifasVehiculo`, `TarifasGrupos`, `TarifasTiendas`, `TarifasModulo`, `TarifasDisposicion`,
  `tests/unit/plantillas/` y `pais-sin-literales.guardia` → `25 passed (25)`, `803 passed (803)`.
- `vitest run` de `tarifas-action`, `esquemas-escritura`, `servicios-composicion`, `tarifa-schemas`,
  `catalogo-de-variables` e `informe-transito-informe` → `6 passed`, `151 passed`.
- `vitest run` de los 14 de ranking, Usuarios, envíos y plantillas en un solo lote: 2 tests se pasaron del tiempo de
  20 s (control de acceso de `ConfiguracionEnviosWhatsappPage` y de `ConfiguracionPlantillasPage`). Corridos solos
  → `2 passed`, `12 passed` (menor 2).

## Hallazgos

### Mayores (bloqueantes)

Ninguno.

### Menores

1. **menor (es condición de merge, no del código).** T5.3 sigue sin marcar. No hay constancia de `./init.sh` ni de los E2E
   afectados corridos en local:
   - el grupo `dinero`;
   - `tarifas-maqueta`, `tarifas-activacion` y `tarifas-valor-propio-mensajero`, que comprueban «IVA», «IVA de Flete…» y el
     encabezado `["Concepto","Modo","Valor","IVA"]`;
   - `pwa-mensajero-ranking`.

   `docs/perfil-agentes.md > reviewer` lo marca como bloqueante. Pero el leader fijó que en esta máquina el gate
   completo y el E2E corren en CI, el mismo criterio de las reviews de SLT-235 y SLT-240. Queda como condición: no
   se avisa «listo para mergear» hasta tener `gate-completo` y esos E2E en verde en el PR, y entonces se marca T5.3.
   Si el PR no corre esos E2E, este punto pasa a bloqueante.
2. **menor.** Al correr en lote, `ConfiguracionEnviosWhatsappPage.test.tsx` y `ConfiguracionPlantillasPage.test.tsx`
   se pasan de los 20 s en sus casos de control de acceso. Solos pasan. Parece cosa de la carga de la máquina, no del
   diff (esta ficha solo pasa la moneda a `VariablesInsert`/`VistaPreviaMensaje`). Vale la pena mirarlo en CI.
3. **menor.** R9 («DEBE seguir deteniendo el cálculo como hoy») no tiene un test que compruebe el `throw` de
   `aValorCobro`. Solo la guardia comprueba que el mensaje ya no dice «IVA», y `tarifas-flexibles-resolver.test.ts`
   (integración, corre en CI) no cubre esa rama. El `throw` no cambió y el CHECK `tarifa_valor_iva_solo_tienda` lo hace
   inalcanzable, así que el riesgo es nulo. El design §11 aceptó este mapeo.
4. **menor (estilo).** `TarifasMensajeros.tsx` llama a `textosDelImpuesto(impuesto)` en cada render, sin el `useMemo`
   que usan `TarifasValores` y `TarifaMensajeroDialogo`. Es un objeto de 7 strings y no tiene coste real. Lo anoto
   solo por coherencia.

## Veredicto

**OK (APROBADO).** 0 bloqueantes, 4 menores. Condición de merge: `gate-completo` y los E2E afectados en verde en CI
(menor 1).
