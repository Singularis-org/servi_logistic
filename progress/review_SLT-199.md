# Review SLT-199 «Planes: diseño de la factura y anexo de movimientos en PDF» — vuelta 1

Reviewer, 2026-11-18. Diff `origin/dev...HEAD` (06da6d35), PR #236. Ruta completa.

## Verificación ejecutada (en este worktree)
- `pnpm exec vitest run tests/unit/facturas-plataforma/ tests/components/{DescargarFactura,DetalleDeFactura,MiPlanModule}.test.tsx tests/integration/plataforma-empresa-detalle-page.test.tsx`: 8 archivos, 168 tests, 0 fallos.
- Guardias `dinero-centimos-cuando-existen`, `pais-sin-literales`, `sin-nombre-heredado`, `test-citado-desaparecido`: 4 archivos, 92 tests, 0 fallos.
- `pnpm run typecheck` limpio (incluye `e2e/`). `eslint` sobre `lib/facturas-plataforma`, `components/shared/facturas`, `tests/unit/facturas-plataforma`, `e2e/facturas-plataforma.spec.ts`: limpio.
- `node scripts/tamano-pr.mjs`: 20/40 archivos, 1155/1000 de producción, 1212/3000 de tests → AVISO aceptado (`tamano-pr-aceptado` en `progress/features/SLT-199.md`, ~1300).
- `gh pr checks 236`: estatico y cambios en verde; vitest shards y e2e (aislamiento, dinero, reparto) pendientes.
- Colores de las referencias leídos del content stream (pypdf): todos los tokens de `COLORES` salen de ellas, incluidos los «extra» (`grisClaro` 169,166,201; `textoPie` 56,55,71; `bordeTarjeta` 232,230,245). Degradado de la referencia: /P7 (vertical) con corte en 0,5 y /P14 (barra) con corte en 0,45.
- Muestras `progress/capturas/SLT-199/{factura,anexo}.pdf` comparadas con `docs/referencias/Factura-1-Ordenex{,-Detalle}.pdf` (abajo).

## Checklist
- [x] Ruta completa; toca dinero (formato), sin auth/webhooks/migraciones nuevas. Correcto.
- [x] Spec completo (requirements EARS R1–R26, design con `## Lo que ya existe` no vacía, tasks). El diff no re-crea nada de esa lista: `Lienzo` se movió y amplió, `resumirFactura`/`DescuadreDeFactura` no cambian, `imprimible`/`fuenteEtiqueta`/`registrarFuente`/`seguroEnFuenteEstandar` se reutilizan, `money()` intacto.
- [~] Tasks: T1.1–T5.1 `[x]`; **T5.2 y T5.3 `[ ]`** porque el E2E no se corrió en local (memoria). El spec del E2E está escrito y es correcto → pendiente de CI (ver «E2E»).
- [x] Tamaño: aviso aceptado por el humano y anotado.
- [x] Trazabilidad R1–R26 → test concreto (tabla abajo), con tests que comprueban de verdad (texto, color, fuente y geometría leídos del PDF).
- [x] Typecheck, lint, tests relacionados y guardias en verde.
- [x] Sin dependencias nuevas (`package.json` intacto; exceljs sigue en otros módulos).
- [x] Sin literales de país/moneda: `importeDocumento` usa `monedaConfig.simbolo`/`separadorDecimal`; «Montos en …» usa `monedaConfig.currency`/`simbolo`. La guardia de país pasa.
- [x] Formato de importe solo para estos PDF: vive en `lib/facturas-plataforma/resumen.ts`, no en `lib/config/moneda.ts`; la guardia 359 (caminos del dinero) pasa sin tocarla. `cantidadVisible` solo la usan los PDF.
- [x] `₡` con la fuente embebida: `Lienzo.texto()` (`pdf-comun.ts:161-177`) escribe el texto entero con `fuenteEtiqueta` si no es WinAnsi, `imprimible` da «?»; test R2 lo verifica (fuente, texto entero, «??», 3 fuentes, sin Poppins).
- [x] Retiro completo del Excel: `excel.ts` y `excel.test.ts` borrados; `FACTURA_DESCARGA_TEXTOS.excel`, `XLSX_MIME`, botón y textos fuera; e2e sin ExcelJS; `docs/architecture.md` actualizado. Grep sin residuos en `lib/ components/ app/ tests/ e2e/ docs/`. Tests R22 en `anexo.test.ts`, `DescargarFactura.test.tsx`, `DetalleDeFactura.test.tsx`.
- [x] Enmiendas a SLT-136 (design §9): quedan escritas en SLT-199 y en `docs/architecture.md`. Ver menor 1 sobre el comentario en `specs/SLT-136…/tasks.md`.
- [x] Sin referencias a recursos de Ordenex en código: los comentarios citan las referencias sin el nombre de archivo (guardia `sin-nombre-heredado` en verde). El nombre solo aparece en specs/bitácora al citar los archivos de `docs/referencias/` (no es un recurso).
- [x] Datos y seguridad: sin tablas, queries, migraciones ni endpoints nuevos; la lectura y la autorización son las de SLT-136.
- [ ] `gate-completo` en CI: pendiente.

## Trazabilidad R → test
| R | Test |
|---|---|
| R1 | `pdf-comun.test.ts` «SLT-199 R1 — …» (banda, barra, cabecera de tabla, pie: color, alto, x, ancho entre factura y anexo) |
| R2 | `pdf-comun.test.ts` «SLT-199 R2 — …» (4 casos) |
| R3 | `resumen.test.ts` «SLT-199 R3 — …» (0.00, 200.00, 473000.00, negativos, -0.00, forma inválida lanza); `pdf.test.ts`/`anexo.test.ts` |
| R4 | `resumen.test.ts` «SLT-199 R4 — …»; `pdf.test.ts` «R4: … «2 365»» |
| R5 | `pdf-comun.test.ts` «SLT-199 R5 — …» (120 filas); `pdf.test.ts` «SLT-199 R5, R13»; `anexo.test.ts` «SLT-199 R19, R21» |
| R6 | `pdf-comun.test.ts` «SLT-199 R6» (null y PNG inválido); `pdf.test.ts` y `anexo.test.ts` «R6: sin logo…» |
| R7 | `anexo.test.ts` «SLT-199 R7»; `DescargarFactura.test.tsx` «SLT-199 R7 — … ninguno de los dos documentos» |
| R8 | `pdf.test.ts` «SLT-199 R8» |
| R9 | `pdf.test.ts` «SLT-199 R9» (orden por coordenadas, «Emitida», negrita) |
| R10, R11, R14, R26 | `pdf.test.ts` «SLT-199 R10, R11, R14, R26» (columnas, filas, rojo, filete, banda, nota y sus tres variantes) |
| R12 | `pdf.test.ts` «SLT-199 R12» (página 2, Total, nota del anexo, sin movimientos) |
| R13 | `pdf.test.ts` «R13: cada página lleva…» |
| R15, R16 | `anexo.test.ts` «SLT-199 R15, R16» |
| R17 | `anexo.test.ts` «SLT-199 R17» (+ R26 varias/sin) |
| R18 | `anexo.test.ts` «SLT-199 R18» |
| R19, R21 | `anexo.test.ts` «SLT-199 R19, R21» (130 movimientos) |
| R20 | `anexo.test.ts` «SLT-199 R20» |
| R22 | `anexo.test.ts` «SLT-199 R22»; `DescargarFactura.test.tsx` «SLT-199 R22»; `DetalleDeFactura.test.tsx` |
| R23 | `DescargarFactura.test.tsx` (deshabilitar, fallo); `DetalleDeFactura.test.tsx`; `MiPlanModule.test.tsx`; `plataforma-empresa-detalle-page.test.tsx` |
| R24 | `resumen.test.ts` «SLT-199 R24»; `DescargarFactura.test.tsx` «SLT-199 R23, R24»; e2e |
| R25 | `e2e/facturas-plataforma.spec.ts` (maestro: dos PDF, nombres, `%PDF`, relectura del anexo con remisiones y «Total neto (3 movimientos)»; superadmin: factura; en curso sin botones) |

## Comparación visual con las referencias
- **Factura:** estructura, orden y textos coinciden: banda con antetítulo/título/cliente, barra degradada, seis tarjetas 2×3, «Resumen» (Concepto · Cantidad · Tarifa · Importe; reversos en rojo; «Total órdenes» en negrita con filete violeta y tarifa vacía; «Cuota del plan» con «—»), banda «TOTAL A PAGAR», nota de una línea, desglose en página 2 con fila Total y nota del anexo, pie y «Página x de y». Diferencias que pide el spec: Helvetica, «Emitida», «Período» con tilde (R9), «Montos en CRC (₡).», nota de tarifa sin «tarifa global de la plataforma», «2 365» con espacio en el Total, «-» ASCII en lugar de «−».
- **Anexo:** cuerpo igual a la referencia: cabecera solo en la página 1, cuatro tarjetas en una fila («n · ₡…», «n · -₡…»), «Periodo facturado: … Tarifa: … por orden.», «Movimientos», columnas #/Fecha/Tipo/Guía/Remisión/Importe, «Cargo» verde azulado, «Reverso» negrita roja, «—» sin guía, negativos en rojo, cabecera repetida, filas alternas, «Total neto (N movimientos)» con filete, pie «… · Anexo: detalle de movimientos» y «Página x de y». «#» sin miles igual que la referencia («2563»). Filas por página distintas (A4 frente a carta): esperado.
- El logo de las muestras es el rectángulo negro provisional (`lib/config/marca.ts:19`), fuera de alcance.

## Decisiones fuera del spec de la bitácora
- Colores extra (`grisClaro`, `textoPie`, `bordeTarjeta`): salen de la referencia (comprobado en el content stream). Aceptado.
- `FormatoFila` (alto + cuerpo de letra por tabla) en lugar de `altoFila: number`: misma intención (altura fija por tabla, R5), mejor. Aceptado.
- Degradado a tramos iguales: correcto para el filete vertical (/P7, corte 0,5); la barra de la referencia corta en 0,45 (menor 3).
- Clip de la barra a las esquinas redondeadas de la banda: fiel a la referencia. Aceptado.
- Órdenes netas negativas sin rojo: la referencia pinta «-15» en tinta y solo el importe en rojo; R12 solo pide el importe. Aceptado (menor 4 sobre el nombre del test).
- «#» sin miles: es ordinal, no cantidad de R4, y la referencia lo hace así. Aceptado.
- `Celda.abarca` para «Total neto (N movimientos)»: necesario y fiel a la referencia. Aceptado.
- Comentario `@test-desaparecido` en `specs/SLT-136…/tasks.md`: ver menor 1.

## Hallazgos

### Mayores / BLOQUEANTES
Ninguno en el código.

**Condición de merge (no bloquea la review, la exige el proceso):** el E2E afectado (`e2e/facturas-plataforma.spec.ts`, proyecto `dinero`) no se corrió en local; `docs/perfil-agentes.md > reviewer` lo marca bloqueante para un PR que toca dinero. Por indicación del leader se trata como **pendiente de CI**: los jobs `e2e (dinero)` y el resto de `gate-completo` deben quedar en verde antes del merge, y T5.2/T5.3 se marcan entonces. Si el CI falla en el E2E, la feature vuelve al implementer. Que el humano ratifique la excepción a la regla de E2E local.

### Menores
1. `specs/SLT-136-planes-aviso-descarga-factura/tasks.md:235-239` — comentario `@test-desaparecido` añadido a un spec cerrado, contra «Los archivos de `specs/SLT-136-…/` no se tocan» (design §9). Es el único mecanismo que admite la guardia `test-citado-desaparecido`, es un comentario HTML y no toca requisitos; lo doy por bueno, pero el leader debe anotarlo como desviación de §9 en `progress/features/SLT-199.md` (o el humano ratificarlo).
2. `lib/facturas-plataforma/pdf-comun.ts:260` y `:172` — `tarjetas()` fija `setLineWidth(0.26)` una sola vez antes del bucle, y `texto()` lo cambia a 0,18 al escribir un valor con negrita fingida (`₡`). En el anexo, las tarjetas 3 y 4 salen con un borde de 0,18 mm y las 1 y 2 de 0,26 mm. Poner el grosor dentro del bucle (junto a `setDrawColor`).
3. `lib/facturas-plataforma/pdf-comun.ts:120-125` — la barra de la referencia (/P14) pone el violeta al 45 % y no al 50 %; el filete vertical (/P7) sí al 50 %. Diferencia visual pequeña; si se quiere fidelidad, parametrizar el corte.
4. `tests/unit/facturas-plataforma/pdf.test.ts:194` — el título dice «órdenes netas negativas y el importe neto negativo en rojo», pero solo el importe va (y se comprueba) en rojo; la decisión es que las netas NO van en rojo. Renombrar y añadir la aserción de que «-1» no es rojo.
5. `lib/facturas-plataforma/anexo.ts:1-2` — «con el diseño de // el detalle de referencia» («de el»): resto del borrado del nombre del archivo.
6. Antetítulo y «TOTAL A PAGAR» sin el espaciado entre letras de la referencia (`F A C T U R A …`). El spec no lo pide; jsPDF lo admite con `charSpace` si el humano lo quiere.
7. `lib/facturas-plataforma/anexo.ts:92` — `l.y += …` desde fuera del `Lienzo`: mejor un método (p. ej. `espacio(mm)`) para que la composición no toque el cursor a mano. Estilo.
8. R1 pide también igualdad de tarjetas, título de sección, filas alternas, fila de total y banda de total; el test compara banda, barra, cabecera de tabla y pie (lo que fija el design §2). El resto se garantiza por construcción (mismo método), pero no se compara entre documentos.

## Veredicto
**OK (APROBADO)**, condicionado a `gate-completo` en verde en el CI del PR #236, con el job `e2e (dinero)` incluido (R25, T5.2/T5.3). Los menores pueden ir en este PR o en una tanda corta; ninguno bloquea.
