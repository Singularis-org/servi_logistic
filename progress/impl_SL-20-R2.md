# SL-20 — decisiones 11 a 14, tras la review 1

Rama `feature/SL-20-pais-geografia-configurable`, base HEAD `33dbb24`. Base de datos: `servi_logistic_sl20`
(localhost), `DATABASE_URL` exportada por comando desde `../../.env` cambiando solo el nombre de la base
(el `.env` compartido no se toca). Sin dependencias nuevas. `./init.sh` no se corre (lo pide el leader).

## 1. Decisión 11: el autocompletado del alta de país oculta los ya dados de alta · `ab81b55`

Archivos (frontend_dev):
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`: el diálogo «Nuevo país»
  recibe los códigos alfa-2 de los países dados de alta y los quita del catálogo ISO. Si no queda ninguno, la
  lista dice «Todos los países del catálogo ya están dados de alta.»; si queda alguno y nada casa, sigue
  «Ningún país casa con lo escrito.».
- `tests/components/GeografiaPlataformaAltaPais.test.tsx` (nuevo): «GeografiaPlataformaModule > alta de país:
  oculta los ya dados de alta (R42, decisión 11)», 4 casos: Nicaragua y España dadas de alta no salen ni
  buscando por nombre («Nicar») ni por código («es»); Francia sí sale; con los 249 dados de alta no hay
  opciones y sale el aviso. Con el cambio deshecho a propósito fallan 3 de los 4 (el test es falsable).
- `tests/unit/components/geografia-plataforma-page.test.tsx`: el caso del `conflict` elegía Guatemala, que
  en ese test ya estaba dada de alta y ahora no se ofrece. Elige El Salvador y se renombra «un país que otra
  sesión acaba de dar de alta se dice junto al buscador» (el `conflict` del servidor sigue pudiendo llegar
  con dos sesiones a la vez).

Verificación:
```
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit   -> exit 0
pnpm exec eslint <3 archivos>                                   -> No issues found
pnpm exec vitest run tests/components/GeografiaPlataformaAltaPais.test.tsx \
  tests/unit/components/geografia-plataforma-page.test.tsx tests/unit/constants/paises-iso-3166-1.test.ts
  -> Test Files 3 passed (3) · Tests 33 passed (33)
```

## 2. Decisión 13: revisión de diseño de `/plataforma/geografia`

Auditoría completa (frontend_dev, skill `design-taste-frontend`) en `progress/impl_SL-20-design.md`. Resumen:
- Aplicado: errores de carga de países y división como `Alert` (ya no se ven como pantalla vacía ni se
  duplican); estados vacíos con `EmptyState` en recuadro, como Empresas, con el siguiente paso; barra de
  búsqueda solo con división; alta/renombrado de nodo como `<form>` con nombre accesible, Enter guarda, foco al
  abrir y vuelta al botón de origen al cerrar; avisos en forma neutra (decisión 15: «Se dio de alta «X»
  (Municipio).», «Se retiró…», «Se devolvió…»); «Activar» en `outline` para no competir con el primario;
  `motion-reduce:transition-none` en la flecha.
- No aplicado (queda abierto para el humano): vocabulario mezclado «Desactivar/Inactivo» frente a «Retirar del
  catálogo» (heredado, lo buscan los tests de R31); orden CSV antes del árbol (design §8); buscador solo con
  placeholder (`aria-label` basta); sin `loading.tsx` (ninguna página de `app/(app)` lo tiene).
- Archivos: `page.tsx`, `GeografiaPlataformaModule.tsx` (`paisesError`, `divisionError`),
  `GeografiaAdminModule.tsx` (`cargaErrorInicial`), `tests/unit/components/geografia-plataforma-page.test.tsx`
  (bloque «Decisión 13», 6 tests).
- Verificación: `tsc --noEmit` exit 0; eslint 0 problemas; vitest de los 2 archivos de la pantalla 30/30.

## 3. Decisión 14: medición de los triggers SL021 en `servi_logistic_sl20`

Triggers de la función `geografia_del_pais_de_la_empresa()` (migración
`20261026120300_geografia_del_pais_de_la_empresa`): `orden_geografia_del_pais_de_la_empresa` (orden),
`zona_distrito_geografia_del_pais_de_la_empresa` (zona_distrito) y
`distrito_zona_especial_geografia_del_pais_de_la_empresa` (distrito_zona_especial). No hay otro trigger SL021.

Procedimiento, en un solo comando de shell: guarda de que la URL acaba en `/servi_logistic_sl20`; `trap` que
reenciende los tres al salir pase lo que pase; `ALTER TABLE … DISABLE TRIGGER` de los tres; test; `ENABLE`;
test. Comando de test: `pnpm exec vitest run tests/integration/db/geografia-dos-paises.test.ts -t "R13|R38"
--reporter=verbose` (el filtro casa también R12 y R14 porque sus nombres llevan R13/R38 en el `describe`).

Antes (encendidos, `tgenabled = O` los tres): `Tests 5 passed (5)`.

Apagados:
```
 ✓ R12/R39: cada empresa solo ve la geografía de su país en el árbol, las listas, la carga, la corrección y la cobertura
 × R13/R39: ZonaRepository.create con un distrito de otro país da SL021 → GeografiaDeOtroPais y no crea la zona
   → expected null to be 'SL021' // Object.is equality
 × R38/R13/R39: aplicarCambios con un distrito de otro país da SL021 → GeografiaDeOtroPais y la desmarca del lote se deshace
 × R13/R39: corregirDatosCliente hacia geografía de otro país da SL021 → GeografiaDeOtroPais y la orden queda como estaba
   → expected null to be 'SL021' // Object.is equality
 × R14/R39: una orden sin distrito entra en los dos países; con distrito de otro país, no
   → expected { aSinDistrito: null, …(3) } to deeply equal { aSinDistrito: null, …(3) }
      Tests  4 failed | 1 passed (5)
```

Reencendidos:
```
 ✓ R12/R39 … ✓ R13/R39 (ZonaRepository.create) … ✓ R38/R13/R39 (aplicarCambios) …
 ✓ R13/R39 (corregirDatosCliente) … ✓ R14/R39
      Tests  5 passed (5)
```

Estado final comprobado con `psql`: `servi_logistic_sl20`, los tres triggers con `tgenabled = O` (encendidos).
Conclusión: los tres tests de R13/R38 dependen de los triggers (caen sin ellos y pasan con ellos); R14 también
cae, porque su caso «con distrito de otro país, no» pasa por el trigger de `orden`. R12 no depende de ellos
(lo cubren las políticas `*_del_pais`), como se espera. No se tocó ninguna otra base.

## 4. Decisión 12: E2E en local contra `servi_logistic_sl20`

Preparación:
- `pnpm run db:seed` → «Seed de catalogos completado (tipo_identificacion, rol, order_status, vehiculos).»
- `prisma migrate status` → «Database schema is up to date!» (257 migraciones).
- `next build` (con `prisma generate`) en el worktree: exit 0. `next start` lo exige.
- Entorno: el `.env` del checkout principal se carga en el shell (`set -a; . ../../.env`) y se pisa solo
  `DATABASE_URL` con el nombre de base `servi_logistic_sl20` (`DIRECT_URL` está vacío y cae a `DATABASE_URL`).
  `E2E_PUERTO=3044` (en 3000 escucha otra sesión), `E2E_STORAGE_PUERTO=54344`, log del servidor en el
  scratchpad. Un spec cada vez, `--workers=1`. El `.env` compartido no se tocó.

`pnpm exec playwright test e2e/superadmin-empresas.spec.ts --project=plataforma-vacia --workers=1`:
```
  ✓  1 … 1. «Empresas» abre con el formulario de alta y sin aviso (R29) (376ms)
  ✓  2 … 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29) (2.0s)
  ✓  3 … 3. repetir el slug, el email o el documento de A marca su campo y no crea nada (R31, R32, R33) (3.0s)
  ✓  4 … 4. un slug inválido marca el campo sin crear nada (R34) (775ms)
  ✓  5 … 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, «Empresas» le da 404 y no la ve (1.8s)
  ✓  6 … 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?», … (2.0s)
  ✓  7 … 7. con las dos contraseñas creadas, ni la fila de A ni la de B ofrecen «Reenviar bienvenida» (R38) (134ms)
  7 passed (21.8s)
```

`pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps --workers=1`
(`--no-deps`: el proyecto depende de `plataforma-vacia`, que ya corrió arriba):

- Primera corrida, ROJO de SL-20: `1 failed, 5 did not run`. El alta por pantalla del humo
  (`altaDeEmpresaPorPantalla` en `e2e/_superadmin-fixture.ts`) no elegía país; desde R9 el alta no lo
  preselecciona, el formulario marcaba «País: Revisa este campo.» y no salía el aviso del alta
  (`expect(locator).toHaveCount(1)` sobre `AVISO_EMPRESA_CREADA`, 0 tras 60 s). `superadmin-empresas` ya lo
  elegía en su propio formulario; el fixture compartido se quedó atrás.
- Arreglo: el fixture elige «Costa Rica» en el combobox «País», igual que `superadmin-empresas.spec.ts`
  (CR disponible tras la migración, R44). eslint limpio, `tsc --noEmit` exit 0.
- Segunda corrida:
```
  ✓  1 … alta de A y B desde «Empresas» por el superadmin, y el correo de recuperación de cada maestro consta en el log (R16, R17)
  ✓  2 … el maestro de A recorre todas las rutas de su menú sin error ni datos de B (23.8s)
  ✓  3 … el maestro de B recorre todas las rutas de su menú sin error ni datos de A (20.8s)
  ✓  4 … cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa (2.6s)
  ✓  5 … B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador (3.7s)
  ✓  6 … vehículos carga y escribir desde la pantalla falla cerrado (R40); geografía le da 404 al maestro (SL-32 R26) (3.4s)
  6 passed (1.2m)
```

Nota: `superadmin-empresas` corrió antes del arreglo del fixture; no usa `altaDeEmpresaPorPantalla`, así que
su resultado no cambia.

## Abierto

- Vocabulario de retiro mezclado en `/plataforma/geografia` («Desactivar»/«Inactivo» frente a «Retirar del
  catálogo»): decisión de un humano (auditoría de diseño, punto 7).
- D15: confirmación de Carlos (F1.4), sin cambios.
- `./init.sh` no corrido (lo corre el leader).
