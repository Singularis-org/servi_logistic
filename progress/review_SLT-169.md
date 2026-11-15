# Review SLT-169 «Se le paga hoy a la tienda con todos los cobros restados»

Revisión: 2026-11-14 · rama `feature/SLT-169-pago-tienda-neto` (HEAD 137fde4f) contra `origin/dev`.
Ruta: completa (fullstack, toca dinero en pantalla y Excel): correcta.

## Veredicto: APROBADO (OK)

Sin bloqueantes. Queda pendiente de Carlos la aceptación del tamaño del PR (42/40). El leader lo
sacó de mi veredicto.

## Checklist

- [x] Ruta completa. requirements (EARS, R620-R636), design (`## Lo que ya existe` abre el design y tiene 4 alternativas descartadas) y tasks están presentes.
- [x] `## Lo que ya existe`: el diff reutiliza `ganaLaTienda`, `partesPorTienda`, `porcentajesReparto`, `esMontoNegativo` y `text-danger-strong`. No vuelve a crear nada de esa lista. `pagoTiendaEmpresa` no cambia (R636).
- [ ] Tasks: todas `[x]` salvo **T7.1** (`./init.sh` verde y tamaño). Está abierta solo por el tamaño, ver H1.
- [ ] Tamaño: `node scripts/tamano-pr.mjs` da 42/40 archivos (268/1000 líneas de producción, 1656/3000 de tests). `progress/features/SLT-169.md` no tiene la línea `tamano-pr-aceptado`. Lo decide Carlos y el leader me pidió no contarlo como bloqueante.
- [x] Trazabilidad: cada R620-R636 tiene un test que existe, aserta con literales y está verde (mapa en `progress/impl_SLT-169.md`).
- [x] Typecheck: `pnpm run typecheck` exit 0 (corrido por mí).
- [x] Lint de los archivos del diff: 0 errores (1 warning previo de eslint-disable).
- [x] Tests del diff (28 archivos, contra la base desechable): 633 passed y 8 failed. Los 8 son de `cierre-desglose-por-tienda-sql-real` y `cierre-bodega-desglose-por-tienda-sql-real`, que están en `tests/baseline-rojos.json` (el diff no los añadió). No es un hallazgo.
- [x] Flujos de dinero sin tocar: `wallet-tienda-feed-service`, `dinero-por-producto` y los de liquidación dan 6 archivos y 308 passed. Sus tests no están en el diff.
- [x] Guardias: `pnpm run test:guardias` da 1 archivo rojo (`dependencias-declaradas-presentes`), que está en el baseline. La guardia nueva R631 está verde.
- [x] E2E afectados corridos en local, con constancia en la bitácora: `cierres-rediseno` y `cierre-bodega-satelite` 27/27. `--project=dinero` tiene 1 rojo ajeno (`tope-intentos-por-empresa.spec.ts:427`, que el leader confirmó rojo también en dev).
- [x] Multi-empresa: sin tablas, queries ni migraciones nuevas. La consulta del test R632 filtra por `organizacion_id`.
- [x] Sin literales de país o moneda en el código nuevo: `money()` y `IMPUESTO_ROTULO`; «₡» solo aparece en los tests. Sin dependencias nuevas y sin recursos de Ordenex.
- [x] Autorización: la clasificación `"empresa"` de SLT-154 no cambia (`CierresAdminService.ts:231`).

## Foco pedido

1. **Dinero, solo presentación.** El diff de `lib/services/` solo cambia cómo se calcula `pagoTienda` en `CierresAdminService.ts:1168`, `CierresBodegaAdminService.ts:516` y `cifras-cierre.ts:68` (más comentarios). `aprobarCierre` (`CierresAdminService.ts:1187`) no lee `pagoTienda`. Los únicos usos de `cifrasDelCierre` y `partesPorTienda` son el detalle y el DTO de descarga (`:1085`, `:2059`). Los repositorios solo los nombran en comentarios.
   - **R631**: la guardia barre `lib/services/` (5 servicios por nombre más todos los `Wallet*FeedService` y `Caja*FeedService`). Prueba que el barrido no está vacío y tiene autocomprobación (import por alias, ruta relativa, `import()` dinámico, `require`, nombres y comentarios).
   - **R632** (`tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts`): siembra de verdad 2 tiendas, 1 entrega y 2 rechazos en A, y 1 entrega en B. Aprueba con el `aprobarCierre` real y con `WalletTiendaFeedService` encendido. Después compara `ParteDeTienda.pagoTienda` y el `pagoTienda` del cierre contra Σ créditos − Σ débitos de `wallet_tienda_movimiento` de ese `origen_id` y de esa `organizacion_id`.
     - Tiene controles: `filasLibro > 0` y el débito del flete por devolución de A = 4520.00. Sin base se salta; con base no hay `return` temprano.
     - Lo corrí yo: 5/5 passed, sin skip.
     - Los literales (11864.00, 6779.50, 18643.50, 11356.50, [62, 38]) los recalculé a mano y cuadran.
     - La mutación M1 (volver a `pagoTiendaEmpresa`) daría 16384.00 en A contra 11864.00 en el libro, así que muere por construcción. No la reejecuté porque tengo prohibido editar código. La bitácora registra que muere.
2. **Satélite (SLT-154).** `satelite-detalle-sin-dinero-empresa-sql-real` solo cambia las aserciones del maestro: el diff no toca ninguna de las de la satélite, y el archivo pasa. El test de componente R633 pinta con `empresa: null` y audiencia satélite.
3. **Cuadre.** Las identidades `pagoTienda + total === general` y `Σ partes === cierre` están fijadas con literales en `cifras-cierre.test.ts`, `partes-por-tienda.test.ts` y `cierres-bodega-admin-service.test.ts` (Σ de los días = agregado).
   - El signo se conserva (−13205.05) y no se recorta a 0.00.
   - El rojo y «(la tienda debe)» / «(las tiendas deben)» están en la tarjeta (`CifrasCierre.tsx:64-65`) y en la celda de «Por tienda» (`DineroCierre.tsx:128-136`), con tests que asertan la clase y el texto exacto.
   - Con un pago negativo, el reparto sale `null`.
4. **Excel.** Mensajeros, hoja «Cierres»: 19 columnas, sin «Gana la tienda en total». Bodega, hoja «Cierres»: 26 columnas, con la columna 11 rotulada «Se le paga a la tienda». «Por tienda»: 4 columnas, compartida por los dos libros. La satélite sigue con 18 columnas en mensajeros (R634). La pantalla y el Excel usan el mismo `pagoTienda` y `parte.pagoTienda`. El E2E comprueba encabezados y valores (6497).
5. **Tests reescritos.** Los literales que eran contrato siguen siendo literales nuevos calculados a mano (92090.00, 36680.69, 97499.15, 150366.50, −955.00, −5770.00…). Las únicas comparaciones contra el propio campo son `ganaLaTienda === pagoTienda`: es el contrato de alias del design (P3), y en el mismo test `pagoTienda` está fijado con un literal. No encontré aserciones tautológicas.

## Hallazgos

- **H1 · menor (fuera de mi veredicto, decide Carlos):** el tamaño es 42/40 y `progress/features/SLT-169.md` no tiene `<!-- tamano-pr-aceptado: … -->`. T7.1 sigue `[ ]` y `./init.sh` corta en rojo solo por eso. Antes del PR hay que anotar la aceptación y marcar T7.1.
- **H2 · menor:** las pruebas «real» que la trazabilidad da para R621 y R623 (`cierre-desglose-por-tienda-sql-real.test.ts`, `cierre-bodega-desglose-por-tienda-sql-real.test.ts`) están en el baseline y no corren en verde: les falta el corpus. Sus literales nuevos no se han ejecutado nunca. La cobertura real la dan `pago-tienda-neto-ledger-sql-real` (R621) y `satelite-detalle-sin-dinero-empresa-sql-real` (R623), así que no bloquea. Conviene corregir el mapa de `tasks.md > Trazabilidad`.
- **H3 · menor:** la guardia R631 (`tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts:54-70`) solo ve imports directos: un import transitivo (A → B → `cifras-cierre`) se le escaparía. Está documentado en la bitácora. Lo compensa R632, que ata la cifra al libro.
- **H4 · menor (preexistente, no es regresión):** la hoja «Cierres» de bodega para la satélite ya llevaba la columna `ganaLaTienda` y ahora la ve rotulada «Se le paga a la tienda» (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:50`). No gana columnas, así que R634 se cumple. Quitarla es trabajo de SLT-161 «Descargas de la satélite sin el dinero de la empresa».
- **H5 · menor:** `cascadas-bodega.ts:151` (`lineasCascadaDueno`) y los componentes sin superficie mantienen las notas «no sale de lo recaudado» y «Gana en total». Ninguna superficie viva los monta (lo comprobé con grep), así que no hay contradicción visible. Hay que retirarlos con P3.
