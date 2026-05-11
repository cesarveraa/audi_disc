from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


MoneyCentavos = Annotated[int, Field(ge=0, le=100_000_000)]
PositiveMoneyCentavos = Annotated[int, Field(gt=0, le=100_000_000)]
StrictName = Annotated[str, Field(min_length=1, max_length=120)]
OptionalLabel = Annotated[str | None, Field(default=None, max_length=80)]
Role = Literal["Administrador", "Vendedor"]
PaymentMethod = Literal["Efectivo", "Qr", "Transferencia"]
PushPlatform = Literal["android", "ios", "web"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, validate_assignment=True)


class CurrentUserResponse(StrictModel):
    uid: str
    email: str | None
    displayName: str | None
    role: Role


class ProductCreate(StrictModel):
    nombre: StrictName
    marca: OptionalLabel = None
    sku: OptionalLabel = None
    categoria: OptionalLabel = None
    cantidad: Annotated[int, Field(ge=0, le=1_000_000)]
    stockMinimo: Annotated[int, Field(ge=0, le=1_000_000)] = 3
    precioCompraCentavos: PositiveMoneyCentavos
    precioVentaCentavos: PositiveMoneyCentavos

    @model_validator(mode="after")
    def validate_prices(self) -> "ProductCreate":
        if self.precioVentaCentavos < self.precioCompraCentavos:
            raise ValueError("precioVentaCentavos must be greater than or equal to precioCompraCentavos")
        return self


class ProductUpdate(StrictModel):
    nombre: StrictName | None = None
    marca: OptionalLabel = None
    sku: OptionalLabel = None
    categoria: OptionalLabel = None
    cantidad: Annotated[int | None, Field(default=None, ge=0, le=1_000_000)] = None
    stockMinimo: Annotated[int | None, Field(default=None, ge=0, le=1_000_000)] = None
    precioCompraCentavos: PositiveMoneyCentavos | None = None
    precioVentaCentavos: PositiveMoneyCentavos | None = None
    estado: bool | None = None


class ProductPublicResponse(StrictModel):
    id: str
    nombre: str
    marca: str | None
    sku: str | None
    categoria: str | None
    cantidad: int
    stockMinimo: int
    precioVentaCentavos: int
    estado: bool
    createdAt: str | None = None
    updatedAt: str | None = None


class ProductAdminResponse(ProductPublicResponse):
    precioCompraCentavos: int
    utilidadCentavos: int
    margenPorcentaje: float


class SaleItemCreate(StrictModel):
    productoId: Annotated[str, Field(min_length=1, max_length=160)]
    cantidad: Annotated[int, Field(gt=0, le=10_000)]
    precioVendidoCentavos: PositiveMoneyCentavos


class SaleCreate(StrictModel):
    productos: Annotated[list[SaleItemCreate], Field(min_length=1, max_length=200)]
    totalCentavos: MoneyCentavos
    recibidoCentavos: MoneyCentavos
    metodo: PaymentMethod
    clienteId: Annotated[str | None, Field(default=None, min_length=1, max_length=160)] = None


class SaleItemSnapshot(StrictModel):
    productoId: str
    nombre: str
    marca: str | None
    sku: str | None
    categoria: str | None
    cantidad: int
    precioVentaCentavos: int
    precioVendidoCentavos: int
    subtotalCentavos: int
    precioCompraCentavos: int | None = None
    utilidadCentavos: int | None = None


class SaleResponse(StrictModel):
    id: str
    productos: list[SaleItemSnapshot]
    totalCentavos: int
    recibidoCentavos: int
    cambioCentavos: int
    metodo: PaymentMethod
    fechaLocal: str
    horaLocal: str
    estado: bool
    createdBy: str
    createdAt: str | None = None
    clienteId: str | None = None
    clienteSnapshot: dict | None = None


class CustomerCreate(StrictModel):
    nombre: StrictName
    telefono: Annotated[str, Field(min_length=4, max_length=32, pattern=r"^[0-9+()\-\s]+$")]


class CustomerUpdate(StrictModel):
    nombre: StrictName | None = None
    telefono: Annotated[str | None, Field(default=None, min_length=4, max_length=32, pattern=r"^[0-9+()\-\s]+$")] = None
    estado: bool | None = None


class CustomerResponse(StrictModel):
    id: str
    nombre: str
    telefono: str
    estado: bool
    comprasCount: int
    totalCompradoCentavos: int
    ultimaCompraAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class PushTokenRegister(StrictModel):
    token: Annotated[str, Field(min_length=16, max_length=4096)]
    platform: PushPlatform
    deviceId: Annotated[str | None, Field(default=None, max_length=160)] = None


class StockAlertResponse(StrictModel):
    producto: ProductPublicResponse
    severity: Literal["critical", "warning"]


class DashboardSalesToday(StrictModel):
    totalCentavos: int
    cantidadVentas: int
    ticketPromedioCentavos: int


class DashboardSummaryResponse(StrictModel):
    ventasHoy: DashboardSalesToday
    stockBajo: list[StockAlertResponse]


def datetime_to_iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
