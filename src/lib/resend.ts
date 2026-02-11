import { Resend } from "resend";
import { BookingPayload } from "@/types/booking";

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailResult = {
  ok: boolean;
  error?: string;
};

export async function sendCustomerBookingEmail(
  payload: BookingPayload,
): Promise<EmailResult> {
  try {
    const from = process.env.BOOKING_FROM_EMAIL;

    if (!from) {
      return { ok: false, error: "Missing BOOKING_FROM_EMAIL" };
    }

    await resend.emails.send({
      from,
      to: payload.email,
      subject: "SunSweeper Booking Confirmed",
      text: [
        `Hi ${payload.firstName},`,
        "",
        "Your SunSweeper booking has been confirmed.",
        "",
        `Service: ${payload.serviceName}`,
        `Date: ${payload.requestedDate}`,
        `Time: ${payload.requestedTime}`,
        `Address: ${payload.addressLine1}`,
        "",
        "Thank you for choosing SunSweeper.",
      ].join("\n"),
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function sendInternalBookingEmail(
  payload: BookingPayload,
): Promise<EmailResult> {
  try {
    const from = process.env.BOOKING_FROM_EMAIL;
    const internalTo = process.env.INTERNAL_BOOKING_NOTIFY_EMAIL;

    if (!from) {
      return { ok: false, error: "Missing BOOKING_FROM_EMAIL" };
    }

    if (!internalTo) {
      return { ok: false, error: "Missing INTERNAL_BOOKING_NOTIFY_EMAIL" };
    }

    await resend.emails.send({
      from,
      to: internalTo,
      subject: "New SunSweeper Booking Confirmed",
      text: [
        "A new booking was confirmed with the following details:",
        "",
        `firstName: ${payload.firstName}`,
        `phone: ${payload.phone}`,
        `email: ${payload.email}`,
        `addressLine1: ${payload.addressLine1}`,
        `city: ${payload.city}`,
        `state: ${payload.state}`,
        `zip: ${payload.zip}`,
        `serviceName: ${payload.serviceName}`,
        `requestedDate: ${payload.requestedDate}`,
        `requestedTime: ${payload.requestedTime}`,
        `conversationId: ${payload.conversationId}`,
        `createdAt: ${payload.createdAt}`,
      ].join("\n"),
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: message };
  }
}
