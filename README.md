# 💿 Audi Disc

> Plataforma moderna de gestión de ventas e inventarios migrada desde un sistema legado Java Swing/FileMaker.

Este proyecto es una solución integral que moderniza la operación de **Audi Disc**, centralizando la información en la nube y ofreciendo herramientas avanzadas de análisis de datos.


## 📂 Estructura del Monorepo

El proyecto está organizado para mantener la coherencia entre el cliente y el servidor:

* **`apps/web`**: Interfaz de usuario desarrollada en **React + TypeScript**. Dashboard administrativo y punto de venta (POS).
* **`packages/shared`**: Librería de contratos y tipos de TypeScript compartidos.
* **`services/api`**: Backend robusto con **FastAPI (Python)**, integrado con Firebase Auth y Firestore.

> 💡 **Nota:** Los directorios `C:\a\app ejemplo` y `C:\a\SI_proyectoVenta-main` son referencias externas y se mantienen intactos.


## 🚀 Inicio Rápido

Para preparar el entorno completo por primera vez:

# Instalación de dependencias de Node.js
npm install

# Construcción de paquetes compartidos y tipos
npm run build

# Ejecución de tests globales
npm test

# Configuración del entorno Python
cd services/api
python -m pip install -r requirements.txt
python -m pytest
💻 Ejecución Local1. Backend (API)El servidor utiliza FastAPI y se comunica con Firebase para autenticación y persistencia.PowerShellcd C:\a\AudiDisc\services\api
Copy-Item .env.example .env

# ⚠️ IMPORTANTE: Edita .env y pega tu AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON
# Asegúrate de que las credenciales de Firebase estén presentes.

1. Ejecución del Backend (API)El servidor utiliza FastAPI y se comunica con Firebase para autenticación y persistencia.PowerShellcd C:\a\AudiDisc\services\api
Copy-Item .env.example .env

# ⚠️ IMPORTANTE: Edita el archivo .env y pega tu AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON
# Asegúrate de que las credenciales de Firebase estén presentes.

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
URL Health: http://127.0.0.1:8000/healthDocumentación Interactiva (Swagger): http://127.0.0.1:8000/docs2. Ejecución del Frontend (Web)La interfaz utiliza Vite para un desarrollo ultra rápido.PowerShellcd C:\a\AudiDisc
# Configurar variables de entorno del cliente
Copy-Item apps\web\.env.example apps\web\.env

npm install
npm run dev --workspace @audidisc/web -- --host 127.0.0.1 --port 5173
URL Local: http://127.0.0.1:5173🔐 Configuración de FirebaseEl sistema no requiere un archivo serviceAccount.json físico por seguridad. El backend espera las credenciales a través de variables de entorno:VariableDescripciónAUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSONEl JSON completo de la cuenta de servicio como string.AUDIDISC_FIREBASE_PRIVATE_KEYLa llave privada (si se usan campos individuales). Debe conservar los \n.🛠️ Herramientas de AdministraciónCrear Usuario AdministradorUsa este script para generar el primer acceso al sistema una vez configurado Firebase Auth.PowerShellcd C:\a\AudiDisc\services\api
python scripts\create_firebase_user.py --email admin@audidisc.local --password "AudiDisc_Admin_2026!" --display-name "Administrador" --role Administrador
Migración de Datos (Legacy)Para extraer el historial de ventas desde el archivo FileMaker (.fmp12 / .dll), utilizamos el motor de UI Automation:PowerShell# Migración masiva validada
python services/api/scripts/rpa_uia_extractor.py --max-records 1000 --commit --window-title "FMbil_BDD Recovered" --date-order dmy
🛠️ Tecnologías PrincipalesFrontend: React, TypeScript, Tailwind CSS, Vite.Backend: Python, FastAPI, Pydantic.Infraestructura: Firebase Firestore, Firebase Auth.Automatización: UI Automation (UIA) para recuperación de datos legacy.© 2026 Audi Disc - Todos los derechos reservados.
python services/api/scripts/rpa_uia_extractor.py --max-records 1000 --commit --window-title "FMbil_BDD Recovered" --date-order dmy
🛠️ Tecnologías PrincipalesFrontend: React, TypeScript, Tailwind CSS, Vite.Backend: Python, FastAPI, Pydantic.Infraestructura: Firebase Firestore, Firebase Auth.Automatización: UI Automation (UIA) para recuperación de datos legacy.© 2026 Audi Disc - Todos los derechos reservados.
