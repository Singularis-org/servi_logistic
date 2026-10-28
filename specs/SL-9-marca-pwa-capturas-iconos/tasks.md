# SL-9 — Tareas

Todo se hace en el worktree `.worktrees/SL-9-marca-pwa-capturas-iconos`, en finales LF. Cada
`./init.sh` va a un log con `INIT_EXIT=$?` dentro (`docs/gate.md > Trampas conocidas`).

**Reparto** (`docs/perfil-agentes.md > implementer`): todo es `frontend_dev`. No hay pantalla nueva,
así que no pasa por `/design`.

**Regla de todas las tareas (R17).** Un archivo que se crea o se toca queda sin «ordenex» en ninguna
combinación de mayúsculas, comentarios incluidos. Las únicas excepciones son este spec y `progress/`.

## Tareas

- [x] **T1 — Línea base y medidas de la marca anterior** (R3, R4; D2). Antes de tocar nada:
  - correr `pnpm run test:guardias` y
    `pnpm exec vitest related --run "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx"`, con
    los logs en `_trabajo/SL-9-antes-*.log`;
  - calcular el SHA-256 de las tres capturas de `public/screenshots/` tal como están en `dev`;
  - medir en cada una, con `sharp` y la regla de D2, la fracción de píxeles de la marca anterior y de
    la marca nueva.

  **Hecho:** `progress/impl_SL-9.md` tiene los archivos rojos de partida (y cuáles ya están en
  `tests/baseline-rojos.json`), las tres huellas y las seis fracciones.

- [x] **T2 [P] — Script de capturas** (R2, R5–R10; D1). Depende de T1.
  - Crear `scripts/capturas-pwa.mjs` con `PANTALLA_POR_CAPTURA`, `planDeCapturas`, `urlBaseLocal`,
    `fallosDePantalla` y `main()`, según D1.
  - Crear `tests/unit/pwa/capturas-pwa.test.ts`, que importa el script sin abrir el navegador. Casos:
    - R5: con el manifiesto real, el plan tiene las tres capturas con su ruta y su tamaño; el
      `narrow` da viewport 360×780 y escala 1.5, y el `wide` 1280×720 y escala 1;
    - R5: un manifiesto sintético con otro `sizes` cambia el plan, porque los tamaños no están
      escritos en el script;
    - R6: un manifiesto con una captura de más, y otro con una de menos, lanzan un error que la
      nombra;
    - R7: `localhost` y `127.0.0.1` pasan; un dominio público lanza;
    - R9: `fallosDePantalla` devuelve un motivo por cada caso y una lista vacía para la pantalla
      buena. Los casos son: el nombre anterior en mayúsculas (armado con la constante partida de
      D5, nunca literal), sin logo de `/brand/`, fuente sin cargar e indicador visible.
  - Comprobar a mano R8: con la app parada, el script sale con código 1 y el mensaje de D1. Se pega
    la salida.

  **Hecho:** test verde, y comprobado que muerde: con una entrada de `PANTALLA_POR_CAPTURA` borrada
  en una copia, el caso R6 sale rojo. `node scripts/capturas-pwa.mjs` con la app parada da código 1.

- [x] **T3 [P] — `KpisMensajero`** (R11, R12, R14, R15, R16; D3, D4). Depende de T1.
  - En `KpisMensajero.tsx`: `Tile.Icono: LucideIcon` con los cuatro iconos de D3, el círculo
    `bg-accent text-accent-foreground`, fuera el `<img>` y su `eslint-disable`;
    `before:from-purple-200` pasa a `before:from-brand-soft`, y el comentario de la tarjeta se
    reescribe.
  - Crear `tests/components/KpisMensajero.test.tsx` con los casos de D3 y D4.

  **Hecho:** test verde, y `tests/components/textos-estado-455.test.tsx` sigue verde sin tocarlo.
  Comprobado que muerde: con `purple-200` repuesto en una copia, el caso R14 sale rojo.

- [ ] **T4 — Regenerar las capturas** (R1–R4, R9, R10; D1, D2). Depende de T2 y T3.
  - Con un solo servidor y `.next` limpio (`docs/verification.md`), `pnpm build && pnpm start`, y
    luego `node scripts/capturas-pwa.mjs`.
  - Mirar las tres capturas, no solo el código de salida: el logo de la marca nueva, la fuente
    Archivo, ningún naranja ni navy de la marca anterior, ningún indicador de Next ni aviso de
    cookies o de error.
  - Medir en las nuevas las fracciones de D2.

  **Hecho:**
  - el script sale con código 0 y escribe las tres;
  - `tests/unit/pwa/manifest.test.ts` y `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
    siguen verdes sin tocarlos;
  - `progress/impl_SL-9.md` trae, por captura, la salida del script, lo que se vio y las fracciones
    nuevas junto a las de T1.

  Si las fracciones no dejan hueco entre viejas y nuevas, la tarea se para y se avisa al leader (D2).

- [ ] **T5 — Guardia** (R3, R4, R13; D2). Depende de T3 y T4.
  - Crear `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` con las huellas de T1, los
    umbrales fijados entre las medidas de T1 y T4, y los dos casos de R13 con su anti-vacuidad.
  - Borrar `public/icons/icono_envios.png`, `public/icons/icono_entregadas.png`,
    `public/icons/icono_wallet.png` y `public/icons/icono_transacciones.png`.

  **Hecho:** guardia verde sobre el árbol. Comprobado que muerde: con las capturas de `dev` repuestas
  en una copia, R3 y R4 salen rojos, y con un `icono_wallet` escrito en un comentario de `app/`, R13
  sale rojo.

- [ ] **T6 [P] — `docs/marca.md`** (D6). Depende de T4.
  «Pendiente (SL-9…)» pasa a «Hecho en SL-9», con los tres puntos de D6.
  **Hecho:** `grep -i ordenex docs/marca.md` da vacío, y la guardia de SL-8 `marca-texto-amarillo`
  (parte 7, que parsea la tabla de tema oscuro) sigue verde.

- [ ] **T7 — Cierre** (R17; D5). Depende de todas.
  - Correr el comando de D5 (`git diff --name-only --diff-filter=d dev...HEAD …| xargs grep -il
    ordenex`), que tiene que dar vacío.
  - Correr `./init.sh`.

  **Hecho:** salida vacía pegada, `INIT_EXIT=0` en el log y el mapa `R<n> → test` completo en
  `progress/impl_SL-9.md`.

## Trazabilidad prevista

| R | Test |
|---|---|
| R1 | `tests/unit/pwa/manifest.test.ts`, `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` (ya existen) |
| R2, R5, R6, R7, R9 | `tests/unit/pwa/capturas-pwa.test.ts` |
| R8, R10 | `tests/unit/pwa/capturas-pwa.test.ts` (plan) más la salida pegada de T2 y T4 |
| R3, R4, R13 | `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` |
| R11, R12, R14, R15, R16 | `tests/components/KpisMensajero.test.tsx`; R16 también `tests/components/textos-estado-455.test.tsx` |
| R17 | salida de T7 |

## Archivos esperados

- `scripts/capturas-pwa.mjs`
- `public/screenshots/inicio-narrow.png`
- `public/screenshots/ingreso-narrow.png`
- `public/screenshots/inicio-wide.png`
- `public/icons/icono_envios.png` (se borra)
- `public/icons/icono_entregadas.png` (se borra)
- `public/icons/icono_wallet.png` (se borra)
- `public/icons/icono_transacciones.png` (se borra)
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`
- `tests/unit/pwa/capturas-pwa.test.ts`
- `tests/components/KpisMensajero.test.tsx`
- `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`
- `docs/marca.md`
- `progress/impl_SL-9.md`

Si alguna tarea necesita tocar un archivo que no está en esta lista, se añade aquí en el mismo
commit, para que `scripts/archivos-en-vuelo.mjs` lo vea.
