# plantilla-modulo

Esqueleto de un modulo nuevo.

```bash
cp -r harnessConfig/hexagonal/plantilla-modulo lib/modules/<modulo>
```

Luego:

1. Borra este `README.md` de la copia.
2. Escribe el dominio en `domain/` y sus interfaces en `ports/`.
3. Reexporta desde `index.ts` **solo** lo que otros modulos y la UI deban ver.
4. Registra el cableado puerto -> adaptador en `lib/composition/index.ts`.
5. Si el modulo tiene tablas, marca cada modelo en `db/schema.prisma` con
   `/// @module <modulo>`.

Los `.gitkeep` estan porque git no versiona carpetas vacias. Borralos en cuanto la carpeta
tenga su primer archivo real.
