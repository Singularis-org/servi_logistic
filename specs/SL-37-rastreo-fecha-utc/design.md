# SL-37 — Design

Se extrae y exporta `normalizarDesfase(nombreZona)` en `lib/services/RastreoPublicoService.ts`:
quita el prefijo «GMT» y devuelve `Z` si lo que queda es vacío o `±00:00`; si no, el resto tal cual.
`formatearEnZona` la usa. El test la prueba aislada con las tres formas literales de UTC y con
offsets no nulos, así no depende de la versión de Node (R1, R2).
