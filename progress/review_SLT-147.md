# Review SLT-147 «Limpieza de backend de cierres: deudas D63, D66, D68 y D72» — vuelta 1

Ruta ligera, acotada a `git diff origin/dev...HEAD` (HEAD `30804110`). Grafo no consultado (Grep/Read).

## Checklist

- [x] **Trazabilidad R410-R418:** cada R tiene test real (detalle abajo).
- [ ] **Tasks:** T0-T5 `[x]`; **T6 y T7 siguen `[ ]`** en `requirements.md > ## Tasks` aunque están hechas
  (T6: commit `30804110`, las cuatro deudas cerradas; T7: gate del leader `INIT_EXIT=0` y mapa en
  `progress/impl_SLT-147.md`). Ver m1.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 18/40 archivos, 114/1000 producción, 477/3000 tests.
- [x] **Lo que ya existe:** sección presente y con evidencia; el diff no re-crea nada.
- [x] **Ruta ligera vigente:** sin cambio de comportamiento de dinero (ver punto 4).
- [x] **Verificación propia:** `pnpm run typecheck` → `TC_EXIT=0`, 0 `error TS`. `vitest run` de los 11
  archivos de test unit/componente/guardia tocados → `11 passed`, `413 passed`, `VT_EXIT=0`.
- [x] **perfil-agentes > reviewer:** sin tablas, migraciones, RLS ni dependencias; sin literales de país en
  código nuevo de producción; comentarios explican el porqué.

## Lo pedido por el leader

1. **D63.** `git grep -w listarCierresImputables` fuera de `progress/`/`specs/` solo encuentra la guardia.
   De los 7 tests borrados: WHERE, orden, sin `take` y `tx` ya estaban en los dos R9 de
   `listarCierresImputablesEnAlcance` (WHERE exacto con `destinoTipo`, `orderBy` exacto); el resto
   (sin `resueltoAt`/`skip`/`cursor`, select de 7 columnas + escala 2 con la marca en la salida, sin
   escrituras, `[]`) pasó a cuatro casos R411 con alcance. El de contraste se borra con su objeto.
   Ningún invariante queda sin probar. La guardia muerde: `\b…\b` no casa con `…EnAlcance`, el barrido
   comprueba que no está vacío, y el `in prototype` cubre un nombre computado (M2 de la bitácora).
   Los comentarios de «complemento exacto» son ciertos: `contarCierresNoAprobadosPorEstado` aplica el
   mismo `alcanceWhere`.
2. **D66.** Literales a mano en las tres capas (`1250.00`, `275.06`, `2500.50`, `2750.00`, «₡1.250»);
   ninguno se compara contra la función que lo calcula. El caso «incidente 0.00» de SLT-52 intacto (el
   único cambio en esa zona del archivo es el `import` de `pagosDelCierre`).
3. **D68 opción A.** `CierrePasadoDeRepositorio` exige `pagoIndependienteEfectivo: boolean`; la paginada
   de interfaz y clase lo devuelve; `toCierrePasadoDTO` es su constructor. El `@ts-expect-error` de R416
   se ata a la firma de `findCierresByMensajeroPaginado` (no a un alias), así que muerde en las dos
   mutaciones (M6, M7). El doble `false` de `cierre-dia-action.test.ts` no tapa nada: esa suite no
   ejercita la paginada (solo `findCierresByMensajero`), y `false` es lo que el servicio ya infería.
   R417: los casos `false` citados (líneas 192-194) llevan la marca explícita; el nuevo distingue
   «marca ignorada» por el caso sin conciliar (`3000.00`).
4. **Dinero.** El único cambio de producción en un cálculo es `c.pagoIndependienteEfectivo === true` →
   `c.pagoIndependienteEfectivo`. Aguas abajo (`CierreDiaService.ts:686`, `:697`, `:704`) la marca se lee
   por veracidad, y el tipo ya no admite `undefined`: resultado idéntico. Lo demás es borrar una lectura
   sin consumidores, tipos, comentarios y tests. No sube de ruta.
5. **`progress/deudas.md`.** D63 (R410-R411), D66 (R412-R415), D68 (R416-R417, opción A, dice que
   `CierrePasadoDTO` no cambia) y D72 (R418) dicen lo que se hizo y citan R correctos. El mapa de
   `progress/impl_SLT-106.md` nombra los tests (a)/(b) y sus cláusulas coinciden con R190/R191.

## Hallazgos

- **m1 (menor)** — `specs/SLT-147-limpieza-backend-cierres/requirements.md`: T6 y T7 sin marcar. El
  trabajo está hecho; falta marcar `[x]` antes de abrir el PR.
- **m2 (menor)** — líneas citadas desfasadas en uno: spec e impl dicen
  `ConsolidacionBodegaRefresco.test.tsx:459`/`:479`; hoy son `:460`/`:480`. El mapa de SLT-106 cita por
  nombre, así que no afecta a R418.
- **m3 (menor)** — `progress/deudas.md` D63: «del interfaz» → «de la interfaz».
- **m4 (menor)** — sin constancia de E2E corridos en local. No aplica la regla de E2E de
  `perfil-agentes > reviewer`: no se toca `db/` ni pantallas, y el dinero no cambia (punto 4);
  Decisión 4 del spec descarta E2E nuevo.

Bloqueantes: ninguno.

## Veredicto

**APROBADO** (OK). Marcar T6/T7 (m1) antes del PR; m2-m4 opcionales.
