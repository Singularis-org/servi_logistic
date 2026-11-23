# Review SLT-244 «Moneda e impuesto del país en pantallas: componentes de cierres»

- Rama: `feature/SLT-244-moneda-pantallas-componentes-cierres`. Diff `origin/dev...HEAD`: commits 06888b32, a87c38ed, c2b6b5ad, 28c53551.
- Ruta: completa (toca dinero). El spec está completo: requirements, design y tasks.
- Grafo: no lo usé. El índice de este worktree no estaba (design §Lo que ya existe), así que revisé con Grep/Read y git.
- No corrí `./init.sh`, los E2E ni `test:guardias` completo: el leader los dejó para CI.

## Verificación ejecutada (NODE_OPTIONS=--max-old-space-size=8192, de a un comando)

- `pnpm run typecheck`: `tsc --noEmit`, exit 0. Incluye los 6 `@ts-expect-error` de R8.
- `pnpm exec eslint` de los 24 `.ts`/`.tsx` del diff: exit 0, sin avisos.
- `pnpm exec vitest run` de los 6 tests del diff + `columnas-sensibles.guardia`: **7 archivos, 498 tests en verde**.
- `pnpm exec vitest run` de 16 suites que dependen del cambio pero no se tocaron: **16 archivos, 382 tests en verde**. Son `FilaGestion`, `DetalleCierre*` (×4), `CierreDesgloseModeloNuevo`, `ConciliacionSateliteCascada`, `DescargarGestionesDialog`, `DescargarGestionesModeloNuevo`, `moneda-del-pais-cierres-admin`, `rechazo-nombre-466-app`/`-lib` y las guardias `cierre-bodega-vocabulario`, `liquidacion-money-safe`, `pais-sin-literales` y `rechazo-nombre-466`.
- `node scripts/tamano-pr.mjs`: `24/40 archivos, 520/1000 líneas de producción, 1526/3000 de tests`.

## Checklist

- [x] **Ruta.** La completa, que es la que pide un cambio de dinero.
- [x] **Trazabilidad R1–R14.** Cada R tiene un test concreto que lo prueba de verdad (tabla abajo).
- [~] **Tasks.** T1.1–T4.3 están en `[x]`. **T4.4 (`./init.sh` y E2E) sigue en `[ ]`** porque el leader la mandó a CI. Ver H1.
- [x] **Tamaño.** 24/40 archivos, por debajo del 80%.
- [x] **Archivos esperados.** Los 24 archivos de código y tests del diff son exactamente los 18 de producción y los 6 de tests de `tasks.md > Archivos esperados`. Los otros 5 son el spec y la bitácora.
- [x] **`design.md > Lo que ya existe`.** La tabla está y tiene contenido. El diff no re-crea nada:
  - reutiliza `useMonedaDelPais`/`useImpuestoDelPais`, `formatearMontoEn`, `porcentajeParaVer` y `MarcaAjustado`;
  - no duplica `rotulos-con-impuesto.ts`.
- [x] **Typecheck y lint.** En verde.
- [~] **`./init.sh`, `gate-completo` y E2E de flujo crítico (cierres).** No corridos aquí: quedan para CI (H1).
- [x] **Datos y seguridad.** Sin tablas, queries, migraciones, recursos de Ordenex ni secretos.
- [x] **Sin literales de país ni de moneda en código nuevo.** El único `₡` añadido está en el comentario-ejemplo de `porcentajeDe` (`fila-gestion-labels.ts`), igual que antes. Sin «CRC», «Costa Rica» ni «SINPE».
- [x] **Dependencias.** Ninguna nueva.
- [x] **Permisos.** No hay operación ni ruta nueva (design §6).

## Mapa R → test (comprobado)

Salvo que se diga otro archivo, los tests están en `tests/components/moneda-del-pais-cierres-componentes.test.tsx`.

| R | Test | Comprobado |
|---|---|---|
| R1 | «SLT-244 R1» (l.366–433) | 7 vistas de la cola en tres montajes, con `compruebaImportes` y literales a mano («€285 275», «₡285.275»). «—» sin importe. |
| R2 | «SLT-244 R2» (l.439+) | `CifrasCierre` (cifra, métodos, «—»), `Cuenta` (línea y aparte), `DineroCierre` y `MensajerosCierreBodega`. |
| R3 | «SLT-244 R3» (l.683–736) | `pieTextoDe` de mensajero y de bodega con literales («Declarado €96 500»); `notaOrigenIngresoBodega` con «€2 700»; pie montado. |
| R4 | «SLT-244 R4» (l.821–878) | Fila desplegada: columnas y cuatro tarjetas en tres montajes; ganancia; «—» por `data-columna`. |
| R5 | «SLT-244 R5» (l.880–941) | «2 % de €25 000»; «3,5» con `MONEDA_CR` y «3.5» con la de prueba; modelo viejo «IGV flete (13 % de €4 000)»; «Ver cómo se calculó» montado. |
| R6 | «SLT-244 R6» (l.534–598, 738+, 943+) | Las 14 funciones de design §5 con «IGV» y con «IVA», literales a mano; detalle y fila montados. |
| R7 | «SLT-244 R7» (l.1095–1194) | Factoría con la moneda de prueba («Monto fijo €3 500 · …», «2 % de €25 000 · …»); las demás celdas y las claves, iguales; `libroGestiones`; `DescargarGestionesDialog` montado en tres montajes. |
| R8 | `llamadasSinPais` (l.971–988) | 6 `@ts-expect-error`; el typecheck en verde los valida (si sobrara uno, `tsc` fallaría). |
| R9 | `compruebaCostaRicaYCaida` en cada caso montado; las funciones con «IVA» | También las 3 suites que ya existían, sin cambiar ningún valor esperado (ver R11). |
| R10 | Montaje «sin proveedor» = `formatearMontoEn(MONEDA_PLATAFORMA, …)` | En todos los casos montados. |
| R11 | Diff (abajo) | Ver la sección R11. |
| R12 | `moneda-del-pais-pantallas.test.tsx` (censo R18 con los 14 y el caso «SLT-244 R12») + censo de la carpeta (l.1243–1300) | Lee la carpeta del disco, comprueba que no está vacía y tiene contraprueba (15 rojos, 8 verdes). |
| R13 | Censo de la carpeta (l.1221–1300) | «IVA», `IMPUESTO_ROTULO`, `porcentajeParaVerEnLaPlataforma(` y los 7 rótulos con «IVA», todo fuera de comentarios. |
| R14 | «SLT-244 R14» (l.1302–1315) | `filter(ficha === "SLT-244")` da `[]`. `TOPE_EXCEPCIONES` `toBeLessThanOrEqual(12)` y la lista no pasa del tope. |

## Puntos que pidió el leader

1. **Trazabilidad.** Correcta, ver la tabla.
2. **Archivos.** Los 24 están dentro de «Archivos esperados», sin extras.
3. **R11.**
   - `cierre-detalle-shared.tsx`: solo cambian el import de `IMPUESTO_ROTULO` (l.23) y las tres constantes (l.465–482), cada una con su función. No hay nada más en el diff.
   - `cierre-labels.ts`:
     - `FLETE_DEV_CON_IVA_LABEL` y `FLETE_NO_ENTREGADAS_CON_IVA_LABEL` quedan como `fn(IMPUESTO_ROTULO)` (l.187, l.195);
     - `ivaFleteNoEntregaLabel` y `fleteDevConIvaDeGestion` conservan su firma y delegan con `IMPUESTO_ROTULO`;
     - el texto se mantiene, y un test lo afirma (l.580–597).
   - Los tres tests que ya existían:
     - `detalle-cierre-vista.test.ts`: 35 llamadas, solo cambian las llamadas;
     - `fila-gestion-vista.test.ts`: 27 llamadas, ídem;
     - `cierres-gestiones-modelo-nuevo-descarga.test.ts`: 8 `libroGestiones` y 3 llamadas a la factoría, ídem.
     - Cada `-`/`+` difiere solo en el argumento `PAIS_PLATAFORMA`/`moneda`, o en la factoría; ningún literal esperado cambia.
   - En el resto:
     - no hay sumas ni restas nuevas, ni cambios de qué importe va en cada sitio;
     - las claves con «iva» (`fleteConIva`, `ivaFlete`…) siguen igual;
     - `cierre-factura.tsx`, la wallet, la plataforma, las órdenes y los encabezados de descarga quedan fuera del diff.
4. **Desviación `columnasTablaPropia(acciones, moneda)` / `columnasTablaPropiaMovil(moneda)`.** **Aceptable.**
   - Design §3 lo prevé: «Si una celda se arma en una función que no es componente (`celda(c, id)`), recibe la moneda del componente que la llama».
   - No son componentes y no pueden leer el hook. No cambia la firma de ningún componente.
   - El único llamador es `ColaCierres.tsx:346`, que lee el hook.
   - El test de R1 cubre las dos variantes, escritorio y teléfono.
5. **Sin `MONEDA_PLATAFORMA` provisional en la descarga.** Confirmado:
   - Grep: 0 apariciones de `MONEDA_PLATAFORMA` en `cierres-gestiones-modelo-nuevo-descarga*.ts` y en `DescargarGestionesDialog.tsx`;
   - 0 «provisional» en esos archivos y en `components/private/cierres/**`;
   - sin `money(` fuera de comentarios.
6. **Guardias.**
   - `columnas-sensibles.guardia` está en verde con la factoría, sin tocarla.
   - `pais-sin-literales`:
     - `TOPE_EXCEPCIONES = 12`, sin editar el archivo de excepciones;
     - la guardia usa `toBeLessThanOrEqual(TOPE_EXCEPCIONES)`;
     - el test nuevo usa `toBeLessThanOrEqual(12)`, coherente con las rebanadas que bajen el tope.
   - El caso R18 de SLT-243 (`slice(i, i + 10)`) sigue en verde.

## Hallazgos

- **H1 (condición de cierre, no es un defecto del código).** T4.4 sigue en `[ ]`: no hay constancia de `./init.sh`, `gate-completo` ni de los E2E afectados en `progress/impl_SLT-244.md`.
  - Los E2E afectados son el grupo `dinero`, `cierres-rediseno`, `cierre-modelo-nuevo-plan-porcentual`, `cierres-admin`, `cierre-dia` y `cierre-bodega-satelite`.
  - `docs/perfil-agentes.md > reviewer` lo marca como bloqueante («PR que toca pantallas o dinero sin constancia de los E2E afectados corridos en local»).
  - El leader los mandó a CI, como en SLT-243, y la memoria del proyecto dice «gate en CI, no local».
  - Lo dejo como **condición**: la feature no pasa a `done`, y no hay aviso «listo para mergear», hasta que `gate-completo` y esos E2E estén en verde, anotados en la bitácora y con T4.4 en `[x]`.
  - Si el humano no acepta ese desvío de la regla de E2E en local, esto pasa a BLOQUEANTE.
- **H2 (menor).** Quedan comentarios obsoletos en archivos de la carpeta que el diff no toca. Dicen que el importe «lo pinta `money()`», y ahora es `formatearMontoEn` con la moneda del país.
  - `components/private/cierres/cola/cola-cierres-labels.ts:45` («Pendiente ₡47.500». El importe lo pinta `money()`)
  - `components/private/cierres/cola/cola-cierres-vista.ts:3`
  - `components/private/cierres/cola/cola-propia-vista.ts:5` y `:146` («lo pinta `money()` en `CifrasCierre`»)
  - Los censos no los marcan, porque leen el fuente sin comentarios. No afectan a la conducta.
  - Arreglarlos suma 3 archivos fuera de «Archivos esperados». Se puede dejar como deuda o como seguimiento de la poda (SLT-146).
- **H3 (menor, informativo).** Hay líneas JSX largas tras la sustitución, por ejemplo `formatearMontoEn(moneda, c.totales.general, SIN_MONTO_RAYA)` dentro de `<span>` en `ColaCierres.tsx` y `TablaColaPropia.tsx`. El lint no lo marca; es solo estético (mismo caso que H4 de SLT-243).

## Veredicto

**OK (APROBADO).** No hay bloqueantes en el código, la trazabilidad, el alcance ni las guardias.

Queda la condición H1: no se cierra la feature ni se avisa «listo para mergear» hasta tener `gate-completo` y los E2E afectados en verde, con T4.4 en `[x]`.
