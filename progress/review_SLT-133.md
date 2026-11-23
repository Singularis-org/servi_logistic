# Review SLT-133 «Mensajes del servidor de cierres en tú y con tildes»

- Ruta: **ligera** (revisión acotada a `git diff origin/dev...HEAD`, HEAD `2e173c2e`).
- Reviewer, 2026-11-11. Base desechable `slt133_a` (DATABASE_URL de `.env` con el nombre de base
  cambiado; `.env` comprobado solo con booleanos). Sin dev server, sin `migrate reset`.
- MCP del grafo: no hizo falta (diff de literales); Grep/Read.

## Checklist

- [x] **Ruta ligera adecuada.** Los tres servicios son de cierres (dinero adyacente), pero el diff de
  producción son 13 líneas, todas `const MSG_* = "…"` o la línea de continuación del literal (comprobado:
  0 líneas `+/-` de `lib/` fuera de literales). Ningún importe, estado, permiso ni contrato cambia: no
  toca dinero en el sentido de la regla. No obliga a subir de ruta.
- [x] **R144 — texto exacto del Anexo A.** Script que extrae las 12 filas L1-N1 de
  `specs/SLT-103-dialogos-trato-tu/requirements.md > Anexo A` y busca `"<texto>"` en los tres servicios:
  las 12 filas aparecen 1 vez, L3 2 veces (día y bodega) = **13 constantes**, todas en NFC. Sin voseo
  (Tenés/tenes/gestionalos/Escribile/resolve/Avisá) ni «usted» en ningún literal de los tres servicios.
- [x] **R146 / sin lógica.** Solo literales (ver arriba). Comentarios `// R10` etc. intactos.
- [x] **R141 (2.ª frase).** Cada test nuevo o actualizado afirma `status` + campo con `toEqual`/`toBe`
  (`motivo`, `motivoBloqueo`, `fieldErrors.zona`, `fieldErrors.estatus`, `fieldErrors[<id>]`).
- [x] **Literales a mano.** Ningún test importa `MSG_*` de `lib/services` (las constantes no se exportan;
  los `const MSG_*` de `cierre-dia-477-*.test.ts` son literales locales del test).
- [x] **R147.** El diff solo toca los 3 servicios del censo. «catalogo de estados incompleto» sin tilde
  sigue en 11 archivos fuera de cierres; `guia-asignacion-service`, `asignacion-satelite-service`,
  `traspaso-mensajero-service`: 150/150 verdes sin tocarse.
- [x] **Trazabilidad.** R56/R144: un test exacto por fila L1-N1 (L1: unidad + pantalla; L2: 2 unidad +
  integración; L3 día: unidad + integración `tarifas-valor-propio-caminos`; L3 bodega: 2; L4: 3; L5: 1;
  L6: 4 unidad + integración; L7: 1; L8: 2; L9: 1; L10: unidad + pantalla; M1: 2; N1: 2). R141: los
  mismos con `status` + campo. R146: diff + E2E `dinero`. R147: tests de fuera del censo verdes.
- [x] **Tasks** T1-T8 `[x]` en `## Tasks`.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 12/40 archivos, 103/1000 líneas.
- [x] **Contraprueba reaplicada (4 constantes, más de las 2 pedidas):**
  | Constante devuelta al texto viejo | Test | Resultado |
  |---|---|---|
  | L7 `MSG_YA_DESHECHA` | `cierre-dia-service.test.ts` | ROJO (1 failed: R3 gestión ya anulada) |
  | M1 `MSG_PENDIENTES` bodega | `cierre-bodega-service.test.ts` | ROJO (1 failed: R6/431-R5) |
  | N1 `MSG_CONFIRMACION_SIN_GUIA` | `cierres-admin-confirmacion-fisica.test.ts` | ROJO (2 failed: R13, R15) |
  | L10 `MSG_CATALOGO` | `cierre-dia-service.test.ts` | ROJO (1 failed: catálogo sin `en_reparto`) |
  Revertido con `git checkout -- <archivo>`; `git status --short` vacío después.
- [x] **Tests del diff corridos por el reviewer** contra `slt133_a`: 5 de unidad + componente +
  `tarifas-valor-propio-caminos` (corre de verdad, con datos: ✓ por caso): 332 passed. Rojos solo en
  `477-deshacer-cierre-rechazado-sql-real` y `cierre-rechazo-tienda-totales`, que están en
  `tests/baseline-rojos.json` (fallan en el `beforeAll`: «tabla `orden` vacía»). No es hallazgo.
- [x] **Typecheck** verde; **lint** de los archivos tocados verde.
- [x] **Guardias** (`pnpm run test:guardias`): 4 rojos, todos de
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en el baseline y no tiene relación con el
  diff. Sin rojos nuevos.
- [x] **E2E (perfil reviewer, punto 8).** Constancia en `progress/impl_SLT-133.md`: `--project=dinero`
  95/0 (incluye `cierre-dia`, `cierres-admin*`, `cierre-bodega-satelite`, `reglas-bloqueos-cierre`, los
  flujos críticos de cierres) y humo de aislamiento 18/0, bases nuevas. Ningún `e2e/` afirma los textos
  viejos (grep: 0).
- [x] Sin Ordenex, sin secretos, sin dependencias nuevas, sin `db/`, sin literales de país/moneda nuevos.
- [x] `progress/impl_SLT-133.md` contiene el mapa R → test.

## Riesgo de los dos tests de integración en el baseline (L6 y L2)

`477-deshacer-cierre-rechazado-sql-real` (L6) y `cierre-rechazo-tienda-totales` (L2) no pueden correr en
local (baseline: base sin órdenes sembradas), así que su literal nuevo no se ha probado contra datos.
**Riesgo aceptable:** el mensaje es una constante JS del servicio, no se persiste ni sale del SQL; el
camino que lo produce es el mismo que cubren los tests de unidad con literal exacto (L6: 4 tests en
`cierre-dia-477-deshacer.test.ts`; L2: `solicitarCierre` sin gestiones en `cierre-dia-service.test.ts`), y
la contraprueba prueba que esos rompen. El literal editado en el test de integración es idéntico byte a
byte al de la constante. Si un día salen del baseline (SL-31), su aserción ya está al día.

## Hallazgos

Ningún BLOQUEANTE.

1. **menor** — `tests/unit/services/cierre-dia-service.test.ts` ~l.2268: al borrar el
   `toContain("gestionalos…")` el comentario `// FICHA 455 (recorrido F3)…` quedó con 8 espacios de
   sangría en vez de 4. Lint no lo marca; cosmético.
2. **menor** — `requirements.md > Inventario`, nota 2: dice «10 sitios de 9 archivos» fuera del censo;
   hoy hay 13 en 11 archivos (faltan `DevolucionSlaService` y `LiberacionReprogramadaService`). No cambia
   el veredicto: R147 se cumple igual (el diff no los toca), pero el censo de P1 está incompleto.
3. **menor** — T5 dice que los 3 tests de integración «pasan contra una base desechable»; 2 de 3 están en
   el baseline y no corren. La bitácora debería decirlo explícito en vez de darlo por hecho (ver el
   riesgo arriba).
4. **menor** — `progress/features/SLT-133.md`, tabla de la contraprueba, fila L6: «y uno más
   (477-deshacer)» no nombra el test. Trazabilidad algo vaga, aunque la fila tiene otros 3 nombrados.

## Veredicto

**OK** — 0 bloqueantes, 4 menores.
