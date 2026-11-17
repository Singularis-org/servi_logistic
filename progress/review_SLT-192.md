# review SLT-192 «Mapa de ruta según el canvas» — vuelta 1

Ruta ligera, zona frontend. Diff `origin/dev...2b98b576` (16 archivos: 6 de producción, 7 de tests,
3 de spec/progress). Sin dinero, permisos, auth, integraciones ni webhooks: la ruta ligera es válida.

## Veredicto: CAMBIOS (RECHAZADO)

1 hallazgo mayor (BLOQUEANTE), 4 menores. El código de producción y los tests de componente están
bien; lo que falla es el E2E `e2e/pwa-mensajero-mapa.spec.ts (a)`, que con los datos de su propio
escenario no puede pasar.

## Checklist

- [x] Ruta ligera respetada; `requirements.md` con alcance, EARS R880-R890, «Lo que ya existe» con
      contenido, y el diff no re-crea nada de esa lista (reusa `RutaMapaInner`, `LeyendaMapa`,
      `Sheet`, `EstadoConInfo`, `Button size="touch"`; extrae `lineaUbicacion` en vez de copiarla).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 13/40 archivos, 211/1000 líneas de producción, 408/3000 de tests.
- [ ] Tasks: T1-T4 `[x]`, T5 (gate + E2E en local) `[ ]`. T3 está marcada `[x]` pero su «Hecho» («el spec
      pasa en local») no se cumplió: el E2E no se ha corrido (menor m1).
- [x] Trazabilidad R880-R890 → test concreto (tabla en `progress/impl_SLT-192.md`), salvo «tocar fuera»
      de R889 (menor m2).
- [x] Mutaciones (aplicadas una a una y revertidas con `git checkout --`; `git status` limpio al final),
      todas muertas:
      - R884 rótulo oculto con avisos → muere `RepartoMapa` «R884…».
      - R881 `botonMapa` también con el mapa abierto → mueren 3 tests de `RepartoMapa`.
      - R886 nota también a pantalla completa → muere `RutaMapaInner` «R886…».
      - R885 nota antes de la leyenda → mueren «R880/R885…» y «R886…».
      - foco a «Mostrar mapa» quitado → muere «plegar desde el pie…» (`toHaveFocus`).
      - R888 dirección sin cantón/distrito → mueren 3 tests de `HojaParadaMapa`.
      - R887 sin destinatario en la fila → mueren 2 tests de `HojaParadaMapa`.
- [x] Tests relacionados corridos por mí contra base desechable (`servi_slt192_desechable`):
      `RutaMapaInner`, `RepartoMapa`, `RepartoMovil`, `RepartoModule`, `HojaParadaMapa`, `pos-format`
      y la guardia `otp-debug-solo-en-pruebas` → 7 archivos, 189/189, exit 0.
- [x] Typecheck y lint: verdes en el gate del leader (`✓ typecheck paso`, `✓ lint paso`); no los repetí.
- [ ] `./init.sh`: el último rápido salió `INIT_EXIT=1` por un único rojo,
      `otp-debug-solo-en-pruebas.guardia.test.ts` por **timeout de 20 s** bajo carga; corrido solo pasa
      (arriba). Ajeno al diff (menor m4); hay que repetir el gate antes del PR.
- [ ] Flujo crítico `mis-asignaciones` (`docs/checkpoints-proyecto.md > Flujos críticos`) y
      `docs/perfil-agentes.md > reviewer` («PR que toca pantallas sin constancia de los E2E corridos en
      local»): el E2E no se ha corrido y, leído, falla (M1).
- [x] Táctil: «Ver mapa completo» y «Ocultar mapa» con `size="touch"` (`h-11`), «Mostrar mapa» igual;
      lo comprueban `RutaMapaInner` y `RepartoMapa` (clase) y el E2E (`tactil`).
- [x] Nada de rediseño: solo M2-M6; marcadores, carrusel, pantalla completa, «Navegar», «Gestionar» y
      el asa quedan igual.
- [x] Sin dependencias nuevas, sin `db/`, sin literales de país/moneda, nada de Ordenex. Comentarios
      con el porqué.

## Cambios fuera del spec declarados por el implementer

- **Prop `total` quitada de `HojaParadaMapa`:** aceptable. Es consecuencia directa de R887/R890 (ya no
  se pinta «de {total}»); no quedan usos (`CERRAR_HOJA` y `total` sin referencias en `app/`, `tests/`,
  `e2e/`).
- **Foco a «Mostrar mapa» al ocultar** (`RepartoModule.tsx:158-168`): aceptable y bien probado
  (mutación muerta). Sin él, el foco quedaba en un botón desmontado. No cambia nada visible.
- **R889 «tocar fuera» sin test:** ver m2.

## Hallazgos

### M1 — BLOQUEANTE · E2E (a) busca «Mostrar mapa» dentro del grupo del mapa, pero en su escenario va en la fila del aviso
`e2e/pwa-mensajero-mapa.spec.ts:52-57` (y el comentario de :50-51):

```ts
await ocultar.click();
const mostrar = grupo.getByRole("button", { name: "Mostrar mapa" });
await expect(mostrar).toBeVisible();
```

El escenario `dosOrdenes` crea una orden **sin coordenadas** (`sinCoordenadas`), que la optimización
excluye siempre (`lib/services/OptimizacionRutaService.ts:655-660`, R37) y queda con
`secuenciaRuta === null`. Entonces `paradasSinOptimizar > 0`
(`lib/services/MisAsignacionesService.ts:404`) → `rutaDesactualizada`
(`RepartoModule.tsx:405-406`) → hay aviso de ruta → `mapaEnAviso` → con el mapa cerrado «Mostrar mapa»
se pinta en la fila del primer aviso (`RepartoModule.tsx:933`), que está **fuera** del
`role="group" "Mapa de ruta"` (`RepartoModule.tsx:944`). El rótulo, en cambio, no lleva botón
(`:942`, `mapaEnAviso ? null : botonMapa`). El `toBeVisible` de la línea 54 no encuentra nada y el
test (a) cae en los dos anchos. El comentario «aparece junto al rótulo» contradice DC2/R883 para este
caso. El E2E antiguo pasaba porque buscaba el control a nivel de página.

Qué falta: en (a), tras «Ocultar mapa», buscar «Mostrar mapa» en la fila del primer aviso
(`page.getByRole("alert").first()` o a nivel de página con `toHaveCount(1)`), y ajustar el comentario
a DC2 (con avisos, en el aviso). Luego correr el E2E en local (T3/T5) a 360 y 414 px, con base
desechable, antes del PR.

### m1 — menor · T3 marcada `[x]` sin cumplir su «Hecho»
`specs/SLT-192-mapa-ruta-segun-canvas/requirements.md:126-130`: «*Hecho:* el spec pasa en local»,
pero `progress/impl_SLT-192.md:32` dice «escrito, NO corrido». Marcarla al cerrar T5.

### m2 — menor · R889 «tocar fuera de la hoja» sin test
`tests/components/HojaParadaMapa.test.tsx:199-224` cubre «sin Cerrar», Escape y el asa; tocar fuera no
se prueba (jsdom no pinta el backdrop de Base UI). Lo da la `Sheet`, que no se tocó, así que el riesgo
es bajo. En el E2E (b) cabe barato: con la hoja abierta, un clic en la zona del mapa por encima de la
hoja y `expect(hoja).toHaveCount(0)`.

### m3 — menor · el E2E (b) ya no comprueba el formato de R888
`e2e/pwa-mensajero-mapa.spec.ts:94` pasó a `getByText(DIRECCION_LARGA, { exact: false })`: comprueba
que la dirección sale entera, no la forma «Cantón · Distrito — dirección». El formato queda cubierto por
`HojaParadaMapa.test.tsx` y `pos-format.test.ts` (mutación muerta), así que no bloquea; si la orden del
escenario tiene cantón/distrito, se puede afirmar la línea completa.

### m4 — menor · gate rápido rojo por un timeout ajeno
El último `./init.sh` del leader acabó con `INIT_EXIT=1` por `otp-debug-solo-en-pruebas.guardia.test.ts`
(«Test timed out in 20000ms»). Corrida aislada pasa. No es del diff, pero T5 pide el gate en verde:
repetirlo sin otra carga en paralelo.

## Vuelta 1 — resumen para el implementer
Arreglar M1 (localizador de «Mostrar mapa» en E2E (a) + comentario), correr
`e2e/pwa-mensajero-mapa.spec.ts` en local y marcar T3/T5. m2 y m3 opcionales; m4 lo resuelve repetir el gate.
