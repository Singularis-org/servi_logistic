# Review SLT-149 «Fábrica de dobles de ICierresAdminRepository» — vuelta 1

Reviewer, 2026-11-13. Ruta ligera, acotada a `git diff origin/dev...HEAD` (31 archivos: 27 de tests + 4 de docs/progress).
Grafo no consultado: Grep/Read/git sobre el worktree.

## Checklist

- [x] **Ruta.** Solo tests: no toca dinero, permisos, auth, integraciones ni webhooks. La ligera vale.
- [x] **Cero producción.** `git diff --name-only origin/dev...HEAD | grep -E '^(lib|app)/'` → vacío. `tamano-pr.mjs`: 27/40 archivos, 0/1000 de producción, 1023/3000 de tests.
- [x] **Trazabilidad R430-R439.**
  - R430-R433: `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts`. Los defaults esperados están escritos a mano, no leídos de la fábrica. Además, mutación T7.1.
  - R434: mutación T7.2 (interfaz + clase real → un solo archivo rojo).
  - R435, R438, R439: `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts`, que barre el árbol, prueba 8 formas que detecta y 5 que no, y tiene la mutación T7.3.
  - R436, R437: las 24 suites, con la tabla antes/después.
- [ ] **Tasks.** T1-T7 están en `[x]`; **T8 sigue en `[ ]`**. Lo que pide ya está hecho: mapa R→test en el `impl`, R437 contra T3 y `./init.sh` (INIT_EXIT=0 según el leader). Falta marcarla (menor 1).
- [x] **Tamaño.** Por debajo del tope; no hace falta la línea de aceptado.
- [x] **Lo que ya existe.** La sección está en `requirements.md` con el precedente `retenidas-doble.ts`. El diff no re-crea nada.
- [x] **Perfil (reviewer).** Sin tablas, migraciones, literales de país ni Ordenex. Sin dependencias nuevas. Los comentarios explican el porqué (D3, D4, datos fuera de contrato).
- [x] **Verificación ejecutable (mía).**
  - `vitest run` sobre las 2 guardias nuevas y 4 suites migradas (A1, B6, B11, B12): 6 archivos, **159/159**, EXIT=0. Cuadra con el `impl`: 5+16+106+13+14+5.
  - Typecheck, lint e `init.sh` no los repetí: el leader reporta INIT_EXIT=0.

## Puntos pedidos por el leader

1. **R437 (muestra de 7 archivos: A1, A2, A8, B6, B10, B11, B12).** Comparé `git show origin/dev:<archivo>` con el actual:
   - El nº de `expect(` es igual: 293, 74, 62, 20, 24, 19 y 14.
   - El hash de las líneas `describe/it/test` es idéntico en los 7.
   - `git diff ... -- tests/unit/services | grep '^[-+].*expect('` → vacío: ninguna línea de aserción entra ni sale.
   - Nota: el «429/429» del `impl` son **tests**, no `expect(` (la suma de `expect(` está por encima de 1 000). La tabla por fila es correcta; solo la frase del total se presta a confusión.
2. **`lib/` y `app/`:** cero cambios (arriba).
3. **Cast del dato en B6, B11 y B12.**
   - Mantiene lo que miden los tests: los datos son byte a byte los anteriores y solo cambia dónde va el cast. Antes el cast del repositorio entero escondía también los métodos no doblados; ahora el cast solo cubre el dato, con un alias `ReturnType` que lo nombra y un comentario. Es estrictamente más honesto que antes.
   - No esconde un caso nuevo, pero **sí deja vivo uno viejo**: el detalle sin `rechazosDeTienda` ni `pagoIndependienteEfectivo`, y un DTO donde va `CierreGestionDescargaRow`. Los tests recorren un camino `undefined` que el repositorio real no produce.
   - Hoy solo consta en «Abierto» del `impl`, y la nota de cierre de D69 no lo menciona. **Debe ir a deuda** (menor 2) para que no se pierda.
4. **M4 → M4c.**
   - La sustitución es válida. M4 pretendía probar que las suites dependen de la fábrica y no de un literal superviviente (R435-R436). Con `resolverCierre` en `"conflict"` salen 27 rojos en 5 archivos (A6, A7, A8, A10, A11), y lo prueba justo en las suites que usan ese valor por defecto.
   - Para las que sobrescriben, la guardia R438 ya garantiza que no queda ningún literal a mano.
   - Que M4 sobreviviera es coherente: ninguna suite usa el default de `findCierreByIdEnAlcance`. Además, `undefined` en ese default sí lo cazaría el test de completitud: `resolves.toEqual(null)` no acepta `undefined`.
5. **≥ 20 y no == 20: correcto.** La comprobación de cantidad solo protege contra una extracción vacía. Un método obligatorio nuevo ya rompe tres cosas:
   - el typecheck en `porDefecto()`;
   - «cada obligatorio está en la fábrica y es un mock», que lo nombra;
   - «sin fila en la tabla de defaults», que lo nombra.

   Con `== 20` habría que editar el número con cada método, que es justo el punto de contacto que D69 elimina. Queda un desfase de documentación: el spec dice 22 en el inventario y en T2 (menor 3).
6. **Guardias.**
   - Muerden: 8 formas prohibidas detectadas y 2 líneas exactas comprobadas; mutación T7.3 roja en `archivo:línea`.
   - La forma extra (variable anotada con literal, `:\s*(ICierresAdminRepository|alias)\s*=\s*\{`) no da falsos positivos. El barrido del árbol real está verde sin lista de excepciones, y eso cubre los 21 de integración y los 10 de repositorios que usan `= new CierresAdminRepository(...)`. Además, el caso «repositorio real» está en PERMITIDOS.
   - Límite conocido de una guardia de texto: una función tipada que devuelve una variable intermedia (`const r = {…}; return r;`) no se detecta. Se acepta, porque la fábrica tipada es la defensa principal (D6). No es un hallazgo.
7. **D69 cerrada.** Dice lo que se hizo: los 24 dobles, la fábrica, el punto único de rotura, la guardia y lo que queda fuera (`ICierreDiaRepository`/`ICierreBodegaRepository`). Le falta la referencia a los datos fuera de contrato del punto 3 (menor 2).

El rojo de `dependencias-declaradas-presentes` que cita el `impl` ya está registrado como D73. No es de esta rama.

## Hallazgos

1. **menor** — T8 sigue en `[ ]` en `requirements.md > ## Tasks`. Lo que pide está hecho; hay que marcarla antes del PR.
2. **menor** — Registrar una deuda nueva para los datos fuera de contrato de B6, B11 y B12 y citarla en la nota de cierre de D69:
   - el detalle sin `rechazosDeTienda` ni `pagoIndependienteEfectivo`;
   - el DTO en lugar de `CierreGestionDescargaRow`.

   Completarlos cambia lo que pintan esas suites, así que va en una ficha propia.
3. **menor** — El spec dice «22 métodos obligatorios» (inventario y T2) y el interfaz tiene 20. El `impl` lo explica, pero el spec no está corregido.
4. **menor** — El `impl` dice «Total: 429/429», y son tests en verde, no `expect(`. Conviene decirlo así para que nadie lo lea como recuento de aserciones.

## Veredicto

**APROBADO** (OK): sin bloqueantes. Los menores 1-2 conviene resolverlos antes de abrir el PR; el 3 y el 4 son de documentación.
