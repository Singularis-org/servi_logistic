# SL-20 · tanda T3 (T3.1–T3.3) + T6.2 · backend_dev

Fecha: 2026-10-26. Alcance: solo código puro, sin base de datos. T3.4 no se ha tocado (depende de T1).
MCP `codebase-memory-mcp` no usado: el worktree no está indexado (design «Lo que ya existe»); Grep/Read.

## Tasks cerradas
- [x] T3.1 opción `textoLiteral` en el parser.
- [x] T3.2 `validarCodigo` (R17).
- [x] T3.3 contrato y `planificarDivision` (R25–R27; altas y resumen de R24).
- [x] T6.2 test de R18.

## Archivos
Modificado:
- `lib/parsers/spreadsheet.ts`: tercer parámetro opcional `opciones: { textoLiteral?: boolean }`. Con él,
  el CSV se lee con `csv.read(stream, { map: (v) => v })` (verificado en
  `node_modules/exceljs/lib/csv/csv.js`: el `map` por defecto hace `Number()` y detecta fechas). XLSX
  no cambia. Además, `ParsedSpreadsheet` gana `numerosDeFila: number[]` (ver «Decisiones»).

Nuevos:
- `lib/utils/codigo-geografico.ts`: `ReglaDeCodigoDePais`, `tieneReglaDeCodigo`, `validarCodigo`, `CODIGO_LIBRE_MAX`.
- `lib/types/division-csv.ts`: `COLUMNAS_DIVISION`, `FilaDivision`, `ErrorDeLinea`, `ResumenCarga`, y la
  entrada y salida del plan: `NodoExistente`, `ArbolExistente`, `RefNodo`, `AltaDePlan`, `CodigoACompletar`,
  `PlanDivision`, `ResultadoPlanificacion`.
- `lib/utils/division-csv.ts`: `planificarDivision(filas, arbolActual, pais)`.
- `tests/unit/parsers/spreadsheet-texto-literal.test.ts`
- `tests/unit/utils/codigo-geografico.test.ts`
- `tests/unit/utils/division-csv.test.ts`
- `tests/unit/api/openapi-geografia-sin-cambios.test.ts`
- `specs/SL-20-pais-geografia-configurable/tasks.md`: solo los checkboxes de T3.1, T3.2, T3.3 y T6.2.

## Decisiones tomadas dentro del design (las revisa el leader)
1. **`numerosDeFila` en el parser.** R25 pide el número de línea de cada error, pero el parser descarta
   las filas vacías y `rows[i]` ya no dice en qué línea estaba la fila. Por eso añado un array paralelo
   con el `rowNumber` de exceljs; la cabecera es la fila 1. Es aditivo: ningún consumidor actual lo
   lee, y la carga masiva sigue igual (sus tests pasan). Una salvedad: si un valor entre comillas trae
   un salto de línea, el número cuenta registros, no líneas físicas.
2. **No adelanto T2.1 (`lib/types/pais.ts`).** `validarCodigo` y `planificarDivision` reciben un tipo
   estructural mínimo, `ReglaDeCodigoDePais` (`digitosCodigoNivel1/2/3: number | null`). Lo cumplen
   tanto la fila Prisma del país como el futuro `PaisDTO`, siempre que conserven esos nombres en
   camelCase.
3. **`arbolActual` es una lista plana por nivel** (`ArbolExistente = Record<Nivel, NodoExistente[]>`,
   con `id`, `nombre`, `codigo`, `activo` y `padreId`) y no el DTO en árbol de T4.1, que todavía no
   existe. T3.4 tendrá que producirla.
4. **Las altas del plan llevan una `clave`, no un id.** El padre se indica con
   `RefNodo = {tipo:"existente", id} | {tipo:"nuevo", clave}`, y así la función queda pura. El design
   dice «ids generados en la app» y eso sigue siendo así: `importarDivision` (T3.4) traduce cada clave
   a un uuid.
5. **La regla R17 se aplica en una segunda pasada.** Así el código del padre puede venir en una línea
   posterior a la del hijo. Solo se validan los códigos que se van a escribir: los de las altas y los
   que se completan. Un código heredado que ya está en la base y que la fila repite tal cual no se
   revalida.
6. **Un nodo con su código completado cuenta en `existentes` y también en `codigosCompletados`.**
7. **Una fila con un error deja de procesar sus niveles inferiores**, para no encadenar errores falsos.
   Los errores salen ordenados por línea.

## Mapa R<n> → test
| R | Test (archivo › nombre) |
|---|---|
| R17 | `tests/unit/utils/codigo-geografico.test.ts` › «acepta los codigos reales de CR con su prefijo», «rechaza un codigo con un numero de digitos distinto del de su nivel», «rechaza un hijo cuyo codigo no empieza por el de su padre», «rechaza el codigo de un hijo cuyo padre no tiene codigo», «la regla sale de los datos: otro pais con 2/4/6…», «acepta cualquier texto de 1 a 20 caracteres sin espacios…», «rechaza un codigo vacio, con espacios o de mas de 20 caracteres» |
| R17 (en la carga) | `tests/unit/utils/division-csv.test.ts` › «aplica R17 con la regla del pais y cita la columna del codigo» |
| R18 | `tests/unit/api/openapi-geografia-sin-cambios.test.ts` › «CargaRow (objeto TS) exige y declara la terna…», «CotizacionRow (objeto TS)…», «el espejo yaml declara la misma terna…», «ningun artefacto introduce claves neutras…», «las tablas siguen siendo provincia, canton y distrito», «la orden sigue apuntando a la geografia con provincia_id…» |
| R24 (plan/resumen, parte pura) | `division-csv.test.ts` › «crea los tres niveles con su codigo y cuenta por nivel…», «un padre nuevo del mismo archivo es el padre de sus hijos, por su clave», «con nivel_3 y su codigo vacios no se crea distrito ni hay error» |
| R25 | `division-csv.test.ts` › «nivel_1 y nivel_2 son obligatorios; un codigo sin su nombre es un error», «aplica el contrato de nombre del alta a mano…», «un codigo_nivel_3 sin nivel_3 es un error de esa linea», «los errores salen ordenados por linea…», «basta un error entre muchas filas buenas para que no haya plan»; línea de origen: `spreadsheet-texto-literal.test.ts` › «devuelve el numero de fila de origen…» |
| R26 | `division-csv.test.ts` › «un nodo que ya existe … no se crea ni se toca», «a un nodo existente sin codigo se le completa el de la fila, y solo eso», «un nodo existente con otro codigo es un error…», «un codigo que en la base ya es de otro nodo…», «un codigo de la base en un nodo de mismo nombre pero otro padre es un error», «un nodo retirado sigue retirado…», «un hijo nuevo bajo un padre existente cuelga de su id» |
| R27 | `division-csv.test.ts` › «una fila repetida (o que repite su provincia) se cuenta una sola vez», «mismo nodo con dos codigos distintos: error en la segunda linea citando la primera», «mismo codigo, en el mismo nivel, para dos nodos distintos…», «el mismo codigo en niveles distintos no es contradiccion…» |
| T3.1 (riesgo §12) | `spreadsheet-texto-literal.test.ts` › «con textoLiteral, «01» y «10101» llegan como texto…», «…no se convierte en fecha», «contraprueba: sin la opcion…», «…comillas, comas internas, recorte y filas vacias descartadas» |

R24 completo (la escritura transaccional), R25 sin escritura y R28 quedan para T3.4 (service e
integración).

## Salida real
`pnpm exec vitest related --run lib/parsers/spreadsheet.ts lib/utils/codigo-geografico.ts lib/utils/division-csv.ts lib/types/division-csv.ts tests/unit/parsers/spreadsheet-texto-literal.test.ts tests/unit/utils/codigo-geografico.test.ts tests/unit/utils/division-csv.test.ts`
```
 Test Files  6 passed (6)
      Tests  73 passed (73)
```
Esos 6 archivos incluyen los de la carga masiva que usan el parser: `tests/unit/parsers/spreadsheet.test.ts`,
`tests/integration/carga-masiva-plantilla-roundtrip.test.ts` y `carga-masiva-errores-roundtrip.test.ts`.
En una primera pasada, `plantilla-roundtrip` falló con `Cannot find module '.prisma/client/default'`
porque el cliente Prisma aún no estaba generado en el worktree. Lo generó después la tanda T1 y ya
pasa.

`pnpm exec vitest run tests/unit/api/openapi-geografia-sin-cambios.test.ts`
```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
Para este test no pude usar `vitest related`: el proceso se queda sin memoria (`FATAL ERROR: ... out
of memory`). No es cosa de este archivo: pasa lo mismo con `vitest related --run
tests/unit/api/openapi-374-nodo-retirado.test.ts`, que ya existía. Corrí el archivo directamente con
`vitest run`.

`pnpm run typecheck` (con el heap por defecto se queda sin memoria, así que lo corrí con
`NODE_OPTIONS=--max-old-space-size=8192`)
```
scripts/demo-qa/receta.ts(268,5): error TS2322: Type '{ codigoDta: string; }' is not assignable to type 'DistritoWhereUniqueInput'.
scripts/demo-qa/receta.ts(272,49): error TS2551: Property 'canton' does not exist on type '{ ... paisId: string; codigoDta: string | null; }'. Did you mean 'cantonId'?
scripts/demo-qa/receta.ts(272,87): error TS2551: (idem)
```
Los 3 errores son de la tanda T1 en curso (`codigoDta` ha dejado de ser único global; lo arregla T6.4)
y no los he tocado. Ninguno está en mis archivos.

`pnpm run lint`: `✖ 231 problems (0 errors, 231 warnings)`. Ningún aviso es de mis archivos.

## Preguntas abiertas
1. **Aviso de columnas de más (§6).** El design dice que la respuesta avisa de las columnas que se
   ignoran, pero no fija el campo. No lo he puesto en `ResumenCarga`, porque §5 lo limita a
   `{creados, existentes, codigosCompletados}`. Que lo decida T3.4 o el humano.
2. **Dos nodos de la base con el mismo nombre normalizado bajo el mismo padre.** Puede pasar con datos
   heredados, porque el único de la base compara el nombre exacto. `planificarDivision` se queda con
   el primero. Si se prefiere que sea un error, hay que decirlo.
3. **Altas nuevas bajo un padre retirado.** La carga las permite, porque §6 no dice nada. Si deben
   rechazarse, hay que decirlo.
4. **`numerosDeFila` en el parser** (decisión 1): falta confirmar que es aceptable tocar el tipo
   compartido de forma aditiva.

Veredicto: T3.1, T3.2, T3.3 y T6.2 hechas y en verde. Los únicos rojos, de typecheck, son de T1 y de T6.4.
