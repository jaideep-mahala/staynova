import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function saveBuffer(relPath: string, data: Buffer): string {
  const abs = path.join(UPLOAD_DIR, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return `/static/${relPath}`;
}

export function readStored(relPath: string): Buffer {
  const abs = path.join(UPLOAD_DIR, relPath.replace(/^\/static\//, ""));
  return fs.readFileSync(abs);
}

/** Simple PDF voucher / GST invoice generator (spec §8.2). */
export function generateVoucherPdf(input: {
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  propertyName: string;
  propertyAddress: string;
  gstNumber?: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomsCount: number;
  roomName: string;
  subtotalPaise: number;
  taxPaise: number;
  serviceFeePaise: number;
  discountPaise: number;
  totalPaise: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const inr = (p: number) =>
      `Rs. ${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

    doc.fontSize(20).text("StayNova", 48, 48);
    doc.fontSize(10).fillColor("#555").text("Find your next stay.", 48, 72);
    doc.fillColor("#000");
    doc.fontSize(16).text("Booking Voucher & GST Invoice", 48, 100, { align: "right" });
    doc.fontSize(11).text(`Ref: ${input.bookingRef}`, 48, 100);
    doc.fontSize(9).fillColor("#666").text(`Issued: ${new Date().toLocaleString("en-IN")}`, 48, 118);
    doc.fillColor("#000");

    doc.moveTo(48, 140).lineTo(547, 140).stroke();
    let y = 160;
    doc.fontSize(10).text(`Guest: ${input.guestName} (${input.guestEmail})`, 48, y); y += 16;
    doc.text(`Property: ${input.propertyName}`, 48, y); y += 16;
    if (input.propertyAddress) doc.text(`Address: ${input.propertyAddress}`, 48, y); y += 16;
    if (input.gstNumber) doc.text(`Property GSTIN: ${input.gstNumber}`, 48, y); y += 16;
    doc.text(`Stay: ${input.checkIn} to ${input.checkOut} (${input.nights} night${input.nights > 1 ? "s" : ""})`, 48, y); y += 16;
    doc.text(`Guests: ${input.adults} adults${input.children ? `, ${input.children} children` : ""}`, 48, y); y += 16;
    doc.text(`Room: ${input.roomsCount} x ${input.roomName}`, 48, y); y += 26;

    doc.fontSize(11).text("Charges", 48, y); y += 20;
    const line = (label: string, amount: number) => {
      doc.fontSize(10).text(label, 48, y);
      doc.text(inr(amount), 380, y, { width: 167, align: "right" });
      y += 18;
    };
    line(`Room charges (incl. extras)`, input.subtotalPaise);
    if (input.discountPaise > 0) line(`Discount`, -input.discountPaise);
    line(`GST`, input.taxPaise);
    line(`Service fee`, input.serviceFeePaise);
    doc.moveTo(48, y).lineTo(547, y).stroke(); y += 10;
    doc.fontSize(12).text("Total paid", 48, y);
    doc.fontSize(12).text(inr(input.totalPaise), 380, y, { width: 167, align: "right" });
    y += 30;

    doc.fontSize(9).fillColor("#666");
    doc.text(
      "Thank you for choosing StayNova. Carry this voucher and a photo ID to check-in. This is a computer generated invoice.",
      48, y, { width: 499 }
    );
    doc.end();
  });
}
