import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
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

    // Ensure assets are present using fallbacks - 100% Filesystem Independent
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

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: (chromium as any).defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: (chromium as any).headless,
      ignoreHTTPSErrors: true
    } as any);

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "load",
        timeout: 25000
      });

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
      console.error("Puppeteer Rendering Failure:", pdfError);
      return new Response(JSON.stringify({
        error: "PDF generation failed",
        details: pdfError.message
      }), { status: 500 });
    }
  } catch (error: any) {
    console.error("Global API Error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
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
