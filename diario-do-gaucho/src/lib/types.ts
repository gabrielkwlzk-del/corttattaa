export interface EventRow {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  location: string | null;
  description: string | null;
  photo_count?: number;
}

export interface ModalityRow {
  id: string;
  name: string;
  slug: string;
  photo_count?: number;
}

export interface PublicPhoto {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  width: number | null;
  height: number | null;
  version: number;
  event_id: string | null;
  event_name: string | null;
  event_date: string | null;
  modality_id: string | null;
  modality_name: string | null;
  created_at: string;
}

export interface AdminPhoto extends PublicPhoto {
  status: "processing" | "ready" | "failed";
  visibility: "public" | "hidden";
  processing_error: string | null;
  original_filename: string | null;
  bytes: number | null;
  sold_count: number;
  deleted_at: string | null;
}

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";

export interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  amount_cents: number;
  currency: "BRL";
  customer_name: string | null;
  customer_email: string | null;
  payment_provider: "mercadopago" | "static";
  provider_payment_id: string | null;
  pix_txid: string | null;
  pix_copia_cola: string | null;
  expires_at: string | null;
  customer_reported_paid_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  photo_id: string;
  price_cents: number;
  title_snapshot: string;
  download_count: number;
  version: number;
  width: number | null;
  height: number | null;
}
