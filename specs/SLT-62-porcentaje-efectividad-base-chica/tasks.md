# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes» — tasks

Orden: T1 → T2 → T3; T4 y T5 en paralelo tras T3; T6 al final.
Convención: los tests de cada R se escriben ANTES que el cambio que los pone en verde, y se ve
el rojo primero.

## Tanda única

- [ ] **T1 · Tests de la regla en rojo** (R1, R2, R3)
  - En `tests/unit/analytics/madurez-cohorte.test.ts`, borrar los `describe` «R3 · BASE DEMASIADO
    CHICA» y «R4 · el suelo se DERIVA», más los imports de `MINIMO_BASE_PORCENTAJE` y
    `efectividadCohorteConfig`.
  - Añadir los casos R1 y R2 con base chica y el barrido de R3 (`design.md > Tests`).
  - Actualizar el comentario de `madurez-cohorte.test.ts:76-81` (ya no hay suelo «de rebote»).
  - **Hecho:** `pnpm exec vitest related --run lib/analytics/madurez-cohorte.ts` sale ROJO en R1,
    R2 y R3, y en nada más.

- [ ] **T2 · Quitar el suelo de la regla** (R1, R2, R3). Depende de T1.
  - `lib/analytics/madurez-cohorte.ts`:
    - quitar `MINIMO_BASE_PORCENTAJE`, el import de config y la línea del suelo en `porcentaje`;
    - dejar `MotivoSinPorcentaje = "sin_cerradas"`;
    - reescribir la cabecera.
  - Borrar `lib/config/efectividad-cohorte.ts`.
  - **Hecho:** T1 en verde, y `rg "MINIMO_BASE_PORCENTAJE|efectividad-cohorte|base_insuficiente"`
    no devuelve nada fuera de `specs/` (los textos se limpian en T3).

- [ ] **T3 · Textos sin aviso, con sus tests primero** (R4, R5, R6). Depende de T2.
  - Primero los tests, y verlos en rojo:
    - crear `tests/unit/components/madurez-textos.test.ts` con el barrido de R6;
    - en `tests/components/EfectividadHeroe.test.tsx`, sustituir el bloque «Zona El Coco» por los
      casos R4 (Jason Barrios 12/11/1 → `91,7 %`), R5 (64/2/61 y 8/6/0) y R6.
    - Antes de escribir los literales, confirmar con una ejecución que `formatearValor` da
      `66,7 %` y `75,0 %`, y no `75 %`. Si da otra cosa, se escribe el literal que dé, no la
      llamada a la función.
  - Después, `madurez-textos.ts`:
    - quitar la rama `base_insuficiente` de `titularDelHeroe`;
    - quitar las dos frases «hacen falta…» de `fraseSobreCerradas`;
    - quitar las constantes `TOLERANCIA` y `SUELO` y sus imports;
    - reescribir la cabecera.
  - **Hecho:** los tres archivos de test en verde, y
    `rg "hacen falta|baile solo|muy pocas para un porcentaje" app/ lib/` vacío.

- [ ] **T4 [P] · Guardia de frontera.** Depende de T2.
  - En `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts`, la entrada 441 pierde
    `MINIMO_BASE_PORCENTAJE` y su `motivo` deja de citar el suelo y el config.
  - **Hecho:** `pnpm run test:guardias` en verde.

- [ ] **T5 [P] · Mutaciones.** Depende de T3.
  - Ejecutar las cuatro de `design.md > Tests` (reponer el suelo, reponerlo solo en cerradas,
    reponer la frase, quitar `sin_cerradas`). Anotar en `progress/impl_SLT-62.md` qué test cae con
    cada una, con el nombre del test.
  - Revertir cada mutación y verificar con `git diff` que no queda nada.
  - **Hecho:** las cuatro salen rojas y el árbol está limpio.

- [ ] **T6 · Cierre.** Depende de T4 y T5.
  - `pnpm run typecheck`, `pnpm run lint` y `./init.sh` en verde.
  - Mapa `R1..R8 -> test` en `progress/impl_SLT-62.md`. R7 y R8 apuntan a los tests existentes, que
    se conservan.
  - Captura de la tarjeta héroe en `/analitica`, con un recorte de menos de 20 órdenes (memoria:
    verificar lo que el usuario ve). Va en `progress/impl_SLT-62.md`.
  - **Hecho:** todo verde y el mapa completo.

## Archivos esperados

- `lib/analytics/madurez-cohorte.ts`
- `lib/config/efectividad-cohorte.ts` (se borra)
- `app/(app)/analitica/_components/entregas/madurez-textos.ts`
- `app/(app)/analitica/_components/entregas/EfectividadHeroe.tsx` (solo si se quita el parámetro `cargadas` de `fraseSobreCerradas`)
- `tests/unit/analytics/madurez-cohorte.test.ts`
- `tests/unit/components/madurez-textos.test.ts`
- `tests/unit/components/textos-455-recorrido.test.ts` (solo si cambia la firma de `fraseSobreCerradas`)
- `tests/components/EfectividadHeroe.test.tsx`
- `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts`
- `progress/impl_SLT-62.md`
- `progress/features/SLT-62.md`
