# Review SLT-191 «Cierre del día del mensajero según el canvas»

Ruta **ligera**, revisión acotada a `git diff origin/dev...HEAD` (HEAD `250b5a70`). Solo presentación:
el diff no toca `lib/`, `db/`, `app/api/`, `page.tsx`, dinero, permisos ni integraciones, así que la
ruta ligera vale. Grafo no usado (Grep/Read y diff).

## Checklist

- [x] **Trazabilidad R810-R824**: cada R tiene un test que lo verifica (mapa en `progress/impl_SLT-191.md`
  y `progress/features/SLT-191.md`). Leídos los asertos: comprueban DOM, orden, clases y callbacks; ninguno vacío.
- [x] **Tasks** T1-T4 `[x]` en `## Tasks` del requirements. T4 se cierra con CI (decisión del leader):
  `e2e (reparto)` en verde en el PR #196.
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → 12/40 archivos, 430/1000 de producción, 443/3000 de tests.
- [x] **Lo que ya existe**: reutiliza `BARRA_FIJA`, `useIsMobile`, `EstadoConInfo`, `BotonVer`, rótulos de
  `columnasColaPropia()` y `FILA_*`. No re-crea nada de la lista.
- [x] **Typecheck**: `tsc --noEmit` → `TSC_EXIT=0`.
- [x] **Lint** (archivos tocados): `LINT_EXIT=0`, sin avisos.
- [x] **Tests**: `vitest run` de GestionesCierreMovil, CierreRechazosDeTienda, CierreDiaColaPropia,
  ColaCierres, FilaGestion, CierreDiaModule y las guardias `estado-con-info` y `pwa-mensajero-sin-recorte`
  → 8 archivos, 290 tests, `VT_EXIT=0`.
- [x] **(1) Admin y escritorio no cambian**: `tarjetaMensajero`, `desplegableMovil` y la barra fija son
  opcionales/condicionados; sin ellos, el DOM es el de hoy (ramas `else` idénticas a las de `origin/dev`).
  En `/cierres-admin` el admin sigue con Recaudado, Pago y el resto: `TablaColaBodega`/`TablaColaMensajero`
  no se tocan y la tabla de escritorio de la cola propia conserva sus 8 columnas (test R821 nuevo).
- [x] **(2) Recaudado/Pago/estado de pago** solo se quitan en `detallePropioMovil` (cola propia, móvil).
  `textoPagoPropio(pagoPropioDe(c))` sigue en la columna «Pago» de escritorio (`TablaColaPropia.tsx:87`).
- [x] **(3) Accesibilidad de la tarjeta**: disparador `absolute inset-0 min-h-11` (tarjeta `min-h-14`),
  con `aria-expanded`, nombre de hoy (DS4) y anillo de foco `ring-inset`; el contenido es
  `pointer-events-none` y solo los `button` de la columna de resultado recuperan el toque. Ningún botón
  dentro de otro (asertado en R813). Orden de foco: disparador → información. Guardia `estado-con-info` en verde.
- [x] **(4) Modo oscuro**: solo tokens (`bg-background`, `bg-muted/40`, `text-muted-foreground`,
  `text-warning-strong`, `TONO_RESULTADO`, `EstadoCierreBadge`); ningún color fijo nuevo.
- [x] **(5) Tests reescritos no debilitados** (vs `origin/dev`): «dos columnas» sigue con el texto completo
  de las dos celdas (ahora con folio y rótulos) y la columna fija del importe; el aserto de 44 px de «Ver»
  pasa al test R819 (`w-full`, `min-h-11`, habilitado, llama a `verCierrePasado`, deshabilitado al leer).
  «Al desplegar» pasa de lista de pares a `textContent === "Ver"` + ausencia de Folio/Recaudado/Pago/estado.
  El de escritorio se refuerza (cabeceras literales, ₡12.500, «Pendiente de pago», «Ver» en la fila).

## Mutaciones propias (restauradas con `git checkout --`; `git status` limpio al terminar)

| # | Mutación | Resultado |
|---|---|---|
| A | `tarjetaMensajero={esMovil}` (admin afectado) | ROJO: «R814: la administración en el teléfono…» |
| B | `tarjetaMensajero={audiencia === "mensajero"}` (escritorio afectado) | ROJO: «R814: en escritorio…» |
| C | `desplegable = esMovil` (rechazos ignoran la prop: admin afectado) | ROJO: «R817: fuera de /cierre-dia…» |
| D | barra fija con `esMovil` para todo `tipo` (admin afectado) | ROJO: «central y satélite: la barra no queda fija» |
| E | `CONTENIDO_SIN_TOQUE` sin `pointer-events-none` | ROJO: «R812: el disparador…» |

## Hallazgos

Ningún mayor / BLOQUEANTE.

- **menor** — `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx:60-61`: el botón de la fila
  desplegable no declara anillo de foco propio (depende del contorno por defecto); el patrón de referencia
  `PosOrderCardDetalle.tsx:203` lleva `focus-visible:outline-2 … outline-brand`. Sugerencia, no bloquea.
- **menor** — `components/private/cierres/fila/FilaGestion.tsx:441`: con `pointer-events-none` el texto de
  la tarjeta (guía, destinatario) ya no se puede seleccionar/copiar con el dedo. Es el coste aceptado de DS2.
- **menor (informativo)** — el botón de información de `EstadoConInfo` mide 16 px con área activa de 24×24
  (`EstadoInfo.tsx:85-86`, R26/R33), no 44 px; no cambia con esta ficha y el spec no lo pide. Un toque que
  falla por poco cae en el disparador (despliega), no en vacío.
- **menor** — el spec (T1) nombraba `FilaGestion.test.tsx` para R810-R814; los asertos viven en
  `GestionesCierreMovil.test.tsx` (FilaGestion.test sigue verde, sin cambios). Sin efecto.

## Veredicto

**OK**
