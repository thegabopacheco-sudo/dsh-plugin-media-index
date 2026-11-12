# dsh-plugin-media-index — Media Index

Indexa y busca archivos de media locales con ffprobe: duracion, resolucion, codecs y tamano, filtros por nombre o metadatos.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `scan` | Escanear media |
| `search` | Buscar media |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-media-index` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-media-index
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_MEDIA_INDEX_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\media-index\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
