# review_SL-33 — SL-33 «Paleta secundaria: gráficas, grises cálidos y navy restante»

## Vuelta 1 (diff `origin/dev...2d072d4`)

Revisado en el worktree `.worktrees/SL-33-paleta-secundaria`, rama `feature/SL-33-paleta-secundaria`
(HEAD `2d072d4`, igual a la remota). No usé el grafo de código: el diff es CSS, HTML, comentarios y
tests de texto. Lo leí con Grep y Read.

### Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm exec vitest run`: los 11 tests de la feature (paleta-secundaria, contraste-tokens, impresion-tokens, impresion-sin-dark, factura-contraste, marca-texto-amarillo, tema-encendido, color-contador, TableroDiaComposicion, analytics-paleta, marca-pwa-capturas-iconos) | `Test Files 11 passed (11) · Tests 320 passed (320)` |
| `pnpm exec vitest run`: los relacionados con los archivos tocados (RedDeErrores, RutaMapaInner, UbicacionMapa, docs-marca-heredada, fuente-unica-nombre-estado, html-lang, marca-estaticos, notifications-bell-tokens, pwa-servida-sin-sesion, sin-integrador-de-ordenex, sin-nombre-heredado, capturas-pwa, primitivas) | `Test Files 13 passed (13) · Tests 200 passed (200)` |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | exit 0 |
| `pnpm exec eslint` sobre los `.ts`/`.tsx` del diff | exit 0 |
| `git grep` propio de los 21 HEX de SL-8 D5 y del `rgba(242,100,25…)` fuera de `tests/`, `specs/` y `progress/` | Solo sale `app/globals.css`, y únicamente en comentarios: la exclusión de R20 lo permite |
| `git grep` de «Ordenex» en los archivos del diff, sin `specs/` ni `progress/` | vacío |
| Recuento de casos `it`/`it.each` en los 8 tests existentes modificados, `origin/dev` frente a HEAD | Iguales en los 8: no se retiró ningún caso |
| Tokens no `chart` cambiados en `globals.css` | Solo los grises del tema claro y de impresión, más `asfalto-*` y `kraft-inset`. `.dark` y `.tema-sistema` no tocan nada fuera de `chart` (R12) |
| Diff escaneado en busca de secretos, URLs de Supabase, `DATABASE_URL` y `console.log` | nada |

### Checklist

**Especificación**
- [x] `requirements.md` con R1–R20 en EARS.
- [x] `design.md` con alternativas descartadas: 8, con su porqué.
- [x] `tasks.md`: T0–T9 marcadas `[x]`.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: reutiliza
      `contraste()`, `componer()`, `token()`, `paleta()`, `reglasDe()`, `paleta.ts` y
      `capturas-pwa.mjs`. La guardia nueva importa la aritmética de los fixtures y no la reescribe.

**Equipo**
- [x] Assignee en la ficha (Camilo) y rama `feature/SL-33-paleta-secundaria` publicada.

**Trazabilidad**
- [x] Cada `R<n>` mapea a un test concreto que lo verifica, con caso sintético en rojo y caso real
      (detalle abajo).
- [x] `progress/impl_SL-33.md` contiene el mapa `R → test`.

**Calidad de código**
- [x] Typecheck sin errores (corrido).
- [x] Lint sin errores (corrido sobre el diff).
- [ ] `gate-completo` en CI: todavía no hay PR. Es un paso posterior a esta revisión y no cuenta
      como hallazgo.
- [x] Flujos críticos: no toca ninguno de `docs/checkpoints-proyecto.md`. Los mapas de
      `mis-asignaciones` solo cambian el color de un pin y de una línea, no la asignación ni la
      recepción.
- [x] Sin dependencias nuevas: `pnpm install --frozen-lockfile` con aprobación humana y sin cambio
      en el lockfile.

**Seguridad y configuración**
- [x] Sin secretos ni valores que dependan del entorno. Ningún id de recurso de la app de origen
      en el diff.

**Datos, arquitectura y permisos** (checkpoints del proyecto)
- [x] No aplican: no hay tablas, queries, migraciones, actions ni rutas.
- [x] Sin literales de país ni de moneda.

**Verificación final**
- [ ] `./init.sh`: no se corre por instrucción del leader. El gate lo hace CI.
- [ ] `progress/features/SL-33.md > Cierre` y el desmontaje del worktree: pasos posteriores.

**Reglas del reviewer** (`docs/perfil-agentes.md > reviewer`)
- [x] Nada bloqueante del perfil: no hay `organizacion_id`, RLS, migraciones, literales de país ni
      recursos de Ordenex.
- [x] Sin dependencias nuevas.
- [~] Comentarios: los nuevos explican el porqué. Queda un porqué desactualizado en `button.tsx`
      (hallazgo m1).

### Trazabilidad R → test (comprobada leyendo los casos)

| R | Test | Comprobado |
|---|---|---|
| R1, R2 | `paleta-secundaria.guardia` › R1, R2 | Los 20 `--chart-N` de la tabla aprobada, como literal, en los 5 bloques; tiene caso sintético |
| R3 | › R3 | 40 pares ≥ 3 en claro, `.dark` y `.tema-sistema` |
| R4 | › R4 + `contraste-tokens` › Feature 292 | `-soft` igual a `componer(…, 0.15)` y `-strong` ≥ 4.5 en las tres superficies |
| R5 | › R5 + `color-contador.guardia` | `COLOR_SEGMENTO` y `VARIANTE_CONTADOR` reales, más las variantes de `badge.tsx` |
| R6 | › R6 + `TableroDiaComposicion` | Segmentos ≥ 3 sobre `--muted` en los dos temas |
| R7 | › R7 | Los 13 tokens de D5 con su `stone-N`, también en papel |
| R8 | › R8 | 31 pares de D5 con `después ≥ antes`. La excepción de `asfalto-2` va fijada a 1.26 y 1.17, y un caso comprueba que es la única |
| R9 | › R9 | CSS sin comentarios, con el borde de hex controlado |
| R10 | › R10 | Los 8 nombres siguen en `@theme` |
| R11 | › R11 | `TituloSeccion` → `text-asfalto-9` → `stone-900`, que no está en SL-8 D5 |
| R12 | › R12 + `tema-encendido` | `.dark` y `.tema-sistema` contra la tabla de `docs/marca.md` |
| R13 | › R13 | Las dos tablas de `docs/marca.md` contra el CSS y el fixture |
| R14 | Guardias de D8 | Revisado literal a literal (ver «Puntos pedidos») |
| R15 | `marca-pwa-capturas-iconos.guardia` | Umbral < 0.1 % con las capturas regeneradas (ver m2 sobre las huellas) |
| R16 | › R16 | Lista de archivos de la feature, más un caso sintético |
| R17 | › R17 | `offline.html`: los 8 colores de D13, `theme-color` igual al del manifiesto, ningún hex fuera de D13 y pares con `max(antes, umbral)` |
| R18 | › R18 + `RedDeErrores` | `ESTILO_CUERPO` y `ESTILO_BOTON` sin comentarios |
| R19 | › R19 | Pin y tramo `#111111` leídos del código, y contraste contra `TIERRA_OSM` y contra la ruta `#2563eb` |
| R20 | › R20 | Recorrido con `readdirSync`, suelo de 2500 archivos y exclusiones solo de `.gitignore` y de R20. Mi `git grep` independiente da lo mismo |

### Puntos que pidió mirar el leader

1. **`SUELO` del Badge en `contraste-tokens.guardia`.** Correcto.
   - Las claves pasan de `chart-6/11/12/13` a `chart-5/7/11/12`, como prescribe D3.
   - Los ocho valores son exactamente las cifras peores de la tabla de D4: 5.28 · 5.44 · 6.06 · 5.46
     en claro y 5.20 · 5.04 · 7.98 · 7.88 en oscuro.
   - D8 lo manda de forma explícita: «`PARES_CHART` y las ocho cifras … pasan a D4».
   - `AA_TEXTO` no aparece en el diff y sigue en 4.5. La aserción sigue siendo
     `toBeGreaterThanOrEqual`.
   - Son pares nuevos, no los de la 292 con otro valor, y el spec aprobado lo dice. No lo cuento
     como relajar un umbral (R14).
2. **Caso `danger/20` reescrito.** Sigue vigilando algo real, con dos aserciones por tema medidas
   sobre las clases reales del `Button`:
   - **El tope del margen de la alternativa** (≤ 0.12, medido 0.117). Se pone rojo si la paleta
     vuelve holgada la capa con alfa, que es justo cuando habría que releer la decisión.
   - **El margen del hover opaco**, que debe ser más de 10 veces el de la alternativa (1.97 frente a
     0.117 en claro y 1.67 frente a 0.041 en oscuro). Se pone rojo si el opaco se degrada. Lo lee con
     `utilidadQueGana` y `hexDeUtilidad`, así que un cambio de clase en el componente se mide solo.
   - Si la capa vuelve a no cumplir AA (margen negativo), las dos aserciones pasan. Es coherente: el
     argumento a favor del opaco sale reforzado.
   - La decisión humana está en la ficha y en D8.
3. **Umbral de SL-9 de 0.018 a 0.001.** Cumple SL-9 D2 («entre las nuevas y las viejas, con margen»)
   y SL-33 D11 («al valor medido, redondeado hacia arriba a la décima»).
   - El máximo nuevo es 0.039 %, que redondeado da 0.1 %.
   - El mínimo de las viejas es 2.283 %.
   - Con este umbral, las capturas de SL-9 con el navy se ponen rojas (1.289 % y 0.836 %).
4. **El logo en `#FFD000` en tres maquetas.** Es una desviación que el propio D12 permite («si un
   uso no encaja en su rol, se elige el par de `docs/marca.md` que dé AA y se anota»). Está anotada
   en la bitácora: `--sidebar-primary`, 11.60 sobre `#1C1C1A`. No es hallazgo.
5. **`components/ui/button.tsx:27`.** Va como menor (m1). Además, el comentario de las líneas 69–73
   también ha quedado mal, y es el que más pesa.
6. **Pantallas con sesión.** Las verifica el humano a mano. R19 tiene su test en la guardia y no lo
   cuento como fallo. Queda como pendiente de cierre (m3).

### Hallazgos

**Mayores (BLOQUEANTE):** ninguno.

**Menores:**

- **m1 (menor): `components/ui/button.tsx` conserva el porqué anterior del hover opaco.**
  - Líneas 69–73: «`hover:bg-danger/20` mide … 4.44 sobre `secondary` … `--danger-strong` opaco: 6.47
    en claro y 5.89 en oscuro». Con SL-33, la capa mide 4.62 sobre `secondary`, que ya cumple AA. El
    argumento que vale ahora, decidido por el humano en T5, solo está escrito en
    `contraste-tokens.guardia`. Quien lea el componente encuentra un motivo que ya es falso.
  - Línea 27: «16.70 / … `ring-destructive` 3.33». En claro ahora son 17.31 y 3.45.
  - Arreglo: reescribir esas dos cifras y el argumento («cumple por márgenes mínimos; una primitiva no
    puede fiarse del alfa»), apuntando al caso de la guardia. Si se deja fuera del alcance, hay que
    anotarlo en `progress/deudas.md`. Es solo comentario, sin efecto en ejecución, y por eso no
    bloquea.
- **m2 (menor): R15 y D11 piden actualizar las huellas, y no se hizo ni se anotó en el spec.**
  - R15 dice «con las huellas nuevas» y D11, paso 3, «se actualizan las huellas».
    `HUELLAS_MARCA_ANTERIOR` sigue con los SHA-256 de antes de SL-9. La bitácora explica que «no hay
    huellas de las capturas actuales que actualizar», pero no añade los SHA-256 de las capturas de
    SL-9 (las del título navy) como huellas prohibidas, y no corrige D11.
  - En la práctica, el umbral de píxeles ya pone en rojo dos de las tres capturas de SL-9. La tercera,
    `ingreso-narrow`, mide 0.015 % y no tiene marca anterior que vigilar.
  - Arreglo: añadir los tres SHA-256 de SL-9 a la constante, o dejar en D11 por qué no hace falta.
- **m3 (menor, pendiente de cierre y no del código): la verificación manual del humano sigue
  abierta.**
  - Quedan `/analitica`, `/monitoreo`, `/ranking`, los mapas de `/mis-asignaciones` y la
    comprobación de `TIERRA_OSM` (`#f2efe9`). D15 pedía cotejar ese color con una captura real, y
    todavía viene de OSM Carto.
  - Lo decidió así el humano. Tiene que quedar resuelto en `progress/features/SL-33.md` antes del
    merge, y si la tierra real difiere, se corrige la constante.
  - Observación sin hallazgo: en `design-notificaciones/Push.dc.html`, el contorno del cuadrado de
    icono mide unos 1.5:1 sobre su tarjeta. El glifo mide 18.9, y está anotado.

### Veredicto

**OK (aprobado).** Ningún hallazgo mayor y tres menores. Los menores m1 y m2 son baratos y conviene
resolverlos en esta rama, o dejarlos en deudas. El m3 lo cierra el humano. El merge sigue
condicionado a `gate-completo` en verde en el PR.
