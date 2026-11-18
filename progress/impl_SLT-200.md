# impl SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview»

Ruta directa, frontend_dev, 2026-11-18. Rama `feature/SLT-200-pwa-reparto-ajustes-preview` (sale de dev `8dad4167`).
Alcance: puntos 1-4 del leader, más el 1 ampliado (Recoger y Recolección), el 6 (Recolección sin cámara) y el 7
(tooltip de la cámara). El 5 (siembra demo QA) no es de esta tanda.

## Archivos

UI:
- `app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx`: prop `className` y `CONMUTADOR_EN_SU_LINEA_MOVIL`.
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`, `RecogerModule.tsx`,
  `app/(app)/recoleccion/_components/RecoleccionModule.tsx`: pasan esa clase al conmutador de la barra. Recolección,
  además, sin `escaneo`.
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`: la cifra y su disposición.
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`: los tamaños de texto.
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx` y `ruta-mapa-iconos.ts`: la leyenda y el «Tú».
- `components/shared/EscanerModal.tsx`: prop `ayuda` (tooltip del botón de solo icono).
- `components/shared/BuscadorFiltros.tsx`: `AYUDA_CAMARA_BUSCADOR` y la pasa a la cámara. No cambia la fila ni el campo.

Tests:
- `tests/components/KpisMensajero.test.tsx`: ajustado (antes fijaba `text-sm` y prohibía `text-xl`), más 3 casos nuevos.
- `tests/components/RepartoMovil.test.tsx`, `RecogerModule.test.tsx`, `RecoleccionModule.test.tsx`: el caso del conmutador.
  En Recolección se reescribe el bloque SLT-194 R940-R944 (cámara) como «sin cámara».
- `tests/components/PosOrderCardMosaicoLegible.test.tsx` (nuevo).
- `tests/components/RutaMapaInner.test.tsx` y `tests/unit/utils/ruta-mapa-iconos.test.ts`.
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`: Recolección pasa a «sin `escaneo`», citando la decisión.
- `tests/unit/components/buscador-filtros-camara-tooltip.test.tsx` (nuevo).
- E2E:
  - `e2e/_pwa-mensajero-fixture.ts`: `campoConAnchoUtil`;
  - `e2e/pwa-mensajero-reparto.spec.ts`: (a) mide la cifra y el campo; caso (d) nuevo, ₡12.345.678 a 360 px;
  - `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`: Recolección sin cámara y con campo útil; Recoger con campo útil;
  - `e2e/pwa-mensajero-mapa.spec.ts`: la leyenda sin «Gestionada».

## Antes → después

1. **Buscador.** Antes, a 360 px, «Filtros» y el conmutador se comían la fila y el campo se quedaba en la lupa: su
   `flex-1 min-w-0` nunca fuerza el salto. Después, por debajo de `md`, el conmutador va en su propia línea
   (`max-md:basis-full`) con los dos botones a medias (`max-md:[&>button]:flex-1`). Lo hacen Reparto, Recoger y
   Recolección. `BuscadorFiltros` no cambia. El E2E exige un campo de ≥ 160 px y el conmutador debajo, a 360 y 414 px.
2. **KPI.** Antes, la cifra iba a 14 px en una fila propia. Después va a 20 px (`text-xl`), con `md:text-2xl` en
   escritorio.
   - Va a la derecha del icono, bajo el rótulo (canvas D8), cuando cabe: ≤ 7 caracteres, lo que da conteos e
     importes hasta ₡99.999. Las dos tarjetas de una fila deciden juntas.
   - Medido con Archivo 600 a 20 px: «₡12.345.678» ocupa 119 px y junto al icono quedan ~82 px. No cabe al lado, así
     que baja bajo el icono a todo el ancho (~126 px), **sigue a 20 px** y cabe.
   - Solo por encima de 11 caracteres se achica: 12 → 18 px, 13-14 → 16 px y ≥ 15 → 14 px.
   - El E2E (d) lo mide a 360 px: `{texto: "₡12.345.678", px: 20, disposicion: "apilada"}` y nada se sale.
3. **Tarjeta Mosaico.** Antes:
   - guía en `font-mono text-xs`;
   - insignia, «Sin posición · peso», producto (mono), «Intentos», mensajero, aviso y dirección a 11 px;
   - chips, «COBRAR» y «VER DETALLE COMPLETO» a 10 px.

   Después, la guía va a `text-sm font-bold` (sans) y todo lo demás a `text-xs`, con el producto en sans. Destinatario
   y monto siguen en `text-sm`. La estructura es la misma.
4. **Leyenda del mapa.**
   - Antes:
     - «Pendiente» medía 1.00:1 en oscuro;
     - «Siguiente» medía 1.37:1 en claro;
     - «Tú» medía 2.36:1 en claro;
     - «Gestionada» salía sin que el mapa la dibujara;
     - el texto «Tú» del marcador era blanco sobre verde (2.54:1).
   - Después, cada punto lleva `ring-2 ring-foreground` (el test mide ≥ 3:1 contra el fondo en los dos temas),
     «Gestionada» sale de la leyenda y el «Tú» va en Negro Servi (≥ 4.5:1, medido en el test).
6. **Recolección sin cámara.** Se quita `escaneo`. **Ojo:** Enter = «buscar ya» y la normalización de la URL del QR o
   de `#n` dependen de `escaneo` (`BuscadorFiltros`, `onKeyDown`). Sin él, lo tecleado o lo que la pistola escribe
   filtra igual, al momento (`debounceMs={0}`). Pero una URL de QR leída por pistola ya no se reduce al número, y
   Enter no hace nada.
7. **Tooltip de la cámara.** El texto es «Buscar escaneando la guía». Usa el `Tooltip` de la app con el patrón de
   `ContactoButtons` (el disparador es el botón) y el `aria-label` «Escanear con cámara» no cambia.
   - Afecta a todas las pantallas con `escaneo`.
   - **Límite:** el Tooltip de Base UI se abre con hover o foco, no al tocar. En el teléfono la ayuda visible sigue
     siendo la línea bajo el campo, que ya nombra la cámara.

## R → test

| Punto | Test |
|---|---|
| 1 | `RepartoMovil.test.tsx` «SLT-200: en el móvil el conmutador…»; idem en `RecogerModule.test.tsx` y `RecoleccionModule.test.tsx`; E2E `campoConAnchoUtil` en reparto (a) a 360/414, en Recolección a 360 y en Recoger a 360 |
| 2 | `KpisMensajero.test.tsx` (3 casos «SLT-200» + R492 ajustado); E2E reparto (a) y (d) |
| 3 | `PosOrderCardMosaicoLegible.test.tsx` (4 casos) |
| 4 | `RutaMapaInner.test.tsx` (leyenda sin «Gestionada» + anillo y contraste); `ruta-mapa-iconos.test.ts` («Tú» ≥ 4.5:1); E2E mapa (a) |
| 6 | `buscadores-con-escaneo.guardia.test.ts` («SLT-200: `/recoleccion` … sin `escaneo`»); `RecoleccionModule.test.tsx` bloque «SLT-200 — Recolección: el buscador sin cámara»; E2E «SLT-200 Recolección a 360 px» |
| 7 | `buscador-filtros-camara-tooltip.test.tsx` (3 casos) |

## Salida

Rojo (código de dev, tests nuevos):
- puntos 1-4: `vitest run` de los 5 archivos → `Test Files 5 failed (5) · Tests 12 failed | 43 passed (55)`.
  - Uno de los 12 falló por la consulta del test, no por el código: «Found multiple elements»; se corrigió.
- punto 1 en Recoger y Recolección (sin el arreglo en los módulos): `Tests 2 failed | 159 skipped`.
- punto 6 (con `escaneo` repuesto): `Tests 5 failed | 83 passed (88)`. Fallan la guardia (2) y el bloque de
  Recolección (3).
- punto 7 (sin `ayuda`): `Tests 1 failed | 2 passed (3)`. Falla «al enfocar la cámara sale…».

Verde:
- los 5 archivos: `Tests 55 passed (55)`;
- `vitest related` de los fuentes del mapa, KPI y tarjeta: `Test Files 40 passed (40) · Tests 753 passed (753)`;
- Recolección, Recoger, la guardia y el buscador: `Tests 200 passed (200)`;
- tooltip, escaneo y EscanerModal: `Tests 43 passed (43)`;
- `pnpm run typecheck` → exit 0; `eslint` de los 23 archivos tocados → exit 0;
- E2E tras `next build` (base desechable, puerto 3047), `pwa-mensajero-reparto`, `-mapa` y `-recoger-recoleccion`:
  `16 passed (1.0m)`.
  - La primera pasada dio 3 rojos: el test medía la cifra mientras el contador aún contaba. Se arregló con
    `expect.poll` hasta el valor final.

Gate rápido (`bash ./init.sh` vía `con-desechable`, base `servi_slt200_desechable`):
- 1.ª pasada: `INIT_EXIT=1`. La guardia `pwa-mensajero-sin-recorte` (escala de 4 px, R494) rechazó `gap-1.5` en la leyenda y `mt-0.5` en el icono del producto. Pasan a `gap-2` y sin margen.
- 2.ª pasada: `INIT_EXIT=0`, con lotes de 1453, 1683, 1699 y 1017 tests en verde (1 skipped). Ese cambio de clases llegó después del E2E; no mueve medidas que el E2E compruebe.

## No verificado

- El aspecto real en modo oscuro (captura). Las medidas salen del E2E (tamaños, disposición, desborde) y el contraste
  de los tests sobre los tokens.
- El tooltip en el teléfono: Base UI no lo abre al tocar.
