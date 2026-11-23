# impl SLT-257 «Sandbox: banner de ambiente de pruebas»

## Archivos (frontend_dev)
- T1: `lib/config/ambiente.ts` (nuevo) — `ambienteDePruebas()` = `process.env.AMBIENTE_PRUEBAS === "true"`.
- T1/T4: `tests/unit/config/ambiente-config.test.ts` (nuevo).
- T2: `components/shared/BannerAmbientePruebas.tsx` (nuevo, Server Component) y `tests/components/BannerAmbientePruebas.test.tsx` (nuevo).
- T3: `app/layout.tsx` (primer hijo de `<body>`, comentario SLT-257) y `tests/unit/config/banner-ambiente-layout.test.ts` (nuevo).
- T4: `.env.example` (bloque comentado + `AMBIENTE_PRUEBAS=`).

## Mapa R<n> -> test
| R | Archivo | Caso |
|---|---|---|
| R1 | ambiente-config.test.ts; BannerAmbientePruebas.test.tsx | «R1: con AMBIENTE_PRUEBAS=true devuelve true»; «R1: ... pinta una franja con el texto «Sandbox»» |
| R2 | ambiente-config.test.ts; BannerAmbientePruebas.test.tsx | «R2: sin AMBIENTE_PRUEBAS definida...», «R2: con AMBIENTE_PRUEBAS=%j devuelve false» (8 valores); «R2: ... no pinta nada (container vacio)» (9 casos) |
| R3 | ambiente-config.test.ts; BannerAmbientePruebas.test.tsx | «R3: con VERCEL_ENV=production y AMBIENTE_PRUEBAS=true ...», «R3: con VERCEL_ENV=%s y sin AMBIENTE_PRUEBAS ...» |
| R4 | BannerAmbientePruebas.test.tsx | «R4: el unico texto es «Sandbox» y no hay botones, enlaces ni elementos enfocables» |
| R5 | banner-ambiente-layout.test.ts | «R5: <BannerAmbientePruebas /> es lo primero dentro de <body>...», «R5: la importa del componente compartido», «R5: con AMBIENTE_PRUEBAS=true el primer hijo del body renderizado es la franja» |
| R6 | BannerAmbientePruebas.test.tsx | «R6: el texto llega a la tecnologia de asistencia sin anunciarse como alerta» |
| R7 | BannerAmbientePruebas.test.tsx | «R7: colores fijos de marca (negro sobre amarillo), nunca texto amarillo, contraste >= 4.5» |
| R8 | BannerAmbientePruebas.test.tsx | «R8: el padding de arriba reserva el area segura de iOS (env(safe-area-inset-top))» |
| R9 | BannerAmbientePruebas.test.tsx | «R9: queda a su alto natural en el body flex (shrink-0, sin crecer)» |
| R10 | ambiente-config.test.ts | «R10: tiene la linea AMBIENTE_PRUEBAS= sin valor», «R10: un comentario encima dice que solo se pone true en el proyecto Vercel del sandbox» |
| R11 | BannerAmbientePruebas.test.tsx | «R11: va en el flujo normal: sin sticky, fixed ni z-index propio» |

## Salida de la verificación (frontend_dev, 2026-11-23)
- `vitest run` de los 3 tests: 3 archivos, 37 tests pasan, 0 fallan.
- `pnpm run lint`: exit 0, 0 errores, 249 avisos preexistentes; eslint de los 7 archivos: 0 problemas.
- `pnpm run typecheck`: exit 2, 1135 errores, ninguno en los 7 archivos: tipos de Prisma; el worktree
  no tiene `node_modules/.prisma` y resuelve un cliente viejo fuera del repo. Entorno, no el diff.
- `pnpm run test:guardias`: 354 archivos / 5404 tests pasan; 4 archivos / 32 tests fallan:
  - `marca-texto-amarillo.guardia.test.ts` (1): `fuera del censo: components/shared/BannerAmbientePruebas.tsx|text-brand-dark (1)`. Lo causa este diff. Arreglo propuesto: una fila en `CENSO_NEGRO_FIJO` (`{ archivo: "components/shared/BannerAmbientePruebas.tsx", clase: "text-brand-dark", superficie: "brand-light", medido: 12.84, apariciones: 1 }`), 8.º archivo fuera de `## Archivos esperados`: pendiente de autorización.
  - `financiera-borde` (27), `jobs-handler-por-tipo` (3), `push-cableado-unico` (1): cliente de Prisma viejo (`lib/db/prisma-client.ts:139`, `paths[1]`). Ajenos al diff.
- `./init.sh` (T5): no corrido; pendiente de la decisión anterior.

## Desvíos del spec
- R8 como clase Tailwind `pt-[calc(env(safe-area-inset-top)+0.25rem)]`, no `style`.
- Prop opcional `texto` (default «Sandbox") para i18n; el layout no la pasa.
- El comentario de `.env.example` añade la nota del redeploy.
