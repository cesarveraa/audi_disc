# audi_disc_web

## Variables de entorno

Configura estas variables en Vercel y en tu `.env` local:

```env
VITE_API_BASE_URL=<URL completa del backend, incluyendo /api/v1>
```

El frontend no define una URL por defecto. Si falta `VITE_API_BASE_URL`, la app mostrara un error de configuracion.

## Android con Capacitor

La app nativa usa `appId` `com.audidisc.admin` y sincroniza el build web desde `../../dist`.

```bash
npm run cap:sync --workspace @audidisc/web
npm run cap:open:android --workspace @audidisc/web
```

Para probar contra un backend local desde emulador Android, usa:

```env
VITE_API_BASE_URL=http://10.0.2.2:8000/api/v1
```

El proyecto Android de Capacitor 7 requiere JDK 21 para compilar con Gradle.
