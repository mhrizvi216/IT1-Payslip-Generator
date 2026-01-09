import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { calculatePayroll } from "../../../../lib/calculations";
import { savePayslip } from "../../../../lib/db";
import { PayslipPayload, PayrollConfigInput } from "../../../../lib/types";
import { formatPayDate } from "../../../../lib/formatting";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";
import { DEFAULT_LOGO_B64, DEFAULT_STAMP_B64 } from "../../../../lib/assets";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let browser = null;
  try {
    const body = await req.json();
    const payload: PayslipPayload = body.payload;

    if (!payload) {
      return new Response(JSON.stringify({ error: "No payload provided" }), { status: 400 });
    }

    const calcResult = calculatePayroll(payload.payroll as PayrollConfigInput);
    if (!calcResult.calculated || calcResult.errors.length > 0) {
      return new Response(JSON.stringify({ errors: calcResult.errors }), { status: 400 });
    }

    // Inject fallbacks for branding if missing - 100% Filesystem Independent
    if (!payload.company.logoDataUrl) {
      payload.company.logoDataUrl = `data:image/png;base64,${DEFAULT_LOGO_B64}`;
    }
    if (!payload.company.stampDataUrl) {
      payload.company.stampDataUrl = `data:image/png;base64,${DEFAULT_STAMP_B64}`;
    }
    if (!payload.company.watermarkDataUrl) {
      payload.company.watermarkDataUrl = `data:image/png;base64,${DEFAULT_LOGO_B64}`;
    }

    // Attempt to save (non-blocking, won't crash if Vercel FS is read-only)
    let record;
    try {
      record = savePayslip({ ...payload, calculated: calcResult.calculated });
    } catch (err) {
      console.warn("DB save failed, using memory record:", err);
      record = {
        ...payload,
        id: "v-" + Date.now(),
        calculated: calcResult.calculated,
        createdAt: new Date().toISOString()
      };
    }

    const html = renderPayslipHtml(record as any);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: (chromium as any).defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: (chromium as any).headless,
    } as any);

    const page = await browser.newPage();

    // Set content and wait for it to load
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 25000
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    const safeName = (payload.employee?.fullName || "Employee").replace(/[^a-zA-Z0-9]/g, "-");
    const dateStr = formatPayDate(payload.payroll.payDate, payload.payroll.dateFormatStyle);
    const filename = `Payslip-${safeName}-${dateStr}.pdf`;

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Payslip-Id": record.id || "unknown"
      }
    });

  } catch (error: any) {
    console.error("PDF Generation Error:", error);
    return new Response(JSON.stringify({
      error: "PDF generation failed",
      details: error.message
    }), { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Error closing browser:", e);
      }
    }
  }
}
