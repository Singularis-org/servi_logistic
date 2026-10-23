# SL-37 — Design

## Lo que ya existe

Buscado `longOffset`, `timeZoneName`, `formatearEnZona`, `Intl.DateTimeFormat` y `toISOString`
en `lib/`, y `rastreo` en `specs/`:

- `lib/services/RastreoPublicoService.ts > formatearEnZona` (feature 229, R19,
  `specs/229-rastreo-publico-envio/`): es el único sitio del repo que usa
  `timeZoneName: "longOffset"`. **Se reutiliza tal cual**: mismo locale, mismas partes, misma
  zona por configuración (`config.ZONA_HORARIA`); solo cambia cómo se escribe el desfase.
- `lib/utils/hora-cr.ts` y `lib/utils/separador-dia-cr.ts`: usan `Intl.DateTimeFormat`, pero sin
  `timeZoneName` y con la zona fija de Costa Rica. No resuelven el desfase y no se tocan.
- `tests/unit/services/rastreo-publico-service.test.ts`: la suite existente de 229 (R19 incluido)
  se reutiliza; SL-37 le añade dos `describe` en vez de crear un archivo nuevo.

Nada en `specs/` trata el desfase UTC (solo `229-rastreo-publico-envio`, que lo introdujo).

## Diseño

Se extrae y exporta `normalizarDesfase(nombreZona)` en `lib/services/RastreoPublicoService.ts`:
quita el prefijo «GMT» y devuelve `Z` si lo que queda es vacío, `+00:00` o `-00:00`; si no, el
resto tal cual. `formatearEnZona` la usa. El test la prueba aislada con las formas literales de
UTC y con offsets no nulos, así no depende de la versión de Node (R1, R2).

## Alternativas descartadas

- **Fijar la versión de Node en CI** (igualarla a la local). Descartada: tapa el síntoma en una
  máquina y lo deja abierto en cualquier otra (Vercel, otro dev); la salida de `Intl` para UTC no
  es un contrato y puede volver a cambiar con el ICU.
- **Usar `Date#toISOString` cuando la zona es UTC.** Descartada: obliga a detectar «la zona es UTC»
  por nombre (`UTC`, `Etc/UTC`, `GMT`…), y una zona con desfase cero que no se llame así seguiría
  saliendo `+00:00`. Además da segundos y milisegundos, otro formato distinto del de R19.
- **`timeZoneName: "shortOffset"`.** Descartada: da «GMT-6» sin minutos ni relleno, y habría que
  reconstruir `±HH:MM` a mano; y en el desfase cero también da «GMT», así que habría que
  normalizarlo igual.
