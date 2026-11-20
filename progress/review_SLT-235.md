# Review SLT-235 «Moneda e impuesto del país en las pantallas de la empresa»

- Ruta: completa (dinero, multi-país). Rama apilada: diff medido contra
  `origin/feature/SL-21-moneda-impuestos-configurables...HEAD` (39 archivos).
- Fecha: 2026-11-20. Grafo: no usado (worktree sin indexar según design); Grep/Read.

## Checklist

- [x] **Ruta**: completa, con requirements + design + tasks.
- [x] **Tasks**: T1.1–T4.4, todas `[x]`.
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → 34/40 archivos, 527/1000 líneas de producción,
  1387/3000 de tests. Es un AVISO de cercanía, no excede. Los archivos 33 y 34 los aceptó el leader
  (`progress/features/SLT-235.md > Decisiones`).
- [x] **Lo que ya existe** (`design.md`): presente y con contenido. El diff reutiliza SL-20 (patrón
  proveedor y hook), SL-17 (forma del memo) y SL-21 (`formatearMontoEn`, `FormatoMoneda`,
  `resolverValoresPlantilla`). No re-crea nada: `etiquetasDeEmpresa` y `etiquetasDelActor` se borran
  y se sustituyen.
- [x] **Trazabilidad R1–R20**: ver la tabla de abajo. Cada R tiene un test concreto con aserciones reales.
- [x] **Typecheck**: `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` da exit 0.
- [x] **Lint** sobre los .ts/.tsx del diff: 0 errores. Hay 1 aviso preexistente
  (`GestionarOrdenPanel.tsx:74`, `EnviarPlantillaWhatsappButton` sin usar), que no es de esta rama.
- [x] **Guardias**: `pnpm run test:guardias` da 357 archivos verdes y 3 saltados; 5413 tests verdes.
- [x] **Tests de la rama** (`vitest run` de los 8 archivos del diff): 7 verdes y 1 saltado;
  286 tests verdes. El saltado es `pais-repositorio.test.ts`: no hay base en local. La bitácora dice
  14/14 sobre una base desechable, y lo vuelve a correr el CI.
- [x] **Dependencias**: ninguna nueva (no se toca `package.json`).
- [x] **Datos y seguridad**: sin tabla, migración ni política nueva. La consulta nueva
  (`pais.findFirst` con `organizaciones.some.id`) sigue pasando por la RLS de `organizacion`, y hay
  test de integración con dos empresas: la ajena da `null`, en 1 sentencia. No hay recursos de
  Ordenex ni `console.log` de PII: los avisos solo llevan el id de la empresa y el del país.
- [x] **Sin literales de país ni moneda** en el código nuevo: los textos salen de `MONEDA_PLATAFORMA`,
  `IMPUESTO_ROTULO` y `PaisDTO`.
- [x] **Capas**: el memo y las caídas viven en `lib/services/`, la consulta en `lib/repositories/` y
  el layout solo orquesta.
- [x] **Permisos**: la clave del memo sale de `resolveActorFromSession` en el servidor, nunca de la
  petición. `/paquete` conserva su autorización.
- [x] **Comentarios**: explican el porqué (salvo el menor 3).
- [ ] **`gate-completo` en CI**: pendiente. Es condición de merge (ver el menor 1).
- [~] **E2E de flujos críticos** (mis-asignaciones, recepción-satélite, dinero): no se corrieron en
  local. Sigo el precedente de SL-21 y la decisión humana «gate en CI»; ver el menor 1.

## Puntos pedidos por el leader

- **Memo de 10 min.** La clave es `organizacionId`, así que dos empresas son dos entradas: no se
  mezclan (test R8). Si `leer` lanza o devuelve `null`, el memo no escribe y relanza (tests R8). Al
  escribir con ≥1 000 entradas barre las caducadas (tests R9; por debajo de 1 000 no barre). Una
  entrada caducada se borra al leerla. La caducidad es `<=`, y el test lo cubre a 9:59 y a 10:00.
- **`deLaEmpresa` en una consulta.** Usa `pais.findFirst({ where: { organizaciones: { some: { id } } } })`,
  sin `$queryRaw` ni `relationJoins`. El test de integración R6 mide 1 sentencia para CR, para XA y
  para la empresa ajena, y la ajena da `null` con `servi_app`.
- **Caída a `MONEDA_PLATAFORMA`.** `paraPantallasDe` avisa con `console.warn` (empresa y país) solo
  si `recienLeido`, o sea una vez por lectura (R10). `paisParaPantallasDelActor` captura el error,
  hace `console.error` y devuelve `PARA_PANTALLAS_DE_PLATAFORMA` (R5).
- **Sin estado de módulo en SSR.** El único estado de módulo es el memo por clave, que es la decisión
  cerrada. La moneda viaja explícita: layout → proveedor → hook → `formatearMontoEn(moneda, …)`. No
  hay "moneda actual" global.
- **`"use client"`.** `PriceLabel`, `KpisMensajero` y `PosAmountRow` pasan a cliente:
  - Montarlos desde un componente de servidor (`mis-asignaciones/reparto/page.tsx` monta
    `KpisMensajero`) es válido: queda como frontera de cliente con props serializables.
  - `ordenes-columns.tsx` solo crea elementos `<PriceLabel/>`, y su tabla es de cliente.
  - En `app/`, `lib/` y `components/` no hay `renderToStaticMarkup` ni `renderToString` de producción.
  - `RecepcionDetalle` usa el hook sin la directiva. Es correcto: su único montador
    (`SateliteOrderCard`) es de cliente.
- **CR sin cambio visible.** `MONEDA_CR` = `MONEDA_PLATAFORMA` (SL-21 R9). Cada caso compara el texto
  con `MONEDA_CR` contra el de sin proveedor (`compruebaMonedaDelPais`). Los tests existentes de las
  pantallas no cambian ningún valor esperado: solo cambian `AppLayout.test`, `pais-service.test` y el
  doble de `geografia-plataforma-action.test`, por la API borrada.
- **El superadmin no consulta.** En la rama `deLaPlataforma` del layout se pone
  `PARA_PANTALLAS_DE_PLATAFORMA` sin promesa, y el test R2 del layout comprueba que no se llama a
  `paraPantallas`. `/paquete` sin empresa no construye ni el servicio.

## Mapa R → test (verificado)

| R | Test |
|---|---|
| R1 | `tests/components/AppLayout.test.tsx` > «⭑ R1: con una empresa, UNA llamada…» (`toHaveBeenCalledTimes(1)`) |
| R2 | `AppLayout.test.tsx` > «R2: el superadmin…» (`not.toHaveBeenCalled`); `tests/unit/services/pais-para-pantallas.test.ts` > describe «R2, R5» |
| R3, R4, R10 | `pais-para-pantallas.test.ts` > describe «R3, R4, R10»; `pais-service.test.ts` (R3/R4); `/paquete` (caída de R3) |
| R5 | `pais-para-pantallas.test.ts` > «R2, R5»; `AppLayout.test.tsx` > «R5»; `/paquete` (caída de R5) |
| R6 | `tests/integration/db/pais-repositorio.test.ts` > «SLT-235 (R6)» (1 sentencia; CR, XA y la ajena da null) |
| R7 | `pais-para-pantallas.test.ts` > describe «R7» (9:59 y 10:00); `pais-service.test.ts` > «R7» |
| R8 | `pais-para-pantallas.test.ts` > describe «R8» |
| R9 | `pais-para-pantallas.test.ts` > describe «R9» (1 000 caducadas: tras escribir queda 1; con 999 no barre) |
| R11 | `tests/components/moneda-del-pais-pantallas.test.tsx` > casos T3.1–T3.3 por pantalla y `mensajeDeCuadre` |
| R12 | `moneda-del-pais-pantallas.test.tsx` > `KpiValorAnimado` con 0 decimales y con `MONEDA_CR` |
| R13 | `moneda-del-pais-pantallas.test.tsx` > T3.4: las tres vistas previas contra `renderPlantilla(resolverValoresPlantilla(…, MONEDA_DE_PRUEBA))` |
| R14 | `moneda-del-pais-pantallas.test.tsx` > T3.5 (con empresa, sin empresa sin consulta, CR, R3, R5) |
| R15 | `moneda-del-pais-pantallas.test.tsx` > hooks y `PriceLabel` sin proveedor, `mensajeDeCuadre` sin moneda; guardia 359 y `DineroIdentidadesEnPantalla` sin cambios |
| R16 | `compruebaMonedaDelPais` en cada caso, más los tests existentes sin tocar |
| R17 | `moneda-del-pais-pantallas.test.tsx` > «R17: … useImpuestoDelPais da «IGV»» |
| R18 | `moneda-del-pais-pantallas.test.tsx` > «censo de R18»: 17 archivos, una contraprueba con fuentes inventadas y otra con los archivos reales mutados |
| R19 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` (verde): `/paquete` fuera, `TOPE_EXCEPCIONES` 20 → 19, y las 9 entradas pasan a SLT-241, SLT-242 y SLT-245 |
| R20 | Comprobado en el diff: no toca `plataforma/`, `facturas`, `openapi`, `monto-cliente.ts`, `plantilla-datos.ts` ni `informe.ts`, ni renombra nada con «iva» |

## Hallazgos

1. **menor (condición de merge, no del código).** No hay constancia local de los E2E de flujos críticos
   (`mis-asignaciones`, `recepcion-satelite`, `asignacion-satelite`, `--project=dinero`,
   `pwa-mensajero-*`).
   - El perfil del reviewer lo marca como bloqueante, pero se aplica el precedente de SL-21: la
     decisión del humano es «gate en CI».
   - **Ojo:** `.github/workflows/gate.yml` solo se dispara en PR hacia `dev` o `prod`, y el PR de
     esta rama apunta a `feature/SL-21-…`. Ese PR NO va a correr ni `gate-completo` ni E2E.
   - Para tener la constancia, el leader tiene que lanzar `workflow_dispatch` del gate sobre
     `feature/SLT-235-moneda-pais-pantallas`, o no mergear hasta que el PR de SL-21 a `dev` (con
     estos commits dentro) salga en verde con E2E. No se avisa «listo para mergear» sin una de las dos.
2. **menor.** `pais-repositorio.test.ts` (R6) no se pudo correr en esta revisión porque no hay base
   local. La bitácora dice 14/14 sobre una base desechable. Lo confirma el mismo CI del punto 1.
3. **menor (comentario).** En `components/shared/DesglosePagoField.tsx`, en el comentario del resumen
   R8 (`Feature 300: se pintan con montoExacto (desde SLT-235, montoEn con la moneda del país), que es
   money()…`), el inciso añadido deja la frase ambigua: «que es `money()`» ya no se refiere a lo que
   se pinta, y la línea pasa del ancho de las vecinas. Convendría reescribirla en el próximo toque.
4. **menor (transitorio documentado).** `mensajeDeCuadre(…, moneda = MONEDA_PLATAFORMA)` y
   `segmentosDelMensaje(…, moneda?)` dejan la moneda opcional. Es lo que acepta el design §7 y §12.4,
   y SLT-243 la vuelve obligatoria. Los llamantes de producción de esta ficha sí la pasan.
5. **menor (fuera de diff).** Hay un aviso de lint preexistente en `GestionarOrdenPanel.tsx:74`. No es
   de esta rama.

No hay hallazgos bloqueantes.

## Veredicto

**OK.** Condición de merge: `gate-completo` y los E2E afectados en verde en CI (hallazgo 1, con el
disparo del workflow resuelto, porque el PR a la rama de SL-21 no lo dispara solo).
