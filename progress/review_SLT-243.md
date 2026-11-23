# Review SLT-243 «Moneda e impuesto del país en pantallas: cierres del admin»

- Revisor: reviewer · 2026-11-23 · vuelta 1
- Rama `feature/SLT-243-moneda-pantallas-cierres-admin`, diff `origin/dev...HEAD` (5cbc3247).
- Ruta: completa (dinero, complejidad high). Es la que toca.
- Grafo: no lo usé. El design ya avisa que este worktree no está indexado; exploré con Grep/Read y `git grep`.

## Verificación ejecutada (NODE_OPTIONS=--max-old-space-size=8192, de una en una)

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0. Con esto se comprueban también los 3 `@ts-expect-error` de R8. |
| `pnpm exec eslint` sobre los 36 `.ts/.tsx` del diff | 0 errores. 1 warning que ya estaba (`_recorte`, `DescargarGestionesModeloNuevo.test.tsx:166`, línea no tocada). |
| `pnpm exec vitest run` sobre 14 archivos: test nuevo, `moneda-del-pais-pantallas`, `GestionarOrdenPanelCentimos`, `CierresAdminPagoMensajero`, las 8 suites de descarga de design §7, `CierresAdminIndemnizacion` y `CorregirPagosCierre` | 14/14 archivos, 433/433 tests en verde |
| `pnpm run test:guardias` | 358 archivos en verde y 3 omitidos; 5436 tests en verde y 28 omitidos |
| `node scripts/tamano-pr.mjs` | AVISO 33/40 archivos, 428/1000 líneas de producción, 1162/3000 de tests. No pasa del máximo, y P4 lo acepta (`progress/features/SLT-243.md`, 2026-11-23). |

No corrí `./init.sh` ni los E2E: el leader los dejó para CI (T5.3).

## Checklist

### CHECKPOINTS.md
- [x] Ruta: completa, que es el suelo para dinero y complejidad high.
- [x] `requirements.md` con R1–R16 en EARS.
- [x] `design.md` con 8 alternativas descartadas y su porqué (§10).
- [~] `tasks.md`: T1.1–T5.2 están en `[x]`. **T5.3 (`./init.sh` y E2E) sigue en `[ ]`** porque el leader la mandó a CI. Ver H1.
- [x] `design.md` abre con `## Lo que ya existe` y la búsqueda está hecha. El diff no re-crea nada de esa lista:
  - reutiliza `useMonedaDelPais`, `useImpuestoDelPais` y `formatearTopeEn`;
  - copia el patrón de `IncidentesAdminModule` sin compartir código, como pide el design;
  - no reutiliza `rotulos-con-impuesto.ts` de SLT-240, y el design lo justifica porque la forma es otra.
- [x] Tamaño: 33/40, por debajo del máximo, y P4 lo aceptó.
- [x] Trazabilidad: cada R<n> tiene al menos un test concreto (tabla abajo), y `progress/impl_SLT-243.md` trae el mapa R → test completo.
- [x] Typecheck y lint en verde (ver arriba).
- [ ] `gate-completo` en CI: pendiente, todavía no hay PR.
- [~] Flujo crítico «Cierres de día y su revisión»: el E2E `e2e/cierres-rediseno.spec.ts` está actualizado (solo literales de encabezado), pero falta la constancia de que corrió. Ver H1.
- [x] Dependencias: ninguna nueva.
- [x] Seguridad y configuración: sin secretos, sin webhooks y sin nada que cambie entre entornos.

### docs/checkpoints-proyecto.md
- [x] Sin tablas, queries, migraciones ni `db/` en el diff.
- [x] Ningún recurso de Ordenex.
- [x] Moneda e impuesto salen del proveedor del país (hooks), no de literales. «Costa Rica» aparece solo en comentarios de `encabezados-con-impuesto.ts`, y «SINPE» solo en el rótulo que ya existía en `TotalesPanel`.
- [x] Sin acciones, rutas ni autorización nuevas (design §5).
- [~] `./init.sh` en verde: pendiente para CI (H1).

### docs/perfil-agentes.md > reviewer
- [x] Sin literales nuevos de país o moneda en el código. Sin Ordenex. Sin dependencias.
- [x] Los comentarios explican el porqué, por ejemplo el `useMemo` de `DescargarCierresButton` y la identidad del arreglo con el rótulo de la plataforma.
- [~] «PR que toca pantallas o dinero sin constancia de los E2E afectados corridos en local»: no hay constancia (H1).

## Trazabilidad R → test (verificada leyendo los casos, no solo la bitácora)

Todos los casos de la tabla están en `tests/components/moneda-del-pais-cierres-admin.test.tsx`, salvo donde se indica otro archivo.

| R | Test | ¿Lo verifica de verdad? |
|---|---|---|
| R1 | describe «SLT-243 R1»: `it.each` sobre los 3 montajes, literales «€12 345» y «€4 500», y «sin importe → raya» | Sí. Monta `CierreDiaModule`. |
| R2 | describe «SLT-243 R2»: pago vigente; tras ajustar, el pago nuevo y el total | Sí. La acción está doblada. |
| R3 | describe «SLT-243 R3»: «€12 345 → €15 000» | Sí |
| R4 | describe «SLT-243 R4»: los 4 totales agregados | Sí. Monta `ConsolidacionBodegaModule`. |
| R5 | describe «SLT-243 R5»: `TotalesPanel`, con 5 importes | Sí |
| R6 | describe «SLT-243 R6»: la insignia, `registrado` y `anulado` (función pura) y el toast de `RegistrarPagoMensajeroDialog` | Sí. El cableado de `anulado` en `PagoMensajeroSeccion` no se monta (H3). |
| R7 | describe «SLT-243 R7»: `CorregirPagosDialog` = `mensajeDeCuadre(…, moneda del montaje)`, y el literal «€11 899» | Sí |
| R8 | describe «SLT-243 R8»: 3 `@ts-expect-error`, más el typecheck en verde | Sí |
| R9 | describe «SLT-243 R9»: la ayuda y el error con `formatearTopeEn`; el tope tecleado sin separadores pasa `montoValido`; «€9 999 999 999» y nunca «€10 000 000 000» | Sí |
| R10 | describe «SLT-243 R10», casos (a)–(d): 9 literales de Perú escritos a mano; las 4 declaraciones; misma identidad con «IVA»; resultado con libro, sin libro y con error; y el selector montado | Sí |
| R11 | describe «SLT-243 R11»: censo «sin IVA» de 5 archivos sobre la fuente sin comentarios, más su contraprueba | Sí |
| R12 | `compruebaCostaRicaYCaida` en cada pantalla; R10 (a) con los literales de Costa Rica; las 8 suites de §7 actualizadas solo en encabezados | Sí |
| R13 | Montaje «sin proveedor» en cada caso; `encabezadoBase` es la forma de Costa Rica; R10 (d) sin proveedor | Sí |
| R14 | Revisado a mano en el diff (abajo) | Sí |
| R15 | `moneda-del-pais-pantallas.test.tsx`: el censo R18 con los 10 archivos de SLT-243 y el caso «SLT-243 R15» de rojo con `money(` y `formatMontoString(` | Sí |
| R16 | describe «SLT-243 R16», 2 casos; `pais-sin-literales.guardia` en verde (corrió en las guardias) | Sí |

### R14, comprobado en el diff
- Ningún archivo de `components/private/cierres/**`, `cierre-labels.ts`, `cierre-factura.tsx`, wallet, plataforma, órdenes ni `db/`.
- En `cierre-detalle-shared.tsx` solo cambian `TotalesPanel` y sus imports. Se conservan `money` y `moneyTope` para el código que no monta ninguna pantalla (P1).
- Ninguna suma, resta ni validación nueva. Las claves con «iva» no cambian.
- En las 8 suites de descarga y en el E2E solo cambian literales de encabezado (14 líneas ± en el E2E). Ninguna celda, clave ni cuenta de columnas. Las líneas de pantalla del E2E (~141 y ~599) no se tocan.

## Puntos que pidió mirar el implementer

1. **Default `impuesto = IMPUESTO_ROTULO` en las 5 funciones de descarga.**
   - Con `git grep`, los únicos llamadores de producción son los tres módulos de pantalla, y los cinco pasan `useImpuestoDelPais()`.
   - Los llamadores sin el argumento son tests: `DescargarResumenModeloNuevo`, `CierresBodegaResumenModeloNuevo` y `paginacion-transversal`, este último solo por nombre. Usan la caída de R13 a propósito, para fijar la forma de Costa Rica.
   - No hay hoy ningún llamador que se olvide del impuesto. Aun así, el default deja la puerta abierta a uno futuro y va contra el espíritu de «moneda explícita, sin default» de las decisiones cerradas (H2, menor).
2. **Tupla en `conImpuestoEnHojas` en vez del genérico del design.**
   - Es correcto: `DescargaFilasResult.libro.hojas` es una tupla no vacía, y la firma la conserva sin casts.
   - El genérico `<H extends DescargaHoja>` no aportaba nada, porque ningún llamador usa un subtipo. No es un hallazgo.
3. **Exclusión de `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` del censo «por P3».**
   - El motivo es correcto: el archivo sigue llamando a `money(valor)` en la línea 123, en el texto de la tarifa (`MONTO_FIJO ${money(valor)}` / `porcentajeDe`), que P3 deja para SLT-244.
   - Que sus 5 encabezados hayan cambiado no lo vuelve censable al censo R18, que exige la ausencia de `money(`.
   - El archivo sí entra en el censo «sin IVA» de R11. No es un hallazgo.
4. **R6 probado con la función pura y sin montar `PagoMensajeroSeccion`.** Es suficiente para R6:
   - el typecheck obliga a pasar una moneda (R8);
   - el archivo está en el censo R18;
   - el design §8 no pedía montarlo.

   Queda sin probar que se pase *la del hook* y no otra (H3, menor).
5. **Encabezados contra la tabla de design §6.0.** Coinciden los 9, carácter a carácter, en `ENCABEZADO_CON_IMPUESTO` y en los literales a mano del test (Perú y Costa Rica). «Impuesto» va con mayúscula solo cuando abre el encabezado. No es un hallazgo.

## Hallazgos

- **H1 (condición de cierre; no es un defecto del código).** T5.3 sigue en `[ ]`: `./init.sh` en verde y los E2E afectados no tienen constancia en `progress/impl_SLT-243.md`. Los E2E son el grupo `dinero`, `cierres-admin`, `cierre-dia`, `ajuste-pago-mensajero-cierre`, `cierre-bodega-satelite` y `cierres-rediseno`, este último con literales cambiados y nunca ejecutado.
  - `docs/perfil-agentes.md > reviewer` lo marca como bloqueante («sin constancia de los E2E afectados corridos en local»).
  - El leader los mandó a CI por decisión expresa, y la memoria del proyecto dice «gate en CI, no local».
  - Lo dejo como **condición**: la feature no pasa a `done`, y no hay aviso «listo para mergear», hasta que `gate-completo` y esos E2E estén en verde y anotados en la bitácora con T5.3 en `[x]`.
  - Si el humano no acepta ese desvío de la regla de E2E en local, esto pasa a BLOQUEANTE.
- **H2 (menor).** `impuesto: string = IMPUESTO_ROTULO` en `descargaColaCierres`, `descargaHistoricoCierres`, `descargaColaBodega`, `descargaBodegaResueltos` y `descargaBodegaSolicitados`.
  - Hoy todos los llamadores de producción pasan el del país. Un llamador futuro que lo olvide caería en silencio a «IVA», justo el fallo que R8 evita para la moneda.
  - Sugerencia, opcional: hacerlo obligatorio. Solo obliga a pasar `IMPUESTO_ROTULO` en 2 suites que ya están en el diff, así que no suma archivos.
- **H3 (menor).** Ningún test monta `PagoMensajeroSeccion` para comprobar que el toast de anulación usa la moneda del hook. El riesgo es bajo, por el typecheck y el censo. Se podría añadir un caso con la acción `anularPagoAction` doblada.
- **H4 (menor, informativo).** Las líneas del JSX que cambiaron superan el ancho habitual, por ejemplo `formatearMontoEn(moneda, totalesAgregados.general, SIN_MONTO_RAYA)` dentro de `<dd>`. El lint no lo marca. Es solo estético.

## Veredicto

**OK**, sin bloqueantes en el código ni en la trazabilidad. Queda la condición H1: no se cierra la feature ni se avisa «listo para mergear» sin `./init.sh` / `gate-completo` y los E2E afectados en verde, con T5.3 en `[x]`.
