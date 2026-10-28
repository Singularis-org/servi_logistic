# Review SL-9 «Capturas e iconos de la PWA con la marca nueva»

## Vuelta 1 (completa, `origin/dev...105033e`, 18 archivos)

Revisado el 2026-10-28 contra el spec (R1–R17, más la decisión humana de D2: umbral < 1.8 %), la
bitácora `progress/impl_SL-9.md`, `CHECKPOINTS.md`, `docs/checkpoints-proyecto.md` y
`docs/perfil-agentes.md > reviewer`. No se corrió `./init.sh` entero, por decisión del humano: el
gate lo corre CI (`gate-completo`). El grafo no se usó: el diff es pequeño y se leyó entero.

### Qué corrí

| Comando | Resultado |
|---|---|
| `vitest run` sobre capturas-pwa, KpisMensajero, textos-estado-455, la guardia nueva, manifest, pwa-manifiesto-atajos y marca-texto-amarillo | 7 archivos, 123/123 verdes |
| `vitest run` sobre sin-nombre-heredado y finales-de-linea-lf | 2 archivos, 18/18 verdes |
| `dependencias-declaradas-presentes.guardia` | 4 rojos. Ya están en `tests/baseline-rojos.json:51`, así que no es un hallazgo |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | exit 0 |
| `eslint` sobre los 5 archivos de código y tests | exit 0 |
| Medida propia, con `sharp` y la regla de D2, sobre las capturas de `origin/dev` y las nuevas | Viejas: 78.323 %, 2.283 % y 81.199 % de la marca anterior, y 0 % de la nueva. Nuevas: 1.289 %, 0.015 % y 0.836 % de la anterior, y 18.509 %, 4.197 % y 23.020 % de la nueva. Coincide con la bitácora, y la guardia da rojo con las viejas |
| SHA-256 de las capturas de `origin/dev` | Coinciden con `HUELLAS_MARCA_ANTERIOR` |
| `urlBaseLocal` con casos límite: `localhost:3000@evil.com`, `evil.com#@localhost`, `localhost.evil.com`, `127.0.0.1.nip.io`, `[::1]`, `localhost.`, `file:`, `ws:` | Todos lanzan. `127.1` y `LOCALHOST` se normalizan a host local, lo cual es correcto |
| `CAPTURAS_URL=https://example.com node scripts/capturas-pwa.mjs` | Mensaje de host no local, `EXIT=1`, sin abrir el navegador |
| `CAPTURAS_URL=http://127.0.0.1:3097 node scripts/capturas-pwa.mjs` con la app parada | «La app no responde en … (ECONNREFUSED)», `EXIT=1`, `public/` intacto |
| Comando de D5 (R17) | Vacío (`GREP=123`) |
| `git grep icono_(envios\|entregadas\|wallet\|transacciones)` fuera de `specs/` y `progress/` | Vacío |
| `git ls-files --eol` de los 6 archivos de texto | Todos `i/lf w/lf` |
| `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml app/globals.css` | Vacío |

### Checklist

**Especificación**
- [x] `requirements.md` con R1–R17 en EARS, y la decisión del umbral anotada en «Decisiones cerradas».
- [x] `design.md` con alternativas descartadas (A–F) y su porqué.
- [x] `design.md` abre con `## Lo que ya existe`, que no está vacía. El diff no re-crea nada de esa
      lista: reutiliza `manifest.test.ts`, `pwa-manifiesto-atajos`, el fixture `contraste`, `lucide-react`
      y el patrón de `generate-pwa-icons.mjs`.
- [x] `tasks.md`: T1–T7 marcadas `[x]`.

**Trazabilidad**
- [x] El mapa `R<n> → test` está en `progress/impl_SL-9.md`.
- [ ] **Cada R<n> tiene un test que falla si se rompe.** No se cumple en R8 ni en R10: ver M1 y M2.

**Calidad de código**
- [x] El typecheck pasa.
- [x] El lint pasa en los archivos tocados.
- [ ] `gate-completo` en CI: queda pendiente del PR, porque lo corre CI.
- [~] Flujo crítico: `KpisMensajero` vive en `/mis-asignaciones/reparto`. El cambio es solo visual y
      no toca acciones ni datos. Ver m6.
- [x] Sin dependencias nuevas: `package.json` y el lock están intactos.

**Seguridad y configuración**
- [x] Sin secretos. La URL base sale de `CAPTURAS_URL`, con un valor por defecto local.
- [x] Sin recursos de Ordenex. Ni el `.env` ni el Supabase de origen se usaron: T4 se levantó con
      `pnpm dev` y solo la `DATABASE_URL` local, por decisión humana.

**Reglas del proyecto (perfil reviewer)**
- [x] Ninguna referencia a Ordenex en lo tocado (R17), comprobado con el comando de D5 y con
      `sin-nombre-heredado`.
- [x] No hay tablas, queries, migraciones ni literales de país o moneda.
- [x] Los comentarios explican el porqué: el todo o nada, los tamaños sacados del manifiesto, el
      tema oscuro, el `size-14`.

**Lo que no debe cambiar**
- [x] Tema oscuro: `dark:before:from-white/10 dark:before:to-transparent` sigue en la tarjeta, y R15
      lo afirma. `app/globals.css` no se toca. Lo único nuevo en oscuro es el círculo `bg-accent`
      (`#352E0E`/`#FFD000`, 9.22:1), que es lo que pide R12.
- [x] Sin dependencias nuevas.

**Puntos pedidos por el leader**
- [x] **Arreglo fuera del spec en el script de T2** (carga `eager` de las imágenes y `conTope` de 30 s).
  - Está justificado: el script esperaba `loadend`, un evento que `<img>` no emite, y dos imágenes
    `lazy` fuera de pantalla no cargaban nunca, así que el script se colgaba.
  - Es fiel a D1 («todas las `img` `complete`»). Mantiene el todo o nada: si vence el tope, la
    pantalla entra en las fallidas y no se escribe nada.
  - `conTope` tiene 3 casos: vence el tope, se resuelve a tiempo y propaga el error propio.
  - La parte `eager` corre dentro del navegador y no tiene test unitario. Es aceptable.
  - Lo que falta es reflejarlo en `design.md` (m2).
- [x] **R7, solo local.** `urlBaseLocal` compara `hostname` exacto tras `new URL`, y resiste los
      trucos de userinfo, fragmento, subdominio y nip.io. `main()` lo llama antes de leer nada y de
      abrir el navegador.
- [~] **Robustez de la guardia nueva:**
  - No depende de la plataforma: usa `path.join`, `sharp` en bruto y `__dirname`.
  - No depende de los finales de línea: los PNG son `binary` en `.gitattributes`, y R13 busca
    subcadenas.
  - R3 compara contra la huella **vieja**, así que una regeneración legítima no la rompe.
  - Lo frágil es el margen de R4 (m4) y que R13 recorre el disco y no `git ls-files` (m5).

### Hallazgos

#### Mayores (BLOQUEANTE)

- **M1 — R8 no tiene ningún test que falle si se rompe.**
  - El mapa dice «`capturas-pwa.test.ts` (plan) + salida pegada de T2». Pero ningún caso del plan
    toca `comprobarQueResponde`. Si se borra la llamada en `main()` o se cambia el mensaje, todo
    sigue verde.
  - La salida pegada es evidencia de un momento, no un test (CLAUDE.md, regla 4). Yo comprobé a mano
    que hoy funciona.
  - **Qué falta:** un caso en `tests/unit/pwa/capturas-pwa.test.ts` que lance el script como proceso
    hijo (`execFileSync`/`spawnSync` de `node scripts/capturas-pwa.mjs`) con
    `CAPTURAS_URL=http://127.0.0.1:<puerto cerrado>` y afirme tres cosas:
    - código distinto de 0;
    - un stderr con «La app no responde en http://127.0.0.1:<puerto>»;
    - que `public/screenshots/` no cambió (mismo SHA antes y después).
  - Corta antes de cargar Playwright, así que no abre ningún navegador y tarda menos de un segundo.
    El mismo patrón, con una URL pública, cubriría de paso el «sin abrir el navegador» de R7.
- **M2 — R10 no tiene ningún test que falle si se rompe.**
  - El mapa dice «(plan) + salida pegada de T4», pero la comprobación IHDR (`dimensionesPng` y el
    bucle de `malMedidas`) no está exportada ni probada.
  - Hoy, si alguien la borra, el script escribiría una captura mal medida con código 0. Es cierto que
    luego `manifest.test.ts` y `pwa-manifiesto-atajos` darían rojo sobre el archivo commiteado. Pero
    R10 pide que sea **el script** el que falle, nombrando la captura.
  - **Qué falta:** sacar a una función pura exportada la comparación de la cabecera con el paso, por
    ejemplo `fallosDeTamano(png: Buffer, paso) → string | null`. Hay que probarla con un PNG del
    tamaño correcto, que no dé fallo, y con uno de otro tamaño, que dé un fallo con el `src`. El PNG
    sale de una captura real o de `sharp({ create })`. `main()` tiene que usar esa función.

#### Menores

- **m1 — El mapa de R17 cita solo la salida manual de D5.**
  - Hay una guardia permanente que ya lo cubre para código y tests: `sin-nombre-heredado` (sobre
    `git ls-files`, sin `docs/`, `specs/` ni `progress/`).
  - Conviene citarla en el mapa, y dejar el comando de D5 como la evidencia para `docs/marca.md`.
- **m2 — `design.md > D1` no recoge el arreglo del script.**
  - Faltan la carga `eager`, la espera de `load`/`error` y `conTope` con `TOPE_ESPERA_MS = 30000`. El
    spec y el código quedan desalineados.
  - Además, colgar `conTope` de R9 es forzado: R9 no habla de esperas. Es robustez del todo o nada.
    Conviene una línea en D1 que lo diga.
- **m3 — R9, «muestra un logo de `/brand/`».** La espera de imágenes también resuelve con `error`, y
  `logos` filtra por `src` y caja visible, pero no por `naturalWidth > 0`. Un logo de `/brand/` que da
  404 cuenta como mostrado. Basta con añadir `img.complete && img.naturalWidth > 0` al filtro.
- **m4 — Margen corto de R4, aceptado por el humano.**
  - `inicio-narrow` da 1.289 % frente al umbral de 1.8 %. Cuando SLT-32 o SL-35 cambien `/` y se
    regeneren las capturas, un poco más de texto `asfalto-9` en la landing puede poner rojo el umbral
    sin que nada haya ido mal.
  - Ya está documentado en `docs/marca.md` y en D2.
  - Sugerencia: anotar en `progress/deudas.md`, o en la ficha SL-33, que hay que regenerar las
    capturas y bajar el umbral al cerrarla, para que no dependa solo de un comentario.
- **m5 — R13 recorre el disco y no `git ls-files`.**
  - Un archivo local sin versionar dentro de `app/`, `components/`, `lib/` o `public/` puede poner
    roja la guardia en una máquina y no en otra. Hoy no hay ignorados en esas carpetas.
  - Además, el recorrido corre al cargar el módulo (`ARCHIVOS_RECORRIDOS`). Si falla, el error sale
    como fallo de colección y no en un caso con nombre.
  - `sin-nombre-heredado` ya usa el patrón de `git ls-files` más `--others --exclude-standard`.
- **m6 — Flujo crítico sin salida de E2E en la bitácora.**
  - `/mis-asignaciones/reparto` es un flujo crítico. SL-9 solo cambia la presentación de los KPI y no
    toca las acciones de asignar, recoger ni gestionar. `e2e/mis-asignaciones.spec.ts` ya recorre esa
    página y lo corre el check `e2e` de CI en el PR.
  - No lo considero bloqueante. Hay que mirar ese check en el PR.

### Veredicto

**RECHAZADO**, con 2 mayores (M1 y M2) y 6 menores.

El resto está bien:
- las capturas son nuevas y la guardia muerde;
- los iconos y el brillo cumplen R11–R16 con tests que muerden;
- R7 es sólido;
- el tema oscuro no cambia;
- no hay dependencias nuevas;
- no aparece Ordenex.

Lo que vuelve al implementer son los dos tests, M1 (R8) y M2 (R10), más actualizar sus filas en el
mapa de `progress/impl_SL-9.md`. Las menores m1–m3 se pueden resolver en la misma vuelta.

El plan de trazabilidad de `tasks.md`, que el humano aprobó, ya preveía la salida pegada para R8 y
R10. Si el humano decide aceptar esa evidencia manual en lugar de los tests, la decisión es suya; con
la regla 4 de CLAUDE.md tal como está, no puedo dar OK.
