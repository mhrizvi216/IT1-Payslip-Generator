"use client";

import { useMemo, useState } from "react";
import { calculatePayroll, type CalculationResult } from "../lib/calculations";
import { formatMoney, formatPayDate, formatTimestamp } from "../lib/formatting";
import { samplePreset } from "../lib/samplePreset";
import { PayslipPayload, PayrollConfigInput, Company, Employee } from "../lib/types";
import PayslipPreview from "./PayslipPreview";
import Navbar from "./Navbar";

interface FormState extends PayslipPayload { }

const emptyCompany: Company = {
  name: "",
  addressLines: [""],
  themeColor: "#0088c8"
};

const emptyEmployee: Employee = {
  fullName: "",
  addressLines: [""]
};

const initialState: FormState = samplePreset ?? {
  company: emptyCompany,
  employee: emptyEmployee,
  payroll: {
    payDate: new Date().toISOString().slice(0, 10),
    currency: "PKR",
    netPay: 0,
    useDecimals: false,
    dateFormatStyle: "ordinal-short",
    earnings: [],
    deductions: []
  }
};

export default function PayslipApp() {
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<CalculationResult["errors"]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const calculation = useMemo(() => {
    const result = calculatePayroll(form.payroll as PayrollConfigInput);
    setErrors(result.errors);
    return result.calculated;
  }, [form]);

  // Simple derived values for preview formatting
  const formatted = useMemo(() => {
    if (!calculation) return null;
    const { payroll, company, employee } = form;
    return {
      company,
      employee,
      payroll,
      earnings: calculation.earnings.map((e) => ({
        ...e,
        formattedAmount: `${payroll.currency} ${formatMoney(
          e.amountMinor,
          payroll.useDecimals
        )}`
      })),
      deductions: calculation.deductions.map((d) => ({
        ...d,
        formattedAmount: `${payroll.currency} ${formatMoney(
          d.amountMinor,
          payroll.useDecimals
        )}`
      })),
      grossFormatted: `${payroll.currency} ${formatMoney(
        calculation.grossPayMinor,
        payroll.useDecimals
      )}`,
      totalDeductionsFormatted: `${payroll.currency} ${formatMoney(
        calculation.totalDeductionsMinor,
        payroll.useDecimals
      )}`,
      netFormatted: `${payroll.currency} ${formatMoney(
        calculation.netPayMinor,
        payroll.useDecimals
      )}`,
      payDateFormatted: formatPayDate(payroll.payDate, payroll.dateFormatStyle),
      timestampFormatted: formatTimestamp(new Date())
    };
  }, [calculation, form]);

  // Handlers for basic fields (to keep code manageable, not every tiny detail is abstracted)
  const updateCompanyField = (field: keyof Company, value: string) => {
    setForm((prev) => ({
      ...prev,
      company: {
        ...prev.company,
        [field]: field === "addressLines" ? value.split("\n") : value
      }
    }));
  };

  const updateEmployeeField = (field: keyof Employee, value: string) => {
    setForm((prev) => ({
      ...prev,
      employee: {
        ...prev.employee,
        [field]: field === "addressLines" ? value.split("\n") : value
      }
    }));
  };

  const updatePayrollField = (field: keyof PayrollConfigInput, value: any) => {
    setForm((prev) => ({
      ...prev,
      payroll: {
        ...prev.payroll,
        [field]: value
      }
    }));
  };

  const earningsTotalPct = form.payroll.earnings.reduce(
    (sum, e) => sum + (Number(e.percentage) || 0),
    0
  );

  const canGenerate =
    !!calculation &&
    errors.length === 0 &&
    form.company.name.trim().length > 0 &&
    form.employee.fullName.trim().length > 0 &&
    form.payroll.netPay > 0;

  const handleDownload = async () => {
    if (!canGenerate) return;

    setDownloadProgress(0);
    const intervalId = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev === null || prev >= 90) return prev;
        return prev + 10;
      });
    }, 500);

    try {
      const res = await fetch("/api/payslip/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: form })
      });

      clearInterval(intervalId);

      if (!res.ok) {
        setDownloadProgress(null);
        alert("Failed to generate PDF");
        return;
      }

      setDownloadProgress(100);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Generate filename locally to ensure it matches the expected format
      const safeName = form.employee.fullName.replace(/[^a-zA-Z0-9]/g, "-");
      const dateStr = formatPayDate(form.payroll.payDate, form.payroll.dateFormatStyle);
      a.download = `Payslip-${safeName}-${dateStr}.pdf`;

      a.click();
      URL.revokeObjectURL(url);

      // Reset after a moment so user sees 100%
      setTimeout(() => setDownloadProgress(null), 1000);
    } catch (e) {
      clearInterval(intervalId);
      setDownloadProgress(null);
      console.error(e);
      alert("An error occurred while generating the PDF");
    }
  };

  return (
    <div className="main-app-shell">
      <Navbar />
      <main className="app-content">
        <section style={{ flex: 1, minWidth: 0 }}>
          <div style={{ backgroundColor: "white", padding: 16, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "auto" }}>
            <h2 style={{ marginTop: 0 }}>Configuration</h2>

            <h3>Company</h3>
            <div className="form-grid">
              <label>
                Company Name
                <input
                  type="text"
                  value={form.company.name}
                  onChange={(e) => updateCompanyField("name", e.target.value)}
                />
              </label>
              <label className="full-width">
                Address
                <textarea
                  rows={3}
                  value={form.company.addressLines.join("\n")}
                  onChange={(e) => updateCompanyField("addressLines", e.target.value)}
                />
              </label>
              <label>
                Theme Color
                <input
                  type="color"
                  value={form.company.themeColor}
                  onChange={(e) => updateCompanyField("themeColor", e.target.value)}
                />
              </label>
            </div>

            <h3>Employee</h3>
            <div className="form-grid">
              <label className="full-width">
                Full Name
                <input
                  type="text"
                  value={form.employee.fullName}
                  onChange={(e) => updateEmployeeField("fullName", e.target.value)}
                />
              </label>
              <label className="full-width">
                Address
                <textarea
                  rows={3}
                  value={form.employee.addressLines.join("\n")}
                  onChange={(e) => updateEmployeeField("addressLines", e.target.value)}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={form.employee.phone ?? ""}
                  onChange={(e) => updateEmployeeField("phone", e.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.employee.email ?? ""}
                  onChange={(e) => updateEmployeeField("email", e.target.value)}
                />
              </label>
              <label>
                Bank Name
                <input
                  type="text"
                  value={form.employee.bankName ?? ""}
                  onChange={(e) => updateEmployeeField("bankName", e.target.value)}
                />
              </label>
              <label>
                Bank Account / IBAN
                <input
                  type="text"
                  value={form.employee.bankAccount ?? ""}
                  onChange={(e) => updateEmployeeField("bankAccount", e.target.value)}
                />
              </label>
              <label>
                Employee ID
                <input
                  type="text"
                  value={form.employee.employeeId ?? ""}
                  onChange={(e) => updateEmployeeField("employeeId", e.target.value)}
                />
              </label>
              <label>
                Title / Designation
                <input
                  type="text"
                  value={form.employee.title ?? ""}
                  onChange={(e) => updateEmployeeField("title", e.target.value)}
                />
              </label>
              <label>
                CNIC / National ID
                <input
                  type="text"
                  value={form.employee.nationalId ?? ""}
                  onChange={(e) => updateEmployeeField("nationalId", e.target.value)}
                />
              </label>
            </div>

            <h3>Payroll</h3>
            <div className="form-grid">
              <label>
                Pay Date
                <input
                  type="date"
                  value={form.payroll.payDate}
                  onChange={(e) => updatePayrollField("payDate", e.target.value)}
                />
              </label>
              <label>
                Net Pay Amount
                <input
                  type="number"
                  value={form.payroll.netPay}
                  onChange={(e) => updatePayrollField("netPay", Number(e.target.value))}
                />
              </label>
              <label>
                Currency
                <input
                  type="text"
                  value={form.payroll.currency}
                  onChange={(e) => updatePayrollField("currency", e.target.value)}
                />
              </label>
              <label>
                Use Decimals
                <input
                  type="checkbox"
                  checked={form.payroll.useDecimals}
                  onChange={(e) =>
                    updatePayrollField("useDecimals", e.target.checked)
                  }
                />
              </label>
              <label>
                Date Format
                <select
                  value={form.payroll.dateFormatStyle}
                  onChange={(e) =>
                    updatePayrollField(
                      "dateFormatStyle",
                      e.target.value as PayrollConfigInput["dateFormatStyle"]
                    )
                  }
                >
                  <option value="ordinal-short">1st-Jan-26</option>
                  <option value="alt">01-Jan-2026</option>
                </select>
              </label>
            </div>

            <div className="section-row">
              <div>
                <h4>Earnings (must sum to 100%)</h4>
                <div className="small-text">Current total: {earningsTotalPct.toFixed(2)}%</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    payroll: {
                      ...prev.payroll,
                      earnings: [
                        ...prev.payroll.earnings,
                        {
                          key: `earning-${prev.payroll.earnings.length + 1}`,
                          label: "New Component",
                          percentage: 0
                        }
                      ]
                    }
                  }))
                }
              >
                + Add Earning
              </button>
            </div>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th style={{ width: 120 }}>Percentage %</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.payroll.earnings.map((e, idx) => (
                  <tr key={e.key}>
                    <td>
                      <input
                        type="text"
                        value={e.label}
                        onChange={(ev) => {
                          const value = ev.target.value;
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              earnings: prev.payroll.earnings.map((x, i) =>
                                i === idx ? { ...x, label: value } : x
                              )
                            }
                          }));
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={e.percentage}
                        onChange={(ev) => {
                          const value = Number(ev.target.value);
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              earnings: prev.payroll.earnings.map((x, i) =>
                                i === idx ? { ...x, percentage: value } : x
                              )
                            }
                          }));
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#ef4444",
                          padding: 4
                        }}
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              earnings: prev.payroll.earnings.filter((_, i) => i !== idx)
                            }
                          }));
                        }}
                        title="Remove earning"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="section-row" style={{ marginTop: 24 }}>
              <div>
                <h4>Deductions</h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    payroll: {
                      ...prev.payroll,
                      deductions: [
                        ...prev.payroll.deductions,
                        {
                          key: `deduction-${prev.payroll.deductions.length + 1}`,
                          label: "New Deduction",
                          mode: "fixed",
                          value: 0
                        }
                      ]
                    }
                  }))
                }
              >
                + Add Deduction
              </button>
            </div>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th style={{ width: 140 }}>Mode</th>
                  <th style={{ width: 140 }}>Value</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.payroll.deductions.map((d, idx) => (
                  <tr key={d.key}>
                    <td>
                      <input
                        type="text"
                        value={d.label}
                        onChange={(ev) => {
                          const value = ev.target.value;
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              deductions: prev.payroll.deductions.map((x, i) =>
                                i === idx ? { ...x, label: value } : x
                              )
                            }
                          }));
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={d.mode}
                        onChange={(ev) => {
                          const value = ev.target.value as "percent" | "fixed";
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              deductions: prev.payroll.deductions.map((x, i) =>
                                i === idx ? { ...x, mode: value } : x
                              )
                            }
                          }));
                        }}
                      >
                        <option value="fixed">Fixed Amount</option>
                        <option value="percent">% of Gross</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={d.value}
                        onChange={(ev) => {
                          const value = Number(ev.target.value);
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              deductions: prev.payroll.deductions.map((x, i) =>
                                i === idx ? { ...x, value } : x
                              )
                            }
                          }));
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#ef4444",
                          padding: 4
                        }}
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            payroll: {
                              ...prev.payroll,
                              deductions: prev.payroll.deductions.filter((_, i) => i !== idx)
                            }
                          }));
                        }}
                        title="Remove deduction"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {errors.length > 0 && (
              <div className="error-panel">
                {errors.map((err) => (
                  <div key={err.field}>{err.message}</div>
                ))}
              </div>
            )}

            {downloadProgress === null ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={!canGenerate}
                className="primary-btn"
                style={{ marginTop: 16 }}
              >
                Download PDF Payslip
              </button>
            ) : (
              <div style={{ marginTop: 16, width: "100%" }}>
                <div style={{
                  height: "8px",
                  width: "100%",
                  backgroundColor: "#e5e7eb",
                  borderRadius: "4px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%",
                    width: `${downloadProgress}%`,
                    backgroundColor: form.company.themeColor || "#0088c8",
                    transition: "width 0.3s ease-in-out"
                  }} />
                </div>
                <div style={{ textAlign: "center", fontSize: "12px", marginTop: "4px", color: "#6b7280" }}>
                  Generating PDF... {downloadProgress}%
                </div>
              </div>
            )}
          </div>
        </section>

        <section style={{ flex: 1, minWidth: 0 }}>
          <div style={{ backgroundColor: "#e0e0e0", padding: 8 }}>
            <div className="payslip-preview-wrapper">
              {formatted && calculation ? (
                <PayslipPreview
                  company={formatted.company}
                  employee={formatted.employee}
                  payroll={formatted.payroll}
                  earnings={formatted.earnings}
                  deductions={formatted.deductions}
                  grossFormatted={formatted.grossFormatted}
                  totalDeductionsFormatted={formatted.totalDeductionsFormatted}
                  netFormatted={formatted.netFormatted}
                  payDateFormatted={formatted.payDateFormatted}
                  timestampFormatted={formatted.timestampFormatted}
                />
              ) : (
                <div style={{ padding: 16, textAlign: "center", backgroundColor: "white" }}>
                  Fill in the form to see a live payslip preview.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
