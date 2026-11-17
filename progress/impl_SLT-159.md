# SLT-159 «Escaneo continuo en recepciones y recogidas» — implementación, rebanada (b)

Frontend_dev, 2026-11-16. Rama `feature/SLT-159-escaneo-continuo-recepciones`. Sin servidor, sin
esquema, sin dependencias. T1-T7, T10 y T11 hechas; T8 con el E2E escrito y registrado (lo corre CI;
Preview y nota en `progress/features/SLT-159.md` pendientes); T9 es del leader (`./init.sh`).

## Commits

c69aaf4c T1 · 7fba2fed T2 · 61a979db T3 · 8fe6312c T4 · da132140 T5 (+T11) · 71cef5e2 T6 ·
9ec41fce T7 · feef0a69 T10 · a370d8eb T8 (E2E) · c5220079 guardias · (este archivo, aparte).

## Archivos

Nuevos (producción): `lib/utils/sesion-escaneo.ts`, `hooks/useSesionEscaneo.ts`,
`components/shared/EscaneoContinuo.tsx`, `components/shared/RecepcionContinuaPagina.tsx`,
`components/shared/RecibirPaquetesEntrada.tsx`, `app/(app)/ordenes/recibir/page.tsx`,
`app/(app)/recepcion-satelite/recibir/page.tsx`.
Modificados (producción): `hooks/useEntradaEscaneo.ts`, `components/shared/EscanerGuiaCard.tsx`,
`components/shared/QrScanner.tsx`, `app/(app)/ordenes/_components/{EscanerRecepcionBodegaCentral,
EscanerRecepcionOrigen,OrdenesListado}.tsx`, `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx`,
`app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`, `playwright.config.ts`,
**`lib/modulos/reparto.ts`** (fuera de `## Archivos esperados`: la guardia `modulos-reparto` exige
las dos rutas nuevas; dos líneas `"nucleo"`).
Tests nuevos: `tests/unit/utils/sesion-escaneo.test.ts`, `tests/unit/hooks/useSesionEscaneo.test.ts`,
`tests/components/{EscaneoContinuo,RecibirPaquetesEntrada,RecepcionContinuaPagina}.test.tsx`,
`tests/unit/app/recibir-paquetes-page.test.tsx`, `e2e/recibir-paquetes.spec.ts`.
Tests ampliados: `QrScanner`, `EscanerRecepcionBodegaCentral`, `EscanerRecepcionOrigen`,
`EscanerRecepcion`, `OrdenesPage`, `CierresAdminConfirmacionFisica`, `VerificarGuiaGate`.

## Mapa R → test

| R | Test |
| --- | --- |
| R580 | `EscaneoContinuo.test.tsx` «cinco Enter seguidos…» y «por cámara, dos guías seguidas…»; `EscanerRecepcionBodegaCentral.test.tsx` «R580/R592: tres ok…»; `EscanerRecepcionOrigen.test.tsx` «R580: una lectura llega a recibirEnOrigenPorQr…»; `EscanerRecepcion.test.tsx` «R580: en modo continuo…»; E2E `recibir-paquetes.spec.ts` |
| R581 | `EscaneoContinuo.test.tsx` «R581: la más reciente arriba…» (resumen, «—», 17:42:08); `sesion-escaneo.test.ts` hora; E2E (destinatario y tienda sembrados) |
| R582 | `EscaneoContinuo.test.tsx` «R582…»; `sesion-escaneo.test.ts` «la más reciente arriba y en «Recibiendo…»» |
| R583 | `EscaneoContinuo.test.tsx` tabla de estados + «Reintentar» 44 px (`h-11`); `EscanerRecepcionOrigen.test.tsx` `tienda_ajena` y «Reintentar» con `estado_invalido` |
| R584 | `EscaneoContinuo.test.tsx` «R584: «1024abc»…» |
| R585 | `useSesionEscaneo.test.ts` «1024 dos veces…» y «7777777 … dos veces» |
| R586 | `sesion-escaneo.test.ts` contadores 0/1/2 y DC6 en 0 |
| R587 | `useSesionEscaneo.test.ts` «tres lecturas seguidas…» y «un «Reintentar» pulsado con otra en curso…» |
| R588 | `QrScanner.test.tsx` continuo / suelto; `CierresAdminConfirmacionFisica.test.tsx` «SLT-159 (R588)…» |
| R589 | `QrScanner.test.tsx` 1 s / 3,1 s / texto distinto a 0,5 s |
| R590 | `EscaneoContinuo.test.tsx` «R590…»; `EscanerRecepcionBodegaCentral.test.tsx` «R590…» |
| R591 | `EscaneoContinuo.test.tsx` «R591: leer 1024, cerrar y reabrir…» |
| R592 | `EscanerRecepcionBodegaCentral.test.tsx` «tres ok … una vez al cerrar» y «solo no_encontrada … cero»; `useSesionEscaneo.test.ts` R592 |
| R593 | `EscaneoContinuo.test.tsx` «R593: táctil… fino…» |
| R594 | `VerificarGuiaGate.test.tsx` «sigue en guía suelta»; `EscanerRecepcionBodegaCentral.test.tsx` «R594…» |
| R610 | `RecepcionContinuaPagina.test.tsx` «título, nombre de la recepción, campo…» |
| R611 | `RecibirPaquetesEntrada.test.tsx` (fino → enlace; táctil → diálogo con la lista); `OrdenesPage.test.tsx` «SLT-159 (R611)…»; `EscanerRecepcion.test.tsx` `desde=en-bodega` / `por-recibir` |
| R612 | `recibir-paquetes-page.test.tsx` (maestro/admin/adminTienda; adminSatelite, mensajero y sin sesión → `notFound()` sin acción) |
| R613 | `RecepcionContinuaPagina.test.tsx` «Terminar recepción (2)…»; `recibir-paquetes-page.test.tsx` lista blanca de `desde`; E2E vuelve a `/recepcion-satelite/por-recibir` y a `/ordenes` |
| R615 | `RecepcionContinuaPagina.test.tsx` (con resumen, sin resumen, `7777777` no encontrada); `sesion-escaneo.test.ts` todos los textos |

## Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`.
- `pnpm exec eslint <los .ts/.tsx del diff>` → `ESLINT_EXIT=0`.
- `pnpm exec vitest run <77 archivos que importan lo tocado>` → `Test Files 77 passed (77)`,
  `Tests 1444 passed (1444)`. Ninguno de integración (sin Postgres).
- `pnpm run test:guardias` → `Test Files 1 failed | 353 passed (354)`, `Tests 4 failed | 5240
  passed | 1 skipped`. El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en
  `tests/baseline-rojos.json` (heredado; no toca nada de esta ficha). Antes del commit c5220079
  también estaban `modulos-reparto` y `buttonvariants-pasa-por-cn`: arreglados.
- E2E: escrito y registrado en el proyecto `reparto`; guardia `e2e-sin-saltos` en verde (38/38).
  **No corrido** (sin dev server ni build, por instrucción): lo corre CI.

## Mutaciones (todas en rojo y restauradas con `git checkout --`, árbol limpio tras cada una)

| # | Mutación | Rojo en |
| --- | --- | --- |
| M1 | «Código inválido» suma a «No encontradas» | `sesion-escaneo` DC6 + `EscaneoContinuo` R584 (2) |
| M2 | «No se pudo recibir» suma a «Recibidas» | `sesion-escaneo` DC6 (1) |
| M3 | la cola tira la lectura que llega mientras otra se procesa | `useSesionEscaneo` R587 ×2 + R592 (3) |
| M4 | `procesar` toma la fila pendiente más NUEVA (`pop`) | `useSesionEscaneo` R587 (1) |
| M5 | refresco al cerrar aunque no hubo recepción | `useSesionEscaneo` + `EscanerRecepcionBodegaCentral` R592 (2) |
| M6 | refresco por cada lectura | ídem «una vez al cerrar, ninguna antes» (2) |
| M7 | «Reintentar» fuera de la cadena única | `useSesionEscaneo` R587 (1) |
| M8 | una relectura vuelve a llamar a la acción | `useSesionEscaneo` R585 (1) |
| M9 | modo continuo apagado en `QrScanner` | `QrScanner` R588/R589 ×3 + `EscaneoContinuo` cámara (4) |
| M10 | sin espera de 3 s | `QrScanner` «mismo texto a 1 s» (1) |
| M11 | C5 sin `continuo` | `CierresAdminConfirmacionFisica` R588 (1) |
| M12 | el diálogo continuo monta la guía suelta | `EscanerRecepcionBodegaCentral` R590 + R592 ×2 (3) |
| M13 | entrada siempre diálogo | `RecibirPaquetesEntrada`, `OrdenesPage`, `EscanerRecepcion` R611 (4) |
| M14 | `desde` sin lista blanca | `recibir-paquetes-page` `https://evil.test` (1) |
| M15 | adminSatelite entra a `/ordenes/recibir` | `recibir-paquetes-page` R612 (1) |
| M16 | línea de estado sin destinatario | `RecepcionContinuaPagina` R615 (1) |
| M17 | «Terminar recepción» sin `refresh()` | `RecepcionContinuaPagina` R613 (1) |

## Diferencias con el canvas y con el design

1. **Nombre de la recepción debajo del título** (`PageHeader`), no encima como `Main.dc.html:21`:
   aprobado por Carlos el 2026-11-16. C1 «Bodega central», C2 «Tienda», C3/C4 «Bodega satélite».
2. **Línea de estado** con los textos de R615 tal cual (aprobados). Colores: verde recibida, ámbar
   no encontrada, rojo error/código inválido, gris «Ya recibida».
3. **Contadores**: en la página, columna derecha apilada (canvas); en el diálogo, tres en fila.
4. **Diálogo táctil**: lleva lista y contadores (DC2/DC5); el canvas `TiendaMovil` dibuja solo la guía
   suelta (pregunta abierta 3 del spec, ya anotada).
5. **Estados sin canvas**: «Recibiendo…», «Código inválido», «No se pudo recibir» + motivo +
   «Reintentar» (pregunta 4 del spec).
6. **`desde` de la satélite**: se lee de `window.location.pathname` (`useSyncExternalStore`, en
   servidor «por-recibir») y no de `usePathname()` como dice el design: nueve tests de listados de la
   satélite doblan `next/navigation` sin `usePathname` y se rompían. Mismo resultado en la app.
7. **`exito` en continuo**: el design dice que la tarjeta continua no lo pinta; se deja que lo pinte si
   se pasa, porque C5 (que solo gana `continuo`) conserva su línea de última confirmada. Las
   recepciones continuas no lo pasan.
8. **E2E de bodega central**: ningún escenario de servicio lleva una orden a `en_ruta_bodega_central`
   (solo la carga por API), así que el E2E prueba «Recibida» ×3 en la página de la **satélite**
   (`en_ruta_bodega_satelite`) y la página de `/ordenes/recibir` del maestro con una orden ya en
   bodega central («Ya recibida» con destinatario y tienda). El spec pedía las tres «Recibida» con el
   maestro en `/ordenes/recibir`.
9. Una pieza no prevista: `TarjetaEscaneoContinuo` (en `EscaneoContinuo.tsx`) junta sesión + tarjeta
   + lista para no repetir el cableado en las tres superficies (y la reutiliza SLT-168).

## Tamaño (`node scripts/tamano-pr.mjs`)

`31/40 archivos, 1182/1000 lineas de produccion, 1397/3000 de tests`. **Pasa de 1100** (lo estimado
eran ~1010; la regla del leader era parar y avisar por encima de 1100). Desglose de producción:
`EscaneoContinuo.tsx` 213, `sesion-escaneo.ts` 179, `RecepcionContinuaPagina.tsx` 167,
`useSesionEscaneo.ts` 138, `EscanerRecepcion.tsx` +98/−21, las otras dos superficies ~87 cada una,
`RecibirPaquetesEntrada.tsx` 45, dos `page.tsx` 57, `QrScanner` 29, `useEntradaEscaneo` 23,
`EscanerGuiaCard` 18, `OrdenesListado` 15, `reparto.ts` 3, `playwright.config.ts` 2, C5 1. Buena
parte son comentarios de contrato al estilo del repo.

## Abierto

- Tamaño por encima de 1100: decisión del leader/Carlos (aceptar con este desglose, recortar
  comentarios o partir en b1/b2).
- T8: correr el E2E (CI), Preview con pistola (10 etiquetas, una repetida, una ajena) y teléfono de
  tienda (cinco con la cámara abierta), y la nota en `progress/features/SLT-159.md`.
- T9: `./init.sh` del leader.

Veredicto: rebanada (b) implementada y verificada en local (typecheck, lint, 77 archivos de tests y mutaciones en rojo); el tamaño (1182 líneas) pide decisión.
