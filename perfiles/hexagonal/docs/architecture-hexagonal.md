# Arquitectura hexagonal por módulos

> Sustituye la sección `## Estructura de carpetas` de `docs/architecture.md` y amplía
> `## Principios`. Es lo que el `reviewer` usa para decidir si una implementación está bien
> hecha, no solo si funciona.

## El principio, en una frase

**La dependencia apunta hacia adentro.** `app/` y `components/` → `composition` → adaptadores
*driven* → puertos → dominio. Y el dominio no mira a nadie: no conoce Prisma, ni Next, ni
React. Quien conoce el detalle es siempre el adaptador.

De ahí salen dos consecuencias que no son opinables:

1. **Un módulo no importa nada interno de otro módulo.** Solo consume lo que el otro publica
   en su contrato. Nunca su repositorio, su modelo de Prisma ni sus tablas.
2. **El cableado entre puertos y adaptadores vive en un único punto de composición.** Si está
   esparcido, la inversión de dependencias es decorativa: cada archivo vuelve a elegir su
   implementación concreta y no hay forma de sustituirla.

## Estructura de carpetas

```
app/                              # Rutas y páginas (App Router). No se modulariza.
  (public)/ (private)/
    <ruta>/
      page.tsx
      components/index.ts         # barrel: componentes propios de esa ruta

components/                       # UI compartida. FUERA de los módulos.
  ui/                             # shadcn — ruta fijada por components.json
  shared/  private/
hooks/                            # FUERA de los módulos

lib/
  utils.ts                        # `cn`. No se mueve: components.json fija su ruta.

  modules/
    <modulo>/
      index.ts                    # CONTRATO PÚBLICO: solo reexporta de ./domain/**
      domain/                     # reglas de negocio. Sin framework, sin BD.
      ports/                      # interfaces por las que el dominio pide lo que necesita
      adapters/
        driven/                   # lo que el dominio usa: Prisma, cripto, SDKs externos
        driving/                  # lo que invoca al dominio: Server Actions, handlers

  composition/
    index.ts                      # PUNTO ÚNICO DE COMPOSICIÓN (puerto → adaptador)

  shared/                         # núcleo compartido. HOJA del grafo: no importa módulos.
    routes.ts  db/prisma.ts  navigation/  ui/

db/
  schema.prisma                   # uno solo. Cada modelo con `/// @module <modulo>`
  migrations/<timestamp>_<nombre>/{migration.sql,down.sql}

tests/
  guards/                         # guardias ejecutables, incluida la de arquitectura
  unit/<modulo>/  integration/<modulo>/  ui/
```

## Qué publica un módulo hacia afuera

**El contrato es `lib/modules/<modulo>/index.ts`, y solo reexporta símbolos de `./domain/`.**

```ts
// lib/modules/<modulo>/index.ts — CONTRATO PÚBLICO.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor.
export type { AlgunTipo } from './domain/algun-tipo';
export { algunCasoDeUso } from './domain/algun-caso-de-uso';
```

Quien consume el módulo desde fuera ve **eso y nada más**.

Dos superficies quedan **deliberadamente fuera del barrel**:

- **Adaptadores *driving***. La UI los importa por su ruta exacta
  (`@/lib/modules/<modulo>/adapters/driving/<accion>`). **No hay barrel sobre archivos
  `'use server'`**: mezclaría un DTO puro con módulos de servidor y arrastraría al cliente lo
  que no debe. Es una excepción consciente a la regla de barriles de `## Componentes`, que
  habla de componentes de ruta, no de acciones.
- **Puertos**. Son la superficie hacia **adentro**: los importa el adaptador que los
  implementa y el punto de composición. Nadie más.

## La regla de dependencias

Cada fila es una comprobación de la guardia. `M` y `N` son módulos distintos.

| Origen | PUEDE importar | NO PUEDE importar |
| --- | --- | --- |
| `lib/modules/M/domain/**` | `lib/modules/M/domain/**`, `lib/modules/M/ports/**`, `@/lib/modules/N` (barrel), paquetes puros | `next/*`, `react*`, `@prisma/client`, `@/lib/shared/**`, `@/lib/composition`, `../adapters/**`, `@/app/**`, `@/components/**`, `@/hooks/**`, `@/lib/modules/N/**` (profundo) |
| `lib/modules/M/ports/**` | igual que `domain` | igual que `domain` |
| `lib/modules/M/adapters/driven/**` | `../../domain/**`, `../../ports/**`, `@/lib/shared/**`, `@prisma/client`, SDKs externos, `@/lib/modules/N` (barrel) | `@/lib/composition`, `../driving/**`, `@/app/**`, `@/components/**`, `@/lib/modules/N/**` (profundo) |
| `lib/modules/M/adapters/driving/**` | `@/lib/composition`, `@/lib/modules/M` (barrel), su propia carpeta, `next/*`, `react*`, `@/lib/shared/**` | `@prisma/client`, `@/lib/shared/db/prisma`, `../driven/**`, `domain/` y `ports/` por ruta profunda (usa el barrel), `@/lib/modules/N/**` (profundo) |
| `lib/composition/**` | `@/lib/modules/*` (barrel), `@/lib/modules/*/ports/**`, `@/lib/modules/*/adapters/driven/**`, `@/lib/shared/**` | `@/lib/modules/*/adapters/driving/**`, `@/app/**`, `@/components/**` |
| `lib/shared/**` | paquetes npm, otros `@/lib/shared/**` | `@/lib/modules/**`, `@/lib/composition` |
| `app/**` (servidor) | `@/lib/composition`, `@/lib/modules/M` (barrel), `.../adapters/driving/**`, `@/lib/shared/**`, `@/components/**`, `@/hooks/**` | `@/lib/modules/M/domain/**`, `.../ports/**`, `.../adapters/driven/**` |
| `components/**`, `hooks/**`, y todo archivo con `'use client'` | `@/lib/modules/M` (barrel), `.../adapters/driving/**`, `@/lib/shared/ui/**`, `@/lib/shared/routes`, `@/lib/utils` | además de lo anterior: `@/lib/composition` y `@/lib/shared/db/**` |
| `tests/**`, `scripts/**` | todo | — (exentos) |

### Paquetes puros admitidos en `domain/` y `ports/`

Solo **`zod`**, y la lista vive en una constante exportada de la guardia para que ampliarla
sea un cambio visible en el diff. Se admite porque no es framework ni acceso a datos, es
validación pura, y el principio de **borde tipado** ya la exige; mantener dos vocabularios de
tipos —zod fuera, a mano dentro— duplicaría el modelo.

### Propiedad de modelos Prisma

El esquema es uno solo, y la frontera de módulo llega a la persistencia por propiedad:

```prisma
/// @module identity
model User { ... }
```

La guardia extrae los pares `(modelo, módulo)` del esquema, busca `prisma.<modelo>` en los
adaptadores *driven* de cada módulo, y **falla si el módulo del archivo no es el propietario**.
Un modelo **sin** `/// @module` también es hallazgo: es lo que evita que la siguiente feature
añada tablas sin dueño.

## Punto único de composición

`lib/composition/index.ts` es el único sitio donde un puerto se ata a su implementación
concreta. Un adaptador *driving* (una Server Action, un route handler) pide ahí lo que
necesita; nunca instancia el adaptador él mismo. Eso es lo que hace que sustituir una
implementación —un stub por el real, bcrypt por otro algoritmo— sea un cambio de una línea en
un archivo y no una cacería por todo el repo.

## Anti-patrones que el reviewer rechaza

- Un `import` desde `domain/` o `ports/` a cualquier cosa que no sea dominio, puertos, otro
  contrato de módulo o un paquete puro de la lista.
- Importar de otro módulo por ruta profunda (`@/lib/modules/N/domain/algo`) en vez de por su
  contrato (`@/lib/modules/N`).
- Un adaptador *driving* que instancia su propio adaptador *driven* en vez de pedirlo a
  `composition`.
- `lib/shared/**` importando un módulo. `shared` es hoja del grafo; si necesita algo de un
  módulo, entonces no era compartido.
- Un `'use server'` reexportado desde el barrel del módulo.
- Un modelo de Prisma sin `/// @module`, o un módulo consultando un modelo ajeno.
- Crear `lib/services/`, `lib/repositories/` o `lib/interfaces/` de nuevo. Esa era la
  estructura anterior y volver a ella es el fallo que la guardia existe para impedir.
