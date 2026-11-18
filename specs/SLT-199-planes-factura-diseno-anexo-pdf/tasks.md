# SLT-199 — planes-factura-diseno-anexo-pdf · tasks.md

> Diseño: `design.md`. Requisitos: R1–R26. Ruta propuesta: completa. Sin preguntas abiertas (P1–P3 cerradas el
> 2026-11-18).
>
> - **Reparto:** todo es `lib/facturas-plataforma/` (PDF puro, sin E/S) y `components/shared/facturas/`. Ni `db/`
>   ni `app/api/`.
> - **Cierre de cada tanda:** `./init.sh` (rápido).
> - **Antes del PR:** `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` y el proyecto `dinero` en local
>   (`docs/perfil-agentes.md`), porque toca dinero y una pantalla.
> - `[P]` = paralelizable dentro de su tanda.

## Tanda 1 — Módulo común y formato

- [ ] **T1.1** Crear `lib/facturas-plataforma/pdf-comun.ts` (design §2, §3).
  - Hacerlo con `git mv lib/facturas-plataforma/pdf.ts lib/facturas-plataforma/pdf-comun.ts`, para que el diff
    cuente un renombrado (design §12).
  - Dejar en él `Lienzo`, `COLORES`, `MEDIDAS` y los componentes: cabecera con barra degradada, tarjetas en N
    columnas, título de sección, tabla con cabecera repetida y filas alternas, fila de aviso, fila de total, banda
    de total, nota y pies.
  - `texto()` con Helvetica y la fuente embebida de respaldo por texto.
  - Escribir un `pdf.ts` nuevo que, de momento, componga la factura actual con esos componentes.

  *Hecho:* `tests/unit/facturas-plataforma/pdf-comun.test.ts` en verde (R2, R5, R6) y el `pdf.test.ts` actual
  sigue en verde.
- [ ] **T1.2** `[P]` En `lib/facturas-plataforma/resumen.ts` (design §5):
  - `importeDocumento`;
  - `cantidadVisible` con espacio;
  - `tarifaDeLaFactura` (R26);
  - los textos del anexo, de la nota del desglose y de la nota de la factura (tarifa y «Montos en CRC (₡).» desde
    `monedaConfig`);
  - `nombreArchivoFactura(numero, empresa, documento)`.

  Todavía no se borra `FACTURA_DESCARGA_TEXTOS.excel`: lo usa `excel.ts` hasta la T4.2.
  *Hecho:* `tests/unit/facturas-plataforma/resumen.test.ts` en verde (R3, R4, R24, R26).

## Tanda 2 — La factura

- [ ] **T2.1** Rediseñar `construirPdfFactura` en `lib/facturas-plataforma/pdf.ts` (design §4). Depende de T1.1 y
  T1.2.
  - Cabecera y barra.
  - Seis tarjetas en dos columnas.
  - «Resumen» con Tarifa.
  - Banda «TOTAL A PAGAR» y su nota.
  - Desglose con la nota del anexo.
  - Pie.

  *Hecho:* `tests/unit/facturas-plataforma/pdf.test.ts` reescrito y en verde (R8–R14).

## Tanda 3 — El anexo

- [ ] **T3.1** `lib/facturas-plataforma/anexo.ts` con `construirPdfAnexo` (design §6). Depende de T1.1 y T1.2.
  *Hecho:*
  - `tests/unit/facturas-plataforma/anexo.test.ts` en verde (R7, R15–R21);
  - un caso de 3 000 movimientos mide el tiempo de generación y el peso, y los anota en `progress/impl_SLT-199.md`.
- [ ] **T3.2** El caso R1 de `pdf-comun.test.ts`: la banda, la barra, la cabecera de tabla y el pie de la factura y
  del anexo coinciden en color, altura y x. Depende de T2.1 y T3.1.
  *Hecho:* en verde.

## Tanda 4 — Botones y retiro del Excel

- [ ] **T4.1** El segundo botón pasa a ser el del anexo (design §7). Depende de T3.1.
  - `DescargarFactura.tsx`: `Documento = "factura" | "anexo"`, los dos entregan `application/pdf`, sin `XLSX_MIME`.
  - `facturas-vista.ts`: «Descargar factura» y «Descargar anexo».
  - `DetalleDeFactura.tsx`: el comentario de la línea 40.

  *Hecho:* en verde `tests/components/DescargarFactura.test.tsx`, `tests/components/DetalleDeFactura.test.tsx`,
  `tests/components/MiPlanModule.test.tsx` y `tests/integration/plataforma-empresa-detalle-page.test.tsx`, ya
  ajustados (R7, R22, R23, R24).
- [ ] **T4.2** Borrar `lib/facturas-plataforma/excel.ts`, `tests/unit/facturas-plataforma/excel.test.ts` y
  `FACTURA_DESCARGA_TEXTOS.excel`. Depende de T4.1.
  *Hecho:*
  - Grep sin resultados de `construirExcelFactura`, `facturas-plataforma/excel` y «Descargar Excel» en `lib/`,
    `components/`, `app/`, `tests/` y `e2e/`;
  - el caso R22 de `anexo.test.ts` en verde;
  - typecheck limpio.

## Tanda 5 — Documentación, E2E y cierre

- [ ] **T5.1** `[P]` `docs/architecture.md`, «Descarga (SLT-136)» (design §8).
  *Hecho:* el validador del perfil en verde.
- [ ] **T5.2** `e2e/facturas-plataforma.spec.ts` (design §10). Depende de T4.2.
  - Se van el Excel y `ExcelJS`.
  - El maestro descarga los dos PDF.
  - El anexo se relee: tres remisiones y «Total neto (3 movimientos)».
  - El superadmin descarga la factura.
  - La en curso no tiene botones.

  *Hecho:* `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` en verde en local, con base desechable.
- [ ] **T5.3** Cierre.
  - Pasar `./init.sh` y el proyecto `dinero` en local.
  - Anotar en `progress/impl_SLT-199.md` el mapa R → test y el tamaño medido (`scripts/tamano-pr.mjs`).
  - Si el tamaño da aviso o rojo, parar y proponer el corte de `design.md §12`.

  *Hecho:* todo en verde y R1–R26 mapeados.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/unit/facturas-plataforma/pdf-comun.test.ts` |
| R2, R5, R6 | `tests/unit/facturas-plataforma/pdf-comun.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts`, `tests/unit/facturas-plataforma/anexo.test.ts` |
| R3, R4 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts`, `tests/unit/facturas-plataforma/anexo.test.ts` |
| R7 | `tests/unit/facturas-plataforma/anexo.test.ts`, `tests/components/DescargarFactura.test.tsx` |
| R8–R14 | `tests/unit/facturas-plataforma/pdf.test.ts` |
| R15–R21 | `tests/unit/facturas-plataforma/anexo.test.ts` |
| R22 | `tests/unit/facturas-plataforma/anexo.test.ts`, `tests/components/DetalleDeFactura.test.tsx`, `tests/components/DescargarFactura.test.tsx` |
| R23 | `tests/components/DescargarFactura.test.tsx`, `tests/components/DetalleDeFactura.test.tsx`, `tests/components/MiPlanModule.test.tsx`, `tests/integration/plataforma-empresa-detalle-page.test.tsx` |
| R24 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/components/DescargarFactura.test.tsx`, `e2e/facturas-plataforma.spec.ts` |
| R25 | `e2e/facturas-plataforma.spec.ts` |
| R26 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts`, `tests/unit/facturas-plataforma/anexo.test.ts` |

## Tamaño estimado

Detalle en `design.md §12`.
- **Producción:** 9 archivos, ~1 000–1 100 líneas; ~750–850 si `pdf-comun.ts` nace de un `git mv`. Roza el tope de
  1 000.
- **Tests:** 10 archivos, ~1 200 líneas.
- **Total:** ~19 archivos, el 48% de 40. El corte de reserva está en `design.md §12`.

## Archivos esperados

Producción:
- `lib/facturas-plataforma/pdf-comun.ts`
- `lib/facturas-plataforma/pdf.ts`
- `lib/facturas-plataforma/anexo.ts`
- `lib/facturas-plataforma/resumen.ts`
- `lib/facturas-plataforma/excel.ts`
- `components/shared/facturas/DescargarFactura.tsx`
- `components/shared/facturas/facturas-vista.ts`
- `components/shared/facturas/DetalleDeFactura.tsx`
- `docs/architecture.md`

Tests:
- `tests/unit/facturas-plataforma/pdf-comun.test.ts`
- `tests/unit/facturas-plataforma/pdf.test.ts`
- `tests/unit/facturas-plataforma/anexo.test.ts`
- `tests/unit/facturas-plataforma/resumen.test.ts`
- `tests/unit/facturas-plataforma/excel.test.ts`
- `tests/components/DescargarFactura.test.tsx`
- `tests/components/DetalleDeFactura.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `e2e/facturas-plataforma.spec.ts`
