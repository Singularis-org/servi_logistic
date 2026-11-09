# Review SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (HOTFIX desde `origin/prod`)

Diff revisado: `git diff origin/prod...HEAD` (commits `11f0aef6`, `e286b1a0`, `558c289f` T2, `4d81766c` T1).
Base usada para vitest: la desechable `slt96_t1` (URL armada desde `.env` cambiando solo el nombre de la
base; nunca impresa). Para los tests de pantalla, una URL inalcanzable. Grafo: no usado (el worktree no
está indexado, igual que anotó el spec); todo con Grep/Read.

## Checklist

- [x] **`design.md > ## Lo que ya existe`** presente y con contenido; el diff no re-crea nada de la lista
      (`esMontoCero` se mueve y se re-exporta, no se copia; `esperadoDe` y `montoPositivoSchema` se reutilizan).
- [x] **Trazabilidad R1–R13 → test**: mapa completo en `progress/impl_SLT-96.md`; cada R tiene un test que
      lo verifica de verdad (INT contra Postgres real, AC, SV, DLG, MC).
- [ ] **Tasks**: T1, T2 y T3 están hechas pero siguen `[ ]` en `tasks.md` (ver H2).
- [x] **Mutaciones propias** (además de las 19 del implementer):
  - Repositorio: `declaradoEsCero` leyendo `s.totalGeneral.isZero()` en vez de `esperadoDe(s)` → INT
    `3 failed | 4 passed` (R1/R7, R5, R3). Restaurado y comprobado con `cmp`.
  - Diálogo: `montoOk = montoValidoOCero(monto)` (cero sin mirar lo declarado) → DLG `1 failed` (R10).
    `montoOk = montoValido(monto)` (sin la rama nueva) → DLG `4 failed`. Restaurado y comprobado con `cmp`.
- [x] **Corrida propia** de los 5 archivos nuevos/afectados (INT, DLG, MC, AC, SV) contra `slt96_t1`:
      `Test Files 5 passed (5) · Tests 136 passed (136)`, 0 skipped. El INT corrió de verdad.
- [x] **Punto 2 — lo declarado sale de la base y dentro de la transacción**: `declaradoEsCero(tx, id)` usa
      el `tx` del `$transaction` de `marcarConciliado` y de `corregirConciliacion`, lee los tres totales del
      snapshot y aplica `esperadoDe`. La entrada no puede aportarlo: `.strict()` se conserva y lo cubre AC (R5).
- [x] **Punto 4 — con monto > 0 nada cambia**: la lectura nueva está bajo `if (monto.isZero())`; con monto
      > 0 se ejecutan las mismas consultas que antes. El cambio `resultado === "updated"` → `resultado !== null`
      solo deja pasar el nuevo `monto_cero_no_permitido`; la transacción no devolvía otro valor no nulo.
      `montoPositivoSchema` intacto (R8 con su mutación).
- [x] **Punto 3 — `onBlur` (desviación de T2)**: aceptable, ver H3.
- [ ] **Borde zod: la forma del 0** — falla (ver H1).
- [x] Typecheck, lint y `./init.sh`: verdes según el gate del leader (`INIT_EXIT=0`); no los repetí enteros.
- [x] Sin migraciones, sin dependencias nuevas, sin literales de país/moneda en código (el «₡» solo aparece
      en comentarios y títulos de test con el nombre de la ficha), sin recursos de Ordenex.
- [x] Capas: regla en el repositorio (lee la base), traducción en el servicio, forma en el borde zod.
- [x] Tamaño del PR: `scripts/tamano-pr.mjs` → 15/40 archivos, 862/1000 líneas (aviso, no excede).
- [x] Datos: la consulta nueva filtra por `id`, igual que el `updateMany` que ya existía en ese método.

## Hallazgos

### H1 — BLOQUEANTE (R6): el punto de `montoCeroSchema` no está escapado
`lib/types/conciliacion-satelites.ts:283`:

```ts
const montoCeroSchema = z.string().trim().regex(/^0+(.0{1,2})?$/);
```

El `design.md` (línea 57) la define con `\.`: `/^0+(\.0{1,2})?$/`. Sin escapar, el `.` acepta cualquier
carácter. Lo medí con el schema real (`marcarConsolidacionRecibidaSchema.safeParse` + `new Prisma.Decimal`):

| Entrada | Pasa el borde | `new Prisma.Decimal(...)` en el repositorio |
|---|---|---|
| `"0,00"` | sí | lanza `DecimalError: Invalid argument` |
| `"0a0"`, `"0-0"`, `"0 0"`, `"0/0"` | sí | lanza `DecimalError` |
| `"0x0"`, `"0x00"`, `"0e0"` | sí | `0` (hex/exponente aceptados como cero) |

Esto incumple R6: un monto «no numérico» DEBE dar `validation_error` **sin llamar al servicio**. Con
`"0,00"`, que es justo como se escribe en Costa Rica, la petición llega al servicio y termina en un error
interno en vez de un aviso en el campo. La pantalla no lo manda, porque su regex sí escapa el punto, pero la
Server Action es un borde público. Ningún test lo detecta: el `it.each` de R6 no tiene un caso del tipo
`0?0`. Por eso escapar o no el punto da el mismo verde.

**Para cumplirlo:**
- escapar el punto (`/^0+(\.0{1,2})?$/`);
- añadir al `it.each` de rechazos de R6 (marcar y corregir) al menos `"0,00"`, `"0a0"` y `"0x0"`;
- matar la mutación «quitar el `\`» y anotarla en `progress/impl_SLT-96.md`.

### H2 — BLOQUEANTE (checklist de tasks): T1–T3 sin marcar
`specs/SLT-96-consolidacion-cero-recibida/tasks.md`: los ítems de T1 (líneas 17–27), T2 (50–55) y T3 (67–68)
siguen en `[ ]` aunque el trabajo está hecho y verificado. T4 en adelante son pasos posteriores a la review
y pueden quedar abiertos. Hay que marcar T1–T3 en `[x]`; en T1, cuando se corrija H1.

### H3 — menor (aceptable): el `onBlur` también muestra el aviso «mayor que cero» con declarado ≠ 0
El motivo es correcto. El `Modal` no llama a `onConfirm` con el botón deshabilitado, así que sin el `onBlur`
el aviso de R13 no se vería nunca. Con declarado ≠ 0:
- el botón sigue deshabilitado como antes (R10);
- el texto es el de siempre (R13);
- lo único nuevo es que el aviso ahora se ve al salir del campo.

No contradice ningún requisito y mejora un aviso que antes nunca se veía. Lo dejo como menor por dos razones:
es un cambio de comportamiento en un hotfix, y al pulsar «Cancelar» con un monto inválido el aviso puede
destellar antes de cerrar. Se valida en la T6 (Preview) de las dos ramas; no hace falta cambiar código.

### H4 — menor: con monto 0 y declarado ≠ 0 sobre una consolidación ya conciliada, «marcar» responde `validation_error` y no `conflict`
La regla del 0 se evalúa antes del `updateMany`. Es coherente con R2, porque no se escribe nada, y el diálogo
no ofrece «marcar» sobre una consolidación ya conciliada. Lo anoto solo como orden de desenlaces.

## Veredicto

**RECHAZADO** (CAMBIOS). Hay dos bloqueantes:
- **H1:** en el regex del 0 del borde falta escapar el punto, lo que incumple R6, y falta el test que lo mate;
- **H2:** las tasks T1–T3 están sin marcar.

Lo demás (R1–R5 y R7–R13, lectura de lo declarado desde la base dentro de la transacción, monto > 0 sin
cambios) está verificado con mutaciones propias. Una vuelta 2 puede limitarse a revisar el diff de H1 y H2.
