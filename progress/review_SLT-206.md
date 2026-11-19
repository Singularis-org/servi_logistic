# Review SLT-206 «Filtro Tienda duplicado en Recoger y Recolección» — PR #234

Ruta directa, acotada al diff `origin/dev...ab83e7b9`. Refactor sin requisito nuevo: el contrato
siguen siendo R850-R854 de SLT-190.

## Checklist

- [x] **Ruta.** Directa, adecuada: refactor de presentación, sin dinero, permisos, autenticación,
  integraciones ni webhooks. Complejidad baja.
- [x] **Sin cambio visible (escritorio y móvil).** Comparado con origin/dev línea a línea:
  - El hook devuelve las mismas cinco props que antes se pasaban a mano (`filtros` con la misma
    clave y etiqueta, `activos`, `onActivosChange`, `onLimpiarTodo`, `hayFiltrosAplicados` con la
    misma expresión `tienda !== "" || filtrosPuestos.length > 0`). El spread `{...barraTienda}` ocupa
    el mismo sitio en los dos módulos, y ninguna prop explícita lo pisa ni la pisa él (grep: no
    quedan `filtros=`/`activos=`/... sueltos).
  - `control` monta el mismo `<FiltroTienda tienda tiendas onTiendaChange={setTienda} />` con la
    misma condición `filtrosPuestos.includes(FILTRO_TIENDA)`, como `children` de la misma
    `BuscadorFiltros`. `FiltroTienda.tsx` no cambia: mismas clases y textos.
  - `cambiarFiltrosPuestos` (quitar «Tienda» vacía el valor) y `limpiarTodo` son copia literal.
  - Opciones: Recoger pasaba `opcionesTienda(porRecoger)`; ahora `opcionesTienda(porRecoger, [])`
    con un `SIN_ORDENES` constante a nivel de módulo (memo estable). `opcionesTienda` es variádica:
    misma salida. Recolección, idéntica (`porRecolectar, recolectadasHoy`).
  - `fija`, `tactil`, `debounceMs`, `leerDeUrl` y el conmutador de vista no se tocan: el
    comportamiento móvil/escritorio de la barra es el de antes.
  - El filtrado (`filtrarPorTienda(filtrarAsignaciones(...))`) y `buscando` siguen en cada módulo
    sin cambios (R853: contadores y escáner intactos).
- [x] **Los tests nuevos fijan el comportamiento de verdad.**
  - Con `RecogerModule.tsx` y `RecoleccionModule.tsx` revertidos a origin/dev:
    `vitest run RecogerModule.test.tsx RecoleccionModule.test.tsx -t "SLT-206"` →
    `Tests 4 passed | 160 skipped`, EXIT=0. Restaurado con `git checkout HEAD --`; árbol limpio.
  - Mutación repetida del implementer (quitar `if (!siguientes.includes(FILTRO_TIENDA)) setTienda("")`):
    ROJO, 3 fallos (los dos R852 SLT-206 de quitar/volver a poner y el R852 existente de Recoger).
  - Mutación propia (quitar `setFiltrosPuestos([])` de `limpiarTodo`): ROJO, 3 fallos (los dos
    «puesto sin valor ya ofrece Limpiar todo, y este retira el control» y el R852 existente de
    «Limpiar todo»). Restaurado con `git checkout --`.
  - Los tests cubren el caso de limpiar filtros con «Tienda» puesto sin valor, que antes no tenía
    test en ningún módulo, y el de quitar «Tienda» en Recolección, que tampoco lo tenía.
- [x] **R580 de `EscaneoContinuo`.** Añade
  `await waitFor(() => expect(screen.getByLabelText("Número de guía")).toHaveFocus())` antes de
  `user.keyboard`. Es una condición real (el foco que pone `initialFocus` del diálogo), no un sleep;
  si el foco no llegara, el test falla. Las aserciones de R580 (5 llamadas con
  `[[1024],[2048],[4096],[8192],[16384]]`, diálogo abierto, 5 filas) quedan iguales: no se debilita.
  El componente no cambia.
- [x] **Trazabilidad.** Sin R nuevos; el mapa R850-R854 → tests de `progress/impl_SLT-206.md` se
  sostiene (comprobado arriba para R852).
- [x] **Tasks.** Ruta directa sin spec; la tanda está anotada en `progress/features/SLT-206.md`.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 6/40 archivos, 155/1000 de producción, 88/3000 de
  tests.
- [x] **Lo que ya existe.** No re-crea nada: reusa `FiltroTienda`, `filtro-tienda.ts` y
  `BuscadorFiltros`; el hook sigue el patrón de `useFiltroCantonDistrito.ts` en la misma carpeta.
  No hay otro `useFiltroTienda` ni otra copia del estado.
- [x] **Dependencias.** Ninguna nueva.
- [x] **Verificación ejecutable** (con la base desechable `servi_slt206_desechable`):
  - `pnpm run typecheck` → TC=0.
  - `eslint` sobre los 3 fuentes y los 3 tests tocados → LINT=0.
  - `vitest run RecogerModule RecoleccionModule EscaneoContinuo RecoleccionPage` →
    `4 passed (4)`, `186 passed (186)`.
  - E2E (reparto 12/12) y gate rápido: según la bitácora; no los repetí (los corre el CI).

## Hallazgos

Ninguno bloqueante.

- menor: `useFiltroTienda.tsx` vive en `mis-asignaciones/_components` y Recolección lo importa por
  ruta absoluta entre rutas. Es el mismo arreglo que ya tenían `FiltroTienda` y `filtro-tienda.ts`,
  así que no lo empeora; solo lo anoto por si algún día se sube a `components/shared`.

## Veredicto

**OK**
