import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { calculatePayroll } from "../../../../lib/calculations";
import { savePayslip } from "../../../../lib/db";
import { PayslipPayload, PayrollConfigInput } from "../../../../lib/types";
import { formatPayDate } from "../../../../lib/formatting";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let browser = null;
  try {
    const { payload }: { payload: PayslipPayload } = await req.json();

    if (!payload) {
      return new Response(JSON.stringify({ error: "No payload provided" }), { status: 400 });
    }

    const calcResult = calculatePayroll(payload.payroll as PayrollConfigInput);
    if (!calcResult.calculated || calcResult.errors.length > 0) {
      return new Response(JSON.stringify({ errors: calcResult.errors }), { status: 400 });
    }

    // Attempt to save (non-blocking)
    let record;
    try {
      record = savePayslip({ ...payload, calculated: calcResult.calculated });
    } catch (dbError) {
      console.error("DB Save failed, continuing in memory:", dbError);
      record = { ...payload, id: "temp-" + Date.now(), calculated: calcResult.calculated, createdAt: new Date().toISOString() };
    }

    const html = renderPayslipHtml(record as any);
    const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    console.log(`Starting PDF Generation (Environment: ${isLocal ? 'Local' : 'Vercel'})`);

    const launchOptions = {
      args: isLocal ? ['--no-sandbox'] : [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars'],
      executablePath: isLocal ? undefined : await chromium.executablePath('https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'),
      headless: true,
      ignoreHTTPSErrors: true
    };

    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError: any) {
      console.error("Puppeteer Launch Failure:", launchError);
      return new Response(JSON.stringify({
        error: "Browser failed to launch",
        details: launchError.message,
        stage: "launch"
      }), { status: 500 });
    }

    const page = await browser.newPage();

    try {
      await page.setContent(html, {
        waitUntil: "load",
        timeout: 25000
      });
    } catch (contentError: any) {
      console.error("Set Content Failure:", contentError);
      await browser.close();
      return new Response(JSON.stringify({
        error: "Failed to render HTML content",
        details: contentError.message,
        stage: "navigation"
      }), { status: 500 });
    }

    try {
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
      });

      const safeName = payload.employee.fullName.replace(/[^a-zA-Z0-9]/g, "-");
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
    } catch (pdfError: any) {
      console.error("PDF Print Failure:", pdfError);
      return new Response(JSON.stringify({
        error: "Failed to generate PDF buffer",
        details: pdfError.message,
        stage: "printing"
      }), { status: 500 });
    }

  } catch (error: any) {
    console.error("Global API Error:", error);
    return new Response(JSON.stringify({
      error: "An unexpected server error occurred",
      details: error.message
    }), { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
