import { NextResponse } from "next/server";
import {
  sendCustomerBookingEmail,
  sendInternalBookingEmail,
} from "@/lib/resend";
import { BookingPayload } from "@/types/booking";

export async function POST() {
  const samplePayload: BookingPayload = {
    firstName: "Test",
    phone: "(555) 555-5555",
    email: "customer@example.com",
    addressLine1: "123 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    serviceName: "Solar Panel Cleaning",
    requestedDate: "2026-02-15",
    requestedTime: "10:00 AM",
    conversationId: "test-conversation-001",
    createdAt: new Date().toISOString(),
  };

  const customerResult = await sendCustomerBookingEmail(samplePayload);

  if (!customerResult.ok) {
    return NextResponse.json(
      { ok: false, error: customerResult.error ?? "Customer email failed" },
      { status: 500 },
    );
  }

  const internalResult = await sendInternalBookingEmail(samplePayload);

  if (!internalResult.ok) {
    return NextResponse.json(
      { ok: false, error: internalResult.error ?? "Internal email failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
