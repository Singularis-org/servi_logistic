# SL-20 — T5.4 (frontend_dev): menú «Geografía» del superadmin

## Archivos modificados
- `lib/auth/menu-visibility.ts`: ítem «Geografía» (`/plataforma/geografia`, `roles: ROLES_PLATAFORMA`
  por identidad, `iconKey: "map"`) justo después de «Empresas» y antes de «Mi bodega»/«Ayuda».
  Nueva clave `"map"` en `IconKey`. Comentario «el único ítem del superadmin» ajustado (design §8).
- `app/(app)/_components/Sidebar.tsx`: `map: MapIcon` en `ICON_BY_KEY` (lucide-react, ya aprobada;
  `MapIcon` para no tapar el `Map` global). Obligado por `Record<IconKey, …>`.
- `tests/unit/auth/menu-visibility.test.ts`: el superadmin ve `[Empresas, Geografía]` y aterriza en
  `/plataforma/empresas`; cola de la barra `[Empresas, Geografía, Mi bodega, Ayuda]`; nuevo describe
  «SL-20 — ítem Geografía» (barrido de los 7 roles, sin sesión, sin `/configuracion/geografia`).
- `tests/components/Sidebar.test.tsx`: `"map"` en `TODAS_LAS_CLAVES` (exhaustividad de `IconKey`).
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` (listado en tasks.md como test a
  adaptar): `HREFS_ITEMS_PLATAFORMA` admite «Empresas» y «Geografía» como ítems de plataforma, con
  las mismas reglas (roles por identidad, sin subítems) + contraprueba de «Geografía».
- `specs/SL-20-pais-geografia-configurable/tasks.md`: checkbox T5.4 `[x]`.

## Notas
- `/configuracion/geografia` ya no estaba en el menú (lo quitó SL-32, R26); nada que quitar. Se
  añade un test que lo afirma (R22, parte menú). La página la borra otra task.
- Icono: el design no lo fija; se eligió `map` (lucide `Map`) siguiendo el criterio del archivo de
  icono propio por sección. Revisable.
- La página `/plataforma/geografia` no existe aún (T5.3).

## Mapa R → test
- R21 (ítem solo para el superadmin) → `tests/unit/auth/menu-visibility.test.ts` > «SL-20 — ítem
  Geografía del superadmin» (dos `it` R21) y «R36: el superadmin ve exactamente [Empresas, Geografía]»;
  `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` > «contraprueba SL-20 (R21)».
- R22 (menú) → `menu-visibility.test.ts` > «R22: ningún ítem ni subítem apunta a /configuracion/geografia».

## Salida real
```
pnpm exec vitest run tests/unit/auth/menu-visibility.test.ts tests/components/Sidebar.test.tsx tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts
 Test Files  3 passed (3)
      Tests  98 passed (98)

pnpm exec vitest run tests/unit/auth/ tests/components/Sidebar
 Test Files  16 passed (16)
      Tests  261 passed (261)

pnpm exec eslint <5 archivos tocados>   -> exit 0, sin salida
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .   -> 0 errores TS
```
`vitest related --run` sobre los archivos tocados terminó (exit 0, salida truncada) con un rojo
causado por este cambio:
```
FAIL tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts > ⭑ 433 — YA HAY un destino universal (`/ayuda`) ...
-   "superadmin": 1,
+   "superadmin": 2,
```
El literal de destinos por rol cuenta ahora «Empresas» + «Geografía» para el superadmin. Apliqué el
ajuste (`superadmin: 2` + comentario SL-20 R21), pero alguien lo revirtió en disco (y dejó en stage
el resto de los cambios). No lo he vuelto a aplicar: **ABIERTO**, hay que poner `superadmin: 2` en
ese test (línea ~309) o decidir otra cosa.

Barrido de `tests/unit/guards/` (contexto): rojos ajenos a T5.4 en
`dependencias-declaradas-presentes`, `organizacion-en-modelos` (schema.prisma en curso por otra task)
y `recursos-origen-fuera`. `superadmin-fuera-de-empresa` falló una vez en ese barrido mientras el
árbol cambiaba en disco; al relanzarlo sale verde.

## Veredicto
T5.4 hecha: «Geografía» visible solo al superadmin; menú, Sidebar y guardia superadmin en verde;
queda abierto `pwa-manifiesto-atajos` (`superadmin: 1` -> `2`), cuyo ajuste revirtió alguien.
- Ajuste: `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` `superadmin: 1` -> `2` (SL-20 R21, Geografía es pantalla del superadmin; intersección vacía y cero atajos intactos). Salida (3 archivos: pwa-manifiesto-atajos, superadmin-fuera-de-empresa, menu-visibility): `Test Files 3 passed (3)`, `Tests 83 passed (83)`.
