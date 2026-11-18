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
