# Firestore Model

## productos

Fields:

- `nombre`, `marca`, `sku`, `categoria`
- `cantidad`, `stockMinimo`
- `precioCompraCentavos`, `precioVentaCentavos`
- `estado`
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

Cost and margin fields are returned only by the FastAPI layer to users with the
Firebase custom claim `role = "Administrador"`.

## ventas

Fields:

- `productos`: immutable product snapshots at sale time.
- `clienteId`, `clienteSnapshot`: optional CRM link captured at sale time.
- `totalCentavos`, `recibidoCentavos`, `cambioCentavos`
- `metodo`
- `fechaLocal`, `horaLocal`
- `estado`
- `createdBy`, `createdAt`

Inventory is decremented in the same Firestore transaction that creates the
sale document.

## usuarios

User profile documents are display-only support data. Authorization is decided
by Firebase Auth custom claims, not by mutable profile documents.

## clientes

Fields:

- `nombre`, `telefono`
- `estado`
- `comprasCount`, `totalCompradoCentavos`, `ultimaCompraAt`
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

Sales store `clienteId` plus a `clienteSnapshot` so future name/phone edits do
not mutate historical receipts.

## pushTokens

Fields:

- `token`, `platform`, `deviceId`
- `uid`, `role`, `email`
- `estado`, `createdAt`, `updatedAt`

FastAPI writes operational notifications to `notifications` and sends FCM when
a sale exceeds Bs 1,000 or a product drops to `stockMinimo` after a sale.
