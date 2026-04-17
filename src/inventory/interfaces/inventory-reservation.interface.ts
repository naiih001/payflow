export interface InventoryReservationItemInput {
  productId: string;
  quantity: number;
}

export interface InventoryReservationResult {
  productId: string;
  quantity: number;
  reserved: number;
  available: number;
}
