import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { calculatePayroll } from "../../../../lib/calculations";
import { savePayslip } from "../../../../lib/db";
import { PayslipPayload, PayrollConfigInput } from "../../../../lib/types";
import { formatPayDate } from "../../../../lib/formatting";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
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
          payload.company.logoDataUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;
        }
      } catch (err) {
        console.error("Logo injection failed:", err);
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
          payload.company.stampDataUrl = `data:image/png;base64,${stampBuffer.toString("base64")}`;
        }
      } catch (err) {
        console.error("Stamp injection failed:", err);
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
          payload.company.watermarkDataUrl = `data:image/png;base64,${watermarkBuffer.toString("base64")}`;
        }
      } catch (err) {
        console.error("Watermark injection failed:", err);
      }
    }

    const record = savePayslip({ ...payload, calculated: calcResult.calculated });
    const html = renderPayslipHtml(record);

    const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    const launchOptions = {
      args: isLocal ? ['--no-sandbox'] : [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars'],
      executablePath: isLocal ? undefined : await chromium.executablePath('https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'),
      headless: true
    };

    const browser = await puppeteer.launch(launchOptions);
    try {
      const page = await browser.newPage();
      await page.setContent(html, {
        waitUntil: "load",
        timeout: 30000
      });

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true
      });

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
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Critical PDF generation error:", error);
    return new Response(
      JSON.stringify({
        error: "Server encountered an error while generating PDF",
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
