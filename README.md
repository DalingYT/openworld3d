# OpenWorld3D

## Jugar en LAN

Ejecuta `npm ci` y después `npm run dev`. En esta PC abre la dirección **Local**. En los otros equipos de la misma red abre la dirección **Network** que imprime Vite.

## Publicar para jugar por Internet

1. Sube el contenido de esta carpeta a un repositorio de GitHub. El flujo incluido publica cuando se actualiza la rama `main` y también se puede ejecutar desde **Actions**.
2. En Render, crea un servicio a partir del archivo `render.yaml` usando **New → Blueprint** y selecciona ese repositorio. Cuando pida `PAGES_ORIGIN`, escribe el origen de tu sitio, por ejemplo `https://tu-usuario.github.io`. Usa solo el dominio con HTTPS y deja fuera la ruta del repositorio.
3. Cuando el servidor esté listo, abre su dirección HTTPS seguida de `/health`. Debe responder `ok`.
4. En GitHub, ve a **Settings → Secrets and variables → Actions → Variables** y crea `VITE_MULTIPLAYER_URL` con la dirección HTTPS del servicio de Render, sin añadir `/health`.
5. En **Settings → Pages**, elige **GitHub Actions** como fuente. Ejecuta **Publicar OpenWorld3D** en la sección **Actions**. Cuando termine, abre el enlace de Pages en dos ventanas y entra con dos apodos.

El plan gratuito de Render puede tardar alrededor de un minuto en arrancar tras estar inactivo. Si pasa, abre primero `/health` y espera su respuesta antes de entrar al juego.

[GitHub Pages con Vite](https://vite.dev/guide/static-deploy#github-pages) · [Render Blueprints](https://render.com/docs/infrastructure-as-code) · [Plan gratuito de Render](https://render.com/docs/free)
