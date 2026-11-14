const layout = (title: string, body: string) => `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,.08);">
        <tr><td style="background:#0F766E;padding:20px 28px;">
          <span style="color:#fff;font-size:20px;font-weight:700;">StayNova</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h2 style="margin:0 0 12px;color:#0f172a;font-size:18px;">${title}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:11px;">
          StayNova · Find your next stay. <br/>You are receiving this email because of activity on your StayNova account.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
`;

export const templates = {
  verifyEmail: (link: string) => ({
    subject: "Verify your StayNova email",
    html: layout(
      "Verify your email",
      `<p>Welcome to StayNova! Please confirm your email address to unlock bookings.</p>
       <p><a href="${link}" style="display:inline-block;background:#0F766E;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Verify email</a></p>
       <p style="color:#64748b;font-size:12px;">Or paste this link: ${link}</p>`
    ),
  }),
  forgotPassword: (link: string) => ({
    subject: "Reset your StayNova password",
    html: layout(
      "Password reset",
      `<p>We received a request to reset your password. This link is valid for 30 minutes.</p>
       <p><a href="${link}" style="display:inline-block;background:#0F766E;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Reset password</a></p>
       <p style="color:#64748b;font-size:12px;">Or paste this link: ${link}</p>`
    ),
  }),
  bookingConfirmed: (b: {
    guestName: string; bookingRef: string; propertyName: string;
    checkIn: string; checkOut: string; totalPaise: number; voucherUrl?: string | null;
  }) => ({
    subject: `Booking confirmed — ${b.bookingRef}`,
    html: layout(
      "Your stay is confirmed!",
      `<p>Hi ${b.guestName || "traveller"}, your booking at <b>${b.propertyName}</b> is confirmed.</p>
       <ul>
         <li>Reference: <b>${b.bookingRef}</b></li>
         <li>Check-in: ${b.checkIn}</li>
         <li>Check-out: ${b.checkOut}</li>
         <li>Total paid: ₹${(b.totalPaise / 100).toLocaleString("en-IN")}</li>
       </ul>
       ${b.voucherUrl ? `<p><a href="${b.voucherUrl}" style="display:inline-block;background:#F59E0B;color:#0f172a;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Download voucher</a></p>` : ""}`
    ),
  }),
  ownerNewBooking: (b: { propertyName: string; bookingRef: string; guestName: string; checkIn: string; checkOut: string; totalPaise: number }) => ({
    subject: `New booking ${b.bookingRef} — ${b.propertyName}`,
    html: layout(
      "New booking received",
      `<p><b>${b.guestName || "A guest"}</b> booked <b>${b.propertyName}</b>.</p>
       <ul>
         <li>Reference: ${b.bookingRef}</li>
         <li>Stay: ${b.checkIn} → ${b.checkOut}</li>
         <li>Earnings: ₹${(b.totalPaise / 100).toLocaleString("en-IN")}</li>
       </ul>`
    ),
  }),
  bookingCancelled: (b: { bookingRef: string; propertyName: string; refundPaise: number }) => ({
    subject: `Booking cancelled — ${b.bookingRef}`,
    html: layout(
      "Booking cancelled",
      `<p>Your booking <b>${b.bookingRef}</b> at ${b.propertyName} has been cancelled.</p>
       <p>Refund amount: <b>₹${(b.refundPaise / 100).toLocaleString("en-IN")}</b></p>`
    ),
  }),
  reviewRequest: (b: { propertyName: string; bookingRef: string }) => ({
    subject: `How was ${b.propertyName}?`,
    html: layout(
      "Tell us about your stay",
      `<p>Your stay at <b>${b.propertyName}</b> (${b.bookingRef}) has ended. We would love a review!</p>
       <p><a href="#" style="display:inline-block;background:#0F766E;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Write a review</a></p>`
    ),
  }),
};
