# Review SLT-148 «Detalle del cierre de bodega sin N+1» — vuelta 1

Rama `feature/SLT-148-detalle-bodega-sin-n1`, HEAD `aef11c73`, diff `origin/dev...HEAD`. Ruta completa
(lee dinero congelado): correcta para el alcance.

## Verificación ejecutada por el reviewer

- `vitest run` (base desechable `slt148_wt`, sin `skip`) de
  `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts`,
  `tests/unit/repositories/cierres-bodega-admin-repository.test.ts`,
  `tests/unit/repositories/cierre-pagos-lectura.test.ts` y
  `tests/unit/guards/pagos-proyeccion.guardia.test.ts`: **4 archivos, 45 passed, EXIT=0**.
- `node scripts/tamano-pr.mjs`: 4/40 archivos, 115/1000 líneas de producción, 1102/3000 de tests. Dentro.
- Historial: `94489f6d` (solo el test de integración) es anterior a cualquier cambio de `lib/`
  (`296434f3`). `git diff 94489f6d HEAD` del test: ningún literal de `esperadoBX`/cabeceras cambia;
  solo `CONSULTAS_DETALLE_SIN_DIAS` 7 -> 5 (endurece), la aserción de zona en el `WHERE` de R425 y el
  `it` de R420 (añadidos).
- No apliqué mutaciones (instrucción del leader); las evalué leyendo el código final.

## Checklist

- [x] Trazabilidad R420-R429 -> `it` concretos del test de integración (Postgres real), ninguno vacío.
- [ ] Tasks: **T4.1, T6.2 y T6.3 siguen `[ ]`** (ver B1).
- [x] Tamaño del PR.
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff no re-crea nada de la lista.
- [x] Typecheck/lint: gate del leader INIT_EXIT=0; bitácora TSC_EXIT=0 / ESLINT_EXIT=0.
- [ ] E2E afectados en local (perfil reviewer, punto 8: diff que toca dinero): **sin constancia** (B1).
- [x] Sin migraciones, sin tablas nuevas, sin literales de país/moneda nuevos, sin recursos de Ordenex,
      sin dependencias nuevas.
- [x] Capas: el cambio vive en el repositorio; interfaz y servicio intactos (E1).

## Respuestas a lo pedido

1. **Paridad.** Sí. Los literales de BX están calculados a mano en la bitácora (T1) y el test se commiteó
   solo (`94489f6d`) con «7 passed» contra el código anterior; después ningún literal de respuesta se tocó.
2. **Alcance en el `WHERE`.** Sí. R425: las 4 sentencias son exactamente las de la cabecera y la zona de S
   está en los parámetros de `ev[0]`. R426: toda sentencia con tabla principal `gestion_orden` o
   `cierre_detail` lleva parámetros string y todos son ids de D1-D3 (una sin `where` falla por
   `ids.length > 0`). Contra Postgres real.
3. **Tanda 2.** Sin N+1: R420 compara N = 3 con N = 1 por igualdad de sentencias (24 = 24, verde aquí).
   El corte `_count.cierresDia === 0` es correcto: ese `_count` es sin filtro
   (`_count: { select: { cierresDia: true } }`), viene en la misma sentencia de la cabecera y R428 fija 5
   exactas. El caso «cabecera con cierres del día pero sin gestiones» no queda escondido: `_count > 0`
   entra al camino normal, la relación devuelve `gestiones: []` y el día sale con lista vacía, igual que
   antes. Pero **no hay test** de ese caso (m1).
4. **Mutaciones.** Cubren el código final. Re-corridas en tanda 2: M1, M2, M3 (sobre `cierre_detail`), M6.
   Las no re-corridas tocan código que la tanda 2 no cambió (M5, M7/M7b, M8, M9: mismo `map`, misma
   cabecera) o siguen muertas por los mismos literales (M4: `orderBy` ahora en la relación; lo matan el
   orden exacto de `esperadoBX` y el `toEqual({ createdAt: "desc" })` del unitario). La variante de M3
   sobre `gestion_orden` ya no es aplicable tal cual: el acotado lo da la relación de Prisma
   (`cierre_id IN`), y R426 la vigila igual.
5. **Literales aflojados.** Ninguno. En los unitarios, las aserciones por cierre del día pasan de
   «2 llamadas con `cierreId: cdN`» a «1 llamada con `{ cierreId: { in: ["cd1","cd2"] } }`» + reparto de
   gestiones por día + `toBe(GESTION_ADMIN_SELECT)`: equivalentes o más estrictas.

## Hallazgos

### BLOQUEANTE

- **B1 — Tareas abiertas y E2E sin constancia.** `tasks.md` tiene `[ ]`:
  - **T6.3**: `./init.sh` está verde (leader), pero el grupo E2E `dinero` y los E2E que abren el detalle
    de un cierre de bodega no constan corridos en local. `docs/perfil-agentes.md > reviewer`
    (diff que toca dinero sin E2E locales = bloqueante). Falta: correrlos con base desechable nueva y
    anotar la salida en `progress/impl_SLT-148.md`.
  - **T4.1**: `cierre-bodega-desglose-por-tienda-sql-real` y `486-evidencias-cierres-sql-real` no se
    corrieron con datos (están en `tests/baseline-rojos.json`, así que su rojo local NO es hallazgo).
    Falta: correrlas contra una base con datos sembrados, o anotar como constancia el `gate-completo`
    del CI de este PR, y marcar la casilla.
  - **T6.2**: hecha en `772fe8d0` (D67 cerrada en `progress/deudas.md`), solo falta marcar la casilla.

### menor

- **m1** — Ningún cierre del día del corpus tiene 0 gestiones. R420 dice «sea cual sea el número de
  gestiones»; el comportamiento coincide con el anterior por construcción, pero un día vacío en BX
  (o un B2 con un día sin gestiones) lo fijaría con sentencias y respuesta.
- **m2** — Bitácora desfasada: tanda 1 (línea ~100) describe una aserción `{ ...GESTION_ADMIN_SELECT,
  cierreId: true }` que la tanda 2 sustituyó; tanda 2 (línea 189) dice que R428 pasa a «como mucho»,
  pero `aef11c73` lo dejó exacto en 5.
- **m3** — `docs/checkpoints-proyecto.md > Datos y seguridad`: la lectura nueva de `cierre_detail` por
  `cierreId IN` no tiene test con dos empresas. Sus ids salen de la cabecera ya acotada (empresa por
  extensión + RLS) y antes la consulta era la misma por `cierreId = x`, así que no abre nada nuevo; se
  anota por completitud.
- **m4** — El corte usa `_count.cierresDia` leído en una sentencia y `cierre_dia` en otra, fuera de
  transacción. Un cierre de bodega consolidado no gana cierres del día, así que no hay carrera real; si
  algún día los ganara, el peor caso es devolver lista vacía un instante.

## Veredicto

**CAMBIOS** (RECHAZADO) por B1. El código y los tests están bien (paridad, alcance, sin N+1, mutaciones
cubiertas). Lo que falta es cerrar T4.1/T6.2/T6.3 con constancia; no hace falta tocar `lib/`.
