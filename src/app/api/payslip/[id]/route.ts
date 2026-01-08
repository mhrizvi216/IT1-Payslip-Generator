import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { getPayslip } from "../../../../lib/db";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";
import { DEFAULT_LOGO_B64, DEFAULT_STAMP_B64 } from "../../../../lib/assets";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let browser = null;
  try {
    const { id } = await params;
    const record = getPayslip(id);

    if (!record) {
      return new Response(JSON.stringify({ error: "Payslip not found" }), { status: 404 });
    }

    // Ensure assets are present for older records or failed saves
    if (!record.company.logoDataUrl) {
      record.company.logoDataUrl = `data:image/png;base64,${DEFAULT_LOGO_B64}`;
    }
    if (!record.company.stampDataUrl) {
      record.company.stampDataUrl = `data:image/png;base64,${DEFAULT_STAMP_B64}`;
    }
    if (!record.company.watermarkDataUrl) {
      record.company.watermarkDataUrl = `data:image/png;base64,${DEFAULT_LOGO_B64}`;
    }

    const html = renderPayslipHtml(record);
    const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    console.log(`Starting PDF Generation for ID: ${id} (Environment: ${isLocal ? 'Local' : 'Vercel'})`);

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
      return new Response(JSON.stringify({ error: "Browser failed to launch", details: launchError.message }), { status: 500 });
    }

    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: "load", timeout: 25000 });
    } catch (contentError: any) {
      console.error("Set Content Failure:", contentError);
      await browser.close();
      return new Response(JSON.stringify({ error: "Failed to render HTML content", details: contentError.message }), { status: 500 });
    }

    try {
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true
      });

      return new Response(pdfBuffer as any, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Payslip-${id}.pdf"`
        }
      });
    } catch (pdfError: any) {
      console.error("PDF Print Failure:", pdfError);
      return new Response(JSON.stringify({ error: "Failed to generate PDF buffer", details: pdfError.message }), { status: 500 });
    }

  } catch (error: any) {
    console.error("Global API Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Browser close error:", closeError);
      }
    }
  }
}
