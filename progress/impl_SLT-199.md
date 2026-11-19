# impl SLT-199 «Planes: diseño de la factura y anexo de movimientos en PDF»

## Tanda 1 (T1.1, T1.2) — backend_dev, 2026-11-18

### Archivos
- `lib/facturas-plataforma/pdf-comun.ts` (nuevo, `git mv` desde `pdf.ts`): +387. `Lienzo` ampliado, `COLORES`,
  `MEDIDAS`, cabecera con barra degradada recortada a la banda, tarjetas en N columnas, título de sección, tabla
  con cabecera repetida y filas alternas, fila de aviso, fila de total, banda de total, nota, pies; `texto()` en
  Helvetica con respaldo por texto entero a `fuenteEtiqueta`.
- `lib/facturas-plataforma/pdf.ts` (reescrito): +66 −307. Compone la factura de SLT-136 con los componentes
  (tres columnas de tarjetas, `money()`); el diseño nuevo es T2.1.
- `lib/facturas-plataforma/resumen.ts`: +77 −8. `importeDocumento`, `cantidadVisible` con espacio,
  `tarifaDeLaFactura`, textos del anexo, `notaTarifa`, `notaMoneda`, `desglose.notaAnexo`,
  `nombreArchivoFactura(numero, empresa, "factura" | "anexo")`. `excel` y `desglose.nota` (Excel) siguen hasta T2.1/T4.2.
- `components/shared/facturas/DescargarFactura.tsx`: +4 −2. Ajuste mínimo a la firma nueva; el Excel conserva
  `factura-<n>-<empresa>.xlsx` hasta T4.1.
- Tests: `tests/unit/facturas-plataforma/pdf-comun.test.ts` (nuevo, +168), `resumen.test.ts` (+74 −8).

### Tokens (de `docs/referencias/Factura-1-Ordenex*.pdf`, leídos del content stream; 1 px = 0,2646 mm)
- Colores: noche 20,18,48 (banda y banda de total); tinta 30,27,75 (cabecera de tabla, texto); gris 109,106,138;
  grisClaro 169,166,201 (antetítulo); textoPie 56,55,71; violeta 124,58,237 (filete del total); rojo 190,24,93;
  verdeAzulado 14,116,144; fondoTarjeta 245,243,255 (y fila de total); bordeTarjeta 232,230,245; fondoFila blanco;
  fondoFilaAlterna 251,250,255; linea 237,235,250; rosa 245,208,254 (cliente y «TOTAL A PAGAR»); degradado
  34,211,238 → 124,58,237 → 236,72,153 (patrón /P9 y /P14 de la referencia).
- Medidas: banda 24,6 + barra 1,3 mm dentro de los márgenes, radio 2,6; logo 32,8 mm de ancho a 5,8 del borde;
  tarjeta 15,1 de alto, radio 2,1, separación 2,6; cabecera de tabla 7; fila compacta 4,4 (7,4 pt, anexo) y amplia
  9,6 (12 pt, factura); banda de total 15,6, radio 2,1; aire sobre un título 6,5; límite de contenido 279; pie a
  290,6, 7 pt, sin filete (la referencia no lo tiene).

### Mapa R → test (Tanda 1)
| R | Test |
|---|---|
| R2 | `pdf-comun.test.ts` «SLT-199 R2 — Helvetica, y la fuente embebida…» (4 casos) |
| R3 | `resumen.test.ts` «SLT-199 R3 — los importes de los PDF» |
| R4 | `resumen.test.ts` «SLT-199 R4 — las cantidades de los PDF» |
| R5 | `pdf-comun.test.ts` «SLT-199 R5 — tabla partida…» (cabecera por página, 120 filas sin pérdida ni duplicado, fondos alternos, «Página x de y») |
| R6 | `pdf-comun.test.ts` «SLT-199 R6 — cabecera y barra degradada» |
| R11, R12 (textos) | `resumen.test.ts` «SLT-199 R11, R12 — textos de las notas» |
| R24 | `resumen.test.ts` «SLT-199 R24 — el nombre de los archivos» |
| R26 | `resumen.test.ts` «SLT-199 R26 — la tarifa sale de los movimientos» |

### Salida
- `pnpm exec vitest run tests/components/DescargarFactura.test.tsx tests/unit/facturas-plataforma/`: 5 archivos,
  69 tests, 0 fallos.
- Guardias de dinero y país (`dinero-centimos-cuando-existen`, `pais-sin-literales`, `tests/guards/`): 26 archivos,
  332 tests, 0 fallos.
- `pnpm run typecheck`: limpio. `pnpm exec eslint lib/facturas-plataforma tests/unit/facturas-plataforma
  components/shared/facturas/DescargarFactura.tsx`: limpio.

### Tamaño
El `git mv` no ahorra líneas: `tamano-pr.mjs` usa `git diff --numstat` y git solo empareja un renombrado si la ruta
de origen desaparece; `pdf.ts` sigue existiendo, así que `pdf-comun.ts` cuenta entero (+387) y `pdf.ts` −307. Tras
la Tanda 1 la producción suma +534 −317 = 851 de las 1 000.

Veredicto: Tanda 1 en verde; el presupuesto de 1 000 líneas no alcanza para T2–T5 tal como está el diseño.

## Parada por tamaño (implementer, 2026-11-18)

- Tras la Tanda 1, `node scripts/tamano-pr.mjs`: «AVISO: … 6/40 archivos, 851/1000 lineas de produccion, 250/3000 de tests».
- El `git mv` no ahorra: `pdf.ts` sigue existiendo, así que `pdf-comun.ts` cuenta +387 y `pdf.ts` +66 −307.
- Proyección con T2.1, T3.1, T4.x y T5.1: ~1 300 líneas de producción. Pasa claramente del tope.
- Parado antes de la Tanda 2, como pide el leader. Corte de reserva: `design.md §12` (rebanada A / B).

## Tandas 2 y 3 (T2.1, T3.1, T3.2) — backend_dev, 2026-11-18

### Commits y archivos (+/−)
- `c53dd394` T2.1: `pdf.ts` +75 −48 (rediseño, firma igual); `pdf-comun.ts` +20 −8 (`celdaImporte` y `Celda.abarca`);
  `resumen.ts` −1 (`desglose.nota` del Excel, sin uso: typecheck limpio); `tests/.../pdf.test.ts` reescrito +150 −109;
  `tests/.../_pdf-leido.ts` nuevo +80 (lectura de texto con color, rectángulos, `tras`).
- `8ab6ba59` T3.1: `lib/facturas-plataforma/anexo.ts` nuevo +101; `tests/.../anexo.test.ts` nuevo +217.
- `5979ae77` T3.2: `pdf-comun.test.ts` +55 −23 (caso R1; sus lectores locales pasan a `_pdf-leido.ts`);
  `_pdf-leido.ts` +34 (`figurasRellenas`: también los trazados redondeados, que jsPDF no dibuja con `re`).
- `node scripts/tamano-pr.mjs`: 10/40 archivos, 1042/1000 líneas de producción (aceptado ~1300), 872/3000 de tests.

### «Periodo» y «Período» (texto literal de `requirements.md`)
- Factura, tarjeta: «Período facturado», con tilde. R9: «“Período facturado” y “Fecha de emisión (cierre)”».
- Anexo, línea bajo las tarjetas: «Periodo facturado: …», sin tilde. R17: «la línea “Periodo facturado: <primer día>
  al <último día>.”». Es la grafía de la referencia del anexo; no se unifica.

### Medición del anexo con 3 000 movimientos (T3.1)
`anexo.test.ts` «volumen: 3 000 movimientos», en Node (vitest, este equipo), tres corridas: 1 074, 1 631 y 1 381 ms
para `construirPdfAnexo`; 258 817 bytes (≈253 KiB); 52 páginas. El test fija techos holgados (10 s, 2 MiB). No está
medido en el navegador.

### Decisiones fuera del spec
- Anchos de columna de las tres tablas sacados de la referencia (px del content stream) y llevados al ancho útil A4.
  Las dos tablas de la factura usan la fila amplia (9,6 mm, 12 pt), como la referencia.
- `Celda.abarca` en el módulo común: «Total neto (N movimientos)» ocupa de «#» a «Remisión»; en «#» sola se cortaba.
- «#» del anexo sin espacio de miles («2563», como la referencia): es un ordinal, no una cantidad de R4.
- La nota de la factura (R11) es un solo párrafo con las tres frases, como la referencia.
- En «Reversos de cargos» solo el importe va en rojo (R10); antes iba la fila entera. Las órdenes netas negativas del
  desglose ya no van en rojo: R12 solo pide el importe neto.
- Las cinco decisiones de la Tanda 1 siguen igual.

### Mapa R → test (Tandas 2 y 3)
| R | Test |
|---|---|
| R1 | `pdf-comun.test.ts` «SLT-199 R1 — la factura y el anexo comparten banda, barra, cabecera de tabla y pie» |
| R4 | `pdf.test.ts` «R4: las cantidades de la fila Total con espacio de miles («2 365»)» |
| R5 | `pdf.test.ts` «SLT-199 R5, R13 — paginación y pie»; `anexo.test.ts` «SLT-199 R19, R21 — tabla partida…» |
| R6 | `pdf.test.ts` «R6: sin logo…»; `anexo.test.ts` «R6: sin logo, «Singularis» en texto» |
| R7 | `anexo.test.ts` «SLT-199 R7 — un descuadre no genera el anexo» |
| R8 | `pdf.test.ts` «SLT-199 R8 — A4 vertical, banda con logo y barra degradada» |
| R9 | `pdf.test.ts` «SLT-199 R9 — seis tarjetas en dos columnas y tres filas» |
| R10, R11, R14, R26 | `pdf.test.ts` «SLT-199 R10, R11, R14, R26 — Resumen con tarifa, TOTAL A PAGAR y la nota» |
| R12 | `pdf.test.ts` «SLT-199 R12 — el desglose por día en página nueva» |
| R13 | `pdf.test.ts` «R13: cada página lleva…» |
| R15, R16 | `anexo.test.ts` «SLT-199 R15, R16 — A4 vertical y la cabecera solo en la primera página» |
| R17, R26 | `anexo.test.ts` «SLT-199 R17 — cuatro tarjetas y la línea del período» |
| R18 | `anexo.test.ts` «SLT-199 R18 — la tabla «Movimientos»» |
| R19, R21 | `anexo.test.ts` «SLT-199 R19, R21 — tabla partida, total neto y pie» |
| R20 | `anexo.test.ts` «SLT-199 R20 — sin movimientos» |
| R22 | pendiente: el caso «excel.ts no existe» de `anexo.test.ts` entra con T4.2 |

### Salida
- `pnpm exec vitest run tests/unit/facturas-plataforma/ tests/components/DescargarFactura.test.tsx`: 6 archivos,
  95 tests, 0 fallos.
- `pnpm run typecheck`: limpio. `pnpm exec eslint lib/facturas-plataforma tests/unit/facturas-plataforma`: limpio.
- No se corrieron `./init.sh` ni las guardias (lo pidió el leader).

Veredicto: Tandas 2 y 3 en verde; la factura tiene el diseño nuevo, el anexo existe y R1 se comprueba entre los dos.

## Tanda 4, T4.1 — frontend_dev, 2026-11-18

### Archivos (+/−)
- `components/shared/facturas/DescargarFactura.tsx`: `Documento = "factura" | "anexo"`; los dos caminos leen,
  cuadran (`resumirFactura`), cargan el logo y arman su PDF con `import()`; fuera `XLSX_MIME`, el Excel y el
  `.replace(/\.pdf$/, ".xlsx")` provisional.
- `components/shared/facturas/facturas-vista.ts`: `descarga.factura` «Descargar factura» y `descarga.anexo`
  «Descargar anexo» (fuera `pdf`/`excel`).
- `components/shared/facturas/DetalleDeFactura.tsx`: solo el comentario.
- Tests: `tests/components/DescargarFactura.test.tsx`, `tests/components/DetalleDeFactura.test.tsx`,
  `tests/components/MiPlanModule.test.tsx`, `tests/integration/plataforma-empresa-detalle-page.test.tsx`.

### Mapa R → test (T4.1)
| R | Test |
|---|---|
| R7 | `DescargarFactura.test.tsx` «SLT-199 R7 — … no se genera ninguno de los dos documentos» (los dos botones) |
| R22 | `DescargarFactura.test.tsx` «SLT-199 R22 — el componente ya no ofrece Excel»; `DetalleDeFactura.test.tsx` «R23: una cerrada muestra los dos botones…» (ningún botón /excel/) y «R16, R22, R23: en una cerrada los botones son…» |
| R23 | `DescargarFactura.test.tsx` «SLT-199 R23 — al pulsar…» y «… si la lectura o la generación fallan»; `DetalleDeFactura.test.tsx` «SLT-199 R22, R23 — … solo en una factura cerrada»; `MiPlanModule.test.tsx` «SLT-199 R23: el maestro ve…»; `plataforma-empresa-detalle-page.test.tsx` «SLT-136 R2, SLT-199 R23: …» |
| R24 | `DescargarFactura.test.tsx` «SLT-199 R23, R24 — una descarga que sale bien» (`factura-1-…pdf` y `factura-1-…-anexo.pdf`, `application/pdf`) |

### Salida
- `pnpm exec vitest run` (los 4 archivos): Test Files 4 passed (4), Tests 90 passed (90).
- `pnpm run typecheck`: limpio. `pnpm exec eslint` sobre los 7 archivos tocados: limpio.
- Siguen nombrando el Excel (de T4.2/T5.2, sin tocar): `lib/facturas-plataforma/excel.ts`,
  `tests/unit/facturas-plataforma/excel.test.ts`, `e2e/facturas-plataforma.spec.ts`.

Veredicto: T4.1 en verde; los botones son «Descargar factura» y «Descargar anexo», los dos en PDF.

## Tanda 5 y cierre (implementer, 2026-11-18)

### Archivos (consolidado)
- Producción: `lib/facturas-plataforma/{pdf-comun,pdf,anexo,resumen}.ts`, `excel.ts` (borrado),
  `components/shared/facturas/{DescargarFactura.tsx,facturas-vista.ts,DetalleDeFactura.tsx}`, `docs/architecture.md`.
- Tests: `tests/unit/facturas-plataforma/{pdf-comun,pdf,anexo,resumen}.test.ts`, `_pdf-leido.ts` (lector),
  `excel.test.ts` (borrado), `tests/components/{DescargarFactura,DetalleDeFactura,MiPlanModule}.test.tsx`,
  `tests/integration/plataforma-empresa-detalle-page.test.tsx`, `e2e/facturas-plataforma.spec.ts`.
- Muestras para el humano: `progress/capturas/SLT-199/factura.pdf` (2 págs.) y `anexo.pdf` (3 págs.), factura N.º 7
  con 127 movimientos (fixture, generado con un script fuera del repo). Sin PNG: no hay rasterizador sin dependencias
  nuevas (sin pdfjs-dist ni canvas; el visor de Chrome headless pinta en blanco).

### Mapa R → test
| R | Test |
|---|---|
| R1 | `pdf-comun.test.ts` (caso R1: banda, barra, cabecera de tabla y pie iguales en color, alto y x) |
| R2, R5, R6 | `pdf-comun.test.ts`; además `pdf.test.ts` y `anexo.test.ts` |
| R3, R4 | `resumen.test.ts` (`importeDocumento`, `cantidadVisible`); `pdf.test.ts`, `anexo.test.ts` |
| R7 | `anexo.test.ts`, `DescargarFactura.test.tsx` |
| R8–R14 | `pdf.test.ts` |
| R15–R21 | `anexo.test.ts` |
| R22 | `anexo.test.ts` (excel.ts no existe), `DetalleDeFactura.test.tsx`, `DescargarFactura.test.tsx` |
| R23 | `DescargarFactura.test.tsx`, `DetalleDeFactura.test.tsx`, `MiPlanModule.test.tsx`, `plataforma-empresa-detalle-page.test.tsx` |
| R24 | `resumen.test.ts`, `DescargarFactura.test.tsx`, `e2e/facturas-plataforma.spec.ts` |
| R25 | `e2e/facturas-plataforma.spec.ts` |
| R26 | `resumen.test.ts`, `pdf.test.ts`, `anexo.test.ts` |

### Resultados
- `vitest run tests/unit/facturas-plataforma/ tests/components/DescargarFactura.test.tsx tests/components/DetalleDeFactura.test.tsx`:
  6 archivos, 109 pasados, 0 fallidos (backend_dev, tras T4.2). T4.1: 4 archivos de componentes/integración, 90 pasados.
- `pnpm run typecheck` limpio (cubre `e2e/`); eslint limpio sobre lo tocado; `node scripts/check-perfil.mjs` rc=0.
- Greps de T4.2 (`construirExcelFactura`, `facturas-plataforma/excel`, «Descargar Excel») sin resultados.
- exceljs sigue en uso en otros módulos: `package.json` intacto.
- Tamaño (`node scripts/tamano-pr.mjs`): 20/40 archivos, 1155/1000 líneas de producción, 1212/3000 de tests;
  aceptado por el humano (~1300).

### E2E (T5.2) — NO corrido
- Base `servi_logistic_slt199_e2e` recreada, migrada y sembrada. El `next build` lo detuvo Claude Code por memoria
  baja del sistema (otras sesiones). Procesos huérfanos del build terminados. No se relanzó: falta correr
  `e2e/facturas-plataforma.spec.ts` y `--project=dinero` (script en el scratchpad del implementer:
  base → build; spec; dinero, con `E2E_PUERTO=3044`, `E2E_STORAGE_PUERTO=54339`).

### Rojos del gate rápido corregidos (implementer)
- `sin-nombre-heredado.guardia`: tres comentarios citaban las referencias por su nombre de archivo (con el nombre
  heredado) y un fixture de `resumen.test.ts` usaba esa empresa. Comentarios reescritos sin el nombre; fixture → «Acme».
- `test-citado-desaparecido.guardia`: `specs/SLT-136-…/tasks.md` mapeaba R16/R17 a `excel.test.ts`, borrado en T4.2.
  Se añadió al final de ese `tasks.md` la anotación `<!-- @test-desaparecido … -->` con el motivo (enmienda de
  SLT-199, design §9). Choca con «los archivos de specs/SLT-136 no se tocan» (design §9), pero la guardia solo admite
  arreglarlo en ese archivo; es un comentario HTML, sin tocar requisitos. Lo decide el reviewer/leader.
