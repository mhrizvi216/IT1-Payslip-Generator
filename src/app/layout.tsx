import type { Metadata } from "next";
import "../styles/global.css";

export const metadata: Metadata = {
  title: "IT1 Payslip Generator | Professional Payroll Solutions",
  description: "A professional web application for generating customizable payslip PDFs with pixel-perfect design and automatic calculations by IT1 Technologies.",
  keywords: ["payslip generator", "payroll", "invoice generator", "IT1 Technologies", "PDF payslip"],
  authors: [{ name: "IT1 Technologies" }],
};

export const viewport = {
  themeColor: "#0088c8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
