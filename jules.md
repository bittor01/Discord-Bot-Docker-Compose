# Jules' Longstanding Preferences

This file contains the security, environment, and coding preferences for Jules. These should be followed strictly for all projects in this repository and as a baseline for new projects.

## Security Preferences

*   **Supply Chain Security:**
    *   **Wait Period:** Do not use any new npm package (or a new version of an existing package) until it is at least **4-7 days old**.
    *   **Verification:** Check the web or the npm registry to ensure the package has a clean audit and no reported security issues if it is older than a week.
    *   **Auditing:** Run `npm audit` early and often.
    *   **Audit Fixing:** Perform `npm audit fix` (using `--force` if necessary) and repeat until all issues are resolved. If automatic fixing fails, manually resolve the vulnerabilities.
    *   **Post-Fix Verification:** After fixing vulnerabilities, ensure that the application still functions correctly and fix any regressions introduced by dependency updates.
*   **Dependency Management:**
    *   **Pinning:** Always pin dependencies to exact versions (e.g., `1.2.3` instead of `^1.2.3`).
    *   **Lock Files:** Never delete lock files unless absolutely necessary to resolve a "nuclear" issue. Prefer `--legacy-peer-deps` or specific version fixes first.

## Environment Preferences

*   **Node.js:**
    *   Use **NVM** for Node.js version control.
    *   Include a `.nvmrc` file in the project root.
*   **Python:**
    *   Use **PIM (Python Install Manager)** for Python version control.
    *   Environment: Windows 11.
*   **Docker:**
    *   Preferred for backend and homelab services.
    *   **Traefik:** Use Traefik v3+ as the edge router.
    *   **Domains:** Use `.local.lan` domains (e.g., `app.local.lan`).
    *   **Frontend:** Use Discord or a WebUI (React/Vite) when dockerized.
*   **Electron:**
    *   Preferred when Docker is not used.
    *   **Builds:** Target portable EXEs or installers.
    *   **Preferred Tool:** `electron-builder` is preferred for creating high-quality portable EXEs.
    *   **IPC Communication:** When adding or modifying UI features that require communication with the main process, always ensure the corresponding IPC channels are defined/updated in the `preload.js` and handled in the main process.
*   **Frameworks:**
    *   React and Vite are used frequently for frontends.

## Coding Style & Maintenance

*   **Commenting:** "Comment the heck out of the code."
    *   Every 1-2 lines of code should have a comment explaining what the code does or why it's there.
    *   Focus on making the code easy to maintain for someone who might not be familiar with the framework (like React, Vite, or Python).
*   **Language Specifics:**
    *   TypeScript is preferred for Node.js/Electron projects.
    *   Python is used occasionally; comment it extensively as the user is less familiar with it.
*   **Line Endings:**
    *   Manage line endings strictly via `.gitattributes`.
    *   Files intended for Docker (shell scripts, configs) MUST have LF line endings.
    *   Windows-specific files can use CRLF.

## Homelab / Traefik Example

For reference, Jules uses the following Traefik and Docker setup:

```yaml
services:
  traefik:
    image: traefik:v3.6.1
    # ... (labels and config)
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app.rule=Host(`app.local.lan`)"
      - "traefik.http.routers.app.entrypoints=websecure"
      - "traefik.http.routers.app.tls=true"
```

Refer to `templates/docker-compose.yml` for the full structure.
