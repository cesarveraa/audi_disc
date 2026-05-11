# 💿 Audi Disc

Plataforma moderna de gestión de ventas e inventarios, migrada desde un sistema legado basado en Java Swing y FileMaker.

Audi Disc centraliza operaciones de inventario, ventas, usuarios y administración mediante una arquitectura moderna compuesta por frontend web, backend API y servicios en Firebase.

---

## 📂 Estructura del Monorepo

```text
AudiDisc/
├── apps/
│   └── web/              # Dashboard e inventario en React + TypeScript
│
├── packages/
│   └── shared/           # Contratos de dominio compartidos en TypeScript
│
├── services/
│   └── api/              # Backend FastAPI con Firebase Auth y Firestore
│
└── README.md
```

### Componentes principales

- **`apps/web`**: Aplicación web administrativa desarrollada con React, TypeScript, Vite y Tailwind CSS.
- **`packages/shared`**: Tipos, contratos y estructuras compartidas entre frontend y backend.
- **`services/api`**: API backend desarrollada en FastAPI, protegida con Firebase Authentication y conectada a Firestore.

> **Nota:** Los proyectos ubicados en `C:\a\app ejemplo` y `C:\a\SI_proyectoVenta-main` son referencias externas del sistema legado y permanecen intactos.

---

## 🚀 Inicio rápido

Desde la raíz del proyecto:

```powershell
npm install
npm run build
npm test
```

Para validar el backend:

```powershell
cd services/api
python -m pip install -r requirements.txt
python -m pytest
```

---

## 💻 Ejecución local

### 1. Backend API

Ingresar al directorio del backend:

```powershell
cd C:\a\AudiDisc\services\api
```

Crear el archivo de variables de entorno:

```powershell
Copy-Item .env.example .env
```

Editar el archivo `.env` y configurar las credenciales de Firebase.

El backend no requiere un archivo físico `serviceAccount.json`. Por seguridad, las credenciales se cargan mediante variables de entorno.

Ejecutar el servidor local:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Endpoints disponibles:

```text
API Health:      http://127.0.0.1:8000/health
Swagger Docs:    http://127.0.0.1:8000/docs
```

---

### 2. Frontend Web

Desde la raíz del proyecto:

```powershell
cd C:\a\AudiDisc
```

Crear el archivo de variables de entorno del frontend:

```powershell
Copy-Item apps\web\.env.example apps\web\.env
```

Instalar dependencias:

```powershell
npm install
```

Ejecutar el frontend:

```powershell
npm run dev --workspace @audidisc/web -- --host 127.0.0.1 --port 5173
```

URL local:

```text
http://127.0.0.1:5173
```

---

## 🔐 Configuración de Firebase

Audi Disc utiliza Firebase Authentication y Firestore.

El backend espera las credenciales mediante variables de entorno. No se debe subir al repositorio ningún archivo `serviceAccount.json`.

### Variables principales

| Variable | Descripción |
|---|---|
| `AUDIDISC_FIREBASE_SERVICE_ACCOUNT_JSON` | JSON completo de la cuenta de servicio de Firebase como string. |
| `AUDIDISC_FIREBASE_PRIVATE_KEY` | Llave privada de Firebase si se usan campos individuales. Debe conservar los saltos de línea `\n`. |

### Recomendación de seguridad

No guardar credenciales reales en el repositorio. Usar siempre archivos `.env` locales o variables configuradas directamente en el entorno de despliegue.

---

## 🛠️ Herramientas de administración

### Crear usuario administrador

Antes de crear el usuario, habilitar el proveedor **Email/Password** en:

```text
Firebase Console > Authentication > Sign-in method
```

Luego ejecutar:

```powershell
cd C:\a\AudiDisc\services\api

python scripts\create_firebase_user.py `
  --email admin@audidisc.local `
  --password "AudiDisc_Admin_2026!" `
  --display-name "Administrador Audi Disc" `
  --role Administrador
```

---

## 🗃️ Migración de datos legacy

Para extraer información histórica desde el sistema legado de FileMaker, se utiliza un extractor basado en UI Automation.

### Migración masiva validada

Ejemplo para extraer hasta 1000 registros:

```powershell
python services/api/scripts/rpa_uia_extractor.py `
  --max-records 1000 `
  --commit `
  --window-title "FMbil_BDD Recovered" `
  --date-order dmy
```

Parámetros principales:

| Parámetro | Descripción |
|---|---|
| `--max-records` | Cantidad máxima de registros a extraer. |
| `--commit` | Confirma la escritura de datos extraídos. |
| `--window-title` | Título de la ventana del sistema FileMaker abierto. |
| `--date-order` | Formato de interpretación de fechas. Para Bolivia se recomienda `dmy`. |

---

## 🧪 Pruebas

### Frontend y paquetes TypeScript

Desde la raíz del proyecto:

```powershell
npm test
```

### Backend

Desde el directorio de la API:

```powershell
cd services/api
python -m pytest
```

---

## 🛠️ Tecnologías principales

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Python
- FastAPI
- Pydantic
- Uvicorn

### Infraestructura y servicios

- Firebase Authentication
- Firebase Firestore
- Variables de entorno para credenciales seguras

### Automatización y migración

- UI Automation
- Extracción asistida desde sistema legado FileMaker

---

## 📌 Consideraciones importantes

- No modificar directamente los proyectos legacy de referencia.
- No subir archivos `.env`, credenciales ni cuentas de servicio al repositorio.
- Ejecutar el backend y frontend en puertos separados durante desarrollo local.
- Validar la migración legacy en lotes pequeños antes de ejecutar cargas masivas.
- Mantener sincronizados los contratos compartidos dentro de `packages/shared`.

---

## © Licencia

© 2026 Audi Disc. Todos los derechos reservados.
