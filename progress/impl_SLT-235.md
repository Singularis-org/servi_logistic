# impl SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» — backend_dev

## Bloque 1 (T1.1, T1.2, T1.3) — 2026-11-20

### Archivos
Producción:
- `lib/repositories/PaisRepository.ts`: `deLaEmpresa` con un solo `pais.findFirst` y `organizaciones: { some: { id } }` (T1.1).
- `lib/services/pais-para-pantallas.ts` (nuevo): `MEMO_PAIS_MS`, `MEMO_PAIS_BARRIDO`, `MemoPaisEmpresa` (con reloj inyectable y un getter `tamano` para probar R9), `memoPaisEmpresa`, `paraPantallasDe`, `PARA_PANTALLAS_DE_PLATAFORMA` y `paisParaPantallasDelActor` (T1.2).
- `lib/interfaces/services/IPaisService.ts`: `PaisParaPantallas` y `paraPantallas`. Se quita `etiquetasDeEmpresa` (T1.3).
- `lib/services/PaisService.ts`: el memo entra como segundo argumento opcional del constructor y se añade `paraPantallas`. Se borra `etiquetasDeEmpresa` (T1.3).
- `app/(app)/layout.tsx`: **una línea** dentro de `etiquetasDelActor`, de `.etiquetasDeEmpresa(org)` a `(await ….paraPantallas(org)).etiquetas`. Sin ella no compila. El resto del layout es de T2.2.

Tests:
- `tests/unit/services/pais-para-pantallas.test.ts` (nuevo).
- `tests/unit/services/pais-service.test.ts`: los casos de `etiquetasDeEmpresa` pasan a `paraPantallas`, cada uno con su memo y su reloj.
- `tests/integration/db/pais-repositorio.test.ts`: el caso R19/T2.3 pasa a `paraPantallas` (CR y XA con su moneda y su impuesto), y se añade el `describe` R6 con `crearPrismaDeTestConEspia`.
- `tests/unit/actions/geografia-plataforma-action.test.ts`: en el doble, `etiquetasDeEmpresa` pasa a `paraPantallas`.

### R → test
| R | Test |
|---|---|
| R2 | `pais-para-pantallas.test.ts` > «R2: sin empresa da lo de la plataforma y no llama al servicio» |
| R3 | `pais-para-pantallas.test.ts` > «R3: sin moneda, la de la plataforma y un aviso…»; `pais-service.test.ts` > «R3/R4: un país sin moneda ni impuesto…» |
| R4 | `pais-para-pantallas.test.ts` > «R4: sin impuesto, el rótulo de la plataforma y un aviso…» |
| R5 | `pais-para-pantallas.test.ts` > «R5: si la lectura falla…» y «R5: si no encuentra país…» |
| R6 | `pais-repositorio.test.ts` > «SLT-235 (R6) — deLaEmpresa en una sola consulta» (necesita base) |
| R7 | `pais-para-pantallas.test.ts` > «a los 9:59 min responde desde el memo; a los 10:00 vuelve a leer»; `pais-service.test.ts` > «R7: dos llamadas seguidas… leen la base una vez» |
| R8 | `pais-para-pantallas.test.ts` > `describe` «R8 — …» (dos empresas, una lectura que lanza, un null) |
| R9 | `pais-para-pantallas.test.ts` > `describe` «R9 — barrido a 1 000 entradas» (3 casos) |
| R10 | `pais-para-pantallas.test.ts` > «R10: desde el memo… no avisa» y «R10: con el memo, el aviso sale una vez por lectura» |

### Verificación
- Antes del typecheck hubo que correr `prisma generate` en el worktree: no tenía cliente generado y resolvía uno viejo de `~/node_modules`, con 966 errores ajenos. Con `DATABASE_URL=postgresql://gate:gate@127.0.0.1:1/gate pnpm exec prisma generate`, como hace `scripts/gate-proyecto.sh`.
- `pnpm run typecheck`: exit 0, 0 errores.
- `pnpm exec eslint` sobre los 9 archivos tocados: exit 0, sin avisos.
- `pnpm exec vitest run` de los 4 archivos de test: 3 archivos pasan y 1 se salta. 132 tests pasan y 14 se saltan. Los saltados son `pais-repositorio.test.ts`, porque el worktree no tiene `.env` ni `DATABASE_URL` y no se montó base.
- `pnpm exec vitest run tests/components/AppLayout.test.tsx`: 1 falla y 23 pasan. Falla «⭑ con una empresa, ALGUIEN le pasa al proveedor las etiquetas de SU país»: su doble de `construirPaisService` solo trae `etiquetasDeEmpresa`. Se esperaba: ese bloque pasa a doblar `paraPantallas` en T2.2.

- `pnpm exec vitest related --run` sobre los 5 archivos de producción: lo corté a mano a los ~12 min. `PaisRepository` y `layout.tsx` lo relacionan con cientos de archivos. Hasta el corte, el único archivo que había fallado era `AppLayout.test.tsx`, por el caso de arriba. Esto queda para el gate o el CI.

### Desviaciones
- `MemoPaisEmpresa.tamano` (getter) no está en el design §4. Sirve para medir el barrido de R9 sin exponer el `Map`.
- `layout.tsx`: la línea mínima de arriba. `etiquetasDelActor` vive dentro del layout, así que no había forma de dejarla sobre `paraPantallas` sin tocarlo. Su comentario todavía nombra `etiquetasDeEmpresa`: la función entera desaparece en T2.2.

Veredicto: Bloque 1 hecho, con typecheck y unit en verde. Falta correr R6 contra una base, y `AppLayout.test.tsx` queda en rojo hasta T2.2.

## Bloque 2 — T2.1 y T2.2 (frontend_dev, 2026-11-20)

### Archivos
- Nuevos: `providers/MonedaDelPaisProvider.tsx`, `hooks/use-moneda-del-pais.ts`,
  `tests/components/moneda-del-pais-pantallas.test.tsx`.
- Modificados: `app/(app)/layout.tsx` (cuarta lectura = `paisParaPantallasDelActor`, rama del
  superadmin y sin sesión = `PARA_PANTALLAS_DE_PLATAFORMA`, `MonedaDelPaisProvider` dentro del de
  etiquetas, `etiquetasDelActor` borrada), `tests/components/AppLayout.test.tsx` (bloque SL-20/T5.1
  dobla `paraPantallas` y el proveedor de moneda; valor por defecto de `paraPantallas` a nivel de módulo).

### R → test
| R | Test |
|---|---|
| R1 | `AppLayout.test.tsx` > «⭑ R1: con una empresa, UNA llamada, y cada proveedor recibe lo suyo de SU país» |
| R2 | `AppLayout.test.tsx` > «R2: el superadmin (sin empresa) recibe lo neutro y lo de la plataforma…» |
| R5 | `AppLayout.test.tsx` > «R5: si la lectura del país falla, el portal se pinta… y lo dice en los logs» |
| R15 | `moneda-del-pais-pantallas.test.tsx` > «R15: sin proveedor, useMonedaDelPais…» y «R15: sin proveedor, useImpuestoDelPais…» |
| R17 | `moneda-del-pais-pantallas.test.tsx` > «R17: con el proveedor de prueba, useImpuestoDelPais da «IGV»…» |

### Verificación
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los 5 archivos: exit 0, sin avisos.
- `pnpm exec vitest run tests/components/AppLayout.test.tsx tests/components/moneda-del-pais-pantallas.test.tsx`:
  2 archivos, 28 tests, 28 en verde (el rojo del bloque 1 en `AppLayout.test.tsx` queda resuelto).

### Desviaciones
- Ninguna sobre el design. `IMPUESTO_DE_PRUEBA` («IGV») y el envoltorio `conPais()` viven en el test
  nuevo (no exportados) para que el bloque 3 monte cada pantalla con el mismo proveedor.

Veredicto: Bloque 2 hecho; typecheck, lint y los dos archivos de test en verde.

## Bloque 3 — T3.1 y T3.2 (frontend_dev, 2026-11-20)

### Archivos (todos modificados, todos en «Archivos esperados»)
- T3.1: `components/shared/PriceLabel.tsx` (`"use client"` + hook), `components/shared/KpiValorAnimado.tsx`
  (`formatearMontoEn(moneda, n)`, `decimals = moneda.decimales`, moneda en las deps del `useCallback`),
  `components/shared/DesglosePagoField.tsx` (hook en el componente; `mensajeDeCuadre(lineas, monto,
  moneda = MONEDA_PLATAFORMA)`; `montoEn` local = `formatearMontoEn(moneda, v, SIN_MONTO_RAYA)`;
  `export { montoExacto }` se queda).
- T3.2: `pos-card/pos-format.ts` (`formatMonto(monto, moneda)` obligatoria), `pos-card/PosAmountRow.tsx`
  (pasa a `"use client"`), `pos-card/PosOrderCardDetalle.tsx`, `pos-card/PosOrderCardMosaico.tsx`,
  `chat/ChatConversacion.tsx` (solo la cabecera «A cobrar»; la vista previa queda para T3.4),
  `AsignacionDetalle.tsx`, `KpisMensajero.tsx` (pasa a `"use client"`; `texto(kpis, moneda)`),
  `GestionarOrdenPanel.tsx` (`mensajeDeCuadre(..., moneda)`).
- Test: `tests/components/moneda-del-pais-pantallas.test.tsx` (dobles de `react-countup` con props,
  router, mapa, acciones del chat y de mis-asignaciones; describes T3.1 y T3.2).

### R → test (`moneda-del-pais-pantallas.test.tsx`)
| R | Test |
|---|---|
| R11 | T3.1: PriceLabel, KpiValorAnimado, resumen de DesglosePagoField, «mensajeDeCuadre dice sus importes en la moneda que se le pasa». T3.2: pos-format.formatMonto, PosAmountRow, PosOrderCardDetalle, PosOrderCardMosaico, AsignacionDetalle, KpisMensajero, ChatConversacion (cabecera), GestionarOrdenPanel (aviso de cuadre) |
| R12 | «R12: con una moneda de 0 decimales el contador cuenta a 0 decimales y el último fotograma da el texto del formateador» y «R12, R16: con la moneda de CR…» |
| R15 | «R15: PriceLabel sin proveedor…», «R15, R16: mensajeDeCuadre sin moneda usa la de la plataforma…»; guardia 359 y `DineroIdentidadesEnPantalla.test.tsx` sin cambios y en verde |
| R16 | cada caso de R11 compara el texto con `MONEDA_CR` contra el de sin proveedor (`compruebaMonedaDelPais`); tests existentes de esas pantallas en verde sin tocar |

### Verificación
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los 11 de producción y el test: 0 errores, 1 aviso preexistente
  (`GestionarOrdenPanel.tsx:74` `EnviarPlantillaWhatsappButton` sin usar; no es de este cambio).
- `pnpm exec vitest run` de `moneda-del-pais-pantallas`, `DineroIdentidadesEnPantalla`, guardia 359
  (`dinero-centimos-cuando-existen.guardia`), `PriceLabel`, `KpiValorAnimado`, `KpisMensajero`,
  `AsignacionDetalle`, los 8 de `GestionarOrdenPanel*`/`GestionarOrdenUbicacion*`, los 10 de
  `PosCard*`/`PosOrderCard*`, 4 de `ChatConversacion*`/`ChatContactoAntesDeRecoger`,
  `unit/utils/pos-format`, `unit/components/detalle-columnas`: 30 archivos, 415 tests, todos en verde.
- Guardias que nombran estos archivos (`estado-con-info`, `marca-pwa-capturas-iconos`,
  `paleta-secundaria`, `pwa-mensajero-sin-recorte`, `recorte-por-alcance` ×2, `pais-sin-literales`):
  7 archivos, 193 tests, en verde.

### Desviaciones
- `KpisMensajero.tsx` y `PosAmountRow.tsx` pasan a `"use client"` (design §7 lo prevé): `KpisMensajero`
  lo monta `mis-asignaciones/reparto/page.tsx`, que es de servidor; no hizo falta tocar la página.
- `DesglosePagoField` pinta su resumen con un `montoEn` local en vez de `montoExacto`: mismo
  formateador base y misma raya, así que con la moneda de la plataforma da lo mismo byte a byte.

Veredicto: T3.1 y T3.2 hechas; typecheck, lint y los tests de las pantallas tocadas en verde.
