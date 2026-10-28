# impl SL-9 — Capturas e iconos de la PWA con la marca nueva

## T1 — Línea base

Medido el 2026-10-28 en el worktree `.worktrees/SL-9-marca-pwa-capturas-iconos`, rama
`feature/SL-9-marca-pwa-capturas-iconos` (HEAD `d730065`), sin tocar código, tests ni `public/`.

Archivos creados: `progress/impl_SL-9.md` (este). Fuera de git (`_trabajo/` está en
`.gitignore`): `_trabajo/SL-9-antes-guardias.log`, `_trabajo/SL-9-antes-kpis.log`,
`_trabajo/medir-marca-SL-9.mjs`.

### Rojos de partida

`pnpm run test:guardias` → `_trabajo/SL-9-antes-guardias.log`, `EXIT=1`:

```
 Test Files  1 failed | 313 passed | 2 skipped (316)
      Tests  4 failed | 4384 passed | 20 skipped (4408)
```

| Archivo rojo | Casos rojos | ¿En `tests/baseline-rojos.json`? |
|---|---|---|
| `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` | 4 (R2, R6, R2/R6, R4 de la guardia 420) | Sí (desde 2026-10-21, la retira SL-29) |

No hay rojos de partida fuera de la baseline.

`pnpm exec vitest related --run "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx"` →
`_trabajo/SL-9-antes-kpis.log`, `EXIT=0`:

```
 Test Files  2 passed (2)
      Tests  31 passed (31)
```

### Huellas de la marca anterior (SHA-256, tal como están en `dev`)

`git diff dev -- public/screenshots` vacío (`git diff dev --quiet` sale con 0).

| Archivo | SHA-256 |
|---|---|
| `public/screenshots/inicio-narrow.png` | `aa0f6826301706c9059611da3f80358ee0d100f7c858a5b4994a20c40c81f2bb` |
| `public/screenshots/ingreso-narrow.png` | `79cba346f3ac7fd8f93846af85d5460c76e66957f3910e4e8bc6719419d0a0e9` |
| `public/screenshots/inicio-wide.png` | `4ca3d4adfd3ac62d51b76a79a6ea7dd6b1ca2cb6a89be7e74acbfd7c3b7cfc0a` |

### Fracciones de píxeles (D2: distancia euclídea RGB <= 24, `sharp` `.removeAlpha().raw()`)

| Captura | Tamaño | Marca anterior (naranja + navy) | Marca nueva (negro + amarillo) | naranja `#f26419` | navy `#0b2545` | negro `#111111` | amarillo `#FFD000` |
|---|---|---|---|---|---|---|---|
| `inicio-narrow.png` | 540x1170 | 78.323 % | 0.000 % | 0.159 % | 78.164 % | 0.000 % | 0.000 % |
| `ingreso-narrow.png` | 540x1170 | 2.283 % | 0.000 % | 2.116 % | 0.167 % | 0.000 % | 0.000 % |
| `inicio-wide.png` | 1280x720 | 81.199 % | 0.000 % | 0.144 % | 81.055 % | 0.000 % | 0.000 % |

Lectura: con los umbrales de partida de D2 (anterior < 0.5 %, nueva >= 1 %) las tres capturas
viejas dan rojo por los dos lados, así que la guardia muerde. La captura con menos marca anterior es
`ingreso-narrow.png` (2.283 %); el umbral de "anterior" se fija entre esa cifra y la que mida T4.

### Comando de medición (reutilizable en T4)

```
node _trabajo/medir-marca-SL-9.mjs public/screenshots/inicio-narrow.png public/screenshots/ingreso-narrow.png public/screenshots/inicio-wide.png
```

Acepta una o más rutas de PNG como argumentos e imprime, por captura, la suma de cada marca y las
cuatro fracciones por color.

Veredicto T1: línea base tomada; único rojo de partida ya en la baseline, huellas y fracciones
anotadas.

## T2 — Script de capturas

Archivos: `scripts/capturas-pwa.mjs` (nuevo), `tests/unit/pwa/capturas-pwa.test.ts` (nuevo).

- `pnpm exec vitest related --run scripts/capturas-pwa.mjs tests/unit/pwa/capturas-pwa.test.ts`: 1 archivo, 21/21 verdes.
- Muerde: copia en `_trabajo/muerde-T2/` con la entrada `inicio-wide.png` borrada de `PANTALLA_POR_CAPTURA` → 7 rojos, entre ellos los dos casos de R6. El original vuelve a dar 21/21.
- R8 a mano (`:3000` ocupado por otro proceso, se usó `:3099` libre):

```
$ CAPTURAS_URL=http://localhost:3099 node scripts/capturas-pwa.mjs; echo EXIT=$?
La app no responde en http://localhost:3099: arráncala con pnpm build && pnpm start
  (ECONNREFUSED)
EXIT=1
```

- R7 a mano: `CAPTURAS_URL=https://example.com` → mensaje de host no local y `EXIT=1`. `public/screenshots` sin cambios tras ambas corridas.
- Añadidos sobre D1: `planDeCapturas` lanza también con `sizes` mal formado o `form_factor` distinto de `narrow`/`wide`; `urlBaseLocal` lanza con URL inválida o no http(s); R8 imprime la causa debajo.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192`) 0; eslint sobre los dos archivos 0 avisos. LF; `grep -il ordenex` vacío.

## T3 — `KpisMensajero`

Archivos: `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx` (modificado), `tests/components/KpisMensajero.test.tsx` (nuevo).

- `pnpm exec vitest related --run "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx" tests/components/KpisMensajero.test.tsx`: 3 archivos, 36/36 verdes (`KpisMensajero.test.tsx` 5/5, `textos-estado-455.test.tsx` 15/15 sin tocarlo, `MisAsignacionesPage.test.tsx` 16/16).
- Muerde: con `before:from-purple-200` repuesto en el componente → R14 rojo (`expected 'group/card …' not to contain 'purple-'`), 4 verdes. Restaurado y verificado por sha1.
- Typecheck 0; `pnpm run lint` 0 errores (231 avisos ajenos, 0 en estos archivos). LF; `grep -il ordenex` vacío.
