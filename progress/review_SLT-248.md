# Review SLT-248 «Actualizar zonas: también las reprogramadas y en novedad pasan a la zona nueva»

Reviewer, 2026-11-20. Diff `origin/dev...HEAD` (31d0af01). Ruta **ligera**.

## Checklist

- [x] **Ruta.** Ligera, complexity low. El diff no toca código de dinero, permisos, auth,
      integraciones ni webhooks: cambia la clase de dos estados en `CLASE_RECONCILIACION_ZONA`, el tipo
      `MotivoSaltada`, el mapa de textos del botón y dos ayudas. Los efectos indirectos (tarifa de la
      zona nueva por R1707 de SLT-224, bodega que ve y recupera la orden) están en el spec y los aceptó
      Carlos (D1, `progress/features/SLT-248.md`).
- [x] **Spec ligero.** `requirements.md` con alcance, «Lo que ya existe», decisiones, EARS R1801–R1806,
      `## Tasks` (T0–T5 todas `[x]`) y `## Archivos esperados`. El diff no re-crea nada de lo listado
      (reutiliza `reconciliarZonaDeOrdenes`, `motivoDeSaltada` y `resolverDestinoCierre` sin tocarlos).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 11/40 archivos, 32/1000 líneas de producción,
      138/3000 de tests.
- [x] **Trazabilidad.** Cada R tiene un test concreto que lo verifica (abajo). El mapa R → test está en
      `progress/impl_SLT-248.md`.
- [x] **Listas de SLT-224 LITERALES.** `clase-reconciliacion-zona.test.ts` escribe a mano «se mueve» (11,
      con `reprogramado` y `novedad`), `devolucion` (5), `estante_satelite`, `finalizada` y
      `ESTADOS_QUE_NO_SE_MUEVEN` (9). `zona-repository.test.ts` mantiene `NO_SE_MUEVEN` literal (9).
      `ActualizarZonasButton.test.tsx` fija las 4 claves de `TEXTO_MOTIVO_SALTADA` literal. La matriz
      de integración usa claves literales en `SE_MUEVEN` / `NO_SE_MUEVEN` y comprueba que se sembró
      entera (`sembradas`). Ninguna se deriva del mapa que prueba (la única comparación contra fuente,
      `finalizada == ESTADOS_TERMINALES`, ya existía y va acompañada de la literal).
- [x] **Nada más cambia de clase.** En el mapa solo se mueven `reprogramado` (`por_liberar` →
      `se_mueve`) y `novedad` (`devolucion` → `se_mueve`). `en_bodega_satelite`, las 3 finalizadas y
      los 5 estados de devolución siguen igual (test literal + matriz contra Postgres). El corte de
      cobro en curso (R1722) sigue en `whereBaseElegible`, sin cambios, y la matriz siembra
      `cd-solicitado-reprogramado` y `cd-solicitado-novedad`, que se quedan quietas.
- [x] **Liberación a la bodega de la zona corregida (R1806).** `LiberacionReprogramadaService:223` y
      `DevolucionSlaService:255` llaman `resolverDestinoCierre(orden.zonaId, …)`; `zonaId` sale de la
      fila de `orden` leída en la corrida (`LiberacionReprogramadaRepository.findOrdenesLiberables`,
      `DevolucionSlaRepository.findDevueltasSla`). Una orden movida por R1801 se libera, por tanto, a la
      bodega de su zona nueva. Tests vigentes: `liberacion-reprogramada-service.test.ts` (R12 central y
      satélite) y `devolucion-sla-service.test.ts` (R15 central y satélite).
- [x] **Ayuda y textos.** `docs/ayuda/oficina/ordenes.md` lista los cuatro motivos que quedan, en el
      orden de precedencia de R1804; `configuracion-zonas.md` dice «en el estante de una bodega
      satélite». Ninguna otra ayuda dice que las reprogramadas o en novedad no cambian de zona.
- [~] **Restos de `por_liberar`.** Fuera del tipo, del mapa, del botón y de la ayuda. Quedan menciones
      históricas en comentarios de tests (correctas: explican la mutación) y una obsoleta en código
      (m1).
- [x] **Typecheck** (`--max-old-space-size=8192`): exit 0. **Lint** de los 9 `.ts/.tsx` del diff: exit 0.
- [x] **Tests corridos por el reviewer** contra la base desechable `servi_slt248_*` exportada (no la
      `.env`): los 6 archivos tocados + `liberacion-reprogramada-service` + `devolucion-sla-service`:
      8 files, 150 passed, 0 skipped (los dos `.int.test.ts` corrieron). `pnpm run test:guardias`:
      360 files, 5440 passed, 1 skipped.
- [x] **Reglas del proyecto** (`docs/perfil-agentes.md > reviewer`): sin tablas, queries, migraciones,
      dependencias ni literales de país/moneda nuevos; nada de Ordenex. Los comentarios nuevos explican
      el porqué (cita a D1 y a R1722).
- [x] **Flujos críticos / E2E.** La pantalla tocada es solo el mapa de textos del diálogo «Actualizar
      zonas»; no hay E2E que lo recorra (`e2e/zona-*.spec.ts` no siembran reprogramadas ni abren ese
      diálogo). El código de liberación (flujo «reprogramación») no cambia. Ver n3.
- [ ] `gate-completo` en CI: pendiente del PR (no lo verifica el reviewer).

## Trazabilidad verificada

| R | Test que lo verifica |
|---|---|
| R1801 | `reconciliar-zona-corte-vivas.int.test.ts` matriz: `estado-reprogramado` y `estado-novedad` en `SE_MUEVEN`, 5 reconciliadas, 5 acciones en 1 lote; `actualizacion-zonas.int.test.ts` «confirmar actualiza las seis elegibles» (`novedad`, `reprogramado` en `cambiadas` y en `acciones`); `clase-reconciliacion-zona.test.ts` «se mueve» literal |
| R1802 | matriz: `cd-solicitado-reprogramado` / `cd-solicitado-novedad` en `NO_SE_MUEVEN`; `actualizacion-zonas-action.test.ts`: `reprogramado`/`novedad` + `cobroEnCurso` → `cobro_en_curso` |
| R1803 | `actualizacion-zonas.int.test.ts` vista previa: `total` 6, un grupo de 6, `SALTADAS_ESPERADAS` sin los dos; `actualizacion-zonas-action.test.ts`: `motivoDeSaltada` → `null` sin cobro |
| R1804 | `ActualizarZonasButton.test.tsx`: 4 claves literales, listado sin G-4, `not.toContain("esperando liberación en bodega")`; precedencia en `actualizacion-zonas-action.test.ts`; typecheck |
| R1805 | `clase-reconciliacion-zona.test.ts` (devolución 5, no-se-mueven 9, literales); `zona-repository.test.ts` `NO_SE_MUEVEN` 9 literal; matriz `ESTADOS_R1723` (6) quietos |
| R1806 | `liberacion-reprogramada-service.test.ts` R12 (central / satélite); `devolucion-sla-service.test.ts` R15 (satélite / central) |

## Hallazgos

- **m1 (menor)** — Comentario obsoleto en `lib/repositories/_shared/reconciliar-zona-ordenes.ts:149-150`:
  «todo lo que la clasificacion no marca `se_mueve` (estante, finalizadas, devoluciones, **por
  liberar**)». La clase ya no existe; el comentario describe una exclusión que esta feature quitó.
  Arreglo de una línea; puede ir en este PR o en el siguiente que toque el archivo.
- **n1 (nota)** — R1802 por el camino de «Actualizar zonas» (motivo `cobro_en_curso` para una
  `reprogramado`/`novedad`) se prueba en unit (`motivoDeSaltada`) y, contra Postgres, solo por el
  guardado de zona (matriz). La integración de «Actualizar zonas» no siembra una reprogramada con cobro
  en curso. Es lo que planificó el spec y el `WHERE` es el mismo helper, así que no bloquea.
- **n2 (nota)** — La ruta ligera es correcta para el diff, pero el efecto de negocio (una reprogramada
  movida de satélite a central se libera como `en_bodega_central` aunque el paquete siga en el estante
  de la satélite) queda para validarlo con Carlos en Preview, como dice el spec en «Preguntas
  abiertas».
- **n3 (nota)** — Sin constancia de E2E corridos en local en `progress/impl_SLT-248.md`. No hay E2E
  afectado: el código de liberación no cambia y ningún E2E abre «Actualizar zonas». El E2E de
  `reprogramacion-liberacion` corre en CI en el PR a producción.

## Veredicto

**OK (APROBADA).** Sin bloqueantes. m1 se puede corregir en este PR.
