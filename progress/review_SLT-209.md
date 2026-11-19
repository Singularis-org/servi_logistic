# Review SLT-209 «Ajustes de la ronda de Preview: barra flotante del cierre y botón Terminar recepción»

PR #240 · rama `feature/SLT-209-cierre-barra-flotante` · revisado HEAD `15a54ab6` (igual al remoto) · 2026-11-19.
Ruta directa con revisión completa (toca componentes compartidos). Diff: `git diff origin/dev...HEAD`.

## Checklist

- [x] **Ruta.** Directa, `complexity: low`. El diff no cambia lógica de dinero, permisos, auth,
      integraciones ni webhooks: en Wallet › Satélites solo cambian textos y dónde va la nota (es presentación).
- [x] **Spec (directa).** La bitácora dice qué cambió y con qué test. Los 4 tests nuevos de vitest dan rojo
      con el código de `origin/dev` (repetido aquí, ver abajo).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 14/40 archivos, 134/1000 líneas de producción, 240/3000 de tests.
- [x] **Equipo.** La ficha está tomada (`ce04caaa`, `wt.sh new`) y tiene assignee en `feature_list.json`.
- [x] **Trazabilidad.** `progress/impl_SLT-209.md > Mapa requisito → test` cubre la barra, el ancho del campo, el
      punto 5 y el punto 6.
- [x] **Typecheck.** `pnpm run typecheck`: exit 0.
- [x] **Lint** de los archivos tocados: 0 errores y 1 aviso (menor m1).
- [x] **Guardias.** `pnpm run test:guardias`: 359 archivos y 5376 tests en verde.
- [x] **Tests del diff.** Los 4 archivos tocados: 109/109 en verde.
- [x] **`vitest related`** de los 5 componentes: 440 archivos en verde y 6 en rojo, todos ajenos al diff
      (ver «Rojos ajenos»).
- [x] **E2E afectados**, corridos aquí tras `next build` del HEAD (`NEXT_PUBLIC_APP_URL=http://localhost:3000`, base desechable):
      - `pwa-mensajero-cierre-barra-fija`: 1/1;
      - `cierre-dia`: 4/4, incluido el (d) a 375 px;
      - `recibir-paquetes`: 2/2;
      - `cierre-bodega-satelite`: 7/7, incluido el detalle de bodega de `/cierres-admin` a 390 px. En la 1.ª corrida
        falló el `beforeAll` en `drenarGeocodificacion` (fixture), y aislado pasó entero (menor m6).
- [x] **Datos y seguridad.** Sin tablas, queries, migraciones, secretos, Ordenex ni literales de país o moneda nuevos.
      El texto nuevo dice «la caja», sin nombre de empresa, así que el import de `EMPRESA` sobra y se quitó bien.
- [x] **Dependencias.** Ninguna nueva: `InfoConTexto` reusa el `BotonInfo` (popover de Base UI) que ya existía.
- [x] **Comentarios.** Explican el porqué: el `sticky` contra el relleno y la nota que impide contar dos veces.
- [ ] **Punto 3, tamaño en escritorio:** no cumple el criterio de la revisión (B1).
- [ ] **`./init.sh` en verde en el worktree.** La bitácora da `INIT_EXIT=1`, solo por el cupo frontend del
      `feature_list.json` del leader. Lo cierra el leader, no la rama.

## Comprobaciones pedidas

1. **La barra del cierre a 360 px.** El E2E mide la separación entre el borde visible y la barra, las tarjetas que
   asoman por encima, los puntos ajenos a la barra, el alfa del fondo y el ancho del campo, en la página y en «Ver».
   Antes daba rojo (separación 16, ancho 77/93, según la bitácora) y aquí pasa tras el build.
   - **Escritorio = prod**, comprobado con el script
     `C:/Users/ArqDev/AppData/Local/Temp/claude/aab05f6b97f87a08/2d003bec-e207-4dc1-be9b-6d1a94636296/scratchpad/r209_escritorio.mjs`.
     Quita los tokens `max-md:` y compara `origin/prod`, `origin/dev` y `HEAD`:
     - el panel del modal queda en `flex-1 min-h-0 mt-0 overflow-auto pt-4`, IGUAL en los tres;
     - el contenedor del campo queda en `flex flex-1 items-center min-w-0 relative sm:min-w-[250px]`, IGUAL en los tres.
2. **`/cierres-admin`.** Usa el mismo `DetalleCierre marco="modal"` + `GestionesCierre`, en
   `CierresAdminModule.tsx:1424` y `DetalleCierreBodegaAbierto.tsx:61`, así que el arreglo le llega igual. En
   escritorio no cambia nada: las clases son idénticas desde `md` y `esMovil=false` no monta la barra fija.
   `cierre-bodega-satelite` (detalle a 390 px y vuelta a 1280) está en verde.
3. **«Terminar recepción (n)».**
   - Va debajo de los contadores, en `[data-columna-resumen]`, y no en el header: OK por el test de componente
     y por el E2E.
   - El comportamiento es el mismo: `router.push(volverA)` + `router.refresh()`, con el contador `recibidas`.
   - En el móvil lleva `max-md:h-11` (44 px), comprobado solo por clase.
   - **En escritorio NO mantiene el tamaño de antes:** ver B1.
4. **Wallet › Satélites.**
   - El subtítulo y el texto del (i) son literales exactos.
   - El pie (`role="note"`) ya no está.
   - El (i) es un `<button>` con `aria-label` «Qué significa «Pendiente de conciliar»» y abre al clic o toque:
     el test usa `user.click`.
   - `InfoConTexto` es una envoltura nueva que solo pasa `nombre` y `texto` a `BotonInfo`. `BotonInfo` no cambia,
     así que los (i) de estado siguen igual.
   - Ya no queda ninguna referencia a `SALDO_NO_ES_CAJA_*`.
5. **E2E del punto 6 tras build.** Ningún E2E visita `/wallet/satelites` (la lista) ni asertaba los textos retirados.
   `cierre-bodega-satelite` solo entra en `/wallet/satelites/[id]`. Correr E2E no añade evidencia ni detecta
   regresiones; la evidencia es `tests/integration/wallet-satelites.test.tsx`, que monta el componente real.
   No hace falta para el merge (m4).
6. **Rojo con el código de antes.** Repuse los 6 fuentes de `origin/dev` y corrí los 4 archivos: `4 failed | 105 passed`.
   Cae justo cada caso SLT-209: DetalleCierre, GestionesCierreMovil, RecepcionContinuaPagina y wallet-satelites.
   Lo restauré con `git checkout HEAD --` y el árbol quedó limpio.

## Hallazgos

- **B1 — BLOQUEANTE (punto 3: el tamaño en escritorio cambia).**
  - Antes, «Terminar recepción» era `size="touch"`: `h-11`, 44 px en todos los anchos. La captura 6 de Carlos lo
    muestra así en escritorio.
  - Ahora usa el tamaño por defecto, `h-8` (32 px desde `md`), y el E2E lo fija en 32 (`recibir-paquetes.spec.ts`,
    `toBe(32)`).
  - El criterio de esta revisión dice «en escritorio mantiene el tamaño de antes». La bitácora y
    `progress/features/SLT-209.md > Decisiones` atribuyen los 32 px a Carlos o al coordinador (2026-11-18), pero no
    hay fuente verificable. `progress/investigacion-SLT-202.md:156` lo dejaba como pregunta abierta: «hay que
    preguntar a Carlos si también la quiere a 32 px».
  - **Para cerrarlo hay una de dos salidas:**
    - **(a)** Devolver los 44 px de escritorio (`size="touch"` o `h-11` a todo ancho) y actualizar el test de
      componente y el E2E (`toBe(44)`).
    - **(b)** El leader confirma por escrito que Carlos pidió 32 px en escritorio. En ese caso basta anotar la
      fuente en la ficha y el hallazgo se levanta sin tocar código.
- **m1 — menor.** `e2e/pwa-mensajero-cierre-barra-fija.spec.ts:53`: el parámetro `lista` de `medir` no se usa
  (aviso de lint `no-unused-vars`). Quitarlo o usarlo.
- **m2 — menor.** El subtítulo se comprueba contra la constante `SATELITES_PAGINA.descripcion`, no contra la página
  renderizada. `page.tsx:65` la usa, así que hoy vale, pero el test no vería que la página dejara de pintarla.
- **m3 — menor.** Los 44 px del móvil de «Terminar recepción» solo se comprueban por clase (`max-md:h-11`). Ningún E2E
  mide el botón a 360 px.
- **m4 — menor.** Ningún E2E recorre `/wallet/satelites`, que es un flujo crítico de dinero
  (`docs/checkpoints-proyecto.md`). El cambio es de copia y de un popover, cubierto por el test de integración del
  componente real. Puede ir como deuda, no para este PR.
- **m5 — menor.** El título de `progress/features/SLT-209.md` y de `progress/impl_SLT-209.md` («Cierre del mensajero: la
  barra … flota sobre la lista») no es el de `feature_list.json` («Ajustes de la ronda de Preview: …»).
- **m6 — menor, ajeno.** La 1.ª corrida de `cierre-bodega-satelite` falló en el `beforeAll`: `drenarGeocodificacion`
  pasó 15 veces por `procesar-jobs` sin el fallo de geocodificación esperado. Aislado pasó 7/7. Con
  `failOnFlakyTests`, en CI sería rojo: va a una ficha `chore/`, no a esta.

## Rojos ajenos (no son hallazgos de esta feature)
`vitest related` dio rojo en 6 archivos de `tests/integration/db/` que **no** están en `tests/baseline-rojos.json`:

| Archivo | Tests en rojo |
|---|---|
| `libro-caja-filtro-a-quien` | 16 |
| `libro-caja-revision-458c` | 8 |
| `libro-caja-revision-458e` | 6 |
| `wallet-anulacion-458` | 10 |
| `wallet-documento-comprobante-458` | 5 |
| `wallet-registro-comprobante-458` | 9 |

- **Causa:** el escenario 459 recibe `validation_error` al aprobar el cierre: «Esta gestión no pertenece a lo que vuelve
  en este cierre».
- **Son de `dev`, no de esta rama:** el diff no toca `lib/` ni `db/`, y `libro-caja-revision-458e` da el mismo
  `6 failed` con los fuentes de `origin/dev`.
- **Aviso al leader:** si también salen en CI, ponen en rojo `gate-completo` en cualquier PR.

## Veredicto
**RECHAZADO**, solo por B1. El resto (barra, ancho del campo, `/cierres-admin`, escritorio = prod, Wallet › Satélites,
rojo-antes/verde-después y E2E afectados) está verificado y en verde. Si el leader confirma la decisión de los 32 px
(B1-b), el veredicto pasa a OK sin cambios de código.

## Vuelta 2 (acotada a 287ee157..b79aefcb)

Diff de la vuelta: solo `progress/features/SLT-209.md` (+6 líneas, la fuente de B1). No toca código ni tests.

- [x] **B1, levantado (salida b).** La ficha anota la fuente de los 32 px de escritorio: la regla general de Carlos
  del 2026-11-18 («necesito que esté igual a como están en producción en tamaño»; «en pwa está bien el tamaño»).
  - Es coherente con `origin/dev:progress/features/SLT-202.md > Decisiones`, línea 18: «Escritorio = tamaños de
    prod. La PWA del mensajero en móvil conserva los 44 px (`max-md:`)».
  - «Terminar recepción» no existe en `origin/prod`: `git grep` no da resultados, porque nace con el modo continuo
    de SLT-159.
  - El tamaño `default` de `components/ui/button.tsx` en `origin/prod` es `h-8`, 32 px. Es el que usa ahora el
    botón desde `md`, y en el móvil sigue `max-md:h-11`. El E2E `toBe(32)` fija justo eso.
- **m1, sigue abierto (menor).** `e2e/pwa-mensajero-cierre-barra-fija.spec.ts:47`: el parámetro `lista` de `medir`
  sigue sin usarse. No lo cambio: el reviewer no edita tests. Lo puede quitar el implementer o quedar como menor.
- **m7, nuevo y menor.** La nota de B1 quedó bajo `## Cierre`, después de «Pendiente.», y no bajo `## Decisiones`.
  El contenido vale; solo está en otra sección.
- **Sin regresiones:** el diff no toca código, así que no hay nada que volver a correr.

### Veredicto vuelta 2
**OK.** No queda ningún bloqueante. Siguen abiertos los menores m1 a m7, ninguno es para el merge.
