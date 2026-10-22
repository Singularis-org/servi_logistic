# impl SL-32 — Rol superadmin y su usuario de arranque

## Tanda 1 — T1. Texto y guardia (R22, R23) — 2026-10-22

**Archivos en vuelo.** `node scripts/archivos-en-vuelo.mjs` lista SL-15, SL-16 y SL-34 «rama NO
publicada». SL-15 y SL-16 se ignoran: están finalizadas e integradas en dev, y el board local está
desactualizado (lo indicó el leader). SL-34 no toca estos archivos.

**Archivos modificados**
- `lib/api/openapi-spec.ts` (l. 2006): `${EMPRESA.alInicio}` pasa a `${MARCA.nombre}`. `MARCA` sale
  de `lib/config/marca.ts` (`{ nombre: "Servi Logistic" }`). El import de `EMPRESA` se queda porque
  la l. 1486 lo sigue usando.
- `docs/api/api-key-openapi.yaml` (l. 1944): «La empresa puede retirar» pasa a «Servi Logistic puede retirar».
- `docs/api/CHANGELOG.md` (l. 572): «La empresa pasa a poder **retirar** … de su» pasa a «Servi
  Logistic pasa a poder **retirar** … del», como dice el design.
- `tests/unit/guards/docs-marca-heredada.guardia.test.ts`: las dos frases salen de `FRASES_OPERADOR`
  y entran en `FRASES_PLATAFORMA`. El bloque de `CHANGELOG.md` en operador queda vacío y se quita.
  `DESCRIPCIONES_QUE_CAMBIAN` pasa a `"Servi Logistic puede retirar una"`. El suelo de operador baja de
  156 a 154, con el motivo en un comentario. Medido: hay 154 frases después del cambio.

Los cuatro archivos tienen el mismo fin de línea que antes (CRLF en la copia de trabajo). La guardia
salió en LF tras el Edit y se volvió a pasar a CRLF.

**R → test**
- R22 → `docs-marca-heredada.guardia.test.ts` > «R16: «Servi Logistic puede retirar una» dice lo mismo en
  el TS y en el YAML», y > «cada archivo contiene su forma final de cada frase de plataforma» (YAML y CHANGELOG).
- R23 → la misma guardia: las dos frases están en `FRASES_PLATAFORMA` y la paridad usa la forma nueva.

**Salida**
- `pnpm exec vitest related --run lib/api/openapi-spec.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts`
  → `Test Files 23 passed (23)`, `Tests 314 passed (314)`.
  La primera corrida dio 1 failed (`expected 154 to be greater than or equal to 156`). Se corrigió
  bajando el suelo.
- Mutación: «La empresa puede retirar» vuelve al YAML → `Tests 2 failed | 40 passed (42)`. Fallan
  «cada archivo contiene su forma final de cada frase de plataforma» y «R16: «Servi Logistic puede
  retirar una»…». Al revertirla → `Tests 42 passed (42)`, y el diff del YAML queda solo con el cambio de T1.
- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm exec eslint lib/api/openapi-spec.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts` → exit 0, sin salida.

**Gate de la tanda** (`TEST_RAPIDO_BASE=dev ./init.sh`, log en `_trabajo/init-SL-32-t1.log`):
`INIT_EXIT=1`, con `Tests 1 failed | 3992 passed | 20 skipped (4013)`. El único rojo es ajeno al diff:
`tests/unit/guards/test-citado-desaparecido.guardia.test.ts > ninguna excepción temporal sobrevive a su
motivo (D4 de SL-13)`. Dice que las dos excepciones de `specs/461-cobro-a-tienda-y-nombres-claros/design.md`
(`reclasificacion-459-migration.test.ts` y `reclasificacion-459-lista.guardia.test.ts`) ya no tienen su
borrado en la historia de git. La historia se aplanó en `86d70bf`, y el propio mensaje lo da como
esperado. Ese archivo no está en `tests/baseline-rojos.json`. SL-32 no lo toca: se lo paso al leader.

**Veredicto:** T1 está hecha. R22 y R23 tienen test, y la mutación del YAML pone la guardia en rojo.
