# Review — SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»

Reviewer · 2026-11-09 · rama `feature/SLT-100-detalle-unico-mensajeros`, HEAD d9f8c150, diff contra
`origin/dev` (53 archivos). Ruta completa.

## Veredicto: **OK**

Sin bloqueantes. Hay cinco hallazgos menores. El único que hay que resolver antes del PR es de trámite:
marcar T6.1 `[x]`, porque su contenido ya está verificado (ver m1).

## Checklist

- [x] **Ruta:** es la completa (high, dinero en pantalla). Están los 3 archivos de spec, con el madre de SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» aprobado.
- [x] **design.md** abre con `## Lo que ya existe` (búsqueda hecha) y tiene `## Alternativas descartadas` (1-6). El diff no re-crea nada de esa lista. `RechazosDeTiendaCierre` es nuevo con motivo: `SeccionRechazosDeTienda` devuelve `null` sin rechazos, y eso choca con D11.
- [~] **Tasks:** T0-T5 están `[x]`. **T6.1 sigue `[ ]`** (m1).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` da 48/40 archivos y 2499/1000 líneas. Hay `tamano-pr-aceptado` (×3) en `progress/features/SLT-100.md`, el último para ~52 archivos con T5.
- [x] **Trazabilidad R → test:** cada R tiene al menos un test que existe y afirma lo que dice (tabla abajo).
- [x] **`progress/impl_SLT-100.md`** contiene el mapa R → test (T1, T2-T4 y T5).
- [x] **Typecheck/lint:** el gate del leader dio `INIT_EXIT=0`. En la bitácora, `TSC_EXIT=0` y eslint limpio.
- [x] **Mi verificación:** con `DATABASE_URL` → la desechable `slt100_t1` (derivada sin imprimir), corrí `vitest run` de 10 archivos (`cierre-resuelto-por-sql-real`, `cierres-admin-service`, `CierresAdminDetalleUnico`, `detalle-cierre-descarga-columnas`, `detalle-cierre-vista`, `cierres-admin-repository`, `cierre-pagos-lectura` y las guardias `impresion-flujo`, `cierre-detalle-superficies` y `liquidacion-money-safe`). Resultado: `Test Files 10 passed · Tests 314 passed`, **0 saltados**, así que la integración corrió contra Postgres.
- [x] **R71:** `grep -E "Number[(]|parseFloat|toFixed" components/private/cierres/` está vacío. El `money()` de `notaOrigenIngresoBodega` es formato, no aritmética.
- [x] **R72:** en `lib/` solo cambian los 4 archivos de R80 (+31/−1). No hay nada en `db/`, ni migraciones, ni escrituras, ni cambios de importes.
- [x] **Multi-empresa:** no hay tabla ni query nueva. R80 añade una relación al `select` del `findFirst` ya acotado por `alcanceWhere`. El test SQL siembra en una empresa propia dentro de una transacción revertida.
- [x] Ningún literal de país o moneda en código nuevo (los importes pasan por `money()`). No hay recursos de Ordenex, dependencias nuevas, secretos ni `console.log`.
- [x] **E2E en local** (perfil > reviewer, bloqueante si falta). La bitácora de T5 tiene `--project=dinero` dos veces seguidas con `88 passed` (0 failed/flaky/skipped), en base desechable nueva con `NEXT_PUBLIC_APP_URL`, y `wallet-iva-aparte-sl39` (`aislamiento`) con `14 passed`. Comprobé en `playwright.config.ts` que los 10 E2E adaptados o nuevos caen en `dinero` o `aislamiento`.
- [x] **Fidelidad al diseño:**
  - **Una cifra, un nombre:** la descarga dice «Pago al mensajero» = `PESTANA_PAGO`, y «Debe» desaparece (D3).
  - **Reuso:** `DescargarDatasetButton` tal cual. Los diálogos son los `Modal` de hoy: rechazo, confirmación física, indemnización, destrabe y los tres de corrección/ajuste, que ahora son hermanos del detalle.
  - **Mismo componente para los dos roles:** un solo `<DetalleCierre>`, con `audiencia` central/satélite por props.
  - **`BuscadorFiltros`:** no aplica en S2. Los filtros de «Gestiones» son de SLT-101 «Fila de gestión única y lista con filtros».
- [ ] `gate-completo` en CI, Cierre en `progress/features` y desmontar el worktree: son posteriores al PR y no se juzgan aquí.

## Trazabilidad (verificada leyendo los tests)

| R | Test | Qué afirma (comprobado) |
|---|---|---|
| R38 | `tests/components/CierresAdminDetalleUnico.test.tsx:236` (`it.each` admin/satélite) | Diálogo «Detalle del cierre · Cierre de Ana Mensajera»; pestañas `["Dinero","Gestiones (2)","Rechazados por la tienda (0)"]`; cifras literales; sin «Debe» ni «Decisión del cierre». |
| R79 | `detalle-cierre-vista.test.ts` (`modoAdminDe`); `CierresAdminDetalleUnico.test.tsx:255-277` | Pie por estado con literales. |
| R39 | `CierresAdminDetalleUnico.test.tsx:298-312`; `CierresAdminConfirmacionFisica`; `CierresAdminIndemnizacion`; E2E (aprobar y rechazar) | `aprobarCierre` con el id; sub-modal «Rechazar cierre». |
| R83 | `CierresAdminDetalleUnico.test.tsx:315-347`; E2E vencido (`cierres-rediseno.spec.ts:286-302`) | Si sale bien: `forzarSolicitudVencido` + 2.ª lectura + pie de decidir. Si falla: el error de hoy, 1 lectura, sigue vencido. |
| R80 | `tests/integration/db/cierre-resuelto-por-sql-real.test.ts`; `tests/unit/services/cierres-admin-service.test.ts`; `CierresAdminDetalleUnico.test.tsx:430-445`; E2E (`cierres-rediseno.spec.ts:209`) | Ver «Servidor» abajo. |
| R17 | `CierresAdminDetalleUnico.test.tsx:350-385` | Con 0, texto D27 literal en `role=status`. Con 2, filas literales y la nota. |
| R18 | `CierresAdminDetalleUnico.test.tsx:280-296`; `CierresAdminPagoMensajero`; `CierrePremioPendiente`; E2E reabierto | Central con permiso: sí. Satélite: no. Sin permiso: no. |
| R19 | `CierresAdminDetalleUnico.test.tsx:388-417` | «Pasaron a Novedad interna» con conteo; aviso de cierre no registrado. |
| R21 | `CierresAdminDetalleUnico.test.tsx:419-427`; `impresion-flujo.guardia` (nuevo caso); E2E (xlsx) | «Descargar» presente; ni `.hoja-imprimible` ni «Imprimir». |
| R82 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`; E2E (`cierres-rediseno.spec.ts:185-186`) | 7 cabeceras escritas como literal; fila con strings; ausente → `null`; E2E con 3 filas. |
| R81 | `detalle-cierre-vista.test.ts`; `CierresAdminDetalleUnico.test.tsx:447-458`; `cierres-admin-rechazos-sla`; E2E A (presente) y B (ausente) | Nota literal bajo la línea de bodega. |
| R71 | `liquidacion-money-safe` (censo ampliado con los 2 archivos nuevos); grep | — |
| R72 | revisión del diff | — |
| R77 | `e2e/cierres-rediseno.spec.ts`: central A, satélite A, central B | Cifras con literales numéricos escritos a mano y derivación en la cabecera del spec. |

## Servidor (R80)

- `lib/repositories/CierresAdminRepository.ts:1421`: `resueltoPorUsuario: { select: NOMBRE_USUARIO_SELECT }` va en el mismo `findFirst` con `where: { id, ...alcanceWhere(alcance) }`.
- `:1482-1483`: la guardia por falsy (fix 1a10dc6d) es correcta. Los dobles sin el campo (`undefined`) ya no rompen, y `cierres-admin-repository` + `cierre-pagos-lectura` dan verde en mi corrida.
- `lib/services/CierresAdminService.ts:1017-1020`: el nombre solo sale con `aprobado`/`rechazado`. Tiene sentido: un `rechazado` re-solicitado conserva `resuelto_por`.
- **El test SQL prueba la consulta donde vive:**
  - Postgres real, transacción revertida, sin depender de datos previos.
  - La autocomprobación de las 3 filas sembradas falla de forma ruidosa si faltan los catálogos.
  - Resolutora y mensajero tienen nombres distintos, así que leer `mensajero` no acierta por casualidad.
  - El caso de otra zona tiene control positivo (el mismo id con su alcance sí trae el nombre).
  - Por construcción, quitar `alcanceWhere` (M3), quitar la relación (M1) o leer `mensajero` (M2) lo ponen en rojo, y la bitácora las anota muertas.
  - Lo confirmé: el archivo corrió (no saltado) y dio verde.

## Desviaciones declaradas: juicio

| # | Desviación | Juicio |
|---|---|---|
| a | `CierreMensajeroDetalleCascadas`/`DesglosePorTienda` montan el modal viejo con `tests/fixtures/detalle-cierre-admin-anterior.tsx` | **Aceptable.** Lo que vigilaban («Gana la tienda», «Debe», «Liquidación», tiempo verbal) no existe en el «Dinero» aprobado (D3/D20/D25), así que no hay región nueva donde poner esas aserciones. Pasar a «Dinero» habría significado borrarlas. Ahora vigilan componentes que no monta nadie (menor m2). |
| b | `CascadasCierreMensajero.tsx` con `@sin-superficie` | **Correcto.** No lo monta ninguna ruta (el design suponía que `/cierre-dia` lo usaba, y no). El motivo y el retiro van a SLT-115 «Retirar los componentes de cierre sustituidos». |
| c | «Pago al mensajero» solo con audiencia central; tests con `audiencia="admin"` | **Correcto.** Es la regla de S1 (`pestanasDe`, R6). En producción no cambia nada visible: `app/(app)/cierres-admin/page.tsx:225` da `puedeRegistrarPago = esAccesoTotal(rol)`, la misma condición que `audiencia="admin"` (`:193/236`). |
| d | Guardias `liquidacion-money-safe` y `estado-con-info` tocadas | **Correcto.** La primera **amplía** su censo (más archivos vigilados, no menos). La segunda añade una excepción clase D con motivo, para la celda «Resultado» de la descarga. Ninguna se debilita. |
| e | `wallet-iva-aparte-sl39`: «Debe» invertida | **Correcto** por D3. El valor −100,00 sigue afirmado como literal (`Le queda a la empresa`) y se añade que «Debe» no aparece. |
| f | El escenario B usa la tarifa de `tarifas-activacion` en vez de la comisión 2 % de T0.3 | **Aceptable.** T0.3 marcaba B como «propuesta sin validar». La nueva derivación quedó escrita en la bitácora y en la cabecera del spec antes del test, y cuadra con el «Total cobrado» 3.503 que `tarifas-activacion` ya afirma. R77 pide un cierre del modelo nuevo, no una comisión concreta. Lo que se pierde es la comisión COD del modelo nuevo en pantalla (menor m4). |
| g | `playwright.config.ts` mete `cierres-rediseno` en `dinero` | **Correcto.** Es pantalla de dinero, y el perfil exige correr ese grupo. |

## Aserciones contra su propia fuente / literales-contrato

Revisé los tests nuevos y los adaptados:
- `CierresAdminDetalleUnico`, `detalle-cierre-descarga-columnas` y `cierres-rediseno.spec.ts` comparan contra **literales escritos a mano**: cabeceras de R82, texto D27, nota R81, pie, cifras. No importan la constante que generan.
- `importe()` del E2E solo formatea un número escrito a mano.

No encontré ningún literal-contrato sustituido por su constante.

## Hallazgos

**Bloqueantes:** ninguno.

**Menores:**

- **m1 (trámite, antes del PR):** `specs/SLT-100-detalle-unico-mensajeros/tasks.md`, T6.1 está `[ ]`, y CHECKPOINTS exige todas las tasks `[x]`. Su contenido está cumplido: el gate del leader dio `INIT_EXIT=0`, en `lib/` solo están los 4 archivos de R80, `db/` no cambia y el grep de R71 sale vacío. Falta marcarla.
- **m2:** `tests/components/CierreMensajeroDetalleCascadas.test.tsx` y `CierreMensajeroDesglosePorTienda.test.tsx` (54 casos) vigilan ahora `CascadasCierreMensajero`, que no monta ninguna ruta. Es cobertura de código muerto. Que SLT-115 «Retirar los componentes de cierre sustituidos» los borre junto con el componente y la fixture `tests/fixtures/detalle-cierre-admin-anterior.tsx`. Además, `requirements.md > Lo que NO entra` dice que `CascadasCierreMensajero` «lo sigue usando `/cierre-dia`», y es falso.
- **m3:** R81 en `requirements.md` dice «Manual <monto>», pero la implementación y los tests dicen «Manual (mensajero) <monto>» (constante vigente; decisión del leader anotada en la bitácora). Conviene alinear el texto del spec o confirmarlo con Carlos en el Preview.
- **m4:**
  - El helper `importe()` (`e2e/_escenarios/cierres.ts:104-110`, previo a esta ficha) acepta cualquier par de decimales `(?:,\d{2})?`. Con importes enteros sirve, pero no prueba «al céntimo» (R77) si apareciera una cola de céntimos.
  - El escenario B no lleva comisión COD (ver f).
  - Deuda para SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» o SLT-111 «Cifras del servidor: reparto en % y señales de la cola».
- **m5:** la tabla de cabecera de `progress/features/SLT-100.md` sigue con `zone frontend`, `estado pending` y la decisión «el servidor no envía quién resolvió… sin nombre», que D23/D24 dejaron obsoleta. Hay que actualizarla al cerrar.
