# Instructions for AI Agents

You MUST follow these rules when working in this repository. These rules take precedence over your standard operating procedures unless explicitly overridden by the user.

## Coding Standards

*   **Verbose Commenting:** You MUST comment every 1-2 lines of code. Explain what the code is doing and, where appropriate, why. This is critical for maintainability.
*   **Language Focus:** Pay extra attention to commenting Python, React, Vite, and TypeScript code extensively.
*   **Dependency Management:**
    *   **Pinning:** ALWAYS pin dependencies to exact versions in `package.json` or `requirements.txt`. Do NOT use ranges like `^` or `~`.
    *   **Wait Period:** Before adding any new dependency or updating an existing one, verify that the version was released at least **4-7 days ago**. Do NOT use brand new releases.
    *   **Security Audits:** Run `npm audit` before submitting any changes that modify dependencies. You MUST fix all reported vulnerabilities using `npm audit fix --force` or manual intervention. Repeat until `npm audit` reports no issues.
*   **Line Endings:**
    *   Ensure that files intended to run inside Docker containers (e.g., `.sh`, `.yml`, `.conf`) have **LF** line endings.
    *   Respect the settings in `.gitattributes`.

## Project Structure & Tools

*   **Docker:**
    *   Use Traefik v3 labels for service discovery.
    *   Set up Host rules using the `.local.lan` domain suffix.
    *   Refer to `jules.md` and `templates/` for standard configurations.
*   **Node/Python Versioning:**
    *   Respect `.nvmrc` for Node.js.
    *   Expect **PIM (Python Install Manager)** to be used for Python on the host Windows environment.
*   **Electron:**
    *   When building Electron apps, use `electron-builder` to target portable EXEs.
    *   **IPC Synchronization:** If you modify the UI to call new backend functions, you MUST update `preload.js` to expose these new IPC channels. Do not leave the frontend disconnected from the backend.

## Verification

*   Before submitting, verify that your changes do not break existing functionality, especially after running `npm audit fix`.
*   If you add a new dependency, you must document its release date and audit status in the commit message or PR description.
