# SL-37 — Tasks

- [x] **T1 [BACK]** Exportar `normalizarDesfase` y usarla en `formatearEnZona`. **Hecho:** typecheck verde.
- [x] **T2 [BACK]** Test determinista en `tests/unit/services/rastreo-publico-service.test.ts`:
  «», «GMT», «GMT+00:00» → `Z` (R1); «GMT-06:00», «GMT+05:30» → sin cambio (R2). **Hecho:** verde, y
  rojo al quitar la normalización (mutación).
