import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { calculatePayroll } from "../../../../lib/calculations";
import { savePayslip } from "../../../../lib/db";
import { PayslipPayload, PayrollConfigInput } from "../../../../lib/types";
import { formatPayDate } from "../../../../lib/formatting";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { payload: PayslipPayload };
  const payload = body.payload;

  if (!payload) {
    return new Response(JSON.stringify({ error: "Missing payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const calcResult = calculatePayroll(payload.payroll as PayrollConfigInput);

  if (!calcResult.calculated || calcResult.errors.length > 0) {
    return new Response(JSON.stringify({ errors: calcResult.errors }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Check for logo and inject default if missing
  if (!payload.company.logoDataUrl) {
    try {
      const fs = require("fs");
      const path = require("path");
      const logoPath = path.join(process.cwd(), "public", "it1-logo.png");
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const base64Logo = logoBuffer.toString("base64");
        // Assume png for the default logo
        payload.company.logoDataUrl = `data:image/png;base64,${base64Logo}`;
      }
    } catch (err) {
      console.error("Failed to load default logo:", err);
      // Fallback is handled in renderPayslipHtml (it shows text placeholder)
    }
  }

  // Check for stamp and inject default if missing
  if (!payload.company.stampDataUrl) {
    try {
      const fs = require("fs");
      const path = require("path");
      const stampPath = path.join(process.cwd(), "public", "IT1_Stamp.png");
      if (fs.existsSync(stampPath)) {
        const stampBuffer = fs.readFileSync(stampPath);
        const base64Stamp = stampBuffer.toString("base64");
        // Assume png for the default stamp
        payload.company.stampDataUrl = `data:image/png;base64,${base64Stamp}`;
      }
    } catch (err) {
      console.error("Failed to load default stamp:", err);
    }
  }

  // Check for watermark and inject default if missing
  if (!payload.company.watermarkDataUrl) {
    try {
      const fs = require("fs");
      const path = require("path");
      const watermarkPath = path.join(process.cwd(), "public", "it1-logo.png");
      if (fs.existsSync(watermarkPath)) {
        const watermarkBuffer = fs.readFileSync(watermarkPath);
        const base64Watermark = watermarkBuffer.toString("base64");
        // Assume png for the default watermark
        payload.company.watermarkDataUrl = `data:image/png;base64,${base64Watermark}`;
      }
    } catch (err) {
      console.error("Failed to load default watermark:", err);
    }
  }

  const record = savePayslip({ ...payload, calculated: calcResult.calculated });
  const html = renderPayslipHtml(record);

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();

    const safeName = payload.employee.fullName.replace(/[^a-zA-Z0-9]/g, "-");
    const dateStr = formatPayDate(payload.payroll.payDate, payload.payroll.dateFormatStyle);
    const filename = `Payslip-${safeName}-${dateStr}.pdf`;

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Payslip-Id": record.id
      }
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate PDF",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
