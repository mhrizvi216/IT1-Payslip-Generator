import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getPayslip } from "../../../../lib/db";
import { renderPayslipHtml } from "../../../../server/renderPayslipHtml";

export const runtime = "nodejs";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getPayslip(id);

  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  const html = renderPayslipHtml(record);

  try {
    const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    const launchOptions = {
      args: isLocal ? ['--no-sandbox'] : chromium.args,
      executablePath: isLocal ? undefined : await chromium.executablePath(),
      headless: true
    };

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${record.id}.pdf"`
      }
    });
  } catch (error) {
    console.error("PDF generation error details:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate PDF",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
