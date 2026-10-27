# SL-20 · T5.3 + T5.7 (frontend_dev)

## Estado
Hecho. Los checkboxes de `tasks.md` los marca el implementer al commitear.

## Archivos
Creados:
- `app/(app)/plataforma/geografia/page.tsx`. Server Component con:
  - la puerta `esPlataforma` antes de leer, con `notFound()` (R21);
  - `listarPaisesAction`, con los países ordenados por nombre;
  - el país de `?pais=`, o el primero si no viene;
  - `arbolDePaisAction` solo para ese país.
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`. Incluye:
  - el `Select` de país (todos los dados de alta);
  - el `Switch` «Disponible», con aviso R46 como `aria-describedby`;
  - el `Modal` «Nuevo país»: combobox sobre `PAISES_ISO_3166_1`, que busca por nombre sin acentos o
    por código. No hay campo de código ni de nombre. Los seis nombres de nivel van a mano y se envía
    `{ id, ...seis }`;
  - «Cargar CSV»: la tabla de equivalencias con los nombres del país, el resumen `ok`, los errores
    `Línea N: …`, `total` y `avisos`, y `archivo_rechazado`.
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx`. Es el módulo de
  `78b0ab3~1`, movido y adaptado:
  - recibe `paisId`, `paisNombre` y `etiquetas`;
  - no lleva zonas, `zonas-sin-distritos` ni la marca «sin zona»;
  - el alta lleva un código opcional y la provincia lleva `paisId`;
  - el conteo es de todas las empresas y no bloquea (R31);
  - `refetch` con `arbolDePaisAction`;
  - ningún literal de Costa Rica: sin el placeholder «Cabagra…» y sin «Crear provincia» ni
    «Añadir cantón». Los textos salen de `etiquetas[nivel].singular/plural` (no se usa `NIVEL_LABELS`).
- `components/ui/combobox.tsx`. Primitiva sobre `@base-ui/react/combobox` 1.6.0, ya instalado.
  **Sin dependencia nueva.**
- `tests/unit/components/geografia-plataforma-page.test.tsx`: 20 tests.

Modificados:
- `app/(app)/configuracion/_shared/filtrar-arbol-geografico.ts`: genérico
  `<P extends ProvinciaFiltrable>`; sirve a Tarifas (`ProvinciaArbolDTO`) y a la plataforma
  (`ProvinciaPlataformaDTO`).
- `lib/actions/geografia-plataforma.ts`: solo se quitan las 9 líneas `@sin-superficie`. Las 9
  actions las importa ya la pantalla. Lógica intacta.

## Mapa R → test (`tests/unit/components/geografia-plataforma-page.test.tsx`)
- R20 → «el árbol, sus botones y la tabla del CSV dicen Departamento, Municipio y Aldea»; «el alta de un nodo lleva el país y el código opcional»
- R21 → «responde 404 a %s sin pedir países ni árbol» (maestro, operador, mensajero); «responde 404 sin sesión»; «al superadmin le carga el país de ?pais= …»
- R22 → «no queda ninguna página en esa ruta»
- R23/R42 → «no hay campo para teclear el código ni el nombre; sí los seis nombres de nivel»; «busca por nombre (sin acentos) y por código»; «el envío lleva el id elegido y los seis nombres, sin nombre de país»; «sin país elegido no envía y lo pide»; «un país ya dado de alta se dice junto al buscador»
- R47 (UI) → «llama a la action con el estado deseado y avisa de que no afecta a las empresas existentes»; «refleja un país ya apagado»
- R24/R25/R28/R48 (UI) → «lista cada error con su línea, y los avisos»; «con una carga buena muestra el resumen…»; «un archivo rechazado dice el motivo»
- R31 → «muestra las órdenes sin entregar de todas las empresas»; «si el conteo falla, lo dice y deja retirar»

## Salida de los comandos
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm run lint` → `✖ 230 problems (0 errors, 230 warnings)`. Todos son preexistentes, en `tests/`.
  `pnpm exec eslint` sobre mis archivos → sin salida (limpio).
- `pnpm exec vitest run tests/unit/components/geografia-plataforma-page.test.tsx` → `Tests 20 passed (20)`.
- Guardias y tests de T5.5 → `Test Files 8 passed (8) · Tests 127 passed (127)`. La tanda:
  - `etiquetas-geograficas-sin-literal`, `superficie-de-uso`, `plataforma-solo-en-lista`,
    `superadmin-fuera-de-empresa` y `ayuda-pantalla-ruta-existe`;
  - `tests/unit/utils/filtrar-arbol-geografico.test.ts`;
  - `tests/components/empresas-module.test.tsx` y `tests/integration/empresas-page.test.tsx`.
- Más guardias → `Test Files 7 passed (7) · Tests 125 passed (125)`: `geografia-renombrado-punto-unico`,
  `buttonvariants-pasa-por-cn`, `contraste-tokens`, `estado-con-info`,
  `encabezado-acciones-dentro-del-ancho`, `vistas-superficies-declaradas` y
  `geografia-sin-borrado-fisico`.
- `pnpm exec vitest related --run <mis 6 archivos de app/lib/components>` → `Test Files 1 failed | 11 passed | 2 skipped (14)`.
  El rojo es `tests/unit/app/tarifas/TarifasPage.cobertura.test.tsx`: sus 3 tests llegaron al
  timeout de 20 s con la carga de la corrida. Corrido solo: `Tests 3 passed (3)`. Es flaky por
  carga, no por el cambio.
- Disco: 16 GB libres en C: durante la pasada.

## Preguntas abiertas
1. `docs/perfil-agentes.md > frontend_dev` dice: «Una pantalla NUEVA pasa por `/design`». Esta pasada
   no la hizo, porque no hay esa skill en mi alcance. El leader decide si hace falta antes del merge.
2. `combobox.tsx` está escrito a mano sobre Base UI, con el mismo patrón que `popover.tsx`. No viene
   de `npx shadcn add`, que podría arrastrar paquetes sin aprobar.
3. Copia con género neutro, porque el género del nombre de nivel no se conoce. Ejemplos:
   - «Alta: Departamento»;
   - ««X» dado de alta (Departamento)»;
   - «Primero hay que devolver al catálogo su municipio»;
   - en el resumen del CSV, «Altas: Departamentos: 1».

   Si se quiere otra redacción, es solo copia.
4. El combobox lista los 249 países, también los ya dados de alta. El servidor responde `conflict` y
   la pantalla lo dice junto al buscador. Ocultarlos sería una decisión de UX que el spec no toma.
5. `geografia-estado-label.ts` conserva textos con «provincia/cantón» en minúscula
   (`ESTADO_GEOGRAFICO_TEXTO`, `MOTIVO_ACTIVAR_APAGADO`, `MARCA_SIN_ZONA`). Ya no los consume nadie
   en `app/`. La pantalla nueva solo usa `estadoGeografico`. No los he borrado: no son de esta task.

## Veredicto
T5.3 y T5.7 hechas: typecheck, lint, test nuevo (20/20), guardias y T5.5 en verde; sin dependencias nuevas.

## Guardias rojas tras T5

Tres guardias en rojo, todas por cambios de SL-20. Arregladas sin debilitarlas.

### Archivos
- `tests/unit/guards/asistente-panel-hermano.guardia.test.ts`: la contraprueba muta el nodo real de hoy. T5.1 metió `EtiquetasGeograficasProvider` dentro de `AyudaProvider`, así que el `.replace` viejo no encontraba nada y no mutaba. Ahora envuelve `<EtiquetasGeograficasProvider etiquetas={etiquetas}>{children}</EtiquetasGeograficasProvider>` y antes de mutar afirma dos cosas: que ese texto existe en el layout y que `mutado !== original`. Si el layout vuelve a cambiar, el test falla de forma visible en vez de quedar verde en silencio. La guardia principal no se toca.
- `tests/unit/guards/asistente-sin-frontmatter.guardia.test.ts`: el recuento baja de 38 a 37 (`docs.length` y `conFuentes.length`) con el comentario «SL-20 (decisión 9): 38→37, se retira configuracion-geografia».
- `tests/integration/asistente-route.test.ts`: el mismo recuento a 38 para el `maestro` (37 reales), con el mismo comentario. Lo encontró el grep; f93f45c no lo había ajustado.
- `specs/SL-32-rol-superadmin/tasks.md` (R26), salida (1): la cita se repunta a `tests/unit/components/geografia-plataforma-page.test.tsx`. Verificado antes de repuntar: el caso `R21 — la puerta, antes de leer` usa `it.each(["maestro", ...])`, que responde `NEXT_NOT_FOUND` sin llamar a `listarPaisesAction` ni a `arbolDePaisAction`. La ruta pasa a ser `/plataforma/geografia`, porque `/configuracion/geografia` ya no existe (SL-20 R22). La nota en la celda dice por qué. `specs/374-catalogo-geografico-admin/tasks.md` no salía en la guardia y no se tocó.

### Grep de recuentos a 38 en tests de ayuda/asistente
Después del cambio no queda ninguno: `toBe(38)` y `toHaveLength(38)` no aparecen en `tests/`. `AyudaLayout.test.tsx` y los dos `acotamiento-por-rol` ya tenían 37 desde f93f45c.

### Salida real
```
pnpm exec vitest run <3 guardias> tests/integration/asistente-route.test.ts tests/components/AyudaLayout.test.tsx tests/unit/asistente/acotamiento-por-rol.test.ts tests/unit/asistente/contexto-documental.test.ts tests/unit/ayuda/acotamiento-por-rol.test.ts tests/unit/components/geografia-plataforma-page.test.tsx
 Test Files  9 passed (9)
      Tests  134 passed (134)

pnpm exec eslint <los 3 .ts tocados>
ESLint: No issues found
```
Nota: en el primer intento de repunte, el nombre del test borrado seguía en la nota de la celda y la guardia lo volvió a detectar como cita. Lo quité del texto.

### Veredicto
Las tres guardias en verde, más el recuento de `asistente-route` que tampoco cuadraba. No se debilitó ninguna aserción.
